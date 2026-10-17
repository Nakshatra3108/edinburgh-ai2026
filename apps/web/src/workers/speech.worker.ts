import {
  pipeline,
  type AutomaticSpeechRecognitionPipeline,
  type ProgressCallback,
} from "@huggingface/transformers";
import "./environment";
import type { Request, Response } from "./protocol";
import { modelRevisions } from "./models";
const scope = self as unknown as {
  onmessage: (event: MessageEvent<Request>) => void;
  postMessage: (data: Response) => void;
};
let transcriber: AutomaticSpeechRecognitionPipeline | undefined;
const send = (data: Response) => scope.postMessage(data);
scope.onmessage = async ({ data }) => {
  try {
    if (data.type === "init-speech") {
      await transcriber?.dispose();
      transcriber = undefined;
      const progress_callback: ProgressCallback = (event) => {
        const e = event as {
          status: string;
          file?: string;
          loaded?: number;
          total?: number;
        };
        send({
          id: data.id,
          type: "progress",
          message: `${e.status}${e.file ? ` · ${e.file}` : ""}${e.loaded !== undefined ? ` · ${(e.loaded / 1e6).toFixed(1)}${e.total ? ` / ${(e.total / 1e6).toFixed(1)}` : ""} MB` : ""}`,
        });
      };
      transcriber = await pipeline("automatic-speech-recognition", data.model, {
        revision: modelRevisions[data.model],
        device: data.backend,
        dtype: "q8",
        progress_callback,
      });
      // Genuine warm-up; don't call the model ready immediately after downloading.
      await transcriber(new Float32Array(16_000), { max_new_tokens: 8 });
      send({ id: data.id, type: "ready" });
    } else if (data.type === "transcribe") {
      if (!transcriber) throw new Error("Warm up Whisper first");
      const start = performance.now();
      const result = await transcriber(data.pcm, {
        return_timestamps: false,
        max_new_tokens: 96,
      });
      const output = Array.isArray(result) ? result[0] : result;
      send({
        id: data.id,
        type: "transcript",
        text: output.text.trim(),
        ms: performance.now() - start,
      });
    }
  } catch (error) {
    send({
      id: data.id,
      type: "error",
      message: error instanceof Error ? error.message : String(error),
    });
  }
};
