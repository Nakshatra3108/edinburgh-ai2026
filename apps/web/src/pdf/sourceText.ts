// Normalized page text and exact-quote location (PRD §11.1 SourceRef, §12.3).
//
// SourceRef.start/end are offsets into the *normalized* page text produced here.
// The browser extractor (apps/web/src/pdf) and the server validator must use this
// exact function, or offsets will disagree. It belongs in packages/shared once
// Naksh agrees; until then keep any copy byte-for-byte identical.
//
// Rule: concatenate PDF.js text items in stream order, adding "\n" after items with
// hasEOL; apply Unicode NFC; collapse every whitespace run to one space; trim.
// Reading order is not re-sorted (conservative, deterministic).

export type TextItemLike = { str: string; hasEOL?: boolean };

export const NORMALIZATION_VERSION = 'follow-text-v1';

export function normalizeText(raw: string): string {
  return raw.normalize('NFC').replace(/\s+/gu, ' ').trim();
}

export function pageTextFromItems(items: readonly TextItemLike[]): string {
  let raw = '';
  for (const item of items) {
    raw += item.str;
    if (item.hasEOL) raw += '\n';
  }
  return normalizeText(raw);
}

// One-for-one typographic look-alikes, so folding never changes string length.
const FOLD: Record<string, string> = {
  '‐': '-', '‑': '-', '‒': '-', '–': '-', '—': '-', '−': '-',
  '‘': "'", '’': "'", '“': '"', '”': '"',
};
const fold = (s: string) => s.replace(/[‐-—−‘’“”]/g, (c) => FOLD[c]);

/**
 * Locates a quote in normalized page text. Exact matches win. Otherwise it
 * tolerates dash/quote look-alikes and one added trailing punctuation mark
 * (common in model output). The returned quote is always the page's own text,
 * so provenance stays exact.
 */
export function locateQuote(pageText: string, quote: string): { quote: string; start: number; end: number } | null {
  const q = normalizeText(quote);
  if (!q) return null;
  const exact = pageText.indexOf(q);
  if (exact !== -1) return { quote: q, start: exact, end: exact + q.length };
  const page = fold(pageText);
  const folded = fold(q);
  for (const candidate of [folded, folded.replace(/[.,;:!?]$/, '')]) {
    const start = candidate ? page.indexOf(candidate) : -1;
    if (start !== -1) return { quote: pageText.slice(start, start + candidate.length), start, end: start + candidate.length };
  }
  return null;
}
