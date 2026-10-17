// One preparation run: prompt → Groq → parse → validate → ground, with the
// PRD §11.2 retry policy. At most one transport retry (network/429/5xx) and
// at most one repair (invalid JSON/plan, empty grounded plan, or output cut
// off by the token limit). Auth and allowance errors are never retried. Every
// attempt is recorded with its usage. All of it shares the caller's deadline.

import { PrepError } from '../errors.ts';
import { ProviderHttpError, emptyUsage, type ChatMessage, type CompletionProvider, type Usage } from '../providers/groq.ts';
import { groundPlan, type GroundedPlan } from './ground.ts';
import { PLAN_SCHEMA_VERSION, planJsonSchema, planSchema, type Density } from './planSchema.ts';
import { PROMPT_VERSION, systemPrompt, userPrompt, type PageText } from './prompt.ts';

/** gpt-oss spends completion tokens on hidden reasoning before the JSON, so budgets are generous. */
export const TOKEN_BUDGET = { initial: 8_000, afterTruncation: 16_000 } as const;

export type AttemptKind = 'initial' | 'transport-retry' | 'repair';
export type Attempt = { kind: AttemptKind; ms: number; outcome: string; finishReason: string | null; usage: Usage };
export type Stage = 'requesting' | 'validating';
export type PrepareInput = {
  source: { name: string; sha256: string; pageCount: number };
  pages: PageText[];
  density: Density;
};
export type PrepareResult = GroundedPlan & { attempts: Attempt[]; usage: Usage; model: string; promptVersion: string; schemaVersion: string };

export async function runPreparation(
  input: PrepareInput,
  deps: { provider: CompletionProvider; model: string; signal: AbortSignal; onStage?: (s: Stage) => void; sleep?: (ms: number, signal: AbortSignal) => Promise<void> },
): Promise<PrepareResult> {
  const sleep = deps.sleep ?? abortableSleep;
  const base: ChatMessage[] = [
    { role: 'system', content: systemPrompt(input.density) },
    { role: 'user', content: userPrompt(input.source.name, input.pages) },
  ];
  const attempts: Attempt[] = [];
  const usage = emptyUsage();
  let kind: AttemptKind = 'initial';
  let transportRetries = 0;
  let repairs = 0;
  let maxTokens: number = TOKEN_BUDGET.initial;
  let repairNote: string | null = null;
  let reportedModel = deps.model;

  const canRepair = () => repairs < 1;
  for (;;) {
    deps.onStage?.('requesting');
    const started = Date.now();
    const record = (outcome: string, finishReason: string | null, u: Usage = emptyUsage()) => {
      attempts.push({ kind, ms: Date.now() - started, outcome, finishReason, usage: u });
      for (const k of Object.keys(usage) as (keyof Usage)[]) usage[k] += u[k];
    };
    const messages = repairNote ? [...base, { role: 'user' as const, content: repairNote }] : base;
    let failure: PrepError;
    try {
      const res = await deps.provider({ messages, schemaName: 'follow_prepared_plan', schema: planJsonSchema, maxCompletionTokens: maxTokens, signal: deps.signal });
      reportedModel = res.model ?? reportedModel;
      if (res.finishReason === 'length') {
        record('truncated', res.finishReason, res.usage);
        failure = new PrepError('OUTPUT_TRUNCATED');
        maxTokens = TOKEN_BUDGET.afterTruncation;
        repairNote = 'Your previous answer was cut off by the length limit. Return the complete JSON again; keep summaries and examples brief.';
      } else if (res.finishReason !== 'stop' || !res.content) {
        record('no-content', res.finishReason, res.usage);
        failure = new PrepError('INVALID_PLAN', 'The model did not return a finished plan.');
        repairNote = 'Your previous answer was empty or unfinished. Return the complete JSON plan.';
      } else {
        deps.onStage?.('validating');
        let json: unknown;
        try {
          json = JSON.parse(res.content);
        } catch {
          json = undefined;
        }
        const parsed = planSchema.safeParse(json);
        if (!parsed.success) {
          record('invalid-plan', res.finishReason, res.usage);
          failure = new PrepError('INVALID_PLAN');
          repairNote = 'Your previous answer was not valid JSON for the schema. Return only the JSON plan, following the schema exactly.';
        } else {
          const grounded = groundPlan({ plan: parsed.data, pages: input.pages, source: input.source, density: input.density, model: reportedModel, promptVersion: PROMPT_VERSION });
          if (!grounded.project.concepts.length) {
            record('no-grounded-concepts', res.finishReason, res.usage);
            failure = new PrepError('INVALID_PLAN', 'None of the proposed concepts could be matched to a quote in the source.');
            repairNote = 'None of your quotes matched the source text exactly. Copy each quote character-for-character from the page it cites, and include only what you can quote.';
          } else {
            record('ok', res.finishReason, res.usage);
            return { ...grounded, attempts, usage, model: reportedModel, promptVersion: PROMPT_VERSION, schemaVersion: PLAN_SCHEMA_VERSION };
          }
        }
      }
    } catch (error) {
      if (!(error instanceof PrepError)) throw error;
      if (error.code === 'CANCELLED' || error.code === 'PREP_TIMEOUT') throw error;
      record(error.code, null);
      failure = error;
      if (error.code === 'INVALID_PLAN') repairNote = 'Your previous answer did not match the schema. Return only the JSON plan, following the schema exactly.';
    }

    const transport = failure.code === 'PROVIDER_RATE_LIMIT' || (failure.code === 'PROVIDER_UNAVAILABLE' && failure.retryable);
    const repairable = failure.code === 'INVALID_PLAN' || failure.code === 'OUTPUT_TRUNCATED';
    if (transport && transportRetries < 1) {
      transportRetries++;
      kind = 'transport-retry';
      await sleep(Math.min(failure instanceof ProviderHttpError && failure.retryAfterMs !== null ? failure.retryAfterMs : 1_000, 10_000), deps.signal);
      continue;
    }
    if (repairable && canRepair()) {
      repairs++;
      kind = 'repair';
      continue;
    }
    throw Object.assign(failure, { attempts, usage });
  }
}

function abortableSleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(signal.reason);
    const t = setTimeout(() => { signal.removeEventListener('abort', onAbort); resolve(); }, ms);
    const onAbort = () => { clearTimeout(t); reject(signal.reason); };
    signal.addEventListener('abort', onAbort, { once: true });
  });
}
