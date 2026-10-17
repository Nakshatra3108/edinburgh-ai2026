import { mkdir, copyFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
const root = new URL("../", import.meta.url);
const destination = new URL("apps/web/public/ort/", root);
await mkdir(destination, { recursive: true });
for (const file of [
  "ort-wasm-simd-threaded.asyncify.mjs",
  "ort-wasm-simd-threaded.asyncify.wasm",
]) {
  await copyFile(
    new URL(`node_modules/onnxruntime-web/dist/${file}`, root),
    new URL(file, destination),
  );
}
console.log(`Local ONNX runtime ready: ${fileURLToPath(destination)}`);
