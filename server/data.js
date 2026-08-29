// Pokémon + move data for the Gen 1 + Gen 9 vertical slice.
// Kept intentionally small; easy to expand later.

const MOVES = {
  tackle:       { name: 'Tackle',       type: 'normal',   power: 40 },
  scratch:      { name: 'Scratch',      type: 'normal',   power: 40 },
  ember:        { name: 'Ember',        type: 'fire',     power: 40 },
  flamethrower: { name: 'Flamethrower', type: 'fire',     power: 85 },
  watergun:     { name: 'Water Gun',    type: 'water',    power: 40 },
  aquatail:     { name: 'Aqua Tail',    type: 'water',    power: 85 },
  vinewhip:     { name: 'Vine Whip',    type: 'grass',    power: 45 },
  leafblade:    { name: 'Leaf Blade',   type: 'grass',    power: 85 },
  thundershock: { name: 'Thunder Shock',type: 'electric', power: 40 },
  thunderbolt:  { name: 'Thunderbolt',  type: 'electric', power: 85 },
};

// dex is used to pick a display colour; gen tags the two eras we support.
const SPECIES = {
  charmander: { name: 'Charmander', gen: 1, dex: 4,   type: 'fire',     hp: 118, atk: 62, def: 48, spd: 65, moves: ['scratch','ember','flamethrower'] },
  squirtle:   { name: 'Squirtle',   gen: 1, dex: 7,   type: 'water',    hp: 124, atk: 55, def: 60, spd: 43, moves: ['tackle','watergun','aquatail'] },
  bulbasaur:  { name: 'Bulbasaur',  gen: 1, dex: 1,   type: 'grass',    hp: 125, atk: 55, def: 55, spd: 45, moves: ['tackle','vinewhip','leafblade'] },
  pikachu:    { name: 'Pikachu',    gen: 1, dex: 25,  type: 'electric', hp: 110, atk: 60, def: 44, spd: 90, moves: ['scratch','thundershock','thunderbolt'] },
  sprigatito: { name: 'Sprigatito', gen: 9, dex: 906, type: 'grass',    hp: 116, atk: 61, def: 46, spd: 65, moves: ['scratch','vinewhip','leafblade'] },
  fuecoco:    { name: 'Fuecoco',    gen: 9, dex: 909, type: 'fire',     hp: 130, atk: 63, def: 50, spd: 40, moves: ['tackle','ember','flamethrower'] },
  quaxly:     { name: 'Quaxly',     gen: 9, dex: 912, type: 'water',    hp: 120, atk: 60, def: 50, spd: 55, moves: ['tackle','watergun','aquatail'] },
};

// attacker type -> { defender type: multiplier }
const TYPE_CHART = {
  fire:     { grass: 2, water: 0.5, fire: 0.5 },
  water:    { fire: 2, grass: 0.5, water: 0.5 },
  grass:    { water: 2, fire: 0.5, grass: 0.5 },
  electric: { water: 2, grass: 0.5, electric: 0.5 },
  normal:   {},
};

function typeEffect(atkType, defType) {
  const row = TYPE_CHART[atkType] || {};
  return row[defType] === undefined ? 1 : row[defType];
}

module.exports = { MOVES, SPECIES, TYPE_CHART, typeEffect };
