import { useEffect, useRef, useState } from 'react';
import { ArrowRight, FileUp, FolderOpen, Upload, Check, Play, Focus, GitCompareArrows, Route, MousePointer2 } from 'lucide-react';
import { Wordmark } from '../preview/Wordmark';
import { FollowCanvas } from '../canvas/FollowCanvas';
import { applyAction, createCanvasState } from '../canvas/applyAction';
import { exampleProject } from '../canvas/fixtures/project';
import { demoProject } from '../preview/demoProject';
import { matchCuratedSource } from '../pdf/curated';
import type { ExtractedSource } from '../pdf/extract';
import { parseCanvasProject } from '../canvas/manifest';
import type { CanvasAction, CanvasProject } from '../canvas/domain';
const INITIAL_PREVIEW = ['capture', 'understand', 'match', 'compose'].reduce((state, detailId) => applyAction(state, { type: 'REVEAL', conceptId: 'pipeline', detailId }), createCanvasState(demoProject));
const PREVIEW_OPTIONS: {label: string; icon: typeof Focus; action: CanvasAction}[] = [
  { label: 'The problem', icon: Focus, action: { type: 'FOCUS', conceptId: 'problem' } },
  { label: 'The process', icon: Route, action: { type: 'REVEAL', conceptId: 'pipeline', detailId: 'capture' } },
  { label: 'The flip', icon: GitCompareArrows, action: { type: 'COMPARE', leftId: 'problem', rightId: 'reversal' } },
];
export function StartScreen({ onOpen, onSource, reducedMotion }: { onOpen: (project: CanvasProject, illustrative: boolean) => void; onSource?: (source: ExtractedSource) => void; reducedMotion: boolean }) {
  const pdfInput = useRef<HTMLInputElement>(null); const importInput = useRef<HTMLInputElement>(null);
  const pdfJob = useRef<AbortController | null>(null);
  useEffect(() => () => pdfJob.current?.abort(), []);
  const [dragging, setDragging] = useState(false); const [error, setError] = useState('');
  const [status, setStatus] = useState(''); const [reading, setReading] = useState(false);
  const [preview, setPreview] = useState(INITIAL_PREVIEW); const [previewOption, setPreviewOption] = useState(1);
  const inspectPdf = async (file?: File) => {
    if (!file) return;
    pdfJob.current?.abort();
    const job = new AbortController(); pdfJob.current = job;
    setError(''); setStatus(''); setReading(true);
    try {
      setStatus('Reading your PDF on this device…');
      const { extractPdfFile } = await import('../pdf/extract');
      const source = await extractPdfFile(file, { signal: job.signal, onProgress: (done, total) => { if (pdfJob.current === job) setStatus(`Reading PDF · ${done} of ${total} pages`); } });
      if (job.signal.aborted || pdfJob.current !== job) return;
      if (matchCuratedSource(source, demoProject).ok) {
        onOpen(demoProject, false);
      } else if (onSource) {
        onSource(source);
      } else {
        setStatus(`${file.name}: ${source.pageCount} pages read locally${source.emptyPages.length ? ` (${source.emptyPages.length} without selectable text)` : ''}. Groq preparation is not connected yet. You can explore the ready-made demo or import an existing project.`);
      }
    } catch (e) { if (!job.signal.aborted && pdfJob.current === job) { setError(e instanceof Error ? e.message : 'This file could not be read. Choose a valid PDF.'); setStatus(''); } }
    finally { if (pdfJob.current === job) setReading(false); }
  };
  const importProject = async (file?: File) => {
    if (!file) return; setError(''); setStatus(''); setReading(true);
    try {
      if (file.size > 5 * 1024 * 1024) throw new Error('This project is larger than 5 MB. Import a manifest without embedded files.');
      const project = parseCanvasProject(JSON.parse(await file.text()));
      onOpen(project, project.id === exampleProject.id);
    } catch (e) { setError(e instanceof SyntaxError ? 'This file is not valid JSON. Choose an exported FOLLOW project.' : e instanceof Error && !('issues' in e) ? e.message : 'The project contains invalid or missing content. Ask your team to validate its manifest.'); }
    finally { setReading(false); }
  };
  return <div className="start-screen">
    <header className="app-header"><Wordmark/><span className="header-caption">A little less clicking. A lot more explaining.</span><span className="badge">Presentation studio</span></header>
    <main className="start-main"><div className="start-copy"><h1>Big ideas.<br/>Room to <span className="headline-accent">follow.</span></h1><p className="start-intro">Turn an explanation into a visual conversation. Explore connected ideas, reveal the details, and present on one clear canvas.</p>
      <div className="start-actions"><button className="primary" onClick={() => onOpen(demoProject, false)}><Play size={18}/>Open demo project<ArrowRight size={18}/></button><button onClick={() => importInput.current?.click()} disabled={reading}><FolderOpen size={18}/>Import project</button></div>
      <p className="demo-explanation"><Check size={16}/>A ready-made project. No account or API key needed.</p>
      <ol className="entry-workflow"><li><span>1</span><div><strong>Explore the ideas</strong><p>Start with the whole picture.</p></div></li><li><span>2</span><div><strong>Bring a point into focus</strong><p>Show just what you need.</p></div></li><li><span>3</span><div><strong>Present your way</strong><p>Take any route through the story.</p></div></li></ol>
      <div className={`pdf-drop ${dragging ? 'is-dragging' : ''}`} onDragOver={e => { e.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={e => { e.preventDefault(); setDragging(false); void inspectPdf(e.dataTransfer.files[0]); }}>
        <FileUp size={24}/><div><h2>{dragging ? 'Drop your PDF here' : 'Have your own source?'}</h2><p>Read a PDF locally, up to 20 MB. The demo PDF opens directly.</p></div><button disabled={reading} onClick={() => pdfInput.current?.click()}><Upload size={16}/>{reading ? 'Reading…' : 'Choose PDF'}</button>
      </div>
      <input className="sr-only" tabIndex={-1} type="file" accept=".pdf,application/pdf" aria-label="Select source PDF" ref={pdfInput} onChange={e => { void inspectPdf(e.target.files?.[0]); e.target.value = ''; }}/>
      <input className="sr-only" tabIndex={-1} type="file" accept=".json,application/json" aria-label="Import prepared project manifest" ref={importInput} onChange={e => { void importProject(e.target.files?.[0]); e.target.value = ''; }}/>
      {error && <p className="entry-message error" role="alert">{error}</p>}{status && <p className="entry-message notice" role="status">{status}</p>}
      <button className="ghost examples-link" onClick={() => onOpen(exampleProject, true)}>Open example canvas<ArrowRight size={14}/></button>
    </div>
    <section className="start-art" aria-label="Interactive canvas preview"><div className="example-caption"><span className="preview-heading"><span className="preview-dot"/>See the story take shape</span><span className="badge">Interactive preview</span></div><div className="start-canvas"><FollowCanvas state={preview} mode="preview" reducedMotion={reducedMotion}/></div><div className="preview-tabs" aria-label="Preview ideas">{PREVIEW_OPTIONS.map((option, i) => <button key={option.label} aria-pressed={previewOption === i} onClick={() => { setPreviewOption(i); setPreview(s => applyAction(s, option.action)); }}><option.icon size={16}/>{option.label}</button>)}</div><div className="example-footer"><span><MousePointer2 size={14}/>Try a different idea above</span><span>Curated content · manual preview</span></div></section></main>
    <footer className="start-footer"><span>One canvas. More ways to tell your story.</span><span>Local preview · changes are session-only</span></footer>
  </div>;
}
