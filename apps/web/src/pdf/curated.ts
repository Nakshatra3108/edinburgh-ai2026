// Curated-package check (PRD §3.2): an uploaded PDF only opens a curated
// project when its SHA-256 and page count match. A filename is not enough.

import type { CanvasProject } from '../canvas/domain';
import type { ExtractedSource } from './extract';

export type CuratedMatch =
  | { ok: true }
  | { ok: false; reason: 'HASH_MISMATCH' | 'PAGE_COUNT_MISMATCH' | 'QUOTES_NOT_FOUND'; missing?: string[] };

export function matchCuratedSource(source: ExtractedSource, project: CanvasProject): CuratedMatch {
  if (source.sha256.toLowerCase() !== project.source.sha256.toLowerCase()) return { ok: false, reason: 'HASH_MISMATCH' };
  if (source.pageCount !== project.source.pages) return { ok: false, reason: 'PAGE_COUNT_MISMATCH' };
  // Same bytes should give the same text; this guards against a pdf.js or normalization drift.
  const text = new Map(source.pages.map((p) => [p.page, p.text]));
  const refs = [
    ...project.concepts.flatMap((c) => [
      ...c.sources, ...c.details.flatMap((d) => d.sources), ...(c.visual.type === 'metric' ? [c.visual.valueSource] : []),
    ]),
    ...project.relationships.flatMap((r) => r.sources),
  ];
  const missing = refs.filter((r) => text.get(r.page)?.slice(r.start, r.end) !== r.quote).map((r) => `p.${r.page}: ${r.quote}`);
  return missing.length ? { ok: false, reason: 'QUOTES_NOT_FOUND', missing } : { ok: true };
}
