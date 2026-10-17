# Person A validation

Validated locally on 17 October 2026. These results cover the canvas/UI branch, not the whole speech/AI application.

- Strict TypeScript and Vite production build pass.
- 37 unit tests pass: reducer immutability, HOLD identity, invalid and unapproved targets, disabled/unreviewed concepts, out-of-order persistent reveals, approved comparisons, endpoint introduction, stable home positions, bounded state, schema/reference validation, local asset resolution, easing, automatic coalescing, manual interruption, HOLD cancellation, and queue disposal.
- 51 browser checks pass. Browser results and screenshots are recorded in `qa/`. The browser script checks all actions, prepared-manifest import, malformed inputs, projector layouts, content bounds, actual transformed font sizes, fullscreen, keyboard focus, review gating, the text outline, reduced motion and automatic/manual queue behavior.
- Axe-core WCAG A/AA checks run on entry, studio, audience node variants and mobile entry. Passing automated checks is not a complete human accessibility certification.
- Audience tested at 1280×720 and 1920×1080; essential text is measured at ≥22 rendered pixels. Tablet at 1024×768, mobile at 390×844, and effective 200% desktop layout at 720×450 are checked for page overflow.
- No browser runtime errors in the test run. Fonts and the example figure are served locally. npm installation reported no dependency vulnerabilities at verification time.

## Reproduce

```sh
npm ci --prefix apps/web
npm run test --prefix apps/web
npm run build --prefix apps/web
npm run dev --prefix apps/web
```

In a separate terminal:

```sh
python3 -m venv /tmp/follow-qa
/tmp/follow-qa/bin/pip install -r apps/web/src/canvas/qa/requirements.txt
/tmp/follow-qa/bin/python -m playwright install chromium
/tmp/follow-qa/bin/python apps/web/src/canvas/qa/browser_check.py
```

The browser runner uses the existing server at http://127.0.0.1:5173. Set `FOLLOW_URL` to another Vite dev server and `FOLLOW_QA_DIR` for another screenshot/report folder. Its final automatic-camera probe imports a test-only module through Vite, so that portion needs the development server. Test the production bundle separately with `npm run preview --prefix apps/web`.

## Remaining team validation

Person B must validate actual PDF extraction and quoted provenance. C must measure microphone/transcription/matching latency and accuracy. D must validate policy and epoch handling, synchronize semantic snapshots, persist approved content, and wire the renderer callbacks. The team must still test the real projector, real microphone, actual approved manifest and full integrated demo. No claim of those tests is made by this branch.
