// Browser client for the local preparation API (apps/api). Requests go to
// same-origin /api, proxied to the API server by Vite in development.

import type { CanvasProject } from '../canvas/domain';

export type HealthView = {
  ok: boolean; provider: string; model: string; configured: boolean;
  limits: { maxSelectedPages: number; maxSourceChars: number; timeoutMs: number; maxJobsPerSession: number };
};
export type JobStage = 'queued' | 'requesting' | 'validating' | 'done' | 'failed' | 'cancelled';
export type Usage = { promptTokens: number; completionTokens: number; reasoningTokens: number; totalTokens: number };
export type GroundingWarning = { code: string; message: string; conceptId?: string };
export type JobView = {
  jobId: string;
  stage: JobStage;
  cached: boolean;
  attempts: { kind: string; ms: number; outcome: string }[];
  usage: Usage;
  error: { code: string; message: string; retryable: boolean } | null;
  result: {
    project: CanvasProject;
    warnings: GroundingWarning[];
    stats: { quotesProposed: number; quotesVerified: number; conceptsProposed: number; conceptsKept: number };
    model: string;
  } | null;
};
export type PrepareRequest = {
  sessionId: string;
  density: 'standard' | 'concise';
  regenerate: boolean;
  source: { name: string; sha256: string; pageCount: number; pages: { page: number; text: string }[] };
};

/** An API error in the server's envelope, or a local network failure. */
export class PrepClientError extends Error {
  readonly code: string;
  readonly retryable: boolean;
  constructor(code: string, message: string, retryable: boolean) {
    super(message);
    this.name = 'PrepClientError';
    this.code = code;
    this.retryable = retryable;
  }
}

const TERMINAL = new Set<JobStage>(['done', 'failed', 'cancelled']);
export const isTerminal = (stage: JobStage) => TERMINAL.has(stage);

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api${path}`, { ...init, headers: init?.body ? { 'content-type': 'application/json' } : undefined });
  } catch (error) {
    if ((error as Error).name === 'AbortError') throw error;
    throw new PrepClientError('SERVER_UNREACHABLE', 'The preparation server is not running. Start it with npm start --prefix apps/api.', true);
  }
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    if (body && typeof body.code === 'string') throw new PrepClientError(body.code, body.message, Boolean(body.retryable));
    throw new PrepClientError('SERVER_UNREACHABLE', 'The preparation server is not running. Start it with npm start --prefix apps/api.', true);
  }
  return body as T;
}

export const getHealth = () => call<HealthView>('/health');
export const submitPreparation = (request: PrepareRequest) => call<JobView>('/prepare', { method: 'POST', body: JSON.stringify(request) });
export const getJob = (jobId: string, signal?: AbortSignal) => call<JobView>(`/prepare/${encodeURIComponent(jobId)}`, { signal });
export const cancelJob = (jobId: string) => call<JobView>(`/prepare/${encodeURIComponent(jobId)}`, { method: 'DELETE' });

/** One id per page load: the server caps preparation jobs per session. */
export const SESSION_ID = `web-${crypto.randomUUID().slice(0, 12)}`;
