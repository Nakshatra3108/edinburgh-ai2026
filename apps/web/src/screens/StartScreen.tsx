import { useRef, useState } from 'react';
import { ArrowRight, FileUp, FolderOpen, Upload, Check, ArrowUpRight } from 'lucide-react';
import { Wordmark } from '../preview/Wordmark';
import { FollowCanvas } from '../canvas/FollowCanvas';
import { createCanvasState } from '../canvas/applyAction';
import { exampleProject } from '../canvas/fixtures/project';
import { parseCanvasProject } from '../canvas/manifest';
import type { CanvasProject } from '../canvas/domain';
const EXAMPLE_STATE = createCanvasState(exampleProject);
export function StartScreen({ onOpen, reducedMotion }: { onOpen: (project: CanvasProject, illustrative: boolean) => void; reducedMotion: boolean }) {
  const pdfInput = useRef<HTMLInputElement>(null); const importInput = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false); const [error, setError] = useState('');
  const [status, setStatus] = useState(''); const [reading, setReading] = useState(false);
  const inspectPdf = async (file?: File) => {
    if (!file) return; setError(''); setStatus('');
    if (file.size > 25 * 1024 * 1024) { setError('This PDF is larger than 25 MB. Choose a smaller file.'); return; }
    if (!file.name.toLowerCase().endsWith('.pdf')) { setError('Choose a PDF file, or use Import project for a JSON manifest.'); return; }
    setReading(true);
    try {
      const header = new TextDecoder().decode(await file.slice(0, 5).arrayBuffer());
      if (header !== '%PDF-') { setError('This file does not contain a PDF header. Choose a valid PDF.'); return; }
      setStatus(`${file.name} selected. PDF preparation is not connected in Person A’s preview. Open the example or import a prepared project.`);
    } catch { setError('This file could not be read. Choose it again from a local folder.'); }
    finally { setReading(false); }
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
    <header className="app-header"><Wordmark/><span className="header-caption">Ideas, in your own order.</span><span className="badge">Canvas preview</span></header>
    <main className="start-main"><div className="start-copy"><h1>Your ideas<br/>set the pace<span className="scarlet-period">.</span></h1><p className="start-intro">One canvas. A story that can go anywhere.<br/>Make room for the way you actually explain.</p>
      <div className={`pdf-drop ${dragging ? 'is-dragging' : ''}`} onDragOver={e => { e.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={e => { e.preventDefault(); setDragging(false); void inspectPdf(e.dataTransfer.files[0]); }}>
        <FileUp size={28} strokeWidth={1.5}/><div><h2>{dragging ? 'Drop your PDF here' : 'Begin with your source.'}</h2><p>Drop a PDF here · up to 25 MB</p></div><button disabled={reading} onClick={() => pdfInput.current?.click()}><Upload size={16}/>{reading ? 'Reading…' : 'Choose PDF'}</button>
      </div>
      <input className="sr-only" tabIndex={-1} type="file" accept=".pdf,application/pdf" aria-label="Select source PDF" ref={pdfInput} onChange={e => { void inspectPdf(e.target.files?.[0]); e.target.value = ''; }}/>
      <input className="sr-only" tabIndex={-1} type="file" accept=".json,application/json" aria-label="Import prepared project manifest" ref={importInput} onChange={e => { void importProject(e.target.files?.[0]); e.target.value = ''; }}/>
      {error && <p className="entry-message error" role="alert">{error}</p>}{status && <p className="entry-message notice" role="status">{status}</p>}
      <div className="start-actions"><button className="primary" onClick={() => onOpen(exampleProject, true)}>Open example canvas<ArrowRight size={18}/></button><button disabled={reading} className="ghost" onClick={() => importInput.current?.click()}><FolderOpen size={18}/>Import project</button></div>
      <p className="start-footnote"><Check size={14}/>No account or API key needed to explore.</p>
    </div>
    <div className="start-art"><div className="example-caption"><span>Example canvas</span><ArrowUpRight size={18}/></div><div className="start-canvas"><FollowCanvas state={EXAMPLE_STATE} mode="preview" reducedMotion={reducedMotion}/></div><div className="example-footer"><span>Six ideas. One connected world.</span><span>Illustrative content</span></div></div></main>
    <footer className="start-footer"><span>Let your explanation lead.</span><span>Person A · visual renderer preview</span></footer>
  </div>;
}
