// Cog & Marble v2: a clockwork tower defence on a GraviTrax-style marble run. Marbles roll down pre-laid track:
// turntables (grooved plates sitting on gears), switches, spirals, cannons, tunnels and loop-the-loops. The gear train is
// its own layer: pegs on the board hold small, medium or large gears; meshed gears turn opposite ways, chains keep the
// same way, and a turntable turns with whatever gear is on its peg (one tooth per click, so small gears spin fast). A
// marble boards a turntable when a groove lines up with its track and leaves by whichever exit the groove's far end
// meets, so gear choices decide where marbles go. Speed matters: slow marbles fall off loops. A run is three boards
// (one screen, then two tall ones that scroll), each with its own objective.
// Plugs into the Pocket Prototypes kit (see ../README.md). createRun() is DOM-free apart from draw() and the env.ui panel,
// so sim.js drives the real model in node (exports at the bottom).
(function () {
  'use strict';
  const TAU = Math.PI * 2, U = Math.PI / 24; // angle unit 7.5°: every gear step and every port direction is a whole number of these
  const WW = 360, PITCH = 48, STEP = 3; // world width; neighbouring pegs are PITCH apart (gear radius = teeth * PITCH / 24); track sample spacing
  const GEARS = { S: { n: 8, stepU: 6, name: 'Small', speed: 'fast: 45° a click' }, M: { n: 12, stepU: 4, name: 'Medium', speed: '30° a click' }, L: { n: 16, stepU: 3, name: 'Large', speed: 'slow: 22.5° a click' } };
  const DWELL = 0.3, MOVE = 0.3, PERIOD = DWELL + MOVE; // a click: the machine rests (grooves can line up), then turns
  // grooves join two rim ports, by local direction (0 E, 1 S, 2 W, 3 N; canvas y is down)
  const PATTERNS = { bar: [[0, 2]], cross: [[0, 2], [1, 3]], elbow: [[0, 1]], twin: [[0, 1], [2, 3]] };
  const SPD = { slow: 48, flat: 72, fast: 125, plate: 62 }; // terminal track speeds (world units / s) before a marble's pace

  const MARBLES = {
    clay: { hp: 2, pace: 1, r: 7, brass: 2, dmg: 1, latch: 4.5, col: '#d9774b', hi: '#ffb08a', name: 'Clay' },
    glass: { hp: 3, pace: 1.05, r: 7, brass: 2, dmg: 1, latch: 4.5, col: '#5fc8e8', hi: '#e0fbff', name: 'Glass', glass: true },
    shard: { hp: 1, pace: 1.2, r: 5, brass: 1, dmg: 1, latch: 4, col: '#9be3f5', hi: '#ffffff', name: 'Shard' },
    rubber: { hp: 4, pace: 1.35, r: 7, brass: 3, dmg: 1, latch: 2.5, col: '#e84a8a', hi: '#ffa6c9', name: 'Rubber' },
    steel: { hp: 9, pace: 0.8, r: 8, brass: 5, dmg: 3, latch: 5.5, armor: 1, col: '#8c96a3', hi: '#eef3f8', name: 'Steel', steel: true },
    cannon: { hp: 300, pace: 0.55, r: 15, brass: 120, dmg: 99, latch: 6, armor: 1, col: '#33363d', hi: '#9aa3b0', name: 'The Cannonball', boss: true, steel: true },
  };
  // waves are numbered across the whole run; each board plays a slice. a wave: groups of [type, count] interleaved evenly
  const WAVES = [
    { g: [['clay', 10]], gap: 1.1 },
    { g: [['clay', 16]], gap: 0.8 },
    { g: [['clay', 12], ['glass', 8]], gap: 0.7 },
    { g: [['clay', 8], ['steel', 6]], gap: 1.0 },
    { g: [['glass', 10], ['steel', 8]], gap: 0.85 },
    { g: [['rubber', 8], ['steel', 8], ['clay', 6]], gap: 0.75 },
    { g: [['glass', 12], ['steel', 10], ['rubber', 6]], gap: 0.7 },
    { g: [['rubber', 12], ['clay', 12]], gap: 0.6 },
    { g: [['glass', 16], ['steel', 6]], gap: 0.56 },
    { g: [['rubber', 14], ['glass', 12], ['steel', 8]], gap: 0.5 },
    { g: [['clay', 14], ['glass', 14], ['rubber', 10], ['steel', 12]], gap: 0.42 },
  ];
  const LAST = WAVES.length;
  const BOSS_WAVE = { g: [['steel', 6], ['cannon', 1], ['rubber', 10]], gap: 0.72 };
  const DRAFT_AFTER = [3, 7, 9];

  const TOWERS = {
    pin: { name: 'Pin Gun', icon: '📍', cost: 50, up: [60, 110], blurb: 'Fires at the marble furthest along. Pins can\'t dent steel until level 2.',
      lv: ['Fires pins: 1 damage', '2 damage per pin', 'Twice as fast, hits 2 marbles'] },
    hammer: { name: 'Hammer', icon: '🔨', cost: 85, up: [80, 140], blurb: 'Smashes every marble next to it. Ignores armour. Great beside a turntable where marbles queue.',
      lv: ['Smash: 3 damage nearby', 'Reaches further', '6 damage, faster'] },
    magnet: { name: 'Magnet', icon: '🧲', cost: 70, up: [70, 120], blurb: 'Slows marbles and drains their speed, steel most of all. A slow marble falls off a loop.',
      lv: ['Slows and drains speed', 'Wider and stronger', 'Also zaps a marble'] },
  };
  const BOONS = [
    { id: 'sharp', icon: '📍', name: 'Sharp Pins', desc: 'Pins +1 damage' },
    { id: 'reach', icon: '🔨', name: 'Long Handles', desc: 'Hammers reach 35% further' },
    { id: 'latch', icon: '🔒', name: 'Stiff Latches', desc: 'Marbles wait 2 s longer at a turntable before jumping it' },
    { id: 'boiler', icon: '♨️', name: 'Spare Boiler', desc: '+60% steam for HOLD' },
    { id: 'bounty', icon: '🪙', name: 'Brass Bounty', desc: '+30% brass from marbles' },
    { id: 'parts', icon: '📦', name: 'Spare Parts', desc: '+120 brass now' },
    { id: 'patch', icon: '🩹', name: 'Patch the Vault', desc: '+5 vault health' },
    { id: 'blower', icon: '🫧', name: 'Glassblower', desc: 'Glass marbles no longer shatter into shards' },
    { id: 'lodestone', icon: '🧲', name: 'Lodestones', desc: 'Magnets drain 50% more speed' },
    { id: 'chain', icon: '⛓️', name: 'Spare Chain', desc: 'Your next 2 chains are free' },
  ];

  // ---------------------------------------------------------------- tree (currency: cogs). ids match v1 so saves carry over
  const NODES = [
    { id: 'bench', name: 'Workbench', icon: '🧰', desc: (l) => `+30 brass at the start of each run (${30 * l} → ${30 * (l + 1)})`, cost: 6, grow: 1.6, max: 4, req: [], x: 0, y: 0, fx: (s, l) => { s.brass += 30 * l; } },
    { id: 'hammer', name: 'Hammer Plans', icon: '🔨', desc: 'Unlocks the Hammer tower: smashes every marble next to it, armour and all', cost: 12, max: 1, req: ['bench'], x: 1, y: 0, fx: (s) => { s.hammer = true; } },
    { id: 'magnet', name: 'Magnet Plans', icon: '🧲', desc: 'Unlocks the Magnet tower: slows marbles and drains their speed, so they fall off loops', cost: 16, max: 1, req: ['bench'], x: -1, y: 0, fx: (s) => { s.magnet = true; } },
    { id: 'vault', name: 'Thick Vault', icon: '🛡️', desc: '+4 vault health', cost: 8, grow: 1.7, max: 3, req: ['bench'], x: 0, y: 1, fx: (s, l) => { s.lives += 4 * l; } },
    { id: 'boiler', name: 'Bigger Boiler', icon: '♨️', desc: '+40% steam for HOLD', cost: 10, grow: 1.8, max: 3, req: ['bench'], x: 0, y: -1, fx: (s, l) => { s.steam *= 1 + 0.4 * l; } },
    { id: 'latch', name: 'Stiff Latches', icon: '🔒', desc: 'Marbles wait 1 s longer at a turntable before jumping it', cost: 14, grow: 1.9, max: 3, req: ['boiler'], x: -1, y: -1, fx: (s, l) => { s.latch += l; } },
    { id: 'bounty', name: 'Brass Bounty', icon: '🪙', desc: '+15% brass from marbles', cost: 10, grow: 1.7, max: 4, req: ['vault'], x: 1, y: 1, fx: (s, l) => { s.bounty *= 1 + 0.15 * l; } },
    { id: 'tools', name: 'Fine Tools', icon: '🔧', desc: 'Tower upgrades cost 15% less', cost: 18, grow: 1.8, max: 3, req: ['hammer'], x: 2, y: 0, fx: (s, l) => { s.upgDisc *= 0.85 ** l; } },
    { id: 'chainworks', name: 'Chainworks', icon: '⛓️', desc: 'Chains cost half, and each board starts with a free one', cost: 14, max: 1, req: ['magnet'], x: -2, y: 0, fx: (s) => { s.chainCost = 20; s.freeChain += 1; } },
    { id: 'blueprint', name: 'Blueprints', icon: '📜', desc: 'Workshop picks show 4 cards instead of 3', cost: 20, max: 1, req: ['bounty'], x: 2, y: 1, fx: (s) => { s.drafts = 4; } },
    // excl 'pins': chain hits for swarms, or armour-piercing for steel
    { id: 'ricochet', excl: 'pins', name: 'Ricochet Pins', icon: '↪️', desc: 'Every pin bounces into a second marble for full damage. Best against swarms.', cost: 30, max: 1, req: ['hammer'], x: 1, y: -1, fx: (s) => { s.ricochet = 1; } },
    { id: 'heavy', excl: 'pins', name: 'Heavy Pins', icon: '🔩', desc: 'Pins +1 damage and punch through steel armour. Best against steel.', cost: 30, max: 1, req: ['hammer'], x: 2, y: -1, fx: (s) => { s.pinDmg += 1; s.pierceArmor = 1; } },
    // excl 'lever': what HOLD does besides stopping the machine
    { id: 'overdrive', excl: 'lever', name: 'Overdrive', icon: '⚡', desc: 'While you HOLD, every tower fires twice as fast', cost: 30, max: 1, req: ['boiler'], x: 0, y: -2, fx: (s) => { s.overdrive = 1; } },
    { id: 'freeze', excl: 'lever', name: 'Cold Brake', icon: '❄️', desc: 'While you HOLD, every marble crawls at a quarter speed', cost: 30, max: 1, req: ['boiler'], x: -1, y: -2, fx: (s) => { s.freeze = 1; } },
    { id: 'cannon', win: true, name: 'Ring the Cannon Bell', icon: '🔔', desc: 'Next run, the last wave on the Long Drop brings the Cannonball: a huge iron marble with steel escorts. Smash it to win.', cost: 90, max: 1, req: ['ricochet', 'heavy', 'overdrive', 'freeze', 'tools'], reqAll: 2, x: 0, y: -3 },
  ];

  function baseStats(who) {
    const s = { lives: 15, brass: 120, steam: 3, latch: 0, bounty: 1, upgDisc: 1, hammer: false, magnet: false, chainCost: 40, freeChain: 0,
      drafts: 3, pinCost: 50, pinDmg: 0, pierceArmor: 0, ricochet: 0, overdrive: 0, freeze: 0, gearsInWave: false, magZap: 0 };
    if (who === 'tilly') s.pinCost = 40;
    if (who === 'gus') { s.gearsInWave = true; s.freeChain += 1; }
    if (who === 'marla') { s.magnet = true; s.magZap = 1; }
    return s;
  }

  // ---------------------------------------------------------------- track shapes (world units; the board is WW wide)
  function spiral(cx, cy, r0, r1, a0, turns) { // clockwise on screen, winding in from r0 to r1
    const out = [], n = Math.ceil(turns * 40);
    for (let i = 0; i <= n; i++) { const t = i / n, a = a0 + TAU * turns * t, r = r0 + (r1 - r0) * t; out.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]); }
    return out;
  }
  function curl(x, y, r, side) { // a loop-the-loop seen from above: a ring beside the track, entered and left heading down
    const out = [], cx = x + side * r;
    for (let i = 0; i <= 36; i++) { const a = (side > 0 ? Math.PI : 0) - side * TAU * i / 36; out.push([cx + Math.cos(a) * r, y + Math.sin(a) * r]); }
    return out;
  }
  // ---------------------------------------------------------------- the boards
  // nodes: entry, pass (a merge), sw (switch), cannon, loop (fast marbles go round, slow ones fall to `fail`), tt (turntable),
  // bin (catches a marble), furnace, vault. edges: [from, to, waypoints, opts]; from/to are node ids or 'plate.dir' ports.
  // pegs: [id, x, y, gear, motor]. A turntable sits on a peg; its ports say which tracks are 'in' and name the exits.
  const STAGES = [
    {
      id: 'bench', name: 'The Workbench', H: 580, fit: true, obj: 'guard', waves: [1, 3],
      intro: 'Marbles roll down the track. The <b>turntable</b> takes one when a groove lines up, and lets it out wherever the far end points. Its <b>gear</b> sets the timing. Tap a ◯ to build.',
      pegs: [['m1', 84, 150, 'S', true], ['i1', 132, 150, 'L'], ['tp', 180, 150, 'S']],
      nodes: {
        in: { t: 'entry', x: 180, y: -20 },
        T: { t: 'tt', x: 180, y: 150, R: 44, peg: 'tp', pat: 'cross', rot: 0, spill: 1, ports: { 3: 'in', 1: 'chute', 0: 'spiral', 2: 'zigzag' } },
        sx: { t: 'pass', x: 268, y: 298, tunnel: true },
        M: { t: 'pass', x: 180, y: 410 },
        L: { t: 'loop', x: 180, y: 470, need: 100, side: 1 },
        B: { t: 'bin', x: 96, y: 500 },
        V: { t: 'vault', x: 180, y: 556 },
      },
      edges: [
        ['in', 'T.3', [], { vt: 'flat' }],
        ['T.1', 'M', [], { vt: 'fast' }],
        ['T.0', 'sx', [[300, 150], [338, 200], ...spiral(282, 298, 56, 14, 0, 1.5)], { vt: 'slow' }],
        ['sx', 'M', [[236, 340], [196, 384]], { vt: 'fast', hidden: true }],
        ['T.2', 'M', [[40, 150], [40, 218], [118, 250], [40, 290], [118, 326], [112, 384]], { vt: 'flat' }],
        ['M', 'L', [], { vt: 'fast' }],
        ['L', 'V', [], { vt: 'fast', ok: true }],
        ['L', 'B', [[140, 482]], { vt: 'flat', fail: true }],
      ],
    },
    {
      id: 'sort', name: 'The Sorting Office', H: 980, obj: 'sort', goal: 14, waves: [4, 7],
      intro: '<b>Sort the steel.</b> Steel must reach the furnace, and only the <b>slow lane</b> (left) is slow enough to drop it there. Anything else in the furnace costs 1 ♥. Flip the <b>switch</b> as marbles come.',
      pegs: [['tp', 80, 220, null], ['i1', 128, 220, 'S'], ['m1', 176, 220, 'L', true]],
      nodes: {
        in: { t: 'entry', x: 180, y: -20 },
        S1: { t: 'sw', x: 180, y: 84 },
        T: { t: 'tt', x: 80, y: 220, R: 44, peg: 'tp', pat: 'bar', rot: 1, spill: 1, ports: { 3: 'in', 0: 'fast lane', 1: 'slow lane' } },
        M1: { t: 'pass', x: 290, y: 340 },
        LA: { t: 'loop', x: 80, y: 620, need: 105, side: -1 },
        LB: { t: 'loop', x: 290, y: 620, need: 92, side: 1 },
        F: { t: 'furnace', x: 180, y: 712 },
        M2: { t: 'pass', x: 180, y: 900 },
        V: { t: 'vault', x: 180, y: 956 },
      },
      edges: [
        ['in', 'S1', [], { vt: 'flat' }],
        ['S1', 'T.3', [[110, 104], [80, 140]], { vt: 'flat' }],
        ['S1', 'M1', [[255, 104], [290, 160]], { vt: 'fast' }],
        ['T.0', 'M1', [[200, 262]], { vt: 'fast' }],
        ['T.1', 'LA', [[80, 330], [30, 380], [112, 430], [30, 480], [112, 530], [80, 580]], { vt: 'slow' }],
        ['M1', 'LB', [], { vt: 'fast' }],
        ['LA', 'M2', [[80, 720], [36, 780], [112, 840]], { vt: 'flat', ok: true }],
        ['LA', 'F', [[132, 660]], { vt: 'flat', fail: true }],
        ['LB', 'M2', [[290, 720], [330, 780], [250, 840]], { vt: 'flat', ok: true }],
        ['LB', 'F', [[232, 660]], { vt: 'flat', fail: true }],
        ['M2', 'V', [], { vt: 'fast' }],
      ],
    },
    {
      id: 'drop', name: 'The Long Drop', H: 1420, obj: 'guard', waves: [8, 11],
      intro: 'A long way down: two turntables, a <b>cannon</b> that fires marbles fast, <b>tunnels</b> towers can\'t see into, and a loop. Drag to look around.',
      pegs: [['ta', 90, 150, 'S'], ['m1', 138, 150, 'L', true], ['m2', 84, 770, 'S', true], ['i2', 132, 770, 'L'], ['tb', 180, 770, 'S']],
      nodes: {
        in: { t: 'entry', x: 90, y: -20 },
        TA: { t: 'tt', x: 90, y: 150, R: 44, peg: 'ta', pat: 'cross', rot: 0, spill: 1, ports: { 3: 'in', 1: 'left', 0: 'cannon' } },
        C: { t: 'cannon', x: 300, y: 262, boost: 210 },
        X: { t: 'pass', x: 300, y: 430, tunnel: true },
        S2: { t: 'sw', x: 60, y: 460 },
        M4: { t: 'pass', x: 230, y: 660 },
        TB: { t: 'tt', x: 180, y: 770, R: 50, peg: 'tb', pat: 'twin', rot: 0, spill: 1, ports: { 2: 'in', 3: 'in', 0: 'spiral', 1: 'loop' } },
        sx: { t: 'pass', x: 266, y: 920, tunnel: true },
        L: { t: 'loop', x: 180, y: 930, need: 96, side: -1 },
        B: { t: 'bin', x: 84, y: 980 },
        M5: { t: 'pass', x: 180, y: 1110 },
        S3: { t: 'sw', x: 180, y: 1160 },
        V: { t: 'vault', x: 180, y: 1392 },
      },
      edges: [
        ['in', 'TA.3', [], { vt: 'flat' }],
        ['TA.1', 'S2', [[90, 270], [40, 330], [40, 420]], { vt: 'flat' }],
        ['TA.0', 'C', [[250, 150], [300, 200]], { vt: 'flat' }],
        ['C', 'X', [], { vt: 'fast' }],
        ['X', 'M4', [[300, 560]], { vt: 'fast', hidden: true }],
        ['S2', 'TB.2', [[36, 520], [36, 720], [80, 770]], { vt: 'flat' }],
        ['S2', 'M4', [[140, 520], [180, 590]], { vt: 'flat' }],
        ['M4', 'TB.3', [[180, 690]], { vt: 'flat' }],
        ['TB.0', 'sx', [[300, 770], [338, 830], ...spiral(282, 920, 56, 14, 0, 1.5)], { vt: 'slow' }],
        ['sx', 'M5', [[230, 990], [190, 1060]], { vt: 'fast', hidden: true }],
        ['TB.1', 'L', [], { vt: 'fast' }],
        ['L', 'M5', [[180, 1010], [130, 1060]], { vt: 'flat', ok: true }],
        ['L', 'B', [[130, 960]], { vt: 'flat', fail: true }],
        ['M5', 'S3', [], { vt: 'flat' }],
        ['S3', 'V', [[90, 1200], [50, 1270], [130, 1320], [60, 1360]], { vt: 'flat' }],
        ['S3', 'V', [[270, 1200], [310, 1270], [230, 1320], [300, 1360]], { vt: 'flat' }],
      ],
    },
  ];

  // ---------------------------------------------------------------- geometry
  function smooth(pts, rad = 26) { // round every corner, then resample at STEP spacing
    const out = [pts[0]];
    for (let i = 1; i < pts.length - 1; i++) {
      const a = pts[i - 1], b = pts[i], c = pts[i + 1], l1 = Math.hypot(b[0] - a[0], b[1] - a[1]), l2 = Math.hypot(c[0] - b[0], c[1] - b[1]);
      const r = Math.min(rad, l1 / 2, l2 / 2); if (r < 1) { out.push(b); continue; }
      const p = [b[0] - (b[0] - a[0]) / l1 * r, b[1] - (b[1] - a[1]) / l1 * r], q = [b[0] + (c[0] - b[0]) / l2 * r, b[1] + (c[1] - b[1]) / l2 * r];
      for (let k = 0; k <= 8; k++) { const t = k / 8, u = 1 - t; out.push([u * u * p[0] + 2 * u * t * b[0] + t * t * q[0], u * u * p[1] + 2 * u * t * b[1] + t * t * q[1]]); }
    }
    out.push(pts[pts.length - 1]);
    const res = [out[0]]; let carry = 0;
    for (let i = 1; i < out.length; i++) {
      const a = out[i - 1], b = out[i], l = Math.hypot(b[0] - a[0], b[1] - a[1]); let d = STEP - carry;
      while (d <= l) { res.push([a[0] + (b[0] - a[0]) * d / l, a[1] + (b[1] - a[1]) * d / l]); d += STEP; }
      carry = l - (d - STEP);
    }
    res.push(out[out.length - 1]);
    return res;
  }
  const at = (e, s) => { const f = Math.max(0, Math.min(e.pts.length - 1.001, s / STEP)), i = Math.floor(f), t = f - i, a = e.pts[i], b = e.pts[i + 1] || a; return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]; };
  const rim = (d) => [Math.cos(d * Math.PI / 2), Math.sin(d * Math.PI / 2)];
  function makeGroove(a, b) { // plate-local, unit radius
    const A = rim(a), B = rim(b), pts = [];
    if ((a - b + 4) % 4 === 2) for (let i = 0; i <= 12; i++) { const t = i / 12; pts.push([A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t]); }
    else for (let i = 0; i <= 20; i++) { const t = i / 20, u = 1 - t, k = 0.25; pts.push([u * u * u * A[0] + 3 * u * u * t * A[0] * k + 3 * u * t * t * B[0] * k + t * t * t * B[0], u * u * u * A[1] + 3 * u * u * t * A[1] * k + 3 * u * t * t * B[1] * k + t * t * t * B[1]]); }
    const cum = [0]; for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
    return { ends: [a, b], pts, cum, len: cum[cum.length - 1] };
  }
  function grooveAt(gr, s) {
    s = Math.max(0, Math.min(gr.len, s)); let i = 1; while (i < gr.cum.length - 1 && gr.cum[i] < s) i++;
    const a = gr.pts[i - 1], b = gr.pts[i], f = (s - gr.cum[i - 1]) / ((gr.cum[i] - gr.cum[i - 1]) || 1);
    return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
  }
  const mod = (a, n) => ((a % n) + n) % n;
  const ease = (x) => x * x * (3 - 2 * x);
  const portPt = (p, d) => [p.x + rim(d)[0] * p.R, p.y + rim(d)[1] * p.R];

  /** Build a board's runtime graph from its spec (also used by sim.js and the probe). */
  function buildStage(spec) {
    const N = {}, E = [], pegs = {};
    for (const [id, x, y, gear, motor] of spec.pegs) pegs[id] = { id, x, y, gear, motor: !!motor, dir: 0, plate: null, def: gear };
    for (const [id, n0] of Object.entries(spec.nodes)) {
      const n = N[id] = { id, ...n0, outs: [] };
      if (n.t === 'tt') { n.grooves = PATTERNS[n.pat].map(([a, b]) => makeGroove(a, b)); n.peg = pegs[n.peg]; n.peg.plate = n; n.rot0 = n.rot; n.ports = Object.fromEntries(Object.entries(n.ports).map(([d, v]) => [d, { d: +d, out: v !== 'in', label: v, edge: null }])); }
      if (n.t === 'sw') { n.mode = 'alt'; n.next = 0; n.flick = 0; }
    }
    const end = (ref) => { const [id, d] = ref.split('.'), n = N[id]; return d != null ? { n, d: +d, pt: portPt(n, +d) } : { n, pt: [n.x, n.y] }; };
    for (const [from, to, mid, o] of spec.edges) {
      const A = end(from), B = end(to);
      let raw = [A.pt, ...mid, B.pt];
      if (o.ok) raw = [...curl(A.n.x, A.n.y, 18, A.n.side), ...mid, B.pt];
      const e = { id: E.length, from: A.n.id, to: B.n.id, vt: SPD[o.vt || 'flat'], hidden: !!o.hidden, fail: !!o.fail, curl: !!o.ok, pts: smooth(raw, o.ok ? 6 : 26) };
      e.len = (e.pts.length - 1) * STEP;
      if (B.d != null) e.port = { p: B.n, d: B.d };
      if (A.d != null) A.n.ports[A.d].edge = e.id;
      else if (o.ok) A.n.ok = e.id; else if (o.fail) A.n.fail = e.id; else A.n.outs.push(e.id);
      E.push(e);
    }
    // tower pads: spots clear of track, plates, pegs and pieces, close to busy track; greedy by how much track they see
    const near = [], blockers = [];
    for (const e of E) for (let i = 0; i < e.pts.length; i += 3) { blockers.push([e.pts[i][0], e.pts[i][1], 17]); if (!e.hidden) near.push(e.pts[i]); }
    for (const n of Object.values(N)) blockers.push([n.x, n.y, n.t === 'tt' ? n.R + 16 : n.t === 'vault' ? 48 : n.t === 'furnace' ? 34 : 20]);
    for (const p of Object.values(pegs)) if (!p.plate) blockers.push([p.x, p.y, 20]);
    const cands = [];
    for (let y = 24; y < spec.H - 30; y += 10) for (let x = 18; x <= WW - 18; x += 10) {
      if (blockers.some(([bx, by, r]) => Math.abs(bx - x) < r && Math.abs(by - y) < r && Math.hypot(bx - x, by - y) < r)) continue;
      let see = 0, close = 1e9; for (const q of near) { const d = Math.hypot(q[0] - x, q[1] - y); if (d < 78) see++; if (d < close) close = d; }
      if (close < 44) cands.push({ x, y, see });
    }
    cands.sort((a, b) => b.see - a.see);
    const pads = [], want = Math.round(spec.H / 38);
    for (const c of cands) { if (pads.length >= want) break; if (pads.every((p) => Math.hypot(p.x - c.x, p.y - c.y) >= 46)) pads.push({ id: 'p' + pads.length, x: c.x, y: c.y }); }
    return { N, E, pegs, pads, plates: Object.values(N).filter((n) => n.t === 'tt') };
  }

  // ---------------------------------------------------------------- a run
  function createRun(env) {
    const { W, H, stats: st, sfx, fx } = env;
    const TOP = 48, UIH = 200, VIEWPX = Math.max(200, H - TOP - UIH);
    const C = { k: 0, t: 0, e: 0 }; // the clock: k clicks done, t into this click, e = how far through the turn (0 while resting)
    const R = {
      lives: st.lives, maxLives: st.lives, brass: st.brass, wave: 0, cleared: 0, state: 'build', marbles: [], towers: {}, chains: new Set(),
      steam: st.steam, steamMax: st.steam, holdOn: false, holding: false, speed: 1, sel: null, pops: 0, jam: false, boons: {}, freeChains: st.freeChain,
      spawnQ: [], waveT: 0, pass: {}, tracers: [], flash: 0, nextId: 1, latchBonus: st.latch, bountyMul: st.bounty,
      boss: null, jumpTold: 0, slowTold: 0, C, msg: '', msgT: 0, stageI: -1, sorted: 0, sortAll: 0, sortBonus: 0, stageLives: [], clogs: 0, camY: 0, G: null,
    };
    const run = { over: false, t: 0, R };
    let G, S, sc = 1, offX = 0, viewH = 0, maxCam = 0, panelKey = '', root = null;

    function loadStage(i) {
      R.stageI = i; S = STAGES[i]; G = R.G = buildStage(S);
      sc = S.fit ? Math.min(W / WW, VIEWPX / S.H) : W / WW; offX = (W - WW * sc) / 2; viewH = VIEWPX / sc; maxCam = Math.max(0, S.H - viewH);
      R.camY = 0; R.sel = null; R.sub = null; R.chains = new Set(); R.freeChains = Math.max(R.freeChains, st.freeChain); R.sorted = 0; R.pass = {}; R.routes = {};
      drive(); panelKey = '';
      say(S.name, 1.8);
    }

    // ---- the gear train: one direction per peg (+1 clockwise, -1 counter, 0 not driven); a fight = jammed
    const pegList = () => Object.values(G.pegs);
    const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
    const adjacent = (a, b) => a !== b && Math.abs(dist(a, b) - PITCH) < 3;
    const teeth = (p) => (p.gear ? GEARS[p.gear].n : 0);
    const meshes = (a, b) => adjacent(a, b) && a.gear && b.gear && teeth(a) + teeth(b) === 24;
    const chainable = (a, b) => a !== b && a.gear && b.gear && !meshes(a, b) && dist(a, b) <= PITCH * 3.4 + 1;
    const chainKey = (a, b) => [a.id, b.id].sort().join('~');
    function drive() {
      for (const p of pegList()) p.dir = 0;
      const q = pegList().filter((p) => p.motor && p.gear); q.forEach((p) => { p.dir = 1; }); R.jam = false; R.jamAt = null;
      while (q.length) {
        const a = q.shift();
        for (const b of pegList()) {
          const link = meshes(a, b) ? -1 : R.chains.has(chainKey(a, b)) && chainable(a, b) ? 1 : 0; if (!link) continue;
          const want = a.dir * link;
          if (!b.dir) { b.dir = want; q.push(b); } else if (b.dir !== want) { R.jam = true; R.jamAt = [a, b]; }
        }
      }
      if (R.jam) for (const p of pegList()) p.dir = 0;
    }
    const stepOf = (p) => (p.peg.gear ? GEARS[p.peg.gear].stepU : 0);
    const thetaU = (p) => 12 * p.rot + p.peg.dir * (C.k + C.e) * stepOf(p);
    const theta = (p) => thetaU(p) * U;
    function portDir(p, d) { // the compass direction a groove end faces right now, or -1 while turning / between directions
      if (p.peg.dir && C.e > 0) return -1;
      const a = mod(12 * (d + p.rot) + p.peg.dir * C.k * stepOf(p), 48);
      return a % 12 ? -1 : a / 12;
    }
    const toWorld = (p, lx, ly) => { const a = theta(p), c = Math.cos(a), s = Math.sin(a); return [p.x + (lx * c - ly * s) * p.R, p.y + (lx * s + ly * c) * p.R]; };
    function receiving(p, d) { for (let g = 0; g < p.grooves.length; g++) for (let e = 0; e < 2; e++) if (portDir(p, p.grooves[g].ends[e]) === d) return { g, e }; return null; }
    const latchOf = (m) => m.T.latch + R.latchBonus + (R.boons.latch ? 2 : 0);

    // ---- marbles
    function addMarble(type, at0) {
      const T = MARBLES[type], n1 = Math.max(0, R.wave - 1), mul = 1 + 0.22 * n1 + 0.035 * n1 * n1;
      const m = { id: R.nextId++, type, T, hp: Math.ceil(T.hp * (T.boss ? 1 : mul)), armor: T.armor || 0, r: T.r, age: 0, wait: 0, dist: 0, st: 'track', e: G.N.in.outs[0], s: 0, v: 70 * T.pace, slowT: 1, drain: 0, flash: 0 };
      m.max = m.hp; if (T.boss) { R.boss = m; m.shed = 3; }
      if (at0) Object.assign(m, at0);
      R.marbles.push(m); return m;
    }
    function marblePos(m) {
      if (m.st === 'track') return at(G.E[m.e], m.s);
      if (m.st === 'groove' || m.st === 'held') { const l = grooveAt(m.p.grooves[m.g], m.s); return toWorld(m.p, l[0], l[1]); }
      if (m.st === 'hop') { const f = ease(Math.min(1, m.ht / m.hd)); return [m.hx + (m.tx - m.hx) * f, m.hy + (m.ty - m.hy) * f - Math.sin(f * Math.PI) * m.hh]; }
      return [0, 0];
    }
    const hiddenNow = (m) => m.st === 'track' && G.E[m.e].hidden;
    function goEdge(m, eid) { m.st = 'track'; m.e = eid; m.s = 0; m.wait = 0; }
    function hop(m, eid, kind) { // fly to the start of an edge: 'jump' over a turntable or 'fall' off a loop
      const [x, y] = marblePos(m), to = G.E[eid].pts[0]; m.st = 'hop'; m.hx = x; m.hy = y; m.tx = to[0]; m.ty = to[1]; m.ht = 0; m.hd = 0.45; m.hh = kind === 'jump' ? 18 : 6; m.toE = eid;
      if (kind === 'jump') sfx.play('jump') || sfx.tone(520, 0.08, 'triangle', 0.05, 1.6);
    }
    function spill(m, p) { // waited too long at a turntable: jump over it to its spill exit
      m.wait = 0; R.routes[`${p.id}>jump`] = (R.routes[`${p.id}>jump`] || 0) + 1; if (R.jumpTold++ < 3) say('A marble jumped the turntable!', 1.2);
      hop(m, p.ports[p.spill].edge, 'jump');
    }
    function arrive(m, nid) {
      const n = G.N[nid];
      if (n.t === 'pass' || n.t === 'entry') return goEdge(m, n.outs[0]);
      if (n.t === 'sw') { const i = n.mode === 'alt' ? n.next : n.mode; if (n.mode === 'alt') n.next ^= 1; n.flick = 0.25; sfx.play('flip', 0.4) || sfx.tone(260, 0.03, 'square', 0.03); return goEdge(m, n.outs[i]); }
      if (n.t === 'cannon') { m.v = Math.max(m.v, n.boost * Math.max(0.7, m.T.pace)); n.flick = 0.3; sfx.play('boost') || sfx.zap(); return goEdge(m, n.outs[0]); }
      if (n.t === 'loop') {
        if (m.v >= n.need || m.T.boss) return goEdge(m, n.ok);
        if (R.slowTold++ < 2) say('Too slow for the loop!', 1.2);
        fx.text(n.x, n.y - 14, 'too slow', '#9fe7ff', 11); return hop(m, n.fail, 'fall');
      }
      if (n.t === 'bin') return pop(m, true);
      if (n.t === 'vault') return leak(m);
      if (n.t === 'furnace') return furnace(m, n);
    }
    function board(m, p, g, e) { m.st = 'groove'; m.p = p; m.g = g; m.s = e ? p.grooves[g].len : 0; m.dirn = e ? -1 : 1; m.wait = 0; }
    function stepMarbles(dt) {
      const open = !R.holding, crawl = R.holding && st.freeze ? 0.25 : 1, qOn = {}, plateQ = {};
      for (const m of R.marbles) {
        if (m.dead) continue;
        m.age += dt; m.flash = Math.max(0, m.flash - dt);
        if (m.st === 'track') {
          const e = G.E[m.e], tgt = e.vt * m.T.pace * m.slowT;
          m.v += (tgt - m.v) * Math.min(1, 1.3 * dt); m.v = Math.max(14, m.v - m.drain * dt);
          const ds = m.v * dt * crawl; m.s += ds; m.dist += ds;
          if (e.port) { (qOn[m.e] ||= []).push(m); if (m.s > e.len) m.s = e.len; }
          else if (m.s >= e.len) arrive(m, e.to);
        } else if (m.st === 'groove') {
          const gr = m.p.grooves[m.g], tgt = SPD.plate * m.T.pace * m.slowT;
          m.v += (tgt - m.v) * Math.min(1, 2 * dt);
          const ds = m.v * dt * crawl; m.s += m.dirn * ds / m.p.R; m.dist += ds;
          if (m.s >= gr.len) { m.s = gr.len; m.st = 'held'; m.e = 1; m.wait = 0; }
          else if (m.s <= 0) { m.s = 0; m.st = 'held'; m.e = 0; m.wait = 0; }
        } else if (m.st === 'held') {
          const p = m.p, key = `${p.id}:${m.g}:${m.e}`, i = (plateQ[key] = (plateQ[key] ?? -1) + 1), gr = p.grooves[m.g];
          const back = i * (2 * m.r + 2) / p.R; m.s = m.e ? gr.len - back : back; // stand in line
          if (open) m.wait += dt;
          if (i > 0) continue;
          const d = portDir(p, gr.ends[m.e]), port = d >= 0 && p.ports[d], pk = `${p.id}>${d}`;
          if (open && port && port.out && !(R.pass[pk] > 0)) { R.pass[pk] = 0.16; R.routes[`${p.id}>${port.label}`] = (R.routes[`${p.id}>${port.label}`] || 0) + 1; goEdge(m, port.edge); m.v = Math.max(m.v, 50); continue; }
          if (m.wait > latchOf(m) || m.age > 120) spill(m, p);
        } else if (m.st === 'hop') {
          m.ht += dt; if (m.ht >= m.hd) goEdge(m, m.toE);
        }
      }
      // queues into turntables: marbles line up on the track; the front one boards when a groove end faces its port
      for (const [eid, list] of Object.entries(qOn)) {
        const e = G.E[eid]; list.sort((a, b) => b.s - a.s);
        let lim = e.len; for (const m of list) { if (m.s > lim) m.s = lim; lim = m.s - (2 * m.r + 2); }
        const f = list[0], p = e.port.p, d = e.port.d;
        if (f.dead || f.st !== 'track' || f.s < e.len - 0.5) continue;
        if (open) f.wait += dt;
        const key = `${p.id}<${d}`, rcv = open && !(R.pass[key] > 0) && receiving(p, d);
        if (rcv) { R.pass[key] = 0.16; board(f, p, rcv.g, rcv.e); }
        else if (f.wait > latchOf(f) || f.age > 120) spill(f, p);
      }
      for (const k in R.pass) R.pass[k] -= dt;
    }
    function leak(m) {
      m.dead = true; R.lives = Math.max(0, R.lives - m.T.dmg); R.flash = 0.6; R.lastLeak = m.T.name; if (m.T.boss) R.bossLeftHp = m.hp;
      const V = G.N.V; fx.shake = Math.max(fx.shake, m.T.boss ? 14 : 6); sfx.boom(); fx.text(V.x, V.y - 40, `-${m.T.dmg} ♥`, '#ff6b6b', 18);
      if (R.lives <= 0) { run.over = true; R.endCause = m.T.boss ? 'The Cannonball smashed into the vault.' : `A ${m.T.name.toLowerCase()} marble broke the vault.`; }
    }
    function furnace(m, n) {
      m.dead = true;
      if (m.T.steel) { R.sorted++; R.sortAll++; R.brass += 4; fx.text(n.x, n.y - 26, R.sorted >= S.goal ? `${R.sorted} sorted!` : `+1 sorted`, '#ffb347', 13); sfx.play('sizzle') || sfx.coin(); }
      else if (m.type === 'shard') fx.text(n.x, n.y - 26, 'melts', '#9be3f5', 11);
      else { R.lives = Math.max(0, R.lives - 1); R.clogs++; R.flash = 0.4; fx.text(n.x, n.y - 26, `${m.T.name} clogs it! -1 ♥`, '#ff6b6b', 13); sfx.play('clink') || sfx.nope(); if (R.lives <= 0) { run.over = true; R.endCause = 'The furnace clogged and the vault gave way.'; } }
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
    function pop(m, binned) {
      m.dead = true; R.pops++; const [x, y] = marblePos(m);
      const v = Math.max(1, Math.round(m.T.brass * R.bountyMul * (R.boons.bounty ? 1.3 : 1))); R.brass += v;
      if (binned) { fx.text(x, y - 8, `caught +${v}`, '#ffd166', 12); sfx.play('drop') || sfx.coin(); return; }
      fx.burst(x, y, m.T.boss ? 40 : 7, [m.T.col, m.T.hi], m.T.boss ? 260 : 120, m.T.boss ? 5 : 3);
      if (m.T.boss) { fx.shake = 16; sfx.boom(); fx.text(x, y - 10, 'SMASHED!', '#ffd166', 26); }
      else { sfx.pop(m.T.glass ? 1.6 : 1); if (Math.random() < 0.35) fx.text(x, y - 6, `+${v}`, '#ffd166', 12); }
      if (m.T.glass && !R.boons.blower) for (const k of [-1, 1]) split(m, 'shard', k);
    }
    function split(m, type, k) { // a shard or a shed marble starts where its parent was
      const keep = ['st', 'e', 's', 'p', 'g', 'dirn', 'hx', 'hy', 'tx', 'ty', 'ht', 'hd', 'hh', 'toE', 'v', 'dist'];
      const c = addMarble(type, Object.fromEntries(keep.map((f) => [f, m[f]])));
      if (c.st === 'held') c.st = 'groove';
      if (c.st === 'groove') { const gr = c.p.grooves[c.g]; c.s = Math.max(0, Math.min(gr.len, c.s + k * 0.12)); if (m.st === 'held') c.dirn = m.e ? -1 : 1; }
      else if (c.st === 'track') c.s = Math.max(0, c.s - (k + 1) * 6);
    }
    function bossCheck(m) {
      while (m.shed > 0 && m.hp <= m.max * (m.shed / 4)) {
        m.shed--; fx.shake = 8; sfx.crack(); say('The Cannonball sheds steel!', 1.6);
        for (let i = 0; i < 2; i++) split(m, 'steel', i ? 1 : -1);
      }
    }

    // ---- towers
    function tStats(t) {
      const l = t.lvl, rate = R.holding && st.overdrive ? 2 : 1;
      if (t.type === 'pin') return { range: [82, 88, 94][l], cd: [0.6, 0.5, 0.3][l] / rate, dmg: [1, 2, 2][l] + st.pinDmg + (R.boons.sharp ? 1 : 0), n: l >= 2 ? 2 : 1 };
      if (t.type === 'hammer') return { range: [40, 50, 54][l] * (R.boons.reach ? 1.35 : 1), cd: [1.3, 1.2, 0.95][l] / rate, dmg: [3, 3, 6][l] };
      const lode = R.boons.lodestone ? 1.5 : 1;
      return { range: [62, 76, 80][l], slow: [0.6, 0.5, 0.45][l], drain: [55, 75, 90][l] * lode, zap: l >= 2 || st.magZap ? 0.6 / rate : 0 };
    }
    function stepTowers(dt) {
      const live = R.marbles.filter((m) => !m.dead && !hiddenNow(m) && m.st !== 'hop').map((m) => ({ m, pt: marblePos(m) }));
      for (const m of R.marbles) { m.slowT = 1; m.drain = 0; }
      for (const [pid, t] of Object.entries(R.towers)) {
        const pad = G.pads.find((p) => p.id === pid), x = pad.x, y = pad.y, s = tStats(t);
        const near = live.filter((o) => !o.m.dead && Math.hypot(o.pt[0] - x, o.pt[1] - y) <= s.range + o.m.r);
        t.cd -= dt; t.kick = Math.max(0, (t.kick || 0) - dt);
        if (t.type === 'magnet') {
          for (const o of near) { const k = o.m.T.steel ? 1.5 : 1; o.m.slowT = Math.min(o.m.slowT, o.m.T.steel ? s.slow * 0.6 : s.slow); o.m.drain = Math.max(o.m.drain, s.drain * k); }
          if (s.zap && near.length && t.cd <= 0) { t.cd = s.zap; const o = near.sort((a, b) => b.m.dist - a.m.dist)[0]; hit(o.m, 1, true); R.tracers.push({ x, y, x2: o.pt[0], y2: o.pt[1], t: 0.1, c: '#9fe7ff' }); sfx.zap(); }
          continue;
        }
        if (t.cd > 0 || !near.length) continue;
        if (t.type === 'pin') {
          t.cd = s.cd; t.kick = 0.1; near.sort((a, b) => b.m.dist - a.m.dist);
          for (const o of near.slice(0, s.n)) {
            R.tracers.push({ x, y, x2: o.pt[0], y2: o.pt[1], t: 0.08, c: '#ffe39a' }); hit(o.m, s.dmg, st.pierceArmor);
            if (st.ricochet) { const b = live.find((q) => q.m !== o.m && !q.m.dead && Math.hypot(q.pt[0] - o.pt[0], q.pt[1] - o.pt[1]) < 55); if (b) { R.tracers.push({ x: o.pt[0], y: o.pt[1], x2: b.pt[0], y2: b.pt[1], t: 0.08, c: '#ffe39a' }); hit(b.m, s.dmg, st.pierceArmor); } }
          }
          sfx.play('pin') || sfx.tone(1300, 0.03, 'square', 0.025, 0.6);
        } else {
          t.cd = s.cd; t.kick = 0.18; for (const o of near) hit(o.m, s.dmg, true);
          fx.ring(x, y, s.range, '#ffcf6e'); sfx.hit();
        }
      }
      for (const tr of R.tracers) tr.t -= dt; R.tracers = R.tracers.filter((tr) => tr.t > 0);
    }

    // ---- waves and boards
    const specFor = (n) => (env.boss && n === LAST ? BOSS_WAVE : WAVES[n - 1]);
    function nextWave() {
      const spec = specFor(R.wave + 1); if (!spec) return 'nothing';
      const txt = spec.g.map(([t, n]) => `${n} ${MARBLES[t].boss ? 'Cannonball' : t}`).join(', ');
      return txt + (spec.g.some(([t]) => t === 'steel') && !st.hammer && !st.pierceArmor && !st.magnet ? ' (level 1 pins can\'t dent steel)' : '');
    }
    function sendWave() {
      if (R.state !== 'build' || run.over) return;
      R.wave++; R.state = 'wave'; R.waveT = 0; if (R.sel && R.sel.kind === 'peg' && !st.gearsInWave) { R.sel = null; R.sub = null; }
      const spec = specFor(R.wave);
      const items = spec.g.flatMap(([type, n]) => Array.from({ length: n }, (_, i) => ({ type, key: (i + 0.5) / n }))).sort((a, b) => a.key - b.key);
      R.spawnQ = items.map((it, i) => ({ type: it.type, at: i * spec.gap }));
      say(R.wave === LAST && env.boss ? 'The Cannonball is coming!' : `Wave ${R.wave}`, 1.4); sfx.ding();
    }
    function waveDone() {
      R.cleared = R.wave; const bonus = 20 + 6 * R.wave; R.brass += bonus; R.state = 'build';
      fx.text(WW / 2, R.camY + viewH * 0.4, `Wave ${R.wave} held! +${bonus} brass`, '#ffd166', 18); sfx.coin();
      if (R.wave >= LAST) { run.over = true; R.won = !!env.boss; R.endCause = env.boss ? 'won' : 'held'; return; }
      if (R.wave === S.waves[1]) return endStage();
      if (DRAFT_AFTER.includes(R.wave)) draft();
    }
    function endStage() { // towers come home at full value; the vault's health carries on to the next board
      R.stageLives.push(R.lives);
      for (const t of Object.values(R.towers)) R.brass += t.spent; R.towers = {};
      if (S.obj === 'sort') { const ok = R.sorted >= S.goal; R.sortBonus += ok ? 12 : 0; say(ok ? `Sorted ${R.sorted} steel! +12 cogs` : `Sorted ${R.sorted}/${S.goal} steel`, 2); }
      const next = R.stageI + 1;
      if (DRAFT_AFTER.includes(R.wave)) draft(() => loadStage(next)); else loadStage(next);
    }
    function draft(then) {
      const pool = BOONS.filter((b) => !R.boons[b.id] || ['parts', 'patch', 'chain'].includes(b.id)), opts = [];
      while (opts.length < st.drafts && pool.length) opts.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
      env.pick(then ? 'Board cleared! Workshop: pick one' : 'Workshop: pick one', opts.map((b) => ({ icon: b.icon, name: b.name, desc: b.desc })), (i) => { applyBoon(opts[i]); if (then) then(); });
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
    const gearOk = (p, g) => !g ? !p.motor : pegList().every((q) => !adjacent(p, q) || !q.gear || GEARS[g].n + teeth(q) <= 24);
    function dropBadChains() { for (const k of [...R.chains]) { const [a, b] = k.split('~').map((i) => G.pegs[i]); if (!chainable(a, b)) R.chains.delete(k); } }
    const act = {
      build(pid, type) { if (R.towers[pid] || !G.pads.some((p) => p.id === pid) || !unlockedT(type) || R.brass < buildCost(type)) return false; R.brass -= buildCost(type); R.towers[pid] = { type, lvl: 0, cd: 0.3, spent: buildCost(type) }; sfx.buy(); return true; },
      upgrade(pid) { const t = R.towers[pid]; if (!t || t.lvl >= 2 || R.brass < upCost(t)) return false; const c = upCost(t); R.brass -= c; t.spent += c; t.lvl++; sfx.buy(); const p = G.pads.find((q) => q.id === pid); fx.ring(p.x, p.y, 26, '#ffd166'); return true; },
      sell(pid) { const t = R.towers[pid]; if (!t) return false; R.brass += Math.floor(t.spent * (R.state === 'build' ? 1 : 0.7)); delete R.towers[pid]; sfx.coin(); return true; },
      gear(id, g) { const p = G.pegs[id]; if (!p || gearsLocked() || !gearOk(p, g)) return false; p.gear = g || null; dropBadChains(); drive(); sfx.play('clunk') || sfx.tone(160, 0.08, 'square', 0.06); return true; },
      turn(id) { const p = G.pegs[id]; if (!p || !p.plate || gearsLocked()) return false; p.plate.rot = (p.plate.rot + 1) % 4; sfx.play('clunk') || sfx.tone(200, 0.06, 'square', 0.05); return true; },
      chain(id, other) {
        const a = G.pegs[id], b = G.pegs[other]; if (!a || !b || gearsLocked()) return false; const k = chainKey(a, b);
        if (R.chains.has(k)) { R.chains.delete(k); drive(); return true; }
        if (!chainable(a, b)) return false;
        const cost = R.freeChains > 0 ? 0 : st.chainCost; if (R.brass < cost) return false;
        R.brass -= cost; if (!cost) R.freeChains--; R.chains.add(k); drive(); sfx.buy(); return true;
      },
      flip(id, mode) { const n = G.N[id]; if (!n || n.t !== 'sw') return false; n.mode = mode; if (mode !== 'alt') n.next = mode; n.flick = 0.25; sfx.play('flip', 0.6) || sfx.play('clunk', 0.5) || sfx.tone(240, 0.05, 'square', 0.05); return true; },
      send: sendWave,
      hold(on) { R.holdOn = !!on; },
      speed() { R.speed = R.speed === 1 ? 2 : 1; },
    };
    run.act = act; run.TOWERS = TOWERS; run.buildCost = buildCost; run.upCost = upCost;
    function say(s, t = 1.5) { R.msg = s; R.msgT = t; }

    // ---- input: drag pans a tall board; a tap (no drag) picks a pad, a switch, a gear peg or a turntable
    let drag = null;
    const toW = (x, y) => [(x - offX) / sc, (y - TOP) / sc + R.camY];
    const miniOn = () => maxCam > 0;
    function tap(x, y) {
      if (y < TOP || y > TOP + VIEWPX) return;
      const [wx, wy] = toW(x, y), hit = (px, py, r) => Math.hypot(px - wx, py - wy) < r;
      let best = null, bd = 22 / sc + 4;
      for (const p of G.pads) { const d = Math.hypot(p.x - wx, p.y - wy); if (d < bd) { bd = d; best = p; } }
      if (best) { R.sel = { kind: 'pad', id: best.id }; R.sub = null; sfx.pop(1.3); return; }
      const sw = Object.values(G.N).find((n) => n.t === 'sw' && hit(n.x, n.y, 24));
      if (sw) { if (R.sel && R.sel.id === sw.id) act.flip(sw.id, sw.mode === 'alt' ? 1 - sw.next : 1 - sw.mode); R.sel = { kind: 'sw', id: sw.id }; R.sub = null; sfx.pop(1.2); return; }
      const peg = pegList().find((p) => (p.plate ? hit(p.x, p.y, p.plate.R + 4) : hit(p.x, p.y, Math.max(16, teeth(p) * PITCH / 24))));
      if (peg) { R.sel = { kind: 'peg', id: peg.id }; R.sub = null; sfx.pop(1.1); return; }
      R.sel = null; R.sub = null;
    }
    function handleInput(input) {
      if (input.taps.length) {
        const t = input.taps[0];
        if (miniOn() && t.x > W - 22 && t.y > TOP && t.y < TOP + VIEWPX) { R.camY = Math.max(0, Math.min(maxCam, (t.y - TOP) / VIEWPX * S.H - viewH / 2)); drag = null; }
        else drag = { x0: t.x, y0: t.y, cam0: R.camY, moved: false };
      }
      if (drag && input.down) {
        const dx = input.x - drag.x0, dy = input.y - drag.y0;
        if (!drag.moved && Math.hypot(dx, dy) > 10 && maxCam > 0) drag.moved = true;
        if (drag.moved) R.camY = Math.max(0, Math.min(maxCam, drag.cam0 - dy / sc));
      }
      if (drag && (input.released || !input.down)) { if (!drag.moved) tap(drag.x0, drag.y0); drag = null; }
    }

    function step(dt) {
      run.t += dt;
      R.holding = R.holdOn && R.steam > 0.02 && R.state === 'wave';
      if (R.holding) R.steam = Math.max(0, R.steam - dt); else R.steam = Math.min(R.steamMax, R.steam + dt * R.steamMax / 16);
      if (!R.holding && !R.jam) {
        C.t += dt;
        while (C.t >= PERIOD) { C.t -= PERIOD; C.k++; }
        const wasMoving = C.e > 0; C.e = C.t < DWELL ? 0 : ease((C.t - DWELL) / MOVE);
        if (wasMoving && C.e === 0 && G.plates.some((p) => p.peg.dir)) sfx.play('tick', 0.35) || sfx.tone(1900, 0.02, 'square', 0.012);
      }
      for (const n of Object.values(G.N)) if (n.flick) n.flick = Math.max(0, n.flick - dt);
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
      handleInput(input);
      const n = R.speed; for (let i = 0; i < n; i++) step(dt);
      fx.update(dt);
      panel();
    };
    run.quit = () => { R.endCause = 'quit'; };
    run.result = function () {
      const cogs = Array.from({ length: R.cleared }, (_, i) => 2 + (i + 1)).reduce((a, b) => a + b, 0) + Math.floor(R.pops / 12) + R.sortBonus + (R.won ? 40 : 0);
      const lines = [`You held ${R.cleared} of ${LAST} waves and smashed or caught ${R.pops} marbles.`];
      if (!R.won) lines.push(R.endCause === 'held' ? 'The machine held all the way down! Ring the Cannon Bell in the workshop to face the boss.'
        : R.endCause === 'quit' ? 'You left the workshop early.' : R.endCause || 'The vault broke.');
      if (R.clogs) lines.push(`${R.clogs} marble${R.clogs > 1 ? 's' : ''} clogged the furnace. Flip the switch to keep them on the fast lane.`);
      else if (!R.won && R.cleared < 6 && !st.hammer) lines.push('Tip: Hammer Plans unlock a tower that crushes steel.');
      else if (!R.won) lines.push('Tip: change a turntable\'s gear to change where its marbles go. Watch which exit lights up.');
      return { earned: { cogs }, won: !!R.won, title: R.endCause === 'held' ? 'The machine held!' : undefined, lines, score: R.cleared };
    };
    loadStage(0);
    run.loadStage = loadStage; run.marblePos = marblePos; run.portDir = portDir;

    // ---------------------------------------------------------------- the bottom panel (DOM, rebuilt only when it changes)
    const ARROWS = ['→', '↘', '↓', '↙', '←', '↖', '↑', '↗'];
    const arrowTo = (a, b) => ARROWS[mod(Math.round(Math.atan2(b.y - a.y, b.x - a.x) / (Math.PI / 4)), 8)];
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
        const need = { build: 'pad', up: 'pad', sell: 'pad', gear: 'peg', turn: 'peg', chain: 'peg', chains: 'peg', flip: 'sw' }[a];
        if (need && !(sel && sel.kind === need && G.N && (need !== 'peg' || G.pegs[sel.id]) && (need !== 'pad' || G.pads.some((p) => p.id === sel.id)))) { panelKey = ''; return panel(); } // a stale button from a moment ago
        if (a === 'go') { if (R.state === 'build') act.send(); else act.speed(); }
        else if (a === 'build') { if (!act.build(sel.id, x)) sfx.nope(); }
        else if (a === 'up') { if (!act.upgrade(sel.id)) sfx.nope(); }
        else if (a === 'sell') act.sell(sel.id);
        else if (a === 'gear') { if (!act.gear(sel.id, x === '-' ? null : x)) sfx.nope(); }
        else if (a === 'turn') act.turn(sel.id);
        else if (a === 'chains') R.sub = R.sub === 'chain' ? null : 'chain';
        else if (a === 'chain') { if (!act.chain(sel.id, x)) sfx.nope(); }
        else if (a === 'flip') act.flip(sel.id, x === 'alt' ? 'alt' : +x);
        else if (a === 'close') { R.sel = null; R.sub = null; }
        panelKey = ''; panel();
      });
      root.querySelector('#cm-go').dataset.a = 'go';
    }
    function panel() {
      if (!root) return;
      const s = R.sel, t = s && s.kind === 'pad' ? R.towers[s.id] : null, b = Math.floor(R.brass);
      const goTxt = R.state === 'build' ? `Send wave ${R.wave + 1} ▶` : R.speed === 1 ? '▶▶ Go faster' : '▶ Normal speed';
      const hold = root.querySelector('#cm-hold');
      hold.style.setProperty('--steam', `${Math.round(100 * R.steam / R.steamMax)}%`);
      const afford = [...Object.keys(TOWERS).map((k) => b >= buildCost(k)), t && t.lvl < 2 && b >= upCost(t), b >= st.chainCost]; // not the brass itself: a rebuild mid-press would swallow the tap
      const left = root.querySelector('#cm-left'); if (left) left.textContent = R.spawnQ.length + R.marbles.length;
      const swn = s && s.kind === 'sw' ? G.N[s.id] : null;
      const key = JSON.stringify([s, R.sub, R.stageI, t && t.lvl, afford, R.state, R.wave, R.speed, R.jam, R.freeChains, swn && swn.mode, s && s.kind === 'peg' && pegList().map((p) => p.gear + (p.plate ? p.plate.rot : '')).join(''), [...R.chains].join()]);
      if (key === panelKey) return; panelKey = key;
      const go = root.querySelector('#cm-go'); go.textContent = goTxt; go.classList.toggle('fast', R.state !== 'build');
      hold.textContent = R.state === 'build' ? 'HOLD (in waves)' : 'HOLD';
      let msg = '', row = '';
      if (!s) {
        const first = R.wave === S.waves[0] - 1;
        msg = R.jam ? '<b>Jammed!</b> A chain makes two gears fight, so nothing turns. Tap a gear to fix its chain.'
          : R.state === 'build' ? (first ? S.intro : 'Build, change gears, flip switches.') + ` Next: <b>${nextWave()}</b>.`
            : `Wave ${R.wave}: <b id="cm-left">${R.spawnQ.length + R.marbles.length}</b> left. ${S.obj === 'sort' ? 'Tap the switch to flip it: steel left, the rest right.' : Object.values(G.N).some((n) => n.t === 'sw') ? 'Tap a switch to flip it.' : 'Watch where the turntable sends them.'} Hold <b>HOLD</b> to stop the machine.`;
      } else if (s.kind === 'pad' && !t) {
        msg = 'Build a tower here.';
        row = Object.entries(TOWERS).map(([k, T]) => unlockedT(k) ? `<button type="button" data-a="build:${k}" ${b >= buildCost(k) ? '' : 'disabled'}>${T.icon} ${T.name}<small>${buildCost(k)} brass</small></button>`
          : `<button type="button" disabled>${T.icon} ${T.name}<small>Plans needed</small></button>`).join('');
      } else if (s.kind === 'pad') {
        const T = TOWERS[t.type], back = Math.floor(t.spent * (R.state === 'build' ? 1 : 0.7));
        msg = `<b>${T.name} · Lv ${t.lvl + 1}</b>: ${T.lv[t.lvl]}. ${t.lvl < 2 ? `Next: ${T.lv[t.lvl + 1]}.` : T.blurb}`;
        row = `<button type="button" data-a="up" ${t.lvl < 2 && b >= upCost(t) ? '' : 'disabled'}>${t.lvl < 2 ? `Upgrade<small>${upCost(t)} brass</small>` : 'Max level<small>&nbsp;</small>'}</button>
          <button type="button" data-a="sell">Sell<small>+${back} brass</small></button><button type="button" data-a="close">Done<small>&nbsp;</small></button>`;
      } else if (swn) {
        const dirOf = (i) => { const e = G.E[swn.outs[i]], p = e.pts[Math.min(e.pts.length - 1, 12)]; return p[0] < swn.x ? 'left' : 'right'; };
        msg = `<b>Switch</b>: ${swn.mode === 'alt' ? 'sends marbles left and right in turn' : `sends every marble ${dirOf(swn.mode)}`}. Tap it again on the board to flip it. Works mid-wave.`;
        row = `<button type="button" class="${swn.mode === 'alt' ? 'on' : ''}" data-a="flip:alt">⇄ Take turns<small>&nbsp;</small></button>`
          + [0, 1].map((i) => `<button type="button" class="${swn.mode === i ? 'on' : ''}" data-a="flip:${i}">${dirOf(i) === 'left' ? '↙' : '↘'} All ${dirOf(i)}<small>&nbsp;</small></button>`).join('')
          + '<button type="button" data-a="close">Done<small>&nbsp;</small></button>';
      } else {
        const p = G.pegs[s.id], lock = gearsLocked(), G0 = p.gear && GEARS[p.gear];
        const turning = p.dir ? (p.dir > 0 ? 'clockwise' : 'anticlockwise') : R.jam ? 'jammed' : p.gear ? '<b>not driven</b>' : 'empty';
        if (R.sub === 'chain') {
          const others = pegList().filter((q) => q !== p && dist(p, q) <= PITCH * 3.4 + 1 && !meshes(p, q));
          msg = `<b>Chains</b> make two gears turn the <b>same</b> way. A chain that fights a mesh jams the machine.${lock ? ' Locked during a wave.' : ''}`;
          row = others.slice(0, 3).map((q) => { const has = R.chains.has(chainKey(p, q)), ok = chainable(p, q);
            return `<button type="button" data-a="chain:${q.id}" ${lock || (!has && (!ok || (R.freeChains <= 0 && b < st.chainCost))) ? 'disabled' : ''}>${has ? 'Unchain' : 'Chain'} ${arrowTo(p, q)}<small>${has ? 'remove' : !ok ? 'no gear' : R.freeChains > 0 ? 'free' : st.chainCost + ' brass'}</small></button>`; }).join('')
            + '<button type="button" data-a="chains">Back<small>&nbsp;</small></button>';
        } else {
          msg = (p.plate ? `<b>Turntable</b> on a ${G0 ? G0.name.toLowerCase() + ' gear' : 'bare peg (it stays still)'}` : `<b>${G0 ? G0.name + ' gear' : 'Empty peg'}</b>${p.motor ? ' (motor)' : ''}`)
            + `, ${turning}${G0 ? ', ' + G0.speed : ''}. ` + (lock ? 'Gears are locked during a wave.' : 'Touching gears must fit: S+L or M+M.');
          row = ['S', 'M', 'L'].map((g) => `<button type="button" class="${p.gear === g ? 'on' : ''}" data-a="gear:${g}" ${lock || !gearOk(p, g) ? 'disabled' : ''}>${g}<small>${GEARS[g].n} teeth</small></button>`).join('')
            + (p.motor ? '' : `<button type="button" class="${p.gear ? '' : 'on'}" data-a="gear:-" ${lock ? 'disabled' : ''}>✕<small>none</small></button>`)
            + (p.plate && (!p.gear || ['elbow', 'twin'].includes(p.plate.pat)) ? `<button type="button" data-a="turn" ${lock ? 'disabled' : ''}>↻<small>turn</small></button>` : '')
            + `<button type="button" data-a="chains">⛓<small>chain</small></button>`;
        }
      }
      root.querySelector('#cm-panel').innerHTML = `<p class="cm-msg">${msg}</p><div class="cm-row">${row}</div>`;
    }
    panel();

    // ---------------------------------------------------------------- drawing (world units inside the camera transform)
    function drawGear(g, p) {
      const n = teeth(p), r = n * PITCH / 24, a0 = p.dir * (C.k + C.e) * GEARS[p.gear].stepU * U, tooth = Math.min(6, r * 0.2);
      g.save(); g.translate(p.x, p.y); g.rotate(a0);
      g.fillStyle = p.dir ? '#8a6d3b' : '#5e5040'; g.beginPath();
      for (let i = 0; i < n; i++) { const a = i * TAU / n, w = TAU / n / 4;
        g.lineTo(Math.cos(a - w * 1.6) * (r - tooth), Math.sin(a - w * 1.6) * (r - tooth)); g.lineTo(Math.cos(a - w) * r, Math.sin(a - w) * r); g.lineTo(Math.cos(a + w) * r, Math.sin(a + w) * r); g.lineTo(Math.cos(a + w * 1.6) * (r - tooth), Math.sin(a + w * 1.6) * (r - tooth)); }
      g.closePath(); g.fill(); g.strokeStyle = '#00000080'; g.lineWidth = 1.5; g.stroke();
      g.fillStyle = '#2b1f14'; g.beginPath(); g.arc(0, 0, r * 0.3, 0, TAU); g.fill();
      g.strokeStyle = '#2b1f14'; g.lineWidth = 2; for (let i = 0; i < 3; i++) { const a = i * TAU / 3; g.beginPath(); g.moveTo(Math.cos(a) * r * 0.3, Math.sin(a) * r * 0.3); g.lineTo(Math.cos(a) * (r - tooth), Math.sin(a) * (r - tooth)); g.stroke(); }
      g.restore();
      if (p.motor) { g.fillStyle = '#c0392b'; g.beginPath(); g.arc(p.x, p.y, 5, 0, TAU); g.fill(); }
    }
    function drawChain(g, a, b) {
      const ra = teeth(a) * PITCH / 24 * 0.82, rb = teeth(b) * PITCH / 24 * 0.82, dx = b.x - a.x, dy = b.y - a.y, l = Math.hypot(dx, dy), nx = -dy / l, ny = dx / l;
      g.save(); g.strokeStyle = '#c7ccd4cc'; g.lineWidth = 3.5; g.setLineDash([5, 3]); g.lineDashOffset = -(C.k + C.e) * 8 * (a.dir || 0);
      for (const s of [1, -1]) { g.beginPath(); g.moveTo(a.x + nx * ra * s, a.y + ny * ra * s); g.lineTo(b.x + nx * rb * s, b.y + ny * rb * s); g.stroke(); }
      g.restore();
    }
    const path = (g, pts) => { g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); };
    function drawTrack(g, e) {
      g.lineCap = 'round'; g.lineJoin = 'round';
      if (e.hidden) { // a tunnel: a covered tube
        path(g, e.pts); g.strokeStyle = '#1a120b'; g.lineWidth = 15; g.stroke();
        path(g, e.pts); g.strokeStyle = '#4a3a2a'; g.lineWidth = 11; g.stroke();
        g.setLineDash([2, 7]); path(g, e.pts); g.strokeStyle = '#2b1f14'; g.lineWidth = 11; g.stroke(); g.setLineDash([]);
        return;
      }
      if (e.fail) { g.setLineDash([4, 5]); path(g, e.pts); g.strokeStyle = '#ffffff40'; g.lineWidth = 3; g.stroke(); g.setLineDash([]); return; }
      const rail = e.curl ? '#d9c08a' : e.vt >= SPD.fast ? '#cfa55e' : e.vt <= SPD.slow ? '#9b7b4a' : '#b8904f';
      path(g, e.pts); g.strokeStyle = '#1b130b'; g.lineWidth = e.curl ? 15 : 14; g.stroke();
      path(g, e.pts); g.strokeStyle = rail; g.lineWidth = 10; g.stroke();
      path(g, e.pts); g.strokeStyle = '#3b2a17'; g.lineWidth = 5; g.stroke();
      if (e.vt >= SPD.fast && !e.curl) { // downhill: chevrons point the way
        g.strokeStyle = '#ffe9b066'; g.lineWidth = 1.6;
        for (let s = 18; s < e.len - 10; s += 34) { const a = at(e, s), b = at(e, s + 4), dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1, ux = dx / l, uy = dy / l;
          g.beginPath(); g.moveTo(a[0] - uy * 3 - ux * 3, a[1] + ux * 3 - uy * 3); g.lineTo(a[0], a[1]); g.lineTo(a[0] + uy * 3 - ux * 3, a[1] - ux * 3 - uy * 3); g.stroke(); }
      }
    }
    function drawPlate(g, p) {
      const sel = R.sel && R.sel.kind === 'peg' && R.sel.id === p.peg.id, RP = p.R;
      g.save(); g.translate(p.x, p.y);
      g.fillStyle = '#00000060'; g.beginPath(); g.arc(3, 5, RP, 0, TAU); g.fill();
      g.rotate(theta(p));
      if (!env.sprite(g, 'obj-plate', 0, 0, RP * 2.04, RP * 2.04)) {
        const gr = g.createRadialGradient(-RP * 0.3, -RP * 0.3, RP * 0.1, 0, 0, RP); gr.addColorStop(0, '#e2c48d'); gr.addColorStop(1, '#a8834b');
        g.fillStyle = gr; g.beginPath(); g.arc(0, 0, RP, 0, TAU); g.fill();
      }
      g.strokeStyle = sel ? '#ffe08a' : '#5d4423'; g.lineWidth = sel ? 4 : 2.5; g.beginPath(); g.arc(0, 0, RP - 1, 0, TAU); g.stroke();
      g.lineCap = 'round'; g.lineJoin = 'round';
      for (const [w, c] of [[0.3, '#3d2a14'], [0.2, '#1e140a']]) {
        g.strokeStyle = c; g.lineWidth = RP * w;
        for (const gr of p.grooves) { g.beginPath(); gr.pts.forEach(([x, y], i) => (i ? g.lineTo(x * RP, y * RP) : g.moveTo(x * RP, y * RP))); g.stroke(); }
      }
      g.restore();
      // the hub: the gear underneath (letter) and which way it turns
      const peg = p.peg;
      g.save(); g.translate(p.x, p.y);
      g.fillStyle = '#2b1f14'; g.beginPath(); g.arc(0, 0, 11, 0, TAU); g.fill(); g.strokeStyle = '#c9a24a'; g.lineWidth = 2; g.stroke();
      g.fillStyle = '#f5dfb0'; g.font = '800 12px Nunito, system-ui'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(peg.gear || '·', 0, 0.5);
      if (peg.dir) { g.strokeStyle = '#f5dfb0aa'; g.lineWidth = 2; g.beginPath(); const a = -Math.PI / 2; g.arc(0, 0, 16, a - 0.8 * peg.dir, a + 0.8 * peg.dir, peg.dir < 0); g.stroke();
        const e = a + 0.8 * peg.dir; g.fillStyle = '#f5dfb0aa'; g.beginPath(); g.arc(Math.cos(e) * 16, Math.sin(e) * 16, 2.5, 0, TAU); g.fill(); }
      g.restore();
      // ports: a light at every exit; green when a groove end faces it right now; the exit's name beside it
      for (const port of Object.values(p.ports)) {
        const [x, y] = portPt(p, port.d), o = rim(port.d), open = !!receiving(p, port.d) && !R.holding;
        g.fillStyle = open ? (port.out ? '#7ee08a' : '#ffe08a') : '#00000099'; g.beginPath(); g.arc(x + o[0] * 7, y + o[1] * 7, open ? 4.5 : 3, 0, TAU); g.fill();
        if (port.out) { g.fillStyle = '#f5dfb0cc'; g.font = '700 9px Nunito, system-ui'; g.textAlign = o[0] > 0.5 ? 'left' : o[0] < -0.5 ? 'right' : 'center'; g.textBaseline = 'middle';
          g.fillText(port.label, x + o[0] * 14 + (o[0] ? 0 : 22), y + o[1] * 14); }
      }
    }
    function drawNode(g, n) {
      if (n.t === 'entry') { g.fillStyle = '#1b130b'; g.beginPath(); g.moveTo(n.x - 18, n.y + 10); g.lineTo(n.x + 18, n.y + 10); g.lineTo(n.x + 7, n.y + 34); g.lineTo(n.x - 7, n.y + 34); g.fill(); }
      else if (n.t === 'sw') {
        const sel = R.sel && R.sel.id === n.id, nx = n.mode === 'alt' ? n.next : n.mode, e = G.E[n.outs[nx]], p = e.pts[Math.min(e.pts.length - 1, 8)];
        if (!env.sprite(g, 'obj-switch', n.x, n.y, 30, 30)) { g.fillStyle = '#3d6e8f'; g.beginPath(); g.arc(n.x, n.y, 12, 0, TAU); g.fill(); }
        g.strokeStyle = sel ? '#ffe08a' : '#f5dfb0'; g.lineWidth = sel ? 3 : 2; g.beginPath(); g.arc(n.x, n.y, 13, 0, TAU); g.stroke();
        const a = Math.atan2(p[1] - n.y, p[0] - n.x); g.save(); g.translate(n.x, n.y); g.rotate(a + (n.flick ? Math.sin(n.flick * 40) * 0.2 : 0));
        g.fillStyle = '#fff'; g.strokeStyle = '#2b1f14'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(9, 0); g.lineTo(-4, -6); g.lineTo(-4, 6); g.closePath(); g.stroke(); g.fill(); g.restore();
        if (n.mode !== 'alt') { g.fillStyle = '#ffe08a'; g.font = '800 9px Nunito, system-ui'; g.textAlign = 'center'; g.fillText('LOCK', n.x, n.y - 18); }
      } else if (n.t === 'cannon') {
        if (!env.sprite(g, 'obj-cannon', n.x, n.y, 34, 34, { rot: Math.PI / 2 })) { g.fillStyle = '#6b3d8f'; g.fillRect(n.x - 13, n.y - 9, 26, 18); g.strokeStyle = '#f5dfb0'; g.lineWidth = 2; g.strokeRect(n.x - 13, n.y - 9, 26, 18);
          g.fillStyle = '#fff'; g.font = '800 12px Nunito, system-ui'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('»', n.x, n.y + 1); }
        if (n.flick) { g.fillStyle = '#9fe7ff66'; g.beginPath(); g.arc(n.x, n.y, 18, 0, TAU); g.fill(); }
        g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillStyle = '#f5dfb0cc'; g.font = '700 9px Nunito, system-ui'; g.fillText('cannon', n.x - 34, n.y);
      } else if (n.t === 'loop') {
        g.fillStyle = '#f5dfb0cc'; g.font = '700 9px Nunito, system-ui'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('loop', n.x + n.side * 18, n.y - 26); const f = G.E[n.fail].pts[Math.floor(G.E[n.fail].pts.length / 2)]; g.fillStyle = '#9fe7ffaa'; g.fillText('too slow ↓', f[0], f[1] - 9);
      } else if (n.t === 'bin') {
        if (!env.sprite(g, 'obj-bin', n.x, n.y, 36, 36)) { g.fillStyle = '#2b1f14'; g.beginPath(); g.arc(n.x, n.y, 15, 0, TAU); g.fill(); g.strokeStyle = '#b8904f'; g.lineWidth = 3; g.stroke(); }
        g.fillStyle = '#f5dfb0cc'; g.font = '700 9px Nunito, system-ui'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('catch', n.x, n.y + 24);
      } else if (n.t === 'furnace') {
        const gl = g.createRadialGradient(n.x, n.y, 4, n.x, n.y, 30); gl.addColorStop(0, '#ffd166'); gl.addColorStop(0.5, '#e8662e'); gl.addColorStop(1, '#3a1a0b');
        if (!env.sprite(g, 'obj-furnace', n.x, n.y, 64, 64)) { g.fillStyle = gl; g.beginPath(); g.arc(n.x, n.y, 26, 0, TAU); g.fill(); g.strokeStyle = '#1b130b'; g.lineWidth = 4; g.stroke(); }
        g.fillStyle = '#000000a0'; g.beginPath(); g.arc(n.x, n.y, 15, 0, TAU); g.fill();
        g.fillStyle = '#fff'; g.font = '400 13px "Lilita One", system-ui'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(`${R.sorted}/${S.goal}`, n.x, n.y + 1);
        g.fillStyle = '#ffd9a8'; g.font = '700 9px Nunito, system-ui'; g.fillText('FURNACE: steel only', n.x, n.y + 36);
      } else if (n.t === 'vault') {
        const art = env.sprite(g, 'obj-vault', n.x, n.y, 84, 84);
        if (!art) { g.fillStyle = R.flash > 0 ? '#c0392b' : '#4a5560'; g.fillRect(n.x - 50, n.y - 14, 100, 28); g.strokeStyle = '#c9d1d9'; g.lineWidth = 2; g.strokeRect(n.x - 50, n.y - 14, 100, 28); }
        g.textAlign = 'left'; g.textBaseline = 'middle'; g.font = '400 15px "Lilita One", system-ui';
        g.fillStyle = '#000000a0'; g.fillRect(n.x + 40, n.y - 12, 84, 24); g.fillStyle = R.flash > 0 ? '#ff6b6b' : '#fff'; g.fillText(`VAULT ♥ ${R.lives}`, n.x + 46, n.y + 1);
      }
    }
    function drawTower(g, t, x, y) {
      const T = t.type, r = 12, kick = t.kick ? 1 + t.kick * 1.5 : 1;
      const sel = R.sel && R.sel.kind === 'pad' && R.towers[R.sel.id] === t;
      if (sel) { const s = tStats(t); g.fillStyle = '#ffe08a22'; g.strokeStyle = '#ffe08a88'; g.lineWidth = 1.5; g.beginPath(); g.arc(x, y, s.range, 0, TAU); g.fill(); g.stroke(); }
      if (env.sprite(g, 'tower-' + T, x, y, r * 2.6 * kick)) return lvlPips(g, t, x, y, r);
      g.save(); g.translate(x, y); g.scale(kick, kick);
      g.fillStyle = '#00000066'; g.beginPath(); g.arc(1.5, 2.5, r, 0, TAU); g.fill();
      g.fillStyle = T === 'pin' ? '#3d6e8f' : T === 'hammer' ? '#8f4b2e' : '#6b3d8f'; g.beginPath(); g.arc(0, 0, r, 0, TAU); g.fill();
      g.strokeStyle = '#f5dfb0'; g.lineWidth = 2; g.stroke();
      g.font = '13px system-ui'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(TOWERS[T].icon, 0, 1);
      g.restore(); lvlPips(g, t, x, y, r);
    }
    function lvlPips(g, t, x, y, r) { for (let i = 0; i <= t.lvl; i++) { g.fillStyle = '#ffd166'; g.beginPath(); g.arc(x - (t.lvl * 4) + i * 8, y + r + 4, 2.4, 0, TAU); g.fill(); } return true; }
    function drawMarble(g, m) {
      const [x, y] = marblePos(m), r = m.r, T = m.T;
      if (hiddenNow(m)) { g.fillStyle = '#00000060'; g.beginPath(); g.arc(x, y, r * 0.8, 0, TAU); g.fill(); return; } // in a tunnel: a shadow under the cover
      if (m.st === 'track' && m.v > 140) { const e = G.E[m.e], b = at(e, Math.max(0, m.s - m.v * 0.08)); g.strokeStyle = T.col + '66'; g.lineWidth = r * 1.4; g.lineCap = 'round'; g.beginPath(); g.moveTo(b[0], b[1]); g.lineTo(x, y); g.stroke(); }
      if (!env.sprite(g, 'mar-' + m.type, x, y, r * 2.3)) {
        const gr = g.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.1, x, y, r); gr.addColorStop(0, T.hi); gr.addColorStop(1, T.col);
        g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill(); g.strokeStyle = '#00000055'; g.lineWidth = 1; g.stroke();
      }
      if (m.flash > 0) { g.fillStyle = '#ffffffaa'; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill(); }
      const waiting = m.st === 'held' || (m.st === 'track' && G.E[m.e].port && m.s >= G.E[m.e].len - 0.5);
      if (waiting) { const left = latchOf(m) - m.wait; if (left < 1.2) { g.strokeStyle = '#ff6b6b'; g.lineWidth = 2; g.beginPath(); g.arc(x, y, r + 3, -Math.PI / 2, -Math.PI / 2 + TAU * Math.min(1, (1.2 - left) / 1.2)); g.stroke(); } } // about to jump
      if (m.hp < m.max && !T.boss) { g.fillStyle = '#000a'; g.fillRect(x - r, y - r - 5, r * 2, 3); g.fillStyle = '#7ee08a'; g.fillRect(x - r, y - r - 5, r * 2 * m.hp / m.max, 3); }
    }
    function drawWorld(g) {
      const pegs = pegList();
      for (const p of pegs) { g.fillStyle = '#00000070'; g.beginPath(); g.arc(p.x, p.y, 4, 0, TAU); g.fill(); }
      for (const p of pegs) if (p.gear) drawGear(g, p);
      for (const e of G.E) if (e.hidden) drawTrack(g, e);
      for (const e of G.E) if (!e.hidden && !e.curl) drawTrack(g, e);
      for (const e of G.E) if (e.curl) drawTrack(g, e);
      for (const p of G.plates) drawPlate(g, p);
      for (const k of R.chains) { const [a, b] = k.split('~').map((i) => G.pegs[i]); drawChain(g, a, b); }
      for (const p of pegs) if (!p.plate && R.sel && R.sel.kind === 'peg' && R.sel.id === p.id) { g.strokeStyle = '#ffe08a'; g.lineWidth = 3; g.beginPath(); g.arc(p.x, p.y, Math.max(14, teeth(p) * PITCH / 24) + 3, 0, TAU); g.stroke(); }
      if (R.jam && R.jamAt) { const [a, b] = R.jamAt; g.strokeStyle = '#ff6b6b'; g.lineWidth = 3; g.setLineDash([4, 4]); g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke(); g.setLineDash([]); }
      for (const n of Object.values(G.N)) drawNode(g, n);
      for (const p of G.pads) if (!R.towers[p.id]) {
        const sel = R.sel && R.sel.kind === 'pad' && R.sel.id === p.id;
        g.strokeStyle = sel ? '#ffe08a' : '#f5dfb070'; g.lineWidth = sel ? 3 : 2; g.setLineDash(sel ? [] : [3, 3]);
        g.beginPath(); g.arc(p.x, p.y, 10, 0, TAU); g.stroke(); g.setLineDash([]);
      }
      for (const m of R.marbles) if (m.st !== 'hop') drawMarble(g, m);
      for (const m of R.marbles) if (m.st === 'hop') drawMarble(g, m);
      for (const [pid, t] of Object.entries(R.towers)) { const p = G.pads.find((q) => q.id === pid); drawTower(g, t, p.x, p.y); }
      for (const tr of R.tracers) { g.strokeStyle = tr.c; g.globalAlpha = Math.min(1, tr.t * 12); g.lineWidth = 2; g.beginPath(); g.moveTo(tr.x, tr.y); g.lineTo(tr.x2, tr.y2); g.stroke(); g.globalAlpha = 1; }
      fx.draw(g);
    }
    run.draw = function (g) {
      g.fillStyle = '#3a2a1b'; g.fillRect(0, 0, W, H);
      if (env.sprite(g, 'bg-board', W / 2, H / 2, W, H)) { g.fillStyle = '#00000060'; g.fillRect(0, 0, W, H); }
      else { g.fillStyle = '#2b1f14'; for (let y = 14; y < H; y += 18) for (let x = (y / 18) % 2 ? 9 : 18; x < W; x += 18) { g.beginPath(); g.arc(x, y, 1.6, 0, TAU); g.fill(); } }
      g.save(); g.beginPath(); g.rect(0, TOP, W, VIEWPX); g.clip();
      if (fx.shake > 0) g.translate((Math.random() - 0.5) * fx.shake, (Math.random() - 0.5) * fx.shake);
      g.translate(offX, TOP); g.scale(sc, sc); g.translate(0, -R.camY);
      drawWorld(g);
      g.restore();
      // minimap (tall boards): the whole run, marbles as dots, the view as a box; tap it to jump
      if (miniOn()) {
        const mx = W - 14, my = TOP + 6, mh = VIEWPX - 12, k = mh / S.H;
        g.fillStyle = '#000000a0'; g.fillRect(mx - 4, my - 2, 16, mh + 4);
        g.strokeStyle = '#b8904f'; g.lineWidth = 1; for (const e of G.E) { if (e.fail) continue; g.beginPath(); for (let i = 0; i < e.pts.length; i += 6) { const [x, y] = e.pts[i]; i ? g.lineTo(mx + x / WW * 8, my + y * k) : g.moveTo(mx + x / WW * 8, my + y * k); } g.stroke(); }
        for (const m of R.marbles) { const [x, y] = marblePos(m); g.fillStyle = m.T.col; g.fillRect(mx + x / WW * 8 - 1.5, my + y * k - 1.5, 3, 3); }
        g.strokeStyle = '#ffe08a'; g.lineWidth = 1.5; g.strokeRect(mx - 3, my + R.camY * k, 14, viewH * k);
        if (R.flash > 0) { g.fillStyle = '#ff6b6b'; g.fillRect(mx - 4, my + mh - 6, 16, 8); }
      }
      // HUD (top-right 56 px is the pause button)
      g.fillStyle = '#000000b0'; g.fillRect(0, 0, W, TOP);
      g.font = '400 17px "Lilita One", system-ui'; g.textAlign = 'left'; g.textBaseline = 'middle';
      g.fillStyle = '#f5dfb0'; g.fillText(`Wave ${R.wave}/${LAST}`, 10, 16);
      g.font = '700 11px Nunito, system-ui'; g.fillStyle = '#cdb98f'; g.fillText(`Board ${R.stageI + 1}/3 · ${S.name.replace('The ', '')}`, 10, 36);
      if (S.obj === 'sort') { g.textAlign = 'right'; g.fillStyle = R.sorted >= S.goal ? '#7ee08a' : '#ffb347'; g.fillText(`🔥 steel sorted ${R.sorted}/${S.goal}`, W - 58, 36); g.textAlign = 'left'; }
      g.font = '400 17px "Lilita One", system-ui';
      g.fillStyle = R.flash > 0 ? '#ff6b6b' : '#ff9f9f'; g.fillText(`♥ ${R.lives}`, 132, 16);
      g.fillStyle = '#ffd166'; g.fillText(`⚙ ${Math.floor(R.brass)}`, 190, 16);
      if (R.boss) { const bw = W - 120; g.fillStyle = '#000a'; g.fillRect(60, TOP + 4, bw, 10); g.fillStyle = '#ff6b6b'; g.fillRect(60, TOP + 4, bw * Math.max(0, R.boss.hp / R.boss.max), 10); g.fillStyle = '#fff'; g.font = '800 11px Nunito, system-ui'; g.textAlign = 'center'; g.fillText('THE CANNONBALL', W / 2, TOP + 9); }
      if (R.holding) { g.fillStyle = '#7fd0ff'; g.font = '400 16px "Lilita One", system-ui'; g.textAlign = 'right'; g.fillText('HELD', W - 58, 16); }
      if (R.msgT > 0 && R.msg) { g.globalAlpha = Math.min(1, R.msgT * 2); g.font = '400 18px "Lilita One", system-ui'; g.fillStyle = '#000000b0'; const w = Math.min(W - 40, g.measureText(R.msg).width + 40), my = TOP + VIEWPX * 0.42;
        g.fillRect(W / 2 - w / 2, my - 18, w, 36); g.fillStyle = '#ffe08a'; g.textAlign = 'center'; g.fillText(R.msg, W / 2, my); g.globalAlpha = 1; }
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
    id: 'cog-marble', title: 'Cog & Marble', tagline: 'A clockwork marble-run tower defence. Gears turn the turntables, switches split the flow, and slow marbles fall off loops. Keep them out of the vault.',
    howTo: 'Marbles roll down the track. A turntable takes a marble when one of its grooves lines up, and lets it out wherever the far end points, so its gear (small spins fast, large slow) decides where marbles go. Tap a gear or turntable to change it, tap a switch to flip it (even mid-wave), tap a ◯ to build. Slow marbles fall off loops. Drag to scroll tall boards. Three boards a run: the Workbench, the Sorting Office, then the Long Drop.',
    runVerb: 'Start the machine', winTitle: 'Cannonball smashed!', loseTitle: 'The vault broke', scoreName: 'waves held',
    colors: { accent: '#ffcf6e', bg: '#1d150e', card: '#2e2216' },
    currencies: [{ id: 'cogs', name: 'cogs', color: '#ffcf6e' }],
    characters: [
      { id: 'tilly', name: 'Tilly the Tinker', blurb: 'Balanced. Pin guns cost 40 instead of 50.', unlock: 0 },
      { id: 'gus', name: 'Gus the Gearwright', blurb: 'Can change gears mid-wave, and starts each board with a free chain.', unlock: 1 },
      { id: 'marla', name: 'Marla Magnet', blurb: 'Starts with Magnet plans; her magnets also zap marbles.', unlock: 2 },
    ],
    drawFace, nodes: NODES, touchOffset: 0, baseStats, createRun, saveVersion: 2,
  };
  const API = { NODES, CONFIG, createRun, baseStats, MARBLES, WAVES, TOWERS, STAGES, buildStage };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  if (typeof window !== 'undefined') { window.CogMarble = API; Kit.game(CONFIG); }
})();
