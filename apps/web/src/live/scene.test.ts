import { describe, expect, it } from 'vitest';
import { createCanvasState, applyAction } from '../canvas/applyAction';
import type { CanvasProject, CanvasState } from '../canvas/domain';
import { parseCanvasProject } from '../canvas/manifest';
import { getComposition } from '../canvas/composition';
import { applyLiveScene } from './scene';
import manifest from '../../../../demo/manifest.json';

function prepared(): CanvasProject {
  const p = structuredClone(manifest) as CanvasProject;
  // Reconstruct exact source positions from the curated fixture's own refs.
  const pages = new Map<number, string[]>();
  for (const c of p.concepts) for (const s of [...c.sources, ...c.details.flatMap(d => d.sources)]) {
    if (!pages.has(s.page)) pages.set(s.page, []);
    const text = pages.get(s.page)!;
    for (let i = 0; i < s.quote.length; i++) text[s.start + i] = s.quote[i];
  }
  for (const r of p.relationships) for (const s of r.sources) {
    if (!pages.has(s.page)) pages.set(s.page, []);
    for (let i = 0; i < s.quote.length; i++) pages.get(s.page)![s.start + i] = s.quote[i];
  }
  p.knowledgeBase = { version: 1, pages: [...pages].map(([page, text]) => ({ page, text: Array.from({length: text.length}, (_, i) => text[i] ?? ' ').join('') })) };
  return p;
}
function scene(p: CanvasProject, id = 'pipeline'): CanvasProject {
  return { ...structuredClone(p), concepts: p.concepts.filter(c => c.id === id), relationships: [], approvedRevision: null };
}
describe('speech-driven canvas', () => {
  it('can compose from a full-text knowledge base even when topic indexing produced no concepts', () => {
    const p = prepared(); const sourceOnly = parseCanvasProject({ ...p, concepts: [], relationships: [] });
    const next = applyLiveScene({ ...createCanvasState(sourceOnly), live: true }, scene(p));
    expect(next.focusId).toMatch(/^live-/);
    expect(next.project.knowledgeBase).toBe(sourceOnly.knowledgeBase);
    expect(() => parseCanvasProject({ ...sourceOnly, knowledgeBase: undefined })).toThrow();
  });
  it('starts empty and composes a source-checked process without manual review', () => {
    const p = prepared(); const initial = { ...createCanvasState(p), live: true };
    expect(getComposition(initial)).toEqual([]);
    const next = applyLiveScene(initial, scene(p));
    expect(next.focusId).toMatch(/^live-/);
    expect(next.project.knowledgeBase).toBe(initial.project.knowledgeBase);
    expect(next.revealed[next.focusId!]).toHaveLength(p.concepts.find(c => c.id === 'pipeline')!.details.length);
    expect(getComposition(next).filter(c => !c.home)).toHaveLength(1);
    expect(next.project.concepts.find(c => c.id === next.focusId)?.review).toBe('source-checked');
    expect(() => parseCanvasProject(next.project)).not.toThrow();
  });
  it('new speech adds a new visual and keeps earlier canvas anchors; identical repeats reuse them', () => {
    const p = prepared(); let s = applyLiveScene({ ...createCanvasState(p), live: true }, scene(p));
    const first = s.project.concepts.find(c => c.id === s.focusId)!;
    s = applyLiveScene(s, scene(p, 'problem'));
    s = applyLiveScene(s, scene(p));
    expect(s.project.concepts.filter(c => c.id === first.id)).toHaveLength(1);
    expect(s.project.concepts.find(c => c.id === first.id)?.position).toEqual(first.position);
    expect(getComposition(applyAction(s, { type: 'OVERVIEW' }))).toHaveLength(2);
  });
  it('rejects mismatched documents and fabricated quotes', () => {
    const p = prepared(); const initial = createCanvasState(p);
    expect(() => applyLiveScene(initial, { ...scene(p), source: { ...p.source, sha256: 'a'.repeat(64) } })).toThrow('another document');
    const bad = structuredClone(scene(p)); bad.concepts[0].sources[0].quote = 'x'.repeat(bad.concepts[0].sources[0].quote.length);
    expect(() => applyLiveScene(initial, bad)).toThrow('does not match');
  });
  it('keeps long sessions within schema limits and stable unique anchors', () => {
    const p = prepared(); let s: CanvasState = { ...createCanvasState(p), live: true };
    for (let i = 0; i < 60; i++) {
      const incoming = structuredClone(scene(p)); incoming.concepts[0].title = `Explanation ${i}`;
      s = applyLiveScene(s, incoming);
    }
    expect(s.project.concepts).toHaveLength(24);
    expect(new Set(s.project.concepts.map(c => `${c.position.x},${c.position.y}`)).size).toBe(24);
    expect(s.introduced).toHaveLength(24);
    expect(Object.keys(s.revealed)).toHaveLength(24);
    expect(() => parseCanvasProject(s.project)).not.toThrow();
  });
});
