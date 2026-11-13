// Cog & Marble: a clockwork tower defence. A pegboard of gears turns grooved plates; marbles roll along the grooves and
// can only cross from plate to plate when two grooves line up. Gear sizes set each plate's speed (one tooth per click
// for every gear in the train, so small gears spin fast), meshed gears turn opposite ways, chains keep the same way.
// Build towers on the solid spots (plate spots ride the plate round), HOLD the machine with steam, keep marbles out of the vault.
// Plugs into the Pocket Prototypes kit (see ../README.md). createRun() is DOM-free apart from draw() and the env.ui
// panel, so sim.js drives the real model in node (exports at the bottom).
(function () {
  'use strict';
  const TAU = Math.PI * 2, U = Math.PI / 24; // angle unit 7.5°: every gear step and every port direction is a whole number of these
  const ROWS = 4, COLS = 3, LAST = 10;
  const GEARS = { S: { n: 8, stepU: 6, name: 'Small', speed: 'fast: 45° a click' }, M: { n: 12, stepU: 4, name: 'Medium', speed: '30° a click' }, L: { n: 16, stepU: 3, name: 'Large', speed: 'slow: 22.5° a click' } };
  const DWELL = 0.3, MOVE = 0.3, PERIOD = DWELL + MOVE; // a click: the machine rests (grooves can line up), then turns
  // grooves join two rim ports, by local direction (0 E, 1 S, 2 W, 3 N; canvas y is down)
  const PATTERNS = { bar: [[0, 2]], cross: [[0, 2], [1, 3]], elbow: [[0, 1]], twin: [[0, 1], [2, 3]] };
  const MAP = [['elbow', 'bar', 'elbow'], ['cross', 'twin', 'cross'], ['bar', 'cross', 'bar'], ['twin', 'cross', 'elbow']];
  const MAP_ROT = [[0, 1, 1], [0, 0, 0], [1, 0, 1], [1, 0, 2]];
  const DIRS = [[0, 1], [1, 0], [0, -1], [-1, 0]]; // [dr, dc] for E S W N
  const MOTOR = 0; // the motor turns plate 0's gear (top left)

  const MARBLES = {
    clay: { hp: 2, spd: 50, r: 7, brass: 2, dmg: 1, latch: 4.5, col: '#d9774b', hi: '#ffb08a', name: 'Clay' },
    glass: { hp: 3, spd: 55, r: 7, brass: 2, dmg: 1, latch: 4.5, col: '#5fc8e8', hi: '#e0fbff', name: 'Glass', glass: true },
    shard: { hp: 1, spd: 72, r: 5, brass: 1, dmg: 1, latch: 4, col: '#9be3f5', hi: '#ffffff', name: 'Shard' },
    rubber: { hp: 4, spd: 88, r: 7, brass: 3, dmg: 1, latch: 2.5, col: '#e84a8a', hi: '#ffa6c9', name: 'Rubber' },
    steel: { hp: 9, spd: 40, r: 8, brass: 5, dmg: 3, latch: 5.5, armor: 1, col: '#8c96a3', hi: '#eef3f8', name: 'Steel' },
    cannon: { hp: 600, spd: 24, r: 15, brass: 120, dmg: 99, latch: 6, armor: 1, col: '#33363d', hi: '#9aa3b0', name: 'The Cannonball', boss: true },
  };
  // a wave: groups of [type, count], interleaved evenly; gap = seconds between drops
  const WAVES = [
    { g: [['clay', 8]], gap: 1.2 },
    { g: [['clay', 13]], gap: 0.88 },
    { g: [['clay', 10], ['glass', 5]], gap: 0.8 },
    { g: [['glass', 10], ['clay', 8]], gap: 0.72 },
    { g: [['rubber', 7], ['clay', 12]], gap: 0.64 },
    { g: [['glass', 12], ['steel', 4]], gap: 0.68 },
    { g: [['rubber', 14], ['steel', 6], ['clay', 6]], gap: 0.56 },
    { g: [['glass', 18], ['steel', 8]], gap: 0.52 },
    { g: [['rubber', 12], ['glass', 12], ['steel', 9]], gap: 0.44 },
    { g: [['clay', 14], ['glass', 14], ['rubber', 10], ['steel', 12]], gap: 0.4 },
  ];
  const BOSS_WAVE = { g: [['steel', 6], ['cannon', 1], ['rubber', 10]], gap: 0.72 };
  const DRAFT_AFTER = [2, 5, 8];

  const TOWERS = {
    pin: { name: 'Pin Gun', icon: '📍', cost: 50, up: [60, 110], blurb: 'Fires at the marble that has rolled longest. Pins can\'t dent steel until level 2.',
      lv: ['Fires pins: 1 damage', '2 damage per pin', 'Twice as fast, hits 2 marbles'] },
    hammer: { name: 'Hammer', icon: '🔨', cost: 85, up: [80, 140], blurb: 'Smashes every marble next to it. Ignores armour. Great beside a port where marbles wait.',
      lv: ['Smash: 3 damage nearby', 'Reaches further', '6 damage, faster'] },
    magnet: { name: 'Magnet', icon: '🧲', cost: 70, up: [70, 120], blurb: 'Slows marbles in range. Steel is slowed the most.',
      lv: ['Slows marbles nearby', 'Wider and stronger', 'Also zaps a marble'] },
  };
  const BOONS = [
    { id: 'sharp', icon: '📍', name: 'Sharp Pins', desc: 'Pins +1 damage' },
    { id: 'reach', icon: '🔨', name: 'Long Handles', desc: 'Hammers reach 35% further' },
    { id: 'latch', icon: '🔒', name: 'Stiff Latches', desc: 'Marbles wait 2 s longer before jumping a gap' },
    { id: 'boiler', icon: '♨️', name: 'Spare Boiler', desc: '+60% steam for HOLD' },
    { id: 'bounty', icon: '🪙', name: 'Brass Bounty', desc: '+30% brass from marbles' },
    { id: 'parts', icon: '📦', name: 'Spare Parts', desc: '+120 brass now' },
    { id: 'patch', icon: '🩹', name: 'Patch the Vault', desc: '+5 vault health' },
    { id: 'blower', icon: '🫧', name: 'Glassblower', desc: 'Glass marbles no longer shatter into shards' },
    { id: 'oil', icon: '🛢️', name: 'Oiled Axles', desc: 'Towers on plates fire 35% faster' },
    { id: 'chain', icon: '⛓️', name: 'Spare Chain', desc: 'Your next 2 chains are free' },
  ];

  // ---------------------------------------------------------------- tree (currency: cogs)
  const NODES = [
    { id: 'bench', name: 'Workbench', icon: '🧰', desc: (l) => `+30 brass at the start of each run (${30 * l} → ${30 * (l + 1)})`, cost: 6, grow: 1.6, max: 4, req: [], x: 0, y: 0, fx: (s, l) => { s.brass += 30 * l; } },
    { id: 'hammer', name: 'Hammer Plans', icon: '🔨', desc: 'Unlocks the Hammer tower: smashes every marble next to it, armour and all', cost: 12, max: 1, req: ['bench'], x: 1, y: 0, fx: (s) => { s.hammer = true; } },
    { id: 'magnet', name: 'Magnet Plans', icon: '🧲', desc: 'Unlocks the Magnet tower: slows marbles near it, steel most of all', cost: 16, max: 1, req: ['bench'], x: -1, y: 0, fx: (s) => { s.magnet = true; } },
    { id: 'vault', name: 'Thick Vault', icon: '🛡️', desc: '+4 vault health', cost: 8, grow: 1.7, max: 3, req: ['bench'], x: 0, y: 1, fx: (s, l) => { s.lives += 4 * l; } },
    { id: 'boiler', name: 'Bigger Boiler', icon: '♨️', desc: '+40% steam for HOLD', cost: 10, grow: 1.8, max: 3, req: ['bench'], x: 0, y: -1, fx: (s, l) => { s.steam *= 1 + 0.4 * l; } },
    { id: 'latch', name: 'Stiff Latches', icon: '🔒', desc: 'Marbles wait 1 s longer at a closed gap before jumping it', cost: 14, grow: 1.9, max: 3, req: ['boiler'], x: -1, y: -1, fx: (s, l) => { s.latch += l; } },
    { id: 'bounty', name: 'Brass Bounty', icon: '🪙', desc: '+15% brass from marbles', cost: 10, grow: 1.7, max: 4, req: ['vault'], x: 1, y: 1, fx: (s, l) => { s.bounty *= 1 + 0.15 * l; } },
    { id: 'tools', name: 'Fine Tools', icon: '🔧', desc: 'Tower upgrades cost 15% less', cost: 18, grow: 1.8, max: 3, req: ['hammer'], x: 2, y: 0, fx: (s, l) => { s.upgDisc *= 0.85 ** l; } },
    { id: 'chainworks', name: 'Chainworks', icon: '⛓️', desc: 'Chains cost half, and each run starts with a free one', cost: 14, max: 1, req: ['magnet'], x: -2, y: 0, fx: (s) => { s.chainCost = 20; s.freeChain += 1; } },
    { id: 'blueprint', name: 'Blueprints', icon: '📜', desc: 'Workshop picks show 4 cards instead of 3', cost: 20, max: 1, req: ['bounty'], x: 2, y: 1, fx: (s) => { s.drafts = 4; } },
    // excl 'pins': chain hits for swarms, or armour-piercing for steel
    { id: 'ricochet', excl: 'pins', name: 'Ricochet Pins', icon: '↪️', desc: 'Every pin bounces into a second marble for full damage. Best against swarms.', cost: 30, max: 1, req: ['hammer'], x: 1, y: -1, fx: (s) => { s.ricochet = 1; } },
    { id: 'heavy', excl: 'pins', name: 'Heavy Pins', icon: '🔩', desc: 'Pins +1 damage and punch through steel armour. Best against steel.', cost: 30, max: 1, req: ['hammer'], x: 2, y: -1, fx: (s) => { s.pinDmg += 1; s.pierceArmor = 1; } },
    // excl 'lever': what HOLD does besides stopping the machine
    { id: 'overdrive', excl: 'lever', name: 'Overdrive', icon: '⚡', desc: 'While you HOLD, every tower fires twice as fast', cost: 30, max: 1, req: ['boiler'], x: 0, y: -2, fx: (s) => { s.overdrive = 1; } },
    { id: 'freeze', excl: 'lever', name: 'Cold Brake', icon: '❄️', desc: 'While you HOLD, marbles in the grooves crawl at a quarter speed', cost: 30, max: 1, req: ['boiler'], x: -1, y: -2, fx: (s) => { s.freeze = 1; } },
    { id: 'cannon', win: true, name: 'Ring the Cannon Bell', icon: '🔔', desc: 'Next run, wave 10 brings the Cannonball: a huge iron marble with steel escorts. Smash it to win.', cost: 90, max: 1, req: ['ricochet', 'heavy', 'overdrive', 'freeze', 'tools'], reqAll: 2, x: 0, y: -3 },
  ];

  function baseStats(who) {
    const s = { lives: 15, brass: 120, steam: 3, latch: 0, bounty: 1, upgDisc: 1, hammer: false, magnet: false, chainCost: 40, freeChain: 0,
      drafts: 3, pinCost: 50, pinDmg: 0, pierceArmor: 0, ricochet: 0, overdrive: 0, freeze: 0, gearsInWave: false, magZap: 0 };
    if (who === 'tilly') s.pinCost = 40;
    if (who === 'gus') { s.gearsInWave = true; s.freeChain += 1; }
    if (who === 'marla') { s.magnet = true; s.magZap = 1; }
    return s;
  }

  // ---------------------------------------------------------------- geometry (plate-local, unit radius)
  const rim = (d) => [Math.cos(d * Math.PI / 2), Math.sin(d * Math.PI / 2)];
  function makeGroove(a, b) {
    const A = rim(a), B = rim(b), pts = [];
    if ((a - b + 4) % 4 === 2) for (let i = 0; i <= 12; i++) { const t = i / 12; pts.push([A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t]); }
    else for (let i = 0; i <= 20; i++) { // elbow: a curve through the middle of the plate
      const t = i / 20, u = 1 - t, k = 0.25;
      pts.push([u * u * u * A[0] + 3 * u * u * t * A[0] * k + 3 * u * t * t * B[0] * k + t * t * t * B[0], u * u * u * A[1] + 3 * u * u * t * A[1] * k + 3 * u * t * t * B[1] * k + t * t * t * B[1]]);
    }
    const cum = [0]; for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
    return { ends: [a, b], pts, cum, len: cum[cum.length - 1] };
  }
  function grooveAt(gr, s) { // -> [x, y] at arc length s
    s = Math.max(0, Math.min(gr.len, s)); let i = 1; while (i < gr.cum.length - 1 && gr.cum[i] < s) i++;
    const a = gr.pts[i - 1], b = gr.pts[i], f = (s - gr.cum[i - 1]) / ((gr.cum[i] - gr.cum[i - 1]) || 1);
    return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
  }
  const segDist = (p, a, b) => { const dx = b[0] - a[0], dy = b[1] - a[1], t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy || 1))); return Math.hypot(p[0] - a[0] - dx * t, p[1] - a[1] - dy * t); };
  function plateSlots(grooves) { // solid spots for towers: diagonals clear of every groove, up to 2, opposite if possible
    const ok = [0, 1, 2, 3].filter((k) => { const a = (k + 0.5) * Math.PI / 2, p = [Math.cos(a) * 0.6, Math.sin(a) * 0.6];
      return grooves.every((gr) => gr.pts.every((q, i) => !i || segDist(p, gr.pts[i - 1], q) > 0.36)); });
    const pick = ok.length >= 2 ? (ok.includes((ok[0] + 2) % 4) ? [ok[0], (ok[0] + 2) % 4] : ok.slice(0, 2)) : ok;
    return pick.map((k) => { const a = (k + 0.5) * Math.PI / 2; return [Math.cos(a) * 0.6, Math.sin(a) * 0.6]; });
  }
  const mod = (a, n) => ((a % n) + n) % n;
  const ease = (x) => x * x * (3 - 2 * x);

  // ---------------------------------------------------------------- a run
  function createRun(env) {
    const { W, H, stats: st, sfx, fx } = env;
    // layout: HUD on top, 3x4 pegboard, vault, then the kit's bottom panel (~215 px)
    const TOP = 62, UIH = 218, BASEH = 46;
    const D = Math.max(60, Math.min((W - 10) / COLS, (H - TOP - UIH - BASEH) / ROWS)), RP = D * 0.44, K = D / 126;
    const X0 = W / 2 - D, Y0 = TOP + D / 2;
    const baseY = Y0 + (ROWS - 1) * D + D / 2 + BASEH * 0.62;
    const C = { k: 0, t: 0, e: 0 }; // the clock: k clicks done, t into this click, e = how far through the turn (0 while resting)
    const plates = [];
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
      const grooves = PATTERNS[MAP[r][c]].map(([a, b]) => makeGroove(a, b));
      plates.push({ id: r * COLS + c, r, c, x: X0 + c * D, y: Y0 + r * D, pat: MAP[r][c], grooves, rot: MAP_ROT[r][c], gear: (r + c) % 2 ? 'S' : 'L', dir: 0, slots: plateSlots(grooves) });
    }
    const P = (r, c) => (r >= 0 && r < ROWS && c >= 0 && c < COLS ? plates[r * COLS + c] : null);
    const ENTRY = P(0, 1), EXIT = P(ROWS - 1, 1);
    const entryPt = [ENTRY.x, ENTRY.y - D / 2], exitPt = [EXIT.x, EXIT.y + D / 2];
    // tower spots: the gaps between four plates, the top and bottom edges, and the solid diagonals of each plate
    const SLOTS = [];
    for (let r = -1; r < ROWS; r++) for (let c = 0; c < COLS - 1; c++) SLOTS.push({ id: `b${r}_${c}`, board: true, x: X0 + (c + 0.5) * D, y: Y0 + (r + 0.5) * D });
    for (const p of plates) p.slots.forEach((q, j) => SLOTS.push({ id: `p${p.id}_${j}`, plate: p, lx: q[0], ly: q[1] }));
    const slotById = Object.fromEntries(SLOTS.map((s) => [s.id, s]));

    const R = {
      lives: st.lives, maxLives: st.lives, brass: st.brass, wave: 0, cleared: 0, state: 'build', marbles: [], towers: {}, chains: new Set(),
      steam: st.steam, steamMax: st.steam, holdOn: false, holding: false, speed: 1, sel: null, pops: 0, jam: false, boons: {}, freeChains: st.freeChain,
      spawnQ: [], waveT: 0, pass: {}, tracers: [], hint: env.runNo <= 1 ? 1 : 0, flash: 0, nextId: 1, latchBonus: st.latch, bountyMul: st.bounty,
      boss: null, jumpTold: 0, D, plates, SLOTS, C, msg: '', msgT: 0, lastLeak: '',
    };
    const run = { over: false, t: 0, R };

    // ---- the gear train: one direction per plate (+1 clockwise, -1 counter, 0 not driven); a fight = jammed
    const meshes = (a, b) => GEARS[a.gear].n + GEARS[b.gear].n === 24;
    const fits = (a, b) => GEARS[a.gear].n + GEARS[b.gear].n <= 24;
    const chainKey = (a, b) => `${Math.min(a.id, b.id)}-${Math.max(a.id, b.id)}`;
    const neighbours = (p) => DIRS.map(([dr, dc]) => P(p.r + dr, p.c + dc)).filter(Boolean);
    function drive() {
      for (const p of plates) p.dir = 0;
      plates[MOTOR].dir = 1; const q = [plates[MOTOR]]; R.jam = false; R.jamAt = null;
      while (q.length) {
        const a = q.shift();
        for (const b of neighbours(a)) {
          const link = meshes(a, b) ? -1 : R.chains.has(chainKey(a, b)) ? 1 : 0; if (!link) continue;
          const want = a.dir * link;
          if (!b.dir) { b.dir = want; q.push(b); } else if (b.dir !== want) { R.jam = true; R.jamAt = [a, b]; }
        }
      }
      if (R.jam) for (const p of plates) p.dir = 0;
    }
    drive();
    const thetaU = (p) => 12 * p.rot + p.dir * (C.k + C.e) * GEARS[p.gear].stepU;
    const theta = (p) => thetaU(p) * U;
    // the compass direction a local port faces right now, or -1 while it is between directions (turning)
    function portDir(p, d) {
      if (p.dir && C.e > 0) return -1;
      const a = mod(12 * (d + p.rot) + p.dir * C.k * GEARS[p.gear].stepU, 48);
      return a % 12 ? -1 : a / 12;
    }
    const toWorld = (p, lx, ly, rad = RP) => { const a = theta(p), c = Math.cos(a), s = Math.sin(a); return [p.x + (lx * c - ly * s) * rad, p.y + (lx * s + ly * c) * rad]; };
    function junction(p, d) { // what lies across the gap: a plate, 'exit', 'entry' or null (wall)
      const q = P(p.r + DIRS[d][0], p.c + DIRS[d][1]); if (q) return q;
      if (p === EXIT && d === 1) return 'exit'; if (p === ENTRY && d === 3) return 'entry'; return null;
    }
    function receiving(q, d) { // a groove end of plate q facing compass d right now -> {g, e} or null
      for (let g = 0; g < q.grooves.length; g++) for (let e = 0; e < 2; e++) if (portDir(q, q.grooves[g].ends[e]) === d) return { g, e };
      return null;
    }
    const slotPos = (s) => (s.board ? [s.x, s.y] : toWorld(s.plate, s.lx, s.ly));

    // ---- marbles
    function addMarble(type, at) {
      const T = MARBLES[type], n1 = Math.max(0, R.wave - 1), mul = 1 + 0.2 * n1 + 0.035 * n1 * n1;
      const m = { id: R.nextId++, type, T, hp: Math.ceil(T.hp * (T.boss ? 1 : mul)), armor: T.armor || 0, r: T.r * K, age: 0, wait: 0, rowT: 0, st: 'rail', y: -10, x: entryPt[0], slow: 1, flash: 0 };
      m.max = m.hp; if (T.boss) { R.boss = m; m.shed = 3; }
      if (at) Object.assign(m, at);
      R.marbles.push(m); return m;
    }
    function marblePos(m) {
      if (m.st === 'groove' || m.st === 'held') { const gr = m.p.grooves[m.g], l = grooveAt(gr, m.s); return toWorld(m.p, l[0], l[1]); }
      if (m.st === 'hop') { const f = ease(Math.min(1, m.ht / m.hd)), to = hopTo(m.to); return [m.hx + (to[0] - m.hx) * f, m.hy + (to[1] - m.hy) * f - Math.sin(f * Math.PI) * m.hh]; }
      return [m.x, m.y];
    }
    const groovePt = (p, g, e) => { const gr = p.grooves[g], l = grooveAt(gr, e ? gr.len : 0); return toWorld(p, l[0], l[1]); };
    function enter(m, p, g, e) { if (!m.p || p.r > m.p.r) m.rowT = 0; m.wait = 0; m.st = 'groove'; m.p = p; m.g = g; m.s = e ? p.grooves[g].len : 0; m.dirn = e ? -1 : 1; }
    // a hop flies across a gap to a target: {q, g, e} (a groove end) or {exit: true}
    const hopTo = (to) => (to.exit ? exitPt : groovePt(to.q, to.g, to.e));
    function hop(m, to, jump) {
      const [x, y] = marblePos(m); m.st = 'hop'; m.hx = x; m.hy = y; m.ht = 0; m.hd = jump ? 0.4 : 0.12; m.hh = jump ? 16 * K : 0; m.to = to;
      if (jump) sfx.play('jump') || sfx.tone(520, 0.08, 'triangle', 0.05, 1.6);
    }
    function land(m) { if (m.to.exit) { m.st = 'exit'; m.x = exitPt[0]; m.y = exitPt[1]; } else enter(m, m.to.q, m.to.g, m.to.e); }
    const toExit = (m, jump) => hop(m, { exit: true }, jump);
    const toPlate = (m, q, g, e, jump) => hop(m, { q, g, e }, jump);
    function nearestEnd(q, pt) { let best = null, bd = 1e9; q.grooves.forEach((gr, g) => [0, 1].forEach((e) => { const w = groovePt(q, g, e), d = Math.hypot(w[0] - pt[0], w[1] - pt[1]); if (d < bd) { bd = d; best = { g, e }; } })); return best; }
    function jumpGap(m) { // a marble that has spent too long in one row hops a gap: down if it can, else toward the exit
      const p = m.p, d = junction(p, 1) ? 1 : p.c < EXIT.c ? 0 : 2, J = junction(p, d);
      if (d === 1) m.rowT = 0; if (R.jumpTold++ < 3) say('A marble jumped a gap!', 1.2);
      if (J === 'exit') return toExit(m, true);
      const gp = [(p.x + J.x) / 2, (p.y + J.y) / 2], end = nearestEnd(J, gp);
      toPlate(m, J, end.g, end.e, true);
    }
    const latchOf = (m) => m.T.latch + R.latchBonus + (R.boons.latch ? 2 : 0);

    function stepMarbles(dt) {
      const open = !R.holding;
      // queues: marbles waiting at the same port line up behind each other
      const qn = {}; let railN = 0;
      const rail = R.marbles.filter((m) => m.st === 'rail').sort((a, b) => a.id - b.id);
      for (const m of R.marbles) {
        m.age += dt; m.flash = Math.max(0, m.flash - dt);
        const spd = m.T.spd * K * m.slow * (R.holding && st.freeze && (m.st === 'groove') ? 0.25 : 1);
        if (m.st === 'rail') {
          const i = rail.indexOf(m), lim = entryPt[1] - i * (2 * m.r + 3);
          m.y = Math.min(lim, m.y + spd * 1.6 * dt);
          if (i === 0 && m.y >= entryPt[1] - 0.5) {
            if (open) m.wait += dt;
            const key = 'entry', rcv = open && !(R.pass[key] > 0) && receiving(ENTRY, 3);
            if (rcv) { R.pass[key] = 0.3; toPlate(m, ENTRY, rcv.g, rcv.e, false); }
            else if (m.wait > latchOf(m)) { m.wait = 0; const end = nearestEnd(ENTRY, entryPt); if (R.jumpTold++ < 3) say('A marble jumped a gap!', 1.2); toPlate(m, ENTRY, end.g, end.e, true); }
          }
          railN++;
        } else if (m.st === 'groove') {
          const gr = m.p.grooves[m.g]; if (open) m.rowT += dt;
          m.s += m.dirn * spd * dt / RP;
          if (m.s >= gr.len) { m.s = gr.len; m.st = 'held'; m.e = 1; m.wait = 0; }
          else if (m.s <= 0) { m.s = 0; m.st = 'held'; m.e = 0; m.wait = 0; }
        } else if (m.st === 'held') {
          const key = `${m.p.id}:${m.g}:${m.e}`, i = (qn[key] = (qn[key] ?? -1) + 1), gr = m.p.grooves[m.g];
          const back = i * (2 * m.r + 2) / RP; m.s = m.e ? gr.len - back : back; // stand in line
          if (open) { m.rowT += dt; m.wait += dt; }
          if (i > 0) continue;
          if (m.rowT > latchOf(m) * 3) { jumpGap(m); continue; } // too long on one level: drop
          const d = portDir(m.p, gr.ends[m.e]);
          if (open && d >= 0 && d !== 3) {
            const J = junction(m.p, d), pk = `${m.p.id}>${d}`;
            if (J && J !== 'entry' && !(R.pass[pk] > 0)) {
              if (J === 'exit') { R.pass[pk] = 0.25; toExit(m, false); continue; }
              const rcv = receiving(J, (d + 2) % 4);
              if (rcv) { R.pass[pk] = 0.25; toPlate(m, J, rcv.g, rcv.e, false); continue; }
            }
          }
          if (m.wait > latchOf(m)) jumpGap(m); // bored of waiting at a closed port
        } else if (m.st === 'hop') {
          m.ht += dt; if (m.ht >= m.hd) land(m);
        } else if (m.st === 'exit') {
          m.y += spd * 1.8 * dt;
          if (m.y >= baseY) leak(m);
        }
      }
      for (const k in R.pass) R.pass[k] -= dt;
    }
    function leak(m) {
      m.dead = true; R.lives = Math.max(0, R.lives - m.T.dmg); R.flash = 0.6; R.lastLeak = m.T.name;
      fx.shake = Math.max(fx.shake, m.T.boss ? 14 : 6); sfx.boom(); fx.text(exitPt[0], baseY - 20, `-${m.T.dmg} ♥`, '#ff6b6b', 18);
      if (R.lives <= 0) { run.over = true; R.endCause = m.T.boss ? 'The Cannonball smashed into the vault.' : `A ${m.T.name.toLowerCase()} marble broke the vault.`; }
    }
    function hit(m, dmg, crush) {
      if (m.dead) return false;
      const eff = crush ? dmg : dmg - m.armor;
      if (eff <= 0) { if (Math.random() < 0.15) fx.text(...marblePos(m), 'clink', '#cfd6df', 12); sfx.play('clink') || sfx.tone(2400, 0.03, 'square', 0.02); return false; }
      m.hp -= eff; m.flash = 0.12;
      if (m.T.boss) bossCheck(m);
      if (m.hp <= 0) { pop(m); return true; }
      return false;
    }
    function pop(m) {
      m.dead = true; R.pops++; const [x, y] = marblePos(m);
      const v = Math.max(1, Math.round(m.T.brass * R.bountyMul * (R.boons.bounty ? 1.3 : 1))); R.brass += v;
      fx.burst(x, y, m.T.boss ? 40 : 7, [m.T.col, m.T.hi], m.T.boss ? 260 : 120, m.T.boss ? 5 : 3);
      if (m.T.boss) { fx.shake = 16; sfx.boom(); fx.text(x, y - 10, 'SMASHED!', '#ffd166', 26); }
      else { sfx.pop(m.T.glass ? 1.6 : 1); if (Math.random() < 0.35) fx.text(x, y - 6, `+${v}`, '#ffd166', 12); }
      if (m.T.glass && !R.boons.blower) for (const k of [-1, 1]) split(m, 'shard', k);
    }
    function split(m, type, k) { // a shard or a shed marble starts where its parent was
      const c = addMarble(type, { x: m.x, y: m.y, st: m.st === 'held' ? 'groove' : m.st, p: m.p, g: m.g, s: m.s, dirn: m.dirn || 1, hx: m.hx, hy: m.hy, ht: m.ht, hd: m.hd, hh: m.hh, to: m.to });
      if (c.st === 'groove') { const gr = c.p.grooves[c.g]; c.s = Math.max(0, Math.min(gr.len, c.s + k * 0.12)); if (m.st === 'held') c.dirn = m.e ? -1 : 1; }
    }
    function bossCheck(m) {
      while (m.shed > 0 && m.hp <= m.max * (m.shed / 4)) {
        m.shed--; fx.shake = 8; sfx.crack(); say('The Cannonball sheds steel!', 1.6);
        for (let i = 0; i < 2; i++) split(m, 'steel', i ? 1 : -1);
      }
    }

    // ---- towers
    function tStats(t) {
      const l = t.lvl, odr = R.holding && st.overdrive ? 2 : 1;
      const rate = odr * (!slotById[t.slot].board && R.boons.oil ? 1.35 : 1);
      if (t.type === 'pin') return { range: [82, 88, 94][l] * K, cd: [0.6, 0.5, 0.3][l] / rate, dmg: [1, 2, 2][l] + st.pinDmg + (R.boons.sharp ? 1 : 0), n: l >= 2 ? 2 : 1 };
      if (t.type === 'hammer') return { range: [40, 50, 54][l] * K * (R.boons.reach ? 1.35 : 1), cd: [1.3, 1.2, 0.95][l] / rate, dmg: [3, 3, 6][l] };
      return { range: [62, 76, 80][l] * K, slow: [0.55, 0.45, 0.4][l], steel: [0.3, 0.22, 0.18][l], zap: l >= 2 || st.magZap ? 0.6 / rate : 0 };
    }
    function stepTowers(dt) {
      const live = R.marbles.filter((m) => !m.dead).map((m) => ({ m, pt: marblePos(m) }));
      for (const m of R.marbles) m.slow = 1;
      for (const [sid, t] of Object.entries(R.towers)) {
        const [x, y] = slotPos(slotById[sid]), s = tStats(t);
        const near = live.filter((o) => !o.m.dead && Math.hypot(o.pt[0] - x, o.pt[1] - y) <= s.range + o.m.r);
        t.cd -= dt; t.kick = Math.max(0, (t.kick || 0) - dt);
        if (t.type === 'magnet') {
          for (const o of near) o.m.slow = Math.min(o.m.slow, o.m.type === 'steel' || o.m.T.boss ? s.steel : s.slow);
          if (s.zap && near.length && t.cd <= 0) { t.cd = s.zap; const o = near.sort((a, b) => b.m.age - a.m.age)[0]; hit(o.m, 1, true); R.tracers.push({ x, y, x2: o.pt[0], y2: o.pt[1], t: 0.1, c: '#9fe7ff' }); sfx.zap(); }
          continue;
        }
        if (t.cd > 0 || !near.length) continue;
        if (t.type === 'pin') {
          t.cd = s.cd; t.kick = 0.1; near.sort((a, b) => b.m.age - a.m.age);
          for (const o of near.slice(0, s.n)) {
            R.tracers.push({ x, y, x2: o.pt[0], y2: o.pt[1], t: 0.08, c: '#ffe39a' }); hit(o.m, s.dmg, st.pierceArmor);
            if (st.ricochet) { const b = live.find((q) => q.m !== o.m && !q.m.dead && Math.hypot(q.pt[0] - o.pt[0], q.pt[1] - o.pt[1]) < 55 * K); if (b) { R.tracers.push({ x: o.pt[0], y: o.pt[1], x2: b.pt[0], y2: b.pt[1], t: 0.08, c: '#ffe39a' }); hit(b.m, s.dmg, st.pierceArmor); } }
          }
          sfx.play('pin') || sfx.tone(1300, 0.03, 'square', 0.025, 0.6);
        } else {
          t.cd = s.cd; t.kick = 0.18; for (const o of near) hit(o.m, s.dmg, true);
          fx.ring(x, y, s.range, '#ffcf6e'); sfx.hit();
        }
      }
      for (const tr of R.tracers) tr.t -= dt; R.tracers = R.tracers.filter((tr) => tr.t > 0);
    }

    // ---- waves
    const specFor = (n) => (env.boss && n === LAST ? BOSS_WAVE : WAVES[n - 1]);
    function nextWave() {
      const spec = specFor(R.wave + 1); if (!spec) return 'nothing';
      const txt = spec.g.map(([t, n]) => `${n} ${MARBLES[t].boss ? 'Cannonball' : t}`).join(', ');
      return txt + (spec.g.some(([t]) => t === 'steel') && !st.hammer && !st.pierceArmor ? ' (level 1 pins can\'t dent steel)' : '');
    }
    function sendWave() {
      if (R.state !== 'build' || run.over) return;
      R.wave++; R.state = 'wave'; R.waveT = 0; R.hint = 0; R.sel = R.sel && R.sel.kind === 'plate' && !st.gearsInWave ? null : R.sel;
      const spec = specFor(R.wave);
      const items = spec.g.flatMap(([type, n]) => Array.from({ length: n }, (_, i) => ({ type, key: (i + 0.5) / n }))).sort((a, b) => a.key - b.key);
      R.spawnQ = items.map((it, i) => ({ type: it.type, at: i * spec.gap }));
      say(R.wave === LAST && env.boss ? 'The Cannonball is coming!' : `Wave ${R.wave}`, 1.4); sfx.ding();
    }
    function waveDone() {
      R.cleared = R.wave; const bonus = 20 + 6 * R.wave; R.brass += bonus; R.state = 'build';
      fx.text(W / 2, Y0 + D, `Wave ${R.wave} held! +${bonus} brass`, '#ffd166', 20); sfx.coin();
      if (R.wave >= LAST) { run.over = true; R.won = !!env.boss; R.endCause = env.boss ? 'won' : 'held'; return; }
      if (DRAFT_AFTER.includes(R.wave)) draft();
    }
    function draft() {
      const pool = BOONS.filter((b) => !R.boons[b.id] || ['parts', 'patch', 'chain'].includes(b.id)), opts = [];
      while (opts.length < st.drafts && pool.length) opts.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
      env.pick('Workshop: pick one', opts.map((b) => ({ icon: b.icon, name: b.name, desc: b.desc })), (i) => applyBoon(opts[i]));
    }
    function applyBoon(b) {
      R.boons[b.id] = (R.boons[b.id] || 0) + 1;
      if (b.id === 'parts') R.brass += 120;
      if (b.id === 'patch') { R.lives += 5; R.maxLives = Math.max(R.maxLives, R.lives); }
      if (b.id === 'boiler') { R.steamMax *= 1.6; R.steam = R.steamMax; }
      if (b.id === 'chain') R.freeChains += 2;
      sfx.buy(); panelKey = '';
    }

    // ---- player actions (the panel and the sim bot both use these)
    const upCost = (t) => Math.round(TOWERS[t.type].up[t.lvl] * st.upgDisc);
    const buildCost = (type) => (type === 'pin' ? st.pinCost : TOWERS[type].cost);
    const unlockedT = (type) => type === 'pin' || (type === 'hammer' && st.hammer) || (type === 'magnet' && st.magnet);
    const gearsLocked = () => R.state === 'wave' && !st.gearsInWave;
    const act = {
      build(sid, type) { if (R.towers[sid] || !unlockedT(type) || R.brass < buildCost(type)) return false; R.brass -= buildCost(type); R.towers[sid] = { type, lvl: 0, cd: 0.3, slot: sid, spent: buildCost(type) }; sfx.buy(); return true; },
      upgrade(sid) { const t = R.towers[sid]; if (!t || t.lvl >= 2 || R.brass < upCost(t)) return false; const c = upCost(t); R.brass -= c; t.spent += c; t.lvl++; sfx.buy(); const [x, y] = slotPos(slotById[sid]); fx.ring(x, y, 26, '#ffd166'); return true; },
      sell(sid) { const t = R.towers[sid]; if (!t) return false; R.brass += Math.floor(t.spent * 0.7); delete R.towers[sid]; sfx.coin(); return true; },
      gear(pid, g) { const p = plates[pid]; if (gearsLocked() || !gearOk(p, g)) return false; p.gear = g; dropBadChains(); drive(); sfx.play('clunk') || sfx.tone(160, 0.08, 'square', 0.06); return true; },
      turn(pid) { const p = plates[pid]; if (gearsLocked()) return false; p.rot = (p.rot + 1) % 4; sfx.play('clunk') || sfx.tone(200, 0.06, 'square', 0.05); return true; },
      chain(pid, qid) {
        const a = plates[pid], b = plates[qid], k = chainKey(a, b); if (gearsLocked() || !b) return false;
        if (R.chains.has(k)) { R.chains.delete(k); drive(); return true; }
        if (meshes(a, b) || !fits(a, b)) return false;
        const cost = R.freeChains > 0 ? 0 : st.chainCost; if (R.brass < cost) return false;
        R.brass -= cost; if (!cost) R.freeChains--; R.chains.add(k); drive(); sfx.buy(); return true;
      },
      send: sendWave,
      hold(on) { R.holdOn = !!on; },
      speed() { R.speed = R.speed === 1 ? 2 : 1; },
    };
    const gearOk = (p, g) => neighbours(p).every((q) => GEARS[g].n + GEARS[q.gear].n <= 24);
    function dropBadChains() { for (const k of [...R.chains]) { const [a, b] = k.split('-').map((i) => plates[+i]); if (meshes(a, b) || !fits(a, b)) R.chains.delete(k); } }
    run.act = act; run.slotPos = (sid) => slotPos(slotById[sid]); run.TOWERS = TOWERS; run.buildCost = buildCost; run.upCost = upCost;
    function say(s, t = 1.5) { R.msg = s; R.msgT = t; }

    // ---- input: taps pick a tower spot (tower), a plate, or nothing
    function tap(x, y) {
      let best = null, bd = 22 * Math.max(1, K);
      for (const s of SLOTS) { const [sx, sy] = slotPos(s), d = Math.hypot(sx - x, sy - y); if (d < bd) { bd = d; best = s; } }
      if (best) { R.sel = { kind: 'slot', id: best.id }; sfx.pop(1.3); return; }
      const p = plates.find((q) => Math.hypot(q.x - x, q.y - y) < RP + 4);
      if (p) { R.sel = { kind: 'plate', id: p.id }; sfx.pop(1.1); return; }
      R.sel = null;
    }

    function step(dt) {
      run.t += dt;
      R.holding = R.holdOn && R.steam > 0.02 && R.state === 'wave';
      if (R.holding) R.steam = Math.max(0, R.steam - dt); else R.steam = Math.min(R.steamMax, R.steam + dt * R.steamMax / 16);
      if (!R.holding && !R.jam) {
        C.t += dt;
        while (C.t >= PERIOD) { C.t -= PERIOD; C.k++; }
        const wasMoving = C.e > 0; C.e = C.t < DWELL ? 0 : ease((C.t - DWELL) / MOVE);
        if (wasMoving && C.e === 0) sfx.play('tick', 0.35) || sfx.tone(1900, 0.02, 'square', 0.012);
      }
      if (R.state === 'wave') {
        R.waveT += dt;
        while (R.spawnQ.length && R.spawnQ[0].at <= R.waveT) addMarble(R.spawnQ.shift().type);
      }
      stepMarbles(dt); stepTowers(dt);
      R.marbles = R.marbles.filter((m) => !m.dead);
      if (R.boss && R.boss.dead) R.boss = null;
      if (R.state === 'wave' && !R.spawnQ.length && !R.marbles.length && !run.over) waveDone();
      R.flash = Math.max(0, R.flash - dt); R.msgT -= dt;
    }

    run.update = function (dt, input) {
      for (const t of input.taps) tap(t.x, t.y);
      const n = R.speed; for (let i = 0; i < n; i++) step(dt);
      fx.update(dt);
      panel();
    };
    run.quit = () => { R.endCause = 'quit'; };
    run.result = function () {
      const cogs = Array.from({ length: R.cleared }, (_, i) => 2 + (i + 1)).reduce((a, b) => a + b, 0) + Math.floor(R.pops / 12) + (R.won ? 40 : 0);
      const lines = [`You held ${R.cleared} wave${R.cleared === 1 ? '' : 's'} and smashed ${R.pops} marbles.`];
      if (!R.won) lines.push(R.endCause === 'held' ? 'The machine held all 10 waves! Ring the Cannon Bell in the workshop to face the boss.'
        : R.endCause === 'quit' ? 'You left the workshop early.' : R.endCause || 'The vault broke.');
      if (!R.won && R.cleared < 6 && !st.hammer) lines.push('Tip: Hammer Plans unlock a tower that crushes steel.');
      else if (!R.won && R.cleared >= 5) lines.push('Tip: HOLD stops the machine. Use it while marbles queue at a port beside your towers.');
      return { earned: { cogs }, won: !!R.won, title: R.endCause === 'held' ? 'The machine held!' : undefined, lines, score: R.cleared };
    };

    // ---------------------------------------------------------------- the bottom panel (DOM, rebuilt only when it changes)
    let panelKey = '', root = null;
    if (env.ui) {
      env.ui.innerHTML = '<div class="cm"><div class="cm-panel" id="cm-panel"></div><div class="cm-bar"><button type="button" id="cm-hold">HOLD</button><button type="button" id="cm-go">Send wave 1 ▶</button></div></div>';
      root = env.ui;
      const hb = root.querySelector('#cm-hold');
      const on = (e) => { e.preventDefault(); act.hold(true); hb.classList.add('on'); };
      const off = () => { act.hold(false); hb.classList.remove('on'); };
      hb.addEventListener('pointerdown', on); for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) hb.addEventListener(ev, off);
      hb.addEventListener('click', (e) => { if (e.detail === 0 && !R.holdOn) { act.hold(true); setTimeout(off, 600); } }); // keyboard/scripted clicks hold briefly (the fuzzer reaches it); real presses use pointer events
      root.addEventListener('click', (e) => {
        const b = e.target.closest('button[data-a]'); if (!b) return;
        const [a, x, y] = b.dataset.a.split(':'); const sel = R.sel;
        if (['build', 'up', 'sell'].includes(a) && !(sel && sel.kind === 'slot')) { panelKey = ''; return panel(); } // a stale button from a moment ago
        if (a === 'go') { if (R.state === 'build') act.send(); else act.speed(); }
        else if (a === 'build') { if (!act.build(sel.id, x)) sfx.nope(); }
        else if (a === 'up') { if (!act.upgrade(sel.id)) sfx.nope(); }
        else if (a === 'sell') act.sell(sel.id);
        else if (a === 'gear') { if (!act.gear(+x, y)) sfx.nope(); }
        else if (a === 'turn') act.turn(+x);
        else if (a === 'chain') { if (!act.chain(+x, +y)) sfx.nope(); }
        else if (a === 'close') R.sel = null;
        panelKey = ''; panel();
      });
      root.querySelector('#cm-go').dataset.a = 'go';
    }
    function panel() {
      if (!root) return;
      const s = R.sel, t = s && s.kind === 'slot' ? R.towers[s.id] : null, b = Math.floor(R.brass);
      const goTxt = R.state === 'build' ? `Send wave ${R.wave + 1} ▶` : R.speed === 1 ? '▶▶ Go faster' : '▶ Normal speed';
      const hold = root.querySelector('#cm-hold');
      hold.style.setProperty('--steam', `${Math.round(100 * R.steam / R.steamMax)}%`);
      const afford = [...Object.keys(TOWERS).map((k) => b >= buildCost(k)), t && t.lvl < 2 && b >= upCost(t), b >= st.chainCost]; // not the brass itself: a rebuild mid-press would swallow the tap
      const left = root.querySelector('#cm-left'); if (left) left.textContent = R.spawnQ.length + R.marbles.length;
      const key = JSON.stringify([s, t && t.lvl, afford, R.state, R.wave, R.speed, R.jam, R.freeChains, s && s.kind === 'plate' && plates.map((p) => p.gear + p.rot).join(''), [...R.chains].join()]);
      if (key === panelKey) return; panelKey = key;
      const go = root.querySelector('#cm-go'); go.textContent = goTxt; go.classList.toggle('fast', R.state !== 'build');
      hold.textContent = R.state === 'build' ? 'HOLD (in waves)' : 'HOLD';
      let msg = '', row = '';
      if (!s) {
        msg = R.jam ? '<b>Jammed!</b> Two gears are chained the wrong way round, so nothing turns. Tap a plate to fix its chain.'
          : R.state === 'build' ? (R.wave === 0 ? 'Marbles drop in at the top and roll along the grooves. They cross only where two grooves <b>line up</b>. Tap a ◯ spot to build.' : 'Build, change gears or turn plates.') + ` Next: <b>${nextWave()}</b>.`
            : `Wave ${R.wave}: <b id="cm-left">${R.spawnQ.length + R.marbles.length}</b> marbles left. Press and hold <b>HOLD</b> to stop the machine.`;
      } else if (s.kind === 'slot' && !t) {
        msg = 'Build a tower here.' + (slotById[s.id].board ? '' : ' It rides the plate round as it turns.');
        row = Object.entries(TOWERS).map(([k, T]) => unlockedT(k) ? `<button type="button" data-a="build:${k}" ${b >= buildCost(k) ? '' : 'disabled'}>${T.icon} ${T.name}<small>${buildCost(k)} brass</small></button>`
          : `<button type="button" disabled>${T.icon} ${T.name}<small>Plans needed</small></button>`).join('');
      } else if (s.kind === 'slot') {
        const T = TOWERS[t.type];
        msg = `<b>${T.name} · Lv ${t.lvl + 1}</b>: ${T.lv[t.lvl]}. ${t.lvl < 2 ? `Next: ${T.lv[t.lvl + 1]}.` : T.blurb}`;
        row = `<button type="button" data-a="up" ${t.lvl < 2 && b >= upCost(t) ? '' : 'disabled'}>${t.lvl < 2 ? `Upgrade<small>${upCost(t)} brass</small>` : 'Max level<small>&nbsp;</small>'}</button>
          <button type="button" data-a="sell">Sell<small>+${Math.floor(t.spent * 0.7)} brass</small></button><button type="button" data-a="close">Done<small>&nbsp;</small></button>`;
      } else {
        const p = plates[s.id], G = GEARS[p.gear], lock = gearsLocked();
        msg = lock ? `<b>${G.name} gear</b> (${G.speed}). Gears are locked during a wave.`
          : `<b>${G.name} gear</b>, ${p.dir ? (p.dir > 0 ? 'clockwise' : 'anticlockwise') : R.jam ? 'jammed' : '<b>not driven</b>'}, ${G.speed}. Neighbours must fit: S+L or M+M mesh.`;
        const right = P(p.r, p.c + 1), down = P(p.r + 1, p.c);
        const chainBtn = (q, lab) => { if (!q) return ''; const has = R.chains.has(chainKey(p, q)), ok = !meshes(p, q) && fits(p, q);
          const cost = R.freeChains > 0 ? 'free' : `${st.chainCost}`; return `<button type="button" data-a="chain:${p.id}:${q.id}" ${lock || (!has && (!ok || (R.freeChains <= 0 && b < st.chainCost))) ? 'disabled' : ''}>${has ? 'Unchain' : 'Chain'} ${lab}<small>${has ? 'remove' : ok ? cost : meshes(p, q) ? 'meshed' : 'no room'}</small></button>`; };
        row = ['S', 'M', 'L'].map((g) => `<button type="button" class="${p.gear === g ? 'on' : ''}" data-a="gear:${p.id}:${g}" ${lock || !gearOk(p, g) ? 'disabled' : ''}>${g}<small>${GEARS[g].n} teeth</small></button>`).join('')
          + `<button type="button" data-a="turn:${p.id}" ${lock ? 'disabled' : ''}>↻<small>turn</small></button>` + chainBtn(right, '→') + chainBtn(down, '↓');
      }
      root.querySelector('#cm-panel').innerHTML = `<p class="cm-msg">${msg}</p><div class="cm-row">${row}</div>`;
    }
    panel();

    // ---------------------------------------------------------------- drawing
    const WOOD = '#3a2a1b', WOOD2 = '#2b1f14';
    function drawGear(g, p) {
      const n = GEARS[p.gear].n, r = n * D / 24, a0 = theta(p), tooth = Math.min(7 * K, r * 0.16);
      g.save(); g.translate(p.x, p.y); g.rotate(a0);
      g.fillStyle = p.dir ? '#8a6d3b' : '#6a5a46'; g.beginPath();
      for (let i = 0; i < n; i++) { const a = i * TAU / n, w = TAU / n / 4;
        g.lineTo(Math.cos(a - w * 1.6) * (r - tooth), Math.sin(a - w * 1.6) * (r - tooth)); g.lineTo(Math.cos(a - w) * r, Math.sin(a - w) * r); g.lineTo(Math.cos(a + w) * r, Math.sin(a + w) * r); g.lineTo(Math.cos(a + w * 1.6) * (r - tooth), Math.sin(a + w * 1.6) * (r - tooth)); }
      g.closePath(); g.fill(); g.strokeStyle = '#00000066'; g.lineWidth = 1.5; g.stroke(); g.restore();
    }
    function drawChain(g, a, b) {
      const ra = GEARS[a.gear].n * D / 24 * 0.86, rb = GEARS[b.gear].n * D / 24 * 0.86, dx = b.x - a.x, dy = b.y - a.y, l = Math.hypot(dx, dy), nx = -dy / l, ny = dx / l;
      g.save(); g.strokeStyle = '#c7ccd4'; g.lineWidth = 4 * K; g.setLineDash([5 * K, 3 * K]); g.lineDashOffset = -(C.k + C.e) * 8 * (a.dir || 0);
      for (const s of [1, -1]) { g.beginPath(); g.moveTo(a.x + nx * ra * s, a.y + ny * ra * s); g.lineTo(b.x + nx * rb * s, b.y + ny * rb * s); g.stroke(); }
      g.restore();
    }
    function drawPlate(g, p) {
      const sel = R.sel && R.sel.kind === 'plate' && R.sel.id === p.id;
      g.save(); g.translate(p.x, p.y);
      g.fillStyle = '#00000055'; g.beginPath(); g.arc(3, 5, RP, 0, TAU); g.fill();
      g.rotate(theta(p));
      if (!env.sprite(g, 'obj-plate', 0, 0, RP * 2.04, RP * 2.04)) {
        const gr = g.createRadialGradient(-RP * 0.3, -RP * 0.3, RP * 0.1, 0, 0, RP); gr.addColorStop(0, '#e2c48d'); gr.addColorStop(1, '#a8834b');
        g.fillStyle = gr; g.beginPath(); g.arc(0, 0, RP, 0, TAU); g.fill();
      }
      g.strokeStyle = sel ? '#ffe08a' : '#5d4423'; g.lineWidth = sel ? 4 : 2.5; g.beginPath(); g.arc(0, 0, RP - 1, 0, TAU); g.stroke();
      // the grooves: a dark channel with a lighter floor
      g.lineCap = 'round'; g.lineJoin = 'round';
      for (const [w, c] of [[0.3, '#3d2a14'], [0.2, '#1e140a']]) {
        g.strokeStyle = c; g.lineWidth = RP * w;
        for (const gr of p.grooves) { g.beginPath(); gr.pts.forEach(([x, y], i) => (i ? g.lineTo(x * RP, y * RP) : g.moveTo(x * RP, y * RP))); g.stroke(); }
      }
      // the hub shows which way and how fast it turns
      g.fillStyle = '#5d4423'; g.beginPath(); g.arc(0, 0, RP * 0.17, 0, TAU); g.fill();
      g.restore();
      g.save(); g.translate(p.x, p.y);
      g.fillStyle = '#f5dfb0'; g.font = `800 ${Math.round(11 * K + 1)}px Nunito, system-ui`; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(p.gear, 0, 0.5);
      if (p.dir) { g.strokeStyle = '#f5dfb099'; g.lineWidth = 2; g.beginPath(); const a = -Math.PI / 2; g.arc(0, 0, RP * 0.26, a - 0.9 * p.dir, a + 0.9 * p.dir, p.dir < 0); g.stroke();
        const e = a + 0.9 * p.dir, ex = Math.cos(e) * RP * 0.26, ey = Math.sin(e) * RP * 0.26; g.fillStyle = '#f5dfb099'; g.beginPath(); g.arc(ex, ey, 2.5, 0, TAU); g.fill(); }
      g.restore();
    }
    function drawTower(g, t, x, y) {
      const T = t.type, r = 11 * K, kick = t.kick ? 1 + t.kick * 1.5 : 1;
      const sel = R.sel && R.sel.kind === 'slot' && R.towers[R.sel.id] === t;
      if (sel) { const s = tStats(t); g.fillStyle = '#ffe08a22'; g.strokeStyle = '#ffe08a88'; g.lineWidth = 1.5; g.beginPath(); g.arc(x, y, s.range, 0, TAU); g.fill(); g.stroke(); }
      if (env.sprite(g, 'tower-' + T, x, y, r * 2.6 * kick)) return lvlPips(g, t, x, y, r);
      g.save(); g.translate(x, y); g.scale(kick, kick);
      g.fillStyle = '#00000066'; g.beginPath(); g.arc(1.5, 2.5, r, 0, TAU); g.fill();
      g.fillStyle = T === 'pin' ? '#3d6e8f' : T === 'hammer' ? '#8f4b2e' : '#6b3d8f'; g.beginPath(); g.arc(0, 0, r, 0, TAU); g.fill();
      g.strokeStyle = '#f5dfb0'; g.lineWidth = 2; g.stroke();
      g.font = `${Math.round(12 * K + 1)}px system-ui`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(TOWERS[T].icon, 0, 1);
      g.restore(); lvlPips(g, t, x, y, r);
    }
    function lvlPips(g, t, x, y, r) { for (let i = 0; i <= t.lvl; i++) { g.fillStyle = '#ffd166'; g.beginPath(); g.arc(x - (t.lvl * 4) + i * 8, y + r + 4, 2.4, 0, TAU); g.fill(); } return true; }
    function drawMarble(g, m) {
      const [x, y] = marblePos(m), r = m.r, T = m.T;
      if (!env.sprite(g, 'mar-' + m.type, x, y, r * 2.3)) {
        const gr = g.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.1, x, y, r); gr.addColorStop(0, T.hi); gr.addColorStop(1, T.col);
        g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill(); g.strokeStyle = '#00000055'; g.lineWidth = 1; g.stroke();
      }
      if (m.flash > 0) { g.fillStyle = '#ffffffaa'; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill(); }
      if (m.st === 'held') { const left = Math.min(latchOf(m) - m.wait, latchOf(m) * 3 - m.rowT); if (left < 1.2) { g.strokeStyle = '#ff6b6b'; g.lineWidth = 2; g.beginPath(); g.arc(x, y, r + 3, -Math.PI / 2, -Math.PI / 2 + TAU * Math.min(1, (1.2 - left) / 1.2)); g.stroke(); } } // about to jump
      if (m.hp < m.max && !T.boss) { g.fillStyle = '#000a'; g.fillRect(x - r, y - r - 5, r * 2, 3); g.fillStyle = '#7ee08a'; g.fillRect(x - r, y - r - 5, r * 2 * m.hp / m.max, 3); }
    }
    run.draw = function (g) {
      g.save();
      if (fx.shake > 0) g.translate((Math.random() - 0.5) * fx.shake, (Math.random() - 0.5) * fx.shake);
      // pegboard
      g.fillStyle = WOOD; g.fillRect(-20, -20, W + 40, H + 40);
      if (!env.sprite(g, 'bg-board', W / 2, H / 2, W, H)) {
        g.fillStyle = WOOD2; for (let y = 14; y < H; y += 18) for (let x = (y / 18) % 2 ? 9 : 18; x < W; x += 18) { g.beginPath(); g.arc(x, y, 1.6, 0, TAU); g.fill(); }
      } else { g.fillStyle = '#0000004d'; g.fillRect(0, 0, W, H); }
      // the entry chute and the vault
      g.strokeStyle = '#1b130b'; g.lineWidth = 18 * K; g.lineCap = 'butt';
      g.beginPath(); g.moveTo(entryPt[0], 0); g.lineTo(...entryPt); g.stroke();
      g.beginPath(); g.moveTo(...exitPt); g.lineTo(exitPt[0], baseY); g.stroke();
      const vw = 120 * K, vh = 26 * K;
      const art = env.sprite(g, 'obj-vault', W / 2, baseY + 8 * K, 84 * K, 84 * K); // the importer squares sprites; the box fills about half the height
      if (!art) {
        g.fillStyle = R.flash > 0 ? '#c0392b' : '#4a5560'; g.fillRect(W / 2 - vw / 2, baseY - 4, vw, vh); g.strokeStyle = '#c9d1d9'; g.lineWidth = 2; g.strokeRect(W / 2 - vw / 2, baseY - 4, vw, vh);
      }
      g.fillStyle = '#fff'; g.font = `800 ${Math.round(14 * K + 2)}px "Lilita One", system-ui`; g.textAlign = 'center'; g.textBaseline = 'middle';
      if (art) { g.textAlign = 'left'; g.fillStyle = '#000000a0'; g.fillRect(W / 2 + 44 * K, baseY - 6 * K, 92 * K, 26 * K); g.fillStyle = R.flash > 0 ? '#ff6b6b' : '#fff'; g.fillText(`VAULT ♥ ${R.lives}`, W / 2 + 50 * K, baseY + 7 * K); }
      else g.fillText(`VAULT ♥ ${R.lives}`, W / 2, baseY + vh * 0.5 - 4);
      // gears, chains, plates
      for (const p of plates) drawGear(g, p);
      for (const k of R.chains) { const [a, b] = k.split('-').map((i) => plates[+i]); drawChain(g, a, b); }
      for (const p of plates) drawPlate(g, p);
      // gap lights: green when two grooves meet across a gap right now
      for (const p of plates) for (const d of [0, 1]) {
        const q = junction(p, d); if (!q || typeof q === 'string') continue;
        let open = false; for (const gr of p.grooves) for (const e of [0, 1]) if (portDir(p, gr.ends[e]) === d && receiving(q, (d + 2) % 4)) open = true;
        const x = (p.x + q.x) / 2, y = (p.y + q.y) / 2;
        if (open) { g.fillStyle = R.holding ? '#7fd0ff44' : '#7ee08a44'; g.beginPath(); g.arc(x, y, 10 * K, 0, TAU); g.fill(); }
        g.fillStyle = open ? (R.holding ? '#7fd0ff' : '#7ee08a') : '#00000088'; g.beginPath(); g.arc(x, y, open ? 5 * K : 3, 0, TAU); g.fill();
      }
      if (R.jam && R.jamAt) { const [a, b] = R.jamAt; g.strokeStyle = '#ff6b6b'; g.lineWidth = 3; g.setLineDash([4, 4]); g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke(); g.setLineDash([]); }
      // empty tower spots
      for (const s of SLOTS) if (!R.towers[s.id]) {
        const [x, y] = slotPos(s), sel = R.sel && R.sel.kind === 'slot' && R.sel.id === s.id;
        g.strokeStyle = sel ? '#ffe08a' : s.board ? '#f5dfb066' : '#3d2a1499'; g.lineWidth = sel ? 3 : 2; g.setLineDash(sel ? [] : [3, 3]);
        g.beginPath(); g.arc(x, y, 9 * K, 0, TAU); g.stroke(); g.setLineDash([]);
      }
      // marbles (rail ones first so plate marbles sit on top), then towers above them
      for (const m of R.marbles) if (m.st === 'rail' || m.st === 'exit') drawMarble(g, m);
      for (const m of R.marbles) if (m.st !== 'rail' && m.st !== 'exit') drawMarble(g, m);
      for (const [sid, t] of Object.entries(R.towers)) { const [x, y] = slotPos(slotById[sid]); drawTower(g, t, x, y); }
      for (const tr of R.tracers) { g.strokeStyle = tr.c; g.globalAlpha = Math.min(1, tr.t * 12); g.lineWidth = 2; g.beginPath(); g.moveTo(tr.x, tr.y); g.lineTo(tr.x2, tr.y2); g.stroke(); g.globalAlpha = 1; }
      fx.draw(g);
      g.restore();
      // HUD (top-right 56 px is the pause button)
      g.fillStyle = '#000000aa'; g.fillRect(0, 0, W, 44);
      g.font = '400 18px "Lilita One", system-ui'; g.textAlign = 'left'; g.textBaseline = 'middle';
      g.fillStyle = '#f5dfb0'; g.fillText(`Wave ${R.wave}/${LAST}`, 12, 22);
      g.fillStyle = R.flash > 0 ? '#ff6b6b' : '#ff9f9f'; g.fillText(`♥ ${R.lives}`, 112, 22);
      g.fillStyle = '#ffd166'; g.fillText(`⚙ ${Math.floor(R.brass)}`, 172, 22);
      if (R.boss) { const bw = W - 120; g.fillStyle = '#000a'; g.fillRect(60, 48, bw, 10); g.fillStyle = '#ff6b6b'; g.fillRect(60, 48, bw * Math.max(0, R.boss.hp / R.boss.max), 10); g.fillStyle = '#fff'; g.font = '800 11px Nunito, system-ui'; g.textAlign = 'center'; g.fillText('THE CANNONBALL', W / 2, 53); }
      if (R.holding) { g.fillStyle = '#7fd0ff'; g.font = '400 16px "Lilita One", system-ui'; g.textAlign = 'right'; g.fillText('HELD', W - 60, 22); }
      if (R.msgT > 0 && R.msg) { g.globalAlpha = Math.min(1, R.msgT * 2); g.fillStyle = '#000000b0'; const w = Math.min(W - 40, g.measureText(R.msg).width + 40);
        g.fillRect(W / 2 - w / 2, Y0 + D * 1.5 - 18, w, 36); g.fillStyle = '#ffe08a'; g.font = '400 18px "Lilita One", system-ui'; g.textAlign = 'center'; g.fillText(R.msg, W / 2, Y0 + D * 1.5); g.globalAlpha = 1; }
    };
    return run;
  }

  function drawFace(g, who, x, y, r) {
    const skin = { tilly: '#f2c79b', gus: '#d9a07a', marla: '#c98d6b' }[who] || '#f2c79b';
    g.fillStyle = '#3a2a1b'; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
    g.fillStyle = skin; g.beginPath(); g.arc(x, y + 2, r * 0.72, 0, TAU); g.fill();
    g.fillStyle = { tilly: '#b5562f', gus: '#555', marla: '#2d2440' }[who]; g.beginPath(); g.arc(x, y - r * 0.25, r * 0.72, Math.PI, 0); g.fill(); // hair / cap
    g.fillStyle = '#c9a24a'; g.strokeStyle = '#5d4423'; g.lineWidth = 2; for (const s of [-1, 1]) { g.beginPath(); g.arc(x + s * r * 0.28, y, r * 0.2, 0, TAU); g.fill(); g.stroke(); } // goggles
    g.fillStyle = '#2b1f14'; for (const s of [-1, 1]) { g.beginPath(); g.arc(x + s * r * 0.28, y, r * 0.08, 0, TAU); g.fill(); }
    g.strokeStyle = '#5d2e1e'; g.lineWidth = 2; g.beginPath(); g.arc(x, y + r * 0.3, r * 0.2, 0.2, Math.PI - 0.2); g.stroke();
    if (who === 'gus') { g.fillStyle = '#777'; g.fillRect(x - r * 0.4, y + r * 0.42, r * 0.8, r * 0.2); }
  }

  const CONFIG = {
    id: 'cog-marble', title: 'Cog & Marble', tagline: 'A clockwork tower defence. Gears turn grooved plates; marbles can only cross where the grooves line up. Keep them out of the vault.',
    howTo: 'Marbles roll down from the top and along the grooves. They can cross a gap only when two grooves line up, and they jump a gap if they wait too long. Tap a ◯ spot to build towers; tap a plate to change its gear (small spins fast, large slow) or turn it. Press and hold HOLD to stop the machine. Survive 10 waves; spend cogs in the workshop between runs.',
    runVerb: 'Start the machine', winTitle: 'Cannonball smashed!', loseTitle: 'The vault broke', scoreName: 'waves held',
    colors: { accent: '#ffcf6e', bg: '#1d150e', card: '#2e2216' },
    currencies: [{ id: 'cogs', name: 'cogs', color: '#ffcf6e' }],
    characters: [
      { id: 'tilly', name: 'Tilly the Tinker', blurb: 'Balanced. Pin guns cost 40 instead of 50.', unlock: 0 },
      { id: 'gus', name: 'Gus the Gearwright', blurb: 'Can change gears mid-wave, and starts with a free chain.', unlock: 1 },
      { id: 'marla', name: 'Marla Magnet', blurb: 'Starts with Magnet plans; her magnets also zap marbles.', unlock: 2 },
    ],
    drawFace, nodes: NODES, touchOffset: 0, baseStats, createRun,
  };
  const API = { NODES, CONFIG, createRun, baseStats, MARBLES, WAVES, TOWERS };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  if (typeof window !== 'undefined') { window.CogMarble = API; Kit.game(CONFIG); }
})();
