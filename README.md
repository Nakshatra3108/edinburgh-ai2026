# FOLLOW

A persistent visual canvas that follows an explanation rather than a fixed slide sequence.

This branch contains **Person A's runnable canvas and visual interface**. It runs without API keys. The original product plan is [FOLLOW-PRD.md](FOLLOW-PRD.md).

```sh
npm ci --prefix apps/web
npm run dev --prefix apps/web
```

Open http://127.0.0.1:5173, then **Open example canvas**. Click an idea to focus, reveal its supporting points, or expand **Action laboratory** to trigger FOCUS, REVEAL, CONNECT, COMPARE, OVERVIEW and HOLD. **Audience preview** shows the same renderer without studio controls and supports fullscreen.

The six-concept example is explicitly illustrative. Import the team's prepared `demo/manifest.json` through **Import project** to inspect actual content. PDF preparation, local speech/matching, controller policy, synchronization and persistence are the other teammates' integrations; this preview does not pretend they are connected.

- [Person A handoff and component API](docs/person-a/HANDOFF.md)
- [Design implementation](docs/person-a/DESIGN.md)
- [Validation and browser checks](docs/person-a/QA.md)

```sh
npm run test --prefix apps/web
npm run build --prefix apps/web
```
