# Light studio refresh

Requested change: replace the confusing dark interface with a brighter, clearer visual experience.

- Light canvas and white surfaces, readable ink text and violet actions; contrast checked in browser automation.
- Real curated demo opens directly from the main action. Interactive entry preview demonstrates focus, process and comparison.
- Explicit workspace guidance, stronger topic cards/connectors, visible current topic and reveal counts.
- A main Reveal next point control; supporting-point buttons first in the inspector; editing and diagnostics progressively disclosed.
- Fixed real-content process/comparison clipping while keeping projector text readable.
- Pulled main commit c7f7799 with B's browser PDF module. The upload view now reads locally, reports page progress and opens the curated project only after its bytes/hash/pages/quotes match. The 20 MB limit matches the preparation contract. New selections cancel prior reads.
- Content editing preserves source references on unchanged points.

The AI matcher/controller, synchronized audience windows and persistence still require their respective integrations. This refresh does not simulate live AI or claim unknown PDFs have been prepared with Groq. Changes remain session-only.

Validation: production build and 49 unit tests pass. All 51 existing browser/accessibility checks pass after updating the workflow selectors. The new real-content check exercises every concept at 1280×720 and 1920×1080, measures essential text at a minimum of 22 rendered pixels, and finds no content clipping or browser runtime errors. It also verifies the direct demo action, renamed matching PDF acceptance and mismatched-hash rejection.

Screenshots and reports are in [ui-refresh-evidence/](ui-refresh-evidence/). Reproduce the longer-content checks with `python apps/web/src/canvas/qa/curated_check.py` against the running Vite server, using the same Playwright environment as the existing browser suite.
