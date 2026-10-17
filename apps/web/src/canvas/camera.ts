/** PRD's cubic-bezier(.77, 0, .175, 1), evaluated for React Flow's easing callback. */
export function cameraEase(progress: number): number {
  if (progress <= 0 || progress >= 1) return Math.max(0, Math.min(1, progress));
  let lo = 0; let hi = 1;
  for (let i = 0; i < 14; i++) {
    const t = (lo + hi) / 2; const inv = 1 - t;
    const x = 3 * inv * inv * t * .77 + 3 * inv * t * t * .175 + t * t * t;
    if (x < progress) lo = t; else hi = t;
  }
  const t = (lo + hi) / 2;
  return 3 * (1 - t) * t * t + t * t * t;
}
export const AUTOMATIC_CAMERA_INTERVAL = 2500;

import type { ActionOrigin, CanvasAction } from './domain';
/** Optional integration utility, placed BEFORE applyAction. The committed semantic
 * state remains the single source of truth for studio and audience windows.
 * D must validate policy/epochs/targets before submit, and again before commit.
 * Same-topic REVEAL passes changesFrame=false; cross-topic reveal defaults true. */
export function createVisualActionScheduler(commit: (action: CanvasAction, origin: ActionOrigin) => void) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let lastFrameAt = -Infinity;
  const cancel = () => { if (timer !== undefined) clearTimeout(timer); timer = undefined; };
  return {
    submit(action: CanvasAction, origin: ActionOrigin, changesFrame = true) {
      cancel();
      if (action.type === 'HOLD') { commit(action, origin); return; }
      const run = () => {
        timer = undefined;
        if (changesFrame) lastFrameAt = performance.now();
        commit(action, origin);
      };
      const delay = origin === 'automatic' && changesFrame ? Math.max(0, AUTOMATIC_CAMERA_INTERVAL - (performance.now() - lastFrameAt)) : 0;
      if (delay) timer = setTimeout(run, delay); else run();
    },
    cancel,
    dispose: cancel,
  };
}
