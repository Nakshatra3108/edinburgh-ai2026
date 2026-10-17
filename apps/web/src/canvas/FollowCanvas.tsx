import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Background, BackgroundVariant, ReactFlow, ReactFlowProvider, getViewportForBounds, useReactFlow, type Edge, type NodeChange } from '@xyflow/react';
import { Scan, LockKeyhole, UnlockKeyhole, Minus, Plus } from 'lucide-react';
import type { CanvasAction, CanvasState, Asset } from './domain';
import { getComposition, getCompositionBounds } from './composition';
import { NODE_TYPES, type FollowNode } from './nodes';
import { defaultResolveAsset } from './assets';
import { cameraEase } from './camera';
export type FollowCanvasProps = {
  state: CanvasState;
  mode?: 'studio' | 'preview' | 'audience';
  reducedMotion?: boolean;
  /** Manual actions are emitted; controller ownership and automatic cadence stay upstream. */
  onAction?: (action: CanvasAction) => void;
  onPositionChange?: (conceptId: string, position: { x: number; y: number }) => void;
  resolveAsset?: (asset: Asset) => string | undefined;
  cameraOrigin?: 'manual' | 'automatic';
};
const EMPTY: string[] = [];
function CanvasInner({ state, mode = 'studio', reducedMotion = false, onAction, onPositionChange, resolveAsset = defaultResolveAsset, cameraOrigin = 'manual' }: FollowCanvasProps) {
  const ref = useRef<HTMLDivElement>(null);
  const flow = useReactFlow<FollowNode>();
  const [ready, setReady] = useState(false);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [locked, setLocked] = useState(true);
  const [zoom, setZoom] = useState(1);
  const [dragPositions, setDragPositions] = useState<Record<string, { x: number; y: number }>>({});
  const [cameraRequest, setCameraRequest] = useState(0);
  const renderState = useMemo(() => mode === 'audience' ? { ...state, project: { ...state.project, concepts: state.project.concepts.filter(c => c.review !== 'needs-review') } } : state, [mode, state]);
  const scene = useMemo(() => getComposition(renderState), [renderState]);
  const lastCamera = useRef({ key: '', at: -Infinity });
  const nodes = useMemo<FollowNode[]>(() => scene.map(item => ({
    id: item.id, type: item.concept.visual.type, hidden: state.view !== 'overview' && !item.expanded, position: dragPositions[item.id] ?? { x: item.x, y: item.y },
    width: item.width, height: item.height, style: { width: item.width, height: item.height },
    draggable: !locked && mode === 'studio' && state.view === 'overview' && !item.home,
    selectable: false, focusable: mode === 'studio' && !item.home,
    ariaLabel: `${item.concept.title}, ${item.concept.visual.type}. Press Enter to focus.`,
    data: { concept: item.concept, expanded: item.expanded, paired: !!state.pair?.includes(item.concept.id), home: !!item.home,
      board: !!(state.live && state.boardIds?.length && state.view !== 'overview'), compact: item.height < 500,
      introduced: state.introduced.includes(item.concept.id), revealed: state.revealed[item.concept.id] ?? EMPTY,
      highlightedDetailId: state.highlightedDetailId,
      ...(item.concept.visual.type === 'figure' ? (() => {
        const id = item.concept.visual.assetId; const asset = state.project.assets.find(a => a.id === id);
        return { asset, assetUrl: asset ? resolveAsset(asset) : undefined };
      })() : {}) },
  })), [scene, state, locked, mode, resolveAsset, dragPositions]);
  const edges = useMemo<Edge[]>(() => state.project.relationships.filter(r => r.approved && nodes.some(n => n.id === r.from) && nodes.some(n => n.id === r.to)).map(r => ({
    id: r.id, source: r.from, target: r.to, type: 'smoothstep', focusable: false, selectable: false,
    hidden: state.view !== 'overview' && !(state.live && state.boardIds?.includes(r.from) && state.boardIds.includes(r.to)) && r.id !== state.activeRelationshipId,
    label: undefined, ariaLabel: r.label,
    className: r.id === state.activeRelationshipId || state.connected.includes(r.id) ? 'edge-active' : 'edge-context',
    style: { strokeWidth: r.id === state.activeRelationshipId ? 4 : 3 },
    labelStyle: { fill: 'var(--text-secondary)', fontSize: 28 },
    labelBgStyle: { fill: 'var(--canvas)' }, labelBgPadding: [12, 10],
  })), [state, nodes]);
  useEffect(() => {
    if (!ref.current) return;
    let timer: ReturnType<typeof setTimeout>;
    const observer = new ResizeObserver(entries => {
      const { width, height } = entries[0].contentRect;
      clearTimeout(timer); timer = setTimeout(() => setSize({ width, height }), 100);
    });
    observer.observe(ref.current);
    return () => { observer.disconnect(); clearTimeout(timer); };
  }, []);
  // Semantic framing, computed independently for each viewport. New destinations interrupt old ones.
  useEffect(() => {
    if (!ready || !size.width || !size.height) return;
    const bounds = getCompositionBounds(renderState);
    const key = JSON.stringify([bounds, size, cameraRequest]);
    if (lastCamera.current.key === key) return;
    // Keep the composition label and studio toolbar outside the fitted content.
    const topInset = state.pair ? (mode === 'studio' ? 64 : 32) : 0;
    const bottomInset = mode === 'studio' ? 76 : 0;
    const viewport = getViewportForBounds(bounds, size.width, Math.max(80, size.height - topInset - bottomInset), 0.01, 1.4, 0.12);
    viewport.y += topInset;
    const commit = () => {
      lastCamera.current = { key, at: performance.now() };
      void flow.setViewport(viewport, { duration: reducedMotion || cameraOrigin === 'manual' ? 0 : 280, ease: cameraEase });
    };
    commit();
  }, [ready, size, renderState, flow, reducedMotion, cameraOrigin, cameraRequest, mode, state.pair]);
  const positionChange = useCallback((changes: NodeChange<FollowNode>[]) => {
    changes.forEach(c => {
      if (c.type !== 'position' || !c.position) return;
      const position = c.position;
      setDragPositions(p => ({ ...p, [c.id]: position }));
      if (c.dragging === false) { onPositionChange?.(c.id, position); setDragPositions(p => { const next = { ...p }; delete next[c.id]; return next; }); }
    });
  }, [onPositionChange]);
  const topic = state.focusId ? state.project.concepts.find(c => c.id === state.focusId)?.title : state.view === 'comparison' ? 'Comparison' : state.view === 'connection' ? 'Connected ideas' : 'Canvas overview';
  return <div ref={ref} className={`follow-canvas ${state.live && state.boardIds?.length && state.view !== 'overview' ? 'canvas-board' : ''} canvas-${mode} ${reducedMotion ? 'reduced-motion' : ''}`} data-view={state.view} onKeyDown={event => {
      if (mode === 'audience' || event.key !== 'Enter') return;
      const id = (event.target as HTMLElement).closest<HTMLElement>('.react-flow__node')?.dataset.id;
      const node = nodes.find(n => n.id === id);
      if (node && !node.data.home) { event.preventDefault(); onAction?.({ type: 'FOCUS', conceptId: node.data.concept.id }); }
    }}>
    <ReactFlow<FollowNode> nodes={nodes} edges={edges} nodeTypes={NODE_TYPES} onInit={() => setReady(true)}
      onNodesChange={positionChange}
      onNodeClick={mode === 'audience' ? undefined : (_, n) => onAction?.({ type: 'FOCUS', conceptId: n.data.concept.id })}
      onMove={(_, viewport) => setZoom(viewport.zoom)} minZoom={0.01} maxZoom={1.4}
      nodesConnectable={false} elementsSelectable={false} nodesDraggable={!locked && mode === 'studio'}
      panOnDrag={mode === 'studio'} zoomOnScroll={mode === 'studio'} zoomOnPinch={mode === 'studio'} zoomOnDoubleClick={false}
      preventScrolling={mode === 'studio'} deleteKeyCode={null} colorMode="light"
      ariaLabelConfig={{ 'controls.zoomIn.ariaLabel': 'Zoom into canvas', 'controls.zoomOut.ariaLabel': 'Zoom out of canvas' }}>
      {mode === 'studio' && <Background variant={BackgroundVariant.Dots} color="var(--line)" gap={32} size={1}/>}
    </ReactFlow>
    {(state.view === 'comparison' || state.view === 'connection') && <div className="composition-label">{state.project.relationships.find(r => r.id === state.activeRelationshipId)?.label}</div>}
    {mode === 'studio' && <div className="canvas-toolbar" aria-label="Canvas view controls">
      <button onClick={() => { onAction?.({ type: 'OVERVIEW' }); setCameraRequest(v => v + 1); }}><Scan size={16}/>Overview</button><span className="toolbar-divider"/>
      <button aria-label="Zoom out" onClick={() => void flow.zoomOut({ duration: 0 })}><Minus size={16}/></button><span className="zoom-value">{Math.round(zoom * 100)}%</span><button aria-label="Zoom in" onClick={() => void flow.zoomIn({ duration: 0 })}><Plus size={16}/></button><span className="toolbar-divider"/>
      <button onClick={() => setLocked(v => !v)} aria-pressed={locked} title={state.view !== 'overview' ? 'Return to overview before rearranging' : 'Lock or unlock home positions'}>{locked ? <LockKeyhole size={16}/> : <UnlockKeyhole size={16}/>}<span>{locked ? 'Layout locked' : 'Rearrange'}</span></button>
    </div>}
    {scene.length === 0 && <div className="canvas-empty" role="status"><p>{state.live ? 'Your words build the canvas.' : mode === 'audience' ? 'No reviewed content is ready.' : 'No enabled concepts.'}</p>{mode === 'studio' && <span>{state.live ? 'Start listening or type an explanation. Visuals appear as you speak.' : 'Re-enable a concept in the concept rail to restore the map.'}</span>}</div>}
    <p className="sr-only" role="status" aria-live="polite">{topic}</p>
  </div>;
}
export function FollowCanvas(props: FollowCanvasProps) { return <ReactFlowProvider><CanvasInner {...props}/></ReactFlowProvider>; }
