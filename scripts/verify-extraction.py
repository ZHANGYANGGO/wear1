"""Browser acceptance for the two public entry points. Run from wear-二维."""
import argparse
import base64
import hashlib
import io
import json
import os
import subprocess
import time
from contextlib import contextmanager
from pathlib import Path
from urllib.request import urlopen

from PIL import Image, ImageDraw, ImageOps
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
FIX = ROOT / ".runtime"
OUT = ROOT / "reports/extraction"
SOURCES = {"portrait.jpg":"https://storage.googleapis.com/mediapipe-assets/portrait.jpg",
           "pose.jpg":"https://storage.googleapis.com/mediapipe-assets/pose.jpg",
           "733872.jpg":"https://images.pexels.com/photos/733872/pexels-photo-733872.jpeg?auto=compress&cs=tinysrgb&w=900"}
ROLES = ["woman-bob","man-smile","man-glasses","woman-silver","mila","nia","iris"]


def fixtures():
    FIX.mkdir(exist_ok=True)
    for name,url in SOURCES.items():
        if not (FIX/name).is_file():
            with urlopen(url,timeout=60) as response:
                (FIX/name).write_bytes(response.read())
    source = Image.open(FIX/"portrait.jpg")
    source.crop((170,0,625,455)).save(FIX/"head.png")
    upright = Image.open(FIX/"733872.jpg")
    upright.resize((1800,1200),Image.Resampling.LANCZOS).save(FIX/"large.jpg",quality=92)
    exif = Image.Exif()
    exif[274] = 6
    upright.transpose(Image.Transpose.ROTATE_90).save(FIX/"phone.jpg", quality=95, exif=exif)
    full = Image.open(ROOT/"assets/stage1a/iris-reference.webp").convert("RGB")
    full.save(FIX/"full.png")
    full.crop((235,8,395,168)).resize((480,480),Image.Resampling.LANCZOS).save(FIX/"supplement.png")
    crowd = Image.new("RGB",(920,460),"white")
    head = Image.open(FIX/"head.png").resize((460,460))
    crowd.paste(head,(0,0)); crowd.paste(head,(460,0)); crowd.save(FIX/"two.png")
    # Keep the torso and head visible with an opaque covering across the central face.
    covered = source.copy()
    ImageDraw.Draw(covered).rectangle((265,102,495,293),fill="#41464b")
    covered.save(FIX/"covered.png")
    Image.new("RGB",(500,400),"#d6dee5").save(FIX/"empty.png")
    (FIX/"invalid.png").write_bytes(b"invalid bytes")


@contextmanager
def offline_server():
    proc = subprocess.Popen(["node","scripts/serve.mjs","0"],cwd=ROOT,
        env={**os.environ,"WEARMATE_DISABLE_ANALYSIS":"1"},stdout=subprocess.PIPE,text=True)
    try:
        yield proc.stdout.readline().strip().split()[-1].rstrip("/")
    finally:
        proc.terminate();proc.wait(timeout=10)


def builtin_checks(browser):
    with offline_server() as url:
        page = browser.new_page(viewport={"width":1250,"height":850})
        requests = []
        page.on("request",lambda req: requests.append(req.url))
        for role in ROLES:
            page.goto(url)
            page.get_by_role("link",name="使用内置模型").click()
            page.locator(f'#portraits [data-id="{role}"]').click()
            page.wait_for_selector(f'#preview[data-person-id="{role}"]')
            if role == "nia": page.screenshot(path=OUT/"builtins.png")
            page.click("#to-closet")
            page.wait_for_selector("#closet-empty:visible, #closet-library:visible")
            if page.locator("#import-samples").is_visible(): page.click("#import-samples")
            page.click('[data-garment-id="navy-shirt"]')
            page.click("#try-on-item")
            page.wait_for_selector(f'#avatar[data-profile="{role}"] [data-wearable="navy-shirt"]:visible')
        forbidden = [url for url in requests if "/api/" in url or "/models/" in url]
        assert not forbidden,forbidden
        page.close()
        return {"roles":ROLES,"analysisRequests":len(forbidden),"backendDisabled":True}


def check_photos(browser,url):
    page = browser.new_page(viewport={"width":1250,"height":880})
    page.set_default_timeout(90000)
    # Read the application's decoded response; Chromium may evict large PNGs from its DevTools network cache.
    page.add_init_script("""const parse = Response.prototype.json;
      Response.prototype.json = async function(...args) {
        const value = await parse.apply(this,args);
        if (this.url.endsWith('/api/photo-analysis')) window.lastAnalysis = structuredClone(value);
        return value;
      };""")
    errors = []
    page.on("pageerror",lambda e: errors.append(str(e)))

    def enter():
        page.goto(url)
        page.get_by_role("link",name="上传照片生成").click()
        page.wait_for_selector("#photo:enabled")

    def upload(name,source="photo",success=True):
        page.evaluate("delete window.lastAnalysis")
        with page.expect_response(lambda r:"/api/photo-analysis" in r.url,timeout=100000) as req:
            page.set_input_files("#"+source,FIX/name)
        resp = req.value
        page.wait_for_function("window.lastAnalysis !== undefined")
        data = page.evaluate("window.lastAnalysis")
        assert resp.ok == success,(name,resp.status,data.get("error"))
        if success:
            page.wait_for_selector('#canvas[data-source="'+data["sourceId"]+'"]')
        else:
            page.wait_for_function("document.querySelector('#error').textContent.length>0")
        return data

    def panel(label,mode,background="light",points=False):
        page.select_option("#background",background)
        page.select_option("#view",mode)
        page.locator("#points").set_checked(points)
        page.wait_for_function("m=>document.querySelector('#canvas').dataset.view===m",arg=mode)
        # Await the async bitmap decode for point overlays, even if only the checkbox changed.
        page.wait_for_function("v=>document.querySelector('#canvas').dataset.points===String(v)",arg=points)
        assert page.locator("#frame").evaluate("f=>f.scrollHeight<=f.clientHeight+1 && f.scrollWidth<=f.clientWidth+1"),label
        page.locator("#frame").screenshot(path=OUT/(label+".png"),animations="disabled")

    def confirm():
        page.click("#confirm"); page.wait_for_selector("#preview[data-person-id]")
        return page.get_attribute("#preview","data-person-id")

    def describe(data):
        a = Image.open(io.BytesIO(base64.b64decode(data["assets"]["alpha"])))
        labels = Image.open(io.BytesIO(base64.b64decode(data["assets"]["semantic"])))
        hist = a.histogram()
        assert sum(hist[1:255]) > 0 and hist[0] > 0 and sum(hist[200:]) > 0
        assert labels.size == a.size == tuple(data["geometry"]["rasterSize"])
        return {"geometry":data["geometry"],"landmarks":len(data["landmarks"] or []),"body":data["bodyObservation"],
                "needsSupplement":data["needsSupplement"],"softAlphaPixels":sum(hist[1:255]),
                "observedClasses":[i for i,n in enumerate(labels.histogram()) if n],
                "samples":data["samples"]}

    enter()
    head = upload("head.png")
    assert head["bodyObservation"] == "unobserved" and len(head["landmarks"]) == 478
    panel("head-points","original",points=True)
    person = confirm()
    enter()
    longhair = upload("733872.jpg")
    assert longhair["samples"]["hair"] and longhair["samples"]["skin"]
    panel("longhair-original","original")
    panel("longhair-basic","basic","dark")
    panel("longhair-dark","foreground","dark")
    panel("longhair-light","foreground")
    panel("longhair-regions","semantic")
    panel("longhair-points","original",points=True)
    page.click("#cancel");page.wait_for_selector(f'#preview[data-person-id="{person}"]')
    enter()
    phone = upload("phone.jpg")
    assert phone["geometry"]["orientation"] == 6
    assert phone["geometry"]["orientedSize"] == longhair["geometry"]["orientedSize"]
    eye = longhair["landmarks"][33]
    rot = phone["landmarks"][33]
    assert max(abs(a-b) for a,b in zip(eye,rot)) < 12,(eye,rot)
    panel("phone-points","original",points=True)
    large = upload("large.jpg")
    assert large["geometry"]["rasterSize"] == [1440,960] and large["geometry"]["rasterToOriented"] == [1.25,0,0,0,1.25,0]
    assert max(abs(v/2-ref) for v,ref in zip(large["landmarks"][33],eye)) < 12
    real_full = upload("pose.jpg")
    assert real_full["needsSupplement"] and real_full["bodyObservation"] == "observed"
    panel("athlete-full","foreground","dark")
    full = upload("full.png")
    assert full["needsSupplement"] and full["bodyObservation"] == "observed"
    silhouette_id = confirm()
    assert page.evaluate("""async id=>(await (await import('/src/people/store.mjs')).getAnalysis(id)).faceSourceId""",silhouette_id) is None
    page.click("#inspect")
    page.wait_for_selector('#canvas[data-source="primary"]')
    bad_supp = upload("invalid.png","supplement",False)
    assert bad_supp["code"] == "decode" and page.locator("#supplement-box").is_visible()
    close = upload("supplement.png","supplement")
    assert close["landmarks"] and not close["needsSupplement"]
    panel("supplement-points","original",points=True)
    page.select_option("#view-source","primary")
    panel("full-dark","foreground","dark")
    full_id = confirm()
    assert full_id == silhouette_id and full_id != person
    page.reload();page.wait_for_selector(f'#preview[data-person-id="{full_id}"]')
    state = page.evaluate("""async (id)=>{
      const {getAnalysis}=await import('/src/people/store.mjs');
      const a=await getAnalysis(id);
      const hash=async blob=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await blob.arrayBuffer())),x=>x.toString(16).padStart(2,'0')).join('');
      return [a.schemaVersion,a.faceSourceId,a.primary.sourceId,a.supplement.sourceId,
        await hash(a.primary.assets.foreground),a.supplement.landmarks.length];
    }""",full_id)
    assert state == [1,"supplement","primary","supplement",hashlib.sha256(base64.b64decode(full["assets"]["foreground"])).hexdigest(),478]
    page.click("#inspect");page.wait_for_selector('#canvas[data-source="primary"]')
    page.select_option("#view-source","supplement");page.wait_for_selector('#canvas[data-source="supplement"]')
    page.click("#cancel")
    enter()
    invalid = {}
    for name in ["two.png","empty.png","covered.png","invalid.png"]:
        invalid[name] = upload(name,success=False)["code"]
        assert page.locator("#confirm").is_disabled()
    assert invalid == {"two.png":"multiple","empty.png":"no-face","covered.png":"occlusion","invalid.png":"decode"},invalid
    page.click("#cancel");page.wait_for_selector(f'#preview[data-person-id="{full_id}"]')
    enter()
    page.set_input_files("#photo",FIX/"head.png")
    data = upload("733872.jpg")
    page.wait_for_selector("#confirm:enabled")
    assert page.input_value("#name") == "733872"
    page.set_input_files("#photo",FIX/"head.png");page.click("#cancel")
    page.reload();page.wait_for_selector(f'#preview[data-person-id="{full_id}"]')
    # A completed old response can still be queued after a replacement. Hold its
    # parsed result even if the fetch signal is aborted, then release it after the new preview.
    enter()
    page.evaluate("""() => {
      const parse=Response.prototype.json;
      Response.prototype.json=async function(...args) {
        const data=await parse.apply(this,args);
        if (this.url.endsWith('/api/photo-analysis') && !window.holdStarted) {
          window.holdStarted=true;
          await new Promise(done=>window.releaseFirst=done);
        }
        return data;
      };
    }""")
    page.set_input_files("#photo",FIX/"head.png")
    page.wait_for_function("typeof window.releaseFirst==='function'")
    upload("733872.jpg")
    page.wait_for_selector("#confirm:enabled")
    page.evaluate("window.releaseFirst()")
    page.wait_for_timeout(150)
    assert page.input_value("#name") == "733872"
    assert "900 ×" in page.inner_text("#details")
    page.set_viewport_size({"width":390,"height":844})
    assert page.evaluate("document.documentElement.scrollWidth <= innerWidth")
    page.screenshot(path=OUT/"mobile.png",full_page=True)
    assert not errors,errors
    page.close()
    return {"head":describe(head),"longHair":describe(longhair),"phone":describe(phone),"large":describe(large),
        "full":describe(full),"athlete":describe(real_full),
        "supplement":describe(close),"errors":invalid,"reloadContract":state,"reselectAndCancel":True}


def check_upgrade(browser,url):
    page = browser.new_page()
    page.set_default_timeout(90000)
    page.goto(url)
    original = base64.b64encode((FIX/"head.png").read_bytes()).decode()
    page.evaluate("""(image)=>new Promise((done,fail)=>{
      const open=indexedDB.open('wearmate.2d.people',1);
      open.onupgradeneeded=()=>{
        const db=open.result,id='photo-legacy-test';
        const people=db.createObjectStore('people',{keyPath:'id'});
        people.add({id,name:'旧照片',kind:'photo',createdAt:42,width:455,height:455});
        const bytes=Uint8Array.from(atob(image),c=>c.charCodeAt(0));
        db.createObjectStore('images').put(new Blob([bytes],{type:'image/png'}),id);
        const targets=db.createObjectStore('targets');targets.put(id,'makeup');targets.put(id,'library');
        db.createObjectStore('results',{keyPath:['personId','module']}).put({personId:id,module:'makeup',parameters:{saved:42}});
      };
      open.onsuccess=()=>{open.result.close();done()};open.onerror=()=>fail(open.error);
    })""",original)
    page.goto(url+"/people.html?module=makeup")
    page.wait_for_selector('#preview[data-person-id="photo-legacy-test"]')
    page.click("#inspect");page.click("#confirm")
    page.wait_for_selector('#preview[data-person-id="photo-legacy-test"]')
    verified = page.evaluate("""async ()=>{
      const s=await import('/src/people/store.mjs'),id='photo-legacy-test';
      return (await s.getAnalysis(id)).primary.landmarks.length===478 &&
        (await s.listPeople()).find(p=>p.id===id).createdAt===42 &&
        (await s.getResult(id,'makeup')).parameters.saved===42 && (await s.getTarget('library'))===id;
    }""")
    page.close()
    assert verified
    return verified


def comparisons():
    names = ["longhair-original","longhair-basic","longhair-dark","longhair-light",
             "longhair-points","phone-points","full-dark","athlete-full",
             "head-points","supplement-points","longhair-regions","builtins"]
    titles = ["Original","Semantic cutout","MODNet / dark","MODNet / light","Facial landmarks","EXIF 6",
              "Full silhouette","Full-body photograph","Headshot","Supplement","Semantic classes","Built-in selection"]
    sheet = Image.new("RGB",(1200,750),"#f4f1ea")
    draw = ImageDraw.Draw(sheet)
    for i,(name,title) in enumerate(zip(names,titles)):
        frame = Image.open(OUT/(name+".png"))
        frame.thumbnail((294,217))
        x,y = i%4*300,i//4*250
        sheet.paste(frame,(x+(300-frame.width)//2,y))
        draw.text((x+8,y+223),title,fill="#292723")
    sheet.save(OUT/"comparison.jpg",quality=92)


if __name__=="__main__":
    cli = argparse.ArgumentParser()
    cli.add_argument("--url",default="http://127.0.0.1:4375")
    cli.add_argument("--browser")
    cli.add_argument("--builtins-only",action="store_true")
    args = cli.parse_args()
    OUT.mkdir(parents=True,exist_ok=True)
    with sync_playwright() as pw:
        browser = pw.chromium.launch(executable_path=args.browser)
        result = {"builtins":builtin_checks(browser)}
        print("7 built-ins passed",flush=True)
        if not args.builtins_only:
            fixtures()
            result["photos"] = check_photos(browser,args.url)
            result["upgradedLegacyPerson"] = check_upgrade(browser,args.url)
            comparisons()
            (OUT/"results.json").write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding="utf-8")
            print("Photo extraction, state recovery and preview comparisons passed",flush=True)
        browser.close()

