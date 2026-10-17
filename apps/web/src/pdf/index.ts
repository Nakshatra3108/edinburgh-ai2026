export {
  MAX_PDF_BYTES, PdfSourceError, checkPdfFile, extractPages, extractPdfFile, sha256Hex, summarizeSource, toPdfSourceError,
  type ExtractOptions, type ExtractedPage, type ExtractedSource, type PdfDocumentLike, type PdfErrorCode,
} from './extract';
export {
  MAX_SELECTED_PAGES, MAX_SOURCE_CHARS, defaultSelection, evaluateSelection, pageLabelledText,
  type PageSelection, type SelectionProblem,
} from './selection';
export { matchCuratedSource, type CuratedMatch } from './curated';
export { NORMALIZATION_VERSION, locateQuote, normalizeText } from './sourceText';
