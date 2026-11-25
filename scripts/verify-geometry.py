"""Run from the repository root with the local server running (Playwright Chromium)."""
import argparse
import base64
import json
import subprocess
from pathlib import Path
from playwright.sync_api import sync_playwright
from PIL import Image, ImageDraw

parser = argparse.ArgumentParser()
parser.add_argument('--baseline', action='store_true')
parser.add_argument('--url', default='http://127.0.0.1:4283')
parser.add_argument('--photos', type=Path, default=Path('.private/bodym-analysis/qa'))
parser.add_argument('--browser')
args = parser.parse_args()
root = Path.cwd()
out = root / '.private/module3/browser' / ('baseline' if args.baseline else 'current')
out.mkdir(parents=True, exist_ok=True)

with sync_playwright() as pw:
    browser = pw.chromium.launch(executable_path=args.browser, args=['--use-angle=swiftshader', '--enable-webgl'])
    page = browser.new_page(viewport={'width':1280,'height':960}, accept_downloads=True)
    errors = []
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.set_default_timeout(90000)
    def observe(script):
        return script.replace('return { sections, contour, advice:', '(window.qaContours??={})[view]={sections,contour};return { sections, contour, advice:')
    if args.baseline:
        def old_source(route):
            path = route.request.url.removeprefix(args.url+'/').split('?')[0]
            data = subprocess.check_output(['git','-c',f'safe.directory={root.as_posix()}','show','3dbcdfa:'+path])
            if path.endswith('/silhouette.mjs'):
                data=observe(data.decode()).encode()
            route.fulfill(body=data, content_type='text/javascript' if path.endswith('.mjs') else 'text/html;charset=utf-8')
        page.route('**/src/**/*.mjs',old_source)
        page.route('**/create.html',old_source)
    else:
        page.route('**/src/create/silhouette.mjs',lambda route:route.fulfill(
            body=observe(route.fetch().text()),content_type='text/javascript;charset=utf-8'))
    page.goto(args.url+'/create.html')
    page.check('[value=photos]')
    page.fill('#height','170')
    page.fill('#weight','65')
    for view in ['front','side']:
        (out/(view+'-source.png')).write_bytes((args.photos/(view+'.png')).read_bytes())
        page.set_input_files('#'+view+'-file',args.photos/(view+'.png'))
        page.wait_for_function("v=>document.getElementById(v+'-result').dataset.state==='ready'",arg=view)
        overlay = page.locator('[data-contour='+view+']')
        overlay.locator('summary').click()
        overlay.locator('canvas').screenshot(path=out/(view+'-mask.png'))
        overlay.locator('summary').click()
    (out/'observed.json').write_text(json.dumps(page.evaluate('window.qaContours')),encoding='utf-8')
    page.click('#generate')
    page.locator('#preview-actions').wait_for(state='visible')
    canvas = page.locator('#candidate-viewer canvas')
    def shots(canvas, prefix):
        canvas.press('Home')
        for angle, steps in [('front',0),('oblique',6),('side',7)]:
            for _ in range(steps):
                canvas.press('ArrowRight')
            page.wait_for_timeout(200)
            canvas.screenshot(path=out/(prefix+angle+'.png'))
    shots(canvas,'body-')
    if not args.baseline:
        page.check('#show-tape')
        canvas.press('Home')
        canvas.screenshot(path=out/'body-tape.png')
    with page.expect_download() as download:
        page.click('#download-model')
    download.value.save_as(out/'photos.glb')
    page.click('#confirm')
    page.wait_for_function("document.getElementById('model-state')?.textContent==='试衣分身已就绪'")
    profile = page.evaluate("JSON.parse(sessionStorage.getItem('wearmate.3d.confirmed'))")
    (out/'profile.json').write_text(json.dumps(profile),encoding='utf-8')
    if not args.baseline:
        page.goto(args.url+'/wardrobe.html')
        for item in ['dress','tshirt','jeans','shoes','jacket','shirt']:
            if page.is_enabled('#remove-all'):
                page.click('#remove-all')
            selector = '[data-garment='+item+']'
            page.click(selector)
            page.wait_for_function("s=>document.querySelector(s).getAttribute('aria-pressed')==='true'",arg=selector)
            page.locator('#tryon-viewer canvas').screenshot(path=out/('wear-'+item+'.png'))
        # Submit an actual native BodyM pair without landmarks, using waist alone.
        manifest=json.loads((root/'.private/bodym-analysis/latest.json').read_bytes())
        sample=json.loads((Path(manifest['dir'])/'testA-sample.json').read_bytes())
        page.goto(args.url+'/create.html')
        page.check('[value=measured]')
        page.fill('[name=waistGirth]','82')
        for view,folder in [('front','mask'),('side','mask_left')]:
            page.set_input_files('#'+view+'-file',Path(manifest['dataset'])/'testA'/folder/(sample['photo_id']+'.png'))
            page.wait_for_function("v=>document.getElementById(v+'-result').dataset.state==='ready'",arg=view)
        page.click('#generate')
        page.locator('#preview-actions').wait_for(state='visible')
        (out/'bodym-upload.txt').write_text(page.inner_text('#tape-result'),encoding='utf-8')
        assert '腰 82.0' in page.inner_text('#tape-result')
    # Use the published viewer/exporter, with the same fixed input as the repository fixture.
    page.goto(args.url+'/create.html')
    result = page.evaluate("""async baseline => {
      const {fitBody} = await import('/src/3d/fitting.mjs');
      const views={front:{chest:.2,waist:.16,hips:.21,shoulders:.24,hipHeight:.51,shoulderHeight:.81},
        side:{chest:.13,waist:.12,hips:.13,shoulders:.09,hipHeight:.52,shoulderHeight:.8}};
      const input={tier:'measured',heightCm:170,weightKg:65,girths:{chest:98,waist:82,hips:101},views};
      let profile;
      if(baseline) profile=fitBody(input);
      else {
        const {fitGeometry}=await import('/src/3d/photo-geometry.mjs');
        const {localTemplate}=await import('/src/3d/mesh-tape.mjs');
        profile=fitGeometry(input,await localTemplate());
      }
      const viewer=(await import('/src/3d/viewer.mjs')).createModelViewer(document.querySelector('#candidate-viewer'));
      await viewer.load(null,profile);
      const blob=await viewer.exportModel();
      let reloaded=null;
      if(!baseline) {
        const url=URL.createObjectURL(blob);
        try { reloaded=(await viewer.load(url)).measurements; } finally { URL.revokeObjectURL(url); }
      }
      viewer.dispose();
      return {data: await new Promise(resolve=>{const r=new FileReader(); r.onload=()=>resolve(r.result.split(',')[1]);r.readAsDataURL(blob)}),reloaded};
    }""",args.baseline)
    (out/'fixed.glb').write_bytes(base64.b64decode(result['data']))
    if not args.baseline:
        cm = result['reloaded']
        assert all(abs(cm[k]-v)<1 for k,v in [('chest',98),('waist',82),('hips',101)])
        (out/'reloaded.json').write_text(json.dumps(cm,indent=2))
    assert not errors,errors
    print(out,flush=True)
    browser.close()

if not args.baseline:
    for name,rows in [('comparison',[[out.parent/version/('body-'+view+'.png') for view in ['front','oblique','side']]
                                     for version in ['baseline','current']]),
                      ('garments',[[out/('wear-'+item+'.png') for item in items]
                                   for items in [('tshirt','jeans','shoes'),('dress','jacket','shirt')]])]:
        sheet=Image.new('RGB',(1080,780),'white')
        draw=ImageDraw.Draw(sheet)
        for i,row in enumerate(rows):
            for j,file in enumerate(row):
                picture=Image.open(file)
                picture.thumbnail((354,360))
                sheet.paste(picture,(j*360+(360-picture.width)//2,i*390+24))
                draw.text((j*360+8,i*390+5),file.parent.name+' / '+file.stem,fill='black')
        sheet.save(out.parent/(name+'.png'))

