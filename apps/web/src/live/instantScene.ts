import type { CanvasProject, Concept, SourceRef } from '../canvas/domain';

const STOP = new Set('about after again also and are before between can compare comparison contrast describe diagram difference different does each explain explanation figure first following for from have how into its just like more next not now only other our process say show some speaking steps than that the their them then there these they this through topic turn used using visual visuals want what when where which while will with would you your'.split(' '));
const terms = (s: string) => [...new Set((s.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []).filter(w => w.length >= 3 && !STOP.has(w)))];
const overlap = (a: string[], b: string[]) => a.filter(w => b.includes(w)).length;
const usable = (c: Concept) => c.enabled && c.review !== 'needs-review' && c.sources.length > 0;
const cache = new WeakMap<object, { ref: SourceRef; words: string[] }[]>();
function passages(project: CanvasProject) {
  const kb = project.knowledgeBase;
  if (!kb) return [];
  let result = cache.get(kb);
  if (!result) {
    result = kb.pages.flatMap(page => [...page.text.matchAll(/[^.!?\n]+(?:[.!?]+|$)/gu)].flatMap(m => {
      const text = m[0];
      const chunks: {ref:SourceRef;words:string[]}[]=[];
      let offset=0;
      while(offset<text.length) {
        while(/\s/.test(text[offset]??'') && offset<text.length) offset++;
        if(offset>=text.length) break;
        let end=Math.min(text.length,offset+170);
        if(end<text.length) { const boundary=text.lastIndexOf(' ',end); if(boundary>offset+70) end=boundary; }
        const quote=text.slice(offset,end).trimEnd();const start=m.index!+offset;
        if(quote.length>=24) chunks.push({ref:{page:page.page,start,end:start+quote.length,quote},words:terms(quote)});
        offset=end;
      }
      return chunks;
    }));
    cache.set(kb, result);
  }
  return result;
}
/** Immediate, deterministic retrieval from already grounded material. No remote
 * inference and no invented facts. Groq can subsequently refine this structure. */
export function instantScene(index: CanvasProject, utterance: string): CanvasProject | undefined {
  if (!index.knowledgeBase) return;
  const spoken = terms(utterance.slice(-500));
  if (!spoken.length) return;
  const process = /\b(process|steps|pipeline|mechanism|how it works)\b/i.test(utterance.slice(-250));
  const compare = /\b(compare|comparison|versus|vs|whereas|unlike|contrast|difference|instead)\b/i.test(utterance.slice(-350));
  const ranked = index.concepts.filter(usable).map(c => {
    const title = terms(`${c.title} ${c.aliases.join(' ')}`);
    const body = terms(`${c.summary} ${c.details.map(d => d.text).join(' ')} ${c.speechExamples.join(' ')}`);
    const hits = spoken.filter(w => title.includes(w) || body.includes(w));
    const specific = hits.some(w => w.length >= 7 && title.includes(w));
    return { c, hits: hits.length, eligible: hits.length >= 2 || specific || (process && c.visual.type === 'process' && hits.length >= 1),
      score: overlap(spoken,title) * 3 + overlap(spoken,body) + (process && c.visual.type === 'process' ? 8 : 0) };
  }).filter(x => x.eligible).sort((a,b) => b.score - a.score);
  if (compare) {
    const edge = index.relationships.find(r => r.approved && r.kind === 'comparison'
      && ranked.some(x => x.c.id === r.from) && ranked.some(x => x.c.id === r.to));
    if (edge) return { ...index, concepts: [index.concepts.find(c => c.id === edge.from)!, index.concepts.find(c => c.id === edge.to)!], relationships:[edge] };
  }
  const best = ranked.find(x => x.c.visual.type !== 'comparison')?.c;
  if (best && best.visual.type !== 'comparison') {
    // Pick details from the current words, keeping a real process's ordered steps.
    const details = best.visual.type === 'process' ? best.details : [...best.details]
      .sort((a,b) => overlap(spoken,terms(b.text)) - overlap(spoken,terms(a.text))).slice(0,3);
    return { ...index, concepts:[{...best,details}], relationships:[] };
  }
  // A sparse/failed topic index must not force a network round trip. Literal
  // excerpts from the full knowledge base can still populate the canvas.
  const snippets = passages(index).map(p => ({...p, hits:overlap(spoken,p.words)}))
    .filter(p => p.hits >= 2).sort((a,b) => b.hits - a.hits).slice(0,2);
  if (!snippets.length) return;
  const concepts: Concept[] = snippets.map(({ref},i) => ({
    id:`excerpt-${ref.page}-${ref.start}`, title:ref.quote.split(/\s+/).slice(0,8).join(' ').slice(0,64),
    summary:ref.quote, aliases:[], speechExamples:[], visual:{type:'concept'}, details:[],
    sources:[ref],assetIds:[],enabled:true,review:'source-checked',position:{x:i*1170,y:120},
  }));
  return {...index,concepts,relationships:[]};
}
