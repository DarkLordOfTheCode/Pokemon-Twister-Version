#!/usr/bin/env python3
"""Generate the desert art: sand floor, cracked dune, and a cactus object.

Same recipe as gen_cave_tiles.py — 32x32 tiles painted in chunky 2px blocks from
a small palette, fixed seed so re-running produces identical files. The sand is
bright and warm so it reads as the opposite of the cold, dark cave next door.
"""
import random
from PIL import Image

OUT_TILES = 'public/assets/tiles'
OUT_OBJ = 'public/assets/objects'
T = 32

SAND = [(214, 184, 122), (222, 194, 134), (204, 173, 112), (230, 203, 146)]
SAND_W = [46, 26, 20, 8]
CRACK = (168, 138, 88)
CACTUS = [(58, 122, 68), (72, 142, 80), (46, 104, 58)]
OUTLINE = (44, 36, 28)


def block(px, x, y, w, h, c):
    for yy in range(y, min(y + h, px[1])):
        for xx in range(x, min(x + w, px[0])):
            if xx >= 0 and yy >= 0:
                px[2][xx, yy] = c


def new(w, h, bg=(0, 0, 0, 0)):
    im = Image.new('RGBA', (w, h), bg)
    return (w, h, im.load()), im


def sand(seed, cracked=False):
    rnd = random.Random(seed)
    px, im = new(T, T, SAND[0] + (255,))
    for y in range(0, T, 2):
        for x in range(0, T, 2):
            block(px, x, y, 2, 2, rnd.choices(SAND, SAND_W)[0] + (255,))
    # windblown ripples: short darker dashes, all leaning the same way
    for _ in range(5):
        x, y = rnd.randrange(0, T - 10, 2), rnd.randrange(0, T - 2, 2)
        for i in range(rnd.randrange(3, 6)):
            block(px, x + i * 2, y, 2, 2, (198, 167, 108, 255))
    if cracked:
        # a dried-mud crack: a wandering dark line with a couple of branches
        x, y = rnd.randrange(6, T - 6, 2), 0
        while y < T:
            block(px, x, y, 2, 2, CRACK + (255,))
            if rnd.random() < 0.25:
                bx = x
                for _ in range(rnd.randrange(2, 4)):
                    bx += rnd.choice([-2, 2])
                    block(px, max(0, min(T - 2, bx)), y, 2, 2, CRACK + (255,))
            y += 2
            x = max(2, min(T - 4, x + rnd.choice([-2, 0, 0, 2])))
    return im


def cactus(seed):
    """A saguaro that fills its tile and rises above it, bottom-anchored like the
    tree and the rock so it overlaps whatever is behind it."""
    rnd = random.Random(seed)
    W, H = 34, 44
    px, im = new(W, H)
    body = {}

    def limb(x0, y0, w, h):
        for y in range(y0, y0 + h, 2):
            for x in range(x0, x0 + w, 2):
                depth = (x - x0) / max(1, w)
                c = CACTUS[2] if depth > 0.66 else (CACTUS[1] if depth < 0.33 else CACTUS[0])
                body[(x, y)] = c
                block(px, x, y, 2, 2, c + (255,))

    limb(14, 8, 6, H - 10)          # trunk
    limb(6, 20, 4, 12); limb(6, 20, 10, 4)    # left arm, elbow up
    limb(24, 14, 4, 14); limb(20, 14, 8, 4)   # right arm, higher
    # spine dots
    for _ in range(14):
        k = rnd.choice(list(body))
        block(px, k[0], k[1], 2, 2, (196, 214, 158, 255))
    for (x, y) in list(body):
        for dx, dy in ((-2, 0), (2, 0), (0, -2), (0, 2)):
            n = (x + dx, y + dy)
            if n not in body and 0 <= n[0] < W and 0 <= n[1] < H:
                block(px, n[0], n[1], 2, 2, OUTLINE + (255,))
    return im


if __name__ == '__main__':
    sand(23).save(f'{OUT_TILES}/sand.png')
    sand(23, cracked=True).save(f'{OUT_TILES}/dune.png')
    cactus(5).save(f'{OUT_OBJ}/cactus.png')
    print('wrote sand.png, dune.png, cactus.png')
