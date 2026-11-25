"""End-to-end local portrait generation and report figures. Run from wear-二维."""
import argparse
import base64
import io
import json
import os
import shutil
import subprocess
import time
import tempfile
from pathlib import Path
from urllib.request import urlopen

from PIL import Image, ImageDraw, ImageFont, ImageOps
import numpy as np
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]
FIX=ROOT/".runtime"
OUT=ROOT/"reports/cartoon"
SAMPLES={
    "obama-a":("人物 A · 照片 1","https://cdn.jsdelivr.net/gh/ageitgey/face_recognition@master/examples/obama.jpg"),
    "obama-b":("人物 A · 照片 2","https://cdn.jsdelivr.net/gh/ageitgey/face_recognition@master/examples/obama2.jpg"),
    "1239291":("人物 B · 长发与眼镜","https://images.pexels.com/photos/1239291/pexels-photo-1239291.jpeg?auto=compress&cs=tinysrgb&w=900"),
}
STYLES=["anime","handdrawn"]


def check(condition,message):
    if not condition: raise AssertionError(message)


def data_image(value):
    return Image.open(io.BytesIO(base64.b64decode(value.split(",")[-1]))).copy()


def canvas(page,id):
    return data_image(page.locator("#"+id).evaluate("el=>el.toDataURL()"))


def tile(photo,size=(220,240)):
    bg=Image.new("RGBA",size,"#e4e2d9")
    photo=photo.convert("RGBA");photo.thumbnail((size[0]-8,size[1]-8),Image.Resampling.LANCZOS)
    bg.alpha_composite(photo,((size[0]-photo.width)//2,(size[1]-photo.height)//2))
    return bg.convert("RGB")


def font(n):
    try: return ImageFont.truetype("C:/Windows/Fonts/msyh.ttc",n)
    except OSError: return ImageFont.load_default()


def upload(page,file,input_id="photo"):
    page.wait_for_selector("#"+input_id+":enabled")
    page.set_input_files("#"+input_id,file)
    page.wait_for_function("document.querySelector('#confirm:not(:disabled)') || document.querySelector('#error').textContent")
    assert not page.inner_text("#error"),page.inner_text("#error")


def check_garment_occlusion(fit,saved):
    # Compare actual browser canvas pixels wherever opaque fabric should hide the head.
    shirt=Image.open(ROOT/"assets/wardrobe/tryon/fitted/navy-shirt.webp").convert("RGBA")
    alpha=data_image(saved["assets"]["alpha"])
    hair=data_image(saved["assets"]["frontHair"])
    s,_,tx,_,_,ty=saved["mapping"]["layerToFittedTemplate"]
    observed=wrong=0
    for y in range(2,fit.height-2,3):
        for x in range(2,fit.width-2,3):
            u,v=round((x+50-tx)/s),round((y-ty)/s)
            if not (1<=u<alpha.width-1 and 1<=v<alpha.height-1): continue
            fabric=shirt.getpixel((x+50,y))
            # The authored WebP shirt uses ~253/255 even in its solid fabric.
            if fabric[3]<250 or alpha.getpixel((u,v))<245 or hair.getpixel((u,v))>3: continue
            observed+=1
            actual=fit.getpixel((x,y))
            if max(abs(c-d) for c,d in zip(actual[:3],fabric[:3]))>7: wrong+=1
    check(observed>30 and wrong/observed<.03,("garment occlusion",observed,wrong))
    return observed


def make(page,style):
    page.select_option("#cartoon-style",style)
    page.click("#cartoon-generate")
    page.wait_for_function("""()=>document.querySelector('#cartoon-error').textContent ||
      (document.querySelector('#cartoon-status').textContent.includes('生成完成') && !document.querySelector('#cartoon-save').disabled)""")
    assert not page.inner_text("#cartoon-error"),page.inner_text("#cartoon-error")
    assert page.locator("#cartoon-canvas").get_attribute("data-style")==style


def inspect_saved(page,pid):
    return page.evaluate("""async id=>{
      const s=await import('/src/people/store.mjs');
      const h=await s.getCartoon(id), a=await s.getAnalysis(id);
      const encoded=blob=>new Promise(done=>{const r=new FileReader();r.onload=()=>done(r.result);r.readAsDataURL(blob)});
      const assets={};
      for(const [key,blob] of Object.entries(h.assets)) assets[key]=await encoded(blob);
      return {...h,assets,faceSource:a.faceSourceId,hashMatches:h.sourceHash===await s.sourceHash(a[a.faceSourceId])};
    }""",pid)


def save(page):
    page.click("#cartoon-save")
    page.wait_for_selector("#preview[data-person-id]")
    return page.locator("#preview").get_attribute("data-person-id")


def ready_page(browser):
    page=browser.new_page(viewport={"width":1280,"height":920},device_scale_factor=2)
    page.set_default_timeout(100000)
    return page


def check_junction(saved, template):
    h=data_image(saved["assets"]["head"]).convert("RGBA")
    layout=saved["mapping"]["placements"][template]
    s,_,x,_,_,y=layout["layerToCanvas"]
    upper=Image.new("L",(560,360))
    upper.paste(h.getchannel("A").resize((round(h.width*s),round(h.height*s)),Image.Resampling.LANCZOS),(round(x),round(y)))
    neck=Image.new("L",upper.size)
    bridge=data_image(saved["assets"]["neckJoin" if template=="fitted" else "straightNeckJoin"])
    neck.paste(bridge.getchannel("A"),tuple(layout["neckJoinAt"]))
    hull=np.array(saved["landmarks"])*s+[x,y]
    cx=int(np.mean(hull[[172,397],0]));half=int(abs(hull[454,0]-hull[234,0])*.17)
    chin=round(hull[152,1])
    columns=slice(cx-half,cx+half+1)
    skin=np.asarray(upper);support=np.asarray(neck)
    overlap=((skin>210)&(support>210))[chin-50:chin+3,columns].sum(axis=0)
    assert overlap.min()>=2,("jaw overlap",template,overlap.min())
    neckline=280 if template=="fitted" else 304
    assert np.maximum(skin,support)[chin-8:neckline,columns].min()>180,("neck gap",template)
    return int(overlap.min())


def fitting_portrait(page,person):
    page.click("#body-preview");page.wait_for_selector("#mapped-label:visible")
    if page.locator("#body-confirm").is_enabled(): page.click("#body-confirm")
    page.click("#try-on")
    page.wait_for_selector(f'#avatar[data-profile="{person}"]:visible')
    page.wait_for_selector("#save-look-button:enabled")
    avatar=page.locator("#avatar")
    box=avatar.bounding_box()
    assert abs(box["width"]*1536/560-box["height"])<2,"displayed avatar stretches the face"
    with Image.open(io.BytesIO(avatar.screenshot(animations="disabled"))) as displayed:
        scale=displayed.width/560
        return displayed.crop(tuple(round(n*scale) for n in (50,0,510,480)))


def compare_previous(current):
    previous=Image.open(ROOT/"reports/cartoon/styles-and-fit-v1.jpg").convert("RGB")
    out=Image.new("RGB",(1080,790),"#f7f5ef")
    draw=ImageDraw.Draw(out)
    for col,title in enumerate(["原照片","原手绘","修正后手绘","原下巴与圆领","修正后下巴与圆领"]):
        draw.text((col*216+10,9),title,font=font(17),fill="#292c2b")
    for row in range(3):
        top=83+302*row
        for col,(sheet,source) in enumerate([(current,0),(previous,2),(current,2),(previous,4),(current,4)]):
            x=220*source
            box=(x,top,x+220,top+240) if col<3 else (x+44,top+12,x+176,top+160)
            crop=ImageOps.contain(sheet.crop(box),(216,242),Image.Resampling.LANCZOS)
            out.paste(crop,(216*col+(216-crop.width)//2,38+row*250))
    out.save(OUT/"head-neck-comparison.jpg",quality=96)


def verify_six(browser,url):
    page=ready_page(browser)
    errors=[]
    page.on("pageerror",lambda e:errors.append(str(e)))
    sheet=Image.new("RGB",(220*7,302*3+48),"#f7f5ef")
    draw=ImageDraw.Draw(sheet)
    for col,title in enumerate(["归正原照片","动漫头层","手绘头层","生成图校准点","浅色圆领","深色衬衫领","该人物实际试穿"]):
        draw.text((col*220+8,9),title,font=font(19),fill="#2e302a")
    records={}
    for row,(name,(label,_)) in enumerate(SAMPLES.items()):
        page.goto(url+"/create.html?module=cartoon")
        path=FIX/(name+".jpg")
        upload(page,path)
        person=None
        records[name]={}
        offset=row*302+48
        draw.text((8,offset),label,font=font(17),fill="#433c35")
        for col,style in enumerate(STYLES,1):
            started=time.monotonic()
            make(page,style)
            seconds=round(time.monotonic()-started,2)
            head=canvas(page,"cartoon-canvas")
            sheet.paste(tile(head),(col*220,offset+35))
            if style=="handdrawn":
                page.locator("#cartoon-points").check()
                page.wait_for_function("document.querySelector('#cartoon-canvas').dataset.overlay==='true'")
                overlay=canvas(page,"cartoon-canvas")
                check(overlay.tobytes()!=head.tobytes(),"overlay unchanged")
                sheet.paste(tile(overlay),(3*220,offset+35))
                for j,garment in enumerate(["white-sweatshirt","navy-shirt"],4):
                    page.select_option("#cartoon-garment",garment)
                    page.wait_for_function("g=>document.querySelector('#cartoon-fitting').dataset.garment===g",arg=garment)
                    fit=canvas(page,"cartoon-fitting")
                    sheet.paste(tile(fit),(j*220,offset+35))
                if name=="1239291":
                    page.locator("#cartoon-panel").screenshot(path=OUT/"workbench.png")
                    overlay.save(OUT/"generated-points.png")
            saved_id=save(page)
            if person: check(person==saved_id,"changed person id")
            person=saved_id
            page.reload()
            page.wait_for_selector(f'#preview[data-person-id="{person}"] img.photo')
            saved=inspect_saved(page,person)
            check(saved["style"]==style and saved["hashMatches"] and len(saved["landmarks"])==478,"saved contract")
            alpha=data_image(saved["assets"]["alpha"])
            parts=data_image(saved["assets"]["parts"])
            check(alpha.getextrema()==(0,255) and parts.histogram()[4]==0,"transparent layer or clothing exclusion failed")
            check(alpha.size==head.size,"source raster mismatch")
            records[name][style]={"sourceHash":saved["sourceHash"],"size":saved["size"],"faceSource":saved["faceSource"],
                "neckObservation":saved["neckObservation"],"landmarks":len(saved["landmarks"]),"hairClipped":saved["hairClipped"],
                "weights":saved["weights"],"calibration":saved["calibration"],"browserGenerationSeconds":seconds,
                "faceDeviation":saved["faceDeviation"],"minJawOverlapPx":{t:check_junction(saved,t) for t in ["fitted","straight"]}}
            if col==1:
                sx,_,tx,_,sy,ty=saved["mapping"]["layerToOriented"]
                w,h=head.size
                original=ImageOps.exif_transpose(Image.open(path)).crop((int(tx),int(ty),round(tx+w*sx),round(ty+h*sy)))
                sheet.paste(tile(original),(0,offset+35))
                page.click("#inspect")
                page.wait_for_selector('#cartoon-canvas[data-style="anime"]')
            else:
                person_fit=fitting_portrait(page,person)
                sheet.paste(tile(person_fit),(6*220,offset+35))
                page.goto(url+"/people.html?module=cartoon");page.wait_for_selector(f'#preview[data-person-id="{person}"]')
                if name=="1239291":
                    records[name][style]["occlusionPixelsChecked"]=check_garment_occlusion(fit,saved)
                    bundle=OUT/"example-v2";bundle.mkdir(exist_ok=True)
                    for key,asset in saved.pop("assets").items(): data_image(asset).save(bundle/(key+".png"))
                    (bundle/"head.json").write_text(json.dumps(saved,ensure_ascii=False,indent=2),encoding="utf-8")
    sheet.save(OUT/"styles-and-fit.jpg",quality=94)
    compare_previous(sheet)
    # Cancel regeneration of a saved person, then select another photo and leave.
    page.click("#inspect");page.wait_for_selector('#cartoon-canvas[data-style="handdrawn"]')
    page.select_option("#cartoon-style","anime");page.click("#cartoon-generate");page.click("#cartoon-stop")
    check("取消" in page.inner_text("#cartoon-status"),"task cancellation")
    page.click("#cartoon-generate")
    upload(page,FIX/"obama-a.jpg")
    check(page.locator("#cartoon-canvas").is_hidden(),"previous generation leaked into new draft")
    page.click("#cancel")
    page.wait_for_selector(f'#preview[data-person-id="{person}"]')
    check(inspect_saved(page,person)["style"]=="handdrawn","canceled draft replaced saved person")
    page.goto(url+"/create.html");upload(page,FIX/"full.png")
    check(page.is_disabled("#cartoon-generate"),"tiny face allowed without supplement")
    upload(page,FIX/"supplement.png","supplement")
    make(page,"handdrawn")
    saved=inspect_saved(page,save(page))
    check(saved["sourceId"]==saved["faceSource"]=="supplement","wrong face source")
    page.goto(url+"/create.html?person="+person);page.wait_for_selector('#cartoon-canvas[data-style="handdrawn"]')
    upload(page,FIX/"obama-a.jpg")
    page.click("#confirm");page.wait_for_selector(f'#preview[data-person-id="{person}"]')
    check(page.evaluate("async id=>!(await (await import('/src/people/store.mjs')).getCartoon(id))",person),"stale head survived replacement")
    assert not errors,errors
    page.close()
    return records


def retry_after_missing_weights(browser):
    with tempfile.TemporaryDirectory(dir=FIX) as temporary:
        proc=subprocess.Popen(["node","scripts/serve.mjs","0"],cwd=ROOT,stdout=subprocess.PIPE,text=True,
            env={**os.environ,"WEARMATE_CARTOON_MODEL_DIR":temporary})
        try:
            url=proc.stdout.readline().strip().split()[-1]
            page=ready_page(browser)
            analysis_calls=[]
            page.on("request",lambda r:analysis_calls.append(r.url) if r.url.endswith("/api/photo-analysis") else None)
            page.goto(url+"create.html" if url.endswith("/") else url+"/create.html")
            upload(page,FIX/"1239291.jpg")
            page.click("#cartoon-generate")
            page.wait_for_function("document.querySelector('#cartoon-error').textContent.includes('download_cartoon.py')")
            for model in (ROOT/"models/dct-net").glob("*.pb"): shutil.copyfile(model,Path(temporary)/model.name)
            # Simulate connection loss, after a real missing-weight failure, before restoring the same request.
            page.route("**/api/cartoon-head",lambda route:route.abort("connectionrefused"))
            page.click("#cartoon-generate")
            page.wait_for_function("document.querySelector('#cartoon-error').textContent.includes('启动二维工作台')")
            page.unroute("**/api/cartoon-head")
            make(page,"handdrawn");assert len(analysis_calls)==1
            page.close()
        finally:
            proc.terminate();proc.wait(timeout=15)


if __name__=="__main__":
    cli=argparse.ArgumentParser()
    cli.add_argument("--url",default="http://127.0.0.1:4375")
    cli.add_argument("--browser")
    args=cli.parse_args()
    OUT.mkdir(exist_ok=True,parents=True);FIX.mkdir(exist_ok=True)
    for name,(_,url) in SAMPLES.items():
        path=FIX/(name+".jpg")
        if not path.exists():
            with urlopen(url,timeout=45) as response: path.write_bytes(response.read())
    # Supplement regression uses the same packaged subject in both inputs.
    iris=Image.open(ROOT/"assets/stage1a/iris-reference.webp").convert("RGB")
    iris.save(FIX/"full.png")
    iris.crop((235,8,395,168)).resize((480,480),Image.Resampling.LANCZOS).save(FIX/"supplement.png")
    with sync_playwright() as pw:
        browser=pw.chromium.launch(executable_path=args.browser)
        result=verify_six(browser,args.url.rstrip("/"))
        retry_after_missing_weights(browser)
        browser.close()
    (OUT/"results.json").write_text(json.dumps({"portraits":result,"cancellation":True,"samePhotoRetry":True,
        "supplementSource":True,"staleResultRemoved":True},indent=2),encoding="utf-8")
    print("PASS six real generations, wardrobe overlays, supplement, cancellation, model recovery and storage")
