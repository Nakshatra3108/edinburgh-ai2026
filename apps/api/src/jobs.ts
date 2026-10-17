// In-memory preparation jobs (PRD §11.2, §13.1, §13.3). Bounded, short-lived,
// never persisted. One active generation per server; duplicate submissions
// reuse the active job; finished plans are cached by source hash, pages,
// density, model, prompt and schema version, and only an explicit
// `regenerate` bypasses that cache. Each session may start a capped number of
// provider-backed jobs.

import { createHash, randomUUID } from 'node:crypto';
import { PrepError, type PrepErrorCode } from './errors.ts';
import { runPreparation, type Attempt, type PrepareInput, type PrepareResult, type Stage } from './generation/prepare.ts';
import { PLAN_SCHEMA_VERSION } from './generation/planSchema.ts';
import { PROMPT_VERSION } from './generation/prompt.ts';
import { emptyUsage, type CompletionProvider, type Usage } from './providers/groq.ts';

export type JobStage = 'queued' | Stage | 'done' | 'failed' | 'cancelled';
export type JobView = {
  jobId: string;
  stage: JobStage;
  createdAt: string;
  updatedAt: string;
  /** True when this response reuses an earlier finished plan instead of calling Groq. */
  cached: boolean;
  attempts: Attempt[];
  usage: Usage;
  error: { code: PrepErrorCode; message: string; retryable: boolean } | null;
  result: Pick<PrepareResult, 'project' | 'warnings' | 'stats' | 'model' | 'promptVersion' | 'schemaVersion'> | null;
};

type Job = JobView & { key: string; controller: AbortController; finishedAt: number | null };

const TERMINAL = new Set<JobStage>(['done', 'failed', 'cancelled']);
const JOB_TTL_MS = 10 * 60_000;
const MAX_JOBS = 50;

export type JobStoreOptions = {
  provider: CompletionProvider;
  model: string;
  timeoutMs: number;
  maxJobsPerSession: number;
  now?: () => number;
};

export class JobStore {
  private jobs = new Map<string, Job>();
  private cache = new Map<string, Job>();
  private started = new Map<string, number>();
  private active: Job | null = null;
  private readonly opts: JobStoreOptions;
  constructor(opts: JobStoreOptions) {
    this.opts = opts;
  }

  private now() {
    return this.opts.now?.() ?? Date.now();
  }

  cacheKey(input: PrepareInput): string {
    const pages = input.pages.map((p) => p.page).join(',');
    const text = createHash('sha256').update(input.pages.map((p) => `${p.page}\n${p.text}`).join('\n\f')).digest('hex');
    return [input.source.sha256, pages, text, input.density, this.opts.model, PROMPT_VERSION, PLAN_SCHEMA_VERSION].join('|');
  }

  /** Starts (or reuses) a job. Throws PREP_BUSY or PREP_LIMIT. */
  submit(input: PrepareInput, options: { sessionId: string; regenerate: boolean }): JobView {
    this.prune();
    const key = this.cacheKey(input);
    if (this.active) {
      if (this.active.key === key) return this.view(this.active);
      throw new PrepError('PREP_BUSY');
    }
    const cached = this.cache.get(key);
    if (cached && !options.regenerate) return this.view(cached, true);

    const used = this.started.get(options.sessionId) ?? 0;
    if (used >= this.opts.maxJobsPerSession) throw new PrepError('PREP_LIMIT', `This session has used its ${this.opts.maxJobsPerSession} preparation requests. Restart the server to reset.`);
    this.started.set(options.sessionId, used + 1);

    const at = new Date(this.now()).toISOString();
    const job: Job = {
      jobId: randomUUID(), stage: 'queued', createdAt: at, updatedAt: at, cached: false, attempts: [], usage: emptyUsage(),
      error: null, result: null, key, controller: new AbortController(), finishedAt: null,
    };
    this.jobs.set(job.jobId, job);
    this.active = job;
    void this.run(job, input);
    return this.view(job);
  }

  get(jobId: string): JobView {
    this.prune();
    const job = this.jobs.get(jobId);
    if (!job) throw new PrepError('NOT_FOUND');
    return this.view(job);
  }

  cancel(jobId: string): JobView {
    const job = this.jobs.get(jobId);
    if (!job) throw new PrepError('NOT_FOUND');
    if (!TERMINAL.has(job.stage)) {
      // Upstream usage already consumed cannot be reversed; we only stop waiting and drop the result.
      job.controller.abort(new PrepError('CANCELLED'));
      this.finish(job, 'cancelled', { error: new PrepError('CANCELLED') });
    }
    return this.view(job);
  }

  /** Waits for a job to finish (tests and graceful shutdown). */
  async settled(jobId: string): Promise<JobView> {
    while (!TERMINAL.has(this.jobs.get(jobId)?.stage ?? 'done')) await new Promise((r) => setTimeout(r, 5));
    return this.get(jobId);
  }

  private async run(job: Job, input: PrepareInput) {
    const timer = setTimeout(() => job.controller.abort(new PrepError('PREP_TIMEOUT')), this.opts.timeoutMs);
    try {
      const result = await runPreparation(input, {
        provider: this.opts.provider,
        model: this.opts.model,
        signal: job.controller.signal,
        onStage: (stage) => { if (!TERMINAL.has(job.stage)) { job.stage = stage; job.updatedAt = new Date(this.now()).toISOString(); } },
      });
      if (TERMINAL.has(job.stage)) return; // cancelled meanwhile: suppress the late result
      job.attempts = result.attempts;
      job.usage = result.usage;
      const { project, warnings, stats, model, promptVersion, schemaVersion } = result;
      this.finish(job, 'done', { result: { project, warnings, stats, model, promptVersion, schemaVersion } });
      this.cache.set(job.key, job);
    } catch (error) {
      if (TERMINAL.has(job.stage)) return;
      const e = error instanceof PrepError ? error : new PrepError('PROVIDER_UNAVAILABLE', 'Preparation failed unexpectedly.', { retryable: false });
      const extra = error as { attempts?: Attempt[]; usage?: Usage };
      if (extra.attempts) job.attempts = extra.attempts;
      if (extra.usage) job.usage = extra.usage;
      this.finish(job, e.code === 'CANCELLED' ? 'cancelled' : 'failed', { error: e });
    } finally {
      clearTimeout(timer);
    }
  }

  private finish(job: Job, stage: JobStage, out: { result?: JobView['result']; error?: PrepError }) {
    job.stage = stage;
    job.result = out.result ?? null;
    job.error = out.error ? { code: out.error.code, message: out.error.message, retryable: out.error.retryable } : null;
    job.finishedAt = this.now();
    job.updatedAt = new Date(job.finishedAt).toISOString();
    if (this.active === job) this.active = null;
  }

  private view(job: Job, cached = false): JobView {
    const { key: _key, controller: _c, finishedAt: _f, ...view } = job;
    return { ...view, cached };
  }

  private prune() {
    const now = this.now();
    for (const [id, job] of this.jobs) {
      if (job.finishedAt !== null && now - job.finishedAt > JOB_TTL_MS) {
        this.jobs.delete(id);
        if (this.cache.get(job.key) === job) this.cache.delete(job.key);
      }
    }
    while (this.jobs.size > MAX_JOBS) {
      const oldest = [...this.jobs.values()].find((j) => j !== this.active);
      if (!oldest) break;
      this.jobs.delete(oldest.jobId);
      if (this.cache.get(oldest.key) === oldest) this.cache.delete(oldest.key);
    }
  }
}
