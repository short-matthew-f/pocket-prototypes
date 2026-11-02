// Hoard: you are a young dragon. Tap villages to send kobolds raiding, spend the loot mid-run on more raiders and
// defenders (the snowball), and burn the knights who march on your cave. At dawn the kingdom's siege engines roll up
// and start lobbing boulders at your wall: that is what ends a long run. Gnorp-style automation, fantasy clothes.
// The simulation model (Model.*) is DOM-free so sim.js can run it in node; the kit glue lives at the bottom.
(function () {
  'use strict';
  const NODES = [
    { id: 'brood', name: 'Bigger Brood', icon: '🥚', desc: (l) => `+1 starting kobold (now +${l})`, cost: 5, grow: 1.7, max: 6, req: [], x: 0, y: 0, fx: (s, l) => { s.kobolds += l; } },
    // ---- raiding (right)
    { id: 'packs', name: 'Deep Pockets', icon: '👝', desc: (l) => `+30% gold per haul (now +${30 * l}%)`, cost: 8, grow: 1.5, max: 12, req: ['brood'], x: 1, y: 0, fx: (s, l) => { s.carry *= 1 + 0.3 * l; } },
    { id: 'legs', name: 'Quick Feet', icon: '🦶', desc: (l) => `+15% minion speed (now x${(1.15 ** l).toFixed(2)})`, cost: 12, grow: 1.6, max: 8, req: ['packs'], x: 2, y: 0, fx: (s, l) => { s.speed *= 1.15 ** l; } },
    { id: 'thief', name: "Thieves' Guild", icon: '🗡️', desc: 'Hire Thieves mid-run: fast raiders that need no tapping', cost: 40, max: 1, req: ['legs'], x: 3, y: 0, fx: (s) => { s.has.thief = 1; } },
    { id: 'thief2', name: 'Cutpurses', icon: '🪙', desc: 'Thieves +30% haul', cost: 90, grow: 1.8, max: 6, req: ['thief'], x: 4, y: 0, fx: (s, l) => { s.thiefHaul *= 1 + 0.3 * l; } },
    { id: 'thief3', name: 'Jewel Thieves', icon: '💍', desc: 'Each Thief haul has a 2% chance to lift a gem', cost: 3, grow: 1.9, max: 3, req: ['thief2'], x: 5, y: 0, cur: 'gems', fx: (s, l) => { s.thiefGem += 0.02 * l; } },
    { id: 'mill', name: 'Raid the Mill', icon: '🌾', desc: 'Unlocks the Mill (7 gold a haul). Treasure caravans start to pass', cost: 20, max: 1, req: ['packs'], x: 1, y: -1, fx: (s) => { s.has.mill = 1; } },
    { id: 'caravan', name: 'Highwaymen', icon: '🐴', desc: 'Caravans come 25% more often and carry +50% gold', cost: 60, grow: 1.8, max: 5, req: ['mill'], x: 2, y: -1, fx: (s, l) => { s.caravanX *= 1.25 ** l; s.caravanGold *= 1 + 0.5 * l; } },
    { id: 'market', name: 'Market Day', icon: '⚖️', desc: 'The Mill and Town yield +35%', cost: 200, grow: 1.8, max: 6, req: ['caravan'], x: 3, y: -1, fx: (s, l) => { s.villX *= 1 + 0.35 * l; } },
    { id: 'town', name: 'Raid the Town', icon: '🏘️', desc: 'Unlocks the Town: far away, big hauls', cost: 140, max: 1, req: ['mill'], x: 1, y: -2, fx: (s) => { s.has.town = 1; } },
    { id: 'wagon', name: 'Wagon Works', icon: '🛒', desc: 'Buy Wagons mid-run: slow, auto, carry 6x', cost: 260, max: 1, req: ['town'], x: 2, y: -2, fx: (s) => { s.has.wagon = 1; } },
    { id: 'oxen', name: 'Oxen', icon: '🐂', desc: 'Wagons carry +40%', cost: 400, grow: 1.7, max: 6, req: ['wagon'], x: 3, y: -2, fx: (s, l) => { s.wagonHaul *= 1 + 0.4 * l; } },
    { id: 'roads', name: 'Cobbled Roads', icon: '🛤️', desc: 'Wagons and Sappers travel 20% faster', cost: 700, grow: 1.8, max: 5, req: ['oxen'], x: 4, y: -2, fx: (s, l) => { s.autoSpeed *= 1.2 ** l; } },
    { id: 'sapper', name: 'Sapper Corps', icon: '💣', desc: 'Hire Sappers mid-run: they raid the Castle for gold and gems', cost: 700, max: 1, req: ['wagon'], x: 2, y: -3, fx: (s) => { s.has.sapper = 1; } },
    { id: 'gemsense', name: 'Gem Sense', icon: '🔍', desc: 'Sappers: +8% gem chance', cost: 3, grow: 1.8, max: 5, req: ['sapper'], x: 3, y: -3, cur: 'gems', fx: (s, l) => { s.gemChance += 0.08 * l; } },
    { id: 'powder', name: 'Black Powder', icon: '🧨', desc: 'Sappers haul +40%', cost: 1100, grow: 1.7, max: 6, req: ['sapper'], x: 1, y: -4, fx: (s, l) => { s.sapperHaul *= 1 + 0.4 * l; } },
    // ---- economy (down)
    { id: 'foreman', name: 'Kobold Foreman', icon: '📯', desc: (l) => `Idle kobolds head out alone every ${(4.5 - Math.min(4, l + 1)).toFixed(1)}s`, cost: 30, grow: 1.9, max: 4, req: ['brood'], x: 0, y: 1, fx: (s, l) => { s.foreman = 4.5 - l; } },
    { id: 'haggle', name: 'Haggling', icon: '🤝', desc: 'In-run prices -8%', cost: 60, grow: 1.8, max: 6, req: ['foreman'], x: 1, y: 1, fx: (s, l) => { s.price *= 0.92 ** l; } },
    { id: 'bank', name: 'Treasurer', icon: '📜', desc: '+10% of raided gold banks as renown', cost: 80, grow: 1.9, max: 5, req: ['haggle'], x: 2, y: 1, fx: (s, l) => { s.bank += 0.1 * l; } },
    { id: 'bed', name: 'Gilded Bed', icon: '🛏️', desc: 'Start each run with 40 gold', cost: 2, grow: 1.8, max: 5, req: ['bank'], x: 3, y: 1, cur: 'gems', fx: (s, l) => { s.startGold += 40 * l; } },
    { id: 'gild', name: 'Gilded Scales', icon: '✨', desc: '+20% renown from every run', cost: 3, grow: 1.9, max: 4, req: ['bed'], x: 4, y: 1, cur: 'gems', fx: (s, l) => { s.renownX *= 1 + 0.2 * l; } },
    { id: 'tithe', name: 'Tithes', icon: '🔔', desc: (l) => `Villages pay +1.5 gold a second (now ${1.5 * l})`, cost: 120, grow: 1.8, max: 6, req: ['haggle'], x: 2, y: 2, fx: (s, l) => { s.tithe += 1.5 * l; } },
    { id: 'bank2', name: 'Royal Ledger', icon: '🏦', desc: '+15% renown from every run', cost: 400, grow: 1.9, max: 5, req: ['bank'], x: 3, y: 2, fx: (s, l) => { s.renownX *= 1 + 0.15 * l; } },
    { id: 'warren', name: 'Kobold Warren', icon: '🕳️', desc: '+3 starting kobolds', cost: 2, grow: 1.8, max: 4, req: ['haggle'], x: 1, y: 2, cur: 'gems', fx: (s, l) => { s.kobolds += 3 * l; } },
    // ---- warband (down): kobolds fight. One of two build directions for defence.
    { id: 'spears', name: 'Kobold Spears', icon: '🔱', desc: 'Warband path: kobolds on the road stab passing knights', cost: 90, grow: 1.8, max: 6, req: ['foreman'], x: 0, y: 2, fx: (s, l) => { s.spear += 0.3 * l; } },
    { id: 'snare', name: 'Snare Traps', icon: '🪤', desc: 'Stabbed knights march at half speed for a moment', cost: 160, grow: 1.9, max: 3, req: ['spears'], x: 0, y: 3, fx: (s, l) => { s.snare = 0.5 + 0.4 * l; } },
    { id: 'chief', name: 'Kobold Chieftain', icon: '🪖', desc: 'Spears +60%, and each kobold you hire brings a friend', cost: 450, grow: 2, max: 4, req: ['snare'], x: 1, y: 3, fx: (s, l) => { s.spear *= 1.6 ** l; s.twin = 1; } },
    // ---- defence (left / up)
    { id: 'fire', name: 'Hotter Breath', icon: '🔥', desc: (l) => `+40% fire damage (now x${(1.4 ** l).toFixed(1)})`, cost: 6, grow: 1.55, max: 12, req: ['brood'], x: -1, y: 0, fx: (s, l) => { s.fire *= 1.4 ** l; } },
    { id: 'quick', name: 'Quick Breath', icon: '💨', desc: 'Breathe 12% more often', cost: 15, grow: 1.7, max: 6, req: ['fire'], x: -2, y: 0, fx: (s, l) => { s.fireCd *= 0.88 ** l; } },
    { id: 'wide', name: 'Wide Flame', icon: '🌋', desc: (l) => `+8px blast radius (now +${8 * l}px)`, cost: 30, grow: 1.7, max: 6, req: ['quick'], x: -3, y: 0, fx: (s, l) => { s.fireR += 8 * l; } },
    { id: 'dfire', name: 'Dragonfire', icon: '☄️', desc: '+50% fire damage', cost: 3, grow: 1.8, max: 5, req: ['wide'], x: -4, y: 0, cur: 'gems', fx: (s, l) => { s.fire *= 1.5 ** l; } },
    { id: 'scorch', name: 'Scorched Earth', icon: '🔥', desc: 'Breath leaves burning ground for 1.6s', cost: 180, grow: 1.8, max: 5, req: ['wide'], x: -3, y: -1, fx: (s, l) => { s.scorch += 0.3 * l; } },
    { id: 'bounty', name: 'Bounty Hunter', icon: '💰', desc: 'Knights drop +60% gold', cost: 140, grow: 1.8, max: 5, req: ['dfire'], x: -5, y: 0, fx: (s, l) => { s.bountyX *= 1 + 0.6 * l; } },
    { id: 'ransom', name: 'Ransom', icon: '📨', desc: 'Captains drop +1 gem', cost: 900, grow: 2.4, max: 2, req: ['bounty'], x: -6, y: 0, fx: (s, l) => { s.capGems += l; } },
    { id: 'glare', name: 'Smouldering Glare', icon: '👁️', desc: 'Your dragon spits at the lead knight on its own', cost: 50, grow: 1.8, max: 5, req: ['fire'], x: -1, y: -1, fx: (s, l) => { s.glare = 1.6 * 0.82 ** (l - 1); } },
    { id: 'glare2', name: 'Piercing Glare', icon: '🎯', desc: 'Glare spit +60% damage', cost: 160, grow: 1.8, max: 5, req: ['glare'], x: -2, y: -1, fx: (s, l) => { s.glareDmg *= 1.6 ** l; } },
    { id: 'omens', name: 'Read the Omens', icon: '🔮', desc: 'The first captain you burn each run offers 3 boons', cost: 120, max: 1, req: ['scorch'], x: -4, y: -1, fx: (s) => { s.omens = Math.max(s.omens, 1); } },
    { id: 'omen2', name: 'Prophecy', icon: '📿', desc: 'Every captain you burn offers a boon', cost: 6, max: 1, req: ['omens'], x: -5, y: -1, cur: 'gems', fx: (s) => { s.omens = 2; } },
    { id: 'drake', name: 'Drakeling Nest', icon: '🐲', desc: 'Hatch Drakelings mid-run: they shoot knights for you', cost: 150, max: 1, req: ['glare'], x: -1, y: -2, fx: (s) => { s.has.drake = 1; } },
    { id: 'drake2', name: 'Brood Mothers', icon: '🐉', desc: 'Drakelings +50% damage', cost: 220, grow: 1.7, max: 6, req: ['drake'], x: -2, y: -2, fx: (s, l) => { s.drakeDmg *= 1.5 ** l; } },
    { id: 'wyrmling', name: 'Wyrmlings', icon: '🦖', desc: '+1 Drakeling at the start of each run', cost: 3, grow: 1.8, max: 4, req: ['drake2'], x: -3, y: -2, cur: 'gems', fx: (s, l) => { s.drakeStart += l; } },
    { id: 'drake3', name: 'Flame Tutors', icon: '📕', desc: 'Drakelings shoot 15% faster', cost: 500, grow: 1.8, max: 5, req: ['drake2'], x: -2, y: -3, fx: (s, l) => { s.drakeRate *= 1.15 ** l; } },
    { id: 'wall', name: 'Thick Walls', icon: '🧱', desc: (l) => `+35% cave wall (now x${(1 + 0.35 * l).toFixed(2)})`, cost: 8, grow: 1.55, max: 12, req: ['brood'], x: 0, y: -1, fx: (s, l) => { s.wall *= 1 + 0.35 * l; } },
    { id: 'masons', name: 'Kobold Masons', icon: '🔨', desc: 'Patch the wall mid-run for gold, 4 times a run', cost: 40, max: 1, req: ['wall'], x: 0, y: -2, fx: (s) => { s.has.patch = 1; } },
    { id: 'moat', name: 'Muddy Moat', icon: '🪵', desc: 'Knights march 7% slower', cost: 70, grow: 1.8, max: 5, req: ['masons'], x: 0, y: -3, fx: (s, l) => { s.kSpeed *= 0.93 ** l; } },
    { id: 'watch', name: 'Watchtowers', icon: '🗼', desc: (l) => `The siege arrives 3s later (now at ${30 + 3 * l}s)`, cost: 250, grow: 1.9, max: 5, req: ['moat'], x: 0, y: -4, fx: (s, l) => { s.siegeAt += 3 * l; } },
    { id: 'scales', name: 'Ironscale Gate', icon: '🛡️', desc: '+50% cave wall', cost: 3, grow: 1.8, max: 5, req: ['moat'], x: -1, y: -3, cur: 'gems', fx: (s, l) => { s.wall *= 1 + 0.5 * l; } },
    { id: 'bulwark', name: 'Spiked Bulwark', icon: '🦔', desc: 'Knights bashing the wall deal 8% less', cost: 300, grow: 1.8, max: 5, req: ['scales', 'watch'], x: -1, y: -4, fx: (s, l) => { s.kDps *= 0.92 ** l; } },
    // ---- fury (left / down): the dragon takes wing. The other build direction for defence.
    { id: 'fury', name: "Dragon's Fury", icon: '🪽', desc: 'Fury path: kills fill a meter; tap it to fly and burn all knights', cost: 90, max: 1, req: ['quick'], x: -2, y: 1, fx: (s) => { s.fury = 1; } },
    { id: 'fury2', name: 'Wingspan', icon: '🦅', desc: (l) => `+1s flight (now ${3 + l}s)`, cost: 150, grow: 1.8, max: 4, req: ['fury'], x: -3, y: 1, fx: (s, l) => { s.flyDur += l; } },
    { id: 'fury3', name: 'Molten Rain', icon: '🌧️', desc: 'Flight fire +40% damage', cost: 200, grow: 1.7, max: 6, req: ['fury'], x: -2, y: 2, fx: (s, l) => { s.flyDmg *= 1.4 ** l; } },
    { id: 'fury4', name: 'Hot Blood', icon: '🩸', desc: 'Fury fills 20% faster', cost: 300, grow: 1.8, max: 5, req: ['fury3'], x: -3, y: 2, fx: (s, l) => { s.furyGain *= 1.2 ** l; } },
    { id: 'fury5', name: 'Sky Plunder', icon: '🌠', desc: 'While you fly, hauls are doubled', cost: 4, max: 1, req: ['fury2'], x: -4, y: 1, cur: 'gems', fx: (s) => { s.flyHaul = 2; } },
    // ---- one or two per dragon
    { id: 'ember', who: 'ember', name: 'Inferno', icon: '♨️', desc: 'Burning knights take +15% of each hit over 2s', cost: 35, grow: 1.9, max: 5, req: ['fire'], x: -1, y: 1, fx: (s, l) => { s.burn += 0.15 * l; } },
    { id: 'ember2', who: 'ember', name: 'Wildfire', icon: '🎇', desc: 'Knights that die burning explode onto their neighbours', cost: 260, grow: 1.9, max: 4, req: ['ember'], x: -1, y: 3, fx: (s, l) => { s.wildfire += 0.5 * l; } },
    { id: 'rime', who: 'rime', name: 'Glacier Hoard', icon: '❄️', desc: 'Hoard bonus cap +30%; your frost slows knights more', cost: 35, grow: 1.9, max: 5, req: ['fire'], x: -1, y: 1, fx: (s, l) => { s.stackCap += 0.3 * l; s.chill = Math.min(0.7, 0.3 + 0.1 * l); } },
    { id: 'rime2', who: 'rime', name: 'Permafrost', icon: '🧊', desc: 'Frosted knights hit your wall 12% softer', cost: 260, grow: 1.9, max: 4, req: ['rime'], x: -1, y: 3, fx: (s, l) => { s.frostWall += 0.12 * l; } },
    { id: 'moss', who: 'moss', name: 'Overgrowth', icon: '🌿', desc: 'Kobolds hatch 18% faster', cost: 35, grow: 1.9, max: 5, req: ['fire'], x: -1, y: 1, fx: (s, l) => { s.breed *= 0.82 ** l; } },
    { id: 'moss2', who: 'moss', name: 'Thornwall', icon: '🌹', desc: 'Your wall regrows a little every second', cost: 260, grow: 1.9, max: 4, req: ['moss'], x: -1, y: 3, fx: (s, l) => { s.regen += 0.004 * l; } },
    { id: 'volt', who: 'volt', name: 'Thunderhead', icon: '🌩️', desc: 'Lightning jumps to 1 more knight and hits 15% harder', cost: 35, grow: 1.9, max: 5, req: ['fire'], x: -1, y: 1, fx: (s, l) => { s.chain += l; s.chainDmg *= 1.15 ** l; } },
    { id: 'volt2', who: 'volt', name: 'Static Shock', icon: '⚡', desc: 'Knights hit by a jump are stunned for 0.25s more', cost: 260, grow: 1.9, max: 3, req: ['volt'], x: -1, y: 3, fx: (s, l) => { s.stun = 0.25 * l; } },
    // ---- win
    { id: 'wyrm', name: 'Elder Wyrm', icon: '👑', desc: 'Next run, the Paladin Champion rides out. Burn him to win.', cost: 9000, grow: 1, max: 1, req: ['watch', 'bulwark', 'powder'], reqAll: 2, extra: { gems: 10 }, x: 0, y: -5, win: true },
  ];

  const VILL = [
    { id: 'farm', name: 'Farm', fx: 0.16, fy: 0.84, yield: 2 },
    { id: 'hamlet', name: 'Hamlet', fx: 0.2, fy: 0.3, yield: 5 },
    { id: 'mill', name: 'Mill', fx: 0.84, fy: 0.68, yield: 7, need: 'mill', rich: 1 },
    { id: 'town', name: 'Town', fx: 0.8, fy: 0.12, yield: 20, need: 'town', rich: 1 },
    { id: 'castle', name: 'Castle', fx: 0.5, fy: 0, yield: 55, need: 'sapper', castle: true },
  ];
  const SHOP = {
    kobold: { name: 'Kobold', icon: '🦎', base: 8, grow: 1.2 },
    thief: { name: 'Thief', icon: '🗡️', base: 30, grow: 1.26, need: 'thief' },
    drake: { name: 'Drakeling', icon: '🐲', base: 45, grow: 1.6, need: 'drake' },
    wagon: { name: 'Wagon', icon: '🛒', base: 150, grow: 1.3, need: 'wagon' },
    sapper: { name: 'Sapper', icon: '💣', base: 600, grow: 1.35, need: 'sapper' },
    patch: { name: 'Patch wall', icon: '🧱', base: 20, grow: 1.7, need: 'patch' },
  };
  const SPEED = { kobold: 70, thief: 130, wagon: 40, sapper: 58 };
  const BOSS_HP = 450000;
  const KNIGHT = { // hp multiplier, speed, wall damage per second, when they start showing up (run seconds), share of spawns
    k: { hp: 1, sp: 42, dps: 2.5 },
    lancer: { hp: 0.6, sp: 92, dps: 3.5, from: 12, p: 0.22 },
    shield: { hp: 1.6, sp: 30, dps: 3, from: 22, p: 0.2 },
    priest: { hp: 1.2, sp: 30, dps: 1.2, from: 34, p: 0.14 },
    cap: { hp: 6, sp: 26, dps: 6 },
    acolyte: { hp: 1, sp: 0, dps: 0 },
    boss: { hp: 1, sp: 7, dps: 14 },
  };
  const SIEGE = { every: 2.2, flight: 1.5, first: 0.06, grow: 1.3, patch: 0.3 };
  const OMENS = [
    { id: 'blood', icon: '🌕', name: 'Blood Moon', desc: '+50% fire damage this run', fx: (M) => { M.s.fire *= 1.5; } },
    { id: 'fever', icon: '🪙', name: 'Gold Fever', desc: '+40% gold per haul this run', fx: (M) => { M.s.carry *= 1.4; } },
    { id: 'mortar', icon: '🧱', name: 'Dragonglass Mortar', desc: 'Wall fully repaired and +25% stronger', fx: (M) => { M.wallMax *= 1.25; M.wall = M.wallMax; } },
    { id: 'clutch', icon: '🥚', name: 'Hidden Clutch', desc: '+5 kobolds right now', fx: (M) => { for (let i = 0; i < 5; i++) addUnit(M, 'kobold'); } },
    { id: 'quick', icon: '💨', name: 'Second Wind', desc: 'Breathe 30% more often this run', fx: (M) => { M.s.fireCd *= 0.7; } },
    { id: 'fog', icon: '🌫️', name: 'Morning Fog', desc: 'The siege engines get lost: they arrive 6s later', fx: (M) => { M.siegeAt += 6; } },
  ];

  function baseStats(who) {
    const s = { kobolds: 3, speed: 1, carry: 1, thiefSpeed: 1, thiefHaul: 1, thiefGem: 0, wagonHaul: 1, sapperHaul: 1, autoSpeed: 1, gemChance: 0.12, villX: 1,
      fire: 4, fireCd: 0.4, fireR: 30, glare: 0, glareDmg: 0.5, drakeDmg: 1, drakeRate: 1, drakeStart: 0, wall: 5, kSpeed: 1, kEvery: 1.4, kDps: 1,
      price: 1, bank: 1.2, renownX: 1, startGold: 0, foreman: 0, breed: 0, stack: 0, stackCap: 0, burn: 0, chill: 0, frostWall: 0, regen: 0, wildfire: 0,
      siegeAt: 30, tithe: 0, caravanX: 1, caravanGold: 1, bountyX: 1, capGems: 1, omens: 0, scorch: 0, spear: 0, snare: 0, twin: 0,
      fury: 0, flyDur: 3, flyDmg: 1, furyGain: 1, flyHaul: 1, chain: 0, chainDmg: 0.6, stun: 0, has: {} };
    if (who === 'ember') { s.fire *= 1.5; s.fireR += 6; }
    if (who === 'rime') { s.kSpeed *= 0.8; s.stack = 0.25; s.stackCap = 1; }
    if (who === 'moss') { s.breed = 4; }
    if (who === 'volt') { s.fireR -= 6; s.chain = 2; }
    return s;
  }

  // ---------------------------------------------------------------- model (no DOM)
  function geo(W, H) {
    const shopH = 124, wallY = Math.max(300, H - shopH - 196), y0 = 128, y1 = wallY - 78;
    return { W, H, shopH, wallY, gate: { x: W / 2, y: wallY - 6 },
      vills: VILL.map((v, i) => ({ ...v, i, x: v.fx * W, y: v.castle ? y0 + 0.22 * (y1 - y0) : y0 + v.fy * (y1 - y0) })) };
  }
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

  function create(o) { // o = {who, s, W, H, boss, rnd}
    const s = o.s, G = geo(o.W, o.H);
    const M = { s, G, who: o.who, rnd: o.rnd || Math.random, t: 0, over: false, won: false, gold: s.startGold, earned: 0, gems: 0, kills: 0,
      wall: s.wall, wallMax: s.wall, units: [], knights: [], shots: [], drakes: [], fires: [], carts: [], rocks: [], bought: {}, ev: [], spawnT: 0.8, capT: 18,
      fireCd: 0, glareT: s.glare, breedT: s.breed, foreT: s.foreman, boss: null, bossT: o.boss ? 4 : -1, dispatched: 0, breathed: 0, hauls: 0,
      siegeAt: s.siegeAt, siege: false, rockT: 0, rockN: 0, patches: 4, carT: 9 + 4 * (o.rnd || Math.random)(), carsHit: 0, carsSeen: 0,
      fury: 0, flyT: 0, flyTick: 0, flights: 0, streak: 0, streakT: -9, bestStreak: 0, omen: null, omensGot: 0, tithe: 0 };
    for (let i = 0; i < s.kobolds; i++) addUnit(M, 'kobold');
    for (let i = 0; i < s.drakeStart; i++) addDrake(M);
    return M;
  }
  const avail = (M, v) => !v.need || M.s.has[v.need];
  function addUnit(M, type) {
    const u = { type, st: 'idle', v: null, p: 0, carry: 0, tt: 0, stab: 0, lane: (M.rnd() - 0.5) * 14, ph: M.rnd() * 6, x: M.G.gate.x, y: M.G.gate.y };
    M.units.push(u);
    if (type !== 'kobold') send(M, u, best(M, type));
    return u;
  }
  function addDrake(M) { const n = M.drakes.length, side = n % 2 ? 1 : -1, k = Math.floor(n / 2), per = Math.max(1, Math.floor((M.G.W / 2 - 92) / 28)), col = k % per, row = Math.floor(k / per) % 3;
    M.drakes.push({ x: M.G.W / 2 + side * (78 + col * 28 + row * 10), y: M.G.wallY + 2 - row * 20 - (col % 2) * 6, cd: 0.5 + M.rnd(), aim: 0, fireT: -1 }); }
  const haulMult = (M) => (1 + Math.min(M.s.stackCap, M.s.stack * M.gold / 100)) * (M.siege ? 1.5 : 1) * (M.flyT > 0 ? M.s.flyHaul : 1);
  const speedOf = (M, type) => SPEED[type] * M.s.speed * (type === 'thief' ? M.s.thiefSpeed : type === 'wagon' || type === 'sapper' ? M.s.autoSpeed : 1);
  function haulOf(M, type, v) { return v.yield * (v.rich ? M.s.villX : 1) * M.s.carry * (type === 'thief' ? M.s.thiefHaul : type === 'wagon' ? 6 * M.s.wagonHaul : type === 'sapper' ? M.s.sapperHaul : 1); }
  function best(M, type) {
    let b = null, bs = -1;
    for (const v of M.G.vills) {
      if (!avail(M, v) || (type === 'sapper') !== !!v.castle) continue;
      const sc = haulOf(M, type, v) / (2 * dist(M.G.gate, v) / speedOf(M, type) + 0.5);
      if (sc > bs) { bs = sc; b = v; }
    }
    return b;
  }
  function send(M, u, v) { if (!v) return false; u.st = 'out'; u.v = v; u.p = 0; u.len = dist(M.G.gate, v); return true; }
  /** Player tapped village v: send one idle kobold. Returns a reason string on failure. */
  function dispatch(M, v) {
    if (!avail(M, v)) return 'locked';
    if (v.castle) return 'guarded';
    const u = M.units.find((x) => x.st === 'idle');
    if (!u) return 'none';
    send(M, u, v); M.dispatched++; return '';
  }
  function cost(M, k) { return Math.ceil(SHOP[k].base * SHOP[k].grow ** (M.bought[k] || 0) * M.s.price); }
  const shopOpen = (M, k) => !SHOP[k].need || M.s.has[SHOP[k].need];
  function buy(M, k) {
    if (!shopOpen(M, k)) return false;
    const c = cost(M, k);
    if (M.gold < c || (k === 'patch' && (M.wall >= M.wallMax || M.patches <= 0))) return false;
    M.gold -= c; M.bought[k] = (M.bought[k] || 0) + 1;
    if (k === 'patch') { M.wall = Math.min(M.wallMax, M.wall + M.wallMax * SIEGE.patch); M.patches--; }
    else if (k === 'drake') addDrake(M);
    else { addUnit(M, k); if (k === 'kobold' && M.s.twin) addUnit(M, k); }
    M.ev.push({ k: 'buy', what: k });
    return true;
  }
  const mouth = (M) => ({ x: M.G.W / 2, y: M.G.wallY + 28 });
  function breathe(M, x, y) {
    if (M.fireCd > 0) return false;
    M.fireCd = M.s.fireCd; M.breathed++;
    const m = mouth(M);
    M.shots.push({ kind: 'breath', x0: m.x, y0: m.y, x, y, t: 0, dur: 0.16 + dist(m, { x, y }) / 2600, dmg: M.s.fire, r: M.s.fireR });
    M.ev.push({ k: 'breath', x, y });
    return true;
  }
  const knightHp = (M, t) => 14 * 1.08 ** t * 1.06 ** Math.max(0, t - 60) * (M.bossT >= 0 ? 1.3 : 1);
  function spawnKnight(M, kind, at) {
    const G = M.G, r = M.rnd, K = KNIGHT[kind];
    let x, y;
    if (at) { x = at.x; y = at.y; }
    else if (kind === 'boss') { x = G.W / 2; y = 175; }
    else if (r() < 0.45) { x = G.W / 2 + (r() - 0.5) * 30; y = 132; }
    else { const side = r() < 0.5 ? -1 : 1; x = G.W / 2 + side * (G.W / 2 + 12); y = 140 + r() * (G.wallY - 320); }
    const hp = kind === 'boss' ? BOSS_HP : kind === 'acolyte' ? BOSS_HP * 0.03 : knightHp(M, M.t) * K.hp;
    const sp = (K.sp + (kind === 'k' ? r() * 8 : 0)) * M.s.kSpeed;
    const k = { kind, x, y, hp, max: hp, sp, tx: at ? x : G.W / 2 + (r() - 0.5) * (kind === 'boss' ? 0 : 120), ty: at ? y : G.wallY - 14, atWall: false, hitT: -9, burn: 0, burnD: 0, chill: 0, snareT: 0, stunT: 0, ph: r() * 6,
      dps: K.dps, shield: kind === 'shield' ? 1 : 0 };
    M.knights.push(k);
    return k;
  }
  function hurt(M, k, d, how) {
    if (k.hp <= 0) return;
    if (k.kind === 'boss' && k.ward) { M.ev.push({ k: 'warded', x: k.x, y: k.y }); return; }
    if (k.shield && how === 'breath') { k.shield = 0; k.hitT = M.t; M.ev.push({ k: 'block', x: k.x, y: k.y }); return; }
    if (k.kind === 'acolyte' && how !== 'breath' && how !== 'chain') d *= 0.2; // only your own breath really hurts them
    k.hp -= d; k.hitT = M.t;
    if (M.s.burn) { k.burn = 2; k.burnD = Math.max(k.burnD, d * M.s.burn / 2); }
    if (M.s.chill) k.chill = 1.6;
    if (k.hp <= 0) kill(M, k);
  }
  function kill(M, k) {
    M.kills++;
    if (M.t - M.streakT < 1.6) M.streak++; else M.streak = 1;
    M.streakT = M.t; M.bestStreak = Math.max(M.bestStreak, M.streak);
    const sm = 1 + 0.1 * Math.min(10, M.streak - 1);
    const bounty = k.kind === 'acolyte' ? 0 : Math.ceil((k.kind === 'boss' ? 2000 : k.max) * 0.15 * M.s.bountyX * sm);
    M.gold += bounty; M.earned += bounty;
    let gem = 0;
    if (k.kind === 'cap') { gem = M.s.capGems; M.gems += gem; }
    if (M.s.fury) M.fury = Math.min(1, M.fury + (k.kind === 'cap' ? 0.15 : 0.035) * M.s.furyGain);
    M.ev.push({ k: 'kill', x: k.x, y: k.y, kind: k.kind, gold: bounty, gem, streak: M.streak });
    if (k.kind === 'cap' && M.s.omens && !M.omen && (M.omensGot === 0 || M.s.omens > 1)) offerOmen(M);
    if (M.s.wildfire && k.burn > 0) {
      M.ev.push({ k: 'wildfire', x: k.x, y: k.y });
      for (const o of M.knights) if (o !== k && o.hp > 0 && dist(o, k) < 44) hurt(M, o, M.s.fire * M.s.wildfire, 'wild');
    }
    if (k.kind === 'boss') { M.won = true; M.over = true; }
  }
  function offerOmen(M) {
    const pool = OMENS.slice();
    const opts = [];
    while (opts.length < 3 && pool.length) opts.push(pool.splice(Math.floor(M.rnd() * pool.length), 1)[0]);
    M.omen = opts; M.omensGot++;
    M.ev.push({ k: 'omen', opts });
  }
  /** Apply omen choice i (the view shows the cards via env.pick; the run is frozen meanwhile). */
  function choose(M, i) { const o = M.omen && M.omen[i]; M.omen = null; if (!o) return; o.fx(M); M.ev.push({ k: 'boon', o }); }
  const canFly = (M) => M.s.fury && M.fury >= 1 && M.flyT <= 0;
  function fly(M) { if (!canFly(M)) return false; M.fury = 0; M.flyT = M.s.flyDur; M.flyTick = 0.1; M.flights++; M.ev.push({ k: 'fly' }); return true; }
  function lead(M) { let b = null; for (const k of M.knights) if (k.hp > 0 && k.kind !== 'acolyte' && (!b || k.ty - k.y < b.ty - b.y)) b = k; return b; }
  function nearest(M, p, range) { let b = null, bd = range; for (const k of M.knights) { if (k.hp <= 0) continue; const d = dist(k, p); if (d < bd) { bd = d; b = k; } } return b; }

  function impact(M, sh) {
    const hit = [];
    for (const k of M.knights) if (k.hp > 0 && Math.hypot(k.x - sh.x, k.y - sh.y) < sh.r + (k.kind === 'boss' ? 26 : 12)) { hit.push(k); hurt(M, k, sh.dmg, sh.kind); }
    if (sh.kind === 'breath') {
      for (const c of M.carts) if (c.hp > 0 && Math.hypot(c.x - sh.x, c.y - sh.y) < sh.r + 20) { c.hp -= sh.dmg; c.hitT = M.t; if (c.hp <= 0) lootCart(M, c); }
      if (M.s.scorch) M.fires.push({ x: sh.x, y: sh.y, r: sh.r * 0.9, t: 1.6 });
      // Volt: lightning jumps from the blast to the nearest knights it has not hit yet
      let from = { x: sh.x, y: sh.y };
      for (let j = 0; j < M.s.chain; j++) {
        let b = null, bd = 130;
        for (const k of M.knights) { if (k.hp <= 0 || hit.includes(k)) continue; const d = dist(k, from); if (d < bd) { bd = d; b = k; } }
        if (!b) break;
        hit.push(b); M.ev.push({ k: 'arc', x0: from.x, y0: from.y, x1: b.x, y1: b.y });
        if (M.s.stun) b.stunT = Math.max(b.stunT, M.s.stun);
        hurt(M, b, sh.dmg * M.s.chainDmg, 'chain'); from = { x: b.x, y: b.y };
      }
    }
    M.ev.push({ k: 'impact', x: sh.x, y: sh.y, kind: sh.kind, r: sh.r, n: hit.length, dmg: sh.dmg });
  }
  function lootCart(M, c) {
    const g = Math.round(c.gold * (1 + 0.1 * Math.min(10, M.streak)));
    M.gold += g; M.earned += g; M.carsHit++;
    const gem = M.rnd() < 0.3 ? 1 : 0; M.gems += gem;
    M.ev.push({ k: 'cart', x: c.x, y: c.y, gold: g, gem });
  }

  function step(M, dt) {
    if (M.over || M.omen) return;
    const s = M.s, G = M.G;
    M.t += dt; M.fireCd -= dt;
    // knights: the march gets thicker the longer you hold out
    M.spawnT -= dt;
    if (M.spawnT <= 0) {
      M.spawnT += s.kEvery / (1 + M.t / 15) * (M.bossT >= 0 ? 1.15 : 1);
      let kind = 'k';
      for (const e of ['priest', 'shield', 'lancer']) if (M.t >= KNIGHT[e].from && M.rnd() < KNIGHT[e].p) { kind = e; break; }
      spawnKnight(M, kind);
    }
    M.capT -= dt;
    if (M.capT <= 0) { M.capT += 20; spawnKnight(M, 'cap'); M.ev.push({ k: 'captain' }); }
    if (M.bossT >= 0 && !M.boss) { M.bossT -= dt; if (M.bossT <= 0) { M.boss = spawnKnight(M, 'boss'); M.ev.push({ k: 'boss' }); } }
    const B = M.boss;
    if (B && B.hp > 0) {
      if (!B.p2 && B.hp < B.max * 0.5) { // phase 2: he kneels behind a ward of light until his acolytes burn
        B.p2 = true; B.ward = true; B.hold = true;
        for (let i = 0; i < 3; i++) { const a = -Math.PI / 2 + (i - 1) * 1.9; spawnKnight(M, 'acolyte', { x: Math.max(30, Math.min(G.W - 30, B.x + Math.cos(a) * 70)), y: Math.max(110, B.y + Math.sin(a) * 50 + 30) }); }
        M.ev.push({ k: 'phase', x: B.x, y: B.y });
      }
      if (B.ward) {
        const n = M.knights.filter((k) => k.kind === 'acolyte' && k.hp > 0).length;
        B.hp = Math.min(B.max * 0.6, B.hp + B.max * 0.008 * n * dt);
        if (!n) { B.ward = false; B.hold = false; B.sp *= 3.2; B.dps *= 1.5; B.enraged = true; M.ev.push({ k: 'enrage', x: B.x, y: B.y }); }
      }
    }
    for (const k of M.knights) {
      if (k.burn > 0) { k.burn -= dt; if (!(k.kind === 'boss' && k.ward)) k.hp -= k.burnD * dt; if (k.hp <= 0) { kill(M, k); continue; } }
      k.chill = Math.max(0, k.chill - dt); k.snareT = Math.max(0, k.snareT - dt); k.stunT = Math.max(0, k.stunT - dt);
      if (k.kind === 'priest') for (const o of M.knights) if (o !== k && o.hp > 0 && o.kind !== 'boss' && dist(o, k) < 70) o.hp = Math.min(o.max, o.hp + o.max * 0.12 * dt);
      if (k.stunT > 0 || k.hold) continue;
      const d = Math.hypot(k.tx - k.x, k.ty - k.y);
      if (d > 2) { if (k.sp) { const sp = k.sp * (k.chill > 0 ? 1 - s.chill : 1) * (k.snareT > 0 ? 0.5 : 1) * dt; k.x += (k.tx - k.x) / d * Math.min(sp, d); k.y += (k.ty - k.y) / d * Math.min(sp, d); } }
      else if (k.dps) { k.atWall = true; M.wall -= k.dps * s.kDps * (k.chill > 0 ? 1 - s.frostWall : 1) * dt; if (M.rnd() < dt * 3) M.ev.push({ k: 'bash', x: k.x, y: k.y + 10 }); }
    }
    M.knights = M.knights.filter((k) => k.hp > 0);
    // dragon auto-spit, drakelings, flight
    if (s.glare) { M.glareT -= dt; if (M.glareT <= 0) { const k = lead(M) || nearest(M, mouth(M), 9e9); if (k) { M.glareT = s.glare; const m = mouth(M); M.shots.push({ kind: 'glare', x0: m.x, y0: m.y, x: k.x, y: k.y, tgt: k, t: 0, dur: 0.3, dmg: s.fire * s.glareDmg, r: 12 }); } else M.glareT = 0.2; } }
    for (const d of M.drakes) {
      d.cd -= dt;
      if (d.cd <= 0) { const k = nearest(M, d, 330); if (k) { d.cd = 1.1 / s.drakeRate; d.fireT = M.t; d.aim = Math.atan2(k.y - d.y, k.x - d.x); M.shots.push({ kind: 'drake', x0: d.x, y0: d.y - 6, x: k.x, y: k.y, tgt: k, t: 0, dur: 0.35, dmg: s.fire * 0.35 * s.drakeDmg, r: 12 }); } else d.cd = 0.2; }
    }
    if (M.flyT > 0) {
      M.flyT -= dt; M.flyTick -= dt;
      if (M.flyTick <= 0) { M.flyTick += 0.35; for (const k of M.knights.slice()) hurt(M, k, s.fire * 0.7 * s.flyDmg, 'fly'); M.ev.push({ k: 'rain' }); }
    }
    for (const sh of M.shots) {
      sh.t += dt;
      if (sh.tgt && sh.tgt.hp > 0) { sh.x = sh.tgt.x; sh.y = sh.tgt.y; }
      if (sh.t >= sh.dur && !sh.done) { sh.done = true; impact(M, sh); }
    }
    M.shots = M.shots.filter((x) => !x.done);
    for (const f of M.fires) { f.t -= dt; for (const k of M.knights) if (k.hp > 0 && dist(k, f) < f.r + 8) hurt(M, k, s.fire * s.scorch * dt, 'scorch'); }
    M.fires = M.fires.filter((f) => f.t > 0);
    M.knights = M.knights.filter((k) => k.hp > 0);
    // treasure caravans (once the Mill road is open): breathe on them before they leave the meadow
    if (s.has.mill && M.bossT < 0) {
      M.carT -= dt;
      if (M.carT <= 0) {
        M.carT = (15 + M.rnd() * 8) / s.caravanX; M.carsSeen++;
        const dir = M.rnd() < 0.5 ? 1 : -1, hp = knightHp(M, M.t) * 4;
        M.carts.push({ x: dir > 0 ? -40 : G.W + 40, y: 170 + M.rnd() * (G.wallY - 300), vx: dir * 34, hp, max: hp, hitT: -9, gold: (40 * s.carry + 0.12 * M.earned) * s.caravanGold });
        M.ev.push({ k: 'caravan' });
      }
    }
    for (const c of M.carts) c.x += c.vx * dt;
    M.carts = M.carts.filter((c) => c.hp > 0 && c.x > -60 && c.x < G.W + 60);
    // the siege: at dawn trebuchets lob boulders at the wall, each harder than the last (a share of the wall, so
    // wall upgrades can't stretch a run forever). Hauls are worth 50% more while it lasts: last-chance plunder.
    if (!M.siege && M.t >= M.siegeAt) { M.siege = true; M.rockT = 0.8; M.ev.push({ k: 'siege' }); }
    if (M.siege) {
      M.rockT -= dt;
      if (M.rockT <= 0) { M.rockT += SIEGE.every; const side = M.rockN % 2 ? 1 : -1; M.rocks.push({ x0: G.W / 2 + side * (G.W / 2 - 30), y0: 140, x: G.W / 2 + (M.rnd() - 0.5) * 60, y: G.wallY - 6, t: 0, dmg: M.wallMax * SIEGE.first * SIEGE.grow ** M.rockN }); M.rockN++; M.ev.push({ k: 'launch', side }); }
    }
    for (const r of M.rocks) { r.t += dt; if (r.t >= SIEGE.flight && !r.done) { r.done = true; M.wall -= r.dmg; M.ev.push({ k: 'rock', x: r.x, y: r.y, dmg: r.dmg }); } }
    M.rocks = M.rocks.filter((r) => !r.done);
    // minions
    for (const u of M.units) {
      if (u.st === 'out' || u.st === 'back') {
        u.p += speedOf(M, u.type) * dt / u.len;
        if (u.p >= 1) {
          if (u.st === 'out') { u.st = 'loot'; u.tt = 0.4; }
          else {
            const g = u.carry * haulMult(M);
            M.gold += g; M.earned += g; M.hauls++;
            if (s.fury) M.fury = Math.min(1, M.fury + 0.004 * s.furyGain);
            let gem = 0;
            if ((u.v.castle && M.rnd() < s.gemChance) || (u.type === 'thief' && M.rnd() < s.thiefGem)) { gem = 1; M.gems++; }
            M.ev.push({ k: 'haul', gold: g, gem, type: u.type });
            u.carry = 0;
            if (u.type === 'kobold') { u.st = 'idle'; u.p = 0; } else send(M, u, best(M, u.type));
          }
        }
        if (s.spear && u.type === 'kobold') {
          u.stab -= dt;
          if (u.stab <= 0) { const k = nearest(M, u, 24); if (k && k.kind !== 'boss') { u.stab = 0.7; hurt(M, k, s.fire * s.spear, 'spear'); if (s.snare) k.snareT = s.snare; M.ev.push({ k: 'stab', x: k.x, y: k.y }); } else u.stab = 0.15; }
        }
      } else if (u.st === 'loot') {
        u.tt -= dt;
        if (u.tt <= 0) { u.st = 'back'; u.p = 0; u.carry = haulOf(M, u.type, u.v); M.ev.push({ k: 'loot', v: u.v }); }
      }
      const a = u.st === 'back' ? u.v : G.gate, b = u.st === 'back' ? G.gate : u.v;
      if (u.st === 'idle' || !b) { u.x = G.gate.x; u.y = G.gate.y; }
      else { const p = u.st === 'loot' ? 1 : Math.min(1, u.p), dx = b.x - a.x, dy = b.y - a.y, l = Math.hypot(dx, dy) || 1, w = Math.sin(p * Math.PI);
        u.x = a.x + dx * p - dy / l * u.lane * w; u.y = a.y + dy * p + dx / l * u.lane * w; }
    }
    M.knights = M.knights.filter((k) => k.hp > 0);
    if (s.tithe) { const g = s.tithe * s.carry * dt; M.gold += g; M.earned += g; M.tithe += g; }
    if (s.regen && M.wall > 0) M.wall = Math.min(M.wallMax, M.wall + M.wallMax * s.regen * dt);
    if (s.breed) { M.breedT -= dt; if (M.breedT <= 0) { M.breedT += s.breed; addUnit(M, 'kobold'); M.ev.push({ k: 'hatch' }); } }
    if (s.foreman) { M.foreT -= dt; if (M.foreT <= 0) { M.foreT += s.foreman; const v = best(M, 'kobold'); for (const u of M.units) if (u.st === 'idle') send(M, u, v); } }
    if (M.wall <= 0) { M.wall = 0; M.over = true; M.ev.push({ k: 'breach' }); }
  }
  const renownOf = (M) => Math.floor(M.s.bank * M.s.renownX * M.earned ** 0.7);
  function earnedOf(M) { return { renown: renownOf(M), gems: M.gems }; }
  const Model = { create, step, dispatch, breathe, buy, cost, shopOpen, avail, best, earnedOf, renownOf, geo, choose, fly, canFly, lead, nearest, haulMult,
    idle: (M) => M.units.filter((u) => u.st === 'idle').length, SHOP, VILL, BOSS_HP, KNIGHT, SIEGE, OMENS };

  if (typeof module !== 'undefined' && typeof window === 'undefined') { module.exports = { NODES, baseStats, Model }; return; }

  // ---------------------------------------------------------------- view (canvas + DOM shop)
  const LOOK = {
    ember: { body: '#d62828', dark: '#8d0801', belly: '#ffb703', horn: '#fff3d6', crest: 'horns', fire: ['#ffd166', '#ff9f1c', '#e85d04'] },
    rime: { body: '#7fc8f8', dark: '#3a6ea5', belly: '#eaf6ff', horn: '#ffffff', crest: 'ice', fire: ['#ffffff', '#bde0fe', '#4cc9f0'] },
    moss: { body: '#52b788', dark: '#1b4332', belly: '#d8f3dc', horn: '#f1e3c6', crest: 'leaf', fire: ['#f1fa8c', '#b5e48c', '#ff9f1c'] },
    volt: { body: '#7b5cd6', dark: '#33206e', belly: '#ffe66d', horn: '#ffe66d', crest: 'bolt', fire: ['#ffffff', '#fff275', '#9d4edd'] },
  };
  // fixed slots: every run shows the same six buttons in the same places; locked ones are dimmed, never hidden
  const SHOP_ORDER = ['kobold', 'thief', 'wagon', 'sapper', 'drake', 'patch'];
  const VERB = { kobold: 'Hire kobold', thief: 'Hire thief', wagon: 'Buy wagon', sapper: 'Hire sapper', drake: 'Hatch drake', patch: 'Patch wall' };
  const CSS = `.hd-shop{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));grid-auto-rows:48px;gap:6px;max-width:460px;margin:0 auto 12px}
    .hd-b{display:grid;grid-template-rows:1fr 1fr;align-items:center;min-width:0;height:48px;padding:3px 8px;overflow:hidden;border:2px solid transparent;border-radius:13px;background:#2d2440;color:#f4efe6;box-shadow:0 3px 0 #120d1c;font:800 13px Nunito,system-ui;text-align:left;touch-action:manipulation;box-sizing:border-box}
    .hd-b .n{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;line-height:1.1}.hd-b .n i{font-style:normal;margin-right:3px}
    .hd-b .r{display:flex;justify-content:space-between;align-items:baseline;gap:4px;white-space:nowrap;line-height:1.1}
    .hd-b .c{font:400 14px 'Lilita One',system-ui;color:#ffd166;font-variant-numeric:tabular-nums}.hd-b small{color:#b9b2cc;font-size:12px;font-variant-numeric:tabular-nums}
    .hd-b.can{background:#4a3a1a;border-color:#ffd166aa}.hd-b:not(.can){opacity:.6}.hd-b.can .c{color:#ffe08a}
    .hd-b.lock{opacity:.38;background:#221b30;border:2px dashed #ffffff22;box-shadow:none}.hd-b.lock .c{color:#a49eb8;font:800 12px Nunito,system-ui}
    .hd-b:active{transform:translateY(2px);box-shadow:0 1px 0 #120d1c}
    .hd-b.pop{animation:hdpop .25s}@keyframes hdpop{50%{transform:scale(1.06)}}.hd-b.no{animation:hdno .25s}@keyframes hdno{25%{transform:translateX(-3px)}75%{transform:translateX(3px)}}`;
  const LEAD = 1.1, OUTRO = 1.4;

  function createRun(env) {
    const s = env.stats, W = env.W, H = env.H, fx = env.fx, sfx = env.sfx, L = LOOK[env.who] || LOOK.ember;
    const M = create({ who: env.who, s, W, H, boss: env.boss });
    const G = M.G;
    if (Kit.DEV) window.Hoard.M = M; // for automated testing
    const stars = Array.from({ length: 46 }, () => [Math.random() * W, Math.random() * 120, Math.random()]);
    const tufts = Array.from({ length: 50 }, () => [Math.random() * W, 150 + Math.random() * (G.wallY - 150)]);
    const flash = {}; let headAim = -Math.PI / 2, breathT = -9, pileBump = 0, msg = null, coinsFly = [], arcs = [], banner = null, popT = [];
    const agg = { kill: { sum: 0, x: 0, y: 0, t: 0 }, haul: { sum: 0, t: 0, side: 1 }, dmg: 0 };
    let lead = 0, outro = 0, stop = 0, wallHitT = -9, cause = '', trebArm = [-9, -9], streakShow = null, flyX = 0;
    const FURY = { x: W - 54, y: G.wallY + 66, r: 28 };
    const say = (text, c = '#fff') => { msg = { text, c, t: M.t }; };
    const big = (text, sub, c = '#ffe08a', dur = 2.4) => { banner = { text, sub, c, t: 0, dur }; };
    const sting = (notes, type = 'triangle', v = 0.09, gap = 0.13) => notes.forEach((f, i) => sfx.tone(f, gap * 1.7, type, v, 1, i * gap));

    // DOM shop
    env.ui.innerHTML = `<style>${CSS}</style><div class="hd-shop">${SHOP_ORDER.map((k) => `<button type="button" class="hd-b" data-shop="${k}"><span class="n"><i>${SHOP[k].icon}</i>${VERB[k]}</span><span class="r"><span class="c"></span><small></small></span></button>`).join('')}</div>`;
    const shopEl = env.ui.querySelector('.hd-shop');
    const btns = SHOP_ORDER.map((k) => { const b = shopEl.querySelector(`[data-shop="${k}"]`); return { k, b, c: b.querySelector('.c'), sm: b.querySelector('small'), last: '' }; });
    const nudge = (b, cls) => { b.classList.remove('pop', 'no'); void b.offsetWidth; b.classList.add(cls); };
    env.ui.onclick = (e) => {
      const b = e.target.closest('[data-shop]'); if (!b || M.over || lead < LEAD) return;
      const k = b.dataset.shop;
      if (buy(M, k)) { sfx.buy(); nudge(b, 'pop'); }
      else { sfx.nope(); nudge(b, 'no'); say(!shopOpen(M, k) ? `${SHOP[k].name}s unlock in the upgrade tree` : k === 'patch' && M.patches <= 0 ? 'No patches left this run' : k === 'patch' && M.wall >= M.wallMax ? 'The wall is already whole' : `Need ${env.fmt(cost(M, k))} gold`, '#ffb4a2'); }
    };
    function syncShop() {
      for (const x of btns) {
        const open = shopOpen(M, x.k), c = cost(M, x.k), can = open && M.gold >= c && !(x.k === 'patch' && (M.wall >= M.wallMax || M.patches <= 0));
        const owned = x.k === 'kobold' ? M.units.filter((u) => u.type === 'kobold').length : x.k === 'drake' ? M.drakes.length : x.k === 'patch' ? M.patches : M.units.filter((u) => u.type === x.k).length;
        const key = open + '|' + c + '|' + can + '|' + owned + '|' + (x.k === 'kobold' ? idle(M) : x.k === 'patch' ? Math.round(M.wall / M.wallMax * 20) : '');
        if (key === x.last) continue; x.last = key;
        x.b.classList.toggle('lock', !open); x.b.classList.toggle('can', can);
        if (!open) { x.c.textContent = '🔒 tree'; x.sm.textContent = ''; continue; }
        x.c.textContent = x.k === 'patch' && M.patches <= 0 ? '—' : env.fmt(c) + 'g';
        x.sm.textContent = x.k === 'patch' ? `${M.patches} left` : x.k === 'kobold' ? `${idle(M)}/${owned}` : `×${owned}`;
      }
    }
    syncShop();

    function handleEvents() {
      for (const e of M.ev) {
        if (e.k === 'haul') { sfx.coin(); pileBump = 1; if (coinsFly.length < 12) coinsFly.push({ t: 0, x: G.gate.x + (Math.random() - 0.5) * 20 }); agg.haul.sum += e.gold; if (e.gem) { sfx.ding(); fx.text(G.gate.x, G.wallY - 54, '+1 gem', '#9bf6ff', 18); } }
        else if (e.k === 'loot') { flash[e.v.id] = M.t; fx.burst(e.v.x, e.v.y - 6, 5, ['#ffd166', '#fff3b0'], 90, 2.5); }
        else if (e.k === 'impact') {
          if (e.kind === 'breath') { sfx.tone(90 + Math.random() * 40, 0.18, 'sawtooth', 0.06, 0.4); sfx.crack(); fx.burst(e.x, e.y, 14, L.fire, 180, 4); fx.ring(e.x, e.y, e.r * 1.6, L.fire[1]); fx.shake = Math.max(fx.shake, 2.5 + e.n); if (e.n && agg.dmg <= 0) { agg.dmg = 0.3; fx.text(e.x + 14, e.y - 22, env.fmt(e.dmg * e.n), '#fff', 13); } }
          else { sfx.zap(); fx.burst(e.x, e.y, 5, L.fire, 100, 2.5); }
        }
        else if (e.k === 'kill') {
          sfx.pop(0.8 + Math.min(10, e.streak) * 0.08);
          fx.burst(e.x, e.y, e.kind === 'boss' ? 70 : 14, ['#ced4da', '#adb5bd', '#ffd166', '#e63946'], e.kind === 'boss' ? 340 : 170, 3.5);
          if (e.gold) { agg.kill.sum += e.gold; agg.kill.x = e.x; agg.kill.y = e.y; }
          if (e.gem) { sfx.ding(); fx.text(e.x, e.y - 38, `+${e.gem} gem${e.gem > 1 ? 's' : ''}`, '#9bf6ff', 18); }
          if (e.streak >= 3) { streakShow = { n: e.streak, t: M.t, x: e.x, y: e.y }; if (e.streak % 5 === 0) { sfx.ding(); stop = Math.max(stop, 0.05); } }
          if (e.kind === 'cap' || e.kind === 'acolyte') { fx.shake = 10; sfx.boom(); stop = Math.max(stop, 0.09); }
          if (e.kind === 'boss') { fx.shake = 18; sfx.boom(); stop = 0.35; }
        }
        else if (e.k === 'bash') { sfx.hit(); fx.burst(e.x, e.y, 3, ['#8d7b68', '#c2b280'], 80, 2.5); fx.shake = Math.max(fx.shake, 1.5); wallHitT = M.t; cause = 'knights'; }
        else if (e.k === 'captain') say('A knight captain approaches! (drops a gem)', '#9bf6ff');
        else if (e.k === 'boss') { sfx.boom(); fx.shake = 12; sting([110, 98, 82], 'sawtooth', 0.07, 0.22); }
        else if (e.k === 'hatch') { sfx.pop(1.6); fx.burst(W / 2 - 70, G.wallY + 52, 6, ['#fff3d6', L.body], 90, 2.5); }
        else if (e.k === 'breach') { sfx.boom(); fx.shake = 18; fx.burst(G.gate.x, G.wallY, 46, ['#8d7b68', '#c2b280', '#6c584c'], 280, 4.5); }
        else if (e.k === 'siege') { big('THE SIEGE!', 'Dawn: boulders hit the wall. Hauls +50% till it falls', '#ffb4a2', 2.6); sting([147, 147, 196], 'sawtooth', 0.08, 0.3); fx.shake = 6; }
        else if (e.k === 'launch') { trebArm[e.side > 0 ? 1 : 0] = M.t; sfx.tone(70, 0.25, 'square', 0.04, 0.6); }
        else if (e.k === 'rock') { sfx.boom(); fx.shake = 9; fx.burst(e.x, e.y, 22, ['#8d7b68', '#6c584c', '#c2b280'], 220, 4); fx.text(e.x, e.y - 30, '-' + Math.round(e.dmg / M.wallMax * 100) + '% wall', '#ff8f8f', 15); wallHitT = M.t; cause = 'siege'; stop = Math.max(stop, 0.05); }
        else if (e.k === 'caravan') { if (M.carsSeen <= 2) say('A treasure caravan! Burn it before it escapes', '#ffe08a'); sfx.tone(660, 0.1, 'triangle', 0.06); sfx.tone(880, 0.12, 'triangle', 0.06, 1, 0.08); }
        else if (e.k === 'cart') { sfx.win(); fx.burst(e.x, e.y, 40, ['#ffd166', '#fff3b0', '#e09f3e'], 260, 4); fx.text(e.x, e.y - 20, '+' + env.fmt(e.gold), '#ffe08a', 22); if (e.gem) fx.text(e.x, e.y - 44, '+1 gem', '#9bf6ff', 18); fx.shake = 8; stop = Math.max(stop, 0.08); }
        else if (e.k === 'block') { sfx.tone(1200, 0.08, 'square', 0.05, 0.5); fx.burst(e.x, e.y - 10, 8, ['#e9ecef', '#adb5bd'], 140, 2.5); fx.text(e.x, e.y - 30, 'BLOCKED', '#e9ecef', 13); }
        else if (e.k === 'warded') { if (Math.random() < 0.3) { sfx.tone(1600, 0.06, 'sine', 0.04); fx.text(e.x, e.y - 70, 'WARDED', '#fff3b0', 13); } }
        else if (e.k === 'phase') { big('THE LIGHT SHIELDS HIM', 'Burn his three acolytes to break the ward', '#fff3b0', 2.6); sting([523, 659, 784, 659], 'sine', 0.08, 0.12); stop = 0.3; fx.shake = 10; fx.ring(e.x, e.y, 90, '#fff3b0'); }
        else if (e.k === 'enrage') { big('THE PALADIN CHARGES!', 'Hold the wall. Burn him!', '#ff8f8f', 2.2); sting([196, 185, 175, 165], 'sawtooth', 0.08, 0.1); stop = 0.25; fx.shake = 14; fx.ring(e.x, e.y, 110, '#ff8f8f'); }
        else if (e.k === 'fly') { big('TAKE WING!', '', L.fire[0], 1.2); sting([392, 523, 659, 784], 'sawtooth', 0.05, 0.07); fx.shake = 8; flyX = -60; }
        else if (e.k === 'rain') { sfx.crack(); for (const k of M.knights) fx.burst(k.x, k.y - 8, 4, L.fire, 90, 3); }
        else if (e.k === 'arc') { arcs.push({ ...e, t: 0 }); sfx.zap(); }
        else if (e.k === 'stab') { sfx.hit(); fx.burst(e.x, e.y - 6, 3, ['#ced4da', '#d1793a'], 70, 2); }
        else if (e.k === 'wildfire') { fx.ring(e.x, e.y, 44, L.fire[2]); fx.burst(e.x, e.y, 10, L.fire, 160, 3.5); }
        else if (e.k === 'omen') env.pick('The omens speak', e.opts.map((o) => ({ icon: o.icon, name: o.name, desc: o.desc, tag: 'this run' })), (i) => choose(M, i));
        else if (e.k === 'boon') say(`${e.o.name}!`, '#e0c3fc');
      }
      M.ev.length = 0;
    }

    function tapAt(x, y) {
      if (M.over || lead < LEAD) return;
      fx.ring(x, y, 22, '#ffffff88');
      if (s.fury && Math.hypot(x - FURY.x, y - FURY.y) < FURY.r + 12) {
        if (fly(M)) { headAim = -Math.PI / 2; } else { sfx.nope(); say(M.flyT > 0 ? 'Already flying!' : `Fury ${Math.floor(M.fury * 100)}%: burn knights to fill it`, '#ffb4a2'); }
        return;
      }
      if (y > G.wallY + 16) { sfx.tone(320, 0.05, 'triangle', 0.04); return; } // inside the cave
      const k = nearest(M, { x, y }, 34);
      const c = !k && M.carts.find((q) => Math.hypot(q.x - x, q.y - y) < 36);
      const v = k || c ? null : G.vills.find((q) => Math.hypot(q.x - x, q.y - 6 - y) < (q.castle ? 46 : 42));
      if (v) {
        const why = dispatch(M, v);
        if (!why) { sfx.pop(1.2); flash[v.id] = M.t; }
        else { sfx.nope(); say(why === 'locked' ? `The ${v.name} unlocks in the upgrade tree` : why === 'guarded' ? 'Only Sappers can raid the Castle' : 'All kobolds are out raiding!', '#ffb4a2'); }
        return;
      }
      if (breathe(M, x, y)) { breathT = M.t; headAim = Math.atan2(y - (G.wallY + 28), x - W / 2); sfx.tone(240, 0.14, 'sawtooth', 0.05, 0.5); }
      else sfx.tone(200, 0.04, 'sine', 0.03); // still catching breath
    }

    if (env.boss) { big('THE PALADIN CHAMPION', 'Burn him before the siege takes your wall', '#ffe08a', 3.2); }

    return {
      get over() { return M.over && outro >= OUTRO; }, set over(v) { if (v) { M.over = true; outro = OUTRO; } }, get t() { return M.t; },
      update(dt, input) {
        dt = Math.max(0, dt); // kit's first frame can hand us a negative dt (rAF stamp < performance.now())
        if (lead < LEAD) { // lead-in: a beat to read the field before the first knight moves
          const was = lead; lead += dt;
          if (was === 0) { if (env.boss) sting([196, 262, 330, 392, 523], 'sawtooth', 0.06, 0.16); else sfx.tone(392, 0.12, 'triangle', 0.06); }
          if (was < LEAD && lead >= LEAD && !env.boss) sfx.tone(587, 0.16, 'triangle', 0.07);
        }
        for (const tp of input.taps) tapAt(tp.x, tp.y);
        let mdt = dt;
        if (lead < LEAD) mdt = 0;
        else if (stop > 0) { stop -= dt; mdt = 0; } // hit pause
        if (M.over) { outro += dt; mdt = 0; }
        if (mdt) step(M, mdt);
        handleEvents();
        const fdt = M.over ? dt * 0.35 : dt; // slow-mo while the run's end sinks in
        fx.update(fdt);
        agg.dmg -= dt; agg.kill.t -= dt; agg.haul.t -= dt;
        if (agg.kill.sum && agg.kill.t <= 0) { fx.text(agg.kill.x, agg.kill.y - 18, '+' + env.fmt(agg.kill.sum), '#ffd166', 15); agg.kill.sum = 0; agg.kill.t = 0.4; }
        if (agg.haul.sum && agg.haul.t <= 0) { agg.haul.side *= -1; fx.text(G.gate.x + agg.haul.side * 86, G.wallY - 46, '+' + env.fmt(agg.haul.sum), M.siege ? '#ffb4a2' : '#ffd166', 16); agg.haul.sum = 0; agg.haul.t = 0.5; }
        if (banner) { banner.t += dt; if (banner.t > banner.dur) banner = null; }
        if (M.flyT > 0) flyX += dt * (W + 120) / s.flyDur;
        pileBump = Math.max(0, pileBump - dt * 4);
        for (const c of coinsFly) c.t += dt * 2.2; coinsFly = coinsFly.filter((c) => c.t < 1);
        for (const a of arcs) a.t += dt; arcs = arcs.filter((a) => a.t < 0.18);
        if (!input.taps.length && M.t - breathT > 0.6) { const k = lead_(M); headAim += ((k ? Math.atan2(k.y - (G.wallY + 28), k.x - W / 2) : -Math.PI / 2) - headAim) * Math.min(1, dt * 3); }
        syncShop();
      },
      draw(g) { drawWorld(g); },
      quit() { cause = 'quit'; },
      result() {
        const e = earnedOf(M), score = Math.floor(M.earned);
        const l1 = `Raided ${env.fmt(M.earned)} gold in ${Math.round(M.t)}s · ${M.kills} knights burned · best streak x${M.bestStreak}`;
        const l2 = [M.carsSeen ? `caravans ${M.carsHit}/${M.carsSeen}` : '', M.flights ? `${M.flights} flight${M.flights > 1 ? 's' : ''}` : '', M.siege ? `held the siege ${Math.round(M.t - M.siegeAt)}s` : `siege was ${Math.ceil(M.siegeAt - M.t)}s away`].filter(Boolean).join(' · ');
        if (M.won) return { won: true, earned: e, score, lines: [l1] };
        const title = cause === 'quit' ? 'You called the kobolds home' : M.bossT >= 0 ? 'The Paladin breached your cave' : cause === 'siege' ? 'The siege engines smashed the wall' : 'The knights broke in!';
        return { won: false, title, earned: e, score, lines: [l1, l2] };
      },
    };

    // ---------------- drawing
    function drawWorld(g) {
      const sx = (Math.random() - 0.5) * fx.shake, sy = (Math.random() - 0.5) * fx.shake, t = M.t, rt = lead + outro + t;
      g.save(); g.translate(sx, sy);
      // sky: night that slides to a red dawn as the siege nears
      const dawn = Math.min(1, M.t / M.siegeAt) ** 2, top = mix('#141230', '#3a2a5c', dawn), hor = mix('#2c3e50', '#f4a259', dawn);
      const sky = g.createLinearGradient(0, 0, 0, 160); sky.addColorStop(0, top); sky.addColorStop(0.75, hor); sky.addColorStop(1, mix('#3c5a48', '#c97b5a', dawn));
      g.fillStyle = sky; g.fillRect(-20, -20, W + 40, 190);
      for (const [x, y, a] of stars) { if (y > 100) continue; g.fillStyle = `rgba(255,255,255,${(0.3 + 0.5 * Math.abs(Math.sin(rt + a * 9))) * (1 - dawn)})`; g.fillRect(x, y, 2, 2); }
      g.fillStyle = `rgba(255,248,220,${0.9 - dawn * 0.6})`; g.beginPath(); g.arc(W * 0.8, 74 + dawn * 50, 14, 0, 6.283); g.fill();
      g.fillStyle = top; g.beginPath(); g.arc(W * 0.8 + 6, 70 + dawn * 50, 12, 0, 6.283); g.fill();
      if (dawn > 0.3) { const sun = g.createRadialGradient(W * 0.72, 150, 4, W * 0.72, 150, 90); sun.addColorStop(0, `rgba(255,214,140,${dawn * 0.8})`); sun.addColorStop(1, 'rgba(255,214,140,0)'); g.fillStyle = sun; g.fillRect(W * 0.72 - 90, 60, 180, 100); }
      // far hills and meadow
      g.fillStyle = mix('#24403a', '#6b4a4a', dawn); g.beginPath(); g.moveTo(0, 150); for (let x = 0; x <= W; x += 20) g.lineTo(x, 128 + Math.sin(x * 0.02 + 1) * 12); g.lineTo(W, 170); g.lineTo(0, 170); g.fill();
      const mead = g.createLinearGradient(0, 140, 0, G.wallY); mead.addColorStop(0, mix('#3c6e47', '#6f7f4a', dawn * 0.6)); mead.addColorStop(1, '#2b5135');
      g.fillStyle = mead; g.beginPath(); g.moveTo(0, 150); for (let x = 0; x <= W; x += 30) g.lineTo(x, 142 + Math.sin(x * 0.03) * 10); g.lineTo(W, G.wallY + 20); g.lineTo(0, G.wallY + 20); g.fill();
      g.strokeStyle = '#4f8a5b'; g.lineWidth = 2; for (const [x, y] of tufts) { const sw = Math.sin(rt * 2 + x) * 1.5; g.beginPath(); g.moveTo(x, y); g.lineTo(x - 3 + sw, y - 6); g.moveTo(x, y); g.lineTo(x + 3 + sw, y - 6); g.stroke(); }
      // roads
      g.lineCap = 'round';
      for (const v of G.vills) { if (!avail(M, v) && !v.castle) continue; g.strokeStyle = avail(M, v) ? '#8a6f4d' : '#5a5040'; g.lineWidth = 14; g.beginPath(); g.moveTo(G.gate.x, G.gate.y); g.lineTo(v.x, v.y); g.stroke(); }
      for (const v of G.vills) { if (!avail(M, v)) continue; g.strokeStyle = '#a3865f'; g.lineWidth = 5; g.setLineDash([6, 10]); g.lineDashOffset = -rt * 12; g.beginPath(); g.moveTo(G.gate.x, G.gate.y); g.lineTo(v.x, v.y); g.stroke(); g.setLineDash([]); }
      for (const f of M.fires) drawGroundFire(g, f, rt);
      for (const v of G.vills) drawVillage(g, v, t, rt);
      if (M.siege) drawTrebuchets(g, t);
      for (const c of M.carts) drawCart(g, c, rt);
      for (const u of M.units) if (u.st !== 'idle') drawUnit(g, u, rt);
      for (const k of M.knights.slice().sort((a, b) => a.y - b.y)) drawKnight(g, k, rt);
      drawCave(g, rt);
      for (const sh of M.shots) drawShot(g, sh);
      for (const r of M.rocks) drawRock(g, r);
      for (const a of arcs) drawArc(g, a);
      if (M.flyT > 0) drawFlight(g, rt);
      fx.draw(g);
      g.restore();
      drawHud(g, rt);
    }

    function drawGroundFire(g, f, t) {
      const a = Math.min(1, f.t / 0.5);
      g.globalAlpha = 0.5 * a; const gr = g.createRadialGradient(f.x, f.y, 2, f.x, f.y, f.r); gr.addColorStop(0, L.fire[0]); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.beginPath(); g.ellipse(f.x, f.y, f.r, f.r * 0.55, 0, 0, 6.283); g.fill();
      g.globalAlpha = a; for (let i = 0; i < 5; i++) { const ox = Math.cos(i * 2.4) * f.r * 0.6, h = 6 + 4 * Math.sin(t * 14 + i * 3); g.fillStyle = L.fire[i % 3]; g.beginPath(); g.moveTo(f.x + ox - 3, f.y + 2); g.quadraticCurveTo(f.x + ox, f.y - h * 2, f.x + ox + 3, f.y + 2); g.fill(); }
      g.globalAlpha = 1;
    }

    function drawVillage(g, v, t, rt) {
      const on = avail(M, v), fl = Math.max(0, 1 - (t - (flash[v.id] ?? -9)) * 4), bob = fl * 3, dawn = Math.min(1, M.t / M.siegeAt);
      g.save(); g.translate(v.x, v.y - bob); g.globalAlpha = on || v.castle ? 1 : 0.42;
      g.fillStyle = 'rgba(0,0,0,.22)'; g.beginPath(); g.ellipse(0, 6, v.castle ? 52 : 40, 8, 0, 0, 6.283); g.fill();
      if (v.castle) {
        g.scale(0.85, 0.85);
        const st = g.createLinearGradient(0, -58, 0, 12); st.addColorStop(0, '#adb5bd'); st.addColorStop(1, '#5c636a');
        g.fillStyle = st; g.fillRect(-46, -28, 92, 40);
        for (const tx of [-46, 30]) { g.fillRect(tx, -48, 16, 60); for (let i = 0; i < 2; i++) g.fillRect(tx + i * 10, -54, 6, 6); }
        g.fillRect(-12, -58, 24, 70); for (let i = 0; i < 3; i++) g.fillRect(-12 + i * 9, -64, 6, 6);
        g.fillStyle = '#343a40'; g.beginPath(); g.arc(0, 12, 11, Math.PI, 0); g.fill(); g.fillRect(-11, 0, 22, 12);
        g.strokeStyle = '#ced4da'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(0, -64); g.lineTo(0, -80); g.stroke();
        g.fillStyle = '#e63946'; g.beginPath(); g.moveTo(0, -80); g.quadraticCurveTo(9, -78 + Math.sin(rt * 5) * 2, 16 + Math.sin(rt * 5) * 3, -75); g.quadraticCurveTo(8, -72, 0, -70); g.fill();
        g.fillStyle = `rgba(255,209,102,${0.6 + 0.4 * Math.sin(rt * 3)})`; for (const wx of [-30, 18, -3]) g.fillRect(wx, wx === -3 ? -44 : -14, 6, 8);
      } else {
        const n = v.id === 'town' ? 4 : v.id === 'farm' ? 2 : 3, roofs = [['#e63946', '#9d0208'], ['#4895ef', '#1d4e89'], ['#dda15e', '#9c6644'], ['#9d4edd', '#5a189a']];
        if (v.id === 'mill') { g.save(); g.translate(30, -16); g.fillStyle = '#c9b18a'; g.fillRect(-5, 0, 10, 20); g.rotate(rt * 1.5); g.fillStyle = '#e9d8a6'; for (let i = 0; i < 4; i++) { g.rotate(Math.PI / 2); g.fillRect(-2, 0, 4, 18); g.fillRect(-5, 6, 3, 12); } g.restore(); }
        if (v.id === 'farm') { for (let i = 0; i < 3; i++) { g.fillStyle = i % 2 ? '#e9c46a' : '#d4a373'; g.fillRect(22, -8 + i * 6, 16, 4); } }
        for (let i = 0; i < n; i++) {
          const hx = (i - (n - 1) / 2) * 22, hy = (i % 2) * 7 - 6, w = 18, [r1, r2] = roofs[(i + v.i) % 4];
          const wl = g.createLinearGradient(hx - w / 2, 0, hx + w / 2, 0); wl.addColorStop(0, '#f8edd7'); wl.addColorStop(1, '#cdb894');
          g.fillStyle = wl; g.fillRect(hx - w / 2, hy - 8, w, 14);
          const rf = g.createLinearGradient(0, hy - 20, 0, hy - 8); rf.addColorStop(0, r1); rf.addColorStop(1, r2);
          g.fillStyle = rf; g.beginPath(); g.moveTo(hx - w / 2 - 3, hy - 8); g.lineTo(hx, hy - 20); g.lineTo(hx + w / 2 + 3, hy - 8); g.fill();
          g.fillStyle = '#5c3d2e'; g.fillRect(hx - 3, hy - 1, 6, 7);
          g.fillStyle = `rgba(255,214,102,${(0.95 - dawn * 0.6) * (0.75 + 0.25 * Math.sin(rt * 4 + i))})`; g.fillRect(hx + 3, hy - 5, 4, 4);
          if (i === 0) { g.fillStyle = '#6c584c'; g.fillRect(hx + 4, hy - 20, 4, 7); for (let p = 0; p < 3; p++) { const q = (rt * 0.5 + p / 3) % 1; g.fillStyle = `rgba(220,220,230,${0.35 * (1 - q)})`; g.beginPath(); g.arc(hx + 6 + q * 8, hy - 22 - q * 18, 2 + q * 4, 0, 6.283); g.fill(); } }
        }
        if (fl > 0) { g.globalAlpha = fl; for (let i = 0; i < 4; i++) { g.fillStyle = L.fire[i % 3]; g.beginPath(); g.arc((i - 1.5) * 12, -18 - Math.random() * 8, 3 + Math.random() * 3, 0, 6.283); g.fill(); } g.globalAlpha = 1; }
      }
      g.globalAlpha = 1;
      const label = v.castle ? (on ? `Castle +${env.fmt(haulOf(M, 'sapper', v))}` : 'Castle 🔒') : on ? `${v.name} +${env.fmt(haulOf(M, 'kobold', v))}` : `${v.name} 🔒`;
      g.font = '800 12px Nunito, system-ui'; g.textAlign = 'center'; const tw = g.measureText(label).width + 12, ly = v.castle ? 30 : 20;
      g.fillStyle = 'rgba(0,0,0,.58)'; rr(g, -tw / 2, ly - 11, tw, 17, 8); g.fill();
      g.fillStyle = on ? '#ffe8a3' : '#ccc'; g.fillText(label, 0, ly + 2);
      if (fl > 0) { g.strokeStyle = `rgba(255,209,102,${fl})`; g.lineWidth = 3; g.beginPath(); g.arc(0, -6, 30 + (1 - fl) * 14, 0, 6.283); g.stroke(); }
      g.restore();
    }

    function drawTrebuchets(g, t) {
      for (const sd of [0, 1]) {
        const x = sd ? W - 30 : 30, y = 150, a = Math.min(1, (t - trebArm[sd]) * 3), sw = a < 1 ? -1.2 + 2.2 * a : 1;
        g.save(); g.translate(x, y); g.scale(sd ? -1 : 1, 1);
        g.fillStyle = '#5c3d2e'; g.beginPath(); g.moveTo(-14, 12); g.lineTo(0, -16); g.lineTo(14, 12); g.lineTo(9, 12); g.lineTo(0, -6); g.lineTo(-9, 12); g.fill();
        g.fillStyle = '#7f5539'; g.fillRect(-18, 10, 36, 5);
        g.save(); g.translate(0, -14); g.rotate(sw); g.fillStyle = '#9c6644'; g.fillRect(-4, -26, 3, 34); g.fillStyle = '#3d2b1f'; g.fillRect(-7, 6, 10, 9); g.restore();
        g.fillStyle = '#222'; for (const wx of [-12, 12]) { g.beginPath(); g.arc(wx, 15, 4, 0, 6.283); g.fill(); }
        g.restore();
      }
    }
    function drawRock(g, r) {
      const q = Math.min(1, r.t / SIEGE.flight), x = r.x0 + (r.x - r.x0) * q, y = r.y0 + (r.y - r.y0) * q - Math.sin(q * Math.PI) * 120, gy = r.y0 + (r.y - r.y0) * q;
      g.fillStyle = `rgba(0,0,0,${0.15 + 0.25 * q})`; g.beginPath(); g.ellipse(x, gy + 4, 6 + 6 * q, 3 + 2 * q, 0, 0, 6.283); g.fill();
      const sz = 7 + 3 * Math.sin(q * Math.PI);
      const rg = g.createRadialGradient(x - 2, y - 2, 1, x, y, sz); rg.addColorStop(0, '#b0a090'); rg.addColorStop(1, '#5a4a3c');
      g.fillStyle = rg; g.beginPath(); g.arc(x, y, sz, 0, 6.283); g.fill();
      g.strokeStyle = 'rgba(255,255,255,.2)'; g.lineWidth = 1.5; g.beginPath(); g.arc(x, y, sz - 2, 3.6 + r.t * 6, 4.6 + r.t * 6); g.stroke();
    }
    function drawCart(g, c, rt) {
      const dir = Math.sign(c.vx), hit = Math.max(0, 1 - (M.t - c.hitT) * 6), bob = Math.abs(Math.sin(rt * 9)) * 1.5;
      g.save(); g.translate(c.x, c.y);
      const gl = g.createRadialGradient(0, -10, 2, 0, -10, 40); gl.addColorStop(0, 'rgba(255,214,102,.35)'); gl.addColorStop(1, 'rgba(255,214,102,0)'); g.fillStyle = gl; g.beginPath(); g.arc(0, -10, 40, 0, 6.283); g.fill();
      g.fillStyle = 'rgba(0,0,0,.25)'; g.beginPath(); g.ellipse(0, 6, 26, 5, 0, 0, 6.283); g.fill();
      g.scale(dir, 1);
      // horse
      g.fillStyle = '#8d5524'; g.beginPath(); g.ellipse(26, -10 - bob, 10, 6, 0, 0, 6.283); g.fill(); g.beginPath(); g.ellipse(36, -18 - bob, 4, 6, 0.5, 0, 6.283); g.fill();
      g.strokeStyle = '#5c3d2e'; g.lineWidth = 2.5; for (const lx of [20, 31]) { g.beginPath(); g.moveTo(lx, -6 - bob); g.lineTo(lx + Math.sin(rt * 12 + lx) * 3, 4); g.stroke(); }
      // wagon + canopy + chest
      g.fillStyle = hit ? '#fff' : '#7f5539'; rr(g, -18, -14, 34, 13, 3); g.fill();
      g.fillStyle = hit ? '#fff' : '#f1e3c6'; g.beginPath(); g.moveTo(-18, -14); g.quadraticCurveTo(-1, -40, 16, -14); g.fill();
      g.fillStyle = '#e9c46a'; rr(g, -8, -22, 14, 9, 2); g.fill(); g.fillStyle = '#fff3b0'; g.fillRect(-2, -20, 2, 4);
      g.fillStyle = '#222'; for (const wx of [-11, 9]) { g.beginPath(); g.arc(wx, 0, 5, 0, 6.283); g.fill(); g.strokeStyle = '#999'; g.lineWidth = 1; g.beginPath(); g.moveTo(wx - 4 * Math.cos(rt * 8), -4 * Math.sin(rt * 8)); g.lineTo(wx + 4 * Math.cos(rt * 8), 4 * Math.sin(rt * 8)); g.stroke(); }
      g.restore();
      const w = 40; g.fillStyle = 'rgba(0,0,0,.6)'; g.fillRect(c.x - w / 2, c.y - 46, w, 5); g.fillStyle = '#ffd166'; g.fillRect(c.x - w / 2, c.y - 46, w * Math.max(0, c.hp / c.max), 5);
    }

    function drawUnit(g, u, t) {
      const back = u.st === 'back', a = back ? u.v : G.gate, b = back ? G.gate : u.v, dir = Math.sign((b?.x ?? 0) - (a?.x ?? 0)) || 1;
      const hop = Math.abs(Math.sin(t * 14 + u.ph)) * 2.5;
      g.save(); g.translate(u.x, u.y - hop); g.scale(dir * 1.5, 1.5);
      g.fillStyle = 'rgba(0,0,0,.2)'; g.beginPath(); g.ellipse(0, 1 + hop / 1.5, 7, 2, 0, 0, 6.283); g.fill();
      if (u.type === 'wagon') {
        g.fillStyle = '#7f5539'; rr(g, -14, -12, 28, 12, 3); g.fill(); g.fillStyle = '#9c6644'; g.fillRect(-14, -12, 28, 3);
        if (back) { g.fillStyle = '#ffd166'; g.beginPath(); g.ellipse(0, -12, 12, 6, 0, Math.PI, 0); g.fill(); g.fillStyle = '#fff3b0'; g.beginPath(); g.arc(-3, -15, 2, 0, 6.283); g.fill(); }
        g.fillStyle = '#222'; g.beginPath(); g.arc(-8, 1, 4.5, 0, 6.283); g.arc(8, 1, 4.5, 0, 6.283); g.fill();
        g.fillStyle = '#c96'; g.beginPath(); g.ellipse(21, -8, 6, 4.5, 0, 0, 6.283); g.fill(); g.fillStyle = '#f1e3c6'; g.fillRect(22, -14, 2, 4);
      } else {
        const body = u.type === 'thief' ? '#5a4a78' : u.type === 'sapper' ? '#8d7b68' : '#d1793a';
        g.strokeStyle = body; g.lineWidth = 3; g.lineCap = 'round'; g.beginPath(); g.moveTo(-5, 0); g.quadraticCurveTo(-12, 2, -14, -4 + Math.sin(t * 10 + u.ph) * 1.5); g.stroke();
        g.fillStyle = body; g.beginPath(); g.ellipse(0, -5, 6, 5, 0, 0, 6.283); g.fill();
        g.beginPath(); g.arc(5, -11, 4.5, 0, 6.283); g.fill(); g.beginPath(); g.ellipse(9, -10, 3, 2, 0, 0, 6.283); g.fill();
        g.fillStyle = '#ffec99'; g.fillRect(6, -12.5, 2, 2);
        if (u.type === 'kobold' && s.spear) { g.strokeStyle = '#adb5bd'; g.lineWidth = 1.2; g.beginPath(); g.moveTo(-2, -2); g.lineTo(10, -18); g.stroke(); g.fillStyle = '#e9ecef'; g.beginPath(); g.moveTo(10, -18); g.lineTo(9, -14); g.lineTo(12, -15); g.fill(); }
        if (u.type === 'thief') { g.fillStyle = '#2d2440'; g.beginPath(); g.arc(5, -12, 5, Math.PI, 0); g.fill(); }
        if (u.type === 'sapper') { g.fillStyle = '#ffd60a'; g.beginPath(); g.arc(5, -13, 5, Math.PI, 0); g.fill(); if (!back) { g.fillStyle = '#222'; g.beginPath(); g.arc(-6, -9, 4, 0, 6.283); g.fill(); g.fillStyle = Math.sin(t * 20) > 0 ? '#ffd166' : '#e85d04'; g.beginPath(); g.arc(-6, -14, 1.5, 0, 6.283); g.fill(); } }
        if (back) { g.fillStyle = '#ffd166'; g.beginPath(); g.arc(-5, -10, u.type === 'sapper' ? 6 : 4.5, 0, 6.283); g.fill(); g.fillStyle = '#e09f3e'; g.fillRect(-6, -15, 2, 3); }
      }
      g.restore();
    }

    function drawKnight(g, k, t) {
      const boss = k.kind === 'boss', cap = k.kind === 'cap', sc = boss ? 2.6 : cap ? 1.6 : k.kind === 'shield' ? 1.35 : 1.25, hit = boss ? 0 : Math.max(0, 1 - (M.t - k.hitT) * 8);
      const moving = !k.atWall && !k.hold && k.stunT <= 0 && k.sp > 0, step = k.atWall ? Math.sin(t * 10 + k.ph) * 3 : moving ? Math.abs(Math.sin(t * 8 + k.ph)) * 2 : 0;
      g.save(); g.translate(k.x, k.y);
      if (boss) { const gl = g.createRadialGradient(0, -14, 4, 0, -14, 60); gl.addColorStop(0, k.enraged ? 'rgba(255,120,120,.5)' : 'rgba(255,240,170,.45)'); gl.addColorStop(1, 'rgba(255,240,170,0)'); g.fillStyle = gl; g.beginPath(); g.arc(0, -14, 60, 0, 6.283); g.fill(); }
      if (k.kind === 'priest') { g.strokeStyle = `rgba(180,255,190,${0.25 + 0.15 * Math.sin(t * 4)})`; g.lineWidth = 2; g.beginPath(); g.arc(0, -8, 70, 0, 6.283); g.stroke(); }
      g.fillStyle = 'rgba(0,0,0,.25)'; g.beginPath(); g.ellipse(0, 4, (k.kind === 'lancer' ? 14 : 9) * sc, 3 * sc, 0, 0, 6.283); g.fill();
      g.scale(sc, sc); g.translate(0, -step);
      const metal = hit ? '#ffffff' : boss ? '#f1e3a8' : k.kind === 'priest' || k.kind === 'acolyte' ? '#f1faee' : '#ced4da', dark = boss ? '#c9a227' : '#868e96';
      if (k.kind === 'lancer') { // on a horse
        g.fillStyle = hit ? '#fff' : '#6f4e37'; g.beginPath(); g.ellipse(0, -4, 12, 6, 0, 0, 6.283); g.fill(); g.beginPath(); g.ellipse(0, -12, 4, 6, 0, 0, 6.283); g.fill();
        g.strokeStyle = '#4a3426'; g.lineWidth = 2; for (const lx of [-8, -3, 4, 9]) { g.beginPath(); g.moveTo(lx, -1); g.lineTo(lx + Math.sin(t * 16 + lx + k.ph) * 3, 5); g.stroke(); }
        g.translate(0, -8); g.scale(0.85, 0.85);
      }
      if (k.kind === 'acolyte') { g.fillStyle = metal; g.beginPath(); g.moveTo(-8, 2); g.lineTo(0, -18); g.lineTo(8, 2); g.fill(); g.fillStyle = '#ffe8a3'; g.beginPath(); g.arc(0, -20, 5, 0, 6.283); g.fill(); g.strokeStyle = `rgba(255,240,170,${0.6 + 0.4 * Math.sin(t * 6)})`; g.lineWidth = 1.5; g.beginPath(); g.ellipse(0, -27, 6, 2, 0, 0, 6.283); g.stroke(); g.restore(); hpBar(g, k, sc); return; }
      if (boss) { g.fillStyle = k.enraged ? '#9d0208' : '#3a86ff'; g.beginPath(); g.moveTo(-6, -14); g.quadraticCurveTo(-14, -2 + Math.sin(t * 4) * 2, -10, 4); g.lineTo(6, 2); g.fill(); }
      if (k.kind === 'priest') { g.fillStyle = metal; g.beginPath(); g.moveTo(-8, 3); g.lineTo(-5, -15); g.lineTo(5, -15); g.lineTo(8, 3); g.fill(); g.fillStyle = '#52b788'; g.fillRect(-1, -14, 2, 15); }
      else { g.fillStyle = dark; g.fillRect(-5, -2, 3, 5); g.fillRect(2, -2, 3, 5); const ar = g.createLinearGradient(-7, 0, 7, 0); ar.addColorStop(0, hit ? '#fff' : metal); ar.addColorStop(1, hit ? '#fff' : dark); g.fillStyle = ar; rr(g, -7, -15, 14, 14, 4); g.fill(); }
      g.fillStyle = metal; g.beginPath(); g.arc(0, -19, 6, 0, 6.283); g.fill();
      g.fillStyle = '#212529'; g.fillRect(-4, -20, 8, 2);
      if (k.kind === 'priest') { g.strokeStyle = '#ffe8a3'; g.lineWidth = 1.2; g.beginPath(); g.ellipse(0, -27, 6, 2, 0, 0, 6.283); g.stroke(); }
      else { g.fillStyle = boss ? '#ffd166' : cap ? '#4cc9f0' : k.kind === 'shield' ? '#f4a261' : '#e63946'; g.beginPath(); g.moveTo(-1, -25); g.quadraticCurveTo(-8 - Math.sin(t * 6 + k.ph), -33, -10, -22); g.lineTo(1, -24); g.fill(); }
      if (k.kind === 'shield' && k.shield) { const sg = g.createLinearGradient(3, -20, 13, 4); sg.addColorStop(0, '#e9ecef'); sg.addColorStop(1, '#6c757d'); g.fillStyle = sg; rr(g, 2, -20, 12, 22, 4); g.fill(); g.fillStyle = '#e63946'; g.fillRect(7, -16, 2, 14); g.fillRect(4, -10, 8, 2); }
      else if (k.kind !== 'priest') { g.fillStyle = boss ? '#fff' : '#457b9d'; rr(g, 3, -13, 8, 11, 3); g.fill(); g.fillStyle = boss ? '#c9a227' : '#f1faee'; g.fillRect(6.2, -11, 1.6, 7); g.fillRect(4.5, -8.5, 5, 1.6); }
      if (k.kind === 'lancer') { g.strokeStyle = '#adb5bd'; g.lineWidth = 1.8; g.beginPath(); g.moveTo(-10, -12); g.lineTo(18, -6); g.stroke(); g.fillStyle = '#e63946'; g.beginPath(); g.moveTo(-2, -11); g.lineTo(-8, -16); g.lineTo(-6, -10); g.fill(); }
      else if (k.kind !== 'priest') { g.strokeStyle = boss ? '#fff3b0' : '#adb5bd'; g.lineWidth = boss ? 2.2 : 1.6; g.beginPath(); const sw = k.atWall ? Math.sin(t * 10 + k.ph) * 0.8 : 0; g.moveTo(-7, -9); g.lineTo(-7 - (boss ? 13 : 9) * Math.sin(0.4 + sw), -9 - (boss ? 13 : 9) * Math.cos(0.4 + sw)); g.stroke(); }
      if (k.chill > 0) { g.fillStyle = 'rgba(160,220,255,.35)'; rr(g, -9, -27, 18, 30, 6); g.fill(); }
      if (k.snareT > 0) { g.strokeStyle = '#a3865f'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(-6, 2); g.lineTo(6, -2); g.moveTo(-6, -2); g.lineTo(6, 2); g.stroke(); }
      if (k.stunT > 0) { g.fillStyle = '#fff275'; for (let i = 0; i < 3; i++) { const a = t * 8 + i * 2.1; g.beginPath(); g.arc(Math.cos(a) * 8, -30 + Math.sin(a) * 2, 1.6, 0, 6.283); g.fill(); } }
      if (k.burn > 0) { g.fillStyle = L.fire[1]; g.globalAlpha = 0.8; g.beginPath(); g.arc(Math.sin(t * 20) * 3, -16 - Math.random() * 6, 3, 0, 6.283); g.fill(); g.globalAlpha = 1; }
      if (boss && k.ward) { g.strokeStyle = `rgba(255,243,176,${0.7 + 0.3 * Math.sin(t * 6)})`; g.fillStyle = 'rgba(255,243,176,.18)'; g.lineWidth = 1.5; g.beginPath(); g.arc(0, -12, 20, 0, 6.283); g.fill(); g.stroke(); }
      g.restore();
      if (boss && k.ward) for (const a of M.knights) if (a.kind === 'acolyte') { g.strokeStyle = `rgba(255,243,176,${0.4 + 0.3 * Math.sin(t * 8)})`; g.lineWidth = 2; g.beginPath(); g.moveTo(a.x, a.y - 20); g.lineTo(k.x, k.y - 30); g.stroke(); }
      if (!boss) hpBar(g, k, sc);
    }
    function hpBar(g, k, sc) { if (k.hp >= k.max) return; const w = 22 * sc; g.fillStyle = 'rgba(0,0,0,.6)'; g.fillRect(k.x - w / 2, k.y - 34 * sc, w, 4); g.fillStyle = k.kind === 'acolyte' ? '#fff3b0' : '#ff6b6b'; g.fillRect(k.x - w / 2, k.y - 34 * sc, w * Math.max(0, k.hp / k.max), 4); }

    function drawCave(g, t) {
      const y = G.wallY, cx = W / 2;
      const rock = g.createLinearGradient(0, y - 40, 0, H); rock.addColorStop(0, '#6b5d52'); rock.addColorStop(1, '#2a221d');
      g.fillStyle = rock; g.beginPath(); g.moveTo(-20, H + 20); g.lineTo(-20, y - 30); g.lineTo(40, y - 54); g.lineTo(90, y - 22); g.lineTo(cx - 70, y - 30); g.lineTo(cx - 52, y - 4);
      g.lineTo(cx + 52, y - 4); g.lineTo(cx + 70, y - 30); g.lineTo(W - 90, y - 22); g.lineTo(W - 40, y - 56); g.lineTo(W + 20, y - 28); g.lineTo(W + 20, H + 20); g.fill();
      g.fillStyle = 'rgba(255,255,255,.06)'; g.beginPath(); g.moveTo(40, y - 54); g.lineTo(90, y - 22); g.lineTo(70, y - 20); g.fill(); g.beginPath(); g.moveTo(W - 40, y - 56); g.lineTo(W - 90, y - 22); g.lineTo(W - 70, y - 20); g.fill();
      g.strokeStyle = 'rgba(255,255,255,.07)'; g.lineWidth = 2; for (let i = 0; i < 6; i++) { g.beginPath(); g.moveTo(i * 70 + 10, y + 10 + (i % 3) * 30); g.lineTo(i * 70 + 40, y + 24 + (i % 3) * 30); g.stroke(); }
      const ch = { x: cx, y: y + 104, rx: W * 0.43, ry: 86 };
      const glow = g.createRadialGradient(cx, ch.y + 40, 10, cx, ch.y, ch.rx); glow.addColorStop(0, `rgba(255,190,80,${0.35 + Math.min(0.3, M.earned / 4000)})`); glow.addColorStop(0.6, '#2a1a12'); glow.addColorStop(1, '#140c0a');
      g.fillStyle = glow; g.beginPath(); g.ellipse(ch.x, ch.y, ch.rx, ch.ry, 0, 0, 6.283); g.fill();
      g.fillStyle = '#140c0a'; g.fillRect(cx - 34, y - 2, 68, 30);
      const sz = Math.min(1, Math.log10(1 + M.earned) / 4.6), pw = 50 + 120 * sz, ph = 14 + 46 * sz, py = ch.y + ch.ry - 14, bump = 1 + pileBump * 0.04;
      g.save(); g.translate(cx, py); g.scale(bump, 1 / bump);
      const pg = g.createLinearGradient(0, -ph, 0, 0); pg.addColorStop(0, '#ffe066'); pg.addColorStop(1, '#c9871a');
      g.fillStyle = pg; g.beginPath(); g.moveTo(-pw, 0); g.quadraticCurveTo(-pw * 0.4, -ph * 1.25, 0, -ph); g.quadraticCurveTo(pw * 0.4, -ph * 1.25, pw, 0); g.fill();
      g.fillStyle = '#fff3b0'; for (let i = 0; i < 16; i++) { const a = (i * 0.618) % 1, px = (a - 0.5) * pw * 1.6, pyy = -ph * (1 - Math.abs(px / pw) ** 1.6) * 0.85 * ((i * 0.37) % 1); g.beginPath(); g.ellipse(px, pyy, 4, 2.2, 0, 0, 6.283); g.fill(); }
      if (M.gems) { for (let i = 0; i < Math.min(8, M.gems); i++) { const px = ((i * 0.43) % 1 - 0.5) * pw; g.fillStyle = '#9bf6ff'; g.beginPath(); g.moveTo(px, -ph * 0.5 - 5); g.lineTo(px + 4, -ph * 0.5); g.lineTo(px, -ph * 0.5 + 4); g.lineTo(px - 4, -ph * 0.5); g.fill(); g.fillStyle = '#fff'; g.fillRect(px - 1, -ph * 0.5 - 3, 1.5, 1.5); } }
      g.restore();
      for (let i = 0; i < 3; i++) { const a = (t * 0.7 + i * 0.33) % 1; g.fillStyle = `rgba(255,255,255,${Math.sin(a * Math.PI)})`; const px = cx + Math.sin(i * 7 + Math.floor(t * 0.7 + i * 0.33) * 3) * pw * 0.6; g.beginPath(); g.arc(px, py - ph * 0.6, 1.6 + 1.5 * Math.sin(a * Math.PI), 0, 6.283); g.fill(); }
      for (const c of coinsFly) { const q = c.t, x = c.x + (cx - c.x) * q, yy = y + 10 + (py - ph - y - 10) * q - Math.sin(q * Math.PI) * 30; g.fillStyle = '#ffd166'; g.beginPath(); g.arc(x, yy, 3.5, 0, 6.283); g.fill(); }
      if (M.flyT <= 0) drawDragon(g, cx, py - ph - 4, t);
      // idle kobolds by the gate (fixed spot, fixed-width label)
      const nIdle = idle(M);
      for (let i = 0; i < Math.min(nIdle, 8); i++) { const kx = cx - 70 - (i % 4) * 12, ky = y + 52 + Math.floor(i / 4) * 12 - Math.abs(Math.sin(t * 3 + i)) * 1.5; g.fillStyle = '#d1793a'; g.beginPath(); g.ellipse(kx, ky, 5, 4, 0, 0, 6.283); g.arc(kx + 4, ky - 5, 3.5, 0, 6.283); g.fill(); g.fillStyle = '#ffec99'; g.fillRect(kx + 5, ky - 6, 1.5, 1.5); }
      g.font = "400 14px 'Lilita One', system-ui"; g.textAlign = 'left'; g.fillStyle = nIdle ? '#ffd8a8' : '#998';
      g.fillText(`${nIdle} ready`, cx - 116, y + 84);
      for (const d of M.drakes) drawDrakeling(g, d, t);
      for (const k of M.knights) if (k.y > y - 70) drawKnight(g, k, t); // keep knights at the gate readable over the drakelings
      if (s.fury) drawFuryButton(g, t);
      // gate wall
      const hp = M.wall / M.wallMax, gw = 96, shk = M.t - wallHitT < 0.12 ? (Math.random() - 0.5) * 3 : 0;
      g.save(); g.translate(shk, 0);
      const wg = g.createLinearGradient(0, y - 14, 0, y + 4); wg.addColorStop(0, '#9c8a7a'); wg.addColorStop(1, '#5c4d42');
      g.fillStyle = wg; rr(g, cx - gw / 2, y - 14, gw, 18, 4); g.fill();
      g.strokeStyle = '#4a3f37'; g.lineWidth = 1.5; for (let r = 0; r < 2; r++) for (let i = 0; i < 6; i++) g.strokeRect(cx - gw / 2 + i * 16 + (r ? 8 : 0), y - 14 + r * 9, 16, 9);
      if (hp < 0.66) { g.strokeStyle = '#1b1411'; g.lineWidth = 2; g.beginPath(); g.moveTo(cx - 20, y - 14); g.lineTo(cx - 12, y - 6); g.lineTo(cx - 18, y + 4); if (hp < 0.33) { g.moveTo(cx + 22, y - 14); g.lineTo(cx + 14, y - 4); g.lineTo(cx + 24, y + 4); } g.stroke(); }
      g.restore();
      const bw = 110; g.fillStyle = 'rgba(0,0,0,.65)'; rr(g, cx - bw / 2, y - 34, bw, 15, 7); g.fill();
      g.fillStyle = hp > 0.5 ? '#80ed99' : hp > 0.25 ? '#ffd166' : '#ff6b6b'; rr(g, cx - bw / 2, y - 34, Math.max(0, bw * hp), 15, 7); g.fill();
      g.font = '800 12px Nunito, system-ui'; g.textAlign = 'center'; g.fillStyle = '#fff'; g.fillText('WALL', cx, y - 22);
    }
    function drawFuryButton(g, t) {
      const f = M.fury, ready = canFly(M), { x, y, r } = FURY, pulse = ready ? 1 + 0.06 * Math.sin(t * 8) : 1;
      g.save(); g.translate(x, y); g.scale(pulse, pulse);
      g.fillStyle = ready ? 'rgba(255,183,3,.35)' : 'rgba(0,0,0,.5)'; g.beginPath(); g.arc(0, 0, r, 0, 6.283); g.fill();
      g.strokeStyle = 'rgba(255,255,255,.15)'; g.lineWidth = 5; g.beginPath(); g.arc(0, 0, r - 3, 0, 6.283); g.stroke();
      g.strokeStyle = ready ? '#ffd166' : L.fire[2]; g.lineWidth = 5; g.lineCap = 'round'; g.beginPath(); g.arc(0, 0, r - 3, -Math.PI / 2, -Math.PI / 2 + 6.283 * (M.flyT > 0 ? M.flyT / s.flyDur : f)); g.stroke();
      g.fillStyle = ready ? '#ffe8a3' : '#a49eb8'; for (const sd of [-1, 1]) { g.beginPath(); g.moveTo(0, 2); g.quadraticCurveTo(sd * 10, -16, sd * 18, -6); g.quadraticCurveTo(sd * 12, -4, sd * 12, 4); g.quadraticCurveTo(sd * 6, 0, 0, 6); g.fill(); }
      g.restore();
      g.font = '800 12px Nunito, system-ui'; g.textAlign = 'center'; g.fillStyle = ready ? '#ffe08a' : '#a49eb8';
      g.fillText(M.flyT > 0 ? 'FLYING' : ready ? 'TAP: FLY' : `FURY ${Math.floor(f * 100)}%`, x, y + r + 15);
    }

    function drawDragon(g, x, y, t) {
      const br = Math.sin(t * 2) * 1.5, breathing = M.t - breathT < 0.25;
      g.save(); g.translate(x, y + br * 0.5);
      g.strokeStyle = L.body; g.lineWidth = 9; g.lineCap = 'round'; g.beginPath(); g.moveTo(16, 4); g.quadraticCurveTo(52, 10, 48 + Math.sin(t * 1.5) * 6, -12); g.stroke();
      g.fillStyle = L.dark; g.beginPath(); g.moveTo(48 + Math.sin(t * 1.5) * 6, -12); g.lineTo(54 + Math.sin(t * 1.5) * 6, -20); g.lineTo(44 + Math.sin(t * 1.5) * 6, -16); g.fill();
      drawWings(g, 1, br);
      const bg = g.createRadialGradient(-6, -12, 3, 0, -6, 26); bg.addColorStop(0, L.belly); bg.addColorStop(0.25, L.body); bg.addColorStop(1, L.dark);
      g.fillStyle = bg; g.beginPath(); g.ellipse(0, -6, 24, 16, 0, 0, 6.283); g.fill();
      g.fillStyle = L.belly; g.beginPath(); g.ellipse(-2, -2, 13, 10, 0, 0, 6.283); g.fill();
      g.strokeStyle = 'rgba(0,0,0,.12)'; g.lineWidth = 1; for (let i = 0; i < 3; i++) { g.beginPath(); g.ellipse(-2, -2 + i * 4 - 4, 11 - i * 2, 2, 0, 0, Math.PI); g.stroke(); }
      const a = Math.max(-Math.PI + 0.3, Math.min(-0.3, headAim)), nx = Math.cos(a) * 26, ny = Math.sin(a) * 22 - 12;
      g.strokeStyle = L.body; g.lineWidth = 11; g.beginPath(); g.moveTo(0, -12); g.quadraticCurveTo(nx * 0.3, ny * 0.6, nx, ny); g.stroke();
      g.save(); g.translate(nx, ny); g.rotate(a + Math.PI / 2);
      drawHead(g, 11, L, breathing);
      g.restore();
      g.restore();
    }
    function drawWings(g, sc, br) {
      for (const sd of [-1, 1]) {
        const wg = g.createLinearGradient(0, -40 * sc, 0, 0); wg.addColorStop(0, L.dark); wg.addColorStop(1, L.body);
        g.fillStyle = wg; g.beginPath(); g.moveTo(sd * 6 * sc, -14 * sc); g.quadraticCurveTo(sd * 40 * sc, (-48 - br * 3) * sc, sd * 50 * sc, -20 * sc); g.quadraticCurveTo(sd * 34 * sc, -22 * sc, sd * 30 * sc, -10 * sc); g.quadraticCurveTo(sd * 24 * sc, -16 * sc, sd * 14 * sc, -4 * sc); g.fill();
        g.strokeStyle = 'rgba(0,0,0,.25)'; g.lineWidth = 1; g.beginPath(); g.moveTo(sd * 8 * sc, -14 * sc); g.lineTo(sd * 30 * sc, -10 * sc); g.moveTo(sd * 8 * sc, -14 * sc); g.lineTo(sd * 44 * sc, -24 * sc); g.stroke();
      }
    }
    function drawFlight(g, t) {
      const x = flyX, y = 200 + Math.sin(t * 3) * 20, flap = Math.sin(t * 14) * 8;
      g.save(); g.translate(x, y);
      g.fillStyle = 'rgba(0,0,0,.25)'; g.beginPath(); g.ellipse(0, G.wallY - y - 60, 50, 10, 0, 0, 6.283); g.fill();
      g.rotate(Math.PI / 2); g.scale(1.3, 1.3);
      drawWings(g, 1.2, flap);
      g.fillStyle = L.body; g.beginPath(); g.ellipse(0, -6, 12, 22, 0, 0, 6.283); g.fill();
      g.strokeStyle = L.body; g.lineWidth = 7; g.lineCap = 'round'; g.beginPath(); g.moveTo(0, 12); g.quadraticCurveTo(Math.sin(t * 6) * 10, 30, 0, 44); g.stroke();
      g.save(); g.translate(0, -30); drawHead(g, 9, L, true); g.restore();
      g.restore();
    }
    function drawArc(g, a) {
      g.strokeStyle = L.fire[1]; g.lineWidth = 3; g.globalAlpha = 1 - a.t / 0.18; g.beginPath(); g.moveTo(a.x0, a.y0);
      for (let i = 1; i < 6; i++) { const q = i / 6; g.lineTo(a.x0 + (a.x1 - a.x0) * q + (Math.random() - 0.5) * 14, a.y0 + (a.y1 - a.y0) * q + (Math.random() - 0.5) * 14); }
      g.lineTo(a.x1, a.y1); g.stroke(); g.strokeStyle = '#fff'; g.lineWidth = 1; g.stroke(); g.globalAlpha = 1;
    }

    function drawDrakeling(g, d, t) {
      const fire = M.t - d.fireT < 0.2, f = Math.sin(t * 9 + d.x) * 3;
      g.save(); g.translate(d.x, d.y - Math.abs(f) * 0.6);
      g.fillStyle = L.dark; for (const sd of [-1, 1]) { g.beginPath(); g.moveTo(0, -4); g.quadraticCurveTo(sd * 12, -14 - f, sd * 14, -2); g.fill(); }
      g.fillStyle = L.body; g.beginPath(); g.ellipse(0, -2, 6, 5, 0, 0, 6.283); g.fill();
      g.save(); g.translate(Math.cos(d.aim) * 5, -4 + Math.sin(d.aim) * 3); g.rotate(d.aim + Math.PI / 2); drawHead(g, 4.5, L, fire); g.restore();
      g.restore();
    }

    function drawShot(g, sh) {
      const q = Math.min(1, sh.t / sh.dur), x = sh.x0 + (sh.x - sh.x0) * q, y = sh.y0 + (sh.y - sh.y0) * q - Math.sin(q * Math.PI) * (sh.kind === 'breath' ? 0 : 20);
      if (sh.kind === 'breath') {
        const gr = g.createLinearGradient(sh.x0, sh.y0, x, y); gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(1, L.fire[1]);
        g.strokeStyle = gr; g.lineWidth = 12; g.lineCap = 'round'; g.beginPath(); g.moveTo(sh.x0 + (x - sh.x0) * 0.4, sh.y0 + (y - sh.y0) * 0.4); g.lineTo(x, y); g.stroke();
        const fb = g.createRadialGradient(x, y, 1, x, y, 11); fb.addColorStop(0, '#fff'); fb.addColorStop(0.4, L.fire[0]); fb.addColorStop(1, L.fire[2]);
        g.fillStyle = fb; g.beginPath(); g.arc(x, y, 10, 0, 6.283); g.fill();
      } else { g.fillStyle = L.fire[1]; g.beginPath(); g.arc(x, y, sh.kind === 'glare' ? 6 : 4, 0, 6.283); g.fill(); g.fillStyle = L.fire[0]; g.beginPath(); g.arc(x, y, 2, 0, 6.283); g.fill(); }
    }

    // HUD: every element has a fixed slot. Top bar = gold (left) | hoard bonus (fixed x) | gems + clock (fixed, right of
    // centre, clear of the kit's pause button). Row 2 = siege clock (left). Row 3 = boss bar. Banners and notices have
    // their own reserved bands, so nothing shoves anything else.
    function drawHud(g, t) {
      g.fillStyle = 'rgba(10,8,20,.6)'; g.fillRect(0, 0, W, 44);
      g.fillStyle = '#ffd166'; g.beginPath(); g.arc(22, 22, 10, 0, 6.283); g.fill(); g.fillStyle = '#c9871a'; g.font = "400 13px 'Lilita One', system-ui"; g.textAlign = 'center'; g.fillText('G', 22, 27);
      g.font = "400 24px 'Lilita One', system-ui"; g.textAlign = 'left'; g.fillStyle = '#ffe8a3'; g.fillText(env.fmt(M.gold), 38, 31);
      const hm = haulMult(M); g.font = '800 12px Nunito, system-ui';
      if (hm > 1.01) { g.fillStyle = M.siege ? '#ffb4a2' : '#bde0fe'; g.fillText(`hauls x${hm.toFixed(2)}`, 126, 27); }
      g.textAlign = 'right'; g.font = "400 18px 'Lilita One', system-ui";
      g.fillStyle = '#9bf6ff'; g.fillText(`${M.gems}`, W - 134, 30); g.textAlign = 'left'; g.font = '800 12px Nunito, system-ui'; g.fillText('gems', W - 130, 30); g.textAlign = 'right';
      g.font = "400 18px 'Lilita One', system-ui"; g.fillStyle = '#fff'; g.fillText(`${Math.floor(M.t)}s`, W - 62, 30);
      // siege clock
      const left = M.siegeAt - M.t;
      g.font = '800 12px Nunito, system-ui'; g.textAlign = 'left';
      const sTxt = M.siege ? `SIEGE · ${M.rockN} rock${M.rockN === 1 ? '' : 's'}` : `Siege in ${Math.ceil(left)}s`, sw = 128;
      g.fillStyle = M.siege ? 'rgba(157,2,8,.75)' : left < 8 ? 'rgba(120,60,20,.75)' : 'rgba(0,0,0,.45)'; rr(g, 8, 50, sw, 20, 10); g.fill();
      g.fillStyle = M.siege || left < 8 ? '#ffd6c9' : '#d8d2e8'; g.fillText((M.siege ? '🪨 ' : '🌅 ') + sTxt, 16, 64);
      if (!M.siege) { g.fillStyle = 'rgba(255,180,120,.6)'; g.fillRect(16, 66, (sw - 16) * Math.max(0, 1 - left / M.siegeAt), 2); }
      if (M.boss && M.boss.hp > 0) {
        const bx = 144, bw = W - bx - 62; g.fillStyle = 'rgba(0,0,0,.6)'; rr(g, bx, 50, bw, 20, 10); g.fill();
        g.fillStyle = M.boss.ward ? '#fff3b0' : M.boss.enraged ? '#ff6b6b' : '#ffd166'; rr(g, bx, 50, bw * Math.max(0, M.boss.hp / M.boss.max), 20, 10); g.fill();
        g.strokeStyle = 'rgba(0,0,0,.6)'; g.lineWidth = 2; g.beginPath(); g.moveTo(bx + bw / 2, 50); g.lineTo(bx + bw / 2, 70); g.stroke();
        g.textAlign = 'center'; g.lineWidth = 3; g.strokeStyle = '#1d1600'; g.strokeText(M.boss.ward ? 'PALADIN · WARDED' : M.boss.enraged ? 'PALADIN · ENRAGED' : 'PALADIN CHAMPION', bx + bw / 2, 64); g.fillStyle = '#fff'; g.fillText(M.boss.ward ? 'PALADIN · WARDED' : M.boss.enraged ? 'PALADIN · ENRAGED' : 'PALADIN CHAMPION', bx + bw / 2, 64);
      }
      // streak chip: fixed size, fixed slot under the siege clock (row 74-94)
      if (streakShow && M.t - streakShow.t < 1.6) {
        const a = Math.min(1, (1.6 - (M.t - streakShow.t)) * 2), hot = Math.max(0, 1 - (M.t - streakShow.t) * 4);
        g.globalAlpha = a; g.fillStyle = hot > 0 ? `rgba(255,183,3,${0.45 + 0.4 * hot})` : 'rgba(80,50,0,.75)'; rr(g, 8, 74, 128, 20, 10); g.fill();
        g.font = '800 12px Nunito, system-ui'; g.textAlign = 'left'; g.fillStyle = '#ffe8a3'; g.fillText(`x${streakShow.n} streak · +${Math.min(10, streakShow.n - 1) * 10}%`, 16, 88, 114); g.globalAlpha = 1;
      }
      // notice strip (reserved, y 98-122)
      if (msg && M.t - msg.t < 2.2) { g.globalAlpha = Math.min(1, (2.2 - (M.t - msg.t)) * 2); g.font = '800 13px Nunito, system-ui'; g.textAlign = 'center'; const tw = Math.min(W - 16, g.measureText(msg.text).width + 24); g.fillStyle = 'rgba(0,0,0,.78)'; rr(g, W / 2 - tw / 2, 98, tw, 24, 12); g.fill(); g.fillStyle = msg.c; g.fillText(msg.text, W / 2, 114, W - 32); g.globalAlpha = 1; }
      // big banner band (reserved, centred on the meadow)
      const by = Math.round(G.wallY * 0.46);
      if (lead < LEAD && !env.boss) bannerAt(g, lead < LEAD * 0.55 ? 'Ready…' : 'Raid!', env.runNo === 1 ? 'Tap a village to send a kobold' : `Run ${env.runNo}`, '#ffe08a', by, Math.min(1, lead * 5));
      else if (banner) bannerAt(g, banner.text, banner.sub, banner.c, by, Math.min(1, banner.t * 5, (banner.dur - banner.t) * 3));
      if (M.over) { const a = Math.min(1, outro * 3); g.fillStyle = `rgba(10,6,16,${0.45 * a})`; g.fillRect(0, 0, W, H); bannerAt(g, M.won ? 'THE PALADIN FALLS!' : cause === 'siege' ? 'THE WALL CRUMBLES' : cause === 'quit' ? 'KOBOLDS, HOME!' : 'BREACHED!', M.won ? 'You are the Elder Wyrm' : cause === 'siege' ? 'The siege engines smashed it' : 'The knights broke in', M.won ? '#ffe08a' : '#ff8f8f', by, a); }
      // one hint at a time, at the point of need, gone once done
      const farm = G.vills[0], pulse = 0.5 + 0.5 * Math.sin(t * 6);
      if (lead < LEAD || M.over || banner) return;
      if (M.dispatched < 2 && !s.foreman && env.runNo <= 3) {
        g.strokeStyle = `rgba(255,232,163,${0.5 + 0.5 * pulse})`; g.lineWidth = 3; g.beginPath(); g.arc(farm.x, farm.y - 6, 32 + pulse * 6, 0, 6.283); g.stroke();
        bubble(g, 'Tap a village to send kobolds raiding!', W / 2, farm.y - 64);
        hand(g, farm.x + 26, farm.y + 10 + pulse * 6);
      } else if (M.breathed < 2 && M.knights.length && env.runNo <= 3) {
        const k = lead_(M); if (k) { g.strokeStyle = `rgba(255,140,90,${0.5 + 0.5 * pulse})`; g.lineWidth = 3; g.beginPath(); g.arc(k.x, k.y - 12, 22 + pulse * 5, 0, 6.283); g.stroke();
          bubble(g, 'Knights! Tap them to breathe fire!', W / 2, Math.max(160, Math.min(G.wallY - 60, k.y - 50))); }
      } else if (env.runNo <= 2 && M.t < 40 && M.gold >= cost(M, 'kobold') && M.bought.kobold == null) bubble(g, 'Spend gold: Hire kobold below ↓', W / 2, G.wallY - 54);
      else if (canFly(M) && !M.flights) { g.font = '800 14px Nunito, system-ui'; const tw = g.measureText('Fury full! Tap to fly →').width + 26; bubble(g, 'Fury full! Tap to fly →', FURY.x - FURY.r - 16 - tw / 2, FURY.y); }
      else if (M.carts.length && !M.carsHit && M.carsSeen <= 2) { const c = M.carts[0]; bubble(g, 'Breathe on the caravan for loot!', W / 2, Math.max(160, c.y - 56)); }
    }
    function bannerAt(g, text, sub, c, y, a) {
      if (a <= 0) return; g.globalAlpha = a;
      g.fillStyle = 'rgba(10,6,16,.72)'; g.fillRect(0, y - 34, W, sub ? 66 : 48);
      g.fillStyle = c; g.fillRect(0, y - 34, W, 2); g.fillRect(0, y + (sub ? 30 : 12), W, 2);
      g.font = "400 30px 'Lilita One', system-ui"; g.textAlign = 'center'; g.fillStyle = c; g.fillText(text, W / 2, y + 2, W - 24);
      if (sub) { g.font = '800 13px Nunito, system-ui'; g.fillStyle = '#f4efe6'; g.fillText(sub, W / 2, y + 22, W - 24); }
      g.globalAlpha = 1;
    }
    function bubble(g, text, x, y) { g.font = '800 14px Nunito, system-ui'; g.textAlign = 'center'; const tw = Math.min(W - 16, g.measureText(text).width + 26); x = Math.max(tw / 2 + 8, Math.min(W - tw / 2 - 8, x)); g.fillStyle = 'rgba(255,248,230,.95)'; rr(g, x - tw / 2, y - 18, tw, 30, 15); g.fill(); g.fillStyle = '#2b1d0e'; g.fillText(text, x, y + 2); }
    function hand(g, x, y) { g.save(); g.translate(x, y); g.fillStyle = '#fff'; g.strokeStyle = '#2b1d0e'; g.lineWidth = 2; g.beginPath(); g.moveTo(0, 0); g.lineTo(-4, 4); g.lineTo(-4, 22); g.lineTo(10, 26); g.lineTo(14, 12); g.lineTo(4, 8); g.lineTo(4, 0); g.closePath(); g.fill(); g.stroke(); g.restore(); }
  }
  const idle = (M) => M.units.filter((u) => u.st === 'idle').length;
  const lead_ = lead;
  function rr(g, x, y, w, h, r) { g.beginPath(); g.roundRect ? g.roundRect(x, y, w, h, r) : g.rect(x, y, w, h); }
  function mix(a, b, q) { const p = (c) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16)), A = p(a), B = p(b); return `rgb(${A.map((v, i) => Math.round(v + (B[i] - v) * q)).join(',')})`; }

  /** Dragon head pointing "up" (-y) in local space, r = head radius. Each dragon has its own crest. */
  function drawHead(g, r, L, open) {
    g.fillStyle = L.horn;
    if (L.crest === 'ice') for (const [sx, h] of [[-0.6, 1.3], [0, 1.6], [0.6, 1.3]]) { g.beginPath(); g.moveTo(sx * r - r * 0.22, r * 0.3); g.lineTo(sx * r * 1.3, r * (0.3 + h)); g.lineTo(sx * r + r * 0.22, r * 0.3); g.fill(); }
    else if (L.crest === 'leaf') { g.fillStyle = '#95d5b2'; for (const sd of [-1, 1]) for (const k of [0, 1]) { g.beginPath(); g.ellipse(sd * r * (0.75 + k * 0.25), r * (0.2 + k * 0.55), r * 0.22, r * 0.5, sd * (0.7 + k * 0.3), 0, 6.283); g.fill(); } }
    else if (L.crest === 'bolt') for (const sd of [-1, 1]) { g.beginPath(); g.moveTo(sd * r * 0.4, r * 0.2); g.lineTo(sd * r * 1.0, r * 0.75); g.lineTo(sd * r * 0.75, r * 0.8); g.lineTo(sd * r * 1.25, r * 1.45); g.lineTo(sd * r * 0.55, r * 0.75); g.lineTo(sd * r * 0.8, r * 0.7); g.closePath(); g.fill(); }
    else for (const sd of [-1, 1]) { g.beginPath(); g.moveTo(sd * r * 0.5, r * 0.3); g.lineTo(sd * r * 1.25, r * 1.2); g.lineTo(sd * r * 0.85, r * 0.1); g.fill(); }
    const hg = g.createRadialGradient(-r * 0.3, -r * 0.3, r * 0.1, 0, 0, r * 1.1); hg.addColorStop(0, L.belly); hg.addColorStop(0.3, L.body); hg.addColorStop(1, L.dark);
    g.fillStyle = hg; g.beginPath(); g.ellipse(0, 0, r * 0.85, r, 0, 0, 6.283); g.fill();
    g.fillStyle = L.body; g.beginPath(); g.ellipse(0, -r * 0.85, r * 0.55, r * 0.7, 0, 0, 6.283); g.fill();
    if (open) { g.fillStyle = L.fire[1]; g.beginPath(); g.arc(0, -r * 1.55, r * 0.45, 0, 6.283); g.fill(); g.fillStyle = L.fire[0]; g.beginPath(); g.arc(0, -r * 1.6, r * 0.22, 0, 6.283); g.fill(); }
    g.fillStyle = '#fff'; for (const sd of [-1, 1]) { g.beginPath(); g.arc(sd * r * 0.45, -r * 0.1, r * 0.28, 0, 6.283); g.fill(); }
    g.fillStyle = L.crest === 'bolt' ? '#5a189a' : '#1b1411'; for (const sd of [-1, 1]) { g.beginPath(); g.ellipse(sd * r * 0.47, -r * 0.18, r * 0.1, r * 0.2, 0, 0, 6.283); g.fill(); }
    g.fillStyle = 'rgba(255,255,255,.8)'; for (const sd of [-1, 1]) { g.beginPath(); g.arc(sd * r * 0.4, -r * 0.24, r * 0.06, 0, 6.283); g.fill(); }
    g.fillStyle = L.dark; for (const sd of [-1, 1]) { g.beginPath(); g.arc(sd * r * 0.2, -r * 1.3, r * 0.08, 0, 6.283); g.fill(); }
  }
  function drawFace(g, who, x, y, r) {
    const L = LOOK[who] || LOOK.ember;
    const gl = g.createRadialGradient(x, y, 2, x, y, r * 1.3); gl.addColorStop(0, L.fire[1] + '55'); gl.addColorStop(1, L.fire[1] + '00'); g.fillStyle = gl; g.beginPath(); g.arc(x, y, r * 1.3, 0, 6.283); g.fill();
    g.save(); g.translate(x, y + r * 0.15); g.rotate(Math.PI); // snout down, crest up
    g.scale(-1, 1);
    drawHead(g, r * 0.62, L, false);
    g.restore();
  }

  window.Hoard = { NODES, Model, baseStats, drawFace };
  const K = Kit.game({
    id: 'hoard', title: 'Hoard', tagline: 'A young dragon, a cave, and a lot of villages that have far too much gold. Send kobolds raiding, grow the pile, and burn the knights who come to take it back.',
    howTo: 'Tap a village to send a kobold raiding. Spend raided gold on the buttons below to snowball. Tap knights to breathe fire before they break your wall. At dawn the siege engines arrive: grab what you can before the wall falls. Part of every run\'s gold banks as renown for the upgrade tree.',
    runVerb: 'Raid!', winTitle: 'Elder Wyrm!', loseTitle: 'The knights broke in!', scoreName: 'gold raided',
    colors: { accent: '#ffb703', bg: '#1a1320', card: '#2d2236' },
    currencies: [{ id: 'renown', name: 'renown', color: '#ffb703' }, { id: 'gems', name: 'gems', color: '#9bf6ff' }],
    characters: [
      { id: 'ember', name: 'Ember', blurb: 'Red dragon. Hotter, wider fire.', unlock: 0, icon: '🔥' },
      { id: 'rime', name: 'Rime', blurb: 'Frost dragon. Knights march slower; a big unspent hoard boosts every haul.', unlock: 1, icon: '❄️' },
      { id: 'moss', name: 'Moss', blurb: 'Forest dragon. Kobolds hatch for free every few seconds.', unlock: 2, icon: '🌿' },
      { id: 'volt', name: 'Volt', blurb: 'Storm dragon. Breath is lightning that jumps to 2 more knights.', unlock: 3, icon: '⚡' },
    ],
    drawFace, nodes: NODES, touchOffset: 0,
    baseStats, createRun,
  });
  if (Kit.DEV) window.Hoard.kit = K; // for automated testing
  document.body.dataset.ready = '1';
})();
