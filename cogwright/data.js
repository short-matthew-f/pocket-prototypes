// Cogwright content: gears, affixes, legendaries, sets, enemies, zones, the upgrade tree and the Blueprint tree.
// Pure data (plus small formatting helpers). The rules live in model.js.
(function (root) {
  'use strict';

  const SIZES = { S: { teeth: 8, mult: 0.6, name: 'Small' }, M: { teeth: 12, mult: 1, name: 'Medium' }, L: { teeth: 16, mult: 1.8, name: 'Large' } };
  const MAIN_TEETH = 12;

  // families: unit (spawns a troop each rotation), spell (pulses every N rotations), engine (speeds the gears it drives),
  // collector (scrap per rotation, in a Shift and while the app is closed)
  const GEARS = {
    grunt:     { fam: 'unit', name: 'Grunt Gear', troop: 'grunt', icon: '⚔', color: '#c9783a' },
    archer:    { fam: 'unit', name: 'Archer Gear', troop: 'archer', icon: '➶', color: '#6f9d4a' },
    brute:     { fam: 'unit', name: 'Brute Gear', troop: 'brute', icon: '⛨', color: '#a2563c' },
    tinker:    { fam: 'unit', name: 'Tinker Gear', troop: 'tinker', icon: '✚', color: '#4f8fa8' },
    haste:     { fam: 'spell', name: 'Haste Gear', every: 3, icon: '»', color: '#d9b23a', desc: (p) => `Every 3 turns: troops move and attack ${Math.round(40 * p)}% faster for 3 s` },
    overcharge:{ fam: 'spell', name: 'Overcharge Gear', every: 4, icon: 'ϟ', color: '#d8573a', desc: (p) => `Every 4 turns: troops deal ${Math.round(50 * p)}% more damage for 3 s` },
    lightning: { fam: 'spell', name: 'Lightning Gear', every: 2, icon: '⚡', color: '#8a7bf0', desc: (p, s) => `Every 2 turns: a bolt hits the front enemy for ${Math.round(18 * s)}, chaining ${3} times` },
    shield:    { fam: 'spell', name: 'Shield Gear', every: 3, icon: '◈', color: '#5fb3c9', desc: (p, s) => `Every 3 turns: every troop gains ${Math.round(12 * s)} shield` },
    engine:    { fam: 'engine', name: 'Engine Gear', icon: '⟳', color: '#8c8f99', desc: (f) => `Gears it drives spin ×${f.toFixed(2)} (boosts don't stack: a gear takes the biggest on its way to the Mainspring)` },
    mortar:    { fam: 'unit', name: 'Mortar Gear', troop: 'mortar', icon: '☄', color: '#8a6a4a' },
    mender:    { fam: 'spell', name: 'Mender Gear', every: 3, icon: '✚', color: '#d77a9a', desc: (p, s) => `Every 3 turns: every troop heals ${Math.round(15 * s)} hp` },
    magnet:    { fam: 'magnet', name: 'Magnet Gear', icon: '⊂', color: '#b04848', desc: (n) => `Each turn: pulls in the nearest ${n > 1 ? n + ' loose drops' : 'loose drop'} on the field` },
    collector: { fam: 'collector', name: 'Collector Gear', icon: '⛁', color: '#c4a64a', desc: (y) => `+${y.toFixed(1)} scrap per turn (and while you're away)` },
  };

  const TROOPS = { // lane units: the lane is 60 long (door at 0, gate at 60) and 26 wide
    grunt:  { name: 'Grunt', hp: 30, dmg: 6, every: 0.8, range: 1.3, speed: 4.2, r: 0.9 },
    archer: { name: 'Archer', hp: 16, dmg: 5, every: 1.0, range: 8, speed: 3.6, r: 0.8 },
    brute:  { name: 'Brute', hp: 85, dmg: 10, every: 1.4, range: 1.5, speed: 2.8, r: 1.25 },
    mortar: { name: 'Mortar', hp: 18, dmg: 9, every: 2.2, range: 14, speed: 2.5, r: 0.9, splash: 2.6 },
    tinker: { name: 'Tinker', hp: 20, dmg: 3, every: 1.0, range: 1.3, speed: 3.4, r: 0.85, heal: 3, repair: 1.5 },
  };

  const ENEMY_KINDS = { // archetypes; zones rename and recolour them
    basic:  { hp: 14, dmg: 4, every: 1.0, range: 1.3, speed: 3.0, r: 0.9, scrap: 1, gearOdds: 1 },
    tank:   { hp: 48, dmg: 8, every: 1.5, range: 1.5, speed: 2.0, r: 1.25, scrap: 3, gearOdds: 2 },
    ranged: { hp: 10, dmg: 4, every: 1.1, range: 7, speed: 4.2, r: 0.8, scrap: 2, gearOdds: 1.5 },
    armor:  { hp: 70, dmg: 12, every: 1.6, range: 1.5, speed: 1.7, r: 1.35, armor: 3, scrap: 5, gearOdds: 4 },
    boss:   { hp: 1400, dmg: 22, every: 1.3, range: 2.2, speed: 1.1, r: 2.6, armor: 4, scrap: 120, gearOdds: 0 },
  };

  const ZONES = [
    { id: 'foundry', name: 'The Foundry', depths: [1, 10], bg: '#3a2a22', lane: '#4a362b', accent: '#ff9a3c',
      names: { basic: 'Rustling', tank: 'Slagger', ranged: 'Sparkfly', armor: 'Smelter', boss: 'The Foreman' },
      colors: { basic: '#b5523b', tank: '#7d4a3a', ranged: '#ffb347', armor: '#5c5652', boss: '#e0622c' } },
    { id: 'mines', name: 'The Flooded Mines', depths: [11, 20], bg: '#1f2d33', lane: '#2a3d44', accent: '#5fd1c9',
      names: { basic: 'Drowner', tank: 'Silt Brute', ranged: 'Lamp Eel', armor: 'Pump Golem', boss: 'The Dredge' },
      colors: { basic: '#4f8a8b', tank: '#3d5a5c', ranged: '#bde05a', armor: '#59646b', boss: '#2fb7a7' } },
    { id: 'tower', name: 'The Clocktower', depths: [21, 30], bg: '#2a2436', lane: '#383047', accent: '#c9a8ff',
      names: { basic: 'Tick', tank: 'Pendulum Knight', ranged: 'Cuckoo', armor: 'Bell Golem', boss: 'The Horologist' },
      colors: { basic: '#9a87c8', tank: '#6b5c8c', ranged: '#f2d36b', armor: '#77708a', boss: '#d36bff' } },
    { id: 'deep', name: 'The Deep Works', depths: [31, 1e9], bg: '#141a22', lane: '#1d2631', accent: '#9fd8ff', endless: true,
      names: { basic: 'Hollow Tick', tank: 'Iron Revenant', ranged: 'Wisp Lantern', armor: 'Bulkhead', boss: 'The Engine Below' },
      colors: { basic: '#6f8aa8', tank: '#4a5a70', ranged: '#bfe6ff', armor: '#5c6878', boss: '#9fd8ff' } },
  ];
  const MAX_DEPTH = 30;

  const RARITIES = [
    { id: 'common', name: 'Common', color: '#b9b3a6', affixes: [0, 0], weight: 58, brass: 1 },
    { id: 'magic', name: 'Magic', color: '#6b9bff', affixes: [1, 2], weight: 28, brass: 3 },
    { id: 'rare', name: 'Rare', color: '#f2c14e', affixes: [3, 4], weight: 10, brass: 8 },
    { id: 'set', name: 'Set', color: '#3fcf74', affixes: [2, 2], weight: 1.6, brass: 15 },
    { id: 'legendary', name: 'Legendary', color: '#ff8a1f', affixes: [2, 3], weight: 2.4, brass: 25 },
  ];

  // v: [min, max] at item level 1; `flat` values grow with item level, percentages only a little
  const AFFIXES = {
    dmg:     { fam: ['unit'], v: [8, 20], txt: (v) => `+${v}% troop damage` },
    hp:      { fam: ['unit'], v: [10, 25], txt: (v) => `+${v}% troop health` },
    aspd:    { fam: ['unit'], v: [6, 15], txt: (v) => `+${v}% attack speed` },
    move:    { fam: ['unit'], v: [8, 20], txt: (v) => `+${v}% move speed` },
    leech:   { fam: ['unit'], v: [3, 8], txt: (v) => `${v}% life steal` },
    crit:    { fam: ['unit'], v: [4, 10], txt: (v) => `${v}% chance to crit for ×2` },
    twin:    { fam: ['unit'], v: [5, 12], txt: (v) => `${v}% chance to spawn twins` },
    thorns:  { fam: ['unit'], v: [10, 25], txt: (v) => `Reflects ${v}% of melee damage taken` },
    spshield:{ fam: ['unit'], v: [4, 10], flat: true, txt: (v) => `Troops spawn with ${v} shield` },
    cw:      { fam: ['unit'], v: [20, 40], txt: (v) => `Turning clockwise: +${v}% damage` },
    ccw:     { fam: ['unit'], v: [25, 50], txt: (v) => `Turning counter-clockwise: +${v}% health` },
    rpm:     { fam: ['unit', 'spell', 'engine', 'collector', 'magnet'], v: [6, 15], txt: (v) => `+${v}% RPM (this gear)` },
    drive:   { fam: ['unit', 'spell', 'engine', 'collector', 'magnet'], v: [5, 10], txt: (v) => `+${v}% RPM to the gears it drives` },
    bolt:    { fam: ['unit', 'spell', 'engine', 'collector', 'magnet'], v: [8, 16], flat: true, txt: (v) => `Every 8th turn: a ${v}-damage bolt` },
    scrap:   { fam: ['unit', 'spell', 'engine', 'collector', 'magnet'], v: [2, 6], flat: true, scale: 0.1, txt: (v) => `+${v.toFixed(1)} scrap per turn` },
    mf:      { fam: ['unit', 'spell', 'engine', 'collector', 'magnet'], v: [5, 12], txt: (v) => `+${v}% magic find` },
    wrench:  { fam: ['unit', 'spell', 'engine', 'collector', 'magnet'], v: [6, 14], txt: (v) => `+${v}% Wrench damage` },
    repair:  { fam: ['unit', 'spell', 'engine', 'collector', 'magnet'], v: [3, 10], flat: true, scale: 0.1, txt: (v) => `Repairs the door ${v.toFixed(1)} per turn` },
    door:    { fam: ['unit', 'spell', 'engine', 'collector', 'magnet'], v: [5, 15], flat: true, txt: (v) => `+${v} door health` },
    potency: { fam: ['spell'], v: [10, 25], txt: (v) => `+${v}% spell power` },
    quick:   { fam: ['spell'], v: [1, 1], txt: () => `Pulses one turn sooner` },
    chain:   { fam: ['spell'], only: ['lightning'], v: [1, 2], txt: (v) => `+${v} lightning chain${v > 1 ? 's' : ''}` },
    factor:  { fam: ['engine'], v: [10, 25], scale: 0.01, txt: (v) => `+${v.toFixed(2)} drive factor` },
    yield:   { fam: ['collector'], v: [15, 35], txt: (v) => `+${v}% collector yield` },
    idle:    { fam: ['collector'], v: [10, 25], txt: (v) => `+${v}% earnings while away` },
  };

  const LEGENDARIES = {
    escapement:  { name: 'The Escapement', base: 'grunt', size: 'M', power: 'The whole train ticks in bursts: spawns are held and released three turns at a time, with +25% damage' },
    ouroboros:   { name: 'Ouroboros Cog', base: 'engine', size: 'S', power: 'Never jams, and drives the gears it touches even across an odd loop' },
    grandfather: { name: 'Grandfather Wheel', base: 'brute', size: 'L', power: 'Gears it drives spin ×2' },
    heart:       { name: "Tinker's Heart", base: 'tinker', size: 'M', power: 'Your Wrench heals the troops it passes over' },
    perpetual:   { name: 'Perpetual Motion', base: 'collector', size: 'L', power: 'Earnings while you are away are doubled' },
    stormcoil:   { name: 'Stormcoil', base: 'lightning', size: 'S', power: 'Lightning keeps chaining while targets are close (up to 12 hops)' },
    siegebreaker:{ name: 'Siegebreaker', base: 'mortar', size: 'L', power: 'Mortars shell the gate from range for triple damage when no enemy is near' },
    lodestone:   { name: 'Lodestone', base: 'magnet', size: 'M', power: 'Each turn pulls in three drops instead of one' },
    heartwood:   { name: 'Heartwood Valve', base: 'mender', size: 'L', power: 'Each mending pulse also repairs 3% of the door' },
    clocksmith:  { name: "Clocksmith's Pace", base: 'haste', size: 'S', power: 'While Haste is active the whole gear train turns 25% faster' },
    piercer:     { name: 'The Long Bolt', base: 'archer', size: 'L', power: 'Archer shots pierce and also hit the next enemy behind' },
    gremlinbait: { name: 'Gremlin Bait', base: 'collector', size: 'S', power: 'A Scrap Gremlin shows up in every Shift' },
  };

  const SETS = {
    choir:   { name: 'Brass Choir', pieces: { grunt: 'Choir Tenor', archer: 'Choir Alto', haste: 'Choir Metronome' },
      bonus: ['', '', '2 meshed: +25% troop damage', '3 meshed: troops spawn with 20 shield'] },
    furnace: { name: 'Foundry Heart', pieces: { engine: 'Heart Bellows', collector: 'Heart Coffer', overcharge: 'Heart Spark' },
      bonus: ['', '', '2 meshed: +20% RPM for the whole train', '3 meshed: +50% scrap from kills'] },
    battery: { name: 'Siege Battery', pieces: { mortar: 'Battery Howitzer', archer: 'Battery Spotter', overcharge: 'Battery Powder' },
      bonus: ['', '', '2 meshed: +30% damage for archers and mortars', '3 meshed: mortar blasts 50% wider'] },
    hospital: { name: 'Field Hospital', pieces: { tinker: 'Hospital Orderly', mender: 'Hospital Tonic', shield: 'Hospital Screen' },
      bonus: ['', '', '2 meshed: troops regenerate 2% health a second', '3 meshed: the door repairs 1% a second'] },
  };

  // Upgrade tree (scrap). Positions are on a loose grid, centre = root. fx mutates the stats object, level = levels owned.
  const COST = { mult: 4, grow: 0.1 }; // global price dial for the tree (balance bots in test.js)
  const N = (id, name, icon, x, y, req, cost, grow, max, desc, fx, extra = {}) => ({ id, name, icon, x, y, req, cost: cost * COST.mult, grow: grow + COST.grow, max, desc, fx, ...extra });
  const TREE = [
    N('root', 'Workshop', '⚙', 0, 0, [], 0, 1, 1, () => 'Your workshop. Everything grows from here.', () => {}, { free: true }),
    // Wrench (up)
    N('w_dmg', 'Heavier Wrench', '🔧', 0, -1, ['root'], 12, 1.55, 8, (l) => `Wrench damage +25% per level (now +${25 * l}%)`, (s, l) => { s.wrenchDmg *= 1 + 0.25 * l; }),
    N('w_rad', 'Long Reach', '◯', -1, -2, ['w_dmg'], 30, 1.7, 5, (l) => `Wrench radius +12% per level (now +${12 * l}%)`, (s, l) => { s.wrenchRad *= 1 + 0.12 * l; }),
    N('w_pick', 'Magnet Jaw', '🧲', 1, -2, ['w_dmg'], 25, 1.65, 5, (l) => `Pickup range +25% per level (now +${25 * l}%)`, (s, l) => { s.pickRad *= 1 + 0.25 * l; }),
    N('w_crit', 'Spark Teeth', '✦', 0, -3, ['w_rad', 'w_pick'], 120, 1.9, 4, (l) => `Wrench crit chance +8% per level (now ${8 * l}%)`, (s, l) => { s.wrenchCrit += 0.08 * l; }),
    N('w_auto', 'Clockwork Sprite', '✧', -1, -4, ['w_crit'], 400, 2.1, 3, (l) => `A small spark orbits the field, hitting and collecting on its own (level ${l})`, (s, l) => { s.autoWrench = l; }),
    N('w_heal', 'Oilcan', '🛢', 1, -4, ['w_crit'], 600, 2, 3, (l) => `Your Wrench repairs troops it passes over, ${4 * l} hp/s`, (s, l) => { s.wrenchHeal += 4 * l; }),
    // Shift (right)
    N('s_time', 'Longer Shifts', '⏱', 1, 0, ['root'], 15, 1.6, 6, (l) => `Shifts last 10 s longer per level (now ${60 + 10 * l} s)`, (s, l) => { s.shiftTime += 10 * l; }),
    N('s_door', 'Oak Door', '🚪', 2, -1, ['s_time'], 20, 1.55, 8, (l) => `Door health +30% per level (now +${30 * l}%)`, (s, l) => { s.doorHp *= 1 + 0.3 * l; }),
    N('s_crank', 'Spare Key', '🗝', 2, 1, ['s_time'], 60, 2.2, 3, (l) => `+1 crank burst per Shift (now ${1 + l})`, (s, l) => { s.cranks += l; }),
    N('s_crankx', 'Tight Spring', '🌀', 3, 1, ['s_crank'], 150, 2, 3, (l) => `Crank bursts (×3 speed) last 2 s longer (now ${5 + 2 * l} s)`, (s, l) => { s.crankTime += 2 * l; }),
    N('s_vac', 'Sweeper', '🧹', 3, -1, ['s_door'], 200, 2.3, 3, (l) => `When a Shift times out, ${20 + 25 * l}% of loose scrap is swept up (20% without it)`, (s, l) => { s.sweep = 0.2 + 0.25 * l; }),
    N('s_hold', 'Brace the Door', '🛡', 4, 0, ['s_vac', 's_crankx'], 900, 2.4, 3, (l) => `Enemies at the door deal ${15 * l}% less damage`, (s, l) => { s.doorArmor = 0.15 * l; }),
    // Troops (left)
    N('t_dmg', 'Whetstones', '🗡', -1, 0, ['root'], 15, 1.6, 10, (l) => `Troop damage +15% per level (now +${15 * l}%)`, (s, l) => { s.troopDmg *= 1 + 0.15 * l; }),
    N('t_hp', 'Riveted Plate', '🛡', -2, -1, ['t_dmg'], 18, 1.6, 10, (l) => `Troop health +15% per level (now +${15 * l}%)`, (s, l) => { s.troopHp *= 1 + 0.15 * l; }),
    N('t_spd', 'Greased Boots', '👢', -2, 1, ['t_dmg'], 40, 1.8, 5, (l) => `Troop speed +8% per level (now +${8 * l}%)`, (s, l) => { s.troopSpeed *= 1 + 0.08 * l; }),
    N('t_cap', 'Barracks', '🏠', -3, 0, ['t_hp', 't_spd'], 120, 2.2, 4, (l) => `Up to ${60 + 20 * l} troops on the field at once`, (s, l) => { s.troopCap += 20 * l; }),
    N('t_gate', 'Siege Hooks', '⚓', -4, -1, ['t_cap'], 500, 2.2, 5, (l) => `Troops deal +25% damage to the gate per level (now +${25 * l}%)`, (s, l) => { s.gateDmg *= 1 + 0.25 * l; }),
    N('t_rank', 'Master Fitter', '⚒', -4, 1, ['t_cap'], 700, 2.5, 2, (l) => `Merged gears can reach rank ${5 + l}`, (s, l) => { s.maxRank += l; }),
    // Workbench (down)
    N('b_torque', 'Mainspring Torque', '⟲', 0, 1, ['root'], 20, 1.65, 10, (l) => `Mainspring RPM +10% per level (now +${10 * l}%)`, (s, l) => { s.mainRpm *= 1 + 0.1 * l; }),
    N('b_inv', 'Parts Drawers', '🗄', -1, 2, ['b_torque'], 25, 1.7, 6, (l) => `+4 inventory slots per level (now ${16 + 4 * l})`, (s, l) => { s.invSlots += 4 * l; }),
    N('b_board', 'Bigger Bench', '⬡', 1, 2, ['b_torque'], 150, 6, 2, (l) => l === 0 ? 'Board radius 2 → 3 (19 → 37 cells)' : 'Board radius 3 → 4 (37 → 61 cells)', (s, l) => { s.boardR += l; }),
    N('b_engine', 'Gearbox Tuning', '⚙', 0, 3, ['b_inv', 'b_board'], 300, 2.2, 4, (l) => `Engine gears drive +0.1× faster per level (now +${(0.1 * l).toFixed(1)})`, (s, l) => { s.engineBonus += 0.1 * l; }),
    N('b_spell', 'Alchemy Bench', '⚗', -1, 4, ['b_engine'], 450, 2.2, 5, (l) => `Spell power +15% per level (now +${15 * l}%)`, (s, l) => { s.spellPower *= 1 + 0.15 * l; }),
    N('b_vault', 'Strongbox', '🔒', 1, 4, ['b_engine'], 800, 3, 2, (l) => `+1 Vault slot (kept through an Overhaul). Now ${1 + l}`, (s, l) => { s.vault += l; }),
    // Loot (down-right)
    N('l_drop', 'Scavenger', '🎁', 2, 2, ['b_board', 's_crank'], 40, 1.7, 8, (l) => `Gear drop rate +20% per level (now +${20 * l}%)`, (s, l) => { s.dropRate *= 1 + 0.2 * l; }),
    N('l_mf', 'Keen Eye', '👁', 3, 3, ['l_drop'], 70, 1.75, 8, (l) => `Magic find +15% per level (now +${15 * l}%)`, (s, l) => { s.mf += 0.15 * l; }),
    N('l_brass', 'Smelting', '🔥', 2, 4, ['l_drop'], 60, 1.8, 5, (l) => `Salvage gives +25% brass per level (now +${25 * l}%)`, (s, l) => { s.brassMult *= 1 + 0.25 * l; }),
    N('l_filter', 'Loot Filter', '⏚', 3, 5, ['l_brass', 'l_mf'], 250, 3, 2, (l) => l === 0 ? 'Auto-salvage Common gears as they drop' : 'Also auto-salvage Magic gears', (s, l) => { s.autoSalvage = l; }),
    N('l_ilvl', 'Deep Pockets', '⤓', 4, 4, ['l_mf'], 900, 2.6, 3, (l) => `Gears drop +1 item level per level (now +${l})`, (s, l) => { s.ilvlBonus += l; }),
    // Scrap + idle (down-left)
    N('c_scrap', 'Scrap Sense', '⛭', -2, 2, ['b_inv', 't_spd'], 35, 1.7, 10, (l) => `Scrap from kills +15% per level (now +${15 * l}%)`, (s, l) => { s.scrapMult *= 1 + 0.15 * l; }),
    N('i_cap', 'Night Watchman', '🌙', -3, 3, ['c_scrap'], 80, 2.4, 3, (l) => `Offline earnings build for up to ${[2, 4, 8, 12][l]} h`, (s, l) => { s.offlineCap = [2, 4, 8, 12][l] * 3600; }),
    N('i_eff', 'Tireless Coffers', '💤', -2, 4, ['c_scrap'], 90, 1.9, 5, (l) => `Collector gears earn ${30 + 8 * l}% of their Shift rate while you're away`, (s, l) => { s.idleEff = 0.3 + 0.08 * l; }),
    N('i_night', 'Night Shift', '🌃', -3, 5, ['i_cap', 'i_eff'], 1500, 3, 3, (l) => l === 0 ? 'While you are away, the workshop runs Shifts on its own at 40% of your recent average' : `Night Shifts earn ${30 + 10 * l}% of your recent average${l < 3 ? ` (next level: ${40 + 10 * l}%)` : ''}`, (s, l) => { s.nightEff = l ? 0.3 + 0.1 * l : 0; }),
  ];

  // Blueprint tree (permanent, bought with Blueprints from Overhauls)
  const BLUEPRINTS = [
    { id: 'bp_scrap', name: 'Ledger of Scraps', icon: '📜', cost: 1, grow: 1.5, max: 15, desc: (l) => `Scrap from everything ×1.3 per level, compounding (now ×${Math.pow(1.3, l).toFixed(2)})`, fx: (s, l) => { s.scrapMult *= Math.pow(1.3, l); s.idleMult *= Math.pow(1.3, l); } },
    { id: 'bp_power', name: 'Tempered Alloys', icon: '⚒', cost: 1, grow: 1.45, max: 25, desc: (l) => `Troop damage and health ×1.35 per level, compounding (now ×${Math.pow(1.35, l).toFixed(2)})`, fx: (s, l) => { s.troopDmg *= Math.pow(1.35, l); s.troopHp *= Math.pow(1.35, l); } },
    { id: 'bp_mf', name: 'Treasure Maps', icon: '🗺', cost: 2, grow: 1.7, max: 6, desc: (l) => `+25% magic find and +15% drop rate per level`, fx: (s, l) => { s.mf += 0.25 * l; s.dropRate *= 1 + 0.15 * l; } },
    { id: 'bp_vault', name: 'Deep Vault', icon: '🔐', cost: 3, grow: 2, max: 3, desc: (l) => `+1 Vault slot per level (now +${l})`, fx: (s, l) => { s.vault += l; } },
    { id: 'bp_start', name: 'Head Start', icon: '⏩', cost: 2, grow: 1.8, max: 5, desc: (l) => `Start each Overhaul with the first ${3 * l} depths already open`, fx: (s, l) => { s.headStart = 3 * l; } },
    { id: 'bp_wrench', name: 'Master Wrench', icon: '🔧', cost: 1, grow: 1.5, max: 20, desc: (l) => `Wrench damage ×1.4 per level, compounding (now ×${Math.pow(1.4, l).toFixed(2)})`, fx: (s, l) => { s.wrenchDmg *= Math.pow(1.4, l); } },
    { id: 'bp_time', name: 'Overtime', icon: '⌛', cost: 2, grow: 2, max: 3, desc: (l) => `Shifts last 15 s longer per level`, fx: (s, l) => { s.shiftTime += 15 * l; } },
    { id: 'bp_deep', name: 'Deep Charts', icon: '🪜', cost: 3, grow: 2, max: 4, desc: (l) => `Overhauls pay 25% more Blueprints per level (now +${25 * l}%)`, fx: () => {} },
    { id: 'bp_idle', name: 'Dream Factory', icon: '🌜', cost: 2, grow: 1.8, max: 5, desc: (l) => `+40% earnings while away per level`, fx: (s, l) => { s.idleMult *= 1 + 0.4 * l; } },
  ];

  // Milestones: lifetime goals (kept through Overhauls). check(save, ctx) where ctx = {board} from solve()
  const ms = (id, name, desc, check, brass, bp = 0) => ({ id, name, desc, check, brass, bp });
  const anySet = (c, n) => Object.values(c.board.sets).some((v) => v >= n);
  const items = (s) => Object.values(s.items);
  const MILESTONES = [
    ms('clockin', 'Clocked In', 'Finish your first Shift', (s) => s.stats.shifts >= 1, 10),
    ms('gate', 'Gatecrasher', 'Break your first gate', (s) => s.stats.deepest >= 1, 15),
    ms('d5', 'Five Floors Down', 'Clear Depth 5', (s) => s.stats.deepest >= 5, 40),
    ms('d10', 'The Foreman Falls', 'Clear Depth 10', (s) => s.stats.deepest >= 10, 100, 2),
    ms('d15', 'Wet Feet', 'Clear Depth 15', (s) => s.stats.deepest >= 15, 150, 1),
    ms('d20', 'Dredged', 'Clear Depth 20', (s) => s.stats.deepest >= 20, 250, 3),
    ms('d25', 'Tick, Tock', 'Clear Depth 25', (s) => s.stats.deepest >= 25, 350, 2),
    ms('d30', 'Master of Time', 'Clear Depth 30', (s) => s.stats.deepest >= 30, 500, 5),
    ms('d40', 'Into the Deep', 'Clear Depth 40', (s) => s.stats.deepest >= 40, 800, 6),
    ms('boss3', 'Three Bells', 'Beat 3 bosses', (s) => (s.stats.bossKills || 0) >= 3, 120, 2),
    ms('k1k', 'Scrap Heap', 'Destroy 1,000 enemies', (s) => s.stats.kills >= 1000, 30),
    ms('k10k', 'Scrap Mountain', 'Destroy 10,000 enemies', (s) => s.stats.kills >= 10000, 120),
    ms('k100k', 'Scrap Continent', 'Destroy 100,000 enemies', (s) => s.stats.kills >= 100000, 400, 3),
    ms('leg1', 'Legend in Brass', 'Find a legendary gear', (s) => (s.stats.legendaries || 0) >= 1, 25),
    ms('leg5', "Collector's Cabinet", 'Find 5 different legendaries', (s) => Object.keys(LEGENDARIES).filter((k) => (s.codex || {})[k]).length >= 5, 150, 2),
    ms('legall', 'The Complete Works', 'Find every legendary', (s) => Object.keys(LEGENDARIES).every((k) => (s.codex || {})[k]), 500, 5),
    ms('set2', 'In Concert', 'Mesh two pieces of a set', (s, c) => anySet(c, 2), 40),
    ms('set3', 'Full Ensemble', 'Mesh a whole set', (s, c) => anySet(c, 3), 120, 1),
    ms('rank3', 'Fine Fitting', 'Merge a gear up to rank 3', (s) => items(s).some((it) => it.rank >= 3), 30),
    ms('rank5', 'Masterwork', 'Merge a gear up to rank 5', (s) => items(s).some((it) => it.rank >= 5), 150, 1),
    ms('elite10', 'Champion Hunter', 'Defeat 10 elites', (s) => (s.stats.elites || 0) >= 10, 60),
    ms('elite100', 'Champion Slayer', 'Defeat 100 elites', (s) => (s.stats.elites || 0) >= 100, 250, 2),
    ms('gremlin', 'Gotcha!', 'Catch a Scrap Gremlin', (s) => (s.stats.gremlins || 0) >= 1, 40),
    ms('gremlin10', 'Gremlin Wrangler', 'Catch 10 Scrap Gremlins', (s) => (s.stats.gremlins || 0) >= 10, 200, 2),
    ms('jam', 'Jammed Up', 'Jam a gear (three in a triangle)', (s, c) => c.board.jammed.length > 0, 5),
    ms('big', 'Clockwork Cathedral', 'Have 30 gears turning at once', (s, c) => c.board.spinning.length >= 30, 200, 2),
    ms('stone', 'Jeweller', 'Socket a Cogstone', (s) => items(s).some((it) => (it.sockets || []).some(Boolean)), 30),
    ms('perfect', 'Flawless', 'Make a Perfect Cogstone', (s) => Object.values(s.pouch || {}).some((t) => (t[4] || 0) > 0) || items(s).some((it) => (it.sockets || []).some((x) => x && x[1] >= 4)), 300, 3),
    ms('overhaul', 'Back to the Studs', 'Overhaul the workshop', (s) => s.overhauls >= 1, 0, 2),
    ms('night', 'Night Owl', 'Build the Night Shift', (s) => (s.tree.i_night || 0) >= 1, 80),
  ];

  // Cogstones: socketed into rare, set and legendary gears; three of a tier combine into the next
  const STONE_TIERS = ['Chipped', 'Flawed', 'Cut', 'Polished', 'Perfect'];
  const STONES = {
    ruby:     { name: 'Ruby', color: '#e2453c', v: [4, 8, 14, 22, 35], txt: (v) => `+${v}% damage (troops) or spell power (spells)` },
    sapphire: { name: 'Sapphire', color: '#3f7fe0', v: [5, 10, 17, 26, 40], txt: (v) => `+${v}% troop health` },
    emerald:  { name: 'Emerald', color: '#3fcf74', v: [3, 6, 10, 15, 22], txt: (v) => `+${v}% RPM (this gear)` },
    topaz:    { name: 'Topaz', color: '#f2c14e', v: [0.3, 0.6, 1.1, 1.8, 3], txt: (v) => `+${v} scrap per turn` },
    amethyst: { name: 'Amethyst', color: '#a46bff', v: [5, 10, 16, 24, 35], txt: (v) => `+${v}% magic find` },
  };

  const data = { STONES, STONE_TIERS, MILESTONES, SIZES, MAIN_TEETH, GEARS, TROOPS, ENEMY_KINDS, ZONES, MAX_DEPTH, RARITIES, AFFIXES, LEGENDARIES, SETS, TREE, BLUEPRINTS };
  if (typeof module !== 'undefined') module.exports = data; else root.CogData = data;
})(typeof window !== 'undefined' ? window : globalThis);
