import { describe, expect, it } from 'vitest';
import { applyAction, createCanvasState } from './applyAction';
import { getComposition, getCompositionBounds } from './composition';
import { parseCanvasProject } from './manifest';
import { exampleProject } from './fixtures/project';
import type { CanvasAction } from './domain';
const fresh = () => createCanvasState(structuredClone(exampleProject));
function freeze<T>(obj: T): T { if (obj && typeof obj === 'object') { Object.freeze(obj); for (const value of Object.values(obj)) freeze(value); } return obj; }
describe('canvas action contract', () => {
  it('starts on a content-only overview', () => { expect(fresh()).toMatchObject({ view: 'overview', focusId: null, introduced: [], revealed: {} }); });
  it('is pure on frozen state and project', () => {
    const state = freeze(fresh()); const next = applyAction(state, { type: 'REVEAL', conceptId: 'pipeline', detailId: 'match' });
    expect(next.revealed.pipeline).toEqual(['match']); expect(state.revealed).toEqual({}); expect(next.project).toBe(state.project);
  });
  it('HOLD preserves exactly the last visual', () => { const state = applyAction(fresh(), { type: 'FOCUS', conceptId: 'problem' }); expect(applyAction(state, { type: 'HOLD' })).toBe(state); });
  it.each<CanvasAction>([
    { type: 'FOCUS', conceptId: 'missing' }, { type: 'REVEAL', conceptId: 'pipeline', detailId: 'missing' },
    { type: 'REVEAL', conceptId: 'missing', detailId: 'capture' }, { type: 'CONNECT', relationshipId: 'missing' },
    { type: 'COMPARE', leftId: 'problem', rightId: 'pipeline' }, { type: 'COMPARE', leftId: 'problem', rightId: 'problem' },
    { type: 'COMPARE', leftId: 'missing', rightId: 'closing' },
  ])('ignores invalid target $type', action => { const state = fresh(); expect(applyAction(state, action)).toBe(state); });
  it('rejects disabled concepts and their connections', () => {
    const state = fresh(); state.project.concepts[0].enabled = false;
    expect(applyAction(state, { type: 'FOCUS', conceptId: 'problem' })).toBe(state);
    expect(applyAction(state, { type: 'CONNECT', relationshipId: 'voice' })).toBe(state);
    expect(applyAction(state, { type: 'COMPARE', leftId: 'problem', rightId: 'closing' })).toBe(state);
  });
  it('rejects unreviewed concepts', () => {
    const state = fresh(); state.project.concepts[0].review = 'needs-review';
    expect(applyAction(state, { type: 'FOCUS', conceptId: 'problem' })).toBe(state);
  });
  it('rejects unapproved edges, including comparisons', () => {
    const state = fresh(); state.project.relationships.forEach(r => r.approved = false);
    expect(applyAction(state, { type: 'CONNECT', relationshipId: 'voice' })).toBe(state);
    expect(applyAction(state, { type: 'COMPARE', leftId: 'problem', rightId: 'closing' })).toBe(state);
    expect(applyAction(state, { type: 'FOCUS', conceptId: 'canvas' })).toBe(state);
  });
  it('reveals process steps out of order and keeps them on return', () => {
    let state = applyAction(fresh(), { type: 'REVEAL', conceptId: 'pipeline', detailId: 'compose' });
    state = applyAction(state, { type: 'REVEAL', conceptId: 'pipeline', detailId: 'capture' });
    state = applyAction(state, { type: 'FOCUS', conceptId: 'problem' });
    state = applyAction(state, { type: 'OVERVIEW' });
    state = applyAction(state, { type: 'FOCUS', conceptId: 'pipeline' });
    expect(state.revealed.pipeline).toEqual(['compose', 'capture']); expect(state.highlightedDetailId).toBeNull();
  });
  it('does not duplicate revealed details or re-focus an existing target', () => {
    const state = applyAction(fresh(), { type: 'REVEAL', conceptId: 'pipeline', detailId: 'capture' });
    expect(applyAction(state, { type: 'REVEAL', conceptId: 'pipeline', detailId: 'capture' })).toBe(state);
    expect(applyAction(state, { type: 'FOCUS', conceptId: 'pipeline' })).toBe(state);
  });
  it('introduces both connection endpoints atomically', () => {
    const state = applyAction(fresh(), { type: 'CONNECT', relationshipId: 'voice' });
    expect(state.pair).toEqual(['problem', 'pipeline']); expect(state.introduced).toEqual(['problem', 'pipeline']); expect(state.connected).toEqual(['voice']);
  });
  it('uses an approved comparison for comparison nodes', () => {
    const state = applyAction(fresh(), { type: 'FOCUS', conceptId: 'canvas' });
    expect(state).toMatchObject({ view: 'comparison', pair: ['problem', 'closing'], activeRelationshipId: 'flip' });
    expect(applyAction(fresh(), { type: 'COMPARE', leftId: 'closing', rightId: 'problem' }).pair).toEqual(['closing', 'problem']);
  });
  it('restores home positions after comparison and retains explicit anchors', () => {
    const initial = fresh(); const positions = structuredClone(initial.project.concepts.map(c => c.position));
    const comparison = applyAction(initial, { type: 'COMPARE', leftId: 'problem', rightId: 'closing' });
    expect(getComposition(comparison).filter(n => n.home)).toHaveLength(2);
    const restored = applyAction(comparison, { type: 'OVERVIEW' });
    expect(getComposition(restored).map(n => ({ x: n.x, y: n.y }))).toEqual(positions);
    expect(restored.project.concepts.map(c => c.position)).toEqual(positions);
  });
  it('frames just the active pair, independently of far-away concepts', () => {
    const state = fresh(); state.project.concepts[1].position = { x: 90000, y: 90000 };
    expect(getCompositionBounds(applyAction(state, { type: 'COMPARE', leftId: 'problem', rightId: 'closing' })).width).toBe(1510);
  });
  it('stays bounded under a long mixed action sequence', () => {
    let state = fresh();
    for (let i = 0; i < 400; i++) {
      state = applyAction(state, { type: 'REVEAL', conceptId: 'pipeline', detailId: ['capture', 'understand', 'match', 'compose'][i % 4] });
      state = applyAction(state, { type: 'OVERVIEW' });
      state = applyAction(state, { type: 'CONNECT', relationshipId: 'voice' });
    }
    expect(state.revealed.pipeline).toHaveLength(4); expect(state.connected).toHaveLength(1); expect(new Set(state.introduced).size).toBe(state.introduced.length);
  });
});
describe('manifest safety boundary', () => {
  it('accepts the illustrative fixture without claiming PDF provenance', () => { expect(parseCanvasProject(exampleProject).concepts).toHaveLength(6); expect(exampleProject.source.name).toContain('not a source PDF'); });
  it.each(['duplicate-id', 'missing-endpoint', 'missing-figure', 'missing-step', 'unapproved-pair', 'invalid-crop', 'bad-source', 'bad-position'])('rejects %s', kind => {
    const project = structuredClone(exampleProject);
    if (kind === 'duplicate-id') project.concepts[1].id = project.concepts[0].id;
    if (kind === 'missing-endpoint') project.relationships[0].from = 'missing';
    if (kind === 'missing-figure') project.assets = [];
    if (kind === 'missing-step' && project.concepts[1].visual.type === 'process') project.concepts[1].visual.stepDetailIds[0] = 'missing';
    if (kind === 'unapproved-pair') project.relationships.find(r => r.id === 'flip')!.approved = false;
    if (kind === 'invalid-crop') project.assets[0].crop = { x: .9, y: 0, width: .5, height: 1 };
    if (kind === 'bad-source' && project.concepts[2].visual.type === 'metric') project.concepts[2].visual.valueSource.end = 900;
    if (kind === 'bad-position') project.concepts[0].position.x = Infinity;
    expect(() => parseCanvasProject(project)).toThrow();
  });
});

import { cameraEase } from './camera';
import { defaultResolveAsset } from './assets';
describe('camera and local assets', () => {
  it('uses a monotonic bounded camera easing with exact endpoints', () => {
    let previous = 0;
    for (let i = 0; i <= 100; i++) { const next = cameraEase(i / 100); expect(next).toBeGreaterThanOrEqual(previous); expect(next).toBeLessThanOrEqual(1); previous = next; }
    expect(cameraEase(0)).toBe(0); expect(cameraEase(1)).toBe(1);
  });
  it('never resolves arbitrary storage keys into network requests', () => {
    const asset = exampleProject.assets[0]; expect(defaultResolveAsset(asset)).toBe('/examples/architecture.svg');
    for (const blobKey of ['https://example.com/image.png', '//example.com/image.png', '/examples/../api/key', 'blob:unknown', 'indexeddb-key']) expect(defaultResolveAsset({ ...asset, blobKey })).toBeUndefined();
  });
});
