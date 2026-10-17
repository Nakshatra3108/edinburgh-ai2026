// Local PDF text extraction (PRD §12.1, F01/F02). Nothing here leaves the browser.
// Text uses the shared normalization in ./sourceText.ts, so SourceRef offsets
// match the server-side quote validator.

import type { LocalFigure } from './figures';
import { NORMALIZATION_VERSION, pageTextFromItems, type TextItemLike } from './sourceText';

/** PRD §11.2 prototype limit for the uploaded file. */
export const MAX_PDF_BYTES = 20 * 1024 * 1024;

export type PdfErrorCode = 'NOT_PDF' | 'TOO_LARGE' | 'ENCRYPTED' | 'INVALID_PDF' | 'NO_TEXT' | 'CANCELLED';

const MESSAGES: Record<PdfErrorCode, string> = {
  NOT_PDF: 'This file does not contain a PDF header. Choose a valid PDF.',
  TOO_LARGE: 'This PDF is larger than 20 MB. Choose a smaller file.',
  ENCRYPTED: 'This PDF is password-protected or encrypted, which is not supported. Choose an unprotected copy.',
  INVALID_PDF: 'This PDF could not be read. It may be damaged; try exporting it again.',
  NO_TEXT: 'No selectable text was found in this PDF. Scanned or image-only PDFs need OCR before a knowledge base can be built. Choose a text-based PDF.',
  CANCELLED: 'Reading the PDF was cancelled.',
};

export class PdfSourceError extends Error {
  readonly code: PdfErrorCode;
  constructor(code: PdfErrorCode, cause?: unknown) {
    super(MESSAGES[code], { cause });
    this.name = 'PdfSourceError';
    this.code = code;
  }
}

export type ExtractedPage = { page: number; text: string; chars: number };

export type ExtractedSource = {
  name: string;
  bytes: number;
  sha256: string;
  pageCount: number;
  pages: ExtractedPage[];
  /** Pages with no extractable text (scanned images, blank pages). OCR is P2. */
  emptyPages: number[];
  normalization: typeof NORMALIZATION_VERSION;
  figures?: LocalFigure[];
  figureWarnings?: string[];
  file?: File;
};

/** The subset of PDFDocumentProxy this module needs; lets tests pass a Node-loaded document. */
export type PdfDocumentLike = {
  numPages: number;
  getPage(n: number): Promise<{ getTextContent(): Promise<{ items: readonly object[] }> }>;
};

export type ExtractOptions = { signal?: AbortSignal; onProgress?: (pagesDone: number, pageCount: number) => void; onFiguresProgress?: (pagesDone: number, pageCount: number, figures: number) => void };

export async function sha256Hex(data: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Cheap checks before parsing: size and the %PDF- header. */
export async function checkPdfFile(file: Blob, maxBytes = MAX_PDF_BYTES): Promise<void> {
  if (file.size > maxBytes) throw new PdfSourceError('TOO_LARGE');
  const header = new TextDecoder().decode(await file.slice(0, 5).arrayBuffer());
  if (header !== '%PDF-') throw new PdfSourceError('NOT_PDF');
}

/** Maps pdf.js exceptions to user-facing codes. */
export function toPdfSourceError(error: unknown): PdfSourceError {
  if (error instanceof PdfSourceError) return error;
  const name = (error as { name?: string } | null)?.name;
  if (name === 'PasswordException') return new PdfSourceError('ENCRYPTED', error);
  if (name === 'AbortError' || name === 'AbortException') return new PdfSourceError('CANCELLED', error);
  return new PdfSourceError('INVALID_PDF', error);
}

/** Reads normalized text from every page of an already opened document. */
export async function extractPages(doc: PdfDocumentLike, options: ExtractOptions = {}): Promise<ExtractedPage[]> {
  const pages: ExtractedPage[] = [];
  for (let page = 1; page <= doc.numPages; page++) {
    if (options.signal?.aborted) throw new PdfSourceError('CANCELLED');
    const content = await (await doc.getPage(page)).getTextContent();
    const items = content.items.filter((i): i is TextItemLike => typeof (i as TextItemLike).str === 'string');
    const text = pageTextFromItems(items);
    pages.push({ page, text, chars: text.length });
    options.onProgress?.(page, doc.numPages);
  }
  return pages;
}

export function summarizeSource(name: string, bytes: number, sha256: string, pages: ExtractedPage[]): ExtractedSource {
  const emptyPages = pages.filter((p) => p.chars === 0).map((p) => p.page);
  if (pages.length === 0 || emptyPages.length === pages.length) throw new PdfSourceError('NO_TEXT');
  return { name, bytes, sha256, pageCount: pages.length, pages, emptyPages, normalization: NORMALIZATION_VERSION };
}

/** Browser entry point: validate, hash, and extract a user-selected PDF locally. */
export async function extractPdfFile(file: File, options: ExtractOptions = {}): Promise<ExtractedSource> {
  await checkPdfFile(file);
  const data = await file.arrayBuffer();
  const sha256 = await sha256Hex(data);
  // Loaded on demand so pdf.js stays out of the main bundle; the worker is bundled, never fetched remotely.
  const [{ getDocument, GlobalWorkerOptions }, { default: workerSrc }] = await Promise.all([
    import('pdfjs-dist'),
    import('pdfjs-dist/build/pdf.worker.min.mjs?url'),
  ]);
  GlobalWorkerOptions.workerSrc = workerSrc;
  // pdf.js takes ownership of the buffer it is given, so pass a copy.
  const task = getDocument({ data: new Uint8Array(data.slice(0)), verbosity: 0 });
  const abort = () => void task.destroy();
  options.signal?.addEventListener('abort', abort, { once: true });
  try {
    const doc = await task.promise;
    const source = summarizeSource(file.name, file.size, sha256, await extractPages(doc, options));
    const { extractPdfFigures } = await import('./figures');
    const local = await extractPdfFigures(doc, source.pages, sha256, options);
    return { ...source, file, figures: local.figures, figureWarnings: local.warnings };
  } catch (error) {
    throw toPdfSourceError(options.signal?.aborted ? new PdfSourceError('CANCELLED') : error);
  } finally {
    options.signal?.removeEventListener('abort', abort);
    await task.destroy();
  }
}
