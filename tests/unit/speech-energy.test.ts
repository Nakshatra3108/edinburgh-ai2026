import { describe, expect, it } from "vitest";
import { speechEnergy } from "../../apps/web/src/audio/pcm";

describe("speech-aware microphone gate", () => {
  it("keeps a quiet voice burst that whole-window RMS would discard", () => {
    const pcm = new Float32Array(56_000);
    for (let i = 16_000; i < 22_400; i++)
      pcm[i] = Math.sin((i * Math.PI) / 20) * 0.006;

    const energy = speechEnergy(pcm);
    expect(energy.rms).toBeLessThan(0.008);
    expect(energy.voicedFrameRatio).toBeGreaterThan(0.03);
    expect(energy.voiced).toBe(true);
  });

  it("continues to reject silence and tiny background noise", () => {
    const pcm = new Float32Array(56_000);
    for (let i = 0; i < pcm.length; i++)
      pcm[i] = Math.sin((i * Math.PI) / 20) * 0.001;

    expect(speechEnergy(pcm).voiced).toBe(false);
  });
});
