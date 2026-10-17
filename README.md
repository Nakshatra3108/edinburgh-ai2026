# FOLLOW

A persistent visual canvas that follows the speaker's explanation. The team canvas preview and Person C speech lab now run from one npm workspace install.

```powershell
# Run these in the repository root:
npm ci
npm run dev
```

- **Canvas / Person A:** http://127.0.0.1:5173/
- **Speech lab / Person C:** http://127.0.0.1:5173/speech.html

The pages are independent development harnesses. D's controller has not yet connected speech decisions to the canvas, audience sync or persistence. No API key is required for either harness. Use Node 22.12+ for the team baseline; the web workspace also supports the existing Node 20.19.5 host.

## Canvas and team content

Open **Open example canvas**, select an idea, reveal details, or use **Action laboratory** to trigger FOCUS, REVEAL, CONNECT, COMPARE, OVERVIEW and HOLD. **Audience preview** uses the same renderer without studio controls.

`demo/manifest.json` is Person B's real curated PDF manifest, with the PDF at `demo/source/follow-demo.pdf`. Use **Import project** on the canvas start screen to inspect it. Person A's bundled example under `apps/web/src/canvas/fixtures/` remains explicitly illustrative.

- [Person A handoff](docs/person-a/HANDOFF.md)
- [Design implementation](docs/person-a/DESIGN.md)
- [Person A validation](docs/person-a/QA.md)

## Speech lab

1. Open `/speech.html`, click **Load embeddings**, and wait for Ready.
2. Submit the initial typed phrase. The first eligible observation HOLDs at `Stability 1/2`.
3. Submit a different sentence about the same topic, such as `Clicking through a deck breaks the flow of an explanation.`
4. Inspect the FOCUS and click **Accept candidate** to update the diagnostic preview.
5. Select **Small.en** (the default), then **Load & warm Whisper**. Tiny.en is available as a speed baseline; no manual model download, Python setup or Hugging Face account is required.
6. Test a recorded clip, then **Start microphone**. Stop releases microphone tracks and invalidates pending inference. **Cancel model loading** terminates model workers.

The lab and its evaluation still use `demo/speech-fixture.json`, the original illustrative six-concept fixture. Its phrase-set results and calibrated thresholds do not apply automatically to the real PDF manifest. D/C must integrate and evaluate the reviewed team project before presenting it with speech.

WASM is the tested CPU baseline; WebGPU is an explicit configuration to benchmark. After changing a model/backend, reload Whisper before testing. Keep Suggest while checking room acoustics and real phrase-end latency.

- [Person C handoff and model setup](docs/PERSON-C.md)
- [Person C verification evidence](docs/VERIFICATION.md)

## Checks

```powershell
npm test                 # Person A canvas + Person C matching/audio/runtime tests
npm run build           # Strict typecheck + production build of both pages
npx playwright install chromium
npm run test:browser    # UI checks; real-model downloads skipped by default

# Explicit real-model test, retaining its dedicated test-profile cache:
$env:RUN_MODEL_BROWSER='1'
npm run test:browser -- tests/browser/models.spec.ts

# Optional Node CPU model smoke test:
npm run test:models
```

Use the root `package-lock.json` for the web/shared workspaces. `apps/api` retains Person B's independent package and lockfile; its scripts and Node requirements remain in `apps/api/package.json`. API/provider preparation is separate from the local speech lab.

## Git workflow

Work on your own feature branch. Commit your changes before merging the team's main branch:

```powershell
git add <your-files>
git commit -m "Describe your change"
git fetch origin
git merge origin/main
```

Resolve overlaps by preserving both teammates' work, then test and commit. Do not remove untracked source files just to make a pull succeed.

The original product plan is [FOLLOW-PRD.md](FOLLOW-PRD.md). Copies under `docs/` are reference documents, not claims that the whole PRD is implemented. Shared contracts remain provisional until D reviews and freezes them.
