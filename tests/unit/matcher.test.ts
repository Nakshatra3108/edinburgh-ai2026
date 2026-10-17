import { describe, expect, it } from "vitest";
import { candidateSchema, manifestSchema } from "@follow/shared";
import fixture from "../../demo/speech-fixture.json";
import {
  bestTwo,
  cosine,
  Matcher,
  type Score,
} from "../../apps/web/src/matching/matcher";
const manifest = manifestSchema.parse(fixture);
const scores = (id = "problem", score = 0.75, runner = 0.2): Score[] =>
  manifest.concepts.map((c) => ({
    conceptId: c.id,
    score: c.id === id ? score : runner,
    details: [],
  }));
describe("matching safety gates", () => {
  it("waits for two independent observations, then proposes a focus", () => {
    const matcher = new Matcher(manifest);
    expect(
      matcher.decide("Slide operation breaks my flow", scores(), 1).action.type,
    ).toBe("HOLD");
    expect(
      matcher.decide("Searching the deck interrupts speaking", scores(), 2)
        .action,
    ).toEqual({ type: "FOCUS", conceptId: "problem" });
  });
  it("does not count a repeated final transcript as another hit", () => {
    const matcher = new Matcher(manifest);
    matcher.decide("A fixed slide sequence", scores(), 1);
    expect(
      matcher.decide("A fixed slide sequence!", scores(), 2).action.type,
    ).toBe("HOLD");
    expect(
      matcher.decide("Clicking slides causes friction", scores(), 3).stable,
    ).toBe(true);
  });
  it("holds on weak, ambiguous, filler, silence and negated inputs", () => {
    for (const [text, ranked] of [
      ["Different topic", scores("problem", 0.3)],
      ["Similar topics", scores("problem", 0.6, 0.59)],
      ["", scores()],
      ["Okay um well right", scores()],
      ["We are not talking about slides", scores()],
    ] as const) {
      const matcher = new Matcher(manifest);
      matcher.decide(text, ranked, 1);
      expect(matcher.decide(text, ranked, 2).action.type).toBe("HOLD");
    }
  });
  it("uncertainty clears pending stability", () => {
    const matcher = new Matcher(manifest);
    matcher.decide("A fixed sequence", scores(), 1);
    matcher.decide("Something unrelated", scores("problem", 0.2), 2);
    expect(matcher.decide("Operating a deck", scores(), 3).action.type).toBe(
      "HOLD",
    );
  });
  it("discards non-increasing sequences and resets stability on epoch change", () => {
    const matcher = new Matcher(manifest);
    matcher.decide("First relevant sentence", scores(), 5);
    expect(matcher.decide("Stale relevant sentence", scores(), 4).reason).toBe(
      "Stale sequence",
    );
    matcher.reset();
    expect(matcher.decide("Fresh sentence", scores(), 6).stable).toBe(false);
  });
  it("retains an accepted topic with less evidence and reveals only approved details once", () => {
    const matcher = new Matcher(manifest);
    matcher.commit({ type: "FOCUS", conceptId: "pipeline" });
    const ranked = scores("pipeline", 0.4, 0.2);
    ranked.find((s) => s.conceptId === "pipeline")!.details = [
      { detailId: "capture", score: 0.8 },
    ];
    const result = matcher.decide("Capture microphone audio", ranked, 1);
    expect(result.action).toEqual({
      type: "REVEAL",
      conceptId: "pipeline",
      detailId: "capture",
    });
    matcher.commit(result.action);
    expect(
      matcher.decide("We capture the audio locally", ranked, 2).action.type,
    ).toBe("HOLD");
    ranked.find((s) => s.conceptId === "pipeline")!.details = [
      { detailId: "invented", score: 0.99 },
    ];
    expect(matcher.decide("Another detail", ranked, 3).action.type).toBe(
      "HOLD",
    );
  });
  it("never selects disabled or unreviewed concepts", () => {
    const altered = structuredClone(manifest);
    altered.concepts[0].enabled = false;
    const matcher = new Matcher(altered);
    matcher.decide("Slides", scores(), 1);
    expect(matcher.decide("Slide deck", scores(), 2).action.type).toBe("HOLD");
  });
  it("resolves approved comparisons in either order, with two-hit stability", () => {
    const matcher = new Matcher(manifest);
    expect(
      matcher.decide(
        "Compare fixed slides versus speech directed canvas",
        scores(),
        1,
      ).stable,
    ).toBe(false);
    expect(
      matcher.decide(
        "Contrast speech directed canvas and traditional slides",
        scores(),
        2,
      ).action,
    ).toEqual({ type: "COMPARE", leftId: "problem", rightId: "architecture" });
  });
  it("holds on ambiguous endpoints and unapproved comparisons", () => {
    const matcher = new Matcher(manifest);
    expect(
      matcher.decide("Compare fixed slides", scores(), 1).action.type,
    ).toBe("HOLD");
    expect(
      matcher.decide("Compare fixed slides with semantic matching", scores(), 2)
        .action.type,
    ).toBe("HOLD");
    const altered = structuredClone(manifest);
    altered.relationships[0].approved = false;
    expect(
      new Matcher(altered).decide(
        "Compare fixed slides versus speech directed canvas",
        scores(),
        1,
      ).action.type,
    ).toBe("HOLD");
  });
  it("only connects an approved relationship", () => {
    const matcher = new Matcher(manifest);
    const a = "Connect: transcripts feed semantic matching";
    matcher.decide(a, scores(), 1);
    expect(
      matcher.decide(
        "Show the connection: transcripts feed semantic matching",
        scores(),
        2,
      ).action,
    ).toEqual({ type: "CONNECT", relationshipId: "pipeline-matching" });
    expect(
      matcher.decide("Connect invented evidence", scores(), 3).action.type,
    ).toBe("HOLD");
  });
});
describe("math and contracts", () => {
  it("uses normalized cosine and top-two aggregation", () => {
    expect(cosine([3, 4], [6, 8])).toBeCloseTo(1);
    expect(cosine([0, 0], [3, 4])).toBe(0);
    expect(cosine([1], [1, 2])).toBe(0);
    expect(bestTwo([0.2, 0.9, 0.7])).toBeCloseTo(0.8);
  });
  it("rejects duplicate IDs and broken relationships", () => {
    const duplicate = structuredClone(manifest);
    duplicate.concepts.push(duplicate.concepts[0]);
    expect(manifestSchema.safeParse(duplicate).success).toBe(false);
    const broken = structuredClone(manifest);
    broken.relationships[0].to = "missing";
    expect(manifestSchema.safeParse(broken).success).toBe(false);
  });
  it("rejects unversioned and malformed candidates", () => {
    expect(
      candidateSchema.safeParse({ conceptId: "problem", strength: 0.8 })
        .success,
    ).toBe(false);
  });
});
