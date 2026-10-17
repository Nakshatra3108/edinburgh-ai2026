import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { manifestSchema } from "@follow/shared";
import { parseCanvasProject } from "../../apps/web/src/canvas/manifest";
import curated from "../../demo/manifest.json";

describe("team content survives integration and checkout", () => {
  it("keeps the source PDF bytes consistent with the curated manifest", () => {
    const pdf = readFileSync(new URL("../../demo/source/follow-demo.pdf", import.meta.url));
    expect(createHash("sha256").update(pdf).digest("hex")).toBe(curated.source.sha256);
  });
  it("accepts the team manifest in both the canvas and matching projections", () => {
    expect(parseCanvasProject(curated).id).toBe(curated.id);
    expect(manifestSchema.parse(curated).id).toBe(curated.id);
  });
});
