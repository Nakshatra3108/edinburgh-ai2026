import { defineConfig } from "vitest/config";
export default defineConfig({
  test: {
    include: ["tests/unit/**/*.test.ts", "apps/web/src/canvas/**/*.test.ts"],
    environment: "node",
  },
});
