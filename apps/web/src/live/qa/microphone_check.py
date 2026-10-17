"""Synthetic audio + fixture ASR tests wiring/cancellation, not recognition quality.
Run with the explicit browser-fixture API on 8790 and Vite on 5173.
"""
from pathlib import Path
import json, os, time
from playwright.sync_api import sync_playwright, expect
OUT=Path(os.environ.get('FOLLOW_QA_DIR','/tmp/follow-live-qa'));OUT.mkdir(parents=True,exist_ok=True)
with sync_playwright() as p:
    browser=p.chromium.launch(headless=True,args=['--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream'])
    context=browser.new_context(permissions=['microphone'],viewport={'width':1440,'height':1000})
    context.add_init_script('''
    const NativeWorker=window.Worker;
    window.Worker=class {
      constructor(url,options) {
        if (!String(url).includes('speech.worker')) return new NativeWorker(url,options);
        this.disposed=false;
      }
      postMessage(message) {
        setTimeout(()=> { if(!this.disposed) this.onmessage?.({data:message.type==='init-speech'
          ? {id:message.id,type:'ready'}
          : {id:message.id,type:'transcript',text:'Explain the process used to turn speech into a canvas.',ms:1}}); },30);
      }
      terminate(){this.disposed=true;}
    };
    const getUserMedia=navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    window.__microphoneTracks=[];
    navigator.mediaDevices.getUserMedia=async c=> {const stream=await getUserMedia(c);window.__microphoneTracks.push(...stream.getTracks());return stream;};
    ''')
    page=context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
    page.route('**/api/**',lambda route:route.fulfill(response=route.fetch(url='http://127.0.0.1:8790/api/'+route.request.url.split('/api/',1)[1])))
    page.goto(os.environ.get('FOLLOW_URL','http://127.0.0.1:5173'));page.wait_for_load_state('networkidle')
    root=Path(__file__).resolve().parents[5]
    page.get_by_label('Select source PDF').set_input_files(str(root/'demo/source/follow-demo.pdf'))
    page.get_by_role('button',name='Build knowledge base',exact=True).click()
    page.get_by_role('button',name='Open speaking studio').click()
    expect(page.get_by_role('button',name='Start listening',exact=True)).to_be_disabled()
    page.get_by_role('button',name='Load local voice model',exact=True).click()
    expect(page.get_by_role('button',name='Start listening',exact=True)).to_be_enabled()
    page.get_by_role('button',name='Start listening',exact=True).click()
    expect(page.locator('.live-status')).to_contain_text('Canvas updated',timeout=20000)
    expect(page.locator('.canvas-node.is-focused h2')).to_have_text('Four steps')
    page.get_by_role('button',name='Pause listening',exact=True).click()
    assert page.evaluate('window.__microphoneTracks.every(t=>t.readyState==="ended")')
    expect(page.locator('.live-status')).to_contain_text('Paused')
    page.get_by_role('button',name='Start listening',exact=True).click()
    expect(page.locator('.live-status')).to_contain_text('Canvas updated',timeout=20000)
    page.get_by_role('button',name='Audience preview',exact=True).click()
    expect(page.locator('.audience-safe-area .follow-canvas')).to_have_attribute('data-view','focus')
    page.get_by_role('button',name='Pause listening',exact=True).click()
    assert page.evaluate('window.__microphoneTracks.every(t=>t.readyState==="ended")')
    assert not errors,errors
    result={'asr':'fixture, not real Whisper inference','audio':'Chromium synthetic microphone through real AudioWorklet','checks':['model load gates microphone','microphone PCM -> transcript -> composition -> canvas','pause releases tracks','restart reuses model and resumes composition','audience continues receiving live canvas','audience pause stops microphone','no browser runtime errors']}
    (OUT/'microphone-report.json').write_text(json.dumps(result,indent=2));print(json.dumps(result,indent=2))
    browser.close()
