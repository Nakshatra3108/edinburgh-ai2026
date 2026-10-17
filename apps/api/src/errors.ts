// Error envelope (PRD §11.2): { code, message, retryable, requestId }.
// Messages are written for the browser; provider bodies, stacks and keys never are.

export type PrepErrorCode =
  | 'INVALID_SOURCE' | 'SOURCE_TOO_LARGE' | 'NOT_CONFIGURED'
  | 'PROVIDER_AUTH' | 'PROVIDER_QUOTA' | 'PROVIDER_RATE_LIMIT' | 'PROVIDER_UNAVAILABLE'
  | 'OUTPUT_TRUNCATED' | 'PREP_TIMEOUT' | 'INVALID_PLAN' | 'CANCELLED'
  | 'PREP_BUSY' | 'PREP_LIMIT' | 'NOT_FOUND' | 'FORBIDDEN_ORIGIN';

const DEFAULTS: Record<PrepErrorCode, { message: string; retryable: boolean; status: number }> = {
  INVALID_SOURCE: { message: 'The source text is missing or malformed.', retryable: false, status: 400 },
  SOURCE_TOO_LARGE: { message: 'Too much text selected. Select fewer pages.', retryable: false, status: 413 },
  NOT_CONFIGURED: { message: 'Preparation is not configured on this server.', retryable: false, status: 503 },
  PROVIDER_AUTH: { message: 'Groq rejected the API key. Check the server configuration.', retryable: false, status: 502 },
  PROVIDER_QUOTA: { message: 'The Groq allowance for this account is exhausted.', retryable: false, status: 502 },
  PROVIDER_RATE_LIMIT: { message: 'Groq is rate limiting requests. Try again shortly.', retryable: true, status: 502 },
  PROVIDER_UNAVAILABLE: { message: 'Groq could not be reached or returned an error.', retryable: true, status: 502 },
  OUTPUT_TRUNCATED: { message: 'The generated plan was cut off before it finished.', retryable: true, status: 502 },
  PREP_TIMEOUT: { message: 'Preparation took longer than the time limit.', retryable: true, status: 504 },
  INVALID_PLAN: { message: 'The generated plan did not pass validation.', retryable: true, status: 502 },
  CANCELLED: { message: 'Preparation was cancelled.', retryable: false, status: 409 },
  PREP_BUSY: { message: 'Another preparation is already running. Wait for it or cancel it.', retryable: true, status: 409 },
  PREP_LIMIT: { message: 'The preparation limit for this session has been reached.', retryable: false, status: 429 },
  NOT_FOUND: { message: 'That preparation job does not exist or has expired.', retryable: false, status: 404 },
  FORBIDDEN_ORIGIN: { message: 'Requests from this origin are not allowed.', retryable: false, status: 403 },
};

export class PrepError extends Error {
  readonly code: PrepErrorCode;
  readonly retryable: boolean;
  readonly status: number;
  constructor(code: PrepErrorCode, message?: string, options?: { cause?: unknown; retryable?: boolean }) {
    super(message ?? DEFAULTS[code].message, { cause: options?.cause });
    this.name = 'PrepError';
    this.code = code;
    this.retryable = options?.retryable ?? DEFAULTS[code].retryable;
    this.status = DEFAULTS[code].status;
  }
}

export type ErrorEnvelope = { code: PrepErrorCode; message: string; retryable: boolean; requestId: string };

export function envelope(error: PrepError, requestId: string): ErrorEnvelope {
  return { code: error.code, message: error.message, retryable: error.retryable, requestId };
}
