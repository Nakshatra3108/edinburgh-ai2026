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

/** Locates an exact quote (after the same normalization) in normalized page text. */
export function locateQuote(pageText: string, quote: string): { quote: string; start: number; end: number } | null {
  const q = normalizeText(quote);
  if (!q) return null;
  const start = pageText.indexOf(q);
  return start === -1 ? null : { quote: q, start, end: start + q.length };
}
