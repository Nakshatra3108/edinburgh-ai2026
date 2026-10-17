// Verifies a curated Project manifest against its source PDF (PRD §3.2, §12.3):
// sha256 and page count match, every SourceRef quote exists verbatim in the
// normalized page text at exactly [start, end), source-origin details cite at
// least one quote, user-origin details cite none.
//
//   node scripts/verify-manifest.ts [manifest] [pdf]          check only
//   node scripts/verify-manifest.ts [manifest] [pdf] --write  also fill start/end
//
// Structural schema checks live in the canvas validator (canvasProjectSchema);
// this script checks provenance, which that validator deliberately does not.

import { readFile, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractPdf } from '../src/pdf/extractNode.ts';
import { locateQuote } from '../src/generation/sourceText.ts';

type SourceRef = { page: number; quote: string; start: number; end: number };

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const write = process.argv.includes('--write');
const manifestPath = resolve(args[0] ?? `${root}/demo/manifest.json`);
const pdfPath = resolve(args[1] ?? `${root}/demo/source/follow-demo.pdf`);

const project = JSON.parse(await readFile(manifestPath, 'utf8'));
const pdf = await extractPdf(pdfPath);
const pageText = new Map(pdf.pages.map((p) => [p.page, p.text]));
const errors: string[] = [];
let refs = 0;

if (project.source?.sha256 !== pdf.sha256) errors.push(`source.sha256 ${project.source?.sha256} != PDF ${pdf.sha256}`);
if (project.source?.pages !== pdf.pages.length) errors.push(`source.pages ${project.source?.pages} != PDF ${pdf.pages.length}`);

function check(ref: SourceRef, where: string) {
  refs++;
  const text = pageText.get(ref.page);
  if (text === undefined) return errors.push(`${where}: page ${ref.page} not in PDF`);
  const found = locateQuote(text, ref.quote);
  if (!found) return errors.push(`${where}: quote not found on p.${ref.page}: "${ref.quote}"`);
  if (found.quote !== ref.quote) {
    if (write) ref.quote = found.quote;
    else errors.push(`${where}: quote is not normalized: "${ref.quote}"`);
  }
  if (write) Object.assign(ref, { start: found.start, end: found.end });
  else if (text.slice(ref.start, ref.end) !== ref.quote) {
    errors.push(`${where}: offsets [${ref.start}, ${ref.end}) do not cover the quote (expected [${found.start}, ${found.end}))`);
  }
}

for (const c of project.concepts ?? []) {
  if (!c.sources?.length) errors.push(`concept ${c.id}: no sources`);
  c.sources?.forEach((s: SourceRef, i: number) => check(s, `concept ${c.id} sources[${i}]`));
  for (const d of c.details ?? []) {
    if (d.origin === 'source' && !d.sources?.length) errors.push(`detail ${c.id}/${d.id}: origin "source" but no sources`);
    if (d.origin === 'user' && d.sources?.length) errors.push(`detail ${c.id}/${d.id}: origin "user" must not cite sources`);
    d.sources?.forEach((s: SourceRef, i: number) => check(s, `detail ${c.id}/${d.id} sources[${i}]`));
  }
  if (c.visual?.type === 'metric') check(c.visual.valueSource, `concept ${c.id} metric value`);
}
for (const r of project.relationships ?? []) {
  r.sources?.forEach((s: SourceRef, i: number) => check(s, `relationship ${r.id} sources[${i}]`));
}

if (write && !errors.length) {
  await writeFile(manifestPath, `${JSON.stringify(project, null, 2)}\n`);
  console.log(`wrote offsets for ${refs} source refs to ${manifestPath}`);
}
if (errors.length) {
  console.error(`FAIL: ${errors.length} problem(s) in ${refs} source refs`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
console.log(`OK: ${project.concepts.length} concepts, ${project.relationships.length} relationships, ${refs} source refs verified against ${pdf.pages.length}-page PDF (sha256 ${pdf.sha256.slice(0, 12)}…)`);
