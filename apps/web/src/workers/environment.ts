import { env } from "@huggingface/transformers";
// Serve the matching runtime from localhost, including when the CDN is unavailable.
env.allowLocalModels = false;
if (env.backends.onnx.wasm) {
  env.backends.onnx.wasm.numThreads = 1;
  env.backends.onnx.wasm.wasmPaths = {
    mjs: new URL(
      "/ort/ort-wasm-simd-threaded.asyncify.mjs",
      self.location.origin,
    ).href,
    wasm: new URL(
      "/ort/ort-wasm-simd-threaded.asyncify.wasm",
      self.location.origin,
    ).href,
  };
}
