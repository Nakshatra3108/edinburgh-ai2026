# FOLLOW application status — 17 October 2026

Audit baseline: main commit `e7b1370` (curated demo manifest), plus the Groq provider alignment in this branch. Only code available in the pulled repository was assessed; teammates may have unpublished work. There were no other open PRs at the start of this audit.

**The application currently works as a polished, manually controlled canvas with verified demo content. The speech-directed AI product is not connected yet.** The core live pipeline, controller, audience synchronization and persistence are the largest remaining tasks. No readiness percentage is assigned.

## What was verified

| Check | Result |
| --- | --- |
| Frontend unit tests | 39 pass, including the new Groq mode contract tests |
| Frontend production build | Pass |
| API TypeScript check | Pass |
| Actual curated PDF package | 6 concepts, 5 relationships, 52 source references match the 4-page PDF and SHA-256 |
| Existing example UI browser suite | 51 checks pass against the short illustrative fixture after Groq alignment; this does not cover longer real-content layout |
| Actual `demo/manifest.json` import | Pass through the start screen's Import project control |
| Actual demo audience views | All concepts manually exercised at 1280×720 and 1920×1080; process and comparison content clipping found |
| Browser runtime errors in curated-content audit | None |
| PDF selection | Valid PDF accepted, then explicitly reports preparation is not connected |
| Audience window | One browser page; audience preview is a screen change, not a synchronized separate window |
| Reload after project import | Returns to entry; imported project/session is not restored |
| Groq authenticated smoke request | Not verified: no local Groq key/model environment configured |
| Running API | No health endpoint available on port 8787; repository has CLI scripts, not an API server yet |

The curated-content measurements are in [status-evidence/curated-audit.json](status-evidence/curated-audit.json). The clipping is visible in [process](status-evidence/curated-process-clipping-720.png) and [comparison](status-evidence/curated-comparison-clipping-720.png) screenshots. The same world-space clipping occurs at 1080p, so a bigger projector resolution will not fix it.

A passing build and the short-fixture browser suite do not establish live AI readiness or successful layout of the longer real content.

## Groq decision is now consistent

Preparation uses **Groq**, configured with `GROQ_API_KEY` and `GROQ_MODEL`; the initial candidate is `openai/gpt-oss-120b`. The existing smoke script already targets Groq Chat Completions. The PRD, request shape, diagram labels and renderer preparation-mode validator now agree. Groq is the inference provider; the model ID is separately configurable.

Generated projects use `preparation.mode: 'groq'`; curated projects stay `curated`. The superseded provider-mode value is rejected. Existing checked-in manifests are curated and need no data migration. D should use the updated type when centralizing shared contracts. The full preparation adapter remains unimplemented; provider documentation and a smoke script are not a working integration.

Live speech and embeddings remain local in the agreed design. Changing the preparation provider does not move audio to a cloud speech API. Actual account access and allowance remain unverified here.

## PRD implementation inventory

| Feature | Current status | Remaining work / owner |
| --- | --- | --- |
| F01 PDF selection/validation | Partial | Header and 25 MB UI check exist. Align with PRD's 20 MB limit; add encryption/page-count/extraction errors. B |
| F02 extraction/provenance | Partial | Node PDF.js extractor and quote normalizer work in verification scripts. Browser extraction and preparation UI are absent. B |
| F03 Groq preparation | Not connected | Smoke script only. Implement provider adapter, validated plan generation, source grounding, job endpoints, deadlines/cancel/error states. B |
| F04 editable studio | Partial | Local title/summary/points/cues, enabled state, review and positions work. Complete relationship authoring and structured visual payload editing. D with A's visual callbacks |
| F05 page crops | Missing | Add PDF page preview/crop selection and local asset storage/resolution. B/D |
| F06 shared renderer | Working, with real-content defects | Five node types and six actions exist. Fix process and comparison clipping on the actual manifest; expand real-content regression coverage. A |
| F07 embeddings/matching | Missing from pulled code | Worker, concept vectors, semantic scores, margin/stability/hysteresis, distractor tests and invalidation on edits. C |
| F08 microphone transcription | Missing from pulled code | Capture permissions, local Whisper worker, resampling/chunking/deduplication, silence gate, bounded queue and measured latency. C |
| F09 Auto/Suggest/Manual | Manual preview only | Implement distinct policies and visible session states. D |
| F10 speech-directed actions | Manual action vocabulary works | Connect C's candidates/intents through D's controller to A's reducer. C/D |
| F11 manual recovery | Building blocks only | HOLD reducer and pre-reducer queue exist. Actual override dominance, stale seq/epoch rejection, mute/resume handling and late-result tests are absent. D |
| F12 audience window | Stage/fullscreen works | Separate window, semantic snapshot handshake, BroadcastChannel sync, reconnect and status are missing. D |
| F13 typed rehearsal | Missing | Add labelled typed input using the same matcher/controller, then use it to prove the first AI slice. C/D |
| F14 curated PDF package | CLI verified; app path partial | Real source and manifest exist and import manually. Wire a one-click real demo path and verify uploaded PDF hash before attaching its curated package. B/D |
| F15 save/export/import | Manual JSON import only | IndexedDB persistence, reload restoration, project export and asset bundling are missing. D |
| F16 recap | Missing | Record actual duration/visited topics/manual corrections; end capture and offer opt-in transcript retention/discard. D |
| F17 disclosed replay | Label support only | Add a real event fixture/player and resettable backup; do not claim manual/replay input is live AI. D/team |
| F18 preflight | Missing | Model/device readiness, downloads/warm-up, mic permissions, audience connection and recovery checks. C/D |

P2 items such as OCR, cloud collaboration, mobile controller and PPTX/video export remain outside the demo commitment. Do not build them before the live slice works.

## Concrete integration issues

1. The entry screen's **Open example canvas** still loads the illustrative fixture rather than the real curated manifest. Actual demo content works through **Import project** today.
2. Process nodes have a fixed 640-world-unit composition. The actual pipeline's text reaches 696 units inside a 637-unit content area; labels are visibly clipped. The actual comparison's right-hand group reaches 883 units inside 757. Fix content budgeting/layout without shrinking essential text below 22 rendered pixels.
3. The app's parent state is React `useState`. There is no independent running/preflight/capture/model/policy/override session controller. The manual `held` chip is not an enforcement mechanism for future AI events.
4. The shared-contract package and root npm workspace/start command are absent. Web and API packages currently install/check separately. D should consolidate the existing contracts rather than introduce a second renderer or diverging manifest shapes.
5. Saving Content currently rewrites every supporting point as user-authored and clears its sources, even when only the title changes (`StudioScreen.tsx`, ContentEditor save). Preserve unchanged points' provenance; invalidate only content actually edited.
6. The real curated manifest has concept/process/comparison material and no figure assets. The renderer supports figures/metrics, but that support alone does not make those source assets available in the real demo. Add a genuine PDF figure crop only if it improves the explanation; do not invent metrics to fill space.

## Next work, by teammate

| Person | Next concrete result |
| --- | --- |
| A | Fix the two real-manifest clipping cases, run every approved focus/reveal/comparison through the projector-size check, preserve unchanged point provenance on editing, then connect the existing views to D's app shell. |
| B | Keep the verified PDF/manifest stable. Configure and run the real Groq smoke test privately, build the preparation adapter/endpoints and browser PDF extraction. Hand C approved cues plus held-out paraphrases/distractors. General PDF generation can fall back to the curated manifest. |
| C | Deliver typed phrase → semantic match → versioned candidate first; test ambiguity and HOLD. Download/warm Whisper and embeddings early, measure real mic latency on the presentation laptop, then connect microphone chunks. |
| D | Freeze shared event/schema contracts, build policy/epoch/manual-hold controller, and wire typed matcher → reducer → stage. Then add presenter console and separate synchronized audience window, followed by local persistence, preflight, recap and replay. |

These are recommended work assignments, not messages sent to teammates or a claim about their unpublished local work.

## Order that protects the demo

1. **Finish the first working AI slice:** real curated manifest → typed paraphrase → semantic candidate → guarded controller → focus. This is the fastest way to expose contract and model problems.
2. **Make the live flip real:** microphone → local transcription → the same matching/controller path. Show a return to an earlier idea and an out-of-order process reveal/comparison. Generic filler should HOLD.
3. **Protect it:** manual override beats late candidates; mute/pause/restart cannot replay stale results; audience window stays synchronized; fix the known clipping before presenting the longer content.
4. **Make the demo repeatable:** cache/warm models, save/reload the approved project, provide an explicit reset and labelled replay/manual backup, and rehearse with the actual mic/projector.
5. **Only then broaden preparation:** finish general PDF/Groq generation if time allows. A curated source is an accepted fallback, but it does not replace the live speech/matching work needed to claim speech-directed behavior.

## Judging rubric and two-minute pitch

Source: the event slide supplied by the user in this chat. Two-minute presentation, one-minute Q&A, judges visit tables, top four teams present.

| Category | Weight | What FOLLOW must demonstrate |
| --- | --- | --- |
| Creativity | 40% | The speaker chooses the route through knowledge. Demonstrate a changed narrative order and a composed comparison; avoid a voice-controlled next-slide story. |
| Execution | 15% | The claimed reversal actually works in the live demonstration. Manual-only operation must be disclosed. |
| Presentation | 15% | State the old assumption and reversal in one sentence, then let judges experience it. Explain why the flip helps real conversations. |
| Tech stack explanation | 10% | Explain why each component serves the flip; disclose AI tools used. |
| Understanding | 10% | Each teammate can explain key mechanisms and identify limits, curated content and mocked/fallback paths. |
| Fit and ambition | 10% | Useful technical choices: reviewed semantic actions, local runtime, guarded controller and one shared canvas. |

Pitch allocation: 15 seconds problem/reversal; 60 seconds live non-sequential focus, process reveal and comparison; 20 seconds value; 15 seconds stack/why; 10 seconds closing. Reserve the separate minute for Q&A. This is a proposed script allocation, not a claim that the current build can already perform it.

## Final regression after Groq alignment

After Groq alignment: 39 frontend unit tests pass; frontend production build and API typecheck pass; all 52 curated source references still verify; all 51 existing browser/accessibility checks pass against the illustrative fixture. The real-content clipping findings remain open. The update does not implement the missing AI/server/controller features.
