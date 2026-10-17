export function rms(samples: Float32Array): number {
  return samples.length
    ? Math.sqrt(samples.reduce((sum, x) => sum + x * x, 0) / samples.length)
    : 0;
}

export interface SpeechEnergy {
  rms: number;
  peakFrameRms: number;
  voicedFrameRatio: number;
  voiced: boolean;
}

/** Detect speech in short frames so pauses do not hide a quiet voice. */
export function speechEnergy(
  samples: Float32Array,
  sampleRate = 16_000,
): SpeechEnergy {
  const frameSize = Math.max(1, Math.round(sampleRate * 0.02));
  let peakFrameRms = 0;
  let voicedFrames = 0;
  let frames = 0;
  for (let offset = 0; offset < samples.length; offset += frameSize) {
    const frameRms = rms(samples.subarray(offset, offset + frameSize));
    peakFrameRms = Math.max(peakFrameRms, frameRms);
    if (frameRms >= 0.0025) voicedFrames++;
    frames++;
  }
  const voicedFrameRatio = frames ? voicedFrames / frames : 0;
  return {
    rms: rms(samples),
    peakFrameRms,
    voicedFrameRatio,
    voiced: peakFrameRms >= 0.004 && voicedFrameRatio >= 0.03,
  };
}
export function resample(
  input: Float32Array,
  from: number,
  to = 16_000,
): Float32Array {
  if (from === to) return input.slice();
  if (from <= 0 || to <= 0) throw new Error("Invalid sample rate");
  const output = new Float32Array(Math.floor((input.length * to) / from));
  // Area averaging is a cheap low-pass when downsampling; never reinterpret 48 kHz as 16 kHz.
  for (let i = 0; i < output.length; i++) {
    const begin = (i * from) / to,
      end = Math.min(((i + 1) * from) / to, input.length);
    let sum = 0;
    for (let j = Math.floor(begin); j < Math.ceil(end); j++)
      sum +=
        input[Math.min(j, input.length - 1)] *
        Math.max(0, Math.min(j + 1, end) - Math.max(j, begin));
    output[i] = sum / (end - begin);
  }
  return output;
}
export function deduplicate(previous: string, next: string): string {
  const prior = previous.trim().split(/\s+/),
    current = next.trim().split(/\s+/);
  const clean = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  for (let size = Math.min(prior.length, current.length, 30); size > 0; size--)
    if (
      prior.slice(-size).map(clean).join(" ") ===
      current.slice(0, size).map(clean).join(" ")
    )
      return current.slice(size).join(" ");
  return next.trim();
}
export class Chunker {
  private buffer = new Float32Array(0);
  constructor(
    private size = 56_000,
    private overlap = 8_000,
  ) {}
  push(pcm: Float32Array): Float32Array[] {
    const joined = new Float32Array(this.buffer.length + pcm.length);
    joined.set(this.buffer);
    joined.set(pcm, this.buffer.length);
    this.buffer = joined;
    const chunks: Float32Array[] = [];
    while (this.buffer.length >= this.size) {
      chunks.push(this.buffer.slice(0, this.size));
      this.buffer = this.buffer.slice(this.size - this.overlap);
    }
    return chunks;
  }
  clear() {
    this.buffer = new Float32Array(0);
  }
}
