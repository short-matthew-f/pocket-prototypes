// Loop Line: a test of "your towers are train cars". You lay track (drag a detour off the loop and back on), the train
// runs it, and each car is a tower. Marbles roll freely down the mat towards the depot; rails are a slow wall they have
// to hop, so track is both maze and weapon. Car order matters (Mirror copies the car in front, Plough hits double up
// front), and every lap through the station adds to the multiplier for the rest of the wave.
// createGame() is DOM-free so test.js can drive it in node; the app code below it needs a browser.
(function () {
  'use strict';
  const TAU = Math.PI * 2, COLS = 8, ROWS = 12, CAR_GAP = 0.92;
  const key = (c, r) => c + ',' + r, unkey = (k) => k.split(',').map(Number);
  const N4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];

  const CARS = {
    gun: { name: 'Gun car', icon: '🔫', col: '#3d7fd9', blurb: 'Fires at the nearest marble in range.' },
    plough: { name: 'Plough', icon: '⛏', col: '#f2b632', blurb: 'Bashes marbles beside the rails, harder if they\'re on them. Double damage right behind the engine.' },
    coal: { name: 'Coal car', icon: '⚫', col: '#3b3b44', blurb: 'No weapon. The whole train runs 25% faster.' },
    mirror: { name: 'Mirror car', icon: '🪞', col: '#b9c6d6', blurb: 'Copies whatever car is in front of it.' },
  };
  const MARBLES = {
    plodder: { name: 'Plodder', hp: 3, spd: 0.7, r: 0.22, dmg: 1, col: '#e8834f', hi: '#ffc39e' },
    bouncer: { name: 'Bouncer', hp: 3, spd: 1.25, r: 0.2, dmg: 1, hop: true, col: '#ec5b9a', hi: '#ffb3d3' },
    bruiser: { name: 'Bruiser', hp: 10, spd: 0.55, r: 0.27, dmg: 3, armor: 1, col: '#8d97a5', hi: '#eef2f7' },
  };
  const WAVES = [
    { plodder: 8 },
    { plodder: 10, bouncer: 4 },
    { plodder: 8, bouncer: 8, bruiser: 2 },
    { plodder: 10, bouncer: 8, bruiser: 5 },
    { plodder: 14, bouncer: 12, bruiser: 8 },
  ];
  const DEPOT = [[2, 11], [3, 11], [4, 11], [5, 11]];

  function createGame(env = {}) {
    const sfx = env.sfx || new Proxy({}, { get: () => () => false }), fx = env.fx || { burst() {}, text() {}, puff() {} };
    let seed = env.seed || 1; const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
    const S = { track: new Map(), depot: new Set(DEPOT.map(([c, r]) => key(c, r))), station: key(2, 6), cars: ['gun', 'plough'], enemies: [], tracers: [],
      wave: 0, phase: 'build', rails: 9, hp: 20, laps: 0, mult: 1, spawnQ: [], waveT: 0, speed: 1, draft: null, built: [], over: false, won: false, t: 0 };
    const node = (k) => { let n = S.track.get(k); if (!n) S.track.set(k, (n = { ins: [], outs: [], pt: 0 })); return n; };
    const link = (a, b) => { node(a).outs.push(b); node(b).ins.push(a); };

    // the starting loop: a 4 x 5 rectangle, clockwise, with the station on its left side
    const ring = []; for (let c = 2; c <= 5; c++) ring.push([c, 4]); for (let r = 5; r <= 8; r++) ring.push([5, r]); for (let c = 4; c >= 2; c--) ring.push([c, 8]); for (let r = 7; r >= 5; r--) ring.push([2, r]);
    ring.forEach(([c, r], i) => link(key(c, r), key(...ring[(i + 1) % ring.length])));

    // ---- moving along the track: each cell is a straight or a quarter circle from one edge midpoint to the next
    const ctr = (k) => { const [c, r] = unkey(k); return [c + 0.5, r + 0.5]; };
    function seg(p, c, n) {
      const P = ctr(p), C = ctr(c), Nn = ctr(n), a = [(P[0] + C[0]) / 2, (P[1] + C[1]) / 2], b = [(C[0] + Nn[0]) / 2, (C[1] + Nn[1]) / 2];
      if (Math.abs((C[0] - P[0]) * (Nn[1] - C[1]) - (C[1] - P[1]) * (Nn[0] - C[0])) < 1e-9) return { len: 1, at: (t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t] };
      const o = [a[0] + b[0] - C[0], a[1] + b[1] - C[1]], a0 = Math.atan2(a[1] - o[1], a[0] - o[0]); let d = Math.atan2(b[1] - o[1], b[0] - o[0]) - a0; d = Math.atan2(Math.sin(d), Math.cos(d));
      return { len: Math.PI / 4, at: (t) => [o[0] + Math.cos(a0 + d * t) * 0.5, o[1] + Math.sin(a0 + d * t) * 0.5] };
    }
    const choose = (k) => { const n = S.track.get(k); return n.outs[n.outs.length > 1 ? n.pt : 0]; };
    const E = { p: key(2, 5), c: key(2, 4), n: key(3, 4), t: 0, d: 0 }; // the engine: previous, current, next cell
    const trail = [];
    function advance(dist) {
      while (dist > 1e-9) {
        const s = seg(E.p, E.c, E.n), rem = (1 - E.t) * s.len;
        if (dist < rem) { E.t += dist / s.len; E.d += dist; dist = 0; }
        else { dist -= rem; E.d += rem; E.t = 0; E.p = E.c; E.c = E.n; E.n = choose(E.c); if (E.c === S.station && S.phase === 'wave') lap(); }
        const [x, y] = seg(E.p, E.c, E.n).at(E.t); trail.push({ x, y, d: E.d });
      }
      while (trail.length > 2 && trail[1].d < E.d - (S.cars.length + 5) * CAR_GAP) trail.shift();
    }
    function trailAt(d) { // position and heading this far back along the trail
      let i = trail.length - 1; while (i > 0 && trail[i - 1].d > d) i--;
      const b = trail[i], a = trail[Math.max(0, i - 1)], f = b.d - a.d > 1e-9 ? Math.max(0, Math.min(1, (d - a.d) / (b.d - a.d))) : 1;
      return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f, a: Math.atan2(b.y - a.y, b.x - a.x) };
    }
    for (let i = 0; i < 80; i++) advance(0.1); // run in so the cars have somewhere to sit
    const lap = () => { // a lap adds to the multiplier in proportion to its length, so a long loop isn't a worse loop
      const add = Math.max(0.1, Math.round((E.d - (S.lapD ?? E.d - 14)) * 0.035 * 10) / 10); S.lapD = E.d; S.laps++;
      S.mult = Math.round((S.mult + add) * 10) / 10; fx.text(...ctr(S.station), `+×${add}`, '#ffffff', 0.5); sfx.ding();
    };
    function carPos(i) { return i < 0 ? { ...trailAt(E.d), engine: true } : trailAt(E.d - (i + 1) * CAR_GAP); }

    // ---- marbles find the cheapest way to the depot: grass costs 1, hopping rails costs 4
    let field = new Map();
    function flow() {
      field = new Map(); const q = [];
      for (const k of S.depot) { field.set(k, 0); q.push(k); }
      while (q.length) {
        q.sort((a, b) => field.get(a) - field.get(b)); const k = q.shift(), [c, r] = unkey(k), base = field.get(k);
        for (const [dc, dr] of N4) { const nc = c + dc, nr = r + dr, nk = key(nc, nr); if (nc < 0 || nr < 0 || nc >= COLS || nr >= ROWS) continue;
          const v = base + (S.track.has(nk) ? 4 : 1); if (v < (field.get(nk) ?? Infinity)) { field.set(nk, v); q.push(nk); } }
      }
    }
    flow();
    function spawn(type) {
      const T = MARBLES[type], c = Math.floor(rnd() * COLS), hp = Math.ceil(T.hp * (1 + 0.2 * (S.wave - 1)));
      S.enemies.push({ type, T, x: c + 0.5, y: -0.4, tx: c + 0.5, ty: 0.5, cell: null, hp, max: hp, flash: 0, age: rnd() * 9, hits: {} });
    }
    function stepEnemies(dt) {
      for (const m of S.enemies) {
        m.age += dt; m.flash = Math.max(0, m.flash - dt);
        const here = key(Math.floor(m.x), Math.floor(m.y)), onRail = S.track.has(here);
        m.onRail = onRail; const v = m.T.spd * (onRail ? (m.T.hop ? 0.8 : 0.35) : 1);
        const dx = m.tx - m.x, dy = m.ty - m.y, d = Math.hypot(dx, dy);
        if (d > 0.02) { const s = Math.min(d, v * dt); m.x += dx / d * s; m.y += dy / d * s; m.vx = dx / d; m.vy = dy / d; continue; }
        const ck = key(Math.floor(m.tx), Math.floor(m.ty));
        if (S.depot.has(ck)) { m.dead = true; S.hp = Math.max(0, S.hp - m.T.dmg); fx.text(m.x, m.y - 0.4, `-${m.T.dmg} ♥`, '#ff5a4e', 0.42); fx.shake = 6; sfx.boom(); if (!S.hp) { S.over = true; S.phase = 'over'; } continue; }
        const [c, r] = unkey(ck); let best = null, bv = Infinity;
        for (const [dc, dr] of N4) { const nk = key(c + dc, r + dr), f = field.get(nk); if (f != null && f + rnd() * 0.3 < bv) { bv = f + rnd() * 0.3; best = [c + dc, r + dr]; } }
        if (best) { m.tx = best[0] + 0.5; m.ty = best[1] + 0.5; }
      }
    }
    function hurt(m, dmg, pierce) {
      if (m.dead) return; const eff = pierce ? dmg : dmg - (m.T.armor || 0);
      if (eff <= 0) { sfx.tone(2400, 0.03, 'square', 0.02); return; }
      m.hp -= eff; m.flash = 0.1;
      if (m.hp <= 0) { m.dead = true; S.pops = (S.pops || 0) + 1; fx.burst(m.x, m.y, 9, [m.T.col, m.T.hi, '#ffffff']); sfx.pop(m.type === 'bouncer' ? 1.5 : m.type === 'bruiser' ? 0.6 : 1); }
    }

    // ---- the train: speed, and what each car does from where it sits
    const kind = (i) => { let k = S.cars[i]; while (k === 'mirror') { i--; if (i < 0) return null; k = S.cars[i]; } return k; };
    const speed = () => 2.7 * (1 + 0.25 * S.cars.filter((k) => k === 'coal').length) / (1 + 0.07 * S.cars.length);
    const cool = S.cars.map(() => 0);
    function stepTrain(dt) {
      advance(speed() * dt);
      if (Math.random() < dt * 4) { const e = carPos(-1); fx.puff(e.x, e.y); }
      while (cool.length < S.cars.length) cool.push(0);
      S.cars.forEach((_, i) => {
        const k = kind(i), p = carPos(i); cool[i] -= dt;
        if (k === 'gun' && cool[i] <= 0) {
          let best = null, bd = 2.5; for (const m of S.enemies) { const d = Math.hypot(m.x - p.x, m.y - p.y); if (!m.dead && d < bd) { bd = d; best = m; } }
          if (best) { cool[i] = 0.42; hurt(best, S.mult, false); S.tracers.push({ x: p.x, y: p.y, x2: best.x, y2: best.y, t: 0.08 }); p.aim = Math.atan2(best.y - p.y, best.x - p.x); S.aims = S.aims || {}; S.aims[i] = p.aim; sfx.tone(1100, 0.03, 'square', 0.02, 0.6); }
        } else if (k === 'plough') {
          for (const m of S.enemies) if (!m.dead && Math.hypot(m.x - p.x, m.y - p.y) < (m.onRail ? 0.5 : 0.85) && !(m.hits[i] > S.t)) {
            m.hits[i] = S.t + 0.6; hurt(m, (m.onRail ? 3 : 2) * S.mult * (i === 0 ? 2 : 1), true); fx.text(m.x, m.y - 0.3, 'BONK', '#ffd23f', 0.3); sfx.hit();
          }
        }
      });
      for (const tr of S.tracers) tr.t -= dt; S.tracers = S.tracers.filter((tr) => tr.t > 0);
    }

    // ---- waves and the draft between them
    function send() {
      if (S.phase !== 'build') return false;
      S.wave++; S.phase = 'wave'; S.waveT = 0; S.laps = 0; S.mult = 1; S.lapD = null; S.built = [];
      const list = []; for (const [t, n] of Object.entries(WAVES[S.wave - 1])) for (let i = 0; i < n; i++) list.push(t);
      for (let i = list.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [list[i], list[j]] = [list[j], list[i]]; }
      S.spawnQ = list.map((type, i) => ({ type, at: 0.3 + i * Math.max(0.45, 0.85 - S.wave * 0.08) }));
      sfx.ding(); return true;
    }
    function waveDone() {
      if (S.wave >= WAVES.length) { S.over = true; S.won = true; S.phase = 'over'; sfx.win(); return; }
      const pool = ['gun', 'plough', 'coal', 'mirror'], opts = [];
      while (opts.length < 3) { const k = pool[Math.floor(rnd() * pool.length)]; if (!opts.includes(k)) opts.push(k); }
      S.draft = opts; S.phase = 'draft'; S.rails += 6; sfx.coin();
    }
    function pick(k) { if (S.phase !== 'draft' || !S.draft.includes(k)) return false; S.cars.push(k); S.draft = null; S.phase = 'build'; sfx.buy(); return true; }

    // ---- building: a detour leaves the loop at one rail and rejoins it at another; the old way stays, behind points
    const inside = (c, r) => c >= 0 && r >= 0 && c < COLS && r < ROWS;
    function checkDetour(path) { // path: [[c,r], ...] from a rail, over grass, back onto a rail
      if (path.length < 3) return 'Drag off a rail, across the grass, and back onto a rail.';
      const a = key(...path[0]), b = key(...path[path.length - 1]), A = S.track.get(a), B = S.track.get(b);
      if (!A || A.outs.length !== 1 || A.ins.length !== 1) return 'Start from a plain bit of rail (not points).';
      if (!B || B.outs.length !== 1 || B.ins.length !== 1 || a === b) return 'End on a different plain bit of rail.';
      const mid = path.slice(1, -1);
      for (let i = 1; i < path.length; i++) if (Math.abs(path[i][0] - path[i - 1][0]) + Math.abs(path[i][1] - path[i - 1][1]) !== 1) return 'Keep the track joined up.';
      if (new Set(mid.map((p) => key(...p))).size !== mid.length) return 'Track can\'t cross itself.';
      for (const [c, r] of mid) { const k = key(c, r); if (!inside(c, r) || S.track.has(k) || S.depot.has(k)) return 'Only on open grass.'; }
      if (mid.length > S.rails) return `That needs ${mid.length} rails; you have ${S.rails}.`;
      return '';
    }
    function lay(path) {
      if (S.phase !== 'build') return 'Lay track between waves.';
      const err = checkDetour(path); if (err) { sfx.nope(); return err; }
      // whichever way it was drawn, the detour runs with the traffic and replaces the shorter stretch of line
      const ahead = (a, b) => { let k = a; for (let n = 1; n < 400; n++) { k = choose(k); if (k === b) return n; if (k === a) return Infinity; } return Infinity; };
      const a = key(...path[0]), b = key(...path[path.length - 1]);
      if (ahead(b, a) < ahead(a, b)) path = [...path].reverse();
      const ks = path.map((p) => key(...p));
      for (let i = 1; i < ks.length; i++) link(ks[i - 1], ks[i]);
      S.track.get(ks[0]).pt = 1; S.rails -= ks.length - 2; S.built.push(ks); flow(); sfx.buy();
      if (E.c === ks[0]) E.n = choose(E.c);
      return '';
    }
    function undo() {
      const ks = S.built.pop(); if (!ks || S.phase !== 'build') return false;
      for (let i = 1; i < ks.length; i++) { const a = S.track.get(ks[i - 1]), b = S.track.get(ks[i]); a.outs.splice(a.outs.indexOf(ks[i]), 1); b.ins.splice(b.ins.indexOf(ks[i - 1]), 1); }
      for (const k of ks.slice(1, -1)) S.track.delete(k);
      S.track.get(ks[0]).pt = 0; S.rails += ks.length - 2; flow();
      if (S.track.has(E.c) && !S.track.get(E.c).outs.includes(E.n)) E.n = choose(E.c);
      if (!S.track.has(E.c) || !S.track.has(E.p)) { trail.length = 0; Object.assign(E, { p: key(2, 5), c: key(2, 4), n: key(3, 4), t: 0 }); for (let i = 0; i < 80; i++) advance(0.1); }
      sfx.coin(); return true;
    }
    function flip(k) { const n = S.track.get(k); if (!n || n.outs.length < 2) return false; n.pt ^= 1; if (E.c === k && E.t < 0.05) E.n = choose(k); sfx.tone(700, 0.05, 'square', 0.05); sfx.tone(1050, 0.05, 'square', 0.04, 1, 0.04); return true; }
    function swap(i, j) { if (S.phase === 'wave' || i === j || !S.cars[i] || !S.cars[j]) return false; [S.cars[i], S.cars[j]] = [S.cars[j], S.cars[i]]; sfx.pop(1.3); return true; }

    function update(dt) {
      for (let s = 0; s < S.speed && !S.over; s++) {
        S.t += dt;
        if (S.phase === 'wave') {
          S.waveT += dt; while (S.spawnQ.length && S.spawnQ[0].at <= S.waveT) spawn(S.spawnQ.shift().type);
          stepTrain(dt); stepEnemies(dt);
          S.enemies = S.enemies.filter((m) => !m.dead);
          if (!S.spawnQ.length && !S.enemies.length && !S.over) waveDone();
        }
      }
    }
    return { S, update, send, pick, lay, undo, flip, swap, checkDetour, carPos, seg, choose, ctr, speed, kind, E };
  }

  if (typeof window === 'undefined') { module.exports = { createGame, CARS, MARBLES, WAVES, COLS, ROWS, key, unkey }; return; }

  // ================================================================= the app
  const $ = (s) => document.querySelector(s), K = window.Kit;
  const sfx = K ? K.sfx : new Proxy({}, { get: () => () => false });
  let game, cv, g, DPR = 1, W = 0, H = 0, T = 40, ox = 0, oy = 0, raf = 0, last = 0, sel = -1, drag = null, note = '', noteT = 0;
  const TOP = 50, UIH = 178;

  function makeFx() {
    let ps = [];
    return { shake: 0,
      burst(x, y, n, cols) { for (let i = 0; i < n; i++) { const a = Math.random() * TAU, v = 1.5 + Math.random() * 2.5; ps.push({ k: 'p', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 1.5, t: 0, life: 0.5 + Math.random() * 0.3, c: cols[i % cols.length], s: 0.05 + Math.random() * 0.05 }); } },
      text(x, y, s, c, size = 0.34) { ps.push({ k: 't', x, y, s, c, size, t: 0, life: 0.9 }); },
      puff(x, y) { ps.push({ k: 's', x: x + (Math.random() - 0.5) * 0.1, y, t: 0, life: 0.9 }); },
      update(dt) { for (const p of ps) p.t += dt; ps = ps.filter((p) => p.t < p.life); this.shake = Math.max(0, this.shake - dt * 30); },
      draw(g) {
        for (const p of ps) { const q = p.t / p.life;
          if (p.k === 's') { g.globalAlpha = 0.5 * (1 - q); g.fillStyle = '#ffffff'; g.beginPath(); g.arc(p.x + q * 0.3, p.y - q * 0.7, 0.08 + q * 0.16, 0, TAU); g.fill(); }
          else if (p.k === 'p') { g.globalAlpha = 1 - q; g.fillStyle = p.c; g.beginPath(); g.arc(p.x + p.vx * p.t, p.y + p.vy * p.t + 5 * p.t * p.t, p.s, 0, TAU); g.fill(); }
          else { g.globalAlpha = Math.min(1, (1 - q) * 2); g.font = `${p.size}px "Lilita One", system-ui`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineWidth = 0.07; g.strokeStyle = '#1d2a1a'; g.strokeText(p.s, p.x, p.y - q * 0.7); g.fillStyle = p.c; g.fillText(p.s, p.x, p.y - q * 0.7); } }
        g.globalAlpha = 1;
      } };
  }

  function start() {
    const fx = makeFx(); game = createGame({ sfx, fx, seed: (Math.random() * 1e9) | 0 }); game.fx = fx; sel = -1; drag = null;
    $('#modal').hidden = true; panel(true); layout(); last = performance.now(); cancelAnimationFrame(raf); raf = requestAnimationFrame(loop);
  }
  function layout() {
    DPR = Math.min(2, devicePixelRatio || 1); W = cv.clientWidth; H = cv.clientHeight; cv.width = W * DPR; cv.height = H * DPR;
    const uih = Math.max(UIH, $('#ui').offsetHeight); T = Math.min((W - 16) / COLS, (H - TOP - uih - 8) / ROWS); ox = (W - COLS * T) / 2; oy = TOP + 4;
  }
  function loop(now) {
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    try { game.update(dt); game.fx.update(dt); noteT -= dt; draw(); panel(); } catch (e) { console.error('[loop-line]', e); }
    if (game.S.over) return finish();
    raf = requestAnimationFrame(loop);
  }
  function finish() {
    const S = game.S; draw(); panel(true);
    $('#modal').innerHTML = `<div class="card"><h2>${S.won ? 'Depot saved!' : 'The depot fell'}</h2><p>${S.won ? `All ${WAVES.length} waves held with ${S.hp} ♥ left.` : `Wave ${S.wave} of ${WAVES.length} got through.`} ${S.pops || 0} marbles popped.</p><button type="button" class="big" data-again>Play again</button></div>`;
    $('#modal').hidden = false;
  }

  // ---- drawing
  function draw() {
    const S = game.S; g.setTransform(DPR, 0, 0, DPR, 0, 0);
    g.fillStyle = '#5daa4b'; g.fillRect(0, 0, W, H);
    g.save(); if (game.fx.shake) g.translate((Math.random() - 0.5) * game.fx.shake, (Math.random() - 0.5) * game.fx.shake);
    g.translate(ox, oy); g.scale(T, T);
    // the play mat
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) { g.fillStyle = (c + r) % 2 ? '#7cc35b' : '#86cc63'; g.fillRect(c, r, 1, 1); }
    g.strokeStyle = '#ffffff55'; g.lineWidth = 0.06; g.setLineDash([0.12, 0.12]); g.strokeRect(0.03, 0.03, COLS - 0.06, ROWS - 0.06); g.setLineDash([]);
    drawDepot(g);
    drawTrack(g, S);
    if (drag && drag.path.length > 1) drawDraft(g);
    for (const m of S.enemies) drawMarble(g, m);
    drawTrain(g, S);
    for (const tr of S.tracers) { g.strokeStyle = '#fff6b0'; g.lineWidth = 0.06; g.beginPath(); g.moveTo(tr.x, tr.y); g.lineTo(tr.x2, tr.y2); g.stroke(); }
    game.fx.draw(g);
    g.restore();
    // HUD
    g.fillStyle = '#2f6b2a'; g.fillRect(0, 0, W, TOP); g.fillStyle = '#24561f'; g.fillRect(0, TOP - 4, W, 4);
    g.textBaseline = 'middle'; g.font = '22px "Lilita One", system-ui'; g.textAlign = 'left';
    const hud = [[`Wave ${S.wave}/${WAVES.length}`, '#ffffff'], [`♥ ${S.hp}`, '#ff8a80'], [`🛤 ${S.rails}`, '#ffe08a'], [`×${S.mult}`, S.mult > 1 ? '#ffd23f' : '#cfe8c6']];
    let x = 12; for (const [s, c] of hud) { g.lineWidth = 4; g.strokeStyle = '#1d3d1a'; g.strokeText(s, x, TOP / 2 - 1); g.fillStyle = c; g.fillText(s, x, TOP / 2 - 1); x += g.measureText(s).width + 18; }
    if (noteT > 0 && note) { g.font = '600 14px Nunito, system-ui'; const w = Math.min(W - 24, g.measureText(note).width + 24); g.globalAlpha = Math.min(1, noteT * 2); g.fillStyle = '#1d3d1aee'; g.beginPath(); g.roundRect(W / 2 - w / 2, TOP + 10, w, 30, 15); g.fill(); g.fillStyle = '#fff'; g.textAlign = 'center'; g.fillText(note, W / 2, TOP + 25); g.globalAlpha = 1; }
  }
  function drawDepot(g) {
    g.fillStyle = '#c9a26b'; g.fillRect(2, 11.05, 4, 0.95); g.fillStyle = '#b08752'; g.fillRect(2, 11.05, 4, 0.12);
    [['#e2453c', 2.15], ['#3d7fd9', 3.1], ['#f2b632', 4.05], ['#8e5bd6', 5.0]].forEach(([roof, x0]) => {
      g.fillStyle = '#fff6e5'; g.fillRect(x0 + 0.1, 11.45, 0.65, 0.45); g.fillStyle = roof; g.beginPath(); g.moveTo(x0 + 0.02, 11.48); g.lineTo(x0 + 0.425, 11.18); g.lineTo(x0 + 0.83, 11.48); g.fill();
      g.fillStyle = '#6b4a2b'; g.fillRect(x0 + 0.36, 11.66, 0.14, 0.24);
    });
  }
  function railPts(S, p, c, n, off) { const s = game.seg(p, c, n), out = []; for (let i = 0; i <= 8; i++) { const t = i / 8, a = s.at(t), b = s.at(Math.min(1, t + 0.01)), b0 = s.at(Math.max(0, t - 0.01)), dx = b[0] - b0[0], dy = b[1] - b0[1], l = Math.hypot(dx, dy) || 1; out.push([a[0] - dy / l * off, a[1] + dx / l * off]); } return out; }
  function eachRun(S, fn) { for (const [k, n] of S.track) for (const p of n.ins) n.outs.forEach((o, j) => fn(p, k, o, n.outs.length > 1 ? j === n.pt : true, n.outs.length > 1)); }
  function drawTrack(g, S) {
    g.lineCap = 'round';
    eachRun(S, (p, c, n, live) => { // sleepers
      g.globalAlpha = live ? 1 : 0.45; g.strokeStyle = '#8a5a2e'; g.lineWidth = 0.1;
      const L = railPts(S, p, c, n, 0.27), R = railPts(S, p, c, n, -0.27); for (const i of [1, 4, 7]) { g.beginPath(); g.moveTo(...L[i]); g.lineTo(...R[i]); g.stroke(); }
    });
    eachRun(S, (p, c, n, live) => { // rails
      g.globalAlpha = live ? 1 : 0.45;
      for (const off of [0.16, -0.16]) { const pts = railPts(S, p, c, n, off); g.strokeStyle = '#4b5563'; g.lineWidth = 0.075; g.beginPath(); pts.forEach((q, i) => (i ? g.lineTo(...q) : g.moveTo(...q))); g.stroke(); g.strokeStyle = '#d1d9e2'; g.lineWidth = 0.03; g.stroke(); }
    });
    g.globalAlpha = 1;
    for (const [k, n] of S.track) if (n.outs.length > 1) { // points: a lever pointing down the live branch
      const [x, y] = game.ctr(k), [tx, ty] = game.ctr(n.outs[n.pt]), a = Math.atan2(ty - y, tx - x);
      g.fillStyle = '#ffffff'; g.strokeStyle = '#1d3d1a'; g.lineWidth = 0.05; g.beginPath(); g.arc(x, y, 0.2, 0, TAU); g.fill(); g.stroke();
      g.save(); g.translate(x, y); g.rotate(a); g.fillStyle = '#e2453c'; g.beginPath(); g.moveTo(0.16, 0); g.lineTo(-0.08, -0.11); g.lineTo(-0.08, 0.11); g.fill(); g.restore();
    }
    const [sx, sy] = game.ctr(S.station); // the station: a platform and a flag; each lap through it adds to the multiplier
    g.fillStyle = '#e8d9b5'; g.fillRect(sx - 0.98, sy - 0.42, 0.42, 0.84); g.strokeStyle = '#a88c5a'; g.lineWidth = 0.03; g.strokeRect(sx - 0.98, sy - 0.42, 0.42, 0.84);
    g.fillStyle = '#6b4a2b'; g.fillRect(sx - 0.8, sy - 0.62, 0.04, 0.5); g.fillStyle = '#ffd23f'; g.beginPath(); g.moveTo(sx - 0.76, sy - 0.62); g.lineTo(sx - 0.5, sy - 0.53); g.lineTo(sx - 0.76, sy - 0.44); g.fill();
    g.font = '0.17px "Lilita One", system-ui'; g.fillStyle = '#6b4a2b'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.save(); g.translate(sx - 0.77, sy + 0.05); g.rotate(-Math.PI / 2); g.fillText('LAP', 0, 0); g.restore();
  }
  function drawDraft(g) {
    const ok = !game.checkDetour(drag.path) || drag.path.length < 3;
    g.globalAlpha = 0.6; for (const [c, r] of drag.path.slice(1)) { g.fillStyle = ok ? '#ffffff' : '#ff5a4e'; g.beginPath(); g.roundRect(c + 0.12, r + 0.12, 0.76, 0.76, 0.18); g.fill(); }
    g.globalAlpha = 1; g.strokeStyle = ok ? '#ffffff' : '#ff5a4e'; g.lineWidth = 0.08; g.setLineDash([0.12, 0.1]); g.beginPath(); drag.path.forEach(([c, r], i) => (i ? g.lineTo(c + 0.5, r + 0.5) : g.moveTo(c + 0.5, r + 0.5))); g.stroke(); g.setLineDash([]);
    const n = Math.max(0, drag.path.length - 2), [c, r] = drag.path[drag.path.length - 1];
    g.font = '0.34px "Lilita One", system-ui'; g.textAlign = 'center'; g.lineWidth = 0.08; g.strokeStyle = '#1d3d1a'; g.strokeText(`${n}/${game.S.rails}`, c + 0.5, r - 0.15); g.fillStyle = n > game.S.rails ? '#ff5a4e' : '#ffffff'; g.fillText(`${n}/${game.S.rails}`, c + 0.5, r - 0.15);
  }
  function drawMarble(g, m) {
    const r = m.T.r, x = m.x, y = m.y - (m.onRail ? Math.abs(Math.sin(m.age * 12)) * 0.08 : 0);
    g.fillStyle = '#00000033'; g.beginPath(); g.ellipse(m.x + 0.03, m.y + 0.08, r, r * 0.7, 0, 0, TAU); g.fill();
    const gr = g.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.1, x, y, r); gr.addColorStop(0, m.T.hi); gr.addColorStop(1, m.T.col);
    g.fillStyle = m.flash > 0 ? '#ffffff' : gr; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill(); g.strokeStyle = '#00000055'; g.lineWidth = 0.025; g.stroke();
    const lx = (m.vx || 0) * r * 0.1, ly = (m.vy || 1) * r * 0.1; // eyes look where it's going
    for (const s of [-1, 1]) { g.fillStyle = '#fff'; g.beginPath(); g.arc(x + s * r * 0.33, y - r * 0.12, r * 0.24, 0, TAU); g.fill(); g.fillStyle = '#1a1a1a'; g.beginPath(); g.arc(x + s * r * 0.33 + lx, y - r * 0.12 + ly, r * 0.12, 0, TAU); g.fill(); }
    g.strokeStyle = '#1a1a1a'; g.lineWidth = r * 0.1; g.lineCap = 'round';
    if (m.type === 'bruiser') { g.beginPath(); g.moveTo(x - r * 0.55, y - r * 0.45); g.lineTo(x - r * 0.12, y - r * 0.3); g.moveTo(x + r * 0.55, y - r * 0.45); g.lineTo(x + r * 0.12, y - r * 0.3); g.stroke(); g.beginPath(); g.moveTo(x - r * 0.25, y + r * 0.42); g.lineTo(x + r * 0.25, y + r * 0.42); g.stroke(); }
    else if (m.type === 'bouncer') { g.beginPath(); g.arc(x, y + r * 0.25, r * 0.28, 0.15 * Math.PI, 0.85 * Math.PI); g.stroke(); }
    else { g.beginPath(); g.ellipse(x, y + r * 0.4, r * 0.14, r * 0.1, 0, 0, TAU); g.stroke(); }
    if (m.hp < m.max) { g.fillStyle = '#0008'; g.fillRect(x - r, y - r - 0.12, r * 2, 0.06); g.fillStyle = '#7ee08a'; g.fillRect(x - r, y - r - 0.12, r * 2 * m.hp / m.max, 0.06); }
  }
  function drawCar(g, p, col, len, wid, fn) {
    g.save(); g.translate(p.x, p.y); g.rotate(p.a);
    g.fillStyle = '#00000040'; g.beginPath(); g.roundRect(-len / 2 + 0.04, -wid / 2 + 0.07, len, wid, 0.1); g.fill();
    g.fillStyle = '#26262b'; for (const sx of [-len * 0.3, len * 0.3]) for (const sy of [-wid / 2, wid / 2]) { g.beginPath(); g.arc(sx, sy, 0.07, 0, TAU); g.fill(); }
    g.fillStyle = col; g.strokeStyle = '#1d1d22'; g.lineWidth = 0.035; g.beginPath(); g.roundRect(-len / 2, -wid / 2, len, wid, 0.1); g.fill(); g.stroke();
    fn && fn(); g.restore();
  }
  function drawTrain(g, S) {
    for (let i = S.cars.length - 1; i >= -1; i--) {
      const p = game.carPos(i);
      if (i < 0) { drawCar(g, p, '#e2453c', 0.86, 0.5, () => { // the engine: boiler, cab, chimney, cowcatcher
        g.fillStyle = '#b8312a'; g.fillRect(-0.43, -0.25, 0.3, 0.5); g.fillStyle = '#1d1d22'; g.beginPath(); g.arc(0.24, 0, 0.1, 0, TAU); g.fill();
        g.fillStyle = '#ffd23f'; g.beginPath(); g.moveTo(0.43, -0.22); g.lineTo(0.56, 0); g.lineTo(0.43, 0.22); g.fill(); }); continue; }
      const k = S.cars[i], eff = game.kind(i), C = CARS[k];
      drawCar(g, p, C.col, 0.8, 0.46, () => {
        if (k === 'mirror') { g.fillStyle = '#ffffffaa'; g.beginPath(); g.moveTo(-0.3, 0.2); g.lineTo(-0.1, -0.2); g.lineTo(0, -0.2); g.lineTo(-0.2, 0.2); g.fill(); }
        if (eff === 'gun') { const a = (S.aims && S.aims[i] != null ? S.aims[i] - p.a : -Math.PI / 2); g.fillStyle = '#1d1d22'; g.beginPath(); g.arc(0, 0, 0.14, 0, TAU); g.fill(); g.save(); g.rotate(a); g.fillRect(0, -0.04, 0.3, 0.08); g.restore(); }
        else if (eff === 'plough') { g.fillStyle = '#9aa3ad'; g.beginPath(); g.moveTo(0.4, -0.25); g.lineTo(0.58, 0); g.lineTo(0.4, 0.25); g.fill(); g.strokeStyle = '#1d1d22'; g.lineWidth = 0.03; g.stroke(); }
        if (k === 'coal') { g.fillStyle = '#111'; for (const [cx, cy] of [[-0.18, -0.06], [0, 0.07], [0.17, -0.05], [-0.06, -0.12], [0.1, 0.12]]) { g.beginPath(); g.arc(cx, cy, 0.08, 0, TAU); g.fill(); } }
      });
    }
  }

  // ---- the bottom panel
  let pkey = '';
  function panel(force) {
    const S = game.S, k = JSON.stringify([S.phase, S.cars, sel, S.wave, S.speed, S.built.length, S.draft]);
    if (k === pkey && !force) return; pkey = k;
    let msg;
    if (S.phase === 'build') msg = S.wave === 0 ? 'Drag from the rails out across the grass and back onto the rails to build a detour. Marbles must hop rails to cross, which slows them.'
      : sel >= 0 ? `Tap another car to swap it with the <b>${CARS[S.cars[sel]].name}</b>.` : 'Build more track, or tap two cars to swap them. Order matters!';
    else if (S.phase === 'wave') msg = 'Tap the round points levers to switch the train between routes. Every lap through <b>LAP</b> raises the multiplier (longer loops add more).';
    else msg = '';
    const train = `<div class="train"><span class="eng">🚂</span>${S.cars.map((c, i) => { const eff = game.kind(i); return `<button type="button" class="car${i === sel ? ' sel' : ''}" data-car="${i}" style="--c:${CARS[c].col}" ${S.phase === 'wave' ? 'disabled' : ''}><b>${CARS[c].icon}</b><small>${CARS[c].name.replace(' car', '')}${c === 'mirror' ? (eff ? ' → ' + CARS[eff].name.replace(' car', '') : ' (nothing)') : ''}</small></button>`; }).join('')}</div>`;
    const bar = S.phase === 'build' ? `<button type="button" id="undo" ${S.built.length ? '' : 'disabled'}>↶ Undo track</button><button type="button" id="go">Send wave ${S.wave + 1} ▶</button>`
      : `<button type="button" id="go" disabled>Wave ${S.wave} rolling…</button>`;
    $('#ui').innerHTML = `<p class="msg">${msg}</p>${train}<div class="bar">${bar}<button type="button" id="spd" class="${S.speed > 1 ? 'on' : ''}">${'▶'.repeat(S.speed)}<small>×${S.speed}</small></button></div>`;
    if (S.phase === 'draft' && $('#modal').hidden) {
      $('#modal').innerHTML = `<div class="card"><h2>Wave ${S.wave} held!</h2><p>+6 rails. Add a car to the back of the train:</p><div class="picks">${S.draft.map((c) => `<button type="button" class="pick" data-pick="${c}" style="--c:${CARS[c].col}"><b>${CARS[c].icon}</b><span>${CARS[c].name}</span><small>${CARS[c].blurb}</small></button>`).join('')}</div></div>`;
      $('#modal').hidden = false;
    }
  }
  const say = (s) => { note = s; noteT = 2.4; };

  // ---- input
  function cellAt(e) { const r = cv.getBoundingClientRect(); return [Math.floor((e.clientX - r.left - ox) / T), Math.floor((e.clientY - r.top - oy) / T)]; }
  function down(e) {
    if (!game || game.S.over) return; const [c, r] = cellAt(e), k = game.S.track.get(`${c},${r}`);
    drag = { start: [c, r], moved: false, path: [[c, r]], rail: !!k && game.S.phase === 'build' }; cv.setPointerCapture(e.pointerId); e.preventDefault();
  }
  function move(e) {
    if (!drag || !drag.rail) return; const [c, r] = cellAt(e), P = drag.path, lastc = P[P.length - 1];
    if (c === lastc[0] && r === lastc[1]) return;
    if (P.length > 1 && c === P[P.length - 2][0] && r === P[P.length - 2][1]) { P.pop(); return; }
    const closed = P.length > 1 && game.S.track.has(`${lastc[0]},${lastc[1]}`); if (closed) return;
    let [x, y] = lastc; // fill in cells skipped by a fast finger, one step at a time
    while ((x !== c || y !== r) && P.length < 40) { if (x !== c) x += Math.sign(c - x); else y += Math.sign(r - y); if (P.some(([a, b]) => a === x && b === y)) break; P.push([x, y]); drag.moved = true; if (game.S.track.has(`${x},${y}`)) break; }
  }
  function up() {
    if (!drag) return; const d = drag; drag = null; const S = game.S;
    if (d.moved && d.path.length > 1) { const err = game.lay(d.path); if (err) say(err); pkey = ''; return; }
    const k = `${d.start[0]},${d.start[1]}`; if (game.flip(k)) return;
    if (S.phase === 'build' && S.wave === 0 && !S.built.length) say('Drag from a rail to build.');
  }

  addEventListener('load', () => {
    cv = $('#cv'); g = cv.getContext('2d');
    cv.addEventListener('pointerdown', down); cv.addEventListener('pointermove', move); cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', () => (drag = null));
    addEventListener('resize', () => game && layout());
    document.addEventListener('click', (e) => {
      const b = e.target.closest('button'); if (!b || !game) return; const S = game.S;
      if (b.dataset.again != null) start();
      else if (b.dataset.pick) { game.pick(b.dataset.pick); $('#modal').hidden = true; pkey = ''; }
      else if (b.dataset.car != null) { const i = +b.dataset.car; if (sel < 0) sel = i; else { game.swap(sel, i); sel = -1; } pkey = ''; }
      else if (b.id === 'go') { sel = -1; game.send(); pkey = ''; }
      else if (b.id === 'undo') { game.undo(); pkey = ''; }
      else if (b.id === 'spd') { S.speed = S.speed % 3 + 1; pkey = ''; }
    });
    start();
    if (/[?&]dev\b/.test(location.search)) window.__ll = { game: () => game, start, px: (c, r) => { const b = cv.getBoundingClientRect(); return [b.left + ox + (c + 0.5) * T, b.top + oy + (r + 0.5) * T]; } };
  });
})();
