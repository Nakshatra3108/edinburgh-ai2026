// Fastify app for preparation (PRD §11.2, §13.2). Loopback only, allowlisted
// origins, JSON bodies with a size cap, and an error envelope that never
// carries provider bodies, stack traces or credentials. Request logs record
// method, URL, status and timing only; source text is never logged.

import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify';
import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { Config } from './config.ts';
import { PrepError, envelope } from './errors.ts';
import { JobStore } from './jobs.ts';
import { normalizeText } from './generation/sourceText.ts';
import { PLAN_LIMITS, PLAN_SCHEMA_VERSION } from './generation/planSchema.ts';
import { runPreparation } from './generation/prepare.ts';
import { PROMPT_VERSION } from './generation/prompt.ts';
import { createGroqProvider, type CompletionProvider } from './providers/groq.ts';

export const MAX_SELECTED_PAGES = 20;
const BODY_LIMIT = 1024 * 1024;

const prepareBody = z.object({
  sessionId: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/).default('default'),
  regenerate: z.boolean().default(false),
  density: z.enum(['standard', 'concise']).default('standard'),
  source: z.object({
    name: z.string().trim().min(1).max(300),
    sha256: z.string().regex(/^[a-f0-9]{64}$/i).transform((s) => s.toLowerCase()),
    pageCount: z.number().int().positive().max(10_000),
    pages: z.array(z.object({ page: z.number().int().positive(), text: z.string() }).strict()).min(1),
  }).strict(),
}).strict();

export type ServerDeps = { config: Config; provider?: CompletionProvider; logger?: boolean };

export function buildServer({ config, provider, logger = true }: ServerDeps): FastifyInstance {
  const app = Fastify({ logger, bodyLimit: BODY_LIMIT, genReqId: () => randomUUID() });
  const configured = Boolean(provider ?? config.groqApiKey);
  const completion = provider ?? (config.groqApiKey ? createGroqProvider({ apiKey: config.groqApiKey, model: config.groqModel }) : null);
  let liveBusy = false;
  const liveCache = new Map<string, unknown>();
  const jobs = configured
    ? new JobStore({
        provider: completion!,
        model: config.groqModel,
        timeoutMs: config.prepTimeoutMs,
        maxJobsPerSession: config.maxPrepJobsPerSession,
      })
    : null;
  const allowed = new Set(config.webOrigins);
  const fail = (reply: FastifyReply, req: FastifyRequest, error: PrepError) => reply.code(error.status).send(envelope(error, req.id));

  // Origin allowlist. Requests without an Origin header (same-origin proxy, curl) are allowed:
  // the server only listens on loopback.
  app.addHook('onRequest', async (req, reply) => {
    const origin = req.headers.origin;
    if (origin && !allowed.has(origin)) return fail(reply, req, new PrepError('FORBIDDEN_ORIGIN'));
    if (origin) {
      reply.header('Access-Control-Allow-Origin', origin).header('Vary', 'Origin');
      if (req.method === 'OPTIONS') {
        return reply.code(204).header('Access-Control-Allow-Methods', 'GET,POST,DELETE').header('Access-Control-Allow-Headers', 'content-type').header('Access-Control-Max-Age', '600').send();
      }
    }
  });

  app.setErrorHandler((error: Error & { statusCode?: number; code?: string }, req, reply) => {
    if (error instanceof PrepError) return fail(reply, req, error);
    if (error.code === 'FST_ERR_CTP_BODY_TOO_LARGE') return fail(reply, req, new PrepError('SOURCE_TOO_LARGE'));
    if (error.statusCode && error.statusCode < 500) return fail(reply, req, new PrepError('INVALID_SOURCE', 'The request body is not valid JSON for this endpoint.'));
    req.log.error({ err: { name: error.name, message: error.message } }, 'unhandled error');
    return reply.code(500).send(envelope(new PrepError('PROVIDER_UNAVAILABLE', 'Internal server error.', { retryable: false }), req.id));
  });
  app.setNotFoundHandler((req, reply) => fail(reply, req, new PrepError('NOT_FOUND', 'Unknown endpoint.')));

  app.get('/api/health', async () => ({
    ok: true,
    provider: 'groq',
    model: config.groqModel,
    configured,
    promptVersion: PROMPT_VERSION,
    schemaVersion: PLAN_SCHEMA_VERSION,
    limits: { maxSelectedPages: MAX_SELECTED_PAGES, maxSourceChars: config.maxSourceChars, timeoutMs: config.prepTimeoutMs, maxJobsPerSession: config.maxPrepJobsPerSession, plan: PLAN_LIMITS },
  }));

  app.post('/api/prepare', async (req, reply) => {
    if (!jobs) throw new PrepError('NOT_CONFIGURED', 'GROQ_API_KEY is not set on the server.');
    const parsed = prepareBody.safeParse(req.body);
    if (!parsed.success) throw new PrepError('INVALID_SOURCE', `Invalid request: ${parsed.error.issues[0]?.path.join('.') || 'body'} ${parsed.error.issues[0]?.message ?? ''}`.trim());
    const { source, density, sessionId, regenerate } = parsed.data;

    const seen = new Set<number>();
    const pages = [];
    for (const p of source.pages) {
      if (p.page > source.pageCount || seen.has(p.page)) throw new PrepError('INVALID_SOURCE', `Page ${p.page} is duplicated or outside the document.`);
      seen.add(p.page);
      // Same normalizer as the browser; idempotent on already-normalized text, so client offsets stay valid.
      pages.push({ page: p.page, text: normalizeText(p.text) });
    }
    pages.sort((a, b) => a.page - b.page);
    if (pages.length > MAX_SELECTED_PAGES) throw new PrepError('SOURCE_TOO_LARGE', `Select at most ${MAX_SELECTED_PAGES} pages.`);
    const chars = pages.reduce((n, p) => n + p.text.length, 0);
    if (chars > config.maxSourceChars) throw new PrepError('SOURCE_TOO_LARGE', `Selected text is ${chars} characters; the limit is ${config.maxSourceChars}. Select fewer pages.`);
    if (chars === 0) throw new PrepError('INVALID_SOURCE', 'The selected pages contain no text.');

    const view = jobs.submit({ source: { name: source.name, sha256: source.sha256, pageCount: source.pageCount }, pages: pages.filter((p) => p.text), density }, { sessionId, regenerate });
    req.log.info({ jobId: view.jobId, pages: pages.length, chars, cached: view.cached }, 'prepare submitted');
    return reply.code(202).send(view);
  });

  // The document is a knowledge base, not a fixed visual sequence. Every turn
  // composes a fresh, source-checked scene for the current explanation.
  app.post('/api/live/compose', async (req, reply) => {
    if (!completion) throw new PrepError('NOT_CONFIGURED');
    const schema = z.object({ source: prepareBody.shape.source, utterance: z.string().trim().min(8).max(2000) }).strict();
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) throw new PrepError('INVALID_SOURCE', 'Supply document pages and a spoken explanation of 8–2000 characters.');
    const { source, utterance } = parsed.data;
    const pages = source.pages.map(p => ({ page: p.page, text: normalizeText(p.text) }));
    if (pages.length > MAX_SELECTED_PAGES || pages.reduce((n, p) => n + p.text.length, 0) > config.maxSourceChars) throw new PrepError('SOURCE_TOO_LARGE');
    if (new Set(pages.map(p => p.page)).size !== pages.length || pages.some(p => p.page > source.pageCount) || !pages.some(p => p.text)) throw new PrepError('INVALID_SOURCE');
    const key = createHash('sha256').update(JSON.stringify([source, utterance.toLowerCase()])).digest('hex');
    if (liveCache.has(key)) return liveCache.get(key);
    if (liveBusy) throw new PrepError('PREP_BUSY', 'A live visual is being composed. Keep speaking; the latest explanation will follow.');
    liveBusy = true;
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(new PrepError('PREP_TIMEOUT')), Math.min(config.prepTimeoutMs, 45000));
    const disconnected = () => { if (!reply.raw.writableEnded) ctl.abort(new PrepError('CANCELLED')); };
    reply.raw.on('close', disconnected);
    try {
      const result = await runPreparation({ source, pages, density: 'concise', utterance }, { provider: completion, model: config.groqModel, signal: ctl.signal });
      const response = { project: result.project, warnings: result.warnings, usage: result.usage, supported: result.project.concepts.length > 0 };
      liveCache.set(key, response);
      if (liveCache.size > 32) liveCache.delete(liveCache.keys().next().value!);
      return response;
    } finally {
      clearTimeout(timer);
      reply.raw.off('close', disconnected);
      liveBusy = false;
    }
  });

  app.get<{ Params: { jobId: string } }>('/api/prepare/:jobId', async (req) => {
    if (!jobs) throw new PrepError('NOT_FOUND');
    return jobs.get(req.params.jobId);
  });

  app.delete<{ Params: { jobId: string } }>('/api/prepare/:jobId', async (req) => {
    if (!jobs) throw new PrepError('NOT_FOUND');
    return jobs.cancel(req.params.jobId);
  });

  return app;
}
