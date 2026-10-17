import { useEffect, useState, useSyncExternalStore } from "react";
import { manifestSchema } from "@follow/shared";
import fixture from "../../../demo/speech-fixture.json";
import phrases from "../../../demo/phrases.json";
import { SpeechMatchingSession } from "./matching/session";
import { defaults, isFiller } from "./matching/matcher";
import type { Backend, SpeechModel } from "./workers/protocol";

const manifest = manifestSchema.parse(fixture);
const formatMs = (value: number | null) =>
  value === null ? "—" : `${Math.round(value).toLocaleString()} ms`;
function download(name: string, value: unknown) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(value, null, 2)], { type: "application/json" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function App() {
  const [session] = useState(() => new SpeechMatchingSession(manifest));
  const state = useSyncExternalStore(session.subscribe, session.getSnapshot);
  const [text, setText] = useState(
    "Speakers have to follow a fixed sequence of slides.",
  );
  const [model, setModel] = useState<SpeechModel>("Xenova/whisper-small.en");
  const [backend, setBackend] = useState<Backend>("wasm");
  const [evaluating, setEvaluating] = useState(false);
  const [evaluation, setEvaluation] = useState<
    {
      text: string;
      expected: string | null;
      predicted: string | null;
      score: number;
      correct: boolean;
    }[]
  >([]);
  const [evalProgress, setEvalProgress] = useState("");
  const [evalError, setEvalError] = useState("");
  useEffect(() => () => session.dispose(), [session]);
  const loading = state.embeddings === "loading" || state.speech === "loading";
  const speechMatches =
    state.speech === "ready" && state.loadedSpeech === `${model}:${backend}`;
  const busy = state.capture !== "off" || state.recording || evaluating;
  const active = manifest.concepts.find((c) => c.id === state.activeId);
  const candidate = state.candidate;
  async function evaluate() {
    session.stop();
    setEvaluating(true);
    setEvaluation([]);
    setEvalError("");
    const results: typeof evaluation = [];
    try {
      for (const [i, phrase] of phrases.entries()) {
        setEvalProgress(`Scoring ${i + 1} / ${phrases.length}`);
        const scores = await session.rank(phrase.text);
        const first = scores[0],
          margin = (first?.score ?? 0) - (scores[1]?.score ?? 0);
        const predicted =
          !isFiller(phrase.text) &&
          first &&
          first.score >= defaults.threshold &&
          margin >= defaults.margin
            ? first.conceptId
            : null;
        results.push({
          text: phrase.text,
          expected: phrase.expected,
          predicted,
          score: first?.score ?? 0,
          correct: predicted === phrase.expected,
        });
      }
      setEvaluation(results);
      setEvalProgress("");
    } catch (error) {
      setEvalError(error instanceof Error ? error.message : String(error));
    } finally {
      setEvaluating(false);
    }
  }
  return (
    <div className="app">
      <header className="header">
        <a href="#main" className="wordmark">
          FOLLOW
          <span className="trace" />
        </a>
        <span className="header-divider" />
        <span className="header-label">SPEECH LAB</span>
        <span className="local-tag">
          <span /> LOCAL INFERENCE
        </span>
      </header>
      <main id="main">
        <div className="intro">
          <div>
            <p className="eyebrow">PERSON C / WORKBENCH 01</p>
            <h1>Let the explanation lead.</h1>
            <p className="intro-copy">
              Test the meaning first. Then connect your voice.
            </p>
          </div>
          <div className="fixture-note">
            ILLUSTRATIVE FIXTURE
            <span>
              Six concepts about FOLLOW.
              <br />
              No source PDF attached.
            </span>
          </div>
        </div>
        {state.error && (
          <div role="alert" className="error">
            <div>
              <strong>Something needs attention.</strong>
              <br />
              {state.error}
            </div>
            <button onClick={() => session.clearError()}>Dismiss</button>
          </div>
        )}
        <div className="workspace">
          <section
            className="input-panel panel"
            aria-labelledby="input-heading"
          >
            <div className="section-heading">
              <span className="step">01</span>
              <h2 id="input-heading">Input & models</h2>
            </div>
            <div className="model-block">
              <div className="model-heading">
                <h3>Semantic matching</h3>
                <span className={`status ${state.embeddings}`}>
                  {state.embeddings === "absent"
                    ? "Not loaded"
                    : state.embeddings}
                </span>
              </div>
              <p className="model-name">all-MiniLM-L6-v2 · q8 · WASM</p>
              <button
                className="full"
                disabled={
                  state.embeddings === "loading" ||
                  state.embeddings === "ready" ||
                  evaluating
                }
                onClick={() => void session.loadEmbeddings()}
              >
                {state.embeddings === "failed"
                  ? "Retry embeddings"
                  : "Load embeddings"}
              </button>
              <p className="progress" role="status">
                {state.embeddingProgress ||
                  "Downloads on first load. No API key required."}
              </p>
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                session.submit(text);
              }}
            >
              <label htmlFor="phrase">
                Typed rehearsal{" "}
                <span className="muted">— not microphone input</span>
              </label>
              <textarea
                id="phrase"
                rows={4}
                maxLength={2000}
                value={text}
                onChange={(e) => setText(e.target.value)}
                disabled={evaluating || state.recording}
              />
              <button
                className="primary full"
                disabled={
                  state.embeddings !== "ready" ||
                  state.scoring ||
                  busy ||
                  !text.trim()
                }
                type="submit"
              >
                {state.scoring ? "Matching…" : "Match phrase"}{" "}
                <span aria-hidden="true">↗</span>
              </button>
            </form>
            <p className="hint">
              A topic change needs two different eligible observations. Try a
              second sentence about the same idea.
            </p>
            <details className="examples">
              <summary>Try a phrase</summary>
              {manifest.concepts.map((c) => (
                <button
                  key={c.id}
                  disabled={busy}
                  onClick={() => setText(c.speechExamples[0])}
                >
                  {c.title}
                  <span aria-hidden="true">↗</span>
                </button>
              ))}
            </details>
            <div className="speech-block">
              <h3>Speech recognition</h3>
              <label htmlFor="model">Whisper model</label>
              <select
                id="model"
                value={model}
                disabled={loading || busy}
                onChange={(e) => setModel(e.target.value as SpeechModel)}
              >
                <option value="Xenova/whisper-small.en">
                  Small.en — proposed model
                </option>
                <option value="Xenova/whisper-tiny.en">
                  Tiny.en — speed baseline
                </option>
              </select>
              <label htmlFor="backend">Inference backend</label>
              <select
                id="backend"
                value={backend}
                disabled={loading || busy}
                onChange={(e) => setBackend(e.target.value as Backend)}
              >
                <option value="wasm">WASM — CPU baseline</option>
                <option value="webgpu">WebGPU — test on this device</option>
              </select>
              <button
                className="full"
                disabled={loading || busy}
                onClick={() => void session.loadSpeech(model, backend)}
              >
                {state.speech === "failed"
                  ? "Retry Whisper"
                  : state.speech === "ready"
                    ? "Reload selected Whisper model"
                    : "Load & warm Whisper"}
              </button>
              <p className="progress" role="status">
                {state.speechProgress ||
                  "Small is a larger download. Benchmark after warm-up."}
              </p>
              {loading && (
                <button className="full" onClick={() => session.resetModels()}>
                  Cancel model loading
                </button>
              )}
              {state.speech === "ready" && !speechMatches && (
                <p className="hint">
                  Selection changed. Reload Whisper before testing this
                  configuration.
                </p>
              )}
              <div className="mic-row">
                <button
                  className={state.capture === "off" ? "primary" : "danger"}
                  disabled={
                    state.capture === "off" &&
                    (!speechMatches ||
                      state.embeddings !== "ready" ||
                      evaluating ||
                      state.recording)
                  }
                  onClick={() =>
                    state.capture === "off"
                      ? void session.startMicrophone()
                      : session.stop()
                  }
                >
                  {state.capture === "requesting"
                    ? "Cancel microphone"
                    : state.capture === "active"
                      ? "Stop microphone"
                      : "Start microphone"}
                </button>
                <meter
                  min="0"
                  max="0.12"
                  value={state.level}
                  aria-label="Microphone input level"
                />
              </div>
              <label className="file-label" htmlFor="recording">
                Or test a recorded clip{" "}
                <span className="muted">≤60 sec / 25 MB</span>
              </label>
              <input
                id="recording"
                type="file"
                accept="audio/*"
                disabled={
                  !speechMatches ||
                  state.embeddings !== "ready" ||
                  busy ||
                  loading
                }
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void session.recording(file);
                  e.target.value = "";
                }}
              />
            </div>
          </section>
          <div className="results-column">
            <section className="stage panel" aria-labelledby="stage-heading">
              <div className="stage-top">
                <span className="eyebrow" id="stage-heading">
                  DIAGNOSTIC PREVIEW
                </span>
                <span className="status">Suggest · accept to update</span>
              </div>
              <div className="stage-content">
                <p className="stage-kicker">
                  {active ? "ACCEPTED TOPIC" : "READY WHEN YOU ARE"}
                </p>
                <h2>{active?.title ?? "Your ideas\nset the pace."}</h2>
                <p>
                  {active?.summary ??
                    "Load embeddings, type a phrase, and see which prepared concept its meaning brings into focus."}
                </p>
                {state.accepted && state.accepted.type !== "FOCUS" && (
                  <code className="accepted-action">
                    {JSON.stringify(state.accepted)}
                  </code>
                )}
              </div>
              <div className="concept-rail">
                {manifest.concepts.map((c, i) => (
                  <span
                    key={c.id}
                    className={c.id === state.activeId ? "active" : ""}
                  >
                    <b>{String(i + 1).padStart(2, "0")}</b>
                    {c.id}
                  </span>
                ))}
              </div>
            </section>
            <section
              className="decision panel"
              aria-labelledby="decision-heading"
            >
              <div className="section-heading">
                <span className="step">02</span>
                <h2 id="decision-heading">Matching decision</h2>
                <span
                  className={`decision-badge ${candidate?.stable ? "candidate" : ""}`}
                >
                  {candidate?.action.type ?? "HOLD"}
                </span>
              </div>
              <div className="decision-summary" aria-live="polite">
                <strong>
                  {candidate
                    ? (manifest.concepts.find(
                        (c) => c.id === candidate.conceptId,
                      )?.title ?? "No topic selected")
                    : "Waiting for an observation"}
                </strong>
                <p>
                  {candidate?.reason ??
                    "Uncertain input keeps the current visual in place."}
                </p>
              </div>
              <div className="stats">
                <div>
                  <span>TOP SCORE</span>
                  <strong>
                    {candidate ? candidate.strength.toFixed(3) : "—"}
                  </strong>
                </div>
                <div>
                  <span>RUNNER-UP MARGIN</span>
                  <strong>
                    {candidate ? candidate.margin.toFixed(3) : "—"}
                  </strong>
                </div>
                <div>
                  <span>MATCHING</span>
                  <strong>{formatMs(state.matchingMs)}</strong>
                </div>
                <div>
                  <span>TRANSCRIPTION</span>
                  <strong>{formatMs(state.asrMs)}</strong>
                </div>
              </div>
              {candidate?.stable && (
                <div className="action-row">
                  <code>{JSON.stringify(candidate.action)}</code>
                  <button className="primary" onClick={() => session.accept()}>
                    Accept candidate
                  </button>
                </div>
              )}
              <div className="ranking">
                {[...state.scores]
                  .sort((a, b) => b.score - a.score)
                  .slice(0, 3)
                  .map((score) => (
                    <div className="rank" key={score.conceptId}>
                      <span>{score.conceptId}</span>
                      <div className="bar-track">
                        <div
                          style={{
                            width: `${Math.max(0, score.score) * 100}%`,
                          }}
                        />
                      </div>
                      <code>{score.score.toFixed(3)}</code>
                    </div>
                  ))}
              </div>
              <div className="decision-foot">
                <span>
                  {state.catchingUp
                    ? "Catching up · keeping newest audio only"
                    : state.capture === "active"
                      ? "Listening · 3.5 s chunks / 0.5 s overlap"
                      : state.recording
                        ? "Processing recorded audio…"
                        : "No microphone capture"}
                </span>
                <button disabled={evaluating} onClick={() => session.stop()}>
                  Reset decision window
                </button>
              </div>
              <p className="hint">
                Scores are cosine similarities, not confidence probabilities.
                Response after chunk completion: {formatMs(state.responseMs)}.
                End-of-phrase latency needs a live measurement.
              </p>
            </section>
            <section
              className="evidence panel"
              aria-labelledby="evidence-heading"
            >
              <div className="section-heading">
                <span className="step">03</span>
                <h2 id="evidence-heading">Evidence & handoff</h2>
                <button
                  disabled={!state.events.length || busy}
                  onClick={() =>
                    download("follow-session-events.json", {
                      manifestId: manifest.id,
                      revision: manifest.revision,
                      events: state.events,
                    })
                  }
                >
                  Export events
                </button>
              </div>
              <p className="transcript">
                {state.transcript ||
                  "Finalized text will appear here. Audio stays in memory; text and events are exported only when you choose."}
              </p>
              <div className="test-row">
                <div>
                  <strong>Fixture topic ranking</strong>
                  <p>
                    24 paraphrases + 6 distractors. Separate from the temporal
                    and live-microphone checks.
                  </p>
                </div>
                <button
                  disabled={
                    state.embeddings !== "ready" ||
                    busy ||
                    loading ||
                    state.scoring
                  }
                  onClick={() => void evaluate()}
                >
                  {evaluating ? "Evaluating…" : "Run phrase evaluation"}
                </button>
              </div>
              <p role="status">{evalProgress}</p>
              {evalError && (
                <p role="alert" className="error">
                  {evalError}
                </p>
              )}
              {evaluation.length > 0 && (
                <div className="evaluation">
                  <strong>
                    {
                      evaluation.filter((r) => r.expected !== null && r.correct)
                        .length
                    }{" "}
                    / 24 paraphrases correct ·{" "}
                    {
                      evaluation.filter((r) => r.expected === null && r.correct)
                        .length
                    }{" "}
                    / 6 distractors held
                  </strong>
                  <button
                    onClick={() =>
                      download("follow-ranking-evaluation.json", {
                        model: "Xenova/all-MiniLM-L6-v2",
                        defaults,
                        scope: "isolated topic ranking, not live acceptance",
                        results: evaluation,
                      })
                    }
                  >
                    Export results
                  </button>
                  <details>
                    <summary>Inspect observations</summary>
                    {evaluation.map((r, i) => (
                      <p key={i}>
                        <b>{r.correct ? "PASS" : "MISS"}</b> {r.text}
                        <br />
                        <span className="muted">
                          Expected: {r.expected ?? "HOLD"} · Predicted:{" "}
                          {r.predicted ?? "HOLD"} · {r.score.toFixed(3)}
                        </span>
                      </p>
                    ))}
                  </details>
                </div>
              )}
            </section>
          </div>
        </div>
        <footer>
          <span>FOLLOW / PERSON C</span>
          <span>
            Epoch {state.epoch} · {state.events.length} observations ·{" "}
            {state.silences} silent chunks held
          </span>
          <span>Prepared content. Local decisions.</span>
        </footer>
      </main>
    </div>
  );
}
