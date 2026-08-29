// PokeMMO-style slice: authoritative-lite Node server.
// - serves the Phaser client from /public and Phaser itself from /vendor
// - tracks players in a shared overworld over WebSockets
// - runs turn-based battles when two trainers collide
//
// Wire protocol is newline-free JSON objects with a `t` (type) field.

const path = require('path');
const http = require('http');
const express = require('express');
const { WebSocketServer } = require('ws');

const map = require('./map');
const { SPECIES, MOVES, typeEffect } = require('./data');

const PORT = process.env.PORT || 3000;
const app = express();
app.use(express.static(path.join(__dirname, '..', 'public')));
app.use('/vendor', express.static(path.join(__dirname, '..', 'node_modules', 'phaser', 'dist')));

const server = http.createServer(app);
const wss = new WebSocketServer({ server });

// ---- world state ----
const players = new Map();   // id -> { id, name, charId, x, y, dir, ws, battleId }
const npcs = new Map();      // id -> wandering NPC trainer (ws:null, isNPC:true)
const battles = new Map();   // id -> battle session
let nextId = 1;
let nextBattleId = 1;
const NUM_CHARS = 19;        // char_00 .. char_18
const SPECIES_KEYS = Object.keys(SPECIES);

function send(ws, obj) {
  if (ws && ws.readyState === 1) ws.send(JSON.stringify(obj));
}
function broadcast(obj, exceptId) {
  const s = JSON.stringify(obj);
  for (const p of players.values())
    if (p.id !== exceptId && p.ws.readyState === 1) p.ws.send(s);
}
function publicPlayer(p) {
  return { id: p.id, name: p.name, charId: p.charId, x: p.x, y: p.y, dir: p.dir, inBattle: !!p.battleId };
}
function freshMon(key) {
  const s = SPECIES[key];
  return { key, name: s.name, gen: s.gen, dex: s.dex, type: s.type, maxhp: s.hp, hp: s.hp,
           atk: s.atk, def: s.def, spd: s.spd, moves: s.moves.slice() };
}
function randSpecies() { return SPECIES_KEYS[Math.floor(Math.random() * SPECIES_KEYS.length)]; }
const entityWs = (e) => (e && e.ws) ? e.ws : null;     // NPCs have ws:null
const aiMove = (mon) => [...mon.moves].sort((a, b) => MOVES[b].power - MOVES[a].power)[0];
const tileTaken = (tx, ty, exceptId) =>
  [...players.values(), ...npcs.values()].some(o => o.id !== exceptId && o.x === tx && o.y === ty);

// ---- battle logic ----
// `a` is always a connected player; `b` may be another player or an NPC trainer.
function startBattle(a, b) {
  const id = nextBattleId++;
  const monA = freshMon(a.species || randSpecies());
  const monB = freshMon(b.species || randSpecies());
  const battle = { id, sides: { [a.id]: { entity: a, mon: monA, choice: null },
                                [b.id]: { entity: b, mon: monB, choice: null } }, order: [a.id, b.id] };
  battles.set(id, battle);
  a.battleId = id; b.battleId = id;
  for (const pid of battle.order) {
    const me = battle.sides[pid];
    const foe = battle.sides[battle.order.find(o => o !== pid)];
    const ws = entityWs(me.entity);
    if (ws) send(ws, {
      t: 'battleStart', battleId: id,
      you: { name: me.entity.name, mon: me.mon, moves: me.mon.moves.map(m => ({ key: m, ...MOVES[m] })) },
      foe: { name: foe.entity.name, line: foe.entity.line || '',
             mon: { name: foe.mon.name, type: foe.mon.type, dex: foe.mon.dex,
                    gen: foe.mon.gen, hp: foe.mon.hp, maxhp: foe.mon.maxhp } },
    });
  }
  broadcast({ t: 'playerBattling', id: a.id, inBattle: true });
  broadcast({ t: 'playerBattling', id: b.id, inBattle: true });
}

function damage(attacker, defender, moveKey) {
  const mv = MOVES[moveKey];
  const eff = typeEffect(mv.type, defender.type);
  const rnd = 0.85 + Math.random() * 0.15;
  const dmg = Math.max(1, Math.round(mv.power * (attacker.atk / defender.def) * eff * rnd * 0.4));
  defender.hp = Math.max(0, defender.hp - dmg);
  return { dmg, eff, move: mv.name };
}

function resolveBattle(battle) {
  const [id1, id2] = battle.order;
  const s1 = battle.sides[id1], s2 = battle.sides[id2];
  // faster mon goes first; tie broken randomly
  let first = id1, second = id2;
  if (s2.mon.spd > s1.mon.spd || (s2.mon.spd === s1.mon.spd && Math.random() < 0.5)) {
    first = id2; second = id1;
  }
  const log = [];
  for (const pid of [first, second]) {
    const me = battle.sides[pid];
    const foe = battle.sides[battle.order.find(o => o !== pid)];
    if (me.mon.hp <= 0) continue;                 // fainted before acting
    const r = damage(me.mon, foe.mon, me.choice);
    log.push({ by: pid, byName: me.mon.name, target: foe.entity.id, targetName: foe.mon.name,
               move: r.move, dmg: r.dmg, eff: r.eff, foeHp: foe.mon.hp, foeMax: foe.mon.maxhp });
  }
  // reset choices
  s1.choice = null; s2.choice = null;
  const faintedId = s1.mon.hp <= 0 ? id1 : (s2.mon.hp <= 0 ? id2 : null);

  for (const pid of battle.order) {
    const me = battle.sides[pid];
    const foe = battle.sides[battle.order.find(o => o !== pid)];
    const ws = entityWs(me.entity);
    if (ws) send(ws, { t: 'battleTurn', log, youHp: me.mon.hp, youMax: me.mon.maxhp,
                       foeHp: foe.mon.hp, foeMax: foe.mon.maxhp });
  }
  if (faintedId !== null) endBattle(battle, faintedId);
}

function endBattle(battle, loserId) {
  const winnerId = battle.order.find(o => o !== loserId);
  for (const pid of battle.order) {
    const me = battle.sides[pid];
    const ws = entityWs(me.entity);
    if (ws) send(ws, { t: 'battleEnd', win: pid === winnerId,
                       youMon: me.mon.name, result: pid === winnerId ? 'won' : 'lost' });
    me.entity.battleId = null;
    broadcast({ t: 'playerBattling', id: pid, inBattle: false });
  }
  battles.delete(battle.id);
}

function forfeit(playerId) {
  const p = players.get(playerId);
  if (!p || !p.battleId) return;
  const battle = battles.get(p.battleId);
  if (battle) endBattle(battle, playerId);
}

// ---- connection handling ----
wss.on('connection', (ws) => {
  const id = nextId++;
  const spawn = map.randomSpawn();
  const p = { id, name: 'TrainerJD', charId: (id - 1) % NUM_CHARS,
              x: spawn.x, y: spawn.y, dir: 'down', ws, battleId: null, line: '' };
  players.set(id, p);

  send(ws, {
    t: 'init', id, tile: map.TILE, w: map.W, h: map.H,
    ground: map.GROUND, objects: map.OBJECTS,
    you: publicPlayer(p),
    players: [...players.values()].filter(o => o.id !== id).map(publicPlayer)
      .concat([...npcs.values()].map(publicPlayer)),
  });
  broadcast({ t: 'join', player: publicPlayer(p) }, id);
  console.log(`+ ${p.name} connected (${players.size} online)`);

  ws.on('message', (raw) => {
    let msg; try { msg = JSON.parse(raw); } catch { return; }
    const me = players.get(id);
    if (!me) return;

    if (msg.t === 'setName' && typeof msg.name === 'string') {
      me.name = msg.name.slice(0, 16).replace(/[^\w \-]/g, '') || me.name;
      broadcast({ t: 'playerName', id, name: me.name });
      send(ws, { t: 'nameOk', name: me.name });
      return;
    }

    if (msg.t === 'setBattleLine' && typeof msg.line === 'string') {
      me.line = msg.line.slice(0, 70);
      send(ws, { t: 'lineOk', line: me.line });
      return;
    }

    if (msg.t === 'move') {
      if (me.battleId) return;                    // can't walk mid-battle
      const { tx, ty, dir } = msg;
      me.dir = dir || me.dir;
      if (typeof tx !== 'number' || typeof ty !== 'number') return;
      // only allow single-step orthogonal moves
      if (Math.abs(tx - me.x) + Math.abs(ty - me.y) !== 1) { broadcast({ t: 'moved', id, x: me.x, y: me.y, dir: me.dir }); return; }
      // walking into another trainer (player OR npc) -> battle
      const occupant = [...players.values(), ...npcs.values()]
        .find(o => o.id !== id && o.x === tx && o.y === ty && !o.battleId);
      if (occupant) {
        me.dir = dir || me.dir;
        broadcast({ t: 'moved', id, x: me.x, y: me.y, dir: me.dir });
        startBattle(me, occupant);
        return;
      }
      if (map.isBlocked(tx, ty)) { broadcast({ t: 'moved', id, x: me.x, y: me.y, dir: me.dir }); return; }
      me.x = tx; me.y = ty;
      broadcast({ t: 'moved', id, x: me.x, y: me.y, dir: me.dir });
      return;
    }

    if (msg.t === 'chat' && typeof msg.text === 'string') {
      const text = msg.text.slice(0, 120);
      if (text.trim()) broadcast({ t: 'chat', id, name: me.name, text });
      return;
    }

    if (msg.t === 'battleMove' && me.battleId) {
      const battle = battles.get(me.battleId);
      if (!battle) return;
      const side = battle.sides[id];
      if (!side || side.choice) return;
      if (!side.mon.moves.includes(msg.move)) return;
      side.choice = msg.move;
      // NPC opponents pick automatically so solo battles resolve immediately
      for (const pid of battle.order) {
        const s = battle.sides[pid];
        if (!s.choice && s.entity.isNPC) s.choice = aiMove(s.mon);
      }
      const both = battle.order.every(pid => battle.sides[pid].choice);
      if (both) resolveBattle(battle);
      else send(ws, { t: 'battleWait' });         // waiting for foe
      return;
    }

    if (msg.t === 'battleFlee' && me.battleId) { forfeit(id); return; }
  });

  ws.on('close', () => {
    forfeit(id);
    players.delete(id);
    broadcast({ t: 'leave', id });
    console.log(`- ${p.name} disconnected (${players.size} online)`);
  });
});

// ---- NPC trainers: wander near their home tile, battle players who bump them ----
// Names + battle lines are left blank for you to fill in (edit these three).
const NPC_DEFS = [
  { name: '', line: '', charId: 1,  species: 'charmander', x: 11, y: 7  },
  { name: '', line: '', charId: 15, species: 'sprigatito', x: 16, y: 7  },
  { name: '', line: '', charId: 6,  species: 'quaxly',     x: 17, y: 10 },
];
NPC_DEFS.forEach((d, i) => {
  const id = 10001 + i;
  npcs.set(id, { id, name: d.name, line: d.line, charId: d.charId, species: d.species,
                 x: d.x, y: d.y, homeX: d.x, homeY: d.y, dir: 'down', battleId: null, isNPC: true, ws: null });
});

setInterval(() => {
  for (const npc of npcs.values()) {
    if (npc.battleId || Math.random() < 0.45) continue;   // often idle
    const dirs = [[1, 0, 'right'], [-1, 0, 'left'], [0, 1, 'down'], [0, -1, 'up']];
    const [dx, dy, dir] = dirs[Math.floor(Math.random() * dirs.length)];
    const nx = npc.x + dx, ny = npc.y + dy;
    npc.dir = dir;
    const leashed = Math.abs(nx - npc.homeX) + Math.abs(ny - npc.homeY) > 3;
    if (leashed || map.isBlocked(nx, ny) || tileTaken(nx, ny, npc.id)) {
      broadcast({ t: 'moved', id: npc.id, x: npc.x, y: npc.y, dir });   // just turn
      continue;
    }
    npc.x = nx; npc.y = ny;
    broadcast({ t: 'moved', id: npc.id, x: nx, y: ny, dir });
  }
}, 1500);

server.listen(PORT, () => {
  console.log(`\n  PokeMMO slice running:  http://localhost:${PORT}`);
  console.log(`  ${npcs.size} NPC trainers wandering the world\n`);
});
