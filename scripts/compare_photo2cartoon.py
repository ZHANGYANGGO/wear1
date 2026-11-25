"""Optional comparison with the upstream photo2cartoon generator on identical input pixels."""
import argparse
import base64
import io
from pathlib import Path

import cv2
import numpy as np
import onnxruntime as ort
from PIL import Image, ImageDraw
from analyze_photo import OVAL, analyze
from cartoon_head import generate


def main():
    cli = argparse.ArgumentParser()
    cli.add_argument("--photo",required=True,type=Path)
    cli.add_argument("--model",required=True,type=Path)
    cli.add_argument("--out",required=True,type=Path)
    args=cli.parse_args()
    analysis=analyze(args.photo.read_bytes(),"primary")
    raster=np.asarray(Image.open(io.BytesIO(base64.b64decode(analysis["assets"]["foreground"]))))
    geom=analysis["geometry"]
    pts=np.array(analysis["landmarks"])*np.divide(geom["rasterSize"],geom["orientedSize"])
    eyes=pts[[468,473]]
    dx,dy=eyes[1]-eyes[0]
    rotate=cv2.getRotationMatrix2D(tuple(eyes.mean(axis=0)),np.degrees(np.arctan2(dy,dx)),1)
    # The upstream crop expands the 68-point bounds (brow to chin, not the hairline).
    contours=pts[[*OVAL[7:31],70,107,336,300]]
    contours=contours@rotate[:,:2].T+rotate[:,2]
    lo,hi=contours.min(axis=0),contours.max(axis=0)
    span=hi-lo
    lo-=span*[.3,.8]
    hi+=span*[.3,.3]
    side=max(hi-lo)
    factor=256/side
    matrix=rotate.copy()*factor
    matrix[:,2]+=(128-(lo+hi)/2*factor)
    aligned=cv2.warpAffine(raster,matrix,(256,256))
    mask=aligned[:,:,3:4]/255
    photo=aligned[:,:,:3]*mask+255*(1-mask)
    tensor=((photo/127.5-1).transpose(2,0,1)[None]).astype(np.float32)
    opts=ort.SessionOptions();opts.intra_op_num_threads=4
    session=ort.InferenceSession(str(args.model),sess_options=opts,providers=["CPUExecutionProvider"])
    output=session.run(["output"],{"input":tensor})[0][0].transpose(1,2,0)
    result=np.clip((output+1)*127.5*mask+255*(1-mask),0,255).astype(np.uint8)
    args.out.parent.mkdir(exist_ok=True,parents=True)
    images=[("Aligned source",Image.fromarray(photo.astype(np.uint8)))]
    for style in ["anime","handdrawn"]:
        generated=generate(analysis,style)
        head=Image.open(io.BytesIO(base64.b64decode(generated["assets"]["head"])))
        images.append(("DCT-Net / "+style,head))
    images.append(("photo2cartoon / ONNX",Image.fromarray(result)))
    sheet=Image.new("RGB",(len(images)*256,286),"#f7f5ef")
    draw=ImageDraw.Draw(sheet)
    for i,(label,img) in enumerate(images):
        img.thumbnail((256,256),Image.Resampling.LANCZOS)
        position=(i*256+(256-img.width)//2,30+(256-img.height)//2)
        sheet.paste(img,position,img if img.mode=="RGBA" else None)
        draw.text((i*256+6,8),label,fill="#292b25")
    sheet.save(args.out)


if __name__=="__main__":
    main()
