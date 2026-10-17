"""Desktop figure workflow; explicit test provider on 8790, never the real API.
Fixture includes a raster chart, a captioned vector diagram and tiny logos.
"""
from pathlib import Path
import json, os, re
from playwright.sync_api import sync_playwright, expect
ROOT=Path(__file__).resolve().parents[5]
OUT=Path(os.environ.get('FOLLOW_QA_DIR','/tmp/follow-figure-qa'));OUT.mkdir(parents=True,exist_ok=True)
checks=[]
def check(ok,label):
    assert ok,label
    checks.append(label)
def capture(page,name):
    page.wait_for_timeout(500);page.screenshot(path=str(OUT/(name+'.png')),full_page=True)
def audit(page,label):
    page.add_script_tag(path=str(ROOT/'node_modules/axe-core/axe.min.js'))
    result=page.evaluate("async()=> (await axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}})).violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>n.target)}))")
    checks.append({'surface':label,'accessibilityViolations':result})
def say(page,text):
    page.get_by_label('Type an explanation',exact=True).fill(text)
    page.get_by_role('button',name='Compose visual from explanation').click()
with sync_playwright() as p:
    browser=p.chromium.launch(headless=True)
    page=browser.new_page(viewport={'width':1440,'height':900})
    errors=[];requests=[]
    page.on('pageerror',lambda e:errors.append(str(e)))
    page.on('request',lambda r:requests.append({'url':r.url,'body':r.post_data}) if '/api/'in r.url else None)
    page.route('**/api/**',lambda route:route.fulfill(response=route.fetch(url='http://127.0.0.1:8790/api/'+route.request.url.split('/api/',1)[1])))
    page.goto(os.environ.get('FOLLOW_URL','http://127.0.0.1:5173'));page.wait_for_load_state('networkidle')
    page.get_by_label('Select source PDF').set_input_files(str(ROOT/'apps/web/src/pdf/fixtures/illustrated.pdf'))
    expect(page.get_by_role('heading',name='Knowledge first. Visuals as you speak.')).to_be_visible(timeout=30000)
    print(page.locator('.local-figures-summary').inner_text())
    page.get_by_role('button',name=re.compile('^Figures')).click()
    expect(page.locator('.pdf-figure-card')).to_have_count(1)
    expect(page.locator('.pdf-figure-card input').nth(1)).to_have_value('Figure 1. Reactor pressure before and after cooling.')
    check(page.locator('.pdf-figure-preview img').evaluate('(el)=>el.complete&&el.naturalWidth>400'),'raster chart rendered locally at useful resolution; logo excluded')
    audit(page,'source raster');capture(page,'source-raster')
    page.get_by_role('button',name=re.compile('Page 2')).click()
    expect(page.locator('.pdf-figure-card')).to_have_count(1)
    expect(page.locator('.pdf-figure-card input').nth(1)).to_have_value('Figure 2. Water circulation through capture, filter and return.')
    check(page.locator('.pdf-figure-preview img').evaluate('(el)=>el.complete&&el.naturalWidth>400'),'captioned vector diagram rendered with labels')
    capture(page,'source-vector')
    page.get_by_role('button',name=re.compile('Page 3')).click()
    expect(page.locator('.pdf-figure-card')).to_have_count(0)
    checks.append('text-only page has no decorative false-positive figure')
    page.get_by_role('button',name='Add this page as a visual').click()
    expect(page.locator('.pdf-figure-card')).to_have_count(1,timeout=15000)
    check(not page.get_by_role('checkbox',name='Use while presenting').is_checked(),'uncaptioned full-page fallback requires explicit opt-in')
    page.get_by_role('button',name='Build knowledge base',exact=True).click()
    page.get_by_role('button',name='Open speaking studio').click(timeout=15000)
    expect(page.get_by_text('Your words build the canvas.')).to_be_visible()
    before=len([r for r in requests if '/live/compose'in r['url']])
    say(page,'Show figure one: reactor pressure before and after cooling.')
    expect(page.locator('.live-status')).to_contain_text('local source figure')
    expect(page.locator('.canvas-node.is-focused .source-figure img')).to_be_visible()
    check(page.locator('.canvas-node.is-focused .source-figure img').evaluate('(el)=>el.complete&&el.naturalWidth>400'),'spoken reactor topic displays original local chart')
    capture(page,'studio-raster')
    say(page,'Show figure two: water circulation captures, filters and returns water to the tank.')
    expect(page.locator('.canvas-node.is-focused h2').filter(has_text='Water circulation')).to_contain_text('Water circulation')
    after=len([r for r in requests if '/live/compose'in r['url']])
    check(before==after,'two caption-supported figure explanations make zero composition API calls')
    page.get_by_role('button',name='Audience preview',exact=True).click()
    expect(page.locator('.audience-safe-area .source-figure img').first).to_be_visible()
    for width,height in [(1440,900),(1280,720)]:
        page.set_viewport_size({'width':width,'height':height});page.wait_for_timeout(500)
        check(page.locator('.is-focused').evaluate_all('(els)=>els.every(el=>el.scrollHeight<=el.clientHeight+2)'),f'original figure and caption fit audience composition at {width}x{height}')
    audit(page,'audience figure');capture(page,'audience-vector-720')
    page.get_by_role('button',name='Back to studio').click();page.set_viewport_size({'width':1440,'height':900})
    say(page,'Discuss weekly maintenance and filter inspections.')
    expect(page.locator('.live-status')).to_contain_text('No supporting material',timeout=15000)
    expect(page.locator('.canvas-node.is-focused h2').filter(has_text='Water circulation')).to_contain_text('Water circulation')
    checks.append('unsupported unrelated topic does not select another image')
    bodies=[r['body'] for r in requests if r['body']]
    check(all(all(term not in body for term in ['base64','image_url','local-pdf:','data:image','blob:'])for body in bodies),'preparation and composition API requests contain text only, no image pixels or asset keys')
    check(not errors,f'no browser runtime errors {errors}')
    check(all(not item['accessibilityViolations']for item in checks if isinstance(item,dict)),'desktop figure screens pass accessibility checks')
    report={'provider':'fixture provider isolated on 8790; no real Groq calls in this browser test','checks':checks,'requests':[r['url'].split('/api/',1)[1]for r in requests]}
    (OUT/'report.json').write_text(json.dumps(report,indent=2));print(json.dumps(report,indent=2));browser.close()
