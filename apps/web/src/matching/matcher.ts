import type { CanvasAction, MatchingManifest } from "@follow/shared";
import calibratedConfig from "../../../../demo/matcher-config.json";

export interface Score {
  conceptId: string;
  score: number;
  details: { detailId: string; score: number }[];
}
export interface MatchResult {
  action: CanvasAction;
  conceptId: string | null;
  strength: number;
  margin: number;
  stable: boolean;
  reason: string;
}
export const defaults = calibratedConfig;
export const normalize = (text: string) =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
export function cosine(a: ArrayLike<number>, b: ArrayLike<number>): number {
  if (a.length !== b.length || !a.length) return 0;
  let dot = 0,
    aa = 0,
    bb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    aa += a[i] ** 2;
    bb += b[i] ** 2;
  }
  return aa && bb ? dot / Math.sqrt(aa * bb) : 0;
}
export function bestTwo(scores: number[]): number {
  const sorted = [...scores].sort((a, b) => b - a);
  return sorted.length ? (sorted[0] + (sorted[1] ?? sorted[0])) / 2 : 0;
}
export function isFiller(text: string): boolean {
  return /^(um|uh|okay|ok|so|well|right|thanks|thank you|hello|yes|no|next|and|the|a|you know|all right)(\s+(um|uh|okay|so|well|right|and))*$/.test(
    normalize(text),
  );
}
function mentions(text: string, phrase: string): boolean {
  const needle = normalize(phrase);
  return needle.length >= 4 && ` ${normalize(text)} `.includes(` ${needle} `);
}

/** Pure deterministic gate. Only commit() changes authoritative active-topic context. */
export class Matcher {
  private active: string | null = null;
  private pending = "";
  private hits = 0;
  private seq = 0;
  private previous = "";
  private revealed = new Set<string>();
  constructor(
    private manifest: MatchingManifest,
    private config = defaults,
  ) {}
  reset(active: string | null = null) {
    this.active = active;
    this.pending = "";
    this.hits = 0;
    this.seq = 0;
    this.previous = "";
    this.revealed.clear();
  }
  commit(action: CanvasAction) {
    if (
      action.type === "FOCUS" &&
      this.manifest.concepts.some(
        (c) =>
          c.id === action.conceptId && c.enabled && c.review === "reviewed",
      )
    )
      this.active = action.conceptId;
    if (action.type === "REVEAL")
      this.revealed.add(`${action.conceptId}:${action.detailId}`);
    this.pending = "";
    this.hits = 0;
  }
  decide(
    text: string,
    scores: Score[],
    seq: number,
    intentContext = text,
  ): MatchResult {
    const eligible = new Set(
      this.manifest.concepts
        .filter((c) => c.enabled && c.review === "reviewed")
        .map((c) => c.id),
    );
    const ranked = scores
      .filter((s) => eligible.has(s.conceptId) && Number.isFinite(s.score))
      .sort((a, b) => b.score - a.score);
    const top = ranked[0],
      margin = top ? top.score - (ranked[1]?.score ?? 0) : 0;
    const base = {
      conceptId: top?.conceptId ?? null,
      strength: top?.score ?? 0,
      margin,
    };
    const hold = (reason: string, clear = true): MatchResult => {
      if (clear) {
        this.hits = 0;
        this.pending = "";
      }
      return { ...base, action: { type: "HOLD" }, stable: false, reason };
    };
    if (seq <= this.seq) return hold("Stale sequence");
    this.seq = seq;
    const normalized = normalize(text);
    if (!normalized || isFiller(text)) return hold("Silence or filler");
    if (normalized === this.previous)
      return hold("Duplicate final text", false);
    this.previous = normalized;
    // Negated topic mentions must not navigate to the very topic being rejected.
    if (/\b(not|never|don t|isn t|aren t|cannot|can t)\b/.test(normalized))
      return hold("Negation needs manual review");

    let action: CanvasAction | null = null;
    if (
      /\b(compare|comparison|versus|vs|contrast|compared|difference|unlike)\b/.test(
        normalized,
      )
    ) {
      const endpoints = this.manifest.concepts.filter(
        (c) =>
          eligible.has(c.id) &&
          [c.title, ...c.aliases].some((p) => mentions(intentContext, p)),
      );
      if (endpoints.length !== 2)
        return hold("Comparison endpoints are ambiguous");
      const relation = this.manifest.relationships.find(
        (r) =>
          r.approved &&
          r.kind === "comparison" &&
          endpoints.some((c) => c.id === r.from) &&
          endpoints.some((c) => c.id === r.to),
      );
      if (!relation) return hold("No approved comparison");
      action = { type: "COMPARE", leftId: relation.from, rightId: relation.to };
    } else if (/\b(connect|connection|relationship)\b/.test(normalized)) {
      const relations = this.manifest.relationships.filter(
        (r) =>
          r.approved &&
          eligible.has(r.from) &&
          eligible.has(r.to) &&
          mentions(text, r.label),
      );
      if (relations.length !== 1)
        return hold("No unambiguous approved connection");
      action = { type: "CONNECT", relationshipId: relations[0].id };
    } else {
      if (!top) return hold("No eligible concepts");
      const retaining = top.conceptId === this.active;
      if (
        top.score <
        (retaining ? this.config.retainThreshold : this.config.threshold)
      )
        return hold("Below score threshold");
      if (margin < (retaining ? this.config.retainMargin : this.config.margin))
        return hold("Ambiguous runner-up");
      if (retaining) {
        const details = [...top.details].sort((a, b) => b.score - a.score);
        const detail = details[0];
        const concept = this.manifest.concepts.find(
          (c) => c.id === top.conceptId,
        )!;
        if (
          detail &&
          detail.score >= this.config.detailThreshold &&
          detail.score - (details[1]?.score ?? 0) >= this.config.detailMargin &&
          concept.details.some((d) => d.id === detail.detailId) &&
          !this.revealed.has(`${top.conceptId}:${detail.detailId}`)
        ) {
          return {
            ...base,
            action: {
              type: "REVEAL",
              conceptId: top.conceptId,
              detailId: detail.detailId,
            },
            stable: true,
            reason: "Approved detail in active topic",
          };
        }
        return hold("Retaining active topic");
      }
      action = { type: "FOCUS", conceptId: top.conceptId };
    }
    const key = JSON.stringify(action);
    this.hits = this.pending === key ? this.hits + 1 : 1;
    this.pending = key;
    if (this.hits < this.config.hits)
      return hold(
        `Stability ${this.hits}/${this.config.hits} — continue speaking`,
        false,
      );
    return {
      ...base,
      action,
      stable: true,
      reason: "Stable approved candidate",
    };
  }
}
