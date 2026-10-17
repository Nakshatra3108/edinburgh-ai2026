import { useState } from 'react';
import { ChevronDown, ChevronRight, Focus, GitCompareArrows, Link2, Pause, Scan, Sparkles } from 'lucide-react';
import type { CanvasAction, CanvasState } from './domain';
export function CanvasDebugPanel({ state, onAction }: { state: CanvasState; onAction: (action: CanvasAction) => void }) {
  const [open, setOpen] = useState(false);
  const concepts = state.project.concepts.filter(c => c.enabled && c.review === 'reviewed');
  const [selection, setSelection] = useState(concepts[0]?.id ?? '');
  const selected = concepts.find(c => c.id === selection) ?? concepts[0];
  const [relationshipId, setRelationshipId] = useState(state.project.relationships.find(r => r.approved)?.id ?? '');
  const comparisons = state.project.relationships.filter(r => r.approved && r.kind === 'comparison');
  const [pairId, setPairId] = useState(comparisons[0]?.id ?? '');
  const comparison = comparisons.find(r => r.id === pairId);
  return <section className="debug-panel">
    <button className="debug-toggle" onClick={() => setOpen(v => !v)} aria-expanded={open}>{open ? <ChevronDown size={16}/> : <ChevronRight size={16}/>}Action laboratory<span>Manual</span></button>
    {open && <div className="debug-body"><p>Trigger renderer actions directly. No AI or microphone is running in this preview.</p>
      <label>Concept<select value={selected?.id ?? ''} onChange={e => setSelection(e.target.value)}>{concepts.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}</select></label>
      <button disabled={!selected} onClick={() => selected && onAction({ type: 'FOCUS', conceptId: selected.id })}><Focus size={16}/>FOCUS</button>
      {selected && selected.visual.type !== 'comparison' && selected.details.map(d => <button key={d.id} className="reveal-debug" onClick={() => onAction({ type: 'REVEAL', conceptId: selected.id, detailId: d.id })}><Sparkles size={14}/><span>REVEAL · {d.text}</span>{state.revealed[selected.id]?.includes(d.id) && <span className="status-check">Shown</span>}</button>)}
      <label>Approved relationship<select value={relationshipId} onChange={e => setRelationshipId(e.target.value)}>{state.project.relationships.filter(r => r.approved).map(r => <option key={r.id} value={r.id}>{r.label}</option>)}</select></label>
      <button disabled={!relationshipId} onClick={() => onAction({ type: 'CONNECT', relationshipId })}><Link2 size={16}/>CONNECT</button>
      <label>Approved comparison<select value={pairId} onChange={e => setPairId(e.target.value)}>{comparisons.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}</select></label>
      <button disabled={!comparison} onClick={() => comparison && onAction({ type: 'COMPARE', leftId: comparison.from, rightId: comparison.to })}><GitCompareArrows size={16}/>COMPARE</button>
      <div className="button-row"><button onClick={() => onAction({ type: 'OVERVIEW' })}><Scan size={16}/>OVERVIEW</button><button onClick={() => onAction({ type: 'HOLD' })}><Pause size={16}/>HOLD</button></div>
    </div>}
  </section>;
}
