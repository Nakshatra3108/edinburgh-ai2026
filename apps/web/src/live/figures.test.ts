import{afterEach,describe,it,expect,vi}from'vitest';
import{exampleProject}from'../canvas/fixtures/project';
import type{CanvasProject,Asset,FigureLink}from'../canvas/domain';
import{registerPdfAsset,retainPdfAssets}from'../pdf/localAssets';
import{defaultResolveAsset}from'../canvas/assets';
import{matchFigure,localFigureScene,withRelevantFigure}from'./figures';
import{applyLiveScene}from'./scene';
import{createCanvasState}from'../canvas/applyAction';
import{parseCanvasProject}from'../canvas/manifest';
import{attachPdfFigures}from'../pdf/attachFigures';
import{composeLive}from'../preparation/client';
const caption='Figure 1. Reactor pressure before and after cooling.';
function project():CanvasProject{
 const asset:Asset={id:'pressure',kind:'image',blobKey:'local-pdf:test:pressure',page:1,crop:{x:.1,y:.2,width:.8,height:.4},alt:caption,width:1200,height:600};
 registerPdfAsset(asset,new Blob(['test-only-pixels'],{type:'image/png'}));
 const link:FigureLink={assetId:asset.id,page:1,label:caption,caption,keywords:[],enabled:true,captionSource:{page:1,quote:caption,start:0,end:caption.length}};
 return {...structuredClone(exampleProject),assets:[asset],concepts:[],relationships:[],approvedRevision:null,knowledgeBase:{version:1,pages:[{page:1,text:caption}],figures:[link]}};
}
afterEach(()=>{retainPdfAssets([]);vi.restoreAllMocks();});
describe('local figure retrieval',()=>{
 it('displays the source image directly for a clear topic or explicit figure reference',()=>{
  const p=project();expect(matchFigure(p,'Explain reactor pressure after cooling')?.asset.id).toBe('pressure');
  expect(matchFigure(p,'Let us look at figure one')?.asset.id).toBe('pressure');
  const scene=localFigureScene(p,'Explain reactor pressure after cooling')!;
  expect(scene.concepts[0].visual.type).toBe('figure');
  const state=applyLiveScene({...createCanvasState(p),live:true},scene);
  expect(state.project.knowledgeBase).toBe(p.knowledgeBase);expect(state.focusId).not.toBeNull();
  expect(()=>parseCanvasProject(state.project)).not.toThrow();
 });
 it('does not select a figure merely because it shares a page, has no pixels, is disabled or is ambiguous',()=>{
  const p=project();const contextual={...exampleProject.concepts[0],sources:[p.knowledgeBase!.figures![0].captionSource!]};
  expect(matchFigure(p,'Explain maintenance checks',[contextual])).toBeUndefined();
  const duplicate={...p.assets[0],id:'another',blobKey:'local-pdf:test:another'};registerPdfAsset(duplicate,new Blob(['pixels']));
  p.assets.push(duplicate);p.knowledgeBase!.figures!.push({...p.knowledgeBase!.figures![0],assetId:duplicate.id});
  expect(matchFigure(p,'Explain reactor pressure after cooling')).toBeUndefined();
  p.knowledgeBase!.figures![1].enabled=false;p.knowledgeBase!.figures![0].enabled=false;
  expect(matchFigure(p,'Explain reactor pressure after cooling')).toBeUndefined();
  retainPdfAssets([]);p.knowledgeBase!.figures![0].enabled=true;
  expect(matchFigure(p,'Explain reactor pressure after cooling')).toBeUndefined();
 });
 it('supports user-labelled figures without inventing OCR quotes and can decorate generated content',()=>{
  const p=project();p.knowledgeBase!.figures![0].captionSource=null;p.knowledgeBase!.figures![0].keywords=['temperature'];
  expect(matchFigure(p,'Discuss the temperature')?.asset.id).toBe('pressure');
  const local=localFigureScene(p,'Discuss the temperature')!;
  expect(local.concepts[0].sources).toEqual([]);
  expect(()=>applyLiveScene(createCanvasState(p),local)).not.toThrow();
  const fabricated=structuredClone(local);fabricated.concepts[0].title='Invented claim';
  expect(()=>applyLiveScene(createCanvasState(p),fabricated)).toThrow('no source evidence');
  const scene={...p,knowledgeBase:{...p.knowledgeBase!,figures:undefined},concepts:[{...exampleProject.concepts[0],sources:[{page:1,quote:caption,start:0,end:caption.length}]}]};
  const augmented=withRelevantFigure(p,scene,'Discuss the temperature');
  expect(augmented.concepts[0].visual).toEqual(scene.concepts[0].visual);
  expect(augmented.concepts.at(-1)?.visual.type).toBe('figure');
 });
 it('never sends image pixels, asset keys, URLs or figure labels in a Groq composition request',async()=>{
  const p=project();const fetch=vi.spyOn(globalThis,'fetch').mockResolvedValue(new Response(JSON.stringify({supported:false,project:p,warnings:[],usage:{}}),{status:200}));
  await composeLive(p,'Explain an unrelated detail',new AbortController().signal);
  const payload=String(fetch.mock.calls[0][1]?.body);
  expect(JSON.parse(payload)).toEqual({utterance:'Explain an unrelated detail',source:{name:p.source.name,sha256:p.source.sha256,pageCount:p.source.pages,pages:p.knowledgeBase!.pages}});
  expect(payload).not.toContain('local-pdf:');expect(payload).not.toContain('image_url');expect(payload).not.toContain('base64');expect(payload).not.toContain('test-only-pixels');
 });
 it('can display a manually included image-only page while keeping Groq text selection independent',()=>{
  const p=project();p.source.pages=2;
  const asset={...p.assets[0],page:2};
  const link={...p.knowledgeBase!.figures![0],page:2,captionSource:null,keywords:['reactor pressure']};
  p.assets=[];p.knowledgeBase!.figures=[];
  const attached=attachPdfFigures(p,[{asset,link}]);
  expect(attached.knowledgeBase!.pages.map(page=>page.page)).toEqual([1]);
  expect(attached.knowledgeBase!.figures![0].page).toBe(2);
  const scene=localFigureScene(attached,'Explain reactor pressure')!;
  expect(scene.concepts[0].sources).toEqual([]);
  expect(()=>applyLiveScene(createCanvasState(attached),scene)).not.toThrow();
 });
 it('revokes discarded documents and refuses arbitrary external image locations',()=>{
  const p=project();expect(defaultResolveAsset(p.assets[0])).toMatch(/^blob:/);
  retainPdfAssets([]);expect(defaultResolveAsset(p.assets[0])).toBeUndefined();
  expect(defaultResolveAsset({...p.assets[0],blobKey:'https://example.com/image.png'})).toBeUndefined();
 });
});
