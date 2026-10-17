// Smoke test for Groq Chat Completions with strict structured output.
// Run: node apps/api/scripts/smoke-groq.ts   (Node >= 22.6 with type stripping)
// Never prints GROQ_API_KEY.
//
// The real prepared-plan schema must follow Groq's strict-mode rules:
//   - every property is listed in `required`
//   - optional fields are expressed as nullable unions, e.g. { type: ['string', 'null'] }
//   - every object sets `additionalProperties: false`

import { existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const envCandidates = [resolve(here, '../.env'), resolve(here, '../../../.env')];
const envFile = envCandidates.find((p) => existsSync(p));
if (envFile) process.loadEnvFile(envFile);

const apiKey = process.env.GROQ_API_KEY;
const model = process.env.GROQ_MODEL;

if (!apiKey || !model) {
  console.error(
    `FAIL: missing ${[!apiKey && 'GROQ_API_KEY', !model && 'GROQ_MODEL'].filter(Boolean).join(', ')}` +
      ` (looked in: ${envCandidates.join(', ')})`,
  );
  process.exit(1);
}

const redact = (s: string) => s.split(apiKey).join('[REDACTED]');

const request = {
  model,
  messages: [
    { role: 'system', content: 'Reply only with JSON matching the schema.' },
    { role: 'user', content: 'Give a short title for a talk about octopus intelligence.' },
  ],
  response_format: {
    type: 'json_schema',
    json_schema: {
      name: 'smoke_title',
      strict: true,
      schema: {
        type: 'object',
        properties: { title: { type: 'string' } },
        required: ['title'],
        additionalProperties: false,
      },
    },
  },
  max_completion_tokens: 500,
};

try {
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
    signal: AbortSignal.timeout(60_000),
  });
  const body = await res.text();

  if (!res.ok) {
    console.error(`FAIL: HTTP ${res.status}\n${redact(body).slice(0, 2000)}`);
    process.exit(1);
  }

  const data = JSON.parse(body);
  const text: string | undefined = data.choices?.[0]?.message?.content;

  let parsed: unknown;
  try {
    parsed = text ? JSON.parse(text) : undefined;
  } catch {
    parsed = undefined;
  }
  const valid = typeof (parsed as any)?.title === 'string';

  console.log(valid ? 'SUCCESS' : 'FAIL: response did not contain valid {title: string} JSON');
  console.log('finish:      ', data.choices?.[0]?.finish_reason);
  console.log('model (req): ', model);
  console.log('model (resp):', data.model);
  console.log('output:      ', text);
  console.log('usage:       ', JSON.stringify(data.usage, null, 2));
  process.exit(valid ? 0 : 1);
} catch (err) {
  console.error(`FAIL: ${redact(String(err))}`);
  process.exit(1);
}
