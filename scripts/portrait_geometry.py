"""Photo-coordinate face rendering and jaw-to-collar registration for both body templates."""
from pathlib import Path

import cv2
import numpy as np
from PIL import Image

from analyze_photo import OVAL, PhotoError

JAW = [234,93,132,58,172,136,150,149,176,148,152,377,400,378,379,365,397,288,361,323,454]
CHECK_POINTS = [33,133,362,263,468,473,1,98,327,61,291,13,14,152,234,454]
ASSETS = Path(__file__).resolve().parents[1] / "assets"


def align_painting(paint, target, detected):
    """Resample the learned brushwork at the photographed facial features."""
    if detected is None:
        return None
    ids=list(dict.fromkeys(OVAL+CHECK_POINTS+[159,145,386,374,70,63,105,107,336,334,293,300,
                                              6,4,168,2,17,0,78,308,81,311,87,317,50,280,205,425]))
    h,w=paint.shape[:2]
    dest=target[ids].astype(np.float32); src=detected[ids].astype(np.float32)
    inside=(dest[:,0]>=0)&(dest[:,0]<w)&(dest[:,1]>=0)&(dest[:,1]<h)
    dest=dest[inside];src=src[inside]
    if len(dest)<20: return None
    mesh=cv2.Subdiv2D((0,0,w,h))
    for point in dest: mesh.insert(tuple(map(float,point)))
    yy,xx=np.mgrid[:h,:w].astype(np.float32)
    delta=np.zeros((h,w,2),np.float32)
    for triangle in mesh.getTriangleList().reshape(-1,3,2):
        distances=((triangle[:,None]-dest[None,:])**2).sum(axis=2)
        indices=distances.argmin(axis=1)
        if distances.min(axis=1).max()>.01 or cv2.contourArea(triangle)<.3: continue
        x,y,bw,bh=cv2.boundingRect(triangle)
        region=np.s_[y:y+bh,x:x+bw]
        tmp=np.zeros((bh,bw),np.uint8)
        cv2.fillConvexPoly(tmp,np.rint((triangle-[x,y])*16).astype(np.int32),1,shift=4)
        m=cv2.getAffineTransform(triangle,src[indices]-dest[indices])
        displacement=xx[region][:,:,None]*m[:,0]+yy[region][:,:,None]*m[:,1]+m[:,2]
        delta[region][tmp!=0]=displacement[tmp!=0]
    delta=cv2.GaussianBlur(delta,(0,0),1)
    return cv2.remap(paint,xx+delta[:,:,0],yy+delta[:,:,1],cv2.INTER_LINEAR,borderMode=cv2.BORDER_REPLICATE)


def face_art(rgb, learned, pts, labels, alpha, style, detected):
    # All line work within the facial oval is sampled in photo coordinates, including
    # the eyes, frame of the glasses and teeth. Use the model for the palette and hair.
    span = np.ptp(pts[OVAL,0])
    anime = style == "anime"
    smooth = cv2.bilateralFilter(rgb, 9, 52 if anime else 32, max(2,span*.028))
    if anime:
        smooth = cv2.pyrMeanShiftFiltering(smooth,max(3,span*.025),22,maxLevel=1)
    lab = cv2.cvtColor(smooth,cv2.COLOR_RGB2LAB).astype(np.float32)
    skin = (labels==3) & (alpha>224)
    if np.any(skin):
        palette = cv2.cvtColor(learned,cv2.COLOR_RGB2LAB)
        shift = np.median(palette[skin],axis=0)-np.median(lab[skin],axis=0)
        lab += np.clip(shift,[-7,-4,-5],[10,4,5])
    light = lab[:,:,0]
    blur = cv2.GaussianBlur(light,(0,0),max(1,span*.012))
    step = 25 if anime else 15
    ink = np.clip(blur-light-2,0,32)
    lab[:,:,0] = light - (1.05 if anime else .36)*ink - (.94 if anime else .5)*step/(2*np.pi)*np.sin(2*np.pi*light/step)
    registered=align_painting(learned,pts,detected)
    if registered is not None:
        paint=cv2.cvtColor(registered,cv2.COLOR_RGB2LAB).astype(np.float32)
        if np.any(skin):
            paint-=np.median(paint[skin],axis=0)-np.median(lab[skin],axis=0)
        # Transfer soft tones. Pupil, spectacle and tooth edges stay on the photo grid.
        residual=cv2.GaussianBlur(paint-lab,(0,0),max(.9,span*.011))
        lab+=(.72 if anime else .54)*np.clip(residual,[-32,-10,-13],[32,10,13])
    lab[:,:,1:] = 128+(lab[:,:,1:]-128)*(1.12 if anime else 1.04)
    styled = cv2.cvtColor(np.clip(lab,0,255).astype(np.uint8),cv2.COLOR_LAB2RGB)
    hull = np.zeros(labels.shape,np.uint8)
    cv2.fillConvexPoly(hull,cv2.convexHull(np.rint(pts[OVAL]).astype(np.int32)),255)
    # Include ears, neck and accessories. Feather the transition outside the oval.
    hull[np.isin(labels,[2,3,5]) & (alpha>20)] = 255
    radius=max(2,round(span*.035))
    hull=cv2.dilate(hull,cv2.getStructuringElement(cv2.MORPH_ELLIPSE,(2*radius+1,)*2))
    weight=cv2.GaussianBlur(hull.astype(np.float32)/255,(0,0),max(1,radius*.55))[:,:,None]
    return np.rint(styled*weight+learned*(1-weight)).astype(np.uint8)


def deviations(observed, measured):
    width=max(1,np.ptp(observed[OVAL,0]))
    offsets=np.linalg.norm(measured[CHECK_POINTS]-observed[CHECK_POINTS],axis=1)/width
    return {"p90":float(np.percentile(offsets,90)), "max":float(np.max(offsets))}


def jaw_line(points, x):
    # Use the lowest intersection for each column; the far mandibular edge can
    # double back in a three-quarter view.
    line=np.full(np.shape(x),-np.inf)
    for p,q in zip(points[JAW[:-1]],points[JAW[1:]]):
        dx=q[0]-p[0]
        if abs(dx)<1e-5: continue
        t=(x-p[0])/dx
        line=np.maximum(line,np.where((t>=0)&(t<=1),p[1]+t*(q[1]-p[1]),-np.inf))
    return line


def finish_jaw(alpha, labels, points):
    h,w=alpha.shape
    jaw=jaw_line(points,np.arange(w))
    # Outside the jaw width, keep ears above the jaw angles and exclude lower
    # neck fragments. Hair keeps its original matte right down to its tips.
    left,right=points[[172,397]]
    jaw=np.where(np.isfinite(jaw),jaw,np.where(np.arange(w)<points[152,0],left[1],right[1]))
    coverage=np.clip(jaw[None,:]+1-np.arange(h)[:,None],0,1)
    # Keep the pinna and lateral cheek from the source matte. A face mesh ends
    # in front of the ear and its lateral edge is not a head cut line.
    feather=max(2,np.ptp(points[OVAL,0])*.065)
    inner=np.clip(np.minimum(np.arange(w)-min(left[0],right[0]),max(left[0],right[0])-np.arange(w))/feather,0,1)
    lower=np.clip((np.arange(h)[:,None]-points[152,1])/feather,0,1)
    cut=np.maximum(inner[None,:],lower)
    coverage=1-(1-coverage)*np.where(labels==2,1,cut)
    hair=labels==1
    fringe=(labels==0)&(cv2.dilate(hair.astype(np.uint8),np.ones((5,5),np.uint8))!=0)
    return np.rint(alpha*np.where(hair|fringe,1,coverage)).astype(np.uint8)


# Each neck material is sampled strictly inside the unoccluded skin of the existing
# character. The lower sample boundary follows the original collar without including it.
TEMPLATES = {
    "fitted": dict(donor="avatar/head.webp", center=276,chin=199,height=126,waist=566,
                   bottom=288,shoulder=88,half=.34,ref=(276,34,243,55,269)),
    "straight": dict(donor="local-avatar/man-smile/head.webp",center=268,chin=231,height=152,waist=793,
                     bottom=312,shoulder=105,half=.36,ref=(272,40,251,48,283)),
}


def registered_necks(rgb, alpha, labels, points, size):
    fw,fh=np.ptp(points[OVAL],axis=0)
    axis=np.mean(points[[172,397],0])
    chin=points[152,1]
    face_skin=(labels==3)&(alpha>210)
    samples=[]
    for idx in [50,280,205,425]:
        x,y=np.rint(points[idx]).astype(int)
        r=max(2,round(fw*.043))
        ys=slice(max(0,y-r),y+r+1); xs=slice(max(0,x-r),x+r+1)
        samples.extend(rgb[ys,xs][face_skin[ys,xs]])
    if not len(samples): samples=rgb[face_skin]
    if not len(samples): raise PhotoError("mask","脸部皮肤没有提取完整，请更换清晰的单人照片。")
    tone=np.median(samples,axis=0)
    inserts={}; placements={}
    for key,t in TEMPLATES.items():
        center,cy,bottom=t["center"],t["chin"],t["bottom"]
        scale=min(t["height"]/fh,(center-4)/max(1,axis),(556-center)/max(1,size[0]-axis),
                  (cy-3)/max(1,chin),(t["waist"]-cy-2)/max(1,size[1]-chin))
        shift=np.array([center-scale*axis,cy-scale*chin])
        stage=points*scale+shift
        upper=round(cy-.32*scale*fh)
        x0=center-t["shoulder"]-2
        yy,xx=np.mgrid[upper:bottom, x0:center+t["shoulder"]+3].astype(np.float32)
        progress=np.clip((yy-cy)/(bottom-cy),0,1)
        flare=np.clip((progress-.28)/.58,0,1)
        flare=flare*flare*(3-2*flare)
        # On a turned face the two cheeks project closer together, but the neck
        # still supports the skull immediately below the ears. Blend in its
        # native width and follow the displaced ear axis back to the collar.
        ear_axis=stage[[234,454],0].mean()
        yaw=np.clip((ear_axis-stage[1,0])/(fw*scale),-.5,.5)
        native_half=t["ref"][1]
        half=np.clip(.55*t["half"]*fw*scale+.45*native_half,.22*t["height"],.37*t["height"])
        upper_profile=np.clip((cy+.30*(bottom-cy)-yy)/(.55*(bottom-cy)),0,1)
        extent=half+(t["shoulder"]-half)*flare+.14*half*upper_profile
        tilt=(ear_axis-center)+.18*yaw*native_half
        mid=center+tilt*(1-progress)**2
        u=(xx-mid)/extent
        jaw=jaw_line(stage,xx[0])
        # Outside the chin footprint only the low, widening clavicle can be visible.
        jaw=np.where(np.isfinite(jaw),jaw,cy)
        under=yy-jaw[None,:]
        mask=np.clip(extent-np.abs(xx-mid)+.5,0,1)*np.clip(under+6,0,1)
        v=np.clip(under/np.maximum(1,bottom-jaw),0,1)
        du=np.clip(u,-1,1)
        dx,hw,transition,lw,end=t["ref"]
        # Canonical reference surface begins just under the native jaw. Its lighting
        # includes the submental shadow and clavicles, with no original shirt pixels.
        donor_x=dx+du*(hw+(lw-hw)*v)
        if key=="fitted":
            start=np.interp(du,[-1,-.55,0,.55,1],[193,198,202,198,189])
        else:
            start=np.interp(du,[-1,-.55,0,.55,1],[225,233,231,225,214])
        stop=end-16*np.abs(du)**1.6
        donor_y=(1-v)**2*start+2*(1-v)*v*transition+v**2*stop
        with Image.open(ASSETS/t["donor"]) as native:
            native=np.array(native.convert("RGB"))
        texture=cv2.remap(native,donor_x.astype(np.float32),donor_y.astype(np.float32),cv2.INTER_LINEAR)
        light=cv2.cvtColor(texture,cv2.COLOR_RGB2GRAY).astype(np.float32)
        reference=np.median(light[(v>.48)&(v<.88)&(np.abs(u)<.65)])
        shade=np.clip(light/max(1,reference),.56,1.14)**.8
        color=tone[None,None,:]*shade[:,:,None]*.96
        # Use observable neck skin as illumination only within its reliable interior.
        # The dark boundary of a collar or a cut-out must never be copied onto the neck.
        observed=((labels==2)&(alpha>235)).astype(np.uint8)
        dist=cv2.distanceTransform(observed,cv2.DIST_L2,3)
        mx=((xx-shift[0])/scale).astype(np.float32); my=((yy-shift[1])/scale).astype(np.float32)
        reliable=cv2.remap(dist,mx,my,cv2.INTER_LINEAR)
        weight=.75*np.clip((reliable-1)/max(2,fw*.045),0,1)*np.clip((.6-progress)/.35,0,1)
        original=cv2.remap(cv2.GaussianBlur(rgb,(0,0),max(1,fw*.02)),mx,my,cv2.INTER_LINEAR)
        original=np.clip(original,tone*.74,tone*1.1)
        color=color*(1-weight[:,:,None])+original*weight[:,:,None]
        inserts[key]=np.dstack([color.clip(0,255).astype(np.uint8),np.rint(255*mask).astype(np.uint8)])
        placements[key]={"layerToCanvas":[scale,0,shift[0],0,scale,shift[1]],"neckJoinAt":[x0,upper]}
    return inserts,placements
