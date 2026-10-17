"""Render screenshot regression through the actual shared canvas, no AI fixtures."""
from pathlib import Path
import json
from playwright.sync_api import sync_playwright, expect
OUT=Path('/tmp/follow-metric-qa');OUT.mkdir(exist_ok=True)
with sync_playwright() as p:
 browser=p.chromium.launch(headless=True)
 page=browser.new_page(viewport={'width':1440,'height':900})
 errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 page.goto('http://127.0.0.1:5173');page.wait_for_load_state('networkidle')
 page.evaluate('''async()=>{
  const React=await import('/node_modules/.vite/deps/react.js');
  const rootModule=await import('/node_modules/.vite/deps/react-dom_client.js');
  const createRoot=rootModule.createRoot??rootModule.default.createRoot;
  const {FollowCanvas}=await import('/src/canvas/FollowCanvas.tsx');
  document.getElementById('root').style.display='none';
  const stage=document.createElement('div');stage.style.cssText='position:fixed;inset:0';document.body.append(stage);
  window.metricRoot=createRoot(stage);
  window.renderMetric=(count=1,extreme=false)=>{
   const quote='Third-year BSc (Hons) student with a first-class standing and a 75.8% average across years 1 and 2.';
   const ref={page:1,start:0,end:quote.length,quote};
   const concept={id:'student',title:'University of Edinburgh Computer Science Student',summary:quote,aliases:[],speechExamples:[],visual:{type:'metric',value:extreme?'1234567890123456':'75.8%',unit:extreme?'measurements per operating period':'%',label:extreme?'Average measurements across all academic years and research project observations.':'Average grade across Years 1–2',valueSource:ref},sources:[ref],details:[{id:'detail',text:quote,sources:[ref],origin:'source'}],assetIds:[],enabled:true,review:'source-checked',position:{x:0,y:0}};
   const concepts=[concept];
   for(let i=1;i<count;i++)concepts.push({...concept,id:'context-'+i,title:'Earlier supporting context',visual:{type:'concept'}});
   const project={schemaVersion:1,id:'metric-regression',revision:1,title:'Metric regression',source:{name:'screenshot-regression.pdf',sha256:'a'.repeat(64),pages:1},knowledgeBase:{version:1,pages:[{page:1,text:quote}]},preparation:{mode:'curated',model:null,promptVersion:'test',preparedAt:new Date(0).toISOString()},concepts,relationships:[],assets:[],approvedRevision:null};
   const state={project,live:true,boardIds:concepts.map(c=>c.id),view:count===2?'comparison':'focus',focusId:count===2?null:'student',pair:count===2?['student','context-1']:null,activeRelationshipId:null,introduced:concepts.map(c=>c.id),revealed:{student:['detail']},connected:[],highlightedDetailId:null,revision:1};
   window.metricRoot.render((React.createElement??React.default.createElement)(FollowCanvas,{state,mode:'audience',reducedMotion:true}));
  };
 }''')
 checks=[]
 for extreme in [False,True]:
  for count in [1,2,3]:
   for width,height in [(1440,900),(1280,720),(2216,1054)]:
    page.set_viewport_size({'width':width,'height':height})
    page.evaluate('args=>window.renderMetric(...args)',[count,extreme]);page.wait_for_timeout(250)
    expect(page.locator('.visual-metric .metric-composition p')).to_be_visible()
    result=page.locator('.visual-metric').evaluate('''el=>{
     const body=el.querySelector('.node-detail-group');const label=el.querySelector('.metric-composition p');const value=el.querySelector('.metric-value');const footer=el.querySelector('.board-provenance');
     const box=body.getBoundingClientRect(),l=label.getBoundingClientRect(),v=value.getBoundingClientRect(),f=footer.getBoundingClientRect();
     return {value:value.textContent,label:label.textContent,bodyFits:body.scrollHeight<=body.clientHeight+1,labelFits:l.bottom<=box.bottom+1&&l.right<=box.right+1,valueFits:v.right<=box.right+1,noOverlap:l.top>=v.bottom-1&&l.bottom<=f.top+1};
    }''')
    assert all(result[k] for k in ['bodyFits','labelFits','valueFits','noOverlap']),(extreme,count,width,result)
    if not extreme:assert result['value']=='75.8%',result
    checks.append({'extreme':extreme,'elements':count,'viewport':[width,height],**result})
    if count==1 and width==1440:page.screenshot(path=str(OUT/('extreme.png'if extreme else 'student-metric.png')))
 assert not errors,errors
 (OUT/'report.json').write_text(json.dumps(checks,indent=2));print(f'{len(checks)} metric layout checks passed; no duplicate percent, clipped label, or body overflow')
 browser.close()
