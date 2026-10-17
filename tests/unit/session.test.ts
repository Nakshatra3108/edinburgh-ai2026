import { afterEach, describe, expect, it, vi } from "vitest";
import { manifestSchema } from "@follow/shared";
import fixture from "../../demo/speech-fixture.json";
import type { Response } from "../../apps/web/src/workers/protocol";
const harness = vi.hoisted(() => ({
  score: undefined as undefined | (() => Promise<Response>),
  micStop: vi.fn(),
  cancelled: false,
}));
vi.mock("../../apps/web/src/workers/rpc", () => ({
  WorkerClient: class {
    async request(payload: { type: string }) {
      if (payload.type === "score") return harness.score!();
      return { id: 1, type: "ready" };
    }
    dispose() {}
  },
}));
vi.mock("../../apps/web/src/audio/capture", () => ({
  MicrophoneCapture: class {
    async start() {}
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
});
describe("Person C runtime handoff", () => {
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
