// Void Drifter: a tiny Vampire Survivors in space. Drag anywhere to steer (virtual stick from where you touch),
// guns fire on their own at the nearest thing, salvage gets pulled in by your magnet, every few pickups = pick a boost.
// Plugs into the Pocket Prototypes kit (see ../README.md).
(function () {
  'use strict';
  const TAU = Math.PI * 2, rnd = Math.random;
  const BOSS_HP = 14000, BOSS_AT = 60;
  const CAP = { enemies: 60, bullets: 140, orbs: 90, parts: 260, ebullets: 70 };

  // ---------------------------------------------------------------- permanent tree
  const NODES = [
    { id: 'hull', name: 'Hull Plating', icon: '🛡️', desc: '+6 hull', cost: 7, grow: 1.5, max: 10, req: [], x: 0, y: 0, fx: (s, l) => { s.hull += 6 * l; } },
    { id: 'dmg', name: 'Hot Barrels', icon: '🔥', desc: '+20% damage', cost: 10, grow: 1.6, max: 10, req: ['hull'], x: 1, y: 0, fx: (s, l) => { s.dmg *= 1.2 ** l; } },
    { id: 'magnet', name: 'Tractor Beam', icon: '🧲', desc: '+30% magnet range', cost: 8, grow: 1.6, max: 6, req: ['hull'], x: -1, y: 0, fx: (s, l) => { s.magnet *= 1 + 0.3 * l; } },
    { id: 'armor', name: 'Armor', icon: '🧱', desc: 'Take 8% less damage', cost: 45, grow: 1.9, max: 5, req: ['hull'], x: 0, y: 1, fx: (s, l) => { s.armor += 0.08 * l; } },
    { id: 'rate', name: 'Coolant', icon: '❄️', desc: '+12% fire rate', cost: 24, grow: 1.65, max: 8, req: ['dmg'], x: 2, y: 0, fx: (s, l) => { s.rate *= 1.12 ** l; } },
    { id: 'wlvl', name: 'Weapon Mk', icon: '🔧', desc: 'Start each run with +1 weapon level', cost: 42, grow: 1.85, max: 5, req: ['dmg'], x: 2, y: -1, fx: (s, l) => { s.wlvl += l; } },
    { id: 'salv', name: 'Scrap Haulers', icon: '📦', desc: '+25% salvage banked', cost: 27, grow: 1.85, max: 8, req: ['magnet'], x: -1, y: -1, fx: (s, l) => { s.value *= 1 + 0.25 * l; } },
    { id: 'speed', name: 'Thrusters', icon: '🚀', desc: '+8% speed', cost: 18, grow: 1.6, max: 5, req: ['magnet'], x: -2, y: 0, fx: (s, l) => { s.speed *= 1.08 ** l; } },
    { id: 'blades', name: 'Orbit Blades', icon: '🌀', desc: 'Adds Orbit Blades to level-up picks', cost: 82, max: 1, req: ['dmg'], x: 1, y: -1, fx: (s) => { s.poolBlades = 1; } },
    { id: 'missiles', name: 'Seeker Pods', icon: '🎯', desc: 'Adds homing missiles to level-up picks', cost: 165, max: 1, req: ['wlvl'], x: 3, y: -1, fx: (s) => { s.poolMissiles = 1; } },
    { id: 'nova', name: 'Nova Core', icon: '💫', desc: 'Adds a shockwave pulse to level-up picks', cost: 120, max: 1, req: ['armor'], x: 0, y: 2, fx: (s) => { s.poolNova = 1; } },
    { id: 'over', name: 'Overcharge', icon: '⚡', desc: '+25% damage', cost: 3, grow: 1.8, max: 4, req: ['rate'], x: 3, y: 0, cur: 'shards', fx: (s, l) => { s.dmg *= 1.25 ** l; } },
    { id: 'regen', name: 'Nanites', icon: '🧬', desc: 'Hull repairs 0.2/s', cost: 3, grow: 1.8, max: 3, req: ['armor'], x: 1, y: 1, cur: 'shards', fx: (s, l) => { s.regen += 0.2 * l; } },
    { id: 'crate', name: 'Prep Crate', icon: '🎁', desc: 'Start each run with a free level-up', cost: 4, grow: 2.2, max: 2, req: ['armor'], x: -1, y: 1, cur: 'shards', fx: (s, l) => { s.headStart += l; } },
    { id: 'lens', name: 'Void Lens', icon: '🔮', desc: '+40% void shard drops', cost: 2, grow: 1.9, max: 4, req: ['salv'], x: -2, y: -1, cur: 'shards', fx: (s, l) => { s.shardLuck *= 1 + 0.4 * l; } },
    { id: 'waspsp', who: 'wasp', name: 'Stinger Rounds', icon: '🐝', desc: 'Pulse bolts pierce +1 and fire 8% faster', cost: 52, grow: 1.9, max: 5, req: ['hull'], x: 0, y: -1, fx: (s, l) => { s.pierce += l; s.rate *= 1.08 ** l; } },
    { id: 'bulsp', who: 'bulwark', name: 'Reactive Plating', icon: '🪖', desc: 'Getting hit blasts flak all around; +4 hull', cost: 52, grow: 1.9, max: 5, req: ['hull'], x: 0, y: -1, fx: (s, l) => { s.reactive += l; s.hull += 4 * l; } },
    { id: 'phasp', who: 'phantom', name: 'Phase Rift', icon: '👻', desc: 'Blink recharges 15% faster and leaves a damaging rift', cost: 52, grow: 1.9, max: 5, req: ['hull'], x: 0, y: -1, fx: (s, l) => { s.blinkCD *= 0.85 ** l; s.rift += l; } },
    { id: 'lure', name: 'Leviathan Lure', icon: '🐉', desc: 'Your next run, the Void Leviathan arrives at 60s. Destroy it to win.', cost: 8000, grow: 1, max: 1, req: ['blades', 'missiles', 'nova', 'over', 'lens', 'regen'], reqAll: 3, extra: { shards: 15 }, x: 0, y: -2, win: true },
  ];

  // ---------------------------------------------------------------- in-run level-up picks
  const PICKS = [
    { id: 'rate', icon: '⚡', name: 'Overdrive', desc: '+20% fire rate', ok: () => true, take: (R) => { R.s.rate *= 1.2; } },
    { id: 'spread', icon: '🔱', name: 'Split Shot', desc: '+1 shot per volley', ok: (R) => R.s.spread < 4, take: (R) => { R.s.spread++; } },
    { id: 'dmg', icon: '💥', name: 'Hot Rounds', desc: '+25% damage', ok: () => true, take: (R) => { R.s.dmg *= 1.25; } },
    { id: 'main', icon: '🔧', name: 'Weapon Mk+', desc: '+1 weapon level', ok: (R) => R.wp.main < 9, take: (R) => { R.wp.main++; } },
    { id: 'mag', icon: '🧲', name: 'Tractor', desc: '+40% magnet range', ok: (R) => R.s.magnet < 260, take: (R) => { R.s.magnet *= 1.4; } },
    { id: 'speed', icon: '🚀', name: 'Thrusters', desc: '+12% speed', ok: (R) => R.s.speed < 280, take: (R) => { R.s.speed *= 1.12; } },
    { id: 'repair', icon: '🛠️', name: 'Patch Hull', desc: 'Repair 40% hull, +4 max', ok: (R) => R.hp < R.s.hull * 0.8, take: (R) => { R.s.hull += 4; R.hp = Math.min(R.s.hull, R.hp + R.s.hull * 0.4); } },
    { id: 'blades', icon: '🌀', name: 'Orbit Blades', desc: '+1 blade circling your ship', w: 2, ok: (R) => R.s.poolBlades && R.wp.blades < 5, take: (R) => { R.wp.blades++; } },
    { id: 'missiles', icon: '🎯', name: 'Seeker Pod', desc: '+1 homing missile per salvo', w: 2, ok: (R) => R.s.poolMissiles && R.wp.missiles < 4, take: (R) => { R.wp.missiles++; } },
    { id: 'nova', icon: '💫', name: 'Nova Pulse', desc: 'Shockwave every few seconds (bigger)', w: 2, ok: (R) => R.s.poolNova && R.wp.nova < 4, take: (R) => { R.wp.nova++; } },
  ];

  const SHIPS = { wasp: { c: '#ffd166', c2: '#2b2d42', fl: '#ff9f1c' }, bulwark: { c: '#8ecae6', c2: '#ff9f1c', fl: '#ffb703' }, phantom: { c: '#c77dff', c2: '#72efdd', fl: '#72efdd' } };

  // ---------------------------------------------------------------- the run
  function createRun(env) {
    const s = Object.assign({}, env.stats), W = env.W, H = env.H, fx = env.fx, sfx = env.sfx;
    const who = env.who, SY = H * 0.4; // ship sits 40% down the screen: above the thumb
    const R = {
      s, t: 0, over: false, won: false, hp: s.hull, ship: { x: 0, y: 0, vx: 0, vy: 0, a: -Math.PI / 2 }, inv: 0,
      wp: { main: s.wlvl, blades: 0, missiles: 0, nova: 0 }, cd: { main: 0.3, missiles: 1, nova: 2 },
      enemies: [], bullets: [], ebullets: [], orbs: [], parts: [], beams: [], salv: 0, shards: 0, kills: 0, xp: 0, need: 7, picks: 0, pending: s.headStart,
      spawnT: 0.4, ringT: 12, anchor: null, wasDown: false, touchT: 0, blinked: false, blinkT: 0, hurtT: -9, ending: 0, boss: null, warned: false, steered: false,
      paused: false, choice: null, armT: 0, bladeA: 0, novaFx: [], shotSnd: 0, in: null,
    };
    const view = Math.hypot(W / 2, H * 0.6) + 40;
    const ship = R.ship;
    const storm = () => Math.max(0, (R.t - 75) / 15) ** 2, hpMul = () => (1 + R.t / 25 + (R.t / 40) ** 2) * (1 + storm()), dmgMul = () => 1 + R.t / 40 + storm(); // past ~75s the void storm turns lethal

    // ---- spawning
    function spawn(kind, x, y, size) {
      if (R.enemies.length >= CAP.enemies) return null;
      if (x == null) {
        // mostly spawn ahead of where you're flying, so running away runs into things
        const mv = Math.hypot(ship.vx, ship.vy), a = mv > 40 && rnd() < 0.65 ? Math.atan2(ship.vy, ship.vx) + (rnd() - 0.5) * 2 : rnd() * TAU;
        x = ship.x + Math.cos(a) * view; y = ship.y + Math.sin(a) * view;
      }
      const m = hpMul(), e = { k: kind, x, y, vx: 0, vy: 0, rot: rnd() * TAU, spin: (rnd() - 0.5) * 2, flash: 0, bladeCD: 0, shape: [] };
      if (kind === 'rock' || kind === 'crystal') {
        size = size || (rnd() < 0.5 ? 1 : rnd() < 0.6 ? 2 : 3);
        if (kind === 'crystal') size = 2;
        const T = [null, [13, 2, 1, 5], [20, 4.5, 2, 7], [30, 10, 3, 10]][size];
        Object.assign(e, { size, r: T[0], hp: T[1] * m * (kind === 'crystal' ? 1.4 : 1), val: T[2], dmg: T[3] });
        const a = Math.atan2(ship.y - y, ship.x - x) + (rnd() - 0.5) * 0.9, v = (40 + rnd() * 45) * (1 + R.t / 90) / Math.sqrt(size);
        e.vx = Math.cos(a) * v; e.vy = Math.sin(a) * v;
        for (let i = 0; i < 9; i++) e.shape.push(0.75 + rnd() * 0.3);
      } else if (kind === 'drone') Object.assign(e, { r: 12, hp: 3 * m, val: 2, dmg: 7, sp: 92 * (1 + R.t / 90) * (1 + storm() * 0.15) });
      else Object.assign(e, { r: 19, hp: 22 * m, val: 6, dmg: 12, sp: 70 * (1 + R.t / 150) });
      e.max = e.hp; e.dmg *= dmgMul(); R.enemies.push(e); return e;
    }
    function spawnWave() {
      const t = R.t, r = rnd();
      const pDrone = Math.min(0.45, t < 6 ? 0 : 0.12 + t / 150), pHunter = t < 30 ? 0 : Math.min(0.12, (t - 30) / 400);
      if (r < pHunter) spawn('hunter');
      else if (r < pHunter + pDrone) { const n = t > 45 && rnd() < 0.3 ? 3 : 1, a = rnd() * TAU; for (let i = 0; i < n; i++) spawn('drone', ship.x + Math.cos(a + i * 0.12) * view, ship.y + Math.sin(a + i * 0.12) * view); }
      else spawn(rnd() < 0.025 * s.shardLuck ? 'crystal' : 'rock');
    }
    for (let i = 0; i < 7; i++) { const a = rnd() * TAU, d = 190 + rnd() * 160; const e = spawn('rock', Math.cos(a) * d, Math.sin(a) * d, 1 + (i % 2)); if (e) { e.vx *= 0.5; e.vy *= 0.5; } }

    function spawnBoss() {
      const a = Math.atan2(ship.vy || -1, ship.vx || 0), x = ship.x + Math.cos(a) * view, y = ship.y + Math.sin(a) * view;
      const segs = []; for (let i = 0; i < 16; i++) segs.push({ x: x + Math.cos(a) * i * 24, y: y + Math.sin(a) * i * 24, r: i === 0 ? 30 : Math.max(11, 26 - i * 0.9), seg: true });
      R.boss = { hp: BOSS_HP, max: BOSS_HP, a: a + Math.PI, segs, fireT: 3, flash: 0 };
      sfx.boom(); fx.shake = 12; sfx.tone(55, 1.2, 'sawtooth', 0.12, 1.6);
    }

    // ---- particles (own: no gravity in space)
    function burst(x, y, n, cols, sp = 160, size = 3) {
      for (let i = 0; i < n && R.parts.length < CAP.parts; i++) { const a = rnd() * TAU, v = sp * (0.3 + rnd()); R.parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, t: 0, life: 0.35 + rnd() * 0.4, c: cols[i % cols.length], s: size * (0.6 + rnd() * 0.6) }); }
    }

    // ---- damage
    function hitE(e, d) {
      if (e.seg) { const B = R.boss; if (!B || B.hp <= 0) return; B.hp -= d; B.flash = 0.08; if (B.hp <= 0) killBoss(); return; }
      if (e.dead) return;
      e.hp -= d; e.flash = 0.08;
      if (e.hp <= 0) kill(e);
    }
    function drop(x, y, v, shard) {
      if (R.orbs.length >= CAP.orbs && !shard) { let best = R.orbs[0]; for (const o of R.orbs) if (!o.shard && Math.hypot(o.x - ship.x, o.y - ship.y) < Math.hypot(best.x - ship.x, best.y - ship.y)) best = o; best.v += v; return; }
      const a = rnd() * TAU, sp = 40 + rnd() * 60;
      R.orbs.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, v, shard, t: 0 });
    }
    function kill(e) {
      e.dead = true; R.kills++;
      const rockish = e.k === 'rock' || e.k === 'crystal';
      burst(e.x, e.y, rockish ? 6 + e.size * 3 : 10, e.k === 'crystal' ? ['#c77dff', '#e0aaff', '#fff'] : rockish ? ['#a8977f', '#d6c6a8', '#6b5e53'] : e.k === 'drone' ? ['#ff6b6b', '#ffd166', '#fff'] : ['#f72585', '#ff8fab', '#fff'], 150 + e.r * 3, rockish ? 3.5 : 3);
      if (rockish) sfx.crack(); else sfx.pop(e.k === 'hunter' ? 0.6 : 1.2);
      if (e.k === 'hunter') { fx.shake = Math.max(fx.shake, 5); fx.ring(e.x, e.y, 50, '#f72585'); }
      for (let v = e.val; v > 0; v -= 2) drop(e.x + (rnd() - 0.5) * 10, e.y + (rnd() - 0.5) * 10, Math.min(2, v), false);
      const sc = e.k === 'crystal' ? 1 : e.k === 'hunter' ? 0.3 * s.shardLuck : e.k === 'drone' ? 0.006 * s.shardLuck : 0;
      if (rnd() < sc) drop(e.x, e.y, 1, true);
      if (e.k === 'rock' && e.size === 3) for (let i = 0; i < 2; i++) { const n = spawn('rock', e.x + (rnd() - 0.5) * 20, e.y + (rnd() - 0.5) * 20, 1); if (n) { const a = rnd() * TAU; n.vx = Math.cos(a) * 70 + e.vx; n.vy = Math.sin(a) * 70 + e.vy; } }
    }
    function killBoss() {
      const B = R.boss; B.hp = 0; R.won = true; R.ending = 2; R.shards += 10; R.salv += 120;
      sfx.boom(); setTimeout(() => sfx.boom(), 250); fx.shake = 18;
      for (const g of B.segs) { burst(g.x, g.y, 14, ['#72efdd', '#4cc9f0', '#fff', '#f72585'], 260, 4); fx.ring(g.x, g.y, 70, '#72efdd'); }
      fx.text(B.segs[0].x, B.segs[0].y - 30, 'LEVIATHAN DOWN!', '#72efdd', 24);
    }
    function hurt(d, fromX, fromY) {
      if (R.inv > 0 || R.ending) return;
      d = Math.max(1, d * (1 - s.armor)); R.hp -= d; R.inv = 0.7; R.hurtT = R.t;
      fx.shake = Math.max(fx.shake, 9); sfx.hit(); sfx.noise(0.15, 0.08, 300);
      fx.text(ship.x, ship.y - 22, '-' + Math.round(d), '#ff6b6b', 17);
      const a = Math.atan2(ship.y - fromY, ship.x - fromX); ship.vx += Math.cos(a) * 160; ship.vy += Math.sin(a) * 160;
      if (s.reactive) { for (let i = 0; i < 12; i++) { const b = i / 12 * TAU; fire(ship.x, ship.y, b, 420, 0.4, 1.4 * s.dmg * (0.6 + 0.4 * s.reactive), 'flak', 0); } fx.ring(ship.x, ship.y, 80, '#ffb703'); }
      if (R.hp <= 0) { R.hp = 0; R.ending = 1.4; sfx.boom(); fx.shake = 16; burst(ship.x, ship.y, 40, ['#ffd166', '#ff6b6b', '#fff', SHIPS[who].c], 280, 4); }
    }

    // ---- weapons
    function fire(x, y, a, sp, life, dmg, kind, pierce) {
      if (R.bullets.length >= CAP.bullets) return;
      R.bullets.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, a, life, dmg, kind, pierce: pierce || 0, hits: [], r: kind === 'flak' ? 4 : kind === 'missile' ? 6 : 5 });
    }
    const lvMul = () => 1 + 0.22 * R.wp.main, lvRate = () => 1 + 0.08 * R.wp.main;
    function weapons(dt, targets) {
      const tgt = targets[0];
      R.cd.main -= dt;
      if (tgt && R.cd.main <= 0) {
        const kind = s.weapon, base = Math.atan2(tgt.y - ship.y, tgt.x - ship.x), n = 1 + s.spread, D = s.dmg * lvMul();
        if (kind === 'pulse') {
          R.cd.main = 0.48 / (s.rate * lvRate());
          for (let i = 0; i < n; i++) fire(ship.x, ship.y, base + (i - (n - 1) / 2) * 0.16, 560, 0.62, 1 * D, 'pulse', s.pierce);
          snd(660 + rnd() * 80, 'square');
        } else if (kind === 'flak') {
          R.cd.main = 0.9 / (s.rate * lvRate());
          const p = 5 + 2 * s.spread, fan = 0.7 + 0.08 * s.spread;
          for (let i = 0; i < p; i++) fire(ship.x, ship.y, base + (i / (p - 1) - 0.5) * fan + (rnd() - 0.5) * 0.08, 400 + rnd() * 80, 0.4, 0.8 * D, 'flak', 0);
          snd(180, 'sawtooth'); fx.shake = Math.max(fx.shake, 1.5);
        } else {
          R.cd.main = 0.95 / (s.rate * lvRate());
          for (let i = 0; i < n && i < targets.length; i++) laser(Math.atan2(targets[i].y - ship.y, targets[i].x - ship.x), 2.6 * D);
          snd(1200, 'sawtooth');
        }
      }
      // blades
      if (R.wp.blades) {
        R.bladeA += dt * 3.4;
        for (let i = 0; i < R.wp.blades; i++) {
          const a = R.bladeA + i / R.wp.blades * TAU, bx = ship.x + Math.cos(a) * 62, by = ship.y + Math.sin(a) * 62;
          for (const e of targets.all) if (e.bladeCD <= 0 && Math.hypot(e.x - bx, e.y - by) < e.r + 12) { hitE(e, 1.6 * s.dmg); e.bladeCD = 0.3; burst(bx, by, 2, ['#72efdd', '#fff'], 90, 2); }
        }
      }
      // missiles
      if (R.wp.missiles) {
        R.cd.missiles -= dt;
        if (R.cd.missiles <= 0 && tgt) {
          R.cd.missiles = 1.7 / Math.sqrt(s.rate);
          for (let i = 0; i < R.wp.missiles; i++) { fire(ship.x, ship.y, ship.a + Math.PI + (i - (R.wp.missiles - 1) / 2) * 0.7, 220, 2.2, 4 * s.dmg, 'missile', 0); R.bullets[R.bullets.length - 1] && (R.bullets[R.bullets.length - 1].tgt = targets[i % targets.length]); }
          sfx.tone(300, 0.15, 'triangle', 0.05, 2);
        }
      }
      // nova
      if (R.wp.nova) {
        R.cd.nova -= dt;
        if (R.cd.nova <= 0) {
          R.cd.nova = 4.4 - 0.5 * R.wp.nova; const rad = 100 + 25 * R.wp.nova;
          for (const e of targets.all) { const d = Math.hypot(e.x - ship.x, e.y - ship.y); if (d < rad + e.r) { hitE(e, 3 * s.dmg); if (!e.seg) { e.vx += (e.x - ship.x) / (d || 1) * 180; e.vy += (e.y - ship.y) / (d || 1) * 180; } } }
          R.novaFx.push({ x: ship.x, y: ship.y, r: rad, t: 0 }); sfx.tone(140, 0.35, 'sine', 0.12, 3);
        }
      }
    }
    function laser(a, dmg) {
      const L = 360, cx = Math.cos(a), cy = Math.sin(a);
      R.beams.push({ x: ship.x, y: ship.y, a, L, t: 0 });
      for (const e of R.targetsAll) { const dx = e.x - ship.x, dy = e.y - ship.y, along = dx * cx + dy * cy; if (along < -e.r || along > L + e.r) continue; if (Math.abs(dx * cy - dy * cx) < e.r + 7) hitE(e, dmg); }
    }
    function snd(f, type) { if (R.t - R.shotSnd < 0.09) return; R.shotSnd = R.t; sfx.tone(f, 0.05, type, 0.018, 0.6); }

    // ---- level-up choice (DOM in env.ui; logic DOM-free so a sim can call pick())
    function openPick() {
      const pool = PICKS.filter((p) => p.ok(R)), opts = [];
      while (opts.length < 3 && pool.length) { let tot = 0; for (const p of pool) tot += p.w || 1; let r = rnd() * tot, k = 0; while ((r -= pool[k].w || 1) > 0) k++; opts.push(pool.splice(k, 1)[0]); }
      R.choice = opts; R.paused = true; R.armT = 0.35; R.anchor = null; sfx.ding();
      env.ui.innerHTML = `<div class="vd-pick"><div class="vd-h">LEVEL UP · pick one</div>${opts.map((p, i) => `<button type="button" class="vd-c" data-i="${i}" disabled><span class="vd-i">${p.icon}</span><span><b>${p.name}</b><small>${p.desc}</small></span></button>`).join('')}</div>`;
      env.ui.querySelectorAll('[data-i]').forEach((b) => { b.onclick = () => pick(+b.dataset.i); });
    }
    function pick(i) {
      if (!R.paused || R.armT > 0 || !R.choice[i]) return;
      R.choice[i].take(R); R.picks++; R.pending--; R.paused = false; R.choice = null; env.ui.innerHTML = ''; sfx.buy();
      fx.ring(ship.x, ship.y, 70, '#4cc9f0');
    }

    const api = {
      get over() { return R.over; }, get t() { return R.t; }, R, pick,
      update(dt, input) {
        R.in = input;
        if (R.paused) {
          if (R.armT > 0 && (R.armT -= dt) <= 0) env.ui.querySelectorAll('[data-i]').forEach((b) => { b.disabled = false; });
          return;
        }
        if (R.over) return;
        if (R.pending > 0 && !R.ending && R.t > 0.25) { openPick(); return; }
        R.t += dt;
        const ending = R.ending > 0;
        if (ending) { R.ending -= dt; if (R.ending <= 0) { R.over = true; return; } }

        // ---- steering: virtual stick anchored where the finger went down
        const down = input.down && !ending;
        if (down && (!R.wasDown || !R.anchor)) { const tp = input.taps && input.taps[input.taps.length - 1]; R.anchor = tp ? { x: tp.x, y: tp.y } : { x: input.x, y: input.y }; R.touchT = 0; R.blinked = false; } // anchor where the finger landed
        if (!down) R.anchor = null;
        R.wasDown = down;
        if (down) {
          R.touchT += dt;
          let dx = input.x - R.anchor.x, dy = input.y - R.anchor.y; const len = Math.hypot(dx, dy), MAX = 60;
          if (len > MAX) { R.anchor.x = input.x - dx / len * MAX; R.anchor.y = input.y - dy / len * MAX; dx = dx / len * MAX; dy = dy / len * MAX; } // stick follows the finger past its edge
          if (len > 6) R.steered = true;
          const k = len < 6 ? 0 : Math.min(1, len / MAX), tvx = dx / (len || 1) * s.speed * k, tvy = dy / (len || 1) * s.speed * k;
          const f = Math.min(1, dt * 9); ship.vx += (tvx - ship.vx) * f; ship.vy += (tvy - ship.vy) * f;
          if (s.blink && !R.blinked && R.blinkT <= 0 && R.touchT < 0.22 && len > 30) blink(dx / len, dy / len);
        } else { const f = Math.max(0, 1 - dt * 1.6); ship.vx *= f; ship.vy *= f; }
        ship.x += ship.vx * dt; ship.y += ship.vy * dt;
        const sp = Math.hypot(ship.vx, ship.vy);
        if (sp > 25) { let da = Math.atan2(ship.vy, ship.vx) - ship.a; da = Math.atan2(Math.sin(da), Math.cos(da)); ship.a += da * Math.min(1, dt * 10); }
        R.inv -= dt; R.blinkT -= dt;
        if (s.regen && !ending) R.hp = Math.min(s.hull, R.hp + s.regen * dt);

        // ---- spawns
        if (!ending) {
          R.spawnT -= dt;
          const rate = 1.05 / (1 + R.t / 14) * (R.boss ? 1.8 : 1);
          while (R.spawnT <= 0) { R.spawnT += Math.max(0.25, rate); spawnWave(); }
          if (R.t >= R.ringT) { // a ring of rocks and drones closes in from every side
            R.ringT += 14; const n = Math.min(26, 6 + Math.floor(R.t / 6)), off = rnd() * TAU;
            for (let i = 0; i < n; i++) { const a = off + i / n * TAU, e = spawn(i % 3 === 2 && R.t > 20 ? 'drone' : 'rock', ship.x + Math.cos(a) * view * 0.85, ship.y + Math.sin(a) * view * 0.85, 1); if (e && e.k === 'rock') { const v = 70 * (1 + R.t / 60); e.vx = -Math.cos(a) * v; e.vy = -Math.sin(a) * v; } }
            fx.text(ship.x, ship.y - 60, 'SWARM!', '#ff6b6b', 22); sfx.tone(110, 0.5, 'sawtooth', 0.07, 1.5);
          }
          if (env.boss && !R.boss && R.t >= BOSS_AT) spawnBoss();
          if (env.boss && !R.warned && R.t >= BOSS_AT - 8) { R.warned = true; sfx.tone(90, 0.8, 'sawtooth', 0.08, 0.7); }
        }

        // ---- enemies
        const keep = view * 1.5;
        for (const e of R.enemies) {
          e.flash -= dt; e.bladeCD -= dt; e.rot += e.spin * dt;
          if (e.k === 'drone' || e.k === 'hunter') {
            const a = Math.atan2(ship.y - e.y, ship.x - e.x), turn = e.k === 'drone' ? 2.4 : 1.6;
            e.vx += (Math.cos(a) * e.sp - e.vx) * Math.min(1, dt * turn); e.vy += (Math.sin(a) * e.sp - e.vy) * Math.min(1, dt * turn);
            e.rot = a;
          }
          e.x += e.vx * dt; e.y += e.vy * dt;
          const d = Math.hypot(e.x - ship.x, e.y - ship.y);
          if (d > keep) e.dead = true;
          else if (!ending && d < e.r + 11) {
            hurt(e.dmg, e.x, e.y);
            hitE(e, 3 * s.dmg);
            const nx = (e.x - ship.x) / (d || 1), ny = (e.y - ship.y) / (d || 1); e.vx = nx * 140; e.vy = ny * 140; e.x = ship.x + nx * (e.r + 12); e.y = ship.y + ny * (e.r + 12);
          }
        }
        // drones nudge apart so they read as a swarm, not one blob
        for (let i = 0; i < R.enemies.length; i++) { const a = R.enemies[i]; if (a.k === 'rock' || a.k === 'crystal') continue; for (let j = i + 1; j < R.enemies.length; j++) { const b = R.enemies[j]; if (b.k === 'rock' || b.k === 'crystal') continue; const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy), m = a.r + b.r; if (d < m && d > 0.01) { const p = (m - d) / 2 / d; a.x -= dx * p; a.y -= dy * p; b.x += dx * p; b.y += dy * p; } } }

        // ---- boss
        const B = R.boss;
        if (B && B.hp > 0) {
          B.flash -= dt;
          const h = B.segs[0], enr = B.hp < B.max / 2, want = Math.atan2(ship.y - h.y, ship.x - h.x);
          let da = want - B.a; da = Math.atan2(Math.sin(da), Math.cos(da)); B.a += Math.max(-1, Math.min(1, da)) * dt * (enr ? 1.7 : 1.25);
          const v = enr ? 150 : 118; h.x += Math.cos(B.a) * v * dt; h.y += Math.sin(B.a) * v * dt;
          for (let i = 1; i < B.segs.length; i++) { const p = B.segs[i - 1], q = B.segs[i], dx = q.x - p.x, dy = q.y - p.y, d = Math.hypot(dx, dy) || 1, gap = 22; q.x = p.x + dx / d * gap; q.y = p.y + dy / d * gap; }
          B.fireT -= dt;
          if (B.fireT <= 0) {
            B.fireT = enr ? 2.1 : 3; const n = enr ? 16 : 11, off = rnd() * TAU;
            for (let i = 0; i < n && R.ebullets.length < CAP.ebullets; i++) { const a = off + i / n * TAU; R.ebullets.push({ x: h.x, y: h.y, vx: Math.cos(a) * 140, vy: Math.sin(a) * 140, life: 4.5 }); }
            sfx.tone(200, 0.3, 'square', 0.05, 0.4);
          }
          if (!ending) for (const g of B.segs) if (Math.hypot(g.x - ship.x, g.y - ship.y) < g.r + 10) { hurt(12, g.x, g.y); break; }
          // a leviathan far off-screen swims back fast
          if (Math.hypot(h.x - ship.x, h.y - ship.y) > view * 1.3) { h.x += (ship.x - h.x) * dt * 0.8; h.y += (ship.y - h.y) * dt * 0.8; }
        }
        for (const b of R.ebullets) { b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt; if (!ending && Math.hypot(b.x - ship.x, b.y - ship.y) < 15) { hurt(6, b.x, b.y); b.life = 0; } }
        R.ebullets = R.ebullets.filter((b) => b.life > 0);

        // ---- targeting + weapons
        const all = R.enemies.filter((e) => !e.dead);
        if (B && B.hp > 0) all.push(...B.segs);
        R.targetsAll = all;
        const near = all.map((e) => [e, Math.hypot(e.x - ship.x, e.y - ship.y) - e.r]).filter((p) => p[1] < 300).sort((a, b) => a[1] - b[1]).map((p) => p[0]);
        if (B && B.hp > 0) { const seen = near.filter((e) => e.seg); if (seen.length > 1) for (const g of seen.slice(1)) near.splice(near.indexOf(g), 1); } // one boss target, not 16
        near.all = all;
        if (!ending) weapons(dt, near);

        // ---- bullets
        for (const b of R.bullets) {
          if (b.kind === 'missile') {
            if (!b.tgt || b.tgt.dead || (b.tgt.seg && (!B || B.hp <= 0))) b.tgt = near[0];
            const sp = Math.min(460, Math.hypot(b.vx, b.vy) + dt * 500);
            if (b.tgt) { const want = Math.atan2(b.tgt.y - b.y, b.tgt.x - b.x); let da = want - b.a; da = Math.atan2(Math.sin(da), Math.cos(da)); b.a += Math.max(-1, Math.min(1, da)) * dt * 6; }
            b.vx = Math.cos(b.a) * sp; b.vy = Math.sin(b.a) * sp;
            if (R.parts.length < CAP.parts && rnd() < 0.6) R.parts.push({ x: b.x, y: b.y, vx: -b.vx * 0.1, vy: -b.vy * 0.1, t: 0, life: 0.3, c: '#ffb703', s: 2.5 });
          }
          b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt;
          for (const e of all) {
            if (e.dead || b.hits.includes(e)) continue;
            if (Math.abs(e.x - b.x) < e.r + b.r && Math.hypot(e.x - b.x, e.y - b.y) < e.r + b.r) {
              if (b.kind === 'missile') { b.life = 0; break; }
              hitE(e, b.dmg); b.hits.push(e); burst(b.x, b.y, 2, b.kind === 'flak' ? ['#ffb703'] : ['#fff', SHIPS[who].c], 90, 2);
              if (e.seg) { b.life = 0; break; }
              if (b.pierce-- <= 0) { b.life = 0; break; }
            }
          }
          if (b.kind === 'missile' && b.life <= 0) {
            for (const e of all) if (Math.hypot(e.x - b.x, e.y - b.y) < 55 + e.r) hitE(e, b.dmg);
            burst(b.x, b.y, 10, ['#ffb703', '#ff6b6b', '#fff'], 180, 3); fx.ring(b.x, b.y, 55, '#ffb703'); sfx.crack();
          }
        }
        R.bullets = R.bullets.filter((b) => b.life > 0);
        R.enemies = R.enemies.filter((e) => !e.dead);

        // ---- salvage + magnet
        for (const o of R.orbs) {
          o.t += dt; const dx = ship.x - o.x, dy = ship.y - o.y, d = Math.hypot(dx, dy);
          if (!ending && d < s.magnet) { const pull = 140 + (1 - d / s.magnet) * 520; o.vx += (dx / d * pull - o.vx) * Math.min(1, dt * 7); o.vy += (dy / d * pull - o.vy) * Math.min(1, dt * 7); }
          else { o.vx *= 1 - dt * 2; o.vy *= 1 - dt * 2; }
          o.x += o.vx * dt; o.y += o.vy * dt;
          if (!ending && d < 18) {
            o.got = true;
            if (o.shard) { R.shards++; sfx.ding(); fx.text(ship.x, ship.y - 28, '+1 void shard', '#e0aaff', 17); }
            else { R.salv += o.v; R.xp += o.v; sfx.coin(); }
          }
          if (d > keep * 1.4) o.got = true;
        }
        R.orbs = R.orbs.filter((o) => !o.got);
        if (R.xp >= R.need) { R.xp -= R.need; R.need = Math.round(R.need * 1.6 + 4); R.pending++; }

        // ---- fx
        for (const p of R.parts) { p.t += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 1 - dt * 2; p.vy *= 1 - dt * 2; }
        R.parts = R.parts.filter((p) => p.t < p.life);
        for (const b of R.beams) b.t += dt; R.beams = R.beams.filter((b) => b.t < 0.16);
        for (const n of R.novaFx) n.t += dt; R.novaFx = R.novaFx.filter((n) => n.t < 0.4);
        fx.update(dt);
      },
      draw(g) { draw(g); },
      result() {
        const banked = R.salv * s.value, lines = [`Survived ${Math.round(R.t)}s · ${R.kills} destroyed · ${R.picks} boosts`];
        if (R.won) return { won: true, earned: { salvage: banked, shards: R.shards }, lines };
        if (env.boss) lines.push(R.boss ? `The Leviathan had ${Math.ceil(R.boss.hp / R.boss.max * 100)}% left.` : `Survive to ${BOSS_AT}s to meet the Leviathan.`);
        return { won: false, title: 'Hull breached', earned: { salvage: banked, shards: R.shards }, lines };
      },
    };
    if (window.VoidDrifter) window.VoidDrifter.run = api; // handy for ?dev poking from the console
    return api;

    function blink(nx, ny) {
      const ox = ship.x, oy = ship.y; R.blinked = true; R.blinkT = s.blinkCD;
      burst(ox, oy, 14, ['#c77dff', '#72efdd'], 140, 3);
      ship.x += nx * s.blinkDist; ship.y += ny * s.blinkDist; ship.vx = nx * s.speed; ship.vy = ny * s.speed; R.inv = Math.max(R.inv, 0.35);
      burst(ship.x, ship.y, 10, ['#c77dff', '#fff'], 120, 3); sfx.tone(1400, 0.12, 'sine', 0.06, 0.4);
      if (s.rift) { fx.ring(ox, oy, 60, '#c77dff'); for (const e of R.targetsAll || []) if (Math.hypot(e.x - ox, e.y - oy) < 60 + e.r) hitE(e, 3 * s.rift * s.dmg); }
    }

    // ---------------------------------------------------------------- drawing
    function draw(g) {
      const shx = (rnd() - 0.5) * fx.shake, shy = (rnd() - 0.5) * fx.shake;
      const ox = W / 2 - ship.x + shx, oy = SY - ship.y + shy;
      // backdrop: deep void + slow nebulae + parallax stars
      g.fillStyle = '#05060f'; g.fillRect(0, 0, W, H);
      for (const [nx, ny, nr, col, f] of NEB) {
        const x = mod(nx - ship.x * f, 1400) - 300, y = mod(ny - ship.y * f, 1600) - 300;
        const gr = g.createRadialGradient(x, y, 0, x, y, nr); gr.addColorStop(0, col); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(x - nr, y - nr, nr * 2, nr * 2);
      }
      for (const L of STARS) {
        g.fillStyle = L.c;
        for (const st of L.s) {
          const x = mod(st[0] - ship.x * L.f, 600), y = mod(st[1] - ship.y * L.f, 600);
          for (let tx = x; tx < W; tx += 600) for (let ty = y; ty < H; ty += 600) g.fillRect(tx, ty, L.z, L.z);
        }
      }
      g.save(); g.translate(ox, oy);
      // salvage
      for (const o of R.orbs) {
        if (o.shard) { const p = 1 + Math.sin(R.t * 8 + o.x) * 0.15; g.save(); g.translate(o.x, o.y); g.scale(p, p); g.fillStyle = 'rgba(199,125,255,.25)'; g.beginPath(); g.arc(0, 0, 14, 0, TAU); g.fill(); g.fillStyle = '#e0aaff'; g.beginPath(); g.moveTo(0, -9); g.lineTo(6, 0); g.lineTo(0, 9); g.lineTo(-6, 0); g.closePath(); g.fill(); g.fillStyle = '#fff'; g.fillRect(-1.5, -4, 3, 4); g.restore(); }
        else { const z = o.v > 2 ? 6 : 4.5; g.save(); g.translate(o.x, o.y); g.rotate(o.t * 3 + o.x); g.fillStyle = 'rgba(123,241,168,.22)'; g.beginPath(); g.arc(0, 0, z + 5, 0, TAU); g.fill(); g.fillStyle = '#7bf1a8'; g.fillRect(-z, -z, z * 2, z * 2); g.fillStyle = '#e9fff1'; g.fillRect(-z * 0.4, -z * 0.4, z * 0.8, z * 0.8); g.restore(); }
      }
      for (const e of R.enemies) drawEnemy(g, e);
      if (R.boss && R.boss.hp > 0) drawBoss(g, R.boss);
      // nova waves
      for (const n of R.novaFx) { const q = n.t / 0.4; g.strokeStyle = `rgba(114,239,221,${1 - q})`; g.lineWidth = 10 * (1 - q) + 2; g.beginPath(); g.arc(n.x, n.y, n.r * (0.3 + 0.7 * q), 0, TAU); g.stroke(); }
      // bullets
      for (const b of R.bullets) {
        if (b.kind === 'pulse') { g.strokeStyle = SHIPS[who].c; g.lineWidth = 4; g.lineCap = 'round'; g.beginPath(); g.moveTo(b.x, b.y); g.lineTo(b.x - b.vx * 0.022, b.y - b.vy * 0.022); g.stroke(); g.fillStyle = '#fff'; g.beginPath(); g.arc(b.x, b.y, 2.5, 0, TAU); g.fill(); }
        else if (b.kind === 'flak') { g.fillStyle = '#ffb703'; g.beginPath(); g.arc(b.x, b.y, 3.5, 0, TAU); g.fill(); }
        else { g.save(); g.translate(b.x, b.y); g.rotate(b.a); g.fillStyle = '#ff6b6b'; g.fillRect(-6, -3, 12, 6); g.fillStyle = '#fff'; g.beginPath(); g.moveTo(6, -3); g.lineTo(10, 0); g.lineTo(6, 3); g.fill(); g.restore(); }
      }
      for (const b of R.ebullets) { g.fillStyle = 'rgba(247,37,133,.3)'; g.beginPath(); g.arc(b.x, b.y, 10, 0, TAU); g.fill(); g.fillStyle = '#ff8fab'; g.beginPath(); g.arc(b.x, b.y, 5, 0, TAU); g.fill(); }
      for (const b of R.beams) { const q = 1 - b.t / 0.16; g.save(); g.translate(b.x, b.y); g.rotate(b.a); g.fillStyle = `rgba(114,239,221,${0.35 * q})`; g.fillRect(0, -7 * q - 2, b.L, (7 * q + 2) * 2); g.fillStyle = `rgba(255,255,255,${q})`; g.fillRect(0, -1.5, b.L, 3); g.restore(); }
      // blades
      if (R.wp.blades) for (let i = 0; i < R.wp.blades; i++) { const a = R.bladeA + i / R.wp.blades * TAU; g.save(); g.translate(ship.x + Math.cos(a) * 62, ship.y + Math.sin(a) * 62); g.rotate(R.t * 14); g.fillStyle = '#72efdd'; g.beginPath(); for (let k = 0; k < 3; k++) { const b = k / 3 * TAU; g.moveTo(0, 0); g.arc(0, 0, 11, b, b + 0.8); } g.fill(); g.fillStyle = '#fff'; g.beginPath(); g.arc(0, 0, 3, 0, TAU); g.fill(); g.restore(); }
      // magnet halo (faint, so you learn your pull range)
      if (!(R.ending && R.hp <= 0)) {
        g.strokeStyle = 'rgba(123,241,168,.08)'; g.lineWidth = 2; g.setLineDash([4, 8]); g.beginPath(); g.arc(ship.x, ship.y, s.magnet, 0, TAU); g.stroke(); g.setLineDash([]);
        if (!(R.inv > 0 && Math.floor(R.t * 20) % 2)) drawShip(g, who, ship.x, ship.y, ship.a, 1.2, Math.min(1, Math.hypot(ship.vx, ship.vy) / s.speed), R.t);
        if (s.blink && R.blinkT <= 0) { g.strokeStyle = 'rgba(199,125,255,.6)'; g.lineWidth = 2; g.beginPath(); g.arc(ship.x, ship.y, 22 + Math.sin(R.t * 6) * 2, 0, TAU); g.stroke(); }
      }
      for (const p of R.parts) { g.globalAlpha = 1 - p.t / p.life; g.fillStyle = p.c; g.beginPath(); g.arc(p.x, p.y, p.s, 0, TAU); g.fill(); }
      g.globalAlpha = 1;
      fx.draw(g);
      g.restore();

      // hurt vignette
      const ht = R.t - R.hurtT;
      if (ht < 0.35) { const v = g.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.max(W, H) * 0.75); v.addColorStop(0, 'rgba(255,0,60,0)'); v.addColorStop(1, `rgba(255,0,60,${0.45 * (1 - ht / 0.35)})`); g.fillStyle = v; g.fillRect(0, 0, W, H); }

      // boss pointer when off-screen
      const B = R.boss;
      if (B && B.hp > 0) {
        const h = B.segs[0], sx = h.x + ox, sy = h.y + oy;
        if (sx < -20 || sx > W + 20 || sy < 90 || sy > H + 20) {
          const a = Math.atan2(sy - SY, sx - W / 2), px = Math.max(24, Math.min(W - 24, W / 2 + Math.cos(a) * W)), py = Math.max(110, Math.min(H - 24, SY + Math.sin(a) * W));
          g.save(); g.translate(px, py); g.rotate(a); g.fillStyle = '#f72585'; g.beginPath(); g.moveTo(14, 0); g.lineTo(-8, -10); g.lineTo(-8, 10); g.fill(); g.restore();
        }
      }

      // stick
      if (R.anchor && R.in?.down) {
        g.strokeStyle = 'rgba(255,255,255,.25)'; g.lineWidth = 3; g.beginPath(); g.arc(R.anchor.x, R.anchor.y, 60, 0, TAU); g.stroke();
        g.fillStyle = 'rgba(255,255,255,.22)'; g.beginPath(); g.arc(R.in.x, R.in.y, 24, 0, TAU); g.fill();
      }

      // HUD
      const bw = W - 32;
      g.fillStyle = 'rgba(0,0,0,.55)'; rr(g, 16, 14, bw, 14, 7); g.fill();
      const hf = R.hp / s.hull; g.fillStyle = hf < 0.3 ? '#ff6b6b' : hf < 0.6 ? '#ffd166' : '#7bd389'; rr(g, 16, 14, Math.max(0, bw * hf), 14, 7); g.fill();
      g.fillStyle = 'rgba(0,0,0,.55)'; rr(g, 16, 32, bw, 5, 2.5); g.fill();
      g.fillStyle = '#4cc9f0'; rr(g, 16, 32, bw * Math.min(1, R.xp / R.need), 5, 2.5); g.fill();
      g.font = '800 14px Nunito, system-ui'; g.textAlign = 'left'; g.fillStyle = '#fff'; g.fillText(`Hull ${Math.ceil(R.hp)}/${Math.round(s.hull)}`, 18, 56);
      g.textAlign = 'center'; g.fillStyle = 'rgba(255,255,255,.7)'; g.fillText(`${Math.floor(R.t)}s`, W / 2, 56);
      g.textAlign = 'right'; g.fillStyle = '#7bf1a8'; g.fillText(`${env.fmt(R.salv * s.value)} salvage${R.shards ? '' : ''}`, W - 16, 56);
      if (R.shards) { g.fillStyle = '#e0aaff'; g.fillText(`${R.shards} void shard${R.shards > 1 ? 's' : ''}`, W - 16, 74); }
      if (B && B.hp > 0) {
        g.textAlign = 'center'; g.fillStyle = '#f72585'; g.font = '400 17px "Lilita One", system-ui'; g.fillText('VOID LEVIATHAN', W / 2, 96);
        g.fillStyle = 'rgba(0,0,0,.55)'; g.fillRect(32, 102, W - 64, 9); g.fillStyle = '#f72585'; g.fillRect(32, 102, (W - 64) * Math.max(0, B.hp / B.max), 9);
      } else if (env.boss && !B && R.t > BOSS_AT - 10) {
        g.textAlign = 'center'; g.fillStyle = Math.floor(R.t * 3) % 2 ? '#f72585' : '#ff8fab'; g.font = '400 20px "Lilita One", system-ui'; g.fillText(`Something huge stirs… ${Math.ceil(BOSS_AT - R.t)}`, W / 2, 104);
      } else if (env.boss && !B && R.t < 4) {
        g.textAlign = 'center'; g.fillStyle = '#ff8fab'; g.font = '800 15px Nunito, system-ui'; g.fillText(`The Leviathan arrives at ${BOSS_AT}s. Survive!`, W / 2, 100);
      }

      // first-run hint (until you have steered, and the first seconds of every run)
      if (!R.paused && (R.t < 3 || !R.steered) && !R.ending) {
        const a = Math.min(1, (R.steered ? 3 - R.t : 3) * 2);
        g.globalAlpha = Math.max(0, a);
        g.fillStyle = 'rgba(0,0,0,.45)'; rr(g, 16, H * 0.66, W - 32, s.blink ? 86 : 64, 16); g.fill();
        g.textAlign = 'center'; g.fillStyle = '#fff'; g.font = '400 22px "Lilita One", system-ui'; g.fillText('Drag anywhere to fly', W / 2, H * 0.66 + 28);
        g.font = '800 14px Nunito, system-ui'; g.fillStyle = 'rgba(255,255,255,.8)'; g.fillText('Guns fire on their own. Grab the green salvage.', W / 2, H * 0.66 + 50);
        if (s.blink) { g.fillStyle = '#e0aaff'; g.fillText('Flick fast to blink through danger.', W / 2, H * 0.66 + 72); }
        if (!R.steered) { // ghost finger showing the stick
          const fx0 = W / 2, fy0 = H * 0.86, k = (R.t * 0.8) % 1, fxx = fx0 + Math.cos(k * TAU) * 34, fyy = fy0 + Math.sin(k * TAU) * 20;
          g.strokeStyle = 'rgba(255,255,255,.4)'; g.lineWidth = 3; g.beginPath(); g.arc(fx0, fy0, 40, 0, TAU); g.stroke();
          g.fillStyle = 'rgba(255,255,255,.55)'; g.beginPath(); g.arc(fxx, fyy, 18, 0, TAU); g.fill();
        }
        g.globalAlpha = 1;
      }
      if (R.paused) { g.fillStyle = 'rgba(5,6,15,.55)'; g.fillRect(0, 0, W, H); }
    }
    function drawEnemy(g, e) {
      g.save(); g.translate(e.x, e.y);
      const fl = e.flash > 0;
      if (e.k === 'rock' || e.k === 'crystal') {
        g.rotate(e.rot);
        const cr = e.k === 'crystal';
        if (cr) { g.fillStyle = 'rgba(199,125,255,.22)'; g.beginPath(); g.arc(0, 0, e.r * 1.6, 0, TAU); g.fill(); }
        g.fillStyle = fl ? '#fff' : cr ? '#7b2cbf' : '#6b5e53'; g.beginPath();
        e.shape.forEach((k, i) => { const a = i / e.shape.length * TAU; g.lineTo(Math.cos(a) * e.r * k, Math.sin(a) * e.r * k); }); g.closePath(); g.fill();
        g.strokeStyle = cr ? '#e0aaff' : '#a8977f'; g.lineWidth = 2; g.stroke();
        if (!fl) {
          g.fillStyle = cr ? '#e0aaff' : '#4a4038'; g.beginPath(); g.arc(-e.r * 0.25, -e.r * 0.2, e.r * 0.22, 0, TAU); g.arc(e.r * 0.3, e.r * 0.25, e.r * 0.14, 0, TAU); g.fill();
          if (cr) { g.fillStyle = '#fff'; g.beginPath(); g.moveTo(0, -e.r * 0.5); g.lineTo(e.r * 0.15, 0); g.lineTo(0, e.r * 0.3); g.lineTo(-e.r * 0.15, 0); g.fill(); }
        }
      } else if (e.k === 'drone') {
        g.fillStyle = 'rgba(255,107,107,.18)'; g.beginPath(); g.arc(0, 0, e.r * 1.7, 0, TAU); g.fill();
        g.fillStyle = fl ? '#fff' : '#e63946'; g.beginPath(); g.ellipse(0, 0, e.r, e.r * 0.8, 0, 0, TAU); g.fill();
        g.strokeStyle = '#ffd166'; g.lineWidth = 2; g.beginPath(); g.ellipse(0, 0, e.r * 1.35, e.r * 0.45, Math.sin(R.t * 3 + e.x) * 0.3, 0, TAU); g.stroke();
        g.fillStyle = '#fff'; g.beginPath(); g.arc(0, 0, e.r * 0.42, 0, TAU); g.fill();
        g.fillStyle = '#111'; g.beginPath(); g.arc(Math.cos(e.rot) * 2.5, Math.sin(e.rot) * 2.5, e.r * 0.2, 0, TAU); g.fill();
      } else {
        g.rotate(e.rot);
        g.fillStyle = 'rgba(247,37,133,.2)'; g.beginPath(); g.arc(0, 0, e.r * 1.6, 0, TAU); g.fill();
        g.fillStyle = fl ? '#fff' : '#b5179e'; g.beginPath();
        for (let i = 0; i < 12; i++) { const a = i / 12 * TAU + R.t, rr2 = i % 2 ? e.r * 0.65 : e.r * 1.1; g.lineTo(Math.cos(a) * rr2, Math.sin(a) * rr2); } g.closePath(); g.fill();
        g.fillStyle = '#ffd6e8'; g.beginPath(); g.arc(0, 0, e.r * 0.42, 0, TAU); g.fill();
        g.fillStyle = '#240046'; g.beginPath(); g.arc(e.r * 0.15, 0, e.r * 0.2, 0, TAU); g.fill();
        if (e.hp < e.max) { g.rotate(-e.rot); g.strokeStyle = 'rgba(255,255,255,.8)'; g.lineWidth = 3; g.beginPath(); g.arc(0, 0, e.r + 7, -1.57, -1.57 + TAU * e.hp / e.max); g.stroke(); }
      }
      g.restore();
    }
    function drawBoss(g, B) {
      const fl = B.flash > 0;
      for (let i = B.segs.length - 1; i >= 1; i--) {
        const q = B.segs[i], p = B.segs[i - 1], a = Math.atan2(p.y - q.y, p.x - q.x);
        g.save(); g.translate(q.x, q.y); g.rotate(a);
        g.fillStyle = fl ? '#fff' : i % 2 ? '#1b4965' : '#16425b'; g.beginPath(); g.ellipse(0, 0, q.r * 1.1, q.r, 0, 0, TAU); g.fill();
        g.strokeStyle = '#72efdd'; g.lineWidth = 2; g.beginPath(); g.arc(0, 0, q.r * 0.8, -1.2, 1.2); g.stroke();
        g.fillStyle = '#f72585'; g.beginPath(); g.moveTo(-q.r * 0.3, -q.r); g.lineTo(q.r * 0.2, -q.r * 1.5); g.lineTo(q.r * 0.4, -q.r * 0.9); g.fill();
        g.beginPath(); g.moveTo(-q.r * 0.3, q.r); g.lineTo(q.r * 0.2, q.r * 1.5); g.lineTo(q.r * 0.4, q.r * 0.9); g.fill();
        g.fillStyle = '#72efdd'; g.beginPath(); g.arc(0, 0, 3 + Math.sin(R.t * 5 + i) * 1.5, 0, TAU); g.fill();
        g.restore();
      }
      const h = B.segs[0], jaw = 0.35 + Math.sin(R.t * 6) * 0.2;
      g.save(); g.translate(h.x, h.y); g.rotate(B.a);
      g.fillStyle = 'rgba(247,37,133,.18)'; g.beginPath(); g.arc(0, 0, h.r * 1.8, 0, TAU); g.fill();
      g.fillStyle = fl ? '#fff' : '#0b2e45';
      for (const sgn of [-1, 1]) { g.save(); g.rotate(sgn * jaw); g.beginPath(); g.moveTo(-h.r * 0.6, 0); g.quadraticCurveTo(h.r * 0.6, sgn * h.r * 1.1, h.r * 1.5, sgn * h.r * 0.15); g.lineTo(-h.r * 0.2, sgn * h.r * 0.2); g.closePath(); g.fill(); g.restore(); }
      g.fillStyle = fl ? '#fff' : '#1b4965'; g.beginPath(); g.ellipse(-h.r * 0.2, 0, h.r, h.r * 0.85, 0, 0, TAU); g.fill();
      g.fillStyle = '#f72585'; g.beginPath(); g.arc(h.r * 0.25, -h.r * 0.4, 5, 0, TAU); g.arc(h.r * 0.25, h.r * 0.4, 5, 0, TAU); g.fill();
      g.fillStyle = '#fff'; g.beginPath(); g.arc(h.r * 0.3, -h.r * 0.42, 2, 0, TAU); g.arc(h.r * 0.3, h.r * 0.38, 2, 0, TAU); g.fill();
      g.restore();
    }
    function rr(g, x, y, w, h, r) { g.beginPath(); g.roundRect ? g.roundRect(x, y, w, h, r) : g.rect(x, y, w, h); }
  }

  const mod = (a, m) => ((a % m) + m) % m;
  const STARS = [{ f: 0.08, z: 1, c: 'rgba(255,255,255,.35)', n: 60 }, { f: 0.25, z: 1.5, c: 'rgba(200,220,255,.6)', n: 34 }, { f: 0.6, z: 2.2, c: '#fff', n: 16 }];
  for (const L of STARS) { L.s = []; for (let i = 0; i < L.n; i++) L.s.push([rnd() * 600, rnd() * 600]); }
  const NEB = [[200, 300, 320, 'rgba(76,201,240,.13)', 0.04], [900, 1100, 380, 'rgba(199,125,255,.12)', 0.05], [600, 600, 260, 'rgba(247,37,133,.08)', 0.06]];

  function drawShip(g, who, x, y, a, sc, thrust, t) {
    const C = SHIPS[who] || SHIPS.wasp;
    g.save(); g.translate(x, y); g.rotate(a + Math.PI / 2); g.scale(sc, sc);
    // flame
    const fl = 6 + thrust * 14 + Math.sin(t * 40) * 2;
    g.fillStyle = C.fl; g.globalAlpha = 0.9; g.beginPath(); g.moveTo(-5, 10); g.lineTo(0, 10 + fl); g.lineTo(5, 10); g.fill();
    g.fillStyle = '#fff'; g.beginPath(); g.moveTo(-2.5, 10); g.lineTo(0, 10 + fl * 0.5); g.lineTo(2.5, 10); g.fill(); g.globalAlpha = 1;
    g.lineJoin = 'round'; g.strokeStyle = '#0b0a12'; g.lineWidth = 2.5;
    if (who === 'bulwark') {
      g.fillStyle = C.c; g.beginPath(); [[0, -16], [13, -8], [17, 8], [8, 13], [-8, 13], [-17, 8], [-13, -8]].forEach(([px, py]) => g.lineTo(px, py)); g.closePath(); g.fill(); g.stroke();
      g.fillStyle = '#5a7d8c'; g.fillRect(-15, 2, 7, 8); g.fillRect(8, 2, 7, 8);
      g.fillStyle = C.c2; rrect(g, -4, -9, 8, 9, 3); g.fill();
    } else if (who === 'phantom') {
      g.fillStyle = 'rgba(114,239,221,.25)'; g.beginPath(); g.arc(0, 0, 16, 0, TAU); g.fill();
      g.fillStyle = C.c; g.beginPath(); g.moveTo(0, -19); g.quadraticCurveTo(18, -2, 13, 14); g.quadraticCurveTo(0, 4, -13, 14); g.quadraticCurveTo(-18, -2, 0, -19); g.closePath(); g.fill(); g.stroke();
      g.fillStyle = C.c2; g.beginPath(); g.moveTo(0, -11); g.lineTo(4, 0); g.lineTo(0, 4); g.lineTo(-4, 0); g.closePath(); g.fill();
    } else {
      g.fillStyle = C.c; g.beginPath(); [[0, -19], [6, -5], [15, 8], [5, 6], [0, 12], [-5, 6], [-15, 8], [-6, -5]].forEach(([px, py]) => g.lineTo(px, py)); g.closePath(); g.fill(); g.stroke();
      g.fillStyle = C.c2; g.fillRect(-5, 0, 10, 2.5); g.fillRect(-4, 4.5, 8, 2.5);
      g.fillStyle = '#4cc9f0'; g.beginPath(); g.ellipse(0, -7, 2.8, 4.5, 0, 0, TAU); g.fill();
    }
    g.restore();
  }
  function rrect(g, x, y, w, h, r) { g.beginPath(); g.roundRect ? g.roundRect(x, y, w, h, r) : g.rect(x, y, w, h); }
  function drawFace(g, who, x, y, r) {
    g.fillStyle = '#05060f'; g.beginPath(); g.arc(x, y, r * 1.25, 0, TAU); g.fill();
    g.fillStyle = 'rgba(255,255,255,.7)'; for (let i = 0; i < 9; i++) g.fillRect(x + Math.cos(i * 2.4) * r * (0.4 + (i % 3) * 0.25), y + Math.sin(i * 2.4) * r * (0.4 + (i % 3) * 0.25), 1.5, 1.5);
    drawShip(g, who, x, y + 2, -Math.PI / 2, r / 17, 0.6, 0.3);
  }

  // in-run pick panel styles (kit has none for this)
  document.head.insertAdjacentHTML('beforeend', `<style>

    .vd-pick{max-width:420px;margin:0 auto 9vh;background:#0d1b2ae6;border:2px solid #4cc9f0;border-radius:20px;padding:12px;display:grid;gap:8px;box-shadow:0 10px 40px #000a}
    .vd-h{font:400 22px var(--display);color:#4cc9f0;text-align:center;letter-spacing:.03em}
    .vd-c{display:flex;gap:12px;align-items:center;text-align:left;background:#1b263b;border:2px solid #415a77;border-radius:14px;padding:10px 12px;min-height:64px;color:#fff;transition:opacity .2s}
    .vd-c:active{background:#274060;border-color:#4cc9f0}.vd-c:disabled{opacity:.45}
    .vd-c b{display:block;font:400 19px var(--display)}.vd-c small{color:#a9bcd0;font-size:13.5px}.vd-i{font-size:30px;width:40px;text-align:center}
  </style>`);

  window.VoidDrifter = { NODES, PICKS, createRun, BOSS_HP, BOSS_AT, baseStats };
  function baseStats(who) {
    const s = { hull: 30, speed: 175, armor: 0, dmg: 1, rate: 1, magnet: 75, value: 1, wlvl: 0, spread: 0, pierce: 0, regen: 0, shardLuck: 1, headStart: 0,
      poolBlades: 0, poolMissiles: 0, poolNova: 0, weapon: 'pulse', blink: 0, blinkCD: 2.4, blinkDist: 90, rift: 0, reactive: 0 };
    if (who === 'wasp') { s.speed = 200; s.hull = 22; }
    if (who === 'bulwark') { s.speed = 140; s.hull = 40; s.armor = 0.12; s.weapon = 'flak'; }
    if (who === 'phantom') { s.speed = 170; s.hull = 20; s.weapon = 'laser'; s.blink = 1; }
    return s;
  }
  Kit.game({
    id: 'void-drifter', title: 'Void Drifter', tagline: 'Drift through an asteroid field, let your guns do the shooting, haul salvage home, and lure out the Void Leviathan.',
    howTo: 'Drag anywhere to steer (the stick starts where you touch). Weapons aim and fire on their own. Fly over green salvage; every few pickups pick a boost. Hull at zero ends the run.',
    runVerb: 'Launch!', winTitle: 'Leviathan slain!', loseTitle: 'Hull breached',
    colors: { accent: '#4cc9f0', bg: '#0b0d1a', card: '#18203a' },
    currencies: [{ id: 'salvage', name: 'salvage', color: '#7bf1a8' }, { id: 'shards', name: 'void shards', color: '#e0aaff' }],
    characters: [
      { id: 'wasp', name: 'Wasp', blurb: 'Fast and fragile. Rapid pulse cannon.', unlock: 0 },
      { id: 'bulwark', name: 'Bulwark', blurb: 'Slow, tanky, armored. Flak shotgun.', unlock: 1 },
      { id: 'phantom', name: 'Phantom', blurb: 'Flick to blink. Piercing lasers.', unlock: 2 },
    ],
    drawFace, nodes: NODES, baseStats, createRun,
  });
  document.body.dataset.ready = '1';
})();
