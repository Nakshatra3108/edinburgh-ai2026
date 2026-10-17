# FOLLOW

A persistent visual canvas that follows the speaker's explanation. The team canvas preview and Person C speech lab now run from one npm workspace install.

```powershell
# Run these in the repository root:
npm ci
npm run dev
```

- **Canvas / Person A:** http://127.0.0.1:5173/
- **Speech lab / Person C:** http://127.0.0.1:5173/speech.html

The main studio now connects Person C's local Whisper capture to Groq live composition. Upload a PDF to build a full-text knowledge base, then explain any part of it to compose visuals on the canvas. The independent speech lab and curated manual demo remain usable without an API key. Live composition requires the Groq API server. Use Node 22.13+; the merged PDF.js dependency requires that version even though the web build may still complete on older Node installations.

## Groq backend

```sh
npm ci --prefix apps/api
npm start --prefix apps/api
```

The API supports up to four server-only Groq credentials: `GROQ_API_KEY`, `GROQ_API_KEY_2`, `GROQ_API_KEY_3`, and `GROQ_API_KEY_4`. Empty or duplicate slots are ignored. Add extra keys to your local `.env` and restart the API. New requests rotate through available keys every five minutes; in-flight requests keep their original key. A rate-limited key goes on cooldown using Groq's reset headers, with a five-minute fallback when no reset metadata exists. Rotation does not reset an account quota; keys in the same Groq organization still share its overall limits. Invalid or exhausted credentials are skipped until server restart. The same pool serves PDF preparation and live composition; a single configured key continues to work. Keys stay out of browser responses and logs.

The API loads `apps/api/.env` or falls back to the repository `.env`. Keep `GROQ_API_KEY` and `GROQ_MODEL` there. Run the web app in a second terminal with `npm run dev`; Vite proxies `/api` to port 8787. Test fixture servers use port 8790 exclusively.

## Canvas and team content

Open **Open demo project** for the real curated source, or **Open example canvas** for the visual component examples. Select an idea, reveal details, or use **Action laboratory** to trigger FOCUS, REVEAL, CONNECT, COMPARE, OVERVIEW and HOLD. **Audience preview** uses the same renderer without studio controls and supports fullscreen.

`demo/manifest.json` is Person B's real curated PDF manifest, with the PDF at `demo/source/follow-demo.pdf`. Uploading any PDF, including the demo PDF, opens source selection and knowledge-base preparation. The full selected text is retained; the topic index is optional, and the stage starts empty until you speak or type an explanation. Person A's bundled example under `apps/web/src/canvas/fixtures/` remains explicitly illustrative.

- [Knowledge-base and live-composition workflow](docs/KNOWLEDGE-CANVAS.md)
- [Light UI refresh and current visual behavior](docs/UI-REFRESH.md)
- [Person A handoff](docs/person-a/HANDOFF.md)
- [Team application status and remaining work](docs/APPLICATION-STATUS.md)
- [Design implementation](docs/person-a/DESIGN.md)
- [Person A validation](docs/person-a/QA.md)

## Speech lab

1. Open `/speech.html`, click **Load embeddings**, and wait for Ready.
2. Submit the initial typed phrase. The first eligible observation HOLDs at `Stability 1/2`.
3. Submit a different sentence about the same topic, such as `Clicking through a deck breaks the flow of an explanation.`
4. Inspect the FOCUS and click **Accept candidate** to update the diagnostic preview.
5. Select **Small.en** (the default), then **Load & warm Whisper**. Tiny.en is available as a speed baseline; no manual model download, Python setup or Hugging Face account is required.
6. Test a recorded clip, then **Start microphone**. Stop releases microphone tracks and invalidates pending inference. **Cancel model loading** terminates model workers.

For hands-free changes in the diagnostic stage, enable **Follow matched speech automatically in this preview** before starting the microphone. Otherwise click **Accept candidate** after a stable match. The feedback block shows **Transcribing your speech…** and **Last heard** so you can distinguish capture, recognition and matching. Pausing does not cancel an unfinished transcription.

The lab and its evaluation still use `demo/speech-fixture.json` and `demo/speech-phrases.json`, the original illustrative six-concept fixture and its evaluation phrases. The team's `demo/manifest.json` and `demo/phrases.json` are preserved for the real PDF. Existing fixture scores and calibrated thresholds do not apply automatically to that PDF manifest. D/C must integrate and evaluate the reviewed team project before presenting it with speech.

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

Use the root `package-lock.json` for the web/shared workspaces. `apps/api` retains Person B's independent package and lockfile; its scripts and Node requirements remain in `apps/api/package.json`. The independent speech lab stays separate; the main studio connects its local audio components to Groq live visual composition.

Preparation uses **Groq**, with server-only `GROQ_API_KEY` and `GROQ_MODEL` (initial candidate `openai/gpt-oss-120b`). Run the backend smoke test with `npm run smoke:groq --prefix apps/api` after environment setup. The Fastify preparation endpoints are implemented under `apps/api`; the curated canvas and local speech lab remain usable without a key.

## Git workflow

Work on your own feature branch. Commit your changes before merging the team's main branch:

```powershell
git add <your-files>
git commit -m "Describe your change"
git fetch origin
git merge origin/main
```

Resolve overlaps by preserving both teammates' work, then test and commit. Do not remove untracked source files just to make a pull succeed.

Pull and merge teammates' work before pushing to shared `main`. Never discard untracked or conflicted source files to force a pull through.

The original product plan is [FOLLOW-PRD.md](FOLLOW-PRD.md). Copies under `docs/` are reference documents, not claims that the whole PRD is implemented. Shared contracts remain provisional until D reviews and freezes them.
