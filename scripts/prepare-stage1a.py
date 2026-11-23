"""Export the two offline ImageGen cases. Requires Pillow for asset preparation."""

import argparse
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw

CANVAS = (1024, 1536)
SPRITE_FRAME = (232, 0, 792, 1536)
HEAD_OUTLINE = [
    (330, 0), (645, 0), (645, 228), (575, 239), (568, 247), (567, 259),
    (553, 275), (536, 282), (515, 283), (496, 282), (474, 277),
    (450, 255), (446, 244), (410, 237), (330, 228),
]
LEFT_ARM = [
    (287, 361), (322, 377), (341, 383), (362, 391), (383, 398),
    (393, 400), (396, 425), (390, 460), (389, 496), (376, 548),
    (363, 602), (354, 656), (341, 725), (341, 887), (255, 887),
]
RIGHT_ARM = [
    (616, 400), (638, 397), (665, 388), (691, 380), (719, 364),
    (749, 889), (659, 889), (663, 737), (660, 682), (643, 622),
    (626, 563), (616, 519), (607, 469), (608, 449), (608, 436),
    (610, 425), (614, 413),
]
CASES = {
    # (source neckline y, uniform head scale, arm y translation, ankle tone)
    'nia': (310, .92, -32, (.86, .79, .74)),
    'iris': (308, .96, -31, (1.05, 1.10, 1.18)),
}


def cut_sprite(image, outlines):
    sampling = 3
    mask = Image.new('L', (CANVAS[0] * sampling, CANVAS[1] * sampling))
    draw = ImageDraw.Draw(mask)
    for outline in outlines:
        draw.polygon([(x * sampling, y * sampling) for x, y in outline], fill=255)
    mask = mask.resize(CANVAS, Image.Resampling.LANCZOS)
    image.putalpha(ImageChops.multiply(mask, image.getchannel('A')))
    return image.crop(SPRITE_FRAME)


def register_head(source, neckline, scale):
    center = 508
    target_neckline = 276
    inverse = 1 / scale
    return source.transform(
        CANVAS,
        Image.Transform.AFFINE,
        (inverse, 0, center - center * inverse, 0, inverse, neckline - target_neckline * inverse),
        Image.Resampling.BICUBIC,
    )


def remove_guide_fabric(sprite, start_y, end_y):
    # The temporary shirt is vermilion. Key only the small cuff/collar bands
    # where the registered pose render can spill past the hand-traced mask.
    pixels = sprite.load()
    for y in range(start_y, end_y):
        for x in range(sprite.width):
            red, green, blue, alpha = pixels[x, y]
            if alpha and red > 2.3 * green and red - green > 58:
                pixels[x, y] = red, green, blue, 0
    return sprite


def tint_ankles(ankles, tone):
    red, green, blue, alpha = ankles.split()
    channels = [
        image.point([min(255, round(value * multiplier)) for value in range(256)])
        for image, multiplier in zip((red, green, blue), tone)
    ]
    return Image.merge('RGBA', (*channels, alpha))


def export_case(input_dir, output_dir, template_ankles, name, registration):
    neckline, head_scale, arm_shift, ankle_tone = registration
    source = Image.open(input_dir / f'{name}-edit.png')
    if source.size != CANVAS or source.mode != 'RGBA':
        raise ValueError(f'{name}: expected an RGBA registration render at 1024×1536')
    head = remove_guide_fabric(cut_sprite(register_head(source, neckline, head_scale), [HEAD_OUTLINE]), 235, 285)
    arms = Image.new('RGBA', CANVAS)
    arms.paste(source, (0, arm_shift))
    arms = remove_guide_fabric(cut_sprite(arms, [LEFT_ARM, RIGHT_ARM]), 360, 425)
    ankles = tint_ankles(template_ankles, ankle_tone)
    for part, sprite in {'head': head, 'arms': arms, 'ankles': ankles}.items():
        sprite.save(output_dir / f'{name}-{part}.webp', quality=94, method=6)

    photo = Image.open(input_dir / f'{name}-photo.png').convert('RGB')
    photo.thumbnail((640, 960), Image.Resampling.LANCZOS)
    photo.save(output_dir / f'{name}-reference.webp', quality=91, method=6)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('input_dir', type=Path)
    args = parser.parse_args()
    assets = Path(__file__).resolve().parent.parent / 'assets'
    output = assets / 'stage1a'
    output.mkdir(exist_ok=True)
    template_ankles = Image.open(assets / 'avatar' / 'ankles.webp').convert('RGBA')
    for name, registration in CASES.items():
        export_case(args.input_dir, output, template_ankles, name, registration)
