import { useCallback, useEffect, useRef, useState } from 'react';
import type { CanvasProject } from '../canvas/domain';
import { instantScene } from './instantScene';
import { localFigureScene } from './figures';
import { composeLive } from '../preparation/client';
import { MicrophoneCapture } from '../audio/capture';
import { LatestQueue } from '../audio/latest-queue';
import { deduplicate } from '../audio/pcm';
import { WorkerClient } from '../workers/rpc';

export function useLivePresentation(project: CanvasProject, onScene: (scene: CanvasProject, utterance: string, phase?: 'instant' | 'refined') => void) {
  const [listening, setListening] = useState(false);
  const [opening, setOpening] = useState(false);
  const [busy, setBusy] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [status, setStatus] = useState('Ready when you are. Explain any part of your document.');
  const [error, setError] = useState('');
  const [speechPhase, setSpeechPhase] = useState<'absent' | 'loading' | 'ready' | 'failed'>('absent');
  const [speechProgress, setSpeechProgress] = useState('');
  const [level, setLevel] = useState(0);
  const [transcribing, setTranscribing] = useState(false);
  const speech = useRef<WorkerClient | null>(null);
  const microphone = useRef<MicrophoneCapture | null>(null);
  const audioQueue = useRef<LatestQueue<{ pcm: Float32Array; epoch: number }, { text: string }> | null>(null);
  const previous = useRef('');
  const context = useRef('');
  const request = useRef<AbortController | null>(null);
  const epoch = useRef(0);
  const pending = useRef('');
  const sequence = useRef(0);
  const currentTopic = useRef('');
  const refinedTopic = useRef('');
  const sourceIndex = useRef(project);
  if (sourceIndex.current.id !== project.id || sourceIndex.current.source.sha256 !== project.source.sha256) sourceIndex.current = project;
  const active = useRef(false);
  const inFlight = useRef(false);
  const latest = useRef({ project, onScene });
  latest.current = { project, onScene };

  const stop = useCallback(() => {
    epoch.current++;
    active.current = false;
    pending.current = ''; previous.current = ''; context.current = '';
    currentTopic.current = ''; refinedTopic.current = '';
    microphone.current?.stop(); microphone.current = null;
    audioQueue.current?.clear();
    request.current?.abort(); request.current = null;
    inFlight.current = false;
    setListening(false); setOpening(false); setBusy(false); setLevel(0); setTranscribing(false);
    setStatus('Paused. Your canvas stays where you left it.');
  }, []);
  useEffect(() => () => { stop(); speech.current?.dispose(); speech.current = null; }, [stop]);

  const compose = useCallback(async function send(text: string): Promise<void> {
    const utterance = text.trim().slice(-2000);
    if (utterance.length < 8 || !latest.current.project.knowledgeBase) return;
    setTranscript(utterance);
    const version = ++sequence.current;
    const local = /\b(?:figure|diagram|chart|image|picture)\s*(?:\d+|one|two|three|four|five)\b/i.test(utterance) ? localFigureScene(latest.current.project, utterance) : undefined;
    if (local) {
      pending.current = ''; currentTopic.current = '';
      try { latest.current.onScene(local, utterance); setError(''); setStatus(`Canvas updated · local source figure · page ${local.assets.find(a => a.id === local.concepts[0].assetIds[0])?.page ?? '—'}`); }
      catch (error) { setError(error instanceof Error ? error.message : 'Could not display the local figure.'); }
      return;
    }
    let immediate = false;
    const preview = instantScene(sourceIndex.current, utterance);
    const topicKey = preview ? `${sourceIndex.current.source.sha256}:${preview.concepts.map(c => c.id).join('|')}` : '';
    if (currentTopic.current !== topicKey) refinedTopic.current = '';
    currentTopic.current = topicKey;
    if (preview) {
      try { if (refinedTopic.current !== topicKey) latest.current.onScene(preview, utterance, 'instant'); immediate = true; setError(''); setStatus('Canvas updated · source match · AI refining in background'); }
      catch { /* A failed provenance check must leave the last valid canvas intact. */ }
    }
    // Run local retrieval even while Groq is busy. Pending speech is already a
    // rolling context window: concatenating it duplicates old words and builds lag.
    if (inFlight.current) { pending.current = utterance; return; }
    inFlight.current = true;
    const turn = epoch.current;
    const ctl = new AbortController(); request.current = ctl;
    const timeout = setTimeout(() => ctl.abort(), 50000);
    setBusy(true); setError(''); if (!immediate) setStatus('Composing a visual from your document…');
    try {
      const result = await composeLive(latest.current.project, utterance, ctl.signal);
      if (epoch.current !== turn || ctl.signal.aborted || (sequence.current !== version && (!topicKey || currentTopic.current !== topicKey))) return;
      if (result.supported) {
        latest.current.onScene(result.project, utterance, 'refined');
        refinedTopic.current = topicKey;
        setStatus(`Canvas updated · source pages ${[...new Set(result.project.concepts.flatMap(c => c.sources.map(s => s.page)))].join(', ')}`);
      } else setStatus(immediate ? 'Canvas updated · source match retained' : 'No supporting material found in this document. Keeping the current visual.');
    } catch (e) {
      if (epoch.current === turn && sequence.current === version) {
        setError(ctl.signal.aborted ? 'The visual took too long. Try a shorter explanation.' : e instanceof Error ? e.message : 'Could not compose a visual.');
        setStatus('Your last visual is preserved.'); pending.current = '';
      }
    } finally {
      clearTimeout(timeout);
      if (epoch.current === turn) {
        inFlight.current = false; request.current = null; setBusy(false);
        const next = pending.current; pending.current = '';
        if (next) void send(next);
      }
    }
  }, []);

  const loadSpeech = useCallback(async () => {
    if (speechPhase === 'loading') return;
    setSpeechPhase('loading'); setError(''); setSpeechProgress('Downloading and warming local Whisper…');
    audioQueue.current?.clear(); audioQueue.current = null;
    speech.current?.dispose();
    const client = new WorkerClient(new Worker(new URL('../workers/speech.worker.ts', import.meta.url), { type: 'module' }), setSpeechProgress);
    speech.current = client;
    try {
      await client.request({ type: 'init-speech', model: 'Xenova/whisper-tiny.en', backend: 'wasm' });
      if (speech.current === client) { setSpeechPhase('ready'); setSpeechProgress('Local Whisper ready. Audio stays on this device.'); }
    } catch (e) {
      if (speech.current === client) { setSpeechPhase('failed'); setError(e instanceof Error ? e.message : 'Could not load the voice model. Use typed input.'); }
    }
  }, [speechPhase]);

  const start = useCallback(async () => {
    if (speechPhase !== 'ready' || !speech.current || !latest.current.project.knowledgeBase || active.current) return;
    const turn = ++epoch.current;
    const client = speech.current;
    active.current = true; setListening(true); setOpening(true); setError('');
    setStatus('Opening microphone…');
    const mic = new MicrophoneCapture(); microphone.current = mic;
    const queue = audioQueue.current ?? new LatestQueue<{ pcm: Float32Array; epoch: number }, { text: string }>(
      async item => {
        if (!active.current || item.epoch !== epoch.current) return { text: '' };
        setTranscribing(true);
        const reply = await client.request({ type: 'transcribe', pcm: item.pcm }, [item.pcm.buffer as ArrayBuffer]);
        if (reply.type !== 'transcript') throw new Error('Unexpected speech worker response.');
        return reply;
      },
      (result, item) => {
        if (!active.current || item.epoch !== epoch.current) return;
        setTranscribing(false);
        const fresh = deduplicate(previous.current, result.text); previous.current = result.text;
        if (!fresh.trim()) return;
        context.current = `${context.current} ${fresh}`.trim().split(/\s+/).slice(-35).join(' ');
        void compose(context.current);
      },
      e => { if (active.current) { stop(); setSpeechPhase('failed'); setError(e instanceof Error ? e.message : 'Transcription failed. Try typed input.'); } },
    );
    audioQueue.current = queue;
    try {
      await mic.start((pcm) => { if (active.current && epoch.current === turn) queue.push({ pcm, epoch: turn }); },
        value => { if (epoch.current === turn) setLevel(value); },
        () => {}, // A pause preserves captured speech and the canvas.
        message => { if (epoch.current === turn) { stop(); setError(message); } });
      if (epoch.current === turn && active.current) { setOpening(false); setListening(true); setStatus('Listening locally. Explain any part of your document.'); }
    } catch (e) {
      if (epoch.current === turn) { stop(); setError(e instanceof Error ? e.message : 'Microphone access failed. Use typed input.'); }
    }
  }, [speechPhase, compose, stop]);
  return { listening, opening, busy, transcript, status, error, speechPhase, speechProgress, level, transcribing, loadSpeech, start, stop, compose };
}
export type LivePresentation = ReturnType<typeof useLivePresentation>;
