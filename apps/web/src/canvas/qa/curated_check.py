from playwright.sync_api import sync_playwright, expect
from pathlib import Path
import json, os
root=Path(__file__).resolve().parents[5]
out=Path(os.environ.get('FOLLOW_QA_DIR','/tmp/follow-real-content-qa'));out.mkdir(exist_ok=True)
manifest=json.loads((root/'demo/manifest.json').read_text())
report={'page_errors':[],'concepts':[],'requests':[]}
with sync_playwright() as p:
 browser=p.chromium.launch(headless=True)
 context=browser.new_context(viewport={'width':1440,'height':900})
 page=context.new_page();page.on('pageerror',lambda e:report['page_errors'].append(str(e)))
 page.on('request',lambda r: report['requests'].append(r.url.split('?')[0]) if '/api/' in r.url else None)
 page.goto(os.environ.get('FOLLOW_URL','http://127.0.0.1:5173'));page.wait_for_load_state('networkidle')
 page.get_by_label('Import prepared project manifest',exact=True).set_input_files(str(root/'demo/manifest.json'))
 expect(page.locator('.project-title')).to_have_text(manifest['title'])
 page.wait_for_timeout(450)
 report['manifest_import']='passed'
 page.screenshot(path=str(out/'curated-overview.png'))
 for c in manifest['concepts']:
  page.get_by_role('button',name=c['title']).click();page.wait_for_timeout(150)
  for button in page.locator('.reveal-controls button').all():button.click()
  page.get_by_role('button',name='Audience preview').click();page.wait_for_timeout(450)
  for w,h in [(1280,720),(1920,1080)]:
   page.set_viewport_size({'width':w,'height':h});page.wait_for_timeout(400)
   measurements=page.locator('.is-focused').evaluate_all("els=>els.map(el=>({title:el.querySelector('h2').textContent,height:el.clientHeight,scroll:el.scrollHeight,zoom:new DOMMatrix(getComputedStyle(el.closest('.react-flow__viewport')).transform).a,points:el.querySelectorAll('.node-points li').length}))")
   minimum=page.locator('.is-focused .node-summary,.is-focused .node-points li,.is-focused .step-label').evaluate_all("els => { const zoom = new DOMMatrix(getComputedStyle(document.querySelector('.react-flow__viewport')).transform).a; const sizes = els.filter(el=>el.getBoundingClientRect().width && getComputedStyle(el).visibility!=='hidden').map(el=>parseFloat(getComputedStyle(el).fontSize)*zoom); return sizes.length ? Math.min(...sizes) : 22; }")
   assert minimum >= 22, f"{c['id']} at {w}: text is only {minimum}px"
   report['concepts'].append({'id':c['id'],'viewport':[w,h],'measurements':measurements,'overflow':any(m['scroll']>m['height']+2 for m in measurements)})
   page.screenshot(path=str(out/f"{c['id']}-{h}.png"))
  report['audience_window_count']=len(context.pages)
  page.get_by_role('button',name='Back to studio').click();page.set_viewport_size({'width':1440,'height':900});page.wait_for_timeout(300)
 # Direct demo action and real PDF matching are checked independently of JSON import.
 page.get_by_role('button',name='Back to project entry').click()
 page.get_by_label('Select source PDF',exact=True).set_input_files({'name':'renamed.pdf','mimeType':'application/pdf','buffer':(root/'demo/source/follow-demo.pdf').read_bytes()})
 expect(page.locator('.project-title')).to_have_text(manifest['title'],timeout=15000)
 report['matching_pdf_opens_demo']='passed'
 page.get_by_role('button',name='Back to project entry').click()
 page.get_by_label('Select source PDF',exact=True).set_input_files({'name':'follow-demo.pdf','mimeType':'application/pdf','buffer':(root/'demo/source/follow-demo.pdf').read_bytes()+b'\\n% different bytes\\n'})
 expect(page.locator('.entry-message[role=status]')).to_contain_text('Groq preparation is not connected',timeout=15000)
 report['different_hash_does_not_open_curated_project']='passed'
 page.get_by_role('button',name='Open demo project').click()
 expect(page.locator('.project-title')).to_have_text(manifest['title'])
 report['primary_demo_action']='passed'
 # Reload proves whether the imported project is stored.
 page.reload();page.wait_for_load_state('networkidle')
 report['reload_restores_project']=page.locator('.studio-screen').count()>0
 browser.close()
(out/'audit.json').write_text(json.dumps(report,indent=2))
print(json.dumps({k:v for k,v in report.items() if k!='concepts'},indent=2))
assert not any(c['overflow'] for c in report['concepts']), 'Real content is clipped'
assert not report['page_errors'], 'Browser runtime errors'
print('Overflow findings:',json.dumps([c for c in report['concepts'] if c['overflow']],indent=2))
print('Screenshots:',str(out))
