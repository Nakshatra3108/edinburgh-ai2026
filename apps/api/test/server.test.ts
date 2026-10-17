import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadConfig } from '../src/config.ts';
import { buildServer } from '../src/server.ts';
import { JobStore } from '../src/jobs.ts';
import type { CompletionProvider } from '../src/providers/groq.ts';
import { demo, demoPlan, demoSource, ok, scripted } from './fixtures.ts';

const config = (over: Record<string, string> = {}) =>
  loadConfig({ GROQ_API_KEY: 'gsk_test_key_never_returned', MAX_PREP_JOBS_PER_SESSION: '3', ...over }, '/nonexistent');
const body = (over: Record<string, unknown> = {}) => ({
  source: { ...demoSource, pages: demo.pages.map(({ page, text }) => ({ page, text })) }, ...over,
});
const app = (provider: CompletionProvider, over?: Record<string, string>) => buildServer({ config: config(over), provider, logger: false });
const prepare = (a: ReturnType<typeof app>, payload: unknown, headers: Record<string, string> = {}) =>
  a.inject({ method: 'POST', url: '/api/prepare', payload: payload as object, headers });
async function poll(a: ReturnType<typeof app>, jobId: string) {
  for (let i = 0; i < 200; i++) {
    const r = (await a.inject({ url: `/api/prepare/${jobId}` })).json();
    if (['done', 'failed', 'cancelled'].includes(r.stage)) return r;
    await new Promise((res) => setTimeout(res, 5));
  }
  throw new Error('job did not finish');
}

test('health reports provider and model, never the key', async () => {
  const a = app(scripted(ok(demoPlan())).provider);
  const r = await a.inject({ url: '/api/health' });
  assert.equal(r.statusCode, 200);
  assert.equal(r.json().provider, 'groq');
  assert.equal(r.json().configured, true);
  assert.ok(!r.body.includes('gsk_'));
});

test('without a key, prepare reports NOT_CONFIGURED', async () => {
  const a = buildServer({ config: loadConfig({}, '/nonexistent'), logger: false });
  assert.equal((await a.inject({ url: '/api/health' })).json().configured, false);
  const r = await prepare(a, body());
  assert.equal(r.statusCode, 503);
  assert.deepEqual(Object.keys(r.json()).sort(), ['code', 'message', 'requestId', 'retryable']);
  assert.equal(r.json().code, 'NOT_CONFIGURED');
});

test('config refuses a non-loopback host', () => {
  assert.throws(() => loadConfig({ API_HOST: '0.0.0.0' }, '/nonexistent'), /loopback/);
});

test('full job: submit, poll, grounded draft project', async () => {
  const a = app(scripted(ok(demoPlan())).provider);
  const r = await prepare(a, body());
  assert.equal(r.statusCode, 202);
  const done = await poll(a, r.json().jobId);
  assert.equal(done.stage, 'done');
  assert.equal(done.result.project.preparation.mode, 'groq');
  assert.equal(done.result.project.approvedRevision, null);
  assert.ok(done.result.warnings.length > 0);
  assert.ok(done.usage.totalTokens > 0);
});

test('source validation: page range, duplicates, size, and empty text', async () => {
  const a = app(scripted(ok(demoPlan())).provider, { MAX_SOURCE_CHARS: '1000' });
  const pages = body().source.pages;
  const cases: [unknown, number, string][] = [
    [body({ source: { ...body().source, pages: [{ page: 9, text: 'x' }] } }), 400, 'INVALID_SOURCE'],
    [body({ source: { ...body().source, pages: [pages[0], pages[0]] } }), 400, 'INVALID_SOURCE'],
    [body(), 413, 'SOURCE_TOO_LARGE'],
    [body({ source: { ...body().source, pages: [{ page: 1, text: '   ' }] } }), 400, 'INVALID_SOURCE'],
    [{ nonsense: true }, 400, 'INVALID_SOURCE'],
  ];
  for (const [payload, status, code] of cases) {
    const r = await prepare(a, payload);
    assert.equal(r.statusCode, status, code);
    assert.equal(r.json().code, code);
  }
});

test('disallowed origins are rejected; allowed origin gets CORS headers', async () => {
  const a = app(scripted(ok(demoPlan())).provider);
  const bad = await a.inject({ url: '/api/health', headers: { origin: 'https://evil.example' } });
  assert.equal(bad.statusCode, 403);
  assert.equal(bad.json().code, 'FORBIDDEN_ORIGIN');
  const good = await a.inject({ url: '/api/health', headers: { origin: 'http://127.0.0.1:5173' } });
  assert.equal(good.headers['access-control-allow-origin'], 'http://127.0.0.1:5173');
  const pre = await a.inject({ method: 'OPTIONS', url: '/api/prepare', headers: { origin: 'http://localhost:5173' } });
  assert.equal(pre.statusCode, 204);
});

test('one active job: duplicates reuse it, different sources are busy', async () => {
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  const { provider, calls } = scripted(async () => { await gate; return ok(demoPlan()); });
  const a = app(provider);
  const first = (await prepare(a, body())).json();
  const dup = (await prepare(a, body())).json();
  assert.equal(dup.jobId, first.jobId);
  const other = await prepare(a, body({ source: { ...body().source, pages: body().source.pages.slice(0, 1) } }));
  assert.equal(other.statusCode, 409);
  assert.equal(other.json().code, 'PREP_BUSY');
  release();
  await poll(a, first.jobId);
  assert.equal(calls.length, 1);
});

test('finished plans are cached; regenerate is explicit; session cap applies', async () => {
  const { provider, calls } = scripted(ok(demoPlan()));
  const a = app(provider, { MAX_PREP_JOBS_PER_SESSION: '2' });
  const first = (await prepare(a, body())).json();
  await poll(a, first.jobId);
  const again = (await prepare(a, body())).json();
  assert.equal(again.jobId, first.jobId);
  assert.equal(again.cached, true);
  assert.equal(calls.length, 1);

  const regen = (await prepare(a, body({ regenerate: true }))).json();
  assert.notEqual(regen.jobId, first.jobId);
  await poll(a, regen.jobId);
  assert.equal(calls.length, 2);

  const capped = await prepare(a, body({ regenerate: true }));
  assert.equal(capped.statusCode, 429);
  assert.equal(capped.json().code, 'PREP_LIMIT');
  const otherSession = await prepare(a, body({ regenerate: true, sessionId: 'second' }));
  assert.equal(otherSession.statusCode, 202);
});

test('cancel stops the job and suppresses a late result', async () => {
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  const a = app(scripted(async () => { await gate; return ok(demoPlan()); }).provider);
  const job = (await prepare(a, body())).json();
  const cancelled = (await a.inject({ method: 'DELETE', url: `/api/prepare/${job.jobId}` })).json();
  assert.equal(cancelled.stage, 'cancelled');
  release();
  await new Promise((r) => setTimeout(r, 20));
  const after = (await a.inject({ url: `/api/prepare/${job.jobId}` })).json();
  assert.equal(after.stage, 'cancelled');
  assert.equal(after.result, null);
  // The server is free again.
  assert.equal((await prepare(a, body({ regenerate: true }))).statusCode, 202);
});

test('deadline produces PREP_TIMEOUT and frees the server', async () => {
  const slow: CompletionProvider = (req) => new Promise((_, reject) => req.signal.addEventListener('abort', () => reject(req.signal.reason)));
  const jobs = new JobStore({ provider: slow, model: 'm', timeoutMs: 20, maxJobsPerSession: 3 });
  const input = { source: demoSource, pages: demo.pages, density: 'standard' as const };
  const job = jobs.submit(input, { sessionId: 's', regenerate: false });
  const done = await jobs.settled(job.jobId);
  assert.equal(done.stage, 'failed');
  assert.equal(done.error?.code, 'PREP_TIMEOUT');
  assert.equal(done.error?.retryable, true);
  const next = jobs.submit(input, { sessionId: 's', regenerate: true });
  assert.notEqual(next.jobId, job.jobId);
  assert.equal(next.error, null);
  jobs.cancel(next.jobId);
});

test('unknown job and unknown route return the error envelope', async () => {
  const a = app(scripted(ok(demoPlan())).provider);
  for (const url of ['/api/prepare/nope', '/api/nothing']) {
    const r = await a.inject({ url });
    assert.equal(r.statusCode, 404);
    assert.equal(r.json().code, 'NOT_FOUND');
    assert.ok(r.json().requestId);
  }
});
