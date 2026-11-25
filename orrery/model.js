// Orrery: rules. Pure logic, no DOM, so node can drive it (test.js). The app draws S and feeds input.
// Coordinates: a 360 x 640 world, y down. An angle a points along (sin a, -cos a), so 0 is straight up.
(function (root) {
  'use strict';
  const W = 360, H = 640, TAU = Math.PI * 2, SAVE_V = 2;

  // ---------------------------------------------------------------- data
  // Hulls are the ship's body: hit points, speed and where the sockets sit.
  const ring = (n, r, a0 = 0) => Array.from({ length: n }, (_, i) => { const a = a0 + (TAU * i) / n; return [r * Math.sin(a), -r * Math.cos(a)]; });
  const HULLS = {
    disc:   { name: 'Disc',      hp: 100, spd: 1.0,  sockets: ring(3, 30), desc: 'A round little saucer. Three sockets round the rim.' },
    cross:  { name: 'Cross',     hp: 110, spd: 0.95, sockets: ring(4, 44), desc: 'Four long spars. Sockets at the tips reach far out.' },
    needle: { name: 'Needle',    hp: 80,  spd: 1.25, sockets: [[0, -58], [-5, -31], [5, -31], [-10, -4], [10, -4]], body: [[0, -62], [15, 26], [0, 18], [-15, 26]], desc: 'A thin, fast triangle. One socket at the nose, two down each long side.' },
    blob:   { name: 'Blob',      hp: 130, spd: 0.85, sockets: ring(5, 28), soft: true, desc: 'A soft body that stretches as you fly and snaps back, flinging whatever rides its rim.' },
    hexagon:{ name: 'Hexagon',   hp: 120, spd: 0.9,  sockets: ring(6, 32), desc: 'Solid and slow. A socket on every corner.' },
    spine:  { name: 'Caterpillar', hp: 120, spd: 1.05, sockets: [[0, 22], [0, 44], [0, 66], [0, 88], [0, 110]], spine: true, desc: 'Five segments trail behind you and follow your path. Each carries a socket.' },
    ring:   { name: 'Ring',      hp: 90,  spd: 1.0,  sockets: ring(8, 42), desc: 'A wide halo with eight sockets. Fragile, but it carries a lot.' },
  };
  const HULL_MOTIONS = ['fixed', 'rotor', 'pendulum', 'stepper', 'flywheel'];
  // Joints carry sockets on arms. Each motion moves its arms differently.
  const MOTIONS = {
    rotor:    { name: 'Rotor',    price: 45, R: 34, w: 1.6, desc: 'Spins its arms round at a steady speed.' },
    pendulum: { name: 'Pendulum', price: 55, R: 36, w: 2.2, amp: 1.15, desc: 'Swings back and forth like a clock weight: fast in the middle, slow at the ends.' },
    slider:   { name: 'Slider',   price: 55, R: 16, A: 44, f: 0.45, desc: 'Slides side to side at a constant speed and never turns.' },
    piston:   { name: 'Piston',   price: 60, R0: 12, R1: 56, w: 2.4, desc: 'Shoots its arms straight out, then pulls them back in.' },
    cam:      { name: 'Cam',      price: 70, Rx: 50, Ry: 20, w: 1.8, desc: 'Carries its sockets round a flat oval track, always facing outward.' },
    stepper:  { name: 'Stepper',  price: 70, R: 34, rate: 1.4, desc: 'Ticks round a quarter turn at a time and snaps into place.' },
    flywheel: { name: 'Flywheel', price: 75, R: 36, w: 2.4, desc: 'Surges round fast, nearly stops, then surges again.' },
  };
  // Gadgets: melee hits harder the faster it's moving, so it wants fast joints and long arms.
  const GADGETS = {
    saw:     { grp: 'melee', name: 'Saw blade',  price: 70, dps: 10, r: 14, color: '#e0e6f0', desc: 'A spinning blade that shreds anything it touches.' },
    flail:   { grp: 'melee', name: 'Flail',      price: 75, dps: 10, r: 9, len: 30, color: '#c9b8ff', desc: 'A spiked ball on a chain. It swings wide and hits harder the faster it flies.' },
    drill:   { grp: 'melee', name: 'Drill ram',  price: 70, dps: 15, len: 24, color: '#ffb86b', desc: 'A drill bit that sticks out the way it faces. Steady, heavy damage.' },
    whip:    { grp: 'melee', name: 'Lash',       price: 80, dmg: 3, cycle: 1.1, on: 0.28, len: 76, color: '#ff7fa8', desc: 'Cracks a long lash out the way it faces every second.' },
    sword:   { grp: 'melee', name: 'Sword arm',  price: 85, dps: 9, len: 38, color: '#bff4ff', desc: 'A long blade. Sweep it fast and it cuts through everything.' },
    blaster: { grp: 'ranged', name: 'Blaster',     price: 30, cd: 0.42, dmg: 1, spd: 430, color: '#7fdcff', desc: 'Fires a bolt the way it faces.' },
    spread:  { grp: 'ranged', name: 'Scattergun',  price: 60, cd: 0.8, dmg: 0.8, n: 3, arc: 0.26, spd: 380, color: '#ffd36b', desc: 'Fires three bolts in a fan the way it faces.' },
    laser:   { grp: 'ranged', name: 'Laser',       price: 120, cycle: 1.8, on: 0.55, dps: 9, len: 290, color: '#ff5ad2', desc: 'Pulses a long beam that cuts through every enemy in its path.' },
    missile: { grp: 'ranged', name: 'Missile pod', price: 90, cd: 1.6, dmg: 3.5, spd: 150, color: '#b6ff6b', desc: 'Launches a missile that hunts the nearest enemy, whichever way the pod faces.' },
    mortar:  { grp: 'ranged', name: 'Mortar',      price: 90, cd: 1.6, dmg: 5, spd: 240, range: 170, splash: 34, color: '#ff9a4d', desc: 'Lobs a shell a fixed distance; it bursts and hurts everything nearby.' },
    chain:   { grp: 'ranged', name: 'Tesla coil',  price: 100, cd: 1.4, dmg: 2.6, range: 130, hop: 80, jumps: 3, color: '#9ff0ff', desc: 'Zaps the nearest enemy in reach, and the lightning jumps on to three more.' },
    mines:   { grp: 'ranged', name: 'Mine layer',  price: 80, cd: 2.4, dmg: 6, splash: 40, life: 9, color: '#ffe066', desc: 'Leaves mines hanging where it passes. They blow when an enemy comes close.' },
    shield:  { grp: 'defense', name: 'Shield plate', price: 55, r: 17, color: '#6bffd8', desc: 'Swats enemy bullets out of the air.' },
    deflector: { grp: 'defense', name: 'Deflector', price: 80, r: 16, color: '#a0fff0', desc: 'Bounces enemy bullets straight back the way they came, as your own shots.' },
    bubble:  { grp: 'defense', name: 'Bubble',     price: 90, recharge: 7, color: '#8fd3ff', desc: 'Wraps the hull in a bubble that soaks up one hit, then regrows. Each one adds a layer.' },
    pointdef:{ grp: 'defense', name: 'Point defence', price: 85, cd: 0.45, range: 110, color: '#ffa0a0', desc: 'A little turret that shoots enemy bullets down before they reach you.' },
    decoy:   { grp: 'defense', name: 'Decoy',      price: 70, color: '#ffd0ff', desc: 'A hologram of your ship. Enemies closer to it than to you aim at it instead.' },
    repair:  { grp: 'defense', name: 'Repair drone', price: 110, hps: 1.2, color: '#7dff9a', desc: 'Slowly welds your hull back together during a level.' },
    magnet:  { grp: 'defense', name: 'Magnet',     price: 50, r: 85, color: '#ffcf3f', desc: 'Pulls in coins from far away and collects them.' },
  };
  const GROUPS = { melee: 'Melee', ranged: 'Ranged', defense: 'Defence' };
  // Specials: one button each, on a cooldown. They don't sit on the rig.
  const SPECIALS = {
    nova:      { name: 'Nova burst', cd: 14, desc: 'A blast round the ship: tears half the health off nearby enemies and wipes their bullets.' },
    overdrive: { name: 'Overdrive',  cd: 20, dur: 5, desc: 'Every joint spins three times as fast for five seconds.' },
    blackhole: { name: 'Black hole', cd: 22, dur: 4, desc: 'Opens a well ahead of the ship that drags enemies and bullets in and crushes them.' },
    tractor:   { name: 'Tractor beam', cd: 12, dur: 4, desc: 'Hauls in every coin on screen and pins enemies above you in place.' },
    timeslow:  { name: 'Time slow',  cd: 24, dur: 5, desc: 'Enemies and their bullets crawl at a third speed for five seconds.' },
  };
  const ENEMIES = {
    drone:    { name: 'Drone',    hp: 3,   r: 11, v: 2,  color: '#ff6b6b' },
    weaver:   { name: 'Weaver',   hp: 4,   r: 11, v: 3,  color: '#ffa94d' },
    swarm:    { name: 'Swarmer',  hp: 1.2, r: 7,  v: 1,  color: '#ff8fd8' },
    gunner:   { name: 'Gunner',   hp: 8,   r: 13, v: 5,  color: '#c38bff' },
    dasher:   { name: 'Dasher',   hp: 5,   r: 10, v: 4,  color: '#6be0ff' },
    tank:     { name: 'Tank',     hp: 24,  r: 18, v: 10, color: '#9aa6b8' },
    splitter: { name: 'Splitter', hp: 10,  r: 14, v: 6,  color: '#7dff9a' },
    boss:     { name: 'Dreadnought', hp: 85, r: 36, v: 90, color: '#ff4d6d' },
  };
  // Blueprints cost cores (earned from stars and bosses).
  const BLUEPRINTS = [
    { id: 'g_spread', cost: 1, part: 'spread' }, { id: 'm_pendulum', cost: 1, part: 'pendulum' }, { id: 'g_magnet', cost: 1, part: 'magnet' },
    { id: 'h_cross', cost: 2, hull: 'cross' }, { id: 'g_flail', cost: 2, part: 'flail' }, { id: 'g_shield', cost: 2, part: 'shield' },
    { id: 's_overdrive', cost: 2, spec: 'overdrive' }, { id: 'g_missile', cost: 2, part: 'missile' }, { id: 'm_slider', cost: 2, part: 'slider' },
    { id: 'g_drill', cost: 2, part: 'drill' }, { id: 'm_piston', cost: 2, part: 'piston' }, { id: 'g_mines', cost: 2, part: 'mines' },
    { id: 'h_needle', cost: 3, hull: 'needle' }, { id: 'depth3', cost: 4, name: 'Deeper nesting', desc: 'Joints can sit on joints on joints: three levels deep.' },
    { id: 'g_whip', cost: 2, part: 'whip' }, { id: 'g_pointdef', cost: 3, part: 'pointdef' }, { id: 'g_mortar', cost: 3, part: 'mortar' },
    { id: 's_timeslow', cost: 3, spec: 'timeslow' }, { id: 'm_cam', cost: 3, part: 'cam' }, { id: 'h_blob', cost: 3, hull: 'blob' },
    { id: 'g_sword', cost: 3, part: 'sword' }, { id: 'g_chain', cost: 3, part: 'chain' }, { id: 'g_deflector', cost: 3, part: 'deflector' },
    { id: 's_tractor', cost: 3, spec: 'tractor' }, { id: 'h_hexagon', cost: 4, hull: 'hexagon' }, { id: 'm_stepper', cost: 3, part: 'stepper' },
    { id: 'g_decoy', cost: 3, part: 'decoy' }, { id: 'g_laser', cost: 4, part: 'laser' }, { id: 'g_bubble', cost: 4, part: 'bubble' },
    { id: 's_blackhole', cost: 4, spec: 'blackhole' }, { id: 'm_flywheel', cost: 3, part: 'flywheel' },
    { id: 'spec2', cost: 5, name: 'Second special slot', desc: 'Carry two specials at once.' },
    { id: 'arm3', cost: 5, name: 'Three-armed joints', desc: 'Every joint gets a third socket.' },
    { id: 'h_spine', cost: 5, hull: 'spine' }, { id: 'g_repair', cost: 5, part: 'repair' }, { id: 'h_ring', cost: 7, hull: 'ring' },
    { id: 'depth4', cost: 9, req: 'depth3', name: 'Deepest nesting', desc: 'Four levels deep.' },
    { id: 'spec3', cost: 9, req: 'spec2', name: 'Third special slot', desc: 'Carry three specials at once.' },
    { id: 'arm4', cost: 10, req: 'arm3', name: 'Four-armed joints', desc: 'Every joint gets a fourth socket.' },
  ];
  for (const b of BLUEPRINTS) {
    if (b.part) { b.name = (MOTIONS[b.part] ? MOTIONS[b.part].name + ' joint' : GADGETS[b.part].name); b.desc = (MOTIONS[b.part] || GADGETS[b.part]).desc; }
    if (b.hull) { b.name = HULLS[b.hull].name + ' hull'; b.desc = HULLS[b.hull].desc; }
    if (b.spec) { b.name = SPECIALS[b.spec].name + ' (special)'; b.desc = SPECIALS[b.spec].desc; }
  }
  const BP = Object.fromEntries(BLUEPRINTS.map((b) => [b.id, b]));
  const UPGRADES = {
    hull:    { name: 'Hull plating', base: 40, grow: 1.5, max: 12, desc: (l) => `Hull ×${(1 + 0.2 * l).toFixed(1)} → ×${(1 + 0.2 * (l + 1)).toFixed(1)}` },
    nose:    { name: 'Nose gun',     base: 35, grow: 1.5, max: 12, desc: (l) => `Damage ×${(1 + 0.4 * l).toFixed(1)} → ×${(1 + 0.4 * (l + 1)).toFixed(1)}` },
    tractor: { name: 'Tractor field', base: 30, grow: 1.6, max: 6, desc: (l) => `Coin pickup range ${34 + 10 * l} → ${34 + 10 * (l + 1)}` },
    cap:     { name: 'Capacitor',    base: 60, grow: 1.6, max: 8,  desc: (l) => `Special cooldowns −${7 * l}% → −${7 * (l + 1)}%` },
  };
  const isMotion = (k) => !!MOTIONS[k], isGadget = (k) => !!GADGETS[k];
  const partName = (k) => (MOTIONS[k] || GADGETS[k] || {}).name || k;

  // ---------------------------------------------------------------- helpers
  function rng(seed) {
    let a = (seed >>> 0) || 1;
    const f = () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    f.range = (lo, hi) => lo + (hi - lo) * f();
    f.int = (lo, hi) => lo + Math.floor(f() * (hi - lo + 1));
    f.pick = (arr) => arr[Math.floor(f() * arr.length)];
    f.weighted = (pairs) => { let s = 0; for (const [, w] of pairs) s += w; let x = f() * s; for (const [k, w] of pairs) if ((x -= w) < 0) return k; return pairs[pairs.length - 1][0]; };
    return f;
  }
  const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
  const smooth = (x) => x * x * (3 - 2 * x);
  const tri = (u) => 1 - 4 * Math.abs((((u % 1) + 1) % 1) - 0.5); // linear ping-pong between -1 and 1
  const clone = (o) => JSON.parse(JSON.stringify(o));
  function segDist(px, py, x1, y1, x2, y2) {
    const dx = x2 - x1, dy = y2 - y1, l2 = dx * dx + dy * dy || 1;
    const u = clamp(((px - x1) * dx + (py - y1) * dy) / l2, 0, 1);
    return Math.hypot(px - (x1 + u * dx), py - (y1 + u * dy));
  }

  // ---------------------------------------------------------------- the save
  function newSave() {
    return {
      v: SAVE_V, coins: 0, cores: 0,
      inv: { blaster: 3, rotor: 1, saw: 1 }, unl: { blaster: 1, rotor: 1, saw: 1 }, hulls: { disc: 1 }, specs: { nova: 1 }, spec: ['nova'], bp: {},
      up: { hull: 0, nose: 0, tractor: 0, cap: 0, g: {} },
      tree: { h: 'disc', m: 'rotor', spd: 0.5, rev: false, ph: 0, kids: [
        { g: 'blaster' },
        { m: 'rotor', spd: 1, rev: true, ph: 0, kids: [{ g: 'blaster' }, { g: 'blaster' }] },
        { g: 'saw' },
      ] },
      stars: {}, unlocked: 1, seen: {},
      stats: { runs: 0, wins: 0, kills: 0, secs: 0, coins: 0 },
      sfx: true,
    };
  }
  function load(raw) {
    let s; try { s = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch (e) { s = null; }
    if (!s || typeof s !== 'object' || !s.tree) return newSave();
    const d = newSave();
    for (const k of Object.keys(d)) if (s[k] === undefined) s[k] = clone(d[k]);
    s.up.g = s.up.g || {}; if (s.up.cap == null) s.up.cap = 0; if (!s.tree.h) s.tree.h = 'disc';
    s.v = SAVE_V; normalize(s); return s;
  }
  function stats(save) {
    const b = save.bp, up = save.up, hull = HULLS[save.tree.h] || HULLS.disc;
    return {
      hull: Math.round(hull.hp * (1 + 0.2 * up.hull)), speed: 620 * hull.spd,
      noseDmg: 1 + 0.4 * up.nose, noseCd: 0.3,
      tractor: 34 + 10 * up.tractor, capMul: 1 - 0.07 * up.cap,
      hubSockets: hull.sockets.length,
      jointSockets: 2 + (b.arm3 ? 1 : 0) + (b.arm4 ? 1 : 0),
      maxDepth: 2 + (b.depth3 ? 1 : 0) + (b.depth4 ? 1 : 0),
      specSlots: 1 + (b.spec2 ? 1 : 0) + (b.spec3 ? 1 : 0),
      pw: (g) => 1 + 0.3 * (up.g[g] || 0),
    };
  }
  // Fits every socket list to the current counts and drops anything no longer allowed.
  function normalize(save) {
    const st = stats(save);
    const fix = (node, depth) => {
      const n = depth === 0 ? st.hubSockets : st.jointSockets;
      node.kids = node.kids || []; while (node.kids.length < n) node.kids.push(null);
      if (node.kids.length > n) node.kids.length = n; // a smaller hull: the extras go back in the drawer
      node.kids.forEach((k, i) => {
        if (!k) return;
        if (k.m && (!MOTIONS[k.m] || depth + 1 >= st.maxDepth)) node.kids[i] = null;
        else if (!k.m && !GADGETS[k.g]) node.kids[i] = null;
        else if (k.m) fix(k, depth + 1);
      });
    };
    if (!HULLS[save.tree.h] || !save.hulls[save.tree.h]) save.tree.h = 'disc';
    if (!HULL_MOTIONS.includes(save.tree.m)) save.tree.m = 'rotor';
    fix(save.tree, 0);
    const used = placedCounts(save.tree);
    for (const k of Object.keys(used)) if (used[k] > (save.inv[k] || 0)) stripPart(save.tree, k, used[k] - (save.inv[k] || 0));
    save.spec = (save.spec || []).filter((s, i, a) => s && SPECIALS[s] && save.specs[s] && a.indexOf(s) === i).slice(0, st.specSlots);
  }
  function stripPart(node, kind, n) {
    for (let i = node.kids.length - 1; i >= 0 && n > 0; i--) {
      const k = node.kids[i]; if (!k) continue;
      if ((k.m || k.g) === kind) { node.kids[i] = null; n--; } else if (k.m) n = stripPart(k, kind, n);
    }
    return n;
  }
  function placedCounts(tree) {
    const c = {};
    const walk = (node) => { for (const k of node.kids) { if (!k) continue; const id = k.m || k.g; c[id] = (c[id] || 0) + 1; if (k.m) walk(k); } };
    walk(tree); return c;
  }
  const available = (save, kind) => (save.inv[kind] || 0) - (placedCounts(save.tree)[kind] || 0);
  function nodeAt(tree, path) { let n = tree; for (const i of path) { if (!n || !n.kids) return undefined; n = n.kids[i]; } return n; }

  // ---------------------------------------------------------------- editing the contraption
  function canPlace(save, path, kind) {
    const st = stats(save);
    if (!path.length) return 'pick a socket';
    const parent = nodeAt(save.tree, path.slice(0, -1));
    if (!parent || !parent.kids || !(parent.m || parent.h)) return 'no such socket';
    const i = path[path.length - 1]; if (i < 0 || i >= parent.kids.length) return 'no such socket';
    if (parent.kids[i]) return 'that socket is taken';
    if (!save.unl[kind]) return 'not unlocked yet';
    if (available(save, kind) <= 0) return 'none left: buy another in the Shop';
    if (isMotion(kind) && path.length >= st.maxDepth) return 'too deep: unlock deeper nesting in the Lab';
    return '';
  }
  function place(save, path, kind) {
    const e = canPlace(save, path, kind); if (e) return e;
    const parent = nodeAt(save.tree, path.slice(0, -1));
    parent.kids[path[path.length - 1]] = isMotion(kind)
      ? { m: kind, spd: 1, rev: false, ph: 0, kids: Array(stats(save).jointSockets).fill(null) }
      : { g: kind };
    return '';
  }
  function remove(save, path) { // the part and everything on it go back in the drawer
    if (!path.length) return 'the hull stays';
    const parent = nodeAt(save.tree, path.slice(0, -1)); const i = path[path.length - 1];
    if (!parent || !parent.kids || !parent.kids[i]) return 'nothing there';
    parent.kids[i] = null; return '';
  }
  const SPEEDS = [0.5, 1, 1.5, 2];
  function tune(save, path, key, val) {
    const n = nodeAt(save.tree, path); if (!n || !(n.m || n.h)) return 'only joints and the hull can be tuned';
    if (key === 'spd') { if (!SPEEDS.includes(val)) return 'bad speed'; n.spd = val; }
    else if (key === 'rev') n.rev = !!val;
    else if (key === 'ph') n.ph = ((val | 0) % 4 + 4) % 4;
    else if (key === 'm') { // the hull's spin is free to change
      if (path.length) return 'swap a joint by removing it';
      if (!HULL_MOTIONS.includes(val) || (val !== 'fixed' && !save.unl[val])) return 'not unlocked yet'; n.m = val;
    } else return 'bad setting';
    return '';
  }
  function setHull(save, h) {
    if (!HULLS[h]) return 'no such hull'; if (!save.hulls[h]) return 'unlock it in the Lab first';
    save.tree.h = h; normalize(save); return '';
  }
  function setSpecial(save, slot, id) {
    const st = stats(save); if (slot < 0 || slot >= st.specSlots) return 'no such slot';
    if (id && (!SPECIALS[id] || !save.specs[id])) return 'not unlocked yet';
    const s = save.spec.slice(); while (s.length < st.specSlots) s.push(null);
    const j = s.indexOf(id); if (id && j >= 0) s[j] = s[slot]; // swap if it's already in another slot
    s[slot] = id || null; save.spec = s.filter(Boolean); return '';
  }
  // Fills every socket from what's owned: joints where there are enough gadgets to make them worthwhile.
  const G_ORDER = ['laser', 'chain', 'mortar', 'missile', 'sword', 'flail', 'spread', 'whip', 'drill', 'blaster', 'saw', 'mines', 'shield', 'pointdef', 'bubble', 'deflector', 'repair', 'decoy', 'magnet'];
  const PASSIVE = ['shield', 'pointdef', 'bubble', 'deflector', 'repair', 'decoy', 'magnet'];
  function autoBuild(save) {
    const st = stats(save), t = save.tree;
    const left = {}; for (const k of Object.keys(save.inv)) left[k] = save.unl[k] ? save.inv[k] : 0;
    const joints = Object.keys(MOTIONS).filter((m) => left[m] > 0);
    let gadgets = 0; for (const g of Object.keys(GADGETS)) gadgets += left[g] || 0;
    t.kids = Array(st.hubSockets).fill(null);
    const slots = t.kids.map((_, i) => ({ node: t, i, depth: 1 }));
    let ji = 0;
    const pickJoint = () => { for (let q = 0; q < joints.length; q++) { const m = joints[(ji + q) % joints.length]; if (left[m] > 0) { ji = (ji + q + 1) % joints.length; return m; } } return null; };
    for (let s = 0; s < slots.length; s++) {
      const sl = slots[s], open = slots.length - s;
      if (sl.depth >= st.maxDepth || gadgets <= open) continue;
      const m = pickJoint(); if (!m) continue;
      left[m]--; const j = { m, spd: 1, rev: s % 2 === 1, ph: 0, kids: Array(st.jointSockets).fill(null) };
      sl.node.kids[sl.i] = j; sl.joint = true;
      for (let i = 0; i < j.kids.length; i++) slots.push({ node: j, i, depth: sl.depth + 1 });
    }
    const order = []; for (const g of G_ORDER) for (let i = 0; i < (left[g] || 0); i++) order.push(g);
    const free = slots.filter((s) => !s.joint).sort((a, b) => a.depth - b.depth);
    const pass = order.filter((g) => PASSIVE.includes(g)).slice(0, Math.ceil(free.length / 3)), off = order.filter((g) => !PASSIVE.includes(g));
    const rest = order.filter((g) => PASSIVE.includes(g)).slice(pass.length);
    // defence near the hull, offence on the outer, faster-moving sockets
    const fill = [...pass, ...off, ...rest];
    const outer = free.slice().reverse(); let oi = 0, pi = 0;
    for (const g of fill) {
      const slot = PASSIVE.includes(g) && pi < free.length ? free[pi++] : outer[oi++];
      if (!slot || slot.node.kids[slot.i]) { const any = free.find((s) => !s.node.kids[s.i]); if (any) any.node.kids[any.i] = { g }; continue; }
      slot.node.kids[slot.i] = { g };
    }
    normalize(save); return '';
  }

  // ---------------------------------------------------------------- motion
  // Where socket k of n sits on a joint at time t, in the joint's own frame.
  function jointLocal(node, t, k, n) {
    const M = MOTIONS[node.m] || MOTIONS.rotor, d = node.rev ? -1 : 1, ph = (node.ph || 0) * Math.PI / 2, tt = t * (node.spd || 1);
    const psi = TAU * k / n;
    let cx = 0, cy = 0, a = ph, r = M.R;
    switch (node.m) {
      case 'rotor': a = ph + d * M.w * tt; break;
      case 'pendulum': a = ph + d * M.amp * Math.sin(M.w * tt); break;
      case 'slider': { const off = d * M.A * tri(M.f * tt); cx = off * Math.cos(ph); cy = off * Math.sin(ph); break; }
      case 'piston': r = M.R0 + (M.R1 - M.R0) * (0.5 - 0.5 * Math.cos(M.w * tt + (d < 0 ? Math.PI : 0))); break;
      case 'stepper': { const u = M.rate * tt, i = Math.floor(u), f = u - i; a = ph + d * (Math.PI / 2) * (i + (f < 0.3 ? smooth(f / 0.3) : 1)); break; }
      case 'flywheel': a = ph + d * (M.w * tt + 0.9 * Math.sin(M.w * tt)); break;
      case 'cam': { const th = ph + d * M.w * tt + psi, x = M.Rx * Math.sin(th), y = -M.Ry * Math.cos(th); return { x, y, a: Math.atan2(x, -y), cx: 0, cy: 0 }; }
    }
    const aa = a + psi;
    return { x: cx + r * Math.sin(aa), y: cy - r * Math.cos(aa), a: aa, cx, cy };
  }
  function hullAngle(node, t) {
    if (!node.m || node.m === 'fixed') return (node.ph || 0) * Math.PI / 2;
    return jointLocal(node, t, 0, 1).a;
  }
  const rot = (x, y, a) => { const c = Math.cos(a), s = Math.sin(a); return [x * c - y * s, x * s + y * c]; };
  function toWorld(f, x, y) { const [rx, ry] = rot(x, y, f.a); return [f.x + rx, f.y + ry]; }
  // Lays the whole contraption out at time t with the hull at (hx, hy).
  // ext (optional, from a run): wob = soft-body rim offsets for the Blob, seg = world positions of Caterpillar segments.
  function pose(tree, t, hx, hy, ext) {
    const out = { joints: [], sockets: [], gadgets: [], arms: [], rails: [], hull: null };
    const HU = HULLS[tree.h] || HULLS.disc, ang = hullAngle(tree, t);
    const rim = [], segs = [];
    const walk = (node, frame, path, depth) => {
      out.joints.push({ x: frame.x, y: frame.y, a: frame.a, node, path, depth });
      if (node.m === 'slider') { const A = MOTIONS.slider.A, ph = (node.ph || 0) * Math.PI / 2; const [x1, y1] = toWorld(frame, -A * Math.cos(ph), -A * Math.sin(ph)), [x2, y2] = toWorld(frame, A * Math.cos(ph), A * Math.sin(ph)); out.rails.push({ x1, y1, x2, y2 }); }
      if (node.m === 'cam') out.rails.push({ ellipse: true, x: frame.x, y: frame.y, a: frame.a, rx: MOTIONS.cam.Rx, ry: MOTIONS.cam.Ry });
      const n = node.kids.length;
      for (let k = 0; k < n; k++) {
        const L = jointLocal(node, t, k, n);
        const [x, y] = toWorld(frame, L.x, L.y), [cx, cy] = toWorld(frame, L.cx, L.cy), a = frame.a + L.a;
        out.arms.push({ x1: cx, y1: cy, x2: x, y2: y, depth });
        place1(node.kids[k], x, y, a, path.concat(k), depth + 1);
      }
    };
    const place1 = (kid, x, y, a, p, depth) => {
      if (!kid) out.sockets.push({ x, y, a, path: p, depth });
      else if (kid.m) walk(kid, { x, y, a }, p, depth);
      else out.gadgets.push({ x, y, a, node: kid, path: p, key: p.join('.'), depth });
    };
    // the hull and its sockets
    out.joints.push({ x: hx, y: hy, a: ang, node: tree, path: [], depth: 0 });
    HU.sockets.forEach(([sx, sy], i) => {
      let x, y, a;
      if (HU.spine) {
        const sg = ext && ext.seg && ext.seg[i];
        if (sg) { x = sg.x; y = sg.y; } else { x = hx + 8 * Math.sin(t * 2 - i * 0.7) * (i + 1) / 3; y = hy + sy; }
        segs.push({ x, y }); a = ang;
      } else {
        let lx = sx, ly = sy;
        if (HU.soft) { const w = ext && ext.wob && ext.wob[i]; if (w) { lx += w.x; ly += w.y; } else { const k = 1 + 0.12 * Math.sin(t * 3.1 + i * 1.7); lx *= k; ly *= k; } }
        const [rx, ry] = rot(lx, ly, ang); x = hx + rx; y = hy + ry; a = ang + Math.atan2(sx, -sy);
        rim.push({ x, y });
      }
      const kid = tree.kids[i];
      out.arms.push({ x1: hx, y1: hy, x2: x, y2: y, depth: 0, hull: true });
      place1(kid, x, y, a, [i], 1);
    });
    out.hull = { h: tree.h, x: hx, y: hy, a: ang, rim, segs };
    return out;
  }

  // ---------------------------------------------------------------- levels
  const hpMul = (n) => Math.pow(1.19, n - 1);
  const coinMul = (n) => Math.pow(1.13, n - 1);
  const isBoss = (n) => n % 5 === 0;
  function patternsFor(n) {
    return [['line', 4], ['column', 3], ['weave', 3], ['swarm', n >= 2 ? 3 : 0], ['gunner', n >= 2 ? 2 : 0], ['dash', n >= 3 ? 2 : 0], ['tank', n >= 4 ? 1.5 : 0], ['split', n >= 6 ? 1.5 : 0]].filter(([, w]) => w > 0);
  }
  function levelPlan(n) {
    const r = rng(n * 7919 + 13), boss = isBoss(n);
    const dur = boss ? 18 : Math.min(80, 48 + 2.5 * n);
    const gap = Math.max(1.6, 3.5 - 0.1 * n), evs = [];
    for (let t = 2; t < dur; t += gap * (0.75 + 0.5 * r())) evs.push({ t, p: r.weighted(patternsFor(n)), seed: r.int(1, 1e9) });
    return { n, boss, dur, events: evs };
  }

  // ---------------------------------------------------------------- a level being played
  function createRun(save, level, opts = {}) {
    const st = stats(save), plan = levelPlan(level), tree = clone(save.tree), HU = HULLS[tree.h];
    const r = rng(opts.seed != null ? opts.seed : level * 104729 + (save.stats.runs || 0) * 31 + 7);
    const hm = hpMul(level), cm = coinMul(level), bd = 1 + 0.05 * (level - 1), sp = 1 + Math.min(0.4, 0.015 * (level - 1));
    const bspd = Math.min(210, 150 * (1 + 0.012 * (level - 1)));
    const nBubble = Object.values(placedCounts(tree)).length ? (placedCounts(tree).bubble || 0) : 0;
    const S = {
      t: 0, rigT: 0, level, boss: plan.boss, plan, st, tree,
      hub: { x: W / 2, y: H - 110, hp: st.hull, max: st.hull, inv: 0, r: 8, vx: 0, vy: 0 },
      enemies: [], shots: [], eshots: [], coins: [], beams: [], ev: [], parts: {}, mines: [], zaps: [], melee: [], tracers: [], holes: [], decoys: [],
      bubble: { n: nBubble, ch: nBubble, t: 0 },
      spec: save.spec.slice(0, st.specSlots).map((id) => ({ id, max: SPECIALS[id].cd * st.capMul, cd: SPECIALS[id].cd * st.capMul * 0.5, on: 0 })),
      od: 0, slow: 0, tractorT: 0,
      wob: HU.soft ? HU.sockets.map(() => ({ x: 0, y: 0, vx: 0, vy: 0 })) : null,
      trail: HU.spine ? [] : null, seg: HU.spine ? HU.sockets.map((_, i) => ({ x: W / 2, y: H - 110 + 22 * (i + 1) })) : null,
      queued: [], kills: 0, spawned: 0, leaked: 0, coinsGot: 0, over: false, outcome: null, pi: 0,
      bossRef: null, bossDead: 0, minionT: 0, noseCd: 0.2, pose: null,
    };
    let nid = 1;
    const ev = (k, x, y, extra) => S.ev.push(Object.assign({ k, x, y }, extra));
    function spawn(type, x, y, extra) {
      const D = ENEMIES[type], hp = D.hp * hm;
      const e = Object.assign({ id: nid++, type, x, y, x0: x, hp, max: hp, r: D.r, t: 0, flash: 0, cd: 1 + r() * 1.5, st: 0, ph: r() * TAU, dead: false, lash: -1 }, extra);
      S.enemies.push(e); S.spawned++; return e;
    }
    function group(p, rr) {
      const n = level;
      switch (p) {
        case 'line': { const k = Math.min(7, 3 + Math.floor(n / 4)); for (let i = 0; i < k; i++) spawn('drone', 40 + (280 * (i + 0.5)) / k, -20 - (i % 2) * 18); break; }
        case 'column': { const x = rr.range(50, 310), k = 4 + Math.floor(n / 6); for (let i = 0; i < k; i++) spawn('drone', x, -20 - i * 34); break; }
        case 'weave': { const k = 2 + (n > 3 ? 1 : 0), x = rr.range(90, 270); for (let i = 0; i < k; i++) spawn('weaver', x, -20 - i * 40, { ph: i * 0.9 }); break; }
        case 'swarm': { const k = 5 + Math.min(4, Math.floor(n / 5)), x = rr.range(80, 280); for (let i = 0; i < k; i++) { const s = i % 2 ? 1 : -1, j = Math.ceil(i / 2); spawn('swarm', x + s * j * 16, -20 - j * 16); } break; }
        case 'gunner': { const k = 1 + (n > 8 ? 1 : 0); for (let i = 0; i < k; i++) spawn('gunner', rr.range(60, 300), -20, { stop: rr.range(90, 190) }); break; }
        case 'dash': { const x = rr.range(80, 280); for (let i = -1; i <= 1; i++) spawn('dasher', x + i * 50, -20 - Math.abs(i) * 20, { stop: rr.range(120, 170) }); break; }
        case 'tank': spawn('tank', rr.range(70, 290), -30); break;
        case 'split': { const k = 1 + (n > 12 ? 1 : 0); for (let i = 0; i < k; i++) spawn('splitter', rr.range(60, 300), -25 - i * 50); break; }
      }
    }
    function efire(e, ang, spd) { S.eshots.push({ x: e.x, y: e.y + e.r * 0.6, vx: Math.sin(ang) * spd, vy: -Math.cos(ang) * spd, r: 4, dmg: 8 * bd }); }
    // decoys draw fire from enemies that are closer to them than to you
    function aimPt(e) { let best = S.hub, bd2 = (S.hub.x - e.x) ** 2 + (S.hub.y - e.y) ** 2; for (const d of S.decoys) { const q = (d.x - e.x) ** 2 + (d.y - e.y) ** 2; if (q < bd2) { bd2 = q; best = d; } } return best; }
    const aimAt = (e) => { const p = aimPt(e); return Math.atan2(p.x - e.x, -(p.y - e.y)); };
    function hit(e, dmg) {
      if (e.dead) return; e.hp -= dmg; e.flash = 0.08;
      if (e.hp <= 0) kill(e);
    }
    function kill(e) {
      e.dead = true; S.kills++;
      const D = ENEMIES[e.type], val = D.v * cm, k = Math.min(6, Math.max(1, Math.round(D.v / 1.5)));
      for (let i = 0; i < k; i++) S.coins.push({ x: e.x + r.range(-6, 6), y: e.y + r.range(-6, 6), vx: r.range(-50, 50), vy: r.range(-70, -20), v: val / k, pull: false });
      ev('kill', e.x, e.y, { type: e.type, r: e.r });
      if (e.type === 'splitter') for (const s of [-1, 1]) spawn('swarm', e.x + s * 10, e.y, {});
      if (e.type === 'boss') { S.bossDead = S.t; ev('bossdown', e.x, e.y); }
    }
    function hurt(dmg, x, y) {
      if (S.hub.inv > 0 || S.over) return;
      if (S.bubble.ch > 0) { S.bubble.ch--; S.hub.inv = 0.4; ev('pop', S.hub.x, S.hub.y); return; }
      S.hub.hp -= dmg; S.hub.inv = 0.6; ev('hurt', x, y, { dmg });
    }
    function shoot(x, y, a, spd, dmg, kind, extra) {
      S.shots.push(Object.assign({ x, y, vx: Math.sin(a) * spd, vy: -Math.cos(a) * spd, dmg, r: kind === 'mortar' ? 6 : 3, kind, life: 3, a, dist: 0 }, extra));
    }
    function nearest(x, y, maxD = Infinity, skip) { let best = null, bd2 = maxD * maxD; for (const e of S.enemies) { if (e.dead || e.y < -10 || (skip && skip.has(e))) continue; const d = (e.x - x) ** 2 + (e.y - y) ** 2; if (d < bd2) { bd2 = d; best = e; } } return best; }
    function explode(x, y, rad, dmg) { for (const o of S.enemies) if (!o.dead && (o.x - x) ** 2 + (o.y - y) ** 2 < (rad + o.r) ** 2) hit(o, dmg); ev('boom', x, y, { r: rad }); }
    // melee hits harder the faster the part is moving through the world
    const speedMul = (v) => clamp(0.35 + v / 170, 0.35, 3);
    function special(i) {
      const s = S.spec[i]; if (!s || s.cd > 0 || S.over) return false;
      s.cd = s.max; const hub = S.hub;
      switch (s.id) {
        case 'nova':
          for (const e of S.enemies) if (!e.dead && (e.x - hub.x) ** 2 + (e.y - hub.y) ** 2 < (160 + e.r) ** 2) hit(e, e.max * (e.type === 'boss' ? 0.06 : 0.5) + 2);
          S.eshots = S.eshots.filter((b) => (b.x - hub.x) ** 2 + (b.y - hub.y) ** 2 > 160 * 160);
          break;
        case 'overdrive': S.od = SPECIALS.overdrive.dur; break;
        case 'blackhole': S.holes.push({ x: hub.x, y: Math.max(90, hub.y - 200), t: 0, dur: SPECIALS.blackhole.dur }); break;
        case 'tractor': S.tractorT = SPECIALS.tractor.dur; break;
        case 'timeslow': S.slow = SPECIALS.timeslow.dur; break;
      }
      S.queued.push({ k: 'special', x: hub.x, y: hub.y, id: s.id }); return true; // shown with the next frame's events
    }

    function update(dt, input) {
      if (S.over) return;
      dt = Math.min(dt, 0.05); S.t += dt; S.ev.length = 0; if (S.queued.length) { S.ev.push(...S.queued); S.queued.length = 0; } S.beams.length = 0; S.melee.length = 0;
      const hub = S.hub;
      // specials tick
      for (const s of S.spec) s.cd = Math.max(0, s.cd - dt);
      S.od = Math.max(0, S.od - dt); S.slow = Math.max(0, S.slow - dt); S.tractorT = Math.max(0, S.tractorT - dt);
      const edt = S.slow > 0 ? dt / 3 : dt; // enemy time
      S.rigT += dt * (S.od > 0 ? 3 : 1);
      // move: the hull heads for the target at its top speed
      const ox = hub.x, oy = hub.y;
      if (input && input.tx != null) {
        const tx = clamp(input.tx, 16, W - 16), ty = clamp(input.ty, H * 0.45, H - 30);
        const dx = tx - hub.x, dy = ty - hub.y, d = Math.hypot(dx, dy), mv = st.speed * dt;
        if (d <= mv) { hub.x = tx; hub.y = ty; } else { hub.x += dx / d * mv; hub.y += dy / d * mv; }
      }
      const nvx = (hub.x - ox) / dt, nvy = (hub.y - oy) / dt; hub.vx = nvx; hub.vy = nvy;
      hub.inv = Math.max(0, hub.inv - dt);
      // the Blob's rim lags behind when you move and springs back
      // it trails behind while you move (stretch) and overshoots when you stop (snap)
      if (S.wob) for (const w of S.wob) { w.vx += (-90 * (w.x + nvx * 0.035) - 6 * w.vx) * dt; w.vy += (-90 * (w.y + nvy * 0.035) - 6 * w.vy) * dt; w.x += w.vx * dt; w.y += w.vy * dt; const m = Math.hypot(w.x, w.y); if (m > 26) { w.x *= 26 / m; w.y *= 26 / m; } }
      // the Caterpillar's segments follow the path you flew
      if (S.trail) {
        const tr = S.trail; if (!tr.length || Math.hypot(tr[0].x - hub.x, tr[0].y - hub.y) > 2) tr.unshift({ x: hub.x, y: hub.y }); if (tr.length > 200) tr.length = 200;
        let acc = 0, j = 0; const pts = [{ x: hub.x, y: hub.y }, ...tr];
        S.seg.forEach((sg, i) => {
          const want = 22 * (i + 1);
          while (j < pts.length - 1 && acc + Math.hypot(pts[j + 1].x - pts[j].x, pts[j + 1].y - pts[j].y) < want) { acc += Math.hypot(pts[j + 1].x - pts[j].x, pts[j + 1].y - pts[j].y); j++; }
          if (j >= pts.length - 1) { const last = pts[pts.length - 1]; sg.x += (last.x - sg.x) * Math.min(1, 6 * dt); sg.y += (last.y + (want - acc) - sg.y) * Math.min(1, 6 * dt); return; }
          const a = pts[j], b = pts[j + 1], L = Math.hypot(b.x - a.x, b.y - a.y) || 1, u = (want - acc) / L; sg.x = a.x + (b.x - a.x) * u; sg.y = a.y + (b.y - a.y) * u;
        });
      }
      const P = S.pose = pose(tree, S.rigT, hub.x, hub.y, { wob: S.wob, seg: S.seg });
      // nose gun
      if ((S.noseCd -= dt) <= 0) { S.noseCd += st.noseCd; shoot(hub.x, hub.y - 14, 0, 460, st.noseDmg, 'nose'); ev('shoot', hub.x, hub.y); }
      // gadgets
      const shields = [], deflectors = [], magnets = [];
      S.decoys = [];
      for (const g of P.gadgets) {
        const G = GADGETS[g.node.g], pw = st.pw(g.node.g);
        let ps = S.parts[g.key];
        if (!ps) { let h = 0; for (const ch of g.key) h = (h * 31 + ch.charCodeAt(0)) % 997; ps = S.parts[g.key] = { cd: (G.cd || 1) * (0.2 + 0.8 * (h / 997)), off: (h / 997) * (G.cycle || 1), px: g.x, py: g.y, v: 0 }; }
        ps.v = ps.v * 0.7 + 0.3 * Math.hypot(g.x - ps.px, g.y - ps.py) / dt; ps.px = g.x; ps.py = g.y;
        const off = g.y < -30 || g.y > H + 30 || g.x < -30 || g.x > W + 30;
        const dirx = Math.sin(g.a), diry = -Math.cos(g.a);
        switch (g.node.g) {
          case 'blaster': case 'spread': case 'mortar': case 'missile':
            if ((ps.cd -= dt) <= 0) {
              ps.cd += G.cd; if (off) break;
              if (g.node.g === 'blaster') shoot(g.x, g.y, g.a, G.spd, G.dmg * pw, 'bolt');
              else if (g.node.g === 'spread') for (let i = 0; i < G.n; i++) shoot(g.x, g.y, g.a + (i - (G.n - 1) / 2) * G.arc, G.spd, G.dmg * pw, 'pellet');
              else if (g.node.g === 'mortar') shoot(g.x, g.y, g.a, G.spd, G.dmg * pw, 'mortar', { splash: G.splash, range: G.range });
              else shoot(g.x, g.y, g.a, G.spd, G.dmg * pw, 'missile', { life: 4.5, tgt: null, rt: 0 });
              ev('fire', g.x, g.y, { g: g.node.g });
            }
            break;
          case 'chain':
            if ((ps.cd -= dt) <= 0) {
              const first = nearest(g.x, g.y, G.range); if (!first) { ps.cd = 0.1; break; }
              ps.cd += G.cd; const hitSet = new Set(), pts = [g.x, g.y]; let cur = first, dmg = G.dmg * pw;
              for (let j = 0; cur && j <= G.jumps; j++) { hitSet.add(cur); pts.push(cur.x, cur.y); hit(cur, dmg); dmg *= 0.8; cur = nearest(cur.x, cur.y, G.hop, hitSet); }
              S.zaps.push({ pts, t: 0 }); ev('zap', g.x, g.y);
            }
            break;
          case 'mines':
            if ((ps.cd -= dt) <= 0) { ps.cd += G.cd; if (!off && S.mines.length < 30) { S.mines.push({ x: g.x, y: g.y, t: 0, dmg: G.dmg * pw, splash: G.splash, life: G.life }); ev('mine', g.x, g.y); } }
            break;
          case 'laser': {
            const u = (S.t + ps.off) % G.cycle;
            if (u < G.on) {
              const x2 = g.x + dirx * G.len, y2 = g.y + diry * G.len;
              S.beams.push({ x1: g.x, y1: g.y, x2, y2, k: u / G.on });
              for (const e of S.enemies) if (!e.dead && segDist(e.x, e.y, g.x, g.y, x2, y2) < e.r + 4) hit(e, G.dps * pw * dt);
              if (u - dt <= 0) ev('laser', g.x, g.y);
            }
            break;
          }
          case 'saw': {
            const k = 0.6 + 0.4 * speedMul(ps.v);
            for (const e of S.enemies) if (!e.dead && (e.x - g.x) ** 2 + (e.y - g.y) ** 2 < (e.r + G.r) ** 2) { hit(e, G.dps * pw * k * dt); if (r() < 0.25) ev('spark', g.x, g.y); }
            break;
          }
          case 'drill': {
            const x2 = g.x + dirx * G.len, y2 = g.y + diry * G.len; S.melee.push({ k: 'drill', x1: g.x, y1: g.y, x2, y2, a: g.a });
            for (const e of S.enemies) if (!e.dead && segDist(e.x, e.y, g.x, g.y, x2, y2) < e.r + 5) { hit(e, G.dps * pw * dt); if (r() < 0.3) ev('spark', x2, y2); }
            break;
          }
          case 'sword': {
            const x2 = g.x + dirx * G.len, y2 = g.y + diry * G.len, k = speedMul(ps.v * 1.4); S.melee.push({ k: 'sword', x1: g.x, y1: g.y, x2, y2, a: g.a, v: ps.v });
            for (const e of S.enemies) if (!e.dead && segDist(e.x, e.y, g.x, g.y, x2, y2) < e.r + 3) { hit(e, G.dps * pw * k * dt); if (r() < 0.2) ev('spark', e.x, e.y); }
            break;
          }
          case 'whip': {
            const u = (S.t + ps.off) % G.cycle, on = u < G.on;
            if (on && u - dt <= 0) { ps.lash = (ps.lash || 0) + 1; ev('lash', g.x, g.y); }
            const ext = on ? Math.sin(Math.PI * u / G.on) : 0.12, len = G.len * ext, bend = Math.sin(u * 20) * 10 * ext;
            const x2 = g.x + dirx * len - diry * bend, y2 = g.y + diry * len + dirx * bend;
            S.melee.push({ k: 'whip', x1: g.x, y1: g.y, x2, y2, mx: g.x + dirx * len * 0.5 + diry * bend, my: g.y + diry * len * 0.5 - dirx * bend, on });
            if (on) for (const e of S.enemies) if (!e.dead && e.lash !== g.key + ':' + ps.lash && segDist(e.x, e.y, g.x, g.y, x2, y2) < e.r + 3) { e.lash = g.key + ':' + ps.lash; hit(e, G.dmg * pw * speedMul(ps.v + 120)); ev('crack', e.x, e.y); }
            break;
          }
          case 'flail': {
            if (!ps.ball) ps.ball = { x: g.x + dirx * G.len, y: g.y + diry * G.len, px: g.x + dirx * G.len, py: g.y + diry * G.len };
            const b = ps.ball, vx = (b.x - b.px) * 0.985, vy = (b.y - b.py) * 0.985;
            b.px = b.x; b.py = b.y; b.x += vx; b.y += vy;
            const dx = b.x - g.x, dy = b.y - g.y, d = Math.hypot(dx, dy) || 1; if (d > G.len) { b.x = g.x + dx / d * G.len; b.y = g.y + dy / d * G.len; }
            const bv = Math.hypot(b.x - b.px, b.y - b.py) / dt; S.melee.push({ k: 'flail', x1: g.x, y1: g.y, x2: b.x, y2: b.y, v: bv });
            for (const e of S.enemies) if (!e.dead && (e.x - b.x) ** 2 + (e.y - b.y) ** 2 < (e.r + G.r) ** 2) { hit(e, G.dps * pw * speedMul(bv) * dt * 1.4); if (r() < 0.3) ev('spark', b.x, b.y); }
            break;
          }
          case 'shield': shields.push({ x: g.x, y: g.y, r: G.r * (1 + 0.1 * (pw - 1) / 0.3) }); break;
          case 'deflector': deflectors.push({ x: g.x, y: g.y, r: G.r * (1 + 0.1 * (pw - 1) / 0.3), pw }); break;
          case 'magnet': magnets.push({ x: g.x, y: g.y, r: G.r * (1 + 0.15 * (pw - 1) / 0.3) }); break;
          case 'decoy': S.decoys.push({ x: g.x, y: g.y }); break;
          case 'repair': hub.hp = Math.min(hub.max, hub.hp + G.hps * pw * dt); break;
          case 'pointdef':
            if ((ps.cd -= dt) <= 0) {
              let best = null, bd2 = (G.range * (1 + 0.1 * (pw - 1) / 0.3)) ** 2;
              for (const b of S.eshots) { const q = (b.x - g.x) ** 2 + (b.y - g.y) ** 2; if (q < bd2 && !b.gone) { bd2 = q; best = b; } }
              if (best) { ps.cd = G.cd; best.gone = true; S.tracers.push({ x1: g.x, y1: g.y, x2: best.x, y2: best.y, t: 0 }); ev('pd', best.x, best.y); } else ps.cd = 0.05;
            }
            break;
          case 'bubble': break; // counted at the start; see hurt()
        }
      }
      if (S.bubble.n && S.bubble.ch < S.bubble.n) { S.bubble.t += dt * st.pw('bubble'); if (S.bubble.t >= GADGETS.bubble.recharge) { S.bubble.t = 0; S.bubble.ch++; ev('bubble', hub.x, hub.y); } }
      // spawning (runs on real time so a time slow doesn't stretch the level)
      while (S.pi < plan.events.length && plan.events[S.pi].t <= S.t) { const e = plan.events[S.pi++]; group(e.p, rng(e.seed)); }
      if (plan.boss) {
        if (!S.bossRef && S.t >= plan.dur + 2) { S.bossRef = spawn('boss', W / 2, -50, {}); ev('boss', W / 2, 0); }
        if (S.bossRef && !S.bossRef.dead && (S.minionT += dt) >= Math.max(4.5, 7 - level * 0.05)) { S.minionT = 0; group(r.weighted(patternsFor(level).filter(([p]) => p !== 'tank')), r); }
      }
      // enemies
      for (const e of S.enemies) {
        if (e.dead) continue;
        let et = edt;
        if (S.tractorT > 0 && e.type !== 'boss' && Math.abs(e.x - hub.x) < 40 && e.y < hub.y) et *= 0.1; // pinned in the beam
        e.t += et; e.flash = Math.max(0, e.flash - dt);
        switch (e.type) {
          case 'drone': e.y += 48 * sp * et; break;
          case 'weaver': e.y += 40 * sp * et; e.x = e.x0 + 55 * Math.sin(1.7 * e.t + e.ph); break;
          case 'swarm': { e.y += 92 * sp * et; const p = aimPt(e), dx = p.x - e.x; e.x += clamp(dx, -30, 30) * et; break; }
          case 'splitter': e.y += 34 * sp * et; e.x = e.x0 + 25 * Math.sin(e.t + e.ph); break;
          case 'tank': e.y += 20 * sp * et; if ((e.cd -= et) <= 0) { e.cd = 3.2; const a = aimAt(e); for (const o of [-0.22, 0, 0.22]) efire(e, a + o, bspd * 0.85); ev('efire', e.x, e.y); } break;
          case 'gunner':
            if (e.st === 0) { e.y += 70 * et; if (e.y >= e.stop) { e.st = 1; e.t2 = 0; e.x0 = e.x; } }
            else if (e.st === 1) { e.t2 += et; e.x = e.x0 + 40 * Math.sin(0.8 * e.t2); if ((e.cd -= et) <= 0) { e.cd = 2.4; efire(e, aimAt(e), bspd); ev('efire', e.x, e.y); } if (e.t2 > 11) e.st = 2; }
            else e.y += 80 * et;
            break;
          case 'dasher':
            if (e.st === 0) { e.y += 80 * et; if (e.y >= e.stop) { e.st = 1; e.t2 = 0; } }
            else if (e.st === 1) { e.t2 += et; e.aim = aimAt(e); if (e.t2 > 0.9) { e.st = 2; e.vx = Math.sin(e.aim) * 260 * sp; e.vy = -Math.cos(e.aim) * 260 * sp; ev('dash', e.x, e.y); } }
            else { e.x += e.vx * et; e.y += e.vy * et; }
            break;
          case 'boss': {
            if (e.st === 0) { e.y += 50 * et; if (e.y >= 110) { e.st = 1; e.t2 = 0; e.cd = 1.5; e.cd2 = 4; e.cd3 = 6; } break; }
            e.t2 += et; e.x = W / 2 + 110 * Math.sin(0.45 * e.t2);
            if ((e.cd -= et) <= 0) { e.cd = 2.2; const a = aimAt(e); for (const o of [-0.2, 0, 0.2]) efire(e, a + o, bspd); ev('efire', e.x, e.y); }
            if ((e.cd2 -= et) <= 0) { e.cd2 = 5.5; const k = 14; for (let i = 0; i < k; i++) efire(e, (TAU * i) / k + e.t2, bspd * 0.75); ev('ering', e.x, e.y); }
            if (e.hp < e.max * 0.5) { e.cd3 -= et; if (e.cd3 <= 0 && e.cd3 > -3) { e.sp = (e.sp || 0) + et; if (e.sp >= 0.12) { e.sp = 0; efire(e, e.t2 * 4.2, bspd * 0.8); } } else if (e.cd3 <= -3) e.cd3 = 5; }
            break;
          }
        }
        if (e.y > H + 40 || e.x < -60 || e.x > W + 60) { e.dead = true; S.leaked++; }
      }
      // black holes drag enemies and bullets in
      for (const h of S.holes) {
        h.t += dt;
        for (const e of S.enemies) { if (e.dead) continue; const dx = h.x - e.x, dy = h.y - e.y, d = Math.hypot(dx, dy) || 1; if (d < 150) { if (e.type !== 'boss') { const pull = Math.min(d, 140 * dt); e.x += dx / d * pull; e.y += dy / d * pull; e.x0 += dx / d * pull; } hit(e, e.max * (e.type === 'boss' ? 0.02 : 0.3) * dt); } }
        for (const b of S.eshots) { const dx = h.x - b.x, dy = h.y - b.y, d = Math.hypot(dx, dy) || 1; if (d < 150) { b.x += dx / d * 160 * dt; b.y += dy / d * 160 * dt; if (d < 14) b.gone = true; } }
      }
      S.holes = S.holes.filter((h) => h.t < h.dur);
      // mines
      for (const m of S.mines) {
        m.t += dt;
        if (m.t > 0.4) for (const e of S.enemies) if (!e.dead && (e.x - m.x) ** 2 + (e.y - m.y) ** 2 < (e.r + 14) ** 2) { m.gone = true; explode(m.x, m.y, m.splash, m.dmg); break; }
        if (m.t > m.life) m.gone = true;
      }
      S.mines = S.mines.filter((m) => !m.gone);
      for (const z of S.zaps) z.t += dt; S.zaps = S.zaps.filter((z) => z.t < 0.18);
      for (const z of S.tracers) z.t += dt; S.tracers = S.tracers.filter((z) => z.t < 0.12);
      // player shots
      for (const s of S.shots) {
        s.life -= dt;
        if (s.kind === 'missile') {
          if ((s.rt -= dt) <= 0) { s.rt = 0.15; s.tgt = nearest(s.x, s.y); }
          const sp2 = Math.min(340, Math.hypot(s.vx, s.vy) + 260 * dt);
          let a = Math.atan2(s.vx, -s.vy);
          if (s.tgt && !s.tgt.dead) { const want = Math.atan2(s.tgt.x - s.x, -(s.tgt.y - s.y)); const da = ((want - a + Math.PI) % TAU + TAU) % TAU - Math.PI; a += clamp(da, -5 * dt, 5 * dt); }
          s.vx = Math.sin(a) * sp2; s.vy = -Math.cos(a) * sp2; s.a = a;
        }
        s.x += s.vx * dt; s.y += s.vy * dt; s.dist += Math.hypot(s.vx, s.vy) * dt;
        if (s.kind === 'mortar' && s.dist >= s.range) { s.gone = true; explode(s.x, s.y, s.splash, s.dmg); continue; }
        if (s.life <= 0 || s.y < -30 || s.y > H + 30 || s.x < -30 || s.x > W + 30) { s.gone = true; continue; }
        for (const e of S.enemies) {
          if (e.dead) continue;
          const rr = e.r + s.r; if ((e.x - s.x) ** 2 + (e.y - s.y) ** 2 > rr * rr) continue;
          s.gone = true;
          if (s.splash) explode(s.x, s.y, s.splash, s.dmg);
          else { hit(e, s.dmg); ev('hit', s.x, s.y, { kind: s.kind }); }
          break;
        }
      }
      S.shots = S.shots.filter((s) => !s.gone);
      // enemy shots
      for (const b of S.eshots) {
        if (b.gone) continue;
        b.x += b.vx * edt; b.y += b.vy * edt;
        if (b.y > H + 20 || b.y < -40 || b.x < -20 || b.x > W + 20) { b.gone = true; continue; }
        for (const sh of shields) if ((b.x - sh.x) ** 2 + (b.y - sh.y) ** 2 < (sh.r + b.r) ** 2) { b.gone = true; ev('block', b.x, b.y); break; }
        if (b.gone) continue;
        for (const df of deflectors) if ((b.x - df.x) ** 2 + (b.y - df.y) ** 2 < (df.r + b.r) ** 2) { b.gone = true; const a = Math.atan2(-b.vx, b.vy); shoot(b.x, b.y, a, 380, 2 * df.pw, 'reflect'); ev('reflect', b.x, b.y); break; }
        if (b.gone) continue;
        if ((b.x - hub.x) ** 2 + (b.y - hub.y) ** 2 < (hub.r + b.r) ** 2) { b.gone = true; hurt(b.dmg, b.x, b.y); }
      }
      S.eshots = S.eshots.filter((b) => !b.gone);
      // ramming
      for (const e of S.enemies) {
        if (e.dead) continue;
        if ((e.x - hub.x) ** 2 + (e.y - hub.y) ** 2 < (e.r + hub.r + 2) ** 2) { hurt(20 * bd, hub.x, hub.y); if (e.type !== 'boss') hit(e, e.type === 'dasher' ? 999 : 8); }
      }
      S.enemies = S.enemies.filter((e) => !e.dead);
      // coins fall; the tractor field and magnets pull them in
      for (const c of S.coins) {
        c.vy = Math.min(60, c.vy + 90 * dt); c.vx *= 1 - 2 * dt;
        let tgt = null;
        if (S.tractorT > 0 || (c.x - hub.x) ** 2 + (c.y - hub.y) ** 2 < st.tractor ** 2) tgt = hub;
        else for (const m of magnets) if ((c.x - m.x) ** 2 + (c.y - m.y) ** 2 < m.r ** 2) { tgt = m; break; }
        if (tgt) { const dx = tgt.x - c.x, dy = tgt.y - c.y, d = Math.hypot(dx, dy) || 1, v = S.tractorT > 0 ? 520 : 320; c.x += dx / d * Math.min(d, v * dt); c.y += dy / d * Math.min(d, v * dt); c.pull = true; if (d < 12) { c.gone = true; S.coinsGot += c.v; ev('coin', c.x, c.y, { v: c.v }); } }
        else { c.x += c.vx * dt; c.y += c.vy * dt; c.pull = false; }
        if (c.y > H + 20) c.gone = true;
      }
      S.coins = S.coins.filter((c) => !c.gone);
      // ends
      if (hub.hp <= 0) return finish('lose');
      if (plan.boss) { if (S.bossDead && S.t - S.bossDead > 1.2) finish('win'); }
      else if (S.pi >= plan.events.length && (S.enemies.length === 0 || S.t > plan.dur + 30)) finish('win');
    }
    function finish(outcome) {
      if (S.over) return;
      S.over = true; S.outcome = outcome; S.hub.hp = Math.max(0, S.hub.hp);
      if (outcome === 'win') { for (const e of S.enemies) if (!e.dead) kill(e); for (const c of S.coins) S.coinsGot += c.v; S.coins = []; }
      ev(outcome, S.hub.x, S.hub.y);
    }
    function result() {
      const win = S.outcome === 'win', hpFrac = S.hub.hp / S.hub.max, kr = S.spawned ? S.kills / S.spawned : 1;
      const stars = win ? 1 + (hpFrac >= 0.5 ? 1 : 0) + (hpFrac >= 0.5 && kr >= 0.85 ? 1 : 0) : 0;
      return { level, win, stars, kills: S.kills, spawned: S.spawned, coins: Math.round(S.coinsGot), hpFrac, t: S.t, boss: plan.boss };
    }
    return { S, update, result, special, quit: () => finish('lose') };
  }
  // Pays out a finished level: coins always; the clear bonus, stars and cores on a win.
  function applyResult(save, res) {
    const out = { coins: res.coins, bonus: 0, cores: 0, newStars: 0, firstBoss: false };
    save.coins += res.coins; save.stats.runs++; save.stats.kills += res.kills; save.stats.secs += res.t; save.stats.coins += res.coins;
    if (res.win) {
      save.stats.wins++;
      out.bonus = Math.round((25 + 12 * res.level) * Math.sqrt(coinMul(res.level)) * (1 + 0.25 * res.stars));
      const had = save.stars[res.level] || 0;
      out.newStars = Math.max(0, res.stars - had); out.cores += out.newStars;
      if (res.boss && !had) { out.cores += 3; out.firstBoss = true; }
      save.stars[res.level] = Math.max(had, res.stars);
      save.unlocked = Math.max(save.unlocked, res.level + 1);
      save.coins += out.bonus; save.cores += out.cores; save.stats.coins += out.bonus;
    }
    return out;
  }

  // ---------------------------------------------------------------- shop and lab
  const START_INV = { blaster: 3, rotor: 1, saw: 1 };
  const partPrice = (save, k) => Math.round((MOTIONS[k] || GADGETS[k]).price * Math.pow(1.18, Math.max(0, (save.inv[k] || 0) - (START_INV[k] || 0) - (BLUEPRINTS.some((b) => b.part === k) ? 1 : 0))));
  function buyPart(save, k) {
    if (!MOTIONS[k] && !GADGETS[k]) return 'no such part';
    if (!save.unl[k]) return 'unlock it in the Lab first';
    const c = partPrice(save, k); if (save.coins < c) return 'not enough coins';
    save.coins -= c; save.inv[k] = (save.inv[k] || 0) + 1; return '';
  }
  function upLevel(save, key) { return key.startsWith('g:') ? save.up.g[key.slice(2)] || 0 : save.up[key] || 0; }
  function upMax(key) { return key.startsWith('g:') ? 10 : UPGRADES[key].max; }
  function upCost(save, key) {
    const l = upLevel(save, key); if (l >= upMax(key)) return null;
    if (key.startsWith('g:')) return Math.round(GADGETS[key.slice(2)].price * 0.9 * Math.pow(1.5, l));
    return Math.round(UPGRADES[key].base * Math.pow(UPGRADES[key].grow, l));
  }
  function buyUp(save, key) {
    if (key.startsWith('g:') && !save.unl[key.slice(2)]) return 'unlock it in the Lab first';
    const c = upCost(save, key); if (c == null) return 'maxed out'; if (save.coins < c) return 'not enough coins';
    save.coins -= c;
    if (key.startsWith('g:')) save.up.g[key.slice(2)] = upLevel(save, key) + 1; else save.up[key]++;
    return '';
  }
  function canUnlock(save, id) {
    const b = BP[id]; if (!b) return 'no such blueprint'; if (save.bp[id]) return 'already built';
    if (b.req && !save.bp[b.req]) return `needs ${BP[b.req].name} first`;
    if (save.cores < b.cost) return 'not enough cores'; return '';
  }
  function unlock(save, id) {
    const e = canUnlock(save, id); if (e) return e;
    const b = BP[id]; save.cores -= b.cost; save.bp[id] = 1;
    if (b.part) { save.unl[b.part] = 1; save.inv[b.part] = (save.inv[b.part] || 0) + 1; } // the first one's free
    if (b.hull) save.hulls[b.hull] = 1;
    if (b.spec) { save.specs[b.spec] = 1; if (save.spec.length < stats(save).specSlots) save.spec.push(b.spec); }
    normalize(save); return '';
  }

  const api = {
    W, H, TAU, SAVE_V, HULLS, HULL_MOTIONS, MOTIONS, GADGETS, GROUPS, SPECIALS, ENEMIES, BLUEPRINTS, BP, UPGRADES, SPEEDS, PASSIVE,
    rng, newSave, load, stats, normalize, placedCounts, available, nodeAt, canPlace, place, remove, tune, setHull, setSpecial, autoBuild,
    jointLocal, hullAngle, pose, levelPlan, hpMul, coinMul, isBoss, createRun, applyResult,
    partPrice, buyPart, upLevel, upMax, upCost, buyUp, canUnlock, unlock, isMotion, isGadget, partName,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.OM = api;
})(typeof window !== 'undefined' ? window : globalThis);
