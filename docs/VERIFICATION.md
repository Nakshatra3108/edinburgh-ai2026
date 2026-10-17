# Person C verification — 17 October 2026

Implemented and verified locally; this does not mark the full FOLLOW PRD complete.

Team merge verification: `origin/main`'s canvas, API and curated manifest were merged into the Person C feature branch. The combined suite passed **62 unit tests**, **4 browser tests**, strict typechecking and a production build of both pages. The opt-in real-model test was not rerun for this Git recovery. The canvas at `/` successfully imports B's unchanged curated manifest; the speech lab at `/speech.html` retains its separate illustrative fixture and original matching/audio workers. Windows checkout had converted the PDF's line endings: the exact repository bytes were restored and `*.pdf binary` added to `.gitattributes`. Its SHA-256 now matches the curated manifest; a regression test checks this.

| Check                                                          | Observed result                                                                                |
| -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| TypeScript strict check and Vite production build              | Passed                                                                                         |
| Matcher, audio queue, contracts and runtime unit tests         | 23 passed                                                                                      |
| Chromium initial state, 390 px layout, errors and cancellation | Passed                                                                                         |
| Real MiniLM embeddings in Node CPU and Chromium WASM           | 22/24 topic paraphrases selected correctly; 6/6 distractors held                               |
| Whisper Small.en q8, Chromium WASM                             | Transcribed the prerecorded JFK sample successfully                                            |
| Whisper Tiny.en q8, Chromium WASM                              | Transcribed the same prerecorded sample successfully                                           |
| Real AudioWorklet with synthetic silent MediaStream            | Silent chunks held; stopping ended the tracks                                                  |
| Simulated browser microphone permission denial                 | Visible recovery error; controls recovered                                                     |
| Cached model reload, all external HTTPS requests blocked       | Embeddings and Tiny warmed successfully using localhost runtime assets and browser model cache |
| Dependency audit                                               | 0 vulnerabilities at verification                                                              |

The initial Small browser run took about six minutes **including** first downloads, warm-up, ranking evaluation and multiple ASR chunks. This is not a per-phrase latency number. One Tiny recorded-audio observation reported approximately 3,021 ms for ASR and 60 ms for matching; later runs can differ. The matching score is a cosine similarity, not a confidence probability.

Two evaluation phrases selected incorrect topics after calibration. Keep Suggest as the default. The phrase set is now development evidence, so ask a teammate to provide fresh held-out examples before claiming acceptance. The temporal two-hit and stale-result guards are tested separately from isolated topic ranking.

Generated reports: `artifacts/browser-ranking.json`, `artifacts/browser-whisper-tiny.en.json`, `artifacts/model-smoke-whisper-tiny.en.json`. Browser screenshots are written under `test-results/` and replaced by subsequent test runs. Large model files and browser test profiles are ignored by Git.

Not yet verified: actual operator microphone acoustics, noisy-room recognition, live end-of-phrase latency, a source-grounded PDF manifest, WebGPU performance, and D's authoritative controller/manual-hold integration. No claim of these checks passing is made from prerecorded or synthetic audio.
