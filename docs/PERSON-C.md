# Person C: speech + matching

After the team merge, open **http://127.0.0.1:5173/speech.html**. The root URL serves Person A's canvas. This lab and its tests use `demo/speech-fixture.json`; the team's `demo/manifest.json` is B's real curated PDF manifest and is preserved independently. Existing accuracy results apply only to the illustrative speech fixture.

The lab's 24 paraphrases and six distractors now live in `demo/speech-phrases.json`. The team's new `demo/phrases.json` is the evaluation package for the real PDF and is preserved independently.

## Handoff to D

```ts
import { SpeechMatchingSession } from "../matching/session";

const runtime = new SpeechMatchingSession(approvedProject);
await runtime.loadEmbeddings();
await runtime.loadSpeech("Xenova/whisper-small.en", "wasm");
const unsubscribe = runtime.onCandidate((event) => {
  // Check event.version, projectId, revision, epoch and monotonically increasing seq.
  // D's authoritative controller applies Auto/Suggest/Manual and manualHold policy.
  // After the controller accepts an action, acknowledge its active-topic context:
  // runtime.accept(event);
});
runtime.submit("A typed rehearsal sentence");
// User gesture only:
await runtime.startMicrophone();
// On manual focus, mute, stop, input changes, or policy transitions:
runtime.stop(); // releases tracks + invalidates pending work
// Dispose when leaving the session:
unsubscribe();
runtime.dispose();
```

`getSnapshot` / `subscribe` work with React `useSyncExternalStore`. Candidates include `version: 1`, project ID/revision, global increasing `seq`, session `epoch`, input source, finalized text, best concept, cosine score, runner-up margin, stable flag, proposed CanvasAction, reason and matching duration. Raw audio is not included. Sequence gaps are expected when old queued audio is dropped.

`accept(event)` acknowledges the current stable suggestion only. It does **not** implement Auto/Manual policy or manual-hold arbitration. D must own those independent states. On a manual action, use `runtime.reset('Manual override', conceptId)` to stop capture, invalidate old work and synchronize active-topic context. Resume microphone capture explicitly after releasing manual hold. Create/dispose the runtime when the approved project revision changes; the current worker index belongs to that immutable revision. Never create inference instances in the audience window.

## Matching behavior

Enabled, reviewed concepts only. Each title, summary, alias and speech example gets its own normalized mean-pooled embedding. Per concept, aggregate the best two similarities. Fresh text and a rolling maximum 24-word window are embedded; recent context can lower the fresh score but cannot promote an unrelated utterance. This keeps previous-topic context from turning off-topic speech into eligible evidence. Details are matched against their own approved text.

The PRD's starting defaults were cosine ≥0.45 and runner-up margin ≥0.08. A separate 12-phrase / six-distractor rehearsal calibration selected new-topic cosine ≥0.35 and margin ≥0.02, with two distinct eligible observations. Accepted-topic retention uses ≥0.30 and margin ≥0.01. Detail reveal remains ≥0.60 and ≥0.08 margin within the accepted concept. Configuration lives in `demo/matcher-config.json` and is specific to this illustrative project. These scores are not confidence percentages. The Node CPU evaluation then selected 22/24 paraphrases correctly and held 6/6 distractors; two wrong topic selections remain, so Suggest is the default. These development results do not replace fresh held-out, temporal, acoustic or browser acceptance checks.

Silence, filler, duplicated final text, negation, stale sequences and uncertain scores HOLD. Conservative negation handling deliberately defers phrases containing `not`, `never`, etc. to manual review. Comparisons need two uniquely resolved endpoints in recent context and an approved comparison relationship; connections need one exact approved relationship label. These explicit intent rules are bounded prototype behavior, not a general language parser. Topic changes, COMPARE and CONNECT use two-hit stability. REVEAL requires the active topic and cannot repeat an acknowledged detail.

## Audio and timing

AudioWorklet mixes channels to mono, batches 4096 samples, resamples actual input-rate PCM to 16 kHz with area averaging, and emits 3.5-second windows with 0.5-second overlap. RMS <0.008 skips a window without cancelling speech already being transcribed or dismissing a valid suggestion. Stop/reset/mute still invalidate pending inference. This is a cheap tuning gate, not diarisation or a production VAD. Test quiet voices and room noise before adjusting it. The resampler is a prototype, not a studio-quality resampling filter.

Live queue: one executing ASR chunk plus newest pending. New pending audio replaces old pending audio; reset invalidates both pending work and late results. Word overlap uses case/punctuation-normalized suffix/prefix alignment; it does not claim forced alignment or perfect deduplication of inconsistent ASR hypotheses. Only complete chunk transcripts enter matching; there is no provisional-token UI.

The lab displays real ASR inference duration, embedding/scoring duration, and response time after a chunk completes. These exclude time spent waiting to finish collecting the chunk. Measure actual phrase-end-to-decision delay separately. Console `[FOLLOW ASR]` entries contain model-runtime timings, not invented benchmark values. Keep Suggest when sustained real speech-to-visual delay exceeds five seconds. Recorded clips process all their chunks in order; they are explicitly labelled `recording`, not microphone input.

The feedback block above the preview displays capture/transcription state and the last raw recognized phrase before semantic matching. Suggest remains default. The optional **Follow matched speech automatically in this preview** checkbox acknowledges stable candidates locally so the diagnostic stage can update hands-free. Switching it stops capture and resets pending evidence; restart the microphone afterward. It does not implement D's full controller or connect to the separate canvas page.

## Models and offline operation

| Model                     | Pinned revision                            | License    |
| ------------------------- | ------------------------------------------ | ---------- |
| `Xenova/all-MiniLM-L6-v2` | `751bff37182d3f1213fa05d7196b954e230abad9` | Apache-2.0 |
| `Xenova/whisper-tiny.en`  | `79fb389fc764e7c395bd330e9531d9d32ada7049` | Apache-2.0 |
| `Xenova/whisper-small.en` | `fa16a75f5d91e83ecb6a2ccb690f14d91ef00ca4` | Apache-2.0 |

Transformers.js 4.3.1; q8 weights. Models use their original public ONNX exports. Revision pins verified against Hugging Face metadata at implementation time. MiniLM uses WASM; Whisper uses explicitly selected WASM or WebGPU. No automatic backend fallback is hidden from the operator. Public model files download only after explicit load. Browser caching is handled by Transformers.js and may be evicted; cache presence is not a guarantee of offline availability.

`predev` / `prebuild` copy the installed ONNX runtime's matching WASM and module assets to localhost. Production `dist` includes them. Model weights are not committed. Before a pitch: load models, reload the app with networking disabled, warm again, and test the exact selected model. A deterministic browser test of that offline reload is separate from the microphone acoustic test.

Browser verification also successfully transcribed the public JFK recording with Whisper Small.en q8 on WASM. The initial full browser test took about six minutes including downloads, embedding evaluation, warm-up and multiple recorded-audio chunks. This is not a per-phrase latency measurement. The device reports an AMD Ryzen 7 6800HS and an NVIDIA RTX 3050 Laptop GPU; WebGPU remains an explicit separate configuration to benchmark.

References: [Transformers.js](https://huggingface.co/docs/transformers.js/), [MiniLM model](https://huggingface.co/Xenova/all-MiniLM-L6-v2), [Whisper small.en export](https://huggingface.co/Xenova/whisper-small.en), [OpenAI Whisper small](https://huggingface.co/openai/whisper-small). Preserve upstream license notices when distributing model files.

## Remaining release acceptance

- Test a fresh teammate-authored holdout; record wrong matches separately from HOLD.
- Three silence intervals, two topic returns, two approved comparisons, one manual interruption.
- Benchmark Small and Tiny on the actual laptop microphone; include phrase-end delay and noisy-room behavior.
- Verify microphone permission denial, disconnect/reconnect, and cancellation during permission prompt.
- Integrate D's policy/manual-hold controller, approved revision changes, and audience-window activity.
- Validate offline reload on the actual demo browser after cache warm-up.
- Integrate B's real `demo/manifest.json` into the speech runtime and recalibrate with fresh phrases; the lab's `demo/speech-fixture.json` remains illustrative.

Do not mark these live acceptance checks passed based on unit tests or a prerecorded model smoke test.
