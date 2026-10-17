import type { CanvasState, Concept } from './domain';
export type CompositionItem = { id: string; concept: Concept; x: number; y: number; width: number; height: number; expanded: boolean; home?: boolean };
export function getComposition(state: CanvasState): CompositionItem[] {
  if (state.live && state.boardIds?.length && state.view !== 'overview') {
    const ids = state.boardIds;
    const current = state.focusId && ids.includes(state.focusId) ? state.focusId : ids.at(-1)!;
    const ordered = state.pair ? [...ids] : [current, ...ids.filter(id => id !== current)];
    const concepts = ordered.flatMap(id => { const c = state.project.concepts.find(c => c.id === id && c.enabled); return c ? [c] : []; });
    return concepts.map((c, i) => {
      const pair = !!state.pair;
      const single = concepts.length === 1;
      const width = single ? 1280 : pair ? 850 : i === 0 ? 1100 : 660;
      const dense = concepts.some(c => c.details.some(d => d.text.length > 100) || c.details.length > 3 || c.title.length > 50);
      const fullHeight = dense || concepts.some(c => c.visual.type === 'figure' || c.visual.type === 'metric') ? 780 : 620;
      const height = pair || single || i === 0 || concepts.length === 2 ? fullHeight : (fullHeight - 40) / 2;
      return { id: c.id, concept: c, x: i === 0 ? 0 : pair ? 950 : 1180,
        y: i < 2 ? 0 : (fullHeight + 40) / 2, width, height, expanded: true };
    });
  }
  const pair = state.pair;
  return state.project.concepts.filter(c => c.enabled && (!state.live || state.introduced.includes(c.id))).flatMap(c => {
    const paired = !!pair?.includes(c.id);
    const expanded = state.view !== 'overview' && (c.id === state.focusId || paired);
    const home = { id: c.id, concept: c, x: c.position.x, y: c.position.y, width: 1000, height: expanded ? 800 : 640, expanded };
    if (!paired) return [home];
    // Detail groups move; explicit ghost anchors preserve their home positions.
    return [{ ...home, id: `${c.id}--home`, expanded: false, home: true },
      { ...home, x: 950 + (pair?.indexOf(c.id) ?? 0) * 790, y: 500, width: 720, height: 760 }];
  });
}
export function getCompositionBounds(state: CanvasState) {
  const items = getComposition(state).filter(n => !n.home && (state.view === 'overview' || n.expanded));
  const left = Math.min(...items.map(n => n.x)); const top = Math.min(...items.map(n => n.y));
  const right = Math.max(...items.map(n => n.x + n.width)); const bottom = Math.max(...items.map(n => n.y + n.height));
  return items.length ? { x: left, y: top, width: right - left, height: bottom - top } : { x: 0, y: 0, width: 1000, height: 640 };
}
