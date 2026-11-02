// Starfall Battery: hold and drag to pour plasma pellets from the reactor through moving multiplier gates and bounce pads;
// every pellet that reaches the collector becomes a turret shot fired up at the alien waves. Run ends when the shield breaks.
// Plugs into the Pocket Prototypes kit (see ../README.md). Structure follows ore-sweeper/game.js.
(function () {
  'use strict';
  const TAU = 6.283;
  const NODES = [
    { id: 'core', name: 'Reactor Output', icon: '⚛️', desc: '+25% plasma recharge, bigger tank', cost: 5, grow: 1.68, max: 10, req: [], x: 0, y: 0, fx: (s, l) => { s.regen *= 1.25 ** l; s.cap *= 1.15 ** l; s.flow *= 1.12 ** l; } },
    { id: 'gun', name: 'Turret Damage', icon: '🔫', desc: '+30% shot damage', cost: 11, grow: 1.74, max: 12, req: ['core'], x: 0, y: -1, fx: (s, l) => { s.dmg *= 1.3 ** l; } },
    { id: 'shield', name: 'Shield Cells', icon: '🛡️', desc: '+1 shield', cost: 14, grow: 1.79, max: 6, req: ['core'], x: 0, y: 1, fx: (s, l) => { s.shield += l; } },
    { id: 'wide', name: 'Wide Gates', icon: '↔️', desc: 'Multiplier gates 20% wider', cost: 17, grow: 1.79, max: 6, req: ['core'], x: 1, y: 0, fx: (s, l) => { s.gateW *= 1.2 ** l; } },
    { id: 'gate', name: 'Extra Gate', icon: '🚪', desc: '+1 moving multiplier gate lower in the machine', cost: 42, grow: 2.91, max: 3, req: ['wide'], x: 2, y: 0, fx: (s, l) => { s.gates += l; } },
    { id: 'tier', name: 'Gate Tier', icon: '✖️', desc: 'All gates upgrade: x2 → x3 → x5', cost: 196, grow: 3.58, max: 2, req: ['gate'], x: 3, y: 0, fx: (s, l) => { s.mult = [2, 3, 5][l]; } },
    { id: 'glide', name: 'Gate Glide', icon: '〰️', desc: 'Gates sweep 25% faster, crossing more of the stream', cost: 28, grow: 2.02, max: 4, req: ['wide'], x: 2, y: -1, fx: (s, l) => { s.gateSpeed *= 1.25 ** l; } },
    { id: 'pad', name: 'Bounce Pad', icon: '🦘', desc: '+1 trampoline that kicks pellets back up through the gates', cost: 21, grow: 2.58, max: 3, req: ['core'], x: -1, y: 0, fx: (s, l) => { s.pads += l; } },
    { id: 'spring', name: 'Springy Pads', icon: '🌀', desc: 'Each pellet can bounce +1 more time', cost: 63, grow: 2.69, max: 3, req: ['pad'], x: -2, y: 0, fx: (s, l) => { s.padBounce += l; } },
    { id: 'burst', name: 'Capacitor', icon: '🔋', desc: 'Taps release +3 pellets; +20% tank', cost: 14, grow: 1.9, max: 5, req: ['core'], x: -1, y: 1, fx: (s, l) => { s.burst += 3 * l; s.cap *= 1.2 ** l; } },
    { id: 'salvage', name: 'Salvage Crew', icon: '🧲', desc: '+25% credits per kill', cost: 28, grow: 1.9, max: 8, req: ['gun'], x: -1, y: -1, fx: (s, l) => { s.salvage *= 1 + 0.25 * l; } },
    { id: 'pierce', name: 'Piercing Rounds', icon: '📌', desc: 'Shots punch through +1 alien', cost: 84, grow: 2.8, max: 3, req: ['gun'], x: 0, y: -2, fx: (s, l) => { s.pierce += l; s.beamW += 10 * l; } },
    { id: 'scan', name: 'Core Scanner', icon: '📡', desc: 'More golden elites, and they drop cores more often', cost: 49, grow: 2.13, max: 5, req: ['shield'], x: 1, y: 1, fx: (s, l) => { s.elite += 0.03 * l; s.coreDrop += 0.1 * l; } },
    { id: 'boom', name: 'Explosive Pellets', icon: '💥', desc: '+8% of pellets become explosive shots', cost: 2, grow: 1.9, max: 5, req: ['tier'], x: 4, y: 0, cur: 'cores', fx: (s, l) => { s.explode += 0.08 * l; } },
    { id: 'split', name: 'Splitting Pellets', icon: '🧬', desc: '+10% chance a pellet splits in two on its first peg', cost: 2, grow: 1.9, max: 5, req: ['spring'], x: -3, y: 0, cur: 'cores', fx: (s, l) => { s.split += 0.1 * l; } },
    { id: 'rail', name: 'Railgun Coils', icon: '⚡', desc: '+50% shot damage', cost: 3, grow: 2.02, max: 4, req: ['pierce'], x: 0, y: -3, cur: 'cores', fx: (s, l) => { s.dmg *= 1.5 ** l; } },
    { id: 'aegis', name: 'Aegis Field', icon: '💠', desc: '+3 shield and the shield slowly recharges', cost: 3, grow: 2.02, max: 4, req: ['salvage'], x: -1, y: -2, cur: 'cores', fx: (s, l) => { s.shield += 3 * l; s.shieldRegen += 0.06 * l; } },
    { id: 'ace', who: 'corvette', name: 'Overcharge', icon: '🚀', desc: 'Taps release +2 pellets, +15% damage', cost: 56, grow: 2.13, max: 5, req: ['gun'], x: 1, y: -1, fx: (s, l) => { s.burst += 2 * l; s.dmg *= 1.15 ** l; } },
    { id: 'hangar', who: 'carrier', name: 'Hangar Bay', icon: '🛸', desc: 'More drones launch, and they fly longer', cost: 56, grow: 2.13, max: 5, req: ['gun'], x: 1, y: -1, fx: (s, l) => { s.drone += 0.02 * l; s.droneLife += 2 * l; } },
    { id: 'focus', who: 'lancer', name: 'Focusing Lens', icon: '🔭', desc: 'Beam +12 wide, +20% beam damage', cost: 56, grow: 2.13, max: 5, req: ['gun'], x: 1, y: -1, fx: (s, l) => { s.beamW += 12 * l; s.dmg *= 1.2 ** l; } },
    { id: 'mother', name: 'Summon the Mothership', icon: '👾', desc: 'Your next run draws out the alien Mothership. Destroy it to win.', cost: 2000, grow: 1, max: 1, req: ['boom', 'split', 'rail', 'aegis'], reqAll: 3, extra: { cores: 10 }, x: 0, y: -4, win: true },
  ];

  const BOSS_HP = 6e6, CAP = 300, G = 950;
  const hpAt = (t) => 2 * 1.075 ** t * (1 + t / 20) * 1.16 ** Math.max(0, t - 26); // late waves outscale any build

  function createRun(env) {
    const s = env.stats, W = env.W, H = env.H, fx = env.fx, sfx = env.sfx, rnd = Math.random;
    const SP = Math.round(H * 0.4), MY = SP, MH = H - SP;
    const shieldY = SP - 44, railY = MY + 18;
    const slotY = [0.2, 0.38, 0.56, 0.72].map((f) => MY + MH * f);
    const padY = MY + MH * 0.85, binY = H - 30, PR = 3.6, PEGR = 4.5, HIT2 = (PR + PEGR) ** 2;
    const pegs = [];
    [0.29, 0.47, 0.645].forEach((f, i) => { const n = i % 2 ? 5 : 6; for (let k = 0; k < n; k++) pegs.push({ x: W * (k + (i % 2 ? 1 : 0.5)) / 6, y: MY + MH * f, hit: 0 }); });
    const MULC = { 2: '#4cc9f0', 3: '#80ed99', 5: '#f72585' };
    const gates = Array.from({ length: Math.min(4, s.gates) }, (_, i) => ({ y: slotY[i], w: Math.min(W * 0.7, s.gateW), sp: (0.6 + 0.13 * i) * s.gateSpeed * (i % 2 ? -1 : 1), ph: i * 1.9, x: W / 2, flash: 0, mult: s.mult }));
    for (const g of gates) g.amp = Math.max(0, (W - g.w) / 2 - 10);
    const npads = Math.min(4, s.pads), padXs = [[], [0.5], [0.28, 0.72], [0.18, 0.5, 0.82], [0.14, 0.38, 0.62, 0.86]][npads];
    const pads = padXs.map((f) => ({ x: W * f, w: 56, sq: 0 }));
    const stars = Array.from({ length: 70 }, () => ({ x: rnd() * W, y: rnd() * SP, s: rnd() * 1.6 + 0.3, v: 6 + rnd() * 20 }));
    const R = { t: 0, over: false, won: false, dying: 0, charge: s.cap, emitAcc: 0, rx: W / 2, pellets: [], overflow: 0, overEx: 0,
      ammo: 0, ammoEx: 0, fireT: 0, turret: 0, recoil: [0, 0, 0], shots: [], aliens: [], spawnAcc: 0.6, waveT: 8, shield: s.shield, shieldFlash: 0,
      gates, cr: 0, cores: 0, kills: 0, peak: 0, chain: 1, made: 0, beam: 0, beamT: 0, beams: [], drones: [], pulses: [], touched: false, boss: null, bossT: 0, in: null };
    if (env.boss) { R.boss = { kind: 'boss', x: W / 2, y: 64 + Math.min(W * 0.2, 80) * 0.5, r: Math.min(W * 0.2, 80), hp: BOSS_HP, max: BOSS_HP, sp: 2.8, dmg: 999, val: 400, inc: 0, hitT: -1, wob: 0 }; R.aliens.push(R.boss); }

    function emit() {
      if (R.charge < 1) return false;
      R.charge -= 1;
      const p = { x: R.rx + (rnd() - 0.5) * 6, y: railY + 10, vx: (rnd() - 0.5) * 50, vy: 80, ex: rnd() < s.explode, b: 0, pass: 0, age: 0, sp: false, m: 1 };
      if (R.pellets.length < CAP) R.pellets.push(p); else addOverflow(p.ex, 1);
      return true;
    }
    function addOverflow(ex, n) { if (ex) R.overEx += n; else R.overflow += n; }
    function collect(p) {
      if (p.m > R.chain) R.chain = p.m;
      load(p.ex, 1);
      if (s.drone && rnd() < s.drone && R.drones.length < 10) { R.drones.push({ life: s.droneLife, a: rnd() * TAU, fireT: 0.2 }); sfx.zap(); }
      if (R.pulses.length < 24) R.pulses.push({ side: p.x < W / 2 ? 0 : 1, t: 0, ex: p.ex });
    }
    function load(ex, n) {
      if (s.beam) R.beam += n * (ex ? 1.6 : 1);
      else if (ex) R.ammoEx += n; else R.ammo += n;
    }
    function pick() {
      let best = null;
      for (const a of R.aliens) if (!a.dead && a.inc < a.hp && (!best || a.y > best.y)) best = a;
      if (!best) for (const a of R.aliens) if (!a.dead && (!best || a.y > best.y)) best = a;
      return best;
    }
    function shoot(x, y, dmg, ex, pierce, kind) {
      const tg = pick(); if (!tg) return false;
      const dx = tg.x - x, dy = tg.y - y, d = Math.hypot(dx, dy) || 1, v = 1050;
      tg.inc += dmg;
      R.shots.push({ x, y, vx: dx / d * v, vy: dy / d * v, dmg, ex, pierce, tg, last: null, kind, pw: Math.min(4, 1 + Math.log2(1 + dmg / s.dmg) * 0.6) });
      return true;
    }
    function hitAlien(a, d) {
      if (a.dead) return;
      a.hp -= d; a.hitT = R.t;
      if (a.hp <= 0) kill(a);
    }
    function kill(a) {
      a.dead = true; R.kills++;
      const v = a.val * s.salvage * (1 + R.t / 60); R.cr += v;
      const col = a.kind === 'elite' ? ['#ffd166', '#fff3b0'] : a.kind === 'brute' ? ['#c77dff', '#e0aaff'] : a.kind === 'boss' ? ['#ff4d6d', '#ffd166', '#fff'] : ['#80ed99', '#b7efc5'];
      fx.burst(a.x, a.y, a.kind === 'boss' ? 60 : a.kind === 'brute' ? 14 : 8, col, a.kind === 'boss' ? 320 : 170);
      fx.text(a.x, a.y - 6, '+' + env.fmt(v), '#ffe8b0', 14);
      sfx.pop(a.kind === 'brute' ? 0.6 : 1.2);
      if (a.kind === 'elite' && rnd() < s.coreDrop) { R.cores++; sfx.ding(); fx.text(a.x, a.y - 26, '+1 core', '#ff9ef0', 17); }
      if (a.kind === 'brute') fx.shake = Math.max(fx.shake, 3);
      if (a.kind === 'boss') { R.won = true; R.cores += 5; fx.shake = 16; sfx.boom(); fx.ring(a.x, a.y, 200, '#ffd166'); R.dying = 0.01; }
    }
    function explode(x, y, d) {
      fx.ring(x, y, 46, '#ff9f1c'); sfx.crack();
      for (const a of R.aliens) if (!a.dead && Math.hypot(a.x - x, a.y - y) < 46 + a.r) hitAlien(a, d);
    }
    function spawn(kind, x) {
      const t = R.t, hp = hpAt(t) * (R.boss ? 0.8 : 1);
      if (!kind) kind = rnd() < s.elite ? 'elite' : rnd() < Math.min(0.28, t / 110) ? 'brute' : 'drone';
      const k = { drone: [11, 1, 1, 1, 1], brute: [17, 4, 0.62, 2, 4], elite: [12, 2.5, 1.15, 1, 3] }[kind];
      const r = k[0];
      R.aliens.push({ kind, x: x ?? r + 8 + rnd() * (W - 2 * r - 16), y: 30 - r, r, hp: hp * k[1], max: hp * k[1], sp: (32 + t * 0.6 + rnd() * 8) * k[2], dmg: k[3], val: k[4], inc: 0, hitT: -1, wob: rnd() * TAU, dead: false });
    }

    function stepPellets(dt) {
      const P = R.pellets;
      for (let i = P.length - 1; i >= 0; i--) {
        const p = P[i], py = p.y;
        p.age += dt; p.vy = Math.min(720, p.vy + G * dt); p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 1 - 0.4 * dt;
        if (p.x < PR + 4) { p.x = PR + 4; p.vx = Math.abs(p.vx) * 0.6; } else if (p.x > W - PR - 4) { p.x = W - PR - 4; p.vx = -Math.abs(p.vx) * 0.6; }
        for (const g of pegs) {
          const dx = p.x - g.x, dy = p.y - g.y, d2 = dx * dx + dy * dy;
          if (d2 < HIT2 && d2 > 0.01) {
            const d = Math.sqrt(d2), nx = dx / d, ny = dy / d, vn = p.vx * nx + p.vy * ny;
            p.x = g.x + nx * (PR + PEGR); p.y = g.y + ny * (PR + PEGR);
            if (vn < 0) { p.vx -= 1.5 * vn * nx; p.vy -= 1.5 * vn * ny; }
            p.vx += (rnd() - 0.5) * 50; g.hit = 1;
            if (!p.sp) { p.sp = true; if (s.split && rnd() < s.split) { const c = { ...p, vx: -p.vx + (rnd() - 0.5) * 40 }; if (P.length < CAP) P.push(c); else addOverflow(c.ex, 1); } }
          }
        }
        for (let gi = 0; gi < gates.length; gi++) {
          const g = gates[gi], bit = 1 << gi;
          if (!(p.pass & bit) && py < g.y && p.y >= g.y && Math.abs(p.x - g.x) < g.w / 2) {
            p.pass |= bit; p.m = Math.min(9999, p.m * g.mult); g.flash = 1;
            const n = g.mult - 1; R.made += n;
            for (let k = 0; k < n; k++) {
              if (P.length < CAP) P.push({ ...p, vx: p.vx + (k - (n - 1) / 2 + (rnd() - 0.5)) * 70 + (k % 2 ? 30 : -30), vy: p.vy * (0.8 + rnd() * 0.2) });
              else addOverflow(p.ex, 1);
            }
            if (rnd() < 0.15) sfx.tone(600 + g.mult * 120 + rnd() * 80, 0.05, 'sine', 0.025);
          }
        }
        if (py < padY && p.y >= padY && p.b < s.padBounce) {
          for (const pd of pads) if (Math.abs(p.x - pd.x) < pd.w / 2) {
            p.y = padY; p.b++; p.pass = 0;
            p.vy = -Math.sqrt(2 * G * (padY - (MY + MH * 0.1))) * (0.85 + rnd() * 0.2); p.vx = (rnd() - 0.5) * 160 + (pd.x - W / 2) * -0.3;
            pd.sq = 1; if (rnd() < 0.2) sfx.pop(1.6);
            break;
          }
        }
        if (p.y >= binY || p.age > 9) { collect(p); P[i] = P[P.length - 1]; P.pop(); }
      }
    }

    return {
      get over() { return R.over; }, get t() { return R.t; }, R,
      update(dt, input) {
        R.in = { x: input.x, y: input.y, down: input.down };
        if (R.over) return;
        if (R.dying) { R.dying += dt; fx.update(dt); if (R.dying > 1.1) R.over = true; return; }
        R.t += dt;
        // reactor: follows the finger, taps burst, holding streams
        if (input.down || input.taps.length) R.touched = true;
        R.charge = Math.min(s.cap, R.charge + s.regen * dt);
        if (input.down) R.rx += (Math.max(20, Math.min(W - 20, input.x)) - R.rx) * Math.min(1, dt * 14);
        for (const tp of input.taps) { R.rx = Math.max(20, Math.min(W - 20, tp.x)); let n = 0; for (let i = 0; i < s.burst; i++) if (emit()) n++; if (n) sfx.zap(); }
        if (input.down) { R.emitAcc += s.flow * dt; while (R.emitAcc >= 1) { R.emitAcc -= 1; if (!emit()) { R.emitAcc = 0; break; } } }
        // gates & pads
        for (const g of gates) { g.x = W / 2 + Math.sin(R.t * g.sp + g.ph) * g.amp; g.flash = Math.max(0, g.flash - dt * 5); }
        for (const pd of pads) pd.sq = Math.max(0, pd.sq - dt * 6);
        for (const pg of pegs) pg.hit = Math.max(0, pg.hit - dt * 6);
        const sub = dt > 0.02 ? 2 : 1; for (let i = 0; i < sub; i++) stepPellets(dt / sub);
        R.peak = Math.max(R.peak, R.pellets.length);
        if (R.overflow || R.overEx) { load(false, R.overflow); load(true, R.overEx); R.overflow = R.overEx = 0; }
        for (const pu of R.pulses) pu.t += dt * 3; R.pulses = R.pulses.filter((p) => p.t < 1);
        // aliens
        const rate = (0.8 + 0.05 * R.t) * (R.boss ? 0.55 : 1);
        R.spawnAcc += rate * dt; while (R.spawnAcc >= 1) { R.spawnAcc -= 1; spawn(); }
        R.waveT -= dt; if (R.waveT <= 0) { R.waveT = 9; const n = 5; for (let i = 0; i < n; i++) spawn('drone', W * (i + 0.5) / n); }
        if (R.boss && !R.boss.dead) { R.bossT -= dt; if (R.bossT <= 0) { R.bossT = 1.4; spawn('drone', R.boss.x + (rnd() - 0.5) * R.boss.r); } }
        for (const a of R.aliens) {
          if (a.dead) continue;
          a.y += a.sp * dt; a.x += Math.sin(R.t * 1.6 + a.wob) * (a.kind === 'boss' ? 12 : 18) * dt;
          if (a.y + a.r * 0.6 >= shieldY) {
            a.dead = true; R.shield -= a.dmg; R.shieldFlash = 1; fx.shake = Math.max(fx.shake, a.dmg > 1 ? 9 : 6); sfx.hit(); sfx.crack();
            fx.burst(a.x, shieldY, 10, ['#4cc9f0', '#caf0f8'], 160); fx.text(a.x, shieldY - 14, '-' + Math.min(a.dmg, 99) + ' shield', '#ff8fa3', 15);
          }
        }
        R.shield = Math.min(s.shield, R.shield + s.shieldRegen * dt); R.shieldFlash = Math.max(0, R.shieldFlash - dt * 3);
        // turrets
        if (s.beam) {
          R.beamT += dt;
          const tg = R.beam > 0 && pick();
          if (tg && (R.beam * s.dmg * 0.9 >= tg.hp || R.beamT > 1.1 || R.beam > 400)) {
            const d = R.beam * s.dmg * 0.9, x = tg.x, w = s.beamW;
            for (const a of R.aliens) if (!a.dead && Math.abs(a.x - x) < w / 2 + a.r) hitAlien(a, d);
            R.beams.push({ x, w: w * Math.min(2, 0.8 + Math.log10(1 + R.beam) * 0.4), t: 0 }); R.beam = 0; R.beamT = 0; R.recoil[2] = 1;
            sfx.zap(); sfx.tone(180, 0.18, 'sawtooth', 0.05, 2.2); fx.shake = Math.max(fx.shake, 2);
          }
        } else {
          R.fireT -= dt;
          const q = R.ammo + R.ammoEx;
          if (!q || !R.aliens.some((a) => !a.dead)) R.fireT = Math.max(R.fireT, 0);
          while (R.fireT <= 0 && R.ammo + R.ammoEx > 0) {
            const tot = R.ammo + R.ammoEx, pw = Math.max(1, Math.ceil(tot / (s.rate * 0.5)));
            const ex = R.ammoEx > 0, n = Math.min(pw, ex ? R.ammoEx : R.ammo);
            const tx = W / 2 + (R.turret ? 50 : -50);
            if (!shoot(tx, SP - 30, n * s.dmg, ex, s.pierce, 0)) break;
            if (ex) R.ammoEx -= n; else R.ammo -= n;
            R.recoil[R.turret] = 1; R.turret ^= 1; R.fireT += 1 / s.rate;
            if (rnd() < 0.5) sfx.tone(1200 + rnd() * 300, 0.04, 'square', 0.018, 0.5);
          }
        }
        for (const d of R.drones) {
          d.life -= dt; d.a += dt * 0.9; d.x = W / 2 + Math.cos(d.a) * W * 0.36; d.y = shieldY - 50 + Math.sin(d.a * 2) * 22;
          d.fireT -= dt;
          if (d.fireT <= 0) { // drones also draw from the ammo queue, hitting harder than the turrets
            d.fireT = 0.3; const n = Math.max(0, Math.min(R.ammo, Math.ceil(R.ammo / (s.rate * 0.5))));
            if (shoot(d.x, d.y, s.dmg * (s.droneDmg + n * 1.6), false, 0, 1)) R.ammo -= n;
          }
        }
        R.drones = R.drones.filter((d) => d.life > 0);
        for (let i = 0; i < 3; i++) R.recoil[i] = Math.max(0, R.recoil[i] - dt * 8);
        for (const b of R.beams) b.t += dt; R.beams = R.beams.filter((b) => b.t < 0.3);
        // shots
        for (const sh of R.shots) {
          sh.x += sh.vx * dt; sh.y += sh.vy * dt;
          for (const a of R.aliens) {
            if (a.dead || a === sh.last || sh.done) continue;
            const dx = a.x - sh.x, dy = a.y - sh.y;
            if (dx * dx + dy * dy < (a.r + 5) ** 2) {
              hitAlien(a, sh.dmg); if (sh.ex) explode(sh.x, sh.y, sh.dmg * 0.8);
              if (sh.tg === a) { a.inc -= sh.dmg; sh.tg = null; }
              if (!a.dead || a.kind !== 'boss') fx.burst(sh.x, sh.y, 2, ['#caf0f8'], 80, 2);
              if (sh.pierce-- <= 0) sh.done = true; sh.last = a;
            }
          }
          if (sh.y < -20 || sh.x < -20 || sh.x > W + 20) sh.done = true;
          if (sh.done && sh.tg) { sh.tg.inc -= sh.dmg; sh.tg = null; }
        }
        R.shots = R.shots.filter((sh) => !sh.done);
        R.aliens = R.aliens.filter((a) => !a.dead);
        for (const st of stars) { st.y += st.v * dt; if (st.y > SP) { st.y = 0; st.x = rnd() * W; } }
        fx.update(dt);
        if (R.won) return;
        if (R.shield <= 0) { R.shield = 0; R.dying = 0.01; sfx.boom(); fx.shake = 14; fx.burst(W / 2, SP - 10, 40, ['#ff4d6d', '#ffd166', '#4cc9f0'], 280, 4); }
      },
      draw(g) {
        const sx = (rnd() - 0.5) * fx.shake, sy = (rnd() - 0.5) * fx.shake;
        g.save(); g.translate(sx, sy);
        // ---- space
        const bg = g.createLinearGradient(0, 0, 0, SP); bg.addColorStop(0, '#05051a'); bg.addColorStop(1, '#151040');
        g.fillStyle = bg; g.fillRect(-20, -20, W + 40, SP + 20);
        g.fillStyle = '#ffffff'; for (const st of stars) { g.globalAlpha = 0.3 + st.s * 0.35; g.fillRect(st.x, st.y, st.s, st.s * (1 + st.v / 14)); } g.globalAlpha = 1;
        for (const a of R.aliens) a.kind === 'boss' ? drawBoss(g, a, R.t) : drawAlien(g, a, R.t);
        for (const b of R.beams) {
          const q = 1 - b.t / 0.3; g.fillStyle = `rgba(247,37,133,${0.35 * q})`; g.fillRect(b.x - b.w / 2, 0, b.w, SP - 24);
          g.fillStyle = `rgba(255,220,240,${0.9 * q})`; g.fillRect(b.x - b.w * 0.18, 0, b.w * 0.36, SP - 24);
        }
        g.lineCap = 'round';
        for (const sh of R.shots) {
          g.strokeStyle = sh.kind ? '#b7efc5' : sh.ex ? '#ff9f1c' : '#7df9ff'; g.lineWidth = 2.2 * sh.pw;
          g.beginPath(); g.moveTo(sh.x, sh.y); g.lineTo(sh.x - sh.vx * 0.022, sh.y - sh.vy * 0.022); g.stroke();
          g.fillStyle = '#fff'; g.beginPath(); g.arc(sh.x, sh.y, 1.4 * sh.pw, 0, TAU); g.fill();
        }
        for (const d of R.drones) { g.save(); g.translate(d.x, d.y); g.fillStyle = '#80ed99'; g.beginPath(); g.moveTo(0, -8); g.lineTo(6, 5); g.lineTo(-6, 5); g.closePath(); g.fill(); g.fillStyle = '#fff'; g.fillRect(-1, -3, 2, 3); g.restore(); }
        // shield line
        const sf = R.shield / Math.max(1, s.shield), sc = sf > 0.5 ? '76,201,240' : sf > 0.25 ? '255,209,102' : '255,77,109';
        const sg = g.createLinearGradient(0, shieldY - 16, 0, shieldY + 6); sg.addColorStop(0, `rgba(${sc},0)`); sg.addColorStop(1, `rgba(${sc},${0.25 + R.shieldFlash * 0.4})`);
        g.fillStyle = sg; g.fillRect(0, shieldY - 16, W, 22);
        g.strokeStyle = `rgba(${sc},${0.7 + R.shieldFlash * 0.3})`; g.lineWidth = 2 + R.shieldFlash * 3; g.setLineDash([10, 6]); g.lineDashOffset = -R.t * 30;
        g.beginPath(); g.moveTo(0, shieldY); g.lineTo(W, shieldY); g.stroke(); g.setLineDash([]);
        // ---- machine
        const mg = g.createLinearGradient(0, MY, 0, H); mg.addColorStop(0, '#1d2433'); mg.addColorStop(1, '#0d1018');
        g.fillStyle = mg; g.fillRect(-20, MY, W + 40, MH + 20);
        g.strokeStyle = 'rgba(255,255,255,.04)'; g.lineWidth = 1;
        for (let y = MY + 20; y < H; y += 24) { g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); }
        // side conduits carrying loaded shots up to the turrets
        for (const side of [0, 1]) { const x = side ? W - 5 : 5; g.fillStyle = '#2b3550'; g.fillRect(x - 3, SP, 6, binY - SP + 6); }
        for (const pu of R.pulses) { const x = pu.side ? W - 5 : 5, y = binY - (binY - SP) * pu.t; g.fillStyle = pu.ex ? '#ff9f1c' : '#7df9ff'; g.beginPath(); g.arc(x, y, 3.5, 0, TAU); g.fill(); }
        // pegs
        for (const pg of pegs) { g.fillStyle = pg.hit ? '#fff' : '#5c6b8a'; g.beginPath(); g.arc(pg.x, pg.y, PEGR, 0, TAU); g.fill(); }
        // gates
        g.textAlign = 'center'; g.textBaseline = 'middle';
        for (const gt of gates) {
          const c = MULC[gt.mult] || '#4cc9f0', l = gt.x - gt.w / 2;
          g.globalAlpha = 0.18 + gt.flash * 0.35; g.fillStyle = c; g.fillRect(l, gt.y - 7, gt.w, 14); g.globalAlpha = 1;
          g.strokeStyle = c; g.lineWidth = 2; g.beginPath(); g.moveTo(l, gt.y); g.lineTo(l + gt.w, gt.y); g.stroke();
          g.fillStyle = c; rr(g, l - 4, gt.y - 10, 8, 20, 3); g.fill(); rr(g, l + gt.w - 4, gt.y - 10, 8, 20, 3); g.fill();
          g.font = `400 ${15 + gt.flash * 4}px "Lilita One", system-ui`; g.fillStyle = gt.flash > 0.3 ? '#fff' : c; g.fillText('x' + gt.mult, gt.x, gt.y - 17);
        }
        // pads
        for (const pd of pads) {
          const q = pd.sq, y = padY + q * 4;
          g.strokeStyle = '#6c757d'; g.lineWidth = 3; g.beginPath(); g.moveTo(pd.x - pd.w / 2 + 4, y); g.lineTo(pd.x - pd.w / 2 + 8, padY + 14); g.moveTo(pd.x + pd.w / 2 - 4, y); g.lineTo(pd.x + pd.w / 2 - 8, padY + 14); g.stroke();
          g.strokeStyle = q > 0.2 ? '#fff3b0' : '#ffb703'; g.lineWidth = 5; g.beginPath(); g.moveTo(pd.x - pd.w / 2, padY); g.quadraticCurveTo(pd.x, y + 8 * q, pd.x + pd.w / 2, padY); g.stroke();
        }
        // collector
        g.fillStyle = '#121826'; g.fillRect(0, binY, W, H - binY + 20);
        g.fillStyle = s.beam ? '#f72585' : '#7df9ff'; g.globalAlpha = 0.6; g.fillRect(0, binY, W, 3); g.globalAlpha = 1;
        g.font = '800 13px Nunito, system-ui'; g.fillStyle = '#a9b8d6';
        g.fillText(s.beam ? `BEAM CHARGE ${env.fmt(R.beam)}` : `AMMO ${env.fmt(R.ammo + R.ammoEx)}`, W / 2, binY + 15);
        // pellets (batched)
        drawPellets(g, false); drawPellets(g, true);
        // reactor rail + nozzle with charge ring
        g.strokeStyle = '#3a4766'; g.lineWidth = 4; g.beginPath(); g.moveTo(14, railY); g.lineTo(W - 14, railY); g.stroke();
        const cf = R.charge / s.cap, held = R.in?.down;
        const rg = g.createRadialGradient(R.rx, railY, 2, R.rx, railY, 26); rg.addColorStop(0, `rgba(125,249,255,${0.35 + cf * 0.4})`); rg.addColorStop(1, 'rgba(125,249,255,0)');
        g.fillStyle = rg; g.beginPath(); g.arc(R.rx, railY, 26, 0, TAU); g.fill();
        g.fillStyle = '#2b3550'; g.beginPath(); g.arc(R.rx, railY, 12, 0, TAU); g.fill();
        g.strokeStyle = cf < 0.15 ? '#ff4d6d' : '#7df9ff'; g.lineWidth = 3; g.beginPath(); g.arc(R.rx, railY, 12, -1.57, -1.57 + TAU * cf); g.stroke();
        g.fillStyle = held ? '#fff' : '#7df9ff'; g.beginPath(); g.arc(R.rx, railY, 5 + (held ? Math.sin(R.t * 30) : 0), 0, TAU); g.fill();
        // ship hull sitting on the divide
        drawShip(g, env.who, W / 2, SP, R.recoil, R.t);
        fx.draw(g);
        g.restore();
        // ---- HUD
        g.textAlign = 'left'; g.textBaseline = 'alphabetic';
        const bw = Math.min(150, W * 0.38);
        g.fillStyle = 'rgba(0,0,0,.5)'; rr(g, 14, 12, bw, 12, 6); g.fill();
        g.fillStyle = `rgb(${sc})`; rr(g, 14, 12, Math.max(0, bw * sf), 12, 6); g.fill();
        g.font = '800 13px Nunito, system-ui'; g.fillStyle = '#fff'; g.fillText(`Shield ${Math.ceil(R.shield)}`, 16, 40);
        g.textAlign = 'right'; g.font = '800 15px Nunito, system-ui'; g.fillStyle = '#ffd166';
        g.fillText(`${env.fmt(R.cr)} credits`, W - 14, 24);
        g.font = '800 13px Nunito, system-ui'; g.fillStyle = R.cores ? '#ff9ef0' : '#a9b8d6'; g.fillText(`${R.cores ? R.cores + ' cores · ' : ''}${Math.floor(R.t)}s`, W - 14, 42);
        if (R.pellets.length > 40) { g.fillStyle = R.pellets.length >= CAP ? '#ff9f1c' : '#7df9ff'; g.textAlign = 'right'; g.fillText(`${R.pellets.length}${R.pellets.length >= CAP ? ' MAX' : ''} pellets`, W - 14, MY + 44); }
        if (R.boss && !R.boss.dead) {
          g.textAlign = 'center'; g.fillStyle = '#ff4d6d'; g.font = '400 14px "Lilita One", system-ui'; g.fillText('MOTHERSHIP ' + env.fmt(R.boss.hp), W / 2, 50);
          const w = W - 80; g.fillStyle = 'rgba(0,0,0,.5)'; g.fillRect(40, 55, w, 7); g.fillStyle = '#ff4d6d'; g.fillRect(40, 55, w * Math.max(0, R.boss.hp / R.boss.max), 7);
        }
        // first-run hint
        const hintT = R.touched ? R.t - (R.firstTouch ??= R.t) : 0;
        if (!R.touched || (env.runNo <= 2 && hintT < 2.5)) {
          g.textAlign = 'center'; g.font = '800 19px Nunito, system-ui'; const a = 0.75 + Math.sin(R.t * 5) * 0.2;
          g.fillStyle = `rgba(255,255,255,${a})`;
          if (!R.touched) {
            g.fillText('Hold & drag to pour plasma', W / 2, MY + MH * 0.47);
            g.font = '800 14px Nunito, system-ui'; g.fillStyle = 'rgba(169,184,214,.9)'; g.fillText('Through the gates: more pellets = more shots', W / 2, MY + MH * 0.47 + 22);
            const fy = MY + MH * 0.47 + 50 + Math.sin(R.t * 4) * 6; g.fillStyle = 'rgba(255,255,255,.6)'; g.beginPath(); g.arc(W / 2 + Math.sin(R.t * 1.5) * 50, fy, 12, 0, TAU); g.fill();
          } else g.fillText(`Aim the stream through the x${gates[0].mult} gate!`, W / 2, MY + MH * 0.47);
        }
        if (R.dying && !R.won) { g.textAlign = 'center'; g.fillStyle = '#ff4d6d'; g.font = '400 34px "Lilita One", system-ui'; g.fillText('SHIELD DOWN', W / 2, SP * 0.55); }
      },
      result() {
        const lines = [`${R.kills} aliens downed in ${Math.round(R.t)}s`, `Peak ${R.peak} pellets in the machine · best chain x${R.chain >= 9999 ? '9999+' : R.chain}`];
        return R.won ? { won: true, earned: { credits: R.cr, cores: R.cores }, lines }
          : { won: false, title: 'Shield down', earned: { credits: R.cr, cores: R.cores }, lines };
      },
    };
    function drawPellets(g, ex) {
      const P = R.pellets;
      g.fillStyle = ex ? 'rgba(255,159,28,.28)' : 'rgba(125,249,255,.22)'; g.beginPath();
      for (const p of P) if (p.ex === ex) { g.moveTo(p.x + 6.5, p.y); g.arc(p.x, p.y, 6.5, 0, TAU); }
      g.fill();
      g.fillStyle = ex ? '#ffd29a' : '#d7fdff'; g.beginPath();
      for (const p of P) if (p.ex === ex) { g.moveTo(p.x + PR, p.y); g.arc(p.x, p.y, PR, 0, TAU); }
      g.fill();
    }
  }
  function rr(g, x, y, w, h, r) { g.beginPath(); g.roundRect ? g.roundRect(x, y, w, h, r) : g.rect(x, y, w, h); }

  function drawAlien(g, a, t) {
    const hit = Math.max(0, 1 - (t - a.hitT) * 9), r = a.r;
    const col = { drone: ['#38b000', '#80ed99'], brute: ['#7b2cbf', '#c77dff'], elite: ['#e09f3e', '#ffd166'] }[a.kind];
    g.save(); g.translate(a.x, a.y);
    g.fillStyle = hit ? '#fff' : col[0];
    g.beginPath(); g.arc(0, 0, r, Math.PI, 0); g.lineTo(r, r * 0.4);
    for (let i = 0; i < 4; i++) { const x0 = r - (i + 0.5) * (2 * r / 4); g.lineTo(x0, r * (0.55 + 0.25 * Math.sin(t * 8 + i + a.wob))); g.lineTo(x0 - r / 4, r * 0.4); }
    g.closePath(); g.fill();
    g.fillStyle = col[1]; g.beginPath(); g.arc(0, -r * 0.2, r * 0.55, Math.PI, 0); g.fill();
    g.fillStyle = '#111'; g.beginPath(); g.arc(-r * 0.32, 0, r * 0.15, 0, TAU); g.arc(r * 0.32, 0, r * 0.15, 0, TAU); g.fill();
    if (a.kind === 'elite') { g.strokeStyle = '#fff3b0'; g.lineWidth = 1.5; g.beginPath(); g.arc(0, 0, r + 4 + Math.sin(t * 6) * 1.5, 0, TAU); g.stroke(); }
    g.restore();
    if (a.hp < a.max) { g.fillStyle = 'rgba(0,0,0,.5)'; g.fillRect(a.x - r, a.y - r - 7, 2 * r, 3); g.fillStyle = '#ff4d6d'; g.fillRect(a.x - r, a.y - r - 7, 2 * r * Math.max(0, a.hp / a.max), 3); }
  }
  function drawBoss(g, B, t) {
    const hit = Math.max(0, 1 - (t - B.hitT) * 12), r = B.r;
    g.save(); g.translate(B.x + (Math.random() - 0.5) * hit * 3, B.y);
    const gl = g.createRadialGradient(0, 0, 4, 0, 0, r * 1.5); gl.addColorStop(0, 'rgba(255,77,109,.35)'); gl.addColorStop(1, 'rgba(255,77,109,0)');
    g.fillStyle = gl; g.beginPath(); g.arc(0, 0, r * 1.5, 0, TAU); g.fill();
    g.fillStyle = '#5a189a'; g.beginPath(); g.ellipse(0, r * 0.1, r * 1.25, r * 0.42, 0, 0, TAU); g.fill();
    g.fillStyle = '#ff4d6d'; g.beginPath(); g.arc(0, -r * 0.05, r * 0.55, Math.PI, 0); g.fill();
    for (let i = 0; i < 7; i++) { const x = -r + i * (2 * r / 6); g.fillStyle = (Math.floor(t * 6) + i) % 2 ? '#ffd166' : '#80ed99'; g.beginPath(); g.arc(x, r * 0.22, r * 0.07, 0, TAU); g.fill(); }
    g.fillStyle = '#111'; g.beginPath(); g.arc(-r * 0.2, -r * 0.2, r * 0.08, 0, TAU); g.arc(r * 0.2, -r * 0.2, r * 0.08, 0, TAU); g.fill();
    if (hit) { g.globalAlpha = 0.25 * hit; g.fillStyle = '#fff'; g.beginPath(); g.ellipse(0, r * 0.05, r * 1.25, r * 0.5, 0, 0, TAU); g.fill(); g.globalAlpha = 1; }
    g.restore();
  }
  function drawShip(g, who, x, y, rec, t) {
    g.save(); g.translate(x, y);
    const wide = who === 'carrier' ? 1.25 : who === 'lancer' ? 0.85 : 1;
    // turrets / cannon
    g.fillStyle = '#adb5bd';
    if (who === 'lancer') { g.fillRect(-7, -48 + rec[2] * 8, 14, 34); g.fillStyle = '#f72585'; g.fillRect(-4, -50 + rec[2] * 8, 8, 6); }
    else for (const [i, sx] of [[0, -50], [1, 50]]) { g.fillRect(sx - 4, -38 + rec[i] * 6, 8, 22); g.fillStyle = '#7df9ff'; g.fillRect(sx - 3, -40 + rec[i] * 6, 6, 4); g.fillStyle = '#adb5bd'; }
    g.fillStyle = '#495a7a'; g.beginPath(); g.moveTo(-95 * wide, 6); g.lineTo(-62 * wide, -22); g.lineTo(62 * wide, -22); g.lineTo(95 * wide, 6); g.lineTo(80 * wide, 12); g.lineTo(-80 * wide, 12); g.closePath(); g.fill();
    g.fillStyle = '#6c7fa6'; g.fillRect(-62 * wide, -22, 124 * wide, 5);
    for (const sx of [-50, 50]) { if (who === 'lancer') break; g.fillStyle = '#2b3550'; g.beginPath(); g.arc(sx, -18, 10, Math.PI, 0); g.fill(); }
    g.fillStyle = '#7df9ff'; g.globalAlpha = 0.7 + Math.sin(t * 3) * 0.2; g.beginPath(); g.ellipse(0, -14, 16, 7, 0, 0, TAU); g.fill(); g.globalAlpha = 1;
    if (who === 'carrier') { g.fillStyle = '#80ed99'; g.fillRect(-112, -6, 16, 6); g.fillRect(96, -6, 16, 6); }
    g.restore();
  }
  function drawFace(g, who, x, y, r) {
    g.save(); g.translate(x, y);
    g.fillStyle = '#151040'; g.beginPath(); g.arc(0, 0, r * 1.05, 0, TAU); g.fill();
    g.fillStyle = '#fff'; for (let i = 0; i < 6; i++) g.fillRect(Math.cos(i * 2.4) * r * 0.8, Math.sin(i * 1.7) * r * 0.8, 1.5, 1.5);
    if (who === 'corvette') {
      g.fillStyle = '#6c7fa6'; g.beginPath(); g.moveTo(0, -r * 0.8); g.lineTo(r * 0.55, r * 0.5); g.lineTo(0, r * 0.25); g.lineTo(-r * 0.55, r * 0.5); g.closePath(); g.fill();
      g.fillStyle = '#7df9ff'; g.beginPath(); g.ellipse(0, -r * 0.15, r * 0.12, r * 0.25, 0, 0, TAU); g.fill();
      g.fillStyle = '#ff9f1c'; g.beginPath(); g.moveTo(-r * 0.15, r * 0.35); g.lineTo(0, r * 0.75); g.lineTo(r * 0.15, r * 0.35); g.fill();
    } else if (who === 'carrier') {
      g.fillStyle = '#495a7a'; rr(g, -r * 0.75, -r * 0.25, r * 1.5, r * 0.6, 6); g.fill();
      g.fillStyle = '#7df9ff'; g.fillRect(-r * 0.2, -r * 0.42, r * 0.4, r * 0.2);
      g.fillStyle = '#80ed99'; for (const [dx, dy] of [[-0.55, -0.65], [0.55, -0.65], [0, -0.85]]) { g.beginPath(); g.moveTo(dx * r, dy * r - 6); g.lineTo(dx * r + 5, dy * r + 4); g.lineTo(dx * r - 5, dy * r + 4); g.fill(); }
    } else {
      g.fillStyle = 'rgba(247,37,133,.5)'; g.fillRect(-r * 0.12, -r * 1.05, r * 0.24, r * 0.75);
      g.fillStyle = '#adb5bd'; g.beginPath(); g.moveTo(0, -r * 0.45); g.lineTo(r * 0.3, r * 0.65); g.lineTo(-r * 0.3, r * 0.65); g.closePath(); g.fill();
      g.fillStyle = '#f72585'; g.beginPath(); g.arc(0, -r * 0.35, r * 0.12, 0, TAU); g.fill();
    }
    g.restore();
  }

  function baseStats(who) {
    const s = { regen: 3.5, cap: 12, flow: 14, burst: 4, gates: 1, mult: 2, gateW: 74, gateSpeed: 1, pads: 1, padBounce: 1,
      dmg: 1, pierce: 0, rate: 26, shield: 3, shieldRegen: 0, explode: 0, split: 0, salvage: 1, elite: 0.05, coreDrop: 0.35,
      drone: 0, droneDmg: 1, droneLife: 6, beam: false, beamW: 34 };
    if (who === 'corvette') { s.burst += 2; s.shield += 1; }
    if (who === 'carrier') { s.drone = 0.06; s.droneDmg = 2; }
    if (who === 'lancer') { s.beam = true; }
    return s;
  }

  const CONFIG = {
    id: 'starfall', title: 'Starfall Battery', tagline: 'Pour plasma through moving multiplier gates and bounce pads; every pellet that drops into the collector becomes a shot at the alien waves above.',
    howTo: 'Hold and drag in the machine to pour plasma from the reactor. Pellets through a gate multiply; pads bounce them back up. Each pellet in the collector fires a shot. Spend credits between runs.',
    runVerb: 'Launch!', winTitle: 'Mothership destroyed!', loseTitle: 'Shield down',
    colors: { accent: '#7df9ff', bg: '#0b0b1e', card: '#1a1a3a' },
    currencies: [{ id: 'credits', name: 'credits', color: '#ffd166' }, { id: 'cores', name: 'cores', color: '#ff9ef0' }],
    characters: [
      { id: 'corvette', name: 'Corvette', blurb: 'Balanced. Bigger tap bursts and an extra shield.', unlock: 0 },
      { id: 'carrier', name: 'Carrier', blurb: 'Some pellets also launch little fighter drones.', unlock: 1 },
      { id: 'lancer', name: 'Lancer', blurb: 'Pellets charge one big piercing beam instead of many shots.', unlock: 2 },
    ],
    drawFace, nodes: NODES, touchOffset: 0, baseStats, createRun,
  };
  window.Starfall = { NODES, BOSS_HP, CONFIG, createRun, baseStats };
  Kit.game(CONFIG);
})();
