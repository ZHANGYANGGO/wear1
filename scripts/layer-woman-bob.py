"""Export one fully illustrated master into six registered transparent layers.

The source is 758 x 2076. Seam points follow the neckline, sleeve openings,
waistband, cuffs and shoe openings on that drawing. Only one sprite owns
each visible pixel of the master, preventing transparent seams at default fit.
"""
import argparse
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
SIZE = (560, 1536)
SOURCE_SIZE = (758, 2076)
SCALE = 1508 / 2052
OFFSET = (12, 4)
SEAMS = {
    "head": [(0,0),(758,0),(758,298),(455,298),(445,321),(438,332),
             (451,340),(449,351),(438,362),(418,369),(393,373),
             (369,373),(346,369),(327,361),(314,351),(306,339),
             (313,329),(304,307),(0,304)],
    "left_arm": [(0,533),(136,532),(152,539),(172,546),(197,553),
                 (216,558),(219,620),(215,688),(207,747),(191,795),
                 (175,851),(148,934),(139,1015),(141,1112),(149,1181),(0,1188)],
    "right_arm": [(524,557),(541,552),(561,546),(584,541),(758,537),
                  (758,1185),(580,1185),(583,1100),(588,1020),
                  (585,943),(568,858),(547,793),(521,724),(510,665),(511,603)],
    "top": [(0,311),(758,311),(758,771),(530,757),(515,764),
            (487,770),(451,778),(419,782),(379,783),(338,780),
            (294,779),(249,779),(214,772),(0,772)],
    "left_pant_cuff": [(0,0),(330,0),(330,1920),(276,1920),
                      (246,1918),(223,1918),(195,1915),(174,1913),(0,1913)],
    "right_pant_cuff": [(330,0),(758,0),(758,1924),(513,1924),
                       (489,1926),(457,1926),(430,1924),(401,1922),(330,1920)],
    "left_shoe": [(0,1949),(173,1948),(182,1942),(194,1933),(209,1930),
                  (224,1932),(235,1938),(241,1948),(249,1956),(330,1956),
                  (330,2076),(0,2076)],
    "right_shoe": [(330,1951),(395,1952),(404,1966),(416,1963),(429,1947),
                   (441,1938),(455,1935),(469,1936),(483,1941),(497,1948),
                   (758,1949),(758,2076),(330,2076)],
}


def normalized(image, resample):
    width, height = (round(value * SCALE) for value in SOURCE_SIZE)
    output = Image.new(image.mode, SIZE)
    output.paste(image.resize((width,height),resample), OFFSET)
    return output


def region(*names):
    mask = Image.new("L",SOURCE_SIZE)
    draw = ImageDraw.Draw(mask)
    for name in names:
        draw.polygon(SEAMS[name],fill=255)
    return np.asarray(normalized(mask,Image.Resampling.NEAREST)) != 0


def export(source, destination):
    drawing = Image.open(source).convert("RGBA")
    if drawing.size != SOURCE_SIZE:
        raise ValueError(f"Expected original illustration grid {SOURCE_SIZE}")
    drawing = normalized(drawing,Image.Resampling.LANCZOS)
    alpha = np.asarray(drawing.getchannel("A"))
    drawing.putalpha(Image.fromarray(np.where(alpha >= 10, alpha, 0).astype("uint8")))
    alpha = np.asarray(drawing.getchannel("A"))

    head = region("head")
    arms = region("left_arm","right_arm") & ~head
    shirt = region("top") & ~head & ~arms
    jeans = region("left_pant_cuff","right_pant_cuff") & ~(head | arms | shirt)
    shoes = region("left_shoe","right_shoe") & ~(head | arms | shirt | jeans)
    ankles = ~(head | arms | shirt | jeans | shoes)
    groups = {"ankles":ankles,"head":head,"arms":arms,"cream-trainers":shoes,
              "blue-denim":jeans,"brick-tee":shirt}
    destination.mkdir(parents=True,exist_ok=True)
    assembled = Image.new("RGBA",SIZE)
    for name, mask in groups.items():
        sprite = drawing.copy()
        sprite.putalpha(Image.fromarray(np.where(mask,alpha,0).astype("uint8")))
        visible = sprite.getchannel("A").point(lambda value: 255 if value > 32 else 0)
        if not visible.getbbox():
            raise ValueError(f"Empty sprite: {name}")
        print(name,visible.getbbox())
        sprite.save(destination / (name + ".webp"),lossless=True,method=6)
        assembled.alpha_composite(sprite)
    transparent = np.array(drawing)
    transparent[alpha == 0] = 0
    if not np.array_equal(transparent,np.array(assembled)):
        raise ValueError("Exported layers do not reconstruct the normalized drawing")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=ROOT)
    root = parser.parse_args().root
    export(root / "artwork/woman-bob/rebuild-master.png", root / "assets/local-avatar/woman-bob/rebuilt")
