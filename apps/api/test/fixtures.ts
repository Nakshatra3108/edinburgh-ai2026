import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractPdf } from '../src/pdf/extractNode.ts';
import type { Plan } from '../src/generation/planSchema.ts';
import type { CompletionProvider, CompletionResult } from '../src/providers/groq.ts';

export const repo = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
export const demo = await extractPdf(`${repo}/demo/source/follow-demo.pdf`);
export const demoSource = { name: 'follow-demo.pdf', sha256: demo.sha256, pageCount: demo.pages.length };

type C = Plan['concepts'][number];
const base = (c: Partial<C> & Pick<C, 'id' | 'title'>): C => ({
  summary: `${c.title}.`, visualType: 'concept', aliases: ['alias'], speechExamples: ['Something a presenter says.'], quotes: [], details: [],
  processStepIds: [], metricValue: null, metricUnit: null, metricLabel: null, metricQuotePage: null, metricQuote: null,
  comparisonLeftId: null, comparisonRightId: null, ...c,
});

/** A plausible model plan for the demo PDF, including deliberate defects. */
export function demoPlan(): Plan {
  return {
    title: 'FOLLOW: a presentation that listens',
    concepts: [
      base({
        id: 'problem', title: 'Slides lock speakers into a fixed order',
        quotes: [{ page: 1, quote: 'Slides lock speakers into a fixed order' }],
        details: [
          { id: 'order', text: 'The order is decided before the talk.', quotes: [{ page: 1, quote: 'A slide deck is a sequence decided before the talk begins.' }] },
          // Fabricated: not in the PDF.
          { id: 'invented', text: 'Slides lose 40% of attention.', quotes: [{ page: 1, quote: 'Slides lose 40% of audience attention.' }] },
        ],
      }),
      base({
        id: 'reversal', title: 'The speech decides what the audience sees',
        quotes: [{ page: 2, quote: 'The speech decides what the audience sees' }],
        details: [{ id: 'canvas', text: 'One continuous canvas.', quotes: [{ page: 2, quote: 'onto one continuous canvas.' }] }],
      }),
      base({
        id: 'pipeline', title: 'Four steps', visualType: 'process', processStepIds: ['capture', 'understand', 'match'],
        quotes: [{ page: 2, quote: 'Four steps: capture, understand, match, compose' }],
        details: [
          { id: 'capture', text: 'Capture: listen to the speaker', quotes: [{ page: 2, quote: '1. Capture Listen to the speaker' }] },
          { id: 'understand', text: 'Understand: speech to text', quotes: [{ page: 2, quote: '2. Understand Turn speech into text' }] },
          // Quote on the wrong page: must be rejected.
          { id: 'match', text: 'Match: find the concept', quotes: [{ page: 4, quote: '3. Match Find the prepared concept' }] },
        ],
      }),
      base({
        // Metric whose value is not in its quote: must downgrade.
        id: 'steps-metric', title: 'Four pipeline steps', visualType: 'metric', metricValue: '5', metricLabel: 'steps', metricQuotePage: 2,
        metricQuote: 'Steps 1 to 4 run continuously while the speaker talks.',
        quotes: [{ page: 2, quote: 'Figure 1. The FOLLOW pipeline.' }],
      }),
      base({
        id: 'comparison', title: 'Fixed slides compared with a speech-directed canvas', visualType: 'comparison',
        comparisonLeftId: 'problem', comparisonRightId: 'reversal',
        quotes: [{ page: 3, quote: 'Fixed slides compared with a speech-directed canvas' }],
      }),
      // No quotes at all: must be dropped.
      base({ id: 'blockchain', title: 'Powered by blockchain', quotes: [] }),
    ],
    relationships: [
      { from: 'problem', to: 'reversal', label: 'fixed vs speech-directed', kind: 'comparison', quotes: [{ page: 3, quote: 'Table 1. Fixed slides compared with the FOLLOW canvas.' }] },
      { from: 'pipeline', to: 'reversal', label: 'makes it possible', kind: 'causal', quotes: [{ page: 2, quote: 'The presentation listens and brings the right concept onto one continuous canvas.' }] },
      { from: 'problem', to: 'blockchain', label: 'dropped endpoint', kind: 'association', quotes: [{ page: 1, quote: 'FOLLOW' }] },
    ],
  };
}

export const ok = (content: unknown, extra: Partial<CompletionResult> = {}): CompletionResult => ({
  content: typeof content === 'string' ? content : JSON.stringify(content), finishReason: 'stop', model: 'openai/gpt-oss-120b',
  usage: { promptTokens: 100, completionTokens: 50, reasoningTokens: 20, totalTokens: 150 }, ...extra,
});

/** Provider that replays scripted responses (or throws scripted errors) and records requests. */
export function scripted(...steps: (CompletionResult | Error | (() => Promise<CompletionResult>))[]) {
  const calls: Parameters<CompletionProvider>[0][] = [];
  const provider: CompletionProvider = async (req) => {
    calls.push(req);
    const step = steps[Math.min(calls.length - 1, steps.length - 1)];
    if (step instanceof Error) throw step;
    return typeof step === 'function' ? step() : step;
  };
  return { provider, calls };
}
