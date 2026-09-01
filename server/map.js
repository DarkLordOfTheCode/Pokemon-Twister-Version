// Shared world map. One source of truth: the server sends this to every client
// on join, the client renders it, and the server uses it for collision + spawns.
//
// GROUND legend:  G grass  F flower-grass  D dirt path  L plaza floor  W water
//                 S cave stone  P rubble (stone with loose pebbles)
//                 A desert sand  B cracked dune  H tall grass (wild encounters)
// OBJECT legend:  .  none  T tree  M mart (2-3 tiles wide, anchored bottom-left)
//                 R rock wall  C cactus  X sealed secret exit
//
// The world is one grid in two halves: the plaza (rows 0-19) opens through a gap
// in the treeline at x=13-14 onto a short path, and that path runs into the
// mountain pass (rows 22-43) — a cave of rock-walled chambers holding the
// second half of the trainer ladder. Below that, sealed off until the story
// opens it, lies the desert (rows 44-63) where the Dragonite live.
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
  'GGHHHHHGDGGGGGGGGGGGDGGGFGGG',
  'GGHHHGHGDGGGGGGGGGGGDGGGGGGG',
  'GGHHHHHGDGGGWWWWGGGGDHHHHHHG',
  'GGHHHHHGDGGGWWWWGGGGDGHHHHHG',
  'GGFGGGGGDGGGWWWWGGGGDHHHHHHG',
  'GGGGGGGGDDDDDDDDDDDDDHHHHHHG',
  'GGGGGGGGGGGGGDDGGGGGGGGGGGGG',
  'GGGGGGGGGGGGGDDGGGGGGGGGGGGG',
  'GGGGFGGGGGGGGDDGGHHHHHFGGGGG',
  'GGGHHHHHGGGGGDDGGGHHHHGGGGGG',
  'GGGHHHHHGGGGGDDGGHHHHHGGGGGG',
  'GGFHHHHHGGGGGDDGGHHHHHGGFGGG',
  'GGGHHHHHGGGGGDDGGGGGGGGGGGGG',
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
  // ---- the desert (rows 44-63) ----
  'AAAAAAAAAAAAAAAAAAAAAAAAAAAA',
  'AAAAAAAAAAAAAAAAAAAAAAAAAAAA',
  'AAAAABAAAAAAAAAAAAAABAAAAAAA',
  'AAAAAAAAAAAABBAAAAAAAAAAAAAA',
  'AAAABAAAAAAAAAAAAAAAAAAABAAA',
  'AAAAAAAAAAAAAAAAAAAAAAAAAAAA',
  'AAAAAAAABAAAAAAAAABAAAAAAAAA',
  'AAAAAAAAAAAAAAAAAAAAAAAAAAAA',
  'AAABAAAAAAAAAAAAAAAAAAAABAAA',
  'AAAAAAAAAAABBBAAAAAAAAAAAAAA',
  'AAAAAAAAAAABBBAAAAAAAAAAAAAA',
  'AAAAAAAAAAAAAAAAAAAAAAAAAAAA',
  'AAAAAABAAAAAAAAAAAABAAAAAAAA',
  'AAAAAAAAAAAAAAAAAAAAAAAAAAAA',
  'AAAABAAAAAAAAAAAAAAAAAABAAAA',
  'AAAAAAAAAAAAAAAAAAAAAAAAAAAA',
  'AAAAAAAAAABAAAAABAAAAAAAAAAA',
  'AAAAAAAAAAAAAAAAAAAAAAAAAAAA',
  'AAABAAAAAAAAAAAAAAAAAAAABAAA',
  'AAAAAAAAAAAAAAAAAAAAAAAAAAAA',
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
  // The two 'X' tiles are the secret exit: solid rock until the Twister goes off,
  // then blown open for good (see openSecretExit).
  'RRRRRRRRRRRRRXXRRRRRRRRRRRRR',
  // ---- the desert (rows 44-63) ----
  'R..........................R',
  'R..........................R',
  'R...C......................R',
  'R....................C.....R',
  'R..........................R',
  'R.......C..................R',
  'R..............C........C..R',
  'R..........................R',
  'R..C.......................R',
  'R................C.........R',
  'R..........................R',
  'R..........................R',
  'R..........C.............C.R',
  'R..........................R',
  'R.....C....................R',
  'R..................C.......R',
  'R.C........................R',
  'R........C............C....R',
  'R..........................R',
  'RRRRRRRRRRRRRRRRRRRRRRRRRRRR',
];

const H = GROUND.length;
const W = GROUND[0].length;

// The secret exit starts sealed. Nothing but openSecretExit() ever flips this,
// and once flipped it stays flipped for the life of the server — the explosion
// happens once and the pass is open to everyone afterwards.
let secretOpen = false;

// A tile is blocked by water, a tree, a cactus, a mart footprint, or the sealed exit.
// Mart is 3 tiles wide anchored at its 'M' (occupies M, M+1x, and the row above visually,
// but for collision we block the 3 ground tiles under it).
function buildBlocked() {
  const blocked = Array.from({ length: H }, () => new Array(W).fill(false));
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (GROUND[y][x] === 'W') blocked[y][x] = true;
      const o = OBJECTS[y][x];
      if (o === 'T' || o === 'R' || o === 'C') blocked[y][x] = true;
      if (o === 'X') blocked[y][x] = !secretOpen;
      if (o === 'M') {
        for (let dx = 0; dx < 3; dx++) if (x + dx < W) blocked[y][x + dx] = true;
      }
    }
  }
  return blocked;
}

let BLOCKED = buildBlocked();

// Where the desert starts, and which tiles the blast opens. Both are derived from
// the map itself so moving the exit or resizing the desert needs no code change.
const DESERT_TOP = GROUND.findIndex((r) => /^[AB]+$/.test(r));
const SECRET_EXIT = [];
for (let y = 0; y < H; y++)
  for (let x = 0; x < W; x++)
    if (OBJECTS[y][x] === 'X') SECRET_EXIT.push({ x, y });

// Blow the wall open and recompute collision. Returns the tiles that changed so
// the server can tell every client to stop drawing rock there.
function openSecretExit() {
  if (secretOpen) return [];
  secretOpen = true;
  BLOCKED = buildBlocked();
  return SECRET_EXIT;
}
const isSecretOpen = () => secretOpen;

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

// Every walkable tile in a row range — used to scatter the desert's Dragonite.
function walkableIn(y0, y1) {
  const out = [];
  for (let y = y0; y <= y1 && y < H; y++)
    for (let x = 0; x < W; x++)
      if (!BLOCKED[y][x]) out.push({ x, y });
  return out;
}

module.exports = { TILE, GROUND, OBJECTS, W, H, isBlocked, randomSpawn,
                   DESERT_TOP, SECRET_EXIT, openSecretExit, isSecretOpen, walkableIn };
