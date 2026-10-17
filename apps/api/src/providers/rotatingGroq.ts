import { PrepError } from '../errors.ts';
import { createGroqProvider, ProviderHttpError, type CompletionProvider } from './groq.ts';

export const KEY_ROTATION_MS = 5 * 60_000;
export type CredentialPoolStatus = {
  configuredKeys: number; availableKeys: number; coolingKeys: number; disabledKeys: number;
  rotationSeconds: number;
  keys: { slot: number; state: 'available' | 'cooling-down' | 'disabled'; attempts: number; successes: number; retryInMs: number }[];
};
export type RotatingGroqProvider = CompletionProvider & { getStatus: () => CredentialPoolStatus };

/** Server-only credential pool. A request keeps its selected key; rotation affects
 * subsequent requests. Cooldowns survive retries and are never reset by cycling. */
export function createRotatingGroqProvider(opts: {
  apiKeys: string[];
  model: string;
  now?: () => number;
  createProvider?: (key: string) => CompletionProvider;
}): RotatingGroqProvider {
  const now = opts.now ?? Date.now;
  const keys = [...new Set(opts.apiKeys.map(k => k.trim()).filter(Boolean))];
  const entries = keys.map(key => ({
    provider: opts.createProvider?.(key) ?? createGroqProvider({apiKey:key,model:opts.model}),
    until: 0, disabled: false, attempts: 0, successes: 0,
  }));
  let current = 0;
  let rotateAt = now() + KEY_ROTATION_MS;
  const provider: CompletionProvider = async request => {
    if (!entries.length) throw new PrepError('NOT_CONFIGURED');
    const time = now();
    if (time >= rotateAt) {
      const intervals = Math.floor((time - rotateAt) / KEY_ROTATION_MS) + 1;
      current = (current + intervals) % entries.length;
      rotateAt += intervals * KEY_ROTATION_MS;
    }
    const attempted = new Set<number>();
    while (attempted.size < entries.length) {
      if (request.signal.aborted) throw request.signal.reason instanceof PrepError ? request.signal.reason : new PrepError('CANCELLED');
      let selected = -1;
      for (let offset=0;offset<entries.length;offset++) {
        const i=(current+offset)%entries.length;
        if (!attempted.has(i) && !entries[i].disabled && entries[i].until<=now()) {selected=i;break;}
      }
      if (selected < 0) break;
      if (selected !== current) {current=selected;rotateAt=now()+KEY_ROTATION_MS;}
      attempted.add(selected);
      const entry=entries[selected];
      entry.attempts++;
      try { const result=await entry.provider(request); entry.successes++; return result; }
      catch(error) {
        if (request.signal.aborted) throw request.signal.reason instanceof PrepError ? request.signal.reason : new PrepError('CANCELLED');
        if (!(error instanceof PrepError)) throw error;
        if (error.code === 'PROVIDER_AUTH' || error.code === 'PROVIDER_QUOTA') entry.disabled=true;
        else if (error.code === 'PROVIDER_RATE_LIMIT') {
          const wait=error instanceof ProviderHttpError ? error.cooldownMs : null;
          entry.until=now()+(wait ?? KEY_ROTATION_MS);
        } else throw error; // Schema, timeout and provider failures are not credential failures.
      }
    }
    const available=entries.filter(e=>!e.disabled);
    if (!available.length) throw new PrepError('PROVIDER_AUTH','No usable Groq credentials remain. Check the server keys and account allowances, then restart the API.');
    const wait=Math.max(0,Math.min(...available.map(e=>e.until))-now());
    throw new ProviderHttpError(new PrepError('PROVIDER_RATE_LIMIT',`No Groq key is available: ${available.length} of ${entries.length} loaded keys are cooling down${entries.length > available.length ? `; ${entries.length-available.length} disabled` : ''}. Restart the API after adding keys to .env. The current canvas is preserved.`),wait,wait);
  };
  return Object.assign(provider, {getStatus: (): CredentialPoolStatus => {
    const time=now();
    const keys=entries.map((entry,index)=>({slot:index+1,
      state:entry.disabled?'disabled' as const:entry.until>time?'cooling-down' as const:'available' as const,
      attempts:entry.attempts,successes:entry.successes,retryInMs:entry.disabled?0:Math.max(0,entry.until-time)}));
    return {configuredKeys:entries.length,availableKeys:keys.filter(k=>k.state==='available').length,
      coolingKeys:keys.filter(k=>k.state==='cooling-down').length,disabledKeys:keys.filter(k=>k.state==='disabled').length,
      rotationSeconds:KEY_ROTATION_MS/1000,keys};
  }});
}
