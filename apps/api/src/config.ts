// Server configuration from apps/api/.env (PRD §11.4). The key stays in this
// process: it is never logged, returned, or sent anywhere but Groq.

import { existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export type Config = {
  groqApiKey: string | null;
  groqApiKeys: string[];
  groqModel: string;
  host: string;
  port: number;
  webOrigins: string[];
  prepTimeoutMs: number;
  maxSourceChars: number;
  maxPrepJobsPerSession: number;
};

const LOOPBACK = new Set(['127.0.0.1', '::1', 'localhost']);

export function loadConfig(env: NodeJS.ProcessEnv = process.env, envFile = resolve(dirname(fileURLToPath(import.meta.url)), '../.env')): Config {
  // Match the smoke script: prefer apps/api/.env, then the repository .env.
  const selectedEnvFile = existsSync(envFile) ? envFile : resolve(dirname(fileURLToPath(import.meta.url)), '../../../.env');
  if (env === process.env && existsSync(selectedEnvFile)) process.loadEnvFile(selectedEnvFile);
  const int = (name: string, fallback: number, min: number, max: number) => {
    const raw = env[name];
    const value = raw === undefined || raw === '' ? fallback : Number(raw);
    if (!Number.isInteger(value) || value < min || value > max) throw new Error(`${name} must be an integer in [${min}, ${max}]`);
    return value;
  };
  const host = env.API_HOST || '127.0.0.1';
  // PRD §13.2: the demo backend binds to loopback only. Public deployment needs auth first.
  if (!LOOPBACK.has(host)) throw new Error(`API_HOST must be a loopback address, got ${host}`);
  const groqApiKeys = [...new Set(['GROQ_API_KEY', 'GROQ_API_KEY_2', 'GROQ_API_KEY_3', 'GROQ_API_KEY_4'].map(name => env[name]?.trim()).filter((key): key is string => !!key))];
  return {
    groqApiKeys,
    groqApiKey: env.GROQ_API_KEY?.trim() || null,
    groqModel: env.GROQ_MODEL?.trim() || 'openai/gpt-oss-120b',
    host,
    port: int('API_PORT', 8787, 1, 65535),
    webOrigins: (env.WEB_ORIGIN || 'http://localhost:5173,http://127.0.0.1:5173').split(',').map((s) => s.trim()).filter(Boolean),
    prepTimeoutMs: int('PREP_TIMEOUT_MS', 90_000, 5_000, 600_000),
    maxSourceChars: int('MAX_SOURCE_CHARS', 80_000, 1_000, 500_000),
    maxPrepJobsPerSession: int('MAX_PREP_JOBS_PER_SESSION', 3, 1, 100),
  };
}
