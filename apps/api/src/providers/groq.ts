// Groq Chat Completions adapter (PRD §11.3). One request per call; retry
// policy lives in generation/prepare.ts. Errors become PrepError codes and
// never carry the provider body or the key to the browser.

import { PrepError } from '../errors.ts';

export const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';

export type ChatMessage = { role: 'system' | 'user' | 'assistant'; content: string };
export type Usage = { promptTokens: number; completionTokens: number; reasoningTokens: number; totalTokens: number };
export type CompletionResult = { content: string | null; finishReason: string | null; model: string | null; usage: Usage };
export type CompletionRequest = {
  messages: ChatMessage[];
  schemaName: string;
  schema: object;
  maxCompletionTokens: number;
  signal: AbortSignal;
};
export type CompletionProvider = (request: CompletionRequest) => Promise<CompletionResult>;

export const emptyUsage = (): Usage => ({ promptTokens: 0, completionTokens: 0, reasoningTokens: 0, totalTokens: 0 });

/** Seconds from a retry-after header, if present and sane. */
export function retryAfterMs(headers: Headers): number | null {
  const s = Number(headers.get('retry-after'));
  return Number.isFinite(s) && s >= 0 && s <= 60 ? s * 1000 : null;
}

export class ProviderHttpError extends PrepError {
  readonly retryAfterMs: number | null;
  constructor(error: PrepError, retryAfter: number | null) {
    super(error.code, error.message, { retryable: error.retryable });
    this.retryAfterMs = retryAfter;
  }
}

function mapStatus(status: number, providerCode: string | undefined, message: string): PrepError {
  const text = `${providerCode ?? ''} ${message}`.toLowerCase();
  if (status === 401 || status === 403) return new PrepError('PROVIDER_AUTH');
  if (status === 402 || /insufficient_quota|quota|billing/.test(text)) return new PrepError('PROVIDER_QUOTA');
  if (status === 413 || /context_length|too large|maximum context/.test(text)) return new PrepError('SOURCE_TOO_LARGE', 'The selected text is too long for the model. Select fewer pages.');
  if (status === 429) return new PrepError('PROVIDER_RATE_LIMIT');
  // Groq rejects generations that do not satisfy the strict schema.
  if (status === 400 && /json_validate_failed|schema/.test(text)) return new PrepError('INVALID_PLAN', 'The model output did not match the plan schema.');
  if (status === 404 || /model_not_found|does not exist/.test(text)) return new PrepError('NOT_CONFIGURED', 'The configured Groq model is not available to this account.');
  if (status >= 500) return new PrepError('PROVIDER_UNAVAILABLE');
  return new PrepError('PROVIDER_UNAVAILABLE', `Groq rejected the request (HTTP ${status}).`, { retryable: false });
}

export function createGroqProvider(opts: { apiKey: string; model: string; fetchImpl?: typeof fetch }): CompletionProvider {
  const fetchImpl = opts.fetchImpl ?? fetch;
  return async ({ messages, schemaName, schema, maxCompletionTokens, signal }) => {
    let res: Response;
    try {
      res = await fetchImpl(GROQ_URL, {
        method: 'POST',
        headers: { Authorization: `Bearer ${opts.apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: opts.model,
          messages,
          response_format: { type: 'json_schema', json_schema: { name: schemaName, strict: true, schema } },
          max_completion_tokens: maxCompletionTokens,
        }),
        signal,
      });
    } catch (error) {
      if (signal.aborted) throw signal.reason instanceof PrepError ? signal.reason : new PrepError('CANCELLED');
      throw new PrepError('PROVIDER_UNAVAILABLE', 'Groq could not be reached.', { cause: error });
    }
    let body: any;
    try {
      body = await res.json();
    } catch (error) {
      if (signal.aborted) throw signal.reason instanceof PrepError ? signal.reason : new PrepError('CANCELLED');
      body = null;
    }
    if (!res.ok) {
      const e = body?.error ?? {};
      throw new ProviderHttpError(mapStatus(res.status, e.code ?? e.type, String(e.message ?? '')), retryAfterMs(res.headers));
    }
    const choice = body?.choices?.[0];
    const u = body?.usage ?? {};
    return {
      content: typeof choice?.message?.content === 'string' ? choice.message.content : null,
      finishReason: choice?.finish_reason ?? null,
      model: typeof body?.model === 'string' ? body.model : null,
      usage: {
        promptTokens: u.prompt_tokens ?? 0,
        completionTokens: u.completion_tokens ?? 0,
        reasoningTokens: u.completion_tokens_details?.reasoning_tokens ?? 0,
        totalTokens: u.total_tokens ?? 0,
      },
    };
  };
}
