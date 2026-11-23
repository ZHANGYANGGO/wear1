"""Export two base layers and fit existing Woman-Bob wardrobe artwork.

Fit curves are authored in the renderer's 560×1536 canvas. Each row describes
destination y, source y and two destination edge positions (four for trousers).
The white master and wardrobe display thumbnails are read-only inputs.
"""
import argparse
from importlib import import_module
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter

SIZE = (560,1536)

TOP_PINS = {
    "purple-graphic-tee": [
        [.354,.009,234,288], [.375,.055,239,307], [.439,.10,259,322],
        [.5,.111,279,324], [.5,.15,279,335], [.238,.053,186,302],
        [.141,.075,145,313], [.083,.151,124,339], [.047,.235,117,359],
        [.145,.269,157,366], [.006,.430,105,404], [.080,.462,128,414],
        [.191,.485,166,426], [.195,.503,167,434], [.215,.59,168,464],
        [.232,.701,173,503], [.237,.79,177,541], [.203,.902,164,584],
        [.181,.985,153,620], [.5,.991,279,630],
        [.286,.331,208,383], [.5,.323,279,378], [.30,.499,213,447],
        [.5,.495,279,439], [.5,.71,279,500],
    ],
    "navy-shirt": [
        [.5,.002,278,272], [.381,.009,237,277], [.366,.035,232,289],
        [.319,.075,216,292], [.376,.07,237,299], [.409,.12,248,324],
        [.316,.201,211,354], [.5,.22,278,353], [.5,.264,278,370],
        [.208,.111,174,304], [.117,.138,143,314], [.080,.181,127,331],
        [.059,.231,120,353], [.018,.375,109,400], [.003,.432,104,416],
        [.085,.470,130,426], [.201,.48,167,435], [.205,.506,169,443],
        [.225,.583,174,477], [.246,.702,179,529], [.209,.801,173,565],
        [.173,.907,157,608], [.215,.958,172,618], [.5,.998,278,633],
        [.287,.331,203,396], [.5,.397,278,421], [.322,.50,214,462],
        [.5,.55,278,475], [.5,.71,278,527],
    ],
}
# Source u/v, followed by destination x/y. Inner and outer sleeve points
# preserve each cuff and keep the neck, placket and hem coherent.
DRESS = [
    [.228,.012,145,315], [.276,.009,175,308], [.356,.005,212,297],
    [.370,.015,214,315], [.380,.030,218,332], [.391,.037,226,341],
    [.430,.044,246,348], [.50,.046,279,355],
    [.191,.040,122,337], [.161,.086,109,374], [.18,.115,113,395],
    [.211,.120,129,401], [.291,.128,165,414], [.303,.107,169,390],
    [.309,.120,168,407], [.312,.129,168,422], [.317,.140,169,441],
    [.327,.160,172,468], [.338,.180,176,508],
    [.374,.082,195,389], [.50,.081,279,378], [.385,.153,200,471],
    [.50,.147,279,452], [.349,.211,179,550], [.411,.215,221,562], [.50,.216,279,571],
    [.328,.240,161,606], [.299,.270,145,653], [.273,.302,133,699],
    [.245,.342,128,749], [.193,.458,122,860],
    [.116,.640,91,1060], [.061,.80,66,1233], [.004,.944,53,1387],
    [.081,.971,88,1398], [.22,.981,157,1412], [.50,.991,280,1417],
]
# Separate pattern pieces keep moving the cuff from pulling on the hip.
# All source locations are fractions of the original garment illustration.
COAT_BODICE = [
    [.50,.000,277,260], [.349,.022,230,264], [.50,.056,277,288],
    [.332,.068,226,282], [.319,.108,216,292], [.50,.156,277,322],
    [.242,.151,184,309], [.231,.229,171,351], [.244,.297,164,386],
    [.265,.380,160,432], [.387,.378,215,427], [.50,.377,277,434],
    [.265,.466,156,483], [.281,.509,155,508], [.50,.507,277,519],
    [.252,.569,147,544], [.211,.676,141,591], [.50,.664,277,601],
    [.182,.796,133,650], [.50,.808,277,668], [.172,.893,131,682],
    [.178,.941,136,701], [.203,.967,146,708], [.287,.989,170,715],
    [.403,.994,222,722], [.50,.997,277,724],
]
COAT_SLEEVE = [
    [.319,.106,216,291], [.219,.148,154,308], [.178,.182,128,323],
    [.152,.229,110,351], [.246,.290,159,395], [.130,.268,105,377],
    [.265,.374,157,437], [.102,.397,94,446], [.082,.438,90,474],
    [.259,.480,160,498], [.068,.490,84,504], [.062,.550,77,544],
    [.247,.545,149,547], [.229,.577,145,568], [.054,.583,67,574],
    [.219,.632,141,600], [.039,.637,58,602], [.028,.688,52,624],
    [.198,.709,122,640], [.012,.754,40,664], [.181,.772,109,675],
    [.003,.819,30,689], [.179,.849,96,707], [.015,.881,30,716],
    [.163,.892,85,726], [.027,.906,36,724], [.149,.917,78,738],
    [.030,.925,36,735], [.087,.930,54,745], [.142,.931,74,747],
]
PANTS = {
    "light-blue-jeans": [
        [596,535,166,390,280,280], [615,551,157,399,280,280],
        [668,615,136,422,280,280], [742,725,123,435,279,280],
        [782,778,127,430,274,281], [830,835,134,422,270,283],
        [942,953,147,408,260,291], [1055,1080,151,406,257,292],
        [1170,1200,150,404,250,300], [1315,1358,152,402,245,311],
        [1386,1444,154,400,244,311], [1393,1458,154,400,244,311],
    ],
    "black-trousers": [
        [593,541,170,391,280,280], [620,567,155,400,280,280],
        [698,688,134,424,280,280], [755,758,125,431,278,282],
        [800,799,129,431,273,285], [912,902,142,416,263,290],
        [1048,1060,147,410,257,292], [1170,1180,149,410,250,299],
        [1318,1360,149,409,248,311], [1383,1442,149,409,248,312],
        [1392,1467,149,409,248,312],
    ],
    "gray-joggers": [
        [597,542,166,392,280,280], [627,581,157,399,280,280],
        [710,695,134,426,280,280], [786,787,127,432,279,282],
        [840,834,128,431,270,287], [960,960,138,420,261,290],
        [1106,1100,143,413,256,295], [1240,1240,142,416,253,301],
        [1345,1380,148,409,249,311], [1388,1439,155,400,245,314],
        [1401,1458,155,399,245,314],
    ],
}


def load(folder,name):
    return Image.open(folder/(name+".webp")).convert("RGBA")


def save(folder,name,image):
    image.save(folder/(name+".webp"),"WEBP",lossless=True,method=4)


def master_layers(root,target):
    rgb=np.asarray(Image.open(root/"artwork/woman-bob/standard-base-white.png").convert("RGB")).astype(float)
    # Subtract the near-neutral backdrop according to its measured brightness.
    # Solid subject pixels, including all facial features, remain unchanged.
    baseline=np.median(np.concatenate((rgb[:,:45],rgb[:,-45:]),axis=1),axis=1)[:,None,:]
    d=np.max(baseline-rgb,axis=2)
    alpha=np.clip((d-9)/44,0,1)
    alpha[alpha>.92]=1
    edge=(alpha>0)&(alpha<1)
    rgb[edge]=np.clip((rgb[edge]-255*(1-alpha[edge,None]))/alpha[edge,None],0,255)
    keyed=Image.fromarray(np.rint(np.dstack((rgb,alpha*255))).astype("uint8"))
    aligned=Image.new("RGBA",SIZE)
    aligned.paste(keyed.resize((983,1475),Image.Resampling.LANCZOS),(-212,35))
    arr=np.asarray(aligned).copy()
    arr[arr[:,:,3]<12,3]=0
    # Keep hair and head as a separate layer above rear collars.
    head=arr.copy()
    head[287:,:,3]=0
    arr[:277,:,3]=0
    save(target,"head",Image.fromarray(head))
    save(target,"body",Image.fromarray(arr))


def resample(line,positions):
    rgba=line.astype(float)
    rgba[:,:3]*=rgba[:,3:4]/255
    x=np.arange(SIZE[0])
    mix=np.stack([np.interp(positions,x,c,left=0,right=0) for c in rgba.T],axis=1)
    np.divide(mix[:,:3]*255,mix[:,3:4],where=mix[:,3:4]>0,out=mix[:,:3])
    return np.rint(mix).clip(0,255).astype("uint8")


def fitted(img,controls,reference=None):
    arr=np.asarray(img)
    guide=arr if reference is None else np.asarray(reference)
    result=np.zeros_like(arr)
    rows=np.array(controls,float)
    width=SIZE[0]
    x=np.arange(width)
    for y in range(int(rows[0,0]),int(rows[-1,0])+1):
        sy,l,r,*seam=[np.interp(y,rows[:,0],c) for c in rows[:,1:].T]
        a=int(sy)
        solid=np.flatnonzero(guide[a,:,3]>70)
        if len(solid)<6: continue
        low,high=solid[0],solid[-1]
        position=[l,r]
        source=[low,high]
        # Fit both legs independently below the crotch.
        if seam:
            gaps=np.flatnonzero(np.diff(solid)>5)
            central=[i for i in gaps if 182<solid[i]<307 and 254<solid[i+1]<347]
            if central and seam[1]>seam[0]+2:
                gap=max(central,key=lambda i:solid[i+1]-solid[i])
                position=[l,*seam,r]
                source=[low,solid[gap],solid[gap+1],high]
        # Same width calibration at x=0 and x=559 keeps off-art samples transparent.
        start=source[0]-position[0]
        end=source[-1]+width-1-position[-1]
        px=np.interp(x,[0,*position,width-1],[start,*source,end])
        # Sample the two nearby rows with premultiplied colors.
        line=arr[a]*(1-(sy-a))+arr[min(a+1,SIZE[1]-1)]*(sy-a)
        result[y]=resample(line,px)
    return Image.fromarray(result)


def cover_pants(source, name):
    cloth = np.asarray(fitted(load(source,name), PANTS[name])).copy()
    # Discard the isolated scan-line connecting the jeans cuffs in the source.
    cloth[1350:,251:305,3] = 0
    return Image.fromarray(cloth)


def full_pins(points):
    profile = []
    for u, v, x, y in points:
        profile.append((u, v, x, y))
        if u != .5:
            profile.append((1-u, v, 559-x, y))
    return profile


def garment_volume(image, kind):
    """Use broad, soft cloth shadows for wrap and contact at existing seams."""
    arr = np.asarray(image).astype(float)
    y, x = np.mgrid[:SIZE[1], :SIZE[0]]
    def bell(xc, yc, wx, wy):
        return np.exp(-((x-xc)/wx)**2 - ((y-yc)/wy)**2)

    # Fabric turns away at the rib cage and breaks into folds below it.
    # One field in body coordinates lights both the print and its fabric.
    side = bell(173,446,33,99) + bell(382,447,32,102)
    bust = bell(231,411,49,43) + .82*bell(326,417,43,39)
    under = bell(229,464,42,27) + bell(329,467,40,30)
    waist = bell(192,528,23,63) + bell(360,531,24,61)
    amount = -.13*side + .058*bust - .072*under - .055*waist
    if kind == "dress":
        amount += -.085*(bell(106,1050,68,380)+bell(446,1080,67,400))
        amount += .024*bell(263,918,96,355)
    if kind == "coat":
        wrap = bell(151,530,39,195) + bell(409,530,39,195)
        sleeves = bell(95,650,23,104) + bell(465,650,23,104)
        lift = bell(279,433,95,128)
        amount = .48*amount - .116*wrap - .065*sleeves + .035*lift
    arr[:,:,:3] *= 1+amount[:,:,None]
    return Image.fromarray(np.rint(arr).clip(0,255).astype("uint8"))


def source_art(root, name):
    return Image.open(root/"artwork/woman-bob"/(name+".png")).convert("RGBA")


def cuff_contact(image, body, ymin, ymax, outer):
    """A soft contact edge on the exposed wrist/arm, clipped to the real skin silhouette."""
    alpha=image.getchannel("A")
    offset=Image.new("L",SIZE)
    offset.paste(alpha,(0,3))
    blur=np.asarray(offset.filter(ImageFilter.GaussianBlur(2.2)),float)/255
    y,x=np.ogrid[:SIZE[1],:SIZE[0]]
    region=(y>=ymin)&(y<=ymax)&((x<outer)|(x>SIZE[0]-outer))
    skin=np.asarray(body.getchannel("A"),float)/255
    contact=Image.new("RGBA",SIZE,(99,62,44,0))
    contact.putalpha(Image.fromarray(np.rint(55*blur*skin*region).astype('uint8')))
    contact.alpha_composite(image)
    return contact


def finish_upper(image, dest, kind, cuff, neck):
    """Seat the front opening on the neck and the cuff on the upper arm."""
    body=load(dest,"body")
    cloth=garment_volume(image,kind)
    result=cuff_contact(cloth,body,*cuff)
    skin=np.maximum(np.asarray(body.getchannel("A")),
                    np.asarray(load(dest,"head").getchannel("A")))/255
    y,x=np.ogrid[:SIZE[1],:SIZE[0]]
    low,high=neck
    near_neck=np.exp(-((x-278)/75)**6)*((y>=low)&(y<high))
    rim=np.asarray(cloth.getchannel("A").filter(ImageFilter.GaussianBlur(3)),float)/255
    shadow=Image.new("RGBA",SIZE,(104,65,49,0))
    shadow.putalpha(Image.fromarray(np.rint(74*rim*skin*near_neck).astype('uint8')))
    shadow.alpha_composite(result)
    return shadow


def make_top(root, dest, name):
    tools=import_module("prepare-woman-bob")
    drawing=source_art(root,name)
    pins=full_pins(TOP_PINS[name])
    if name=="purple-graphic-tee":
        # The drawing's right side seam is farther in than its left.
        # Register its actual edge rather than mirroring empty margin.
        right_seam={.485:.806,.503:.794,.59:.772,.701:.749,
                    .79:.746,.902:.772,.985:.799}
        pins=[(right_seam.get(v,u) if u>.7 else u,v,x,y) for u,v,x,y in pins]
    region=(250,657)
    if name=="navy-shirt":
        opening=[(.372,-.01),(.629,-.01),(.629,.028),(.620,.073),
                 (.596,.115),(.50,.216),(.404,.115),(.380,.073),(.372,.028)]
        drawing,back=tools.split_collar(drawing,opening)
        save(dest,"navy-shirt-back",tools.warp(back,pins,region))
    cloth=tools.warp(drawing,pins,region)
    save(dest,name,finish_upper(cloth,dest,name,(391,455,171),(273,358)))


def make_dress(root, dest):
    warp = import_module("prepare-woman-bob").warp
    drawing = source_art(root,"floral-maxi")
    # Reduce the hard painted thread only along the traced joining seam.
    # Keep the neighbouring print and vertical princess seams intact.
    y,x=np.ogrid[:drawing.height,:drawing.width]
    thread=np.interp(x,[250,272,293,321,382,408,432,459],[316,318,321,322,322,321,319,315])
    weight=.62*np.exp(-((y-thread)/2.2)**2)*((x>251)&(x<457))
    seam=Image.fromarray(np.rint(255*weight).astype('uint8'))
    drawing=Image.composite(drawing.filter(ImageFilter.GaussianBlur(2)),drawing,seam)
    # The front piping turns into the light at the bottom of the square neck.
    # Soften the dark inner stitching here; retain the bound edge at the straps.
    cloth=np.array(drawing)
    for col in range(284,424):
        first=np.flatnonzero(cloth[:81,col,3]>225)[0]
        band=cloth[first+2:first+10,col,:3].astype(float)
        fabric=cloth[first+11:first+14,col,:3].mean(axis=0)
        strength=.50*np.sin(np.pi*(col-284)/140)
        blend=np.array([.12,.24,.45,.8,1,.85,.56,.21])[:,None]*strength
        cloth[first+2:first+10,col,:3]=np.rint(band+blend*np.maximum(0,fabric-band))
    drawing=Image.fromarray(cloth)
    dress = warp(drawing,full_pins(DRESS),(269,1461))
    save(dest,"floral-maxi",finish_upper(dress,dest,"dress",(387,430,171),(293,358)))


def make_coat(root, dest):
    warp = import_module("prepare-woman-bob").warp
    drawing = source_art(root,"white-puffer")
    v,u = np.mgrid[:drawing.height,:drawing.width]
    v = v / (drawing.height-1)
    u = u / (drawing.width-1)
    # Trace the raglan seam, then the sleeve's inside edge. A small
    # underlap at the armhole continues the actual quilt underneath.
    curve = np.array([(0,.332),(.106,.319),(.15,.277),(.23,.249),
                      (.29,.241),(.365,.252),(.40,.265),(.49,.265),
                      (.53,.256),(.58,.235),(.64,.220),(.70,.201),
                      (.79,.182),(.85,.175),(.91,.165),(.94,.161),(1,.161)])
    seam = np.interp(v,curve[:,0],curve[:,1])
    collar_x = (u-.50)/.153
    rim = .0185 + .032*np.sqrt(np.maximum(0,1-collar_x**2))
    inside = (np.abs(collar_x)<1) & (v<rim)
    def panel(mask):
        rgba=np.asarray(drawing).copy()
        rgba[:,:,3] = np.rint(rgba[:,:,3] * np.clip(mask,0,1)).astype('uint8')
        return Image.fromarray(rgba)

    # Mirror the pattern about the neck. At the wrists the body's actual
    # centre is slightly left of the canvas centre.
    def mirrored(pin):
        u0,v0,x0,y0=pin
        axis=np.interp(y0,[295,745],[277,275.5])
        return (1-u0,v0,2*axis-x0,y0)
    centre_pins = COAT_BODICE + [mirrored(p) for p in COAT_BODICE if p[0]!=.5]
    region=(245,764)
    back=warp(panel(inside),centre_pins,region)
    bodice_mask=np.clip((np.minimum(u,1-u)-seam)*drawing.width+1,0,1)
    front=warp(panel(bodice_mask*(~inside)), centre_pins, region)
    overlap=np.interp(v,[.10,.14,.23,.39,.47,.56],[.008,.039,.036,.025,.010,.002])
    sleeve_edge=(seam+overlap-u)*drawing.width
    sleeve_mask=np.clip((v-.103)*drawing.height,0,1)
    left=warp(panel(sleeve_edge.clip(0,1)*sleeve_mask),COAT_SLEEVE,region)
    right=warp(panel(((seam+overlap-(1-u))*drawing.width).clip(0,1)*sleeve_mask),
               [mirrored(p) for p in COAT_SLEEVE],region)
    left.alpha_composite(right)
    left.alpha_composite(front)
    save(dest,"white-puffer-back",back)
    coat=finish_upper(left,dest,"coat",(713,765,95),(258,290))
    # Only cast the hem shadow onto the covered hip area. This excludes
    # the free space between the sleeves and the skirt/trousers.
    yy,xx=np.ogrid[:SIZE[1],:SIZE[0]]
    body=np.asarray(load(dest,"body").getchannel("A"),float)/255
    torso=(xx>129)&(xx<425)&(yy>670)&(yy<765)
    hem=front.getchannel("A")
    offset=Image.new("L",SIZE)
    offset.paste(hem,(1,7))
    spread=np.asarray(offset.filter(ImageFilter.GaussianBlur(5)),float)/255
    ambient=Image.new("RGBA",SIZE,(75,57,56,0))
    ambient.putalpha(Image.fromarray(np.rint(103*spread*body*torso).astype('uint8')))
    ambient.alpha_composite(coat)
    save(dest,"white-puffer",ambient)


def skirt_inside_coat(dest):
    """Ease the skirt out of a closed coat while keeping the original train."""
    dress=load(dest,"floral-maxi")
    body=np.asarray(load(dest,"body").getchannel("A"))
    cloth=np.asarray(dress.getchannel("A"))
    # Keep the skirt outside the opaque base shorts on each side. Near the
    # hip the fabric has little free space; below it the folds open out.
    guides=[]
    for y in range(650,941,5):
        left,right=np.flatnonzero(cloth[y]>170)[[0,-1]]
        hip=np.flatnonzero(body[y,128:430]>190)+128
        squeeze=np.interp(y,[650,700,758,830,940],[13,12,8,3,0])
        inset_l=min(squeeze,max(0,hip[0]-left-2))
        inset_r=min(squeeze,max(0,right-hip[-1]-2))
        guides.append((y,left,right,inset_l,inset_r))
    # Map the two side panels and print into the compressed silhouette.
    # Leave the centre on grain; side folds recover gradually below the coat.
    mesh=[]
    for upper,lower in zip(guides,guides[1:]):
        for x in range(0,SIZE[0],8):
            def sample(row,px):
                y,l,r,dl,dr=row
                sx=np.interp(px,[0,l+dl,276,r-dr,559],[0,l,276,r,559])
                side=min(1,abs(px-276)/140)
                return sx,y+side*(dl+dr)*.26
            mesh.append(((x,upper[0],x+8,lower[0]),
                         (*sample(upper,x),*sample(lower,x),
                          *sample(lower,x+8),*sample(upper,x+8))))
    panel=dress.transform(SIZE,Image.Transform.MESH,mesh,Image.Resampling.BICUBIC)
    panel.paste(dress.crop((0,940,SIZE[0],SIZE[1])),(0,940))
    save(dest,"floral-maxi-under-coat",panel)


def fit_shoes(img,name):
    """Fit each shoe against the matching barefoot stance and common floor."""
    limit=img.getchannel("A")
    spans=((80,250),(280,445))
    centres=(198,348)
    target=Image.new("RGBA",SIZE)
    for (start,end),cx in zip(spans,centres):
        clip=img.crop((start,1380,end,1536))
        alpha=limit.crop((start,1380,end,1536))
        box=alpha.point(lambda v: 255 if v>30 else 0).getbbox()
        if not box: raise ValueError(name)
        geometry=(94,113) if name=="white-platform-sneakers" else (83,102)
        shoe=clip.crop(box).resize(geometry,Image.Resampling.LANCZOS)
        target.alpha_composite(shoe,(cx-shoe.width//2,1484-shoe.height))
    return target


def main(root,phase):
    src=root/"assets/wardrobe/tryon/woman-bob"
    dest=src/"standard"
    dest.mkdir(parents=True,exist_ok=True)
    if phase in ("pilot","all"):
        master_layers(root,dest)
        make_top(root,dest,"purple-graphic-tee")
        save(dest,"light-blue-jeans",cover_pants(src,"light-blue-jeans"))
        save(dest,"white-platform-sneakers",fit_shoes(load(src,"white-platform-sneakers"),"white-platform-sneakers"))
    if phase in ("ordinary","all"):
        for name in ("black-trousers","gray-joggers"):
            save(dest,name,cover_pants(src,name))
        make_top(root,dest,"navy-shirt")
        save(dest,"ivory-mary-janes",fit_shoes(load(src,"ivory-mary-janes"),"ivory-mary-janes"))
    if phase == "pants":
        for name in PANTS:
            save(dest,name,cover_pants(src,name))
    if phase=="upper":
        for name in TOP_PINS:
            make_top(root,dest,name)
    if phase in ("upper","dress","special","all"):
        make_dress(root,dest)
    if phase in ("upper","coat","special","all"):
        make_coat(root,dest)
    if phase in ("upper","dress","special","all"):
        skirt_inside_coat(dest)


if __name__=="__main__":
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root",type=Path,default=Path(__file__).resolve().parents[1])
    parser.add_argument("--phase",choices=("pilot","ordinary","pants","dress","coat","special","upper","all"),default="all")
    args=parser.parse_args()
    main(args.root,args.phase)
