import { expect, test } from "@playwright/test";
test("honest initial state and responsive diagnostic controls", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const modelRequests: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("huggingface.co"))
      modelRequests.push(request.url());
  });
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Let the explanation lead." }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Match phrase", exact: false }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Start microphone", exact: true }),
  ).toBeDisabled();
  await expect(page.getByLabel("Whisper model")).toHaveValue(
    "Xenova/whisper-small.en",
  );
  await page.getByLabel("Whisper model").selectOption("Xenova/whisper-tiny.en");
  await page.getByText("Try a phrase", { exact: true }).click();
  await page
    .getByRole("button", { name: "Match meaning, then hold on uncertainty" })
    .click();
  await expect(page.getByLabel("Typed rehearsal")).toHaveValue(
    "We compare the meaning of what you say with the prepared concepts.",
  );
  await page.getByRole("button", { name: "Reset decision window" }).click();
  await expect(page.getByText("Epoch 1", { exact: false })).toBeVisible();
  await page.screenshot({
    path: "test-results/speech-lab-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(
    page.getByRole("heading", { name: "Input & models" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/speech-lab-mobile.png",
    fullPage: true,
  });
  expect(errors).toEqual([]);
  expect(modelRequests).toEqual([]);
});
test("model download failure offers an explicit retry without enabling inference", async ({
  page,
}) => {
  await page.route("https://huggingface.co/**", (route) =>
    route.abort("failed"),
  );
  await page.goto("/");
  await page
    .getByRole("button", { name: "Load embeddings", exact: true })
    .click();
  await expect(page.getByRole("alert")).toBeVisible({ timeout: 30_000 });
  await expect(
    page.getByRole("button", { name: "Retry embeddings", exact: true }),
  ).toBeEnabled();
  await expect(
    page.getByRole("button", { name: "Match phrase", exact: false }),
  ).toBeDisabled();
});
test("model loading can be cancelled without enabling an unready model", async ({
  page,
}) => {
  // Leave public model requests pending until the worker is terminated by Cancel.
  await page.route("https://huggingface.co/**", () => {});
  await page.goto("/");
  await page
    .getByRole("button", { name: "Load embeddings", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Cancel model loading", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Load embeddings", exact: true }),
  ).toBeEnabled();
  await expect(
    page.getByRole("button", { name: "Match phrase", exact: false }),
  ).toBeDisabled();
  await expect(page.getByRole("alert")).toHaveCount(0);
});
