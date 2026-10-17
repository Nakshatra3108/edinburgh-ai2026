import { useState } from 'react';
import { ArrowUp, Loader2, Mic, Pause, Sparkles } from 'lucide-react';
import type { LivePresentation } from './useLivePresentation';
import './live.css';
export function LivePanel({ live, pages }: { live: LivePresentation; pages: number }) {
  const [text, setText] = useState('');
  return <section className="live-panel" aria-label="Live presentation">
    <div className="live-panel-heading"><div><h2>Your voice. A living canvas.</h2><p>{pages} source pages ready. Speak in any order.</p></div>
      {live.speechPhase !== 'ready' && <button onClick={() => void live.loadSpeech()} disabled={live.speechPhase === 'loading'}>{live.speechPhase === 'loading' ? <Loader2 size={16} className="live-spin"/> : <Mic size={16}/>}{live.speechPhase === 'loading' ? 'Loading voice model…' : 'Load local voice model'}</button>}
      <button className={live.listening ? '' : 'primary'} onClick={live.listening ? live.stop : live.start} disabled={live.speechPhase !== 'ready'} aria-pressed={live.listening}>
        {live.listening ? <Pause size={16}/> : <Mic size={16}/>}{live.opening ? 'Cancel microphone' : live.listening ? 'Pause listening' : 'Start listening'}
      </button>
      {(live.busy || (!live.listening && live.transcript)) && <button className="ghost" onClick={live.stop}>Hold canvas</button>}
    </div>
    {live.speechProgress && <p className="live-model-progress" role="status">{live.speechProgress}</p>}
    {live.listening && <div className="live-audio-level"><meter aria-label="Microphone level" min={0} max={0.1} value={Math.min(live.level, 0.1)}/><span>{live.opening ? 'Waiting for microphone permission…' : live.transcribing ? 'Transcribing locally…' : 'Listening · 3.5-second audio chunks'}</span></div>}
    <p className="live-status" role="status">{live.busy ? <Loader2 size={15} className="live-spin"/> : <Sparkles size={15}/>}<span>{live.status}</span></p>
    {live.transcript && <p className="live-transcript"><span>{live.listening ? 'Hearing' : 'Latest explanation'}</span>{live.transcript}</p>}
    {live.error && <div className="live-error"><p className="error" role="alert">{live.error}</p>{live.transcript && <button disabled={live.busy} onClick={() => void live.compose(live.transcript)}>Retry visual</button>}</div>}
    <form className="live-text-input" onSubmit={e => { e.preventDefault(); if (text.trim().length >= 8) { void live.compose(text); setText(''); } }}>
      <label className="sr-only" htmlFor="spoken-explanation">Type an explanation</label>
      <input id="spoken-explanation" value={text} onChange={e => setText(e.target.value)} maxLength={2000} placeholder="Or type what you would say…"/>
      <button aria-label="Compose visual from explanation" type="submit" disabled={text.trim().length < 8}><ArrowUp size={18}/></button>
    </form>
    <p className="live-privacy">Audio stays local with Whisper. Transcript and selected document text go to Groq to compose visuals. Typed input works without downloading a voice model.</p>
  </section>;
}
