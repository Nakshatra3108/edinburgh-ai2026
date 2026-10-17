# FOLLOW

A persistent visual canvas that follows an explanation rather than a fixed slide sequence.

This branch contains **Person A's runnable canvas and visual interface**. It runs without API keys. The original product plan is [FOLLOW-PRD.md](FOLLOW-PRD.md).

```sh
npm ci --prefix apps/web
npm run dev --prefix apps/web
```

Open http://127.0.0.1:5173, then **Open demo project** for the real curated source, or **Open example canvas** for the visual component examples. Click an idea to focus, reveal its supporting points, or expand **Action laboratory** to trigger FOCUS, REVEAL, CONNECT, COMPARE, OVERVIEW and HOLD. **Audience preview** shows the same renderer without studio controls and supports fullscreen.

The main demo uses the verified `demo/manifest.json`. Uploading its exact PDF also opens that project after local extraction and hash/quote verification. The separate visual-component example is explicitly illustrative. General PDF generation, local speech/matching, controller policy, synchronization and persistence are the other teammates' integrations; this preview does not pretend they are connected.

- [Light UI refresh and current visual behavior](docs/UI-REFRESH.md)
- [Earlier application audit and remaining integrations](docs/APPLICATION-STATUS.md)
- [Person A handoff and component API](docs/person-a/HANDOFF.md)
- [Design implementation](docs/person-a/DESIGN.md)
- [Validation and browser checks](docs/person-a/QA.md)

```sh
npm run test --prefix apps/web
npm run build --prefix apps/web
```

Preparation is configured for **Groq** using server-only `GROQ_API_KEY` and `GROQ_MODEL` (initial candidate `openai/gpt-oss-120b`). The existing backend smoke test runs with `npm run smoke:groq --prefix apps/api` after local environment setup. The full preparation endpoint remains to be implemented; the manual UI requires no key.
