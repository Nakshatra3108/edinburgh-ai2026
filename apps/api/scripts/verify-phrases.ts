// Verifies demo/phrases.json against demo/manifest.json (PRD §15.2-15.3):
// expected IDs exist, COMPARE uses an approved comparison, PRD minimum counts
// are met, and test phrases are not near-copies of the manifest's own speech
// examples or aliases (held-out copies are errors, rehearsal copies warnings).
// Also prints a keyword-only baseline (PRD §9.2) for reference.
//
//   node scripts/verify-phrases.ts [phrases] [manifest]

import { readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

type Expect =
  | { action: 'FOCUS'; conceptId: string }
  | { action: 'REVEAL'; conceptId: string; detailId: string }
  | { action: 'COMPARE'; leftId: string; rightId: string; relationshipId: string }
  | { action: 'HOLD' };
type Case = { id: string; split: string; kind: string; text: string; expect: Expect };

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const [phrasesPath, manifestPath] = [
  resolve(process.argv[2] ?? `${root}/demo/phrases.json`),
  resolve(process.argv[3] ?? `${root}/demo/manifest.json`),
];
const phrases = JSON.parse(await readFile(phrasesPath, 'utf8'));
const project = JSON.parse(await readFile(manifestPath, 'utf8'));
const errors: string[] = [];
const warnings: string[] = [];

if (phrases.manifestId !== project.id || phrases.manifestRevision !== project.revision) {
  errors.push(`phrases target ${phrases.manifestId}@${phrases.manifestRevision}, manifest is ${project.id}@${project.revision}`);
}

const concepts = new Map<string, any>(project.concepts.map((c: any) => [c.id, c]));
function checkExpect(e: Expect, where: string) {
  if (e.action === 'HOLD') return;
  if (e.action === 'FOCUS' || e.action === 'REVEAL') {
    const c = concepts.get(e.conceptId);
    if (!c) return errors.push(`${where}: unknown concept ${e.conceptId}`);
    if (e.action === 'FOCUS' && c.visual.type === 'comparison') errors.push(`${where}: use COMPARE for comparison concept ${c.id}`);
    if (e.action === 'REVEAL' && !c.details.some((d: any) => d.id === e.detailId)) errors.push(`${where}: unknown detail ${e.conceptId}/${e.detailId}`);
    return;
  }
  if (e.action === 'COMPARE') {
    const r = project.relationships.find((r: any) => r.id === e.relationshipId);
    const ok = r?.approved && r.kind === 'comparison' &&
      ((r.from === e.leftId && r.to === e.rightId) || (r.from === e.rightId && r.to === e.leftId));
    if (!ok) errors.push(`${where}: ${e.leftId}/${e.rightId} via ${e.relationshipId} is not an approved comparison`);
    return;
  }
  errors.push(`${where}: unknown action ${(e as any).action}`);
}

const cases: Case[] = phrases.cases;
const ids = new Set<string>();
for (const c of cases) {
  if (ids.has(c.id)) errors.push(`duplicate case id ${c.id}`);
  ids.add(c.id);
  if (c.split !== 'rehearsal' && c.split !== 'heldOut') errors.push(`${c.id}: bad split ${c.split}`);
  checkExpect(c.expect, `case ${c.id}`);
}
for (const s of phrases.sequences) {
  s.steps.forEach((step: any, i: number) => step.expect && checkExpect(step.expect, `sequence ${s.id}[${i}]`));
  for (const step of s.steps) if (step.kind === 'manual') checkExpect({ action: 'FOCUS', conceptId: step.action.conceptId }, `sequence ${s.id} manual`);
}

// ---- Near-duplicate check (content-word Jaccard) ----
const STOP = new Set('a an the and or but so to of in on at for with by from is are was be it its this that these those i me my we our you your they them he she not no do does did just then there here what how which who as up out about into than very really can will would'.split(' '));
const words = (s: string) => new Set(s.toLowerCase().replace(/[’']/g, '').match(/[a-z0-9]+/g)?.filter((w) => !STOP.has(w)) ?? []);
const jaccard = (a: Set<string>, b: Set<string>) => {
  const inter = [...a].filter((w) => b.has(w)).length;
  return inter / (a.size + b.size - inter || 1);
};
const examples = project.concepts.flatMap((c: any) => [...c.speechExamples, ...c.aliases].map((t: string) => ({ c: c.id, t, w: words(t) })));
const rehearsal = cases.filter((c) => c.split === 'rehearsal').map((c) => ({ ...c, w: words(c.text) }));
for (const c of cases) {
  const w = words(c.text);
  for (const ex of examples) {
    const j = jaccard(w, ex.w);
    if (j >= 0.5) (c.split === 'heldOut' ? errors : warnings).push(`${c.id} is ${Math.round(j * 100)}% similar to manifest example "${ex.t}"`);
  }
  if (c.split === 'heldOut') {
    for (const r of rehearsal) if (jaccard(w, r.w) >= 0.5) errors.push(`${c.id} is near-copy of rehearsal ${r.id}`);
  }
}

// ---- PRD §15.3 minimums ----
const count = (f: (c: Case) => boolean) => cases.filter(f).length;
const topical = (c: Case) => c.expect.action !== 'HOLD' && c.kind === 'paraphrase';
const steps = phrases.sequences.flatMap((s: any) => s.steps);
const minimums: [string, number, number][] = [
  ['rehearsal topic paraphrases', count((c) => c.split === 'rehearsal' && topical(c)), 24],
  ['distractor / off-topic statements', count((c) => c.expect.action === 'HOLD' && ['off-topic', 'filler', 'negation'].includes(c.kind)), 6],
  ['silence intervals', steps.filter((s: any) => s.kind === 'silence').length, 3],
  ['topic returns', phrases.sequences.reduce((n: number, s: any) => n + (s.topicReturns ?? 0), 0), 2],
  ['approved-comparison phrases', count((c) => c.expect.action === 'COMPARE') + steps.filter((s: any) => s.expect?.action === 'COMPARE').length, 2],
  ['manual overrides', steps.filter((s: any) => s.kind === 'manual').length, 1],
  ['held-out cases', count((c) => c.split === 'heldOut'), 12],
];
for (const [label, got, min] of minimums) if (got < min) errors.push(`${label}: ${got} < PRD minimum ${min}`);
for (const c of project.concepts) {
  const target = (e: Expect) => (e.action === 'FOCUS' || e.action === 'REVEAL' ? e.conceptId === c.id : e.action === 'COMPARE' && c.visual.type === 'comparison');
  for (const split of ['rehearsal', 'heldOut']) {
    if (!cases.some((x) => x.split === split && x.kind === 'paraphrase' && target(x.expect))) errors.push(`no ${split} paraphrase for concept ${c.id}`);
  }
}

// ---- Keyword-only baseline (reference, not a gate) ----
const conceptWords = project.concepts.map((c: any) => ({ c, w: words([c.title, ...c.aliases].join(' ')) }));
function keywordGuess(text: string): string {
  const w = words(text);
  const scored = conceptWords.map(({ c, w: cw }: any) => ({ c, s: [...w].filter((x) => cw.has(x)).length })).sort((a: any, b: any) => b.s - a.s);
  if (!scored[0].s || scored[0].s === scored[1].s) return 'HOLD';
  return scored[0].c.visual.type === 'comparison' ? 'COMPARE' : scored[0].c.id;
}
const truth = (e: Expect) => (e.action === 'HOLD' ? 'HOLD' : e.action === 'COMPARE' ? 'COMPARE' : e.conceptId);
for (const split of ['rehearsal', 'heldOut']) {
  const xs = cases.filter((c) => c.split === split);
  const hit = xs.filter((c) => keywordGuess(c.text) === truth(c.expect)).length;
  console.log(`keyword baseline (${split}): ${hit}/${xs.length} = ${Math.round((100 * hit) / xs.length)}% topic/HOLD correct`);
}

for (const [label, got, min] of minimums) console.log(`  ${label}: ${got} (min ${min})`);
for (const w of warnings) console.warn(`warning: ${w}`);
if (errors.length) {
  console.error(`FAIL: ${errors.length} problem(s)`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
console.log(`OK: ${cases.length} cases (${count((c) => c.split === 'rehearsal')} rehearsal, ${count((c) => c.split === 'heldOut')} held out), ${phrases.sequences.length} sequences, all IDs valid for ${project.id}@${project.revision}`);
