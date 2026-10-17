import workletUrl from "./pcm-worklet.js?url";
import { Chunker, resample, rms, speechEnergy } from "./pcm";

export class MicrophoneCapture {
  private stream?: MediaStream;
  private context?: AudioContext;
  private node?: AudioWorkletNode;
  private cancelled = false;
  async start(
    onChunk: (pcm: Float32Array, capturedAt: number) => void,
    onLevel: (level: number) => void,
    onSilence: () => void,
    onError: (message: string) => void,
  ) {
    if (!navigator.mediaDevices?.getUserMedia)
      throw new Error("Microphone capture requires localhost or HTTPS.");
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
      },
      video: false,
    });
    if (this.cancelled) {
      stream.getTracks().forEach((t) => t.stop());
      return;
    }
    this.stream = stream;
    try {
      const context = new AudioContext();
      this.context = context;
      await context.audioWorklet.addModule(workletUrl);
      if (this.cancelled) return;
      const node = new AudioWorkletNode(context, "follow-pcm");
      this.node = node;
      const chunker = new Chunker();
      node.port.onmessage = ({ data }: MessageEvent<Float32Array>) => {
        if (this.cancelled) return;
        onLevel(rms(data));
        for (const pcm of chunker.push(resample(data, context.sampleRate))) {
          if (!speechEnergy(pcm).voiced) onSilence();
          else onChunk(pcm, performance.now());
        }
      };
      node.onprocessorerror = () => {
        if (!this.cancelled)
          onError("Audio capture failed. Reconnect the microphone.");
      };
      stream.getAudioTracks().forEach((track) =>
        track.addEventListener("ended", () => {
          if (!this.cancelled)
            onError(
              "Microphone disconnected. Reconnect or use typed rehearsal.",
            );
        }),
      );
      const source = context.createMediaStreamSource(stream);
      const mute = context.createGain();
      mute.gain.value = 0;
      source.connect(node);
      node.connect(mute);
      mute.connect(context.destination);
      await context.resume();
    } catch (error) {
      this.stop();
      throw error;
    }
  }
  stop() {
    this.cancelled = true;
    this.stream?.getTracks().forEach((t) => t.stop());
    if (this.node) {
      this.node.port.onmessage = null;
      this.node.disconnect();
      this.node = undefined;
    }
    if (this.context && this.context.state !== "closed")
      void this.context.close().catch(() => {});
    this.context = undefined;
  }
}
export async function decodeRecording(file: File): Promise<Float32Array> {
  if (file.size > 25 * 1024 * 1024)
    throw new Error("Choose an audio file under 25 MB.");
  const context = new AudioContext();
  try {
    const audio = await context.decodeAudioData(await file.arrayBuffer());
    if (audio.duration > 60)
      throw new Error("Choose a recording of 60 seconds or less.");
    const mono = new Float32Array(audio.length);
    for (let ch = 0; ch < audio.numberOfChannels; ch++) {
      const samples = audio.getChannelData(ch);
      for (let i = 0; i < mono.length; i++)
        mono[i] += samples[i] / audio.numberOfChannels;
    }
    return resample(mono, audio.sampleRate);
  } finally {
    await context.close();
  }
}
