import { afterEach, describe, expect, it, vi } from "vitest";
import { manifestSchema } from "@follow/shared";
import fixture from "../../demo/speech-fixture.json";
import type { Response } from "../../apps/web/src/workers/protocol";
const harness = vi.hoisted(() => ({
  score: undefined as undefined | (() => Promise<Response>),
  micStop: vi.fn(),
  cancelled: false,
  transcribe: undefined as undefined | (() => Promise<Response>),
  onChunk: undefined as
    | undefined
    | ((pcm: Float32Array, capturedAt: number) => void),
  onSilence: undefined as undefined | (() => void),
}));
vi.mock("../../apps/web/src/workers/rpc", () => ({
  WorkerClient: class {
    async request(payload: { type: string }) {
      if (payload.type === "score") return harness.score!();
      if (payload.type === "transcribe") return harness.transcribe!();
      return { id: 1, type: "ready" };
    }
    dispose() {}
  },
}));
vi.mock("../../apps/web/src/audio/capture", () => ({
  MicrophoneCapture: class {
    async start(
      onChunk: (pcm: Float32Array, capturedAt: number) => void,
      _onLevel: (level: number) => void,
      onSilence: () => void,
    ) {
      harness.onChunk = onChunk;
      harness.onSilence = onSilence;
    }
    stop() {
      harness.micStop();
    }
  },
  decodeRecording: vi.fn(),
}));
import { SpeechMatchingSession } from "../../apps/web/src/matching/session";
const manifest = manifestSchema.parse(fixture);
const response: Response = {
  id: 1,
  type: "scores",
  ms: 5,
  scores: manifest.concepts.map((c) => ({
    conceptId: c.id,
    score: c.id === "problem" ? 0.8 : 0.1,
    details: [],
  })),
};
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
afterEach(() => {
  vi.unstubAllGlobals();
  harness.micStop.mockClear();
  harness.score = undefined;
  harness.transcribe = undefined;
  harness.onChunk = undefined;
  harness.onSilence = undefined;
});
describe("Person C runtime handoff", () => {
  it("finishes speech during a pause and preserves a stable suggestion through silence", async () => {
    vi.stubGlobal("Worker", class {});
    harness.score = async () => response;
    let finishSpeech!: (result: Response) => void;
    harness.transcribe = () =>
      new Promise((resolve) => {
        finishSpeech = resolve;
      });
    const runtime = new SpeechMatchingSession(manifest);
    await runtime.loadEmbeddings();
    await runtime.loadSpeech("Xenova/whisper-small.en", "wasm");
    await runtime.startMicrophone();
    harness.onChunk!(new Float32Array(56_000), performance.now());
    expect(runtime.getSnapshot().transcribing).toBe(true);
    harness.onSilence!();
    finishSpeech({
      id: 1,
      type: "transcript",
      text: "Speakers follow a fixed sequence of slides",
      ms: 6000,
    });
    await settle();
    expect(runtime.getSnapshot().transcript).toContain("Speakers follow");
    expect(runtime.getSnapshot().latestSpeech).toContain("Speakers follow");
    expect(runtime.getSnapshot().candidate?.stable).toBe(false);
    harness.onChunk!(new Float32Array(56_000), performance.now());
    harness.onSilence!();
    finishSpeech({
      id: 2,
      type: "transcript",
      text: "Operating the slide deck interrupts the explanation",
      ms: 6000,
    });
    await settle();
    expect(runtime.getSnapshot().candidate).toMatchObject({
      stable: true,
      action: { type: "FOCUS", conceptId: "problem" },
    });
    harness.onSilence!();
    expect(runtime.getSnapshot().candidate?.stable).toBe(true);
    expect(runtime.getSnapshot().audioChunks).toBe(2);
    expect(runtime.getSnapshot().silences).toBe(3);
    runtime.accept();
    expect(runtime.getSnapshot().activeId).toBe("problem");
    runtime.dispose();
  });
  it("still discards unfinished microphone speech after the user stops capture", async () => {
    vi.stubGlobal("Worker", class {});
    harness.score = async () => response;
    let finishSpeech!: (result: Response) => void;
    harness.transcribe = () =>
      new Promise((resolve) => {
        finishSpeech = resolve;
      });
    const runtime = new SpeechMatchingSession(manifest);
    await runtime.loadEmbeddings();
    await runtime.loadSpeech("Xenova/whisper-tiny.en", "wasm");
    await runtime.startMicrophone();
    harness.onChunk!(new Float32Array(56_000), performance.now());
    runtime.stop();
    finishSpeech({
      id: 1,
      type: "transcript",
      text: "Discard old speech",
      ms: 6000,
    });
    await settle();
    expect(runtime.getSnapshot()).toMatchObject({
      transcript: "",
      latestSpeech: "",
      candidate: null,
      transcribing: false,
    });
    runtime.dispose();
  });
  it("suppresses a late embedding result after stop invalidates its epoch", async () => {
    vi.stubGlobal("Worker", class {});
    let release!: (response: Response) => void;
    harness.score = () =>
      new Promise((resolve) => {
        release = resolve;
      });
    const runtime = new SpeechMatchingSession(manifest);
    await runtime.loadEmbeddings();
    runtime.submit("Speakers operate fixed slide decks");
    runtime.stop();
    release(response);
    await settle();
    expect(runtime.getSnapshot().epoch).toBe(1);
    expect(runtime.getSnapshot().candidate).toBeNull();
    expect(runtime.getSnapshot().events).toEqual([]);
    runtime.dispose();
  });
  it("emits versioned candidates, accepts only current suggestions, and restarts evidence after stop", async () => {
    vi.stubGlobal("Worker", class {});
    harness.score = async () => response;
    const runtime = new SpeechMatchingSession(manifest),
      events: unknown[] = [];
    runtime.onCandidate((event) => events.push(event));
    await runtime.loadEmbeddings();
    runtime.submit("A fixed slide sequence");
    await settle();
    expect(runtime.getSnapshot().candidate?.stable).toBe(false);
    runtime.submit("Slide operation interrupts explanation");
    await settle();
    const candidate = runtime.getSnapshot().candidate!;
    expect(candidate).toMatchObject({
      version: 1,
      epoch: 0,
      seq: 2,
      projectId: manifest.id,
      revision: 1,
      input: "typed",
      stable: true,
    });
    runtime.accept({ ...candidate, revision: 2 });
    expect(runtime.getSnapshot().activeId).toBeNull();
    runtime.stop();
    runtime.accept(candidate);
    expect(runtime.getSnapshot().activeId).toBeNull();
    runtime.submit("We search a deck while talking");
    await settle();
    expect(runtime.getSnapshot().candidate).toMatchObject({
      epoch: 1,
      seq: 3,
      stable: false,
    });
    expect(events).toHaveLength(3);
    runtime.dispose();
  });
  it("releases microphone tracks through capture cleanup when stopping", async () => {
    vi.stubGlobal("Worker", class {});
    const runtime = new SpeechMatchingSession(manifest);
    await runtime.loadEmbeddings();
    await runtime.loadSpeech("Xenova/whisper-tiny.en", "wasm");
    await runtime.startMicrophone();
    expect(runtime.getSnapshot().capture).toBe("active");
    runtime.stop();
    expect(harness.micStop).toHaveBeenCalled();
    expect(runtime.getSnapshot().capture).toBe("off");
    runtime.dispose();
  });
  it("can reset to manual context while stopping capture and rejects nonexistent context", async () => {
    vi.stubGlobal("Worker", class {});
    const runtime = new SpeechMatchingSession(manifest);
    await runtime.loadEmbeddings();
    await runtime.loadSpeech("Xenova/whisper-tiny.en", "wasm");
    await runtime.startMicrophone();
    runtime.reset("Manual override", "architecture");
    expect(runtime.getSnapshot()).toMatchObject({
      capture: "off",
      activeId: "architecture",
      candidate: null,
    });
    expect(harness.micStop).toHaveBeenCalled();
    expect(() => runtime.reset("Invalid context", "missing")).toThrow();
    runtime.dispose();
  });
});
