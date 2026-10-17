import { z } from 'zod';
import type { CanvasProject } from './domain';
const text = (max: number) => z.string().trim().min(1).max(max);
const source = z.object({ page: z.number().int().positive(), quote: text(10000), start: z.number().int().nonnegative(), end: z.number().int().nonnegative() }).refine(s => s.end > s.start && s.end - s.start === s.quote.length, 'Source offsets must cover the quote');
const visual = z.discriminatedUnion('type', [
  z.object({ type: z.literal('concept') }),
  z.object({ type: z.literal('metric'), value: text(16), unit: z.string().max(32).nullable(), label: text(80), valueSource: source }),
  z.object({ type: z.literal('process'), stepDetailIds: z.array(text(120)).min(2).max(5) }),
  z.object({ type: z.literal('figure'), assetId: text(120), caption: text(120) }),
  z.object({ type: z.literal('comparison'), leftId: text(120), rightId: text(120), relationshipId: text(120) }),
]);
const concept = z.object({ id: text(120), title: text(64), summary: text(180), aliases: z.array(z.string()).max(50), speechExamples: z.array(z.string()).max(50), visual,
  details: z.array(z.object({ id: text(120), text: text(180), sources: z.array(source), origin: z.enum(['source', 'user']) })).max(20),
  sources: z.array(source), assetIds: z.array(text(120)), enabled: z.boolean(), review: z.enum(['needs-review', 'reviewed']),
  position: z.object({ x: z.number().finite().min(-100000).max(100000), y: z.number().finite().min(-100000).max(100000) }) });
export const canvasProjectSchema = z.object({ schemaVersion: z.literal(1), id: text(120), revision: z.number().int().nonnegative(), title: text(160),
  source: z.object({ name: text(300), sha256: z.string().regex(/^[a-f0-9]{64}$/i), pages: z.number().int().positive() }),
  preparation: z.object({ mode: z.enum(['grok', 'curated']), model: z.string().nullable(), promptVersion: text(120), preparedAt: z.iso.datetime() }),
  concepts: z.array(concept).min(1).max(24),
  relationships: z.array(z.object({ id: text(120), from: text(120), to: text(120), label: text(48), kind: z.enum(['sequence', 'comparison', 'association', 'causal']), sources: z.array(source), approved: z.boolean() })).max(100),
  assets: z.array(z.object({ id: text(120), kind: z.enum(['page-crop', 'image']), blobKey: text(2048), page: z.number().int().positive().nullable(),
    crop: z.object({ x: z.number().min(0).max(1), y: z.number().min(0).max(1), width: z.number().positive().max(1), height: z.number().positive().max(1) }).refine(c => c.x + c.width <= 1 && c.y + c.height <= 1, 'Crop must fit inside the page').nullable(),
    alt: text(300), width: z.number().positive().max(30000), height: z.number().positive().max(30000) })).max(100),
  approvedRevision: z.number().int().nonnegative().nullable(),
}).superRefine((p, ctx) => {
  const error = (message: string) => ctx.addIssue({ code: 'custom', message });
  for (const [label, list] of [['concept', p.concepts], ['relationship', p.relationships], ['asset', p.assets]] as const) {
    if (new Set(list.map(x => x.id)).size !== list.length) error(`Duplicate ${label} ID`);
  }
  const ids = new Set(p.concepts.map(c => c.id)); const assets = new Set(p.assets.map(a => a.id));
  if (p.approvedRevision !== null && p.approvedRevision !== p.revision) error('Approved revision must match project revision');
  for (const r of p.relationships) if (!ids.has(r.from) || !ids.has(r.to) || r.from === r.to) error(`Invalid endpoints: ${r.id}`);
  for (const c of p.concepts) {
    if (new Set(c.details.map(d => d.id)).size !== c.details.length) error(`Duplicate detail ID: ${c.id}`);
    if (c.assetIds.some(id => !assets.has(id))) error(`Missing asset: ${c.id}`);
    const v = c.visual;
    if (v.type === 'process' && (new Set(v.stepDetailIds).size !== v.stepDetailIds.length || v.stepDetailIds.some(id => !c.details.some(d => d.id === id && d.text.length <= 40)))) error(`Invalid process steps: ${c.id}`);
    if (v.type === 'figure' && !assets.has(v.assetId)) error(`Missing figure: ${c.id}`);
    if (v.type === 'comparison' && !p.relationships.some(r => r.id === v.relationshipId && r.approved && r.kind === 'comparison' && v.leftId !== v.rightId && ((r.from === v.leftId && r.to === v.rightId) || (r.from === v.rightId && r.to === v.leftId)))) error(`Unapproved comparison: ${c.id}`);
    for (const s of [...c.sources, ...c.details.flatMap(d => d.sources), ...(v.type === 'metric' ? [v.valueSource] : [])]) if (s.page > p.source.pages) error(`Source page out of range: ${c.id}`);
  }
});
/** This validates renderer input structure/references, not PDF quote provenance. B owns that. */
export function parseCanvasProject(input: unknown): CanvasProject { return canvasProjectSchema.parse(input); }
