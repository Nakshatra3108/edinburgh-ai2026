# Person A — FOLLOW canvas and visual design

Run from the repository root (Node 22.12+; npm):

```sh
npm ci
npm run dev
npm test
npm run build
```

Open http://127.0.0.1:5173. Open example canvas, choose a concept, reveal its details, compare the approved pair, or expand Action laboratory for all six actions. Audience preview uses the same renderer. Fullscreen needs a click inside that view.

Integration note: use the repository-root lockfile for the combined web/shared workspace. Person C's independent diagnostic harness is available at `/speech.html`; the canvas start page remains at `/`. The API retains its separate package and lockfile.

## Ownership and integration

This branch implements Person A's renderer, custom nodes, design tokens, motion, audience stage, entry screen and studio visuals. Main had no scaffold when work started. `apps/web/package.json`, `vite.config.ts`, `index.html` and `src/preview/` are an executable harness, not a replacement for Person D's app/controller. Keep or merge these scaffolding files when integrating. No `packages/shared`, API, matching, audio, persistence, or team `demo/` files were created or changed.

Person D imports these directly:

```tsx
import { applyAction, createCanvasState } from './canvas/applyAction';
import { FollowCanvas } from './canvas/FollowCanvas';
import { AudienceScreen } from './screens/AudienceScreen';
import './styles/base.css';
import './styles/canvas.css';
import './styles/app.css';

// project is the validated, approved Project from demo/manifest.json or preparation.
const initialCanvas = createCanvasState(project);
// In D's controller, after policy/epoch/manual-hold validation:
const nextCanvas = applyAction(initialCanvas, { type: 'FOCUS', conceptId });

<FollowCanvas
  state={canvasState}
  mode="studio"
  cameraOrigin={lastActionOrigin} // 'manual' | 'automatic'
  reducedMotion={osReducedMotion || presenterReducedMotion}
  onAction={dispatchManualAction}
  onPositionChange={updateHomePosition}
  resolveAsset={asset => resolvedLocalBlobUrls.get(asset.blobKey)}
/>

<AudienceScreen
  state={syncedCanvasState}
  cameraOrigin={lastActionOrigin}
  inputMode={inputMode} // 'microphone' | 'typed' | 'manual' | 'replay'
  reducedMotion={osReducedMotion || presenterReducedMotion}
  resolveAsset={resolveLocalAsset}
/>
```

`canvas/domain.ts` is a structural copy of PRD §11.1 so Person A can work without modifying the frozen shared package. Once D supplies the contracts, replace those local domain aliases with type imports from the shared package, resolving any differences with D. `CanvasState` is renderer-owned; no transcript, microphone, credentials, or presenter notes belong in it.

`applyAction(state, action)` is pure. Invalid, disabled, unreviewed, unknown, self-comparison and unapproved relationship targets are no-ops. HOLD preserves object identity. It does **not** implement the session's manual override: D must hold follow and invalidate stale candidates before calling it. Details stay revealed on return visits. A focus of a comparison node uses its approved endpoints, never an invented pair.

`createVisualActionScheduler(commit)` from `canvas/camera.ts` is an optional pre-reducer queue for D. Call `submit(action, origin, changesFrame)` only after validating targets, policy and epochs. The commit callback must recheck policy/epoch validity before applying the action to the authoritative state. It coalesces automatic destinations with a 2.5 s interval. Manual actions and HOLD cancel queued work immediately; pass `changesFrame=false` for same-topic REVEAL. Call `cancel()` on epoch/policy changes and `dispose()` on session teardown. Keep one queue in the controller, not one per renderer/window. D can instead use its own controller queue with the same invariants.

Camera movement lasts 280 ms and is interruptible; manual framing is instant. FollowCanvas itself always renders committed state immediately, without an independent semantic queue that could diverge from the controller. Resize refits after 100 ms without resetting visual state. Send semantic state between audience/presenter windows; each renderer frames to its own viewport.

Position changes occur only in unlocked studio Overview. Persist positions upstream. Comparison detail groups use temporary positions; underlying home positions remain intact. Context nodes are suppressed in focused framing so unrelated text cannot bleed into the audience composition. Returning to Overview restores the full map and home anchors.

`resolveAsset` receives each declared asset and returns an already cropped local Blob URL or bundled path. B/D own reading IndexedDB blobs, cropping, URL lifetime and asset transfer to the audience window. The default resolver serves only bundled `/examples/` assets, never remote URLs or arbitrary imported storage keys. Missing images show an explicit fallback. Fonts are bundled under `public/fonts/` with OFL license notices. Copy these public files and assets with the app.

## Studio visual shell

`StudioScreen` accepts `state`, `onAction`, `onConceptEdit`, `onPositionChange` and navigation/accessibility callbacks. Content and cues are actual editable local controls. Changing text marks content as needing review. There is a human review action, enabled-state control, visual simplification, source inspection, approved-relationship preview, reveal controls and linear text outline.

D owns full relationship authoring, crop selection, schema-changing visual payload edits, revision persistence and embedding rebuilds. Those are integration hooks, not fake completion buttons. D's approved runtime must remain separate from draft edits. The standalone harness returns to Overview after edits and never runs Auto. Its shortcuts are **preview-only**; remove the StudioScreen shortcut effect when D's shortcut owner is connected, so there is one keyboard handler. Buttons remain available for every implemented shortcut.

The start screen accepts real PDF files, checks the header and 25 MB limit, and explicitly reports that B's preparation pipeline is not connected. JSON import validates structure and references before rendering. It is an input for inspecting a prepared manifest, not D's persistent project import/export feature. To inspect the team's `demo/manifest.json` now, use Import project and select that file. In the final app, pass that validated project straight to the components above.

Audience rendering has a 16:9 region with 5% horizontal and 6% vertical safe margins, a small wordmark and replay disclosure when `inputMode='replay'`. It strips unreviewed concepts. Projector text is independent of app chrome. Fullscreen controls recede in fullscreen but remain keyboard reachable. The stage preserves its current visual if the parent stops sending updates. BroadcastChannel/handshake/reconnection belongs to D; this branch does not claim it is connected.

## Content and honesty

`src/canvas/fixtures/manifest.json` is an explicitly illustrative six-concept example covering all five custom node types. The source name says it is not a PDF; an all-zero SHA is a sentinel, **not a verified source hash**. Its sample value 6 counts its six topics and quotes the authored example sentence; it is not a benchmark. The architecture SVG describes the intended product architecture, not an already functioning AI pipeline. Replace with B's verified source package before the pitch.

This branch makes no AI calls, needs no API credits and never labels manual actions as AI. There is no live microphone, transcription, matcher, Groq preparation, save/reload guarantee or cross-window synchronization here. Content edits last only while the standalone app is open. The real document, model latency and semantic accuracy remain B/C/D's verification work.

## Validation

Unit and browser checks are documented in [QA.md](QA.md). Browser automation is scoped to Person A under `apps/web/src/canvas/qa/`; it does not take ownership of D's integration test directory.
