#!/usr/bin/env python3
"""Generate the tall-grass tile the wild encounters happen in.

Same recipe as the cave and desert generators — a 32x32 tile painted in chunky
2px blocks with a fixed seed, so re-running writes an identical file. The palette
is pulled down a couple of shades from the plain grass tile it sits next to: dark
enough to read as "something lives in here" at a glance, with upright blades
breaking the top edge so it doesn't look like just another shade of lawn.
"""
import random
from PIL import Image

OUT_TILES = 'public/assets/tiles'
T = 32

# the plain grass tile's own colours, darkened — same family, clearly deeper
BASE = [(58, 104, 34), (69, 118, 42), (48, 90, 28), (78, 130, 50)]
BASE_W = [42, 28, 22, 8]
BLADE = [(96, 152, 62), (112, 167, 82), (80, 134, 50)]
SHADOW = (36, 70, 22)


def block(px, x, y, w, h, c):
    for yy in range(y, min(y + h, px[1])):
        for xx in range(x, min(x + w, px[0])):
            if xx >= 0 and yy >= 0:
                px[2][xx, yy] = c


def tall_grass(seed):
    rnd = random.Random(seed)
    im = Image.new('RGBA', (T, T), BASE[0] + (255,))
    px = (T, T, im.load())
    for y in range(0, T, 2):
        for x in range(0, T, 2):
            block(px, x, y, 2, 2, rnd.choices(BASE, BASE_W)[0] + (255,))

    # upright blades in two staggered rows, so the tile still repeats cleanly
    for row_y in (2, 16):
        for i in range(5):
            x = i * 6 + rnd.choice([0, 2]) + 1
            h = rnd.choice([8, 10, 12])
            c = rnd.choice(BLADE)
            # a blade leans one way and casts a short shadow to its left
            lean = rnd.choice([-2, 0, 0, 2])
            for k in range(0, h, 2):
                bx = x + (lean if k > h // 2 else 0)
                block(px, bx, row_y + h - k, 2, 2, SHADOW + (255,))
                block(px, bx + 2, row_y + h - k, 2, 2, c + (255,))
    return im


if __name__ == '__main__':
    tall_grass(3).save(f'{OUT_TILES}/tallgrass.png')
    print('wrote tallgrass.png')
