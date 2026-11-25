"""Local, single-request portrait analysis. stdin is the encoded original, stdout JSON."""
import base64
import io
import json
import sys
from pathlib import Path

import cv2
import mediapipe as mp
import numpy as np
import onnxruntime as ort
from PIL import Image, ImageOps, UnidentifiedImageError
from mediapipe.tasks.python import BaseOptions, vision

MODELS = Path(__file__).resolve().parents[1] / "models"
MAX_PIXELS = 16_000_000
OVAL = [10,338,297,332,284,251,389,356,454,323,361,288,397,365,379,378,400,377,152,148,176,149,150,136,172,58,132,93,234,127,162,21,54,103,67,109]
FEATURES = {"outline": OVAL, "rightEye": [33,160,158,133,153,144],
            "leftEye": [362,385,387,263,373,380], "lips": [61,40,37,0,267,270,291,321,314,17,84,91], "chin": [152]}
LABELS = ["background", "hair", "bodySkin", "faceSkin", "clothes", "accessories"]


class PhotoError(Exception):
    def __init__(self, code, message):
        self.code = code
        super().__init__(message)


def decode(data):
    try:
        with Image.open(io.BytesIO(data)) as raw:
            w,h = raw.size
            if raw.format not in ("JPEG", "PNG", "WEBP"):
                raise PhotoError("format", "请选择 JPEG、PNG 或 WebP 照片。")
            if min(w,h) < 128 or w*h > MAX_PIXELS:
                raise PhotoError("size", "图片短边至少 128 像素，面积最多 1600 万像素。")
            orientation = int(raw.getexif().get(274, 1))
            upright = ImageOps.exif_transpose(raw).convert("RGBA")
    except (OSError, ValueError, UnidentifiedImageError, Image.DecompressionBombError) as exc:
        raise PhotoError("decode", "图片已损坏或无法解码，请重新导出 JPEG 或 PNG。") from exc
    # Coordinates refer to image edges (0..width, 0..height), matching Canvas drawImage.
    raw_to_oriented = {
        1:[1,0,0,0,1,0], 2:[-1,0,w,0,1,0], 3:[-1,0,w,0,-1,h], 4:[1,0,0,0,-1,h],
        5:[0,1,0,1,0,0], 6:[0,-1,h,1,0,0], 7:[0,-1,h,-1,0,w], 8:[0,1,0,-1,0,w]
    }.get(orientation,[1,0,0,0,1,0])
    ow,oh = upright.size
    upright.thumbnail((1440,1440), Image.Resampling.LANCZOS)
    rw,rh = upright.size
    rgba = np.asarray(upright)
    alpha = rgba[:,:,3].copy()
    rgb = np.asarray(Image.alpha_composite(Image.new("RGBA", upright.size, "white"), upright).convert("RGB"))
    return rgb, alpha, rgba[:,:,:3], {"encodedSize":[w,h], "orientation":orientation, "orientedSize":[ow,oh],
                        "encodedToOriented":raw_to_oriented,
                        "rasterSize":[rw,rh], "rasterToOriented":[ow/rw,0,0,0,oh/rh,0]}


def model(name):
    return BaseOptions(model_asset_buffer=(MODELS / name).read_bytes())


def image(arr):
    return mp.Image(image_format=mp.ImageFormat.SRGB, data=np.ascontiguousarray(arr))


def png(arr):
    buf = io.BytesIO()
    Image.fromarray(arr).save(buf, "PNG", compress_level=2)
    return base64.b64encode(buf.getvalue()).decode("ascii")


def bounding_box(points, w, h):
    xy = np.array([(p.x*w, p.y*h) for p in points])
    return xy.min(axis=0), xy.max(axis=0)


def head_crop(left, top, right, bottom, w, h):
    dx,dy = max(16,right-left),max(16,bottom-top)
    return [max(0,int(left-.6*dx)),max(0,int(top-.65*dy)),
            min(w,int(right+.6*dx+1)),min(h,int(bottom+.55*dy+1))]


def segment(task, arr):
    return task.segment(image(arr)).category_mask.numpy_view().copy()


def pose_locations(rgb):
    options = vision.PoseLandmarkerOptions(base_options=model("pose-lite.task"), num_poses=3,
                                            min_pose_detection_confidence=.40)
    with vision.PoseLandmarker.create_from_options(options) as task:
        return task.detect(image(rgb)).pose_landmarks


def matte(rgb):
    h,w = rgb.shape[:2]
    options = ort.SessionOptions()
    options.intra_op_num_threads = 3
    options.inter_op_num_threads = 1
    session = ort.InferenceSession(str(MODELS / "modnet.onnx"), sess_options=options, providers=["CPUExecutionProvider"])
    # Preserve aspect ratio. Padding to multiples of 32 keeps the network's skip connections aligned.
    scale = min(512/min(w,h), 1024/max(w,h))
    mw,mh = max(1,round(w*scale)),max(1,round(h*scale))
    small = cv2.resize(rgb,(mw,mh),interpolation=cv2.INTER_AREA if scale < 1 else cv2.INTER_LINEAR)
    padded = cv2.copyMakeBorder(small,0,(-mh)%32,0,(-mw)%32,cv2.BORDER_REPLICATE)
    tensor = (padded.astype(np.float32)/127.5-1).transpose(2,0,1)[None]
    mask = session.run(None,{session.get_inputs()[0].name:tensor})[0][0,0,:mh,:mw]
    return np.clip(cv2.resize(mask,(w,h),interpolation=cv2.INTER_LINEAR)*255,0,255).round().astype(np.uint8)


def sample(rgb, labels, class_id, alpha, box=None):
    selected = (labels == class_id) & (alpha > 200)
    if box:
        x,y,r,b = box
        selected, rgb = selected[y:b,x:r], rgb[y:b,x:r]
    values = rgb[selected]
    if len(values) < 20:
        return None
    return {"rgb":np.median(values,axis=0).astype(int).tolist(), "pixelCount":len(values)}


def analyze(data, source):
    rgb, input_alpha, original_rgb, meta = decode(data)
    h,w = rgb.shape[:2]
    seg_options = vision.ImageSegmenterOptions(base_options=model("selfie-multiclass.tflite"), output_category_mask=True, output_confidence_masks=False)
    face_options = vision.FaceLandmarkerOptions(base_options=model("face-landmarker.task"),num_faces=3,min_face_detection_confidence=.45)
    poses = pose_locations(rgb)
    if len(poses) > 1:
        raise PhotoError("multiple", "检测到多人，请裁出一个人物后重选。")
    with vision.ImageSegmenter.create_from_options(seg_options) as seg, vision.FaceLandmarker.create_from_options(face_options) as detector:
        labels = segment(seg,rgb)
        faces = detector.detect(image(rgb)).face_landmarks
        if len(faces) > 1:
            raise PhotoError("multiple", "检测到多张脸，请选择单人照片。")
        pose = poses[0] if poses else None
        if faces:
            lo,hi = bounding_box(faces[0],w,h)
            box = head_crop(*lo,*hi,w,h)
        elif pose:
            # Use the ears, eyes and nose to find the head in a distant full-body photograph.
            visible = [p for p in pose[:11] if p.visibility > .45]
            box = None
            if len(visible) >= 3:
                lo,hi = bounding_box(visible,w,h)
                cx,cy = (lo+hi)/2
                span = max(hi[0]-lo[0],hi[1]-lo[1],12)
                box = head_crop(cx-.72*span,cy-.85*span,cx+.72*span,cy+span,w,h)
        else:
            box = None
        face = None
        if box:
            x,y,r,b = box
            if r-x >= 12 and b-y >= 12:
                crop = rgb[y:b,x:r]
                refined = detector.detect(image(crop)).face_landmarks
                if len(refined) > 1:
                    raise PhotoError("multiple","头部区域内检测到多张脸，请裁出一个人物。")
                if refined:
                    face = np.array([[x+p.x*(r-x),y+p.y*(b-y)] for p in refined[0]])
                elif faces:
                    face = np.array([[p.x*w,p.y*h] for p in faces[0]])
                # Only update facial interior labels; long hair and shoulders outside the crop keep the full-image prediction.
                if face is not None:
                    local = segment(seg,crop)
                    hull = cv2.convexHull(np.rint(face[OVAL]-[x,y]).astype(np.int32))
                    inside = np.zeros(local.shape,np.uint8)
                    cv2.fillConvexPoly(inside,hull,1)
                    np.copyto(labels[y:b,x:r],local,where=(inside>0) & (local>0))

    body_visible = bool(pose and all(pose[i].visibility > .55 and 0 <= pose[i].y < .98 and 0 <= pose[i].x <= 1 for i in [23,24]))
    face_height = float(np.ptp(face[OVAL,1])) if face is not None else 0
    estimated_height = face_height or ((box[3]-box[1])/2.2 if box else 0)
    distant = bool(body_visible and estimated_height > 0 and (estimated_height < 65 or estimated_height < h*.105))
    if not face_height and not distant:
        visible_head_and_torso = np.count_nonzero(labels == 1) > w*h*.004 and np.count_nonzero(labels == 4) > w*h*.08
        if pose or visible_head_and_torso or np.count_nonzero(labels == 3) > w*h*.012:
            raise PhotoError("occlusion","脸部点位不足，请移开遮挡并上传清晰正脸。")
        raise PhotoError("no-face","没有检测到清晰的人脸，请上传单人照片。")
    if source == "supplement" and (distant or not face_height):
        raise PhotoError("small-face","补拍图的脸仍太小，请靠近拍摄清晰正脸。")
    if face is not None and not distant:
        # Reject faces whose central nose/lip/cheek samples fall on background, clothing or accessories.
        indexes = [1,4,6,98,327,13,14,50,280,205,425]
        pts = np.rint(face[indexes]).astype(int)
        tested = labels[np.clip(pts[:,1],0,h-1),np.clip(pts[:,0],0,w-1)]
        if np.count_nonzero(tested == 3) < 5:
            raise PhotoError("occlusion","面部被明显遮挡，请露出眼睛、鼻子和嘴部后重选。")
    if np.count_nonzero(labels) < 64:
        raise PhotoError("no-person","未能提取人物轮廓，请重新选择照片。")
    alpha = np.minimum(matte(rgb),input_alpha)
    if not np.any(alpha>128):
        raise PhotoError("no-person","未能提取透明人物，请选择主体更清晰的照片。")
    labels[input_alpha == 0] = 0
    ow,oh = meta["orientedSize"]
    meta["headCropRaster"] = box
    meta["headUnitToOriented"] = ([((box[2]-box[0])*ow/w),0,box[0]*ow/w,0,((box[3]-box[1])*oh/h),box[1]*oh/h] if box else None)
    landmarks = None if face is None else np.round(face*[ow/w,oh/h],2).tolist()
    return {"sourceId":source,"geometry":meta,"needsSupplement":bool(distant),
            "bodyObservation":"observed" if body_visible else "unobserved",
            "landmarks":landmarks,"features":FEATURES if landmarks else {},
            "samples":{"skin":sample(rgb,labels,3,alpha,box),"hair":sample(rgb,labels,1,alpha,box)},
            "classes":LABELS,"assets":{"semantic":png(labels),"alpha":png(alpha),
            "foreground":png(np.dstack([original_rgb,alpha]))}}


if __name__ == "__main__":
    try:
        result = analyze(sys.stdin.buffer.read(10*1024*1024+1),sys.argv[1])
    except PhotoError as error:
        result = {"error":str(error),"code":error.code}
    print(json.dumps(result,ensure_ascii=True,separators=(",",":")))

