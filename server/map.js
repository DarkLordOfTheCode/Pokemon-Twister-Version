// Shared world map. One source of truth: the server sends this to every client
// on join, the client renders it, and the server uses it for collision + spawns.
//
// GROUND legend:  G grass  F flower-grass  D dirt path  L plaza floor  W water
//                 S cave stone  P rubble (stone with loose pebbles)
// OBJECT legend:  .  none  T tree  M mart (2-3 tiles wide, anchored bottom-left)
//                 R rock wall
//
// The world is one grid in two halves: the plaza (rows 0-19) opens through a gap
// in the treeline at x=13-14 onto a short path, and that path runs into the
// mountain pass (rows 22-43) — a cave of rock-walled chambers holding the
// second half of the trainer ladder.
//
// Blocking = water tiles + any tile under a tree/mart/rock object.

const TILE = 32;

const GROUND = [
  'GGGGGGGGGGGGGGGGGGGGGGGGGGGG',
  'GGGGGGGGGGGGGGGGGGGGGGGGGGGG',
  'GGFGGGGGGGGGGDDDDGGGGGGGFGGG',
  'GGGGGGGGGGGGGDDDDGGGGGGGGGGG',
  'GGGGGGGGGGGGGDDDDGGGGGGGGGGG',
  'GGGGGGGGDDDDDDDDDDDDDGGGGGGG',
  'GGGGFGGGDGGGGGGGGGGGDGGGFGGG',
  'GGGGGGGGDGGGGGGGGGGGDGGGGGGG',
  'GGGGGGGGDGGGWWWWGGGGDGGGGGGG',
  'GGGGGGGGDGGGWWWWGGGGDGGGGGGG',
  'GGFGGGGGDGGGWWWWGGGGDGGGGFGG',
  'GGGGGGGGDDDDDDDDDDDDDGGGGGGG',
  'GGGGGGGGGGGGGDDGGGGGGGGGGGGG',
  'GGGGGGGGGGGGGDDGGGGGGGGGGGGG',
  'GGGGFGGGGGGGGDDGGGGGGGFGGGGG',
  'GGGGGGGGGGGGGDDGGGGGGGGGGGGG',
  'GGGGGGGGGGGGGDDGGGGGGGGGGGGG',
  'GGFGGGGGGGGGGDDGGGGGGGGGFGGG',
  'GGGGGGGGGGGGGDDGGGGGGGGGGGGG',
  'GGGGGGGGGGGGGDDGGGGGGGGGGGGG',
  'GGGGGGGGGGGGGDDGGGGGGGGGGGGG',
  'GGGGGGGGGGGGGDDGGGGGGGGGGGGG',
  // ---- the mountain pass ----
  'SSSSSSSSSSSSSDDSSSSSSSSSSSSS',
  'SSSPSSSSSSSSSDDSSSSSSPSSSSSS',
  'SSSSSSSSSSSSPDDSSSSPSSSSSSSS',
  'SSSSSSSSPSSSSDDSSSSSSSSSSPSS',
  'SSPSSSSSSSSSSDDSSSPSSSSSPSSS',
  'SSSSSSSSSSSSSSSSSSSSSSSSSSSS',
  'SSSSSPSSSSSSSSSSSSSSSSPSSSSS',
  'SSSSSSSSSSPSSSSSSPSSSSSSSSSS',
  'SSSPSSSSSSSSSSSSSSSSSSSSSSPS',
  'SSSSSSSSSSSSSSSSSSSPSSSSSSSS',
  'SSSSSSSPSSSSSSSSSSSSPSSSSSSS',
  'SSSSSSSSSSSPSSSSSSSSSSSPSSSS',
  'SSSSSSSSSSSSSSSSSSSSSSSSSSSS',
  'SSSSPSSSSSSSSSSPSSSSSSSSPSSS',
  'SSSSSSSSPSSSSSSSSSSSSPSSSSSS',
  'SSSSSSSSSSSSSPSSSSSPSSSSSSSS',
  'SSSPSSSSSSSSSSSSSSSSSSSSSPSS',
  'SSSSSSSPSSSSSSSSPSSSSSPSSSSS',
  'SSSSSSSSSSSSPSSSSSPSSSSSSSSS',
  'SSSSSPSSSSSSSSSSSSSSSPSSSSSS',
  'SSSSSSSSSPSSSSSSSSSSPSSSSSSS',
  'SSSSSSSSSSSSSSSSSSSSSSSSSSSS',
];

const OBJECTS = [
  'TTTTTTTTTTTTTTTTTTTTTTTTTTTT',
  'T..........................T',
  'T..........................T',
  'T.........M................T',
  'T..........................T',
  'T..........................T',
  'T..........................T',
  'T....T.....................T',
  'T..........................T',
  'T....................T.....T',
  'T..........................T',
  'T..........................T',
  'T..........................T',
  'T........T.................T',
  'T..........................T',
  'T................T.........T',
  'T..........................T',
  'T..........................T',
  'T..........................T',
  'TTTTTTTTTTTTT..TTTTTTTTTTTTT',
  'T..........................T',
  'T..........................T',
  // ---- the mountain pass ----
  'RRRRRRRRRRRRR..RRRRRRRRRRRRR',
  'R........RR......RR........R',
  'R...RRR..............RRR...R',
  'R...RR................RR...R',
  'R.......RRR......RRR.......R',
  'RRRRR..RRRRRRRRRRRRRR..RRRRR',
  'R............RR............R',
  'R..RR........RR.........RR.R',
  'R............RR.....RR.....R',
  'R.....RR.....RR............R',
  'R............RR.........RR.R',
  'R.RR.........RR............R',
  'RRRRRRRR..RRRRRRRR..RRRRRRRR',
  'R..........................R',
  'R..........RR..RR..........R',
  'R.R......................R.R',
  'R........RR......RR........R',
  'R..........................R',
  'R...RR................RR...R',
  'R..........R....R..........R',
  'R..........................R',
  'RRRRRRRRRRRRRRRRRRRRRRRRRRRR',
];

const H = GROUND.length;
const W = GROUND[0].length;

// A tile is blocked by water, a tree, or a mart footprint.
// Mart is 3 tiles wide anchored at its 'M' (occupies M, M+1x, and the row above visually,
// but for collision we block the 3 ground tiles under it).
function buildBlocked() {
  const blocked = Array.from({ length: H }, () => new Array(W).fill(false));
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (GROUND[y][x] === 'W') blocked[y][x] = true;
      const o = OBJECTS[y][x];
      if (o === 'T' || o === 'R') blocked[y][x] = true;
      if (o === 'M') {
        for (let dx = 0; dx < 3; dx++) if (x + dx < W) blocked[y][x + dx] = true;
      }
    }
  }
  return blocked;
}

const BLOCKED = buildBlocked();

function isBlocked(tx, ty) {
  if (tx < 0 || ty < 0 || tx >= W || ty >= H) return true;
  return BLOCKED[ty][tx];
}

// spawn near the plaza, on a walkable tile
function randomSpawn() {
  const candidates = [];
  for (let y = 6; y < 12; y++)
    for (let x = 8; x < 20; x++)
      if (!isBlocked(x, y)) candidates.push({ x, y });
  return candidates[Math.floor(Math.random() * candidates.length)] || { x: 10, y: 10 };
}

module.exports = { TILE, GROUND, OBJECTS, W, H, isBlocked, randomSpawn };
