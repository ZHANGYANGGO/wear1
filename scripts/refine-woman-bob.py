"""Prepare the revised only-for-Woman-Bob pose and independent wardrobe layers.

Pass the project directory and one of pilot, plain, special, or all. The source
layers remain the Stage 3A artwork. Run with Pillow and NumPy.
"""
import json
from pathlib import Path
import sys

import numpy as np
from PIL import Image, ImageFilter

ROOT = Path(sys.argv[1])
POSE = json.loads((ROOT / "artwork/woman-bob/pose.json").read_text(encoding="utf8"))
SIZE = (560, 1536)
BODY = ROOT / "assets/local-avatar/woman-bob"
CLOTHES = ROOT / "assets/wardrobe/tryon/woman-bob"
LEGACY = ROOT / "assets/avatar"
PILOT = ("navy-shirt", "navy-shirt-back", "light-blue-jeans", "white-platform-sneakers")
PLAIN = ("purple-graphic-tee", "gray-joggers", "black-trousers", "ivory-mary-janes", "mary-jane-insteps")
SPECIAL = ("floral-maxi", "white-puffer", "white-puffer-back")
DEFAULT = ("brick-tee", "blue-denim", "cream-trainers")


def load(folder, name):
    return Image.open(folder / (name + ".webp")).convert("RGBA")


def save(folder, name, layer):
    folder = folder / "refined"
    folder.mkdir(exist_ok=True)
    layer.save(folder / (name + ".webp"), quality=96, method=4, exact=True)


def pose_mesh():
    """The same measured correspondence registers body and separate silhouettes."""
    rows = np.array(POSE["rows"], float)
    source_x = POSE["columns"]
    grid_x = np.arange(0, SIZE[0]+1, 8)
    mesh = []
    def row(at):
        delta = [np.interp(at, rows[:, 0], values) for values in rows[:, 1:].T]
        dx, dy = np.split(np.asarray(delta), 2)
        return list(zip(grid_x + np.interp(grid_x, source_x, dx),
                        at + np.interp(grid_x, source_x, dy)))

    top = row(0)
    for y in range(0, SIZE[1], 8):
        bottom = row(y + 8)
        for index, x in enumerate(grid_x[:-1]):
            quad = (*top[index], *bottom[index], *bottom[index + 1], *top[index + 1])
            mesh.append(((x, y, x + 8, y + 8), quad))
        top = bottom
    return mesh


def aligned(layer):
    return layer.transform(SIZE, Image.Transform.MESH, MESH, Image.Resampling.BICUBIC)


def face_layer():
    # The hair silhouette and most facial pixels are kept from the original.
    face = load(BODY, "head")
    pixels = np.array(face)
    y, x = np.mgrid[:SIZE[1], :SIZE[0]]
    extra_red = (y > 241) & (pixels[:, :, 0].astype(int) - pixels[:, :, 1] > 69)
    pixels[:, :, 3][extra_red] = 0
    face = Image.fromarray(pixels)
    patch = ROOT / "artwork/woman-bob/expression.webp"
    if patch.exists():
        face.alpha_composite(Image.open(patch).convert("RGBA"))
    return face


def ankle_layer():
    ankles = np.array(load(BODY, "ankles"))
    # The original lower ankle incorporates an old dark shoe lining.
    for y in range(1436,1468):
        for centre in (161,359):
            area = slice(centre - 28, centre + 29)
            original = ankles[y, area, :3].astype(float)
            clean = ankles[1420, area, :3].astype(float) * .95
            blend = np.clip((y - 1436) / 9, 0, 1)
            darker_than_skin = np.clip((138 - original[:,0]) / 90,0,1)
            opacity = (blend * darker_than_skin)[:,None]
            ankles[y, area, :3] = original * (1-opacity) + clean * opacity
    return Image.fromarray(ankles)


def collar_skin():
    """Use the fitted illustration for shading within the existing collar mask."""
    chest = load(CLOTHES, "neckline")
    light = Image.open(ROOT / "artwork/woman-bob/collar-light.webp").convert("RGBA")
    shaded = Image.composite(light, chest, light.getchannel("A"))
    shaded.putalpha(chest.getchannel("A"))
    return shaded


def cloth_finish(layer, amounts):
    """Soften fine raster texture consistently without blurring edges or motifs."""
    blurred = layer.filter(ImageFilter.GaussianBlur(.65))
    ink = Image.blend(layer, blurred, amounts)
    ink.putalpha(layer.getchannel("A"))
    return ink


def make_body():
    save(BODY, "head", aligned(face_layer()))
    save(BODY, "arms", aligned(cloth_finish(load(BODY, "arms"), .36)))
    save(BODY, "ankles", aligned(ankle_layer()))
    save(CLOTHES, "neckline", aligned(collar_skin()))
    for name in DEFAULT:
        save(BODY, name, aligned(load(LEGACY, name)))


def make_group(names):
    for name in names:
        finish = .14 if name in ("navy-shirt", "purple-graphic-tee", "floral-maxi") else .26
        save(CLOTHES, name, aligned(cloth_finish(load(CLOTHES, name), finish)))


if __name__ == "__main__":
    MESH = pose_mesh()
    section = sys.argv[2]
    if section in ("pilot", "all"):
        make_body()
        make_group(PILOT)
    if section in ("plain", "all"):
        make_group(PLAIN)
    if section in ("special", "all"):
        make_group(SPECIAL)
