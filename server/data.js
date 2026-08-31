// Pokémon, moves, types and level maths for the Gen 1 + Gen 9 roster.
//
// Stats here are real base stats; everything the battle engine touches is derived
// from them at a given level (see makeMon), so a Lv 6 Charmander and a Lv 50
// Roaring Moon can share one formula.

const MOVES = {
  // normal
  tackle:        { name: 'Tackle',         type: 'normal',   power: 40 },
  scratch:       { name: 'Scratch',        type: 'normal',   power: 40 },
  quickattack:   { name: 'Quick Attack',   type: 'normal',   power: 40 },
  bodyslam:      { name: 'Body Slam',      type: 'normal',   power: 85 },
  hyperbeam:     { name: 'Hyper Beam',     type: 'normal',   power: 110 },
  // fire
  ember:         { name: 'Ember',          type: 'fire',     power: 40 },
  flamewheel:    { name: 'Flame Wheel',    type: 'fire',     power: 60 },
  flamethrower:  { name: 'Flamethrower',   type: 'fire',     power: 90 },
  torchsong:     { name: 'Torch Song',     type: 'fire',     power: 80 },
  bitterblade:   { name: 'Bitter Blade',   type: 'fire',     power: 90 },
  armorcannon:   { name: 'Armor Cannon',   type: 'fire',     power: 120 },
  // water
  watergun:      { name: 'Water Gun',      type: 'water',    power: 40 },
  aquatail:      { name: 'Aqua Tail',      type: 'water',    power: 90 },
  aquastep:      { name: 'Aqua Step',      type: 'water',    power: 80 },
  surf:          { name: 'Surf',           type: 'water',    power: 90 },
  wavecrash:     { name: 'Wave Crash',     type: 'water',    power: 120 },
  // grass
  vinewhip:      { name: 'Vine Whip',      type: 'grass',    power: 45 },
  razorleaf:     { name: 'Razor Leaf',     type: 'grass',    power: 55 },
  leafblade:     { name: 'Leaf Blade',     type: 'grass',    power: 90 },
  flowertrick:   { name: 'Flower Trick',   type: 'grass',    power: 70 },
  petalblizzard: { name: 'Petal Blizzard', type: 'grass',    power: 90 },
  // electric
  thundershock:  { name: 'Thunder Shock',  type: 'electric', power: 40 },
  discharge:     { name: 'Discharge',      type: 'electric', power: 80 },
  thunderbolt:   { name: 'Thunderbolt',    type: 'electric', power: 90 },
  thunderpunch:  { name: 'Thunder Punch',  type: 'electric', power: 75 },
  electrodrift:  { name: 'Electro Drift',  type: 'electric', power: 100 },
  // ice
  iceshard:      { name: 'Ice Shard',      type: 'ice',      power: 40 },
  icefang:       { name: 'Ice Fang',       type: 'ice',      power: 65 },
  icebeam:       { name: 'Ice Beam',       type: 'ice',      power: 90 },
  iciclecrash:   { name: 'Icicle Crash',   type: 'ice',      power: 85 },
  // fighting
  karatechop:    { name: 'Karate Chop',    type: 'fighting', power: 50 },
  drainpunch:    { name: 'Drain Punch',    type: 'fighting', power: 75 },
  closecombat:   { name: 'Close Combat',   type: 'fighting', power: 100 },
  headlongrush:  { name: 'Headlong Rush',  type: 'fighting', power: 100 },
  collisioncourse:{ name:'Collision Course',type:'fighting', power: 100 },
  ragefist:      { name: 'Rage Fist',      type: 'ghost',    power: 85 },
  // poison
  acidspray:     { name: 'Acid Spray',     type: 'poison',   power: 40 },
  sludgebomb:    { name: 'Sludge Bomb',    type: 'poison',   power: 90 },
  // ground
  mudshot:       { name: 'Mud Shot',       type: 'ground',   power: 55 },
  earthquake:    { name: 'Earthquake',     type: 'ground',   power: 100 },
  // flying
  wingattack:    { name: 'Wing Attack',    type: 'flying',   power: 60 },
  airslash:      { name: 'Air Slash',      type: 'flying',   power: 75 },
  bravebird:     { name: 'Brave Bird',     type: 'flying',   power: 120 },
  // psychic
  confusion:     { name: 'Confusion',      type: 'psychic',  power: 50 },
  psychic:       { name: 'Psychic',        type: 'psychic',  power: 90 },
  hypnosis:      { name: 'Hypnosis',       type: 'psychic',  power: 0 },
  psyshock:      { name: 'Psyshock',       type: 'psychic',  power: 80 },
  // rock
  rockthrow:     { name: 'Rock Throw',     type: 'rock',     power: 50 },
  rockslide:     { name: 'Rock Slide',     type: 'rock',     power: 75 },
  stoneedge:     { name: 'Stone Edge',     type: 'rock',     power: 100 },
  saltcure:      { name: 'Salt Cure',      type: 'rock',     power: 60 },
  // ghost
  shadowsneak:   { name: 'Shadow Sneak',   type: 'ghost',    power: 40 },
  shadowball:    { name: 'Shadow Ball',    type: 'ghost',    power: 80 },
  poltergeist:   { name: 'Poltergeist',    type: 'ghost',    power: 110 },
  // dragon
  dragonbreath:  { name: 'Dragon Breath',  type: 'dragon',   power: 60 },
  dragonclaw:    { name: 'Dragon Claw',    type: 'dragon',   power: 80 },
  glaiverush:    { name: 'Glaive Rush',    type: 'dragon',   power: 120 },
  outrage:       { name: 'Outrage',        type: 'dragon',   power: 120 },
  // dark
  bite:          { name: 'Bite',           type: 'dark',     power: 60 },
  knockoff:      { name: 'Knock Off',      type: 'dark',     power: 65 },
  crunch:        { name: 'Crunch',         type: 'dark',     power: 80 },
  kowtowcleave:  { name: 'Kowtow Cleave',  type: 'dark',     power: 85 },
  darkpulse:     { name: 'Dark Pulse',     type: 'dark',     power: 80 },
  // steel
  metalclaw:     { name: 'Metal Claw',     type: 'steel',    power: 50 },
  ironhead:      { name: 'Iron Head',      type: 'steel',    power: 80 },
  makeitrain:    { name: 'Make It Rain',   type: 'steel',    power: 120 },
  // fairy
  fairywind:     { name: 'Fairy Wind',     type: 'fairy',    power: 40 },
  playrough:     { name: 'Play Rough',     type: 'fairy',    power: 90 },
  moonblast:     { name: 'Moonblast',      type: 'fairy',    power: 95 },
};

// The five status conditions. `immune` is the typing that shrugs a status off —
// you can't burn a Fire type or poison a Steel one.
const STATUS = {
  par: { name: 'Paralysis', tag: 'PAR', onset: 'was paralysed!',    is: 'paralysed', immune: ['electric'] },
  frz: { name: 'Freeze',    tag: 'FRZ', onset: 'was frozen solid!', is: 'frozen',    immune: ['ice'] },
  brn: { name: 'Burn',      tag: 'BRN', onset: 'was burned!',       is: 'burned',    immune: ['fire'] },
  psn: { name: 'Poison',    tag: 'PSN', onset: 'was poisoned!',     is: 'poisoned',  immune: ['poison', 'steel'] },
  slp: { name: 'Sleep',     tag: 'SLP', onset: 'fell asleep!',      is: 'asleep',    immune: [] },
};

// Which moves can leave a status behind, and how often: [status, chance].
// This is the tuning dial for how swingy battles feel — raise a chance and that
// move starts deciding fights on its own.
const MOVE_STATUS = {
  thundershock: ['par', 0.10],  thunderbolt: ['par', 0.10],
  thunderpunch: ['par', 0.10],  discharge:   ['par', 0.30],
  icebeam:      ['frz', 0.10],  icefang:     ['frz', 0.10],
  iciclecrash:  ['frz', 0.10],
  ember:        ['brn', 0.10],  flamewheel:  ['brn', 0.10],
  flamethrower: ['brn', 0.10],  torchsong:   ['brn', 0.20],
  sludgebomb:   ['psn', 0.30],  acidspray:   ['psn', 0.10],
  hypnosis:     ['slp', 0.60],
};
// Fold it into MOVES so the client gets it for free with the move buttons.
for (const [key, [status, chance]] of Object.entries(MOVE_STATUS)) {
  MOVES[key].status = status;
  MOVES[key].chance = chance;
}

// Bag items. `heal` restores HP, `cures` clears the listed statuses; using one
// costs you your turn, so a Potion is never free.
const ITEMS = {
  potion:      { name: 'Potion',       price: 200,  heal: 20 },
  superpotion: { name: 'Super Potion', price: 700,  heal: 50 },
  hyperpotion: { name: 'Hyper Potion', price: 1200, heal: 120 },
  antidote:    { name: 'Antidote',     price: 100,  cures: ['psn'] },
  paralyzheal: { name: 'Paraly Heal',  price: 200,  cures: ['par'] },
  iceheal:     { name: 'Ice Heal',     price: 250,  cures: ['frz'] },
  burnheal:    { name: 'Burn Heal',    price: 250,  cures: ['brn'] },
  awakening:   { name: 'Awakening',    price: 250,  cures: ['slp'] },
  fullheal:    { name: 'Full Heal',    price: 600,  cures: ['par', 'frz', 'brn', 'psn', 'slp'] },
};
const STARTING_BAG = { potion: 2, paralyzheal: 1 };
const STARTING_MONEY = 800;
const moneyForWin = (foeLevel) => 40 + foeLevel * 14;

// Sprite files live at /assets/mons/<key>.png — the key is the whole contract.
// There's one attacking stat rather than a physical/special split, so `atk` is
// whichever of Attack or Special Attack the species actually fights with —
// otherwise Gengar and Alakazam would punch like they use their fists.
// `tier` gates what a player may pick as their partner: 'starter' and 'strong'
// are choosable, 'boss' mons belong to NPC trainers only.
const SPECIES = {
  // ---------------- Gen 1 ----------------
  bulbasaur:  { name: 'Bulbasaur',  gen: 1, dex: 1,   tier: 'starter', types: ['grass','poison'],
                base: { hp: 45, atk: 65, def: 49, spd: 45 }, moves: ['tackle','vinewhip','razorleaf','acidspray'] },
  venusaur:   { name: 'Venusaur',   gen: 1, dex: 3,   tier: 'strong',  types: ['grass','poison'],
                base: { hp: 80, atk: 100, def: 83, spd: 80 }, moves: ['razorleaf','leafblade','sludgebomb','bodyslam'] },
  charmander: { name: 'Charmander', gen: 1, dex: 4,   tier: 'starter', types: ['fire'],
                base: { hp: 39, atk: 60, def: 43, spd: 65 }, moves: ['scratch','ember','flamewheel','quickattack'] },
  charizard:  { name: 'Charizard',  gen: 1, dex: 6,   tier: 'strong',  types: ['fire','flying'],
                base: { hp: 78, atk: 109, def: 78, spd: 100 }, moves: ['flamethrower','airslash','dragonclaw','bodyslam'] },
  squirtle:   { name: 'Squirtle',   gen: 1, dex: 7,   tier: 'starter', types: ['water'],
                base: { hp: 44, atk: 50, def: 65, spd: 43 }, moves: ['tackle','watergun','iceshard','bite'] },
  blastoise:  { name: 'Blastoise',  gen: 1, dex: 9,   tier: 'strong',  types: ['water'],
                base: { hp: 79, atk: 85, def: 100, spd: 78 }, moves: ['surf','aquatail','icebeam','bodyslam'] },
  pikachu:    { name: 'Pikachu',    gen: 1, dex: 25,  tier: 'starter', types: ['electric'],
                base: { hp: 35, atk: 55, def: 40, spd: 90 }, moves: ['quickattack','thundershock','thunderbolt','ironhead'] },
  arcanine:   { name: 'Arcanine',   gen: 1, dex: 59,  tier: 'strong',  types: ['fire'],
                base: { hp: 90, atk: 110, def: 80, spd: 95 }, moves: ['flamethrower','bite','wingattack','bodyslam'] },
  alakazam:   { name: 'Alakazam',   gen: 1, dex: 65,  tier: 'strong',  types: ['psychic'],
                base: { hp: 55, atk: 135, def: 45, spd: 120 }, moves: ['hypnosis','psychic','psyshock','shadowball'] },
  machamp:    { name: 'Machamp',    gen: 1, dex: 68,  tier: 'strong',  types: ['fighting'],
                base: { hp: 90, atk: 130, def: 80, spd: 55 }, moves: ['karatechop','closecombat','knockoff','stoneedge'] },
  gengar:     { name: 'Gengar',     gen: 1, dex: 94,  tier: 'strong',  types: ['ghost','poison'],
                base: { hp: 60, atk: 130, def: 60, spd: 110 }, moves: ['hypnosis','shadowball','sludgebomb','darkpulse'] },
  onix:       { name: 'Onix',       gen: 1, dex: 95,  tier: 'starter', types: ['rock','ground'],
                base: { hp: 35, atk: 45, def: 160, spd: 70 }, moves: ['tackle','rockthrow','mudshot','rockslide'] },
  gyarados:   { name: 'Gyarados',   gen: 1, dex: 130, tier: 'strong',  types: ['water','flying'],
                base: { hp: 95, atk: 125, def: 79, spd: 81 }, moves: ['aquatail','crunch','airslash','wavecrash'] },
  lapras:     { name: 'Lapras',     gen: 1, dex: 131, tier: 'strong',  types: ['water','ice'],
                base: { hp: 130, atk: 85, def: 80, spd: 60 }, moves: ['surf','icebeam','bodyslam','iciclecrash'] },
  eevee:      { name: 'Eevee',      gen: 1, dex: 133, tier: 'starter', types: ['normal'],
                base: { hp: 55, atk: 55, def: 50, spd: 55 }, moves: ['tackle','quickattack','bite','bodyslam'] },
  snorlax:    { name: 'Snorlax',    gen: 1, dex: 143, tier: 'strong',  types: ['normal'],
                base: { hp: 160, atk: 110, def: 65, spd: 30 }, moves: ['bodyslam','crunch','earthquake','hyperbeam'] },
  dragonite:  { name: 'Dragonite',  gen: 1, dex: 149, tier: 'boss',    types: ['dragon','flying'],
                base: { hp: 91, atk: 134, def: 95, spd: 80 }, moves: ['dragonclaw','bravebird','outrage','thunderpunch'] },
  mewtwo:     { name: 'Mewtwo',     gen: 1, dex: 150, tier: 'boss',    types: ['psychic'],
                base: { hp: 106, atk: 154, def: 90, spd: 130 }, moves: ['psychic','psyshock','shadowball','hyperbeam'] },

  // ---------------- Gen 9 ----------------
  sprigatito:  { name: 'Sprigatito',  gen: 9, dex: 906,  tier: 'starter', types: ['grass'],
                 base: { hp: 40, atk: 61, def: 54, spd: 65 }, moves: ['scratch','vinewhip','razorleaf','quickattack'] },
  meowscarada: { name: 'Meowscarada', gen: 9, dex: 908,  tier: 'strong',  types: ['grass','dark'],
                 base: { hp: 76, atk: 110, def: 70, spd: 123 }, moves: ['flowertrick','knockoff','leafblade','playrough'] },
  fuecoco:     { name: 'Fuecoco',     gen: 9, dex: 909,  tier: 'starter', types: ['fire'],
                 base: { hp: 67, atk: 65, def: 59, spd: 36 }, moves: ['tackle','ember','flamewheel','bite'] },
  skeledirge:  { name: 'Skeledirge',  gen: 9, dex: 911,  tier: 'strong',  types: ['fire','ghost'],
                 base: { hp: 104, atk: 110, def: 100, spd: 66 }, moves: ['torchsong','shadowball','flamethrower','bodyslam'] },
  quaxly:      { name: 'Quaxly',      gen: 9, dex: 912,  tier: 'starter', types: ['water'],
                 base: { hp: 55, atk: 65, def: 45, spd: 50 }, moves: ['tackle','watergun','wingattack','quickattack'] },
  quaquaval:   { name: 'Quaquaval',   gen: 9, dex: 914,  tier: 'strong',  types: ['water','fighting'],
                 base: { hp: 85, atk: 120, def: 80, spd: 85 }, moves: ['aquastep','closecombat','airslash','iceshard'] },
  pawmot:      { name: 'Pawmot',      gen: 9, dex: 923,  tier: 'strong',  types: ['electric','fighting'],
                 base: { hp: 70, atk: 115, def: 70, spd: 105 }, moves: ['thunderpunch','drainpunch','discharge','quickattack'] },
  armarouge:   { name: 'Armarouge',   gen: 9, dex: 936,  tier: 'strong',  types: ['fire','psychic'],
                 base: { hp: 85, atk: 125, def: 100, spd: 75 }, moves: ['armorcannon','psyshock','flamethrower','shadowball'] },
  ceruledge:   { name: 'Ceruledge',   gen: 9, dex: 937,  tier: 'strong',  types: ['fire','ghost'],
                 base: { hp: 75, atk: 125, def: 80, spd: 85 }, moves: ['bitterblade','poltergeist','closecombat','shadowsneak'] },
  tinkaton:    { name: 'Tinkaton',    gen: 9, dex: 959,  tier: 'strong',  types: ['fairy','steel'],
                 base: { hp: 85, atk: 75, def: 77, spd: 94 }, moves: ['playrough','ironhead','knockoff','moonblast'] },
  glimmora:    { name: 'Glimmora',    gen: 9, dex: 971,  tier: 'strong',  types: ['rock','poison'],
                 base: { hp: 83, atk: 130, def: 90, spd: 86 }, moves: ['stoneedge','sludgebomb','earthquake','acidspray'] },
  dondozo:     { name: 'Dondozo',     gen: 9, dex: 977,  tier: 'strong',  types: ['water'],
                 base: { hp: 150, atk: 100, def: 115, spd: 35 }, moves: ['wavecrash','bodyslam','earthquake','icefang'] },
  annihilape:  { name: 'Annihilape',  gen: 9, dex: 979,  tier: 'strong',  types: ['fighting','ghost'],
                 base: { hp: 110, atk: 115, def: 80, spd: 90 }, moves: ['ragefist','closecombat','shadowsneak','drainpunch'] },
  kingambit:   { name: 'Kingambit',   gen: 9, dex: 983,  tier: 'strong',  types: ['dark','steel'],
                 base: { hp: 100, atk: 135, def: 120, spd: 50 }, moves: ['kowtowcleave','ironhead','crunch','stoneedge'] },
  greattusk:   { name: 'Great Tusk',  gen: 9, dex: 984,  tier: 'boss',    types: ['ground','fighting'],
                 base: { hp: 115, atk: 131, def: 131, spd: 87 }, moves: ['headlongrush','closecombat','earthquake','stoneedge'] },
  fluttermane: { name: 'Flutter Mane',gen: 9, dex: 987,  tier: 'boss',    types: ['ghost','fairy'],
                 base: { hp: 55, atk: 135, def: 55, spd: 135 }, moves: ['moonblast','shadowball','darkpulse','psyshock'] },
  ironhands:   { name: 'Iron Hands',  gen: 9, dex: 992,  tier: 'boss',    types: ['fighting','electric'],
                 base: { hp: 154, atk: 140, def: 108, spd: 50 }, moves: ['drainpunch','thunderpunch','closecombat','ironhead'] },
  baxcalibur:  { name: 'Baxcalibur',  gen: 9, dex: 998,  tier: 'strong',  types: ['dragon','ice'],
                 base: { hp: 115, atk: 145, def: 92, spd: 87 }, moves: ['glaiverush','iciclecrash','dragonclaw','earthquake'] },
  gholdengo:   { name: 'Gholdengo',   gen: 9, dex: 1000, tier: 'strong',  types: ['steel','ghost'],
                 base: { hp: 87, atk: 133, def: 95, spd: 84 }, moves: ['makeitrain','shadowball','psyshock','ironhead'] },
  chienpao:    { name: 'Chien-Pao',   gen: 9, dex: 1002, tier: 'boss',    types: ['dark','ice'],
                 base: { hp: 80, atk: 120, def: 80, spd: 135 }, moves: ['iciclecrash','crunch','icebeam','closecombat'] },
  roaringmoon: { name: 'Roaring Moon',gen: 9, dex: 1005, tier: 'boss',    types: ['dragon','dark'],
                 base: { hp: 105, atk: 139, def: 71, spd: 119 }, moves: ['glaiverush','crunch','dragonclaw','bravebird'] },
  ironvaliant: { name: 'Iron Valiant',gen: 9, dex: 1006, tier: 'boss',    types: ['fairy','fighting'],
                 base: { hp: 74, atk: 130, def: 90, spd: 116 }, moves: ['moonblast','closecombat','psyshock','knockoff'] },
  koraidon:    { name: 'Koraidon',    gen: 9, dex: 1007, tier: 'boss',    types: ['fighting','dragon'],
                 base: { hp: 100, atk: 135, def: 115, spd: 135 }, moves: ['collisioncourse','outrage','flamethrower','closecombat'] },
  miraidon:    { name: 'Miraidon',    gen: 9, dex: 1008, tier: 'boss',    types: ['electric','dragon'],
                 base: { hp: 100, atk: 135, def: 115, spd: 135 }, moves: ['electrodrift','dragonclaw','thunderbolt','psychic'] },
};

// Full 18-type chart: attacker type -> { defender type: multiplier }.
// Anything absent is 1x.
const TYPE_CHART = {
  normal:   { rock: 0.5, ghost: 0, steel: 0.5 },
  fire:     { fire: 0.5, water: 0.5, grass: 2, ice: 2, bug: 2, rock: 0.5, dragon: 0.5, steel: 2 },
  water:    { fire: 2, water: 0.5, grass: 0.5, ground: 2, rock: 2, dragon: 0.5 },
  electric: { water: 2, electric: 0.5, grass: 0.5, ground: 0, flying: 2, dragon: 0.5 },
  grass:    { fire: 0.5, water: 2, grass: 0.5, poison: 0.5, ground: 2, flying: 0.5, bug: 0.5, rock: 2, dragon: 0.5, steel: 0.5 },
  ice:      { fire: 0.5, water: 0.5, grass: 2, ice: 0.5, ground: 2, flying: 2, dragon: 2, steel: 0.5 },
  fighting: { normal: 2, ice: 2, poison: 0.5, flying: 0.5, psychic: 0.5, bug: 0.5, rock: 2, ghost: 0, dark: 2, steel: 2, fairy: 0.5 },
  poison:   { grass: 2, poison: 0.5, ground: 0.5, rock: 0.5, ghost: 0.5, steel: 0, fairy: 2 },
  ground:   { fire: 2, electric: 2, grass: 0.5, poison: 2, flying: 0, bug: 0.5, rock: 2, steel: 2 },
  flying:   { electric: 0.5, grass: 2, fighting: 2, bug: 2, rock: 0.5, steel: 0.5 },
  psychic:  { fighting: 2, poison: 2, psychic: 0.5, dark: 0, steel: 0.5 },
  bug:      { fire: 0.5, grass: 2, fighting: 0.5, poison: 0.5, flying: 0.5, psychic: 2, ghost: 0.5, dark: 2, steel: 0.5, fairy: 0.5 },
  rock:     { fire: 2, ice: 2, fighting: 0.5, ground: 0.5, flying: 2, bug: 2, steel: 0.5 },
  ghost:    { normal: 0, psychic: 2, ghost: 2, dark: 0.5 },
  dragon:   { dragon: 2, steel: 0.5, fairy: 0 },
  dark:     { fighting: 0.5, psychic: 2, ghost: 2, dark: 0.5, fairy: 0.5 },
  steel:    { fire: 0.5, water: 0.5, electric: 0.5, ice: 2, rock: 2, steel: 0.5, fairy: 2 },
  fairy:    { fire: 0.5, fighting: 2, poison: 0.5, dragon: 2, dark: 2, steel: 0.5 },
};

// Multiplier of one attacking type against a (possibly dual-typed) defender.
function typeEffect(atkType, defTypes) {
  const row = TYPE_CHART[atkType] || {};
  const list = Array.isArray(defTypes) ? defTypes : [defTypes];
  return list.reduce((m, t) => m * (row[t] === undefined ? 1 : row[t]), 1);
}

// ---- level maths (the standard Pokémon shape, with flat IVs/EVs) ----
const MAX_LEVEL = 60;
const hpAt   = (base, lvl) => Math.floor((base * 2 * lvl) / 100) + lvl + 10;
const statAt = (base, lvl) => Math.floor((base * 2 * lvl) / 100) + 5;

// XP needed to go from `level` to `level + 1`, and what a win is worth.
const xpToNext = (level) => 14 + level * 9;
const xpForWin = (foeLevel) => 10 + foeLevel * 6;

function makeMon(key, level) {
  const s = SPECIES[key];
  const lvl = Math.max(1, Math.min(MAX_LEVEL, Math.round(level)));
  const maxhp = hpAt(s.base.hp, lvl);
  return {
    key, name: s.name, gen: s.gen, dex: s.dex, types: s.types.slice(), level: lvl,
    maxhp, hp: maxhp,
    atk: statAt(s.base.atk, lvl), def: statAt(s.base.def, lvl), spd: statAt(s.base.spd, lvl),
    moves: s.moves.slice(),
    status: null, sleepTurns: 0,
  };
}

const SPECIES_KEYS = Object.keys(SPECIES);
const PLAYABLE_KEYS = SPECIES_KEYS.filter((k) => SPECIES[k].tier !== 'boss');

module.exports = {
  MOVES, SPECIES, TYPE_CHART, SPECIES_KEYS, PLAYABLE_KEYS, MAX_LEVEL,
  STATUS, ITEMS, STARTING_BAG, STARTING_MONEY,
  typeEffect, makeMon, xpToNext, xpForWin, moneyForWin,
};
