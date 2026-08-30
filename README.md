# Pokémon Twister Version

A tiny PokeMMO-style browser game — Gen 1 + Gen 9. Shared overworld, real-time
multiplayer, chat, and level-based turn battles when two trainers collide.
Work your way up a ladder of 12 NPC trainers, from a Lv 6 Youngster to the
**Beekeeper** and his Lv 52 Roaring Moon.

## Run

```bash
npm install      # first time only
npm start        # -> http://localhost:3000
```

Open the URL in a browser. Open a **second tab** to test multiplayer/battles.

## Controls

- **Partner:** pick one on the title screen (or leave it random)
- **Move:** arrow keys / WASD (grid-based, one tile per step)
- **Chat:** press Enter, type, Enter to send
- **Battle:** walk into another trainer
- **Battle screen:** click a move, or Run to flee

## How it works

- `server/` — Node + `ws` authoritative-lite server
  - `index.js` — connections, movement, chat, battle sessions
  - `map.js` — shared world map (one source of truth, sent to clients)
  - `data.js` — species, moves, the full 18-type chart, level/XP maths
- `public/` — Phaser 3 client (no build step; plain script tags)
  - `js/net.js` — WebSocket + tiny pub/sub bus
  - `js/scenes/BootScene.js` — asset loading
  - `js/scenes/WorldScene.js` — overworld, grid movement, remote trainers
  - `js/scenes/BattleScene.js` — turn-based battle overlay
- `public/assets/` — art sliced from the source tilesets

## Art

Art is sliced from `~/pokemon/Good Ending.png` (tiles/objects),
`~/pokemon/charachters.jpg` (trainer sprites), and the two contact sheets
`~/pokemon/gen 1 pokemon.png` (16x10 grid, cell index = national dex - 1) and
`~/pokemon/gen 9 sprites.png` (20x8 grid) for the battle sprites. Swap in custom
art by replacing the files under `public/assets/` (same keys).

## Levels

Every Pokémon has a level, and stats are derived from real base stats with the
standard formulas. Win a battle and you earn XP scaled to the loser's level;
enough XP and your partner levels up (cap Lv 60). Levels last for the session —
there's no save file yet.

The trainer ladder lives in `NPC_DEFS` at the bottom of `server/index.js`; names,
lines, species and levels are all one-line edits.

## Adding a Pokémon

1. Add the key and its sheet cell to `WANT` in `tools/slice_mons.py`, then run
   `python3 tools/slice_mons.py` (or just drop your own transparent PNG at
   `public/assets/mons/<key>.png`).
2. Add an entry to `SPECIES` in `server/data.js` with the same key.

That's it — the client reads the roster from `/api/species`, so it preloads the
sprite and adds the mon to the partner picker on its own.

## Slice scope (done)

- [x] Shared tile overworld with collision (water, trees, mart)
- [x] Real-time multiplayer movement + name/level labels
- [x] Chat
- [x] Walk-into-trainer -> turn battle (full type chart, STAB, speed order)
- [x] Per-trainer custom battle line
- [x] 42 species across Gen 1 + Gen 9, with real battle sprites
- [x] Levels, XP and level-ups; a 12-trainer difficulty ladder
- [x] Choose your partner Pokémon on the title screen

## Ideas next

- Catching / a team of more than one Pokémon
- Saving your level between sessions
- Persistent accounts + a bigger map (Kanto and Paldea zones)
- 4-direction walk animations (source sprites are front-facing only)
