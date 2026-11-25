"""Browser acceptance for personal bodies. Use a fresh browser context on a running workbench."""
import argparse
import base64
import io
import json
from pathlib import Path
from urllib.request import urlopen

import numpy as np
from PIL import Image, ImageDraw, ImageFont
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "reports/personal-body"
PHOTOS = {
    "774909.jpg":"https://images.pexels.com/photos/774909/pexels-photo-774909.jpeg?auto=compress&cs=tinysrgb&w=900",
    "1239291.jpg":"https://images.pexels.com/photos/1239291/pexels-photo-1239291.jpeg?auto=compress&cs=tinysrgb&w=900",
    "obama-a.jpg":"https://cdn.jsdelivr.net/gh/ageitgey/face_recognition@master/examples/obama.jpg",
}
GROUPS = {
    "top": ["navy-shirt", "purple-graphic-tee", "white-sweatshirt", "blue-collar-polo"],
    "bottom": ["black-trousers", "light-blue-jeans", "gray-joggers"],
    "shoes": ["white-platform-sneakers", "ivory-mary-janes"],
    "dress": ["floral-maxi"], "outerwear": ["white-puffer"],
}


def wait_outcome(page, success, error):
    page.wait_for_function(f"()=>({success}) || document.querySelector('{error}')?.textContent.trim()")
    assert not page.locator(error).text_content(), page.locator(error).text_content()


def generate(page, url, filename, name):
    page.goto(url + "/create.html")
    page.set_input_files("#photo", ROOT/".runtime"/filename)
    wait_outcome(page, "document.querySelector('#confirm:not(:disabled)')", "#error")
    page.fill("#name", name)
    page.click("#cartoon-generate")
    wait_outcome(page, "document.querySelector('#cartoon-save:not(:disabled)')", "#cartoon-error")
    page.click("#cartoon-save")
    page.wait_for_url("**/people.html*")
    wait_outcome(page, "document.querySelector('#body-confirm:not(:disabled)')", "#error")
    page.click("#body-confirm")
    page.wait_for_selector("#try-on:visible")
    return page.locator("#preview").get_attribute("data-person-id")


def people(page, url, pid):
    page.goto(url + "/people.html")
    wait_outcome(page, "document.querySelector('#preview[data-person-id]')", "#error")
    if page.locator("#person-select").input_value() != pid:
        page.select_option("#person-select",pid)
    wait_outcome(page, f"document.querySelector('#preview').dataset.personId==='{pid}'", "#error")


def studio(page, pid):
    wait_outcome(page, f"document.querySelector('#avatar[data-profile=\"{pid}\"]:not([hidden])') && !document.querySelector('#save-look-button').disabled", "#asset-error")


def worn(page):
    return set(page.locator("#avatar img[data-wearable]:not([hidden])").evaluate_all("els=>els.map(i=>i.dataset.wearable)"))


def choose(page, category, item):
    page.click("#tab-"+category)
    page.click(f'[data-garment="{item}"]')
    assert item in worn(page)


def save(page,name):
    page.fill("#look-title",name)
    page.click("#save-look-button")
    assert name in page.inner_text("#saved-look-status")


def raster(page, selector="#avatar", layer=None):
    encoded=page.locator(selector).evaluate("""(el,layer)=>{
      const c=document.createElement('canvas');c.width=560;c.height=1536;
      const ctx=c.getContext('2d');
      for(const i of el.querySelectorAll('img:not([hidden]), canvas')) {
        if (!layer || i.dataset.layer===layer) ctx.drawImage(i,0,0);
      }
      return c.toDataURL().split(',')[1];
    }""",layer)
    return Image.open(io.BytesIO(base64.b64decode(encoded))).convert("RGBA")


def coverage(page, family, layers):
    # Compare visible, fully opaque intersections against the actual garment and strand colors.
    photo=np.asarray(raster(page)).astype(int)
    front=np.asarray(raster(page,layer="frontHair")).astype(int)
    back=np.asarray(raster(page,layer="backHair")).astype(int)
    garment=Image.new("RGBA",(560,1536))
    for item in layers:
        garment.alpha_composite(Image.open(ROOT/"assets/wardrobe/tryon"/family/(item+".webp")).convert("RGBA"))
    cloth=np.asarray(garment).astype(int)
    counts={}
    for name,img,test in [("front",front,front[:,:,3]>245),("back",cloth,(back[:,:,3]>245)&(front[:,:,3]<3))]:
        mask=test & (cloth[:,:,3]>=249)
        if name=="back":
            mask &= np.asarray(raster(page,layer="head"))[:,:,3]<10
        count=int(mask.sum())
        if count:
            assert (np.abs(photo[mask,:3]-img[mask,:3]).max(axis=1)<9).mean()>.96,(name,count)
        counts[name]=count
    return counts


def sheet(images, labels, target, include_zoom=True, zoom=(82,115,478,407)):
    out=Image.new("RGB",(310*len(images),850 if include_zoom else 625),"#ece9df")
    draw=ImageDraw.Draw(out)
    try: font=ImageFont.truetype("C:/Windows/Fonts/msyh.ttc",18)
    except OSError: font=ImageFont.load_default()
    for index,(im,label) in enumerate(zip(images,labels)):
        left=index*310
        draw.text((left+12,10),label,font=font,fill="#302f29")
        body=im.resize((208,570),Image.Resampling.LANCZOS)
        out.paste(body,(left+51,48),body)
        if include_zoom:
            crop=im.crop(zoom).resize((300,221),Image.Resampling.LANCZOS)
            out.paste(crop,(left+5,624),crop)
    out.save(OUT/target,quality=94)


def verify(page,url):
    ids={}
    for name,file in [("长发","774909.jpg"),("短发","obama-a.jpg"),("眼镜长发","1239291.jpg")]:
        print("Generating",file,flush=True)
        ids[name]=generate(page,url,file,name)
    long,short,clipped=ids.values()
    people(page,url,long)
    page.click("#to-closet")
    page.wait_for_selector("#import-samples")
    page.click("#import-samples")
    for item,enabled in [("nude-pumps",False),("navy-shirt",True)]:
        page.click(f'[data-garment-id="{item}"]')
        assert page.locator("#try-on-item").is_enabled()==enabled
        page.click("#try-on-item" if enabled else "#close-dialog")
    studio(page,long)
    assert "navy-shirt" in worn(page)

    def exercise():
        for category,items in GROUPS.items():
            for item in items: choose(page,category,item)
        assert worn(page)=={"floral-maxi","white-puffer","ivory-mary-janes"}
        page.click(".layer-clear")
        page.click("#tab-dress");page.click(".layer-clear")
        assert worn(page)=={"blue-collar-polo","gray-joggers","ivory-mary-janes"}

    exercise()
    photos=[]; counts={}
    for top in ["white-sweatshirt","navy-shirt"]:
        choose(page,"top",top)
        photos.append(raster(page));counts[top]=coverage(page,"fitted",[top])
    choose(page,"outerwear","white-puffer")
    photos.append(raster(page));counts["coat"]=coverage(page,"fitted",["navy-shirt","white-puffer"])
    assert min(c["front"] for c in counts.values())>30,counts
    sheet(photos,["浅色圆领","深色衬衫领","衬衫与双层外套"],"collars.jpg")
    save(page,"长发外套");long_look=worn(page)
    long_head=np.asarray(raster(page,layer="head"))
    people(page,url,short);page.click("#try-on");studio(page,short)
    assert not np.array_equal(long_head,np.asarray(raster(page,layer="head")))
    choose(page,"top","purple-graphic-tee");save(page,"短发紫衫");short_view=raster(page)
    people(page,url,long)
    assert raster(page,"#preview .avatar").tobytes()==photos[-1].tobytes()
    page.click("#try-on");studio(page,long);page.reload();studio(page,long)
    assert worn(page)==long_look and np.array_equal(long_head,np.asarray(raster(page,layer="head")))
    assert page.locator(".saved-look-load").all_text_contents()==["长发外套"]
    choose(page,"dress","floral-maxi");save(page,"长发裙装")
    page.click("[data-outfit=casual]")
    page.locator("#saved-looks summary").click()
    page.get_by_role("button",name="长发裙装",exact=True).click()
    page.click("#tab-dress");page.click(".layer-clear")
    assert worn(page)==long_look

    people(page,url,clipped);page.click("#try-on");studio(page,clipped);choose(page,"top","navy-shirt")
    counts["clipped"]=coverage(page,"fitted",["navy-shirt"])
    assert counts["clipped"]["back"]>30,counts
    clipped_view=raster(page)
    choose(page,"outerwear","white-puffer")
    counts["clippedCoat"]=coverage(page,"fitted",["navy-shirt","white-puffer"])
    assert counts["clippedCoat"]["back"]>30
    people(page,url,long)
    mapped=[]
    for template in ["fitted","straight"]:
        if page.locator("#body-template").input_value()!=template:
            page.select_option("#body-template",template)
            wait_outcome(page,"document.querySelector('#body-confirm:not(:disabled)')","#error")
            assert page.locator("#try-on").is_hidden()
            page.click("#body-confirm");page.wait_for_selector("#try-on:visible")
        page.locator("#mapped-points").check()
        marked=raster(page,"#preview .avatar")
        page.reload();wait_outcome(page,"document.querySelector('#mapped-label:not([hidden])')","#error")
        page.locator("#mapped-points").check()
        assert marked.tobytes()==raster(page,"#preview .avatar").tobytes()
        assert page.evaluate("""async id=>{
          const s=await import('/src/people/store.mjs');
          const h=await s.getCartoon(id), {geometry:g}= (await s.getFitting(id)).body;
          const [a,b,c,d,e,f]=g.layerToCanvas;
          return g.landmarks.length===478 && h.landmarks.every(([x,y],i)=>
            Math.hypot(g.landmarks[i][0]-(a*x+b*y+c),g.landmarks[i][1]-(d*x+e*y+f))<.001);
        }""",long)
        mapped.append(marked)
    sheet(mapped,["合身版 · 眼唇与轮廓","直身版 · 同一头层"],"templates.jpg",zoom=(114,23,430,256))
    page.click("#try-on");studio(page,long)
    assert worn(page)==long_look
    exercise();straight_view=raster(page)
    sheet([photos[1],short_view,clipped_view,straight_view],
          ["合身版 · 完整发梢","合身版 · 短发","合身版 · 眼镜及截断发梢","直身版 · 完整发梢"],"people.jpg",False)
    people(page,url,"woman-bob");page.click("#to-closet")
    page.wait_for_selector("#closet-grid [data-garment-id]")
    assert page.locator("#closet-grid [data-garment-id]").count()==9
    page.click('[data-garment-id="navy-shirt"]');page.click("#try-on-item")
    studio(page,"woman-bob");page.wait_for_selector('#avatar img[data-layer=neckline]:not([hidden])')
    people(page,url,short);page.click("#try-on");studio(page,short)
    assert "purple-graphic-tee" in worn(page) and page.locator(".saved-look-load").all_text_contents()==["短发紫衫"]
    reopened=page.context.new_page()
    reopened.goto(url);studio(reopened,short)
    assert "purple-graphic-tee" in worn(reopened)
    reopened.close()
    for pid in ["woman-bob","man-smile","man-glasses","woman-silver","mila","nia","iris"]:
        people(page,url,pid)
        assert page.locator("#preview img[data-wearable]:visible").count()==3
        assert page.locator("#preview .avatar img:not([data-wearable])").count()==3
    people(page,url,long)
    page.set_viewport_size({"width":390,"height":844})
    assert page.evaluate("document.documentElement.scrollWidth <= innerWidth")
    assert page.locator("#body-template").input_value()=="straight"
    page.screenshot(path=OUT/"mobile.png",full_page=True)
    # Simulate a head update in another tab while a prior full-body preview is open.
    assert page.evaluate("""async id=>{
      const s=await import('/src/people/store.mjs');
      const old=(await s.getFitting(id)).body, h=await s.getCartoon(id), data=await s.getAnalysis(id);
      await s.confirmAnalysis({...data,personId:id,name:'长发',module:'library',cartoon:{...h,revision:crypto.randomUUID()}});
      try {await s.confirmFitting(id,old);return false;} catch{}
      return !(await s.getFitting(id)) && !(await s.getPhotoPerson(id)).templateId;
    }""",long)
    # Read an actual second-stage head, which predates body templates and revision IDs.
    fixture=ROOT/"reports/cartoon/example"
    legacy=json.loads((fixture/"head.json").read_text(encoding="utf8"))
    legacy["assets"]={p.stem:base64.b64encode(p.read_bytes()).decode("ascii") for p in fixture.glob("*.png")}
    assert page.evaluate("""async ([id,head])=>{
      const s=await import('/src/people/store.mjs');
      for (const [k,b64] of Object.entries(head.assets)) head.assets[k]=new Blob(
        [Uint8Array.from(atob(b64),c=>c.charCodeAt(0))],{type:'image/png'});
      await s.saveResult(id,'cartoon',{cartoon:head},head.assets.head);
      return (await s.getCartoon(id)).revision.startsWith('legacy-');
    }""",[clipped,legacy])
    people(page,url,clipped)
    page.click("#body-confirm");page.click("#try-on");studio(page,clipped)
    assert page.locator('#avatar [data-layer="backHair"]').count()==1
    people(page,url,clipped)
    page.get_by_role("link",name="用已存照片更新旧版头脸和颈部").click()
    page.get_by_role("button",name="重新生成",exact=True).click()
    wait_outcome(page,"document.querySelector('#cartoon-status').textContent.includes('生成完成')", "#cartoon-error")
    page.click("#cartoon-save")
    page.wait_for_url("**/people.html*")
    wait_outcome(page,f"document.querySelector('#preview').dataset.personId==='{clipped}'", "#error")
    assert page.evaluate("""async id=>{
      const s=await import('/src/people/store.mjs');
      return (await s.getCartoon(id)).version===2 && !(await s.getFitting(id))?.body;
    }""",clipped)
    page.click("#body-confirm");page.click("#try-on");studio(page,clipped)
    return {"generated":3,"templates":["fitted","straight"],"catalogReadyEach":sum(map(len,GROUPS.values())),
      "dedicatedCatalog":9,"legacyAvatars":7,"landmarksPerTemplate":478,"staleHeadRejected":True,
      "newTabRecovered":True,"legacyHeadRecovered":True,"legacyHeadRegenerated":True,"mobileWidth":390,"occlusionPixels":counts}


if __name__=="__main__":
    cli=argparse.ArgumentParser()
    cli.add_argument("--url",default="http://127.0.0.1:4375")
    cli.add_argument("--browser")
    args=cli.parse_args()
    OUT.mkdir(exist_ok=True,parents=True)
    for filename,source in PHOTOS.items():
        path=ROOT/".runtime"/filename
        if not path.exists():
            path.parent.mkdir(exist_ok=True)
            with urlopen(source,timeout=45) as response: path.write_bytes(response.read())
    with sync_playwright() as pw:
        browser=pw.chromium.launch(executable_path=args.browser)
        context=browser.new_context(viewport={"width":1280,"height":960})
        page=context.new_page()
        page.set_default_timeout(120000)
        errors=[]
        page.on("pageerror",lambda e:errors.append(str(e)))
        report=verify(page,args.url.rstrip("/"))
        assert not errors,errors
        browser.close()
    (OUT/"results.json").write_text(json.dumps(report,indent=2),encoding="utf8")
    print("PASS",report)
