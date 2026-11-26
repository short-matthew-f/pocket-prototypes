// Koschei's Tower: rules. Pure (no DOM): the browser app and the node bots share it.
// A run ("climb") is one candle of time. Falling rune-pieces stack in a narrow well; clearing rows strikes the
// monster on the current floor. Monsters strike back on a timer (stone rows, falling rocks, fog, haste, curses).
// Kopeks, XP and Firebird feathers carry over; spend them in the tree between climbs. Koschei waits on floor 30,
// and he cannot die until you own the Needle.
(function (root) {
  'use strict';
  const K = {};
  const W = 8, VIS = 16, HID = 2, R = VIS + HID;
  K.W = W; K.VIS = VIS; K.HID = HID; K.R = R;

  // ---------------------------------------------------------------- rng
  K.rng = function (seed) {
    let a = seed >>> 0 || 1;
    const f = () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    f.int = (n) => Math.floor(f() * n);
    f.pick = (arr) => arr[Math.floor(f() * arr.length)];
    return f;
  };

  // ---------------------------------------------------------------- cells + pieces
  // cell codes: 0 empty, 1 fire, 2 ice, 3 earth, 4 storm, 5 stone (enemy junk), 6 gold
  K.EL = ['', 'fire', 'ice', 'earth', 'storm'];
  K.EL_NAME = { fire: 'Fire', ice: 'Ice', earth: 'Earth', storm: 'Storm' };
  const STONE = 5, GOLD = 6; K.STONE = STONE; K.GOLD = GOLD;

  // n = rotation box size; cells in rotation 0
  K.SHAPES = {
    I4: { n: 4, c: [[0, 1], [1, 1], [2, 1], [3, 1]] },
    O4: { n: 2, c: [[0, 0], [1, 0], [0, 1], [1, 1]] },
    T4: { n: 3, c: [[1, 0], [0, 1], [1, 1], [2, 1]] },
    S4: { n: 3, c: [[1, 0], [2, 0], [0, 1], [1, 1]] },
    Z4: { n: 3, c: [[0, 0], [1, 0], [1, 1], [2, 1]] },
    L4: { n: 3, c: [[2, 0], [0, 1], [1, 1], [2, 1]] },
    J4: { n: 3, c: [[0, 0], [0, 1], [1, 1], [2, 1]] },
    I3: { n: 3, c: [[0, 1], [1, 1], [2, 1]] },
    V3: { n: 2, c: [[0, 0], [0, 1], [1, 1]] },
    P1: { n: 1, c: [[0, 0]] },
    D2: { n: 2, c: [[0, 1], [1, 1]] },
    // curse pieces (monsters slip these in)
    X5: { n: 3, c: [[1, 0], [0, 1], [1, 1], [2, 1], [1, 2]] },
    U5: { n: 3, c: [[0, 0], [2, 0], [0, 1], [1, 1], [2, 1]] },
    W5: { n: 3, c: [[0, 0], [0, 1], [1, 1], [1, 2], [2, 2]] },
    F5: { n: 3, c: [[1, 0], [2, 0], [0, 1], [1, 1], [1, 2]] },
    T5: { n: 3, c: [[0, 0], [1, 0], [2, 0], [1, 1], [1, 2]] },
    BOMB: { n: 1, c: [[0, 0]] },
  };
  K.BASE_POOL = ['D2', 'D2', 'D2', 'I3', 'V3', 'I3', 'V3', 'O4', 'T4', 'L4', 'J4', 'S4', 'Z4', 'I4'];
  K.CURSES = ['X5', 'U5', 'W5', 'F5', 'T5'];
  const rotCells = (cells, n, rot) => {
    let c = cells.map((p) => p.slice());
    for (let i = 0; i < ((rot % 4) + 4) % 4; i++) c = c.map(([x, y]) => [n - 1 - y, x]);
    return c;
  };
  K.rotCells = rotCells;
  // all 4 rotations precomputed, each a list of [x,y]
  for (const k in K.SHAPES) { const s = K.SHAPES[k]; s.rots = [0, 1, 2, 3].map((r) => rotCells(s.c, s.n, r)); }

  // ---------------------------------------------------------------- monsters
  // atk: what the strike does besides damage. weak/resist: elements.
  const M = (name, weak, resist, atk, blurb) => ({ name, weak, resist, atk, blurb });
  K.TIERS = [
    [M('Kikimora', 'fire', 'earth', ['rocks1'], 'A spiteful house spirit. Throws pebbles.'), M('Grey Wolf', 'ice', 'storm', ['bite'], 'Big teeth, short temper.'), M('Bes', 'ice', 'fire', ['garbage1'], 'A little imp with a big shovel.'), M('Vodyanoy', 'storm', 'ice', ['garbage1', 'rocks1'], 'The old man of the millpond.')],
    [M('Rusalka', 'fire', 'ice', ['fog', 'garbage1'], 'Sings until your eyes cloud over.'), M('Bannik', 'ice', 'fire', ['rocks2'], 'The bathhouse spirit. Hurls hot stones.'), M('Upyr', 'storm', 'earth', ['bite', 'drain'], 'Drinks blood and mana alike.'), M('Bear Spirit', 'fire', 'earth', ['garbage2'], 'Pushes the floor up under you.')],
    [M('Leshy', 'fire', 'storm', ['curse', 'garbage1'], 'Lord of the forest. Twists your runes.'), M('Polevik', 'storm', 'earth', ['haste', 'rocks2'], 'A field spirit, quick as wind.'), M('Bolotnik', 'earth', 'ice', ['garbage2', 'fog'], 'Swamp mud rises around you.'), M('Navka', 'fire', 'storm', ['drain', 'fog'], 'Pale, cold, and hungry for magic.')],
    [M('Viy', 'storm', 'fire', ['fog', 'bite'], 'Lift his eyelids and he sees you.'), M('Psoglav', 'ice', 'earth', ['bite', 'rocks3'], 'A dog-headed giant with iron teeth.'), M('Ovinnik', 'ice', 'fire', ['haste', 'garbage2'], 'The barn spirit, fond of fire.'), M('Morok', 'earth', 'storm', ['curse', 'fog'], 'A shadow that leads travellers astray.')],
    [M('Karachun', 'fire', 'ice', ['garbage2', 'haste'], 'The longest night, given claws.'), M('Mara', 'storm', 'ice', ['drain', 'curse'], 'The nightmare that sits on your chest.'), M('Bone Rider', 'earth', 'storm', ['rocks3', 'bite'], 'Koschei\'s outrider on a skeletal horse.'), M('Likhoradka', 'ice', 'fire', ['haste', 'fog'], 'Fever-sister. Everything speeds up.')],
    [M('Deathless Guard', 'storm', 'earth', ['garbage3'], 'Armour with nobody inside.'), M('Sirin', 'earth', 'storm', ['fog', 'drain'], 'A bird-woman whose song steals memory.'), M('Iron Hound', 'fire', 'ice', ['bite', 'rocks3'], 'Forged in Koschei\'s smithy.'), M('Chernokniga', 'storm', 'fire', ['curse', 'garbage2'], 'A spellbook that reads you back.')],
  ];
  K.BOSSES = {
    5: { id: 'yaga', name: 'Baba Yaga', weak: 'storm', resist: 'fire', atk: ['rocks3', 'curse'], blurb: 'She flies in a mortar and steers with a pestle.', relic: 'mortar' },
    10: { id: 'likho', name: 'Likho One-Eye', weak: 'fire', resist: 'ice', atk: ['fog', 'garbage2'], blurb: 'Bad luck with a single staring eye.', relic: 'eye' },
    15: { id: 'zmey', name: 'Zmey Gorynych', weak: 'ice', resist: 'fire', atk: ['garbage1', 'garbage1', 'rocks2'], blurb: 'Three heads, three breaths.', relic: 'scale' },
    20: { id: 'tugarin', name: 'Tugarin', weak: 'earth', resist: 'storm', atk: ['haste', 'bite', 'garbage2'], blurb: 'A serpent-knight on paper wings.', relic: 'saber' },
    25: { id: 'chudo', name: 'Chudo-Yudo', weak: 'fire', resist: 'earth', atk: ['garbage3', 'drain'], blurb: 'The many-headed thing under the Kalinov Bridge.', relic: 'water' },
    30: { id: 'koschei', name: 'Koschei the Deathless', weak: 'storm', resist: 'ice', atk: ['garbage2', 'curse', 'fog', 'haste', 'rocks3'], blurb: 'His death is in a needle, in an egg, in a duck, in a hare, in a chest.', relic: null },
  };
  const process_env = (k) => (typeof process !== 'undefined' && process.env && process.env[k]) || '';
  K.TOP = 30; K.HPX = +(typeof process !== "undefined" && process.env && process.env.HPX) || 4;
  K.RELICS = {
    mortar: { name: "Yaga's Mortar", desc: 'Every 10th piece is a bomb: blasts a 3x3 hole and scorches monsters in it.' },
    eye: { name: "Likho's Eye", desc: '+10% crit chance, and you see one more piece ahead.' },
    scale: { name: 'Dragon Scale', desc: 'Monsters hit 20% softer; 25% of stone rows break on arrival.' },
    saber: { name: "Tugarin's Saber", desc: 'Attack x1.3.' },
    water: { name: 'Living Water', desc: '+20% max HP. Once per climb, below 25% HP, heal half.' },
  };

  K.isBoss = (f) => !!K.BOSSES[f] || (f > K.TOP && f % 5 === 0);
  K.foe = function (floor) {
    let d;
    if (K.BOSSES[floor]) d = K.BOSSES[floor];
    else if (floor > K.TOP && floor % 5 === 0) { const b = K.BOSSES[5 * (1 + ((floor / 5) % 5))]; d = Object.assign({}, b, { name: 'Echo of ' + b.name, relic: null, id: b.id }); }
    else { const tier = K.TIERS[Math.min(K.TIERS.length - 1, Math.floor((floor - 1) / 5))]; d = tier[(floor - 1) % 5 % 4]; }
    const boss = K.isBoss(floor);
    const hp = Math.round(K.HPX * 28 * Math.pow(1.2, floor - 1) * Math.min(1, 0.55 + 0.15 * (floor - 1)) * (boss ? 3.2 : 1) * (floor === K.TOP ? 1.25 : 1));
    return {
      floor, boss, id: d.id || d.name.toLowerCase().replace(/[^a-z]+/g, '-'), name: d.name, weak: d.weak, resist: d.resist, atk: d.atk, blurb: d.blurb, relic: d.relic || null,
      hp, max: hp, dmg: Math.round((5 + floor * 1.6) * (boss ? 1.4 : 1)), every: Math.max(3.2, (boss ? 7.2 : 8.5) - floor * 0.11),
      gold: Math.round(4 * Math.pow(1.16, floor - 1) * (boss ? 6 : 1)), xp: Math.round(5 * Math.pow(1.17, floor - 1) * (boss ? 4 : 1)),
      atkT: 0, n: 0, deathless: floor === K.TOP,
    };
  };
  K.gravity = (floor) => Math.max(0.1, 0.9 * Math.pow(0.955, floor - 1)); // seconds per row

  // ---------------------------------------------------------------- heroes
  K.HEROES = [
    { id: 'bogatyr', name: 'Ivan', title: 'the Bogatyr', blurb: 'A knight of the steppe. Hits hard, takes a beating.', unlock: 0 },
    { id: 'vedma', name: 'Vasilisa', title: 'the Wise', blurb: 'Spells cost less, mana flows faster, starts with Firebird.', unlock: 1 },
    { id: 'skomorokh', name: 'Petrushka', title: 'the Jester', blurb: 'More kopeks, more crits, and a satchel from the start.', unlock: 2 },
  ];

  // ---------------------------------------------------------------- tree
  // cur: 'k' kopeks (default) or 'f' feathers. x,y grid (y down). fx(s, lv) mutates stats.
  const N = (id, name, icon, desc, x, y, req, cost, grow, max, fx, extra) => Object.assign({ id, name, icon, desc, x, y, req, cost, grow, max, fx, cur: 'k' }, extra || {});
  K.NODES = [
    N('str', 'Strength', 'sword', (l) => `+2 attack per level (now +${2 * l}).`, 0, 0, [], 4, 1.32, 25, (s, l) => { s.atkAdd += 2 * l; }),
    N('candle', 'Long Candle', 'candle', (l) => `+5 s per climb (now +${5 * l} s).`, 0, -1, ['str'], 15, 1.6, 8, (s, l) => { s.candle += 5 * l; }),
    N('vit', 'Vitality', 'heart', (l) => `+15 max HP per level (now +${15 * l}).`, 1, 0, ['str'], 12, 1.35, 20, (s, l) => { s.hpAdd += 15 * l; }),
    N('greed', 'Greed', 'coin', (l) => `+10% kopeks (now +${10 * l}%).`, -1, 0, ['str'], 25, 1.55, 10, (s, l) => { s.gold *= 1 + 0.1 * l; }),
    N('seer', 'Seer', 'eye', (l) => `See ${l + 1 < 4 ? 'one more' : 'four'} pieces ahead (now ${1 + l}).`, 0, 1, ['str'], 40, 3, 3, (s, l) => { s.next += l; }),
    // up: time + flow
    N('wax', 'Wax Drip', 'drop', (l) => `+${l + 1} s on the candle per monster slain (now +${l} s).`, 0, -2, ['candle'], 120, 1.8, 4, (s, l) => { s.killTime += l; }),
    N('feather', 'Feather-Fall', 'leaf', (l) => `Pieces fall ${10 * (l + 1)}% slower (now ${10 * l}%).`, -1, -2, ['candle'], 60, 1.7, 5, (s, l) => { s.fall *= 1 + 0.1 * l; }),
    N('steady', 'Steady Hand', 'hand', (l) => `+0.1 s before a landed piece locks (now +${(0.1 * l).toFixed(1)} s).`, 1, -2, ['candle'], 80, 1.9, 3, (s, l) => { s.lock += 0.1 * l; }),
    N('frost', 'Frost', 'snow', () => 'Spell, charged by Mages: freeze the fall and every monster\'s countdown for 5 s.', 0, -3, ['wax'], 400, 1, 1, (s, l) => { if (l) s.spells.ice = 1; }),
    N('lull', 'Lullaby', 'note', (l) => `Monsters act ${8 * (l + 1)}% slower (now ${8 * l}%).`, -1, -3, ['feather'], 250, 1.7, 5, (s, l) => { s.foeSlow *= 1 + 0.08 * l; }),
    N('pebble', 'Pebble Rune', 'pebble', () => 'Adds a lone hero (one cell) to the bag: drop it exactly where a group needs one more.', 1, -3, ['steady'], 500, 1, 1, (s, l) => { if (l) s.pool.push('P1'); }),
    N('frost2', 'Deep Frost', 'snow', (l) => `Frost lasts +1.5 s (now +${1.5 * l} s).`, 0, -4, ['frost'], 900, 1.8, 4, (s, l) => { s.frostTime += 1.5 * l; }),
    // right: defence
    N('armor', 'Chainmail', 'shield', (l) => `Monsters hit ${8 * (l + 1)}% softer (now ${8 * l}%).`, 2, 0, ['vit'], 60, 1.5, 6, (s, l) => { s.armor *= 1 - 0.08 * l; }),
    N('stone', 'Stoneskin', 'rock', (l) => `${15 * (l + 1)}% of stone (rain or rising rows) crumbles on arrival (now ${15 * l}%).`, 2, -1, ['armor'], 200, 1.7, 4, (s, l) => { s.block += 0.15 * l; }),
    N('samovar', 'Samovar', 'cup', (l) => `Heal ${l + 1}% max HP per group that attacks; Priests heal +20% (now ${l}%).`, 2, 1, ['armor'], 150, 1.7, 5, (s, l) => { s.heal += 0.01 * l; s.healMul *= 1 + 0.2 * l; }),
    N('second', 'Second Wind', 'wind', () => 'Your first overflow each climb costs no HP.', 3, 0, ['armor'], 700, 1, 1, (s, l) => { if (l) s.secondWind = 1; }),
    N('quake', 'Quake', 'quake', () => 'Spell, charged by Archers: crush every stone and the bottom 2 rows, and pelt every monster.', 3, -1, ['stone'], 450, 1, 1, (s, l) => { if (l) s.spells.earth = 1; }),
    N('grace', 'Firebird Grace', 'plume', (l) => `+15% max HP (now +${15 * l}%).`, 3, 1, ['samovar'], 2, 1.6, 4, (s, l) => { s.hpMul *= 1 + 0.15 * l; }, { cur: 'f' }),
    N('quake2', 'Deep Roots', 'quake', (l) => `Quake clears one more row (now +${l}).`, 4, -1, ['quake'], 2000, 2, 2, (s, l) => { s.quakeRows += l; }),
    // left: economy + magic
    N('gold', 'Gold Vein', 'nugget', (l) => `${5 * (l + 1)}% of parties carry a treasure chest (now ${5 * l}%).`, -2, 0, ['greed'], 50, 1.6, 6, (s, l) => { s.goldCell += 0.05 * l; }),
    N('bounty', 'Bounty', 'bag', (l) => `+20% kopeks from slain monsters (now +${20 * l}%).`, -2, -1, ['gold'], 150, 1.6, 6, (s, l) => { s.bounty *= 1 + 0.2 * l; }),
    N('scholar', 'Scholar', 'book', (l) => `+20% XP (now +${20 * l}%).`, -2, 1, ['gold'], 100, 1.6, 6, (s, l) => { s.xp *= 1 + 0.2 * l; }),
    N('attune', 'Recruiter', 'rune', (l) => `More heroes of the type the lead monster fears (now ${l}/3).`, -3, 0, ['gold'], 250, 1.9, 3, (s, l) => { s.attune += l; }),
    N('mana', 'Mana Well', 'orb', (l) => `+25% mana from attacking groups (now +${25 * l}%).`, -3, -1, ['bounty'], 300, 1.7, 5, (s, l) => { s.mana *= 1 + 0.25 * l; }),
    N('touch', 'Golden Touch', 'plume', (l) => `+25% kopeks (now +${25 * l}%).`, -3, 1, ['scholar'], 3, 1.6, 3, (s, l) => { s.gold *= 1 + 0.25 * l; }, { cur: 'f' }),
    N('bolt', 'Thunder', 'bolt', () => 'Spell, charged by Priests and chains: a thunderbolt on the biggest monster that also delays its next action.', -4, 0, ['attune'], 600, 1, 1, (s, l) => { if (l) s.spells.storm = 1; }),
    N('spell', 'Spellcraft', 'star', (l) => `Spells +25% stronger, cost 1 less (now +${25 * l}%).`, -4, -1, ['mana'], 1200, 1.9, 4, (s, l) => { s.spellPow *= 1 + 0.25 * l; s.spellCost -= l; }),
    // down: offence
    N('hold', 'Satchel', 'satchel', () => 'Hold one party for later (tap HOLD or flick up).', 0, 2, ['seer'], 60, 1, 1, (s, l) => { if (l) s.hold = 1; }),
    N('hammer', 'Priesthood', 'hammer', (l) => `Priests join your parties (${l + 1}/4 of the others' share; now ${l}/4). Pair them to heal, clear fog and haste, and smite.`, -1, 2, ['seer'], 40, 1.5, 8, (s, l) => { s.priests = 0.25 * l; }),
    N('rhythm', 'Rhythm', 'drum', (l) => `Chains hit +15% harder per step (now +${15 * l}%).`, 1, 2, ['seer'], 70, 1.6, 5, (s, l) => { s.combo += 0.15 * l; }),
    N('keen', 'Keen Eye', 'target', (l) => `+5% crit chance (now +${5 * l}%).`, 0, 3, ['hold'], 180, 1.6, 6, (s, l) => { s.crit += 0.05 * l; }),
    N('heavy', 'Heavy Blow', 'anvil', (l) => `Groups of 5 or more hit +25% harder (now +${25 * l}%).`, -1, 3, ['hammer'], 220, 1.65, 6, (s, l) => { s.heavy += 0.25 * l; }),
    N('fire', 'Firebird', 'flame', () => 'Spell, charged by Knights: Firebird flame sweeps over every monster.', 1, 3, ['rhythm'], 250, 1, 1, (s, l) => { if (l) s.spells.fire = 1; }),
    N('fury', 'Fury', 'skull', (l) => `Crits hit +30% harder (now +${30 * l}%).`, 0, 4, ['keen'], 500, 1.7, 5, (s, l) => { s.critMul += 0.3 * l; }),
    N('fire2', 'Phoenix Heart', 'flame', (l) => `Firebird +40% (now +${40 * l}%).`, 1, 4, ['fire'], 700, 1.8, 4, (s, l) => { s.firePow *= 1 + 0.4 * l; }),
    N('might', 'Bogatyr Might', 'plume', (l) => `Attack x1.2 per level (now x${Math.pow(1.2, l).toFixed(2)}).`, -1, 4, ['heavy'], 2, 1.4, 6, (s, l) => { s.atkMul *= Math.pow(1.2, l); }, { cur: 'f' }),
    N('needle', 'The Needle', 'needle', () => 'Koschei\'s death, in an egg under Chudo-Yudo\'s bridge (beat floor 25 first). Own it and the Deathless can die.', 0, 5, ['fury', 'might'], 20000, 1, 1, (s, l) => { if (l) s.needle = 1; }, { win: true, reqAny: true, reqBoss: 25 }),
  ];
  K.NODE = {}; K.NODES.forEach((n) => { K.NODE[n.id] = n; });
  K.nodeCost = (n, lv) => Math.round(n.cost * Math.pow(n.grow, lv));
  K.nodeOpen = (n, levels, h) => (!n.reqBoss || !!(h && h.bosses[n.reqBoss])) && (!n.req.length || (n.reqAny ? n.req.some((r) => (levels[r] || 0) > 0) : n.req.every((r) => (levels[r] || 0) > 0)));

  K.xpNeed = (lv) => Math.round(18 * Math.pow(1.28, lv - 1));

  K.stats = function (who, levels, heroLv, relics) {
    const s = { atkAdd: 0, atkMul: 1, hpAdd: 0, hpMul: 1, candle: +(process_env('KC')) || 45, floorTime: +(process_env('KF')) || 4, next: 1, hold: 0, killTime: 0, fall: 1, lock: 0.5, foeSlow: 1, pool: K.BASE_POOL.slice(), frostTime: 5,
      armor: 1, block: 0, heal: 0, secondWind: 0, quakeRows: 2, gold: 1, goldCell: 0.03, bounty: 1, xp: 1, attune: 0, mana: 1, spellPow: 1, spellCost: 10,
      need: 2, priests: 0, healMul: 1, combo: 0, crit: 0.05, critMul: 1.6, heavy: 0, firePow: 1, needle: 0, spells: { fire: 0, ice: 0, earth: 0, storm: 0 }, bomb: 0, waterOnce: 0 };
    levels = levels || {};
    for (const n of K.NODES) { const l = levels[n.id] || 0; if (l) n.fx(s, l); }
    relics = relics || {};
    if (relics.mortar) s.bomb = 10;
    if (relics.eye) { s.crit += 0.1; s.next += 1; }
    if (relics.scale) { s.armor *= 0.8; s.block += 0.25; }
    if (relics.saber) s.atkMul *= 1.3;
    if (relics.water) { s.hpMul *= 1.2; s.waterOnce = 1; }
    if (who === 'bogatyr') { s.atkMul *= 1.2; s.hpMul *= 1.2; }
    if (who === 'vedma') { s.spellCost -= 3; s.mana *= 1.5; s.spells.fire = 1; s.spellPow *= 1.2; s.atkMul *= 0.9; }
    if (who === 'skomorokh') { s.gold *= 1.4; s.crit += 0.1; s.hold = 1; s.hpMul *= 0.9; }
    heroLv = heroLv || 1;
    s.atk = (5 + s.atkAdd + (heroLv - 1) * 0.8) * s.atkMul * (1 + (heroLv - 1) * 0.02);
    s.hp = Math.round((70 + s.hpAdd + (heroLv - 1) * 5) * s.hpMul);
    s.next = Math.min(5, s.next); s.spellCost = Math.max(4, s.spellCost); s.block = Math.min(0.8, s.block);
    s.heroLv = heroLv;
    return s;
  };

  // ---------------------------------------------------------------- run
  // The well holds heroes (1 Knight, 2 Mage, 3 Archer, 4 Priest), stone (5) and monsters (9).
  // Any connected group of K.st.need (2) or more heroes of one type attacks, then leaves the well. Where the group
  // stands matters: Knights are melee (they hit what they touch), Archers shoot along their row, Mages lob magic at
  // the nearest monster, Priests heal. Everything loose settles straight down; monsters fall as solid blocks.
  // Monsters drop in over time and telegraph their next action.
  const MON = 9; K.MON = MON;
  K.CLASS = { fire: 'Knight', ice: 'Mage', earth: 'Archer', storm: 'Priest' };
  K.CLASS_DESC = {
    fire: 'Melee: hits every monster touching the group, hard.',
    ice: 'Ranged magic: hits the monster nearest the group and splashes its neighbours.',
    earth: 'Ranged: each Archer shoots the nearest monster in its row, or failing that its column.',
    storm: 'Support: heals you and clears fog and haste; smites monsters it touches.',
  };
  const slug = (s) => s.toLowerCase().replace(/[^a-z]+/g, '-');

  // ---------------- monster intents
  // Each monster cycles through a script of actions, always telegraphed: kind, seconds left and what it will do.
  const INTENT = {
    attack: { name: 'Attack', type: 'attack' }, bite: { name: 'Bite', type: 'attack' },
    rocks: { name: 'Stone Rain', type: 'spell' }, raise: { name: 'Raise Stone', type: 'spell' },
    fog: { name: 'Fog', type: 'spell' }, haste: { name: 'Haste', type: 'spell' }, curse: { name: 'Curse', type: 'spell' }, drain: { name: 'Drain', type: 'spell' },
    guard: { name: 'Guard', type: 'guard' }, summon: { name: 'Summon', type: 'summon' }, heal: { name: 'Mend', type: 'spell' },
  };
  K.INTENT = INTENT;
  function script(d) {
    const out = ['attack'];
    for (const a of d.atk) { const m = /^(garbage|rocks)(\d)$/.exec(a); if (m) out.push({ k: m[1] === 'garbage' ? 'raise' : 'rocks', n: +m[2] }); else out.push(a); if (out.length % 2 === 0) out.push('attack'); }
    if (d.boss) out.push('guard', 'summon');
    return out.map((x) => (typeof x === 'string' ? { k: x, n: 1 } : x));
  }
  function nextIntent(r, m) {
    const s = m.script[m.n % m.script.length]; m.n++;
    const every = m.every * (0.85 + r.rnd() * 0.3);
    let dmg = 0; if (s.k === 'attack') dmg = m.dmg; else if (s.k === 'bite') dmg = Math.round(m.dmg * 1.4);
    m.intent = { k: s.k, n: s.n, dmg, t: every, total: every };
  }

  // ---------------- floors: a wave of monsters that drop in over time
  K.floorPlan = function (floor) {
    const f = K.foe(floor), tier = K.TIERS[Math.min(K.TIERS.length - 1, Math.floor((floor - 1) / 5))];
    const small = Math.round(K.HPX * 16 * Math.pow(+(process_env('KG')) || 1.21, floor - 1) * Math.min(1, 0.55 + 0.15 * (floor - 1)));
    const base = { floor, dmg: Math.round(4 + floor * 1.3), gold: Math.round(4 * Math.pow(1.16, floor - 1)), xp: Math.round(4 * Math.pow(1.16, floor - 1)), every: Math.max(4.5, 8 - floor * 0.08) };
    const mk = (d) => Object.assign({}, base, { boss: false, id: slug(d.name), name: d.name, weak: d.weak, atk: d.atk, blurb: d.blurb, relic: null, size: 1, hp: small, deathless: false });
    if (f.boss) {
      const b = Object.assign(f, base, { size: 2, hp: Math.round(small * 8 * (floor === K.TOP ? 1.1 : 1)), dmg: Math.round(base.dmg * 1.5), gold: base.gold * 10, xp: base.xp * 8, every: base.every * 0.9 });
      return [b, mk(tier[0]), mk(tier[1])];
    }
    const n = Math.min(+(process_env('KN')) || 7, 2 + Math.floor((floor - 1) / (+(process_env('KD')) || 4)));
    return Array.from({ length: n }, (_, i) => mk(tier[((floor - 1) % 5 + i) % 4]));
  };

  K.newRun = function (opt) {
    const st = opt.stats, rnd = K.rng(opt.seed || (Date.now() & 0xffffffff));
    const r = {
      st, rnd, who: opt.who, grid: new Uint8Array(W * R), gold: new Uint8Array(W * R), mon: new Int16Array(W * R).fill(-1), mons: [], uid: 0,
      piece: null, queue: [], bag: [], held: null, holdUsed: false, res: 'idle', resT: 0, pop: null, chain: 0, wantSpawn: false,
      fallT: 0, lockT: 0, lockResets: 0, landed: false, t: 0, candle: st.candle, candleMax: st.candle, hp: st.hp, hpMax: st.hp,
      floor: opt.floor || 1, startFloor: opt.floor || 1, dropQ: [], dropT: 0, nextFloorT: 0, mana: { fire: 0, ice: 0, earth: 0, storm: 0 },
      kopeks: 0, xp: 0, feathers: 0, kills: 0, bossKills: [], lines: 0, matches: 0, pieces: 0, ev: [], over: false, reason: '',
      fx: { frozen: 0, haste: 0, fog: 0 }, secondWind: st.secondWind, waterOnce: st.waterOnce, bombIn: st.bomb || 0, dmgDealt: 0, best: { hit: 0, lines: 0 },
      firstKill: Object.assign({}, opt.firstKill || {}), deathlessHit: false,
    };
    startFloor(r);
    while (r.dropQ.length && r.mons.length < 2) dropMon(r, r.dropQ.shift());
    fillQueue(r); spawn(r);
    return r;
  };
  function startFloor(r) {
    const plan = K.floorPlan(r.floor);
    r.dropQ = plan.slice(); r.dropT = 0.5;
    r.ev.push({ type: 'floor', floor: r.floor, boss: !!plan[0].boss, lead: plan[0], n: plan.length });
  }
  K.lead = (r) => r.mons.reduce((a, m) => (!a || (m.boss && !a.boss) || (m.boss === a.boss && m.hp > a.hp) ? m : a), null);
  K.left = (r) => r.mons.length + r.dropQ.length;

  // monsters drop in from the top and land on the stack
  function dropMon(r, d) {
    const s = d.size, g = r.grid, p = r.piece, pc = new Set();
    if (p) for (const [cx, cy] of cellsOf(p, p.rot)) pc.add((p.y + cy) * W + p.x + cx);
    const free = (x, y) => { for (let yy = y; yy < y + s; yy++) for (let xx = x; xx < x + s; xx++) { if (yy >= R) return false; if (yy >= 0 && (g[yy * W + xx] || pc.has(yy * W + xx))) return false; } return true; };
    const opts = [];
    for (let x = 0; x + s <= W; x++) { let y = -s; if (!free(x, y)) continue; while (free(x, y + 1)) y++; if (y >= HID + 2) opts.push({ x, y }); }
    if (!opts.length) { r.dropQ.unshift(d); r.dropT = 2; return null; }
    const at = r.rnd.pick(opts);
    const m = Object.assign({}, d, { uid: r.uid++, x: at.x, y: at.y, w: s, h: s, max: d.max || d.hp, shield: 0, n: 0, script: d.script || script(d) });
    for (let yy = at.y; yy < at.y + s; yy++) for (let xx = at.x; xx < at.x + s; xx++) { g[yy * W + xx] = MON; r.mon[yy * W + xx] = m.uid; }
    nextIntent(r, m); m.intent.t += 1.5; m.intent.total = m.intent.t;
    r.mons.push(m); r.ev.push({ type: 'mon', m });
    if (m.deathless && !r.st.needle) r.ev.push({ type: 'deathlessIntro' });
    return m;
  }

  // ---------------- pieces: a shape of heroes in one or two types
  function refillBag(r) {
    const pool = r.st.pool.slice(), rnd = r.rnd;
    for (let i = pool.length - 1; i > 0; i--) { const j = rnd.int(i + 1); [pool[i], pool[j]] = [pool[j], pool[i]]; }
    r.bag.push(...pool);
  }
  function makePiece(r, shape) {
    const s = K.SHAPES[shape], rnd = r.rnd, n = s.c.length;
    if (K.CURSES.includes(shape)) return { shape, el: STONE, cells: s.c.map(() => STONE), gold: s.c.map(() => 0), curse: true };
    if (shape === 'BOMB') return { shape, el: 0, cells: [0], gold: [0] };
    const w = [0, 1, 1, 1, r.st.priests]; const lead = K.lead(r); if (lead && r.st.attune) w[K.EL.indexOf(lead.weak) || 1] += 0.3 * r.st.attune;
    const tot = w[1] + w[2] + w[3] + w[4];
    const pick = () => { let x = rnd() * tot; for (let c = 1; c <= 4; c++) { x -= w[c]; if (x <= 0) return c; } return 1; };
    const a = pick(), b = pick(), split = Math.ceil(n / 2);
    const cells = s.c.map((_, i) => (i < split ? a : b));
    const gold = s.c.map(() => 0); if (rnd() < r.st.goldCell) gold[rnd.int(n)] = 1;
    return { shape, el: a, cells, gold, curse: false };
  }
  function fillQueue(r) {
    while (r.queue.length < 6) {
      if (r.st.bomb && --r.bombIn <= 0) { r.bombIn = r.st.bomb; r.queue.push(makePiece(r, 'BOMB')); continue; }
      if (!r.bag.length) refillBag(r);
      r.queue.push(makePiece(r, r.bag.shift()));
    }
  }
  const cellsOf = (p, rot) => K.SHAPES[p.shape].rots[rot];
  function fits(r, p, x, y, rot) {
    const c = cellsOf(p, rot), g = r.grid;
    for (let i = 0; i < c.length; i++) { const cx = x + c[i][0], cy = y + c[i][1]; if (cx < 0 || cx >= W || cy >= R) return false; if (cy >= 0 && g[cy * W + cx]) return false; }
    return true;
  }
  K.fits = fits;
  function spawn(r, p) {
    p = p || (() => { const q = r.queue.shift(); fillQueue(r); return q; })();
    const n = K.SHAPES[p.shape].n, top = Math.min(...K.SHAPES[p.shape].rots[0].map((c) => c[1]));
    p.x = Math.floor((W - n) / 2); p.rot = 0; p.y = null;
    for (const y of [HID - top, HID - top - 1, -top]) if (fits(r, p, p.x, y, 0)) { p.y = y; break; }
    if (p.y == null) { overflow(r); p.y = HID - top; if (!fits(r, p, p.x, p.y, 0)) p.y = -top; }
    r.piece = p; r.fallT = 0; r.lockT = 0; r.lockResets = 0; r.holdUsed = false; r.wantSpawn = false;
    r.ev.push({ type: 'spawn' });
  }
  function unstick(r) { const p = r.piece; if (!p) return; let n = 0; while (!fits(r, p, p.x, p.y, p.rot) && n++ < 6) p.y--; }

  // ---------------- health
  const clearCell = (r, i) => { r.grid[i] = 0; r.mon[i] = -1; r.gold[i] = 0; };
  function overflow(r) {
    const dmg = r.secondWind ? 0 : Math.round(r.hpMax * 0.3);
    if (r.secondWind) r.secondWind = 0;
    for (let i = 0; i < (HID + 6) * W; i++) if (r.grid[i] !== MON) clearCell(r, i);
    hurt(r, dmg, 'overflow'); r.ev.push({ type: 'overflow', dmg });
  }
  function hurt(r, dmg, why) {
    if (dmg <= 0) return;
    r.hp -= dmg;
    if (r.waterOnce && r.hp > 0 && r.hp < r.hpMax * 0.25) { r.waterOnce = 0; r.hp += Math.round(r.hpMax * 0.5); r.ev.push({ type: 'water' }); }
    r.ev.push({ type: 'hurt', dmg, why });
    if (r.hp <= 0) { r.hp = 0; end(r, 'slain'); }
  }
  function end(r, why) { if (r.over) return; r.over = true; r.reason = why; r.ev.push({ type: 'end', why }); }
  const heal = (r, frac) => { if (frac > 0) r.hp = Math.min(r.hpMax, r.hp + r.hpMax * frac); };

  // ---------------- controls
  K.ghostY = function (r) { const p = r.piece; let y = p.y; while (fits(r, p, p.x, y + 1, p.rot)) y++; return y; };
  function touched(r) { if (r.landed && r.lockResets < 15) { r.lockT = 0; r.lockResets++; } }
  const live = (r) => !r.over && !!r.piece;
  K.move = function (r, dx) { if (!live(r)) return false; const p = r.piece; if (fits(r, p, p.x + dx, p.y, p.rot)) { p.x += dx; touched(r); r.landed = !fits(r, p, p.x, p.y + 1, p.rot); return true; } return false; };
  const KICKS = [[0, 0], [-1, 0], [1, 0], [0, -1], [-2, 0], [2, 0], [-1, -1], [1, -1], [0, 1]];
  K.rotate = function (r, dir) {
    if (!live(r)) return false; const p = r.piece; if (K.SHAPES[p.shape].n === 1) return false;
    const nr = (p.rot + (dir || 1) + 4) % 4;
    for (const [kx, ky] of KICKS) if (fits(r, p, p.x + kx, p.y + ky, nr)) { p.x += kx; p.y += ky; p.rot = nr; touched(r); r.landed = !fits(r, p, p.x, p.y + 1, p.rot); r.ev.push({ type: 'rotate' }); return true; }
    return false;
  };
  K.soft = function (r) { if (!live(r)) return false; const p = r.piece; if (fits(r, p, p.x, p.y + 1, p.rot)) { p.y++; r.fallT = 0; return true; } return false; };
  K.hard = function (r) { if (!live(r)) return; const p = r.piece, y0 = p.y; p.y = K.ghostY(r); r.ev.push({ type: 'drop', rows: p.y - y0 }); lock(r); };
  K.hold = function (r) {
    if (!live(r) || !r.st.hold || r.holdUsed) return false;
    const cur = r.piece, nx = r.held; r.held = { shape: cur.shape, el: cur.el, cells: cur.cells, gold: cur.gold, curse: cur.curse };
    spawn(r, nx || undefined); r.holdUsed = true; r.ev.push({ type: 'hold' }); return true;
  };

  function lock(r) {
    const p = r.piece, c = cellsOf(p, p.rot), g = r.grid;
    r.piece = null; r.pieces++; r.chain = 0; r.wantSpawn = true;
    if (p.shape === 'BOMB') {
      const bx = p.x + c[0][0], by = p.y + c[0][1], struck = new Set();
      for (let y = by - 1; y <= by + 1; y++) for (let x = bx - 1; x <= bx + 1; x++) if (x >= 0 && x < W && y >= 0 && y < R) { const i = y * W + x; if (g[i] === MON) { const m = monAt(r, i); if (m) struck.add(m); } else clearCell(r, i); }
      r.ev.push({ type: 'bomb', x: bx, y: by });
      for (const m of struck) hit(r, m, r.st.atk * 4, { kind: 'bomb' });
    } else {
      const placed = [];
      for (let i = 0; i < c.length; i++) { const x = p.x + c[i][0], y = p.y + c[i][1]; if (y >= 0) { g[y * W + x] = p.cells[i]; r.gold[y * W + x] = p.gold[i]; placed.push([x, y, p.cells[i]]); } }
      r.ev.push({ type: 'lock', cells: placed });
    }
    if (!r.over) { r.res = 'settle'; r.resT = 0; }
  }
  const monAt = (r, i) => r.mons.find((o) => o.uid === r.mon[i]);

  // ---------------- gravity: loose cells drop a row per step; monsters fall as solid blocks
  function settleStep(r) {
    const g = r.grid, gd = r.gold, mo = r.mon; let moved = false;
    for (let y = R - 2; y >= 0; y--) for (let x = 0; x < W; x++) { const i = y * W + x, v = g[i]; if (v && v !== MON && !g[i + W]) { g[i + W] = v; gd[i + W] = gd[i]; g[i] = 0; gd[i] = 0; moved = true; } }
    for (const m of r.mons) {
      const by = m.y + m.h; if (by >= R) continue;
      let ok = true; for (let x = m.x; x < m.x + m.w; x++) if (g[by * W + x]) ok = false;
      if (!ok) continue;
      for (let y = by - 1; y >= m.y; y--) for (let x = m.x; x < m.x + m.w; x++) { const i = y * W + x; g[i + W] = g[i]; mo[i + W] = mo[i]; g[i] = 0; mo[i] = -1; }
      m.y++; moved = true;
    }
    return moved;
  }
  K.settleAll = (r) => { let n = 0; while (settleStep(r) && n++ < R * 2); };

  // ---------------- groups and attacks
  K.findGroups = function (r) {
    const g = r.grid, seen = new Uint8Array(W * R), out = [];
    for (let i = HID * W; i < W * R; i++) {
      const v = g[i]; if (seen[i] || v < 1 || v > 4) continue;
      const cells = [], q = [i]; seen[i] = 1;
      while (q.length) { const j = q.pop(); cells.push(j); const x = j % W, y = (j / W) | 0;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const xx = x + dx, yy = y + dy; if (xx < 0 || xx >= W || yy < HID || yy >= R) continue; const k = yy * W + xx; if (!seen[k] && g[k] === v) { seen[k] = 1; q.push(k); } } }
      if (cells.length >= r.st.need) out.push({ type: v, cells });
    }
    return out;
  };
  const distTo = (x, y, m) => Math.max(0, m.x - x, x - (m.x + m.w - 1)) + Math.max(0, m.y - y, y - (m.y + m.h - 1));
  // who a group would hit, and how hard (before crits): [{m, d, how}]
  K.groupHits = function (r, gr, chain) {
    const st = r.st, n = gr.cells.length, out = new Map(), add = (m, d, how) => { const o = out.get(m) || { m, d: 0, how }; o.d += d; out.set(m, o); };
    const base = st.atk * n * (1 + 0.25 * (n - 2)) * (1 + Math.max(0, (chain || 1) - 1) * (0.5 + st.combo)) * (n >= 5 ? 1 + st.heavy : 1);
    const xy = gr.cells.map((i) => [i % W, (i / W) | 0]);
    if (gr.type === 1) { // Knights: melee
      for (const m of r.mons) if (xy.some(([x, y]) => distTo(x, y, m) === 1)) add(m, base * 1.7, 'melee');
    } else if (gr.type === 3) { // Archers: each shoots along its row, else its column
      const per = base / n;
      for (const [x, y] of xy) {
        let best = null, bd = 99;
        for (const m of r.mons) if (y >= m.y && y < m.y + m.h) { const d = distTo(x, y, m); if (d < bd) { bd = d; best = m; } }
        if (!best) for (const m of r.mons) if (x >= m.x && x < m.x + m.w) { const d = distTo(x, y, m); if (d < bd) { bd = d; best = m; } }
        if (best) add(best, per * 1.25, 'arrow');
      }
    } else if (gr.type === 2) { // Mages: the monster nearest the group, splashing its neighbours
      const cx = xy.reduce((a, p) => a + p[0], 0) / n, cy = xy.reduce((a, p) => a + p[1], 0) / n;
      let best = null, bd = 1e9; for (const m of r.mons) { const d = Math.hypot(m.x + m.w / 2 - 0.5 - cx, m.y + m.h / 2 - 0.5 - cy); if (d < bd) { bd = d; best = m; } }
      if (best) { add(best, base * 0.9, 'magic'); for (const m of r.mons) if (m !== best && Math.abs(m.x - best.x) <= best.w && Math.abs(m.y - best.y) <= best.h) add(m, base * 0.45, 'splash'); }
    } else if (gr.type === 4) { // Priests: smite what they touch
      for (const m of r.mons) if (xy.some(([x, y]) => distTo(x, y, m) === 1)) add(m, base * 0.6, 'smite');
    }
    for (const o of out.values()) { const wk = K.EL.indexOf(o.m.weak); if (wk === gr.type) o.d *= 1.5; }
    return [...out.values()];
  };
  function resolveStep(r) {
    const groups = K.findGroups(r);
    if (groups.length) {
      r.chain++;
      const cells = new Set(); for (const gr of groups) for (const i of gr.cells) cells.add(i);
      r.pop = { groups, cells }; r.res = 'pop'; r.resT = 0.22;
      r.ev.push({ type: 'pop', groups: groups.map((g) => ({ type: g.type, cells: g.cells, hits: K.groupHits(r, g, r.chain).map((h) => ({ uid: h.m.uid, how: h.how })) })), chain: r.chain });
      return;
    }
    r.res = 'idle';
    let spill = false; for (let i = 0; i < HID * W; i++) if (r.grid[i] && r.grid[i] !== MON) spill = true;
    if (spill) overflow(r);
  }
  function doPop(r) {
    const { groups, cells } = r.pop, st = r.st, g = r.grid; r.pop = null;
    const hits = [];
    for (const gr of groups) for (const h of K.groupHits(r, gr, r.chain)) hits.push(h);
    let gold = 0, priests = 0; const crushed = [];
    for (const i of cells) {
      const v = g[i]; if (v === 4) priests++;
      r.mana[K.EL[v]] = Math.min(st.spellCost * 3, r.mana[K.EL[v]] + st.mana * 0.45);
      if (r.gold[i]) gold++;
      const x = i % W, y = (i / W) | 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const xx = x + dx, yy = y + dy; if (xx >= 0 && xx < W && yy >= 0 && yy < R && g[yy * W + xx] === STONE) crushed.push(yy * W + xx); }
      clearCell(r, i);
    }
    for (const i of crushed) clearCell(r, i);
    if (priests) { heal(r, priests * 0.025 * st.healMul); r.fx.fog = 0; r.fx.haste = 0; }
    heal(r, st.heal * groups.length);
    if (r.chain > 1) r.mana.storm = Math.min(st.spellCost * 3, r.mana.storm + 1.5 * st.mana);
    if (gold) { const k = Math.round(gold * Math.max(2, 2 * Math.pow(1.16, r.floor - 1)) * st.gold); r.kopeks += k; r.ev.push({ type: 'gold', n: gold, k }); }
    r.kopeks += Math.round(groups.length * Math.max(1, 0.4 * Math.pow(1.16, r.floor - 1)) * st.gold);
    r.matches += groups.length; if (r.chain > r.best.lines) r.best.lines = r.chain;
    r.ev.push({ type: 'clear', cells: [...cells], crushed, groups: groups.length, chain: r.chain, priests });
    for (const h of hits) hit(r, h.m, h.d, { kind: h.how });
    r.res = 'settle'; r.resT = 0;
  }
  function hit(r, m, dmg, info) {
    if (m.hp <= 0 || !r.mons.includes(m)) return;
    const crit = r.rnd() < r.st.crit; if (crit) dmg *= r.st.critMul;
    dmg = Math.max(1, Math.round(dmg));
    let blocked = 0; if (m.shield > 0) { blocked = Math.min(m.shield, dmg); m.shield -= blocked; dmg -= blocked; }
    m.hp -= dmg; r.dmgDealt += dmg; if (dmg > r.best.hit) r.best.hit = dmg;
    if (m.deathless && !r.st.needle && m.hp < 1) { m.hp = 1; if (!r.deathlessHit) { r.deathlessHit = true; r.ev.push({ type: 'deathless' }); } }
    r.ev.push({ type: 'hit', uid: m.uid, x: m.x + m.w / 2, y: m.y + m.h / 2, dmg, blocked, crit, kind: info.kind, lead: m === K.lead(r) });
    if (m.hp <= 0) killMon(r, m);
  }
  function killMon(r, m) {
    const st = r.st;
    for (let i = 0; i < W * R; i++) if (r.mon[i] === m.uid) clearCell(r, i);
    r.mons.splice(r.mons.indexOf(m), 1);
    const k = Math.round(m.gold * st.gold * st.bounty);
    r.kopeks += k; r.xp += Math.round(m.xp * st.xp); r.kills++;
    let feathers = 0, relic = null;
    if (m.boss) {
      feathers = r.firstKill[m.floor] ? 2 : 4; if (m.floor > K.TOP) feathers = 2;
      if (!r.firstKill[m.floor]) { r.firstKill[m.floor] = 1; relic = m.relic; }
      r.feathers += feathers; r.bossKills.push(m.floor);
    }
    r.candle = Math.min(r.candleMax + 30, r.candle + st.killTime);
    r.ev.push({ type: 'kill', m, x: m.x + m.w / 2, y: m.y + m.h / 2, k, feathers, relic });
    if (m.boss && m.floor === K.TOP) { r.won = true; r.ev.push({ type: 'win' }); }
    if (m.boss) { r.dropQ = r.dropQ.filter((d) => d.floor !== m.floor); for (const o of r.mons.slice()) if (o.floor === m.floor) killMon(r, o); }
    if (!K.left(r) && r.nextFloorT <= 0) { r.nextFloorT = 1.2; r.candle += st.floorTime; r.ev.push({ type: 'cleared', floor: r.floor, time: st.floorTime }); }
    if (r.res === 'idle') { r.res = 'settle'; r.resT = 0; }
  }

  // ---------------- monsters act on their telegraphed intent
  function act(r, m) {
    const st = r.st, it = m.intent, g = r.grid;
    r.ev.push({ type: 'attack', kind: it.k, m, x: m.x + m.w / 2, y: m.y + m.h / 2 });
    if (it.k === 'attack' || it.k === 'bite') {
      hurt(r, Math.round(it.dmg * st.armor), 'attack');
      if (it.k === 'bite') { // eats a hero beside it
        const adj = []; for (let y = m.y - 1; y <= m.y + m.h; y++) for (let x = m.x - 1; x <= m.x + m.w; x++) if (x >= 0 && x < W && y >= 0 && y < R && distTo(x, y, m) === 1) { const v = g[y * W + x]; if (v >= 1 && v <= 4) adj.push([x, y]); }
        const eaten = []; for (let i = 0; i < 2 && adj.length; i++) { const [x, y] = adj.splice(r.rnd.int(adj.length), 1)[0]; clearCell(r, y * W + x); eaten.push([x, y]); }
        if (eaten.length) { r.ev.push({ type: 'bite', cells: eaten }); if (r.res === 'idle') { r.res = 'settle'; r.resT = 0; } }
      }
    } else if (it.k === 'rocks') {
      const n = it.n * 2, cols = []; let blocked = 0;
      for (let i = 0; i < n; i++) { if (r.rnd() < st.block) { blocked++; continue; } const x = r.rnd.int(W); let y = 0; while (y < R && !g[y * W + x]) y++; y--; if (y >= HID) { g[y * W + x] = STONE; cols.push([x, y]); } }
      unstick(r); r.ev.push({ type: 'rocks', cells: cols, blocked });
    } else if (it.k === 'raise') {
      let rows = 0;
      for (let i = 0; i < it.n; i++) {
        if (r.rnd() < st.block) continue;
        let spill = false; for (let x = 0; x < W; x++) if (g[x]) spill = true;
        if (spill) { overflow(r); break; }
        const hole = r.rnd.int(W);
        g.copyWithin(0, W); r.mon.copyWithin(0, W); r.gold.copyWithin(0, W);
        for (let x = 0; x < W; x++) { g[(R - 1) * W + x] = x === hole ? 0 : STONE; r.mon[(R - 1) * W + x] = -1; r.gold[(R - 1) * W + x] = 0; }
        for (const o of r.mons) o.y--;
        rows++;
      }
      unstick(r); r.ev.push({ type: 'raise', n: rows });
    } else if (it.k === 'fog') r.fx.fog = 6;
    else if (it.k === 'haste') r.fx.haste = 6;
    else if (it.k === 'curse') { r.queue.unshift(makePiece(r, r.rnd.pick(K.CURSES))); r.ev.push({ type: 'curse' }); }
    else if (it.k === 'drain') { for (const e in r.mana) r.mana[e] = Math.floor(r.mana[e] / 2); }
    else if (it.k === 'guard') { m.shield = Math.round(m.max * 0.25); r.ev.push({ type: 'guard', m }); }
    else if (it.k === 'summon') {
      const tier = K.TIERS[Math.min(K.TIERS.length - 1, Math.floor((m.floor - 1) / 5))], d = tier[r.rnd.int(4)];
      const sm = K.floorPlan(Math.max(1, m.floor - 1)).find((x) => !x.boss) || { hp: Math.round(m.max / 8) };
      if (r.mons.length < 6) dropMon(r, Object.assign({}, sm, { floor: m.floor, boss: false, id: slug(d.name), name: d.name, weak: d.weak, atk: d.atk, size: 1, script: null, max: null, deathless: false, relic: null }));
    }
    nextIntent(r, m);
  }

  K.canCast = (r, el) => !r.over && r.st.spells[el] && r.mana[el] >= r.st.spellCost;
  K.cast = function (r, el) {
    if (!K.canCast(r, el)) return false;
    const st = r.st, pow = st.spellPow; r.mana[el] -= st.spellCost;
    r.ev.push({ type: 'cast', el });
    if (el === 'fire') for (const m of r.mons.slice()) hit(r, m, st.atk * 4 * pow * st.firePow, { kind: 'spell' });
    else if (el === 'ice') r.fx.frozen = st.frostTime * (0.85 + 0.15 * pow);
    else if (el === 'earth') {
      const g = r.grid; let n = 0;
      for (let i = 0; i < W * R; i++) if (g[i] === STONE) { clearCell(r, i); n++; }
      for (let y = R - st.quakeRows; y < R; y++) for (let x = 0; x < W; x++) { const i = y * W + x; if (g[i] && g[i] !== MON) { clearCell(r, i); n++; } }
      r.ev.push({ type: 'quake', n });
      for (const m of r.mons.slice()) hit(r, m, st.atk * 2 * pow, { kind: 'spell' });
    } else if (el === 'storm') { const m = K.lead(r); if (m) { hit(r, m, st.atk * 8 * pow, { kind: 'spell' }); if (r.mons.includes(m)) { m.intent.t = m.intent.total; } } }
    if (r.res === 'idle') { r.res = 'settle'; r.resT = 0; }
    return true;
  };

  K.step = function (r, dt) {
    if (r.over) return;
    r.t += dt; r.candle -= dt;
    if (r.candle <= 0) { r.candle = 0; end(r, 'candle'); return; }
    const fx = r.fx, st = r.st;
    for (const k of ['frozen', 'haste', 'fog']) if (fx[k] > 0) fx[k] = Math.max(0, fx[k] - dt);
    // floors
    if (r.nextFloorT > 0) { r.nextFloorT -= dt; if (r.nextFloorT <= 0) { r.floor++; startFloor(r); } }
    // arrivals: the next monster drops on a timer, or at once when the well is empty of them
    if (r.dropQ.length) { r.dropT -= dt; if (r.dropT <= 0 || !r.mons.length) { dropMon(r, r.dropQ.shift()); r.dropT = Math.max(3.5, 8 - r.floor * 0.08) * (0.8 + r.rnd() * 0.4); if (r.res === 'idle') { r.res = 'settle'; r.resT = 0; } } }
    // the well settles, pops and chains on its own clock
    if (r.res === 'pop') { r.resT -= dt; if (r.resT <= 0) doPop(r); }
    else if (r.res === 'settle') { r.resT += dt; while (r.resT >= 0.05 && r.res === 'settle') { r.resT -= 0.05; if (settleStep(r)) unstick(r); else resolveStep(r); } }
    if (r.over) return;
    if (r.res === 'idle' && r.wantSpawn && !r.piece) spawn(r);
    // monsters count down to their next action
    if (!fx.frozen) for (const m of r.mons.slice()) { if (!r.mons.includes(m)) continue; m.intent.t -= dt / st.foeSlow; if (m.intent.t <= 0) { act(r, m); if (r.over) return; if (r.res === 'idle') { r.res = 'settle'; r.resT = 0; } } }
    // the falling piece
    const p = r.piece; if (!p || fx.frozen) return;
    const gi = K.gravity(r.floor) * st.fall / (fx.haste ? 2.5 : 1);
    if (fits(r, p, p.x, p.y + 1, p.rot)) {
      r.landed = false; r.fallT += dt;
      while (r.fallT >= gi && fits(r, p, p.x, p.y + 1, p.rot)) { r.fallT -= gi; p.y++; }
      if (!fits(r, p, p.x, p.y + 1, p.rot)) { r.landed = true; r.lockT = 0; }
    } else { r.landed = true; r.lockT += dt; if (r.lockT >= st.lock) lock(r); }
  };
  // preview: what a piece would do if dropped here (for the ghost and the bot)
  K.preview = function (r, p, x, rot) {
    if (!fits(r, p, x, p.y, rot)) return null;
    let y = p.y; while (fits(r, p, x, y + 1, rot)) y++;
    const c = cellsOf(p, rot);
    const s = { grid: r.grid.slice(), gold: r.gold.slice(), mon: r.mon.slice(), mons: r.mons.map((m) => Object.assign({}, m)), st: r.st };
    c.forEach(([cx, cy], i) => { if (y + cy >= 0) s.grid[(y + cy) * W + x + cx] = p.shape === 'BOMB' ? STONE : p.cells[i]; });
    K.settleAll(s);
    const groups = K.findGroups(s), hits = [];
    for (const gr of groups) for (const h of K.groupHits(s, gr, 1)) hits.push({ uid: h.m.uid, d: h.d, how: h.how });
    const dmgBy = {}; for (const h of hits) dmgBy[h.uid] = (dmgBy[h.uid] || 0) + h.d;
    return { y, groups, hits, dmgBy, grid: s.grid, mons: s.mons };
  };

  K.result = function (r) {
    return { kopeks: r.kopeks, xp: r.xp, feathers: r.feathers, reason: r.reason, floor: r.floor - (K.left(r) ? 1 : 0), reached: r.floor, kills: r.kills, bossKills: r.bossKills, won: !!r.won, lines: r.matches, t: r.t, startFloor: r.startFloor, best: r.best };
  };

  // ---------------------------------------------------------------- save / meta
  K.newHero = () => ({ levels: {}, kopeks: 0, feathers: 0, xp: 0, lv: 1, relics: {}, bosses: {}, best: 0, runs: 0, won: 0, time: 0 });
  K.newSave = () => ({ v: 1, who: 'bogatyr', wins: 0, heroes: { bogatyr: K.newHero() }, opts: { music: 2, sfx: 2 } });
  K.heroStats = (S, who) => { const h = S.heroes[who]; return K.stats(who, h.levels, h.lv, h.relics); };
  K.checkpoints = (h) => { const out = [1]; for (const f of [5, 10, 15, 20, 25]) if (h.bosses[f]) out.push(f + 1); if (h.won) out.push(K.TOP + 1); return out; };
  K.buy = function (S, who, id) {
    const h = S.heroes[who], n = K.NODE[id], lv = h.levels[id] || 0;
    if (!n || lv >= n.max || !K.nodeOpen(n, h.levels, h)) return false;
    const cost = K.nodeCost(n, lv), cur = n.cur === 'f' ? 'feathers' : 'kopeks';
    if (h[cur] < cost) return false;
    h[cur] -= cost; h.levels[id] = lv + 1; return true;
  };
  // apply a finished run; returns {levelUps, relics, newWin, unlocked}
  K.applyRun = function (S, who, res) {
    const h = S.heroes[who];
    h.kopeks += res.kopeks; h.feathers += res.feathers; h.xp += res.xp; h.runs++; h.time += res.t;
    h.best = Math.max(h.best, res.floor);
    const out = { levelUps: 0, relics: [], newWin: false, unlocked: null };
    while (h.xp >= K.xpNeed(h.lv)) { h.xp -= K.xpNeed(h.lv); h.lv++; out.levelUps++; }
    for (const f of res.bossKills) {
      if (!h.bosses[f]) { h.bosses[f] = 1; const b = K.BOSSES[f]; if (b && b.relic) { h.relics[b.relic] = 1; out.relics.push(b.relic); } }
    }
    if (res.won && !h.won) {
      h.won = 1; S.wins++; out.newWin = true;
      const next = K.HEROES.find((x) => x.unlock === S.wins);
      if (next && !S.heroes[next.id]) { S.heroes[next.id] = K.newHero(); out.unlocked = next.id; }
    }
    return out;
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = K; else root.KT = K;
})(typeof window !== 'undefined' ? window : globalThis);
