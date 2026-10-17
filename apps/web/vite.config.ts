import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath } from "node:url";
export default defineConfig({
  plugins: [react(), tailwindcss()],
  worker: { format: "es" },
  optimizeDeps: { exclude: ["@huggingface/transformers"] },
  build: {
    target: "es2022",
    rollupOptions: {
      input: {
        canvas: fileURLToPath(new URL("./index.html", import.meta.url)),
        speech: fileURLToPath(new URL("./speech.html", import.meta.url)),
      },
      output: {
        manualChunks(id) {
          if (id.includes("/zod/")) return "validation";
          if (id.includes("/@xyflow/") || id.includes("/d3-")) return "canvas-engine";
        },
      },
    },
  },
  server: { port: 5173, strictPort: true },
});
