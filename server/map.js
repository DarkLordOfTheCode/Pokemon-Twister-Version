// Shared world map. One source of truth: the server sends this to every client
// on join, the client renders it, and the server uses it for collision + spawns.
//
// GROUND legend:  G grass  F flower-grass  D dirt path  L plaza floor  W water
// OBJECT legend:  .  none  T tree  M mart (2-3 tiles wide, anchored bottom-left)
//
// Blocking = water tiles + any tile under a tree/mart object.

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
  'GGFGGGGGGGGGGGGGGGGGGGGGFGGG',
  'GGGGGGGGGGGGGGGGGGGGGGGGGGGG',
  'GGGGGGGGGGGGGGGGGGGGGGGGGGGG',
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
  'TTTTTTTTTTTTTTTTTTTTTTTTTTTT',
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
      if (o === 'T') blocked[y][x] = true;
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
