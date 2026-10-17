import {
  candidateSchema,
  type CandidateEvent,
  type CanvasAction,
  type InputKind,
  type MatchingManifest,
} from "@follow/shared";
import { WorkerClient } from "../workers/rpc";
import type { Backend, SpeechModel } from "../workers/protocol";
import { Matcher, isFiller, type Score } from "./matcher";
import { LatestQueue } from "../audio/latest-queue";
import { Chunker, deduplicate, speechEnergy } from "../audio/pcm";
import { decodeRecording, MicrophoneCapture } from "../audio/capture";

type ModelState = "absent" | "loading" | "ready" | "failed";
export interface Observation {
  seq: number;
  epoch: number;
  pcm: Float32Array;
  capturedAt: number;
  input: "microphone" | "recording";
}
interface TextObservation {
  seq: number;
  epoch: number;
  text: string;
  input: InputKind;
  startedAt: number;
}
export interface LabState {
  embeddings: ModelState;
  speech: ModelState;
  embeddingProgress: string;
  speechProgress: string;
  capture: "off" | "requesting" | "active";
  input: InputKind;
  level: number;
  loadedSpeech: string | null;
  catchingUp: boolean;
  scoring: boolean;
  recording: boolean;
  error: string | null;
  candidate: CandidateEvent | null;
  events: CandidateEvent[];
  scores: Score[];
  asrMs: number | null;
  matchingMs: number | null;
  responseMs: number | null;
  epoch: number;
  activeId: string | null;
  accepted: CanvasAction | null;
  transcript: string;
  silences: number;
  audioChunks: number;
  transcribing: boolean;
  latestSpeech: string;
}

/** Person C handoff: subscribe to versioned candidates; D owns policy and calls accept/reset. */
export class SpeechMatchingSession {
  private listeners = new Set<() => void>();
  private candidateListeners = new Set<(event: CandidateEvent) => void>();
  private state: LabState = {
    embeddings: "absent",
    speech: "absent",
    loadedSpeech: null,
    embeddingProgress: "",
    speechProgress: "",
    capture: "off",
    input: "typed",
    level: 0,
    catchingUp: false,
    scoring: false,
    recording: false,
    error: null,
    candidate: null,
    events: [],
    scores: [],
    asrMs: null,
    matchingMs: null,
    responseMs: null,
    epoch: 0,
    activeId: null,
    accepted: null,
    transcript: "",
    silences: 0,
    audioChunks: 0,
    transcribing: false,
    latestSpeech: "",
  };
  private matcher: Matcher;
  private embeddingClient?: WorkerClient;
  private speechClient?: WorkerClient;
  private microphone?: MicrophoneCapture;
  private seq = 0;
  private context = "";
  private previousTranscript = "";
  private audioQueue: LatestQueue<Observation, { text: string; ms: number }>;
  private textQueue: LatestQueue<
    TextObservation,
    { scores: Score[]; ms: number; context: string }
  >;
  constructor(readonly manifest: MatchingManifest) {
    this.matcher = new Matcher(manifest);
    this.audioQueue = new LatestQueue<
      Observation,
      { text: string; ms: number }
    >(
      async (item) => {
        this.update({ transcribing: true });
        const reply = await this.speechClient!.request(
          { type: "transcribe", pcm: item.pcm },
          [item.pcm.buffer as ArrayBuffer],
        );
        if (reply.type !== "transcript")
          throw new Error("Unexpected speech worker response");
        return reply;
      },
      (result, item) => {
        if (item.epoch !== this.state.epoch) return;
        const text = deduplicate(this.previousTranscript, result.text);
        this.previousTranscript = result.text;
        this.update({
          asrMs: result.ms,
          transcribing: false,
          latestSpeech: result.text,
        });
        console.info("[FOLLOW ASR]", {
          modelInput: item.input,
          epoch: item.epoch,
          seq: item.seq,
          inferenceMs: Math.round(result.ms),
          chunkSeconds: 3.5,
        });
        if (text)
          this.textQueue.push({ ...item, text, startedAt: item.capturedAt });
      },
      (error) => {
        this.update({ transcribing: false });
        this.fail(error);
      },
      (catchingUp) => this.update({ catchingUp }),
    );
    this.textQueue = new LatestQueue<
      TextObservation,
      { scores: Score[]; ms: number; context: string }
    >(
      async (item) => {
        this.update({ scoring: true });
        // Filler/negation are evaluated alone, so stale context cannot turn them into a confident topic.
        const context = isFiller(item.text)
          ? item.text
          : `${this.context} ${item.text}`
              .trim()
              .split(/\s+/)
              .slice(-24)
              .join(" ");
        const reply = await this.embeddingClient!.request({
          type: "score",
          text: item.text,
          context,
        });
        if (reply.type !== "scores")
          throw new Error("Unexpected embedding worker response");
        return { ...reply, context };
      },
      (result, item) => {
        if (item.epoch !== this.state.epoch) return;
        this.publish(item, result.scores, result.ms, result.context);
      },
      (error) => this.fail(error),
      (scoring) => this.update({ scoring }),
    );
  }
  getSnapshot = () => this.state;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  onCandidate(listener: (event: CandidateEvent) => void) {
    this.candidateListeners.add(listener);
    return () => {
      this.candidateListeners.delete(listener);
    };
  }
  private update(patch: Partial<LabState>) {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((fn) => fn());
  }
  private fail(error: unknown) {
    this.update({
      error: error instanceof Error ? error.message : String(error),
    });
  }
  private publish(
    item: TextObservation,
    scores: Score[],
    ms: number,
    context: string,
  ) {
    this.context = context;
    const decision = this.matcher.decide(item.text, scores, item.seq, context);
    const event = candidateSchema.parse({
      version: 1,
      projectId: this.manifest.id,
      revision: this.manifest.revision,
      epoch: item.epoch,
      seq: item.seq,
      input: item.input,
      text: item.text,
      ...decision,
      createdAt: Date.now(),
      matchingMs: ms,
    });
    this.update({
      candidate: event,
      events: [...this.state.events.slice(-99), event],
      scores,
      matchingMs: ms,
      responseMs: performance.now() - item.startedAt,
      transcript: `${this.state.transcript} ${item.text}`.trim().slice(-4000),
    });
    for (const listener of this.candidateListeners) listener(event);
  }
  clearError() {
    this.update({ error: null });
  }
  async loadEmbeddings() {
    if (
      this.state.embeddings === "loading" ||
      this.state.embeddings === "ready"
    )
      return;
    this.update({
      embeddings: "loading",
      embeddingProgress: "Starting embedding worker…",
      error: null,
    });
    this.embeddingClient?.dispose();
    const client = new WorkerClient(
      new Worker(new URL("../workers/embeddings.worker.ts", import.meta.url), {
        type: "module",
      }),
      (message) => this.update({ embeddingProgress: message }),
    );
    this.embeddingClient = client;
    try {
      await client.request({
        type: "init-embeddings",
        manifest: this.manifest,
      });
      if (client === this.embeddingClient)
        this.update({
          embeddings: "ready",
          embeddingProgress: "Ready · normalized mean pooling · q8 / WASM",
        });
    } catch (error) {
      if (client === this.embeddingClient) {
        client.dispose();
        this.update({ embeddings: "failed" });
        this.fail(error);
      }
    }
  }
  async loadSpeech(model: SpeechModel, backend: Backend) {
    if (this.state.speech === "loading") return;
    this.stop();
    this.update({
      speech: "loading",
      loadedSpeech: null,
      speechProgress: "Downloading and warming Whisper…",
      error: null,
    });
    this.speechClient?.dispose();
    const client = new WorkerClient(
      new Worker(new URL("../workers/speech.worker.ts", import.meta.url), {
        type: "module",
      }),
      (message) => this.update({ speechProgress: message }),
    );
    this.speechClient = client;
    try {
      await client.request({ type: "init-speech", model, backend });
      if (client === this.speechClient)
        this.update({
          speech: "ready",
          loadedSpeech: `${model}:${backend}`,
          speechProgress: `Ready · ${model} · q8 / ${backend}`,
        });
    } catch (error) {
      if (client === this.speechClient) {
        client.dispose();
        this.update({ speech: "failed" });
        this.fail(error);
      }
    }
  }
  /** Invalidate pending work on input changes, override, mute, resume, or model revision changes. */
  reset(reason = "Fresh decision window", activeId = this.state.activeId) {
    if (
      activeId &&
      !this.manifest.concepts.some(
        (c) => c.id === activeId && c.enabled && c.review !== "needs-review",
      )
    )
      throw new Error(
        "Active context must reference an enabled, reviewed concept",
      );
    this.microphone?.stop();
    this.microphone = undefined;
    this.audioQueue.clear();
    this.textQueue.clear();
    this.context = "";
    this.previousTranscript = "";
    this.matcher.reset(activeId);
    this.update({
      epoch: this.state.epoch + 1,
      activeId,
      capture: "off",
      level: 0,
      candidate: null,
      scores: [],
      scoring: false,
      recording: false,
      responseMs: null,
      transcribing: false,
      embeddingProgress:
        this.state.embeddings === "ready"
          ? reason
          : this.state.embeddingProgress,
    });
  }
  stop() {
    this.reset();
  }
  submit(text: string) {
    if (this.state.embeddings !== "ready" || !text.trim()) return;
    if (this.state.input !== "typed" || this.state.capture !== "off")
      this.stop();
    this.update({ input: "typed", error: null });
    const boundedText = text.trim().split(/\s+/).slice(-24).join(" ");
    this.textQueue.push({
      text: boundedText,
      seq: ++this.seq,
      epoch: this.state.epoch,
      input: "typed",
      startedAt: performance.now(),
    });
  }
  async startMicrophone() {
    if (
      this.state.speech !== "ready" ||
      this.state.embeddings !== "ready" ||
      this.state.capture !== "off"
    )
      return;
    this.stop();
    const epoch = this.state.epoch,
      mic = new MicrophoneCapture();
    this.microphone = mic;
    this.update({ capture: "requesting", input: "microphone", error: null });
    try {
      await mic.start(
        (pcm, capturedAt) => {
          if (epoch === this.state.epoch) {
            this.update({ audioChunks: this.state.audioChunks + 1 });
            this.audioQueue.push({
              pcm,
              capturedAt,
              epoch,
              seq: ++this.seq,
              input: "microphone",
            });
          }
        },
        (level) => this.update({ level }),
        () => {
          if (epoch !== this.state.epoch) return;
          // Silence isn't mute: let already captured speech finish, and leave
          // a valid suggestion visible for the presenter to accept.
          this.update({ silences: this.state.silences + 1 });
        },
        (message) => {
          this.stop();
          this.fail(new Error(message));
        },
      );
      if (epoch === this.state.epoch) this.update({ capture: "active" });
    } catch (error) {
      if (epoch === this.state.epoch) {
        this.stop();
        this.fail(error);
      }
    }
  }
  async recording(file: File) {
    if (this.state.speech !== "ready" || this.state.embeddings !== "ready")
      return;
    this.stop();
    const epoch = this.state.epoch;
    this.update({ input: "recording", recording: true, error: null });
    try {
      const pcm = await decodeRecording(file);
      const chunker = new Chunker();
      const chunks = chunker.push(pcm);
      if (!chunks.length) chunks.push(pcm);
      else {
        // Flush the final partial window, retaining its overlap for token alignment.
        const consumed = chunks.length * 48_000;
        if (pcm.length > consumed + 8_000) chunks.push(pcm.slice(consumed));
      }
      for (const chunk of chunks) {
        if (epoch !== this.state.epoch) return;
        if (!speechEnergy(chunk).voiced) continue;
        const start = performance.now();
        const reply = await this.speechClient!.request(
          { type: "transcribe", pcm: chunk },
          [chunk.buffer as ArrayBuffer],
        );
        if (epoch !== this.state.epoch) return;
        if (reply.type !== "transcript")
          throw new Error("Unexpected speech response");
        const text = deduplicate(this.previousTranscript, reply.text);
        this.previousTranscript = reply.text;
        this.update({ asrMs: reply.ms });
        if (text) {
          // Recordings intentionally process every chunk sequentially; live audio uses the bounded queue.
          const context = `${this.context} ${text}`
            .trim()
            .split(/\s+/)
            .slice(-24)
            .join(" ");
          const scores = await this.embeddingClient!.request({
            type: "score",
            text,
            context,
          });
          if (epoch !== this.state.epoch) return;
          if (scores.type !== "scores")
            throw new Error("Unexpected embedding response");
          this.publish(
            {
              seq: ++this.seq,
              epoch,
              input: "recording",
              text,
              startedAt: start,
            },
            scores.scores,
            scores.ms,
            context,
          );
        }
      }
    } catch (error) {
      if (epoch === this.state.epoch) this.fail(error);
    } finally {
      if (epoch === this.state.epoch) this.update({ recording: false });
    }
  }
  accept(event = this.state.candidate) {
    if (
      !event ||
      !event.stable ||
      event.action.type === "HOLD" ||
      event.version !== 1 ||
      event.projectId !== this.manifest.id ||
      event.revision !== this.manifest.revision ||
      event.epoch !== this.state.epoch ||
      event.seq !== this.state.candidate?.seq
    )
      return;
    this.matcher.commit(event.action);
    this.update({
      accepted: event.action,
      activeId:
        event.action.type === "FOCUS"
          ? event.action.conceptId
          : this.state.activeId,
      candidate: null,
    });
  }
  async rank(text: string): Promise<Score[]> {
    if (this.state.embeddings !== "ready")
      throw new Error("Load embeddings first");
    const reply = await this.embeddingClient!.request({ type: "score", text });
    if (reply.type !== "scores")
      throw new Error("Unexpected embedding response");
    return reply.scores.sort((a, b) => b.score - a.score);
  }
  resetModels() {
    this.stop();
    this.embeddingClient?.dispose();
    this.speechClient?.dispose();
    this.embeddingClient = undefined;
    this.speechClient = undefined;
    this.update({
      embeddings: "absent",
      speech: "absent",
      loadedSpeech: null,
      embeddingProgress: "",
      speechProgress: "",
      error: null,
    });
  }
  dispose() {
    this.stop();
    this.embeddingClient?.dispose();
    this.speechClient?.dispose();
    this.embeddingClient = undefined;
    this.speechClient = undefined;
    this.listeners.clear();
    this.candidateListeners.clear();
  }
}
