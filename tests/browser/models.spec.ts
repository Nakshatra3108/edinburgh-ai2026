import { chromium, expect, test } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
test("real browser embeddings and Whisper recording path", async () => {
  test.skip(
    !process.env.RUN_MODEL_BROWSER,
    "Explicit opt-in: downloads and runs real public models",
  );
  test.setTimeout(600_000);
  // Dedicated test profile retains the large public model cache across explicit runs.
  const context = await chromium.launchPersistentContext(
    ".cache/browser-model-profile",
    { headless: true, channel: "chromium" },
  );
  const page = await context.newPage();
  try {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto("/speech.html");
    await page
      .getByRole("button", { name: "Load embeddings", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Match phrase", exact: false }),
    ).toBeEnabled({ timeout: 180_000 });
    await page
      .getByRole("button", { name: "Match phrase", exact: false })
      .click();
    await expect(page.getByText("Stability 1/2", { exact: false })).toBeVisible(
      { timeout: 30_000 },
    );
    await page
      .getByLabel("Typed rehearsal")
      .fill("Clicking through a deck breaks the flow of an explanation.");
    await page
      .getByRole("button", { name: "Match phrase", exact: false })
      .click();
    await expect(
      page.getByRole("button", { name: "Accept candidate" }),
    ).toBeVisible({ timeout: 30_000 });
    await page.getByRole("button", { name: "Accept candidate" }).click();
    await expect(
      page.getByRole("heading", { name: "Fixed slides", exact: true }),
    ).toBeVisible();
    await page.getByLabel("Typed rehearsal").fill("Okay um well right");
    await page
      .getByRole("button", { name: "Match phrase", exact: false })
      .click();
    await expect(
      page.getByText("Silence or filler", { exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Run phrase evaluation" }).click();
    await expect(
      page.getByText("/ 24 paraphrases correct", { exact: false }),
    ).toBeVisible({ timeout: 120_000 });
    console.log(
      "Browser ranking:",
      await page.locator(".evaluation>strong").innerText(),
    );
    const rankingDownload = page.waitForEvent("download");
    await page
      .getByRole("button", { name: "Export results", exact: true })
      .click();
    await mkdir("artifacts", { recursive: true });
    await (await rankingDownload).saveAs("artifacts/browser-ranking.json");
    await page.screenshot({
      path: "test-results/speech-lab-real-embeddings.png",
      fullPage: true,
    });
    await page
      .getByLabel("Whisper model")
      .selectOption(
        process.env.BROWSER_SPEECH_MODEL || "Xenova/whisper-tiny.en",
      );
    await page
      .getByLabel("Inference backend")
      .selectOption(process.env.BROWSER_BACKEND || "wasm");
    await page.getByRole("button", { name: "Load & warm Whisper" }).click();
    await Promise.race([
      expect(
        page.getByRole("button", { name: "Start microphone", exact: true }),
      ).toBeEnabled({ timeout: 300_000 }),
      page
        .getByRole("alert")
        .waitFor({ timeout: 300_000 })
        .then(async () => {
          throw new Error(await page.getByRole("alert").innerText());
        }),
    ]);
    const response = await fetch(
      "https://huggingface.co/datasets/Xenova/transformers.js-docs/resolve/main/jfk.wav",
    );
    expect(response.ok).toBe(true);
    await mkdir("test-results", { recursive: true });
    const buffer = Buffer.from(await response.arrayBuffer());
    await writeFile("test-results/jfk.wav", buffer);
    await page
      .getByLabel("Or test a recorded clip", { exact: false })
      .setInputFiles({ name: "jfk.wav", mimeType: "audio/wav", buffer });
    await expect(page.locator(".transcript")).toContainText(/country/i, {
      timeout: 180_000,
    });
    await expect(
      page.getByRole("button", { name: "Run phrase evaluation" }),
    ).toBeEnabled({ timeout: 60_000 });
    console.log(
      "Browser transcript:",
      await page.locator(".transcript").innerText(),
    );
    await mkdir("artifacts", { recursive: true });
    await writeFile(
      `artifacts/browser-${process.env.BROWSER_SPEECH_MODEL?.split("/")[1] || "whisper-tiny.en"}.json`,
      JSON.stringify(
        {
          runtime: `Chromium ${process.env.BROWSER_BACKEND || "wasm"}; prerecorded JFK audio, not a live room test`,
          recordedAt: new Date().toISOString(),
          model: await page.getByLabel("Whisper model").inputValue(),
          ranking: await page.locator(".evaluation>strong").innerText(),
          timings: await page.locator(".stats").innerText(),
          transcript: await page.locator(".transcript").innerText(),
        },
        null,
        2,
      ),
    );
    await page.screenshot({
      path: "test-results/speech-lab-real-whisper.png",
      fullPage: true,
    });
    // Exercise permission recovery without requesting the operator's real microphone.
    await page.evaluate(() => {
      navigator.mediaDevices.getUserMedia = async () => {
        throw new DOMException("Test permission denial", "NotAllowedError");
      };
    });
    await page
      .getByRole("button", { name: "Start microphone", exact: true })
      .click();
    await expect(page.getByRole("alert")).toContainText(
      "Test permission denial",
    );
    await page.getByRole("button", { name: "Dismiss", exact: true }).click();
    // Real AudioWorklet path fed by a synthetic silent MediaStream; acoustic quality is untested.
    await page.evaluate(async () => {
      const audio = new AudioContext();
      const oscillator = audio.createOscillator(),
        gain = audio.createGain(),
        destination = audio.createMediaStreamDestination();
      gain.gain.value = 0;
      oscillator.connect(gain).connect(destination);
      oscillator.start();
      await audio.resume();
      navigator.mediaDevices.getUserMedia = async () => destination.stream;
      (
        window as unknown as {
          testAudio: { audio: AudioContext; stream: MediaStream };
        }
      ).testAudio = { audio, stream: destination.stream };
    });
    await page
      .getByRole("button", { name: "Start microphone", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Stop microphone", exact: true }),
    ).toBeVisible();
    await expect(page.locator("footer")).toContainText(
      /[1-9]\d* silent chunks held/,
      { timeout: 15_000 },
    );
    await page
      .getByRole("button", { name: "Stop microphone", exact: true })
      .click();
    expect(
      await page.evaluate(async () => {
        const { audio, stream } = (
          window as unknown as {
            testAudio: { audio: AudioContext; stream: MediaStream };
          }
        ).testAudio;
        const ended = stream
          .getTracks()
          .every((track) => track.readyState === "ended");
        await audio.close();
        return ended;
      }),
    ).toBe(true);
    // Localhost remains reachable while all external requests are blocked.
    await page.route("https://**", (route) =>
      route.abort("internetdisconnected"),
    );
    await page.reload();
    await page
      .getByRole("button", { name: "Load embeddings", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Match phrase", exact: false }),
    ).toBeEnabled({ timeout: 45_000 });
    await page
      .getByLabel("Whisper model")
      .selectOption(
        process.env.BROWSER_SPEECH_MODEL || "Xenova/whisper-tiny.en",
      );
    await page
      .getByLabel("Inference backend")
      .selectOption(process.env.BROWSER_BACKEND || "wasm");
    await page.getByRole("button", { name: "Load & warm Whisper" }).click();
    await expect(
      page.getByRole("button", { name: "Start microphone", exact: true }),
    ).toBeEnabled({ timeout: 90_000 });
    expect(errors).toEqual([]);
  } finally {
    await page
      .screenshot({ path: "artifacts/last-model-browser.png", fullPage: true })
      .catch(() => {});
    await context.close();
  }
});
