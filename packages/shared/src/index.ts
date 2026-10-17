import { z } from "zod";

// Person C's projection of the future full Project. Extra PRD fields are preserved.
// This is not the complete preparation/domain schema owned by Person D.
export const conceptSchema = z
  .object({
    id: z.string().min(1),
    title: z.string().min(1),
    summary: z.string(),
    aliases: z.array(z.string()),
    speechExamples: z.array(z.string()),
    enabled: z.boolean(),
    review: z.enum(["reviewed", "needs-review"]),
    details: z.array(
      z
        .object({ id: z.string().min(1), text: z.string().min(1) })
        .passthrough(),
    ),
    visual: z
      .object({
        type: z.enum(["concept", "process", "comparison", "figure", "metric"]),
      })
      .passthrough(),
  })
  .passthrough();
export const manifestSchema = z
  .object({
    schemaVersion: z.literal(1),
    id: z.string().min(1),
    revision: z.number().int().positive(),
    title: z.string(),
    concepts: z.array(conceptSchema).min(1),
    relationships: z.array(
      z
        .object({
          id: z.string(),
          from: z.string(),
          to: z.string(),
          label: z.string(),
          kind: z.enum(["sequence", "comparison", "association", "causal"]),
          approved: z.boolean(),
        })
        .passthrough(),
    ),
  })
  .passthrough()
  .superRefine((p, ctx) => {
    const ids = new Set(p.concepts.map((c) => c.id));
    if (ids.size !== p.concepts.length)
      ctx.addIssue({ code: "custom", message: "Duplicate concept IDs" });
    for (const c of p.concepts) {
      if (new Set(c.details.map((d) => d.id)).size !== c.details.length)
        ctx.addIssue({
          code: "custom",
          message: `Duplicate detail IDs in ${c.id}`,
        });
    }
    if (
      new Set(p.relationships.map((r) => r.id)).size !== p.relationships.length
    )
      ctx.addIssue({ code: "custom", message: "Duplicate relationship IDs" });
    for (const r of p.relationships) {
      if (!ids.has(r.from) || !ids.has(r.to) || r.from === r.to)
        ctx.addIssue({
          code: "custom",
          message: `Invalid relationship ${r.id}`,
        });
    }
  });
export type MatchingManifest = z.infer<typeof manifestSchema>;
export type MatchingConcept = MatchingManifest["concepts"][number];

export const actionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("FOCUS"), conceptId: z.string() }),
  z.object({
    type: z.literal("REVEAL"),
    conceptId: z.string(),
    detailId: z.string(),
  }),
  z.object({ type: z.literal("CONNECT"), relationshipId: z.string() }),
  z.object({
    type: z.literal("COMPARE"),
    leftId: z.string(),
    rightId: z.string(),
  }),
  z.object({ type: z.literal("OVERVIEW") }),
  z.object({ type: z.literal("HOLD") }),
]);
export type CanvasAction = z.infer<typeof actionSchema>;
export const candidateSchema = z.object({
  version: z.literal(1),
  projectId: z.string(),
  revision: z.number().int(),
  epoch: z.number().int().nonnegative(),
  seq: z.number().int().positive(),
  input: z.enum(["typed", "microphone", "recording"]),
  text: z.string(),
  conceptId: z.string().nullable(),
  strength: z.number(),
  margin: z.number(),
  stable: z.boolean(),
  action: actionSchema,
  reason: z.string(),
  createdAt: z.number(),
  matchingMs: z.number().nonnegative(),
});
export type CandidateEvent = z.infer<typeof candidateSchema>;
export type InputKind = CandidateEvent["input"];
