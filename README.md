# FOLLOW · Person C speech lab

Runnable local speech and semantic-matching workbench. This is the Person C slice, not the full FOLLOW application. Person D's controller, API, audience window, canvas renderer and persistence are intentionally future integrations.

## Start

```powershell
npm ci
npm run dev
```

Open **http://127.0.0.1:5173**. The existing host runs Node 20.19.5; the packages also support Node 22.12+. No Hugging Face account, Python setup or API key is needed for these public models.

1. Click **Load embeddings**. Wait for Ready. This downloads the pinned MiniLM model on first use.
2. Submit the initial typed phrase. The first eligible observation should HOLD at `Stability 1/2`.
3. Submit a different sentence about the same topic, such as `Clicking through a deck breaks the flow of an explanation.`
4. Inspect the proposed FOCUS and click **Accept candidate** to update the diagnostic preview. Repeated identical text does not count as new evidence.
5. Select Whisper **Small.en** (the default), then click **Load & warm Whisper**. Watch actual per-file progress. Tiny.en is available as a speed baseline.
6. First test a short recorded clip (up to 60 seconds / 25 MB). Then click **Start microphone**, allow browser access, and speak near the microphone. Stop releases the microphone tracks and invalidates pending inference.
7. Run the phrase evaluation and export results. A HOLD on a labelled paraphrase is a miss; an incorrect match on a distractor is also a miss.

Small may be too slow on this CPU. Benchmark both models after warm-up. Select WASM first; WebGPU is an explicit experiment with visible failure, not a silent performance promise. After changing the model/backend selection, reload Whisper before testing; the Ready line identifies the model actually loaded. **Cancel model loading** terminates workers and invalidates pending work.

## Verify

```powershell
npm test
npm run build
npx playwright install chromium
npm run test:browser
# Explicitly download and test real models in Chromium:
$env:RUN_MODEL_BROWSER='1'
npm run test:browser -- tests/browser/models.spec.ts
# Test Small instead of Tiny in that same real browser test:
$env:BROWSER_SPEECH_MODEL='Xenova/whisper-small.en'
npm run test:browser -- tests/browser/models.spec.ts
# Optional separate Node CPU model smoke test:
npm run test:models
```

Screenshots are generated in ignored `test-results/`; model reports go to `artifacts/`. Explicit real-model browser tests retain weights in a dedicated `.cache/browser-model-profile` test profile to avoid downloading them on every test run. Test recordings use the public-domain JFK sample linked in the Whisper model example. Neither those recordings nor simulated microphone checks prove recognition accuracy in your room.

## Scope and ownership

- `apps/web/src/workers`: one embedding worker, one ASR worker, pinned model revisions, progress and typed RPC.
- `apps/web/src/matching`: deterministic matching gate and reusable `SpeechMatchingSession` integration surface.
- `apps/web/src/audio`: AudioWorklet capture, 16 kHz PCM, silence gate, overlapping chunks, deduplication, bounded queue.
- `demo/manifest.json`: **illustrative** six-concept fixture; not a source-grounded curated PDF package. B should supply the actual approved manifest.
- `demo/phrases.json`: 24 evaluation paraphrases and six distractors, separate from embedded examples. Treat this set as development data after inspecting results; use a fresh teammate-authored holdout before claiming acceptance.
- `packages/shared`: **provisional Person C contracts only**, including a projection of Project and versioned candidates. This is not the full PRD domain model. D must review/merge these contracts before freezing them.
- `docs/PRD.md` and `docs/HACKATHON-TOOLKIT.md`: copies of the supplied reference documents, not evidence that their proposed features exist.

See [Person C handoff](docs/PERSON-C.md) for contracts, tuning, and remaining live checks.
