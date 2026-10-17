import { expect, test } from "@playwright/test";
import { resolve } from "node:path";

test("team canvas and speech lab remain independently accessible", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Open example canvas" })).toBeVisible();
  await page.getByRole("button", { name: "Open example canvas" }).click();
  await expect(page.getByRole("button", { name: "Audience preview" })).toBeVisible();
  await page.screenshot({ path: "test-results/team-canvas-merged.png", fullPage: true });
  await page.goto("/");
  await page.getByLabel("Import prepared project manifest").setInputFiles(resolve("demo/manifest.json"));
  await expect(page.getByRole("button", { name: "Audience preview" })).toBeVisible();
  await expect(page.getByRole("alert")).toHaveCount(0);
  await expect(page.getByText("FOLLOW: a presentation that listens", { exact: true })).toBeVisible();
  await page.goto("/speech.html");
  await expect(page.getByRole("heading", { name: "Let the explanation lead." })).toBeVisible();
  expect(errors).toEqual([]);
});
