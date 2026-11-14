// Cog & Marble: a marble-run tower defence campaign, Bloons-style. Hand-made levels on a square tile grid: marbles roll
// down the track from the funnel to the vault; build towers on any empty square to pop them first. Levels come in packs,
// and each pack adds one new piece to the machine (Portal-style: you meet it fixed first, then get to control it). Each
// level has Easy / Medium / Hard medals. Marbles have faces and personalities; the first time one shows up it's introduced.
// Standalone page: ../kit/kit.js is only used for sound, sprites and particles. createRun() is DOM-free apart from draw()
// and the optional env.ui panel, so sim.js drives the real model in node (exports at the bottom).
(function () {
  'use strict';
  const TAU = Math.PI * 2, STEP = 0.05; // world units are tiles; track sample spacing

  // ---------------------------------------------------------------- marbles (speed in tiles / s, radius in tiles)
  const MARBLES = {
    plodder: { name: 'Plodder', hp: 2, spd: 1.1, r: 0.22, brass: 2, dmg: 1, cost: 1, sprite: 'mar-clay', col: '#d9774b', hi: '#ffb08a',
      blurb: 'Slow, soft and half asleep. It just keeps rolling.' },
    bouncer: { name: 'Bouncer', hp: 3, spd: 1.8, r: 0.2, brass: 3, dmg: 1, cost: 1.4, startle: true, sprite: 'mar-rubber', col: '#e84a8a', hi: '#ffa6c9',
      blurb: 'Fast and jumpy. Every time it gets hit, it panics and speeds up for a moment.' },
    shatterer: { name: 'Shatterer', hp: 3, spd: 1.25, r: 0.22, brass: 2, dmg: 1, cost: 1.6, shards: 3, sprite: 'mar-glass', col: '#5fc8e8', hi: '#e0fbff',
      blurb: 'A nervous glass marble. Pop it and it cracks into three little Shardlings.' },
    shard: { name: 'Shardling', hp: 1, spd: 2.1, r: 0.12, brass: 1, dmg: 1, cost: 0.5, sprite: 'mar-shard', col: '#9be3f5', hi: '#ffffff', blurb: '' },
    bruiser: { name: 'Bruiser', hp: 8, spd: 0.8, r: 0.26, brass: 6, dmg: 3, armor: 1, cost: 3.2, sprite: 'mar-steel', col: '#8c96a3', hi: '#eef3f8',
      blurb: 'A grumpy steel ball. Plain pins bounce off its armour; Hammers and Steel Tips get through. Costs 3 ♥ at the vault.' },
    clever: { name: 'Cat\'s-eye', hp: 4, spd: 1.35, r: 0.21, brass: 4, dmg: 1, cost: 2, clever: true, sprite: 'mar-cat', col: '#3f9e4d', hi: '#d9ffb0',
      blurb: 'The clever one. At every splitter it peeks ahead and takes the path with fewer towers.' },
    boss: { name: 'The Cannonball', hp: 170, spd: 0.38, r: 0.42, brass: 120, dmg: 99, armor: 1, cost: 0, boss: true, sprite: 'mar-cannon', col: '#33363d', hi: '#9aa3b0',
      blurb: 'The boss. A huge iron cannonball that sheds Bruisers as it cracks. If it reaches the vault, it\'s over.' },
  };

  // ---------------------------------------------------------------- towers: two upgrade paths, 3 tiers; only one path past tier 1
  const TOWERS = {
    pin: { name: 'Pin Gun', icon: '📍', cost: 60, base: 'Fires pins at one marble: 1 damage. Pins can\'t dent steel.',
      paths: [{ name: 'Sharper', tiers: [['Sharp Pins', 50, '2 damage per pin'], ['Steel Tips', 120, 'Pins pierce armour'], ['Nail Storm', 320, 'Fires 3 pins at once']] },
        { name: 'Quicker', tiers: [['Oiled Spring', 45, 'Fires faster'], ['Long Barrel', 90, 'More range'], ['Gatling', 280, 'Fires very fast']] }] },
    hammer: { name: 'Hammer', icon: '🔨', cost: 110, base: 'Smashes every marble right next to it: 3 damage, armour and all.',
      paths: [{ name: 'Heavier', tiers: [['Iron Head', 90, '5 damage'], ['Ringing Blow', 170, 'Stuns what it hits'], ['Pile Driver', 420, '14 damage']] },
        { name: 'Wider', tiers: [['Long Handle', 70, 'Reaches further'], ['Quick Swing', 140, 'Swings faster'], ['Sweeper', 330, 'Huge, fast swings']] }] },
    magnet: { name: 'Magnet', icon: '🧲', cost: 90, base: 'Slows marbles near it, steel most of all.',
      paths: [{ name: 'Stronger', tiers: [['Strong Field', 70, 'Slows more'], ['Wide Field', 130, 'More range'], ['Lodestone', 300, 'Marbles nearly stop']] },
        { name: 'Zappy', tiers: [['Spark', 80, 'Zaps a marble: 1 damage'], ['Arc', 160, 'Zaps jump to 3 marbles'], ['Storm Coil', 340, 'Big, fast zaps']] }] },
  };
  const DIFFS = {
    easy: { name: 'Easy', medal: '🥉', waves: 8, lives: 40, hp: 0.8, cost: 0.9 },
    medium: { name: 'Medium', medal: '🥈', waves: 10, lives: 25, hp: 1, cost: 1 },
    hard: { name: 'Hard', medal: '🥇', waves: 12, lives: 10, hp: 1.2, cost: 1.08 },
  };
  const START_BRASS = 250;

  // ---------------------------------------------------------------- levels: 8 x 12 tiles. lanes: [from, to, corner cells between]
  const PACKS = [
    { id: 'rails', name: 'Pack 1 · Rails', blurb: 'Track, splitters and the vault.', levels: [
      { id: 'r1', name: 'Rolling Start', towers: ['pin'], roster: [['plodder', 1], ['bouncer', 6]],
        tip: 'Marbles roll from the funnel to the vault. Tap an empty square to build a <b>Pin Gun</b>, then send the first wave.',
        nodes: { in: { t: 'in', c: 1, r: 0 }, V: { t: 'goal', c: 3, r: 11 } },
        lanes: [['in', 'V', [[1, 2], [6, 2], [6, 4], [1, 4], [1, 6], [6, 6], [6, 8], [3, 8]]]] },
      { id: 'r2', name: 'The Fork', towers: ['pin', 'hammer'], roster: [['plodder', 1], ['shatterer', 3], ['bouncer', 5]],
        tip: 'A <b>splitter</b> sends marbles left and right in turn. The <b>Hammer</b> is new: it smashes everything next to it.',
        nodes: { in: { t: 'in', c: 3, r: 0 }, S: { t: 'split', c: 3, r: 2 }, M: { t: 'merge', c: 3, r: 9 }, V: { t: 'goal', c: 3, r: 11 } },
        lanes: [['in', 'S', []], ['S', 'M', [[1, 2], [1, 4], [2, 4], [2, 6], [1, 6], [1, 9]]], ['S', 'M', [[5, 2], [5, 4], [6, 4], [6, 6], [5, 6], [5, 9]]], ['M', 'V', []]] },
      { id: 'r3', name: 'Switchback', towers: ['pin', 'hammer', 'magnet'], roster: [['plodder', 1], ['bouncer', 2], ['bruiser', 4], ['shatterer', 6]],
        tip: 'The <b>Bruiser</b> is coming: steel, armoured, 3 ♥ if it gets through. The <b>Magnet</b> is new: it slows marbles, steel most of all.',
        nodes: { in: { t: 'in', c: 0, r: 0 }, V: { t: 'goal', c: 7, r: 11 } },
        lanes: [['in', 'V', [[0, 9], [2, 9], [2, 1], [4, 1], [4, 9], [6, 9], [6, 1], [7, 1]]]] },
      { id: 'r4', name: 'Crossroads', towers: ['pin', 'hammer', 'magnet'], roster: [['plodder', 1], ['clever', 3], ['shatterer', 4], ['bruiser', 6], ['bouncer', 7]],
        tip: 'The tracks cross on a bridge. Watch the <b>Cat\'s-eye</b>: it takes whichever branch has fewer towers.',
        nodes: { in: { t: 'in', c: 3, r: 0 }, S: { t: 'split', c: 3, r: 1 }, M: { t: 'merge', c: 3, r: 9 }, V: { t: 'goal', c: 3, r: 11 } },
        lanes: [['in', 'S', []], ['S', 'M', [[1, 1], [1, 5], [5, 5], [5, 9]]], ['S', 'M', [[6, 1], [6, 3], [3, 3]]], ['M', 'V', []]] },
      { id: 'r5', name: 'Grand Rail', towers: ['pin', 'hammer', 'magnet'], roster: [['plodder', 1], ['bouncer', 2], ['shatterer', 3], ['clever', 4], ['bruiser', 5]], boss: true,
        tip: 'Two splitters, three ways down, and something big on the last wave.',
        nodes: { in: { t: 'in', c: 4, r: 0 }, S1: { t: 'split', c: 4, r: 1 }, S2: { t: 'split', c: 6, r: 5 }, M: { t: 'merge', c: 4, r: 9 }, V: { t: 'goal', c: 4, r: 11 } },
        lanes: [['in', 'S1', []], ['S1', 'M', [[1, 1], [1, 4], [3, 4], [3, 6], [1, 6], [1, 9]]], ['S1', 'S2', [[6, 1]]], ['S2', 'M', [[6, 9]]], ['S2', 'M', [[4, 5]]], ['M', 'V', []]] },
    ] },
    { id: 'switch', name: 'Pack 2 · Switches', blurb: 'Splitters you flip yourself, mid-wave.' },
    { id: 'bounce', name: 'Pack 3 · Bounce', blurb: 'Trampolines that throw marbles from one track to another.' },
    { id: 'lift', name: 'Pack 4 · Lifts', blurb: 'Lifts carry marbles back up for a second pass.' },
    { id: 'slide', name: 'Pack 5 · Slides & Funnels', blurb: 'Fast slides and swirling funnels.' },
    { id: 'turn', name: 'Pack 6 · Turntables', blurb: 'Track that rotates. Then gears you set yourself.' },
    { id: 'build', name: 'Pack 7 · Build', blurb: 'Lay your own track before each wave.' },
  ];
  const LEVELS = PACKS.flatMap((p) => p.levels || []);
  const COLS = 8, ROWS = 12;

  // ---------------------------------------------------------------- geometry
  function smooth(pts, rad = 0.5) { // round every corner, then resample at STEP spacing
    const out = [pts[0]];
    for (let i = 1; i < pts.length - 1; i++) {
      const a = pts[i - 1], b = pts[i], c = pts[i + 1], l1 = Math.hypot(b[0] - a[0], b[1] - a[1]), l2 = Math.hypot(c[0] - b[0], c[1] - b[1]);
      const r = Math.min(rad, l1 / 2, l2 / 2), straight = Math.abs((b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0])) < 1e-6;
      if (r < 0.01 || straight) { out.push(b); continue; }
      const p = [b[0] - (b[0] - a[0]) / l1 * r, b[1] - (b[1] - a[1]) / l1 * r], q = [b[0] + (c[0] - b[0]) / l2 * r, b[1] + (c[1] - b[1]) / l2 * r];
      for (let k = 0; k <= 10; k++) { const t = k / 10, u = 1 - t; out.push([u * u * p[0] + 2 * u * t * b[0] + t * t * q[0], u * u * p[1] + 2 * u * t * b[1] + t * t * q[1]]); }
    }
    out.push(pts[pts.length - 1]);
    const res = [out[0]]; let carry = 0;
    for (let i = 1; i < out.length; i++) {
      const a = out[i - 1], b = out[i], l = Math.hypot(b[0] - a[0], b[1] - a[1]); if (!l) continue; let d = STEP - carry;
      while (d <= l) { res.push([a[0] + (b[0] - a[0]) * d / l, a[1] + (b[1] - a[1]) * d / l]); d += STEP; }
      carry = l - (d - STEP);
    }
    res.push(out[out.length - 1]);
    return res;
  }
  const at = (e, s) => { const f = Math.max(0, Math.min(e.pts.length - 1.001, s / STEP)), i = Math.floor(f), t = f - i, a = e.pts[i], b = e.pts[i + 1] || a; return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]; };
  const dirAt = (e, s) => { const a = at(e, Math.max(0, s - 0.05)), b = at(e, s + 0.05); return Math.atan2(b[1] - a[1], b[0] - a[0]); };
  const key = (c, r) => c + ',' + r;

  /** A level's runtime graph: nodes, edges (lanes), which squares are track and which are free for towers. */
  function buildLevel(L) {
    const N = {}, E = [], track = new Map(); // key -> {lanes: [edge ids], node}
    for (const [id, n] of Object.entries(L.nodes)) { N[id] = { id, ...n, x: n.c + 0.5, y: n.r + 0.5, outs: [], ins: [], next: 0 }; track.set(key(n.c, n.r), { lanes: [], node: id }); }
    for (const [from, to, corners] of L.lanes) {
      const A = N[from], B = N[to], wp = [[A.c, A.r], ...corners, [B.c, B.r]], cells = [[A.c, A.r]];
      for (let i = 1; i < wp.length; i++) {
        const [c0, r0] = wp[i - 1], [c1, r1] = wp[i];
        if (c0 !== c1 && r0 !== r1) throw new Error(`${L.id}: diagonal lane step ${wp[i - 1]} -> ${wp[i]}`);
        const n = Math.abs(c1 - c0) + Math.abs(r1 - r0);
        for (let k = 1; k <= n; k++) cells.push([c0 + Math.sign(c1 - c0) * k, r0 + Math.sign(r1 - r0) * k]);
      }
      const e = { id: E.length, from, to, cells, pts: smooth(wp.map(([c, r]) => [c + 0.5, r + 0.5])) };
      e.len = (e.pts.length - 1) * STEP; E.push(e); A.outs.push(e.id); B.ins.push(e.id);
      for (const [c, r] of cells.slice(1, -1)) { const k = key(c, r), t = track.get(k) || { lanes: [] }; t.lanes.push(e.id); track.set(k, t); }
    }
    const free = []; for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) if (!track.has(key(c, r))) free.push([c, r]);
    return { N, E, track, free };
  }

  // ---------------------------------------------------------------- waves: a budget of "plodder units" filled from the level's roster
  function makeWaves(L, diff) {
    const D = DIFFS[diff], out = [];
    for (let w = 1; w <= D.waves; w++) {
      const pool = L.roster.filter(([, from]) => w >= from).map(([t]) => t), fresh = L.roster.filter(([, from]) => from === w).map(([t]) => t);
      let budget = 5 + 2.1 * w + 0.16 * w * w; const items = [];
      for (const t of fresh) { for (let i = 0; i < 3 && budget > 0; i++) { items.push(t); budget -= MARBLES[t].cost; } } // a new marble arrives as a little group
      for (let i = 0; budget > 0; i++) { const t = pool[(i * 3 + w) % pool.length]; items.push(t); budget -= MARBLES[t].cost; }
      const order = items.map((t, i) => ({ t, k: (i * 7919 + w * 104729) % 997 })).sort((a, b) => a.k - b.k).map((x) => x.t);
      if (L.boss && w === D.waves) order.splice(Math.floor(order.length / 2), 0, 'boss');
      out.push({ items: order, gap: Math.max(0.38, 1.05 - 0.055 * w) });
    }
    return out;
  }

  // ---------------------------------------------------------------- a level being played
  function createRun(L, diff, env) {
    const { sfx, fx } = env, D = DIFFS[diff], G = buildLevel(L), WAVES = makeWaves(L, diff);
    const R = { lives: D.lives, brass: START_BRASS, wave: 0, state: 'build', marbles: [], towers: {}, sel: null, speed: 1, spawnQ: [], waveT: 0,
      tracers: [], pops: 0, flash: 0, nextId: 1, boss: null, msg: '', msgT: 0, G, L, diff, waves: WAVES, leaks: 0 };
    const run = { over: false, won: false, t: 0, R };

    function addMarble(type, at0) {
      const T = MARBLES[type], w1 = Math.max(0, R.wave - 1), mul = (1 + 0.11 * w1 + 0.012 * w1 * w1) * D.hp;
      const m = { id: R.nextId++, type, T, hp: Math.ceil(T.hp * (T.boss ? D.hp * (D.waves / 10) ** 2 : mul)), armor: T.armor || 0, r: T.r, age: 0, dist: 0, e: G.N.in.outs[0], s: 0, slow: 1, stun: 0, startle: 0, flash: 0 };
      m.max = m.hp; if (T.boss) { R.boss = m; m.shed = diff === 'easy' ? 1 : 3; }
      if (at0) Object.assign(m, at0);
      R.marbles.push(m); return m;
    }
    const posOf = (m) => at(G.E[m.e], m.s);
    function danger(eid) { // how well defended a lane is: tower coverage of its track
      const e = G.E[eid]; let d = 0;
      for (const t of Object.values(R.towers)) { const r = tStats(t).range; for (let i = 0; i < e.pts.length; i += 6) if (Math.hypot(e.pts[i][0] - t.x, e.pts[i][1] - t.y) <= r) d += t.type === 'magnet' ? 0.5 : 1; }
      return d;
    }
    function arrive(m, nid) {
      const n = G.N[nid];
      if (n.t === 'goal') return leak(m);
      let eid = n.outs[0];
      if (n.t === 'split') {
        if (m.T.clever) { const d = n.outs.map(danger); eid = n.outs[d[0] <= d[1] ? 0 : 1]; m.think = 0.8; }
        else { eid = n.outs[n.next]; n.next = (n.next + 1) % n.outs.length; n.flick = 0.25; }
      }
      m.e = eid; m.s = 0;
    }
    function stepMarbles(dt) {
      for (const m of R.marbles) {
        if (m.dead) continue;
        m.age += dt; m.flash = Math.max(0, m.flash - dt); m.stun = Math.max(0, m.stun - dt); m.startle = Math.max(0, m.startle - dt); if (m.think) m.think = Math.max(0, m.think - dt);
        const v = m.stun > 0 ? 0 : m.T.spd * m.slow * (m.startle > 0 ? 1.7 : 1);
        m.s += v * dt; m.dist += v * dt;
        while (!m.dead && m.s >= G.E[m.e].len) { const over = m.s - G.E[m.e].len, to = G.E[m.e].to; arrive(m, to); if (!m.dead) m.s = over; }
      }
    }
    function leak(m) {
      m.dead = true; if (m.T.boss) R.bossLeft = m.hp; R.lives = Math.max(0, R.lives - m.T.dmg); R.flash = 0.6; R.leaks++;
      const V = G.N.V; fx.shake = Math.max(fx.shake, m.T.boss ? 14 : 5); sfx.boom(); fx.text(V.x, V.y - 0.6, `-${m.T.dmg} ♥`, '#ff6b6b', 0.42);
      if (R.lives <= 0) { run.over = true; R.endCause = m.T.boss ? 'The Cannonball smashed into the vault.' : `A ${m.T.name} broke into the vault.`; }
    }
    function hit(m, dmg, pierce) {
      if (m.dead) return false;
      const eff = pierce ? dmg : dmg - m.armor;
      if (eff <= 0) { if (Math.random() < 0.15) { const [x, y] = posOf(m); fx.text(x, y - 0.3, 'clink', '#cfd6df', 0.28); } sfx.play('clink') || sfx.tone(2400, 0.03, 'square', 0.02); return false; }
      m.hp -= eff; m.flash = 0.12; if (m.T.startle) m.startle = 0.6;
      if (m.T.boss) bossCheck(m);
      if (m.hp <= 0) { pop(m); return true; }
      return false;
    }
    function pop(m) {
      m.dead = true; R.pops++; const [x, y] = posOf(m); R.brass += m.T.brass;
      fx.burst(x, y, m.T.boss ? 40 : 7, [m.T.col, m.T.hi], m.T.boss ? 6 : 3, m.T.boss ? 0.12 : 0.07);
      if (m.T.boss) { fx.shake = 16; sfx.boom(); fx.text(x, y - 0.3, 'SMASHED!', '#ffd166', 0.6); }
      else { sfx.pop(m.type === 'shatterer' ? 1.6 : 1); if (Math.random() < 0.3) fx.text(x, y - 0.25, `+${m.T.brass}`, '#ffd166', 0.3); }
      if (m.T.shards) for (let k = 0; k < m.T.shards; k++) addMarble('shard', { e: m.e, s: Math.max(0, m.s - 0.12 * k), dist: m.dist });
    }
    function bossCheck(m) {
      while (m.shed > 0 && m.hp <= m.max * (m.shed / (diff === 'easy' ? 2 : 4))) {
        m.shed--; fx.shake = 8; sfx.crack(); say('The Cannonball sheds steel!', 1.6);
        for (let i = 0; i < 2; i++) addMarble('bruiser', { e: m.e, s: Math.max(0, m.s - 0.3 * (i + 1)), dist: m.dist });
      }
    }

    // ---- towers
    function tStats(t) {
      const [a, b] = t.up;
      if (t.type === 'pin') return { range: b >= 2 ? 3 : 2.3, cd: b >= 3 ? 0.2 : b >= 1 ? 0.52 : 0.75, dmg: a >= 1 ? 2 : 1, pierce: a >= 2, n: a >= 3 ? 3 : 1 };
      if (t.type === 'hammer') return { range: b >= 3 ? 2.0 : b >= 1 ? 1.6 : 1.25, cd: b >= 3 ? 0.75 : b >= 2 ? 1.0 : 1.4, dmg: a >= 3 ? 14 : a >= 1 ? 5 : 3, stun: a >= 2 ? 0.5 : 0 };
      return { range: a >= 2 ? 2.4 : 1.8, slow: a >= 3 ? 0.15 : a >= 1 ? 0.4 : 0.55, zap: b >= 1 ? (b >= 3 ? 0.45 : 0.8) : 0, zapDmg: b >= 3 ? 3 : 1, zapN: b >= 2 ? 3 : 1 };
    }
    function stepTowers(dt) {
      const live = R.marbles.filter((m) => !m.dead).map((m) => ({ m, pt: posOf(m) }));
      for (const m of R.marbles) m.slow = 1;
      for (const t of Object.values(R.towers)) {
        const s = tStats(t), near = live.filter((o) => !o.m.dead && Math.hypot(o.pt[0] - t.x, o.pt[1] - t.y) <= s.range + o.m.r);
        t.cd -= dt; t.kick = Math.max(0, (t.kick || 0) - dt);
        const order = () => near.sort(t.aim === 'strong' ? (p, q) => q.m.hp - p.m.hp : t.aim === 'last' ? (p, q) => p.m.dist - q.m.dist : (p, q) => q.m.dist - p.m.dist);
        if (t.type === 'magnet') {
          for (const o of near) o.m.slow = Math.min(o.m.slow, o.m.armor ? s.slow * 0.6 : s.slow);
          if (s.zap && near.length && t.cd <= 0) { t.cd = s.zap; order(); for (const o of near.slice(0, s.zapN)) { hit(o.m, s.zapDmg, true); R.tracers.push({ x: t.x, y: t.y, x2: o.pt[0], y2: o.pt[1], t: 0.1, c: '#9fe7ff' }); } sfx.zap(); }
          continue;
        }
        if (t.cd > 0 || !near.length) continue;
        t.cd = s.cd;
        if (t.type === 'pin') {
          t.kick = 0.1; order();
          for (const o of near.slice(0, s.n)) { R.tracers.push({ x: t.x, y: t.y, x2: o.pt[0], y2: o.pt[1], t: 0.08, c: '#ffe39a' }); hit(o.m, s.dmg, s.pierce); }
          sfx.play('pin') || sfx.tone(1300, 0.03, 'square', 0.025, 0.6);
        } else {
          t.kick = 0.18; for (const o of near) { hit(o.m, s.dmg, true); if (s.stun && !o.m.T.boss) o.m.stun = s.stun; }
          fx.ring(t.x, t.y, s.range, '#ffcf6e'); sfx.hit();
        }
      }
      for (const tr of R.tracers) tr.t -= dt; R.tracers = R.tracers.filter((tr) => tr.t > 0);
    }

    // ---- waves
    function preview(n) {
      const w = WAVES[n - 1]; if (!w) return '';
      const c = {}; for (const t of w.items) c[t] = (c[t] || 0) + 1;
      return Object.entries(c).map(([t, k]) => `${k} ${MARBLES[t].name}${k > 1 && !MARBLES[t].boss ? 's' : ''}`).join(', ');
    }
    const newIn = (n) => [...new Set((WAVES[n - 1] || { items: [] }).items)].filter((t) => !(env.seen && env.seen[t]));
    // Steps bought since the last wave was sent can be undone one at a time for a full refund; selling refunds 70%.
    const refund = (t) => Math.floor(t.spent * 0.7);
    function sendWave() {
      if (R.state !== 'build' || run.over || R.wave >= WAVES.length) return;
      R.wave++; R.state = 'wave'; R.waveT = 0; for (const t of Object.values(R.towers)) t.undo = [];
      const w = WAVES[R.wave - 1]; R.spawnQ = w.items.map((type, i) => ({ type, at: i * w.gap }));
      say(R.wave === WAVES.length ? 'Last wave!' : `Wave ${R.wave}`, 1.2); sfx.ding();
    }
    function waveDone() {
      const bonus = 35 + 5 * R.wave; R.brass += bonus; R.state = 'build';
      fx.text(COLS / 2, ROWS * 0.45, `Wave ${R.wave} held! +${bonus}`, '#ffd166', 0.45); sfx.coin();
      if (R.wave >= WAVES.length) { run.over = true; run.won = true; }
    }

    // ---- player actions (panel and sim bot)
    const price = (c) => Math.round(c * D.cost);
    const buildCost = (type) => price(TOWERS[type].cost);
    const nextTier = (t, p) => { const n = t.up[p]; if (n >= 3 || (n >= 1 && t.up[1 - p] >= 2)) return null; return TOWERS[t.type].paths[p].tiers[n]; };
    const freeCell = (c, r) => c >= 0 && r >= 0 && c < COLS && r < ROWS && !G.track.has(key(c, r));
    const act = {
      build(c, r, type) { const k = key(c, r); if (!freeCell(c, r) || R.towers[k] || !L.towers.includes(type) || R.brass < buildCost(type)) return false; R.brass -= buildCost(type); R.towers[k] = { type, c, r, x: c + 0.5, y: r + 0.5, up: [0, 0], cd: 0.2, spent: buildCost(type), undo: R.state === 'build' ? [{ cost: buildCost(type), name: TOWERS[type].name }] : [], aim: 'first' }; sfx.buy(); return true; },
      upgrade(k, p) { const t = R.towers[k]; if (!t) return false; const nt = nextTier(t, p); if (!nt || R.brass < price(nt[1])) return false; R.brass -= price(nt[1]); t.spent += price(nt[1]); if (R.state === 'build') t.undo.push({ cost: price(nt[1]), p, name: nt[0] }); t.up[p]++; sfx.buy(); fx.ring(t.x, t.y, 0.6, '#ffd166'); return true; },
      undo(k) { const t = R.towers[k], u = t && t.undo.pop(); if (!u) return false; R.brass += u.cost; t.spent -= u.cost; if (u.p === undefined) delete R.towers[k]; else t.up[u.p]--; sfx.coin(); return true; },
      sell(k) { const t = R.towers[k]; if (!t) return false; R.brass += refund(t); delete R.towers[k]; sfx.coin(); return true; },
      aim(k) { const t = R.towers[k]; if (!t) return false; t.aim = { first: 'last', last: 'strong', strong: 'first' }[t.aim]; return true; },
      send: sendWave,
      speed() { R.speed = R.speed === 1 ? 2 : R.speed === 2 ? 3 : 1; },
    };
    run.act = act; run.buildCost = buildCost; run.nextTier = nextTier; run.price = price; run.tStats = tStats; run.preview = preview; run.newIn = newIn; run.posOf = posOf; run.freeCell = freeCell; run.refund = refund;
    function say(s, t = 1.5) { R.msg = s; R.msgT = t; }

    function step(dt) {
      run.t += dt;
      for (const n of Object.values(G.N)) if (n.flick) n.flick = Math.max(0, n.flick - dt);
      if (R.state === 'wave') { R.waveT += dt; while (R.spawnQ.length && R.spawnQ[0].at <= R.waveT) addMarble(R.spawnQ.shift().type); }
      stepMarbles(dt); stepTowers(dt);
      R.marbles = R.marbles.filter((m) => !m.dead);
      if (R.boss && R.boss.dead) R.boss = null;
      if (R.state === 'wave' && !R.spawnQ.length && !R.marbles.length && !run.over) waveDone();
      R.flash = Math.max(0, R.flash - dt); R.msgT -= dt;
    }
    run.update = function (dt) { for (let i = 0; i < R.speed && !run.over; i++) step(dt); fx.update(dt); };
    return run;
  }

  // ---------------------------------------------------------------- faces: every marble has a personality you can read at a glance
  function drawMarble(g, x, y, r, T, look = Math.PI / 2, mood = {}) {
    if (!(typeof Kit !== 'undefined' && Kit.sprite(g, T.sprite, x, y, r * 2.3))) {
      const gr = g.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.1, x, y, r); gr.addColorStop(0, T.hi); gr.addColorStop(1, T.col);
      g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill(); g.strokeStyle = '#00000066'; g.lineWidth = r * 0.08; g.stroke();
      if (T.clever) { g.fillStyle = '#f3d14a'; g.beginPath(); g.ellipse(x + r * 0.15, y + r * 0.1, r * 0.5, r * 0.2, -0.5, 0, TAU); g.fill(); } // the cat's-eye swirl
    }
    const name = T.boss ? 'boss' : T.name, er = r * 0.24, ex = r * 0.34, ey = y - r * 0.12, lx = Math.cos(look) * er * 0.45, ly = Math.sin(look) * er * 0.45;
    g.lineCap = 'round';
    if (T === MARBLES.shard) { g.fillStyle = '#1b2a33'; for (const s of [-1, 1]) { g.beginPath(); g.arc(x + s * r * 0.3 + lx * 0.5, ey + ly * 0.5, r * 0.13, 0, TAU); g.fill(); } return; }
    for (const s of [-1, 1]) { // eyes look where the marble is rolling
      const cx = x + s * ex;
      g.fillStyle = name === 'boss' ? '#ff5a36' : '#fff'; g.beginPath(); g.ellipse(cx, ey, er, er * (name === 'Bouncer' ? 1.2 : 1), 0, 0, TAU); g.fill();
      g.fillStyle = '#1b130b'; g.beginPath(); g.arc(cx + lx, ey + ly, er * (name === 'Bouncer' ? 0.55 : 0.5), 0, TAU); g.fill();
      if (name === 'Plodder') { g.fillStyle = T.col; g.beginPath(); g.ellipse(cx, ey, er * 1.08, er * 1.08, 0, Math.PI, TAU); g.fill(); g.strokeStyle = '#5a2f1a'; g.lineWidth = r * 0.07; g.beginPath(); g.moveTo(cx - er, ey); g.lineTo(cx + er, ey); g.stroke(); } // sleepy lids
      if (name === 'Cat\'s-eye') { g.strokeStyle = '#1b130b'; g.lineWidth = r * 0.07; g.beginPath(); g.arc(cx, ey, er * 1.35, 0, TAU); g.stroke(); } // spectacles
    }
    if (name === 'Cat\'s-eye') { g.strokeStyle = '#1b130b'; g.lineWidth = r * 0.07; g.beginPath(); g.moveTo(x - ex + er * 1.35, ey); g.lineTo(x + ex - er * 1.35, ey); g.stroke(); }
    g.strokeStyle = '#1b130b'; g.lineWidth = r * 0.1;
    const brow = (tilt, h = 0.42) => { for (const s of [-1, 1]) { g.beginPath(); g.moveTo(x + s * (ex - er), ey - er * 1.5 + tilt * er * 0.5); g.lineTo(x + s * (ex + er), ey - er * 1.5 - tilt * er * 0.5); g.stroke(); } };
    const my = y + r * 0.42;
    if (name === 'Bruiser' || name === 'boss') { brow(-1); g.fillStyle = '#1b130b'; g.fillRect(x - r * 0.3, my - r * 0.08, r * 0.6, r * 0.16); g.fillStyle = '#fff'; for (let i = -1; i <= 1; i++) g.fillRect(x + i * r * 0.18 - r * 0.05, my - r * 0.06, r * 0.1, r * 0.12); }
    else if (name === 'Bouncer') { g.fillStyle = '#5a0f2e'; g.beginPath(); g.arc(x, my - r * 0.08, r * 0.3, 0, Math.PI); g.fill(); g.fillStyle = '#ff8fb8'; g.beginPath(); g.arc(x, my + r * 0.1, r * 0.13, 0, Math.PI); g.fill(); }
    else if (name === 'Shatterer') { brow(1); g.beginPath(); for (let i = 0; i <= 6; i++) { const px = x - r * 0.28 + i * r * 0.093, py = my + (i % 2 ? -1 : 1) * r * 0.05; i ? g.lineTo(px, py) : g.moveTo(px, py); } g.stroke(); if (mood.sweat !== false) { g.fillStyle = '#bff3ff'; g.beginPath(); g.ellipse(x + r * 0.72, y - r * 0.35, r * 0.09, r * 0.14, 0, 0, TAU); g.fill(); } }
    else if (name === 'Cat\'s-eye') { g.beginPath(); g.arc(x + r * 0.05, my - r * 0.18, r * 0.24, 0.3, Math.PI - 0.9); g.stroke(); }
    else { g.beginPath(); g.moveTo(x - r * 0.18, my); g.lineTo(x + r * 0.18, my); g.stroke(); } // plodder: a flat little mouth
  }

  // ---------------------------------------------------------------- drawing a level (world units are tiles)
  const path = (g, pts) => { g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); };
  function rrect(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
  // Art deco: black lacquer tiles with gold inlay, stepped corners, sunbursts
  const GOLD = '#d4af37', GOLD2 = '#f1d58a', INK = '#0b0c0f', LAC = '#1d2028';
  const sprite = (...a) => typeof Kit !== 'undefined' && Kit.sprite(...a);
  function sunburst(g, x, y, r0, r1, n, col, a0 = 0, a1 = TAU) { g.strokeStyle = col; for (let i = 0; i <= n; i++) { const a = a0 + (a1 - a0) * i / n; g.beginPath(); g.moveTo(x + Math.cos(a) * r0, y + Math.sin(a) * r0); g.lineTo(x + Math.cos(a) * r1, y + Math.sin(a) * r1); g.stroke(); } }
  function drawBoard(g, G, opts = {}) {
    // empty squares: a hairline grid with a gold diamond in each (build spots); track squares: lacquer tiles with a gold
    // inlay frame; then the rails, lane by lane (later lanes ride over: bridges)
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) if (!G.track.has(key(c, r))) {
      g.strokeStyle = '#d4af3722'; g.lineWidth = 0.02; g.strokeRect(c + 0.06, r + 0.06, 0.88, 0.88);
      g.fillStyle = '#d4af3740'; g.beginPath(); g.moveTo(c + 0.5, r + 0.42); g.lineTo(c + 0.58, r + 0.5); g.lineTo(c + 0.5, r + 0.58); g.lineTo(c + 0.42, r + 0.5); g.fill();
    }
    for (const [k] of G.track) {
      const [c, r] = k.split(',').map(Number);
      g.fillStyle = '#000000aa'; g.fillRect(c + 0.05, r + 0.09, 0.92, 0.92);
      g.fillStyle = LAC; g.fillRect(c + 0.03, r + 0.03, 0.94, 0.94);
      g.strokeStyle = '#d4af3799'; g.lineWidth = 0.025; g.strokeRect(c + 0.08, r + 0.08, 0.84, 0.84);
      g.fillStyle = '#d4af3799'; for (const [dx, dy] of [[0.08, 0.08], [0.86, 0.08], [0.08, 0.86], [0.86, 0.86]]) g.fillRect(c + dx - 0.015, r + dy - 0.015, 0.09, 0.09); // stepped corners
    }
    g.lineCap = 'round'; g.lineJoin = 'round';
    for (const e of G.E) {
      path(g, e.pts); g.strokeStyle = INK; g.lineWidth = 0.46; g.stroke();
      path(g, e.pts); g.strokeStyle = GOLD; g.lineWidth = 0.36; g.stroke();
      path(g, e.pts); g.strokeStyle = '#121418'; g.lineWidth = 0.22; g.stroke();
      path(g, e.pts); g.strokeStyle = '#d4af3755'; g.lineWidth = 0.025; g.stroke();
    }
    for (const n of Object.values(G.N)) {
      if (n.t === 'in') { // a stepped gold ziggurat funnel
        for (let i = 0; i < 3; i++) { const w = 0.9 - i * 0.24; g.fillStyle = i % 2 ? INK : GOLD; g.fillRect(n.x - w / 2, n.y - 0.5 + i * 0.12, w, 0.12); }
        g.fillStyle = INK; g.fillRect(n.x - 0.12, n.y - 0.14, 0.24, 0.2);
      } else if (n.t === 'split') {
        const e = G.E[n.outs[n.next]], p = e.pts[Math.min(e.pts.length - 1, 12)], a = Math.atan2(p[1] - n.y, p[0] - n.x);
        if (!sprite(g, 'deco-switch', n.x, n.y, 0.86, 0.86)) {
          g.fillStyle = INK; g.beginPath(); g.arc(n.x, n.y, 0.36, 0, TAU); g.fill();
          g.lineWidth = 0.02; sunburst(g, n.x, n.y, 0.16, 0.33, 16, '#d4af3799');
          g.strokeStyle = GOLD; g.lineWidth = 0.05; g.beginPath(); g.arc(n.x, n.y, 0.36, 0, TAU); g.stroke();
        }
        if (!opts.thumb) { g.save(); g.translate(n.x, n.y); g.rotate(a + (n.flick ? Math.sin(n.flick * 40) * 0.25 : 0)); g.fillStyle = GOLD2; g.strokeStyle = INK; g.lineWidth = 0.04; g.beginPath(); g.moveTo(0.24, 0); g.lineTo(-0.1, -0.16); g.lineTo(-0.02, 0); g.lineTo(-0.1, 0.16); g.closePath(); g.stroke(); g.fill(); g.restore(); }
      } else if (n.t === 'goal') {
        if (opts.thumb || !sprite(g, 'deco-vault', n.x, n.y - 0.1, 1.6, 1.6)) { // a stepped gold frame around a round vault door with a sunburst
          const x = n.x, y = n.y;
          g.fillStyle = INK; g.fillRect(x - 0.7, y - 0.42, 1.4, 0.84); g.fillRect(x - 0.5, y - 0.56, 1.0, 0.2); g.fillRect(x - 0.3, y - 0.66, 0.6, 0.14);
          g.strokeStyle = GOLD; g.lineWidth = 0.04; g.strokeRect(x - 0.7, y - 0.42, 1.4, 0.84); g.strokeRect(x - 0.5, y - 0.56, 1.0, 0.14); g.strokeRect(x - 0.3, y - 0.66, 0.6, 0.1);
          g.fillStyle = '#1d2026'; g.beginPath(); g.arc(x, y, 0.32, 0, TAU); g.fill(); g.lineWidth = 0.02; sunburst(g, x, y, 0.08, 0.3, 20, '#d4af3799');
          g.strokeStyle = GOLD2; g.lineWidth = 0.05; g.beginPath(); g.arc(x, y, 0.32, 0, TAU); g.stroke(); g.fillStyle = GOLD; g.beginPath(); g.arc(x, y, 0.07, 0, TAU); g.fill();
        }
      }
    }
  }
  function drawTower(g, t, R, sel) {
    if (sel) { const s = R.tStats(t); g.fillStyle = '#d4af371c'; g.strokeStyle = '#f1d58aaa'; g.lineWidth = 0.04; g.beginPath(); g.arc(t.x, t.y, s.range, 0, TAU); g.fill(); g.stroke(); }
    const kick = t.kick ? 1 + t.kick * 1.5 : 1;
    if (!Kit.sprite(g, 'tower-' + t.type, t.x, t.y, 0.82 * kick)) {
      g.fillStyle = t.type === 'pin' ? '#3d6e8f' : t.type === 'hammer' ? '#8f4b2e' : '#6b3d8f'; g.beginPath(); g.arc(t.x, t.y, 0.34 * kick, 0, TAU); g.fill(); g.strokeStyle = '#f5dfb0'; g.lineWidth = 0.05; g.stroke();
      g.font = '0.38px system-ui'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(TOWERS[t.type].icon, t.x, t.y + 0.02);
    }
    for (let p = 0; p < 2; p++) for (let i = 0; i < t.up[p]; i++) { g.fillStyle = p ? '#7fd0ff' : '#ffd166'; g.beginPath(); g.arc(t.x - 0.36 + i * 0.13 + p * 0.42, t.y + 0.42, 0.055, 0, TAU); g.fill(); }
  }

  // ---------------------------------------------------------------- particles and floaters, in tile units (the kit's fx is in pixels)
  function makeFx() {
    let ps = [];
    return {
      shake: 0,
      burst(x, y, n = 8, colors = ['#ffd166'], speed = 3, size = 0.07) { for (let i = 0; i < n; i++) { const a = Math.random() * TAU, v = speed * (0.35 + Math.random()); ps.push({ k: 'p', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - speed * 0.4, t: 0, life: 0.5 + Math.random() * 0.4, c: colors[i % colors.length], s: size }); } },
      text(x, y, s, c = '#fff', size = 0.34) { ps.push({ k: 't', x, y, s, c, size, t: 0, life: 0.9 }); },
      ring(x, y, r = 1, c = '#fff') { ps.push({ k: 'r', x, y, r, c, t: 0, life: 0.35 }); },
      update(dt) { for (const p of ps) p.t += dt; ps = ps.filter((p) => p.t < p.life); this.shake = Math.max(0, this.shake - dt * 30); },
      draw(g) {
        for (const p of ps) {
          const q = p.t / p.life; g.globalAlpha = 1 - q;
          if (p.k === 'p') { g.fillStyle = p.c; g.beginPath(); g.arc(p.x + p.vx * p.t, p.y + p.vy * p.t + 6 * p.t * p.t, p.s, 0, TAU); g.fill(); }
          else if (p.k === 't') { g.fillStyle = p.c; g.font = `400 ${p.size}px Limelight, system-ui`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(p.s, p.x, p.y - 0.8 * q); }
          else { g.strokeStyle = p.c; g.lineWidth = 0.1 * (1 - q) + 0.02; g.beginPath(); g.arc(p.x, p.y, p.r * (0.3 + 0.7 * q), 0, TAU); g.stroke(); }
        }
        g.globalAlpha = 1;
      },
    };
  }

  // ---------------------------------------------------------------- the app: map -> difficulty -> level -> result
  if (typeof window === 'undefined') { module.exports = { MARBLES, TOWERS, DIFFS, PACKS, LEVELS, buildLevel, makeWaves, createRun, START_BRASS, COLS, ROWS }; return; }
  const $ = (s) => document.querySelector(s), DEV = /[?&]dev\b/.test(location.search), SK = 'cm.campaign';
  let SAVE; try { SAVE = JSON.parse(localStorage.getItem(SK)) || null; } catch { SAVE = null; }
  SAVE ||= { medals: {}, seen: {}, muted: false };
  const store = () => { try { localStorage.setItem(SK, JSON.stringify(SAVE)); } catch { /* private window: still playable */ } };
  const noop = () => {}, quiet = new Proxy({}, { get: (o, k) => (k === 'play' || k === 'has' ? () => true : noop) });
  const sfx = new Proxy({}, { get: (o, k) => (SAVE.muted ? quiet[k] : Kit.sfx[k]) });
  let music = null;
  function playMusic(on) {
    const url = window.PP_ASSETS && PP_ASSETS.sfx && PP_ASSETS.sfx['music-loop'];
    if (!url) return;
    if (!music) { music = new Audio(url); music.loop = true; music.volume = 0.22; }
    if (on && !SAVE.muted) music.play().catch(noop); else music.pause();
  }
  const medalOf = (id) => SAVE.medals[id] || {};
  const cleared = (id) => Object.keys(medalOf(id)).length > 0;
  const openIdx = () => { let i = 0; while (i < LEVELS.length && cleared(LEVELS[i].id)) i++; return i; };

  function showMap() {
    playMusic(false); $('#game').hidden = true; $('#map').hidden = false; $('#modal').hidden = true;
    const open = openIdx();
    $('#packs').innerHTML = PACKS.map((p) => p.levels ? `<section class="pack"><header><h2>${p.name}</h2><small>${p.blurb}</small></header><div class="lvls">${p.levels.map((L) => {
      const i = LEVELS.indexOf(L), m = medalOf(L.id), lock = i > open;
      return `<button type="button" class="lvl${i === open ? ' next' : ''}" data-lvl="${i}" ${lock ? 'disabled' : ''}><canvas data-thumb="${i}" width="160" height="240"></canvas><b>${i + 1}. ${L.name}</b>
        <span class="medals">${Object.entries(DIFFS).map(([d, D]) => `<span class="${m[d] ? 'on' : ''}" title="${D.name}">${D.medal}</span>`).join('')}${L.boss ? '<span class="on" title="Boss">💣</span>' : ''}</span></button>`; }).join('')}</div></section>`
      : `<section class="pack locked"><header><h3>🔒 ${p.name}</h3><small>Coming soon</small></header><small class="muted">${p.blurb}</small></section>`).join('');
    document.querySelectorAll('[data-thumb]').forEach((cv) => { const L = LEVELS[+cv.dataset.thumb], g = cv.getContext('2d'); g.setTransform(20, 0, 0, 20, 0, 0); g.fillStyle = INK; g.fillRect(0, 0, COLS, ROWS); drawBoard(g, buildLevel(L), { thumb: true }); });
    $('#mute').textContent = SAVE.muted ? 'Sound: off' : 'Sound: on';
  }
  function modal(html) { const m = $('#modal'); m.innerHTML = `<div class="card">${html}</div>`; m.hidden = false; }
  function chooseDiff(i) {
    const L = LEVELS[i], m = medalOf(L.id);
    modal(`<h2>${i + 1}. ${L.name}</h2><div class="diffs">${Object.entries(DIFFS).map(([d, D]) => `<button type="button" class="diff" data-go="${i}:${d}"><span class="m" style="${m[d] ? '' : 'filter:grayscale(1);opacity:.4'}">${D.medal}</span><b>${D.name}</b><small>${D.waves} waves · ${D.lives} ♥${d === 'hard' ? ' · tougher marbles' : d === 'easy' ? ' · cheaper towers' : ''}</small></button>`).join('')}</div>
      <button type="button" class="ghost" data-close>Back</button>`);
  }
  function portrait(type) { const cv = document.createElement('canvas'); cv.width = cv.height = 280; const g = cv.getContext('2d'); g.setTransform(2, 0, 0, 2, 0, 0); drawMarble(g, 70, 74, 52, MARBLES[type], Math.PI / 2 + 0.3); return cv; }
  function introduce(types, then) { // a new marble: a card with its face and personality before the wave rolls
    const t = types[0]; if (!t) return then();
    SAVE.seen[t] = 1; store(); paused = true;
    modal(`<p class="muted" style="margin:0">New marble!</p><h2>${MARBLES[t].name}</h2><div id="pf"></div><p style="margin:0">${MARBLES[t].blurb}</p><button type="button" class="big" data-meet>Got it</button>`);
    $('#pf').appendChild(portrait(t)); $('#pf canvas').style.cssText = 'width:140px;height:140px';
    meetNext = () => { $('#modal').hidden = true; introduce(types.slice(1), then); };
  }
  let meetNext = null;

  // ---- playing a level
  let run = null, Li = 0, Dk = 'easy', raf = 0, lastT = 0, paused = false, cv, g, DPR = 1, W = 0, H = 0, T = 40, ox = 0, oy = 0, panelKey = '';
  const TOP = 46, UIH = 196;
  function layout() {
    DPR = Math.min(2, window.devicePixelRatio || 1); W = cv.clientWidth; H = cv.clientHeight; cv.width = Math.round(W * DPR); cv.height = Math.round(H * DPR);
    T = Math.min(W / COLS, (H - TOP - UIH) / ROWS); ox = (W - COLS * T) / 2; oy = TOP + Math.max(0, (H - TOP - UIH - ROWS * T) / 2);
  }
  function start(i, d) {
    Li = i; Dk = d; $('#modal').hidden = true; $('#map').hidden = true; $('#game').hidden = false; paused = false;
    cv = $('#cv'); g = cv.getContext('2d'); layout();
    const fx = makeFx();
    run = createRun(LEVELS[i], d, { sfx, fx, seen: SAVE.seen });
    run.fx = fx; panelKey = ''; buildPanel(); playMusic(true);
    lastT = performance.now(); cancelAnimationFrame(raf); raf = requestAnimationFrame(loop);
  }
  function loop(now) {
    const dt = Math.max(0, Math.min(0.05, (now - lastT) / 1000)); lastT = now;
    try { if (!paused) run.update(dt); draw(); panel(); } catch (e) { console.error('[cog-marble] frame error', e); }
    if (run.over) return finish();
    raf = requestAnimationFrame(loop);
  }
  function finish() {
    playMusic(false); const L = LEVELS[Li], D = DIFFS[Dk];
    if (run.won) { (SAVE.medals[L.id] ||= {})[Dk] = 1; store(); sfx.win(); } else sfx.end();
    const nxt = LEVELS[Li + 1];
    modal(run.won ? `<h2>${D.medal} ${D.name} medal!</h2><p style="margin:0">${L.name}: all ${D.waves} waves held with ${run.R.lives} ♥ left.</p>
        ${nxt ? `<button type="button" class="big" data-lvl="${Li + 1}">Next: ${nxt.name}</button>` : '<p class="muted" style="margin:0">That\'s the whole Rails pack! Pack 2 (Switches) is next to be built.</p>'}
        ${Dk !== 'hard' ? `<button type="button" class="ghost" data-go="${Li}:${Dk === 'easy' ? 'medium' : 'hard'}">Try ${Dk === 'easy' ? 'Medium' : 'Hard'}</button>` : ''}<button type="button" class="ghost" data-map>Map</button>`
      : `<h2>The vault broke</h2><p style="margin:0">${run.R.endCause || ''} You held ${run.R.wave - 1} of ${D.waves} waves.</p><p class="muted" style="margin:0">${tipAfterLoss()}</p>
        <button type="button" class="big" data-go="${Li}:${Dk}">Try again</button><button type="button" class="ghost" data-map>Map</button>`);
  }
  function tipAfterLoss() {
    const R = run.R, types = Object.values(R.towers).map((t) => t.type);
    if (R.endCause && R.endCause.includes('Bruiser') && !types.includes('hammer')) return 'Tip: Bruisers shrug off plain pins. A Hammer, or Pin Guns with Steel Tips, will crack them.';
    if (R.endCause && R.endCause.includes('Cannonball')) return 'Tip: slow the Cannonball with Magnets and stack Hammers along its path.';
    return 'Tip: squares where the track passes on two or more sides are the best spots. Upgrade towers there before building more.';
  }

  // ---- input
  function tapAt(x, y) {
    if (!run || paused) return;
    const c = Math.floor((x - ox) / T), r = Math.floor((y - oy) / T), R = run.R;
    if (c < 0 || r < 0 || c >= COLS || r >= ROWS) { R.sel = null; return; }
    const k = key(c, r);
    if (R.towers[k]) { R.sel = { kind: 'tower', k }; sfx.pop(1.3); }
    else if (run.freeCell(c, r)) { R.sel = { kind: 'cell', c, r }; sfx.pop(1.2); }
    else R.sel = null;
  }

  // ---- the bottom panel (rebuilt only when what it shows changes)
  function buildPanel() {
    $('#ui').innerHTML = '<div class="panel"><p class="msg" id="msg"></p><div class="prow" id="prow"></div></div><div class="bar"><button type="button" id="go">Send wave 1 ▶</button></div>';
  }
  function panel() {
    const R = run.R, L = LEVELS[Li], s = R.sel, t = s && s.kind === 'tower' ? R.towers[s.k] : null, b = Math.floor(R.brass);
    const afford = [...L.towers.map((k) => b >= run.buildCost(k)), ...(t ? [0, 1].map((p) => { const nt = run.nextTier(t, p); return !!nt && b >= run.price(nt[1]); }) : [])];
    const left = $('#left'); if (left) left.textContent = R.spawnQ.length + R.marbles.length;
    const k = JSON.stringify([s, t && t.up, t && t.aim, afford, R.state, R.wave, R.speed]);
    if (k === panelKey) return; panelKey = k;
    const go = $('#go'); go.textContent = R.state === 'build' ? (R.wave === 0 ? 'Send wave 1 ▶' : `Send wave ${R.wave + 1} ▶`) : ['', '▶▶ Faster', '▶▶▶ Fastest', '▶ Normal speed'][R.speed]; go.classList.toggle('fast', R.state !== 'build');
    let msg = '', row = '';
    if (!s) {
      msg = R.state === 'build' ? `${R.wave === 0 ? L.tip + ' ' : ''}Next: <b>${run.preview(R.wave + 1)}</b>.` : `Wave ${R.wave}/${R.waves.length}: <b id="left">${R.spawnQ.length + R.marbles.length}</b> marbles left. Tap an empty square to build, a tower to upgrade.`;
      if (R.wave === 0 && L.tip.length > 90) msg = `${L.tip}`;
    } else if (s.kind === 'cell') {
      msg = 'Build a tower here.';
      row = Object.keys(TOWERS).map((k) => L.towers.includes(k) ? `<button type="button" data-a="build:${k}" ${b >= run.buildCost(k) ? '' : 'disabled'}>${TOWERS[k].icon} ${TOWERS[k].name}<small>${run.buildCost(k)} brass</small></button>`
        : `<button type="button" disabled>🔒 ${TOWERS[k].name}<small>later level</small></button>`).join('') + '<button type="button" data-a="close" style="flex:.55">✕</button>';
    } else {
      const TT = TOWERS[t.type], tiers = [0, 1].map((p) => t.up[p] ? TT.paths[p].tiers[t.up[p] - 1][0] : null).filter(Boolean);
      msg = `<b>${TT.name}</b>${tiers.length ? ' · ' + tiers.join(' + ') : ''}. ${t.up[0] + t.up[1] ? '' : TT.base}`;
      row = [0, 1].map((p) => { const nt = run.nextTier(t, p);
        return nt ? `<button type="button" data-a="up:${p}" ${b >= run.price(nt[1]) ? '' : 'disabled'}>${p ? '🔷' : '🔶'} ${nt[0]}<small>${nt[2]} · ${run.price(nt[1])}</small></button>`
          : `<button type="button" disabled>${t.up[p] >= 3 ? 'Path maxed' : 'Path closed'}<small>${TT.paths[p].name}</small></button>`; }).join('')
        + (t.type !== 'magnet' || t.up[1] ? `<button type="button" data-a="aim" style="flex:.7">Aim<small>${t.aim}</small></button>` : '')
        + (t.undo.length ? `<button type="button" data-a="undo" style="flex:.7">↶ Undo<small>${t.undo.at(-1).name} +${t.undo.at(-1).cost}</small></button>`
          : `<button type="button" data-a="sell" style="flex:.7">Sell<small>+${run.refund(t)}</small></button>`);
    }
    $('#msg').innerHTML = msg; $('#prow').innerHTML = row;
  }

  // ---- drawing the level
  function draw() {
    const R = run.R, G = R.G;
    g.setTransform(DPR, 0, 0, DPR, 0, 0); g.fillStyle = INK; g.fillRect(0, 0, W, H);
    if (Kit.sprite(g, 'bg-deco', W / 2, H / 2, W, H)) { g.fillStyle = '#00000080'; g.fillRect(0, 0, W, H); }
    else { g.lineWidth = 1; sunburst(g, W / 2, H + 40, 60, H * 1.4, 36, '#d4af3714', Math.PI, TAU); } // a sunburst rising from below
    g.strokeStyle = '#d4af3766'; g.lineWidth = 1; g.strokeRect(ox - 4.5, oy - 4.5, COLS * T + 9, ROWS * T + 9); g.strokeStyle = '#d4af3733'; g.strokeRect(ox - 8.5, oy - 8.5, COLS * T + 17, ROWS * T + 17);
    g.save();
    if (run.fx.shake > 0) g.translate((Math.random() - 0.5) * run.fx.shake, (Math.random() - 0.5) * run.fx.shake);
    g.translate(ox, oy); g.scale(T, T);
    drawBoard(g, G);
    const sel = R.sel;
    if (sel && sel.kind === 'cell') { g.strokeStyle = GOLD2; g.lineWidth = 0.06; g.strokeRect(sel.c + 0.06, sel.r + 0.06, 0.88, 0.88); g.lineWidth = 0.02; g.strokeRect(sel.c + 0.14, sel.r + 0.14, 0.72, 0.72); }
    // marbles, ordered so bigger ones sit on top
    for (const m of [...R.marbles].sort((a, b) => a.r - b.r)) {
      const e = G.E[m.e], [x, y] = at(e, m.s), bob = m.T.startle ? Math.abs(Math.sin(m.age * 10)) * 0.06 : 0;
      g.fillStyle = '#00000050'; g.beginPath(); g.ellipse(x + 0.04, y + 0.07, m.r, m.r * 0.8, 0, 0, TAU); g.fill();
      drawMarble(g, x, y - bob, m.r, m.T, m.think ? -Math.PI / 2 + Math.sin(m.age * 9) : dirAt(e, m.s));
      if (m.flash > 0) { g.fillStyle = '#ffffff99'; g.beginPath(); g.arc(x, y - bob, m.r, 0, TAU); g.fill(); }
      if (m.stun > 0) { g.fillStyle = '#ffe08a'; g.font = '0.22px system-ui'; g.textAlign = 'center'; g.fillText('✦', x, y - m.r - 0.12); }
      if (m.hp < m.max && !m.T.boss) { g.fillStyle = '#000a'; g.fillRect(x - m.r, y - m.r - 0.12, m.r * 2, 0.06); g.fillStyle = '#7ee08a'; g.fillRect(x - m.r, y - m.r - 0.12, m.r * 2 * m.hp / m.max, 0.06); }
    }
    for (const t of Object.values(R.towers)) drawTower(g, t, run, sel && sel.kind === 'tower' && R.towers[sel.k] === t);
    for (const tr of R.tracers) { g.strokeStyle = tr.c; g.globalAlpha = Math.min(1, tr.t * 12); g.lineWidth = 0.05; g.beginPath(); g.moveTo(tr.x, tr.y); g.lineTo(tr.x2, tr.y2); g.stroke(); g.globalAlpha = 1; }
    run.fx.draw(g);
    g.restore();
    // HUD: a black band with a double gold rule
    g.fillStyle = INK; g.fillRect(0, 0, W, TOP); g.fillStyle = GOLD; g.fillRect(0, TOP - 4, W, 1); g.fillRect(0, TOP - 1, W, 1);
    g.textBaseline = 'middle'; g.textAlign = 'left'; g.font = '400 17px Limelight, system-ui';
    g.fillStyle = GOLD2; g.fillText(`Wave ${R.wave}/${R.waves.length}`, 10, 16);
    g.font = '600 11px "Josefin Sans", system-ui'; g.fillStyle = '#b9ad8f'; g.fillText(`${LEVELS[Li].name.toUpperCase()} · ${DIFFS[Dk].name.toUpperCase()}`, 10, 34);
    g.font = '400 17px Limelight, system-ui';
    g.fillStyle = R.flash > 0 ? '#ff6b6b' : '#e8836b'; g.fillText(`♥ ${R.lives}`, 136, 16);
    g.fillStyle = GOLD; g.fillText(`◆ ${Math.floor(R.brass)}`, 200, 16);
    if (R.boss) { const bw = W - 120; g.fillStyle = '#000c'; g.fillRect(60, TOP + 4, bw, 10); g.fillStyle = '#c0392b'; g.fillRect(60, TOP + 4, bw * Math.max(0, R.boss.hp / R.boss.max), 10); g.strokeStyle = GOLD; g.lineWidth = 1; g.strokeRect(60.5, TOP + 4.5, bw, 10); g.fillStyle = '#fff'; g.font = '600 10px "Josefin Sans", system-ui'; g.textAlign = 'center'; g.fillText('THE CANNONBALL', W / 2, TOP + 10); }
    if (R.msgT > 0 && R.msg) { g.globalAlpha = Math.min(1, R.msgT * 2); g.font = '400 21px Limelight, system-ui'; const w = g.measureText(R.msg).width + 48, my = oy + ROWS * T * 0.42;
      g.fillStyle = '#0b0c0fe6'; g.fillRect(W / 2 - w / 2, my - 20, w, 40); g.strokeStyle = GOLD; g.lineWidth = 1; g.strokeRect(W / 2 - w / 2 + 0.5, my - 19.5, w - 1, 39); g.strokeRect(W / 2 - w / 2 + 3.5, my - 16.5, w - 7, 33);
      g.fillStyle = GOLD2; g.textAlign = 'center'; g.fillText(R.msg, W / 2, my + 1); g.globalAlpha = 1; }
  }

  // ---- wiring
  document.addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.lvl != null) { if (run && !$('#game').hidden) { /* next level from the result card */ } chooseDiff(+b.dataset.lvl); }
    else if (b.dataset.go) { const [i, d] = b.dataset.go.split(':'); start(+i, d); }
    else if (b.dataset.close != null) $('#modal').hidden = true;
    else if (b.dataset.map != null) { cancelAnimationFrame(raf); run = null; showMap(); }
    else if (b.dataset.meet != null && meetNext) { const f = meetNext; meetNext = null; f(); }
    else if (b.id === 'resume') { paused = false; $('#modal').hidden = true; lastT = performance.now(); playMusic(true); }
    else if (b.id === 'pause' && run && !run.over) { paused = true; playMusic(false); modal(`<h2>Paused</h2><button type="button" class="big" id="resume">Resume</button><button type="button" class="ghost" data-go="${Li}:${Dk}">Restart level</button><button type="button" class="ghost" data-map>Quit to map</button>`); }
    else if (b.id === 'mute') { SAVE.muted = !SAVE.muted; store(); b.textContent = SAVE.muted ? 'Sound: off' : 'Sound: on'; }
    else if (b.id === 'reset') { if (b.dataset.sure) { localStorage.removeItem(SK); location.reload(); } else { b.dataset.sure = 1; b.textContent = 'Tap again to erase'; } }
    else if (b.dataset.a && run) {
      const [a, x] = b.dataset.a.split(':'), R = run.R, s = R.sel;
      if (a === 'build' && s && s.kind === 'cell') { if (!run.act.build(s.c, s.r, x)) sfx.nope(); else R.sel = { kind: 'tower', k: key(s.c, s.r) }; }
      else if (a === 'up' && s && s.kind === 'tower') { if (!run.act.upgrade(s.k, +x)) sfx.nope(); }
      else if (a === 'sell' && s && s.kind === 'tower') { run.act.sell(s.k); R.sel = null; }
      else if (a === 'undo' && s && s.kind === 'tower') { run.act.undo(s.k); if (!R.towers[s.k]) R.sel = { kind: 'cell', c: s.k.split(',')[0] | 0, r: s.k.split(',')[1] | 0 }; }
      else if (a === 'aim' && s && s.kind === 'tower') run.act.aim(s.k);
      else if (a === 'close') R.sel = null;
      panelKey = '';
    } else if (b.id === 'go' && run) {
      const R = run.R;
      if (R.state === 'build') { const fresh = run.newIn(R.wave + 1); introduce(fresh, () => { paused = false; lastT = performance.now(); run.act.send(); }); }
      else run.act.speed();
      panelKey = '';
    }
  });
  $('#cv').addEventListener('pointerdown', (e) => { const r = $('#cv').getBoundingClientRect(); tapAt(e.clientX - r.left, e.clientY - r.top); e.preventDefault(); });
  addEventListener('resize', () => { if (run && !$('#game').hidden) layout(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden && run && !run.over && !paused && !$('#game').hidden) $('#pause').click(); });
  showMap();

  if (DEV) window.__cm = { // dev/test hook: start a level, fast-forward it with a random thumb to shake out crashes
    SAVE, LEVELS, start, run: () => run, store,
    fuzz(frames = 3000, seed = 1, uiRate = 0.05) {
      let x = seed; const rnd = () => ((x = (x * 1664525 + 1013904223) >>> 0) / 4294967296), errors = [];
      cancelAnimationFrame(raf);
      for (let i = 0; i < frames && !run.over; i++) {
        try {
          const meet = document.querySelector('[data-meet]'); if (meet && !$('#modal').hidden) meet.click();
          if (rnd() < 0.08) tapAt(ox + rnd() * COLS * T, oy + rnd() * ROWS * T);
          const ui = [...document.querySelectorAll('#ui button:not([disabled])')]; if (ui.length && rnd() < uiRate) ui[Math.floor(rnd() * ui.length)].click();
          if (!paused) run.update(1 / 30); draw(); panel();
        } catch (e) { errors.push(String(e && e.stack || e).split('\n').slice(0, 3).join(' | ')); if (errors.length > 3) break; }
      }
      return { frames, over: run.over, won: run.won, wave: run.R.wave, t: Math.round(run.t), errors };
    },
  };
  document.body.dataset.ready = 1;
})();
