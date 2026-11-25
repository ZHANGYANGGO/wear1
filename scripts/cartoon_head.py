"""DCT-Net portrait layer generation. CLI takes a photograph; the web worker consumes an existing analysis."""
import argparse
import base64
import hashlib
import io
import json
import sys
from pathlib import Path

import openvino as ov
from openvino.frontend import FrontEndManager
import cv2
import numpy as np
from PIL import Image
from analyze_photo import FEATURES, OVAL, PhotoError, analyze, image, model, png, segment, vision
from download_cartoon import ROOT, STYLES
from portrait_geometry import deviations, face_art, finish_jaw, registered_necks

# Official DCT-Net square reference: +1 to both axes, +8 in x for the 96-to-112 square.
REFERENCE = np.array([[30.2946,51.6963],[65.5318,51.5014],[48.0252,71.7366],
                      [33.5493,92.3655],[62.7299,92.2041]],np.float64) + [9,1]
REFERENCE = ((REFERENCE-56)*.75+56)*(288/112)


def source_image(encoded, mode, size):
    raw = base64.b64decode(encoded,validate=True)
    with Image.open(io.BytesIO(raw)) as img:
        if img.format != "PNG" or img.size != size or img.mode != mode:
            raise ValueError("Invalid analysis raster")
        return np.asarray(img).copy()


def transform(points, matrix):
    return np.asarray(points) @ matrix[:,:2].T + matrix[:,2]


def align(pts):
    five = pts[[468,473,1,61,291]]
    # Solve the four parameters of a similarity transform using all five correspondences.
    rows = []
    for x,y in five:
        rows.extend([[x,-y,1,0],[y,x,0,1]])
    a,b,tx,ty = np.linalg.lstsq(rows,REFERENCE.flatten(),rcond=None)[0]
    return np.array([[a,-b,tx],[b,a,ty]])


def graph_inference(graph_path, rgb):
    frontend = FrontEndManager().load_by_framework("tf")
    graph = frontend.convert(frontend.load(str(graph_path)))
    compiled = ov.Core().compile_model(graph,"CPU",{"INFERENCE_NUM_THREADS":4,"INFERENCE_PRECISION_HINT":"f32"})
    output = compiled({"input_image:0":np.ascontiguousarray(rgb[:,:,::-1],dtype=np.float32)})["output_image:0"]
    if output.ndim != 3 or output.shape != rgb.shape or not np.isfinite(output).all():
        raise RuntimeError("Unexpected DCT-Net image dimensions")
    return np.clip(output,0,255).astype(np.uint8)[:,:,::-1].copy()


def verified_graphs(style):
    graphs = {}
    for part,digest in STYLES[style][1].items():
        path = ROOT / f"{style}-{part}.pb"
        if not path.is_file() or hashlib.sha256(path.read_bytes()).hexdigest() != digest:
            raise PhotoError("weights","模型缺失或校验失败。请在 wear-二维 目录运行 python scripts/download_cartoon.py，然后重试。")
        graphs[part] = path
    return graphs


def matte_layers(rgba,labels,pts):
    height,width = labels.shape
    face = pts[OVAL]
    fw,fh = np.ptp(face,axis=0)
    chin_x,chin_y = pts[152]
    yy,xx = np.ogrid[:height,:width]
    dx = np.abs(xx-chin_x)/fw
    dy = (yy-chin_y)/fh
    # Body skin is a separate class from the face. Keep only the observable neck beneath the jaw.
    neck = (labels==2) & (dy>-.24) & (dy<.45) & (dx < .27+.12*np.clip(dy,0,1))
    accessory = (labels==5) & (dx<.73) & (dy> -1.35) & (dy<.12)
    core = (labels==1) | (labels==3) | accessory | neck
    core &= (labels==1) | ((dx < 1.65) & (dy > -1.8) & (dy < 2.45))
    count,components = cv2.connectedComponents(core.astype(np.uint8),connectivity=8)
    face_zone = np.zeros_like(labels)
    cv2.fillConvexPoly(face_zone,cv2.convexHull(np.rint(face).astype(np.int32)),1)
    overlap = np.bincount(components[face_zone.astype(bool)],minlength=count)
    overlap[0] = 0
    if not np.any(overlap):
        raise PhotoError("mask","当前照片缺少连贯的头部区域，请换一张清晰正脸。")
    core = components == overlap.argmax()
    # Keep soft wisps from the original matte in the narrow background band adjacent to hair.
    radius = max(1,min(9,round(fw*.025)))
    band = cv2.dilate(((labels==1)&core).astype(np.uint8),np.ones((2*radius+1,2*radius+1),np.uint8))
    keep = core | ((band>0)&(labels==0)&(rgba[:,:,3]<252))
    soft = cv2.GaussianBlur(keep.astype(np.float32),(0,0),.8)
    alpha = (np.minimum(soft*255,rgba[:,:,3])).astype(np.uint8)
    alpha[labels==4] = 0
    return alpha, neck & core


def detect_generated(rgb, predicted, matrix, inverse, *, final):
    opts = vision.FaceLandmarkerOptions(base_options=model("face-landmarker.task"),num_faces=1,
        min_face_detection_confidence=.28,min_face_presence_confidence=.30)
    with vision.FaceLandmarker.create_from_options(opts) as detector:
        aligned=cv2.warpAffine(rgb,matrix,(288,288),borderValue=(240,238,234))
        for picture,mapping in [(rgb,None),(aligned,inverse)]:
            faces = detector.detect(image(picture)).face_landmarks
            if not faces:
                continue
            pts = np.array([[p.x*picture.shape[1],p.y*picture.shape[0]] for p in faces[0]])
            if mapping is not None:
                pts = transform(pts,mapping)
            error=deviations(predicted,pts)
            p90_limit,max_limit=(.035,.06) if final else (.18,.25)
            if error["p90"]<=p90_limit and error["max"]<=max_limit:
                return pts,error
    if not final: return None,None
    raise PhotoError("calibration","生成图的眼、鼻、嘴或下巴与照片未能可靠对齐。请使用更清晰的正脸重试。")


def generate(data,style,notify=lambda phase:None):
    if style not in STYLES or data.get("sourceId") not in ("primary","supplement"):
        raise ValueError("Invalid style or source")
    if data.get("needsSupplement") or not data.get("landmarks"):
        raise PhotoError("small-face","请先补传同一人的清晰正脸。")
    geom = data["geometry"]
    size = tuple(geom["rasterSize"])
    if len(size)!=2 or not all(type(n) is int and 0<n<=1440 for n in size):
        raise ValueError("Invalid raster")
    rgba = source_image(data["assets"]["foreground"],"RGBA",size)
    labels = source_image(data["assets"]["semantic"],"L",size)
    ow,oh = geom["orientedSize"]
    pts = np.asarray(data["landmarks"],np.float64)*[size[0]/ow,size[1]/oh]
    if pts.shape != (478,2) or not np.isfinite(pts).all() or np.ptp(pts[OVAL,0])<12:
        raise ValueError("Invalid landmarks")
    notify("preparing")
    graphs = verified_graphs(style)
    alpha,neck = matte_layers(rgba,labels,pts)
    y,x = np.nonzero(alpha>10)
    if not len(x):
        raise PhotoError("mask","没有可用的头层遮罩。")
    # Work in the cropped head layer's own space; preserve the exact inverse for downstream modules.
    x0,y0=max(0,int(x.min())-4),max(0,int(y.min())-4)
    x1,y1=min(size[0],int(x.max())+5),min(size[1],int(y.max())+5)
    scale=min(1,640/max(x1-x0,y1-y0))
    w,h=max(1,round((x1-x0)*scale)),max(1,round((y1-y0)*scale))
    sx,sy=w/(x1-x0),h/(y1-y0)
    def crop(arr,method=cv2.INTER_AREA):
        return cv2.resize(arr[y0:y1,x0:x1],(w,h),interpolation=method)
    rgb = crop(rgba[:,:,:3])
    alpha = crop(alpha)
    neck = crop(neck.astype(np.uint8),cv2.INTER_NEAREST).astype(bool)
    # Estimate the visible shoulder span before cropping away the garment. A strand
    # outside the shoulders belongs behind the body; the original tip stays in the head.
    cloth = (labels==4).astype(np.uint8)
    reach = max(3,round(np.ptp(pts[OVAL,1])*.35))
    below = cv2.dilate(cloth,np.ones((reach,1),np.uint8),anchor=(0,0))
    support = (np.maximum.accumulate(below,axis=1) &
               np.maximum.accumulate(below[:,::-1],axis=1)[:,::-1])
    front_support = crop(support,cv2.INTER_NEAREST).astype(bool)
    labels = crop(labels,cv2.INTER_NEAREST)
    alpha[labels==4] = 0
    local_pts=(pts-[x0,y0])*[sx,sy]
    matrix=align(local_pts)
    inverse=cv2.invertAffineTransform(matrix)
    neutral=np.array([240,238,234])
    weight=alpha[:,:,None].astype(np.float32)/255
    isolated=np.rint(rgb*weight+neutral*(1-weight)).astype(np.uint8)
    aligned=cv2.warpAffine(isolated,matrix,(288,288),borderValue=tuple(map(int,neutral)))
    notify("inference")
    head=graph_inference(graphs["head"],aligned)
    padded=cv2.copyMakeBorder(isolated,0,(-h)%16,0,(-w)%16,cv2.BORDER_REPLICATE)
    context=graph_inference(graphs["context"],padded)[:h,:w]
    # The learned context graph supplies hair outside the aligned square.
    # Blend its overlap with the separately generated face, never the original photograph.
    yy,xx=np.mgrid[:288,:288]
    distance=np.minimum.reduce([xx,yy,287-xx,287-yy])
    feather=np.clip(distance/30,0,1).astype(np.float32)
    blend=cv2.warpAffine(feather,inverse,(w,h))[:,:,None]
    mapped=cv2.warpAffine(head,inverse,(w,h),borderMode=cv2.BORDER_REPLICATE)
    result=np.rint(blend*mapped+(1-blend)*context).astype(np.uint8)
    notify("calibrating")
    learned_pts,_=detect_generated(result,local_pts,matrix,inverse,final=False)
    result=face_art(rgb,result,local_pts,labels,alpha,style,learned_pts)
    head_alpha=finish_jaw(alpha,labels,local_pts)
    opacity=head_alpha[:,:,None]/255
    visible=np.rint(result*opacity+neutral*(1-opacity)).astype(np.uint8)
    cartoon_pts,quality=detect_generated(visible,local_pts,matrix,inverse,final=True)
    chin=cartoon_pts[152]
    seg_opts=vision.ImageSegmenterOptions(base_options=model("selfie-multiclass.tflite"),
                                         output_category_mask=True,output_confidence_masks=False)
    with vision.ImageSegmenter.create_from_options(seg_opts) as task:
        generated_labels=segment(task,result)
    central = (neck & np.isin(generated_labels,[2,3])
               & (np.abs(np.arange(w)[None,:]-chin[0]) < np.ptp(cartoon_pts[OVAL,0])*.21)
               & (alpha>160))
    ny,nx=np.nonzero(central)
    if len(ny) and ny.max()>chin[1]:
        bottom=np.quantile(ny,.97)
        neck_point=[float(np.median(nx[ny>=bottom])),float(bottom)]
        neck_observation="visible"
    else:
        neck_point=chin.tolist()
        neck_observation="chin-only"
    # Persist classified part masks in layer coordinates. Cloth pixels are always transparent.
    # The neck must meet the exact same edge that finish_jaw cut from the photo.
    # Re-detected points are for overlay and quality checks and can vary with style.
    joins,placements=registered_necks(result,alpha,labels,local_pts,(w,h))
    alpha=head_alpha
    parts=np.where(alpha>15,labels,0).astype(np.uint8)
    parts[(parts==0)&(alpha>15)]=1
    hanging=(parts==1)&(np.arange(h)[:,None]>chin[1])
    front_hair=np.where(hanging & front_support,alpha,0).astype(np.uint8)
    # A lock clipped by the image border has no observed tip. Place that lock behind the
    # garment so the photograph's straight cut cannot appear across the new shirt.
    hair_clipped = bool(np.count_nonzero((labels[-1]==1)&(alpha[-1]>60))>3 and y1==size[1])
    if hair_clipped:
        _,locks=cv2.connectedComponents((hanging & (alpha>15)).astype(np.uint8),connectivity=8)
        clipped_ids=np.unique(locks[-1])
        clipped_ids=clipped_ids[clipped_ids!=0]
        clipped=cv2.dilate(np.isin(locks,clipped_ids).astype(np.uint8),np.ones((3,3),np.uint8))
        front_hair[clipped>0]=0
    result[alpha==0]=0
    fitted=placements["fitted"]
    return {"version":2,"model":"DCT-Net","style":style,"weights":STYLES[style][1],"sourceId":data["sourceId"],
        "faceDeviation":quality,
        "size":[w,h],"landmarks":np.round(cartoon_pts,2).tolist(),"features":FEATURES,
        "neck":neck_point,"neckObservation":neck_observation,"hairClipped":hair_clipped,"calibration":"generated-face-landmarker",
        "mapping":{"layerToOriented":[ow/size[0]/sx,0,x0*ow/size[0],0,oh/size[1]/sy,y0*oh/size[1]],
                   "layerToAligned":matrix.flatten().tolist(),"alignedToLayer":inverse.flatten().tolist(),
                   "sourceHeadCropRaster":geom["headCropRaster"],"cropRaster":[x0,y0,x1,y1],
                   "placements":placements,"layerToFittedTemplate":fitted["layerToCanvas"],
                   "templateSize":[560,1536],"neckJoinAt":fitted["neckJoinAt"]},
        "assets":{"head":png(np.dstack([result,alpha])),"alpha":png(alpha),"parts":png(parts),
                  "frontHair":png(front_hair),"neckJoin":png(joins["fitted"]),"straightNeckJoin":png(joins["straight"])}}


def main():
    parser=argparse.ArgumentParser()
    parser.add_argument("--style",choices=STYLES,default="handdrawn")
    parser.add_argument("--photo",type=Path)
    parser.add_argument("--out",type=Path)
    args=parser.parse_args()
    if args.photo:
        if not args.out: parser.error("--photo requires --out")
        result=generate(analyze(args.photo.read_bytes(),"primary"),args.style)
        args.out.mkdir(parents=True,exist_ok=True)
        for key,encoded in result.pop("assets").items():
            (args.out/(key+".png")).write_bytes(base64.b64decode(encoded))
        (args.out/"calibration.json").write_text(json.dumps(result,indent=2),encoding="utf-8")
        return
    def send(event): print(json.dumps(event,ensure_ascii=True,separators=(",",":")),flush=True)
    try:
        result=generate(json.load(sys.stdin),args.style,lambda phase:send({"phase":phase}))
        send({"result":result})
    except PhotoError as exc:
        send({"error":str(exc),"code":exc.code})
    except (ValueError,KeyError,TypeError,ZeroDivisionError,IndexError,OSError) as exc:
        print(repr(exc),file=sys.stderr)
        send({"error":"人物提取数据不完整，请重新分析主照片或补拍图。","code":"analysis"})


if __name__=="__main__":
    main()
