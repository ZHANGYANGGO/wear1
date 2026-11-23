"""Adjust two layers of the existing 560 × 1536 illustrated pose.

Offsets are in canvas pixels; positive x moves right in the viewer's frame.
Run with NumPy and Pillow. The original sprites are the inputs.
"""
import argparse
from pathlib import Path

import numpy as np
from PIL import Image


# Row, inner edge shift, outer edge shift. Equal shifts preserve limb width.
ARMS = (
    [(422,0,0),(484,1,3),(532,5,8),(570,8,11),(622,10,12),
     (686,9,10),(736,7,7),(874,7,7)],
    [(422,0,0),(482,0,-2),(525,-1,-7),(566,0,-10),(615,-2,-8),
     (673,-4,-7),(732,-6,-6),(874,-6,-6)],
)
LEGS = (
    [(802,0,0),(896,1,1),(971,2,2),(1040,5,5),(1107,6,6),
     (1170,4,4),(1260,2,2),(1375,0,0)],
    [(802,0,0),(884,-2,-2),(954,-4,-4),(1035,-8,-8),(1096,-7,-7),
     (1170,-4,-4),(1260,-2,-2),(1375,0,0)],
)


def smooth_offsets(controls, height):
    result = np.zeros((height, 2))
    for left, right in zip(controls, controls[1:]):
        start, *first = left
        end, *last = right
        t = np.linspace(0, 1, end-start, endpoint=False)[:,None]
        t = t*t*(3-2*t)
        result[start:end] = np.asarray(first)*(1-t) + np.asarray(last)*t
    return result


def relocate(image, controls):
    original = np.asarray(image)
    height, width = original.shape[:2]
    result = original.copy()
    for side, points in enumerate(controls):
        midpoint = width // 2
        start, end = (0, midpoint) if side == 0 else (midpoint, width)
        x = np.arange(start, end)
        offsets = smooth_offsets(points, height)
        for y in np.flatnonzero(np.any(offsets,axis=1)):
            source = original[y, start:end].astype(float)
            occupied = x[source[:,3] > 32]
            if len(occupied) < 2:
                continue
            low, high = occupied[0], occupied[-1]
            inner, outer = offsets[y]
            left, right = (outer, inner) if side == 0 else (inner, outer)
            original_x = np.interp(x, [start, low+left, high+right, end-1],
                                    [start, low, high, end-1]) - start
            # Interpolate premultiplied colors to avoid a dark fringe.
            source[:,:3] *= source[:,3:4]/255
            pixels = np.stack([np.interp(original_x, x-start, channel) for channel in source.T],axis=1)
            np.divide(pixels[:,:3]*255,pixels[:,3:4],out=pixels[:,:3],where=pixels[:,3:4]>0)
            result[y,start:end] = np.rint(pixels).clip(0,255).astype(np.uint8)
    return Image.fromarray(result)


def main():
    args = argparse.ArgumentParser(description=__doc__)
    args.add_argument("--root",type=Path,default=Path(__file__).resolve().parents[1])
    root = args.parse_args().root
    art = root / "assets/local-avatar/woman-bob/rebuilt"
    for name, controls in [("arms",ARMS),("blue-denim",LEGS)]:
        source = Image.open(art / (name+".webp")).convert("RGBA")
        result = relocate(source,controls)
        result.save(art / (name+"-pose-tweak.webp"),lossless=True,method=6)


if __name__ == "__main__":
    main()
