import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { parseCanvasProject } from '../canvas/manifest';
import {
  MAX_SELECTED_PAGES, MAX_SOURCE_CHARS, PdfSourceError, checkPdfFile, defaultSelection, evaluateSelection,
  extractPages, matchCuratedSource, pageLabelledText, sha256Hex, summarizeSource, toPdfSourceError, type ExtractedSource,
} from './index';

const repo = (p: string) => fileURLToPath(new URL(`../../../../${p}`, import.meta.url));
const pdfBytes = readFileSync(repo('demo/source/follow-demo.pdf'));
const project = parseCanvasProject(JSON.parse(readFileSync(repo('demo/manifest.json'), 'utf8')));

async function extractDemo(): Promise<ExtractedSource> {
  const data = new Uint8Array(pdfBytes);
  const sha = await sha256Hex(data.slice().buffer);
  const task = getDocument({ data, verbosity: 0 });
  try {
    return summarizeSource('follow-demo.pdf', data.byteLength, sha, await extractPages(await task.promise));
  } finally {
    await task.destroy();
  }
}

const fakeSource = (chars: number[]): ExtractedSource => ({
  name: 'x.pdf', bytes: 1, sha256: '0'.repeat(64), pageCount: chars.length, emptyPages: [], normalization: 'follow-text-v1',
  pages: chars.map((n, i) => ({ page: i + 1, text: 'x'.repeat(n), chars: n })),
});

describe('normalization contract', () => {
  it('web and API copies of sourceText.ts are byte-identical', () => {
    const web = readFileSync(repo('apps/web/src/pdf/sourceText.ts'), 'utf8');
    const api = readFileSync(repo('apps/api/src/generation/sourceText.ts'), 'utf8');
    expect(web).toBe(api);
  });
});

describe('demo PDF extraction', () => {
  it('reproduces every curated quote at its stored offsets', async () => {
    const source = await extractDemo();
    expect(source.pageCount).toBe(4);
    expect(source.emptyPages).toEqual([]);
    expect(source.sha256).toBe(project.source.sha256);
    expect(matchCuratedSource(source, project)).toEqual({ ok: true });
  });

  it('rejects a curated package for a different file', async () => {
    const source = { ...(await extractDemo()), sha256: 'f'.repeat(64) };
    expect(matchCuratedSource(source, project)).toEqual({ ok: false, reason: 'HASH_MISMATCH' });
  });

  it('labels pages for preparation and selects all four by default', async () => {
    const source = await extractDemo();
    const selection = defaultSelection(source);
    expect(selection).toMatchObject({ pages: [1, 2, 3, 4], omitted: [], problems: [] });
    expect(pageLabelledText(source, selection).map((p) => p.page)).toEqual([1, 2, 3, 4]);
  });
});

describe('file checks and errors', () => {
  it('rejects files without a PDF header or over the size limit', async () => {
    await expect(checkPdfFile(new Blob(['hello world']))).rejects.toMatchObject({ code: 'NOT_PDF' });
    await expect(checkPdfFile(new Blob(['%PDF-1.4 ...']), 4)).rejects.toMatchObject({ code: 'TOO_LARGE' });
    await expect(checkPdfFile(new Blob([pdfBytes]))).resolves.toBeUndefined();
  });

  it('maps pdf.js exceptions to codes', () => {
    expect(toPdfSourceError({ name: 'PasswordException' }).code).toBe('ENCRYPTED');
    expect(toPdfSourceError({ name: 'InvalidPDFException' }).code).toBe('INVALID_PDF');
    expect(toPdfSourceError(new PdfSourceError('NO_TEXT')).code).toBe('NO_TEXT');
  });

  it('reports a damaged PDF as INVALID_PDF', async () => {
    const task = getDocument({ data: new TextEncoder().encode('%PDF-1.4\nnot really a pdf'), verbosity: 0 });
    await expect(task.promise.catch((e) => { throw toPdfSourceError(e); })).rejects.toMatchObject({ code: 'INVALID_PDF' });
    await task.destroy();
  });

  it('refuses a PDF with no text on any page', () => {
    expect(() => summarizeSource('scan.pdf', 1, '0'.repeat(64), [{ page: 1, text: '', chars: 0 }])).toThrow(PdfSourceError);
  });
});

describe('page selection limits', () => {
  it('never drops pages silently and reports each limit', () => {
    const s = evaluateSelection(fakeSource(Array(25).fill(100)), Array.from({ length: 21 }, (_, i) => i + 1));
    expect(s.problems).toContainEqual({ code: 'TOO_MANY_PAGES', selected: 21, max: MAX_SELECTED_PAGES });
    expect(s.omitted).toEqual([22, 23, 24, 25]);
    const big = evaluateSelection(fakeSource([50_000, 40_000]), [1, 2]);
    expect(big.problems).toContainEqual({ code: 'TOO_MANY_CHARS', chars: 90_000, max: MAX_SOURCE_CHARS });
    expect(evaluateSelection(fakeSource([0, 10]), [1]).problems).toContainEqual({ code: 'EMPTY_SELECTION' });
    expect(evaluateSelection(fakeSource([10]), [1, 9]).problems).toContainEqual({ code: 'UNKNOWN_PAGE', page: 9 });
  });

  it('default selection stops at the first page that would exceed a limit and lists the rest', () => {
    const s = defaultSelection(fakeSource([30_000, 0, 30_000, 30_000, 10]));
    expect(s).toMatchObject({ pages: [1, 3], chars: 60_000, omitted: [2, 4, 5], problems: [] });
  });
});
