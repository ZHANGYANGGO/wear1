"""From the repository root: python scripts/verify-face.py [--browser path] [--photos directory]."""
import argparse, base64, hashlib, json
from pathlib import Path
from PIL import Image, ImageDraw
from playwright.sync_api import sync_playwright

cli=argparse.ArgumentParser()
cli.add_argument('--browser');cli.add_argument('--url',default='http://127.0.0.1:4294')
cli.add_argument('--photos',type=Path,help='Directory containing front.jpg, side.jpg and held.jpg')
args=cli.parse_args()
out=Path('.private/module4-review');out.mkdir(exist_ok=True,parents=True)
if args.photos:
    inputs=args.photos
else:
    inputs=out/'inputs';inputs.mkdir(exist_ok=True)
    for name,frame in [('front',1),('side',3),('held',10)]:
        im=Image.open(Path('.private/multiview-reference')/f'frame-{frame:02d}.jpg')
        im.crop((1000,55,1730,785)).save(inputs/(name+'.jpg'),quality=96)

with sync_playwright() as pw:
    browser=pw.chromium.launch(executable_path=args.browser,args=['--use-angle=swiftshader','--enable-webgl'])
    ctx=browser.new_context(viewport={'width':1200,'height':860},accept_downloads=True)
    page=ctx.new_page();page.set_default_timeout(90000)
    errs=[];page.on('pageerror',lambda e:(errs.append(str(e)),print('Page error:',e,flush=True)))
    def log(m): print(m,flush=True)
    def adjust(selector,value):
        page.locator(selector).evaluate("(el,value)=>{el.value=value;el.dispatchEvent(new Event('input',{bubbles:true}))}",str(value))
    def snap(name,selector='#face-view canvas'):
        page.locator(selector).screenshot(path=out/(name+'.png'))
    def download(button,name):
        with page.expect_download() as pending:page.click(button)
        pending.value.save_as(out/(name+'.glb'))
    def closeup_views(prefix):
        c=page.locator('#face-view canvas');c.press('Home')
        for angle,n in [('front',0),('oblique',6),('side',7)]:
            c.evaluate("(el,n)=>{for(let i=0;i<n;i++)el.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true}))}",n)
            page.wait_for_timeout(100);snap(prefix+'-'+angle)
        c.press('Home')
    def accepted(view,source):
        page.set_input_files('#'+view,source)
        try:page.wait_for_function("document.querySelector('#state').textContent.includes('原貌已生成')||document.querySelector('#error').textContent.length>0",timeout=45000)
        except Exception:
            print('UI:',page.inner_text('#state'),page.inner_text('#error'),flush=True);raise
        assert not page.inner_text('#error'),page.inner_text('#error')
    page.goto(args.url+'/create.html');page.check('[value=quick]');page.fill('#height','170');page.fill('#weight','65')
    page.click('#generate');page.locator('#preview-actions').wait_for(state='visible')
    download('#download-model','body');page.click('#confirm');page.wait_for_url(args.url+'/**')
    page.click('a[href="./face.html"]');page.wait_for_function("document.querySelector('#state').textContent.includes('可上传照片')")
    # Preview makeup directly on a body-only legacy record and cancel the draft.
    page.get_by_role('button',name='清透日常',exact=True).click()
    assert page.input_value('#lip')!='0'
    page.click('#cancel')
    assert not page.evaluate("JSON.parse(sessionStorage.getItem('wearmate.3d.confirmed')).faceLook??null")
    page.click('a[href="./face.html"]');page.wait_for_function("document.querySelector('#state').textContent.includes('可上传照片')")
    log('body confirmed')
    accepted('front',inputs/'front.jpg')
    page.click('#save')
    first=page.evaluate("JSON.parse(sessionStorage.getItem('wearmate.3d.confirmed')).faceLook.shape")
    closeup_views('single')
    page.click('#gray');closeup_views('single-gray');page.click('#gray')
    # The same frontal photo in the side slot must not replace the accepted front.
    page.set_input_files('#side',inputs/'front.jpg')
    page.wait_for_function("document.querySelector('#error').textContent.length>0")
    assert '侧照' in page.inner_text('#error')
    accepted('side',inputs/'side.jpg')
    page.click('#save')
    dual=page.evaluate("JSON.parse(sessionStorage.getItem('wearmate.3d.confirmed')).faceLook.shape")
    page.click('#gray');closeup_views('dual-gray');page.click('#gray');closeup_views('original')
    log('single and dual faces ready')
    held=base64.b64encode((inputs/'held.jpg').read_bytes()).decode()
    accuracy=page.evaluate("""async ([bytes,single,dual])=>{
      const {observePhoto}=await import('/src/face/observations.mjs'),{heldOut,neutralShape,cameraFor,visible,scoreIds}=await import('/src/face/geometry.mjs');
      const img=await (await fetch('data:image/jpeg;base64,'+bytes)).blob(),obs=await observePhoto(img,'held');
      const shapes=[neutralShape(),single,dual],ids=scoreIds.filter(id=>shapes.every(s=>visible(id,cameraFor(obs,s)[0])));
      return {yaw:obs.yaw,template:heldOut(obs,shapes[0],ids),single:heldOut(obs,single,ids),dual:heldOut(obs,dual,ids)};
    }""",[held,first,dual])
    page.get_by_role('button',name='柔和上镜',exact=True).click()
    adjust('#even',41)
    assert page.inner_text('#beauty-name')=='自定义'
    page.get_by_role('button',name='暖调晚妆',exact=True).click()
    adjust('#lip-color','#9a254b')
    page.locator('#compare').dispatch_event('keydown',{'key':' '});page.wait_for_timeout(100);snap('held-original')
    page.locator('#compare').dispatch_event('keyup',{'key':' '})
    page.click('#remove-makeup');assert page.input_value('#lip')=='0' and page.input_value('#even')=='41'
    page.click('#beauty-reset');assert page.input_value('#even')=='0'
    page.get_by_role('button',name='轮廓微调',exact=True).click()
    page.get_by_role('button',name='暖调晚妆',exact=True).click()
    adjust('#lip-color','#9a254b')
    page.click('#save');closeup_views('styled')
    profile=page.evaluate("JSON.parse(sessionStorage.getItem('wearmate.3d.confirmed'))")
    page.click('#wardrobe');page.wait_for_selector('[data-garment=tshirt]')
    for item in ['tshirt','jeans','shoes']:
        sel='[data-garment='+item+']';page.click(sel)
        page.wait_for_function("s=>document.querySelector(s).getAttribute('aria-pressed')==='true'||document.querySelector('#tryon-error').textContent.length>0",arg=sel)
        assert page.get_attribute(sel,'aria-pressed')=='true',page.inner_text('#tryon-error')
        if item=='tshirt':snap('wardrobe-top','#tryon-viewer canvas')
    snap('wardrobe-outfit','#tryon-viewer canvas')
    page.click('#face-editor-link');page.wait_for_function("document.querySelector('#state').textContent.includes('可上传照片')")
    assert page.input_value('#jaw')=='20' and page.input_value('#lip-color')=='#9a254b'
    confirmed_dimensions=page.inner_text('#dimensions')
    download('#export-base','original');download('#export-style','styled')
    # A valid replacement starts first. A later undecodable file must win.
    previous=page.evaluate("sessionStorage.getItem('wearmate.3d.confirmed')")
    page.set_input_files('#front',inputs/'front.jpg')
    page.set_input_files('#front',{'name':'broken.png','mimeType':'image/png','buffer':b'broken'})
    page.wait_for_function("document.querySelector('#error').textContent.includes('解码')")
    page.wait_for_timeout(900)
    assert page.evaluate("sessionStorage.getItem('wearmate.3d.confirmed')")==previous
    assert '解码' in page.inner_text('#error')
    log('styling and outfit passed')
    swatches=[]
    for filename in ['211fd845a79c872882071c26a72a2c9b.png','f236da97c124644f2a3977f01347a7ff.png']:
        source=next(Path('../../人物').rglob(filename),None)
        if not source:continue
        result=page.evaluate("""async bytes=>{
          const {observePhoto}=await import('/src/face/observations.mjs');
          const {prepareAtlas,composeAtlas}=await import('/src/face/atlas.mjs');
          const {baseStyle,selectBeauty,selectMakeup}=await import('/src/face/style.mjs');
          const obs=await observePhoto(await(await fetch('data:image/png;base64,'+bytes)).blob(),'front');
          const cache=await prepareAtlas(obs),a=composeAtlas(cache,baseStyle()),b=composeAtlas(cache,selectMakeup(selectBeauty(baseStyle(),'柔和上镜'),'暖调晚妆'));
          return {skin:obs.skin,base:a.toDataURL(),styled:b.toDataURL()};
        }""",base64.b64encode(source.read_bytes()).decode())
        swatches.append({'sample':filename,'skinRGB':result['skin']})
        for variant in ['base','styled']:
            (out/(filename[:6]+'-'+variant+'.png')).write_bytes(base64.b64decode(result[variant].split(',')[1]))
    # Fresh context, independent stock Three.js loader and scene, then disconnect
    # before either file is parsed. No session data, WearMate viewer or body asset.
    clean=browser.new_context(viewport={'width':620,'height':620});p=clean.new_page()
    p.goto(args.url+'/');p.evaluate("""async()=>{window.THREE=await import('three');window.Loader=(await import('three/addons/loaders/GLTFLoader.js')).GLTFLoader;document.body.replaceChildren();}""")
    clean.set_offline(True)
    offline={}
    for variant in ['original','styled']:
        raw=(out/(variant+'.glb')).read_bytes()
        offline[variant]=p.evaluate("""async b64=>{const T=window.THREE;
          const bytes=Uint8Array.from(atob(b64),v=>v.charCodeAt(0));const {scene}=await new Loader().parseAsync(bytes.buffer,'');
          const body=scene.getObjectByName('Body'),hair=scene.getObjectByName('Hair');
          const c=new T.PerspectiveCamera(31,1,.01,10);const bounds=new T.Box3().setFromObject(body);
          const h=bounds.max.y;c.position.set(.10,h*.94,.59);c.lookAt(0,h*.925,.06);
          const renderer=new T.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});renderer.setSize(560,560);document.body.replaceChildren(renderer.domElement);
          scene.background=new T.Color(0xeae5dc);scene.add(new T.HemisphereLight(0xffffff,0xb0a79c,2));const l=new T.DirectionalLight(0xffffff,1.7);l.position.set(2,3,4);scene.add(l);
          renderer.render(scene,c);return {vertices:body.geometry.attributes.position.count,texture:body.material.map?.image.width,hair:!!hair,height:h,hairTop:hair?new T.Box3().setFromObject(hair).max.y:null};
        }""",base64.b64encode(raw).decode())
        assert offline[variant]['texture']==512
        p.locator('canvas').screenshot(path=out/('offline-'+variant+'.png'))
    assert not errs,errs
    report={'bodyId':profile['id'],'source':str(inputs),'subjects':1,'confirmedDimensions':confirmed_dimensions,'landmarks':'same visible nose, chin and jaw indices; mean pixel distance / observed face-box width',
            'accuracy':accuracy,'offline':offline,'additionalSkinSamples':swatches,'frontYaw':profile['faceLook']['front']['yaw'],'sideYaw':profile['faceLook']['side']['yaw'],
            'sha256':{v:hashlib.sha256((out/(v+'.glb')).read_bytes()).hexdigest() for v in ['body','original','styled']}}
    (out/'acceptance.json').write_text(json.dumps(report,indent=2),encoding='utf8')
    browser.close()
for name,rows in [('review',[['original-front','original-oblique','original-side'],['styled-front','styled-oblique','styled-side']]),
                  ('texture-comparison',[['single-front','single-oblique','single-side'],['original-front','original-oblique','original-side']]),
                  ('geometry',[['single-gray-front','single-gray-oblique','single-gray-side'],['dual-gray-front','dual-gray-oblique','dual-gray-side']])]:
    sheet=Image.new('RGB',(1170,780),'white');draw=ImageDraw.Draw(sheet)
    for r,row in enumerate(rows):
        for c,k in enumerate(row):
            im=Image.open(out/(k+'.png'));im.thumbnail((380,355));sheet.paste(im,(390*c+(390-im.width)//2,390*r+26));draw.text((390*c+12,390*r+8),k,fill='black')
    sheet.save(out/(name+'.png'))
sections=[('原貌与当前造型（上排原貌，下排造型）','review.png'),('单图与双图灰模（上排单图，下排双图）','geometry.png'),
          ('单图与双图贴图效果（上排单图，下排双图）','texture-comparison.png'),('原貌离线重载','offline-original.png'),
          ('当前造型离线重载','offline-styled.png'),('上衣试穿','wardrobe-top.png'),('完整搭配','wardrobe-outfit.png')]
html='<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>WearMate 面部造型验收</title><style>body{max-width:1100px;margin:auto;padding:24px;background:#faf7f0;font:16px/1.5 system-ui}img{max-width:100%}a{margin-right:1em}</style><h1>WearMate 面部造型验收</h1><p><a href="original.glb" download>原貌 GLB</a><a href="styled.glb" download>当前造型 GLB</a><a href="measurements.json">网格量体</a><a href="acceptance.json">留出视角误差</a></p>'
if inputs.resolve().is_relative_to(out.resolve()):
    html+='<h2>建模照片与独立留出照片</h2>'+''.join('<img width="30%" src="inputs/'+name+'.jpg" alt="'+name+'">' for name in ['front','side','held'])
html+=''.join('<section><h2>'+title+'</h2><img src="'+file+'" alt="'+title+'"></section>' for title,file in sections)
(out/'review.html').write_text(html+'</html>',encoding='utf8')
print(out,flush=True)

