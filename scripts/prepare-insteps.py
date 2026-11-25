"""Derive instep masks from the two registered Mary Jane sprites in template coordinates."""
from pathlib import Path

import cv2
import numpy as np
from PIL import Image

ROOT=Path(__file__).resolve().parents[1]
for family,centers,ankle_row in [("fitted",(161,360),1432),("straight",(153,360),1427)]:
    directory=ROOT/"assets/wardrobe/tryon"/family
    shoe=np.asarray(Image.open(directory/"ivory-mary-janes.webp").convert("RGBA")).astype(float)
    ankle_dir=ROOT/("assets/avatar" if family=="fitted" else "assets/local-avatar/man-smile")
    ankles=np.asarray(Image.open(ankle_dir/"ankles.webp").convert("RGBA"))
    r,g,b,a=shoe.transpose(2,0,1)
    # Select the two interior leather surfaces through the top opening and under the strap.
    chroma=np.minimum((r-b-49)/16,(r-g-23)/10).clip(0,1)
    mask=np.zeros_like(a)
    for cx in centers:
        interior=(chroma[:,cx-56:cx+56]>.3)&(a[:,cx-56:cx+56]>100)
        interior[:1408]=False
        interior[1492:]=False
        _,labels=cv2.connectedComponents(interior.astype(np.uint8))
        zones=[labels[y,56] for y in [1432,1478]]
        assert all(zones)
        surface=np.isin(labels,zones)
        mask[:,cx-56:cx+56]=chroma[:,cx-56:cx+56]*surface
    # The leg obscures the rear rim but the strap and the front of the shoe stay above the foot.
    for y in range(1408,1458):
        leg=ankles[min(ankle_row,y),:,3]/255
        mask[y]=np.maximum(mask[y],leg*np.clip((1458-y)/15,0,1))
    yy,xx=np.mgrid[:1536,:560]
    distance=np.minimum(np.abs(xx-centers[0]),np.abs(xx-centers[1]))
    shade=(.98-.12*(distance/38).clip(0,1)**1.5-.08*np.exp(-((yy-1470)/4.5)**2))
    value=np.rint(shade*255).astype(np.uint8)
    alpha=np.rint(mask*a).astype(np.uint8)
    Image.fromarray(np.dstack([value,value,value,alpha])).save(directory/"mary-jane-insteps.webp",lossless=True)
