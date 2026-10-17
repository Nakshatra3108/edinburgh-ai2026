import type { CanvasProject, CanvasState, Concept } from '../canvas/domain';
import { applyAction } from '../canvas/applyAction';
import { parseCanvasProject } from '../canvas/manifest';

// Keep a bounded history on one canvas. A fresh explanation adds visual
// elements; it never advances a slide index or replaces the knowledge base.
export function applyLiveScene(state: CanvasState, incoming: CanvasProject): CanvasState {
  const scene = parseCanvasProject(incoming);
  const pages = state.project.knowledgeBase?.pages;
  if (!pages || scene.source.sha256 !== state.project.source.sha256) throw new Error('This visual belongs to another document.');
  for (const c of scene.concepts) {
    const refs = [...c.sources, ...c.details.flatMap(d => d.sources), ...(c.visual.type === 'metric' ? [c.visual.valueSource] : [])];
    if (!c.sources.length || c.details.some(d => !d.sources.length || d.origin !== 'source')) throw new Error('This visual has no source evidence.');
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
  const focus = concepts.find(c => c.visual.type === 'comparison') ?? concepts.find(c => c.visual.type === 'process' || c.visual.type === 'metric') ?? concepts[0];
  if (!focus) return state;
  next = applyAction(next, { type: 'FOCUS', conceptId: focus.id });
  // These points were composed specifically for the current spoken explanation.
  // Show them without requiring a second click; future facts are not preloaded.
  const visibleIds = next.pair ?? [focus.id];
  for (const c of concepts.filter(c => visibleIds.includes(c.id))) {
    next = { ...next, revealed: { ...next.revealed, [c.id]: c.details.map(d => d.id) } };
  }
  return { ...next, revision: next.revision + 1 };
}
