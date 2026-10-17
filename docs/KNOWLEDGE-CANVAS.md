# FOLLOW: knowledge first, visuals as you speak

The uploaded PDF is reference material, not a prewritten slide deck. The selected pages are retained in full, with their page numbers. Groq builds a small topic index for inspection, but live composition reads the full selected text, including information absent from that index.

This document supersedes earlier requirements that restricted live presentation to prebuilt, manually reviewed visuals. The desktop studio is the primary target. The 17 October evolving-board update also supersedes mandatory topic review: verified index concepts are immediately usable, with optional inspection and editing.

## User flow

1. Upload a PDF. Extraction runs locally. Select the pages to include and optionally correct extracted text.
2. Build the knowledge base. The complete selected text is retained alongside a Groq-generated topic index. If the index has no verifiable quotes after one repair, discard that index, keep the original text, and allow the user to continue. Unsupported generated claims are never promoted into source evidence.
3. Open the speaking studio. The stage starts empty. Reference topics are available for inspection; they are not an ordered presentation.
4. Load and warm the local Whisper Tiny English model, then start the microphone. The first download needs internet; transcription itself runs locally using Person C's existing audio capture, PCM worklet, worker and RPC implementation. Typed rehearsal uses the same live composition path without a model download.
5. A spoken explanation and the source pages go to Groq. Groq composes up to three relevant visual elements: an idea, a source-backed number, an ordered process, or a comparison between two ideas. The latest clause controls the visual; earlier speech provides context.
6. The server locates exact source quotes and computes offsets. The browser validates the scene and checks every quote against its retained document before applying it. The renderer receives structured data, never model-generated HTML.
7. New elements appear on the same canvas. The active board keeps up to three complementary visual elements visible: a primary explanation and recent context, or two explicit comparison sides. Processes draw connected steps; evidence uses quoted metrics; concepts carry topic pictograms and supporting points. Earlier elements retain their home anchors in Overview. Overview shows the introduced visual history. There is no slide index or next-slide sequence.
8. A manual hold aborts the browser request, clears queued input and invalidates delayed results. Unsupported speech and request failures preserve the last visual. Audience view continues to receive the same live state and includes a pause-listening control.

## Architecture and contracts

- `CanvasProject.knowledgeBase`: optional `{ version: 1, pages: [{ page, text }] }`. Only selected pages are retained. Existing curated manifests continue to work without this field.
- A knowledge-backed project may have zero indexed concepts. An empty project without document text is invalid.
- `review: 'source-checked'` distinguishes automatically grounded visuals from human-reviewed content. Exact quote matching is a provenance check, not a proof that every paraphrase is correct. Manual inspection remains available but does not gate live composition.
- `POST /api/prepare`: existing job API, now retains full document text in the result and treats the topic index as optional.
- `POST /api/live/compose`: `{ source: { name, sha256, pageCount, pages }, utterance }`. Returns `{ project, supported, warnings, usage }`. A false `supported` result holds the stage.
- Live input: 8–2,000 transcript characters, up to 20 pages and the configured text budget (80,000 characters by default). Input validation rejects duplicate/out-of-range pages.
- One live generation at a time; a 45-second server deadline; a 50-second browser deadline. Recent exact requests reuse a bounded 32-entry cache. The browser coalesces queued speech rather than starting parallel generation requests.
- Scene history is bounded to 24 concepts and 100 relationships. Repeated identical compositions reuse content-addressed IDs and home anchors. Older history can leave the map; the full knowledge base remains available.
- Local speech uses 3.5-second overlapping PCM chunks. One transcription runs at a time, with the latest queued chunk retained. Manual pause releases microphone tracks and suppresses late results; restarting reuses the warmed model.
- GPT-OSS uses low reasoning effort for latency. Strict JSON schema, grounding, bounded repair and transport retry remain active. HTTP 429 is treated as a retryable rate limit even when the provider message contains billing/quota help links.

## Run on this computer

```sh
npm ci
npm ci --prefix apps/api
npm start --prefix apps/api
# In another terminal:
npm run dev
```

Open <http://127.0.0.1:5173/>. The API prefers `apps/api/.env`, then the repository `.env`, matching the Groq smoke script. Credentials stay in the API process. The independent speech lab remains at `/speech.html`; its MiniLM matching diagnostics are preserved. The main studio uses local Whisper transcription followed by Groq composition rather than fixed-concept matching.

The curated demo remains an explicitly manual fallback. Uploading its PDF follows the same source/knowledge workflow as any other PDF.

## Verification and limits

Run `npm test`, `npm run build`, `npm run typecheck --prefix apps/api`, and `npm test --prefix apps/api`. The new tests cover retained source pages, ungrounded-index recovery, unsupported speech, invented quotes, request coalescing, schema limits and bounded visual history.

Browser integration checks live under `apps/web/src/live/qa/`. Their explicit fixture API is `node apps/api/test/browser-fixture.ts` on **8790**, separate from the real API on **8787**. The fixture must never replace the user's API. The microphone wiring check uses synthetic audio and a fixture speech worker; it does not measure real Whisper accuracy. Real Groq evidence is identified separately from fixture evidence.

This remains a bounded prototype: PDF text extraction does not perform OCR, caption and geometry retrieval do not understand arbitrary image contents, live layouts use authored visual types, Groq needs internet and is subject to account rate limits, and state is currently held in memory. No sub-second latency, unlimited free allowance, real-room microphone accuracy or durable project storage is claimed. The source-checking layer rejects unmatched quotations; it does not establish semantic entailment of every AI paraphrase.

Groq parameter reference: [reasoning effort](https://console.groq.com/docs/reasoning).

### Recorded checks (17 October 2026)

- Desktop browser flow: PDF selection, extraction, knowledge preparation, empty stage, live process, comparison, hold after unrelated speech, delayed-result cancellation, audience rendering and WCAG A/AA checks passed. Provider responses in this browser check are fixtures, isolated on port 8790.
- Synthetic microphone wiring: real microphone capture/worklet path with a fixture transcript worker passed load gating, pause/restart, track release and audience pause checks. This does not establish real microphone accuracy.
- Real Groq: the actual four-page FOLLOW PDF produced a process visual with four verified quotations in 2,164 ms for one measured generation. A separate one-page fictional farm source produced a process visual in 1,568 ms and its index had 13 verified quotations. These are generation timings after transcript input, not end-to-end speech latency. The farm check used supplied page text, not a PDF extraction test.
- A burst of real requests also hit a temporary Groq rate limit. HTTP 429 now remains retryable rather than being mislabelled as exhausted billing quota; the live output budget is 2,048 tokens, with one 4,096-token repair if truncated. Failed requests keep the last visual and expose a retry action.
- Reports and desktop captures: [knowledge-canvas-evidence](knowledge-canvas-evidence/).

## Evolving board and local figures (17 October)

- Knowledge preparation marks every successfully grounded index concept `source-checked` automatically. No accept-each-topic workflow is required. Quotes that fail grounding are discarded; source-only recovery remains available.
- Groq chooses process, comparison, metric or connected-concept structures from what the speaker says. It receives selected source text and the transcript, never image pixels, local image descriptions or asset URLs. The v3 prompt asks for concrete contrasting details and complementary evidence rather than headings.
- The board presents up to three elements at once for desktop readability. A current explanation shares the stage with recent context. Comparisons show their two sides together; approved source-backed connections carry labels. Overview retains up to 24 introduced concepts. This is a bounded visual grammar, not arbitrary AI drawing or generated photography.
- Native vector icons, arrows and process diagrams are rendered locally from validated structure. Process paths and supporting points reveal with motion; reduced-motion settings disable these effects. Voice controls compact after the first explanation to give the canvas more room.
- Original raster and captioned vector PDF regions can be rendered locally and attached to their source pages. Caption/keyword matches add a figure alongside generated explanation; explicitly naming a numbered figure can display it without a Groq request. An image never replaces the generated process just because it shares the same page.
- Optional source controls let users inspect figures and include a whole-page visual. Captioned figures default to enabled; uncaptioned regions need opt-in to avoid decorative logos. Blob assets live only in this browser session and are revoked when the document is discarded. Exported manifests do not embed those pixels.
- Known limits: English caption patterns, bounded extraction (30 pages, 32 figures, 24 MB), no OCR, no image semantics, no newly generated photographs, and no guarantee that arbitrary PDF layouts will yield useful crops. Showcase content should be rehearsed with the actual PDF and voice in the room.

Validation: root unit tests cover exact-quote rejection, automatic use, multi-element retention, bounded history and non-overlapping board geometry. Desktop fixture browser checks cover evolving boards, comparisons, pause/unsupported holds, audience view and accessibility. Figure checks use a three-page internal PDF fixture (raster chart, vector diagram, text-only page) and assert text-only API traffic. These fixture checks do not measure real Groq quality or microphone recognition.

A real v3 Groq check against the actual FOLLOW PDF produced two comparison sides with three grounded details each and an approved comparison relationship. It took 7,314 ms including one grounding repair; the unsupported redundant comparison heading was discarded. The renderer recognizes a verified comparison relationship directly, so dropping that extra heading does not destroy the two-sided layout. This is a single measured result, not a latency guarantee.

## Continuous rendering and overlap fix (17 October, follow-up)

Every usable transcript now runs an immediate local retrieval pass before any remote request or queue check. It chooses from the original grounded topic index, including existing process and comparison structures; when indexing is sparse it can display exact matching excerpts from anywhere in the retained source text. This pass performs literal retrieval, not new AI reasoning. It requires sufficient matching words and still passes the same quote validation as generated scenes. Unsupported speech keeps the previous visual.

Groq refines the visual asynchronously. Only one request runs at a time, with the newest pending rolling context replacing previous pending text. Windows are no longer concatenated; microphone context is bounded to 35 words. A response for a different, superseded topic cannot overwrite a newer source match. A response for the same matched topic may refine it while speech continues; subsequent same-topic transcripts keep that refinement rather than reverting to the coarse preview. Provisional local elements are replaced by their refinement rather than added as duplicates. Canvas merges use functional React state updates.

The card renderer reserves distinct layout space for headings, body content and source provenance; long projected text uses bounded lines, with full text available through the studio inspector. Compact context nodes show a summary instead of squeezing a full process into a small tile. Free-floating edge labels no longer paint across content; comparison labels remain above the composition. The microphone meter, model progress, transcript, status and typed-input form have explicit grid rows to prevent control-panel overlap.

Validation: `latency_check.py` deliberately holds fixture AI responses while three consecutive explanations update the visible canvas. Its final local visual measured 144 ms including typing/clicking automation; this is not end-to-end microphone or real Groq latency. It checks latest-only queuing, stale-result rejection, preview replacement and title/body/provenance geometry, including 64-character titles and three 180-character details. The synthetic microphone check exercises the real capture/worklet path with two successive fixture transcripts while listening remains active, checks control-panel geometry, and verifies pause/restart and audience pause. Root tests: 100 passed; production build and TypeScript checks passed. Reports/screenshots: `docs/continuous-rendering-evidence/`.

Speech still uses 3.5-second PCM windows and local Whisper inference. There is no claim of instantaneous first audio recognition or immediate fresh AI generation; the improvement removes remote-generation latency from the initial display whenever source retrieval finds supporting material. The first Whisper model download and Groq rate limits remain unchanged.
