# Present FOLLOW with FOLLOW

Upload [the text-only showcase PDF](../output/pdf/FOLLOW-Showcase.pdf) through **Upload your PDF**, then build the knowledge base and open the speaking studio. All seven pages explain the current software. For a shorter core demonstration, select pages **1, 2, 3 and 7** before building; these cover the flip, workflow, comparison and capacity facts.

The document is ordinary selectable PDF text. It contains no screenshots, diagrams, embedded images, hidden prompts or invented adoption/performance statistics. The application should compose the visuals from the source material.

## Suggested explanations

Use your own words; these phrases identify the intended source topics clearly:

1. “With traditional slides, the speaker follows a prewritten order. In FOLLOW, the visuals follow the speaker.”
2. “The workflow has four stages: build the knowledge base, transcribe the speech, retrieve source material and refine the explanation.”
3. “Compare fixed slides with FOLLOW. Slides separate information into pages; FOLLOW brings relevant elements together on an evolving canvas.”
4. “The active board shows up to three visual elements for readability. Overview retains up to twenty-four introduced concepts.”
5. “Audio is transcribed locally. Groq receives the selected document text and transcript, and generated claims are checked against source quotations.”

Switch back to the workflow after the comparison to demonstrate revisiting a topic. Audience preview shares the live board. Load and warm the voice model before the live presentation; typed input is available for rehearsal.

## Source map

- Page 1: problem, assumption reversal and use cases.
- Page 2: four-stage workflow and presenter controls.
- Page 3: fixed slides versus FOLLOW.
- Page 4: local source retrieval versus remote AI refinement; continuous speaking.
- Page 5: exact quotations, source provenance, unsupported speech and human judgment.
- Page 6: React, TypeScript, Vite, React Flow, PDF.js, Whisper, Transformers.js, Fastify, Zod, Groq and privacy boundaries.
- Page 7: the 3-element viewport, 24-concept history, 3.5-second speech windows and current prototype limits.

## Verification

All seven pages were rendered and inspected; every page contains selectable text, no embedded images and no off-page characters. The actual PDF.js extractor retains all seven pages. Real Groq preparation returned source-checked topics. Live remote checks subsequently hit `PROVIDER_RATE_LIMIT`; those checks are not claimed as successful process/comparison/metric generation. Browser upload and immediate local retrieval were checked separately, without more provider calls. See [validation](showcase-validation.json).

## Edit and rebuild

Edit [the source text](source/follow-showcase.md), then run `python3 demo/source/make_showcase_pdf.py` using a Python environment with ReportLab. It writes `output/pdf/FOLLOW-Showcase.pdf`. Recheck rendering and source extraction after editing. The PDF is a demonstration source, not a prebuilt project manifest or a guarantee of real-room speech accuracy.
