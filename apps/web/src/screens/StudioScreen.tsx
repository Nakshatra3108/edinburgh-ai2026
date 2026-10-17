import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ArrowLeft, ArrowRight, Check, ChevronRight, FileText, GitCompareArrows, Image, Layers2, List, Monitor, PanelLeftClose, PanelLeftOpen, Route, Hash, RotateCcw, Settings2, Sparkles, X } from 'lucide-react';
import { FollowCanvas } from '../canvas/FollowCanvas';
import { CanvasDebugPanel } from '../canvas/CanvasDebugPanel';
import type { CanvasAction, CanvasState, Concept } from '../canvas/domain';
import { Wordmark } from '../preview/Wordmark';
const ICONS = { concept: Layers2, process: Route, metric: Hash, figure: Image, comparison: GitCompareArrows };
type Tab = 'Content' | 'Connections' | 'Cues' | 'Appearance' | 'Source';
type StudioProps = {
  state: CanvasState; onAction: (action: CanvasAction) => void;
  onConceptEdit: (id: string, patch: Partial<Concept>) => void;
  onPositionChange: (id: string, position: { x: number; y: number }) => void;
  onReset: () => void; onBack: () => void; onAudience: () => void;
  reducedMotion: boolean; systemReduced: boolean; onReducedMotion: (value: boolean) => void;
  illustrative: boolean; held: boolean; lastAction: string;
};
function ContentEditor({ concept, onEdit }: { concept: Concept; onEdit: (patch: Partial<Concept>) => void }) {
  const [title, setTitle] = useState(concept.title); const [summary, setSummary] = useState(concept.summary);
  const [points, setPoints] = useState(concept.details.map(d => d.text)); const [error, setError] = useState('');
  const save = (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !summary.trim() || points.some(p => !p.trim())) { setError('Titles, summaries, and points cannot be empty.'); return; }
    if (concept.visual.type === 'process' && points.some(p => p.length > 40)) { setError('Process labels must be 40 characters or fewer.'); return; }
    setError(''); onEdit({ title: title.trim(), summary: summary.trim(), details: concept.details.map((d, i) => ({ ...d, text: points[i].trim(), origin: 'user', sources: [] })), review: 'needs-review' });
  };
  return <form className="inspector-form" onSubmit={save}><label>Title<span className="field-count">{title.length}/64</span><input maxLength={64} value={title} onChange={e => setTitle(e.target.value)}/></label><label>Summary<textarea maxLength={180} value={summary} onChange={e => setSummary(e.target.value)}/></label>
    {concept.details.length > 0 && <div className="detail-editors"><h3>Supporting points</h3>{concept.details.map((d, i) => <label key={d.id}>Point {i + 1}<textarea maxLength={concept.visual.type === 'process' ? 40 : 180} value={points[i]} onChange={e => setPoints(p => p.map((text, index) => index === i ? e.target.value : text))}/></label>)}</div>}
    {error && <p className="error" role="alert">{error}</p>}<button type="submit">Apply local changes<Check size={16}/></button><p className="notice">Text edits need human review. The controller must rebuild matching data before Auto resumes.</p>
  </form>;
}
function CuesEditor({ concept, onEdit }: { concept: Concept; onEdit: (patch: Partial<Concept>) => void }) {
  const [value, setValue] = useState(concept.speechExamples.join('\n')); const [aliases, setAliases] = useState(concept.aliases.join('\n'));
  return <form className="inspector-form" onSubmit={e => { e.preventDefault(); onEdit({ speechExamples: value.split('\n').map(s => s.trim()).filter(Boolean).slice(0, 50), aliases: aliases.split('\n').map(s => s.trim()).filter(Boolean).slice(0, 50), review: 'needs-review' }); }}><p className="notice">Phrases help the matching team recognise this idea. One per line.</p><label>Speech examples<textarea value={value} onChange={e => setValue(e.target.value)} maxLength={4000} placeholder="A different way to say this idea…"/></label><label>Aliases<textarea value={aliases} onChange={e => setAliases(e.target.value)} maxLength={2000} placeholder="Alternative names…"/></label><button type="submit">Apply cues<Check size={16}/></button></form>;
}
export function StudioScreen({ state, onAction, onConceptEdit, onPositionChange, onReset, onBack, onAudience, reducedMotion, systemReduced, onReducedMotion, illustrative, held, lastAction }: StudioProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = state.project.concepts.find(c => c.id === selectedId);
  const [railOpen, setRailOpen] = useState(true); const [outline, setOutline] = useState(false);
  const [tab, setTab] = useState<Tab>('Content'); const [settings, setSettings] = useState(false);
  const settingsButton = useRef<HTMLButtonElement>(null); const settingsRef = useRef<HTMLDivElement>(null);
  const dispatch = (action: CanvasAction) => {
    if (action.type === 'FOCUS' || action.type === 'REVEAL') setSelectedId(action.conceptId);
    onAction(action);
  };
  const enabled = state.project.concepts.filter(c => c.enabled && c.review === 'reviewed');
  const activeIndex = enabled.findIndex(c => c.id === state.focusId);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest('input, textarea, select, [contenteditable="true"]') || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === 'Escape') { setSettings(false); setSelectedId(null); setOutline(false); return; }
      let action: CanvasAction | null = null;
      if (e.key.toLowerCase() === 'o') action = { type: 'OVERVIEW' };
      if (e.key === ' ') action = { type: 'HOLD' };
      if (/^[1-8]$/.test(e.key) && enabled[Number(e.key) - 1]) action = { type: 'FOCUS', conceptId: enabled[Number(e.key) - 1].id };
      if ((e.key === 'ArrowRight' || e.key === 'ArrowLeft') && enabled.length) {
        const next = activeIndex < 0 ? 0 : (activeIndex + (e.key === 'ArrowRight' ? 1 : -1) + enabled.length) % enabled.length;
        action = { type: 'FOCUS', conceptId: enabled[next].id };
      }
      if (action) { e.preventDefault(); onAction(action); }
    };
    document.addEventListener('keydown', key); return () => document.removeEventListener('keydown', key);
  }, [enabled, activeIndex, onAction]);
  useEffect(() => {
    if (!settings) return;
    const close = (e: PointerEvent) => { if (!settingsRef.current?.contains(e.target as Node) && !settingsButton.current?.contains(e.target as Node)) setSettings(false); };
    document.addEventListener('pointerdown', close); return () => document.removeEventListener('pointerdown', close);
  }, [settings]);
  return <div className="studio-screen">
    <header className="app-header studio-header"><button className="ghost icon-button" aria-label="Back to project entry" onClick={onBack}><ArrowLeft size={18}/></button><Wordmark/><span className="header-separator"/><span className="project-title">{state.project.title}</span><span className="badge content-mode">{illustrative ? 'Illustrative example' : 'Imported project'}</span><div className="header-spacer"/>
      <button className="ghost icon-button" aria-label="View settings" ref={settingsButton} onClick={() => setSettings(v => !v)} aria-expanded={settings}><Settings2 size={18}/></button>
      <button className="primary audience-button" onClick={onAudience}><Monitor size={16}/><span>Audience preview</span><ArrowUpRightIcon/></button>
      {settings && <div className="settings-popover" ref={settingsRef}><h2>View settings</h2><label className="checkbox-label"><input type="checkbox" checked={reducedMotion} disabled={systemReduced} onChange={e => onReducedMotion(e.target.checked)}/>Reduce motion</label><p className="notice">{systemReduced ? 'Enabled by your device’s accessibility setting.' : 'Instant camera framing; no spatial reveals.'}</p><button onClick={() => { setSettings(false); settingsButton.current?.focus(); }}>Done</button></div>}
    </header>
    <div className="studio-body">
      {railOpen && <aside className={`concept-rail ${selected ? 'has-selection' : ''}`} aria-label="Concept navigation"><div className="rail-heading"><h1>Concepts<span>{state.project.concepts.length}</span></h1><button className="ghost icon-button" aria-label="Collapse concept rail" onClick={() => setRailOpen(false)}><PanelLeftClose size={16}/></button></div>
        <p className="rail-description">A map, not a slide order.</p><nav className="concept-list">{state.project.concepts.map((c, i) => {
          const Icon = ICONS[c.visual.type]; const active = c.id === state.focusId || state.pair?.includes(c.id);
          return <div key={c.id} className={`concept-row ${active ? 'is-active' : ''} ${!c.enabled ? 'is-disabled' : ''}`}><button className="concept-select" onClick={() => { setSelectedId(c.id); setOutline(false); if (c.enabled && c.review === 'reviewed') onAction({ type: 'FOCUS', conceptId: c.id }); }} aria-current={active ? 'true' : undefined}><Icon size={17}/><span><strong>{c.title}</strong><small>{!c.enabled ? 'Disabled' : c.review === 'reviewed' ? c.visual.type : 'Needs review'}</small></span><kbd>{i + 1}</kbd></button></div>;
        })}</nav>
        <div className="rail-bottom"><button className="ghost" onClick={() => { setOutline(v => !v); setSelectedId(null); }} aria-pressed={outline}><List size={16}/>Text outline</button><p>All controls in this preview are manual.</p></div>
      </aside>}
      <main className="studio-workspace" aria-label="Canvas studio">
        <div className="workspace-topline"><div>{!railOpen && <button className="ghost icon-button" aria-label="Show concept rail" onClick={() => setRailOpen(true)}><PanelLeftOpen size={16}/></button>}<span>Canvas</span><ChevronRight size={14}/><strong>{state.view === 'overview' ? 'Overview' : state.view === 'comparison' ? 'Comparison' : state.view === 'connection' ? 'Connected ideas' : state.project.concepts.find(c => c.id === state.focusId)?.title}</strong></div><span className="badge">{held ? 'Hold · visual preserved' : 'Manual preview'}</span></div>
        <div className="mobile-guidance">Inspect this project here. Use a desktop for live presenting.</div>
        <div className="studio-canvas-wrap"><FollowCanvas state={state} mode="studio" onAction={dispatch} onPositionChange={onPositionChange} reducedMotion={reducedMotion}/>
        {state.view === 'overview' && <div className="canvas-map-label"><span className="focus-trace"/><p>Your story has<br/>more than one way through.</p></div>}
        </div>
        <div className="workspace-footer"><span><span className="static-status-dot"/> {state.view === 'overview' ? 'Select an idea to explore' : 'Focused composition'}<span className="footer-last-action"> · {lastAction}</span></span><span><kbd>O</kbd> Overview <span className="shortcut-divider">/</span> <kbd>1–6</kbd> Focus</span></div>
      </main>
      {outline && <aside className="inspector outline-panel"><div className="inspector-heading"><h2>Text outline</h2><button className="ghost icon-button" onClick={() => setOutline(false)} aria-label="Close text outline"><X size={16}/></button></div><div className="outline-content">{state.project.concepts.filter(c => c.enabled).map(c => <section key={c.id}><h3>{c.title}</h3><p>{c.summary}</p><ul>{c.details.map(d => <li key={d.id}>{d.text}</li>)}</ul></section>)}<h3>Relationships</h3><ul>{state.project.relationships.filter(r => r.approved).map(r => <li key={r.id}>{state.project.concepts.find(c => c.id === r.from)?.title} — {r.label} — {state.project.concepts.find(c => c.id === r.to)?.title}</li>)}</ul></div></aside>}
      {selected && !outline && <aside className="inspector" aria-label="Concept inspector"><div className="inspector-heading"><div><h2>Inspect idea</h2><span className={`badge ${selected.review === 'reviewed' ? 'ready' : 'warning'}`}>{selected.review === 'reviewed' ? 'Reviewed' : 'Needs review'}</span></div><button className="ghost icon-button" aria-label="Close inspector" onClick={() => setSelectedId(null)}><X size={18}/></button></div>
        <div className="inspector-tabs" aria-label="Inspector sections">{(['Content', 'Connections', 'Cues', 'Appearance', 'Source'] as Tab[]).map(t => <button key={t} aria-pressed={tab === t} className={tab === t ? 'selected' : ''} onClick={() => setTab(t)}>{t}</button>)}</div>
        <div className="inspector-content">
          {tab === 'Content' && <ContentEditor key={`${selected.id}-${state.project.revision}`} concept={selected} onEdit={patch => onConceptEdit(selected.id, patch)}/>}
          {tab === 'Connections' && <div className="inspector-form"><h3>Reviewed relationships</h3>{state.project.relationships.filter(r => r.from === selected.id || r.to === selected.id).map(r => <div className="relationship-row" key={r.id}><p>{r.label}</p><small>{r.kind} · {r.approved ? 'Approved' : 'Needs review'}</small><button disabled={!r.approved || !selected.enabled} onClick={() => dispatch({ type: 'CONNECT', relationshipId: r.id })}>Show connection<ArrowRight size={16}/></button></div>)}<p className="notice">Relationship authoring is supplied by the team’s project editor. This panel previews approved connections.</p></div>}
          {tab === 'Cues' && <CuesEditor key={`${selected.id}-${state.project.revision}`} concept={selected} onEdit={patch => onConceptEdit(selected.id, patch)}/>}
          {tab === 'Appearance' && <div className="inspector-form"><h3>On the canvas</h3><label className="checkbox-label"><input type="checkbox" checked={selected.enabled} onChange={e => onConceptEdit(selected.id, { enabled: e.target.checked })}/>Enable this concept</label><label>Visual type<select value={selected.visual.type} onChange={e => { if (e.target.value === 'concept') onConceptEdit(selected.id, { visual: { type: 'concept' }, review: 'needs-review' }); }}><option value={selected.visual.type}>{selected.visual.type}</option>{selected.visual.type !== 'concept' && <option value="concept">concept</option>}</select></label><p className="notice">Structured visuals need prepared payloads. You can simplify a visual to a concept here.</p><p className="position-readout">Home position · {Math.round(selected.position.x)}, {Math.round(selected.position.y)}</p><p className="notice">Unlock the layout in Overview to move this concept.</p></div>}
          {tab === 'Source' && <div className="inspector-form"><h3>Source material</h3><p className="source-name"><FileText size={16}/>{state.project.source.name}</p>{selected.sources.length ? selected.sources.map((s, i) => <blockquote key={i}><span>Page {s.page}</span>{s.quote}</blockquote>) : <p className="notice">No PDF excerpt is attached to this concept. {illustrative ? 'This example is authored product content, not a verified PDF extraction.' : 'Review its source before presenting factual claims.'}</p>}{selected.visual.type === 'metric' && <blockquote><span>Value source · page {selected.visual.valueSource.page}</span>{selected.visual.valueSource.quote}</blockquote>}</div>}
          {selected.review === 'needs-review' && <div className="review-action"><p>Review the content and sources before returning it to presentation.</p><button onClick={() => onConceptEdit(selected.id, { review: 'reviewed' })}><Check size={16}/>Mark reviewed</button></div>}
          {state.focusId === selected.id && selected.details.length > 0 && selected.visual.type !== 'comparison' && <section className="reveal-controls"><h3>Reveal details</h3>{selected.details.map(d => <button key={d.id} onClick={() => dispatch({ type: 'REVEAL', conceptId: selected.id, detailId: d.id })}><Sparkles size={14}/><span>{d.text}</span>{state.revealed[selected.id]?.includes(d.id) && <Check size={14}/>}</button>)}</section>}
          <CanvasDebugPanel state={state} onAction={dispatch}/>
        </div>
      </aside>}
    </div>
    {!selected && !outline && <div className="floating-lab"><CanvasDebugPanel state={state} onAction={dispatch}/></div>}
    <button className="reset-example ghost" onClick={onReset} title="Reset visual reveals; keep local content edits"><RotateCcw size={14}/><span>Reset reveals</span></button>
  </div>;
}
function ArrowUpRightIcon() { return <svg width="14" height="14" viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M5 15L15 5M5 5H15V15" stroke="currentColor" strokeWidth="1.75"/></svg>; }
