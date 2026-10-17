"""Regress the user's clipped three-element board using the real shared renderer.
No microphone, remote model, or provider quota is used.
"""
from pathlib import Path
import json
from playwright.sync_api import sync_playwright,expect
OUT=Path('/tmp/follow-content-fit-qa');OUT.mkdir(exist_ok=True)
with sync_playwright() as p:
 browser=p.chromium.launch(headless=True)
 page=browser.new_page(viewport={'width':1440,'height':900})
 errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 page.goto('http://127.0.0.1:5173');page.wait_for_load_state('networkidle')
 page.evaluate('''async()=>{
  const React=await import('/node_modules/.vite/deps/react.js');
  const roots=await import('/node_modules/.vite/deps/react-dom_client.js');
  const {FollowCanvas}=await import('/src/canvas/FollowCanvas.tsx');
  const createRoot=roots.createRoot??roots.default.createRoot;
  document.getElementById('root').style.display='none';
  const stage=document.createElement('div');stage.style.cssText='position:fixed;inset:0';document.body.append(stage);
  const root=createRoot(stage);
  window.renderContentBoard=(stress=false,mode='audience')=>{
   const quote='The canvas follows the speaker, showing source-backed material as they talk.';
   const ref={page:1,start:0,end:quote.length,quote};
   const point=(id,text)=>({id,text,sources:[ref],origin:'source'});
   const base={aliases:[],speechExamples:[],sources:[ref],assetIds:[],enabled:true,review:'source-checked',position:{x:0,y:0}};
   const main={...base,id:'main-'+stress,title:stress?'FOLLOW lets a spoken explanation determine the visual presentation':'FOLLOW lets explanation drive visuals',summary:stress?('The canvas follows the current speaker with useful grounded information. '.repeat(3)).slice(0,180):quote,visual:{type:'concept'},details:stress?[0,1,2].map(i=>point('point-'+i,('A grounded supporting explanation contains relevant source details for this presentation. '.repeat(3)).slice(0,180))):[point('focus','Current explanation determines visual focus'),point('evidence','Visuals are backed by quoted source text'),point('history','Earlier concepts remain available in Overview')]};
   const process=(id,title)=>({...base,id,title,summary:'Four stages turn a spoken explanation into a live visual canvas.',visual:{type:'process',stepDetailIds:['build','transcribe','retrieve','refine',...(stress?['verify']:[])]},details:[point('build','Build the document knowledge base'),point('transcribe','Transcribe the speaker locally'),point('retrieve','Retrieve relevant source material'),point('refine','Refine and render the live explanation'),...(stress?[point('verify','Verify quotations against source text')]:[])]});
   const concepts=[main,process('previous-one-'+stress,'Using FOLLOW to Explain'),process('previous-two-'+stress,'FOLLOW visual composition process')];
   const project={schemaVersion:1,id:'content-regression',revision:1,title:'Content fitting',source:{name:'content.pdf',sha256:'a'.repeat(64),pages:1},knowledgeBase:{version:1,pages:[{page:1,text:quote}]},preparation:{mode:'curated',model:null,promptVersion:'test',preparedAt:new Date(0).toISOString()},concepts,relationships:[],assets:[],approvedRevision:null};
   const state={project,live:true,boardIds:concepts.map(c=>c.id),view:'focus',focusId:main.id,pair:null,activeRelationshipId:null,introduced:concepts.map(c=>c.id),revealed:Object.fromEntries(concepts.map(c=>[c.id,c.details.map(d=>d.id)])),connected:[],highlightedDetailId:null,revision:1};
   stage.style.height=mode==='studio'?'420px':'100%';
   root.render((React.createElement??React.default.createElement)(FollowCanvas,{state,mode,reducedMotion:true}));
  };
 }''')
 checks=[]
 for stress in [False,True]:
  for mode in ['audience','studio']:
   for width,height in [(1440,900),(1280,720),(2898,1072)]:
    page.set_viewport_size({'width':width,'height':height})
    page.evaluate('args=>window.renderContentBoard(...args)',[stress,mode]);page.wait_for_timeout(650)
    expect(page.locator('.canvas-board .canvas-node')).to_have_count(3)
    result=page.locator('.canvas-board .canvas-node').evaluate_all('''els=>els.map(el=>{
     const body=el.querySelector('.node-detail-group'),b=body.getBoundingClientRect(),f=el.querySelector('.board-provenance').getBoundingClientRect();
     const descendants=[...body.querySelectorAll('.point-text,.step-label')].filter(e=>e.getBoundingClientRect().height>0);
     return {title:el.getAttribute('aria-label'),height:el.offsetHeight,bodyFits:body.scrollHeight<=body.clientHeight+1,
       contentAboveFooter:descendants.every(e=>e.getBoundingClientRect().bottom<=f.top+1),
       fullElementsVisible:descendants.every(e=>{const r=e.getBoundingClientRect();return r.top>=b.top-1&&r.bottom<=b.bottom+1;}),
       processSteps:el.classList.contains('visual-process')?descendants.length:0};
    })''')
    assert all(r['bodyFits'] and r['contentAboveFooter'] and r['fullElementsVisible'] for r in result),(stress,mode,width,result)
    assert all(r['processSteps']==(5 if stress else 4) for r in result[1:]),result
    heights=page.locator('.canvas-board .canvas-node').evaluate_all('els=>els.map(e=>e.offsetHeight)')
    page.wait_for_timeout(150)
    assert heights==page.locator('.canvas-board .canvas-node').evaluate_all('els=>els.map(e=>e.offsetHeight)'),'height measurements must converge'
    checks.append({'stress':stress,'mode':mode,'viewport':[width,height],'nodes':result})
    if mode=='audience' and width==1440:page.screenshot(path=str(OUT/('stress-desktop.png'if stress else 'screenshot-regression.png')))
 assert not errors,errors
 (OUT/'report.json').write_text(json.dumps(checks,indent=2));print(f'{len(checks)} content-fit checks passed: unclipped point boxes, visible compact steps, stable measured heights')
 browser.close()
