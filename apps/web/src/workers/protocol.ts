import type { MatchingManifest } from "@follow/shared";
import type { Score } from "../matching/matcher";
export type SpeechModel = "Xenova/whisper-tiny.en" | "Xenova/whisper-small.en";
export type Backend = "wasm" | "webgpu";
export type Request =
  | { id: number; type: "init-embeddings"; manifest: MatchingManifest }
  | { id: number; type: "score"; text: string; context?: string }
  | { id: number; type: "init-speech"; model: SpeechModel; backend: Backend }
  | { id: number; type: "transcribe"; pcm: Float32Array };
export type Response =
  | { id: number; type: "progress"; message: string }
  | { id: number; type: "ready" }
  | { id: number; type: "scores"; scores: Score[]; ms: number }
  | { id: number; type: "transcript"; text: string; ms: number }
  | { id: number; type: "error"; message: string };
