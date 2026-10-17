import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PrepError } from '../src/errors.ts';
import { TOKEN_BUDGET, runPreparation } from '../src/generation/prepare.ts';
import { ProviderHttpError, createGroqProvider } from '../src/providers/groq.ts';
import { demo, demoPlan, demoSource, ok, scripted } from './fixtures.ts';

const input = { source: demoSource, pages: demo.pages, density: 'standard' as const };
const run = (provider: Parameters<typeof runPreparation>[1]['provider'], signal = new AbortController().signal) =>
  runPreparation(input, { provider, model: 'openai/gpt-oss-120b', signal, sleep: async () => {} });
const rejectsWith = async (p: Promise<unknown>, code: string) => {
  await assert.rejects(p, (e: unknown) => e instanceof PrepError && e.code === code);
};

test('success on first attempt records usage', async () => {
  const { provider, calls } = scripted(ok(demoPlan()));
  const r = await run(provider);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].maxCompletionTokens, TOKEN_BUDGET.initial);
  assert.deepEqual(r.attempts.map((a) => a.outcome), ['ok']);
  assert.equal(r.usage.totalTokens, 150);
  assert.ok(r.project.concepts.length > 0);
});

test("finish_reason 'length' is retried once with a larger budget", async () => {
  const { provider, calls } = scripted(ok('{"title":', { finishReason: 'length' }), ok(demoPlan()));
  const r = await run(provider);
  assert.equal(calls.length, 2);
  assert.equal(calls[1].maxCompletionTokens, TOKEN_BUDGET.afterTruncation);
  assert.equal(calls[1].messages.length, 3, 'repair adds a note');
  assert.deepEqual(r.attempts.map((a) => [a.kind, a.outcome]), [['initial', 'truncated'], ['repair', 'ok']]);
  assert.equal(r.usage.totalTokens, 300);
});

test('truncated twice fails as OUTPUT_TRUNCATED', async () => {
  const { provider, calls } = scripted(ok('{', { finishReason: 'length' }));
  await rejectsWith(run(provider), 'OUTPUT_TRUNCATED');
  assert.equal(calls.length, 2);
});

test('invalid JSON gets one repair', async () => {
  const { provider, calls } = scripted(ok('not json'), ok(demoPlan()));
  await run(provider);
  assert.equal(calls.length, 2);
});

test('a plan with no verifiable quotes is repaired, then fails INVALID_PLAN', async () => {
  const fake = { title: 't', concepts: [{ ...demoPlan().concepts[5] }], relationships: [] };
  const { provider, calls } = scripted(ok(fake));
  await rejectsWith(run(provider), 'INVALID_PLAN');
  assert.equal(calls.length, 2);
});

test('auth errors are never retried', async () => {
  const { provider, calls } = scripted(new ProviderHttpError(new PrepError('PROVIDER_AUTH'), null));
  await rejectsWith(run(provider), 'PROVIDER_AUTH');
  assert.equal(calls.length, 1);
});

test('rate limit is retried once, then surfaces', async () => {
  const limited = new ProviderHttpError(new PrepError('PROVIDER_RATE_LIMIT'), 0);
  const a = scripted(limited, ok(demoPlan()));
  await run(a.provider);
  assert.equal(a.calls.length, 2);
  const b = scripted(limited);
  await rejectsWith(run(b.provider), 'PROVIDER_RATE_LIMIT');
  assert.equal(b.calls.length, 2);
});

test('transport retry and repair budgets are independent and bounded', async () => {
  const { provider, calls } = scripted(new PrepError('PROVIDER_UNAVAILABLE'), ok('nope'), ok('nope'));
  await rejectsWith(run(provider), 'INVALID_PLAN');
  assert.equal(calls.length, 3);
});

test('abort reason is surfaced (timeout/cancel)', async () => {
  const ac = new AbortController();
  const { provider } = scripted(async () => {
    ac.abort(new PrepError('PREP_TIMEOUT'));
    throw ac.signal.reason;
  });
  await rejectsWith(run(provider, ac.signal), 'PREP_TIMEOUT');
});

test('Groq adapter maps HTTP errors and never exposes the provider body', async () => {
  const respond = (status: number, body: unknown, headers: Record<string, string> = {}) =>
    createGroqProvider({ apiKey: 'gsk_secret', model: 'm', fetchImpl: async () => new Response(JSON.stringify(body), { status, headers }) });
  const call = (p: ReturnType<typeof respond>) => p({ messages: [], schemaName: 's', schema: {}, maxCompletionTokens: 1, signal: new AbortController().signal });
  const cases: [number, unknown, string][] = [
    [401, { error: { message: 'Invalid API Key gsk_secret' } }, 'PROVIDER_AUTH'],
    [429, { error: { code: 'rate_limit_exceeded', message: 'slow down' } }, 'PROVIDER_RATE_LIMIT'],
    [400, { error: { code: 'json_validate_failed', message: 'x' } }, 'INVALID_PLAN'],
    [404, { error: { code: 'model_not_found', message: 'x' } }, 'NOT_CONFIGURED'],
    [503, { error: { message: 'down' } }, 'PROVIDER_UNAVAILABLE'],
  ];
  for (const [status, body, code] of cases) {
    await assert.rejects(call(respond(status, body, { 'retry-after': '2' })), (e: unknown) => {
      assert.ok(e instanceof PrepError && e.code === code, `${status} -> ${code}`);
      assert.ok(!e.message.includes('gsk_secret'));
      return true;
    });
  }
  const r = await call(respond(200, { model: 'm', choices: [{ finish_reason: 'stop', message: { content: '{}' } }], usage: { prompt_tokens: 1, completion_tokens: 2, total_tokens: 3, completion_tokens_details: { reasoning_tokens: 1 } } }));
  assert.deepEqual(r, { content: '{}', finishReason: 'stop', model: 'm', usage: { promptTokens: 1, completionTokens: 2, reasoningTokens: 1, totalTokens: 3 } });
});
