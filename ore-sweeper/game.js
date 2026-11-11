// Ore Sweeper: drag the drill across the rock face; ore under it cracks and pays out until the lamp oil runs out.
// Reference game for the kit (see ../README.md). Nodebuster loop in mining clothes.
// The rock face gets deeper as you crack ore: deeper strata bring richer ore (silver, gold, crystal, mithril) and
// hazards (hard rock, gas pockets, cave-ins). The win node sends the next dig to the Heart of the Mountain.
(function () {
  'use strict';
  let K = null; // the kit handle (null in the headless sim), used to show live numbers in node descriptions
  const pct = (x) => Math.round(x * 100) + '%';
  // d(s, lv): one short sentence for the NEXT level, given the current stats s and current level lv
  const NODES = [
    { id: 'drill', name: 'Wider Bit', icon: '⛏️', cost: 4, grow: 1.55, max: 8, req: [], x: 0, y: 0, d: (s) => `+5 drill size (now ${s.radius}px)`, fx: (s, l) => { s.radius += 5 * l; } },
    // right arm: damage and value
    { id: 'steel', name: 'Tempered Steel', icon: '🔩', cost: 6, grow: 1.72, max: 10, req: ['drill'], x: 1, y: 0, d: (s) => `+35% drill damage (now ${s.dps.toFixed(1)}/s)`, fx: (s, l) => { s.dps *= 1.35 ** l; } },
    { id: 'assay', name: 'Assayer', icon: '⚖️', cost: 15, grow: 1.88, max: 10, req: ['steel'], x: 2, y: 0, d: (s) => `+40% ore per node (now x${s.value.toFixed(1)})`, fx: (s, l) => { s.value *= 1 + 0.4 * l; } },
    { id: 'lucky', name: 'Lucky Strike', icon: '🍀', cost: 45, grow: 1.9, max: 8, req: ['assay'], x: 3, y: 0, d: (s) => `+6% chance of a x3 hit (now ${pct(s.crit)})`, fx: (s, l) => { s.crit += 0.06 * l; } },
    { id: 'blast', name: 'Blasting Caps', icon: '🧨', cost: 70, grow: 2, max: 6, req: ['lucky'], x: 4, y: 0, d: (s) => `Cracked ore hits its neighbours (now ${pct(s.splash)})`, fx: (s, l) => { s.splash += 0.3 * l; } },
    { id: 'chain', name: 'Chain Charges', icon: '💥', cost: 4, grow: 1.9, max: 4, req: ['blast'], x: 5, y: 0, cur: 'gems', d: (s) => `+22px blast reach (now ${s.splashR}px)`, fx: (s, l) => { s.splashR += 22 * l; } },
    { id: 'diamond', name: 'Diamond Tips', icon: '💠', cost: 3, grow: 1.9, max: 4, req: ['steel'], x: 1, y: 1, cur: 'gems', d: () => '+30% drill damage', fx: (s, l) => { s.dps *= 1.3 ** l; } },
    { id: 'geode', name: 'Geode Sense', icon: '💎', cost: 40, grow: 2.2, max: 5, req: ['assay'], x: 2, y: 1, d: (s) => `More geodes, which drop gems (now ${pct(s.gem)})`, fx: (s, l) => { s.gem += 0.035 * l; } },
    { id: 'auger', name: 'Mithril Auger', icon: '🌀', cost: 5, grow: 2, max: 4, req: ['geode'], x: 2, y: 2, cur: 'gems', d: () => '+6 drill size and +25% damage', fx: (s, l) => { s.radius += 6 * l; s.dps *= 1.25 ** l; } },
    { id: 'canary', name: 'Canary', icon: '🐤', cost: 3, grow: 1.8, max: 5, req: ['geode'], x: 1, y: 2, cur: 'gems', d: () => 'Lamp oil burns 10% slower', fx: (s, l) => { s.drain *= 0.9 ** l; } },
    // build direction A: demolition (an active dynamite button). Either/or with the Lodestone (group 'tool').
    { id: 'dyna', name: 'Dynamite', icon: '💣', excl: 'tool', cost: 60, grow: 2, max: 3, req: ['lucky'], x: 3, y: 1, d: (s, lv) => lv ? `+1 stick per dig (now ${s.dyna})` : 'Demolition: a Throw button blasts everything around the drill. Sticks per dig: 1', fx: (s, l) => { s.dyna += l; } },
    { id: 'sticks', name: 'Bigger Bundles', icon: '🎇', cost: 140, grow: 2.1, max: 4, req: ['dyna'], x: 4, y: 1, d: (s) => `+25% dynamite blast size (now ${Math.round(s.dynaR)}px)`, fx: (s, l) => { s.dynaR *= 1.25 ** l; } },
    { id: 'firedamp', name: 'Firedamp', icon: '☁️', cost: 120, grow: 2.2, max: 3, req: ['dyna'], x: 3, y: 2, d: () => 'Gas costs less oil and blasts wider', fx: (s, l) => { s.gasCost *= 0.6 ** l; s.gasR *= 1.2 ** l; } },
    { id: 'nitro', name: 'Nitro', icon: '⚗️', cost: 5, grow: 2, max: 4, req: ['sticks'], x: 4, y: 2, cur: 'gems', d: () => 'Dynamite hits 60% harder', fx: (s, l) => { s.dynaDmg *= 1.6 ** l; } },
    // upper right: the rock face and the deep strata
    { id: 'seams', name: 'Rich Seams', icon: '🪨', cost: 14, grow: 1.8, max: 8, req: ['steel'], x: 1, y: -1, d: (s) => `Ore appears 14% faster (every ${s.spawn.toFixed(2)}s)`, fx: (s, l) => { s.spawn *= 0.86 ** l; } },
    { id: 'face', name: 'Wider Face', icon: '🧱', cost: 30, grow: 1.8, max: 6, req: ['seams'], x: 1, y: -2, d: (s) => `+4 ore nodes at once (now ${s.maxNodes})`, fx: (s, l) => { s.maxNodes += 4 * l; } },
    { id: 'iron', name: 'Iron Veins', icon: '⚙️', cost: 110, grow: 2.1, max: 5, req: ['face'], x: 1, y: -3, d: (s) => `Iron: 5x tougher, 8x ore (now ${pct(s.big)} of ore)`, fx: (s, l) => { s.big += 0.08 * l; } },
    { id: 'cluster', name: 'Crystal Clusters', icon: '🔮', cost: 260, grow: 2.2, max: 5, req: ['iron'], x: 2, y: -3, d: (s) => `Clusters shatter into shards (now ${pct(s.cluster)})`, fx: (s, l) => { s.cluster += 0.06 * l; } },
    { id: 'survey', name: 'Deep Survey', icon: '🗺️', cost: 50, grow: 2, max: 4, req: ['seams'], x: 2, y: -1, d: (s) => `Start each dig 12 m deeper (now ${s.depth0} m)`, fx: (s, l) => { s.depth0 += 12 * l; } },
    { id: 'smith', name: 'Silversmith', icon: '🥈', cost: 90, grow: 2.0, max: 6, req: ['survey'], x: 3, y: -1, d: () => '+35% value from silver, gold and mithril', fx: (s, l) => { s.smith *= 1 + 0.35 * l; } },
    // either/or (group 'deep'): hunt the glinting ore, or plunge to the rich strata faster
    { id: 'prospect', name: 'Prospector', icon: '🔍', excl: 'deep', cost: 160, grow: 2.1, max: 3, req: ['smith'], x: 4, y: -1, d: (s) => `Glinting ore is more common and pays more (now ${pct(s.glint)}, x${s.glintPay})`, fx: (s, l) => { s.glint += 0.035 * l; s.glintPay += 2 * l; } },
    { id: 'plunge', name: 'Plunge Shaft', icon: '🕳️', excl: 'deep', cost: 160, grow: 2.1, max: 3, req: ['smith'], x: 3, y: -2, d: (s) => `Every crack takes you 30% deeper (now x${s.depthMul.toFixed(1)}), richer strata sooner`, fx: (s, l) => { s.depthMul += 0.3 * l; } },
    { id: 'breaker', name: 'Rock Breaker', icon: '🔨', cost: 150, grow: 2.3, max: 2, req: ['survey'], x: 2, y: -2, d: (s) => `Hard rock needs 1 fewer pass (now ${s.passes})`, fx: (s, l) => { s.passes -= l; } },
    { id: 'geologist', name: 'Geologist', icon: '🧭', cost: 4, grow: 2, max: 4, req: ['breaker'], x: 3, y: -3, cur: 'gems', d: () => 'Motherlode geodes appear twice as often', fx: (s, l) => { s.mother *= 2 ** l; } },
    // left arm: oil, carts and the magnet
    { id: 'oil', name: 'Bigger Lamp', icon: '🪔', cost: 7, grow: 1.7, max: 8, req: ['drill'], x: -1, y: 0, d: (s) => `+2s lamp oil (now ${s.oil}s)`, fx: (s, l) => { s.oil += 2 * l; } },
    { id: 'wick', name: 'Long Wick', icon: '🕯️', cost: 35, grow: 1.9, max: 5, req: ['oil'], x: -1, y: -1, d: () => 'Each crack refills a little more oil', fx: (s, l) => { s.onPop += 0.12 * l; } },
    { id: 'whistle', name: 'Foreman\'s Whistle', icon: '📯', cost: 60, grow: 1.9, max: 5, req: ['wick'], x: -1, y: -2, d: () => 'Streaks last longer and pay 40% more', fx: (s, l) => { s.streakWin += 0.2 * l; s.streakPay *= 1 + 0.4 * l; } },
    { id: 'carts', name: 'Mine Carts', icon: '🛒', cost: 80, grow: 2.05, max: 6, req: ['wick'], x: -2, y: -1, d: (s) => `+1 cart that drills ore on its own (now ${s.helpers})`, fx: (s, l) => { s.helpers += l; } },
    { id: 'rails', name: 'Better Rails', icon: '🛤️', cost: 120, grow: 2.05, max: 6, req: ['carts'], x: -3, y: -1, d: () => 'Carts hit 50% harder', fx: (s, l) => { s.helperDps *= 1.5 ** l; } },
    { id: 'crew', name: 'Night Shift', icon: '👷', cost: 4, grow: 1.9, max: 4, req: ['rails'], x: -4, y: -1, cur: 'gems', d: (s) => `+2 carts (now ${s.helpers})`, fx: (s, l) => { s.helpers += 2 * l; } },
    // build direction B: the lodestone (hold still, the ore comes to you)
    { id: 'lode', name: 'Lodestone Bit', icon: '🧲', excl: 'tool', cost: 55, grow: 2, max: 4, req: ['oil'], x: -2, y: 0, d: (s, lv) => lv ? `Stronger pull (now ${Math.round(s.mag)}px/s)` : 'Magnet: hold the drill still and nearby ore drifts into it', fx: (s, l) => { s.mag += 45 * l; s.magR += 20 * l; } },
    { id: 'anchor', name: 'Steady Hands', icon: '⚓', cost: 110, grow: 2.1, max: 4, req: ['lode'], x: -3, y: 0, d: (s) => `Hold still to build up to +${pct(s.steady + 0.5)} damage`, fx: (s, l) => { s.steady += 0.5 * l; } },
    { id: 'polarity', name: 'Polarity', icon: '🌐', cost: 220, grow: 2.2, max: 3, req: ['anchor'], x: -4, y: 0, d: (s) => `+40px magnet reach (now ${Math.round(s.magR)}px)`, fx: (s, l) => { s.magR += 40 * l; s.mag *= 1.25 ** l; } },
    { id: 'flux', name: 'Flux Field', icon: '✨', cost: 4, grow: 2, max: 3, req: ['anchor'], x: -3, y: 1, cur: 'gems', d: () => 'Magnet pulls oil flasks; pulled ore +25%', fx: (s, l) => { s.flux += 0.25 * l; } },
    // lower left: survival
    { id: 'flask', name: 'Oil Flasks', icon: '🧴', cost: 30, grow: 1.9, max: 5, req: ['oil'], x: -1, y: 1, d: (s) => `Oil flasks turn up more often (every ${s.flaskEvery.toFixed(1)}s)`, fx: (s, l) => { s.flaskEvery *= 0.84 ** l; s.flaskOil += 0.2 * l; } },
    { id: 'hardhat', name: 'Hard Hat', icon: '⛑️', cost: 100, grow: 2, max: 3, req: ['flask'], x: -2, y: 1, d: () => 'Cave-ins cost 35% less oil', fx: (s, l) => { s.caveCost *= 0.65 ** l; } },
    { id: 'brass', name: 'Brass Lantern', icon: '🏮', cost: 4, grow: 2, max: 3, req: ['flask'], x: -1, y: 2, cur: 'gems', d: (s) => `+3s lamp oil (now ${s.oil}s)`, fx: (s, l) => { s.oil += 3 * l; } },
    // either/or (group 'lamp'): a steady long dig, or a frantic finale when the oil runs dry
    { id: 'pump', name: 'Oil Pump', icon: '🛢️', excl: 'lamp', cost: 90, grow: 2, max: 3, req: ['flask'], x: -2, y: 2, d: (s) => `Flasks +0.6s and the lamp holds +3s extra (flasks give ${s.flaskOil.toFixed(1)}s)`, fx: (s, l) => { s.flaskOil += 0.6 * l; s.overfill += 3 * l; s.flaskEvery *= 0.9 ** l; } },
    { id: 'lastlight', name: 'Last Light', icon: '🌟', excl: 'lamp', cost: 90, grow: 2, max: 3, req: ['flask'], x: 0, y: 2, d: (s, lv) => `When the oil runs out: ${3.5 + lv}s of Last Light where ore pays x3`, fx: (s, l) => { s.lastLight = 2.5 + 1 * l; } },
    // character nodes (one above and one below the root)
    { id: 'dwarfsp', who: 'dwarf', name: 'Stubborn', icon: '🧔', cost: 40, grow: 1.9, max: 5, req: ['steel'], x: 0, y: -1, d: () => '+20% damage per extra node under the drill', fx: (s, l) => { s.crowd += 0.2 * l; } },
    { id: 'dwarfale', who: 'dwarf', name: 'Ale Break', icon: '🍺', cost: 60, grow: 2, max: 4, req: ['drill'], x: 0, y: 1, d: (s) => `Once a dig, low oil refills +${(s.ale + 1.5).toFixed(1)}s`, fx: (s, l) => { s.ale += 1.5 * l; } },
    { id: 'gnomesp', who: 'gnome', name: 'Clockwork', icon: '🔧', cost: 40, grow: 1.9, max: 5, req: ['oil'], x: 0, y: -1, d: () => '+1 cart now; carts 15% faster per level', fx: (s, l) => { s.helpers += 1; s.cartSpeed *= 1.15 ** l; } },
    { id: 'gnomehop', who: 'gnome', name: 'Ore Hopper', icon: '🪣', cost: 60, grow: 2, max: 4, req: ['drill'], x: 0, y: 1, d: () => 'Ore cracked by carts is worth +30%', fx: (s, l) => { s.hopper += 0.3 * l; } },
    { id: 'molesp', who: 'mole', name: 'Deep Rumble', icon: '🌋', cost: 40, grow: 1.9, max: 5, req: ['drill'], x: 0, y: -1, d: () => 'Tremors hit 40% harder and come sooner', fx: (s, l) => { s.quake *= 1.4 ** l; s.quakeEvery *= 0.9 ** l; } },
    { id: 'moleshock', who: 'mole', name: 'Aftershock', icon: '〰️', cost: 60, grow: 2, max: 4, req: ['drill'], x: 0, y: 1, d: () => 'Each tremor refills +0.4s lamp oil', fx: (s, l) => { s.shockOil += 0.4 * l; } },
    { id: 'salasp', who: 'sala', name: 'Wildfire', icon: '🔥', cost: 40, grow: 1.9, max: 5, req: ['drill'], x: 0, y: -1, d: () => 'Embers burn 30% hotter and last longer', fx: (s, l) => { s.ember *= 1.3 ** l; s.emberLife += 0.2 * l; } },
    { id: 'salaash', who: 'sala', name: 'Firewalker', icon: '🦎', cost: 60, grow: 2, max: 3, req: ['drill'], x: 0, y: 1, d: () => 'Gas you ignite refills oil instead', fx: (s, l) => { s.gasFeed += 0.8 * l; } },
    // capstone
    { id: 'heart', name: 'Heart Map', icon: '❤️‍🔥', cost: 30000, grow: 1, max: 1, req: ['cluster', 'geologist'], reqAll: 2, extra: { gems: 40 }, x: 2, y: -4, win: true, d: () => 'Your next dig reaches the Heart. Crack it to win.' },
  ];
  for (const n of NODES) {
    const d = n.d;
    Object.defineProperty(n, 'desc', { enumerable: true, get() {
      try {
        if (K) { const C = K.charSave(K.S.cur); return d(K.statsFor(K.S.cur, C.levels), C.levels[n.id] || 0); }
        return d(baseStats('dwarf'), 0);
      } catch { return n.name; }
    } });
  }

  // ---------------------------------------------------------------- the rock
  //          hp mult, value mult, radius, metres of depth per crack
  const KINDS = {
    copper: { hp: 1, val: 1, r: 20, dep: 0.5, col: ['#7a3e12', '#e09f3e', '#ffd8a8'] },
    silver: { hp: 2, val: 2.2, r: 21, dep: 0.7, col: ['#4a5568', '#cbd5e1', '#ffffff'], metal: 1 },
    gold: { hp: 3.2, val: 4, r: 22, dep: 1, col: ['#7c4a03', '#ffc300', '#fff6c2'], metal: 1 },
    mithril: { hp: 5, val: 7, r: 23, dep: 1.2, col: ['#0b4f5c', '#56cfe1', '#e0fbfc'], metal: 1 },
    iron: { hp: 5, val: 8, r: 30, dep: 1.2, col: ['#3d4349', '#9aa4ad', '#eef1f4'] },
    rubble: { hp: 0.5, val: 1.5, r: 14, dep: 0.2, col: ['#5c4330', '#a98467', '#e6ccb2'] },
    crystal: { hp: 4, val: 4, r: 22, dep: 1, col: ['#3c096c', '#b46cff', '#f3d9ff'], gem: 1, prism: 1 },
    geode: { hp: 2, val: 3, r: 22, dep: 0.6, col: ['#4a1580', '#c77dff', '#ffffff'], gem: 1, prism: 1 },
    cluster: { hp: 3, val: 4, r: 24, dep: 0.8, col: ['#1d4ed8', '#7cc6f0', '#e0f2fe'], prism: 1 },
    shard: { hp: 0.5, val: 1, r: 12, dep: 0.15, col: ['#1d4ed8', '#7cc6f0', '#e0f2fe'], prism: 1 },
    mother: { hp: 9, val: 30, r: 34, dep: 3, col: ['#5a189a', '#e0aaff', '#ffffff'], gem: 4 },
    granite: { hp: 1, val: 5, r: 27, dep: 1, col: ['#2b3035', '#6c757d', '#c4ccd4'] },
    gas: { hp: 1, val: 0, r: 24, dep: 0, col: ['#2d6a4f', '#95d5b2', '#d8f3dc'] },
    vein: { hp: 1, val: 2, r: 19, dep: 0, col: ['#7f1d1d', '#ff6b6b', '#ffd6d6'], prism: 1 },
    sentinel: { hp: 1, val: 3, r: 21, dep: 0, col: ['#1c1917', '#f97316', '#fde68a'] },
    vault: { hp: 30, val: 40, r: 36, dep: 3, col: ['#1f2937', '#56cfe1', '#e0fbfc'], gem: 5 },
  };
  const GLINTABLE = { copper: 1, silver: 1, gold: 1, mithril: 1, crystal: 1 };
  // the Miner's cache: one pick per new stratum, good for the rest of this dig. ok() filters what makes sense right now.
  const BOONS = [
    { icon: '☕', name: 'Strong Coffee', desc: '+4s lamp oil right now', fx: (s, R) => { R.oil += 4; } },
    { icon: '🤑', name: 'Greedy Seam', desc: 'Ore pays +60%, but the lamp burns 25% faster', fx: (s, R) => { s.value *= 1.6; for (const n of R.nodes) n.val *= 1.6; R.boonDrain = (R.boonDrain || 1) * 1.25; } },
    { icon: '🗡️', name: 'Sharp Bit', desc: '+40% drill damage', fx: (s) => { s.dps *= 1.4; } },
    { icon: '⭕', name: 'Wide Bit', desc: '+10 drill size', fx: (s) => { s.radius += 10; } },
    { icon: '🍀', name: 'Lucky Charm', desc: '+15% chance of a x3 hit', fx: (s) => { s.crit += 0.15; } },
    { icon: '🕯️', name: 'Trimmed Wick', desc: 'The lamp burns 20% slower', fx: (s, R) => { R.boonDrain = (R.boonDrain || 1) * 0.8; } },
    { icon: '💎', name: 'Geode Map', desc: 'Many more geodes (gems)', fx: (s) => { s.gem += 0.1; } },
    { icon: '✨', name: 'Glint Eye', desc: 'Glinting ore 3x as common', fx: (s) => { s.glint *= 3; } },
    { icon: '😷', name: 'Gas Mask', desc: 'Gas costs no oil and blasts wider', ok: (s, R) => R.stratum >= 2, fx: (s) => { s.gasCost = 0; s.gasR *= 1.3; } },
    { icon: '🧨', name: 'Spare Sticks', desc: '+2 dynamite', ok: (s) => s.dyna > 0, fx: (s, R) => { R.sticks += 2; } },
    { icon: '🛒', name: 'Oiled Axles', desc: 'Carts 40% faster', ok: (s) => s.helpers > 0, fx: (s) => { s.cartSpeed *= 1.4; } },
  ];
  // strata: what the face is made of at each depth, and the hazards that phase in
  const STRATA = [
    { at: 0, name: 'Topsoil Seam', top: '#3a2a1c', bot: '#140e09', band: 'rgba(255,214,160,.06)', ores: { copper: 1 } },
    { at: 12, name: 'Silver Vein', top: '#2c2c34', bot: '#0f0f14', band: 'rgba(210,220,255,.07)', ores: { copper: 0.5, silver: 0.5 }, granite: 0.1 },
    { at: 45, name: 'Gold Reef', top: '#3a2a10', bot: '#120c03', band: 'rgba(255,205,90,.08)', ores: { copper: 0.2, silver: 0.4, gold: 0.4 }, granite: 0.12, gas: 0.06 },
    { at: 90, name: 'Crystal Caverns', top: '#241638', bot: '#0b0612', band: 'rgba(200,150,255,.08)', ores: { silver: 0.3, gold: 0.5, crystal: 0.2 }, granite: 0.13, gas: 0.07, cave: 1 },
    { at: 150, name: 'The Deep', top: '#0f2a2e', bot: '#030b0c', band: 'rgba(110,230,240,.07)', ores: { gold: 0.45, crystal: 0.2, mithril: 0.35 }, granite: 0.15, gas: 0.08, cave: 1 },
  ];
  const stratumOf = (d) => { let i = 0; while (i + 1 < STRATA.length && d >= STRATA[i + 1].at) i++; return i; };
  const HEART_HP = 80000;
  const HUD = 104; // the HUD band at the top; ore never spawns under it

  function createRun(env) {
    const s = env.stats, W = env.W, H = env.H, fx = env.fx, sfx = env.sfx, rnd = Math.random;
    const top = HUD + (env.boss ? 24 : 8), bottom = H - 92;
    let CAP = s.oil + 6 + s.overfill; // the lamp can hold a little more than it starts with
    const R = { t: 0, over: false, ending: 0, cause: '', oil: s.oil, nodes: [], ore: 0, gems: 0, cracked: 0, spawnT: 0, quakeT: s.quakeEvery, won: false,
      depth: s.depth0, shown: s.depth0, stratum: stratumOf(s.depth0), streak: 0, bestStreak: 0, lastCrack: -9, stop: 0, ready: 1, banner: null, toast: null, hints: {},
      flasks: [], flaskT: 4, caves: [], caveT: 6, bombs: [], sticks: s.dyna, embers: [], emberT: 0, focus: 0, px: W / 2, py: H / 2, speed: 0, aleUsed: false, dmgDealt: 0,
      gasHits: 0, caveHits: 0, flaskGot: 0, mothers: 0, in: { x: W / 2, y: H * 0.6, down: false },
      lit: false, last: 0, lastUsed: false, rush: 0, rushT: 10 + rnd() * 25, hurtT: -9, tick: 0, beat: 0, boons: [], glints: 0, vault: null, picking: false, wave: null, waveT: 3,
      carts: Array.from({ length: s.helpers }, (_, i) => ({ x: s.dyna > 0 ? 200 + (W - 230) * ((i * 0.37) % 1) : W * (0.15 + 0.7 * ((i * 0.37) % 1)), y: H - 40, target: null, spin: 0 })),
      specks: Array.from({ length: 70 }, () => ({ x: rnd() * W, y: rnd() * H * 2, r: 0.6 + rnd() * 2.2, a: 0.05 + rnd() * 0.12 })),
      motes: Array.from({ length: 18 }, () => ({ x: rnd() * W, y: rnd() * H, v: 6 + rnd() * 14, p: rnd() * 6 })) };
    if (env.boss) {
      R.heart = { x: W / 2, y: H * 0.43, bx: W / 2, by: H * 0.43, r: Math.min(W, H) * 0.16, hp: HEART_HP, max: HEART_HP, hitT: -1, phase: 1, exposed: 0, regrow: 0, sentT: 2 };
      growVeins();
      R.banner = { big: 'HEART OF THE MOUNTAIN', sub: 'Break its crystal veins, then crack the Heart', t: 0, life: 2.6, col: '#ff6b6b' };
      [110, 131, 165, 220].forEach((f, i) => sfx.tone(f, 0.35, 'sawtooth', 0.05, 1, i * 0.16));
      sfx.tone(55, 1.2, 'sine', 0.16, 1, 0.66); sfx.tone(82, 1, 'triangle', 0.06, 0.8, 0.7);
    } else if (s.depth0 > 0) R.banner = { big: STRATA[R.stratum].name, sub: `Survey starts you at ${s.depth0} m`, t: 0, life: 1.8, col: '#ffe8b0' };
    const hintsOn = (env.best || 0) < 120;
    for (let i = 0; i < Math.min(5, s.maxNodes); i++) spawn();

    function clear(x, y) { return !(R.heart && Math.hypot(x - R.heart.x, y - R.heart.y) < R.heart.r * 1.8) && !(s.dyna > 0 && x < 220 && y > H - 165); }
    function hint(key, text) { if (!hintsOn || R.hints[key]) return; R.hints[key] = 1; R.toast = { text, t: 0, life: 2.6 }; }
    function pickKind() {
      const st = STRATA[R.stratum];
      if (R.depth >= 12 && rnd() < s.mother * (1 + R.depth / 120)) return 'mother';
      if (st.gas && rnd() < st.gas && R.nodes.filter((n) => n.kind === 'gas').length < 2) return 'gas';
      if (st.granite && rnd() < st.granite) return 'granite';
      if (rnd() < s.cluster) return 'cluster';
      if (rnd() < s.big) return 'iron';
      if (rnd() < s.gem) return 'geode';
      let q = rnd(); for (const [k, w] of Object.entries(st.ores)) { if ((q -= w) <= 0) return k; } return 'copper';
    }
    function spawn(x, y, kind) {
      kind = kind || pickKind();
      if (x == null) for (let i = 0; i < 10; i++) { x = 34 + rnd() * (W - 68); y = top + 24 + rnd() * (bottom - top - 24); if (clear(x, y)) break; }
      const k = KINDS[kind], depthHp = 1 + R.depth / 200;
      const n = { kind, x: x ?? 34 + rnd() * (W - 68), y: y ?? top + 24 + rnd() * (bottom - top - 24), r: k.r, hp: s.hp * k.hp * depthHp, max: 0, val: s.value * k.val * (k.metal ? s.smith : 1),
        born: R.t, hitT: -1, rot: rnd() * 6, seed: rnd() * 100, shape: Array.from({ length: 8 }, () => 0.78 + rnd() * 0.24) };
      if (kind === 'granite') { n.layers = n.maxLayers = Math.max(1, s.passes); n.inside = false; }
      if (GLINTABLE[kind] && !R.heart && rnd() < s.glint) { n.glint = true; n.hp *= 1.5; n.val *= s.glintPay; hint('glint', 'Glinting ore! Worth a lot more'); }
      if (kind === 'gas') { n.fuse = -1; n.life = 7; }
      if (kind === 'mother') { hint('mother', 'A motherlode! Drill it for gems'); sfx.tone(1568, 0.3, 'sine', 0.05); }
      if (kind === 'granite') hint('granite', 'Hard rock: swipe across it again and again');
      if (kind === 'gas') hint('gas', 'Green gas: steer clear unless you want a blast');
      n.max = n.hp; R.nodes.push(n); return n;
    }
    function cache() {
      if (!env.pick || R.heart) return;
      const pool = BOONS.filter((b) => !b.ok || b.ok(s, R)), opts = [];
      while (opts.length < 3 && pool.length) opts.push(pool.splice(Math.floor(rnd() * pool.length), 1)[0]);
      R.picking = true;
      env.pick('Miner\'s cache! Pick one', opts.map((b) => ({ icon: b.icon, name: b.name, desc: b.desc, tag: 'this dig' })), (i) => {
        const b = opts[i] || opts[0]; R.picking = false; b.fx(s, R); R.boons.push(b.name); syncBtn();
        fx.text(R.in.x, R.in.y - 60, b.name + '!', '#ffd166', 20); sfx.coin();
      });
    }
    function growVeins() {
      const h = R.heart; h.veins = [];
      for (let i = 0; i < 5; i++) {
        const a = -1.57 + i * 1.2566, v = spawn(h.x + Math.cos(a) * h.r * 1.32, h.y + Math.sin(a) * h.r * 1.32, 'vein');
        v.hp = v.max = HEART_HP * 0.02; v.ang = a; v.rot = a; h.veins.push(v);
      }
    }
    const crackable = (n) => !n.dead && n.kind !== 'gas';
    function hit(n, d, src) {
      if (n.dead) return;
      if (n.kind === 'granite') { if (src === 'blast' || src === 'quake' || src === 'bomb') strip(n, src === 'bomb' ? 2 : 1); return; }
      if (n.kind === 'gas') { if (n.fuse < 0) { n.fuse = 0.45; n.by = src; sfx.zap(); } return; }
      if (src === 'drill' && rnd() < s.crit * Math.min(1, d * 30)) { d *= 3; sfx.hit(); if (rnd() < 0.3) fx.text(n.x + 14, n.y - 18, 'x3', '#ffd166', 14); }
      n.hp -= d; n.hitT = R.t; R.dmgDealt += d;
      if (n.hp <= 0) crack(n, src);
    }
    function strip(n, k) {
      n.layers -= k; n.hitT = R.t; sfx.play('grind', 0.7) || sfx.crack(); fx.burst(n.x, n.y, 5, ['#6c757d', '#adb5bd', '#343a40'], 120);
      if (n.layers <= 0) crack(n, 'pass'); else fx.ring(n.x, n.y, n.r + 10, '#ced4da');
    }
    function crack(n, src) {
      n.dead = true; const k = KINDS[n.kind];
      if (R.t - R.lastCrack < s.streakWin) R.streak++; else R.streak = 1;
      R.lastCrack = R.t; R.bestStreak = Math.max(R.bestStreak, R.streak);
      const mult = (1 + Math.min(R.streak, 40) * 0.015 * s.streakPay) * (src === 'cart' ? 1 + s.hopper : 1) * (n.pulled ? 1 + s.flux : 1);
      const v = n.val * mult * (R.last > 0 ? 3 : 1) * (n.kind === 'granite' && env.who === 'dwarf' ? 2 : 1); R.ore += v; R.cracked++; R.depth += k.dep * s.depthMul;
      R.oil = Math.min(R.oil + s.onPop / (1 + R.cracked / 120), CAP);
      if (n.kind === 'granite') { R.oil = Math.min(R.oil + 1, CAP); fx.text(n.x, n.y - 30, '+1s oil', '#ffb703', 15); R.stop = Math.max(R.stop, 0.04); fx.shake = Math.max(fx.shake, 5); }
      sfx.crack(); if (k.metal) sfx.coin();
      fx.burst(n.x, n.y, n.kind === 'iron' || n.kind === 'mother' ? 14 : 7, k.col, 150);
      const big = v >= s.value * 6;
      fx.text(n.x, n.y - 8, '+' + env.fmt(v), big ? '#ffd166' : '#ffe8b0', big ? 19 : 15);
      if (n.glint) { R.gems++; R.glints++; R.stop = Math.max(R.stop, 0.06); fx.ring(n.x, n.y, 70, '#fff3b0'); fx.text(n.x, n.y - 52, 'GLINTING! +1 gem', '#fff3b0', 16); sfx.play('glint') || [1318, 1760].forEach((f, i) => sfx.tone(f, 0.12, 'triangle', 0.06, 1, i * 0.06)); }
      if (n.kind === 'vault') { R.stop = 0.2; fx.shake = 14; fx.ring(n.x, n.y, 150, '#56cfe1'); R.banner = { big: 'DWARVEN VAULT!', sub: 'Mithril spills out', t: 0, life: 1.8, col: '#56cfe1' }; for (let i = 0; i < 6; i++) { const a = i * 1.047; spawn(Math.max(30, Math.min(W - 30, n.x + Math.cos(a) * 50)), Math.max(top + 20, Math.min(bottom, n.y + Math.sin(a) * 50)), 'mithril'); } }
      if (k.gem) { R.gems += k.gem; sfx.ding(); fx.text(n.x, n.y - 32, `+${k.gem} gem${k.gem > 1 ? 's' : ''}`, '#e0aaff', 17); }
      if (n.kind === 'mother') { R.mothers++; R.stop = 0.12; fx.shake = 12; fx.ring(n.x, n.y, 120, '#e0aaff'); R.banner = { big: 'MOTHERLODE!', sub: `+${k.gem} gems`, t: 0, life: 1.6, col: '#e0aaff' }; sfx.play('motherlode') || [1046, 1318, 1568, 2093].forEach((f, i) => sfx.tone(f, 0.18, 'triangle', 0.07, 1, i * 0.07)); }
      if (n.kind === 'iron' || n.kind === 'cluster') { fx.shake = Math.max(fx.shake, 5); R.stop = Math.max(R.stop, 0.035); }
      if (n.kind === 'cluster') for (let i = 0; i < 4; i++) { const a = i * 1.57 + rnd(); spawn(n.x + Math.cos(a) * 28, n.y + Math.sin(a) * 28, 'shard'); }
      if (n.kind === 'sentinel') { R.oil = Math.min(R.oil + 1, CAP); fx.text(n.x, n.y - 30, '+1s oil', '#ffb703', 15); }
      if (R.streak >= 10 && R.streak % 10 === 0) { fx.text(W / 2, H * 0.5, `x${R.streak} STREAK!`, '#ffd166', 26); fx.ring(n.x, n.y, 90, '#ffd166'); sfx.tone(500 + R.streak * 12, 0.16, 'triangle', 0.08); sfx.tone(750 + R.streak * 18, 0.16, 'triangle', 0.06, 1, 0.07); }
      if (s.splash && n.kind !== 'vein') for (const o of R.nodes) if (!o.dead && o !== n && o.kind !== 'gas' && Math.hypot(o.x - n.x, o.y - n.y) < s.splashR + o.r) hit(o, n.max * s.splash, 'blast');
    }
    function gasBoom(n) {
      n.dead = true; sfx.boom(); fx.shake = 11; R.stop = 0.06;
      fx.ring(n.x, n.y, s.gasR, '#95d5b2'); fx.burst(n.x, n.y, 18, ['#95d5b2', '#d8f3dc', '#ffd166'], 260, 4.5);
      if (n.by === 'drill' || n.by === 'ember') {
        const cost = 2.5 * s.gasCost, back = n.by === 'ember' ? s.gasFeed : 0;
        if (back) { R.oil = Math.min(R.oil + back, CAP); fx.text(n.x, n.y - 30, `+${back.toFixed(1)}s oil`, '#ffb703', 17); }
        else if (cost > 0.05) { R.oil -= cost; R.gasHits++; R.hurtT = R.t; fx.text(n.x, n.y - 30, `-${cost.toFixed(1)}s oil`, '#ff6b6b', 18); }
      }
      for (const o of R.nodes) if (!o.dead && o !== n && Math.hypot(o.x - n.x, o.y - n.y) < s.gasR + o.r) {
        if (o.kind === 'gas') { if (o.fuse < 0) { o.fuse = 0.2; o.by = 'chain'; } } else if (o.kind === 'granite') strip(o, 2); else hit(o, o.max * 2, 'gas');
      }
      if (R.heart && Math.hypot(R.heart.x - n.x, R.heart.y - n.y) < s.gasR + R.heart.r) hurtHeart(s.dps * 6);
    }
    function hurtHeart(d) {
      const h = R.heart; if (!h || R.won) return;
      if (h.phase === 1 && h.veins.some((v) => !v.dead)) d *= 0.2;
      h.hp -= d; h.hitT = R.t; R.dmgDealt += d;
      if (h.phase === 1 && h.hp <= h.max * 0.5) {
        h.phase = 2; h.hp = h.max * 0.5; for (const v of h.veins) if (!v.dead) crack(v, 'blast');
        R.banner = { big: 'THE HEART AWAKENS', sub: 'Crack the magma stones before they erupt', t: 0, life: 2.4, col: '#f97316' };
        R.stop = 0.25; fx.shake = 16; fx.ring(h.x, h.y, h.r * 3, '#f97316'); sfx.boom();
        [440, 415, 392, 330].forEach((f, i) => sfx.tone(f, 0.22, 'square', 0.05, 1, 0.1 + i * 0.13)); sfx.tone(65, 1, 'sawtooth', 0.07, 0.6, 0.6);
      }
      if (h.phase === 2 && h.hp <= h.max * 0.2) {
        h.phase = 3; h.waveT = 1.6; h.sentT = Math.min(h.sentT, 1.5);
        R.banner = { big: 'THE HEART RAGES', sub: 'Shockwaves! Get your drill out of the ring', t: 0, life: 2.4, col: '#ff3b3b' };
        R.stop = 0.25; fx.shake = 16; fx.ring(h.x, h.y, h.r * 3.5, '#ff3b3b'); sfx.boom(); sfx.tone(49, 1.2, 'sawtooth', 0.08, 0.6, 0.2);
      }
      if (h.hp <= 0) {
        R.gems += 25; R.wave = null;
        h.hp = 0; R.won = true; R.cause = 'win'; R.ending = 1.4; R.stop = 0.3; fx.shake = 20;
        fx.burst(h.x, h.y, 40, ['#ff6b6b', '#ffd166', '#fff', '#ff8fa3'], 340, 5); fx.ring(h.x, h.y, h.r * 4, '#ffd166'); sfx.boom();
        R.banner = { big: 'THE HEART IS YOURS', sub: '+25 gems from its core', t: 0, life: 2, col: '#ffd166' }; sfx.win();
      }
    }
    function blastDynamite(b) {
      sfx.boom(); fx.shake = 14; R.stop = 0.08; fx.ring(b.x, b.y, s.dynaR, '#ffb703'); fx.ring(b.x, b.y, s.dynaR * 0.6, '#fff');
      fx.burst(b.x, b.y, 26, ['#ffb703', '#f77f00', '#fff3b0', '#6c584c'], 300, 4.5);
      for (const n of R.nodes) if (!n.dead && Math.hypot(n.x - b.x, n.y - b.y) < s.dynaR + n.r) {
        if (n.kind === 'gas') { n.fuse = Math.min(n.fuse < 0 ? 0.15 : n.fuse, 0.15); n.by = 'bomb'; } else hit(n, s.dps * s.dynaDmg, 'bomb');
      }
      if (R.heart && Math.hypot(R.heart.x - b.x, R.heart.y - b.y) < s.dynaR + R.heart.r) hurtHeart(s.dps * s.dynaDmg * 0.3);
    }
    function dynamite() {
      if (R.over || R.ending || R.ready > 0 || R.sticks <= 0 || !R.in.down && !env.ui) { sfx.nope(); return false; }
      R.sticks--; R.bombs.push({ x: R.in.x, y: R.in.y, fuse: 0.7 }); sfx.tone(300, 0.08, 'square', 0.05, 2); syncBtn(); return true;
    }
    // the dynamite button: fixed slot bottom-left, always the same size; dims when out of sticks
    let btn = null;
    function syncBtn() { if (!btn) return; btn.querySelector('.lbl').innerHTML = R.sticks > 0 ? `Throw · <b>${R.sticks}</b> left` : 'No sticks left'; btn.disabled = R.sticks <= 0; btn.style.opacity = R.sticks > 0 ? '1' : '.5'; }
    if (env.ui && s.dyna > 0) {
      btn = document.createElement('button'); btn.type = 'button'; btn.setAttribute('aria-label', 'Throw dynamite');
      btn.style.cssText = 'display:flex;align-items:center;gap:8px;min-height:56px;width:196px;margin:0 0 14px 4px;padding:6px 14px;border-radius:16px;border:2px solid #ffb70399;background:linear-gradient(#7a2e0e,#3d1607);color:#ffe8b0;font:400 18px "Lilita One",system-ui;box-shadow:0 4px 0 #1d0b03;touch-action:none';
      btn.innerHTML = '<span style="font-size:24px">🧨</span><span class="lbl"></span>';
      let downAt = 0; // pointerdown for speed; click as a fallback (keyboard, test harness), never both
      btn.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); downAt = performance.now(); dynamite(); });
      btn.addEventListener('click', (e) => { e.stopPropagation(); if (performance.now() - downAt > 600) dynamite(); });
      env.ui.appendChild(btn); syncBtn();
    }

    const api = {
      get over() { return R.over; }, get t() { return R.t; }, state: R, dynamite, stats: s,
      update(dt, input) {
        R.in = { x: input.x, y: input.y, down: input.down };
        if (R.over) return;
        fx.update(dt);
        if (R.banner) { R.banner.t += dt; if (R.banner.t > R.banner.life) R.banner = null; }
        if (R.toast) { R.toast.t += dt; if (R.toast.t > R.toast.life) R.toast = null; }
        if (R.ending > 0) { R.ending -= dt; if (R.ending <= 0) R.over = true; return; } // the end beat: freeze, then hand over
        if (R.stop > 0) { R.stop -= dt; return; } // hit pause
        if (R.ready > 0) { R.ready -= dt; if (R.ready <= 0) sfx.tone(880, 0.12, 'triangle', 0.07); return; } // a beat to see the face
        if (!R.lit) { if (!input.down) return; R.lit = true; } // the lamp is lit by the first touch: no oil burns while you read the face
        R.t += dt;
        const sp = Math.hypot(input.x - R.px, input.y - R.py) / dt; R.speed += (sp - R.speed) * Math.min(1, dt * 10); R.px = input.x; R.py = input.y;
        // the deeper (longer) you dig, the faster the lamp burns; a hard ramp past 55 s keeps digs under ~75 s
        if (R.last <= 0) R.oil -= s.drain * (R.boonDrain || 1) * (1 + Math.max(0, R.t - 14) / 10 + Math.max(0, R.t - 55) * 0.5) * dt;
        if (R.oil < 3 && R.oil > 0 && !R.last && Math.ceil(R.oil) !== R.tick) { R.tick = Math.ceil(R.oil); sfx.tone(R.tick === 1 ? 1175 : 988, 0.06, 'square', 0.035); } // low-oil ticks
        if (R.last > 0) { R.last -= dt; if (R.last <= 0) R.last = -1; }
        if (R.rush > 0) R.rush -= dt;
        else if (!R.heart && R.depth >= 15 && R.rushT > 0 && (R.rushT -= dt) <= 0) { // once a dig, maybe: a gold rush floods the face
          if (rnd() < 0.45) { R.rush = 6; R.banner = { big: 'GOLD RUSH!', sub: 'Ore floods the face for 6 s', t: 0, life: 1.6, col: '#ffd166' }; sfx.play('rush') || [659, 784, 988, 1318].forEach((f, i) => sfx.tone(f, 0.12, 'triangle', 0.07, 1, i * 0.06)); for (let i = 0; i < 6; i++) spawn(undefined, undefined, rnd() < 0.5 ? 'gold' : 'silver'); }
        }
        if (!R.heart && !R.vault && R.depth >= 150) { R.vault = spawn(undefined, undefined, 'vault'); hint('vault', 'A sealed dwarven vault! Drill it open'); sfx.tone(392, 0.4, 'triangle', 0.06); sfx.tone(587, 0.5, 'triangle', 0.06, 1, 0.15); }
        if (s.ale && !R.aleUsed && R.oil < s.oil * 0.25) { R.aleUsed = true; R.oil += s.ale; fx.text(input.x, input.y - 50, `Ale break! +${s.ale.toFixed(1)}s`, '#ffd166', 18); sfx.ding(); }
        R.shown += (R.depth - R.shown) * Math.min(1, dt * 3);
        const si = stratumOf(R.depth);
        if (si > R.stratum) { R.stratum = si; const st = STRATA[si]; if (!R.heart) R.banner = { big: st.name, sub: `${st.at} m`, t: 0, life: 1.8, col: '#ffe8b0' }; sfx.tone(523, 0.14, 'triangle', 0.07); sfx.tone(784, 0.2, 'triangle', 0.07, 1, 0.1); if (R.last <= 0) cache(st); }
        R.spawnT -= dt;
        while (R.spawnT <= 0) { R.spawnT += s.spawn / (R.rush > 0 ? 3 : 1); if (R.nodes.filter((n) => n.kind !== 'vein' && n.kind !== 'sentinel').length < s.maxNodes + (R.rush > 0 ? 8 : 0)) spawn(); }
        // oil flasks
        R.flaskT -= dt;
        if (R.flaskT <= 0) { R.flaskT += s.flaskEvery * (0.8 + rnd() * 0.4); let fxp = 0, fyp = 0; for (let i = 0; i < 10; i++) { fxp = 40 + rnd() * (W - 80); fyp = top + 30 + rnd() * (bottom - top - 40); if (clear(fxp, fyp)) break; } R.flasks.push({ x: fxp, y: fyp, t: 0, life: 5 }); hint('flask', 'Grab the oil flask for more lamp time'); }
        for (const f of R.flasks) {
          f.t += dt;
          if (s.flux && input.down) { const d = Math.hypot(input.x - f.x, input.y - f.y); if (d < s.magR && d > 4) { f.x += (input.x - f.x) / d * s.mag * dt; f.y += (input.y - f.y) / d * s.mag * dt; } }
          if (input.down && Math.hypot(input.x - f.x, input.y - f.y) < s.radius + 16) { f.got = true; R.flaskGot++; R.oil = Math.min(R.oil + s.flaskOil, CAP); fx.text(f.x, f.y - 20, `+${s.flaskOil.toFixed(1)}s oil`, '#ffb703', 18); fx.ring(f.x, f.y, 40, '#ffb703'); sfx.play('flask') || sfx.ding(); }
        }
        R.flasks = R.flasks.filter((f) => !f.got && f.t < f.life);
        // cave-ins: a shadow warns, then rock falls
        if (STRATA[R.stratum].cave && !R.heart) {
          R.caveT -= dt;
          if (R.caveT <= 0) { R.caveT = 6 + rnd() * 3; const cx = Math.max(60, Math.min(W - 60, input.x + (rnd() - 0.5) * 120)), cy = Math.max(top + 40, Math.min(bottom - 20, input.y + (rnd() - 0.5) * 120)); R.caves.push({ x: cx, y: cy, r: 72, t: 0, warn: 1.3 }); hint('cave', 'Cave-in! Move out of the shadow'); sfx.play('cave', 0.7) || sfx.tone(90, 0.5, 'sawtooth', 0.04, 0.7); }
        }
        for (const c of R.caves) {
          c.t += dt;
          if (!c.fell && c.t >= c.warn) {
            c.fell = true; fx.shake = Math.max(fx.shake, 9); sfx.boom(); fx.burst(c.x, c.y, 16, ['#6b4f3a', '#a98467', '#3d2c1e'], 200, 4.5);
            if (input.down && Math.hypot(input.x - c.x, input.y - c.y) < c.r) { const cost = 2 * s.caveCost; R.oil -= cost; R.caveHits++; R.hurtT = R.t; fx.text(c.x, c.y - 40, `-${cost.toFixed(1)}s oil`, '#ff6b6b', 18); }
            for (let i = 0; i < 3; i++) spawn(c.x + (rnd() - 0.5) * 70, c.y + (rnd() - 0.5) * 70, 'rubble');
          }
        }
        R.caves = R.caves.filter((c) => c.t < c.warn + 0.4);
        // the drill
        if (input.down) {
          R.focus = !s.steady ? 0 : R.speed < 140 ? Math.min(1, R.focus + dt / 1.2) : Math.max(0, R.focus - dt * 2.5);
          const under = R.nodes.filter((n) => !n.dead && n.kind !== 'granite' && n.kind !== 'gas' && Math.hypot(n.x - input.x, n.y - input.y) < s.radius + n.r);
          const m = (1 + s.crowd * Math.max(0, under.length - 1)) * (1 + s.steady * R.focus);
          for (const n of under) hit(n, s.dps * m * dt, 'drill');
          R.drilling = under.length > 0;
          for (const n of R.nodes) {
            if (n.dead) continue;
            const inR = Math.hypot(n.x - input.x, n.y - input.y) < s.radius + n.r;
            if (n.kind === 'granite') { if (inR && !n.inside) strip(n, 1); n.inside = inR; }
            else if (n.kind === 'gas' && inR) hit(n, 0, 'drill');
          }
          if (R.heart && Math.hypot(R.heart.x - input.x, R.heart.y - input.y) < s.radius + R.heart.r) { hurtHeart(s.dps * m * dt); R.drilling = true; }
          if (s.mag) for (const n of R.nodes) {
            if (n.dead || n.kind === 'gas' || n.kind === 'vein') continue;
            const d = Math.hypot(input.x - n.x, input.y - n.y);
            if (d < s.magR && d > s.radius * 0.4) { const v = s.mag * (1.2 - d / s.magR) * dt; n.x += (input.x - n.x) / d * v; n.y += (input.y - n.y) / d * v; n.pulled = true; }
          }
          if (s.ember) {
            R.emberT -= dt;
            if (R.emberT <= 0 && R.speed > 30) { R.emberT = 0.035; R.embers.push({ x: input.x + (rnd() - 0.5) * 8, y: input.y + (rnd() - 0.5) * 8, t: 0 }); }
          }
        } else { R.focus = Math.max(0, R.focus - dt * 2.5); R.drilling = false; for (const n of R.nodes) if (n.kind === 'granite') n.inside = false; }
        // embers (the salamander's trail)
        if (R.embers.length) {
          for (const e of R.embers) e.t += dt;
          R.embers = R.embers.filter((e) => e.t < s.emberLife);
          for (const n of R.nodes) {
            if (n.dead || n.kind === 'granite') continue;
            if (R.embers.some((e) => Math.abs(e.x - n.x) < n.r + 12 && Math.abs(e.y - n.y) < n.r + 12)) { if (n.kind === 'gas') { if (n.fuse < 0) { n.fuse = 0.3; n.by = 'ember'; } } else hit(n, s.ember * s.dps * dt, 'ember'); }
          }
          if (R.heart && R.embers.some((e) => Math.hypot(e.x - R.heart.x, e.y - R.heart.y) < R.heart.r)) hurtHeart(s.ember * s.dps * dt);
        }
        // tremors (the mole)
        if (s.quake) {
          R.quakeT -= dt;
          if (R.quakeT <= 0) {
            R.quakeT += s.quakeEvery; sfx.boom(); fx.shake = 8; fx.ring(W / 2, H / 2, Math.max(W, H) * 0.7, '#ffd08a');
            for (const n of R.nodes.slice()) if (n.kind === 'gas') { if (n.fuse < 0) { n.fuse = 0.3; n.by = 'quake'; } } else hit(n, s.quake * s.dps / 4.8, 'quake');
            if (R.heart) hurtHeart(s.quake * s.dps / 4.8);
            if (s.shockOil) { R.oil = Math.min(R.oil + s.shockOil, CAP); fx.text(W / 2, top + 20, `+${s.shockOil.toFixed(1)}s oil`, '#ffb703', 15); }
          }
        }
        // gas fuses and fizzles
        for (const n of R.nodes) if (n.kind === 'gas' && !n.dead) { if (n.fuse >= 0) { n.fuse -= dt; if (n.fuse <= 0) gasBoom(n); } else if ((n.life -= dt) <= 0) n.dead = true; }
        // carts
        for (const c of R.carts) {
          if (!c.target || c.target.dead) c.target = R.nodes.filter((n) => crackable(n) && n.kind !== 'granite').sort((a, b) => Math.hypot(a.x - c.x, a.y - c.y) - Math.hypot(b.x - c.x, b.y - c.y))[0] || null;
          const t = c.target || (R.heart && { x: R.heart.x, y: R.heart.y + R.heart.r * 0.8 });
          if (!t) continue;
          const d = Math.hypot(t.x - c.x, t.y - c.y);
          if (d > 18) { const v = 240 * s.cartSpeed * dt; c.x += (t.x - c.x) / d * Math.min(v, d); c.y += (t.y - c.y) / d * Math.min(v, d); c.spin += v / 4; c.dir = t.x < c.x ? -1 : 1; }
          else if (c.target) hit(c.target, s.helperDps * dt, 'cart'); else hurtHeart(s.helperDps * dt);
        }
        // dynamite
        for (const b of R.bombs) { b.fuse -= dt; if (b.fuse <= 0) { b.done = true; blastDynamite(b); } }
        R.bombs = R.bombs.filter((b) => !b.done);
        // the Heart
        const h = R.heart;
        if (h) {
          if (h.phase === 1) {
            if (h.veins.every((v) => v.dead)) { if (!h.regrow) { h.regrow = 7; hint('veins', 'Veins broken: drill the Heart now!'); } h.regrow -= dt; if (h.regrow <= 0) { h.regrow = 0; growVeins(); sfx.tone(196, 0.4, 'sawtooth', 0.05, 1.5); } }
          } else {
            h.drift = (h.drift || 0) + dt * (h.phase === 3 ? 0.8 : 0.55);
            h.x = h.bx + Math.sin(h.drift) * W * 0.24; h.y = h.by + Math.sin(h.drift * 0.75) * H * 0.07;
            h.sentT -= dt;
            if (h.phase === 3 && !R.wave && (h.waveT -= dt) <= 0) { // the shockwave: a ring is marked, then it hits
              h.waveT = 4.2; R.wave = { x: h.x, y: h.y, r: h.r * 2.4, t: 0, warn: 1.4 }; hint('wave', 'Lift off or move out of the red ring!');
              sfx.tone(130, 1.3, 'sawtooth', 0.05, 2.2);
            }
            if (h.sentT <= 0) {
              h.sentT = h.phase === 3 ? 2.6 : 3.2; const a = rnd() * 6.28, n = spawn(Math.max(40, Math.min(W - 40, h.x + Math.cos(a) * h.r * 2)), Math.max(top + 30, Math.min(bottom, h.y + Math.sin(a) * h.r * 2)), 'sentinel');
              n.hp = n.max = HEART_HP * 0.012; n.life = 5.5; n.lifeMax = 5.5; sfx.tone(150, 0.25, 'square', 0.04, 0.7);
            }
            for (const n of R.nodes) if (n.kind === 'sentinel' && !n.dead && (n.life -= dt) <= 0) {
              n.dead = true; R.oil -= 1.5; R.hurtT = R.t; fx.ring(n.x, n.y, 90, '#f97316'); fx.burst(n.x, n.y, 16, ['#f97316', '#fde68a', '#1c1917'], 220, 4); fx.text(n.x, n.y - 30, '-1.5s oil', '#ff6b6b', 18); fx.shake = 9; sfx.boom();
            }
          }
          if (R.wave) {
            const w = R.wave; w.t += dt;
            if (!w.hit && w.t >= w.warn) {
              w.hit = true; fx.ring(w.x, w.y, w.r, '#ff3b3b'); fx.ring(w.x, w.y, w.r * 0.7, '#fff'); fx.shake = 12; sfx.boom();
              if (input.down && Math.hypot(input.x - w.x, input.y - w.y) < w.r) { R.oil -= 2; R.hurtT = R.t; fx.text(input.x, input.y - 60, '-2s oil', '#ff6b6b', 20); }
              else fx.text(w.x, w.y - w.r - 10, 'Dodged!', '#95d5b2', 18);
            }
            if (w.t > w.warn + 0.3) R.wave = null;
          }
          if ((R.beat -= dt) <= 0) { R.beat = [0, 1.75, 1.14, 0.9][h.phase]; sfx.play('heart-beat', 0.7) || sfx.tone(52, 0.22, 'sine', 0.12, 0.7); }
          for (const v of h.veins) if (!v.dead) { v.x = h.x + Math.cos(v.ang) * h.r * 1.32; v.y = h.y + Math.sin(v.ang) * h.r * 1.32; }
        }
        R.nodes = R.nodes.filter((n) => !n.dead);
        if (R.won) return;
        if (R.oil <= 0 && s.lastLight && !R.lastUsed) { // Last Light: one frantic finale where ore pays x3
          R.oil = 0; R.lastUsed = true; R.last = s.lastLight; R.stop = 0.15; fx.shake = 6;
          R.banner = { big: 'LAST LIGHT!', sub: `Ore pays x3 for ${s.lastLight.toFixed(1)}s`, t: 0, life: 1.4, col: '#fff3b0' };
          sfx.play('lastlight') || [784, 988, 1175, 1568].forEach((f, i) => sfx.tone(f, 0.16, 'triangle', 0.07, 1, i * 0.05));
        }
        if (R.oil <= 0 && R.last <= 0) { R.oil = 0; R.cause = 'oil'; R.ending = 1; R.stop = 0; sfx.tone(220, 0.6, 'sine', 0.08, 0.4); }
      },
      quit() { R.cause = 'quit'; },
      draw(g) { drawRun(g, R, env, s, W, H, top, bottom); },
      result() {
        const st = STRATA[stratumOf(R.depth)], dm = Math.floor(R.depth);
        const lines = [`${dm} m deep (${st.name}) in ${Math.round(R.t)}s`, `${R.cracked} cracked · best streak x${R.bestStreak}${R.flaskGot ? ` · ${R.flaskGot} flask${R.flaskGot > 1 ? 's' : ''}` : ''}${R.mothers ? ` · ${R.mothers} motherlode` : ''}`];
        if (R.heart && !R.won) lines.unshift(`The Heart had ${Math.ceil(R.heart.hp / R.heart.max * 100)}% left${R.heart.phase >= 2 ? ' (awake)' : ''}`);
        if (R.won) lines.push('+25 gems from the Heart\'s core');
        const extras = [R.glints && `${R.glints} glinting`, R.vault?.dead && 'opened a vault', R.boons.length && `cache: ${R.boons.join(', ')}`].filter(Boolean);
        if (extras.length) lines.push(extras.join(' · '));
        if (!R.won && R.cause === 'oil' && R.gasHits + R.caveHits >= 2) lines.push(`Gas and cave-ins cost you oil ${R.gasHits + R.caveHits} times`);
        if (!R.won) { const tip = nextBuy(env, { ore: R.ore, gems: R.gems }); if (tip) lines.push(tip); }
        return R.won ? { won: true, earned: { ore: R.ore, gems: R.gems }, score: dm, lines }
          : { won: false, title: R.heart ? 'The Heart held' : R.cause === 'quit' ? 'You climbed out' : 'Lamp burned out', earned: { ore: R.ore, gems: R.gems }, score: dm, lines };
      },
    };
    if (typeof window !== 'undefined' && window.OreSweeper) window.OreSweeper.run = api; // for dev screenshots
    return api;
  }

  // results hint: the cheapest upgrade the player can buy after this dig, else the nearest one to save for (browser only)
  function nextBuy(env, earned) {
    if (!K) return '';
    try {
      const C = K.charSave(K.S.cur), lv = C.levels, wal = (c) => (C.wallet[c] || 0) + Math.floor(earned[c] || 0);
      const open = NODES.filter((n) => (!n.who || n.who === env.who) && !n.win && (lv[n.id] || 0) < n.max && (!n.req.length || n.req.filter((r) => lv[r]).length >= (n.reqAll || 1))
        && !(n.excl && NODES.some((m) => m !== n && m.excl === n.excl && lv[m.id])))
        .map((n) => ({ n, c: Math.ceil(n.cost * n.grow ** (lv[n.id] || 0)), cur: n.cur || 'ore' })).map((o) => ({ ...o, gap: o.c - wal(o.cur) }));
      const can = open.filter((o) => o.gap <= 0).sort((a, b) => a.c - b.c)[0];
      if (can) return `Next: ${can.n.name} (${env.fmt(can.c)} ${can.cur})`;
      const near = open.filter((o) => o.cur === 'ore').sort((a, b) => a.gap - b.gap)[0];
      return near ? `Save up: ${near.n.name} needs ${env.fmt(near.gap)} more ore` : '';
    } catch { return ''; }
  }

  // ---------------------------------------------------------------- drawing
  // art hooks: env.sprite draws a raster image when the Media Helper's art exists, else returns false (vector fallback)
  let SPR = () => false, ART = () => null;
  function artNode(g, n, k, r, hit, t) {
    const nm = n.kind === 'shard' ? 'obj-cluster' : 'obj-' + n.kind;
    if (!ART(nm)) return false;
    let w = r * 2.3, a = 1;
    const rot = k.prism || n.kind === 'gas' || n.kind === 'vault' ? 0 : n.rot * 0.15;
    if (n.kind === 'gas') { const f = n.fuse >= 0; w *= (1 + 0.06 * Math.sin(t * 5 + n.seed)) * (f ? 1 + (0.45 - n.fuse) * 0.8 : 1); a = Math.min(1, n.life / 1.2 + (f ? 1 : 0)); }
    SPR(g, nm, 0, 0, w, undefined, { rot, alpha: a });
    if (hit > 0) { g.globalCompositeOperation = 'lighter'; SPR(g, nm, 0, 0, w, undefined, { rot, alpha: hit * 0.55 }); g.globalCompositeOperation = 'source-over'; }
    return true;
  }
  function rr(g, x, y, w, h, r) { g.beginPath(); g.roundRect ? g.roundRect(x, y, w, h, r) : g.rect(x, y, w, h); }
  const lerpC = (a, b, t) => { const p = (c) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16)); const A = p(a), B = p(b); return `rgb(${A.map((v, i) => Math.round(v + (B[i] - v) * t)).join(',')})`; };
  function drawRun(g, R, env, s, W, H, top, bottom) {
    const rnd = Math.random, fx = env.fx, t = R.t + (1 - Math.max(0, R.ready));
    SPR = env.sprite || SPR; ART = env.art || ART;
    const sx = (rnd() - 0.5) * fx.shake, sy = (rnd() - 0.5) * fx.shake;
    g.save(); g.translate(sx, sy);
    // rock face: the stratum's colours blend toward the next one as you near it; bands and specks scroll up as you dig
    const si = stratumOf(R.shown), st = STRATA[si], nx = STRATA[si + 1];
    const blend = nx ? Math.max(0, Math.min(1, (R.shown - (nx.at - 8)) / 8)) : 0;
    const bg = g.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, nx ? lerpC(st.top, nx.top, blend) : st.top); bg.addColorStop(1, nx ? lerpC(st.bot, nx.bot, blend) : st.bot);
    if (SPR(g, 'bg-rock', W / 2, H / 2, W + 40, H + 40)) g.globalAlpha = 0.62; // art backdrop, tinted by the stratum colours
    g.fillStyle = bg; g.fillRect(-20, -20, W + 40, H + 40); g.globalAlpha = 1;
    if (R.rush > 0) { g.fillStyle = `rgba(255,195,0,${0.08 + 0.04 * Math.sin(t * 8)})`; g.fillRect(-20, -20, W + 40, H + 40); }
    const scroll = R.shown * 16;
    g.strokeStyle = st.band; g.lineWidth = 10;
    for (let i = 0; i < 8; i++) {
      const y = ((i * H / 7 - scroll) % (H + 80) + H + 80) % (H + 80) - 40;
      g.beginPath(); g.moveTo(-10, y); for (let x = 0; x <= W + 40; x += 30) g.lineTo(x, y + Math.sin(x * 0.018 + i * 1.7) * 12); g.stroke();
    }
    g.lineWidth = 2; g.strokeStyle = 'rgba(0,0,0,.25)';
    for (let i = 0; i < 8; i++) { const y = ((i * H / 7 + 9 - scroll) % (H + 80) + H + 80) % (H + 80) - 40; g.beginPath(); g.moveTo(-10, y); for (let x = 0; x <= W + 40; x += 30) g.lineTo(x, y + Math.sin(x * 0.018 + i * 1.7) * 12); g.stroke(); }
    for (const p of R.specks) { const y = ((p.y - scroll * 0.7) % (H * 2) + H * 2) % (H * 2); if (y > H + 4) continue; g.fillStyle = `rgba(255,240,220,${p.a})`; g.beginPath(); g.arc(p.x, y, p.r, 0, 6.283); g.fill(); }
    // cave-in shadows
    for (const c of R.caves) {
      const q = Math.min(1, c.t / c.warn);
      if (!c.fell) {
        g.fillStyle = `rgba(0,0,0,${0.2 + 0.35 * q})`; g.beginPath(); g.arc(c.x, c.y, c.r * (0.5 + 0.5 * q), 0, 6.283); g.fill();
        g.setLineDash([8, 6]); g.strokeStyle = `rgba(255,107,107,${0.5 + 0.5 * Math.sin(t * 20)})`; g.lineWidth = 3; g.beginPath(); g.arc(c.x, c.y, c.r, 0, 6.283); g.stroke(); g.setLineDash([]);
        g.fillStyle = '#a98467'; for (let i = 0; i < 6; i++) { const px = c.x + Math.sin(i * 2.4 + c.x) * c.r * 0.7, py = c.y - c.r * 1.6 + ((c.t * 380 + i * 40) % (c.r * 1.6)); g.beginPath(); g.arc(px, py, 2.5 + (i % 3), 0, 6.283); g.fill(); }
      }
    }
    if (R.heart) drawHeart(g, R.heart, t);
    if (R.wave && !R.wave.hit) { // telegraph: the danger zone is marked at once, the fill grows until it hits
      const w = R.wave, q = Math.min(1, w.t / w.warn);
      g.fillStyle = `rgba(255,59,59,${0.08 + 0.17 * q})`; g.beginPath(); g.arc(w.x, w.y, w.r * q, 0, 6.283); g.fill();
      g.setLineDash([10, 8]); g.strokeStyle = `rgba(255,90,90,${0.6 + 0.4 * Math.sin(t * 18)})`; g.lineWidth = 4; g.beginPath(); g.arc(w.x, w.y, w.r, 0, 6.283); g.stroke(); g.setLineDash([]);
    }
    // embers under the ore
    if (R.embers.length) {
      g.globalCompositeOperation = 'lighter';
      for (const e of R.embers) { const q = 1 - e.t / s.emberLife, rad = 10 + 8 * q; const gr = g.createRadialGradient(e.x, e.y, 1, e.x, e.y, rad); gr.addColorStop(0, `rgba(255,220,120,${0.7 * q})`); gr.addColorStop(0.5, `rgba(255,110,30,${0.45 * q})`); gr.addColorStop(1, 'rgba(255,60,0,0)'); g.fillStyle = gr; g.beginPath(); g.arc(e.x, e.y - e.t * 14, rad, 0, 6.283); g.fill(); }
      g.globalCompositeOperation = 'source-over';
    }
    for (const n of R.nodes) drawNode(g, n, t);
    for (const f of R.flasks) drawFlask(g, f, t);
    for (const b of R.bombs) drawBomb(g, b, t);
    for (const c of R.carts) drawCart(g, c, t);
    // lamp light: darkness closes in as the oil runs low, with a little flicker
    const lx = R.in?.down ? R.in.x : W / 2, ly = R.in?.down ? R.in.y : H / 2, of = Math.max(0, Math.min(1, R.oil / Math.max(1, s.oil)));
    const fl = 1 + Math.sin(t * 23) * 0.015 + Math.sin(t * 7.3) * 0.02;
    const lamp = g.createRadialGradient(lx, ly, 20, lx, ly, Math.max(W, H) * (0.55 + 0.35 * of) * fl);
    lamp.addColorStop(0, 'rgba(255,200,120,.12)'); lamp.addColorStop(0.35, 'rgba(0,0,0,0)'); lamp.addColorStop(1, `rgba(0,0,0,${0.5 + 0.3 * (1 - of)})`);
    g.fillStyle = lamp; g.fillRect(-20, -20, W + 40, H + 40);
    if (R.last > 0) { g.fillStyle = `rgba(255,243,176,${0.1 + 0.06 * Math.sin(t * 16)})`; g.fillRect(-20, -20, W + 40, H + 40); }
    const hurt = Math.max(0, 1 - (R.t - R.hurtT) * 2.5);
    if (hurt > 0) { const v = g.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, H * 0.75); v.addColorStop(0, 'rgba(255,40,40,0)'); v.addColorStop(1, `rgba(255,40,40,${0.45 * hurt})`); g.fillStyle = v; g.fillRect(-20, -20, W + 40, H + 40); }
    for (const m of R.motes) { const y = (m.y - t * m.v + H * 10) % H; g.fillStyle = `rgba(255,230,190,${0.12 + 0.08 * Math.sin(t * 2 + m.p)})`; g.beginPath(); g.arc(m.x + Math.sin(t + m.p) * 8, y, 1.4, 0, 6.283); g.fill(); }
    fx.draw(g);
    g.restore();
    if (R.in?.down && !R.over) drawDrill(g, R.in.x, R.in.y, s.radius, t, R);
    drawHud(g, R, env, s, W, H, t);
  }
  function drawHud(g, R, env, s, W, H, t) {
    const full = Math.max(s.oil, R.oil), bw = W - 16 - 72; // the pause button owns the top-right 56px
    g.fillStyle = 'rgba(0,0,0,.55)'; rr(g, 16, 14, bw, 18, 9); g.fill();
    const low = R.oil < 3, of = Math.max(0, Math.min(1, R.oil / full));
    const og = g.createLinearGradient(16, 0, 16 + bw, 0); og.addColorStop(0, low ? '#c1121f' : '#f77f00'); og.addColorStop(1, low ? '#f28482' : '#ffd166');
    g.fillStyle = og; if (of > 0) { rr(g, 16, 14, Math.max(18, bw * of), 18, 9); g.fill(); }
    if (low && Math.sin(t * 14) > 0) { g.strokeStyle = '#ff6b6b'; g.lineWidth = 2; rr(g, 16, 14, bw, 18, 9); g.stroke(); }
    g.font = '800 13px Nunito, system-ui'; g.textAlign = 'left'; g.fillStyle = '#1d1600'; g.textBaseline = 'middle';
    g.fillStyle = of > 0.3 ? '#2b1600' : '#fff'; g.fillText(`🪔 ${R.oil.toFixed(1)}s`, 24, 24);
    g.textBaseline = 'alphabetic';
    // row 2: ore and gems (left), depth (right edge of the bar); numbers right-aligned in fixed slots
    g.font = '400 18px "Lilita One", system-ui'; g.fillStyle = '#ffd166'; g.textAlign = 'right'; g.fillText(env.fmt(R.ore), 86, 56);
    g.font = '800 13px Nunito, system-ui'; g.fillStyle = '#ffe8b0'; g.textAlign = 'left'; g.fillText('ore', 90, 56);
    if (R.gems || s.gem) { g.font = '400 18px "Lilita One", system-ui'; g.fillStyle = '#e0aaff'; g.textAlign = 'right'; g.fillText(String(R.gems), 150, 56); g.font = '800 13px Nunito, system-ui'; g.textAlign = 'left'; g.fillText(R.gems === 1 ? 'gem' : 'gems', 154, 56); }
    g.font = '400 18px "Lilita One", system-ui'; g.fillStyle = '#fff'; g.textAlign = 'right'; g.fillText(`${Math.floor(R.depth)} m`, 16 + bw, 56);
    g.font = '800 12px Nunito, system-ui'; g.fillStyle = 'rgba(255,240,220,.75)'; g.fillText(STRATA[stratumOf(R.depth)].name, 16 + bw, 74);
    // streak (left, fixed slot) and focus meter
    const live = R.t - R.lastCrack < s.streakWin && R.streak >= 3;
    if (live) {
      const pulse = 1 + Math.max(0, 0.25 - (R.t - R.lastCrack)) * 1.2;
      g.save(); g.translate(16, 74); g.scale(pulse, pulse); g.font = '400 17px "Lilita One", system-ui'; g.textAlign = 'left';
      g.fillStyle = R.streak >= 20 ? '#ff9f1c' : '#ffd166'; g.fillText(`x${R.streak} streak`, 0, 0); g.restore();
      g.fillStyle = 'rgba(255,209,102,.6)'; g.fillRect(16, 80, 90 * (1 - (R.t - R.lastCrack) / s.streakWin), 3);
    }
    if (R.sticks != null && s.dyna && !env.ui) { g.font = '800 13px Nunito'; g.fillText(`🧨 ${R.sticks}`, 120, 74); }
    if (R.heart) {
      const h = R.heart, y = 106, hw = W - 32;
      g.font = '400 13px "Lilita One", system-ui'; g.textAlign = 'left'; g.fillStyle = h.phase === 3 ? '#ff3b3b' : h.phase === 2 ? '#f97316' : '#ff6b6b';
      g.fillText(h.phase === 3 ? 'THE HEART · RAGING' : h.phase === 2 ? 'THE HEART · AWAKE' : 'HEART OF THE MOUNTAIN', 16, y - 4);
      const shielded = h.phase === 1 && h.veins.some((v) => !v.dead);
      g.textAlign = 'right'; g.fillStyle = '#fff'; g.font = '800 12px Nunito, system-ui'; g.fillText(shielded ? 'shielded by veins' : h.phase === 1 ? 'exposed!' : '', W - 16, y - 4);
      g.fillStyle = 'rgba(0,0,0,.6)'; rr(g, 16, y, hw, 12, 6); g.fill();
      const hg = g.createLinearGradient(16, 0, 16 + hw, 0); hg.addColorStop(0, '#9d0208'); hg.addColorStop(1, h.phase >= 2 ? '#f97316' : '#ff6b6b');
      g.fillStyle = hg; if (h.hp > 0) { rr(g, 16, y, Math.max(12, hw * h.hp / h.max), 12, 6); g.fill(); }
      g.fillStyle = '#fff'; g.fillRect(16 + hw / 2 - 1, y - 2, 2, 16); g.fillRect(16 + hw * 0.2 - 1, y - 2, 2, 16); // phase marks
    }
    // banner: a reserved band at 30% height; it never moves the HUD
    if (R.banner) {
      const b = R.banner, q = b.t / b.life, a = Math.min(1, b.t * 5, (b.life - b.t) * 3), sc = 0.8 + 0.2 * Math.min(1, b.t * 6);
      g.save(); g.globalAlpha = Math.max(0, a); g.translate(W / 2, H * 0.3); g.scale(sc, sc);
      g.fillStyle = 'rgba(0,0,0,.55)'; rr(g, -W / 2 + 12, -38, W - 24, b.sub ? 70 : 52, 14); g.fill();
      g.textAlign = 'center'; g.font = `400 ${b.big.length > 16 ? 24 : 30}px "Lilita One", system-ui`; g.lineWidth = 5; g.strokeStyle = '#000a'; g.strokeText(b.big, 0, 0); g.fillStyle = b.col; g.fillText(b.big, 0, 0);
      if (b.sub) { g.font = '800 14px Nunito, system-ui'; g.fillStyle = '#fff'; g.fillText(b.sub, 0, 22); }
      g.restore(); void q;
    }
    if (R.toast) { const a = Math.min(1, R.toast.t * 5, (R.toast.life - R.toast.t) * 3); g.globalAlpha = Math.max(0, a); g.font = '800 14px Nunito, system-ui'; g.textAlign = 'center'; const tw = g.measureText(R.toast.text).width + 28; g.fillStyle = 'rgba(0,0,0,.7)'; rr(g, W / 2 - tw / 2, H * 0.3 + 46, tw, 30, 15); g.fill(); g.fillStyle = '#ffe8b0'; g.fillText(R.toast.text, W / 2, H * 0.3 + 66); g.globalAlpha = 1; }
    // the start beat, the first-run hint and the end beat
    g.textAlign = 'center';
    if (R.ready > 0) { g.font = '400 34px "Lilita One", system-ui'; g.fillStyle = `rgba(255,232,176,${Math.min(1, R.ready * 3)})`; g.fillText('Ready…', W / 2, H * 0.62); }
    else if (env.runNo === 1 && R.cracked < 3 && !R.ending) { g.font = '800 16px Nunito, system-ui'; g.fillStyle = 'rgba(0,0,0,.6)'; rr(g, W / 2 - 150, H * 0.62 - 22, 300, 34, 17); g.fill(); g.fillStyle = '#fff'; g.fillText('Hold and drag the drill over the ore', W / 2, H * 0.62); }
    if (R.ending > 0) {
      const a = Math.min(1, (1.4 - R.ending) * 3);
      g.fillStyle = `rgba(0,0,0,${0.45 * a})`; g.fillRect(0, 0, W, H);
      g.globalAlpha = a; g.font = '400 34px "Lilita One", system-ui'; g.fillStyle = R.won ? '#ffd166' : '#ff9f7a';
      g.fillText(R.won ? 'The Heart cracks!' : R.heart ? 'The Heart held' : 'Lamp burned out', W / 2, H * 0.55); g.globalAlpha = 1;
    }
  }
  function polyPath(g, shape, r, k = shape.length) { g.beginPath(); for (let i = 0; i < k; i++) { const a = i / k * 6.283; g.lineTo(Math.cos(a) * r * shape[i], Math.sin(a) * r * shape[i]); } g.closePath(); }
  function prism(g, len, w) { g.beginPath(); g.moveTo(0, -w); g.lineTo(len * 0.72, -w); g.lineTo(len, 0); g.lineTo(len * 0.72, w); g.lineTo(0, w); g.closePath(); }
  function drawNode(g, n, t) {
    const k = KINDS[n.kind], c = k.col;
    const pop = Math.min(1, (t - n.born) * 6), hit = Math.max(0, 1 - (t - n.hitT) * 8), r = n.r * (0.4 + 0.6 * pop);
    g.save(); g.translate(n.x + (Math.random() - 0.5) * hit * 3, n.y);
    if (n.glint) { // glinting ore: a warm halo and a turning star, readable without colour (the star moves)
      const halo = g.createRadialGradient(0, 0, r * 0.6, 0, 0, r * 1.9); halo.addColorStop(0, `rgba(255,243,176,${0.3 + 0.15 * Math.sin(t * 5 + n.seed)})`); halo.addColorStop(1, 'rgba(255,243,176,0)');
      g.fillStyle = halo; g.beginPath(); g.arc(0, 0, r * 1.9, 0, 6.283); g.fill();
    }
    g.fillStyle = 'rgba(0,0,0,.35)'; g.beginPath(); g.ellipse(2, r * 0.85, r * 0.95, r * 0.28, 0, 0, 6.283); g.fill();
    if (n.kind === 'gas') {
      if (!artNode(g, n, k, r, 0, t)) {
        const f = n.fuse >= 0, wob = (i) => r * (1 + 0.09 * Math.sin(t * 5 + i * 1.3 + n.seed)) * (f ? 1 + (0.45 - n.fuse) * 0.8 : 1);
        const gr = g.createRadialGradient(-r * 0.3, -r * 0.3, 2, 0, 0, r * 1.3); gr.addColorStop(0, f && Math.sin(t * 40) > 0 ? '#fff' : 'rgba(216,243,220,.9)'); gr.addColorStop(0.6, 'rgba(82,183,136,.65)'); gr.addColorStop(1, 'rgba(45,106,79,.15)');
        g.globalAlpha = Math.min(1, n.life / 1.2 + (f ? 1 : 0)); g.fillStyle = gr; g.beginPath(); for (let i = 0; i < 16; i++) { const a = i / 16 * 6.283; g.lineTo(Math.cos(a) * wob(i), Math.sin(a) * wob(i)); } g.closePath(); g.fill();
        g.fillStyle = 'rgba(216,243,220,.6)'; for (let i = 0; i < 4; i++) { const by = r * 0.6 - ((t * 22 + i * 13 + n.seed) % (r * 1.6)); g.beginPath(); g.arc(Math.sin(i * 2 + t) * r * 0.4, by, 2 + i % 2, 0, 6.283); g.fill(); }
      } else if (n.fuse >= 0 && Math.sin(t * 40) > 0) { g.fillStyle = 'rgba(255,255,255,.5)'; g.beginPath(); g.arc(0, 0, r, 0, 6.283); g.fill(); }
      g.globalAlpha = 1; g.font = '400 16px "Lilita One", system-ui'; g.textAlign = 'center'; g.fillStyle = '#1b4332'; g.fillText('!', 0, 6);
      g.restore(); return;
    }
    if (n.kind === 'granite') {
      g.rotate(n.rot * 0.2);
      if (!artNode(g, n, k, r, hit, t)) {
        const gr = g.createLinearGradient(-r, -r, r, r); gr.addColorStop(0, c[1]); gr.addColorStop(1, c[0]);
        g.fillStyle = hit ? '#fff' : gr; polyPath(g, n.shape, r * 1.05, 6); g.fill();
        g.strokeStyle = 'rgba(255,255,255,.18)'; g.lineWidth = 2; polyPath(g, n.shape, r * 0.7, 6); g.stroke();
      }
      g.strokeStyle = '#111'; g.lineWidth = 2; const broke = n.maxLayers - n.layers;
      for (let i = 0; i < broke * 2; i++) { const a = i * 2.1 + n.seed; g.beginPath(); g.moveTo(0, 0); g.lineTo(Math.cos(a) * r * 0.5, Math.sin(a) * r * 0.5); g.lineTo(Math.cos(a + 0.4) * r * 0.95, Math.sin(a + 0.4) * r * 0.95); g.stroke(); }
      g.rotate(-n.rot * 0.2);
      for (let i = 0; i < n.maxLayers; i++) { g.fillStyle = i < n.layers ? '#e9ecef' : 'rgba(0,0,0,.5)'; g.beginPath(); g.arc((i - (n.maxLayers - 1) / 2) * 10, -r - 6, 3.5, 0, 6.283); g.fill(); }
      g.restore(); return;
    }
    if (n.kind === 'sentinel') {
      const glow = 0.5 + 0.5 * Math.sin(t * (6 + (1 - n.life / n.lifeMax) * 14));
      if (!artNode(g, n, k, r, hit, t)) {
        g.rotate(n.rot);
        g.fillStyle = hit ? '#fff' : '#292524'; polyPath(g, n.shape, r * 1.05, 7); g.fill();
        g.strokeStyle = `rgba(249,115,22,${0.5 + glow * 0.5})`; g.lineWidth = 3; for (let i = 0; i < 4; i++) { const a = i * 1.57 + n.seed; g.beginPath(); g.moveTo(0, 0); g.lineTo(Math.cos(a) * r * 0.5, Math.sin(a) * r * 0.5); g.lineTo(Math.cos(a + 0.5) * r * 0.9, Math.sin(a + 0.5) * r * 0.9); g.stroke(); }
        g.rotate(-n.rot);
      }
      g.fillStyle = `rgba(253,230,138,${glow})`; g.beginPath(); g.arc(0, 0, r * 0.22, 0, 6.283); g.fill();
      g.strokeStyle = '#f97316'; g.lineWidth = 3; g.beginPath(); g.arc(0, 0, r + 9, -1.57, -1.57 + 6.283 * n.life / n.lifeMax); g.stroke();
      g.restore(); return;
    }
    if (n.kind === 'mother' || n.kind === 'vault') {
      const gl = 0.5 + 0.5 * Math.sin(t * 3 + n.seed), hc = n.kind === 'vault' ? '86,207,225' : '224,170,255';
      const halo = g.createRadialGradient(0, 0, r * 0.5, 0, 0, r * 2); halo.addColorStop(0, `rgba(${hc},${0.35 + 0.2 * gl})`); halo.addColorStop(1, `rgba(${hc},0)`); g.fillStyle = halo; g.beginPath(); g.arc(0, 0, r * 2, 0, 6.283); g.fill();
      if (!artNode(g, n, k, r, hit, t)) {
        if (n.kind === 'vault') { // a round stone door with a teal rune ring and a bolt cross
          g.fillStyle = hit ? '#fff' : '#374151'; g.beginPath(); g.arc(0, 0, r, 0, 6.283); g.fill();
          g.strokeStyle = '#111827'; g.lineWidth = 4; g.beginPath(); g.arc(0, 0, r * 0.8, 0, 6.283); g.stroke();
          g.strokeStyle = `rgba(86,207,225,${0.6 + 0.4 * gl})`; g.lineWidth = 2; for (let i = 0; i < 8; i++) { const a = i * 0.785 + t * 0.3; g.beginPath(); g.moveTo(Math.cos(a) * r * 0.62, Math.sin(a) * r * 0.62); g.lineTo(Math.cos(a + 0.2) * r * 0.72, Math.sin(a + 0.2) * r * 0.72); g.stroke(); }
          g.fillStyle = '#9ca3af'; g.fillRect(-r * 0.45, -4, r * 0.9, 8); g.fillRect(-4, -r * 0.45, 8, r * 0.9); g.fillStyle = '#56cfe1'; g.beginPath(); g.arc(0, 0, 6, 0, 6.283); g.fill();
        } else {
          g.rotate(n.rot); g.fillStyle = hit ? '#fff' : '#3d2c1e'; polyPath(g, n.shape, r * 1.08); g.fill();
          const inner = g.createRadialGradient(0, 0, 2, 0, 0, r * 0.8); inner.addColorStop(0, '#240046'); inner.addColorStop(1, '#7b2cbf'); g.fillStyle = inner; g.beginPath(); g.arc(0, 0, r * 0.78, 0, 6.283); g.fill();
          for (let i = 0; i < 9; i++) { g.save(); g.rotate(i * 0.698); g.translate(r * 0.78, 0); g.rotate(3.14); const pg = g.createLinearGradient(0, -5, 0, 5); pg.addColorStop(0, c[2]); pg.addColorStop(1, c[1]); g.fillStyle = pg; prism(g, r * (0.45 + 0.15 * Math.sin(i * 3)), 4.5); g.fill(); g.restore(); }
          g.rotate(-n.rot);
        }
      }
      g.fillStyle = '#fff'; for (let i = 0; i < 3; i++) { const a = t * 1.5 + i * 2.1, q = (Math.sin(t * 4 + i * 2) + 1) / 2; star(g, Math.cos(a) * r * 0.5, Math.sin(a) * r * 0.5, 2 + 4 * q); }
      g.restore(); hpArc(g, n, r); return;
    }
    if (artNode(g, n, k, r, hit, t)) { /* raster ore */ }
    else if (k.prism) {
      g.rotate(n.rot);
      // crystals: a bed of rock with prisms bursting out of it
      g.fillStyle = hit ? '#fff' : '#3b2f26'; polyPath(g, n.shape, r * 0.62); g.fill();
      const m = n.kind === 'shard' ? 3 : 5;
      for (let i = 0; i < m; i++) {
        g.save(); g.rotate(-1.57 + (i - (m - 1) / 2) * 0.55 + Math.sin(n.seed + i) * 0.15);
        const len = r * (0.95 + 0.3 * Math.sin(n.seed * 3 + i * 1.7)), w = r * 0.2;
        const pg = g.createLinearGradient(0, -w, 0, w); pg.addColorStop(0, hit ? '#fff' : c[2]); pg.addColorStop(0.5, c[1]); pg.addColorStop(1, c[0]);
        g.fillStyle = pg; prism(g, len, w); g.fill(); g.strokeStyle = 'rgba(255,255,255,.35)'; g.lineWidth = 1; g.beginPath(); g.moveTo(2, -w * 0.3); g.lineTo(len * 0.7, -w * 0.3); g.stroke();
        g.restore();
      }
      const tw = (Math.sin(t * 3 + n.seed) + 1) / 2; if (tw > 0.85) { g.fillStyle = '#fff'; star(g, -r * 0.2, -r * 0.6, 4 * (tw - 0.85) * 7); }
      g.rotate(-n.rot);
    } else {
      g.rotate(n.rot);
      // ore: a host rock with metal chunks embedded, metals catch a moving glint
      const hg = g.createRadialGradient(-r * 0.3, -r * 0.3, 2, 0, 0, r * 1.1); hg.addColorStop(0, '#6b5847'); hg.addColorStop(1, '#2e241b');
      g.fillStyle = hit ? '#fff' : hg; polyPath(g, n.shape, r); g.fill();
      for (let i = 0; i < 3; i++) {
        const a = n.seed + i * 2.1, d = r * (i === 0 ? 0.05 : 0.42), cr = r * (i === 0 ? 0.5 : 0.3);
        g.save(); g.translate(Math.cos(a) * d, Math.sin(a) * d); g.rotate(a);
        const og = g.createLinearGradient(-cr, -cr, cr, cr); og.addColorStop(0, c[2]); og.addColorStop(0.45, c[1]); og.addColorStop(1, c[0]);
        g.fillStyle = og; g.beginPath(); g.moveTo(-cr, -cr * 0.3); g.lineTo(-cr * 0.2, -cr); g.lineTo(cr, -cr * 0.4); g.lineTo(cr * 0.6, cr * 0.8); g.lineTo(-cr * 0.5, cr * 0.7); g.closePath(); g.fill();
        g.restore();
      }
      if (k.metal || n.kind === 'iron') { const q = ((t * 0.6 + n.seed) % 2.2) - 0.6; if (q > 0 && q < 1) { g.globalAlpha = Math.sin(q * 3.14) * 0.8; g.fillStyle = '#fff'; g.beginPath(); g.ellipse(-r * 0.6 + q * r * 1.2, -r * 0.1, 2.5, r * 0.5, 0.5, 0, 6.283); g.fill(); g.globalAlpha = 1; } }
      g.rotate(-n.rot);
    }
    if (n.glint) { g.fillStyle = '#fff8dc'; const a = t * 2 + n.seed; star(g, Math.cos(a) * r * 0.7, Math.sin(a) * r * 0.7, 5 + 2 * Math.sin(t * 9)); star(g, Math.cos(a + 3) * r * 0.5, Math.sin(a + 3) * r * 0.5, 3); }
    g.restore();
    hpArc(g, n, r);
  }
  function hpArc(g, n, r) { if (n.hp < n.max && n.hp > 0) { g.strokeStyle = 'rgba(255,255,255,.75)'; g.lineWidth = 3; g.beginPath(); g.arc(n.x, n.y, r + 6, -1.57, -1.57 + 6.283 * (n.hp / n.max)); g.stroke(); } }
  function star(g, x, y, r) { g.beginPath(); for (let i = 0; i < 8; i++) { const a = i * 0.785, q = i % 2 ? r * 0.3 : r; g.lineTo(x + Math.cos(a) * q, y + Math.sin(a) * q); } g.closePath(); g.fill(); }
  function drawFlask(g, f, t) {
    if (f.life - f.t < 1.2 && Math.sin(t * 22) < 0) return;
    const y = f.y + Math.sin(t * 4 + f.x) * 3;
    g.save(); g.translate(f.x, y);
    const pulse = (t * 1.5) % 1; g.strokeStyle = `rgba(255,183,3,${0.6 * (1 - pulse)})`; g.lineWidth = 2; g.beginPath(); g.arc(0, 0, 14 + pulse * 18, 0, 6.283); g.stroke();
    const gl = g.createRadialGradient(0, 2, 2, 0, 2, 26); gl.addColorStop(0, 'rgba(255,183,3,.35)'); gl.addColorStop(1, 'rgba(255,183,3,0)'); g.fillStyle = gl; g.beginPath(); g.arc(0, 2, 26, 0, 6.283); g.fill();
    if (SPR(g, 'obj-flask', 0, 0, 30)) { g.restore(); return; }
    const bg = g.createLinearGradient(-11, 0, 11, 0); bg.addColorStop(0, '#9c4a00'); bg.addColorStop(0.4, '#ffb703'); bg.addColorStop(1, '#7a3800');
    g.fillStyle = bg; rr(g, -11, -6, 22, 20, 7); g.fill(); g.fillStyle = '#c99a6b'; g.fillRect(-4, -13, 8, 8); g.fillStyle = '#6f4518'; g.fillRect(-5, -16, 10, 4);
    g.fillStyle = 'rgba(255,255,255,.55)'; g.fillRect(-7, -3, 3, 12);
    g.restore();
  }
  function drawBomb(g, b, t) {
    g.save(); g.translate(b.x, b.y); g.rotate(-0.4);
    if (SPR(g, 'obj-dynamite', 0, 0, 34)) { g.restore(); return; }
    g.fillStyle = '#c1121f'; rr(g, -6, -16, 12, 30, 3); g.fill(); g.fillStyle = '#780000'; g.fillRect(-6, -6, 12, 3); g.fillRect(-6, 4, 12, 3);
    g.strokeStyle = '#444'; g.lineWidth = 2; g.beginPath(); g.moveTo(0, -16); g.quadraticCurveTo(6, -22, 4, -26); g.stroke();
    g.fillStyle = Math.sin(t * 50) > 0 ? '#fff3b0' : '#ffb703'; g.beginPath(); g.arc(4, -27, 4 + Math.random() * 2, 0, 6.283); g.fill();
    g.restore();
  }
  function drawCart(g, c, t) {
    if (SPR(g, 'obj-cart', c.x, c.y - 3 + Math.abs(Math.sin(c.spin || 0)) * -2, 36, undefined, { flip: c.dir === -1 })) return;
    g.save(); g.translate(c.x, c.y); g.scale(c.dir || 1, 1);
    const wg = g.createLinearGradient(0, -10, 0, 6); wg.addColorStop(0, '#8b5e3c'); wg.addColorStop(1, '#4a3222');
    g.fillStyle = '#e09f3e'; g.beginPath(); g.arc(-5, -9, 5, 0, 6.283); g.arc(3, -10, 6, 0, 6.283); g.arc(9, -8, 4, 0, 6.283); g.fill();
    g.fillStyle = wg; g.beginPath(); g.moveTo(-15, -8); g.lineTo(15, -8); g.lineTo(12, 5); g.lineTo(-12, 5); g.closePath(); g.fill();
    g.strokeStyle = '#adb5bd'; g.lineWidth = 2; g.beginPath(); g.moveTo(-15, -8); g.lineTo(15, -8); g.stroke(); g.strokeStyle = '#2b1d14'; g.lineWidth = 1; g.beginPath(); g.moveTo(-5, -7); g.lineTo(-4, 4); g.moveTo(5, -7); g.lineTo(4, 4); g.stroke();
    for (const wx of [-8, 8]) { g.save(); g.translate(wx, 6); g.rotate(c.spin || 0); g.fillStyle = '#222'; g.beginPath(); g.arc(0, 0, 4.5, 0, 6.283); g.fill(); g.strokeStyle = '#888'; g.lineWidth = 1.2; g.beginPath(); g.moveTo(-4, 0); g.lineTo(4, 0); g.moveTo(0, -4); g.lineTo(0, 4); g.stroke(); g.restore(); }
    g.fillStyle = 'rgba(255,220,140,.9)'; g.beginPath(); g.arc(14, -12, 2.5, 0, 6.283); g.fill();
    g.restore();
  }
  function drawHeart(g, B, t) {
    const hit = Math.max(0, 1 - (t - B.hitT) * 10), beat = Math.pow(Math.max(0, Math.sin(t * [0, 3.6, 5.5, 7][B.phase])), 6), pulse = 1 + beat * 0.06;
    g.save(); g.translate(B.x + (Math.random() - 0.5) * hit * 6, B.y);
    const awake = B.phase >= 2, gr = g.createRadialGradient(0, 0, 4, 0, 0, B.r * 2.2);
    gr.addColorStop(0, awake ? `rgba(249,115,22,${0.45 + beat * 0.3})` : `rgba(255,90,90,${0.35 + beat * 0.3})`); gr.addColorStop(1, 'rgba(255,90,90,0)');
    g.fillStyle = gr; g.beginPath(); g.arc(0, 0, B.r * 2.2, 0, 6.283); g.fill();
    if (ART('boss-heart')) { // raster heart: pulse by scale, flash on hit, orange cracks when awake
      g.scale(pulse, pulse); SPR(g, 'boss-heart', 0, 0, B.r * 2.5);
      if (hit > 0 || awake) { g.globalCompositeOperation = 'lighter'; SPR(g, 'boss-heart', 0, 0, B.r * 2.5, undefined, { alpha: Math.max(hit * 0.6, awake ? 0.18 + beat * 0.25 : 0) }); g.globalCompositeOperation = 'source-over'; }
      g.restore(); return;
    }
    // roots of stone holding it in the face
    g.strokeStyle = '#2b1d14'; g.lineWidth = 10; g.lineCap = 'round';
    for (let i = 0; i < 6; i++) { const a = i * 1.047 + 0.5; g.beginPath(); g.moveTo(Math.cos(a) * B.r * 0.8, Math.sin(a) * B.r * 0.8); g.quadraticCurveTo(Math.cos(a + 0.3) * B.r * 1.5, Math.sin(a + 0.3) * B.r * 1.5, Math.cos(a) * B.r * 2.1, Math.sin(a) * B.r * 2.1); g.stroke(); }
    g.lineCap = 'butt';
    g.scale(pulse, pulse);
    const body = g.createRadialGradient(-B.r * 0.3, -B.r * 0.4, 4, 0, 0, B.r * 1.2); body.addColorStop(0, hit ? '#fff' : '#ff8fa3'); body.addColorStop(0.5, awake ? '#e85d04' : '#d62828'); body.addColorStop(1, '#6a040f');
    g.fillStyle = body; g.beginPath();
    for (let i = 0; i < 6; i++) { const a = i / 6 * 6.283 + 0.5; g.lineTo(Math.cos(a) * B.r, Math.sin(a) * B.r * 1.18); } g.closePath(); g.fill();
    g.strokeStyle = 'rgba(255,200,200,.35)'; g.lineWidth = 2; g.beginPath(); for (let i = 0; i < 6; i++) { const a = i / 6 * 6.283 + 0.5; g.moveTo(0, 0); g.lineTo(Math.cos(a) * B.r, Math.sin(a) * B.r * 1.18); } g.stroke();
    g.fillStyle = 'rgba(255,255,255,.55)'; g.beginPath(); g.moveTo(-B.r * 0.35, -B.r * 0.65); g.lineTo(B.r * 0.05, -B.r * 0.15); g.lineTo(-B.r * 0.45, -B.r * 0.05); g.fill();
    if (awake || B.hp < B.max * 0.75) { g.strokeStyle = awake ? `rgba(253,230,138,${0.6 + beat * 0.4})` : 'rgba(0,0,0,.5)'; g.lineWidth = awake ? 3 : 2; g.beginPath(); g.moveTo(-B.r * 0.1, -B.r * 0.9); g.lineTo(B.r * 0.15, -B.r * 0.3); g.lineTo(-B.r * 0.05, B.r * 0.1); g.lineTo(B.r * 0.3, B.r * 0.7); if (awake) { g.moveTo(B.r * 0.15, -B.r * 0.3); g.lineTo(B.r * 0.6, -B.r * 0.2); g.moveTo(-B.r * 0.05, B.r * 0.1); g.lineTo(-B.r * 0.6, B.r * 0.4); } g.stroke(); }
    g.restore();
  }
  function drawDrill(g, x, y, r, t, R) {
    const f = R.focus || 0;
    g.strokeStyle = `rgba(255,230,180,${0.4 + f * 0.4})`; g.lineWidth = 2 + f * 2; g.fillStyle = 'rgba(255,220,160,.07)';
    g.beginPath(); g.arc(x, y, r, 0, 6.283); g.fill(); g.stroke();
    if (f > 0.05) { g.strokeStyle = '#90e0ef'; g.lineWidth = 3; g.beginPath(); g.arc(x, y, r + 5, -1.57, -1.57 + 6.283 * f); g.stroke(); }
    g.save(); g.translate(x, y); g.rotate(t * (R.drilling ? 24 : 12));
    for (let i = 0; i < 3; i++) { g.rotate(2.094); const bg = g.createLinearGradient(0, -r * 0.12, 0, r * 0.12); bg.addColorStop(0, '#f1f3f5'); bg.addColorStop(1, '#868e96'); g.fillStyle = bg; g.beginPath(); g.moveTo(0, -r * 0.08); g.lineTo(r * 0.5, -r * 0.14); g.lineTo(r * 0.58, 0); g.lineTo(r * 0.5, r * 0.14); g.lineTo(0, r * 0.08); g.fill(); }
    const hub = g.createRadialGradient(-2, -2, 1, 0, 0, r * 0.18); hub.addColorStop(0, '#ffd166'); hub.addColorStop(1, '#7c4a03'); g.fillStyle = hub; g.beginPath(); g.arc(0, 0, r * 0.17, 0, 6.283); g.fill();
    g.restore();
    if (R.drilling) { g.fillStyle = '#ffd166'; for (let i = 0; i < 3; i++) { const a = Math.random() * 6.283, d = r * (0.6 + Math.random() * 0.5); g.beginPath(); g.arc(x + Math.cos(a) * d, y + Math.sin(a) * d, 1.6, 0, 6.283); g.fill(); } }
  }
  function drawFace(g, who, x, y, r) {
    g.save(); g.translate(x, y);
    const skin = (cx, cy, rad) => { const sg = g.createRadialGradient(cx - rad * 0.3, cy - rad * 0.3, 2, cx, cy, rad); sg.addColorStop(0, '#ffe0c2'); sg.addColorStop(1, '#d9a27a'); return sg; };
    const eyes = (dx, ey, er, col = '#222') => { g.fillStyle = col; g.beginPath(); g.arc(-dx, ey, er, 0, 6.283); g.arc(dx, ey, er, 0, 6.283); g.fill(); g.fillStyle = '#fff'; g.beginPath(); g.arc(-dx + er * 0.35, ey - er * 0.35, er * 0.35, 0, 6.283); g.arc(dx + er * 0.35, ey - er * 0.35, er * 0.35, 0, 6.283); g.fill(); };
    if (who === 'dwarf') {
      g.fillStyle = skin(0, -4, r * 0.7); g.beginPath(); g.arc(0, -4, r * 0.7, 0, 6.283); g.fill();
      const bg = g.createLinearGradient(0, 0, 0, r * 1.2); bg.addColorStop(0, '#c26a2a'); bg.addColorStop(1, '#7a3e12'); g.fillStyle = bg; g.beginPath(); g.moveTo(-r * 0.75, -r * 0.05); g.quadraticCurveTo(-r * 0.5, r * 1.3, 0, r * 1.25); g.quadraticCurveTo(r * 0.5, r * 1.3, r * 0.75, -r * 0.05); g.quadraticCurveTo(0, r * 0.35, -r * 0.75, -r * 0.05); g.fill();
      g.fillStyle = '#a0522d'; g.beginPath(); g.ellipse(-r * 0.2, r * 0.12, r * 0.24, r * 0.09, 0.3, 0, 6.283); g.ellipse(r * 0.2, r * 0.12, r * 0.24, r * 0.09, -0.3, 0, 6.283); g.fill();
      const hg = g.createLinearGradient(0, -r * 1.3, 0, -r * 0.5); hg.addColorStop(0, '#ffd166'); hg.addColorStop(1, '#e09f00'); g.fillStyle = hg; g.beginPath(); g.arc(0, -r * 0.5, r * 0.76, 3.14, 6.283); g.fill(); g.fillRect(-r * 0.86, -r * 0.55, r * 1.72, r * 0.12);
      g.fillStyle = '#fff3b0'; g.beginPath(); g.arc(0, -r * 0.92, r * 0.15, 0, 6.283); g.fill(); g.fillStyle = 'rgba(255,243,176,.25)'; g.beginPath(); g.arc(0, -r * 0.92, r * 0.3, 0, 6.283); g.fill();
      g.fillStyle = '#e8956a'; g.beginPath(); g.arc(0, -r * 0.02, r * 0.13, 0, 6.283); g.fill();
      eyes(r * 0.27, -r * 0.18, 3);
    } else if (who === 'gnome') {
      g.fillStyle = skin(0, 2, r * 0.6); g.beginPath(); g.arc(0, 2, r * 0.6, 0, 6.283); g.fill();
      const hg = g.createLinearGradient(-r * 0.6, 0, r * 0.6, 0); hg.addColorStop(0, '#9d0208'); hg.addColorStop(0.5, '#e63946'); hg.addColorStop(1, '#9d0208'); g.fillStyle = hg; g.beginPath(); g.moveTo(-r * 0.7, -r * 0.1); g.quadraticCurveTo(-r * 0.1, -r * 0.8, r * 0.25, -r * 1.35); g.quadraticCurveTo(r * 0.2, -r * 0.6, r * 0.7, -r * 0.1); g.fill();
      g.fillStyle = '#f1f1f1'; g.beginPath(); g.moveTo(-r * 0.55, r * 0.2); g.quadraticCurveTo(0, r * 1.35, r * 0.55, r * 0.2); g.quadraticCurveTo(0, r * 0.45, -r * 0.55, r * 0.2); g.fill();
      g.strokeStyle = '#6c584c'; g.lineWidth = 2; g.beginPath(); g.arc(-r * 0.22, 0, 6, 0, 6.283); g.arc(r * 0.22, 0, 6, 0, 6.283); g.stroke();
      g.fillStyle = '#90e0ef'; g.beginPath(); g.arc(-r * 0.22, 0, 5, 0, 6.283); g.arc(r * 0.22, 0, 5, 0, 6.283); g.fill(); eyes(r * 0.22, 0, 2.2);
      g.fillStyle = '#ffadad'; g.beginPath(); g.arc(0, r * 0.18, r * 0.12, 0, 6.283); g.fill();
    } else if (who === 'mole') {
      const fg = g.createRadialGradient(-r * 0.3, -r * 0.3, 2, 0, 0, r); fg.addColorStop(0, '#8e7aa0'); fg.addColorStop(1, '#4a3b57'); g.fillStyle = fg; g.beginPath(); g.ellipse(0, 0, r * 0.82, r * 0.72, 0, 0, 6.283); g.fill();
      g.fillStyle = '#ffafcc'; g.beginPath(); g.ellipse(0, r * 0.18, r * 0.22, r * 0.18, 0, 0, 6.283); g.fill(); g.fillStyle = '#fff'; g.beginPath(); g.arc(-r * 0.06, r * 0.12, r * 0.05, 0, 6.283); g.fill();
      g.strokeStyle = 'rgba(255,255,255,.4)'; g.lineWidth = 1; g.beginPath(); for (const sd of [-1, 1]) for (let i = -1; i <= 1; i++) { g.moveTo(sd * r * 0.25, r * 0.2 + i * 3); g.lineTo(sd * r * 0.6, r * 0.15 + i * 6); } g.stroke();
      g.fillStyle = '#ffe5ec'; for (const sd of [-1, 1]) { g.beginPath(); g.ellipse(sd * r * 0.72, r * 0.48, r * 0.24, r * 0.13, sd * 0.3, 0, 6.283); g.fill(); g.strokeStyle = '#d4a5b5'; g.beginPath(); for (let i = -1; i <= 1; i++) { g.moveTo(sd * (r * 0.72 + i * 5), r * 0.42); g.lineTo(sd * (r * 0.74 + i * 6), r * 0.58); } g.stroke(); }
      eyes(r * 0.26, -r * 0.18, 2.6, '#111');
    } else {
      // Cinder the Salamander: frilly gills, golden spots, ember-bright eyes
      for (const sd of [-1, 1]) for (let i = 0; i < 3; i++) { g.save(); g.translate(sd * r * 0.62, -r * 0.2 + i * r * 0.22); g.rotate(sd * (-0.6 + i * 0.4)); const fg = g.createLinearGradient(0, 0, sd * r * 0.45, 0); fg.addColorStop(0, '#ff5d8f'); fg.addColorStop(1, '#ffb3c6'); g.fillStyle = fg; g.beginPath(); g.ellipse(sd * r * 0.2, 0, r * 0.24, r * 0.07, 0, 0, 6.283); g.fill(); g.restore(); }
      const hg = g.createRadialGradient(-r * 0.25, -r * 0.3, 2, 0, 0, r * 0.85); hg.addColorStop(0, '#ffb347'); hg.addColorStop(0.6, '#f3722c'); hg.addColorStop(1, '#9d2708'); g.fillStyle = hg; g.beginPath(); g.ellipse(0, 0, r * 0.7, r * 0.62, 0, 0, 6.283); g.fill();
      g.fillStyle = '#ffd166'; for (const [px, py, pr] of [[-0.35, -0.35, 0.08], [0.1, -0.48, 0.06], [0.4, -0.3, 0.07], [-0.45, 0.2, 0.05]]) { g.beginPath(); g.arc(px * r, py * r, pr * r, 0, 6.283); g.fill(); }
      g.fillStyle = '#ffd6a5'; g.beginPath(); g.ellipse(0, r * 0.3, r * 0.42, r * 0.2, 0, 0, 6.283); g.fill();
      g.strokeStyle = '#7a1e00'; g.lineWidth = 2; g.beginPath(); g.arc(0, r * 0.12, r * 0.3, 0.4, 2.74); g.stroke();
      g.fillStyle = '#111'; g.beginPath(); g.arc(-r * 0.3, -r * 0.08, r * 0.14, 0, 6.283); g.arc(r * 0.3, -r * 0.08, r * 0.14, 0, 6.283); g.fill();
      g.fillStyle = '#ffd166'; g.beginPath(); g.arc(-r * 0.27, -r * 0.12, r * 0.05, 0, 6.283); g.arc(r * 0.33, -r * 0.12, r * 0.05, 0, 6.283); g.fill();
      g.fillStyle = 'rgba(255,183,3,.9)'; g.beginPath(); g.moveTo(0, -r * 0.62); g.quadraticCurveTo(r * 0.15, -r * 0.85, 0, -r * 1.05); g.quadraticCurveTo(-r * 0.12, -r * 0.85, 0, -r * 0.62); g.fill();
    }
    g.restore();
  }

  function baseStats(who) {
    const s = { radius: 36, dps: 6, oil: 12, drain: 1, spawn: 0.62, maxNodes: 12, hp: 4, value: 1, crit: 0, splash: 0, splashR: 70, helpers: 0, helperDps: 3,
      cartSpeed: 1, big: 0, gem: 0, cluster: 0, onPop: 0, crowd: 0, quake: 0, quakeEvery: 3.2,
      depth0: 0, smith: 1, passes: 3, mother: 0.004, flaskEvery: 9, flaskOil: 1.5, caveCost: 1, gasCost: 1, gasR: 95, gasFeed: 0, streakWin: 0.9, streakPay: 1,
      mag: 0, magR: 110, steady: 0, flux: 0, dyna: 0, dynaR: 95, dynaDmg: 12, ember: 0, emberLife: 0.9, ale: 0, hopper: 0, shockOil: 0,
      overfill: 0, lastLight: 0, glint: 0.025, glintPay: 5, depthMul: 1, gasPay: 0 };
    if (who === 'dwarf') { s.radius += 6; s.passes = 2; } // dwarves read stone: hard rock needs one pass fewer
    if (who === 'gnome') { s.dps *= 0.7; s.helpers = 2; }
    if (who === 'mole') { s.quake = 6; s.dps *= 0.8; }
    if (who === 'sala') { s.dps *= 0.75; s.radius -= 4; s.ember = 0.9; }
    return s;
  }

  const CONFIG = {
    id: 'ore-sweeper', title: 'Ore Sweeper', tagline: 'Drag your drill across the rock face, crack ore before the lamp burns out, and dig your way to the Heart of the Mountain.',
    howTo: 'Hold and drag to drill. Ore under the drill cracks, and every crack takes you deeper: silver, gold, crystal and worse lie below. Each new layer has a miner\'s cache with a boost to pick. Grab oil flasks to keep the lamp lit, and spend ore on the upgrade map between digs.',
    runVerb: 'Dig!', winTitle: 'The Heart is yours!', loseTitle: 'Lamp burned out', scoreName: 'depth (m)',
    colors: { accent: '#ffb703', bg: '#17120d', card: '#2a2118' },
    currencies: [{ id: 'ore', name: 'ore', color: '#ffb703' }, { id: 'gems', name: 'gems', color: '#e0aaff' }],
    characters: [
      { id: 'dwarf', name: 'Brakka the Dwarf', blurb: 'A big drill. Hard rock breaks faster and pays her well.', unlock: 0 },
      { id: 'gnome', name: 'Fizzwick the Gnome', blurb: 'Weak drill, but brings clockwork mine carts.', unlock: 1 },
      { id: 'mole', name: 'Grub the Mole', blurb: 'Every few seconds a tremor hits every node.', unlock: 2 },
      { id: 'sala', name: 'Cinder the Salamander', blurb: 'Leaves a trail of embers that burns ore. Sweep wide!', unlock: 3 },
    ],
    drawFace, nodes: NODES, touchOffset: 50, hoverIsDown: true, baseStats, createRun,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = { CONFIG, NODES, KINDS, STRATA, HEART_HP, baseStats, createRun };
  if (typeof window !== 'undefined' && typeof Kit !== 'undefined') { K = Kit.game(CONFIG); window.OreSweeper = { NODES, HEART_HP, kit: K }; }
})();
