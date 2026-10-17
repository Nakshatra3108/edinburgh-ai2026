// Explicit real-model smoke test. Downloads public weights into ignored .cache/.
// Node CPU numbers are not browser/microphone latency claims.
import { env, pipeline } from "@huggingface/transformers";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import assert from "node:assert/strict";
env.cacheDir = ".cache/models";
env.allowLocalModels = false;
const manifest = JSON.parse(await readFile("demo/manifest.json", "utf8"));
const config = JSON.parse(await readFile("demo/matcher-config.json", "utf8"));
const calibrate = process.argv.includes("--calibrate");
const phrases = JSON.parse(
  await readFile(
    calibrate ? "demo/rehearsal.json" : "demo/phrases.json",
    "utf8",
  ),
);
const model = process.env.SPEECH_MODEL || "Xenova/whisper-tiny.en";
const revisions = {
  "Xenova/all-MiniLM-L6-v2": "751bff37182d3f1213fa05d7196b954e230abad9",
  "Xenova/whisper-tiny.en": "79fb389fc764e7c395bd330e9531d9d32ada7049",
  "Xenova/whisper-small.en": "fa16a75f5d91e83ecb6a2ccb690f14d91ef00ca4",
};
console.log("Loading real embedding model…");
const embed = await pipeline("feature-extraction", "Xenova/all-MiniLM-L6-v2", {
  dtype: "q8",
  revision: revisions["Xenova/all-MiniLM-L6-v2"],
});
const entries = manifest.concepts.flatMap((c) =>
  [c.title, c.summary, ...c.aliases, ...c.speechExamples].map((text) => ({
    id: c.id,
    text,
  })),
);
const vectors = (
  await embed(
    entries.map((e) => e.text),
    { pooling: "mean", normalize: true },
  )
).tolist();
const results = [];
for (const phrase of phrases) {
  const start = performance.now();
  const [vector] = (
    await embed(phrase.text, { pooling: "mean", normalize: true })
  ).tolist();
  const ranked = manifest.concepts
    .map((c) => {
      const scores = entries
        .flatMap((e, i) =>
          e.id === c.id
            ? [vector.reduce((sum, value, d) => sum + value * vectors[i][d], 0)]
            : [],
        )
        .sort((a, b) => b - a);
      return { id: c.id, score: (scores[0] + scores[1]) / 2 };
    })
    .sort((a, b) => b.score - a.score);
  const top = ranked[0],
    margin = top.score - ranked[1].score;
  const predicted =
    top.score >= config.threshold && margin >= config.margin ? top.id : null;
  results.push({
    ...phrase,
    topId: top.id,
    predicted,
    correct: predicted === phrase.expected,
    topScore: top.score,
    margin,
    ms: performance.now() - start,
  });
}
console.log("Topic ranking:", {
  correctParaphrases: results.filter((r) => r.expected && r.correct).length,
  totalParaphrases: results.filter((r) => r.expected).length,
  heldDistractors: results.filter((r) => !r.expected && r.correct).length,
  totalDistractors: results.filter((r) => !r.expected).length,
});
if (calibrate) {
  console.log(
    "Separate rehearsal calibration grid (no acceptance phrases used):",
  );
  for (const threshold of [0.45, 0.4, 0.35])
    for (const margin of [0.08, 0.06, 0.04, 0.03, 0.02]) {
      const predictions = results.map((r) => ({
        ...r,
        pick: r.topScore >= threshold && r.margin >= margin ? r.topId : null,
      }));
      console.log({
        threshold,
        margin,
        correctPositives: predictions.filter(
          (r) => r.expected && r.pick === r.expected,
        ).length,
        wrongTopics: predictions.filter(
          (r) => r.expected && r.pick !== null && r.pick !== r.expected,
        ).length,
        distractorFalseTriggers: predictions.filter(
          (r) => !r.expected && r.pick !== null,
        ).length,
      });
    }
}
await embed.dispose();
const report = {
  runtime: "Node CPU, not browser live acceptance",
  recordedAt: new Date().toISOString(),
  config,
  embeddings: results,
  speech: null,
};
if (!process.argv.includes("--embeddings-only")) {
  console.log(`Loading ${model} for genuine recorded-audio inference…`);
  assert(revisions[model], "Use one of the pinned Whisper model IDs");
  const transcribe = await pipeline("automatic-speech-recognition", model, {
    dtype: "q8",
    revision: revisions[model],
  });
  const response = await fetch(
    "https://huggingface.co/datasets/Xenova/transformers.js-docs/resolve/main/jfk.wav",
  );
  assert(response.ok, "Could not download public-domain JFK test recording");
  const buffer = Buffer.from(await response.arrayBuffer());
  // Parse the PCM WAV chunks instead of assuming a 44-byte header.
  assert.equal(buffer.toString("ascii", 0, 4), "RIFF");
  let offset = 12,
    rate = 0,
    channels = 0,
    bits = 0,
    format = 0,
    pcm;
  while (offset + 8 <= buffer.length) {
    const id = buffer.toString("ascii", offset, offset + 4),
      size = buffer.readUInt32LE(offset + 4),
      begin = offset + 8;
    if (id === "fmt ") {
      format = buffer.readUInt16LE(begin);
      channels = buffer.readUInt16LE(begin + 2);
      rate = buffer.readUInt32LE(begin + 4);
      bits = buffer.readUInt16LE(begin + 14);
    }
    if (id === "data") pcm = buffer.subarray(begin, begin + size);
    offset = begin + size + (size % 2);
  }
  assert.equal(rate, 16000);
  assert.equal(channels, 1);
  assert.equal(bits, 16);
  assert.equal(format, 1);
  assert(pcm);
  const audio = Float32Array.from(
    { length: pcm.length / 2 },
    (_, i) => pcm.readInt16LE(i * 2) / 32768,
  );
  await transcribe(new Float32Array(16000), { max_new_tokens: 8 });
  const start = performance.now();
  const output = await transcribe(audio, { max_new_tokens: 96 });
  report.speech = {
    model,
    revision: revisions[model],
    dtype: "q8",
    audioSeconds: audio.length / rate,
    inferenceMs: performance.now() - start,
    transcript: output.text,
  };
  console.log(report.speech);
  assert.match(output.text.toLowerCase(), /country/);
  await transcribe.dispose();
}
await mkdir("artifacts", { recursive: true });
await writeFile(
  `artifacts/${calibrate ? "rehearsal" : "model-smoke"}-${model.split("/")[1]}.json`,
  JSON.stringify(report, null, 2),
);
