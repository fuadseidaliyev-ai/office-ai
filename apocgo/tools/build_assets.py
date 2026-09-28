"""Build ApocGo sprites & textures from the concept-art reference (tools/reference.png).

    pip install pillow numpy "rembg[cpu]"
    python tools/build_assets.py

Objects are cut out with rembg (background removal), road decals are extracted by
colour keys (paint = bright, cracks = dark, blood = red) and ground/asphalt textures are
quilted from clean patches into seamless tiles. World units in the game == pixels of
the reference image, so everything is used at native size.
"""
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'assets'
REF = Image.open(Path(__file__).with_name('reference.png')).convert('RGB')
ARR = np.array(REF).astype(np.float32)
OUT.mkdir(exist_ok=True)

# name: (box, model)
OBJECTS = {
    'truck': ((720, 290, 950, 630), 'u2net'),
    'zombie1': ((688, 18, 768, 128), 'u2net'),
    'zombie2': ((1108, 122, 1192, 242), 'u2net'),
    'zombie3': ((642, 288, 722, 402), 'u2net'),
    'zombie4': ((1028, 338, 1108, 458), 'u2net'),
    'zombie5': ((512, 742, 602, 862), 'u2net'),
    'zombie6': ((1078, 782, 1158, 908), 'birefnet-general-lite'),
    'police': ((0, 230, 395, 440), 'u2net'),
    'bus': ((1265, 415, 1672, 775), 'birefnet-general-lite'),
    'billboard': ((1318, 165, 1672, 412), 'u2net'),
    'sign': ((55, 408, 345, 692), 'u2net'),
    'tree1': ((0, 118, 152, 302), 'birefnet-general-lite'),
    'tree2': ((1342, 0, 1502, 192), 'birefnet-general-lite'),
    'barrel1': ((400, 68, 460, 142), 'u2net'),
    'barrel2': ((1243, 48, 1302, 127), 'u2net'),
    'barrel3': ((373, 463, 427, 527), 'u2net'),
    'barrel4': ((1248, 138, 1307, 207), 'u2net'),
    'barrelLying1': ((408, 633, 507, 707), 'u2net'),
    'barrelLying2': ((1158, 273, 1252, 342), 'u2net'),
    'tire1': ((383, 283, 477, 367), 'u2net'),
    'tire2': ((1258, 613, 1342, 687), 'u2net'),
    'guardrail': ((48, 633, 387, 792), 'isnet-general-use'),
    'crate': ((1433, 693, 1512, 757), 'u2net'),
}


def cut_objects():
    import gc

    from rembg import new_session, remove
    # one model in memory at a time — they are ~200 MB each
    for model in dict.fromkeys(m for _, m in OBJECTS.values()):
        session = new_session(model)
        for name, (box, m) in OBJECTS.items():
            if m == model:
                cut_one(name, box, session, remove)
        del session
        gc.collect()


def cut_one(name, box, session, remove):
    out = np.array(remove(REF.crop(box), session=session))
    # crisp pixel-art edges: binary alpha, no halo
    out[..., 3] = np.where(out[..., 3] >= 140, 255, 0)
    img = Image.fromarray(out, 'RGBA')
    bb = img.getbbox()
    if bb:
        img = img.crop(bb)
    img.save(OUT / f'{name}.png')
    print(f'{name:14s} {img.size}')


def lum(a):
    return 0.3 * a[..., 0] + 0.59 * a[..., 1] + 0.11 * a[..., 2]


def ellipse_fade(h, w, edge=0.35):
    yy, xx = np.mgrid[0:h, 0:w]
    d = np.sqrt(((yy - h / 2 + .5) / (h / 2)) ** 2 + ((xx - w / 2 + .5) / (w / 2)) ** 2)
    return np.clip((1 - d) / edge, 0, 1)


def save_rgba(rgb, alpha, name):
    a = np.clip(alpha, 0, 1)
    rgba = np.dstack([np.clip(rgb, 0, 255), a * 255]).astype(np.uint8)
    img = Image.fromarray(rgba, 'RGBA')
    bb = img.getbbox()
    if bb:
        img = img.crop(bb)
    img.save(OUT / f'{name}.png')
    print(f'{name:14s} {img.size}')


def decals():
    def crop(box):
        x0, y0, x1, y1 = box
        return ARR[y0:y1, x0:x1]

    # road paint: bright pixels only
    for name, box in {'graffiti1': (505, 400, 705, 600), 'graffiti2': (1045, 510, 1190, 725)}.items():
        c = crop(box)
        a = (lum(c) - 92) / 28
        if name == 'graffiti1':
            # remove the lane dash running through the text (image x≈643-668)
            a[30:88, 138:163] = 0
            a[132:200, 138:163] = 0
        save_rgba(c, a, name)

    # HUD shotgun: lighter than the dark HUD panel behind it
    c = crop((1452, 847, 1645, 880))
    save_rgba(c, np.where(lum(c) > 48, 1.0, 0.0), 'shotgun')

    # cracks & broken asphalt: dark pixels only, faded at the crop border
    cracks = {'cracks1': (600, 590, 760, 705), 'cracks2': (870, 0, 1000, 130), 'cracks3': (1150, 690, 1300, 865),
              'cracks4': (540, 0, 700, 100), 'cracks5': (1000, 20, 1110, 150)}
    for name, box in cracks.items():
        c = crop(box)
        save_rgba(c, np.clip((48 - lum(c)) / 16, 0, 1) * ellipse_fade(*c.shape[:2], 0.5), name)

    # blood: red pixels only
    for name, box in {'blood1': (1075, 195, 1165, 275), 'blood2': (495, 600, 575, 680), 'blood3': (990, 840, 1070, 941)}.items():
        c = crop(box)
        save_rgba(c, (c[..., 0] - c[..., 1] - 28) / 22 * ellipse_fade(*c.shape[:2], 0.4), name)

    # the big collapsed hole, feathered into the surrounding asphalt
    c = crop((470, 95, 705, 280))
    save_rgba(c, ellipse_fade(*c.shape[:2], 0.3), 'collapse')


def quilt_texture(mask, regions, patch, count, name, grey=0.0, gain=1.0, size=384, seed=7):
    rng = np.random.default_rng(seed)
    srcs = []
    for x0, y0, x1, y1 in regions:
        for y in range(y0, y1 - patch, 6):
            for x in range(x0, x1 - patch, 6):
                if mask[y:y + patch, x:x + patch].mean() >= 0.93:
                    srcs.append(ARR[y:y + patch, x:x + patch])
    base = np.median(np.concatenate([s.reshape(-1, 3) for s in srcs[:400]]), axis=0)
    canvas = np.zeros((size, size, 3), np.float32)
    canvas[:] = base
    alpha = np.clip(ellipse_fade(patch, patch, 1.0) * 2.2, 0, 1)[..., None]
    for _ in range(count):
        s = srcs[rng.integers(len(srcs))]
        if rng.random() < .5:
            s = s[:, ::-1]
        y, x = rng.integers(size), rng.integers(size)
        ys = (np.arange(patch) + y) % size  # wrap-around => seamless tile
        xs = (np.arange(patch) + x) % size
        blk = canvas[np.ix_(ys, xs)]
        canvas[np.ix_(ys, xs)] = blk * (1 - alpha) + s * alpha
    if grey:
        g = lum(canvas)[..., None]
        canvas = canvas * (1 - grey) + g * grey
    canvas *= gain
    Image.fromarray(np.clip(canvas, 0, 255).astype(np.uint8)).save(OUT / f'{name}.png')
    print(f'{name:14s} ({size}, {size}) from {len(srcs)} patches')


def textures():
    r, g, b = ARR[..., 0], ARR[..., 1], ARR[..., 2]
    L = lum(ARR)
    dirt = (r - b > 38) & (r > g) & (L > 55)
    asph = (np.abs(r - b) < 34) & (L > 18) & (L < 125) & (g - b > -12)
    quilt_texture(asph, [(470, 0, 1230, 941)], 36, 1800, 'asphalt', grey=0.35, gain=1.06)
    quilt_texture(dirt, [(0, 120, 470, 941), (1250, 180, 1672, 941)], 24, 3000, 'dirt')


if __name__ == '__main__':
    import sys
    if '--no-cutout' not in sys.argv:
        cut_objects()
    decals()
    textures()
