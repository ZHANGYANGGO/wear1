"""Run from the target project. See reports/migration/README.md for both passes."""
import argparse
import hashlib
import io
import json
from pathlib import Path
from urllib.parse import urlsplit

from PIL import Image
from playwright.sync_api import sync_playwright

cli = argparse.ArgumentParser()
cli.add_argument("variant", choices=["baseline", "target"])
cli.add_argument("--url", required=True)
cli.add_argument("--source", type=Path, default=Path("."))
cli.add_argument("--portraits", type=Path)
cli.add_argument("--browser")
cli.add_argument("--output",type=Path,default=Path("reports/migration"))
args = cli.parse_args()
out = args.output
out.mkdir(parents=True, exist_ok=True)
url = args.url.rstrip("/")


def digest(data):
    return hashlib.sha256(data).hexdigest()


def common(p, record):
    def goto(path):
        p.goto(url + path)

    def ready():
        p.locator("#save-look-button:enabled").wait_for()

    def wearing():
        return sorted(set(p.locator("#avatar [data-wearable]:visible").evaluate_all(
            "(nodes) => nodes.map(n => n.dataset.wearable)")))

    def wear(slot, item):
        p.click("#tab-" + slot)
        p.click('[data-garment="' + item + '"]:enabled')
        assert item in wearing()

    def figure(key):
        p.wait_for_timeout(200)
        # Compare the rendered, visible sprite stack in template pixels. The DOM
        # screenshot also includes the backdrop and the page's current scroll offset.
        raster = p.locator("#avatar").evaluate("""async host => {
          const canvas = document.createElement('canvas'); canvas.width=560; canvas.height=1536;
          const ctx = canvas.getContext('2d');
          for(const img of host.querySelectorAll('img:not([hidden])')) {
            await img.decode();
            const style=getComputedStyle(img);
            const t = new DOMMatrix(style.transform==='none' ? '' : style.transform);
            const [ox,oy] = style.transformOrigin.split(' ').map(parseFloat);
            const sx=560/img.clientWidth, sy=1536/img.clientHeight;
            ctx.save();ctx.translate(ox*sx,oy*sy);ctx.transform(t.a,t.b,t.c,t.d,t.e*sx,t.f*sy);
            ctx.translate(-ox*sx,-oy*sy);ctx.drawImage(img,0,0,560,1536);ctx.restore();
          }
          const bytes=ctx.getImageData(0,0,560,1536).data;
          return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),
            b=>b.toString(16).padStart(2,'0')).join('');
        }""")
        data = p.locator("#avatar").screenshot()
        record["figures"][key] = raster
        if key in ("default", "dress-coat"):
            (out / (args.variant + "-" + key + ".png")).write_bytes(data)

    goto("/"); ready()
    p.reload(); ready()
    assert p.get_attribute("#avatar", "data-profile") == "woman-bob"
    figure("default")
    inventory = p.evaluate("""async () => {
      const {localRegistration} = await import('/src/create/profiles.mjs');
      const {cases} = await import('/src/stage1a/cases.mjs');
      const {garmentCatalog} = await import('/src/wardrobe/garments.mjs');
      const {getFitInfo} = await import('/src/wardrobe/tryon-assets.mjs');
      const {garments} = await import('/src/wardrobe/catalog.mjs');
      const {categories} = await import('/src/wardrobe/model.mjs');
      const fit = Object.fromEntries(localRegistration.map(({id}) => [id,Object.fromEntries(garmentCatalog.map(g=>{
        const f=getFitInfo(g.id,id);return [g.id,[f.status,...(f.parts??[]).map(p=>[p.id,p.layer,new URL(p.image).pathname])]];
      }))]));
      return {roles:['mila',...cases.map(c=>c.id),...localRegistration.map(r=>r.id)],fit,
        categories:Object.keys(categories),base:garments.map(g=>g.id),catalog:garmentCatalog.map(g=>g.id),
        slots:Object.fromEntries(garmentCatalog.map(g=>[g.id,g.category])),
        originals:garmentCatalog.map(g=>[g.originalImage,g.sha256]),references:localRegistration.map(r=>[r.id,r.digest])};
    }""")
    for name, expected in inventory["originals"]:
        response = p.request.get(url + name[1:])
        assert response.ok and digest(response.body()) == expected
    record["inventory"] = inventory
    record["assets"] = {str(f.relative_to(args.source)).replace(chr(92), "/"): digest(f.read_bytes())
                        for f in sorted((args.source / "assets").rglob("*")) if f.is_file()}
    goto("/wardrobe.html")
    p.locator("[data-garment-id]").first.wait_for()
    assert p.locator("[data-garment-id]").count() == 9
    p.click('[data-garment-id="navy-shirt"]')
    p.wait_for_function("document.querySelector('#original-image').naturalWidth>0")
    p.click("#try-on-item"); ready()
    assert "navy-shirt" in wearing()
    for slot, item in [("top","purple-graphic-tee"), ("bottom","light-blue-jeans"),
                       ("shoes","ivory-mary-janes"), ("outerwear","white-puffer")]:
        wear(slot, item)
    figure("separates-coat")
    wear("dress","floral-maxi")
    assert wearing() == sorted(["floral-maxi","ivory-mary-janes","white-puffer"])
    figure("dress-coat")
    p.fill("#look-title","验收搭配"); p.click("#save-look-button")
    p.click("#tab-outerwear"); p.get_by_role("button",name="脱下外套").click()
    p.click("#tab-dress"); p.get_by_role("button",name="切回上衣与裤子").click()
    assert set(wearing()) == {"light-blue-jeans","purple-graphic-tee","ivory-mary-janes"}
    p.reload(); ready(); p.click("#saved-looks summary"); p.click(".saved-look-load")
    assert set(wearing()) == {"white-puffer","floral-maxi","ivory-mary-janes"}
    p.click('[data-outfit="casual"]'); figure("restored")
    assert record["figures"]["restored"] == record["figures"]["default"]
    goto("/wardrobe.html"); p.click('[data-garment-id="navy-shirt"]')
    p.fill("#field-name","深蓝验收"); p.click("#save-item"); p.fill("#closet-search","深蓝验收")
    assert p.locator("[data-garment-id]:visible").count() == 1
    p.click('[data-garment-id="navy-shirt"]'); p.click("#remove-item"); p.click("#confirm-remove")
    p.fill("#closet-search","")
    p.wait_for_function("document.querySelectorAll('[data-garment-id]').length===8")
    p.click("#open-add")
    p.set_input_files("#garment-photo", args.source / ".local-wardrobe-references" / Path(inventory["originals"][0][0]).name)
    p.click("#save-item")
    p.wait_for_function("document.querySelectorAll('[data-garment-id]').length===9")
    goto("/?view=today")
    p.wait_for_function("document.querySelector('#weather-mode').options.length>1")
    p.wait_for_function("!document.querySelector('#weather-summary').hidden || document.querySelector('#weather-status').textContent.includes('失败')", timeout=16000)
    record["liveWeather"] = (p.inner_text("#weather-status") or p.inner_text("#weather-source")).strip()
    record["weatherLooks"] = {}
    for mode in ["mild","hot","rain","cold"]:
        p.select_option("#weather-mode",mode)
        cards = p.locator(".plan-card")
        assert cards.count() == 2
        looks = []
        for card in cards.all():
            ids = card.locator("img").evaluate_all("(a)=>a.map(i=>new URL(i.src).pathname.split('/').pop().replace('.webp','')).sort()")
            card.locator("button").click()
            assert wearing() == ids
            looks.append(ids)
        record["weatherLooks"][mode] = looks
    goto("/stage1a.html")
    for role in ["iris","mila","nia"]:
        p.select_option("#role-select",role)
        p.wait_for_function("r=>document.querySelector('#avatar-name').textContent.toLowerCase().includes(r)",arg=role)
        p.click('[data-outfit="commute"]'); p.select_option("#lab-top","brick-tee")
        assert p.locator("#lab-avatar [data-wearable]:visible").count() == 3
    if args.portraits:
        files = {digest(f.read_bytes()): f for f in args.portraits.rglob("*") if f.is_file()}
        record["wornByRole"] = {}
        for role, expected in inventory["references"]:
            if args.variant == "baseline":
                goto("/create.html"); p.set_input_files("#photo",files[expected])
                p.fill("#height","170"); p.fill("#weight","65"); p.click("#generate"); p.click("#confirm")
            else:
                goto("/people.html")
                p.select_option("#person-select",role);p.wait_for_selector(f'#preview[data-person-id="{role}"]')
                p.click("#try-on")
            ready()
            assert p.get_attribute("#avatar","data-profile") == role
            goto("/wardrobe.html")
            p.wait_for_selector("#closet-empty:visible, #closet-library:visible")
            if p.locator("#import-samples").is_visible():
                p.click("#import-samples")
            goto("/"); ready()
            p.evaluate("window.originalHead=document.querySelector('#avatar [data-layer=head]')")
            record["wornByRole"][role] = []
            for item, fit in inventory["fit"][role].items():
                if fit[0] == "ready":
                    wear(inventory["slots"][item],item)
                    record["wornByRole"][role].append(item)
            assert p.evaluate("window.originalHead===document.querySelector('#avatar [data-layer=head]')")
        if args.variant == "baseline": record["sourcePhotosMatched"] = 4


def new_people(p, record):
    p.set_default_timeout(90000)
    def choose(person):
        p.select_option("#person-select", person)
        p.wait_for_function("id=>document.querySelector('#preview').dataset.personId===id",arg=person)

    def module(key):
        p.goto(url + "/people.html?module=" + key)
        p.wait_for_selector("#preview[data-person-id]")

    def pid():
        return p.get_attribute("#preview","data-person-id")

    def upload(name, source, size):
        image = Image.open(Path("assets/stage1a") / source).convert("RGB")
        image = image.crop((int(image.width*.34),0,int(image.width*.66),int(image.height*.22)))
        image.thumbnail(size)
        sheet = Image.new("RGB",size,"#e6e1d5")
        sheet.paste(image,((size[0]-image.width)//2,(size[1]-image.height)//2))
        buf = io.BytesIO(); sheet.save(buf,format="PNG")
        return {"name":name+".png","mimeType":"image/png","buffer":buf.getvalue()}

    module("library")
    for opt in p.locator("#person-select option").all():
        choose(opt.get_attribute("value")); assert p.locator("#preview [data-wearable]:visible").count()==3
    choose("iris"); p.click("#try-on"); p.wait_for_selector('#avatar[data-profile="iris"]')
    module("library")
    a = upload("纵向", "nia-reference.webp",(260,500))
    b = upload("横向", "iris-reference.webp",(600,300))
    def add(file):
        p.click("#new-photo");p.wait_for_selector("#photo:enabled");p.set_input_files("#photo",file)
        p.wait_for_function("!document.querySelector('#confirm').disabled || document.querySelector('#error').textContent")
        assert not p.inner_text("#error"),p.inner_text("#error")
        p.click("#confirm")
        p.wait_for_function("name=>document.querySelector('#person-name').textContent===name",arg=file["name"][:-4])
        return pid()
    a_id = add(a); b_id = add(b); assert a_id != b_id
    assert p.locator("#preview img").evaluate("i=>[i.naturalWidth,i.naturalHeight,getComputedStyle(i).objectFit]")==[600,300,"contain"]
    p.click("#new-photo");p.locator("#photo").dispatch_event("cancel")
    p.set_input_files("#photo",{"name":"bad.png","mimeType":"image/png","buffer":b"bad"})
    p.wait_for_function("document.querySelector('#error').textContent.length>0")
    p.click("#cancel");p.wait_for_selector("#preview[data-person-id]");assert pid()==b_id
    choose(a_id); choose(b_id)
    add(a)
    choose(b_id); p.reload(); p.wait_for_selector("#preview[data-person-id]"); assert pid()==b_id
    for key, target in [("beauty","woman-bob"),("makeup",b_id),("cartoon",a_id),("body","iris")]:
        module(key); choose(target)
    for key, target in [("body","iris"),("makeup",b_id),("cartoon",a_id),("beauty","woman-bob")]:
        module(key); assert pid()==target
    # Exercise the future result contract independently of visual effects.
    isolated = p.evaluate("""async ([a,b])=>{
      const s=await import('/src/people/store.mjs');
      await s.saveResult(b,'makeup',{testValue:37});
      return (await s.getResult(b,'makeup')).parameters.testValue===37 &&
        !(await s.getResult(a,'makeup')) && !(await s.getResult(b,'beauty'));
    }""",[a_id,b_id])
    assert isolated
    p.click('#modules a[href$="module=makeup"]')
    p.wait_for_selector("#preview[data-person-id]")
    assert pid()==b_id
    # Use a resized copy of B to verify the saved-image contract, without
    # presenting this fixture as a makeup algorithm.
    p.evaluate("""async id=>{
      const s=await import('/src/people/store.mjs');
      const image=await createImageBitmap(await s.getImage(id));
      const c=document.createElement('canvas');c.width=240;c.height=120;
      c.getContext('2d').drawImage(image,0,0,240,120);image.close();
      await s.saveResult(id,'makeup',{fixture:'resized'},await new Promise(done=>c.toBlob(done,'image/png')));
    }""", b_id)
    p.reload();p.wait_for_selector("#preview .photo");assert p.locator("#preview img").evaluate("i=>i.naturalWidth")==240
    choose(a_id);choose(b_id)
    assert p.locator("#preview img").evaluate("i=>i.naturalWidth")==240
    p.click('#modules a[href="./people.html"]');p.wait_for_selector("#preview .photo")
    assert pid()==b_id and p.locator("#preview img").evaluate("i=>i.naturalWidth")==600
    p.goto(url + "/create.html");p.wait_for_selector("#photo:enabled");p.set_input_files("#photo",b);p.fill("#height","168");p.fill("#weight","60")
    p.click("#confirm");p.wait_for_selector("#preview[data-person-id]")
    new_id=pid();assert new_id.startswith("photo-") and new_id!=b_id
    p.set_viewport_size({"width":390,"height":844})
    assert p.evaluate("document.documentElement.scrollWidth <= innerWidth")
    p.screenshot(path=out/"people-mobile.png",full_page=True)
    p.set_viewport_size({"width":1280,"height":850});choose("woman-bob")
    p.screenshot(path=out/"people.png")
    record["people"] = {"builtinsRendered":7,"independentModules":4,"photoRecovery":True,"resultIsolation":isolated,"mobileWidth":390}


with sync_playwright() as pw:
    browser = pw.chromium.launch(executable_path=args.browser)
    context = browser.new_context(viewport={"width":1280,"height":850}, reduced_motion="reduce")
    page = context.new_page()
    page.set_default_timeout(6500)
    local_errors, external = [], []
    page.on("pageerror",lambda e: local_errors.append(str(e)))
    def response(r):
        if r.status == 422 and r.url == url + "/api/photo-analysis": return
        if r.status >= 400:
            (local_errors if r.url.startswith(url+"/") else external).append([r.status,r.url])
    page.on("response",response)
    foreign=set()
    page.on("request",lambda req: foreign.add(urlsplit(req.url).netloc)
            if urlsplit(req.url).hostname in ("127.0.0.1","localhost") and not req.url.startswith(url+"/") else None)
    record = {"browser":browser.version, "figures":{}}
    common(page, record)
    if args.variant == "target": new_people(page, record)
    assert not local_errors and not foreign,(local_errors,foreign)
    record.update(localErrors=local_errors,externalHttpErrors=external,otherLocalOrigins=sorted(foreign))
    browser.close()
report = out / (args.variant + ".json")
report.write_text(json.dumps(record,ensure_ascii=False,indent=2),encoding="utf8")
if args.variant=="target":
    baseline = out/"baseline.json"
    if not baseline.exists(): baseline = Path("reports/migration/baseline.json")
    before=json.loads(baseline.read_text(encoding="utf8"))
    for key in ["assets","inventory","figures","weatherLooks"] + (["wornByRole"] if args.portraits else []):
        assert record[key]==before[key],key
print("PASS", report, flush=True)
