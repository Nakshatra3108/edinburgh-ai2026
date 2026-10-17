import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildServer } from '../src/server.ts';
import { loadConfig } from '../src/config.ts';
import { runPreparation } from '../src/generation/prepare.ts';
import { demo, demoPlan, demoSource, ok, scripted } from './fixtures.ts';
const config = loadConfig({ GROQ_API_KEY: 'test-key' }, '/nonexistent');
const input = { source: demoSource, pages: demo.pages, density: 'standard' as const };
const body = { source: { ...demoSource, pages: demo.pages.map(({ page, text }) => ({ page, text })) }, utterance: 'Explain how the speaker decides what the audience sees.' };

test('preparation retains every selected page, beyond the short topic index', async () => {
  const result = await runPreparation(input, { provider: scripted(ok(demoPlan())).provider, model: 'm', signal: new AbortController().signal });
  assert.deepEqual(result.project.knowledgeBase?.pages, demo.pages.map(({ page, text }) => ({ page, text })));
  assert.equal(result.project.preparation.promptVersion, 'follow-knowledge-v2');
});

test('live composition uses transcript and full knowledge; drops invented evidence; caches repeats', async () => {
  const { provider, calls } = scripted(ok(demoPlan()));
  const a = buildServer({ config, provider, logger: false });
  const r = await a.inject({ method: 'POST', url: '/api/live/compose', payload: body });
  assert.equal(r.statusCode, 200, r.body);
  const result = r.json();
  assert.equal(result.supported, true);
  assert.ok(result.project.concepts.length <= 3);
  assert.ok(result.project.concepts.every((c: { review: string; details: { id: string }[] }) => c.review === 'source-checked' && !c.details.some(d => d.id === 'invented')));
  assert.ok(calls[0].messages.some(m => m.content.includes(body.utterance)));
  assert.ok(calls[0].messages[0].content.includes('LIVE COMPOSITION MODE'));
  assert.ok(calls[0].messages.some(m => m.content.includes(demo.pages[3].text)));
  assert.deepEqual((await a.inject({ method: 'POST', url: '/api/live/compose', payload: body })).json(), result);
  assert.equal(calls.length, 1);
  await a.close();
});

test('unrelated speech returns a hold, without repair or invented filler', async () => {
  const { provider, calls } = scripted(ok({ title: 'No support', concepts: [], relationships: [] }));
  const a = buildServer({ config, provider, logger: false });
  const r = await a.inject({ method: 'POST', url: '/api/live/compose', payload: { ...body, utterance: 'Tell me about quantum elephants on Mars.' } });
  assert.equal(r.statusCode, 200);
  assert.equal(r.json().supported, false);
  assert.deepEqual(r.json().project.concepts, []);
  assert.equal(calls.length, 1);
  await a.close();
});

test('live validates empty, duplicate, oversized and out-of-range knowledge pages', async () => {
  const { provider, calls } = scripted(ok(demoPlan()));
  const a = buildServer({ config, provider, logger: false });
  for (const pages of [[{ page: 1, text: ' ' }], [body.source.pages[0], body.source.pages[0]], [{ page: 99, text: 'source' }], [{ page: 1, text: 'x'.repeat(80001) }]]) {
    const r = await a.inject({ method: 'POST', url: '/api/live/compose', payload: { ...body, source: { ...body.source, pages } } });
    assert.ok([400, 413].includes(r.statusCode), r.body);
  }
  assert.equal(calls.length, 0);
  await a.close();
});

test('only one live generation runs at a time; later turns can run after it finishes', async () => {
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const { provider, calls } = scripted(async () => { await gate; return ok(demoPlan()); });
  const a = buildServer({ config, provider, logger: false });
  const first = a.inject({ method: 'POST', url: '/api/live/compose', payload: body });
  const waiting = first.then(x => x);
  while (!calls.length) await new Promise(resolve => setTimeout(resolve, 1));
  const other = await a.inject({ method: 'POST', url: '/api/live/compose', payload: { ...body, utterance: 'Explain a different aspect of the source document.' } });
  assert.equal(other.statusCode, 409);
  release();
  assert.equal((await waiting).statusCode, 200);
  assert.equal((await a.inject({ method: 'POST', url: '/api/live/compose', payload: { ...body, utterance: 'Now explain the reversal in the document.' } })).statusCode, 200);
  await a.close();
});

test('live without credentials returns a configuration error, not a fake scene', async () => {
  const a = buildServer({ config: loadConfig({}, '/nonexistent'), logger: false });
  assert.equal((await a.inject({ method: 'POST', url: '/api/live/compose', payload: body })).statusCode, 503);
  await a.close();
});
