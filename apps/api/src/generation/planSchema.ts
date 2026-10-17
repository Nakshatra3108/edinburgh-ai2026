// The plan Groq returns (before grounding). Deliberately flatter than Project:
// no offsets (the server computes them), no positions, no union types.
//
// Groq strict mode rules: every property is listed in `required`, optional
// values are nullable unions (type: [T, 'null']), and every object sets
// `additionalProperties: false`. Length/count limits are enforced in code,
// not in the schema.

import { z } from 'zod';

export const PLAN_SCHEMA_VERSION = 'follow-plan-v1';

/** PRD §11.2 initial generated plan limits, per density. */
export const PLAN_LIMITS = {
  standard: { concepts: 8, details: 5, relationships: 12 },
  concise: { concepts: 6, details: 3, relationships: 8 },
} as const;
export type Density = keyof typeof PLAN_LIMITS;

const VISUAL_TYPES = ['concept', 'process', 'metric', 'comparison'] as const;
const RELATIONSHIP_KINDS = ['sequence', 'comparison', 'association', 'causal'] as const;

const str = { type: 'string' } as const;
const nullableStr = { type: ['string', 'null'] } as const;
const strArray = { type: 'array', items: str } as const;
const obj = (properties: Record<string, unknown>) =>
  ({ type: 'object', additionalProperties: false, required: Object.keys(properties), properties }) as const;
const quotes = { type: 'array', items: obj({ page: { type: 'integer' }, quote: str }) } as const;

export const planJsonSchema = obj({
  title: str,
  concepts: {
    type: 'array',
    items: obj({
      id: str,
      title: str,
      summary: str,
      visualType: { type: 'string', enum: VISUAL_TYPES },
      aliases: strArray,
      speechExamples: strArray,
      quotes,
      details: { type: 'array', items: obj({ id: str, text: str, quotes }) },
      processStepIds: strArray,
      metricValue: nullableStr,
      metricUnit: nullableStr,
      metricLabel: nullableStr,
      metricQuotePage: { type: ['integer', 'null'] },
      metricQuote: nullableStr,
      comparisonLeftId: nullableStr,
      comparisonRightId: nullableStr,
    }),
  },
  relationships: {
    type: 'array',
    items: obj({ from: str, to: str, label: str, kind: { type: 'string', enum: RELATIONSHIP_KINDS }, quotes }),
  },
});

const quote = z.object({ page: z.number().int(), quote: z.string() }).strict();
export const planSchema = z.object({
  title: z.string(),
  concepts: z.array(z.object({
    id: z.string(),
    title: z.string(),
    summary: z.string(),
    visualType: z.enum(VISUAL_TYPES),
    aliases: z.array(z.string()),
    speechExamples: z.array(z.string()),
    quotes: z.array(quote),
    details: z.array(z.object({ id: z.string(), text: z.string(), quotes: z.array(quote) }).strict()),
    processStepIds: z.array(z.string()),
    metricValue: z.string().nullable(),
    metricUnit: z.string().nullable(),
    metricLabel: z.string().nullable(),
    metricQuotePage: z.number().int().nullable(),
    metricQuote: z.string().nullable(),
    comparisonLeftId: z.string().nullable(),
    comparisonRightId: z.string().nullable(),
  }).strict()),
  relationships: z.array(z.object({
    from: z.string(), to: z.string(), label: z.string(), kind: z.enum(RELATIONSHIP_KINDS), quotes: z.array(quote),
  }).strict()),
}).strict();
export type Plan = z.infer<typeof planSchema>;
