import { useCallback, useState } from 'react';
import { applyAction, createCanvasState } from '../canvas/applyAction';
import type { CanvasAction, CanvasProject, CanvasState, Concept } from '../canvas/domain';
import { exampleProject } from '../canvas/fixtures/project';
import { AudienceScreen } from '../screens/AudienceScreen';
import { StartScreen } from '../screens/StartScreen';
import { SourceScreen } from '../screens/SourceScreen';
import { demoProject } from './demoProject';
import type { ExtractedSource } from '../pdf/extract';
import { StudioScreen } from '../screens/StudioScreen';
import { useReducedMotion } from './useReducedMotion';
export function App() {
  const [screen, setScreen] = useState<'start' | 'source' | 'studio' | 'audience'>(() => new URLSearchParams(location.search).get('screen') === 'audience' ? 'audience' : 'start');
  const [source, setSource] = useState<ExtractedSource | null>(null);
  const [state, setState] = useState<CanvasState>(() => createCanvasState(exampleProject));
  const [illustrative, setIllustrative] = useState(true);
  const [held, setHeld] = useState(false); const [lastAction, setLastAction] = useState('Ready');
  const { reducedMotion, system, setExplicit } = useReducedMotion();
  const onAction = useCallback((action: CanvasAction) => {
    setState(s => applyAction(s, action)); setHeld(action.type === 'HOLD'); setLastAction(action.type);
  }, []);
  const onConceptEdit = useCallback((id: string, patch: Partial<Concept>) => {
    setState(s => {
      const project = { ...s.project, revision: s.project.revision + 1, approvedRevision: null,
        concepts: s.project.concepts.map(c => c.id === id ? { ...c, ...patch } : c) };
      // Stop showing edited material until explicitly reviewed; D keeps the prior approved runtime in integration.
      return { ...applyAction(s, { type: 'OVERVIEW' }), project, revision: s.revision + 1 };
    });
  }, []);
  const onPositionChange = useCallback((id: string, position: { x: number; y: number }) => {
    setState(s => ({ ...s, project: { ...s.project, concepts: s.project.concepts.map(c => c.id === id ? { ...c, position } : c) } }));
  }, []);
  const open = (project: CanvasProject, example: boolean) => { setState(createCanvasState(project)); setIllustrative(example); setHeld(false); setScreen('studio'); };
  if (screen === 'start') return <StartScreen onOpen={open} onSource={s => { setSource(s); setScreen('source'); }} reducedMotion={reducedMotion}/>;
  if (screen === 'source' && source) return <SourceScreen source={source} onBack={() => setScreen('start')} onOpenProject={p => open(p, false)} onOpenDemo={() => open(demoProject, false)}/>;
  if (screen === 'audience') return <AudienceScreen state={state} reducedMotion={reducedMotion} onExit={() => setScreen('studio')} contentLabel={illustrative ? 'Illustrative example · manually controlled' : undefined}/>;
  return <StudioScreen state={state} onAction={onAction} onConceptEdit={onConceptEdit} onPositionChange={onPositionChange}
    onReset={() => { setState(s => createCanvasState(s.project)); setHeld(false); setLastAction('Reset'); }}
    onBack={() => setScreen('start')} onAudience={() => setScreen('audience')}
    reducedMotion={reducedMotion} systemReduced={system} onReducedMotion={setExplicit}
    illustrative={illustrative} held={held} lastAction={lastAction}/>;
}
