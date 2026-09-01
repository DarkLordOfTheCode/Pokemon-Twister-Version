// Pokémon Twister Version — authoritative-lite Node server.
// - serves the Phaser client from /public and Phaser itself from /vendor
// - tracks players in a shared overworld over WebSockets
// - runs level-based turn battles when two trainers collide
//
// Wire protocol is newline-free JSON objects with a `t` (type) field.

const path = require('path');
const http = require('http');
const express = require('express');
const { WebSocketServer } = require('ws');

const map = require('./map');
const {
  SPECIES, MOVES, PLAYABLE_KEYS, MAX_LEVEL, STATUS, ITEMS, STARTING_BAG, STARTING_MONEY,
  DESERT_LEVEL, WILD_POOL, ENCOUNTER_CHANCE, wildLevel,
  typeEffect, makeMon, xpToNext, xpForWin, moneyForWin,
} = require('./data');

const PORT = process.env.PORT || 3000;
// Debug tools are off unless the server was started with TWISTER_DEV=1.
const DEBUG = !!process.env.TWISTER_DEV;
const app = express();
app.use(express.static(path.join(__dirname, '..', 'public')));
app.use('/vendor', express.static(path.join(__dirname, '..', 'node_modules', 'phaser', 'dist')));

// The client preloads one sprite per species and builds the partner picker from
// this, so the roster only ever has to be edited in data.js.
app.get('/api/species', (_req, res) => {
  res.json(Object.entries(SPECIES).map(([key, s]) => ({
    key, name: s.name, gen: s.gen, dex: s.dex, types: s.types, tier: s.tier,
  })));
});

const server = http.createServer(app);
const wss = new WebSocketServer({ server });

// ---- world state ----
const players = new Map();   // id -> { id, name, charId, x, y, dir, ws, battleId, species, level, xp }
const npcs = new Map();      // id -> wandering NPC trainer (ws:null, isNPC:true)
const battles = new Map();   // id -> battle session
let nextId = 1;
let nextBattleId = 1;
let nextWildId = -1;      // wild mons count downwards, away from real entities
// walk_0 blonde girl · walk_1 dark-haired boy · walk_2 bearded hiker
// walk_3 capped kid · walk_4 green-capped kid · walk_5 girl in a sun hat
const NUM_CHARS = 6;         // walk_0 .. walk_5 — the animated overworld trainers
const START_LEVEL = 5;

function send(ws, obj) {
  if (ws && ws.readyState === 1) ws.send(JSON.stringify(obj));
}
function broadcast(obj, exceptId) {
  const s = JSON.stringify(obj);
  for (const p of players.values())
    if (p.id !== exceptId && p.ws.readyState === 1) p.ws.send(s);
}
function publicPlayer(p) {
  return { id: p.id, name: p.name, charId: p.charId, x: p.x, y: p.y, dir: p.dir,
           level: p.level, isNPC: !!p.isNPC, inBattle: !!p.battleId,
           talk: !!p.talk, wild: !!p.isWild, overworld: p.overworld || null };
}
function randPlayable() { return PLAYABLE_KEYS[Math.floor(Math.random() * PLAYABLE_KEYS.length)]; }
const entityWs = (e) => (e && e.ws) ? e.ws : null;     // NPCs have ws:null
const tileTaken = (tx, ty, exceptId) =>
  [...players.values(), ...npcs.values()].some(o => o.id !== exceptId && o.x === tx && o.y === ty);

// What the client needs to draw one side of the field.
function monView(mon, full) {
  const v = { key: mon.key, name: mon.name, types: mon.types, dex: mon.dex, gen: mon.gen,
              level: mon.level, hp: mon.hp, maxhp: mon.maxhp, status: mon.status };
  if (full) { v.atk = mon.atk; v.def = mon.def; v.spd = mon.spd; }
  return v;
}
function progress(p) {
  return { level: p.level, xp: p.xp, xpNext: xpToNext(p.level), species: p.species,
           speciesName: SPECIES[p.species].name, money: p.money };
}

// The bag as the client wants it: one row per item type still held.
function bagView(p) {
  return Object.entries(p.bag || {}).map(([key, count]) => ({
    key, count, name: ITEMS[key].name,
    heal: ITEMS[key].heal || 0, cures: ITEMS[key].cures || [],
  }));
}

// ---- status conditions ----
// Paralysis halves speed and burn halves attack, so both show up in the maths
// rather than only in the message log.
const effSpeed = (m) => (m.status === 'par' ? Math.floor(m.spd / 2) : m.spd);
const effAtk   = (m) => (m.status === 'brn' ? Math.floor(m.atk / 2) : m.atk);

// A mon can only carry one status, and its typing can shrug some off entirely.
function canCatchStatus(mon, key) {
  return !mon.status && !STATUS[key].immune.some((t) => mon.types.includes(t));
}
function applyStatus(mon, key) {
  mon.status = key;
  if (key === 'slp') mon.sleepTurns = 1 + Math.floor(Math.random() * 3);
}

// Checked before a mon acts. Freeze and sleep can end here; paralysis just
// sometimes eats the turn.
function preMove(mon) {
  if (mon.status === 'frz') {
    if (Math.random() < 0.20) { mon.status = null; return { blocked: false, note: `${mon.name} thawed out!` }; }
    return { blocked: true, note: `${mon.name} is frozen solid!` };
  }
  if (mon.status === 'slp') {
    // Count down *after* losing the turn, so being put to sleep always costs at
    // least one turn even when the roll came up 1.
    if (mon.sleepTurns <= 0) { mon.status = null; return { blocked: false, note: `${mon.name} woke up!` }; }
    mon.sleepTurns -= 1;
    return { blocked: true, note: `${mon.name} is fast asleep.` };
  }
  if (mon.status === 'par' && Math.random() < 0.25)
    return { blocked: true, note: `${mon.name} is paralysed! It can't move!` };
  return { blocked: false, note: null };
}

// Burn and poison bite at the end of every round.
function endOfTurn(mon) {
  if (mon.status !== 'brn' && mon.status !== 'psn') return null;
  const dmg = Math.max(1, Math.floor(mon.maxhp / 16));
  mon.hp = Math.max(0, mon.hp - dmg);
  return `${mon.name} is hurt by its ${mon.status === 'brn' ? 'burn' : 'poison'}! (-${dmg})`;
}

// Spending an item costs the turn. Returns the log line, or null if the item
// would have done nothing (full HP, wrong cure) — the caller refunds the turn.
function useItem(entity, mon, itemKey) {
  const it = ITEMS[itemKey];
  if (!it || !entity.bag || !entity.bag[itemKey]) return null;
  let note;
  if (it.heal) {
    if (mon.hp >= mon.maxhp) return null;
    const healed = Math.min(it.heal, mon.maxhp - mon.hp);
    mon.hp += healed;
    note = `${entity.name} used a ${it.name}. ${mon.name} recovered ${healed} HP!`;
  } else {
    if (!mon.status || !it.cures.includes(mon.status)) return null;
    note = `${entity.name} used a ${it.name}. ${mon.name}'s ${STATUS[mon.status].name.toLowerCase()} cleared!`;
    mon.status = null;
  }
  entity.bag[itemKey] -= 1;
  if (entity.bag[itemKey] <= 0) delete entity.bag[itemKey];
  return note;
}

// NPCs pick whatever hits hardest against what's actually in front of them —
// higher-level trainers therefore feel like they're reading your typing.
function aiMove(mon, foe) {
  let best = mon.moves[0], bestScore = -1;
  for (const key of mon.moves) {
    const mv = MOVES[key];
    const stab = mon.types.includes(mv.type) ? 1.5 : 1;
    // a status move has no power, so score it by how likely it is to land
    const score = mv.power
      ? mv.power * stab * typeEffect(mv.type, foe.types)
      : (mv.status && canCatchStatus(foe, mv.status) ? 70 * mv.chance : 0);
    if (score > bestScore) { bestScore = score; best = key; }
  }
  return best;
}

// ---- talking ----
// Walking into a `talk` NPC opens a dialogue instead of a battle. The elder
// hands the TM over the first time and has different things to say once you
// hold it, and again once you've set it off.
function talkTo(p, npc) {
  const ws = entityWs(p);
  // Some talkers won't give you the time of day until you've earned it.
  if (npc.minLevel && p.level < npc.minLevel && !p.usedTwister) {
    send(ws, { t: 'dialogue', name: npc.name, lines: npc.linesTooWeak, gave: null });
    return;
  }
  const holds = !!p.bag.tmtwister;
  let lines, gave = null;
  if (p.usedTwister)   lines = npc.linesAfter;
  else if (holds)      lines = npc.linesWaiting;
  else {
    lines = npc.linesGive;
    p.bag.tmtwister = 1;
    gave = ITEMS.tmtwister.name;
  }
  send(ws, { t: 'dialogue', name: npc.name, lines, gave, bag: bagView(p) });
  if (gave) send(ws, { t: 'progress', you: progress(p) });
}

// ---- battle logic ----
// `a` is always a connected player; `b` may be another player or an NPC trainer.
function startBattle(a, b) {
  const id = nextBattleId++;
  const monA = makeMon(a.species || randPlayable(), a.level || START_LEVEL, a.learned);
  const monB = makeMon(b.species || randPlayable(), b.level || START_LEVEL, b.learned);
  const battle = { id, sides: { [a.id]: { entity: a, mon: monA, choice: null },
                                [b.id]: { entity: b, mon: monB, choice: null } }, order: [a.id, b.id] };
  battles.set(id, battle);
  if (b.isNPC && !b.isWild && a.met) a.met.add(b.id);
  if (a.isNPC && !a.isWild && b.met) b.met.add(a.id);
  a.battleId = id; b.battleId = id;
  for (const pid of battle.order) {
    const me = battle.sides[pid];
    const foe = battle.sides[battle.order.find(o => o !== pid)];
    const ws = entityWs(me.entity);
    if (ws) send(ws, {
      t: 'battleStart', battleId: id,
      you: { id: pid, name: me.entity.name, mon: monView(me.mon, true),
             moves: me.mon.moves.map(m => ({ key: m, ...MOVES[m] })),
             bag: bagView(me.entity) },
      foe: { id: foe.entity.id, name: foe.entity.name, line: foe.entity.line || '',
             mon: monView(foe.mon, false) },
    });
  }
  broadcast({ t: 'playerBattling', id: a.id, inBattle: true });
  broadcast({ t: 'playerBattling', id: b.id, inBattle: true });
}

// One mon per side and no healing, so the standard formula ends fights in two or
// three hits. PACE stretches them to roughly five turns without touching the maths.
const PACE = 0.3;

function damage(attacker, defender, moveKey) {
  const mv = MOVES[moveKey];
  // a powerless move is a pure status move — it lands or it doesn't, no damage
  if (!mv.power) return { dmg: 0, eff: 1, move: mv.name, type: mv.type, statusMove: true };
  const eff = typeEffect(mv.type, defender.types);
  const stab = attacker.types.includes(mv.type) ? 1.5 : 1;
  const rnd = 0.85 + Math.random() * 0.15;
  const base = ((2 * attacker.level) / 5 + 2) * mv.power * (effAtk(attacker) / defender.def) / 50 + 2;
  const dmg = eff === 0 ? 0 : Math.max(1, Math.round(base * eff * stab * rnd * PACE));
  defender.hp = Math.max(0, defender.hp - dmg);
  return { dmg, eff, move: mv.name, type: mv.type, statusMove: false };
}

function resolveBattle(battle) {
  const [id1, id2] = battle.order;
  const s1 = battle.sides[id1], s2 = battle.sides[id2];

  // Every log line carries the state it leaves behind, so the client can move
  // the HP bars and status chips in step with the text.
  const snapshot = () => Object.fromEntries(battle.order.map((pid) => {
    const m = battle.sides[pid].mon;
    return [pid, { hp: m.hp, status: m.status }];
  }));
  const log = [];
  const say = (text) => log.push({ text, state: snapshot() });

  // Reaching into the bag happens before anyone swings; otherwise speed decides.
  const rank = (side) => (side.choice.kind === 'item' ? 0 : 1);
  let first = id1, second = id2;
  const tie = effSpeed(s2.mon) > effSpeed(s1.mon) ||
              (effSpeed(s2.mon) === effSpeed(s1.mon) && Math.random() < 0.5);
  if (rank(s2) < rank(s1) || (rank(s2) === rank(s1) && tie)) { first = id2; second = id1; }

  for (const pid of [first, second]) {
    const me = battle.sides[pid];
    const foe = battle.sides[battle.order.find((o) => o !== pid)];
    if (me.mon.hp <= 0) continue;                 // fainted before acting

    if (me.choice.kind === 'item') {
      const note = useItem(me.entity, me.mon, me.choice.item);
      say(note || `${me.entity.name} rummaged in the bag, but it did nothing.`);
      continue;
    }

    const pre = preMove(me.mon);
    if (pre.note) say(pre.note);
    if (pre.blocked) continue;

    const r = damage(me.mon, foe.mon, me.choice.move);
    const effTxt = r.statusMove ? ''
      : r.eff === 0 ? " It doesn't affect the target…"
      : r.eff > 1 ? " It's super effective!"
      : r.eff < 1 ? " It's not very effective…" : '';
    say(`${me.mon.name} used ${r.move}!${r.statusMove ? '' : ` (-${r.dmg})`}${effTxt}`);

    const mv = MOVES[me.choice.move];
    if (mv.status && r.eff !== 0 && Math.random() < mv.chance && canCatchStatus(foe.mon, mv.status)) {
      applyStatus(foe.mon, mv.status);
      say(`${foe.mon.name} ${STATUS[mv.status].onset}`);
    } else if (r.statusMove) {
      say(foe.mon.status
        ? `${foe.mon.name} is already ${STATUS[foe.mon.status].is}.`
        : `${foe.mon.name} shook it off.`);
    }
  }

  // burn / poison chip, once both sides have acted
  for (const pid of [first, second]) {
    const me = battle.sides[pid];
    if (me.mon.hp <= 0) continue;
    const note = endOfTurn(me.mon);
    if (note) say(note);
  }

  s1.choice = null; s2.choice = null;
  const faintedId = s1.mon.hp <= 0 ? id1 : (s2.mon.hp <= 0 ? id2 : null);

  for (const pid of battle.order) {
    const me = battle.sides[pid];
    const foe = battle.sides[battle.order.find((o) => o !== pid)];
    const ws = entityWs(me.entity);
    if (ws) send(ws, { t: 'battleTurn', log, youHp: me.mon.hp, youMax: me.mon.maxhp,
                       youStatus: me.mon.status, foeHp: foe.mon.hp, foeMax: foe.mon.maxhp,
                       foeStatus: foe.mon.status, bag: bagView(me.entity) });
  }
  if (faintedId !== null) endBattle(battle, faintedId);
}

// Winning a battle grants XP scaled to the loser's level; losing costs nothing
// but the walk back. Levels are per-session — there's no save file yet.
function awardXp(winner, loserLevel) {
  if (winner.isNPC) return null;
  const gained = xpForWin(loserLevel);
  const cash = moneyForWin(loserLevel);
  winner.xp += gained;
  winner.money += cash;
  const levels = [];
  while (winner.level < MAX_LEVEL && winner.xp >= xpToNext(winner.level)) {
    winner.xp -= xpToNext(winner.level);
    winner.level += 1;
    levels.push(winner.level);
  }
  if (winner.level >= MAX_LEVEL) winner.xp = 0;
  return { gained, levels, cash };
}

function endBattle(battle, loserId) {
  const winnerId = battle.order.find(o => o !== loserId);
  const winnerSide = battle.sides[winnerId];
  const loserSide = battle.sides[loserId];
  const reward = awardXp(winnerSide.entity, loserSide.mon.level);

  for (const pid of battle.order) {
    const me = battle.sides[pid];
    const ws = entityWs(me.entity);
    const won = pid === winnerId;
    if (ws) send(ws, {
      t: 'battleEnd', win: won, youMon: me.mon.name, result: won ? 'won' : 'lost',
      xp: won && reward ? reward.gained : 0,
      money: won && reward ? reward.cash : 0,
      levelUps: won && reward ? reward.levels : [],
      you: progress(me.entity),
    });
    me.entity.battleId = null;
    broadcast({ t: 'playerBattling', id: pid, inBattle: false });
  }
  if (reward && reward.levels.length) {
    broadcast({ t: 'playerLevel', id: winnerId, level: winnerSide.entity.level });
  }
  battles.delete(battle.id);
}

function forfeit(playerId) {
  const p = players.get(playerId);
  if (!p || !p.battleId) return;
  const battle = battles.get(p.battleId);
  if (battle) endBattle(battle, playerId);
}

// ---- tall grass ----
// Every step taken on an 'H' tile is one roll for a wild encounter. The wild mon
// is a throwaway entity: it has no socket and never joins `npcs`, so once the
// battle ends it simply stops existing.
function maybeWildEncounter(p) {
  if (p.battleId || map.GROUND[p.y][p.x] !== 'H') return;
  if (Math.random() >= ENCOUNTER_CHANCE) return;
  spawnWild(p);
}

function spawnWild(p) {
  if (p.battleId) return;
  const key = WILD_POOL[Math.floor(Math.random() * WILD_POOL.length)];
  const wild = {
    id: nextWildId--, name: `Wild ${SPECIES[key].name}`, species: key,
    level: wildLevel(p.level), isNPC: true, isWild: true, ws: null,
    line: '', bag: {}, learned: [],
  };
  startBattle(p, wild);
}

// Somewhere worth standing for each part of the game, for the debug warp.
const WARPS = {
  plaza:  { x: 10, y: 7 },   grass:  { x: 4,  y: 7 },
  mart:   { x: 10, y: 4 },   cave:   { x: 14, y: 24 },
  elder:  { x: 14, y: 42 },  desert: { x: 14, y: 46 },
};

// ---- the Twister ----
// What the trainers you've already beaten shout when they come running. The
// first one is the line that matters; the rest are colour. Rewrite freely.
const CROWD_LINES = [
  "Wow! That was a big explosion!",
  "I felt that through my boots up on the ridge.",
  "The whole mountain went sideways. What did you DO?",
  "I lost a Potion down a crack. Worth it.",
  "You blew a hole in the world, kid.",
  "My ears are still ringing. Do it again.",
  "That wall stood for four hundred years.",
  "Someone tell the mart. Tell everyone.",
  "I came running the second I heard it.",
  "Right. I'm following you through that hole.",
  "Sand. Why is there sand coming out of it?",
  "So THAT'S what the old man was guarding.",
  "You've gone and done it now.",
  "Beekeeper's going to want a word.",
];

// How long the crowd stands about in the cave before going back to their posts.
const CROWD_STAY_MS = 15000;

// Every trainer you've beaten drops what they're doing and crowds in around you.
// Their home is deliberately NOT changed: they have to go back afterwards, or
// the plaza is left empty for everyone and the wander leash pins them down here.
function gatherCrowd(p) {
  const taken = new Set([...players.values(), ...npcs.values()].map(o => `${o.x},${o.y}`));
  // Never let anyone stand in the gap they just watched appear, or wander out
  // onto the sand — the crowd would wall the player back in.
  const inGap = (t) => map.SECRET_EXIT.some((e) => e.x === t.x && e.y === t.y);
  const spots = map.walkableIn(p.y - 5, p.y + 1)
    .filter(t => !taken.has(`${t.x},${t.y}`) && !inGap(t) && t.y < map.DESERT_TOP)
    .sort((a, b) => (Math.abs(a.x - p.x) + Math.abs(a.y - p.y)) -
                    (Math.abs(b.x - p.x) + Math.abs(b.y - p.y)));
  const crowd = [], came = [];
  [...p.met].map(id => npcs.get(id)).filter(Boolean).forEach((npc, i) => {
    const spot = spots[i];
    if (!spot) return;
    npc.x = spot.x; npc.y = spot.y;
    broadcast({ t: 'moved', id: npc.id, x: npc.x, y: npc.y, dir: 'up' });
    crowd.push({ name: npc.name, text: CROWD_LINES[i % CROWD_LINES.length] });
    came.push(npc);
  });

  // Send them back to where they belong once the moment has passed.
  setTimeout(() => {
    for (const npc of came) {
      if (npc.battleId) continue;              // don't yank someone mid-fight
      npc.x = npc.homeX; npc.y = npc.homeY;
      broadcast({ t: 'moved', id: npc.id, x: npc.x, y: npc.y, dir: 'down' });
    }
  }, CROWD_STAY_MS);

  return crowd;
}

// The blast doesn't only open a wall. Every trainer that heard it — and the one
// who set it off — is wrung back down to level 1. The wild Dragonite out in the
// sand heard nothing and are untouched.
function resetLevels(p) {
  for (const npc of npcs.values()) {
    if (npc.isWild || !npc.level) continue;
    npc.level = 1;
    broadcast({ t: 'playerLevel', id: npc.id, level: 1 });
  }
  p.level = 1;
  p.xp = 0;
  broadcast({ t: 'playerLevel', id: p.id, level: 1 });
}

// The one-shot story beat: teach the move, blow the wall, pull the crowd in.
// Only works standing near the sealed wall — the TM does nothing anywhere else.
const NEAR_EXIT = (p) => map.SECRET_EXIT.some(
  (e) => Math.abs(e.x - p.x) + Math.abs(e.y - p.y) <= 4);

function fireTwister(p) {
  p.bag.tmtwister -= 1;
  if (p.bag.tmtwister <= 0) delete p.bag.tmtwister;
  if (!p.learned.includes('twister')) p.learned.push('twister');
  p.usedTwister = true;

  const opened = map.openSecretExit();
  const crowd = gatherCrowd(p);
  resetLevels(p);

  send(p.ws, {
    t: 'twister',
    lines: [
      `${SPECIES[p.species].name} learned Twister!`,
      "You turn to the wall and call the move.",
      "The air in the chamber starts to turn. Dust climbs the walls.",
      "Then it lets go.",
    ],
    crowd,
    after: [
      "Elder Baran: \"Forty years. An afternoon.\"",
      "The south wall is gone. Hot air pours in through the gap.",
      "Beyond it: sand, to the horizon.",
      "",
      "Something else went with the wall.",
      "Every trainer in the pass is sat down, staring at their Pokémon.",
      "Yours too. Level 1. All of it, gone.",
    ],
    tiles: opened,
    bag: bagView(p),
  });
  send(p.ws, { t: 'progress', you: progress(p) });

  // everyone else just feels it
  if (opened.length) broadcast({ t: 'exitOpened', tiles: opened }, p.id);
  broadcast({ t: 'chat', id: 0, name: '—', text:
              `A blast tears through the mountain pass. ${p.name} did something.` }, p.id);
}

// ---- death in the desert ----
// The sand is a hard level gate, not a fight you can lose gracefully.
function blackout(p) {
  const spawn = map.randomSpawn();
  p.x = spawn.x; p.y = spawn.y; p.dir = 'down';
  send(p.ws, { t: 'died', x: p.x, y: p.y, lines: [
    "You step out onto the sand.",
    "The heat arrives first. Then the shadow.",
    "Wings. Dozens of pairs of them, blotting out the sun.",
    "The Dragonite do not fight you. They simply arrive.",
    `${p.name} died in the desert.`,
    "You wake on the plaza floor with sand in your teeth.",
  ] });
  broadcast({ t: 'moved', id: p.id, x: p.x, y: p.y, dir: 'down' });
}

// ---- the mart ----
// The shop is wherever the map draws an 'M'; standing next to any of its three
// tiles is close enough to be served.
const MART_TILES = new Set();
for (let y = 0; y < map.H; y++)
  for (let x = 0; x < map.W; x++)
    if (map.OBJECTS[y][x] === 'M')
      for (let dx = 0; dx < 3; dx++) MART_TILES.add(`${x + dx},${y}`);
const atShop = (p) => [[0, 1], [0, -1], [1, 0], [-1, 0]]
  .some(([dx, dy]) => MART_TILES.has(`${p.x + dx},${p.y + dy}`));
const CATALOGUE = Object.entries(ITEMS).filter(([, it]) => !it.noShop).map(([key, it]) => ({
  key, name: it.name, price: it.price, heal: it.heal || 0, cures: it.cures || [],
}));

// ---- connection handling ----
wss.on('connection', (ws) => {
  const id = nextId++;
  const spawn = map.randomSpawn();
  const p = { id, name: 'TrainerJD', charId: (id - 1) % NUM_CHARS,
              x: spawn.x, y: spawn.y, dir: 'down', ws, battleId: null, line: '',
              species: randPlayable(), level: START_LEVEL, xp: 0,
              bag: { ...STARTING_BAG }, money: STARTING_MONEY,
              // story state: who you've fought, what TMs taught you, and whether
              // you've already set the Twister off
              met: new Set(), learned: [], usedTwister: false };
  players.set(id, p);

  send(ws, {
    t: 'init', id, tile: map.TILE, w: map.W, h: map.H, debug: DEBUG,
    ground: map.GROUND, objects: map.OBJECTS,
    you: publicPlayer(p), progress: progress(p),
    players: [...players.values()].filter(o => o.id !== id).map(publicPlayer)
      .concat([...npcs.values()].map(publicPlayer)),
  });
  broadcast({ t: 'join', player: publicPlayer(p) }, id);
  console.log(`+ ${p.name} connected (${players.size} online)`);

  ws.on('message', (raw) => {
    let msg; try { msg = JSON.parse(raw); } catch { return; }
    const me = players.get(id);
    if (!me) return;
    const side = (pid) => { const b = battles.get(me.battleId); return b && b.sides[pid]; };
    // Lock in this turn's choice; NPCs answer straight away so solo fights resolve.
    const commit = (pid, choice, sock) => {
      const battle = battles.get(me.battleId);
      if (!battle) return;
      battle.sides[pid].choice = choice;
      for (const other of battle.order) {
        const sd = battle.sides[other];
        const foe = battle.sides[battle.order.find((o) => o !== other)];
        if (!sd.choice && sd.entity.isNPC) sd.choice = { kind: 'move', move: aiMove(sd.mon, foe.mon) };
      }
      if (battle.order.every((o) => battle.sides[o].choice)) resolveBattle(battle);
      else send(sock, { t: 'battleWait' });
    };

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

    // Choosing a partner is only allowed before your first battle, and never a boss mon.
    if (msg.t === 'setSpecies' && typeof msg.species === 'string') {
      if (me.battleId || !PLAYABLE_KEYS.includes(msg.species)) return;
      me.species = msg.species;
      send(ws, { t: 'progress', you: progress(me) });
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
        // Some NPCs talk instead of fighting. Everyone else throws hands.
        if (occupant.talk) talkTo(me, occupant);
        else startBattle(me, occupant);
        return;
      }
      if (map.isBlocked(tx, ty)) { broadcast({ t: 'moved', id, x: me.x, y: me.y, dir: me.dir }); return; }
      // One step onto the sand under the gate level and that is the end of you.
      if (ty >= map.DESERT_TOP && me.level < DESERT_LEVEL) { blackout(me); return; }
      me.x = tx; me.y = ty;
      broadcast({ t: 'moved', id, x: me.x, y: me.y, dir: me.dir });
      maybeWildEncounter(me);
      return;
    }

    if (msg.t === 'chat' && typeof msg.text === 'string') {
      const text = msg.text.slice(0, 120);
      if (text.trim()) broadcast({ t: 'chat', id, name: me.name, text });
      return;
    }

    if (msg.t === 'battleMove' && me.battleId) {
      if (!side(id) || side(id).choice) return;
      if (!side(id).mon.moves.includes(msg.move)) return;
      commit(id, { kind: 'move', move: msg.move }, ws);
      return;
    }

    if (msg.t === 'battleItem' && me.battleId) {
      if (!side(id) || side(id).choice) return;
      if (!ITEMS[msg.item] || !me.bag[msg.item]) return;
      commit(id, { kind: 'item', item: msg.item }, ws);
      return;
    }

    // ---- the mart ----
    if (msg.t === 'shopOpen') {
      if (me.battleId || !atShop(me)) return;
      send(ws, { t: 'shop', catalogue: CATALOGUE, money: me.money, bag: bagView(me) });
      return;
    }

    if (msg.t === 'buy' && typeof msg.item === 'string') {
      if (me.battleId || !atShop(me)) return;
      const it = ITEMS[msg.item];
      if (!it) return;
      if (me.money < it.price) { send(ws, { t: 'shopUpdate', money: me.money, bag: bagView(me),
                                            note: "You can't afford that." }); return; }
      me.money -= it.price;
      me.bag[msg.item] = (me.bag[msg.item] || 0) + 1;
      send(ws, { t: 'shopUpdate', money: me.money, bag: bagView(me), note: `Bought one ${it.name}.` });
      send(ws, { t: 'progress', you: progress(me) });
      return;
    }

    // ---- debug ----
    // Only ever live when the server was started with TWISTER_DEV=1, so none of
    // this is reachable in normal play.
    if (msg.t === 'debug' && DEBUG) {
      const note = (text) => send(ws, { t: 'note', text: `Debug: ${text}` });
      switch (msg.action) {
        case 'level':
          me.level = Math.max(1, Math.min(MAX_LEVEL, msg.value | 0));
          me.xp = 0;
          send(ws, { t: 'progress', you: progress(me) });
          broadcast({ t: 'playerLevel', id, level: me.level });
          note(`level set to ${me.level}.`);
          break;
        case 'money':
          me.money = Math.max(0, me.money + (msg.value | 0));
          send(ws, { t: 'progress', you: progress(me) });
          note(`money is now ${me.money}.`);
          break;
        case 'tm':
          me.bag.tmtwister = (me.bag.tmtwister || 0) + 1;
          note('TM Twister added to your bag.');
          break;
        case 'encounter':
          spawnWild(me);
          break;
        case 'warp': {
          const w = WARPS[msg.value];
          if (!w) break;
          me.x = w.x; me.y = w.y; me.dir = 'down';
          send(ws, { t: 'warped', x: w.x, y: w.y });
          broadcast({ t: 'moved', id, x: w.x, y: w.y, dir: 'down' });
          note(`warped to the ${msg.value}.`);
          break;
        }
        case 'openexit': {
          const opened = map.openSecretExit();
          if (opened.length) broadcast({ t: 'exitOpened', tiles: opened });
          note(opened.length ? 'secret exit opened.' : 'the exit was already open.');
          break;
        }
        case 'resetstory':
          me.usedTwister = false;
          me.met.clear();
          me.learned = [];
          delete me.bag.tmtwister;
          note('story state reset — the wall stays open.');
          break;
        default: break;
      }
      return;
    }

    // ---- the TM ----
    if (msg.t === 'useTm') {
      if (me.battleId || !me.bag.tmtwister) return;
      if (!NEAR_EXIT(me)) {
        send(ws, { t: 'note', text: 'You raise the TM. Nothing here answers it.' });
        return;
      }
      fireTwister(me);
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

// ---- NPC trainers ----
// A rough difficulty ladder: start with the kids near the plaza and work outward.
// Beekeeper is the wall at the top — swap names, lines, species or levels freely.
const NPC_DEFS = [
  { name: 'Youngster Milo',  level: 6,  species: 'charmander',  charId: 1,  x: 11, y: 7,
    line: "First battle of the day. Go easy on me!" },
  { name: 'Lass Priya',      level: 8,  species: 'sprigatito',  charId: 0, x: 16, y: 7,
    line: "My Sprigatito's been practising all week." },
  { name: 'Swimmer Otto',    level: 10, species: 'quaxly',      charId: 1,  x: 17, y: 10,
    line: "Water's fine! Get in." },
  { name: 'Hiker Bruno',     level: 15, species: 'onix',        charId: 2,  x: 6,  y: 13,
    line: "You'll not dent this one, kid." },
  { name: 'Firebreather Rue',level: 20, species: 'arcanine',    charId: 4,  x: 22, y: 5,
    line: "Feel that heat? That's my Arcanine." },
  { name: 'Psychic Nadia',   level: 25, species: 'alakazam',    charId: 5, x: 5,  y: 4,
    line: "I already know which move you'll pick." },
  { name: 'Blackbelt Deniz', level: 30, species: 'machamp',     charId: 3,  x: 24, y: 15,
    line: "Four arms. One outcome." },
  { name: 'Hex Maniac Wren', level: 34, species: 'gengar',      charId: 5, x: 3,  y: 10,
    line: "Shhh. It's already behind you." },
  { name: 'Ace Trainer Vera',level: 38, species: 'meowscarada', charId: 0, x: 9,  y: 16,
    line: "No more warm-ups. Show me the real thing." },
  { name: 'Knight Sable',    level: 42, species: 'kingambit',   charId: 3, x: 20, y: 17,
    line: "Kneel, or be knelt." },
  { name: 'Dragon Tamer Ivo',level: 46, species: 'baxcalibur',  charId: 4,  x: 14, y: 17,
    line: "Ice and dragon. Nothing you have beats both." },
  { name: 'Beekeeper',       level: 52, species: 'roaringmoon', charId: 2, x: 24, y: 3,
    line: "Seen a Combee round here? No? ...Figures. My Roaring Moon ate the hive." },

  // ---- the mountain pass (rows 22-43) ----
  // The ladder continues underground. Free slots, all checked walkable:
  //   west chamber  (4,30) (9,32)   east chamber  (18,29) (23,32)
  //   deep chamber  (6,37) (21,37) (9,40) (14,42)
  { name: 'Miner Cato',      level: 16, species: 'onix',         charId: 2,  x: 9,  y: 24,
    line: "Been swinging a pick down here since sun-up. Arms like rope." },
  { name: 'Hiker Solvi',     level: 19, species: 'machamp',      charId: 3,  x: 18, y: 25,
    line: "These tunnels build shoulders. Want to see?" },

  // ---- the elder (deep chamber, right in front of the sealed wall) ----
  // He fights nobody. Walk into him and he talks; the first talk hands over the
  // TM. All three sets of lines are yours to rewrite.
  { name: 'Elder Baran', talk: true, still: true, charId: 2, x: 14, y: 41,
    minLevel: 30,
    linesTooWeak: [
      "Stop there. I can hear what you're carrying from here.",
      "It is not ready, and neither are you.",
      "Come back when you have taken something to level 30. Not before.",
    ],
    linesGive: [
      "Far enough, young one. This wall is where the pass ends.",
      "Or so the miners believe. I have sat with it forty years.",
      "There is a wind sleeping in the rock. It answers to one move only.",
      "Take this. It is the last one. Teach it to everything you carry.",
    ],
    linesWaiting: [
      "You are holding it. Good.",
      "Do not waste it in a battle. Use it HERE, facing the wall.",
      "Press T when you are ready, and stand back.",
    ],
    linesAfter: [
      "You heard it too, then. Forty years, and it took you an afternoon.",
      "Go on through. But listen — the sands past that wall are not empty.",
      "Dragonite. Dozens of them. They do not share the desert.",
      "Anything under level 55 that walks out there does not walk back.",
    ] },

  // ---- the desert (only reachable once the wall comes down) ----
  // Wild Dragonite. There is no catching in this game, and there never will be
  // for these — they are here to be survived, not collected.
  { name: 'Wild Dragonite', level: 55, species: 'dragonite', charId: 7, isWild: true, overworld: 'dragonite', x: 7,  y: 47,
    line: "It does not acknowledge you. It simply moves." },
  { name: 'Wild Dragonite', level: 57, species: 'dragonite', charId: 7, isWild: true, overworld: 'dragonite', x: 20, y: 51,
    line: "It has circled this dune since before the pass was sealed." },
  { name: 'Wild Dragonite', level: 56, species: 'dragonite', charId: 7, isWild: true, overworld: 'dragonite', x: 12, y: 57,
    line: "No ball you own means anything out here." },
  { name: 'Wild Dragonite', level: 58, species: 'dragonite', charId: 7, isWild: true, overworld: 'dragonite', x: 4,  y: 54,
    line: "It watched you come through the wall. It was not impressed." },
  { name: 'Wild Dragonite', level: 60, species: 'dragonite', charId: 7, isWild: true, overworld: 'dragonite', x: 23, y: 59,
    line: "The oldest of them. The sand around it is glass." },
  { name: 'Wild Dragonite', level: 59, species: 'dragonite', charId: 7, isWild: true, overworld: 'dragonite', x: 16, y: 44,
    line: "It landed between you and the way back." },
];

// Catch a typo'd coordinate the moment the server boots, rather than leaving a
// trainer standing inside a rock where nobody can reach them.
for (const d of NPC_DEFS) {
  if (map.isBlocked(d.x, d.y)) console.warn(`  ! ${d.name} is standing on a blocked tile (${d.x},${d.y})`);
}
NPC_DEFS.forEach((d, i) => {
  const id = 10001 + i;
  npcs.set(id, { ...d, id, homeX: d.x, homeY: d.y, dir: 'down',
                 battleId: null, isNPC: true, ws: null });
});

setInterval(() => {
  for (const npc of npcs.values()) {
    if (npc.still || npc.battleId || Math.random() < 0.45) continue;   // often idle
    const dirs = [[1, 0, 'right'], [-1, 0, 'left'], [0, 1, 'down'], [0, -1, 'up']];
    const [dx, dy, dir] = dirs[Math.floor(Math.random() * dirs.length)];
    const nx = npc.x + dx, ny = npc.y + dy;
    npc.dir = dir;
    // If something has left them stranded far from home, head back instead of
    // wandering — otherwise the leash below freezes them wherever they stand.
    const fromHome = Math.abs(npc.x - npc.homeX) + Math.abs(npc.y - npc.homeY);
    if (fromHome > 6) {
      npc.x = npc.homeX; npc.y = npc.homeY;
      broadcast({ t: 'moved', id: npc.id, x: npc.x, y: npc.y, dir: 'down' });
      continue;
    }
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
  console.log(`\n  Pokémon Twister Version running:  http://localhost:${PORT}`);
  const levels = NPC_DEFS.filter(d => d.level).map(d => d.level);
  console.log(`  ${Object.keys(SPECIES).length} species · ${npcs.size} trainers, Lv ` +
              `${Math.min(...levels)}–${Math.max(...levels)}\n`);
});
