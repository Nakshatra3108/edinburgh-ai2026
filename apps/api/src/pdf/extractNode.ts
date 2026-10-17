// Node-side PDF.js text extraction for scripts and tests. The browser uses the
// same pdfjs-dist version and the same pageTextFromItems() rule.

import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { pageTextFromItems, type TextItemLike } from '../generation/sourceText.ts';

export type ExtractedPdf = { sha256: string; pages: { page: number; text: string }[] };

export async function extractPdf(path: string): Promise<ExtractedPdf> {
  const bytes = await readFile(path);
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  const task = getDocument({ data: new Uint8Array(bytes), verbosity: 0 });
  const doc = await task.promise;
  const pages: ExtractedPdf['pages'] = [];
  for (let page = 1; page <= doc.numPages; page++) {
    const content = await (await doc.getPage(page)).getTextContent();
    const items = content.items.filter((i): i is TextItemLike & typeof i => 'str' in i);
    pages.push({ page, text: pageTextFromItems(items) });
  }
  await task.destroy();
  return { sha256, pages };
}
