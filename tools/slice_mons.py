# Cuts battle sprites out of the two contact sheets in ~/pokemon.
# To add a Pokémon: put its key and (sheet, cell index) in WANT below, run
#   python3 tools/slice_mons.py
# then add a matching entry to SPECIES in server/data.js.
#
# Gen 1 sheet: 16x10 grid, white background, cell index = national dex - 1.
# Gen 9 sheet: 20x8 grid, already transparent, national-dex order but with extra
# form entries, so indexes drift — check a cell by eye before trusting it.

from PIL import Image
from collections import deque
import os

OUT = '/home/vader/Development/pokemmo/public/assets/mons'
os.makedirs(OUT, exist_ok=True)

def strip_white(im):
    """Flood-fill white from the borders only, so white *inside* a sprite survives."""
    im = im.convert('RGBA')
    px = im.load()
    w, h = im.size
    seen = [[False]*w for _ in range(h)]
    q = deque()
    def white(x, y):
        r, g, b, a = px[x, y]
        return a > 0 and r >= 244 and g >= 244 and b >= 244
    for x in range(w):
        for y in (0, h-1):
            if not seen[y][x] and white(x, y): q.append((x, y)); seen[y][x] = True
    for y in range(h):
        for x in (0, w-1):
            if not seen[y][x] and white(x, y): q.append((x, y)); seen[y][x] = True
    while q:
        x, y = q.popleft()
        px[x, y] = (0, 0, 0, 0)
        for dx, dy in ((1,0),(-1,0),(0,1),(0,-1)):
            nx, ny = x+dx, y+dy
            if 0 <= nx < w and 0 <= ny < h and not seen[ny][nx] and white(nx, ny):
                seen[ny][nx] = True; q.append((nx, ny))
    return im

def largest_blob(im):
    """Drop stray pixels bled in from neighbouring grid cells: keep the biggest
    connected blob plus anything whose bbox overlaps it (eyes, detached fins)."""
    px = im.load(); w, h = im.size
    lab = [[-1]*w for _ in range(h)]; blobs = []
    for sy in range(h):
        for sx in range(w):
            if lab[sy][sx] != -1 or px[sx, sy][3] == 0: continue
            n = len(blobs); q = deque([(sx, sy)]); lab[sy][sx] = n
            pts = []
            while q:
                x, y = q.popleft(); pts.append((x, y))
                for dx in (-1, 0, 1):
                    for dy in (-1, 0, 1):
                        nx, ny = x+dx, y+dy
                        if 0 <= nx < w and 0 <= ny < h and lab[ny][nx] == -1 and px[nx, ny][3] > 0:
                            lab[ny][nx] = n; q.append((nx, ny))
            xs = [p[0] for p in pts]; ys = [p[1] for p in pts]
            blobs.append({'n': n, 'size': len(pts), 'box': (min(xs), min(ys), max(xs), max(ys))})
    if not blobs: return im
    main = max(blobs, key=lambda b: b['size'])
    # Neither sheet divides into whole pixels, so every cell picks up slivers of its
    # neighbours. Each sprite here is one connected blob, so keep only the biggest —
    # anything under a quarter of its size is bleed from the next cell over.
    keep = {b['n'] for b in blobs if b['n'] == main['n']}
    for y in range(h):
        for x in range(w):
            if lab[y][x] != -1 and lab[y][x] not in keep: px[x, y] = (0, 0, 0, 0)
    return im

def cells(path, cols, rows, dewhite=False):
    im = Image.open(path).convert('RGBA')
    W, H = im.size
    cw, ch = W / cols, H / rows
    out = []
    for r in range(rows):
        for c in range(cols):
            cell = im.crop((round(c*cw), round(r*ch), round((c+1)*cw), round((r+1)*ch)))
            cell = largest_blob(strip_white(cell) if dewhite else cell)
            bb = cell.getbbox()
            out.append(cell.crop(bb) if bb else None)
    return out

G1 = cells('/home/vader/pokemon/gen 1 pokemon.png', 16, 10, dewhite=True)
G9 = cells('/home/vader/pokemon/gen 9 sprites.png', 20, 8)

# key -> (sheet, index)
WANT = {
    # --- Gen 1 (sheet index = national dex - 1) ---
    'bulbasaur': ('g1', 0),   'venusaur': ('g1', 2),    'charmander': ('g1', 3),
    'charizard': ('g1', 5),   'squirtle': ('g1', 6),    'blastoise': ('g1', 8),
    'pikachu': ('g1', 24),    'arcanine': ('g1', 58),   'alakazam': ('g1', 64),
    'machamp': ('g1', 67),    'gengar': ('g1', 93),     'onix': ('g1', 94),
    'gyarados': ('g1', 129),  'lapras': ('g1', 130),    'eevee': ('g1', 132),
    'snorlax': ('g1', 142),   'dragonite': ('g1', 148), 'mewtwo': ('g1', 149),
    # --- Gen 9 ---
    'sprigatito': ('g9', 0),   'meowscarada': ('g9', 2),  'fuecoco': ('g9', 3),
    'skeledirge': ('g9', 5),   'quaxly': ('g9', 6),       'quaquaval': ('g9', 8),
    'pawmot': ('g9', 18),      'armarouge': ('g9', 35),   'ceruledge': ('g9', 36),
    'tinkaton': ('g9', 58),    'glimmora': ('g9', 70),    'dondozo': ('g9', 77),
    'annihilape': ('g9', 81),  'kingambit': ('g9', 86),   'greattusk': ('g9', 87),
    'fluttermane': ('g9', 90), 'ironhands': ('g9', 95),   'baxcalibur': ('g9', 101),
    'gholdengo': ('g9', 104),  'chienpao': ('g9', 106),   'roaringmoon': ('g9', 109),
    'ironvaliant': ('g9', 110),'koraidon': ('g9', 111),   'miraidon': ('g9', 113),
}

for key, (sheet, idx) in sorted(WANT.items()):
    img = (G1 if sheet == 'g1' else G9)[idx]
    if img is None:
        print(f'!! {key}: empty cell {sheet}#{idx}'); continue
    img.save(f'{OUT}/{key}.png')
    print(f'{key:<12} {sheet}#{idx:<4} {img.size[0]}x{img.size[1]}')
print(f'\n{len(WANT)} sprites written to {OUT}')
