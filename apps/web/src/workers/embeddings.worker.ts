import {
  pipeline,
  type FeatureExtractionPipeline,
  type ProgressCallback,
} from "@huggingface/transformers";
import "./environment";
import type { Request, Response } from "./protocol";
import { bestTwo, cosine } from "../matching/matcher";
import type { MatchingManifest } from "@follow/shared";
import { modelRevisions } from "./models";
const scope = self as unknown as {
  onmessage: (event: MessageEvent<Request>) => void;
  postMessage: (data: Response) => void;
};
let extractor: FeatureExtractionPipeline | undefined;
let manifest: MatchingManifest;
let vectors: number[][] = [];
let entries: { conceptId: string; detailId?: string }[] = [];
const send = (data: Response) => scope.postMessage(data);
const progress =
  (id: number): ProgressCallback =>
  (event) => {
    const e = event as {
      status: string;
      file?: string;
      loaded?: number;
      total?: number;
    };
    const bytes =
      e.loaded !== undefined
        ? ` · ${(e.loaded / 1e6).toFixed(1)}${e.total ? ` / ${(e.total / 1e6).toFixed(1)}` : ""} MB`
        : "";
    send({
      id,
      type: "progress",
      message: `${e.status}${e.file ? ` · ${e.file}` : ""}${bytes}`,
    });
  };
scope.onmessage = async ({ data }) => {
  try {
    if (data.type === "init-embeddings") {
      extractor ??= await pipeline(
        "feature-extraction",
        "Xenova/all-MiniLM-L6-v2",
        {
          revision: modelRevisions["Xenova/all-MiniLM-L6-v2"],
          device: "wasm",
          dtype: "q8",
          progress_callback: progress(data.id),
        },
      );
      manifest = data.manifest;
      entries = [];
      const texts: string[] = [];
      for (const c of manifest.concepts.filter(
        (c) => c.enabled && c.review === "reviewed",
      )) {
        for (const text of [
          c.title,
          c.summary,
          ...c.aliases,
          ...c.speechExamples,
        ].filter(Boolean)) {
          texts.push(text);
          entries.push({ conceptId: c.id });
        }
        for (const d of c.details) {
          texts.push(d.text);
          entries.push({ conceptId: c.id, detailId: d.id });
        }
      }
      const tensor = await extractor(texts, {
        pooling: "mean",
        normalize: true,
      });
      vectors = tensor.tolist() as number[][];
      send({ id: data.id, type: "ready" });
    } else if (data.type === "score") {
      if (!extractor || !vectors.length)
        throw new Error("Warm up embeddings first");
      const start = performance.now();
      const tensor = await extractor(
        data.context ? [data.text, data.context] : [data.text],
        { pooling: "mean", normalize: true },
      );
      const [vector, contextVector] = tensor.tolist() as number[][];
      const scores = manifest.concepts
        .filter((c) => c.enabled && c.review === "reviewed")
        .map((c) => {
          const examples: number[] = [],
            contextual: number[] = [],
            details: { detailId: string; score: number }[] = [];
          entries.forEach((entry, i) => {
            if (entry.conceptId !== c.id) return;
            const score = cosine(vector, vectors[i]);
            if (entry.detailId)
              details.push({ detailId: entry.detailId, score });
            else {
              examples.push(score);
              if (contextVector)
                contextual.push(cosine(contextVector, vectors[i]));
            }
          });
          // Recent context can lower confidence but cannot make unrelated fresh text eligible.
          return {
            conceptId: c.id,
            score: Math.min(
              bestTwo(examples),
              contextVector
                ? 0.8 * bestTwo(examples) + 0.2 * bestTwo(contextual)
                : 1,
            ),
            details,
          };
        });
      send({
        id: data.id,
        type: "scores",
        scores,
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
