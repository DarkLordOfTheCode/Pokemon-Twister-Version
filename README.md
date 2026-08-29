# Kanto ↔ Paldea Online

A tiny PokeMMO-style browser game — Gen 1 + Gen 9. Shared overworld, real-time
multiplayer, chat, and turn-based battles when two trainers collide.

## Run

```bash
npm install      # first time only
npm start        # -> http://localhost:3000
```

Open the URL in a browser. Open a **second tab** to test multiplayer/battles.

## Controls

- **Move:** arrow keys / WASD (grid-based, one tile per step)
- **Chat:** press Enter, type, Enter to send
- **Battle:** walk into another trainer
- **Battle screen:** click a move, or Run to flee

## How it works

- `server/` — Node + `ws` authoritative-lite server
  - `index.js` — connections, movement, chat, battle sessions
  - `map.js` — shared world map (one source of truth, sent to clients)
  - `data.js` — Pokémon species, moves, type chart
- `public/` — Phaser 3 client (no build step; plain script tags)
  - `js/net.js` — WebSocket + tiny pub/sub bus
  - `js/scenes/BootScene.js` — asset loading
  - `js/scenes/WorldScene.js` — overworld, grid movement, remote trainers
  - `js/scenes/BattleScene.js` — turn-based battle overlay
- `public/assets/` — art sliced from the source tilesets

## Art

Placeholder art is sliced from `~/pokemon/Good Ending.png` (tiles/objects) and
`~/pokemon/charachters.jpg` (trainer sprites). Swap in custom art by replacing
the files under `public/assets/` (same sizes/keys).

## Slice scope (done)

- [x] Shared tile overworld with collision (water, trees, mart)
- [x] Real-time multiplayer movement + name labels
- [x] Chat
- [x] Walk-into-trainer -> turn-based battle (type effectiveness, speed order)
- [x] Per-trainer custom battle line
- [x] 7 species across Gen 1 + Gen 9

## Ideas next

- Real Pokémon battle sprites (currently type-coloured placeholders)
- Catching / a team of more than one Pokémon
- Persistent accounts + a bigger map (Kanto and Paldea zones)
- 4-direction walk animations (source sprites are front-facing only)
