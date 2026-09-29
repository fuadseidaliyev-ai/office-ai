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


# ---------------------------------------------------------------- road obstacles
# Big obstacles come from the road references in tools/obstacles/*.png. Each gets a PNG
# plus a coarse collision mask (so hits match what is drawn, not a bounding box),
# written to src/game/masks.js.

OBSTACLES = {
    # name: (source file, crop box, how: 'cutout' | 'patch')
    'obstTree': ('tree.png', (650, 220, 1170, 910), 'cutout'),
    'obstCars': ('cars.png', (80, 260, 610, 810), 'cutout'),
    'obstRocks': ('rocks.png', (630, 362, 1195, 830), 'cutout'),
    'obstHole': ('hole.png', (675, 375, 1075, 765), 'patch'),
}
MASK_CELL = 20  # source px per collision cell


def obstacles():
    import gc
    import json

    from rembg import new_session, remove
    session = new_session('birefnet-general-lite')
    masks = {}
    for name, (src, box, how) in OBSTACLES.items():
        img = Image.open(Path(__file__).parent / 'obstacles' / src).convert('RGB').crop(box)
        a = np.array(img).astype(np.float32)
        if how == 'cutout':
            out = np.array(remove(img, session=session))
            alpha = out[..., 3] >= 140
            out[..., 3] = np.where(alpha, 255, 0)
            solid = alpha
        else:
            # a piece of broken road: fade into our asphalt; the dark pit is what hurts
            fade = ellipse_fade(*a.shape[:2], 0.45)
            out = np.dstack([a, fade * 255]).astype(np.uint8)
            solid = (lum(a) < 46) & (ellipse_fade(*a.shape[:2], 1.0) > 0.42)
        # trim to the visible bounding box
        ys, xs = np.nonzero(out[..., 3] > 0)
        y0, y1, x0, x1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
        out, solid = out[y0:y1, x0:x1], solid[y0:y1, x0:x1]
        Image.fromarray(out, 'RGBA').save(OUT / f'{name}.png')
        # coarse mask: a cell is solid when enough of it is covered (thin twigs don't count)
        h, w = solid.shape
        rows = []
        for cy in range(0, h, MASK_CELL):
            row = ''
            for cx in range(0, w, MASK_CELL):
                cov = solid[cy:cy + MASK_CELL, cx:cx + MASK_CELL].mean()
                row += '#' if cov >= (0.3 if how == 'patch' else 0.4) else '.'
            rows.append(row)
        masks[name] = {'w': int(w), 'h': int(h), 'cell': MASK_CELL, 'rows': rows}
        print(f'{name:14s} {w}x{h}  mask {len(rows[0])}x{len(rows)}')
    del session
    gc.collect()
    js = ROOT / 'src' / 'game' / 'masks.js'
    js.write_text(
        '// Generated by tools/build_assets.py — collision masks of the big road obstacles.\n'
        '// Each row is a string of cells (MASK_CELL source px square): "#" solid, "." free.\n\n'
        f'export const MASKS = {json.dumps(masks, indent=2)};\n'
    )


# ---------------------------------------------------------------- pickups
# The three core resources as they lie on the road (tools/pickups/*.png).

PICKUP_ART = {
    'pickScrap': ('parts.png', (470, 480, 790, 750)),
    'pickFood': ('food.png', (470, 480, 700, 740)),
    'pickDogFood': ('dogfood.png', (530, 470, 730, 720)),
}


def pickups():
    from rembg import new_session, remove
    session = new_session('birefnet-general-lite')
    for name, (src, box) in PICKUP_ART.items():
        img = Image.open(Path(__file__).parent / 'pickups' / src).convert('RGB').crop(box)
        out = np.array(remove(img, session=session))
        out[..., 3] = np.where(out[..., 3] >= 140, 255, 0)
        res = Image.fromarray(out, 'RGBA')
        res = res.crop(res.getbbox())
        res.save(OUT / f'{name}.png')
        print(f'{name:14s} {res.size}')


# ---------------------------------------------------------------- dog gunner
# tools/dog/gunner.png: the truck with the dog standing at a mounted machine gun.
# Produces the truck without the dog (the bed is retouched) and a separate
# "turret" sprite (dog + gun) that the game rotates toward its target.

GUNNER_TRUCK_BOX = (735, 505, 935, 833)  # truck in the reference
GUNNER_DOG_BOX = (795, 560, 880, 775)    # dog crop for background removal
GUN_BARREL = (831, 575, 840, 600)        # barrel (x0, y0, x1, y1), reference coords (below the flash)
GUN_BODY = (827, 598, 844, 642)          # receiver under the dog's paws
TURRET_PIVOT = (836, 680)                # the dog turns around its shoulders


def gunner():
    import cv2
    from rembg import new_session, remove
    ref = Image.open(Path(__file__).parent / 'dog' / 'gunner.png').convert('RGB')
    arr = np.array(ref)

    # dog cutout (birefnet keeps the dog, drops the busy truck behind it)
    s = new_session('birefnet-general-lite')
    dog = np.array(remove(ref.crop(GUNNER_DOG_BOX), session=s))
    del s
    dog_alpha = np.zeros(arr.shape[:2], bool)
    x0, y0 = GUNNER_DOG_BOX[:2]
    dog_alpha[y0:y0 + dog.shape[0], x0:x0 + dog.shape[1]] = dog[..., 3] >= 140

    gun_alpha = np.zeros(arr.shape[:2], bool)
    for bx0, by0, bx1, by1 in (GUN_BARREL, GUN_BODY):
        gun_alpha[by0:by1, bx0:bx1] = True

    # turret sprite: gun under the dog, in a canvas centred on the pivot
    tx0, ty0, tx1, ty1 = 790, 556, 884, 780
    px, py = TURRET_PIVOT
    half_w = max(px - tx0, tx1 - px)
    half_h = max(py - ty0, ty1 - py)
    tur = np.zeros((half_h * 2, half_w * 2, 4), np.uint8)
    for mask in (gun_alpha, dog_alpha):
        ys, xs = np.nonzero(mask[ty0:ty1, tx0:tx1])
        ys, xs = ys + ty0, xs + tx0
        tur[ys - py + half_h, xs - px + half_w, :3] = arr[ys, xs]
        tur[ys - py + half_h, xs - px + half_w, 3] = 255
    Image.fromarray(tur, 'RGBA').save(OUT / 'dogGunner.png')

    # truck without dog / gun / muzzle flash: remove background, then retouch the bed
    s = new_session('u2net')
    truck = np.array(remove(ref.crop(GUNNER_TRUCK_BOX), session=s))
    del s
    bx, by = GUNNER_TRUCK_BOX[:2]
    hole = (dog_alpha | gun_alpha)[by:by + truck.shape[0], bx:bx + truck.shape[1]]
    region = arr[by:by + truck.shape[0], bx:bx + truck.shape[1]].astype(np.float32)
    # muzzle flash over the cab roof (reference y 510..580, around the barrel)
    flash = np.zeros_like(hole)
    fy0, fy1 = 510 - by, 582 - by
    fx0, fx1 = 812 - bx, 862 - bx
    flash[fy0:fy1, fx0:fx1] = (lum(region[fy0:fy1, fx0:fx1]) > 120) | (region[fy0:fy1, fx0:fx1, 0] - region[fy0:fy1, fx0:fx1, 2] > 60)
    flash = cv2.dilate(flash.astype(np.uint8), np.ones((5, 5), np.uint8)) > 0
    hole = cv2.dilate(hole.astype(np.uint8), np.ones((5, 5), np.uint8)) > 0
    rgb = truck[..., :3].copy()
    # the bed: fill with the same row of the bed a bit to the left (real texture, no smear)
    shift = 40
    ys, xs = np.nonzero(hole | flash)
    ok = (xs - shift >= 0) & ~(hole | flash)[ys, np.clip(xs - shift, 0, None)]
    rgb[ys[ok], xs[ok]] = rgb[ys[ok], xs[ok] - shift]
    rest = (hole | flash).copy()
    rest[ys[ok], xs[ok]] = False
    rgb = cv2.inpaint(rgb, rest.astype(np.uint8), 5, cv2.INPAINT_TELEA)
    truck[..., :3] = rgb
    hole = hole | flash
    truck[..., 3] = np.where(truck[..., 3] >= 140, 255, 0)
    truck[hole, 3] = 255  # retouched bed stays opaque
    img = Image.fromarray(truck, 'RGBA')
    img = img.crop(img.getbbox())
    img.save(OUT / 'truckGun.png')
    # where the turret pivot sits relative to the truck sprite's centre
    bb = Image.fromarray(truck, 'RGBA').getbbox()
    cx = bx + bb[0] + img.width / 2
    cy = by + bb[1] + img.height / 2
    print(f'truckGun {img.size}  dogGunner {tur.shape[1]}x{tur.shape[0]}  pivot offset {px - cx:.1f},{py - cy:.1f}')


if __name__ == '__main__':
    import sys
    if '--gunner' in sys.argv:
        gunner()
        sys.exit()
    if '--pickups' in sys.argv:
        pickups()
        sys.exit()
    if '--obstacles' in sys.argv:
        obstacles()
        sys.exit()
    if '--no-cutout' not in sys.argv:
        cut_objects()
    decals()
    textures()
