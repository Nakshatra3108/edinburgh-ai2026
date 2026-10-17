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
    const board = getComposition(s);
    expect(board).toHaveLength(2);
    expect(board.every(n => n.expanded)).toBe(true);
    expect(board[0].x + board[0].width).toBeLessThan(board[1].x);
    expect(s.boardIds).toContain(first.id);
  });
  it('bounds the active board while preserving introduced history and non-overlapping geometry', () => {
    const p = prepared(); let state: CanvasState = {...createCanvasState(p), live:true};
    for(let i=0;i<7;i++) {
      const incoming=scene(p); incoming.concepts[0].title=`Mechanism ${i}`;
      state=applyLiveScene(state,incoming);
    }
    expect(state.boardIds).toHaveLength(3);
    const items=getComposition(state);
    expect(items).toHaveLength(3);
    for(const a of items) for(const b of items) if(a!==b) {
      expect(a.x+a.width<=b.x || b.x+b.width<=a.x || a.y+a.height<=b.y || b.y+b.height<=a.y).toBe(true);
    }
    expect(getComposition(applyAction(state,{type:'OVERVIEW'}))).toHaveLength(7);
  });
  it('renders a verified comparison even when its redundant heading was discarded', () => {
    const p=prepared();
    const incoming={...structuredClone(p),concepts:p.concepts.filter(c=>['problem','reversal'].includes(c.id)),relationships:p.relationships.filter(r=>r.kind==='comparison')};
    const next=applyLiveScene({...createCanvasState(p),live:true},incoming);
    expect(next.view).toBe('comparison');
    expect(next.boardIds).toHaveLength(2);
    expect(getComposition(next)).toHaveLength(2);
  });
  it('replaces provisional local material with its refinement instead of duplicating it', () => {
    const p=prepared();
    let next=applyLiveScene({...createCanvasState(p),live:true},scene(p),'instant');
    expect(next.provisionalIds).toHaveLength(1);
    const refined=scene(p);refined.concepts[0].title='A refined mechanism';
    next=applyLiveScene(next,refined,'refined');
    expect(getComposition(next)).toHaveLength(1);
    expect(next.provisionalIds).toEqual([]);
    expect(next.project.concepts.filter(c=>c.id.startsWith('live-'))).toHaveLength(1);
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
