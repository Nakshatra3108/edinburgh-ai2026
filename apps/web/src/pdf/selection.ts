// Page selection for preparation (PRD §11.2): at most 20 pages and 80,000
// characters per job. Nothing is dropped silently: callers get every omitted
// page back so the UI can explain it.

import type { ExtractedSource } from './extract';

export const MAX_SELECTED_PAGES = 20;
export const MAX_SOURCE_CHARS = 80_000;

export type PageSelection = {
  pages: number[];
  chars: number;
  /** Pages in the document that are not in this selection, ascending. */
  omitted: number[];
  /** Selected pages with no text; they add nothing to preparation. */
  empty: number[];
  problems: SelectionProblem[];
};

export type SelectionProblem =
  | { code: 'EMPTY_SELECTION' }
  | { code: 'UNKNOWN_PAGE'; page: number }
  | { code: 'TOO_MANY_PAGES'; selected: number; max: number }
  | { code: 'TOO_MANY_CHARS'; chars: number; max: number };

/** Evaluates an explicit page selection. `problems` is empty when it can be sent. */
export function evaluateSelection(source: ExtractedSource, requested: readonly number[]): PageSelection {
  const byPage = new Map(source.pages.map((p) => [p.page, p]));
  const problems: SelectionProblem[] = [];
  const pages = [...new Set(requested)].sort((a, b) => a - b);
  for (const page of pages) if (!byPage.has(page)) problems.push({ code: 'UNKNOWN_PAGE', page });
  const known = pages.filter((p) => byPage.has(p));
  const chars = known.reduce((n, p) => n + byPage.get(p)!.chars, 0);
  if (!known.some((p) => byPage.get(p)!.chars > 0)) problems.push({ code: 'EMPTY_SELECTION' });
  if (known.length > MAX_SELECTED_PAGES) problems.push({ code: 'TOO_MANY_PAGES', selected: known.length, max: MAX_SELECTED_PAGES });
  if (chars > MAX_SOURCE_CHARS) problems.push({ code: 'TOO_MANY_CHARS', chars, max: MAX_SOURCE_CHARS });
  const chosen = new Set(known);
  return {
    pages: known,
    chars,
    omitted: source.pages.map((p) => p.page).filter((p) => !chosen.has(p)),
    empty: known.filter((p) => byPage.get(p)!.chars === 0),
    problems,
  };
}

/** Default selection: pages from the start, with text, while both limits hold. */
export function defaultSelection(source: ExtractedSource): PageSelection {
  const pages: number[] = [];
  let chars = 0;
  for (const p of source.pages) {
    if (p.chars === 0) continue;
    if (pages.length === MAX_SELECTED_PAGES || chars + p.chars > MAX_SOURCE_CHARS) break;
    pages.push(p.page);
    chars += p.chars;
  }
  return evaluateSelection(source, pages);
}

/** Page-labelled text for the preparation request (PRD §11.3 "pageLabelledSource"). */
export function pageLabelledText(source: ExtractedSource, selection: PageSelection): { page: number; text: string }[] {
  const chosen = new Set(selection.pages);
  return source.pages.filter((p) => chosen.has(p.page) && p.chars > 0).map(({ page, text }) => ({ page, text }));
}
