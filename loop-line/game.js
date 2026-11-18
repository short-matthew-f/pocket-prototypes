// Loop Line v2: a toy-train contraption. Your base sits in the middle of the mat and marbles roll in from every side.
// You build the whole railway yourself, from the engine shed outwards: draw rails, branch them (points), run them
// across each other (bridges), and fit pieces to them (boosters, auto-points). Beside the line go gadgets that the
// train sets off as each car rolls past: cannons, hammers, bumpers, and bells that re-fire whatever went off last.
// Every gadget firing feeds a combo, and the combo multiplies all damage. Cars still matter: gun cars shoot on their
// own, spark cars make gadgets fire twice, coal cars make the whole thing run faster.
// createGame() is DOM-free so test.js can drive it in node; the app code below it needs a browser.
(function () {
  'use strict';
  const TAU = Math.PI * 2, COLS = 8, ROWS = 12, CAR_GAP = 0.92, RAIL = 2;
  const key = (c, r) => c + ',' + r, unkey = (k) => k.split(',').map(Number);
  const N4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  const BASE = [[3, 5], [4, 5], [3, 6], [4, 6]], SHED = [[3, 7], [4, 7]];

  const GADGETS = {
    cannon: { name: 'Cannon', icon: '💥', cost: 20, blurb: 'Fires at the nearest marble each time a car passes.', range: 3 },
    hammer: { name: 'Hammer', icon: '🔨', cost: 25, blurb: 'Smashes every marble around it. Gets through armour.', range: 1.3 },
    bumper: { name: 'Bumper', icon: '🛞', cost: 12, blurb: 'Knocks nearby marbles back toward the edge.', range: 1.5 },
    bell: { name: 'Bell', icon: '🔔', cost: 30, blurb: 'Re-fires the last two gadgets that went off, wherever they are.', range: 0 },
  };
  const PIECES = {
    booster: { name: 'Booster', icon: '⏩', cost: 10, blurb: 'On a straight rail. The train shoots off it faster for a few seconds.' },
    auto: { name: 'Auto-points', icon: '🔀', cost: 10, blurb: 'On points. They switch by themselves every time the train goes through.' },
  };
  const CARS = {
    gun: { name: 'Gun car', icon: '🔫', cost: 40, col: '#3d7fd9', blurb: 'Shoots the nearest marble on its own.' },
    spark: { name: 'Spark car', icon: '⚡', cost: 45, col: '#8e5bd6', blurb: 'Gadgets it rolls past fire twice.' },
    coal: { name: 'Coal car', icon: '⚫', cost: 25, col: '#3b3b44', blurb: 'The whole train runs faster.' },
  };
  const MARBLES = {
    plodder: { name: 'Plodder', hp: 3, spd: 0.6, r: 0.22, dmg: 1, coins: 1, col: '#e8834f', hi: '#ffc39e' },
    bouncer: { name: 'Bouncer', hp: 3, spd: 1.1, r: 0.2, dmg: 1, coins: 2, hop: true, col: '#ec5b9a', hi: '#ffb3d3' },
    bruiser: { name: 'Bruiser', hp: 10, spd: 0.45, r: 0.27, dmg: 3, coins: 4, armor: 1, col: '#8d97a5', hi: '#eef2f7' },
  };
  const WAVES = [
    { plodder: 10 },
    { plodder: 12, bouncer: 5 },
    { plodder: 12, bouncer: 8, bruiser: 2 },
    { plodder: 14, bouncer: 10, bruiser: 5 },
    { plodder: 16, bouncer: 14, bruiser: 8 },
    { plodder: 20, bouncer: 18, bruiser: 12 },
  ];

  function createGame(env = {}) {
    const sfx = env.sfx || new Proxy({}, { get: () => () => false }), fx = env.fx || { burst() {}, text() {}, puff() {}, ring() {}, spark() {}, shake: 0 };
    let seed = env.seed || 1; const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
    const S = { track: new Map(), gadgets: new Map(), base: new Set(BASE.map(([c, r]) => key(c, r))), shed: SHED.map(([c, r]) => key(c, r)),
      cars: ['gun'], enemies: [], shots: [], pending: [], fired: [], wave: 0, phase: 'build', coins: 90, hp: 20, combo: 0, hits: [], best: 0,
      spawnQ: [], waveT: 0, speed: 1, boost: 0, over: false, won: false, t: 0, pops: 0, msg: '' };
    const inside = (c, r) => c >= 0 && r >= 0 && c < COLS && r < ROWS;
    const cell = (k) => S.track.get(k);
    const ensure = (k) => { let n = S.track.get(k); if (!n) S.track.set(k, (n = { k, links: [], pt: 1 })); return n; };
    const opp = (c, f) => { const [x, y] = unkey(c), [a, b] = unkey(f); return key(2 * x - a, 2 * y - b); };
    function link(a, b) { const A = ensure(a), B = ensure(b); if (!A.links.includes(b)) A.links.push(b); if (!B.links.includes(a)) B.links.push(a); }
    link(S.shed[0], S.shed[1]);
    S.track.get(S.shed[0]).shed = S.track.get(S.shed[1]).shed = true;

    // ---- routing: plain rails go through, crossings go straight over, points send trunk traffic down the set branch
    function branches(n) { const others = n.links.filter((l) => l !== n.trunk); const st = others.find((o) => o === opp(keyOf(n), n.trunk)); return st ? [st, others.find((o) => o !== st)] : others; }
    const keyOf = (n) => n.k;
    function next(c, from) {
      const n = cell(c); if (!n) return null;
      const L = n.links;
      if (L.length === 2) return L[0] === from ? L[1] : L[1] === from ? L[0] : null;
      if (L.length === 4) { const o = opp(c, from); return L.includes(o) ? o : null; }
      if (L.length === 3) { if (from === n.trunk) return branches(n)[n.pt]; return L.includes(from) ? n.trunk : null; }
      return null;
    }
    function walk(c, from, steps) { // follow the route; returns {ok, at} where at is the first dead end
      const seen = new Set();
      for (let i = 0; i < steps; i++) { const s = from + '>' + c; if (seen.has(s)) return { ok: true }; seen.add(s); const n = next(c, from); if (!n || !cell(n)) return { ok: false, at: c }; from = c; c = n; }
      return { ok: true };
    }
    const routeOK = () => S.track.has(E.c) && S.track.has(E.n) && next(E.c, E.p) === E.n && walk(E.n, E.c, S.track.size * 8 + 20).ok;
    function ahead(a, b) { // how many cells along the current route from a to b (Infinity if it never gets there)
      let p = E.p, c = E.c; for (let i = 0; i < S.track.size * 4 + 10; i++) { if (c === a) break; const n = next(c, p); if (!n) return Infinity; p = c; c = n; }
      if (c !== a) return Infinity;
      for (let i = 1; i < S.track.size * 4 + 10; i++) { const n = next(c, p); if (!n) return Infinity; p = c; c = n; if (c === b) return i; if (c === a) return Infinity; }
      return Infinity;
    }
    function routePrevNext(a) { let p = E.p, c = E.c; for (let i = 0; i < S.track.size * 4 + 10; i++) { const n = next(c, p); if (!n) return null; if (c === a) return [p, n]; p = c; c = n; } return null; }

    // ---- the engine moves cell to cell along entry/exit midpoints; cars follow its trail
    const ctr = (k) => { const [c, r] = unkey(k); return [c + 0.5, r + 0.5]; };
    function seg(p, c, n) {
      const P = ctr(p), C = ctr(c), Nn = ctr(n), a = [(P[0] + C[0]) / 2, (P[1] + C[1]) / 2], b = [(C[0] + Nn[0]) / 2, (C[1] + Nn[1]) / 2];
      if (Math.abs((C[0] - P[0]) * (Nn[1] - C[1]) - (C[1] - P[1]) * (Nn[0] - C[0])) < 1e-9) return { len: 1, at: (t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t] };
      const o = [a[0] + b[0] - C[0], a[1] + b[1] - C[1]], a0 = Math.atan2(a[1] - o[1], a[0] - o[0]); let d = Math.atan2(b[1] - o[1], b[0] - o[0]) - a0; d = Math.atan2(Math.sin(d), Math.cos(d));
      return { len: Math.PI / 4, at: (t) => [o[0] + Math.cos(a0 + d * t) * 0.5, o[1] + Math.sin(a0 + d * t) * 0.5] };
    }
    const E = { p: null, c: null, n: null, t: 0, d: 0 };
    const trail = []; let carCells = [];
    function advance(dist, live) {
      while (dist > 1e-9) {
        const s = seg(E.p, E.c, E.n), rem = (1 - E.t) * s.len;
        if (dist < rem) { E.t += dist / s.len; E.d += dist; dist = 0; }
        else {
          dist -= rem; E.d += rem; E.t = 0; E.p = E.c; E.c = E.n; const nx = next(E.c, E.p);
          if (!nx) { reseat(); return; } // only if the line broke under the train
          E.n = nx; if (live) enterCell(E.c, E.p);
        }
        const [x, y] = seg(E.p, E.c, E.n).at(E.t); trail.push({ x, y, d: E.d });
      }
      while (trail.length > 2 && trail[1].d < E.d - (S.cars.length + 5) * CAR_GAP) trail.shift();
    }
    function trailAt(d) {
      let i = trail.length - 1; while (i > 0 && trail[i - 1].d > d) i--;
      const b = trail[i], a = trail[Math.max(0, i - 1)], f = b.d - a.d > 1e-9 ? Math.max(0, Math.min(1, (d - a.d) / (b.d - a.d))) : 1;
      return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f, a: Math.atan2(b.y - a.y, b.x - a.x) };
    }
    const carPos = (i) => trailAt(E.d - (i + 1) * CAR_GAP); // i = -1 is the engine
    function reseat() { // put the train back on a running loop (after the line under it changed)
      const tryAt = (p, c) => { const n = next(c, p); if (!n || !cell(n)) return false; const w = walk(n, c, S.track.size * 8 + 20); if (!w.ok) return false; Object.assign(E, { p, c, n, t: 0 }); return true; };
      if (S.track.has(E.c) && S.track.has(E.n) && next(E.c, E.p) === E.n && routeOK()) return true;
      const cands = [...S.shed, ...S.track.keys()];
      for (const c of cands) for (const p of cell(c).links) if (tryAt(p, c)) { trail.length = 0; for (let i = 0; i < 70; i++) advance(0.1, false); return true; }
      for (const c of cands) for (const p of cell(c).links) if (tryAt(opp(c, p), c)) { trail.length = 0; for (let i = 0; i < 70; i++) advance(0.1, false); return true; }
      return false;
    }
    E.p = S.shed[0]; E.c = S.shed[1]; E.n = key(5, 7); E.t = 0.5; E.d = 3; // parked in the shed until there's a loop to run
    for (let x = 1.5; x <= 4.51; x += 0.25) trail.push({ x, y: 7.5, d: x - 1.5 });

    // ---- marbles head for the base on a flow field; rails cost extra to hop
    let field = new Map();
    function flow() {
      field = new Map(); const q = [];
      for (const k of S.base) { field.set(k, 0); q.push(k); }
      while (q.length) {
        q.sort((a, b) => field.get(a) - field.get(b)); const k = q.shift(), [c, r] = unkey(k), base = field.get(k);
        for (const [dc, dr] of N4) { const nc = c + dc, nr = r + dr, nk = key(nc, nr); if (!inside(nc, nr)) continue;
          const v = base + (S.track.has(nk) ? 4 : S.gadgets.has(nk) ? 2 : 1); if (v < (field.get(nk) ?? Infinity)) { field.set(nk, v); q.push(nk); } }
      }
    }
    flow();
    function spawn(type) {
      const T = MARBLES[type], side = Math.floor(rnd() * 4), u = rnd(), hp = T.hp * (1 + 1.1 * (S.wave - 1));
      const [x, y] = side === 0 ? [u * COLS, -0.4] : side === 1 ? [COLS + 0.4, u * ROWS] : side === 2 ? [u * COLS, ROWS + 0.4] : [-0.4, u * ROWS];
      const c = Math.max(0, Math.min(COLS - 1, Math.floor(x))), r = Math.max(0, Math.min(ROWS - 1, Math.floor(y)));
      S.enemies.push({ type, T, x, y, tx: c + 0.5, ty: r + 0.5, hp, max: hp, flash: 0, age: rnd() * 9, vx: 0, vy: 1, hits: {} });
    }
    function stepEnemies(dt) {
      for (const m of S.enemies) {
        m.age += dt; m.flash = Math.max(0, m.flash - dt);
        if (m.kx) { const k = Math.min(1, dt * 8); m.x += m.kx * k; m.y += m.ky * k; m.kx *= 1 - k; m.ky *= 1 - k; if (Math.abs(m.kx) + Math.abs(m.ky) < 0.01) m.kx = m.ky = 0; continue; }
        const here = key(Math.floor(m.x), Math.floor(m.y)); m.onRail = S.track.has(here);
        const v = m.T.spd * (m.onRail ? (m.T.hop ? 0.8 : 0.35) : 1);
        const dx = m.tx - m.x, dy = m.ty - m.y, d = Math.hypot(dx, dy);
        if (d > 0.02) { const s = Math.min(d, v * dt); m.x += dx / d * s; m.y += dy / d * s; m.vx = dx / d; m.vy = dy / d; continue; }
        const ck = key(Math.floor(m.tx), Math.floor(m.ty));
        if (S.base.has(ck)) { m.dead = true; S.hp = Math.max(0, S.hp - m.T.dmg); fx.text(m.x, m.y - 0.4, `-${m.T.dmg} ♥`, '#ff5a4e', 0.42); fx.shake = 7; sfx.boom(); if (!S.hp) { S.over = true; S.phase = 'over'; sfx.end(); } continue; }
        const [c, r] = unkey(ck); let best = null, bv = Infinity;
        for (const [dc, dr] of N4) { const f = field.get(key(c + dc, r + dr)); if (f == null) continue; const v2 = f + rnd() * 0.3; if (v2 < bv) { bv = v2; best = [c + dc, r + dr]; } }
        if (best) { m.tx = best[0] + 0.5; m.ty = best[1] + 0.5; }
      }
    }
    const mult = () => 1 + 0.06 * Math.min(30, S.combo); // combo = gadget firings in the last 2.5 s: a busy machine hits harder
    function hurt(m, dmg, pierce) {
      if (m.dead) return; const eff = (pierce ? dmg : dmg - (m.T.armor || 0)) * mult();
      if (eff <= 0.05) { sfx.tone(2400, 0.03, 'square', 0.02); return; }
      m.hp -= eff; m.flash = 0.1;
      if (m.hp <= 0) { m.dead = true; S.pops++; S.coins += m.T.coins; fx.burst(m.x, m.y, 9, [m.T.col, m.T.hi, '#ffffff']); sfx.pop(m.type === 'bouncer' ? 1.5 : m.type === 'bruiser' ? 0.6 : 1); }
    }
    const near = (x, y, r) => S.enemies.filter((m) => !m.dead && Math.hypot(m.x - x, m.y - y) <= r + m.T.r);

    // ---- gadgets: a car rolling onto a rail fires every gadget beside that rail (after a beat, so you can see why)
    function enterCell(k, from, car = -1) {
      const n = cell(k); if (!n) return;
      if (car === -1) {
        if (n.piece === 'booster') { S.boost = 2.5; fx.text(...ctr(k), 'WHOOSH', '#9be7ff', 0.26); sfx.tone(500, 0.15, 'sawtooth', 0.04, 2.2); }
        if (n.piece === 'auto' && n.links.length === 3 && from === n.trunk) S.pending.push({ at: S.t + 0.3, auto: k });
      }
    }
    function carRolled(i, k) { // car i (-1 = engine) just rolled onto rail k
      S.flash = S.flash || {}; S.flash[k] = 0.25;
      const twice = i >= 0 && S.cars[i] === 'spark';
      for (const [dc, dr] of N4) { const [c, r] = unkey(k), gk = key(c + dc, r + dr), G = S.gadgets.get(gk); if (!G || G.cd > S.t) continue;
        G.cd = S.t + 0.18; S.pending.push({ at: S.t + 0.09, g: gk, from: k }); if (twice) S.pending.push({ at: S.t + 0.24, g: gk, from: k, spark: true }); }
    }
    function fire(gk, from, echo) {
      const G = S.gadgets.get(gk); if (!G) return; const [x, y] = ctr(gk);
      S.hits.push(S.t); S.combo = S.hits.length; S.best = Math.max(S.best, S.combo); G.kick = 0.2;
      if (from) fx.spark(...ctr(from), x, y, echo ? '#ffd23f' : '#fff3a0');
      if (G.type === 'cannon') {
        let best = null, bd = GADGETS.cannon.range; for (const m of S.enemies) { const d = Math.hypot(m.x - x, m.y - y); if (!m.dead && d < bd) { bd = d; best = m; } }
        if (best) { G.aim = Math.atan2(best.y - y, best.x - x); S.shots.push({ x, y, m: best, t: 0, dmg: 3 }); sfx.hit(); } else sfx.tone(300, 0.05, 'square', 0.03);
      } else if (G.type === 'hammer') { for (const m of near(x, y, GADGETS.hammer.range)) hurt(m, 4, true); fx.ring(x, y, GADGETS.hammer.range, '#ffd23f'); sfx.boom(); fx.shake = Math.max(fx.shake, 2); }
      else if (G.type === 'bumper') {
        for (const m of near(x, y, GADGETS.bumper.range)) { const bx = m.x - 4, by = m.y - 6, l = Math.hypot(bx, by) || 1; m.kx = bx / l * 1.1; m.ky = by / l * 1.1; hurt(m, 1, true); const c = Math.floor(m.x + m.kx), r = Math.floor(m.y + m.ky); m.tx = Math.max(0, Math.min(COLS - 1, c)) + 0.5; m.ty = Math.max(0, Math.min(ROWS - 1, r)) + 0.5; }
        fx.ring(x, y, GADGETS.bumper.range, '#ff7a6b'); sfx.tone(180, 0.12, 'triangle', 0.1, 2);
      } else if (G.type === 'bell') {
        sfx.ding(); fx.ring(x, y, 0.6, '#ffd23f');
        const targets = []; for (let i = S.fired.length - 1; i >= 0 && targets.length < 2; i--) if (!targets.includes(S.fired[i]) && S.gadgets.has(S.fired[i])) targets.push(S.fired[i]);
        for (const t of targets) S.pending.push({ at: S.t + 0.12, g: t, from: gk, echo: true });
        return;
      }
      if (!echo) { S.fired.push(gk); if (S.fired.length > 6) S.fired.shift(); }
    }

    // ---- the train
    const speed = () => 2.3 * (1 + 0.25 * S.cars.filter((k) => k === 'coal').length) / (1 + 0.06 * S.cars.length) * (S.boost > 0 ? 1.6 : 1);
    const cool = [];
    function stepTrain(dt) {
      S.boost = Math.max(0, S.boost - dt);
      advance(speed() * dt, true);
      if (rnd() < dt * 5) { const e = carPos(-1); fx.puff(e.x, e.y); }
      for (let i = -1; i < S.cars.length; i++) { // which rail each car is on; rolling onto a new one sets off the gadgets beside it
        const p = carPos(i), k = key(Math.floor(p.x), Math.floor(p.y));
        if (carCells[i + 1] !== k) { carCells[i + 1] = k; if (S.track.has(k)) carRolled(i, k); }
      }
      S.cars.forEach((type, i) => {
        if (type !== 'gun') return; cool[i] = (cool[i] || 0) - dt; if (cool[i] > 0) return;
        const p = carPos(i); let best = null, bd = 2.2; for (const m of S.enemies) { const d = Math.hypot(m.x - p.x, m.y - p.y); if (!m.dead && d < bd) { bd = d; best = m; } }
        if (best) { cool[i] = 0.5; hurt(best, 1, false); S.tracers = S.tracers || []; S.tracers.push({ x: p.x, y: p.y, x2: best.x, y2: best.y, t: 0.07 }); S.aims = S.aims || {}; S.aims[i] = Math.atan2(best.y - p.y, best.x - p.x); sfx.tone(1100, 0.03, 'square', 0.02, 0.6); }
      });
    }
    function stepShots(dt) {
      for (const s of S.shots) { s.t += dt; if (s.t >= 0.16 && !s.done) { s.done = true; if (!s.m.dead) { hurt(s.m, s.dmg, false); fx.burst(s.m.x, s.m.y, 4, ['#3b3b44', '#ffd23f']); } } }
      S.shots = S.shots.filter((s) => s.t < 0.2);
      if (S.tracers) { for (const t of S.tracers) t.t -= dt; S.tracers = S.tracers.filter((t) => t.t > 0); }
      if (S.flash) for (const k in S.flash) { S.flash[k] -= dt; if (S.flash[k] <= 0) delete S.flash[k]; }
      for (const G of S.gadgets.values()) G.kick = Math.max(0, (G.kick || 0) - dt);
      S.pending.sort((a, b) => a.at - b.at);
      while (S.pending.length && S.pending[0].at <= S.t) {
        const p = S.pending.shift();
        if (p.auto) { const n = cell(p.auto); if (n && n.links.length === 3) { n.pt ^= 1; if (!routeOK()) n.pt ^= 1; } }
        else fire(p.g, p.from, p.echo);
      }
      while (S.hits.length && S.hits[0] < S.t - 2.5) S.hits.shift(); S.combo = S.hits.length;
    }

    // ---- waves
    function send() {
      if (S.phase !== 'build') return 'Wait for this wave to finish.';
      if (!reseat()) return 'Close the loop: the train needs a line that comes back round without a dead end.';
      S.wave++; S.phase = 'wave'; S.waveT = 0; S.hits = []; S.combo = 0; S.built = [];
      const list = []; for (const [t, n] of Object.entries(WAVES[S.wave - 1])) for (let i = 0; i < n; i++) list.push(t);
      for (let i = list.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [list[i], list[j]] = [list[j], list[i]]; }
      S.spawnQ = list.map((type, i) => ({ type, at: 0.4 + i * Math.max(0.35, 0.8 - S.wave * 0.07) }));
      sfx.ding(); return '';
    }
    function waveDone() {
      const bonus = 25 + 5 * S.wave; S.coins += bonus; fx.text(4, 4.2, `Wave ${S.wave} held! +${bonus}🪙`, '#ffffff', 0.45); sfx.coin();
      if (S.wave >= WAVES.length) { S.over = true; S.won = true; S.phase = 'over'; sfx.win(); return; }
      S.phase = 'build';
    }

    // ---- building
    const free = (k) => { const [c, r] = unkey(k); return inside(c, r) && !S.track.has(k) && !S.base.has(k) && !S.gadgets.has(k); };
    const straight = (n, k) => n.links.length === 2 && n.links[0] === opp(k, n.links[1]);
    function checkStroke(path) { // path: list of [c,r] from a rail outwards
      if (S.phase !== 'build') return 'Lay track between waves.';
      if (path.length < 2) return '';
      const ks = path.map((p) => key(...p)), a = cell(ks[0]);
      if (!a) return 'Start drawing from the rails (or the engine shed).';
      if (a.links.length >= 3) return 'Can\'t branch off points or a bridge.';
      let cost = 0;
      for (let i = 1; i < ks.length; i++) {
        const [c0, r0] = path[i - 1], [c1, r1] = path[i]; if (Math.abs(c1 - c0) + Math.abs(r1 - r0) !== 1) return 'Keep the track joined up.';
        if (ks.indexOf(ks[i]) !== i) return 'Track can\'t loop back on this stroke.';
        const k = ks[i], n = cell(k), last = i === ks.length - 1;
        if (S.base.has(k)) return 'Not through the base!';
        if (!inside(c1, r1)) return 'Stay on the mat.';
        if (S.gadgets.has(k)) return 'There\'s a gadget in the way.';
        if (!n) { cost += RAIL; continue; }
        if (n.links.includes(ks[i - 1])) return 'That\'s already joined.';
        if (last) { if (n.links.length >= 3) return 'Can\'t join onto points or a bridge.'; continue; }
        // passing through an existing rail: only straight across a straight one (a bridge)
        if (!straight(n, k) || ks[i + 1] !== opp(k, ks[i - 1]) || n.links.includes(ks[i + 1])) return 'Cross other track straight over a straight rail (that makes a bridge).';
      }
      if (cost > S.coins) return `That needs ${cost}🪙; you have ${S.coins}.`;
      return '';
    }
    function lay(path) {
      const err = checkStroke(path); if (err) { sfx.nope(); return err; }
      if (path.length < 2) return '';
      const ks = path.map((p) => key(...p)), was = new Map(ks.map((k) => [k, cell(k) ? [...cell(k).links] : null]));
      const hadRoute = routeOK(), A = ks[0], B = ks[ks.length - 1]; // read the route before the new links change it
      const pre = { [A]: hadRoute ? routePrevNext(A) : null, [B]: hadRoute ? routePrevNext(B) : null }, aFirst = hadRoute && ahead(A, B) <= ahead(B, A);
      for (let i = 1; i < ks.length; i++) { if (!cell(ks[i])) S.coins -= RAIL; link(ks[i - 1], ks[i]); }
      for (const k of ks) { const n = cell(k); n.k = k; }
      // new points: keep the old way through, and face them so the train can actually take the new branch
      const ends = [ks[0], ks[ks.length - 1]].filter((k) => cell(k).links.length === 3);
      for (const k of ends) {
        const n = cell(k), old = was.get(k) || [], nw = n.links.find((l) => !old.includes(l)), pn = pre[k];
        let trunk;
        if (pn) {
          const otherOn = !!pre[k === A ? B : A];
          const diverge = !otherOn || (k === A) === aFirst; // the end the train reaches first branches off; the other merges back
          trunk = diverge ? pn[0] : pn[1];
          n.pt = otherOn ? 1 : 0; // (1 = take the new track; a spur that doesn't come back yet stays off)
        } else { trunk = old.find((l) => old.includes(opp(k, l))) || old[0]; n.pt = 0; }
        n.trunk = trunk; if (n.piece === 'booster') { n.piece = null; S.coins += PIECES.booster.cost; }
        const bi = branches(n).indexOf(nw); if (bi >= 0) n.pt = n.pt ? bi : 1 - bi; // a new loop gets used straight away; a spur waits
      }
      for (const k of ks) { const n = cell(k); if (n.links.length === 4) n.bridge = n.bridge || (was.get(k) ? was.get(k)[0] : null); }
      (S.built = S.built || []).push(ks);
      if (routeOK() && trail.length > 2) { /* keep running */ } else reseat();
      flow(); sfx.buy(); return '';
    }
    function erase(k) {
      const G = S.gadgets.get(k);
      if (G) { S.gadgets.delete(k); S.coins += S.phase === 'build' ? G.paid : Math.floor(G.paid * 0.7); flow(); sfx.coin(); return ''; }
      const n = cell(k); if (!n) return '';
      if (n.piece) { S.coins += PIECES[n.piece].cost; n.piece = null; sfx.coin(); return ''; }
      if (S.phase !== 'build') return 'Rails can only come up between waves.';
      if (n.shed) return 'The engine shed stays.';
      for (const l of n.links) { const m = cell(l); m.links = m.links.filter((x) => x !== k); if (m.links.length < 3) { m.trunk = null; if (m.piece === 'auto') { S.coins += PIECES.auto.cost; m.piece = null; } }
        if (m.links.length === 3 && !m.trunk) { m.trunk = m.links.find((x) => m.links.includes(opp(l, x))); m.pt = 0; } if (m.links.length < 4) m.bridge = null; }
      S.track.delete(k); S.coins += RAIL; reseat(); flow(); sfx.coin(); return '';
    }
    function place(type, k) {
      const [c, r] = unkey(k);
      if (GADGETS[type]) {
        if (!inside(c, r) || S.track.has(k) || S.base.has(k) || S.gadgets.has(k)) return 'Gadgets go on open grass beside the rails.';
        if (!N4.some(([dc, dr]) => S.track.has(key(c + dc, r + dr)))) return 'Put it right next to a rail so the train can set it off.';
        const cost = GADGETS[type].cost; if (S.coins < cost) return `Needs ${cost}🪙.`;
        S.coins -= cost; S.gadgets.set(k, { type, paid: cost, cd: 0, kick: 0.3 }); flow(); sfx.buy(); return '';
      }
      if (PIECES[type]) {
        const n = cell(k); if (!n) return 'Pieces go on the rails.';
        if (S.phase !== 'build') return 'Fit track pieces between waves.';
        if (n.piece) return 'There\'s already a piece there.';
        if (type === 'booster' && !straight(n, k)) return 'Boosters go on a straight rail.';
        if (type === 'auto' && n.links.length !== 3) return 'Auto-points go on points (where track branches).';
        const cost = PIECES[type].cost; if (S.coins < cost) return `Needs ${cost}🪙.`;
        S.coins -= cost; n.piece = type; sfx.buy(); return '';
      }
      if (CARS[type]) {
        if (S.phase !== 'build') return 'Add cars between waves.';
        if (S.cars.length >= 6) return 'The train is as long as it gets (6 cars).';
        const cost = CARS[type].cost; if (S.coins < cost) return `Needs ${cost}🪙.`;
        S.coins -= cost; S.cars.push(type); sfx.buy(); return '';
      }
      return '';
    }
    function flip(k) {
      const n = cell(k); if (!n || n.links.length !== 3) return false;
      n.pt ^= 1; if (S.track.has(E.c) && !routeOK()) { n.pt ^= 1; S.msg = 'That way is a dead end.'; sfx.nope(); return true; }
      if (E.c === k && E.t < 0.02) E.n = next(E.c, E.p);
      sfx.tone(700, 0.05, 'square', 0.05); sfx.tone(1050, 0.05, 'square', 0.04, 1, 0.04); return true;
    }
    function swap(i, j) { if (S.phase === 'wave' || i === j || !S.cars[i] || !S.cars[j]) return false; [S.cars[i], S.cars[j]] = [S.cars[j], S.cars[i]]; sfx.pop(1.3); return true; }
    function sellCar(i) { if (S.phase !== 'build' || !S.cars[i]) return false; S.coins += CARS[S.cars[i]].cost; S.cars.splice(i, 1); sfx.coin(); return true; }

    function update(dt) {
      for (let s = 0; s < S.speed && !S.over; s++) {
        S.t += dt;
        if (S.phase === 'wave') {
          S.waveT += dt; while (S.spawnQ.length && S.spawnQ[0].at <= S.waveT) spawn(S.spawnQ.shift().type);
          stepTrain(dt); stepEnemies(dt);
          S.enemies = S.enemies.filter((m) => !m.dead);
          if (!S.spawnQ.length && !S.enemies.length && !S.over) waveDone();
        }
        stepShots(dt);
      }
    }
    return { S, E, update, send, lay, erase, place, flip, swap, sellCar, checkStroke, carPos, seg, next, ctr, speed, routeOK, reseat, branches, mult };
  }

  if (typeof window === 'undefined') { module.exports = { createGame, GADGETS, PIECES, CARS, MARBLES, WAVES, COLS, ROWS, key, unkey }; return; }
  window.LoopLine = { createGame, GADGETS, PIECES, CARS, MARBLES, WAVES, COLS, ROWS, key, unkey, TAU, CAR_GAP };
})();
