import { describe, expect, it } from 'vitest';
import { instantScene } from './instantScene';
import type { CanvasProject } from '../canvas/domain';
import { applyLiveScene } from './scene';
import { createCanvasState } from '../canvas/applyAction';
const text='The turbine converts moving water into electricity. Cooling reduces reactor pressure before the return stage.';
const ref=(quote:string)=>({page:1,quote,start:text.indexOf(quote),end:text.indexOf(quote)+quote.length});
const quote='The turbine converts moving water into electricity.';
const base:CanvasProject={schemaVersion:1,id:'test',revision:1,title:'Test',source:{name:'test.pdf',sha256:'a'.repeat(64),pages:1},preparation:{mode:'groq',model:'test',promptVersion:'test',preparedAt:new Date(0).toISOString()},knowledgeBase:{version:1,pages:[{page:1,text}]},concepts:[],relationships:[],assets:[],approvedRevision:null};
describe('instant source-backed canvas',()=>{
 it('shows literal full-source material immediately even without an indexed topic',()=>{
  const scene=instantScene(base,'The turbine converts moving water into electricity')!;
  expect(scene.concepts[0].summary).toBe(quote);
  expect(()=>applyLiveScene({...createCanvasState(base),live:true},scene)).not.toThrow();
 });
 it('retrieves later text from long PDF paragraphs rather than searching only their beginning',()=>{
  const longText='Introductory material '.repeat(30)+'Cooling reduces reactor pressure before the return stage';
  const p={...base,knowledgeBase:{version:1 as const,pages:[{page:1,text:longText}]}};
  const scene=instantScene(p,'Explain how cooling reduces reactor pressure')!;
  expect(scene.concepts[0].summary).toContain('reactor pressure');
  expect(()=>applyLiveScene({...createCanvasState(p),live:true},scene)).not.toThrow();
 });
 it('holds for unrelated and vague speech',()=>{
  expect(instantScene(base,'Tell us about quantum elephants')).toBeUndefined();
  expect(instantScene(base,'Show the next topic please')).toBeUndefined();
 });
 it('retrieves ready process diagrams without a remote request and ignores disabled drafts',()=>{
  const detail={id:'flow',text:'Water turns the turbine',sources:[ref(quote)],origin:'source' as const};
  const concept={id:'turbine',title:'Turbine water conversion',summary:quote,aliases:['hydroelectric turbine'],speechExamples:[],visual:{type:'process' as const,stepDetailIds:['flow','output']},details:[detail,{...detail,id:'output',text:'Generate electricity'}],sources:[ref(quote)],assetIds:[],enabled:true,review:'source-checked' as const,position:{x:0,y:0}};
  const p={...base,concepts:[concept]};
  expect(instantScene(p,'Explain the process of turbine water conversion')?.concepts[0].visual.type).toBe('process');
  expect(instantScene({...p,concepts:[{...concept,enabled:false}]},'Explain turbine water conversion')?.concepts.some(c=>c.id==='turbine')).toBe(false);
 });
 it('recognises a source-backed contrast locally',()=>{
  const a={id:'turbine',title:'Water turbine electricity',summary:quote,aliases:[],speechExamples:[],visual:{type:'concept' as const},details:[],sources:[ref(quote)],assetIds:[],enabled:true,review:'source-checked' as const,position:{x:0,y:0}};
  const b={...a,id:'reactor',title:'Cooling reactor pressure',summary:'Cooling reduces reactor pressure before the return stage.',sources:[ref('Cooling reduces reactor pressure before the return stage.')]};
  const p={...base,concepts:[a,b],relationships:[{id:'contrast',from:a.id,to:b.id,label:'Different mechanisms',kind:'comparison' as const,sources:[ref(quote)],approved:true}]};
  const scene=instantScene(p,'Compare the water turbine electricity with cooling reactor pressure')!;
  expect(scene.concepts).toHaveLength(2);
  expect(applyLiveScene({...createCanvasState(p),live:true},scene).view).toBe('comparison');
 });
});
