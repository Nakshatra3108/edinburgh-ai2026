// Screen B — Source and preparation (PRD §5.2). Shows the locally extracted
// pages, lets the user choose what is sent, and runs Groq preparation through
// the local API. Progress shows only real stages and counts. Failure keeps the
// extracted text. Nothing replaces the current project until the user opens
// the reviewed draft.

import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, ArrowLeft, ArrowRight, Check, CircleDashed, FileText, Loader2, PenLine, RotateCcw, Sparkles, X } from 'lucide-react';
import { Wordmark } from '../preview/Wordmark';
import type { CanvasProject } from '../canvas/domain';
import { parseCanvasProject } from '../canvas/manifest';
import { defaultSelection, evaluateSelection, MAX_SELECTED_PAGES, MAX_SOURCE_CHARS, normalizeText, pageLabelledText, type ExtractedSource, type SelectionProblem } from '../pdf';
import { SESSION_ID, cancelJob, getHealth, getJob, isTerminal, submitPreparation, type HealthView, type JobView } from '../preparation/client';
import '../styles/source.css';

type Failure = { code: string; message: string; retryable: boolean };
type Run =
  | { phase: 'idle' }
  | { phase: 'running'; job: JobView }
  | { phase: 'done'; job: JobView; project: CanvasProject }
  | { phase: 'failed'; failure: Failure; job?: JobView };

const POLL_MS = 1000;

export function SourceScreen({ source, onBack, onOpenProject, onOpenDemo }: {
  source: ExtractedSource;
  onBack: () => void;
  onOpenProject: (project: CanvasProject) => void;
  onOpenDemo: () => void;
}) {
  const [title, setTitle] = useState(() => source.name.replace(/\.pdf$/i, ''));
  const [selected, setSelected] = useState<number[]>(() => defaultSelection(source).pages);
  const [active, setActive] = useState(() => source.pages.find((p) => p.chars > 0)?.page ?? 1);
  const [density, setDensity] = useState<'standard' | 'concise'>('standard');
  const [edits, setEdits] = useState<Record<number, string>>({});
  const [editing, setEditing] = useState(false);
  const [health, setHealth] = useState<HealthView | Failure | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [run, setRun] = useState<Run>({ phase: 'idle' });
  const polling = useRef<AbortController | null>(null);

  useEffect(() => {
    let live = true;
    getHealth().then((h) => live && setHealth(h), (e) => live && setHealth({ code: e.code ?? 'SERVER_UNREACHABLE', message: e.message, retryable: true }));
    return () => { live = false; polling.current?.abort(); };
  }, []);

  // The text that would be sent: extracted pages, with any user edits applied.
  const effective = useMemo<ExtractedSource>(() => ({
    ...source,
    pages: source.pages.map((p) => {
      if (edits[p.page] === undefined) return p;
      const text = normalizeText(edits[p.page]);
      return { ...p, text, chars: text.length };
    }),
  }), [source, edits]);
  const selection = useMemo(() => evaluateSelection(effective, selected), [effective, selected]);
  const activePage = effective.pages.find((p) => p.page === active);
  const ready = health && 'configured' in health && health.configured;
  const running = submitting || run.phase === 'running';
  const blocked = !ready || running || selection.problems.length > 0;

  const toggle = (page: number) => setSelected((s) => (s.includes(page) ? s.filter((p) => p !== page) : [...s, page]));

  const poll = (jobId: string, deadline: number) => {
    polling.current?.abort();
    const ctl = new AbortController();
    polling.current = ctl;
    const tick = async () => {
      if (ctl.signal.aborted) return;
      try {
        const job = await getJob(jobId, ctl.signal);
        if (ctl.signal.aborted) return;
        if (!isTerminal(job.stage)) {
          setRun({ phase: 'running', job });
          if (Date.now() < deadline) setTimeout(tick, POLL_MS);
          else setRun({ phase: 'failed', job, failure: { code: 'PREP_TIMEOUT', message: 'The server stopped reporting progress.', retryable: true } });
          return;
        }
        finish(job);
      } catch (e) {
        if (!ctl.signal.aborted) setRun({ phase: 'failed', failure: toFailure(e) });
      }
    };
    void tick();
  };

  const finish = (job: JobView) => {
    if (job.stage === 'done' && job.result) {
      try {
        // Arranging canvas: the renderer's own validator must accept the draft before it can be opened.
        const project = parseCanvasProject({ ...job.result.project, title: title.trim().slice(0, 160) || job.result.project.title });
        setRun({ phase: 'done', job, project });
      } catch {
        setRun({ phase: 'failed', job, failure: { code: 'INVALID_PLAN', message: 'The prepared canvas did not pass the renderer’s validation.', retryable: true } });
      }
    } else {
      setRun({ phase: 'failed', job, failure: job.error ?? { code: 'CANCELLED', message: 'Preparation was cancelled.', retryable: false } });
    }
  };

  const prepare = async (regenerate: boolean) => {
    if (running) return;
    setSubmitting(true); setEditing(false);
    try {
      const job = await submitPreparation({
        sessionId: SESSION_ID, density, regenerate,
        source: { name: source.name, sha256: source.sha256, pageCount: source.pageCount, pages: pageLabelledText(effective, selection) },
      });
      if (isTerminal(job.stage)) return finish(job);
      setRun({ phase: 'running', job });
      const limit = health && 'limits' in health ? health.limits.timeoutMs : 90_000;
      poll(job.jobId, Date.now() + limit + 15_000);
    } catch (e) {
      setRun({ phase: 'failed', failure: toFailure(e) });
    } finally { setSubmitting(false); }
  };

  const cancel = async () => {
    if (run.phase !== 'running') return;
    polling.current?.abort();
    try { finish(await cancelJob(run.job.jobId)); } catch (e) { setRun({ phase: 'failed', failure: toFailure(e) }); }
  };

  return <div className="source-screen">
    <header className="app-header studio-header">
      <button className="ghost" onClick={onBack} disabled={running}><ArrowLeft size={16}/>Back</button>
      <Wordmark/>
      <span className="header-separator"/>
      <span className="project-title">{source.name}</span>
      <span className="badge">Build your knowledge base</span>
    </header>

    <main className="source-body">
      <aside className="source-pages" aria-label="Pages">
        <div className="source-pages-heading"><h1>Pages <span>{source.pageCount}</span></h1><p>Read on this device. Choose what to send.</p></div>
        <ul>{effective.pages.map((p) => {
          const on = selected.includes(p.page);
          return <li key={p.page} className={`source-page ${p.page === active ? 'is-active' : ''}`}>
            <input type="checkbox" checked={on} disabled={running || p.chars === 0} onChange={() => toggle(p.page)} aria-label={`Send page ${p.page}`}/>
            <button className="ghost" onClick={() => { setActive(p.page); setEditing(false); }} aria-current={p.page === active}>
              <FileText size={16}/><span><strong>Page {p.page}</strong><small>{p.chars ? `${p.chars.toLocaleString()} characters` : 'No selectable text'}{edits[p.page] !== undefined ? ' · edited' : ''}</small></span>
            </button>
          </li>;
        })}</ul>
      </aside>

      <section className="source-preview" aria-label={`Page ${active} text`}>
        <div className="source-preview-topline">
          <strong>Page {active} · extracted text</strong>
          {activePage && activePage.chars > 0 && !running && <button className="ghost" onClick={() => setEditing((v) => !v)}><PenLine size={14}/>{editing ? 'Done editing' : 'Edit text'}</button>}
        </div>
        {editing
          ? <label className="source-edit">Corrections are sent instead of the extracted text, and quotes are checked against your version.
              <textarea value={edits[active] ?? activePage?.text ?? ''} onChange={(e) => setEdits((m) => ({ ...m, [active]: e.target.value }))}/>
            </label>
          : <div className="source-text" tabIndex={0}>{activePage?.chars ? activePage.text : <p className="notice">This page has no selectable text. Scanned pages need OCR, which this prototype does not do.</p>}</div>}
      </section>

      <aside className="source-panel" aria-label="Preparation">
        <div className="source-panel-intro"><h1>Knowledge first.<br/>Visuals as you speak.</h1><p>Keep the full selected text as your reference. Groq indexes its topics; your explanation decides what gets drawn.</p></div>
        <label>Project title<input value={title} maxLength={160} onChange={(e) => setTitle(e.target.value)} disabled={running}/></label>
        <fieldset className="density" disabled={running}>
          <legend>Topic index depth</legend>
          {(['concise', 'standard'] as const).map((d) => <label key={d} className="checkbox-label"><input type="radio" name="density" checked={density === d} onChange={() => setDensity(d)}/>{d === 'concise' ? 'Essential topics · up to 6' : 'Broader coverage · up to 8'}</label>)}
        </fieldset>
        <div className="selection-summary">
          <p><strong>{selection.pages.length}</strong> of {MAX_SELECTED_PAGES} pages · <strong>{selection.chars.toLocaleString()}</strong> of {MAX_SOURCE_CHARS.toLocaleString()} characters</p>
          {selection.omitted.length > 0 && <p className="notice">Not sent: {pageRanges(selection.omitted)}</p>}
          {selection.problems.map((problem) => <p key={problem.code} className="error">{describe(problem)}</p>)}
        </div>

        <ServerStatus health={health}/>
        <button className={`prepare-button ${run.phase === 'done' ? '' : 'primary'}`} disabled={blocked} onClick={() => void prepare(run.phase === 'done')}>
          <Sparkles size={16}/>{run.phase === 'done' ? 'Rebuild knowledge index' : 'Build knowledge base'}
        </button>
        <p className="privacy-note">Selected text is kept in your session and sent to Groq to index topics and compose live visuals. Audio is transcribed locally with Whisper.</p>

        {run.phase !== 'idle' && <Progress run={run} pages={source.pageCount}/>}
        {run.phase === 'running' && <button onClick={() => void cancel()}><X size={16}/>Cancel</button>}
        {run.phase === 'done' && <Done run={run} onOpen={() => onOpenProject(run.project)}/>}
        {run.phase === 'failed' && <div className="prep-failure" role="alert">
          <p className="error"><AlertTriangle size={14}/>{run.failure.message}</p>
          <div className="button-row">
            {run.failure.retryable && <button onClick={() => void prepare(false)} disabled={blocked}><RotateCcw size={14}/>Retry</button>}
            <button onClick={() => setEditing(true)} disabled={!activePage?.chars}><PenLine size={14}/>Edit extracted text</button>
            <button onClick={onOpenDemo}>Open curated demo</button>
          </div>
        </div>}
      </aside>
    </main>
  </div>;
}

function ServerStatus({ health }: { health: HealthView | Failure | null }) {
  if (!health) return <p className="server-status"><CircleDashed size={14}/>Checking the preparation server…</p>;
  if (!('configured' in health)) return <p className="server-status is-warning"><AlertTriangle size={14}/>{health.message}</p>;
  if (!health.configured) return <p className="server-status is-warning"><AlertTriangle size={14}/>Groq is not configured. Set GROQ_API_KEY in the repository .env or apps/api/.env, then restart the API.</p>;
  return <p className="server-status is-ready"><Check size={14}/>Groq ready · {health.model}</p>;
}

const STEPS = ['Reading PDF', 'Indexing topics', 'Checking sources', 'Knowledge base ready'] as const;

function Progress({ run, pages }: { run: Exclude<Run, { phase: 'idle' }>; pages: number }) {
  const stage = run.phase === 'done' ? 'done' : run.job?.stage;
  // Index of the step in progress (4 = all complete). Reading the PDF finished before this screen opened.
  const current = run.phase === 'done' ? 4 : stage === 'validating' ? 2 : 1;
  const failedAt = run.phase === 'failed' ? (stage === 'validating' ? 2 : 1) : -1;
  const retries = run.phase === 'running' && run.job.attempts.length > 0;
  return <ol className="prep-progress" role="status" aria-live="polite">
    {STEPS.map((label, i) => {
      const state = i === failedAt ? 'failed' : i < current || run.phase === 'done' ? 'complete' : i === current && run.phase === 'running' ? 'active' : 'pending';
      const Icon = state === 'complete' ? Check : state === 'active' ? Loader2 : state === 'failed' ? X : CircleDashed;
      return <li key={label} className={`is-${state}`}><Icon size={14} className={state === 'active' ? 'spin' : undefined}/><span>{label}{i === 0 ? ` · ${pages} of ${pages} pages` : ''}{i === 1 && state === 'active' && retries ? ' · another attempt' : ''}</span></li>;
    })}
  </ol>;
}

function Done({ run, onOpen }: { run: Extract<Run, { phase: 'done' }>; onOpen: () => void }) {
  const r = run.job.result!;
  return <div className="prep-done">
    <p><strong>{run.project.knowledgeBase?.pages.length ?? 0}</strong> full source pages · <strong>{r.stats.conceptsKept}</strong> indexed topics · <strong>{r.stats.quotesVerified}</strong> of {r.stats.quotesProposed} quotes matched the source{run.job.cached ? ' · reused earlier result' : ` · ${run.job.usage.totalTokens.toLocaleString()} tokens`}</p>
    {r.warnings.length > 0 && <details><summary>{r.warnings.length} source-check notes</summary><ul>{r.warnings.map((w, i) => <li key={i}>{w.message}</li>)}</ul></details>}
    <p className="notice">Your knowledge base is ready. Start explaining any topic to compose source-backed visuals. You can inspect the topic index in the studio; manual review is optional.</p>
    <button className="primary" onClick={onOpen}>Open speaking studio<ArrowRight size={16}/></button>
  </div>;
}

function toFailure(e: unknown): Failure {
  const x = e as { code?: string; message?: string; retryable?: boolean };
  return { code: x.code ?? 'UNKNOWN', message: x.message ?? 'Preparation failed.', retryable: x.retryable ?? true };
}

function describe(problem: SelectionProblem): string {
  switch (problem.code) {
    case 'EMPTY_SELECTION': return 'Select at least one page with text.';
    case 'TOO_MANY_PAGES': return `Select at most ${problem.max} pages (${problem.selected} selected).`;
    case 'TOO_MANY_CHARS': return `Too much text: ${problem.chars.toLocaleString()} characters selected, limit ${problem.max.toLocaleString()}.`;
    case 'UNKNOWN_PAGE': return `Page ${problem.page} is not in this document.`;
  }
}

/** [1,2,3,5] -> "pages 1–3, 5" */
function pageRanges(pages: number[]): string {
  const parts: string[] = [];
  for (let i = 0; i < pages.length; i++) {
    let j = i;
    while (j + 1 < pages.length && pages[j + 1] === pages[j] + 1) j++;
    parts.push(i === j ? `${pages[i]}` : `${pages[i]}–${pages[j]}`);
    i = j;
  }
  return `${pages.length === 1 ? 'page' : 'pages'} ${parts.join(', ')}`;
}
