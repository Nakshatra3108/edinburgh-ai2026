import type { CanvasAction, CanvasProject, CanvasState, Concept } from './domain';
export function createCanvasState(project: CanvasProject): CanvasState {
  return { project, view: 'overview', focusId: null, pair: null,
    activeRelationshipId: null, introduced: [], revealed: {}, connected: [],
    highlightedDetailId: null, revision: 0 };
}
const union = (values: string[], ...ids: string[]) => [...new Set([...values, ...ids])];
const available = (state: CanvasState, id: string): Concept | undefined =>
  state.project.concepts.find(c => c.id === id && c.enabled && c.review === 'reviewed');
function compare(state: CanvasState, leftId: string, rightId: string, relationshipId?: string): CanvasState {
  if (leftId === rightId || !available(state, leftId) || !available(state, rightId)) return state;
  const edge = state.project.relationships.find(r => r.approved && r.kind === 'comparison'
    && (!relationshipId || r.id === relationshipId)
    && ((r.from === leftId && r.to === rightId) || (r.from === rightId && r.to === leftId)));
  if (!edge) return state;
  if (state.view === 'comparison' && state.pair?.[0] === leftId && state.pair[1] === rightId) return state;
  return { ...state, view: 'comparison', pair: [leftId, rightId], focusId: null,
    activeRelationshipId: edge.id, introduced: union(state.introduced, leftId, rightId),
    highlightedDetailId: null, revision: state.revision + 1 };
}
/** Pure, total reducer: invalid/unapproved targets and HOLD preserve object identity.
 * Policy, epoch rejection, manual hold, and automatic cadence belong to D's controller. */
export function applyAction(state: CanvasState, action: CanvasAction): CanvasState {
  switch (action.type) {
    case 'HOLD': return state;
    case 'OVERVIEW':
      if (state.view === 'overview') return state;
      return { ...state, view: 'overview', focusId: null, pair: null,
        activeRelationshipId: null, highlightedDetailId: null, revision: state.revision + 1 };
    case 'FOCUS': {
      const concept = available(state, action.conceptId);
      if (!concept) return state;
      if (concept.visual.type === 'comparison') {
        const v = concept.visual;
        return compare(state, v.leftId, v.rightId, v.relationshipId);
      }
      if (state.view === 'focus' && state.focusId === concept.id) return state;
      return { ...state, view: 'focus', focusId: concept.id, pair: null,
        activeRelationshipId: null, highlightedDetailId: null,
        introduced: union(state.introduced, concept.id), revision: state.revision + 1 };
    }
    case 'REVEAL': {
      const concept = available(state, action.conceptId);
      if (!concept || concept.visual.type === 'comparison' || !concept.details.some(d => d.id === action.detailId)) return state;
      const focused = applyAction(state, { type: 'FOCUS', conceptId: concept.id });
      if (focused.revealed[concept.id]?.includes(action.detailId) && focused.highlightedDetailId === action.detailId) return focused;
      return { ...focused, revealed: { ...focused.revealed,
        [concept.id]: union(focused.revealed[concept.id] ?? [], action.detailId) },
        highlightedDetailId: action.detailId, revision: state.revision + 1 };
    }
    case 'CONNECT': {
      const edge = state.project.relationships.find(r => r.id === action.relationshipId && r.approved);
      if (!edge || edge.from === edge.to || !available(state, edge.from) || !available(state, edge.to)) return state;
      if (state.view === 'connection' && state.activeRelationshipId === edge.id) return state;
      return { ...state, view: 'connection', focusId: null, pair: [edge.from, edge.to],
        activeRelationshipId: edge.id, introduced: union(state.introduced, edge.from, edge.to),
        connected: union(state.connected, edge.id), highlightedDetailId: null, revision: state.revision + 1 };
    }
    case 'COMPARE': return compare(state, action.leftId, action.rightId);
    default: return state;
  }
}
