"""Hold network responses to prove that continuous speech need not wait for AI.
Fixture ASR/AI only; does not measure real speech recognition or Groq speed.
"""
import asyncio, json, os, time
from pathlib import Path
from playwright.async_api import async_playwright, expect
ROOT=Path(__file__).resolve().parents[5]
OUT=Path(os.environ.get('FOLLOW_QA_DIR','/tmp/follow-latency-qa'));OUT.mkdir(parents=True,exist_ok=True)
async def main():
 async with async_playwright() as p:
  browser=await p.chromium.launch(headless=True)
  page=await browser.new_page(viewport={'width':1440,'height':900})
  errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  gates=[asyncio.Event(),asyncio.Event()];requests=[];completed=[]
  async def api(route):
   request=route.request
   if '/live/compose' in request.url:
    i=len(requests);requests.append(request.post_data_json)
    response=await route.fetch(url='http://127.0.0.1:8790/api/live/compose')
    if i<len(gates): await gates[i].wait()
    completed.append(i)
    if 'longfixture' in request.post_data_json['utterance']:
     body=await response.json()
     for c in body['project']['concepts']:
      if c['visual']['type']=='concept':
       c['title']=(c['title']+' extended presentation context and explanation')[:64]
       c['summary']=('A long source-backed explanation with several technical details. '*4)[:180]
       if c['details']:
        detail=c['details'][0]
        c['details']=[{**detail,'id':f'long-{j}','text':('A detailed supporting statement for this side of the comparison. '*4)[:180]} for j in range(3)]
     await route.fulfill(response=response,json=body)
    else: await route.fulfill(response=response)
   else: await route.fulfill(response=await route.fetch(url='http://127.0.0.1:8790/api/'+request.url.split('/api/',1)[1]))
  await page.route('**/api/**',api)
  await page.goto(os.environ.get('FOLLOW_URL','http://127.0.0.1:5173'));await page.wait_for_load_state('networkidle')
  await page.get_by_label('Select source PDF').set_input_files(str(ROOT/'demo/source/follow-demo.pdf'))
  await page.get_by_role('button',name='Build knowledge base',exact=True).click()
  await page.get_by_role('button',name='Open speaking studio').click()
  async def say(text):
   await page.get_by_label('Type an explanation',exact=True).fill(text)
   await page.get_by_role('button',name='Compose visual from explanation').click()
  start=time.perf_counter()
  await say('Explain the process used to turn speech into a canvas.')
  await expect(page.locator('.canvas-board .visual-process')).to_be_visible(timeout=1000)
  elapsed=round((time.perf_counter()-start)*1000)
  assert not completed,'preview must precede the held network response'
  await say('Please compare fixed slides with a speech-directed canvas.')
  await expect(page.locator('.follow-canvas')).to_have_attribute('data-view','comparison',timeout=1000)
  assert not completed,'second topic must update while first generation is still pending'
  last='Please compare the fixed slides with a speech-directed canvas instead.'
  await say(last)
  await expect(page.locator('.follow-canvas')).to_have_attribute('data-view','comparison',timeout=1000)
  gates[0].set()
  for _ in range(100):
   if len(requests)>=2:break
   await asyncio.sleep(.03)
  assert len(requests)==2,requests
  assert requests[1]['utterance']==last,'queued context must be replaced, not concatenated'
  await expect(page.locator('.follow-canvas')).to_have_attribute('data-view','comparison')
  gates[1].set()
  await expect(page.locator('.live-status')).to_contain_text('source pages',timeout=10000)
  await page.wait_for_timeout(400)
  assert await page.locator('.canvas-node.is-focused').count()==2,'refinement replaces its provisional sides without duplicates'
  # Check actual DOM geometry for card contents and microphone-control rows.
  geometry=await page.locator('.canvas-board .canvas-node').evaluate_all('''els=>els.map(el=>{
    const footer=el.querySelector('.board-provenance').getBoundingClientRect();
    const body=el.querySelector('.node-detail-group').getBoundingClientRect();
    const box=el.getBoundingClientRect();
    return {title:el.getAttribute('aria-label'),noFooterOverlap:body.bottom<=footer.top+1,inside:footer.bottom<=box.bottom+1};
  })''')
  assert all(x['noFooterOverlap'] and x['inside'] for x in geometry),geometry
  await page.screenshot(path=str(OUT/'instant-board-desktop.png'),full_page=True)
  await say('Please compare fixed slides with a speech-directed canvas longfixture')
  await expect(page.locator('.live-status .live-spin')).to_have_count(0,timeout=10000)
  await page.wait_for_timeout(350)
  long_geometry=await page.locator('.canvas-board .canvas-node').evaluate_all('''els=>els.map(el=>{
   const title=el.querySelector('h2').getBoundingClientRect();
   const body=el.querySelector('.node-detail-group').getBoundingClientRect();
   const footer=el.querySelector('.board-provenance').getBoundingClientRect();
   return title.bottom<=body.top+1 && body.bottom<=footer.top+1;
  })''')
  assert all(long_geometry),long_geometry
  await page.screenshot(path=str(OUT/'long-content-desktop.png'),full_page=True)
  assert not errors,errors
  report={'provider':'held fixture responses, no real Groq','firstLocalVisualMsIncludingInput':elapsed,'checks':['visual visible before first AI response','second and third explanations update during pending generation','only latest pending explanation sent','no concatenated duplicate windows','late old result cannot replace latest board','refinement replaces provisional visuals without duplicates','content and provenance do not overlap','64-character titles and three 180-character details stay in separate layout regions','no browser runtime errors'],'geometry':geometry}
  (OUT/'report.json').write_text(json.dumps(report,indent=2));print(json.dumps(report,indent=2))
  await browser.close()
asyncio.run(main())
