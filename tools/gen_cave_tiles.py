#!/usr/bin/env python3
"""Generate the mountain-pass art: stone floor, rubble floor, and rock walls.

Matches the existing tileset's look — 32x32 tiles painted in chunky 2px blocks
from a small hand-picked palette, with a fixed seed so re-running is a no-op.
The floor is deliberately dark and low-contrast so the light rock walls and the
trainer sprites read clearly on top of it.
"""
import random
from PIL import Image

OUT_TILES = 'public/assets/tiles'
OUT_OBJ = 'public/assets/objects'
T = 32

# dark, faintly blue cave floor — the quiet background layer
FLOOR = [(62, 60, 72), (70, 68, 80), (55, 53, 65), (78, 76, 88)]
FLOOR_W = [58, 22, 15, 5]
# rock walls sit ~2x brighter than the floor so the silhouette is unmistakable
ROCK = [(150, 146, 158), (132, 128, 141), (168, 164, 176), (118, 114, 127)]
ROCK_W = [40, 30, 18, 12]
OUTLINE = (28, 26, 36)


def block(px, x, y, w, h, c):
    for yy in range(y, min(y + h, px[1])):
        for xx in range(x, min(x + w, px[0])):
            if xx >= 0 and yy >= 0:
                px[2][xx, yy] = c


def new(w, h, bg=(0, 0, 0, 0)):
    im = Image.new('RGBA', (w, h), bg)
    return (w, h, im.load()), im


def stone_floor(seed, rubble=False):
    rnd = random.Random(seed)
    px, im = new(T, T, FLOOR[0] + (255,))
    for y in range(0, T, 2):
        for x in range(0, T, 2):
            block(px, x, y, 2, 2, rnd.choices(FLOOR, FLOOR_W)[0] + (255,))
    if rubble:
        # loose pebbles: dark body, lit top edge, so they read as 3D at a glance
        for _ in range(6):
            x, y = rnd.randrange(2, T - 8, 2), rnd.randrange(2, T - 8, 2)
            w, h = rnd.choice([(6, 4), (4, 6), (6, 6)])
            block(px, x, y, w, h, (38, 36, 48, 255))
            block(px, x, y, w, 2, (128, 124, 138, 255))
    return im


def rock_wall(seed):
    """A craggy block that fills its tile and rises a little above it, drawn
    bottom-anchored like the tree so it overlaps the tile behind."""
    rnd = random.Random(seed)
    W, H = 34, 42
    px, im = new(W, H)
    # jagged skyline, widest at the base
    top = [rnd.randrange(4, 12, 2) for _ in range(W // 2 + 1)]
    for i in range(1, len(top)):                      # smooth out lone spikes
        top[i] = (top[i] + top[i - 1]) // 4 * 2
    body = {}
    for x in range(0, W, 2):
        t = top[x // 2]
        for y in range(t, H, 2):
            depth = (y - t) / max(1, H - t)
            if depth < 0.16:
                c = ROCK[2]                            # sunlit crown
            elif depth < 0.7:
                c = rnd.choices(ROCK, ROCK_W)[0]
            else:
                c = rnd.choice([(96, 92, 105), (84, 80, 93)])   # shadowed base
            body[(x, y)] = c
            block(px, x, y, 2, 2, c + (255,))
    # cracks
    for _ in range(3):
        x = rnd.randrange(6, W - 8, 2)
        y = rnd.randrange(16, H - 10, 2)
        for _i in range(rnd.randrange(3, 6)):
            if (x, y) in body:
                block(px, x, y, 2, 2, (58, 55, 68, 255))
            y += 2
            x = max(2, min(W - 4, x + rnd.choice([-2, 0, 0, 2])))
    # hard outline around the whole silhouette
    for (x, y) in list(body):
        for dx, dy in ((-2, 0), (2, 0), (0, -2), (0, 2)):
            n = (x + dx, y + dy)
            if n not in body and 0 <= n[0] < W and 0 <= n[1] < H:
                block(px, n[0], n[1], 2, 2, OUTLINE + (255,))
    block(px, 0, H - 2, W, 2, OUTLINE + (255,))
    return im


if __name__ == '__main__':
    stone_floor(11).save(f'{OUT_TILES}/stone.png')
    stone_floor(11, rubble=True).save(f'{OUT_TILES}/rubble.png')
    rock_wall(7).save(f'{OUT_OBJ}/rock.png')
    print('wrote stone.png, rubble.png, rock.png')
