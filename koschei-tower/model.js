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
    // curse pieces (monsters slip these in)
    X5: { n: 3, c: [[1, 0], [0, 1], [1, 1], [2, 1], [1, 2]] },
    U5: { n: 3, c: [[0, 0], [2, 0], [0, 1], [1, 1], [2, 1]] },
    W5: { n: 3, c: [[0, 0], [0, 1], [1, 1], [1, 2], [2, 2]] },
    F5: { n: 3, c: [[1, 0], [2, 0], [0, 1], [1, 1], [1, 2]] },
    T5: { n: 3, c: [[0, 0], [1, 0], [2, 0], [1, 1], [1, 2]] },
    BOMB: { n: 1, c: [[0, 0]] },
  };
  K.BASE_POOL = ['I4', 'O4', 'T4', 'S4', 'Z4', 'L4', 'J4', 'I3', 'V3'];
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
  K.TOP = 30; K.HPX = +(typeof process !== "undefined" && process.env && process.env.HPX) || 9;
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
    N('frost', 'Frost', 'snow', () => 'Spell, charged by Mages: freeze the fall and every monster for 5 s. Heroes keep fighting.', 0, -3, ['wax'], 400, 1, 1, (s, l) => { if (l) s.spells.ice = 1; }),
    N('lull', 'Lullaby', 'note', (l) => `Monsters strike ${8 * (l + 1)}% less often (now ${8 * l}%).`, -1, -3, ['feather'], 250, 1.7, 5, (s, l) => { s.foeSlow *= 1 + 0.08 * l; }),
    N('pebble', 'Pebble Rune', 'pebble', () => 'Adds a one-cell piece to the bag: plugs any hole.', 1, -3, ['steady'], 500, 1, 1, (s, l) => { if (l) s.pool.push('P1'); }),
    N('frost2', 'Deep Frost', 'snow', (l) => `Frost lasts +1.5 s (now +${1.5 * l} s).`, 0, -4, ['frost'], 900, 1.8, 4, (s, l) => { s.frostTime += 1.5 * l; }),
    // right: defence
    N('armor', 'Chainmail', 'shield', (l) => `Monsters hit ${8 * (l + 1)}% softer (now ${8 * l}%).`, 2, 0, ['vit'], 60, 1.5, 6, (s, l) => { s.armor *= 1 - 0.08 * l; }),
    N('stone', 'Stoneskin', 'rock', (l) => `${15 * (l + 1)}% of stone rows crumble on arrival (now ${15 * l}%).`, 2, -1, ['armor'], 200, 1.7, 4, (s, l) => { s.block += 0.15 * l; }),
    N('samovar', 'Samovar', 'cup', (l) => `Heal ${l + 1}% max HP per row cleared; Priests heal +20% (now ${l}%).`, 2, 1, ['armor'], 150, 1.7, 5, (s, l) => { s.heal += 0.01 * l; s.healMul *= 1 + 0.2 * l; }),
    N('second', 'Second Wind', 'wind', () => 'Your first overflow each climb costs no HP.', 3, 0, ['armor'], 700, 1, 1, (s, l) => { if (l) s.secondWind = 1; }),
    N('quake', 'Quake', 'quake', () => 'Spell, charged by Archers: crush every stone and the bottom 2 rows, and pelt every monster.', 3, -1, ['stone'], 450, 1, 1, (s, l) => { if (l) s.spells.earth = 1; }),
    N('grace', 'Firebird Grace', 'plume', (l) => `+15% max HP (now +${15 * l}%).`, 3, 1, ['samovar'], 2, 1.6, 4, (s, l) => { s.hpMul *= 1 + 0.15 * l; }, { cur: 'f' }),
    N('quake2', 'Deep Roots', 'quake', (l) => `Quake crushes one more row (now +${l}).`, 4, -1, ['quake'], 2000, 2, 2, (s, l) => { s.quakeRows += l; }),
    // left: economy + magic
    N('gold', 'Gold Vein', 'nugget', (l) => `${5 * (l + 1)}% of parties carry a treasure chest (now ${5 * l}%).`, -2, 0, ['greed'], 50, 1.6, 6, (s, l) => { s.goldCell += 0.05 * l; }),
    N('bounty', 'Bounty', 'bag', (l) => `+20% kopeks from slain monsters (now +${20 * l}%).`, -2, -1, ['gold'], 150, 1.6, 6, (s, l) => { s.bounty *= 1 + 0.2 * l; }),
    N('scholar', 'Scholar', 'book', (l) => `+20% XP (now +${20 * l}%).`, -2, 1, ['gold'], 100, 1.6, 6, (s, l) => { s.xp *= 1 + 0.2 * l; }),
    N('attune', 'Recruiter', 'rune', (l) => `More heroes of the class the monsters fear (now ${l}/3).`, -3, 0, ['gold'], 250, 1.9, 3, (s, l) => { s.attune += l; }),
    N('mana', 'Mana Well', 'orb', (l) => `+25% mana from cleared runes (now +${25 * l}%).`, -3, -1, ['bounty'], 300, 1.7, 5, (s, l) => { s.mana *= 1 + 0.25 * l; }),
    N('touch', 'Golden Touch', 'plume', (l) => `+25% kopeks (now +${25 * l}%).`, -3, 1, ['scholar'], 3, 1.6, 3, (s, l) => { s.gold *= 1 + 0.25 * l; }, { cur: 'f' }),
    N('bolt', 'Thunder', 'bolt', () => 'Spell, charged by Priests: a thunderbolt on the biggest monster that also resets its attack.', -4, 0, ['attune'], 600, 1, 1, (s, l) => { if (l) s.spells.storm = 1; }),
    N('spell', 'Spellcraft', 'star', (l) => `Spells +25% stronger, cost 1 less (now +${25 * l}%).`, -4, -1, ['mana'], 1200, 1.9, 4, (s, l) => { s.spellPow *= 1 + 0.25 * l; s.spellCost -= l; }),
    // down: offence
    N('hold', 'Satchel', 'satchel', () => 'Hold one party for later (tap HOLD or flick up).', 0, 2, ['seer'], 60, 1, 1, (s, l) => { if (l) s.hold = 1; }),
    N('hammer', 'Shield Bash', 'hammer', (l) => `Heroes hit +15% harder when they land (now +${15 * l}%).`, -1, 2, ['seer'], 40, 1.5, 8, (s, l) => { s.land += 0.15 * l; }),
    N('rhythm', 'Rhythm', 'drum', (l) => `Back-to-back clears +10% per step, and heroes in reach fight +10% harder (now +${10 * l}%).`, 1, 2, ['seer'], 70, 1.6, 5, (s, l) => { s.combo += 0.1 * l; s.tick += 0.1 * l; }),
    N('keen', 'Keen Eye', 'target', (l) => `+5% crit chance (now +${5 * l}%).`, 0, 3, ['hold'], 180, 1.6, 6, (s, l) => { s.crit += 0.05 * l; }),
    N('heavy', 'Heavy Blow', 'anvil', (l) => `Clearing 3+ rows at once hits +25% harder (now +${25 * l}%).`, -1, 3, ['hammer'], 220, 1.65, 6, (s, l) => { s.heavy += 0.25 * l; }),
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
    const s = { atkAdd: 0, atkMul: 1, hpAdd: 0, hpMul: 1, candle: 30, next: 1, hold: 0, killTime: 0, fall: 1, lock: 0.5, foeSlow: 1, pool: K.BASE_POOL.slice(), frostTime: 5,
      armor: 1, block: 0, heal: 0, secondWind: 0, quakeRows: 2, gold: 1, goldCell: 0.03, bounty: 1, xp: 1, attune: 0, mana: 1, spellPow: 1, spellCost: 10,
      land: 1, tick: 1, volley: 1, healMul: 1, combo: 0.2, crit: 0.05, critMul: 1.6, heavy: 0, firePow: 1, needle: 0, spells: { fire: 0, ice: 0, earth: 0, storm: 0 }, bomb: 0, waterOnce: 0 };
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
  // The well holds heroes (codes 1-4: Knight, Mage, Archer, Priest), stone (5), treasure (6) and monsters (9).
  // Monsters are rigid squares with their own HP and attack timer. Heroes fight whatever they touch.
  const LINE = [0, 1, 2.6, 4.5, 7, 9.5]; K.LINE = LINE;
  const MON = 9; K.MON = MON;
  K.CLASS = { fire: 'Knight', ice: 'Mage', earth: 'Archer', storm: 'Priest' };
  K.CLASS_DESC = { fire: 'Knights strike hard at monsters they land beside.', ice: 'Mages blast every monster within 2 cells.', earth: 'Archers shoot the nearest monster within 3 cells.', storm: 'Priests heal the party and smite what they touch.' };
  // hero actions in units of attack: land = when the piece locks, tick = every battle second while in reach
  const ACT = { fire: { land: 1.6, tick: 0.4 }, ice: { land: 0.7, tick: 0.22 }, earth: { land: 0.9, tick: 0.3 }, storm: { land: 0.5, tick: 0.15, heal: 0.02, theal: 0.003 } };
  K.ACT = ACT;
  const slug = (s) => s.toLowerCase().replace(/[^a-z]+/g, '-');

  K.floorPlan = function (floor) {
    const f = K.foe(floor);
    if (f.boss) return [Object.assign(f, { size: 3 })];
    const n = (floor % 5 >= 3 ? 1 : 0) + (floor > 10 ? 1 : 0), share = n ? 0.65 : 1;
    const out = [Object.assign(f, { size: 2, hp: Math.round(f.hp * share), gold: Math.round(f.gold * share), xp: Math.round(f.xp * share) })];
    for (let i = 0; i < n; i++) out.push(minion(floor, i + 1, f, 0.35 / n * f.hp / share));
    return out;
  };
  function minion(floor, k, f, hp) {
    const tier = K.TIERS[Math.min(K.TIERS.length - 1, Math.floor((floor - 1) / 5))], d = tier[((floor - 1) % 5 % 4 + k) % 4];
    const frac = hp / (f.hp || 1);
    return { floor, boss: false, minion: true, id: slug(d.name), name: d.name, weak: d.weak, resist: d.resist, atk: d.atk, blurb: d.blurb, relic: null, size: 1,
      hp: Math.max(1, Math.round(hp)), dmg: Math.max(1, Math.round(f.dmg * 0.6)), every: f.every * 1.2, gold: Math.round(f.gold * frac), xp: Math.round(f.xp * frac), deathless: false };
  }

  K.newRun = function (opt) {
    const st = opt.stats, rnd = K.rng(opt.seed || (Date.now() & 0xffffffff));
    const r = {
      st, rnd, who: opt.who, grid: new Uint8Array(W * R), mon: new Int16Array(W * R).fill(-1), mons: [], uid: 0, spawnQ: [],
      piece: null, queue: [], bag: [], held: null, holdUsed: false,
      fallT: 0, lockT: 0, lockResets: 0, landed: false, t: 0, candle: st.candle, candleMax: st.candle, hp: st.hp, hpMax: st.hp,
      floor: opt.floor || 1, startFloor: opt.floor || 1, nextFloorT: 0, tickT: 0, minionT: 12, mana: { fire: 0, ice: 0, earth: 0, storm: 0 },
      combo: -1, kopeks: 0, xp: 0, feathers: 0, kills: 0, bossKills: [], lines: 0, pieces: 0, ev: [], over: false, reason: '', needFall: false,
      fx: { frozen: 0, haste: 0, fog: 0 }, secondWind: st.secondWind, waterOnce: st.waterOnce, bombIn: st.bomb || 0, dmgDealt: 0, best: { hit: 0, lines: 0 },
      firstKill: Object.assign({}, opt.firstKill || {}), deathlessHit: false,
    };
    startFloor(r);
    for (let i = 0; i < 40 && r.spawnQ.length && r.spawnQ[0].t <= 0; i++) dropMon(r, r.spawnQ.shift().d);
    fillQueue(r); spawn(r);
    return r;
  };
  function startFloor(r) {
    const plan = K.floorPlan(r.floor);
    plan.forEach((d, i) => r.spawnQ.push({ d, t: i * 1.4 }));
    r.minionT = 12;
    r.ev.push({ type: 'floor', floor: r.floor, boss: plan[0].boss, lead: plan[0] });
  }
  K.lead = (r) => r.mons.reduce((a, m) => (!a || m.boss && !a.boss || (m.boss === a.boss && m.w * m.h > a.w * a.h) ? m : a), null);

  // ---------------- pieces
  function refillBag(r) {
    const pool = r.st.pool.slice(), rnd = r.rnd;
    for (let i = pool.length - 1; i > 0; i--) { const j = rnd.int(i + 1); [pool[i], pool[j]] = [pool[j], pool[i]]; }
    r.bag.push(...pool);
  }
  function makePiece(r, shape) {
    const s = K.SHAPES[shape], rnd = r.rnd;
    if (K.CURSES.includes(shape)) return { shape, el: STONE, cells: s.c.map(() => STONE), curse: true };
    // each cell is a hero; Recruitment favours the class the monsters fear
    const w = { fire: 1, ice: 1, earth: 1, storm: 0.8 };
    const lead = K.lead(r); if (lead && r.st.attune) w[lead.weak] += 0.4 * r.st.attune;
    const tot = w.fire + w.ice + w.earth + w.storm;
    const one = () => { let x = rnd() * tot; for (let i = 1; i <= 4; i++) { x -= w[K.EL[i]]; if (x <= 0) return i; } return 1; };
    const cells = s.c.map(() => one());
    if (shape !== 'BOMB' && rnd() < r.st.goldCell) cells[rnd.int(cells.length)] = GOLD;
    return { shape, el: cells[0], cells, curse: false };
  }
  function fillQueue(r) {
    while (r.queue.length < 6) {
      if (r.st.bomb && --r.bombIn <= 0) { r.bombIn = r.st.bomb; r.queue.push(makePiece(r, 'BOMB')); continue; }
      if (!r.bag.length) refillBag(r);
      r.queue.push(makePiece(r, r.bag.shift()));
    }
  }
  function nextPiece(r) { const p = r.queue.shift(); fillQueue(r); return p; }
  const cellsOf = (p, rot) => K.SHAPES[p.shape].rots[rot];
  function fits(r, p, x, y, rot) {
    const c = cellsOf(p, rot), g = r.grid;
    for (let i = 0; i < c.length; i++) {
      const cx = x + c[i][0], cy = y + c[i][1];
      if (cx < 0 || cx >= W || cy >= R) return false;
      if (cy >= 0 && g[cy * W + cx]) return false;
    }
    return true;
  }
  K.fits = fits;
  function spawn(r, p) {
    p = p || nextPiece(r);
    const n = K.SHAPES[p.shape].n, top = Math.min(...K.SHAPES[p.shape].rots[0].map((c) => c[1]));
    p.x = Math.floor((W - n) / 2); p.rot = 0; p.y = null;
    for (const y of [HID - top, HID - top - 1, -top]) if (fits(r, p, p.x, y, 0)) { p.y = y; break; }
    if (p.y == null) { overflow(r); p.y = HID - top; if (!fits(r, p, p.x, p.y, 0)) p.y = -top; }
    r.piece = p; r.fallT = 0; r.lockT = 0; r.lockResets = 0; r.holdUsed = false;
    r.ev.push({ type: 'spawn' });
  }
  function unstick(r) { const p = r.piece; if (!p) return; let n = 0; while (!fits(r, p, p.x, p.y, p.rot) && n++ < 6) p.y--; }

  // ---------------- grid helpers
  const clearCell = (r, i) => { r.grid[i] = 0; r.mon[i] = -1; };
  // after rows move, re-read each monster's position; a monster cut apart (by an overflow) is lifted out and dropped again
  function syncMons(r) {
    const pos = new Map();
    for (let i = 0; i < W * R; i++) { const u = r.mon[i]; if (u < 0) continue; const x = i % W, y = (i / W) | 0; const c = pos.get(u) || { n: 0, x: 99, y: 99 }; c.n++; c.x = Math.min(c.x, x); c.y = Math.min(c.y, y); pos.set(u, c); }
    for (const m of r.mons.slice()) {
      const c = pos.get(m.uid);
      if (c && c.n === m.w * m.h) { m.x = c.x; m.y = c.y; continue; }
      for (let i = 0; i < W * R; i++) if (r.mon[i] === m.uid) clearCell(r, i);
      r.mons.splice(r.mons.indexOf(m), 1); r.spawnQ.push({ d: m, t: 1.5 }); r.ev.push({ type: 'lift', m });
    }
  }
  function overflow(r) {
    const dmg = r.secondWind ? 0 : Math.round(r.hpMax * 0.3);
    if (r.secondWind) r.secondWind = 0;
    for (let i = 0; i < (R - 6) * W; i++) clearCell(r, i);
    syncMons(r);
    hurt(r, dmg, 'overflow');
    r.ev.push({ type: 'overflow', dmg });
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

  // monsters fall in from the top and land on the stack
  function dropMon(r, d) {
    const s = d.size, g = r.grid, p = r.piece, pc = new Set();
    if (p) for (const [cx, cy] of cellsOf(p, p.rot)) pc.add((p.y + cy) * W + p.x + cx);
    const free = (x, y) => { for (let yy = y; yy < y + s; yy++) for (let xx = x; xx < x + s; xx++) { if (yy >= R) return false; if (yy >= 0 && (g[yy * W + xx] || pc.has(yy * W + xx))) return false; } return true; };
    const opts = [];
    for (let x = 0; x + s <= W; x++) { let y = -s; if (!free(x, y)) continue; while (free(x, y + 1)) y++; if (y >= HID) opts.push({ x, y }); }
    if (!opts.length) { overflow(r); r.spawnQ.push({ d, t: 0.4 }); return; }
    opts.sort((a, b) => b.y - a.y || r.rnd() - 0.5);
    const at = opts[r.rnd.int(Math.min(3, opts.length))];
    const m = Object.assign({}, d, { uid: r.uid++, x: at.x, y: at.y, w: s, h: s, max: d.max || d.hp, atkT: d.atkT != null ? d.atkT : -1 - r.rnd() * 2, n: d.n || 0 });
    for (let yy = at.y; yy < at.y + s; yy++) for (let xx = at.x; xx < at.x + s; xx++) { g[yy * W + xx] = MON; r.mon[yy * W + xx] = m.uid; }
    r.mons.push(m); r.ev.push({ type: 'mon', m });
    if (m.deathless && !r.st.needle) r.ev.push({ type: 'deathlessIntro' });
  }

  // ---------------- player controls
  K.ghostY = function (r) { const p = r.piece; let y = p.y; while (fits(r, p, p.x, y + 1, p.rot)) y++; return y; };
  function touched(r) { if (r.landed && r.lockResets < 15) { r.lockT = 0; r.lockResets++; } }
  K.move = function (r, dx) {
    if (r.over || !r.piece) return false; const p = r.piece;
    if (fits(r, p, p.x + dx, p.y, p.rot)) { p.x += dx; touched(r); r.landed = !fits(r, p, p.x, p.y + 1, p.rot); return true; }
    return false;
  };
  const KICKS = [[0, 0], [-1, 0], [1, 0], [0, -1], [-2, 0], [2, 0], [-1, -1], [1, -1], [0, 1]];
  K.rotate = function (r, dir) {
    if (r.over || !r.piece) return false; const p = r.piece;
    if (K.SHAPES[p.shape].n === 1) return false;
    const nr = (p.rot + (dir || 1) + 4) % 4, n = p.cells.length;
    for (const [kx, ky] of KICKS) if (fits(r, p, p.x + kx, p.y + ky, nr)) { p.x += kx; p.y += ky; p.rot = nr; touched(r); r.landed = !fits(r, p, p.x, p.y + 1, p.rot); r.ev.push({ type: 'rotate', n }); return true; }
    return false;
  };
  K.soft = function (r) {
    if (r.over || !r.piece) return false; const p = r.piece;
    if (fits(r, p, p.x, p.y + 1, p.rot)) { p.y++; r.fallT = 0; return true; }
    return false;
  };
  K.hard = function (r) {
    if (r.over || !r.piece) return; const p = r.piece, y0 = p.y;
    p.y = K.ghostY(r); r.ev.push({ type: 'drop', rows: p.y - y0 }); lock(r);
  };
  K.hold = function (r) {
    if (r.over || !r.piece || !r.st.hold || r.holdUsed) return false;
    const cur = r.piece, nx = r.held;
    r.held = { shape: cur.shape, el: cur.el, cells: cur.cells, curse: cur.curse };
    spawn(r, nx || undefined); r.holdUsed = true; r.ev.push({ type: 'hold' });
    return true;
  };

  // ---------------- battle
  const distRect = (x, y, m) => Math.max(0, m.x - x, x - (m.x + m.w - 1)) + Math.max(0, m.y - y, y - (m.y + m.h - 1));
  K.distRect = distRect;
  // which monsters a hero at (x,y) can hit
  function reach(r, x, y, code) {
    const out = [];
    if (code === 2) { for (const m of r.mons) if (x >= m.x - 2 && x <= m.x + m.w + 1 && y >= m.y - 2 && y <= m.y + m.h + 1) out.push(m); }
    else if (code === 3) { let best = null, bd = 4; for (const m of r.mons) { const d = distRect(x, y, m); if (d < bd) { bd = d; best = m; } } if (best) out.push(best); }
    else for (const m of r.mons) if (distRect(x, y, m) === 1) out.push(m);
    return out;
  }
  K.reach = reach;
  // cells: [[x,y,code]]; mode 'land' or 'tick'
  function battle(r, cells, mode) {
    const st = r.st, hits = new Map(); let hl = 0; const shots = [];
    for (const [x, y, code] of cells) {
      if (code < 1 || code > 4) continue;
      const el = K.EL[code], a = ACT[el], ms = reach(r, x, y, code);
      if (code === 4) hl += mode === 'land' ? a.heal : ms.length ? a.theal : 0;
      for (const m of ms) {
        let d = st.atk * a[mode] * (mode === 'land' ? st.land : st.tick);
        if (el === m.weak) d *= 1.6; else if (el === m.resist) d *= 0.6;
        const h = hits.get(m) || { d: 0, el }; h.d += d; hits.set(m, h);
        r.mana[el] = Math.min(st.spellCost * 3, r.mana[el] + (mode === 'land' ? 0.7 : 0.12) * st.mana);
        if (mode === 'land' || code !== 1) shots.push({ x, y, code, uid: m.uid });
      }
    }
    if (hl) heal(r, hl * st.healMul);
    if (shots.length) r.ev.push({ type: 'shots', shots, mode });
    for (const [m, h] of hits) hit(r, m, h.d, { kind: mode, el: h.el });
  }
  function hit(r, m, dmg, info) {
    if (m.hp <= 0 || !r.mons.includes(m)) return;
    const crit = info.kind !== 'tick' && r.rnd() < r.st.crit;
    if (crit) dmg *= r.st.critMul;
    dmg = Math.max(1, Math.round(dmg));
    m.hp -= dmg; r.dmgDealt += dmg; if (dmg > r.best.hit) r.best.hit = dmg;
    if (m.deathless && !r.st.needle && m.hp < 1) { m.hp = 1; if (!r.deathlessHit) { r.deathlessHit = true; r.ev.push({ type: 'deathless' }); } }
    r.ev.push({ type: 'hit', uid: m.uid, x: m.x + m.w / 2, y: m.y + m.h / 2, dmg, crit, kind: info.kind, el: info.el, lead: m === K.lead(r) });
    if (m.hp <= 0) killMon(r, m);
  }
  function killMon(r, m) {
    const st = r.st;
    for (let i = 0; i < W * R; i++) if (r.mon[i] === m.uid) clearCell(r, i);
    r.mons.splice(r.mons.indexOf(m), 1); r.needFall = true;
    const k = Math.round(m.gold * st.gold * st.bounty);
    r.kopeks += k; r.xp += Math.round(m.xp * st.xp); r.kills++;
    let feathers = 0, relic = null;
    if (m.boss) {
      feathers = r.firstKill[m.floor] ? 2 : 4; if (m.floor > K.TOP) feathers = 2;
      if (!r.firstKill[m.floor]) { r.firstKill[m.floor] = 1; relic = m.relic; }
      r.feathers += feathers; r.bossKills.push(m.floor);
      // the boss's minions flee with it
      for (const o of r.mons.slice()) if (o.minion && o.floor === m.floor) { for (let i = 0; i < W * R; i++) if (r.mon[i] === o.uid) clearCell(r, i); r.mons.splice(r.mons.indexOf(o), 1); r.ev.push({ type: 'flee', m: o }); }
    }
    r.candle = Math.min(r.candleMax + 30, r.candle + st.killTime);
    r.ev.push({ type: 'kill', m, x: m.x + m.w / 2, y: m.y + m.h / 2, k, feathers, relic });
    if (m.boss && m.floor === K.TOP) { r.won = true; r.ev.push({ type: 'win' }); }
    if (!r.mons.length && !r.spawnQ.length) { r.floor++; r.nextFloorT = 1.0; r.ev.push({ type: 'cleared', floor: r.floor - 1 }); }
  }

  // loose cells fall into the space a slain monster leaves; monsters fall as solid blocks
  function collapse(r) {
    const g = r.grid, mo = r.mon; let moved = true, n = 0;
    while (moved && n++ < 40) {
      moved = false;
      for (let y = R - 2; y >= 0; y--) for (let x = 0; x < W; x++) { const i = y * W + x, v = g[i]; if (v && v !== MON && !g[i + W]) { g[i + W] = v; g[i] = 0; moved = true; } }
      for (const m of r.mons) {
        const by = m.y + m.h; if (by >= R) continue;
        let ok = true; for (let x = m.x; x < m.x + m.w; x++) if (g[by * W + x]) ok = false;
        if (!ok) continue;
        for (let y = by - 1; y >= m.y; y--) for (let x = m.x; x < m.x + m.w; x++) { const i = y * W + x; g[i + W] = g[i]; mo[i + W] = mo[i]; g[i] = 0; mo[i] = -1; }
        m.y++; moved = true;
      }
    }
    unstick(r);
  }
  function fullRows(r) {
    const rows = [], g = r.grid;
    for (let y = 0; y < R; y++) { let full = true; for (let x = 0; x < W; x++) { const v = g[y * W + x]; if (!v || v === MON) { full = false; break; } } if (full) rows.push(y); }
    return rows;
  }
  // settle the well: falls after kills, then any full rows, repeating while kills keep opening space
  function resolve(r) {
    let cleared = false;
    for (let guard = 0; guard < 12 && !r.over; guard++) {
      if (r.needFall) { r.needFall = false; collapse(r); }
      const rows = fullRows(r);
      if (!rows.length) break;
      clearRows(r, rows, guard > 0); cleared = true;
    }
    return cleared;
  }

  function lock(r) {
    const p = r.piece, c = cellsOf(p, p.rot), g = r.grid;
    r.piece = null; r.pieces++;
    if (p.shape === 'BOMB') {
      const bx = p.x + c[0][0], by = p.y + c[0][1]; const struck = new Set();
      for (let y = by - 1; y <= by + 1; y++) for (let x = bx - 1; x <= bx + 1; x++) if (x >= 0 && x < W && y >= 0 && y < R) { const i = y * W + x; if (g[i] === MON) { const m = r.mons.find((o) => o.uid === r.mon[i]); if (m) struck.add(m); } else clearCell(r, i); }
      r.ev.push({ type: 'bomb', x: bx, y: by });
      for (const m of struck) hit(r, m, r.st.atk * 3, { kind: 'bomb' });
      r.needFall = true;
    } else {
      const placed = [];
      for (let i = 0; i < c.length; i++) { const x = p.x + c[i][0], y = p.y + c[i][1]; if (y >= 0) { g[y * W + x] = p.cells[i]; placed.push([x, y, p.cells[i]]); } }
      r.ev.push({ type: 'lock', cells: placed });
      battle(r, placed, 'land');
    }
    if (r.over) return;
    const before = r.lines;
    resolve(r);
    if (r.lines === before) r.combo = -1;
    if (r.over) return;
    let spill = false; for (let i = 0; i < HID * W; i++) if (g[i]) { spill = true; break; }
    if (spill) overflow(r);
    if (!r.over) spawn(r);
  }

  function clearRows(r, rows, chain) {
    const g = r.grid, st = r.st;
    const count = { fire: 0, ice: 0, earth: 0, storm: 0 }; let gold = 0, cells = 0;
    for (const y of rows) for (let x = 0; x < W; x++) { const v = g[y * W + x]; cells++; if (v >= 1 && v <= 4) count[K.EL[v]]++; else if (v === GOLD) gold++; }
    const keepG = [], keepM = [];
    for (let y = 0; y < R; y++) if (!rows.includes(y)) { keepG.push(g.slice(y * W, y * W + W)); keepM.push(r.mon.slice(y * W, y * W + W)); }
    g.fill(0); r.mon.fill(-1);
    let wy = R - 1; for (let i = keepG.length - 1; i >= 0; i--, wy--) { g.set(keepG[i], wy * W); r.mon.set(keepM[i], wy * W); }
    syncMons(r);
    const L = rows.length; r.combo++; r.lines += L;
    let mult = LINE[Math.min(5, L)] * (1 + Math.max(0, r.combo) * st.combo) * st.volley;
    if (L >= 3) mult *= 1 + st.heavy;
    for (const e in count) r.mana[e] = Math.min(st.spellCost * 3, r.mana[e] + count[e] * st.mana * 0.5);
    if (gold) { const k = Math.round(gold * Math.max(1, Math.pow(1.16, r.floor - 1)) * 2 * st.gold); r.kopeks += k; r.ev.push({ type: 'gold', n: gold, k }); }
    r.kopeks += Math.round(L * Math.max(1, 0.5 * Math.pow(1.16, r.floor - 1)) * st.gold);
    heal(r, st.heal * L + count.storm * 0.005);
    if (L > r.best.lines) r.best.lines = L;
    r.ev.push({ type: 'clear', rows, lines: L, combo: r.combo, chain, count });
    // the volley: everyone in the cleared rows fires at every monster
    for (const m of r.mons.slice()) {
      let d = st.atk * mult;
      d *= 1 + (count[m.weak] / cells) * 1.2 - (count[m.resist] / cells) * 0.5;
      hit(r, m, d, { kind: 'clear' });
    }
  }

  function foeStrike(r, m) {
    const st = r.st, kind = m.atk[m.n % m.atk.length]; m.n++;
    let dmg = m.dmg * st.armor;
    if (kind === 'bite') dmg *= 1.5;
    r.ev.push({ type: 'attack', kind, m, x: m.x + m.w / 2, y: m.y + m.h / 2 });
    hurt(r, Math.round(dmg), 'attack');
    if (r.over) return;
    const g = r.grid, mm = /^(garbage|rocks)(\d)$/.exec(kind);
    if (mm && mm[1] === 'garbage') {
      const n = +mm[2]; let blocked = 0; const hole = r.rnd.int(W);
      for (let i = 0; i < n; i++) {
        if (r.rnd() < st.block) { blocked++; continue; }
        let spill = false; for (let x = 0; x < W; x++) if (g[x]) spill = true;
        g.copyWithin(0, W); r.mon.copyWithin(0, W);
        for (let x = 0; x < W; x++) { g[(R - 1) * W + x] = x === hole ? 0 : STONE; r.mon[(R - 1) * W + x] = -1; }
        syncMons(r); unstick(r);
        if (spill) { overflow(r); break; }
      }
      r.ev.push({ type: 'garbage', n: n - blocked, blocked });
    } else if (mm) {
      const n = +mm[2] * 2; const cols = [];
      for (let i = 0; i < n; i++) {
        const x = r.rnd.int(W); let y = HID;
        while (y < R && !g[y * W + x]) y++;
        y--; if (y >= HID) { g[y * W + x] = STONE; cols.push([x, y]); }
      }
      unstick(r); r.ev.push({ type: 'rocks', cells: cols });
    } else if (kind === 'bite') {
      // eats up to two heroes standing next to it
      const adj = [];
      for (let y = m.y - 1; y <= m.y + m.h; y++) for (let x = m.x - 1; x <= m.x + m.w; x++) if (x >= 0 && x < W && y >= 0 && y < R && distRect(x, y, m) === 1) { const v = g[y * W + x]; if (v >= 1 && v <= 4) adj.push([x, y]); }
      const eaten = [];
      for (let i = 0; i < 2 && adj.length; i++) { const [x, y] = adj.splice(r.rnd.int(adj.length), 1)[0]; clearCell(r, y * W + x); eaten.push([x, y]); }
      r.ev.push({ type: 'bite', cells: eaten });
    } else if (kind === 'fog') r.fx.fog = 6;
    else if (kind === 'haste') r.fx.haste = 6;
    else if (kind === 'curse') { r.queue.unshift(makePiece(r, r.rnd.pick(K.CURSES))); r.ev.push({ type: 'curse' }); }
    else if (kind === 'drain') { for (const e in r.mana) r.mana[e] = Math.floor(r.mana[e] / 2); }
  }

  K.canCast = (r, el) => !r.over && r.st.spells[el] && r.mana[el] >= r.st.spellCost;
  K.cast = function (r, el) {
    if (!K.canCast(r, el)) return false;
    const st = r.st, pow = st.spellPow; r.mana[el] -= st.spellCost;
    r.ev.push({ type: 'cast', el });
    if (el === 'fire') for (const m of r.mons.slice()) hit(r, m, st.atk * 3.5 * pow * st.firePow, { kind: 'spell', el });
    else if (el === 'ice') r.fx.frozen = st.frostTime * (0.85 + 0.15 * pow);
    else if (el === 'earth') {
      // crush all stone, and the bottom rows (monsters are too big to crush)
      const g = r.grid; let n = 0;
      for (let i = 0; i < W * R; i++) if (g[i] === STONE) { clearCell(r, i); n++; }
      for (let y = R - st.quakeRows; y < R; y++) for (let x = 0; x < W; x++) { const i = y * W + x; if (g[i] && g[i] !== MON) { clearCell(r, i); n++; } }
      r.needFall = true; r.ev.push({ type: 'quake', n });
      for (const m of r.mons.slice()) hit(r, m, st.atk * 1.5 * pow, { kind: 'spell', el });
    } else if (el === 'storm') { const m = K.lead(r); if (m) { hit(r, m, st.atk * 6 * pow, { kind: 'spell', el }); m.atkT = 0; } }
    resolve(r);
    return true;
  };

  K.step = function (r, dt) {
    if (r.over) return;
    r.t += dt; r.candle -= dt;
    if (r.candle <= 0) { r.candle = 0; end(r, 'candle'); return; }
    const fx = r.fx, st = r.st;
    for (const k of ['frozen', 'haste', 'fog']) if (fx[k] > 0) fx[k] = Math.max(0, fx[k] - dt);
    // floors and arrivals
    if (r.nextFloorT > 0) { r.nextFloorT -= dt; if (r.nextFloorT <= 0) startFloor(r); }
    for (const s of r.spawnQ) s.t -= dt;
    while (r.spawnQ.length && r.spawnQ[0].t <= 0) { dropMon(r, r.spawnQ.shift().d); if (r.over) return; }
    const boss = r.mons.find((m) => m.boss);
    if (boss && !fx.frozen) { r.minionT -= dt; if (r.minionT <= 0) { r.minionT = 14; if (r.mons.length < 3) r.spawnQ.push({ d: minion(boss.floor, 1 + r.rnd.int(3), boss, boss.max * 0.05), t: 0 }); } }
    // heroes in reach keep fighting every second (even through Frost)
    r.tickT += dt;
    if (r.tickT >= 1) {
      r.tickT -= 1;
      if (r.mons.length) {
        const cells = [];
        for (let i = HID * W; i < W * R; i++) { const v = r.grid[i]; if (v >= 1 && v <= 4) cells.push([i % W, (i / W) | 0, v]); }
        battle(r, cells, 'tick'); if (r.over) return;
        if (r.needFall) resolve(r);
      }
    }
    // monsters strike on their own timers
    if (!fx.frozen) for (const m of r.mons.slice()) {
      if (!r.mons.includes(m)) continue;
      m.atkT += dt / st.foeSlow;
      if (m.atkT >= m.every) { m.atkT = 0; foeStrike(r, m); if (r.over) return; }
    }
    // gravity
    const p = r.piece; if (!p || fx.frozen) return;
    const gi = K.gravity(r.floor) * st.fall / (fx.haste ? 2.5 : 1);
    if (fits(r, p, p.x, p.y + 1, p.rot)) {
      r.landed = false; r.fallT += dt;
      while (r.fallT >= gi && fits(r, p, p.x, p.y + 1, p.rot)) { r.fallT -= gi; p.y++; }
      if (!fits(r, p, p.x, p.y + 1, p.rot)) { r.landed = true; r.lockT = 0; }
    } else {
      r.landed = true; r.lockT += dt;
      if (r.lockT >= st.lock) lock(r);
    }
  };

  K.result = function (r) {
    return { kopeks: r.kopeks, xp: r.xp, feathers: r.feathers, reason: r.reason, floor: r.floor - 1, reached: r.floor, kills: r.kills, bossKills: r.bossKills, won: !!r.won, lines: r.lines, t: r.t, startFloor: r.startFloor, best: r.best };
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
