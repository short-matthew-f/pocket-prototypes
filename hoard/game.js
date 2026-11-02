// Hoard: you are a young dragon. Tap villages to send kobolds raiding, spend the loot mid-run on more raiders and
// defenders (the snowball), and burn the knights who march on your cave. Gnorp-style automation, fantasy clothes.
// The simulation model (Model.*) is DOM-free so sim.js can run it in node; the kit glue lives at the bottom.
(function () {
  'use strict';
  const NODES = [
    { id: 'brood', name: 'Bigger Brood', icon: '🥚', desc: '+1 kobold at the start of each run', cost: 5, grow: 1.7, max: 6, req: [], x: 0, y: 0, fx: (s, l) => { s.kobolds += l; } },
    // raiding (right)
    { id: 'packs', name: 'Deep Pockets', icon: '👝', desc: '+30% gold per haul', cost: 8, grow: 1.5, max: 12, req: ['brood'], x: 1, y: 0, fx: (s, l) => { s.carry *= 1 + 0.3 * l; } },
    { id: 'legs', name: 'Quick Feet', icon: '🦶', desc: '+15% minion speed', cost: 12, grow: 1.6, max: 8, req: ['packs'], x: 2, y: 0, fx: (s, l) => { s.speed *= 1.15 ** l; } },
    { id: 'thief', name: "Thieves' Guild", icon: '🗡️', desc: 'Hire Thieves mid-run: fast raiders that need no tapping', cost: 40, max: 1, req: ['legs'], x: 3, y: 0, fx: (s) => { s.has.thief = 1; } },
    { id: 'thief2', name: 'Cutpurses', icon: '🪙', desc: 'Thieves +30% haul', cost: 90, grow: 1.8, max: 6, req: ['thief'], x: 4, y: 0, fx: (s, l) => { s.thiefHaul *= 1 + 0.3 * l; } },
    { id: 'mill', name: 'Raid the Mill', icon: '🌾', desc: 'Unlocks the Mill: a closer, richer village', cost: 20, max: 1, req: ['packs'], x: 1, y: -1, fx: (s) => { s.has.mill = 1; } },
    { id: 'town', name: 'Raid the Town', icon: '🏘️', desc: 'Unlocks the Town: far away, big hauls', cost: 140, max: 1, req: ['mill'], x: 1, y: -2, fx: (s) => { s.has.town = 1; } },
    { id: 'wagon', name: 'Wagon Works', icon: '🛒', desc: 'Buy Wagons mid-run: slow, auto, carry 6x', cost: 260, max: 1, req: ['town'], x: 2, y: -2, fx: (s) => { s.has.wagon = 1; } },
    { id: 'oxen', name: 'Oxen', icon: '🐂', desc: 'Wagons carry +40%', cost: 400, grow: 1.7, max: 6, req: ['wagon'], x: 3, y: -2, fx: (s, l) => { s.wagonHaul *= 1 + 0.4 * l; } },
    { id: 'sapper', name: 'Sapper Corps', icon: '💣', desc: 'Buy Sappers mid-run: they raid the Castle for huge hauls and gems', cost: 700, max: 1, req: ['wagon'], x: 2, y: -3, fx: (s) => { s.has.sapper = 1; } },
    { id: 'gemsense', name: 'Gem Sense', icon: '🔍', desc: 'Sappers: +8% gem chance', cost: 3, grow: 1.8, max: 5, req: ['sapper'], x: 3, y: -3, cur: 'gems', fx: (s, l) => { s.gemChance += 0.08 * l; } },
    // economy (down)
    { id: 'foreman', name: 'Kobold Foreman', icon: '📯', desc: 'Idle kobolds head out on their own (faster per level)', cost: 30, grow: 1.9, max: 4, req: ['brood'], x: 0, y: 1, fx: (s, l) => { s.foreman = 4.5 - l; } },
    { id: 'haggle', name: 'Haggling', icon: '🤝', desc: 'In-run prices -8%', cost: 60, grow: 1.8, max: 6, req: ['foreman'], x: 1, y: 1, fx: (s, l) => { s.price *= 0.92 ** l; } },
    { id: 'bank', name: 'Treasurer', icon: '📜', desc: '+10% of raided gold banks as renown', cost: 80, grow: 1.9, max: 5, req: ['haggle'], x: 2, y: 1, fx: (s, l) => { s.bank += 0.1 * l; } },
    { id: 'bed', name: 'Gilded Bed', icon: '🛏️', desc: 'Start each run with 40 gold', cost: 2, grow: 1.8, max: 5, req: ['bank'], x: 3, y: 1, cur: 'gems', fx: (s, l) => { s.startGold += 40 * l; } },
    { id: 'warren', name: 'Kobold Warren', icon: '🕳️', desc: '+3 starting kobolds', cost: 2, grow: 1.8, max: 4, req: ['foreman'], x: 0, y: 2, cur: 'gems', fx: (s, l) => { s.kobolds += 3 * l; } },
    // defence (left / up)
    { id: 'fire', name: 'Hotter Breath', icon: '🔥', desc: '+40% fire damage', cost: 6, grow: 1.55, max: 12, req: ['brood'], x: -1, y: 0, fx: (s, l) => { s.fire *= 1.4 ** l; } },
    { id: 'quick', name: 'Quick Breath', icon: '💨', desc: 'Breathe 12% more often', cost: 15, grow: 1.7, max: 6, req: ['fire'], x: -2, y: 0, fx: (s, l) => { s.fireCd *= 0.88 ** l; } },
    { id: 'wide', name: 'Wide Flame', icon: '🌋', desc: '+8 blast radius', cost: 30, grow: 1.7, max: 6, req: ['quick'], x: -3, y: 0, fx: (s, l) => { s.fireR += 8 * l; } },
    { id: 'dfire', name: 'Dragonfire', icon: '☄️', desc: '+50% fire damage', cost: 3, grow: 1.8, max: 5, req: ['wide'], x: -4, y: 0, cur: 'gems', fx: (s, l) => { s.fire *= 1.5 ** l; } },
    { id: 'glare', name: 'Smouldering Glare', icon: '👁️', desc: 'Your dragon spits at the nearest knight on its own (faster per level)', cost: 50, grow: 1.8, max: 5, req: ['fire'], x: -1, y: -1, fx: (s, l) => { s.glare = 1.6 * 0.82 ** (l - 1); } },
    { id: 'drake', name: 'Drakeling Nest', icon: '🐲', desc: 'Hatch Drakelings mid-run: they shoot knights for you', cost: 150, max: 1, req: ['glare'], x: -1, y: -2, fx: (s) => { s.has.drake = 1; } },
    { id: 'drake2', name: 'Brood Mothers', icon: '🐉', desc: 'Drakelings +50% damage', cost: 220, grow: 1.7, max: 6, req: ['drake'], x: -2, y: -2, fx: (s, l) => { s.drakeDmg *= 1.5 ** l; } },
    { id: 'wyrmling', name: 'Wyrmlings', icon: '🦖', desc: '+1 Drakeling at the start of each run', cost: 3, grow: 1.8, max: 4, req: ['drake2'], x: -3, y: -2, cur: 'gems', fx: (s, l) => { s.drakeStart += l; } },
    { id: 'wall', name: 'Thick Walls', icon: '🧱', desc: '+35% cave wall', cost: 8, grow: 1.55, max: 12, req: ['brood'], x: 0, y: -1, fx: (s, l) => { s.wall *= 1 + 0.35 * l; } },
    { id: 'masons', name: 'Kobold Masons', icon: '🔨', desc: 'Patch the wall mid-run with gold', cost: 40, max: 1, req: ['wall'], x: 0, y: -2, fx: (s) => { s.has.patch = 1; } },
    { id: 'moat', name: 'Muddy Moat', icon: '🪵', desc: 'Knights march 7% slower', cost: 70, grow: 1.8, max: 5, req: ['masons'], x: 0, y: -3, fx: (s, l) => { s.kSpeed *= 0.93 ** l; } },
    { id: 'scales', name: 'Ironscale Gate', icon: '🛡️', desc: '+50% cave wall', cost: 3, grow: 1.8, max: 5, req: ['moat'], x: -1, y: -3, cur: 'gems', fx: (s, l) => { s.wall *= 1 + 0.5 * l; } },
    // one per dragon
    { id: 'ember', who: 'ember', name: 'Inferno', icon: '♨️', desc: 'Burning knights take 15% more of the hit over 2s', cost: 35, grow: 1.9, max: 5, req: ['fire'], x: -1, y: 1, fx: (s, l) => { s.burn += 0.15 * l; } },
    { id: 'rime', who: 'rime', name: 'Glacier Hoard', icon: '❄️', desc: 'Hoard bonus cap +30% and frost slows knights you hit', cost: 35, grow: 1.9, max: 5, req: ['fire'], x: -1, y: 1, fx: (s, l) => { s.stackCap += 0.3 * l; s.chill = Math.min(0.7, 0.3 + 0.1 * l); } },
    { id: 'moss', who: 'moss', name: 'Overgrowth', icon: '🌿', desc: 'Kobolds hatch 18% faster', cost: 35, grow: 1.9, max: 5, req: ['fire'], x: -1, y: 1, fx: (s, l) => { s.breed *= 0.82 ** l; } },
    // win
    { id: 'wyrm', name: 'Become the Elder Wyrm', icon: '👑', desc: 'Your next run faces the Paladin Champion. Burn him to win.', cost: 25000, grow: 1, max: 1, req: ['sapper', 'drake2', 'moat', 'dfire', 'scales'], reqAll: 3, extra: { gems: 12 }, x: 1, y: -4, win: true },
  ];

  const VILL = [
    { id: 'farm', name: 'Farm', fx: 0.16, fy: 0.84, yield: 2 },
    { id: 'hamlet', name: 'Hamlet', fx: 0.2, fy: 0.3, yield: 5 },
    { id: 'mill', name: 'Mill', fx: 0.84, fy: 0.68, yield: 7, need: 'mill' },
    { id: 'town', name: 'Town', fx: 0.8, fy: 0.12, yield: 20, need: 'town' },
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
  const BOSS_HP = 700000;

  function baseStats(who) {
    const s = { kobolds: 3, speed: 1, carry: 1, thiefSpeed: 1, thiefHaul: 1, wagonHaul: 1, gemChance: 0.12,
      fire: 4, fireCd: 0.4, fireR: 30, glare: 0, drakeDmg: 1, drakeStart: 0, wall: 10, kSpeed: 1, kEvery: 2.2,
      price: 1, bank: 0.5, startGold: 0, foreman: 0, breed: 0, stack: 0, stackCap: 0, burn: 0, chill: 0, has: {} };
    if (who === 'ember') { s.fire *= 1.5; s.fireR += 6; }
    if (who === 'rime') { s.kSpeed *= 0.8; s.stack = 0.25; s.stackCap = 1; }
    if (who === 'moss') { s.breed = 6; }
    return s;
  }

  // ---------------------------------------------------------------- model (no DOM)
  function geo(W, H) {
    const shopH = 124, wallY = Math.max(300, H - shopH - 196), y0 = 128, y1 = wallY - 78;
    return { W, H, shopH, wallY, gate: { x: W / 2, y: wallY - 6 },
      vills: VILL.map((v, i) => ({ ...v, i, x: v.fx * W, y: v.castle ? 84 : y0 + v.fy * (y1 - y0) })) };
  }
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

  function create(o) { // o = {who, s, W, H, boss, rnd}
    const s = o.s, G = geo(o.W, o.H);
    const M = { s, G, who: o.who, rnd: o.rnd || Math.random, t: 0, over: false, won: false, gold: s.startGold, earned: 0, gems: 0, kills: 0,
      wall: s.wall, wallMax: s.wall, units: [], knights: [], shots: [], drakes: [], bought: {}, ev: [], spawnT: 1.2, capT: 18,
      fireCd: 0, glareT: s.glare, breedT: s.breed, foreT: s.foreman, boss: null, bossT: o.boss ? 4 : -1, dispatched: 0, breathed: 0, hauls: 0 };
    for (let i = 0; i < s.kobolds; i++) addUnit(M, 'kobold');
    for (let i = 0; i < s.drakeStart; i++) addDrake(M);
    return M;
  }
  const avail = (M, v) => !v.need || M.s.has[v.need];
  function addUnit(M, type) {
    const u = { type, st: 'idle', v: null, p: 0, carry: 0, tt: 0, lane: (M.rnd() - 0.5) * 14, ph: M.rnd() * 6, x: M.G.gate.x, y: M.G.gate.y };
    M.units.push(u);
    if (type !== 'kobold') send(M, u, best(M, type));
    return u;
  }
  function addDrake(M) { const n = M.drakes.length, side = n % 2 ? 1 : -1, k = Math.floor(n / 2), per = Math.max(1, Math.floor((M.G.W / 2 - 92) / 28)), col = k % per, row = Math.floor(k / per) % 3;
    M.drakes.push({ x: M.G.W / 2 + side * (78 + col * 28 + row * 10), y: M.G.wallY + 2 - row * 20 - (col % 2) * 6, cd: 0.5 + M.rnd(), aim: 0, fireT: -1 }); }
  const haulMult = (M) => 1 + Math.min(M.s.stackCap, M.s.stack * M.gold / 100);
  const speedOf = (M, type) => SPEED[type] * M.s.speed * (type === 'thief' ? M.s.thiefSpeed : 1);
  function haulOf(M, type, v) { return v.yield * M.s.carry * (type === 'thief' ? M.s.thiefHaul : type === 'wagon' ? 6 * M.s.wagonHaul : 1); }
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
    if (M.gold < c || (k === 'patch' && M.wall >= M.wallMax)) return false;
    M.gold -= c; M.bought[k] = (M.bought[k] || 0) + 1;
    if (k === 'patch') M.wall = Math.min(M.wallMax, M.wall + M.wallMax * 0.4);
    else if (k === 'drake') addDrake(M);
    else addUnit(M, k);
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
  function spawnKnight(M, kind) {
    const G = M.G, r = M.rnd, t = M.t;
    let x, y;
    if (kind === 'boss' || r() < 0.45) { x = G.W / 2 + (r() - 0.5) * 30; y = 104; }
    else { const side = r() < 0.5 ? -1 : 1; x = G.W / 2 + side * (G.W / 2 + 12); y = 140 + r() * (G.wallY - 320); }
    const hp = kind === 'boss' ? BOSS_HP : 9 * 1.08 ** t * 1.06 ** Math.max(0, t - 60) * (kind === 'cap' ? 6 : 1) * (M.bossT >= 0 ? 1.3 : 1);
    const sp = (kind === 'boss' ? 7 : kind === 'cap' ? 26 : 42 + r() * 8) * M.s.kSpeed;
    M.knights.push({ kind, x, y, hp, max: hp, sp, tx: G.W / 2 + (r() - 0.5) * (kind === 'boss' ? 0 : 120), ty: G.wallY - 14, atWall: false, hitT: -9, burn: 0, burnD: 0, chill: 0, ph: r() * 6,
      dps: kind === 'boss' ? 14 : kind === 'cap' ? 6 : 2.5 });
  }
  function hurt(M, k, d) {
    if (k.hp <= 0) return;
    k.hp -= d; k.hitT = M.t;
    if (M.s.burn) { k.burn = 2; k.burnD = Math.max(k.burnD, d * M.s.burn / 2); }
    if (M.s.chill) k.chill = 1.6;
    if (k.hp <= 0) kill(M, k);
  }
  function kill(M, k) {
    M.kills++;
    const bounty = Math.ceil(k.max * 0.15);
    M.gold += bounty; M.earned += bounty;
    let gem = 0;
    if (k.kind === 'cap') { gem = 1; M.gems += 1; }
    M.ev.push({ k: 'kill', x: k.x, y: k.y, kind: k.kind, gold: bounty, gem });
    if (k.kind === 'boss') { M.won = true; M.over = true; }
  }
  function lead(M) { let b = null; for (const k of M.knights) if (k.hp > 0 && (!b || k.ty - k.y < b.ty - b.y)) b = k; return b; }
  function nearest(M, p, range) { let b = null, bd = range; for (const k of M.knights) { if (k.hp <= 0) continue; const d = dist(k, p); if (d < bd) { bd = d; b = k; } } return b; }

  function step(M, dt) {
    if (M.over) return;
    const s = M.s, G = M.G;
    M.t += dt; M.fireCd -= dt;
    // knights
    M.spawnT -= dt;
    if (M.spawnT <= 0) { M.spawnT += s.kEvery / (1 + M.t / 15) * (M.bossT >= 0 ? 1.15 : 1); spawnKnight(M, 'k'); }
    M.capT -= dt;
    if (M.capT <= 0) { M.capT += 20; spawnKnight(M, 'cap'); M.ev.push({ k: 'captain' }); }
    if (M.bossT >= 0 && !M.boss) { M.bossT -= dt; if (M.bossT <= 0) { spawnKnight(M, 'boss'); M.boss = M.knights[M.knights.length - 1]; M.ev.push({ k: 'boss' }); } }
    for (const k of M.knights) {
      if (k.burn > 0) { k.burn -= dt; k.hp -= k.burnD * dt; if (k.hp <= 0) { kill(M, k); continue; } }
      k.chill = Math.max(0, k.chill - dt);
      const d = Math.hypot(k.tx - k.x, k.ty - k.y);
      if (d > 2) { const sp = k.sp * (k.chill > 0 ? 1 - s.chill : 1) * dt; k.x += (k.tx - k.x) / d * Math.min(sp, d); k.y += (k.ty - k.y) / d * Math.min(sp, d); }
      else { k.atWall = true; M.wall -= k.dps * dt; if (M.rnd() < dt * 3) M.ev.push({ k: 'bash', x: k.x, y: k.y + 10 }); }
    }
    M.knights = M.knights.filter((k) => k.hp > 0);
    // dragon auto-spit and drakelings
    if (s.glare) { M.glareT -= dt; if (M.glareT <= 0) { const k = lead(M); if (k) { M.glareT = s.glare; const m = mouth(M); M.shots.push({ kind: 'glare', x0: m.x, y0: m.y, x: k.x, y: k.y, tgt: k, t: 0, dur: 0.3, dmg: s.fire * 0.5, r: 12 }); } else M.glareT = 0.2; } }
    for (const d of M.drakes) {
      d.cd -= dt;
      if (d.cd <= 0) { const k = nearest(M, d, 330); if (k) { d.cd = 1.1; d.fireT = M.t; d.aim = Math.atan2(k.y - d.y, k.x - d.x); M.shots.push({ kind: 'drake', x0: d.x, y0: d.y - 6, x: k.x, y: k.y, tgt: k, t: 0, dur: 0.35, dmg: s.fire * 0.35 * s.drakeDmg, r: 12 }); } else d.cd = 0.2; }
    }
    for (const sh of M.shots) {
      sh.t += dt;
      if (sh.tgt && sh.tgt.hp > 0) { sh.x = sh.tgt.x; sh.y = sh.tgt.y; }
      if (sh.t >= sh.dur && !sh.done) {
        sh.done = true;
        for (const k of M.knights) if (k.hp > 0 && Math.hypot(k.x - sh.x, k.y - sh.y) < sh.r + (k.kind === 'boss' ? 26 : 12)) hurt(M, k, sh.dmg);
        M.ev.push({ k: 'impact', x: sh.x, y: sh.y, kind: sh.kind, r: sh.r });
      }
    }
    M.shots = M.shots.filter((x) => !x.done);
    M.knights = M.knights.filter((k) => k.hp > 0);
    // minions
    for (const u of M.units) {
      if (u.st === 'out' || u.st === 'back') {
        u.p += speedOf(M, u.type) * dt / u.len;
        if (u.p >= 1) {
          if (u.st === 'out') { u.st = 'loot'; u.tt = 0.4; }
          else {
            const g = u.carry * haulMult(M);
            M.gold += g; M.earned += g; M.hauls++;
            let gem = 0;
            if (u.v.castle && M.rnd() < s.gemChance) { gem = 1; M.gems++; }
            M.ev.push({ k: 'haul', gold: g, gem, type: u.type });
            u.carry = 0;
            if (u.type === 'kobold') { u.st = 'idle'; u.p = 0; } else send(M, u, best(M, u.type));
          }
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
    if (s.breed) { M.breedT -= dt; if (M.breedT <= 0) { M.breedT += s.breed; addUnit(M, 'kobold'); M.ev.push({ k: 'hatch' }); } }
    if (s.foreman) { M.foreT -= dt; if (M.foreT <= 0) { M.foreT += s.foreman; const v = best(M, 'kobold'); for (const u of M.units) if (u.st === 'idle') send(M, u, v); } }
    if (M.wall <= 0) { M.wall = 0; M.over = true; M.ev.push({ k: 'breach' }); }
  }
  const renownOf = (M) => Math.floor(M.s.bank * M.earned ** 0.7);
  function earnedOf(M) { return { renown: renownOf(M), gems: M.gems }; }
  const Model = { create, step, dispatch, breathe, buy, cost, shopOpen, avail, best, earnedOf, geo, idle: (M) => M.units.filter((u) => u.st === 'idle').length, lead, SHOP, VILL, BOSS_HP };

  if (typeof window === 'undefined') { module.exports = { NODES, baseStats, Model }; return; }

  // ---------------------------------------------------------------- view (canvas + DOM shop)
  const LOOK = {
    ember: { body: '#d62828', dark: '#8d0801', belly: '#ffb703', horn: '#fff3d6', fire: ['#ffd166', '#ff9f1c', '#e85d04'] },
    rime: { body: '#7fc8f8', dark: '#3a6ea5', belly: '#eaf6ff', horn: '#ffffff', fire: ['#ffffff', '#bde0fe', '#4cc9f0'] },
    moss: { body: '#52b788', dark: '#1b4332', belly: '#d8f3dc', horn: '#f1e3c6', fire: ['#f1fa8c', '#b5e48c', '#ff9f1c'] },
  };
  const SHOP_ORDER = ['kobold', 'thief', 'drake', 'wagon', 'sapper', 'patch'];
  const CSS = `.hd-shop{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px;max-width:460px;margin:0 auto}
    .hd-b{display:flex;align-items:center;gap:4px;min-height:50px;min-width:0;padding:4px 6px;overflow:hidden;border:0;border-radius:14px;background:#2d2440;color:#f4efe6;box-shadow:0 4px 0 #120d1c;font:800 13px Nunito,system-ui;text-align:left;touch-action:manipulation;transition:opacity .15s}
    .hd-b .i{font-size:20px}.hd-b .n{flex:1;min-width:0;line-height:1.05;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.hd-b small{display:block;color:#a49eb8;font-size:11px}.hd-b.one .n{flex:none}
    .hd-b .c{font:400 16px 'Lilita One',system-ui;color:#ffd166}
    .hd-b.can{background:#4a3a1a;box-shadow:0 4px 0 #20180a,0 0 0 2px #ffd16688 inset}.hd-b:not(.can){opacity:.62}
    .hd-b:active{transform:translateY(3px);box-shadow:0 1px 0 #120d1c}.hd-b.one{grid-column:1/-1;justify-content:center}
    .hd-b.pop{animation:hdpop .25s}@keyframes hdpop{50%{transform:scale(1.08)}}`;

  function createRun(env) {
    const s = env.stats, W = env.W, H = env.H, fx = env.fx, sfx = env.sfx, L = LOOK[env.who] || LOOK.ember;
    const M = create({ who: env.who, s, W, H, boss: env.boss });
    const G = M.G;
    if (Kit.DEV) window.Hoard.M = M; // for automated testing
    const stars = Array.from({ length: 40 }, () => [Math.random() * W, Math.random() * 120, Math.random()]);
    const tufts = Array.from({ length: 50 }, () => [Math.random() * W, 120 + Math.random() * (G.wallY - 120)]);
    const flash = {}; let headAim = -Math.PI / 2, breathT = -9, pileBump = 0, msg = null, coinsFly = [];
    const say = (text, c = '#fff') => { msg = { text, c, t: M.t }; };
    if (env.boss) say('The Paladin Champion rides out!', '#ffe08a');

    // DOM shop
    env.ui.innerHTML = `<style>${CSS}</style><div class="hd-shop"></div>`;
    const shopEl = env.ui.querySelector('.hd-shop');
    const keys = SHOP_ORDER.filter((k) => shopOpen(M, k));
    shopEl.innerHTML = keys.map((k) => `<button type="button" class="hd-b${keys.length === 1 ? ' one' : ''}" data-shop="${k}"><span class="i">${SHOP[k].icon}</span><span class="n">${SHOP[k].name}<small></small></span><span class="c"></span></button>`).join('');
    const btns = keys.map((k) => { const b = shopEl.querySelector(`[data-shop="${k}"]`); return { k, b, c: b.querySelector('.c'), sm: b.querySelector('small'), last: '' }; });
    env.ui.onclick = (e) => {
      const b = e.target.closest('[data-shop]'); if (!b || M.over) return;
      if (buy(M, b.dataset.shop)) { sfx.buy(); b.classList.remove('pop'); void b.offsetWidth; b.classList.add('pop'); }
      else sfx.nope();
    };
    function syncShop() {
      for (const x of btns) {
        const c = cost(M, x.k), can = M.gold >= c && !(x.k === 'patch' && M.wall >= M.wallMax);
        const owned = x.k === 'kobold' ? M.units.filter((u) => u.type === 'kobold').length : x.k === 'drake' ? M.drakes.length : x.k === 'patch' ? Math.round(M.wall / M.wallMax * 100) + '%' : M.units.filter((u) => u.type === x.k).length;
        const key = c + '|' + can + '|' + owned;
        if (key === x.last) continue; x.last = key;
        x.c.textContent = env.fmt(c); x.b.classList.toggle('can', can);
        x.sm.textContent = x.k === 'patch' ? `wall ${owned}` : keys.length === 1 ? `${owned} owned · tap villages to send` : x.k === 'drake' ? `${owned} · shoots` : x.k === 'kobold' ? `${owned} · tap-raid` : `${owned} · auto`;
      }
    }
    syncShop();

    function handleEvents() {
      for (const e of M.ev) {
        if (e.k === 'haul') { sfx.coin(); pileBump = 1; coinsFly.push({ t: 0, x: G.gate.x + (Math.random() - 0.5) * 20 }); fx.text(G.gate.x + (Math.random() < 0.5 ? -1 : 1) * (70 + Math.random() * 20), G.wallY - 30, '+' + env.fmt(e.gold), '#ffd166', 15); if (e.gem) { sfx.ding(); fx.text(G.gate.x, G.wallY - 40, '+1 gem', '#9bf6ff', 18); } }
        else if (e.k === 'loot') { flash[e.v.id] = M.t; fx.burst(e.v.x, e.v.y, 4, ['#ffd166', '#fff3b0'], 90, 2.5); }
        else if (e.k === 'impact') {
          if (e.kind === 'breath') { sfx.boom && sfx.tone(90 + Math.random() * 40, 0.18, 'sawtooth', 0.06, 0.4); sfx.crack(); fx.burst(e.x, e.y, 12, L.fire, 170, 4); fx.ring(e.x, e.y, e.r * 1.6, L.fire[1]); fx.shake = Math.max(fx.shake, 2.5); }
          else { sfx.zap(); fx.burst(e.x, e.y, 5, L.fire, 100, 2.5); }
        }
        else if (e.k === 'kill') { sfx.pop(0.8); fx.burst(e.x, e.y, e.kind === 'boss' ? 60 : 14, ['#ced4da', '#adb5bd', '#ffd166', '#e63946'], e.kind === 'boss' ? 320 : 170, 3.5); fx.text(e.x, e.y - 14, '+' + env.fmt(e.gold), '#ffd166', 14); if (e.gem) { sfx.ding(); fx.text(e.x, e.y - 34, '+1 gem', '#9bf6ff', 18); } if (e.kind !== 'k') { fx.shake = 10; sfx.boom(); } }
        else if (e.k === 'bash') { sfx.hit(); fx.burst(e.x, e.y, 3, ['#8d7b68', '#c2b280'], 80, 2.5); fx.shake = Math.max(fx.shake, 1.5); }
        else if (e.k === 'captain') say('A knight captain approaches! (drops a gem)', '#9bf6ff');
        else if (e.k === 'boss') { sfx.boom(); fx.shake = 12; }
        else if (e.k === 'hatch') { sfx.pop(1.6); fx.burst(W / 2, G.wallY + 130, 6, ['#fff3d6', L.body], 90, 2.5); }
        else if (e.k === 'breach') { sfx.boom(); fx.shake = 16; fx.burst(G.gate.x, G.wallY, 40, ['#8d7b68', '#c2b280', '#6c584c'], 260, 4.5); }
      }
      M.ev.length = 0;
    }

    function tapAt(x, y) {
      fx.ring(x, y, 22, '#ffffff88');
      if (y > G.wallY + 16) return; // inside the cave
      const k = nearest(M, { x, y }, 34);
      const v = k ? null : G.vills.find((q) => Math.hypot(q.x - x, q.y - y) < (q.castle ? 44 : 40));
      if (v) {
        const why = dispatch(M, v);
        if (!why) { sfx.pop(1.2); flash[v.id] = M.t; }
        else { sfx.nope(); say(why === 'locked' ? `The ${v.name} unlocks in the upgrade tree` : why === 'guarded' ? 'Only Sappers can raid the Castle' : 'All kobolds are out raiding!', '#ffb4a2'); }
        return;
      }
      if (breathe(M, x, y)) { breathT = M.t; headAim = Math.atan2(y - (G.wallY + 28), x - W / 2); sfx.tone(240, 0.14, 'sawtooth', 0.05, 0.5); }
    }

    return {
      get over() { return M.over; }, get t() { return M.t; },
      update(dt, input) {
        dt = Math.max(0, dt); // kit's first frame can hand us a negative dt (rAF stamp < performance.now())
        for (const tp of input.taps) tapAt(tp.x, tp.y);
        step(M, dt);
        handleEvents();
        fx.update(dt);
        pileBump = Math.max(0, pileBump - dt * 4);
        for (const c of coinsFly) c.t += dt * 2.2; coinsFly = coinsFly.filter((c) => c.t < 1);
        if (!input.taps.length && M.t - breathT > 0.6) { const k = lead(M); headAim += ((k ? Math.atan2(k.y - (G.wallY + 28), k.x - W / 2) : -Math.PI / 2) - headAim) * Math.min(1, dt * 3); }
        syncShop();
      },
      draw(g) { drawWorld(g); },
      result() {
        const e = earnedOf(M);
        if (M.won) return { won: true, earned: e, lines: [] };
        return { won: false, title: M.bossT >= 0 ? 'The Paladin breached your cave' : 'The knights broke in!', earned: e,
          lines: [`Raided ${env.fmt(M.earned)} gold in ${Math.round(M.t)}s · ${M.kills} knights burned`, `Your hoard of ${env.fmt(M.earned)} gold earns ${env.fmt(renownOf(M))} renown`] };
      },
    };

    // ---------------- drawing
    function drawWorld(g) {
      const sx = (Math.random() - 0.5) * fx.shake, sy = (Math.random() - 0.5) * fx.shake, t = M.t;
      g.save(); g.translate(sx, sy);
      // sky + meadow
      const sky = g.createLinearGradient(0, 0, 0, G.wallY); sky.addColorStop(0, '#1d1b3a'); sky.addColorStop(0.18, '#2c3e50'); sky.addColorStop(0.2, '#3c6e47'); sky.addColorStop(1, '#2b5135');
      g.fillStyle = sky; g.fillRect(-20, -20, W + 40, G.wallY + 40);
      for (const [x, y, a] of stars) { if (y > 110) continue; g.fillStyle = `rgba(255,255,255,${0.3 + 0.5 * Math.abs(Math.sin(t + a * 9))})`; g.fillRect(x, y, 2, 2); }
      g.fillStyle = '#2f5d3a'; g.beginPath(); g.moveTo(0, 150); for (let x = 0; x <= W; x += 30) g.lineTo(x, 140 + Math.sin(x * 0.03) * 14); g.lineTo(W, 160); g.lineTo(0, 160); g.fill();
      g.strokeStyle = '#4f8a5b'; g.lineWidth = 2; for (const [x, y] of tufts) { g.beginPath(); g.moveTo(x, y); g.lineTo(x - 3, y - 6); g.moveTo(x, y); g.lineTo(x + 3, y - 6); g.stroke(); }
      // roads
      g.lineCap = 'round';
      for (const v of G.vills) { if (!avail(M, v) && !v.castle) continue; g.strokeStyle = avail(M, v) ? '#8a6f4d' : '#5a5040'; g.lineWidth = 14; g.beginPath(); g.moveTo(G.gate.x, G.gate.y); g.lineTo(v.x, v.y); g.stroke(); }
      for (const v of G.vills) { if (!avail(M, v)) continue; g.strokeStyle = '#a3865f'; g.lineWidth = 5; g.setLineDash([6, 10]); g.beginPath(); g.moveTo(G.gate.x, G.gate.y); g.lineTo(v.x, v.y); g.stroke(); g.setLineDash([]); }
      for (const v of G.vills) drawVillage(g, v, t);
      // minions (behind knights)
      for (const u of M.units) if (u.st !== 'idle') drawUnit(g, u, t);
      for (const k of M.knights) drawKnight(g, k, t);
      drawCave(g, t);
      for (const sh of M.shots) drawShot(g, sh);
      fx.draw(g);
      g.restore();
      drawHud(g, t);
    }

    function drawVillage(g, v, t) {
      const on = avail(M, v), fl = Math.max(0, 1 - (t - (flash[v.id] ?? -9)) * 4), bob = fl * 3;
      g.save(); g.translate(v.x, v.y - bob); g.globalAlpha = on || v.castle ? 1 : 0.42;
      if (v.castle) {
        g.fillStyle = '#6c757d'; g.fillRect(-46, -28, 92, 40); g.fillStyle = '#868e96';
        for (const tx of [-46, 30]) { g.fillRect(tx, -48, 16, 60); for (let i = 0; i < 2; i++) g.fillRect(tx + i * 10, -54, 6, 6); }
        g.fillRect(-12, -58, 24, 70); g.fillStyle = '#343a40'; g.beginPath(); g.arc(0, 12, 11, Math.PI, 0); g.fill(); g.fillRect(-11, 0, 22, 12);
        g.strokeStyle = '#ced4da'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(0, -58); g.lineTo(0, -76); g.stroke();
        g.fillStyle = '#e63946'; g.beginPath(); g.moveTo(0, -76); g.lineTo(16 + Math.sin(t * 5) * 3, -71); g.lineTo(0, -66); g.fill();
        g.fillStyle = '#ffd166'; for (const wx of [-30, 18]) g.fillRect(wx, -14, 6, 8);
      } else {
        const n = v.id === 'town' ? 4 : v.id === 'farm' ? 2 : 3, roofs = ['#c1121f', '#2b6cb0', '#bc6c25', '#7b2cbf'];
        for (let i = 0; i < n; i++) {
          const hx = (i - (n - 1) / 2) * 22 + (i % 2 ? 0 : 0), hy = (i % 2) * 7 - 6, w = 18;
          g.fillStyle = '#f1e3c6'; g.fillRect(hx - w / 2, hy - 8, w, 14);
          g.fillStyle = roofs[(i + v.i) % 4]; g.beginPath(); g.moveTo(hx - w / 2 - 3, hy - 8); g.lineTo(hx, hy - 20); g.lineTo(hx + w / 2 + 3, hy - 8); g.fill();
          g.fillStyle = '#5c3d2e'; g.fillRect(hx - 3, hy - 1, 6, 7);
        }
        if (v.id === 'mill') { g.save(); g.translate(30, -16); g.rotate(t * 1.5); g.fillStyle = '#e9d8a6'; for (let i = 0; i < 4; i++) { g.rotate(Math.PI / 2); g.fillRect(-2, 0, 4, 16); } g.restore(); }
        if (v.id === 'farm') { g.fillStyle = '#e9c46a'; for (let i = 0; i < 3; i++) g.fillRect(24, -6 + i * 6, 14, 3); }
      }
      g.globalAlpha = 1;
      const label = v.castle ? (on ? `Castle +${env.fmt(v.yield * s.carry)}` : 'Castle 🔒') : on ? `${v.name} +${env.fmt(v.yield * s.carry)}` : `${v.name} 🔒`;
      g.font = '800 12px Nunito, system-ui'; g.textAlign = 'center'; const tw = g.measureText(label).width + 12, ly = v.castle ? 30 : 18;
      g.fillStyle = 'rgba(0,0,0,.55)'; rr(g, -tw / 2, ly - 11, tw, 17, 8); g.fill();
      g.fillStyle = on ? '#ffe8a3' : '#ccc'; g.fillText(label, 0, ly + 2);
      if (fl > 0) { g.strokeStyle = `rgba(255,209,102,${fl})`; g.lineWidth = 3; g.beginPath(); g.arc(0, -6, 30 + (1 - fl) * 14, 0, 6.283); g.stroke(); }
      g.restore();
    }

    function drawUnit(g, u, t) {
      const back = u.st === 'back', a = back ? u.v : G.gate, b = back ? G.gate : u.v, dir = Math.sign((b?.x ?? 0) - (a?.x ?? 0)) || 1;
      const hop = Math.abs(Math.sin(t * 14 + u.ph)) * 2.5;
      g.save(); g.translate(u.x, u.y - hop); g.scale(dir * 1.5, 1.5);
      if (u.type === 'wagon') {
        g.fillStyle = '#7f5539'; rr(g, -14, -12, 28, 12, 3); g.fill();
        if (back) { g.fillStyle = '#ffd166'; g.beginPath(); g.ellipse(0, -12, 12, 6, 0, Math.PI, 0); g.fill(); }
        g.fillStyle = '#222'; g.beginPath(); g.arc(-8, 1, 4.5, 0, 6.283); g.arc(8, 1, 4.5, 0, 6.283); g.fill();
        g.fillStyle = '#c96'; g.beginPath(); g.arc(20, -8, 5, 0, 6.283); g.fill();
      } else {
        const body = u.type === 'thief' ? '#5a4a78' : u.type === 'sapper' ? '#8d7b68' : '#d1793a';
        g.strokeStyle = body; g.lineWidth = 3; g.beginPath(); g.moveTo(-5, 0); g.quadraticCurveTo(-12, 2, -14, -4); g.stroke();
        g.fillStyle = body; g.beginPath(); g.ellipse(0, -5, 6, 5, 0, 0, 6.283); g.fill();
        g.beginPath(); g.arc(5, -11, 4.5, 0, 6.283); g.fill();
        g.fillStyle = '#ffec99'; g.fillRect(6, -12.5, 2, 2);
        if (u.type === 'thief') { g.fillStyle = '#2d2440'; g.beginPath(); g.arc(5, -12, 5, Math.PI, 0); g.fill(); }
        if (u.type === 'sapper') { g.fillStyle = '#ffd60a'; g.beginPath(); g.arc(5, -13, 5, Math.PI, 0); g.fill(); if (!back) { g.fillStyle = '#222'; g.beginPath(); g.arc(-6, -9, 4, 0, 6.283); g.fill(); } }
        if (back) { g.fillStyle = '#ffd166'; g.beginPath(); g.arc(-5, -10, u.type === 'sapper' ? 6 : 4.5, 0, 6.283); g.fill(); g.fillStyle = '#e09f3e'; g.fillRect(-6, -15, 2, 3); }
      }
      g.restore();
    }

    function drawKnight(g, k, t) {
      const boss = k.kind === 'boss', cap = k.kind === 'cap', sc = boss ? 2.6 : cap ? 1.6 : 1.25, hit = Math.max(0, 1 - (t - k.hitT) * 8);
      const step = k.atWall ? Math.sin(t * 10 + k.ph) * 3 : Math.abs(Math.sin(t * 8 + k.ph)) * 2;
      g.save(); g.translate(k.x, k.y);
      if (boss) { const gl = g.createRadialGradient(0, -14, 4, 0, -14, 56); gl.addColorStop(0, 'rgba(255,240,170,.45)'); gl.addColorStop(1, 'rgba(255,240,170,0)'); g.fillStyle = gl; g.beginPath(); g.arc(0, -14, 56, 0, 6.283); g.fill(); }
      g.fillStyle = 'rgba(0,0,0,.25)'; g.beginPath(); g.ellipse(0, 4, 9 * sc, 3 * sc, 0, 0, 6.283); g.fill();
      g.scale(sc, sc); g.translate(0, -step);
      const metal = hit ? '#ffffff' : boss ? '#f1e3a8' : '#ced4da', dark = boss ? '#c9a227' : '#868e96';
      g.fillStyle = dark; g.fillRect(-5, -2, 3, 5); g.fillRect(2, -2, 3, 5);
      g.fillStyle = metal; rr(g, -7, -15, 14, 14, 4); g.fill();
      g.beginPath(); g.arc(0, -19, 6, 0, 6.283); g.fill();
      g.fillStyle = '#212529'; g.fillRect(-4, -20, 8, 2);
      g.fillStyle = boss ? '#ffd166' : cap ? '#4cc9f0' : '#e63946'; g.beginPath(); g.moveTo(-1, -25); g.quadraticCurveTo(-8, -32, -9, -22); g.lineTo(1, -24); g.fill();
      g.fillStyle = boss ? '#fff' : '#457b9d'; rr(g, 3, -13, 8, 11, 3); g.fill(); g.fillStyle = boss ? '#c9a227' : '#f1faee'; g.fillRect(6.2, -11, 1.6, 7); g.fillRect(4.5, -8.5, 5, 1.6);
      g.strokeStyle = '#adb5bd'; g.lineWidth = 1.6; g.beginPath(); const sw = k.atWall ? Math.sin(t * 10 + k.ph) * 0.8 : 0; g.moveTo(-7, -9); g.lineTo(-7 - 9 * Math.sin(0.4 + sw), -9 - 9 * Math.cos(0.4 + sw)); g.stroke();
      if (k.chill > 0) { g.fillStyle = 'rgba(160,220,255,.35)'; rr(g, -9, -27, 18, 30, 6); g.fill(); }
      if (k.burn > 0) { g.fillStyle = L.fire[1]; g.globalAlpha = 0.8; g.beginPath(); g.arc(Math.sin(t * 20) * 3, -16 - Math.random() * 6, 3, 0, 6.283); g.fill(); g.globalAlpha = 1; }
      g.restore();
      if (k.hp < k.max && !boss) { const w = 22 * sc; g.fillStyle = 'rgba(0,0,0,.6)'; g.fillRect(k.x - w / 2, k.y - 34 * sc, w, 4); g.fillStyle = '#ff6b6b'; g.fillRect(k.x - w / 2, k.y - 34 * sc, w * Math.max(0, k.hp / k.max), 4); }
    }

    function drawCave(g, t) {
      const y = G.wallY, cx = W / 2;
      // mountain mass
      const rock = g.createLinearGradient(0, y - 40, 0, H); rock.addColorStop(0, '#6b5d52'); rock.addColorStop(1, '#2a221d');
      g.fillStyle = rock; g.beginPath(); g.moveTo(-20, H + 20); g.lineTo(-20, y - 30); g.lineTo(40, y - 54); g.lineTo(90, y - 22); g.lineTo(cx - 70, y - 30); g.lineTo(cx - 52, y - 4);
      g.lineTo(cx + 52, y - 4); g.lineTo(cx + 70, y - 30); g.lineTo(W - 90, y - 22); g.lineTo(W - 40, y - 56); g.lineTo(W + 20, y - 28); g.lineTo(W + 20, H + 20); g.fill();
      g.strokeStyle = 'rgba(255,255,255,.07)'; g.lineWidth = 2; for (let i = 0; i < 6; i++) { g.beginPath(); g.moveTo(i * 70 + 10, y + 10 + (i % 3) * 30); g.lineTo(i * 70 + 40, y + 24 + (i % 3) * 30); g.stroke(); }
      // chamber
      const ch = { x: cx, y: y + 104, rx: W * 0.43, ry: 86 };
      const glow = g.createRadialGradient(cx, ch.y + 40, 10, cx, ch.y, ch.rx); glow.addColorStop(0, `rgba(255,190,80,${0.35 + Math.min(0.3, M.earned / 4000)})`); glow.addColorStop(0.6, '#2a1a12'); glow.addColorStop(1, '#140c0a');
      g.fillStyle = glow; g.beginPath(); g.ellipse(ch.x, ch.y, ch.rx, ch.ry, 0, 0, 6.283); g.fill();
      g.fillStyle = '#140c0a'; g.fillRect(cx - 34, y - 2, 68, 30); // tunnel to the gate
      // hoard pile
      const sz = Math.min(1, Math.log10(1 + M.earned) / 4.2), pw = 50 + 120 * sz, ph = 14 + 46 * sz, py = ch.y + ch.ry - 14, bump = 1 + pileBump * 0.04;
      g.save(); g.translate(cx, py); g.scale(bump, 1 / bump);
      const pg = g.createLinearGradient(0, -ph, 0, 0); pg.addColorStop(0, '#ffe066'); pg.addColorStop(1, '#c9871a');
      g.fillStyle = pg; g.beginPath(); g.moveTo(-pw, 0); g.quadraticCurveTo(-pw * 0.4, -ph * 1.25, 0, -ph); g.quadraticCurveTo(pw * 0.4, -ph * 1.25, pw, 0); g.fill();
      g.fillStyle = '#fff3b0'; for (let i = 0; i < 14; i++) { const a = (i * 0.618) % 1, px = (a - 0.5) * pw * 1.6, pyy = -ph * (1 - Math.abs(px / pw) ** 1.6) * 0.85 * ((i * 0.37) % 1); g.beginPath(); g.ellipse(px, pyy, 4, 2.2, 0, 0, 6.283); g.fill(); }
      if (M.gems) { g.fillStyle = '#9bf6ff'; for (let i = 0; i < Math.min(8, M.gems); i++) { const px = ((i * 0.43) % 1 - 0.5) * pw; g.beginPath(); g.moveTo(px, -ph * 0.5 - 5); g.lineTo(px + 4, -ph * 0.5); g.lineTo(px, -ph * 0.5 + 4); g.lineTo(px - 4, -ph * 0.5); g.fill(); } }
      g.restore();
      for (let i = 0; i < 3; i++) { const a = (t * 0.7 + i * 0.33) % 1; g.fillStyle = `rgba(255,255,255,${Math.sin(a * Math.PI)})`; const px = cx + Math.sin(i * 7 + Math.floor(t * 0.7 + i * 0.33) * 3) * pw * 0.6; g.beginPath(); g.arc(px, py - ph * 0.6, 1.6 + 1.5 * Math.sin(a * Math.PI), 0, 6.283); g.fill(); }
      // flying coins from the gate to the pile
      for (const c of coinsFly) { const q = c.t, x = c.x + (cx - c.x) * q, yy = y + 10 + (py - ph - y - 10) * q - Math.sin(q * Math.PI) * 30; g.fillStyle = '#ffd166'; g.beginPath(); g.arc(x, yy, 3.5, 0, 6.283); g.fill(); }
      drawDragon(g, cx, py - ph - 4, t);
      // idle kobolds by the gate
      const idle = M.units.filter((u) => u.st === 'idle').length;
      for (let i = 0; i < Math.min(idle, 8); i++) { const kx = cx - 70 - (i % 4) * 12, ky = y + 52 + Math.floor(i / 4) * 12; g.fillStyle = '#d1793a'; g.beginPath(); g.ellipse(kx, ky, 5, 4, 0, 0, 6.283); g.arc(kx + 4, ky - 5, 3.5, 0, 6.283); g.fill(); }
      g.font = "400 14px 'Lilita One', system-ui"; g.textAlign = 'right'; g.fillStyle = idle ? '#ffd8a8' : '#998';
      g.fillText(`${idle} ready`, cx - 50, y + 84);
      // drakelings on the ridge
      for (const d of M.drakes) drawDrakeling(g, d, t);
      // gate wall
      const hp = M.wall / M.wallMax, gw = 96;
      g.fillStyle = '#7d6b5d'; rr(g, cx - gw / 2, y - 14, gw, 18, 4); g.fill();
      g.strokeStyle = '#4a3f37'; g.lineWidth = 1.5; for (let r = 0; r < 2; r++) for (let i = 0; i < 6; i++) g.strokeRect(cx - gw / 2 + i * 16 + (r ? 8 : 0), y - 14 + r * 9, 16, 9);
      if (hp < 0.66) { g.strokeStyle = '#1b1411'; g.lineWidth = 2; g.beginPath(); g.moveTo(cx - 20, y - 14); g.lineTo(cx - 12, y - 6); g.lineTo(cx - 18, y + 4); if (hp < 0.33) { g.moveTo(cx + 22, y - 14); g.lineTo(cx + 14, y - 4); g.lineTo(cx + 24, y + 4); } g.stroke(); }
      const bw = 110; g.fillStyle = 'rgba(0,0,0,.6)'; rr(g, cx - bw / 2, y - 30, bw, 10, 5); g.fill();
      g.fillStyle = hp > 0.5 ? '#80ed99' : hp > 0.25 ? '#ffd166' : '#ff6b6b'; rr(g, cx - bw / 2, y - 30, bw * hp, 10, 5); g.fill();
      g.font = '800 10px Nunito, system-ui'; g.textAlign = 'center'; g.fillStyle = '#fff'; g.fillText('WALL', cx, y - 22);
    }

    function drawDragon(g, x, y, t) {
      const br = Math.sin(t * 2) * 1.5, breathing = t - breathT < 0.25;
      g.save(); g.translate(x, y + br * 0.5);
      // tail + wings + body
      g.strokeStyle = L.body; g.lineWidth = 9; g.lineCap = 'round'; g.beginPath(); g.moveTo(16, 4); g.quadraticCurveTo(52, 10, 48 + Math.sin(t * 1.5) * 6, -12); g.stroke();
      g.fillStyle = L.dark; for (const sd of [-1, 1]) { g.beginPath(); g.moveTo(sd * 6, -14); g.quadraticCurveTo(sd * 40, -48 - br * 3, sd * 50, -20); g.quadraticCurveTo(sd * 34, -22, sd * 30, -10); g.quadraticCurveTo(sd * 24, -16, sd * 14, -4); g.fill(); }
      g.fillStyle = L.body; g.beginPath(); g.ellipse(0, -6, 24, 16, 0, 0, 6.283); g.fill();
      g.fillStyle = L.belly; g.beginPath(); g.ellipse(-2, -2, 13, 10, 0, 0, 6.283); g.fill();
      // neck + head aimed at the last breath / lead knight
      const a = Math.max(-Math.PI + 0.3, Math.min(-0.3, headAim)), nx = Math.cos(a) * 26, ny = Math.sin(a) * 22 - 12;
      g.strokeStyle = L.body; g.lineWidth = 11; g.beginPath(); g.moveTo(0, -12); g.quadraticCurveTo(nx * 0.3, ny * 0.6, nx, ny); g.stroke();
      g.save(); g.translate(nx, ny); g.rotate(a + Math.PI / 2);
      drawHead(g, 11, L, breathing);
      g.restore();
      g.restore();
    }

    function drawDrakeling(g, d, t) {
      const fire = t - d.fireT < 0.2, f = Math.sin(t * 9 + d.x) * 3;
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
        g.fillStyle = L.fire[0]; g.beginPath(); g.arc(x, y, 9, 0, 6.283); g.fill(); g.fillStyle = L.fire[2]; g.beginPath(); g.arc(x, y, 5, 0, 6.283); g.fill();
      } else { g.fillStyle = L.fire[1]; g.beginPath(); g.arc(x, y, sh.kind === 'glare' ? 6 : 4, 0, 6.283); g.fill(); g.fillStyle = L.fire[0]; g.beginPath(); g.arc(x, y, 2, 0, 6.283); g.fill(); }
    }

    function drawHud(g, t) {
      g.fillStyle = 'rgba(10,8,20,.55)'; g.fillRect(0, 0, W, 40);
      g.font = "400 24px 'Lilita One', system-ui"; g.textAlign = 'left'; g.fillStyle = '#ffd166';
      g.beginPath(); g.arc(24, 20, 10, 0, 6.283); g.fill(); g.fillStyle = '#c9871a'; g.font = "400 13px 'Lilita One', system-ui"; g.textAlign = 'center'; g.fillText('G', 24, 25);
      g.font = "400 24px 'Lilita One', system-ui"; g.textAlign = 'left'; g.fillStyle = '#ffe8a3'; g.fillText(env.fmt(M.gold), 40, 29);
      const hm = haulMult(M); if (hm > 1.01) { g.font = '800 12px Nunito, system-ui'; g.fillStyle = '#bde0fe'; g.fillText(`hoard bonus +${Math.round((hm - 1) * 100)}%`, 42 + g.measureText(env.fmt(M.gold)).width * 1.9, 27); }
      g.textAlign = 'right'; g.font = '800 14px Nunito, system-ui'; g.fillStyle = '#fff';
      g.fillText(`${M.gems ? '💎 ' + M.gems + '   ' : ''}${Math.floor(t)}s`, W - 14, 26);
      if (M.boss && M.boss.hp > 0) { const bw = W - 60; g.fillStyle = '#ffe08a'; g.font = "400 14px 'Lilita One', system-ui"; g.textAlign = 'center'; g.fillText('PALADIN CHAMPION', W / 2, 56); g.fillStyle = 'rgba(0,0,0,.6)'; rr(g, 30, 62, bw, 9, 4); g.fill(); g.fillStyle = '#ffd166'; rr(g, 30, 62, bw * Math.max(0, M.boss.hp / M.boss.max), 9, 4); g.fill(); }
      if (msg && t - msg.t < 2.2) { g.globalAlpha = Math.min(1, (2.2 - (t - msg.t)) * 2); g.font = '800 15px Nunito, system-ui'; g.textAlign = 'center'; const tw = g.measureText(msg.text).width + 24; g.fillStyle = 'rgba(0,0,0,.7)'; rr(g, W / 2 - tw / 2, 84, tw, 26, 13); g.fill(); g.fillStyle = msg.c; g.fillText(msg.text, W / 2, 102); g.globalAlpha = 1; }
      // onboarding hints
      const farm = G.vills[0], pulse = 0.5 + 0.5 * Math.sin(t * 6);
      if (M.dispatched < 2 && !s.foreman) {
        g.strokeStyle = `rgba(255,232,163,${0.5 + 0.5 * pulse})`; g.lineWidth = 3; g.beginPath(); g.arc(farm.x, farm.y - 6, 32 + pulse * 6, 0, 6.283); g.stroke();
        bubble(g, 'Tap a village to send kobolds raiding!', W / 2, farm.y - 64);
        hand(g, farm.x + 26, farm.y + 10 + pulse * 6);
      } else if (M.breathed < 2 && M.knights.length) {
        const k = lead(M); g.strokeStyle = `rgba(255,140,90,${0.5 + 0.5 * pulse})`; g.lineWidth = 3; g.beginPath(); g.arc(k.x, k.y - 12, 22 + pulse * 5, 0, 6.283); g.stroke();
        bubble(g, 'Knights! Tap them to breathe fire!', W / 2, Math.max(130, Math.min(G.wallY - 60, k.y - 50)));
      } else if (env.runNo <= 2 && M.t < 40 && M.gold >= cost(M, 'kobold') && M.units.length < 5) bubble(g, 'Spend gold on more kobolds below ↓', W / 2, G.wallY - 48);
    }
    function bubble(g, text, x, y) { g.font = '800 15px Nunito, system-ui'; g.textAlign = 'center'; const tw = g.measureText(text).width + 26; g.fillStyle = 'rgba(255,248,230,.95)'; rr(g, x - tw / 2, y - 18, tw, 30, 15); g.fill(); g.fillStyle = '#2b1d0e'; g.fillText(text, x, y + 2); }
    function hand(g, x, y) { g.save(); g.translate(x, y); g.fillStyle = '#fff'; g.strokeStyle = '#2b1d0e'; g.lineWidth = 2; g.beginPath(); g.moveTo(0, 0); g.lineTo(-4, 4); g.lineTo(-4, 22); g.lineTo(10, 26); g.lineTo(14, 12); g.lineTo(4, 8); g.lineTo(4, 0); g.closePath(); g.fill(); g.stroke(); g.restore(); }
  }
  function rr(g, x, y, w, h, r) { g.beginPath(); g.roundRect ? g.roundRect(x, y, w, h, r) : g.rect(x, y, w, h); }

  /** Dragon head pointing "up" (-y) in local space, r = head radius. */
  function drawHead(g, r, L, open) {
    g.fillStyle = L.horn; for (const sd of [-1, 1]) { g.beginPath(); g.moveTo(sd * r * 0.5, r * 0.3); g.lineTo(sd * r * 1.25, r * 1.2); g.lineTo(sd * r * 0.85, r * 0.1); g.fill(); }
    g.fillStyle = L.body; g.beginPath(); g.ellipse(0, 0, r * 0.85, r, 0, 0, 6.283); g.fill();
    g.beginPath(); g.ellipse(0, -r * 0.85, r * 0.55, r * 0.7, 0, 0, 6.283); g.fill();
    if (open) { g.fillStyle = L.fire[1]; g.beginPath(); g.arc(0, -r * 1.55, r * 0.45, 0, 6.283); g.fill(); }
    g.fillStyle = '#fff'; for (const sd of [-1, 1]) { g.beginPath(); g.arc(sd * r * 0.45, -r * 0.1, r * 0.28, 0, 6.283); g.fill(); }
    g.fillStyle = '#1b1411'; for (const sd of [-1, 1]) { g.beginPath(); g.ellipse(sd * r * 0.47, -r * 0.18, r * 0.1, r * 0.2, 0, 0, 6.283); g.fill(); }
    g.fillStyle = L.dark; for (const sd of [-1, 1]) { g.beginPath(); g.arc(sd * r * 0.2, -r * 1.3, r * 0.08, 0, 6.283); g.fill(); }
  }
  function drawFace(g, who, x, y, r) {
    const L = LOOK[who] || LOOK.ember;
    g.save(); g.translate(x, y + r * 0.15); g.rotate(Math.PI); // snout down, horns up
    g.scale(-1, 1);
    drawHead(g, r * 0.62, L, false);
    g.restore();
  }

  window.Hoard = { NODES, Model, baseStats };
  Kit.game({
    id: 'hoard', title: 'Hoard', tagline: 'A young dragon, a cave, and a lot of villages that have far too much gold. Send kobolds raiding, grow the pile, and burn the knights who come to take it back.',
    howTo: 'Tap a village to send a kobold raiding. Spend raided gold on the buttons below to snowball. Tap knights to breathe fire before they break your wall. Part of every run\'s gold banks as renown for the upgrade tree.',
    runVerb: 'Raid!', winTitle: 'Elder Wyrm!', loseTitle: 'The knights broke in!',
    colors: { accent: '#ffb703', bg: '#1a1320', card: '#2d2236' },
    currencies: [{ id: 'renown', name: 'renown', color: '#ffb703' }, { id: 'gems', name: 'gems', color: '#9bf6ff' }],
    characters: [
      { id: 'ember', name: 'Ember', blurb: 'Red dragon. Hotter, wider fire.', unlock: 0, icon: '🔥' },
      { id: 'rime', name: 'Rime', blurb: 'Frost dragon. Knights march slower; a big unspent hoard boosts every haul.', unlock: 1, icon: '❄️' },
      { id: 'moss', name: 'Moss', blurb: 'Forest dragon. Kobolds hatch for free every few seconds.', unlock: 2, icon: '🌿' },
    ],
    drawFace, nodes: NODES, touchOffset: 0,
    baseStats, createRun,
  });
  document.body.dataset.ready = '1';
})();
