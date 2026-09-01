#!/usr/bin/env python3
"""Slice the overworld walking sprites.

Two sources, one output convention. Every walker sheet this writes is a 4x4 grid
of frames, read left-to-right, top-to-bottom:

    row 0  facing down      frames 0-3
    row 1  facing left      frames 4-7
    row 2  facing right     frames 8-11
    row 3  facing up        frames 12-15

so the client can build all four animations the same way regardless of what the
sprite actually is. Frame size differs per sheet (trainers are taller), which is
why each one is loaded with its own frameWidth/frameHeight.

  1. ~/pokemon/random trainers.png — a clean 720x384 sheet. Six trainers laid out
     3 across and 2 down; each 240x192 block is a big VS portrait on the left and
     a 4x4 walking grid of 32x48 frames starting 112px in. Rows are already in
     down/left/right/up order, so it copies straight across.

  2. ~/pokemon/dragonite and mewtwo walking sprites.png — NOT a sprite sheet. It
     is a screenshot of The Spriters Resource viewer at 5x zoom, so every source
     pixel is a 5x5 block and the transparent areas are the site's grey
     checkerboard. Downsampling by 5 recovers the original pixels exactly. The
     Dragonite block holds 2 columns x 4 rows of 32x32: column 0 is the front and
     back views, column 1 is the side view, two walk frames each. There is no
     left-facing art, so left is the mirror of right.
"""
from PIL import Image

SRC_TRAINERS = '/home/vader/pokemon/random trainers.png'
SRC_SCREENSHOT = '/home/vader/pokemon/dragonite and mewtwo walking sprites.png'
OUT = 'public/assets/chars'
OUT_MON = 'public/assets/mons'

# --- 1. trainers -------------------------------------------------------------
TW, TH = 32, 48          # one trainer frame
GRID_X = 112             # walking grid starts this far into each block


def slice_trainers():
    sheet = Image.open(SRC_TRAINERS).convert('RGBA')
    for i in range(6):
        bx, by = (i % 3) * 240, (i // 3) * 192
        out = Image.new('RGBA', (TW * 4, TH * 4), (0, 0, 0, 0))
        for row in range(4):            # down, left, right, up — already in order
            for col in range(4):        # four walk frames
                cell = sheet.crop((bx + GRID_X + col * TW, by + row * TH,
                                   bx + GRID_X + (col + 1) * TW, by + (row + 1) * TH))
                out.paste(cell, (col * TW, row * TH))
        out.save(f'{OUT}/walk_{i}.png')
    print(f'wrote {OUT}/walk_0.png .. walk_5.png  (32x48 frames, 4x4)')


# --- 2. dragonite ------------------------------------------------------------
ZOOM = 5                 # the viewer was at 5x
DX0, DY0 = 784, 345      # top-left of the Dragonite block, in screenshot pixels
MW = 32                  # one Pokemon frame
# The viewer draws transparency as a two-tone grey checkerboard, and the user had
# its grid overlay switched on, which paints a light line down each cell edge.
# None of these three ever appear inside the Dragonite art, so keying them is safe.
CHECKER = {(152, 152, 152), (144, 152, 160), (224, 224, 224)}


def slice_dragonite():
    shot = Image.open(SRC_SCREENSHOT).convert('RGB')

    def cell(col, row):
        """One 32x32 frame, un-zoomed and with the checkerboard keyed out."""
        out = Image.new('RGBA', (MW, MW), (0, 0, 0, 0))
        for y in range(MW):
            for x in range(MW):
                # sample the centre of each 5x5 block so edges can't bleed in
                px = shot.getpixel((DX0 + (col * MW + x) * ZOOM + 2,
                                    DY0 + (row * MW + y) * ZOOM + 2))
                if px not in CHECKER:
                    out.putpixel((x, y), px + (255,))
        return out

    front = [cell(0, 2), cell(0, 3)]      # facing the camera
    back = [cell(0, 0), cell(0, 1)]       # facing away
    side = [cell(1, 2), cell(1, 3)]       # facing right
    flip = [s.transpose(Image.FLIP_LEFT_RIGHT) for s in side]

    # pad each 2-frame cycle out to 4 so every walker sheet has the same shape
    rows = [front + front, flip + flip, side + side, back + back]
    out = Image.new('RGBA', (MW * 4, MW * 4), (0, 0, 0, 0))
    for r, frames in enumerate(rows):
        for c, fr in enumerate(frames):
            out.paste(fr, (c * MW, r * MW))
    out.save(f'{OUT_MON}/walk_dragonite.png')
    print(f'wrote {OUT_MON}/walk_dragonite.png  (32x32 frames, 4x4)')


if __name__ == '__main__':
    slice_trainers()
    slice_dragonite()
