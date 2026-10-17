// Grounds a model plan in the selected page text and converts it into a
// CanvasProject (PRD §12.3). Schema compliance is not evidence: every quote is
// located server-side, offsets come from the real text, and anything without
// a verified quote is dropped. Every drop/downgrade becomes a warning for the
// source inspector. Output is a draft: all concepts need review and nothing is
// approved for the audience until a human does it.

import { locateQuote } from './sourceText.ts';
import { PLAN_LIMITS, type Density, type Plan } from './planSchema.ts';
import { BUDGET, type CanvasProject, type Concept, type Detail, type Relationship, type SourceRef, type VisualPayload } from './project.ts';
import type { PageText } from './prompt.ts';

export type GroundingWarning = { code: string; message: string; conceptId?: string };
export type GroundedPlan = {
  project: CanvasProject;
  warnings: GroundingWarning[];
  stats: { quotesProposed: number; quotesVerified: number; conceptsProposed: number; conceptsKept: number };
};
export type GroundInput = {
  plan: Plan;
  pages: PageText[];
  source: { name: string; sha256: string; pageCount: number };
  density: Density;
  model: string;
  promptVersion: string;
  preparedAt?: string;
};

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
/** A shorter "quote" (a word, a full stop) is not evidence for anything. */
const MIN_QUOTE = 12;
const slug = (raw: string) => raw.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
const clean = (s: string) => s.normalize('NFC').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();

export function groundPlan(input: GroundInput): GroundedPlan {
  const { plan, density } = input;
  const limits = PLAN_LIMITS[density];
  const warnings: GroundingWarning[] = [];
  const warn = (code: string, message: string, conceptId?: string) => warnings.push({ code, message, ...(conceptId ? { conceptId } : {}) });
  const pageText = new Map(input.pages.map((p) => [p.page, p.text]));
  const stats = { quotesProposed: 0, quotesVerified: 0, conceptsProposed: plan.concepts.length, conceptsKept: 0 };

  const ground = (quotes: { page: number; quote: string }[], where: string, conceptId?: string): SourceRef[] => {
    const refs: SourceRef[] = [];
    for (const q of quotes) {
      stats.quotesProposed++;
      const text = pageText.get(q.page);
      const length = q.quote.trim().length;
      const found = text !== undefined && length >= MIN_QUOTE && length <= BUDGET.quote ? locateQuote(text, q.quote) : null;
      if (!found) {
        warn('QUOTE_NOT_FOUND', `${where}: quote not found on page ${q.page}: "${clean(q.quote).slice(0, 120)}"`, conceptId);
        continue;
      }
      if (!refs.some((r) => r.page === q.page && r.start === found.start)) refs.push({ page: q.page, ...found });
      stats.quotesVerified++;
    }
    return refs;
  };
  const fit = (value: string, max: number, what: string, conceptId?: string) => {
    const v = clean(value);
    if (v.length <= max) return v;
    warn('TEXT_SHORTENED', `${what} was longer than ${max} characters and was shortened.`, conceptId);
    const cut = v.slice(0, max - 1);
    return `${cut.slice(0, Math.max(cut.lastIndexOf(' '), max / 2)).trimEnd()}…`;
  };
  const list = (items: string[], maxItems: number, maxLen: number) =>
    [...new Set(items.map(clean).filter((s) => s && s.length <= maxLen))].slice(0, maxItems);

  // ---- Concepts ----
  if (plan.concepts.length > limits.concepts) warn('LIMIT', `Plan proposed ${plan.concepts.length} concepts; kept the first ${limits.concepts}.`);
  type Draft = { concept: Concept; raw: Plan['concepts'][number]; detailIds: Map<string, string> };
  const drafts: Draft[] = [];
  const usedIds = new Set<string>();
  const idMap = new Map<string, string>();
  for (const raw of plan.concepts.slice(0, limits.concepts)) {
    let id = SLUG.test(raw.id) ? raw.id.slice(0, 60) : slug(raw.id) || slug(raw.title) || `concept-${drafts.length + 1}`;
    if (usedIds.has(id)) {
      warn('DUPLICATE_ID', `Duplicate concept id "${raw.id}" was dropped.`);
      continue;
    }
    usedIds.add(id);
    idMap.set(raw.id, id);

    if (raw.details.length > limits.details) warn('LIMIT', `Kept the first ${limits.details} of ${raw.details.length} details.`, id);
    const details: Detail[] = [];
    const detailIds = new Map<string, string>();
    for (const d of raw.details.slice(0, limits.details)) {
      const did = SLUG.test(d.id) ? d.id.slice(0, 60) : slug(d.id) || `detail-${details.length + 1}`;
      if (details.some((x) => x.id === did)) {
        warn('DUPLICATE_ID', `Duplicate detail id "${d.id}" was dropped.`, id);
        continue;
      }
      const sources = ground(d.quotes, `Detail "${clean(d.text).slice(0, 60)}"`, id);
      if (!sources.length) {
        warn('UNSUPPORTED_DETAIL', `Detail "${clean(d.text).slice(0, 80)}" had no verifiable quote and was removed.`, id);
        continue;
      }
      detailIds.set(d.id, did);
      details.push({ id: did, text: fit(d.text, BUDGET.detail, 'A detail', id), sources, origin: 'source' });
    }

    let sources = ground(raw.quotes, `Concept "${clean(raw.title).slice(0, 60)}"`, id);
    if (!sources.length && details.length) {
      sources = [details[0].sources[0]];
      warn('CONCEPT_SOURCE_FROM_DETAIL', 'The concept had no verified quote of its own; it cites its first detail.', id);
    }
    if (!sources.length) {
      warn('UNSUPPORTED_CONCEPT', `Concept "${clean(raw.title).slice(0, 80)}" had no verifiable quote and was removed.`);
      usedIds.delete(id);
      idMap.delete(raw.id);
      continue;
    }
    const title = fit(raw.title, BUDGET.title, 'The title', id);
    drafts.push({
      raw,
      detailIds,
      concept: {
        id,
        title: title || id,
        summary: fit(raw.summary, BUDGET.summary, 'The summary', id) || title || id,
        aliases: list(raw.aliases, BUDGET.aliases, BUDGET.alias),
        speechExamples: list(raw.speechExamples, BUDGET.speechExamples, BUDGET.speechExample),
        visual: { type: 'concept' },
        details,
        sources,
        assetIds: [],
        enabled: true,
        review: 'needs-review',
        position: { x: 0, y: 0 },
      },
    });
  }

  // ---- Relationships ----
  const relationships: Relationship[] = [];
  if (plan.relationships.length > limits.relationships) warn('LIMIT', `Kept the first ${limits.relationships} of ${plan.relationships.length} relationships.`);
  for (const r of plan.relationships.slice(0, limits.relationships)) {
    const from = idMap.get(r.from);
    const to = idMap.get(r.to);
    if (!from || !to || from === to) {
      warn('INVALID_RELATIONSHIP', `Relationship "${clean(r.label).slice(0, 48)}" (${r.from} → ${r.to}) does not join two kept concepts and was removed.`);
      continue;
    }
    if (relationships.some((x) => x.kind === r.kind && ((x.from === from && x.to === to) || (x.from === to && x.to === from)))) continue;
    const sources = ground(r.quotes, `Relationship ${from} → ${to}`);
    if (!sources.length) {
      warn('UNSUPPORTED_RELATIONSHIP', `Relationship ${from} → ${to} had no verifiable quote and was removed.`);
      continue;
    }
    // Causal claims always need a human (PRD §12.3); other grounded links are pre-approved but the project is not.
    if (r.kind === 'causal') warn('CAUSAL_NEEDS_REVIEW', `Causal relationship ${from} → ${to} needs explicit approval.`);
    relationships.push({
      id: `${from}--${to}${r.kind === 'comparison' ? '--comparison' : ''}`.slice(0, 120),
      from, to, label: fit(r.label, BUDGET.relationshipLabel, 'A relationship label') || r.kind, kind: r.kind, sources, approved: r.kind !== 'causal',
    });
  }

  // ---- Visual payloads (after relationships so comparisons can be checked) ----
  for (const { raw, concept, detailIds } of drafts) {
    const downgrade = (why: string) => warn('VISUAL_DOWNGRADED', `${raw.visualType} visual changed to a concept: ${why}`, concept.id);
    let visual: VisualPayload = { type: 'concept' };
    if (raw.visualType === 'process') {
      const steps = [...new Set(raw.processStepIds.map((s) => detailIds.get(s)).filter((s): s is string => !!s))];
      const ok = steps.length >= 2 && steps.length <= 5 && steps.every((s) => concept.details.find((d) => d.id === s)!.text.length <= BUDGET.processStep);
      if (ok) visual = { type: 'process', stepDetailIds: steps };
      else downgrade('a process needs 2–5 verified steps of at most 40 characters.');
    } else if (raw.visualType === 'metric') {
      const value = clean(raw.metricValue ?? '');
      const label = clean(raw.metricLabel ?? '');
      const [valueSource] = raw.metricQuote && raw.metricQuotePage !== null
        ? ground([{ page: raw.metricQuotePage, quote: raw.metricQuote }], 'Metric value', concept.id) : [];
      if (value && value.length <= BUDGET.metricValue && label && valueSource && valueSource.quote.includes(value)) {
        const unit = raw.metricUnit ? clean(raw.metricUnit).slice(0, BUDGET.metricUnit) || null : null;
        visual = { type: 'metric', value, unit, label: fit(label, BUDGET.metricLabel, 'The metric label', concept.id), valueSource };
      } else downgrade('a metric needs an exact value that appears in a verified quote.');
    } else if (raw.visualType === 'comparison') {
      const left = raw.comparisonLeftId ? idMap.get(raw.comparisonLeftId) : undefined;
      const right = raw.comparisonRightId ? idMap.get(raw.comparisonRightId) : undefined;
      const rel = left && right && left !== right && left !== concept.id && right !== concept.id
        ? relationships.find((r) => r.kind === 'comparison' && r.approved && ((r.from === left && r.to === right) || (r.from === right && r.to === left)))
        : undefined;
      if (rel) visual = { type: 'comparison', leftId: left!, rightId: right!, relationshipId: rel.id };
      else downgrade('a comparison needs two other kept concepts joined by a verified comparison relationship.');
    }
    concept.visual = visual;
  }

  // Deterministic home positions: three columns, matching the curated layout.
  const concepts = drafts.map((d, i) => ({ ...d.concept, position: { x: 80 + (i % 3) * 1170, y: 120 + Math.floor(i / 3) * 920 } }));
  stats.conceptsKept = concepts.length;
  const project: CanvasProject = {
    schemaVersion: 1,
    id: `groq-${input.source.sha256.slice(0, 12)}`,
    revision: 1,
    title: fit(plan.title, BUDGET.projectTitle, 'The project title') || input.source.name,
    source: { name: input.source.name.slice(0, 300), sha256: input.source.sha256, pages: input.source.pageCount },
    preparation: { mode: 'groq', model: input.model, promptVersion: input.promptVersion, preparedAt: input.preparedAt ?? new Date().toISOString() },
    concepts,
    relationships,
    assets: [],
    approvedRevision: null,
  };
  return { project, warnings, stats };
}
