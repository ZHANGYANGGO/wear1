"""Rebuild the short-haired woman's transparent clothing layers from local illustrations.

Run with Pillow and NumPy. Source coordinates in landmarks.json are fractions of
the cropped drawing. Destination coordinates are pixels on the 560 x 1536 pose.
"""
import json
from pathlib import Path
from tempfile import NamedTemporaryFile

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
MASTERS = ROOT / "artwork/woman-bob"
OUTPUT = ROOT / "assets/wardrobe/tryon/woman-bob"
CUT = json.loads((MASTERS / "landmarks.json").read_text(encoding="utf8"))
SIZE = (560, 1536)


def source(name):
    return Image.open(MASTERS / (name + ".png")).convert("RGBA")


def save(name, image):
    # A live browser can continue reading the previous complete file during export.
    with NamedTemporaryFile(dir=OUTPUT, suffix=".tmp", delete=False) as handle:
        temporary = Path(handle.name)
    try:
        image.save(temporary, "WEBP", quality=96, method=6, exact=True)
        temporary.replace(OUTPUT / (name + ".webp"))
    finally:
        temporary.unlink(missing_ok=True)


def paired(landmarks):
    points = []
    for u, v, x, y in landmarks:
        points.append((u, v, x, y))
        if u != .5:
            points.append((1 - u, v, 550 - x, y))
    return points


def radial_kernel(points, controls):
    distances = np.sum((points[:, None] - controls[None, :]) ** 2, axis=-1)
    return distances * np.log(np.maximum(distances, 1e-12))


def warp(image, landmarks, region):
    """Fit an inverse thin-plate spline and sample the drawing on a bicubic mesh."""
    origin = np.array([[x, y] for _, _, x, y in landmarks], float)
    target = np.array([[u * (image.width - 1), v * (image.height - 1)]
                       for u, v, _, _ in landmarks], float)
    offset = [275, region[0]]
    origin = (origin - offset) / 400
    affine = np.column_stack([np.ones(len(landmarks)), origin])
    kernel = radial_kernel(origin, origin) + np.eye(len(landmarks)) * .00002
    system = np.block([[kernel, affine], [affine.T, np.zeros((3, 3))]])
    weights = np.linalg.solve(system, np.vstack((target, np.zeros((3, 2)))))

    xs = list(range(0, SIZE[0] + 1, 8))
    ys = list(range(region[0], region[1] + 8, 8))
    xx, yy = np.meshgrid(xs, ys)
    query = (np.column_stack([xx.ravel(), yy.ravel()]) - offset) / 400
    basis = np.column_stack([radial_kernel(query, origin), np.ones(len(query)), query])
    mapped = (basis @ weights).reshape(len(ys), len(xs), 2)

    mesh = []
    for i in range(len(ys) - 1):
        for j in range(len(xs) - 1):
            quad = mapped[[i, i+1, i+1, i], [j, j, j+1, j+1]].flatten()
            mesh.append(((xs[j], ys[i], xs[j+1], ys[i+1]), tuple(quad)))
    return image.transform(SIZE, Image.Transform.MESH, mesh, Image.Resampling.BICUBIC)


def split_collar(image, points):
    mask = Image.new("L", image.size)
    polygon = [(round(u * image.width), round(v * image.height)) for u, v in points]
    ImageDraw.Draw(mask).polygon(polygon, fill=255)
    clear = Image.new("RGBA", image.size)
    return Image.composite(clear, image, mask), Image.composite(image, clear, mask)


def make_upper_layers():
    for name, landmarks in CUT["upper"].items():
        image = source(name)
        pins = paired(landmarks)
        region = (195, 1500 if name == "floral-maxi" else 820)
        if name == "navy-shirt":
            image, rear = split_collar(image, [(.32, -.01), (.68, -.01), (.625, .057), (.38, .057)])
            save(name + "-back", warp(rear, pins, region))
        save(name, warp(image, pins, region))


def drape_coat(drawing):
    """Keep quilting continuous from collar to hem, including the two cuffs."""
    fractions, heights, widths = map(np.array, zip(*CUT["coat"]))

    def sample_row(y):
        width = np.interp(y, heights, widths)
        v = np.interp(y, heights, fractions) * (drawing.height - 1)
        return ((.5 - 275/width) * drawing.width, v, (.5 + 285/width) * drawing.width)

    mesh = []
    for y in range(208, 775, 2):
        left, top, right = sample_row(y)
        next_left, bottom, next_right = sample_row(y + 2)
        mesh.append(((0, y, SIZE[0], y+2), (left, top, next_left, bottom,
                                            next_right, bottom, right, top)))
    return drawing.transform(SIZE, Image.Transform.MESH, mesh, Image.Resampling.BICUBIC)


def make_coat():
    opening = [(.346, .004), (.65, .004), (.63, .032), (.58, .047),
               (.50, .05), (.42, .044), (.375, .031)]
    front, rear = split_collar(source("white-puffer"), opening)
    save("white-puffer-back", drape_coat(rear))
    front = drape_coat(front)
    cloth = np.asarray(front)
    lining = np.zeros_like(cloth)
    # Draw shaded gussets solely inside the two narrow underarm openings.
    for y in range(424, 548):
        row = cloth[y]
        solid = np.flatnonzero(row[:, 3] > 240)
        for i in np.flatnonzero(np.diff(solid) > 2):
            left, right = solid[i:i+2]
            if right - left > 30:
                continue
            for x in range(left, right + 1):
                fraction = (x - left) / (right - left)
                color = row[left-2, :3] * (1-fraction) + row[right+2, :3] * fraction
                shade = .92 - .12 * np.sin(fraction * np.pi)
                lining[y, x, :3] = np.clip(color * shade, 0, 255)
                lining[y, x, 3] = 255
    shell = Image.fromarray(lining)
    shell.alpha_composite(front)
    save("white-puffer", shell)


def make_neckline():
    """Feather the new neckline into the existing neck above the original crew-neck edge."""
    head = np.asarray(Image.open(ROOT / 'assets/local-avatar/woman-bob/head.webp').convert('RGBA'))
    mask = Image.new('L', SIZE)
    ImageDraw.Draw(mask).polygon([(239, 232), (313, 232), (320, 244), (340, 250), (365, 263), (369, 289), (353, 325), (199, 325), (184, 285), (192, 263), (217, 250), (232, 242)], fill=255)
    yy, xx = np.mgrid[:1536, :560]
    nx = np.clip((xx - 188) / 181, 0, 1)
    samples = np.asarray(Image.fromarray(head[246:247, 232:321, :3]).filter(ImageFilter.GaussianBlur(3)))[0].astype(float)
    rgb = np.stack([np.interp(nx, np.linspace(0, 1, len(samples)), samples[:, i]) for i in range(3)], axis=-1)
    fade = np.clip((yy - 245) / 80, 0, 1)[:, :, None]
    rgb = rgb * (1 - fade * 0.4) + np.array([228, 177, 143]) * fade * 0.4
    skin_alpha = np.array(mask.filter(ImageFilter.GaussianBlur(0.6)), float)
    in_head = head[:, :, 3] > 20
    crossfade = np.clip((yy - 238) / 15, 0, 1)
    skin_alpha *= np.where(in_head, crossfade, 1)
    save('neckline', Image.fromarray(np.dstack((rgb.astype('uint8'), skin_alpha.astype('uint8')))))


def make_trousers():
    """Pin each waistband, crotch and ankle independently."""
    for name, rise, left, inner in [('black-trousers', .294, .163, .449),
                                   ('light-blue-jeans', .224, .143, .37),
                                   ('gray-joggers', .345, .143, .466)]:
        im = source(name)
        pins = [(0.5, 0, 273, 547), (left, 0.012, 155, 551), (1 - left, 0.012, 394, 551),
                (0.06, 0.14, 131, 664), (0.94, 0.14, 414, 664), (0.02, rise, 115, 772), (0.98, rise, 431, 772),
                (0.494, rise, 269, 771), (0.02, 0.58, 112, 1036), (0.98, 0.58, 423, 1036),
                (0.01, 0.985, 102, 1437), (0.99, 0.985, 418, 1436)]
        pins.extend([(inner, 0.98, 224, 1436), (1 - inner, 0.98, 300, 1436),
                     ((inner + 0.49) / 2, 0.53, 242, 991), (1 - (inner + 0.49) / 2, 0.53, 290, 991),
                     (0.21, 0.99, 161, 1439), (0.78, 0.99, 362, 1439)])
        save(name, warp(im, pins, (505, 1462)))


def pieces(im):
    for box in [(0, 0, im.width // 2, im.height), (im.width // 2, 0, im.width, im.height)]:
        piece = im.crop(box)
        yield piece.crop(piece.getchannel('A').point(lambda a: 255 if a > 110 else 0).getbbox())


def make_shoes():
    """Trace the inner lining, retain the real strap and sample skin from the upper ankle."""
    sneakers = Image.new('RGBA', SIZE)
    for p, cx in zip(pieces(source('white-platform-sneakers')), [158, 360]):
        p = p.resize((97, 130), Image.Resampling.LANCZOS).rotate(4 if cx < 200 else -4, Image.Resampling.BICUBIC, expand=True)
        sneakers.alpha_composite(p, (cx - p.width // 2, 1529 - p.height))
    save('white-platform-sneakers', sneakers)
    im = source('ivory-mary-janes')
    mask = Image.new('L', im.size, 0)
    draw = ImageDraw.Draw(mask)
    left, lower = CUT['shoeOpenings']
    for points in [left, lower]:
        for flip in [False, True]:
            draw.polygon([(421 - x if flip else x, y) for x, y in points], fill=255)
    mask = mask.filter(ImageFilter.GaussianBlur(0.65))
    im = Image.composite(Image.new('RGBA', im.size), im, mask)
    shoe = Image.new('RGBA', SIZE)
    foot = Image.new('RGBA', SIZE)
    ankles = np.asarray(Image.open(ROOT / 'assets/local-avatar/woman-bob/ankles.webp').convert('RGBA'))
    for p, cx, ax in zip(pieces(im), [159, 360], [161, 359]):
        w, h = (92, 129)
        x = cx - w // 2
        y = 1529 - h
        shoe.alpha_composite(p.resize((w, h), Image.Resampling.LANCZOS), (x, y))
        original_pair = list(pieces(source('ivory-mary-janes')))[0 if cx < 200 else 1]
        silhouette = np.array(original_pair.resize((w, h), Image.Resampling.LANCZOS).getchannel('A'))
        a = np.zeros((h, w, 4), np.uint8)
        for j in range(99):
            us = np.arange(w)
            centre = w * (0.54 if cx < 200 else 0.46)
            unit = (us - centre) / (w * 0.43)
            sx = np.clip(ax + unit * 17, ax - 17, ax + 17)
            tint = np.stack([np.interp(sx, np.arange(560), ankles[1420, :, i]) for i in range(3)], axis=1)
            tint = tint * 0.55 + np.array([228, 174, 133]) * 0.45
            a[j, :, :3] = np.clip(tint + (np.sin(j / 99 * np.pi) * 5 - 8 * unit ** 2)[:, None], 0, 255)
            a[j, :, 3] = silhouette[j]
        foot.alpha_composite(Image.fromarray(a), (x, y))
    save('ivory-mary-janes', shoe)
    save('mary-jane-insteps', foot)


if __name__ == "__main__":
    OUTPUT.mkdir(parents=True, exist_ok=True)
    make_neckline()
    make_upper_layers()
    make_coat()
    make_trousers()
    make_shoes()
