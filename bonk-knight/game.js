// Bonk Knight: tap (or hold) the floor's monster to bonk it, sweep up the loot it spills before it fades,
// climb the tower before your stamina runs out. Piñata-tapping loop in fantasy clothes. Kit contract: ../README.md
(function () {
  'use strict';
  const NODES = [
    { id: 'blade', name: 'Sharper Blade', icon: '🗡️', desc: '+35% damage', cost: 6, grow: 1.9, max: 25, req: [], x: 0, y: 0, fx: (s, l) => { s.dmg *= 1.35 ** l; } },
    { id: 'grip', name: 'Quick Grip', icon: '🧤', desc: 'Swing 9% faster', cost: 10, grow: 2.2, max: 8, req: ['blade'], x: 1, y: 0, fx: (s, l) => { s.swing *= 0.91 ** l; } },
    { id: 'crit', name: 'Keen Edge', icon: '🎯', desc: '+5% crit chance', cost: 25, grow: 2.2, max: 8, req: ['grip'], x: 2, y: 0, fx: (s, l) => { s.crit += 0.05 * l; } },
    { id: 'critdmg', name: 'Brutal Crits', icon: '💢', desc: 'Crits hit +60% harder', cost: 70, grow: 2.3, max: 6, req: ['crit'], x: 3, y: 0, fx: (s, l) => { s.critMul += 0.6 * l; } },
    { id: 'lungs', name: 'Deep Lungs', icon: '🫁', desc: '+2s stamina', cost: 10, grow: 2.2, max: 6, req: ['blade'], x: -1, y: 0, fx: (s, l) => { s.st += 2 * l; } },
    { id: 'wind', name: 'Second Wind', icon: '🍃', desc: 'Kills refill +0.8s stamina', cost: 35, grow: 2.4, max: 6, req: ['lungs'], x: -2, y: 0, fx: (s, l) => { s.refill += 0.8 * l; } },
    { id: 'skip', name: 'Tower Map', icon: '🗺️', desc: 'Start 2 floors higher', cost: 300, grow: 3, max: 4, req: ['wind'], x: -3, y: 0, fx: (s, l) => { s.skip += 2 * l; } },
    { id: 'magnet', name: 'Loot Magnet', icon: '🧲', desc: '+14 sweep radius', cost: 8, grow: 2.0, max: 6, req: ['blade'], x: 0, y: 1, fx: (s, l) => { s.magnet += 14 * l; } },
    { id: 'sticky', name: 'Sticky Loot', icon: '🍯', desc: 'Loot lasts +0.8s', cost: 20, grow: 2.2, max: 5, req: ['magnet'], x: 1, y: 1, fx: (s, l) => { s.life += 0.8 * l; } },
    { id: 'purse', name: 'Fat Purse', icon: '💰', desc: '+30% coin value', cost: 15, grow: 2.3, max: 12, req: ['magnet'], x: -1, y: 1, fx: (s, l) => { s.value *= 1 + 0.3 * l; } },
    { id: 'pockets', name: 'Loose Pockets', icon: '👝', desc: '+25% chance of an extra coin per hit', cost: 60, grow: 2.5, max: 6, req: ['purse'], x: -1, y: 2, fx: (s, l) => { s.extra += 0.25 * l; } },
    { id: 'gemfind', name: 'Gem Finder', icon: '💎', desc: 'Gems drop more often', cost: 80, grow: 2.4, max: 6, req: ['purse'], x: -2, y: 1, fx: (s, l) => { s.gem *= 1 + 0.6 * l; s.gemKill += 0.08 * l; } },
    { id: 'fire', name: 'Ember Blade', icon: '🔥', desc: 'Hits can set the monster ablaze', cost: 150, grow: 2.3, max: 6, req: ['crit'], x: 2, y: -1, fx: (s, l) => { s.fire += 0.14 * l; s.burn += 0.25 * l; } },
    { id: 'chain', name: 'Chain Lightning', icon: '⚡', desc: 'Hits arc to minions and armour', cost: 300, grow: 2.4, max: 5, req: ['fire'], x: 3, y: -1, fx: (s, l) => { s.chain += l; } },
    // gem nodes
    { id: 'mithril', name: 'Mithril Edge', icon: '⚔️', desc: '+50% damage, swing 5% faster', cost: 2, grow: 1.8, max: 5, req: ['critdmg'], x: 4, y: 0, cur: 'gems', fx: (s, l) => { s.dmg *= 1.5 ** l; s.swing *= 0.95 ** l; } },
    { id: 'hourglass', name: 'Hourglass', icon: '⏳', desc: 'Stamina drains 8% slower', cost: 2, grow: 1.8, max: 5, req: ['skip'], x: -4, y: 0, cur: 'gems', fx: (s, l) => { s.drain *= 0.92 ** l; } },
    { id: 'vault', name: 'Dragon Vault', icon: '🏦', desc: '+60% coin value', cost: 3, grow: 1.8, max: 5, req: ['gemfind'], x: -2, y: 2, cur: 'gems', fx: (s, l) => { s.value *= 1 + 0.6 * l; } },
    { id: 'storm', name: 'Stormcaller', icon: '🌩️', desc: 'Lightning arcs +1 and also strikes the monster', cost: 3, grow: 1.9, max: 4, req: ['chain'], x: 3, y: -2, cur: 'gems', fx: (s, l) => { s.chain += l; s.storm += 0.3 * l; } },
    // character nodes
    { id: 'frenzy', who: 'berserker', name: 'Blood Frenzy', icon: '🩸', desc: 'Low-stamina rage hits harder; swing 4% faster', cost: 50, grow: 2.3, max: 5, req: ['blade'], x: 0, y: -1, fx: (s, l) => { s.rage += 0.5 * l; s.swing *= 0.96 ** l; } },
    { id: 'arcane', who: 'battlemage', name: 'Arcane Torrent', icon: '🔮', desc: 'Blasts +40% and charge 12% faster', cost: 50, grow: 2.3, max: 5, req: ['blade'], x: 0, y: -1, fx: (s, l) => { s.blast *= 1.4 ** l; s.chargeT *= 0.88 ** l; } },
    { id: 'shadow', who: 'rogue', name: 'Shadow Chain', icon: '🌑', desc: 'Each stacked crit adds more crit chance and power', cost: 50, grow: 2.3, max: 5, req: ['blade'], x: 0, y: -1, fx: (s, l) => { s.stackCrit += 0.03 * l; s.stackMul += 0.25 * l; } },
    { id: 'lich', name: 'Crypt Key', icon: '💀', desc: 'Your next climb starts at the Lich King. Destroy him to win.', cost: 100000, grow: 1, max: 1, req: ['mithril', 'hourglass', 'vault', 'storm'], reqAll: 3, extra: { gems: 10 }, x: 0, y: -3, win: true },
  ];

  const LICH_HP = 5e6;
  const hpFor = (f) => Math.round(12 * 1.6 ** (f - 1));
  const coinFor = (f) => 1 + 0.25 * (f - 1);
  const MONS = [
    { name: 'Slime', c: '#6ed37f', d: '#3f9a52', eyes: 2 },
    { name: 'Goblin', c: '#9bc34a', d: '#5f7f22', ears: 1, teeth: 1 },
    { name: 'Skeleton', c: '#ece6d2', d: '#a99f86', skull: 1 },
    { name: 'Orc', c: '#5e9c55', d: '#33612e', tusks: 1, helm: 1 },
    { name: 'Troll', c: '#6e9bb5', d: '#3d6077', horns: 1, teeth: 1 },
    { name: 'Golem', c: '#9a8f80', d: '#5f564b', rock: 1, eyes: 1 },
    { name: 'Fire Imp', c: '#e0613f', d: '#9c2f1a', horns: 1, tusks: 1 },
    { name: 'Wyrm', c: '#7a68c2', d: '#46378a', horns: 1, teeth: 1, eyes: 1 },
  ];
  // floor gimmicks: 3 armour, 4 minions, 5 shield, then cycling; from floor 10 two at once
  function gimmicks(f) {
    const g = { armour: false, minions: false, shield: false };
    const k = ['armour', 'minions', 'shield'];
    if (f >= 3) g[k[f % 3]] = true;
    if (f >= 10) g[k[(f + 1) % 3]] = true;
    return g;
  }

  function createRun(env) {
    const s = env.stats, W = env.W, H = env.H, fx = env.fx, sfx = env.sfx, rnd = Math.random, who = env.who;
    const MX = W / 2, MY = H * 0.34, MR = Math.min(W * 0.27, H * 0.16);
    const FLOOR_TOP = H * 0.62;
    const R = { t: 0, over: false, won: false, st: env.boss ? s.st * 2 : s.st, coins: 0, gems: 0, lost: 0, floor: 1 + s.skip, kills: 0, M: null, loot: [], minions: [], slashes: [], bolts: [],
      cd: 0, tapCd: 0, holdT: 0, charge: 0, stack: 0, trans: 0, px: null, py: null, hitOnce: false, grabbed: 0, banner: null, hint: 0, burnT: 0, seen: {}, nums: [] };
    const num = (x, y, str, c, size) => R.nums.push({ x, y, s: str, c, size, t: R.t, vx: (rnd() - 0.5) * 60 });
    const stMax = () => env.boss ? s.st * 2 : s.st + 4;

    function newMonster() {
      const f = R.floor;
      if (env.boss) {
        R.M = { boss: true, name: 'The Lich King', f, hp: LICH_HP, max: LICH_HP, r: MR * 1.15, plates: platesFor(6, LICH_HP * 0.04), g: { armour: true, minions: true, shield: true },
          shieldAt: [0.66, 0.33], shield: 0, sq: 0, flash: 0, born: R.t, burn: 0, minionT: 2, c: '#3b2b5c', d: '#1d1430' };
        banner('THE LICH KING', 'Break his armour, bonk his minions!');
        return;
      }
      const type = MONS[(f - 1) % MONS.length], g = gimmicks(f), hp = hpFor(f);
      R.M = { name: type.name, type, f, hp, max: hp, r: MR * (0.86 + Math.min(0.3, f * 0.012)), g, sq: 0, flash: 0, born: R.t, burn: 0,
        plates: g.armour ? platesFor(2 + Math.min(3, Math.floor(f / 6)), hp * 0.14) : [], shieldAt: g.shield ? [0.55] : [], shield: 0, minionT: 0.6 };
      const tip = g.armour && !R.seen.armour ? 'Smash the armour plates!' : g.minions && !R.seen.minions ? 'Bonk the minions first!' : g.shield && !R.seen.shield ? 'Shielded? Sweep loot!' : '';
      for (const k in g) if (g[k]) R.seen[k] = 1;
      banner('FLOOR ' + f, type.name + (tip ? ' · ' + tip : ''));
    }
    function platesFor(n, hp) { return Array.from({ length: n }, (_, i) => ({ a: -0.35 + (i + 0.5) * ((Math.PI + 0.7) / n), hp, max: hp })); }
    function banner(a, b) { R.banner = { a, b, t: R.t }; }

    // ---- loot
    function drop(x, y, n, kind = 'coin', spread = 1) {
      for (let i = 0; i < n; i++) {
        const a = -Math.PI / 2 + (rnd() - 0.5) * 2.6 * spread, v = 220 + rnd() * 260;
        R.loot.push({ kind, x: x + (rnd() - 0.5) * 20, y, vx: Math.cos(a) * v * 0.9, vy: Math.sin(a) * v - 60, gy: FLOOR_TOP + 18 + rnd() * (H - FLOOR_TOP - 54),
          v: kind === 'gem' ? 1 : s.value * coinFor(R.M ? R.M.f : R.floor) * (env.boss ? 4 : 1), t: 0, bounced: false, grab: 0, spin: rnd() * 6 });
      }
    }
    function updLoot(dt, inp) {
      const fly = [W - 30, 24];
      for (const L of R.loot) {
        L.t += dt;
        if (L.grab) { L.grab += dt; const k = Math.min(1, L.grab * 3.2); L.x += (fly[0] - L.x) * k; L.y += (fly[1] - L.y) * k; continue; }
        L.vy += 1250 * dt; L.x += L.vx * dt; L.y += L.vy * dt;
        if (L.x < 12) { L.x = 12; L.vx = Math.abs(L.vx) * 0.6; } if (L.x > W - 12) { L.x = W - 12; L.vx = -Math.abs(L.vx) * 0.6; }
        if (L.y > L.gy) { L.y = L.gy; L.bounced = true; if (Math.abs(L.vy) > 90) { L.vy = -L.vy * 0.42; L.vx *= 0.75; if (Math.abs(L.vy) > 140) sfx.tone && sfx.tone(2200 + rnd() * 600, 0.025, 'square', 0.012); } else { L.vy = 0; L.vx *= 0.85; } }
        if (inp.down && L.bounced) {
          const d = segDist(L.x, L.y, R.px ?? inp.x, R.py ?? inp.y, inp.x, inp.y);
          if (d < s.magnet) { collect(L); continue; }
          if (d < s.magnet * 2) { const dx = inp.x - L.x, dy = inp.y - L.y, m = Math.hypot(dx, dy) || 1; L.x += dx / m * 260 * dt; L.y += dy / m * 260 * dt; }
        }
        if (L.t > s.life + (L.kind === 'gem' ? 2 : 0)) { L.dead = true; if (L.kind === 'coin') R.lost += L.v; }
      }
      R.loot = R.loot.filter((L) => !L.dead && !(L.grab && L.grab > 0.45));
    }
    function collect(L) {
      L.grab = 0.0001; R.grabbed++;
      if (L.kind === 'gem') { R.gems += 1; sfx.ding(); fx.text(L.x, L.y - 10, '+1 gem', '#e0aaff', 18); }
      else { R.coins += L.v; sfx.coin(); }
    }
    function segDist(px, py, ax, ay, bx, by) {
      const dx = bx - ax, dy = by - ay, l = dx * dx + dy * dy, t = l ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l)) : 0;
      return Math.hypot(px - ax - dx * t, py - ay - dy * t);
    }

    // ---- combat
    function roll() {
      let d = s.dmg;
      if (who === 'berserker') d *= 1 + s.rage * Math.max(0, 1 - R.st / stMax());
      const cc = s.crit + (who === 'rogue' ? R.stack * s.stackCrit : 0), crit = rnd() < cc;
      if (crit) { d *= s.critMul + (who === 'rogue' ? R.stack * s.stackMul : 0); if (who === 'rogue') R.stack = Math.min(12, R.stack + 1); }
      else if (who === 'rogue') R.stack = 0;
      return { d, crit };
    }
    function targetAt(x, y) {
      for (const m of R.minions) if (!m.dead && Math.hypot(m.x - x, m.y - y) < m.r + 16) return m;
      if (R.M && !R.trans && Math.hypot(MX - x, MY - y) < R.M.r * 1.15) return R.M;
      return null;
    }
    function swing(tg, x, y, mult = 1, big = false) {
      const { d, crit } = roll();
      R.slashes.push({ x, y, a: rnd() * 6.28, t: R.t, crit: crit || big });
      dealt(tg, d * mult, crit || big, x, y, true);
      if (s.chain) chainZap(x, y, d * 0.6 * mult);
      if (!R.hitOnce) { R.hitOnce = true; R.hint = R.t; }
    }
    function dealt(tg, d, crit, x, y, fromSwing) {
      if (tg.minion) {
        tg.hp -= d; tg.flash = 1; num(tg.x, tg.y - 14, env.fmt(Math.max(1, d)), crit ? '#ffd166' : '#fff', crit ? 20 : 15);
        sfx.pop(1.4);
        if (tg.hp <= 0 && !tg.dead) { tg.dead = true; fx.burst(tg.x, tg.y, 10, ['#b388eb', '#ffd166', '#fff'], 180); drop(tg.x, tg.y, 2, 'coin', 0.7); sfx.pop(0.7); }
        return;
      }
      const M = tg;
      if (M.shield > 0) { if (fromSwing) { fx.text(x, y - 20, 'BLOCKED', '#8ecae6', 16); fx.ring(MX, MY, M.r * 1.3, '#8ecae6'); sfx.zap(); } return; }
      M.sq = 1; M.flash = 1;
      const plate = M.plates.find((p) => p.hp > 0);
      if (plate) {
        plate.hp -= d; plate.flash = 1; sfx.crack(); num(x, y - 18, env.fmt(Math.max(1, d)), '#ced4da', crit ? 22 : 16);
        if (plate.hp <= 0) { const px = MX + Math.cos(plate.a) * M.r * 0.75, py = MY + Math.sin(plate.a) * M.r * 0.75; fx.burst(px, py, 14, ['#adb5bd', '#e9ecef', '#6c757d'], 220, 4.5); drop(px, py, 3); fx.shake = Math.max(fx.shake, 7); sfx.boom(); }
        if (fromSwing) drop(x, y, 1);
        return;
      }
      const ward = R.minions.some((m) => !m.dead);
      if (ward) d *= 0.25;
      M.hp -= d;
      num(x + (rnd() - 0.5) * 30, y - 20, (crit ? '' : '') + env.fmt(Math.max(1, d)) + (crit ? '!' : ''), crit ? '#ffd166' : ward ? '#b8b8d0' : '#fff', crit ? 34 : 24);
      fx.shake = Math.max(fx.shake, crit ? 9 : 4);
      if (crit) { fx.ring(x, y, 40, '#ffd166'); sfx.hit(); }
      sfx.pop(0.6 + rnd() * 0.3);
      fx.burst(x, y, crit ? 9 : 5, [M.boss ? '#b388eb' : M.type.c, '#fff'], 170);
      if (fromSwing) {
        drop(x, y, 1 + (rnd() < s.extra % 1 ? 1 : 0) + Math.floor(s.extra));
        if (rnd() < s.gem) drop(x, y, 1, 'gem');
        if (s.fire && rnd() < s.fire) { if (M.burn <= 0) fx.text(MX, MY - M.r - 10, 'ABLAZE', '#ff9f1c', 16); M.burn = 2.5; }
      }
      for (const a of M.shieldAt) if (M.hp / M.max < a && !M['sh' + a]) { M['sh' + a] = 1; M.shield = 2.4; sfx.zap(); banner('SHIELD UP', 'Sweep the loot while it holds!'); drop(MX, MY, 6, 'coin', 1.2); }
      if (M.hp <= 0) kill();
    }
    function chainZap(x, y, d) {
      const tg = [];
      for (const m of R.minions) if (!m.dead && tg.length < s.chain) tg.push(m);
      if (R.M) { const p = R.M.plates.filter((p) => p.hp > 0); for (const pl of p) if (tg.length < s.chain) tg.push(pl); }
      let ox = x, oy = y;
      for (const t of tg) {
        const tx = t.minion ? t.x : MX + Math.cos(t.a) * R.M.r * 0.75, ty = t.minion ? t.y : MY + Math.sin(t.a) * R.M.r * 0.75;
        R.bolts.push({ x0: ox, y0: oy, x1: tx, y1: ty, t: R.t }); ox = tx; oy = ty;
        if (t.minion) dealt(t, d, false, tx, ty); else { t.hp -= d; t.flash = 1; if (t.hp <= 0) { fx.burst(tx, ty, 10, ['#adb5bd', '#e9ecef'], 200); drop(tx, ty, 3); sfx.crack(); } }
      }
      if (s.storm && R.M && R.M.shield <= 0 && !R.M.plates.some((p) => p.hp > 0)) { R.bolts.push({ x0: MX, y0: 0, x1: MX + (rnd() - 0.5) * 40, y1: MY, t: R.t }); dealt(R.M, d * s.storm / 0.6, false, MX, MY - 20); }
      if (tg.length) sfx.zap();
    }
    function blast(c) {
      const k = Math.min(1, c), mult = s.blast * k * k;
      fx.ring(MX, MY, R.M.r * 2.2, '#9d4edd'); fx.ring(MX, MY, R.M.r * 1.5, '#e0aaff'); fx.shake = 14; sfx.boom();
      for (const m of R.minions) if (!m.dead) dealt(m, s.dmg * mult, true, m.x, m.y);
      for (const p of R.M.plates) if (p.hp > 0) { p.hp -= s.dmg * mult * 0.5; p.flash = 1; }
      swing(R.M, MX, MY, mult, true);
      drop(MX, MY, Math.round(3 + 5 * k), 'coin', 1.3);
    }
    function kill() {
      const M = R.M; R.kills++;
      fx.burst(MX, MY, 30, [M.boss ? '#b388eb' : M.type.c, '#ffd166', '#fff'], 300, 5); fx.ring(MX, MY, M.r * 2, '#ffd166'); fx.shake = 16; sfx.boom(); sfx.ding();
      if (M.boss) { R.won = true; R.winT = R.t; drop(MX, MY, 30, 'coin', 1.6); return; }
      drop(MX, MY, 4 + Math.min(16, M.f), 'coin', 1.4);
      if (M.f >= 3 && rnd() < s.gemKill) drop(MX, MY, 1, 'gem');
      const add = s.refill / (1 + R.kills / 6);
      R.st = Math.min(stMax(), R.st + add); fx.text(W - 170, 50, '+' + add.toFixed(1) + 's', '#7ae582', 18);
      R.minions = []; R.trans = 0.9; R.M = null; R.floor++;
    }
    function updMinions(dt) {
      const M = R.M; if (!M || !M.g.minions) return;
      M.minionT -= dt;
      if (M.minionT <= 0 && R.minions.filter((m) => !m.dead).length === 0) {
        M.minionT = M.boss ? 5 : 6.5;
        const n = M.boss ? 4 : 2 + Math.min(2, Math.floor(M.f / 8));
        for (let i = 0; i < n; i++) R.minions.push({ minion: true, a: i / n * 6.283, r: 22, hp: hpFor(M.boss ? 16 : M.f) * 0.07, flash: 0, born: R.t, x: MX, y: MY });
        sfx.pop(1.8);
      }
      for (const m of R.minions) { m.a += dt * 0.9; const rr = M.r * 1.55; m.x = MX + Math.cos(m.a) * rr; m.y = MY + Math.sin(m.a) * rr * 0.55 + 10; m.flash = Math.max(0, m.flash - dt * 6); }
      R.minions = R.minions.filter((m) => !m.dead);
    }

    newMonster();
    const run = {
      _R: R, MX, MY,
      get over() { return R.over; }, get t() { return R.t; },
      update(dt, input) {
        R.in = { x: input.x, y: input.y, down: input.down };
        if (R.over) return;
        R.t += dt;
        fx.update(dt);
        if (R.won) { updLoot(dt, { ...input, down: true }); for (const L of R.loot) if (!L.grab && L.bounced) collect(L); if (R.t - R.winT > 1.6) R.over = true; return; }
        if (R.trans > 0) { R.trans -= dt; if (R.trans <= 0) { R.trans = 0; newMonster(); } }
        else R.st -= s.drain * (1 + Math.max(0, R.t - 10) / 20) * dt;
        const M = R.M;
        R.cd -= dt; R.tapCd -= dt;
        for (const tp of input.taps) {
          const tg = targetAt(tp.x, tp.y);
          if (tg && R.tapCd <= 0) { swing(tg, tp.x, tp.y); R.tapCd = s.swing * 0.45; R.cd = s.swing; }
          R.holdT = 0;
        }
        const over = input.down ? targetAt(input.x, input.y) : null;
        if (over && R.M) {
          R.holdT += dt;
          if (who === 'battlemage' && over === R.M) { if (R.holdT > 0.22 && R.M.shield <= 0) R.charge = Math.min(1.25, R.charge + dt / s.chargeT); }
          else if (R.cd <= 0 && R.holdT > 0.1) { swing(over, input.x + (rnd() - 0.5) * 16, input.y + (rnd() - 0.5) * 16); R.cd = s.swing; }
        }
        if (R.charge > 0 && (!input.down || !over)) { if (R.charge > 0.2 && R.M) blast(R.charge); R.charge = 0; }
        if (M && M.shield > 0) M.shield -= dt;
        if (M) {
          M.sq = Math.max(0, M.sq - dt * 6); M.flash = Math.max(0, M.flash - dt * 12);
          for (const p of M.plates) p.flash = Math.max(0, (p.flash || 0) - dt * 8);
          if (M.burn > 0 && M.hp > 0) {
            M.burn -= dt; R.burnT -= dt;
            if (R.burnT <= 0) { R.burnT = 0.4; const d = s.dmg * s.burn * 0.4; if (!M.plates.some((p) => p.hp > 0) && M.shield <= 0) { M.hp -= d; num(MX + (rnd() - 0.5) * M.r, MY - M.r * 0.5, env.fmt(Math.max(1, d)), '#ff9f1c', 15); fx.burst(MX + (rnd() - 0.5) * M.r, MY, 3, ['#ff9f1c', '#ffd166'], 90); if (rnd() < 0.35) drop(MX, MY, 1); if (M.hp <= 0) kill(); } }
          }
        }
        updMinions(dt);
        updLoot(dt, input);
        R.px = input.down ? input.x : null; R.py = input.down ? input.y : null;
        R.nums = R.nums.filter((q) => R.t - q.t < 0.8); R.slashes = R.slashes.filter((q) => R.t - q.t < 0.18); R.bolts = R.bolts.filter((b) => R.t - b.t < 0.16);
        if (R.st <= 0) { R.st = 0; R.over = true; for (const L of R.loot) if (L.kind === 'coin' && !L.grab) R.lost += L.v; }
      },
      draw(g) { drawRun(g, R, env, s, { MX, MY, W, H, FLOOR_TOP, stMax: stMax() }); },
      result() {
        const lines = [`Reached floor ${R.floor} · ${R.kills} monster${R.kills === 1 ? '' : 's'} bonked in ${Math.round(R.t)}s`];
        if (R.lost >= 1) lines.push(`${env.fmt(R.lost)} coins faded on the floor. Sweep faster!`);
        return R.won ? { won: true, earned: { coins: R.coins, gems: R.gems } }
          : { won: false, title: env.boss ? 'The Lich King endures' : 'Out of breath', earned: { coins: R.coins, gems: R.gems }, lines };
      },
    };
    if (typeof window !== "undefined") window.__bk = run; // debug handle
    return run;
  }

  // ---------------------------------------------------------------- drawing
  let BG = null, BGkey = '';
  function rr(g, x, y, w, h, r) { g.beginPath(); g.roundRect ? g.roundRect(x, y, w, h, r) : g.rect(x, y, w, h); }
  function background(W, H, FT) {
    const key = W + 'x' + H; if (BG && BGkey === key) return BG;
    const c = document.createElement('canvas'), dpr = Math.min(2, window.devicePixelRatio || 1); c.width = W * dpr; c.height = H * dpr;
    const g = c.getContext('2d'); g.scale(dpr, dpr);
    const wall = g.createLinearGradient(0, 0, 0, FT); wall.addColorStop(0, '#1b1830'); wall.addColorStop(1, '#2d2747'); g.fillStyle = wall; g.fillRect(0, 0, W, FT);
    g.strokeStyle = 'rgba(0,0,0,.35)'; g.lineWidth = 2;
    for (let y = 0, row = 0; y < FT; y += 34, row++) { g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); for (let x = (row % 2) * 30; x < W; x += 60) { g.beginPath(); g.moveTo(x, y); g.lineTo(x, y + 34); g.stroke(); } }
    g.fillStyle = 'rgba(255,255,255,.03)'; for (let y = 0, row = 0; y < FT; y += 34, row++) for (let x = (row % 2) * 30; x < W; x += 60) g.fillRect(x + 3, y + 3, 54, 4);
    // window arch
    g.fillStyle = '#0d0b18'; g.beginPath(); g.moveTo(W / 2 - 70, FT); g.lineTo(W / 2 - 70, H * 0.2); g.arc(W / 2, H * 0.2, 70, Math.PI, 0); g.lineTo(W / 2 + 70, FT); g.fill();
    g.strokeStyle = '#3d3560'; g.lineWidth = 6; g.stroke();
    // floor
    const fl = g.createLinearGradient(0, FT, 0, H); fl.addColorStop(0, '#4a3b2f'); fl.addColorStop(1, '#2a2019'); g.fillStyle = fl; g.fillRect(0, FT, W, H - FT);
    g.strokeStyle = 'rgba(0,0,0,.35)'; g.lineWidth = 2;
    for (let i = 0; i < 7; i++) { const y = FT + (H - FT) * (i / 7) ** 1.3; g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); }
    for (let i = -6; i <= 6; i++) { g.beginPath(); g.moveTo(W / 2 + i * 40, FT); g.lineTo(W / 2 + i * 120, H); g.stroke(); }
    g.fillStyle = 'rgba(0,0,0,.4)'; g.fillRect(0, FT - 4, W, 8);
    BG = c; BGkey = key; return c;
  }
  function torch(g, x, y, t) {
    g.fillStyle = '#5b4636'; g.fillRect(x - 4, y, 8, 22);
    const f = 1 + Math.sin(t * 17 + x) * 0.12 + Math.sin(t * 7) * 0.08;
    const gl = g.createRadialGradient(x, y - 6, 2, x, y - 6, 70 * f); gl.addColorStop(0, 'rgba(255,170,60,.35)'); gl.addColorStop(1, 'rgba(255,170,60,0)'); g.fillStyle = gl; g.beginPath(); g.arc(x, y - 6, 70 * f, 0, 6.28); g.fill();
    g.fillStyle = '#ff9f1c'; g.beginPath(); g.ellipse(x, y - 8, 7, 13 * f, 0, 0, 6.28); g.fill(); g.fillStyle = '#ffe066'; g.beginPath(); g.ellipse(x, y - 5, 3.5, 7 * f, 0, 0, 6.28); g.fill();
  }
  function drawRun(g, R, env, s, L) {
    const { MX, MY, W, H, FLOOR_TOP } = L, fx = env.fx, t = R.t;
    const sx = (Math.random() - 0.5) * fx.shake, sy = (Math.random() - 0.5) * fx.shake;
    g.save(); g.translate(sx, sy);
    g.drawImage(background(W, H, FLOOR_TOP), 0, 0, W, H);
    torch(g, 34, H * 0.3, t); torch(g, W - 34, H * 0.3, t);
    const M = R.M;
    if (M) {
      g.fillStyle = 'rgba(0,0,0,.35)'; g.beginPath(); g.ellipse(MX, FLOOR_TOP + 14, M.r * 0.9, 14, 0, 0, 6.28); g.fill();
      for (const m of R.minions) if (m.y < MY) drawMinion(g, m, t);
      if (R.minions.length) { g.strokeStyle = 'rgba(179,136,235,.45)'; g.lineWidth = 3; g.setLineDash([6, 6]); for (const m of R.minions) { g.beginPath(); g.moveTo(m.x, m.y); g.lineTo(MX, MY); g.stroke(); } g.setLineDash([]); }
      drawMonster(g, M, MX, MY, t, R.in);
      for (const m of R.minions) if (m.y >= MY) drawMinion(g, m, t);
    }
    // loot
    for (const l of R.loot) drawLoot(g, l, s.life, t);
    // slashes + bolts
    for (const q of R.slashes) { const k = (t - q.t) / 0.18; g.strokeStyle = q.crit ? `rgba(255,209,102,${1 - k})` : `rgba(255,255,255,${1 - k})`; g.lineWidth = (q.crit ? 9 : 6) * (1 - k) + 1; g.beginPath(); g.arc(q.x, q.y, 26 + k * 24, q.a, q.a + 2.2); g.stroke(); }
    for (const b of R.bolts) { g.strokeStyle = '#bde0fe'; g.lineWidth = 3; g.beginPath(); g.moveTo(b.x0, b.y0); for (let i = 1; i < 6; i++) { const k = i / 6; g.lineTo(b.x0 + (b.x1 - b.x0) * k + (Math.random() - 0.5) * 18, b.y0 + (b.y1 - b.y0) * k + (Math.random() - 0.5) * 18); } g.lineTo(b.x1, b.y1); g.stroke(); }
    fx.draw(g);
    g.textAlign = 'center'; g.lineJoin = 'round';
    for (const q of R.nums) { const k = (t - q.t) / 0.8, pop = 1 + Math.max(0, 0.25 - k) * 2.4; g.globalAlpha = Math.min(1, (1 - k) * 2.5); g.font = `${Math.round(q.size * pop)}px "Lilita One", system-ui`; const y = q.y - 50 * k + 40 * k * k, x = q.x + q.vx * k; g.strokeStyle = '#1b1830'; g.lineWidth = 5; g.strokeText(q.s, x, y); g.fillStyle = q.c; g.fillText(q.s, x, y); }
    g.globalAlpha = 1;
    g.restore();
    // charge orb (battlemage)
    if (R.charge > 0 && R.in) { const k = Math.min(1, R.charge); g.strokeStyle = '#e0aaff'; g.lineWidth = 6; g.beginPath(); g.arc(R.in.x, R.in.y, 46, -1.57, -1.57 + 6.283 * k); g.stroke(); const gr = g.createRadialGradient(R.in.x, R.in.y, 2, R.in.x, R.in.y, 20 + 30 * k); gr.addColorStop(0, 'rgba(224,170,255,.9)'); gr.addColorStop(1, 'rgba(157,78,221,0)'); g.fillStyle = gr; g.beginPath(); g.arc(R.in.x, R.in.y, 20 + 30 * k, 0, 6.28); g.fill(); if (k >= 1) { g.font = '800 14px Nunito, system-ui'; g.textAlign = 'center'; g.fillStyle = '#fff'; g.fillText('RELEASE!', R.in.x, R.in.y - 56); } }
    // sweep circle
    if (R.in?.down && !R.charge) { g.strokeStyle = 'rgba(255,214,102,.35)'; g.lineWidth = 2; g.beginPath(); g.arc(R.in.x, R.in.y, s.magnet, 0, 6.28); g.stroke(); }
    // low stamina vignette
    const frac = R.st / L.stMax;
    if (frac < 0.3 && !R.won) { const a = (0.3 - frac) * 1.6 * (0.7 + 0.3 * Math.sin(t * 10)); const v = g.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, H * 0.75); v.addColorStop(0, 'rgba(200,0,0,0)'); v.addColorStop(1, `rgba(200,0,30,${a})`); g.fillStyle = v; g.fillRect(0, 0, W, H); }
    // HUD
    const bw = W - 150;
    g.fillStyle = 'rgba(0,0,0,.55)'; rr(g, 14, 14, bw, 18, 9); g.fill();
    g.fillStyle = frac < 0.3 ? '#ff5d73' : '#7ae582'; rr(g, 14, 14, Math.max(0, bw * Math.min(1, R.st / L.stMax)), 18, 9); g.fill();
    g.font = '800 12px Nunito, system-ui'; g.fillStyle = '#10251a'; g.textAlign = 'left'; g.fillText('STAMINA', 22, 27);
    g.textAlign = 'right'; g.font = '22px "Lilita One", system-ui'; g.fillStyle = '#ffd166'; g.fillText(env.fmt(R.coins), W - 46, 32);
    coinIcon(g, W - 30, 24, 10, t);
    if (R.gems) { g.font = '18px "Lilita One", system-ui'; g.fillStyle = '#e0aaff'; g.fillText(R.gems + ' 💎', W - 16, 56); }
    g.textAlign = 'left'; g.font = '18px "Lilita One", system-ui'; g.fillStyle = '#fff';
    g.fillText(M?.boss ? 'LICH KING' : 'FLOOR ' + R.floor, 16, 56);
    if (env.who === 'rogue' && R.stack > 0) { g.fillStyle = '#ffd166'; g.font = '16px "Lilita One", system-ui'; g.fillText('CRIT CHAIN x' + R.stack, 16, 78); }
    if (env.who === 'berserker' && frac < 0.5) { g.fillStyle = '#ff5d73'; g.font = '16px "Lilita One", system-ui'; g.fillText('RAGE +' + Math.round(s.rage * (1 - frac) * 100) + '%', 16, 78); }
    if (M) { // HP bar under monster
      const hw = Math.min(W - 80, 240), hx = MX - hw / 2, hy = MY + M.r + 30;
      g.fillStyle = 'rgba(0,0,0,.6)'; rr(g, hx, hy, hw, 12, 6); g.fill();
      g.fillStyle = M.boss ? '#b388eb' : '#ff6b6b'; rr(g, hx, hy, hw * Math.max(0, M.hp / M.max), 12, 6); g.fill();
      const pl = M.plates.filter((p) => p.hp > 0).length; if (pl) { g.fillStyle = '#ced4da'; g.font = '800 12px Nunito, system-ui'; g.textAlign = 'center'; g.fillText('ARMOUR ' + pl, MX, hy + 28); }
    }
    // banner
    if (R.banner) { const k = t - R.banner.t; if (k < 2) { const a = Math.min(1, k * 5, (2 - k) * 3); g.globalAlpha = a; g.textAlign = 'center'; g.fillStyle = '#ffd166'; g.font = `${34 + Math.max(0, 1 - k * 4) * 16}px "Lilita One", system-ui`; g.strokeStyle = '#1b1830'; g.lineWidth = 6; g.strokeText(R.banner.a, W / 2, H * 0.13); g.fillText(R.banner.a, W / 2, H * 0.13); g.font = '800 15px Nunito, system-ui'; g.fillStyle = '#fff'; g.strokeText(R.banner.b, W / 2, H * 0.13 + 24); g.fillText(R.banner.b, W / 2, H * 0.13 + 24); g.globalAlpha = 1; } }
    // first-run hints
    g.textAlign = 'center';
    if (!R.hitOnce && M) {
      const p = 0.5 + 0.5 * Math.sin(t * 6);
      g.strokeStyle = `rgba(255,255,255,${0.4 + p * 0.5})`; g.lineWidth = 4; g.beginPath(); g.arc(MX, MY, 24 + p * 14, 0, 6.28); g.stroke();
      hintText(g, env.who === 'battlemage' ? 'Tap the monster! Hold to charge a blast' : 'Tap the monster! Hold to keep swinging', W / 2, FLOOR_TOP - 16);
    } else if (env.runNo <= 3 && R.hitOnce && R.grabbed === 0 && R.loot.some((l) => l.bounced)) {
      const l = R.loot.find((q) => q.bounced && !q.grab);
      hintText(g, 'Swipe over the coins to grab them!', W / 2, FLOOR_TOP - 16);
      if (l) { const k = (t * 1.2) % 1; g.fillStyle = 'rgba(255,255,255,.8)'; g.beginPath(); g.arc(l.x - 50 + k * 100, l.y + 20, 9, 0, 6.28); g.fill(); }
    }
    if (R.won) { g.fillStyle = 'rgba(255,209,102,.15)'; g.fillRect(0, 0, W, H); g.font = '44px "Lilita One", system-ui'; g.fillStyle = '#ffd166'; g.fillText('LICH DESTROYED!', W / 2, H * 0.3); }
  }
  function hintText(g, s, x, y) {
    g.font = '800 17px Nunito, system-ui'; const w = g.measureText(s).width + 28;
    g.fillStyle = 'rgba(0,0,0,.6)'; rr(g, x - w / 2, y - 21, w, 32, 16); g.fill(); g.fillStyle = '#fff'; g.fillText(s, x, y);
  }
  function coinIcon(g, x, y, r, t, spin = 0) {
    const w = Math.abs(Math.cos(t * 3 + spin)) * 0.7 + 0.3;
    g.fillStyle = '#b07d18'; g.beginPath(); g.ellipse(x, y + 1.5, r * w, r, 0, 0, 6.28); g.fill();
    g.fillStyle = '#ffd166'; g.beginPath(); g.ellipse(x, y, r * w, r, 0, 0, 6.28); g.fill();
    g.fillStyle = '#fff3b0'; g.beginPath(); g.ellipse(x - r * 0.3 * w, y - r * 0.3, r * 0.25 * w, r * 0.3, 0, 0, 6.28); g.fill();
  }
  function drawLoot(g, l, life, t) {
    const left = life + (l.kind === 'gem' ? 2 : 0) - l.t;
    if (!l.grab && left < 1 && Math.sin(t * 30) > 0) return;
    const a = l.grab ? Math.max(0, 1 - l.grab * 2) : 1; g.globalAlpha = a;
    if (!l.grab) { g.fillStyle = 'rgba(0,0,0,.3)'; g.beginPath(); g.ellipse(l.x, l.gy + 2, 9, 3, 0, 0, 6.28); g.fill(); }
    if (l.kind === 'gem') {
      g.save(); g.translate(l.x, l.y); g.rotate(Math.sin(t * 4 + l.spin) * 0.3);
      const gl = g.createRadialGradient(0, 0, 2, 0, 0, 24); gl.addColorStop(0, 'rgba(224,170,255,.6)'); gl.addColorStop(1, 'rgba(224,170,255,0)'); g.fillStyle = gl; g.beginPath(); g.arc(0, 0, 24, 0, 6.28); g.fill();
      g.fillStyle = '#9d4edd'; g.beginPath(); g.moveTo(0, -12); g.lineTo(10, -3); g.lineTo(0, 12); g.lineTo(-10, -3); g.closePath(); g.fill();
      g.fillStyle = '#e0aaff'; g.beginPath(); g.moveTo(0, -12); g.lineTo(5, -3); g.lineTo(0, 4); g.lineTo(-5, -3); g.closePath(); g.fill(); g.restore();
    } else coinIcon(g, l.x, l.y - 7, 8 + Math.min(4, Math.log10(1 + l.v) * 1.5), t, l.spin);
    g.globalAlpha = 1;
  }
  function drawMinion(g, m, t) {
    const pop = Math.min(1, (t - m.born) * 5), r = m.r * pop, fl = Math.sin(t * 20 + m.a) * 0.5;
    g.save(); g.translate(m.x, m.y);
    g.fillStyle = m.flash > 0.4 ? '#fff' : '#5a3d8a';
    for (const sd of [-1, 1]) { g.beginPath(); g.moveTo(sd * r * 0.5, -2); g.quadraticCurveTo(sd * r * 1.8, -r * (1.2 + fl), sd * r * 1.6, r * 0.3); g.quadraticCurveTo(sd * r, 0, sd * r * 0.5, 4); g.fill(); }
    g.fillStyle = m.flash > 0.4 ? '#fff' : '#8f62c9'; g.beginPath(); g.arc(0, 0, r * 0.75, 0, 6.28); g.fill();
    g.fillStyle = '#ffd166'; g.beginPath(); g.arc(-r * 0.28, -r * 0.1, r * 0.17, 0, 6.28); g.arc(r * 0.28, -r * 0.1, r * 0.17, 0, 6.28); g.fill();
    g.fillStyle = '#fff'; g.beginPath(); g.moveTo(-r * 0.25, r * 0.3); g.lineTo(-r * 0.1, r * 0.5); g.lineTo(0, r * 0.3); g.lineTo(r * 0.1, r * 0.5); g.lineTo(r * 0.25, r * 0.3); g.fill();
    g.restore();
  }
  function drawMonster(g, M, x, y, t, inp) {
    const pop = Math.min(1, (t - M.born) * 4), drop = (1 - pop) * -180;
    const bob = Math.sin(t * 3) * 4, sq = M.sq, r = M.r;
    g.save(); g.translate(x + (Math.random() - 0.5) * sq * 8, y + bob + drop + sq * r * 0.12); g.scale(1 + sq * 0.2, 1 - sq * 0.16);
    const white = M.flash > 0.45;
    const c = white ? '#fff' : M.boss ? '#3b2b5c' : M.type.c, d = white ? '#eee' : M.boss ? '#1d1430' : M.type.d;
    const lx = inp ? Math.max(-1, Math.min(1, (inp.x - x) / 150)) : 0, ly = inp ? Math.max(-1, Math.min(1, (inp.y - y) / 200)) : 0;
    if (M.boss) drawLich(g, r, c, d, white, t, lx, ly);
    else {
      const T = M.type;
      if (T.horns) { g.fillStyle = white ? '#fff' : '#f1e3c8'; for (const sd of [-1, 1]) { g.beginPath(); g.moveTo(sd * r * 0.35, -r * 0.75); g.quadraticCurveTo(sd * r * 0.9, -r * 1.3, sd * r * 0.8, -r * 1.45); g.quadraticCurveTo(sd * r * 0.65, -r * 1.05, sd * r * 0.6, -r * 0.6); g.fill(); } }
      if (T.ears) { g.fillStyle = c; for (const sd of [-1, 1]) { g.beginPath(); g.moveTo(sd * r * 0.7, -r * 0.3); g.lineTo(sd * r * 1.35, -r * 0.7); g.lineTo(sd * r * 0.8, r * 0.05); g.fill(); } }
      // body
      g.fillStyle = d; g.beginPath(); g.ellipse(0, r * 0.08, r * 1.02, r * 0.98, 0, 0, 6.28); g.fill();
      g.fillStyle = c; g.beginPath();
      if (T.rock) { for (let i = 0; i < 9; i++) { const a = i / 9 * 6.283, q = r * (0.88 + 0.1 * Math.sin(i * 3.1)); g.lineTo(Math.cos(a) * q, Math.sin(a) * q); } g.closePath(); }
      else if (T.skull) g.ellipse(0, -r * 0.05, r * 0.85, r * 0.92, 0, 0, 6.28);
      else g.ellipse(0, 0, r * 0.97, r * 0.92 + Math.sin(t * 5) * r * 0.02, 0, 0, 6.28);
      g.fill();
      g.fillStyle = 'rgba(255,255,255,.18)'; g.beginPath(); g.ellipse(-r * 0.35, -r * 0.45, r * 0.3, r * 0.18, -0.5, 0, 6.28); g.fill();
      if (!T.skull && !T.rock) { g.fillStyle = 'rgba(255,255,255,.14)'; g.beginPath(); g.ellipse(0, r * 0.45, r * 0.55, r * 0.35, 0, 0, 6.28); g.fill(); }
      if (T.helm) { g.fillStyle = white ? '#fff' : '#8d99ae'; g.beginPath(); g.arc(0, -r * 0.3, r * 0.92, Math.PI * 1.08, Math.PI * 1.92); g.closePath(); g.fill(); g.fillStyle = white ? '#fff' : '#adb5bd'; g.fillRect(-r * 0.08, -r * 1.2, r * 0.16, r * 0.4); }
      // face
      const ey = -r * 0.12, eyes = T.eyes === 1 ? [0] : [-0.33, 0.33];
      for (const ex of eyes) {
        const er = r * (eyes.length === 1 ? 0.3 : 0.2);
        g.fillStyle = T.skull ? '#1b1830' : '#fff'; g.beginPath(); g.arc(ex * r, ey, er, 0, 6.28); g.fill();
        g.fillStyle = T.skull ? '#ff5d73' : '#1b1830'; g.beginPath(); g.arc(ex * r + lx * er * 0.4, ey + ly * er * 0.4, er * (T.skull ? 0.35 : 0.5), 0, 6.28); g.fill();
      }
      g.strokeStyle = '#1b1830'; g.lineWidth = r * 0.07; g.lineCap = 'round';
      for (const sd of eyes.length === 1 ? [-1, 1] : [-1, 1]) { const ex = eyes.length === 1 ? sd * r * 0.15 : sd * r * 0.33; g.beginPath(); g.moveTo(ex - sd * r * 0.15 - (eyes.length === 1 ? sd * r * 0.12 : 0), ey - r * 0.32); g.lineTo(ex + sd * r * 0.12, ey - r * 0.22 + sq * r * 0.1); g.stroke(); }
      // mouth
      const open = 0.12 + sq * 0.25;
      g.fillStyle = '#3a1020'; g.beginPath(); g.ellipse(0, r * 0.38, r * 0.38, r * open, 0, 0, 6.28); g.fill();
      if (T.teeth || T.skull) { g.fillStyle = '#fff'; for (let i = -2; i <= 2; i++) { g.beginPath(); g.moveTo(i * r * 0.13 - r * 0.05, r * 0.38 - r * open * 0.9); g.lineTo(i * r * 0.13 + r * 0.05, r * 0.38 - r * open * 0.9); g.lineTo(i * r * 0.13, r * 0.38 - r * open * 0.2); g.fill(); } }
      if (T.tusks) { g.fillStyle = white ? '#fff' : '#fffbe6'; for (const sd of [-1, 1]) { g.beginPath(); g.moveTo(sd * r * 0.3, r * 0.42); g.quadraticCurveTo(sd * r * 0.42, r * 0.1, sd * r * 0.28, -r * 0.02); g.lineTo(sd * r * 0.2, r * 0.42); g.fill(); } }
    }
    // armour plates
    for (const p of M.plates) if (p.hp > 0) {
      const px = Math.cos(p.a) * r * 0.75, py = Math.sin(p.a) * r * 0.75;
      g.save(); g.translate(px, py); g.rotate(p.a + Math.PI / 2);
      g.fillStyle = p.flash > 0.4 ? '#fff' : '#8d99ae'; rr(g, -r * 0.18, -r * 0.14, r * 0.36, r * 0.28, 6); g.fill();
      g.strokeStyle = '#495057'; g.lineWidth = 3; g.stroke();
      g.fillStyle = '#dee2e6'; for (const q of [-1, 1]) { g.beginPath(); g.arc(q * r * 0.14, -r * 0.09, 3, 0, 6.28); g.fill(); }
      if (p.hp < p.max * 0.66) { g.strokeStyle = '#212529'; g.lineWidth = 2; g.beginPath(); g.moveTo(-r * 0.12, -r * 0.15); g.lineTo(0, 0); g.lineTo(-r * 0.05, r * 0.15); if (p.hp < p.max * 0.33) { g.moveTo(0, 0); g.lineTo(r * 0.15, r * 0.05); } g.stroke(); }
      g.restore();
    }
    // fire
    if (M.burn > 0) for (let i = 0; i < 6; i++) { const a = i * 1.05 + t * 2, fx = Math.cos(a) * r * 0.6, fy = r * 0.1 + Math.sin(a) * r * 0.3, h = 16 + Math.sin(t * 20 + i) * 6; g.fillStyle = 'rgba(255,159,28,.85)'; g.beginPath(); g.moveTo(fx - 7, fy); g.quadraticCurveTo(fx, fy - h * 2, fx + 7, fy); g.fill(); g.fillStyle = 'rgba(255,224,102,.9)'; g.beginPath(); g.moveTo(fx - 3, fy); g.quadraticCurveTo(fx, fy - h, fx + 3, fy); g.fill(); }
    // shield bubble
    if (M.shield > 0) {
      const a = 0.35 + 0.15 * Math.sin(t * 12);
      g.fillStyle = `rgba(142,202,230,${a * 0.5})`; g.strokeStyle = `rgba(189,224,254,${a + 0.3})`; g.lineWidth = 5;
      g.beginPath(); g.arc(0, 0, r * 1.35, 0, 6.28); g.fill(); g.stroke();
      g.lineWidth = 2; for (let i = 0; i < 6; i++) { const an = i / 6 * 6.283 + t; g.beginPath(); g.arc(Math.cos(an) * r * 0.7, Math.sin(an) * r * 0.7, r * 0.35, 0, 6.28); g.stroke(); }
    }
    g.restore();
  }
  function drawLich(g, r, c, d, white, t, lx, ly) {
    // robe
    g.fillStyle = d; g.beginPath(); g.moveTo(-r * 1.1, r * 1.1); g.quadraticCurveTo(-r * 0.9, -r * 0.2, 0, -r * 0.4); g.quadraticCurveTo(r * 0.9, -r * 0.2, r * 1.1, r * 1.1);
    for (let i = 0; i <= 6; i++) g.lineTo(r * 1.1 - i * r * 2.2 / 6, r * 1.1 + (i % 2 ? -r * 0.15 : 0)); g.fill();
    g.fillStyle = c; g.beginPath(); g.moveTo(-r * 0.75, r * 1); g.quadraticCurveTo(-r * 0.6, 0, 0, -r * 0.2); g.quadraticCurveTo(r * 0.6, 0, r * 0.75, r * 1); g.fill();
    // glow
    const gl = g.createRadialGradient(0, -r * 0.3, 4, 0, -r * 0.3, r * 1.4); gl.addColorStop(0, 'rgba(126,255,190,.25)'); gl.addColorStop(1, 'rgba(126,255,190,0)'); g.fillStyle = gl; g.beginPath(); g.arc(0, -r * 0.3, r * 1.4, 0, 6.28); g.fill();
    // skull
    g.fillStyle = white ? '#fff' : '#e9e4d4'; g.beginPath(); g.ellipse(0, -r * 0.35, r * 0.55, r * 0.6, 0, 0, 6.28); g.fill();
    g.fillRect(-r * 0.3, -r * 0.05, r * 0.6, r * 0.3);
    g.fillStyle = '#1b1830'; for (const sd of [-1, 1]) { g.beginPath(); g.ellipse(sd * r * 0.22, -r * 0.4, r * 0.15, r * 0.18, 0, 0, 6.28); g.fill(); }
    g.fillStyle = '#7effbe'; for (const sd of [-1, 1]) { g.beginPath(); g.arc(sd * r * 0.22 + lx * 4, -r * 0.4 + ly * 4, r * 0.07 + Math.sin(t * 8) * 1.5, 0, 6.28); g.fill(); }
    g.fillStyle = '#1b1830'; g.beginPath(); g.moveTo(0, -r * 0.25); g.lineTo(-r * 0.06, -r * 0.12); g.lineTo(r * 0.06, -r * 0.12); g.fill();
    for (let i = -2; i <= 2; i++) g.fillRect(i * r * 0.11 - 2, r * 0.02, 3, r * 0.2);
    // crown
    g.fillStyle = white ? '#fff' : '#ffd166'; g.beginPath(); g.moveTo(-r * 0.5, -r * 0.82);
    for (let i = 0; i <= 4; i++) { g.lineTo(-r * 0.5 + i * r * 0.25, -r * (i % 2 ? 1.05 : 1.3)); } g.lineTo(r * 0.5, -r * 0.82); g.closePath(); g.fill();
    g.fillStyle = '#ff5d73'; g.beginPath(); g.arc(0, -r * 0.95, r * 0.07, 0, 6.28); g.fill();
  }
  function drawFace(g, who, x, y, r) {
    g.save(); g.translate(x, y);
    const skin = '#f2c6a0';
    if (who === 'berserker') {
      g.fillStyle = skin; g.beginPath(); g.arc(0, 0, r * 0.65, 0, 6.28); g.fill();
      g.fillStyle = '#c1440e'; g.beginPath(); g.moveTo(-r * 0.62, r * 0.05); g.quadraticCurveTo(0, r * 1.45, r * 0.62, r * 0.05); g.quadraticCurveTo(0, r * 0.5, -r * 0.62, r * 0.05); g.fill();
      g.fillStyle = '#8d99ae'; g.beginPath(); g.arc(0, -r * 0.2, r * 0.68, Math.PI, 0); g.fill();
      g.fillStyle = '#f1e3c8'; for (const s of [-1, 1]) { g.beginPath(); g.moveTo(s * r * 0.55, -r * 0.4); g.quadraticCurveTo(s * r * 1.2, -r * 0.6, s * r * 1.05, -r * 1.2); g.quadraticCurveTo(s * r * 0.9, -r * 0.7, s * r * 0.4, -r * 0.65); g.fill(); }
      g.fillStyle = '#222'; g.beginPath(); g.arc(-r * 0.24, -r * 0.02, 3, 0, 6.28); g.arc(r * 0.24, -r * 0.02, 3, 0, 6.28); g.fill();
      g.strokeStyle = '#222'; g.lineWidth = 2.5; g.beginPath(); g.moveTo(-r * 0.4, -r * 0.18); g.lineTo(-r * 0.1, -r * 0.08); g.moveTo(r * 0.4, -r * 0.18); g.lineTo(r * 0.1, -r * 0.08); g.stroke();
    } else if (who === 'battlemage') {
      g.fillStyle = skin; g.beginPath(); g.arc(0, r * 0.1, r * 0.6, 0, 6.28); g.fill();
      g.fillStyle = '#eee'; g.beginPath(); g.moveTo(-r * 0.5, r * 0.25); g.quadraticCurveTo(0, r * 1.4, r * 0.5, r * 0.25); g.fill();
      g.fillStyle = '#3a56c5'; g.beginPath(); g.moveTo(-r * 0.95, -r * 0.1); g.quadraticCurveTo(0, -r * 0.35, r * 0.95, -r * 0.1); g.lineTo(r * 0.15, -r * 1.35); g.lineTo(-r * 0.3, -r * 0.4); g.closePath(); g.fill();
      g.fillStyle = '#ffd166'; g.font = `900 ${r * 0.5}px system-ui`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('★', 0, -r * 0.55);
      g.fillStyle = '#90e0ef'; g.beginPath(); g.arc(-r * 0.22, r * 0.08, 4, 0, 6.28); g.arc(r * 0.22, r * 0.08, 4, 0, 6.28); g.fill();
    } else {
      g.fillStyle = '#2b2d42'; g.beginPath(); g.moveTo(0, -r * 1.1); g.quadraticCurveTo(r * 1.0, -r * 0.6, r * 0.8, r * 0.9); g.lineTo(-r * 0.8, r * 0.9); g.quadraticCurveTo(-r * 1.0, -r * 0.6, 0, -r * 1.1); g.fill();
      g.fillStyle = skin; g.beginPath(); g.ellipse(0, r * 0.05, r * 0.48, r * 0.55, 0, 0, 6.28); g.fill();
      g.fillStyle = '#5c677d'; g.fillRect(-r * 0.5, r * 0.15, r, r * 0.4);
      g.fillStyle = '#ffd166'; g.beginPath(); g.ellipse(-r * 0.2, -r * 0.05, 5, 3, 0, 0, 6.28); g.ellipse(r * 0.2, -r * 0.05, 5, 3, 0, 0, 6.28); g.fill();
    }
    g.restore();
  }

  function baseStats(who) {
    const s = { dmg: 3, swing: 0.32, crit: 0.04, critMul: 2.5, magnet: 40, life: 3.6, value: 1, extra: 0, gem: 0.005, gemKill: 0.12, st: 8, drain: 1, refill: 1.5,
      skip: 0, fire: 0, burn: 0.6, chain: 0, storm: 0, rage: 0, blast: 0, chargeT: 1.2, stackCrit: 0, stackMul: 0 };
    if (who === 'berserker') { s.swing = 0.25; s.rage = 1; }
    if (who === 'battlemage') { s.dmg = 2.6; s.swing = 0.36; s.blast = 12; }
    if (who === 'rogue') { s.dmg = 2.4; s.crit = 0.18; s.stackCrit = 0.06; s.stackMul = 0.4; }
    return s;
  }

  window.BonkKnight = { NODES, LICH_HP, hpFor, coinFor, gimmicks, baseStats, createRun };
  Kit.game({
    id: 'bonk-knight', title: 'Bonk Knight', tagline: 'Bonk the monster on every floor of the tower, sweep up the loot it spills, and climb until you run out of breath.',
    howTo: 'Tap or hold on the monster to bonk it. Swipe over coins on the floor before they fade. Spend coins on the upgrade map between climbs.', runVerb: 'Climb!', winTitle: 'The Lich King falls!', loseTitle: 'Out of breath',
    colors: { accent: '#ffd166', bg: '#15121f', card: '#26213a' },
    currencies: [{ id: 'coins', name: 'coins', color: '#ffd166' }, { id: 'gems', name: 'gems', color: '#e0aaff' }],
    characters: [
      { id: 'berserker', name: 'Hilda the Berserker', blurb: 'Fast swings. Hits harder the more out of breath she is.', unlock: 0 },
      { id: 'battlemage', name: 'Orrin the Battlemage', blurb: 'Hold on the monster to charge a huge arcane blast.', unlock: 1 },
      { id: 'rogue', name: 'Vex the Rogue', blurb: 'Crit chains: each crit in a row makes the next likelier and harder.', unlock: 2 },
    ],
    drawFace, nodes: NODES, touchOffset: 0, hoverIsDown: false,
    baseStats, createRun,
  });
  document.body.dataset.ready = '1';
})();
