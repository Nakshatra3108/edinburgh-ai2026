import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createVisualActionScheduler } from './camera';
import { createCanvasState, applyAction } from './applyAction';
import { exampleProject } from './fixtures/project';
describe('visual action scheduling before semantic commit', () => {
  beforeEach(() => vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] }));
  afterEach(() => vi.useRealTimers());
  it('coalesces a burst into the newest destination after 2.5 seconds', () => {
    const commit = vi.fn(); const queue = createVisualActionScheduler(commit);
    queue.submit({ type: 'FOCUS', conceptId: 'problem' }, 'automatic');
    queue.submit({ type: 'FOCUS', conceptId: 'pipeline' }, 'automatic');
    vi.advanceTimersByTime(100);
    queue.submit({ type: 'FOCUS', conceptId: 'closing' }, 'automatic');
    vi.advanceTimersByTime(2399); expect(commit).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1); expect(commit).toHaveBeenLastCalledWith({ type: 'FOCUS', conceptId: 'closing' }, 'automatic');
  });
  it.each(['manual', 'automatic'] as const)('%s HOLD cancels a pending destination and preserves the actual committed visual', origin => {
    let state = createCanvasState(exampleProject);
    const queue = createVisualActionScheduler(action => { state = applyAction(state, action); });
    queue.submit({ type: 'FOCUS', conceptId: 'problem' }, 'automatic'); const shown = state;
    queue.submit({ type: 'FOCUS', conceptId: 'pipeline' }, 'automatic');
    queue.submit({ type: 'HOLD' }, origin); vi.advanceTimersByTime(5000);
    expect(state).toBe(shown); expect(state.focusId).toBe('problem');
  });
  it('manual focus cancels stale automatic work without waiting', () => {
    const commit = vi.fn(); const queue = createVisualActionScheduler(commit);
    queue.submit({ type: 'FOCUS', conceptId: 'problem' }, 'automatic');
    queue.submit({ type: 'FOCUS', conceptId: 'pipeline' }, 'automatic');
    queue.submit({ type: 'OVERVIEW' }, 'manual'); expect(commit).toHaveBeenCalledTimes(2);
    vi.advanceTimersByTime(5000); expect(commit).toHaveBeenCalledTimes(2);
  });
  it('same-topic reveal is immediate and does not spend a camera interval', () => {
    const commit = vi.fn(); const queue = createVisualActionScheduler(commit);
    queue.submit({ type: 'FOCUS', conceptId: 'pipeline' }, 'automatic'); vi.advanceTimersByTime(2000);
    queue.submit({ type: 'REVEAL', conceptId: 'pipeline', detailId: 'match' }, 'automatic', false);
    expect(commit).toHaveBeenCalledTimes(2);
    queue.submit({ type: 'OVERVIEW' }, 'automatic'); vi.advanceTimersByTime(500);
    expect(commit).toHaveBeenCalledTimes(3);
  });
  it('cancels pending callbacks when a session is disposed', () => {
    const commit = vi.fn(); const queue = createVisualActionScheduler(commit);
    queue.submit({ type: 'FOCUS', conceptId: 'problem' }, 'automatic');
    queue.submit({ type: 'FOCUS', conceptId: 'pipeline' }, 'automatic'); queue.dispose();
    vi.advanceTimersByTime(5000); expect(commit).toHaveBeenCalledTimes(1);
  });
});
