/** Browser-test-only harness. Not imported by the production entry. */
import { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { FollowCanvas } from '../FollowCanvas';
import { applyAction, createCanvasState } from '../applyAction';
import { createVisualActionScheduler } from '../camera';
import { exampleProject } from '../fixtures/project';
import type { ActionOrigin, CanvasAction } from '../domain';
declare global { interface Window { followCameraProbe: (action: CanvasAction, origin: ActionOrigin) => void } }
function Probe() {
  const [state, setState] = useState(() => createCanvasState(exampleProject));
  const [origin, setOrigin] = useState<ActionOrigin>('automatic');
  const scheduler = useMemo(() => createVisualActionScheduler((action, nextOrigin) => {
    setOrigin(nextOrigin); setState(s => applyAction(s, action));
  }), []);
  useEffect(() => () => scheduler.dispose(), [scheduler]);
  window.followCameraProbe = (action, nextOrigin) => scheduler.submit(action, nextOrigin);
  return <FollowCanvas state={state} mode="audience" cameraOrigin={origin}/>;
}
export function mountCameraProbe() {
  const el = document.createElement('div'); el.id = 'camera-probe';
  Object.assign(el.style, { position: 'fixed', inset: '0', zIndex: '1000' });
  document.body.append(el); createRoot(el).render(<Probe/>);
}
