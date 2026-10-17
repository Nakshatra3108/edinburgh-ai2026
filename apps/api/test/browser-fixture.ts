import { buildServer } from '../src/server.ts';
import { loadConfig } from '../src/config.ts';
import { demoPlan, ok } from './fixtures.ts';
// Test-only provider exercises the real server, schema, grounding and browser.
const app = buildServer({ config: loadConfig({ GROQ_MODEL: 'fixture-provider-no-real-inference' }, '/nonexistent'), logger: false, provider: async req => {
  const spoken = req.messages.at(-1)?.content ?? '';
  if (req.messages[0].content.includes('LIVE COMPOSITION')) {
    const p = demoPlan();
    if (spoken.includes('unrelated')) return ok({ title:'Unsupported', concepts:[], relationships:[] });
    if (spoken.includes('slow')) await new Promise(resolve => setTimeout(resolve, 1200));
    if (spoken.includes('compare')) {
      p.concepts = p.concepts.filter(c => ['problem','reversal','comparison'].includes(c.id));
      p.relationships = p.relationships.filter(r => r.kind === 'comparison');
    } else if (spoken.includes('process')) { p.concepts = p.concepts.filter(c => c.id === 'pipeline'); p.relationships = []; }
    else { p.concepts = p.concepts.filter(c => c.id === 'reversal'); p.relationships = []; }
    return ok(p);
  }
  return ok(demoPlan());
} });
await app.listen({host:'127.0.0.1',port:8790});
console.log('Test-only fixture provider listening on 8790');
