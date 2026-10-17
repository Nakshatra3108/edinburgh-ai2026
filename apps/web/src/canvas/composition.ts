import type { CanvasState, Concept } from './domain';
export type CompositionItem = { id: string; concept: Concept; x: number; y: number; width: number; height: number; expanded: boolean; home?: boolean };
export function getComposition(state: CanvasState): CompositionItem[] {
  const pair = state.pair;
  return state.project.concepts.filter(c => c.enabled).flatMap(c => {
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
