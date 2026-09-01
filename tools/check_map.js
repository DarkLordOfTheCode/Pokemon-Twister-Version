// Sanity-checks the world map after an edit: every row the same width, and the
// whole map still walkable in one piece from the plaza spawn.
//   node tools/check_map.js
const map = require('../server/map');

let bad = 0;
const fail = (m) => { console.log('FAIL ' + m); bad++; };

if (map.GROUND.length !== map.OBJECTS.length)
  fail(`row counts differ: ground ${map.GROUND.length}, objects ${map.OBJECTS.length}`);
[...map.GROUND, ...map.OBJECTS].forEach((r, i) => {
  if (r.length !== map.W) fail(`a row is ${r.length} wide, want ${map.W} (row ${i % map.H})`);
});

// Flood fill from the plaza. The desert is *meant* to be unreachable until the
// story blows the wall open, so we fill twice: once sealed (to see how far a new
// player gets) and once opened (where nothing may be stranded).
function fill() {
  const seen = new Set(), stack = [[10, 9]];
  while (stack.length) {
    const [x, y] = stack.pop();
    const k = `${x},${y}`;
    if (seen.has(k) || map.isBlocked(x, y)) continue;
    seen.add(k);
    stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
  }
  return seen;
}
const sealed = fill();
map.openSecretExit();
const seen = fill();
if (sealed.size >= seen.size) fail('the secret exit opens nothing — check the X tiles');
console.log(`sealed: ${sealed.size} tiles reachable · after the blast: ${seen.size}`);
let walkable = 0, stranded = [];
for (let y = 0; y < map.H; y++)
  for (let x = 0; x < map.W; x++)
    if (!map.isBlocked(x, y)) { walkable++; if (!seen.has(`${x},${y}`)) stranded.push(`${x},${y}`); }
if (stranded.length) fail(`${stranded.length} walkable tiles are cut off: ${stranded.slice(0, 8).join(' ')}...`);

console.log(`${map.W}x${map.H} — ${walkable} walkable tiles, ${seen.size} reachable from the plaza`);
console.log(bad ? `${bad} problem(s)` : 'map OK');
process.exit(bad ? 1 : 0);
