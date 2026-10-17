import type { CanvasProject, CanvasState, Concept } from '../canvas/domain';
import { applyAction } from '../canvas/applyAction';
import { defaultResolveAsset } from '../canvas/assets';
import { parseCanvasProject } from '../canvas/manifest';

// Keep a bounded history on one canvas. A fresh explanation adds visual
// elements; it never advances a slide index or replaces the knowledge base.
export function applyLiveScene(state: CanvasState, incoming: CanvasProject): CanvasState {
  const scene = parseCanvasProject(incoming);
  const pages = state.project.knowledgeBase?.pages;
  if (!pages || scene.source.sha256 !== state.project.source.sha256) throw new Error('This visual belongs to another document.');
  for (const c of scene.concepts) {
    const refs = [...c.sources, ...c.details.flatMap(d => d.sources), ...(c.visual.type === 'metric' ? [c.visual.valueSource] : [])];
    const v=c.visual;
    const localLink=v.type==='figure'?state.project.knowledgeBase?.figures?.find(f=>f.assetId===v.assetId&&f.enabled):undefined;
    const asset=localLink?state.project.assets.find(a=>a.id===localLink.assetId):undefined;
    // A locally labelled original image needs page/pixel provenance, not invented OCR quotes.
    // Only our exact catalog entry may take this route; generated text still requires evidence.
    const originalFigure=localLink&&asset&&defaultResolveAsset(asset)&&c.id===`source-${asset.id}`.slice(0,120)&&c.title===localLink.label.slice(0,64)&&c.summary===(localLink.caption||localLink.label).slice(0,180)&&v.type==='figure'&&v.caption===(localLink.caption||localLink.label).slice(0,120)&&c.details.length===0;
    if ((!c.sources.length && !originalFigure) || c.details.some(d => !d.sources.length || d.origin !== 'source')) throw new Error('This visual has no source evidence.');
    for (const ref of refs) {
      if (pages.find(p => p.page === ref.page)?.text.slice(ref.start, ref.end) !== ref.quote) throw new Error('A visual quote does not match the knowledge base.');
    }
  }
  for (const r of scene.relationships) {
    if (!r.sources.length || r.sources.some(ref => pages.find(p => p.page === ref.page)?.text.slice(ref.start, ref.end) !== ref.quote)) throw new Error('A connection has no matching source evidence.');
  }
  // Content-addressed IDs reuse exact repeated explanations and preserve their anchors.
  let hash = 2166136261;
  for (const char of JSON.stringify([scene.concepts, scene.relationships])) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  const prefix = `live-${(hash >>> 0).toString(36)}-`;
  const id = (value: string) => {
    let suffix = 2166136261;
    for (const char of value) suffix = Math.imul(suffix ^ char.charCodeAt(0), 16777619);
    return `${prefix}${value.slice(0, 60)}-${(suffix >>> 0).toString(36)}`;
  };
  const occupied = new Set(state.project.concepts.filter(c => state.introduced.includes(c.id)).map(c => `${c.position.x},${c.position.y}`));
  let slot = 0;
  const anchor = () => {
    while (occupied.has(`${80 + (slot % 3) * 1170},${120 + Math.floor(slot / 3) * 920}`)) slot++;
    const position = { x: 80 + (slot % 3) * 1170, y: 120 + Math.floor(slot / 3) * 920 };
    occupied.add(`${position.x},${position.y}`); slot++; return position;
  };
  const concepts: Concept[] = scene.concepts.map(c => {
    const old = state.project.concepts.find(x => x.id === id(c.id));
    return { ...c, id: id(c.id), review: 'source-checked',
      position: old?.position ?? anchor(),
      visual: c.visual.type === 'comparison' ? { ...c.visual, leftId: id(c.visual.leftId), rightId: id(c.visual.rightId), relationshipId: id(c.visual.relationshipId) } : c.visual,
    };
  });
  const newIds = new Set(concepts.map(c => c.id));
  const kept = [...state.project.concepts.filter(c => !newIds.has(c.id)), ...concepts].slice(-24);
  const keptIds = new Set(kept.map(c => c.id));
  const relationships = [...state.project.relationships.filter(r => !r.id.startsWith(prefix)), ...scene.relationships.map(r => ({ ...r, id: id(r.id), from: id(r.from), to: id(r.to) }))]
    .filter(r => keptIds.has(r.from) && keptIds.has(r.to)).slice(-100);
  const revision = state.project.revision + 1;
  let next: CanvasState = { ...state, live: true, project: { ...state.project, concepts: kept, relationships, revision, approvedRevision: null },
    introduced: [...new Set([...state.introduced, ...newIds])].filter(x => keptIds.has(x)),
    revealed: Object.fromEntries(Object.entries(state.revealed).filter(([key]) => keptIds.has(key))),
    connected: state.connected.filter(key => relationships.some(r => r.id === key)),
  };
  const focus = concepts.find(c => c.visual.type === 'comparison') ?? concepts.find(c => c.visual.type === 'process' || c.visual.type === 'metric') ?? concepts.find(c => c.visual.type !== 'figure') ?? concepts[0];
  if (!focus) return state;
  next = applyAction(next, { type: 'FOCUS', conceptId: focus.id });
  // A verified contrast is sufficient even if a redundant comparison heading was
  // removed by grounding. The two evidenced sides determine the composition.
  const contrast = relationships.find(r => r.approved && r.kind === 'comparison' && newIds.has(r.from) && newIds.has(r.to));
  if (contrast) next = applyAction(next, { type:'COMPARE', leftId:contrast.from, rightId:contrast.to });
  // These points were composed specifically for the current spoken explanation.
  // Show them without requiring a second click; future facts are not preloaded.
  const visibleIds = next.pair ?? [focus.id];
  for (const c of concepts.filter(c => visibleIds.includes(c.id))) {
    next = { ...next, revealed: { ...next.revealed, [c.id]: c.details.map(d => d.id) } };
  }
  // Keep the current explanation and up to two recent elements together. A comparison
  // is represented by its two sides, rather than a redundant third title card.
  const current = concepts.filter(c => c.visual.type !== 'comparison').map(c => c.id);
  const prior = (state.boardIds ?? state.introduced).filter(key => !current.includes(key) && keptIds.has(key)
    && kept.find(c => c.id === key)?.visual.type !== 'comparison');
  const remaining = Math.max(0, 3 - current.length);
  const boardIds = next.pair ? [...next.pair] : [...(remaining ? prior.slice(-remaining) : []), ...current].slice(-3);
  for (const c of concepts) next.revealed[c.id] = c.details.map(d => d.id);
  return { ...next, boardIds, revision: next.revision + 1 };
}
