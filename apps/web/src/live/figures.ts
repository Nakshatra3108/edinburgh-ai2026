import type { Asset, CanvasProject, Concept, FigureLink } from '../canvas/domain';
import { defaultResolveAsset } from '../canvas/assets';
const STOP=new Set('about above after again also before below between chart compared diagram does each explain figure first following from have image into just local more most next only original other page picture please process show some source speaking steps than that their them then there these they this through topic overview illustration comparison showing example results summary information presentation description analysis drawing photograph using visual what when where which while with would your'.split(' '));
const words=(text:string)=>new Set((text.toLowerCase().match(/[\p{L}\p{N}]+/gu)??[]).filter(w=>w.length>=4&&!STOP.has(w)));
const clean=(text:string)=>text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim();
const NUMBERS:Record<string,string>={one:'1',two:'2',three:'3',four:'4',five:'5',six:'6',seven:'7',eight:'8',nine:'9',ten:'10'};
function figureNumber(text:string):string|undefined { const value=clean(text).match(/\b(?:fig|figure|diagram|chart|table|image)\s*(\d+|one|two|three|four|five|six|seven|eight|nine|ten)\b/)?.[1];return value?NUMBERS[value]??value:undefined; }
type FigureMatch={link:FigureLink;asset:Asset;score:number;direct:boolean};
/** Conservative caption/keyword retrieval, not visual image understanding. */
export function matchFigure(project:CanvasProject,utterance:string,concepts:Concept[]=[]):FigureMatch|undefined {
  const phrase=` ${clean(utterance)} `;const spoken=words(utterance);
  const conceptsText=words(concepts.flatMap(c=>[c.title,c.summary,...c.aliases,...c.details.map(d=>d.text)]).join(' '));
  const cited=new Set(concepts.flatMap(c=>c.sources.map(s=>s.page)));
  const frequency=new Map<string,number>();
  for(const f of project.knowledgeBase?.figures??[])if(f.enabled)for(const term of words(`${f.label} ${f.caption}`))frequency.set(term,(frequency.get(term)??0)+1);
  const candidates:FigureMatch[]=[];
  for(const link of project.knowledgeBase?.figures??[]) {
    const asset=project.assets.find(a=>a.id===link.assetId);
    if(!link.enabled||!asset||!defaultResolveAsset(asset))continue;
    const terms=words(`${link.label} ${link.caption}`);
    const spokenHits=[...terms].filter(w=>spoken.has(w));
    const contextualHits=[...terms].filter(w=>conceptsText.has(w));
    const keyword=link.keywords.some(tag=>clean(tag).length>=4&&phrase.includes(` ${clean(tag)} `));
    const explicit=figureNumber(utterance)!==undefined&&figureNumber(utterance)===figureNumber(`${link.caption} ${link.label}`);
    // Page proximity alone must never show an unrelated photo, logo or chart.
    const distinctive=spokenHits.some(w=>w.length>=8&&frequency.get(w)===1);
    const direct=spokenHits.length>=2||distinctive||keyword||explicit;
    const contextual=cited.has(link.page)&&contextualHits.length>=2;
    if(!direct&&!contextual)continue;
    const score=(explicit?10:0)+(keyword?6:0)+spokenHits.length*2+contextualHits.length*.5+(cited.has(link.page)?.75:0);
    candidates.push({link,asset,score,direct});
  }
  candidates.sort((a,b)=>b.score-a.score);
  return candidates[0]&&(!candidates[1]||candidates[0].score-candidates[1].score>=.75)?candidates[0]:undefined;
}

/** Reuse a source-captioned or locally labelled original figure immediately, with zero additional API calls. */
export function localFigureScene(project:CanvasProject,utterance:string):CanvasProject|undefined {
  const match=matchFigure(project,utterance);if(!match)return;
  const {link,asset}=match;const ref=link.captionSource;
  const verified=ref&&project.knowledgeBase?.pages.find(p=>p.page===ref.page)?.text.slice(ref.start,ref.end)===ref.quote;
  const concept:Concept={id:`source-${asset.id}`.slice(0,120),title:link.label.slice(0,64),summary:(link.caption||link.label).slice(0,180),aliases:link.keywords,speechExamples:[],visual:{type:'figure',assetId:asset.id,caption:(link.caption||link.label).slice(0,120)},details:[],sources:verified?[ref!]:[],assetIds:[asset.id],enabled:true,review:'source-checked',position:{x:80,y:120}};
  return {...project,concepts:[concept],relationships:[],approvedRevision:null};
}

/** Add an original figure beside the explanation; never replace a generated diagram. */
export function withRelevantFigure(project:CanvasProject,scene:CanvasProject,utterance:string):CanvasProject {
  if(scene.concepts.some(c=>c.visual.type==='figure'))return scene;
  const match=matchFigure(project,utterance,scene.concepts);if(!match)return scene;
  const local=localFigureScene(project,`${match.link.label} ${match.link.keywords.join(' ')}`);
  if(!local)return scene;
  return {...scene,assets:[...scene.assets.filter(a=>a.id!==match.asset.id),match.asset],
    concepts:[...scene.concepts,local.concepts[0]]};
}
