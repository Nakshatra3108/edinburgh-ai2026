import { describe, expect, it } from "vitest";
import {
  Chunker,
  deduplicate,
  resample,
  rms,
} from "../../apps/web/src/audio/pcm";
import { LatestQueue } from "../../apps/web/src/audio/latest-queue";
describe("audio boundary behavior", () => {
  it("resamples actual PCM rate and preserves amplitude", () => {
    const input = new Float32Array(48_000).fill(0.25);
    const output = resample(input, 48_000);
    expect(output.length).toBe(16_000);
    expect(rms(output)).toBeCloseTo(0.25);
  });
  it("holds exact overlap and clears at reset", () => {
    const chunker = new Chunker(6, 2);
    expect(chunker.push(new Float32Array([1, 2, 3]))).toEqual([]);
    expect(Array.from(chunker.push(new Float32Array([4, 5, 6]))[0])).toEqual([
      1, 2, 3, 4, 5, 6,
    ]);
    expect(
      Array.from(chunker.push(new Float32Array([7, 8, 9, 10]))[0]),
    ).toEqual([5, 6, 7, 8, 9, 10]);
    chunker.clear();
    expect(chunker.push(new Float32Array([11]))).toEqual([]);
  });
  it("does not duplicate overlapping words or reveal a repeated final chunk", () => {
    expect(
      deduplicate(
        "We capture audio in the browser.",
        "in the browser then match meaning",
      ),
    ).toBe("then match meaning");
    expect(deduplicate("Capture the audio.", "capture the audio")).toBe("");
    expect(deduplicate("Old words", "new topic")).toBe("new topic");
  });
  it("does not infer voice activity from an empty buffer", () => {
    expect(rms(new Float32Array())).toBe(0);
  });
});
describe("bounded inference queue", () => {
  it("executes the in-flight item and newest pending item only", async () => {
    const completed: number[] = [],
      started: number[] = [];
    let release!: () => void;
    const wait = new Promise<void>((resolve) => {
      release = resolve;
    });
    const queue = new LatestQueue<number, number>(
      async (item) => {
        started.push(item);
        if (item === 1) await wait;
        return item;
      },
      (result) => completed.push(result),
      (error) => {
        throw error;
      },
    );
    queue.push(1);
    queue.push(2);
    queue.push(3);
    release();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(started).toEqual([1, 3]);
    expect(completed).toEqual([1, 3]);
  });
  it("suppresses late inference after mute/reset while letting new work continue", async () => {
    const completed: number[] = [];
    let release!: () => void;
    const wait = new Promise<void>((resolve) => {
      release = resolve;
    });
    const queue = new LatestQueue<number, number>(
      async (item) => {
        if (item === 1) await wait;
        return item;
      },
      (result) => completed.push(result),
      (error) => {
        throw error;
      },
    );
    queue.push(1);
    queue.push(2);
    queue.clear();
    queue.push(3);
    release();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(completed).toEqual([3]);
  });
});
