// Random Encounter: rules. Pure (no DOM): the browser app and the node bots share it.
// A survivors-style run on an open overworld. You steer the party leader; every hero attacks on its own, by job.
// XP gems level the party; at set levels a recruit joins (pick one of three jobs, up to four heroes).
// The party shares one HP pool. A boss comes at 4:00; slay the final boss after 8:00 to win.
(function (root) {
  'use strict';
  const G = {};
  const env = (k) => (typeof process !== 'undefined' && process.env && process.env[k]) || '';

  G.rng = function (seed) {
    let a = seed >>> 0 || 1;
    const f = () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    f.int = (n) => Math.floor(f() * n);
    f.pick = (arr) => arr[Math.floor(f() * arr.length)];
    return f;
  };

  // ---------------------------------------------------------------- tuning
  G.RUN_TIME = 480;              // seconds until the final boss arrives
  G.BOSS1_AT = 240;
  G.RECRUIT_AT = [2, 6, 12];     // levels where a new hero joins
  G.MAX_PARTY = 4;
  G.SPACING = 13;                // px between heroes in the marching line
  const HPX = +env('HPX') || 1, SPAWNX = +env('SPX') || 0.9, HPT = +env('HPT') || 170, XPX = +env('XPX') || 1.4, DPS = +env('DPS') || 0.7;

  // ---------------------------------------------------------------- jobs and skills
  // Each job has three skills. The first is known on joining; the others are learned on level-ups. Max level 6.
  G.JOBS = {
    fighter: { name: 'Fighter', blurb: 'Sword and steel. Cuts down whatever is closest.', skills: ['slash', 'whirl', 'wave'], color: '#d8343c' },
    mage: { name: 'Mage', blurb: 'Hurls fire and calls down lightning.', skills: ['fire', 'thunder', 'ice'], color: '#4c7cd8' },
    cleric: { name: 'Cleric', blurb: 'Holy light that burns foes and mends the party.', skills: ['holy', 'cure', 'pillar'], color: '#f4ecd8' },
    thief: { name: 'Thief', blurb: 'Quick hands, flying daggers, lucky strikes.', skills: ['dagger', 'fan', 'luck'], color: '#4cb45c' },
    monk: { name: 'Monk', blurb: 'Fists faster than the eye; shakes the ground.', skills: ['fist', 'quake', 'chakra'], color: '#f08c3c' },
    ranger: { name: 'Ranger', blurb: 'Arrows that pierce, volleys that fan out.', skills: ['arrow', 'volley', 'rain'], color: '#9c7c4c' },
  };
  G.JOB_IDS = Object.keys(G.JOBS);
  G.MAXLV = 6;
  // desc(lv) describes the skill at level lv (1-based)
  G.SKILLS = {
    slash: { name: 'Slash', desc: (l) => `Cuts in an arc at the nearest foe. ${14 + 6 * l} damage.`, cd: (l) => 1.05 - 0.06 * l },
    whirl: { name: 'Whirlwind', desc: (l) => `Spins, striking everything close. ${12 + 6 * l} damage.`, cd: (l) => 3.4 - 0.2 * l },
    wave: { name: 'Sword Wave', desc: (l) => `A crescent of force that pierces ${2 + l} foes. ${12 + 5 * l} damage.`, cd: (l) => 2.2 - 0.1 * l },
    fire: { name: 'Fire', desc: (l) => `A fireball that bursts on impact. ${14 + 6 * l} damage${l >= 3 ? `, ${1 + Math.floor(l / 3)} at once` : ''}.`, cd: (l) => 1.5 - 0.08 * l },
    thunder: { name: 'Thunder', desc: (l) => `Lightning strikes ${1 + l} foes. ${18 + 7 * l} damage.`, cd: (l) => 2.6 - 0.12 * l },
    ice: { name: 'Ice', desc: (l) => `${2 + l} shards that pierce and chill. ${8 + 3 * l} damage.`, cd: (l) => 1.9 - 0.08 * l },
    holy: { name: 'Holy Ring', desc: (l) => `A ring of light that burns and pushes back foes near the Cleric. ${4 + 2 * l} damage, twice a second.`, cd: () => 0.5 },
    cure: { name: 'Cure', desc: (l) => `Heals the party ${5 + 3 * l} HP.`, cd: (l) => 7.5 - 0.4 * l },
    pillar: { name: 'Judgement', desc: (l) => `Pillars of light fall on ${l} foes. ${24 + 9 * l} damage.`, cd: (l) => 3.2 - 0.12 * l },
    dagger: { name: 'Daggers', desc: (l) => `Throws ${1 + Math.floor(l / 2)} dagger${l >= 2 ? 's' : ''} at the nearest foe. ${6 + 3 * l} damage.`, cd: (l) => 0.6 - 0.03 * l },
    fan: { name: 'Knife Fan', desc: (l) => `${6 + 2 * l} knives in every direction. ${7 + 3 * l} damage.`, cd: (l) => 2.6 - 0.12 * l },
    luck: { name: 'Lucky Strike', desc: (l) => `Every hero crits ${6 * l}% of the time for double damage.`, cd: () => 99, passive: true },
    fist: { name: 'Flurry', desc: (l) => `Rapid punches at a foe in reach, knocking it back. ${6 + 3 * l} damage.`, cd: (l) => 0.36 - 0.015 * l },
    quake: { name: 'Shockwave', desc: (l) => `A ring of force rolls out to ${44 + 8 * l}px. ${12 + 6 * l} damage.`, cd: (l) => 4 - 0.2 * l },
    chakra: { name: 'Chakra', desc: (l) => `The party regains ${(0.6 + 0.5 * l).toFixed(1)} HP a second.`, cd: () => 99, passive: true },
    arrow: { name: 'Arrow', desc: (l) => `A swift arrow that pierces ${1 + l} foes and knocks them back. ${12 + 4 * l} damage.`, cd: (l) => 0.85 - 0.05 * l },
    volley: { name: 'Volley', desc: (l) => `${3 + l} arrows in a fan. ${8 + 3 * l} damage each.`, cd: (l) => 2.3 - 0.1 * l },
    rain: { name: 'Arrow Rain', desc: (l) => `Arrows pelt the thickest crowd for 2 s. ${5 + 2 * l} damage per volley.`, cd: (l) => 4.4 - 0.2 * l },
  };
  for (const j in G.JOBS) for (const s of G.JOBS[j].skills) G.SKILLS[s].job = j;
  G.PASSIVES = {
    vigor: { name: 'Vigor', desc: '+20 max HP, and heal 20.' },
    haste: { name: 'Swift Boots', desc: '+8% move speed.' },
    reach: { name: 'Lodestone', desc: 'Pick things up from 30% farther away.' },
    might: { name: 'Might', desc: '+10% damage for every hero.' },
    guard: { name: 'Mail', desc: 'Take 1 less damage from every hit.' },
    focus: { name: 'Focus', desc: 'Every skill recovers 6% faster.' },
    wisdom: { name: 'Wisdom', desc: '+10% experience.' },
  };
  G.PASSIVE_MAX = 5;

  // ---------------------------------------------------------------- enemies
  // r: body radius. spd px/s. xp: gem value. kind: 'melee' (walks at you), 'shooter' (keeps range, fires).
  G.FOES = {
    slime: { name: 'Slime', hp: 9, spd: 19, dmg: 5, r: 6, xp: 1 },
    bat: { name: 'Bat', hp: 6, spd: 44, dmg: 4, r: 5, xp: 1, wobble: 1 },
    goblin: { name: 'Goblin', hp: 18, spd: 27, dmg: 7, r: 6, xp: 2 },
    wolf: { name: 'Wolf', hp: 16, spd: 50, dmg: 7, r: 6, xp: 2 },
    skeleton: { name: 'Skeleton', hp: 34, spd: 25, dmg: 9, r: 6, xp: 3 },
    ghost: { name: 'Ghost', hp: 24, spd: 34, dmg: 8, r: 6, xp: 3, wobble: 1 },
    imp: { name: 'Imp', hp: 20, spd: 26, dmg: 6, r: 6, xp: 3, kind: 'shooter' },
    ogre: { name: 'Ogre', hp: 140, spd: 17, dmg: 15, r: 9, xp: 8 },
    golem: { name: 'Stone Golem', hp: +env('B1') || 1200, spd: 30, dmg: 20, r: 14, xp: 60, boss: 1 },
    wyrm: { name: 'Ancient Wyrm', hp: +env('B2') || 3200, spd: 28, dmg: 24, r: 17, xp: 0, boss: 2, kind: 'shooter' },
  };
  // which foes walk in, by minute (weights)
  G.WAVES = [
    { slime: 6, bat: 3 },
    { slime: 4, bat: 4, goblin: 3 },
    { bat: 3, goblin: 4, wolf: 3 },
    { goblin: 3, wolf: 4, imp: 2, skeleton: 2 },
    { wolf: 3, skeleton: 4, imp: 3, ghost: 2, ogre: 0.5 },
    { skeleton: 4, ghost: 4, imp: 3, ogre: 1 },
    { ghost: 4, skeleton: 4, imp: 3, ogre: 1.5, wolf: 2 },
    { ghost: 4, skeleton: 4, imp: 4, ogre: 2, wolf: 3 },
  ];

  // ---------------------------------------------------------------- run
  G.newRun = function (opt) {
    const rnd = G.rng(opt.seed || (Date.now() & 0xffffffff));
    const r = {
      rnd, t: 0, over: false, won: false, ev: [], hp: +env('HP0') || 150, hpMax: +env('HP0') || 150, inv: 0, xp: 0, lv: 1, kills: 0, gold: 0,
      x: 0, y: 0, dir: { x: 1, y: 0 }, move: { x: 0, y: 0 }, trail: Array.from({ length: 60 }, (_, i) => ({ x: (i - 59) * 2, y: 0 })), party: [],
      foes: [], shots: [], foeShots: [], areas: [], gems: [], items: [], uid: 1, spawnT: 0, bossDone: 0, final: null,
      passive: {}, pending: null, choices: 0, recruits: [], owed: 0, stats: { dmg: 0 }, view: opt.view || { w: 200, h: 420 },
    };
    addHero(r, opt.job || 'fighter');
    return r;
  };
  function addHero(r, job) {
    const back = r.trail[Math.max(0, r.trail.length - 1 - Math.round(r.party.length * G.SPACING / 2))] || r;
    const h = { job, skills: {}, cds: {}, x: back.x, y: back.y };
    h.skills[G.JOBS[job].skills[0]] = 1;
    if (job === 'mage') h.skills.thunder = 0; // the Mage's Thunder is the first thing offered
    for (const s of G.JOBS[job].skills) h.cds[s] = 0.4 + r.rnd() * 0.4;
    r.party.push(h);
    r.recruits.push({ job, t: r.t, lv: r.lv });
    r.ev.push({ type: 'join', job });
    return h;
  }
  G.makeHero = (job, levels, x, y) => { const h = { job, skills: Object.assign({}, levels), cds: {}, x: x || 0, y: y || 0 }; for (const s of G.JOBS[job].skills) h.cds[s] = 0.2; return h; };
  const lvOf = (r, h, s) => h.skills[s] || 0;
  const pas = (r, k) => r.passive[k] || 0;
  G.speed = (r) => 58 * (1 + 0.08 * pas(r, 'haste'));
  G.reach = (r) => 26 * (1 + 0.3 * pas(r, 'reach'));
  const might = (r) => 1 + 0.1 * pas(r, 'might');
  const cdMul = (r) => Math.pow(0.94, pas(r, 'focus'));
  const critChance = (r) => { let c = 0.04; for (const h of r.party) c += 0.06 * lvOf(r, h, 'luck'); return c; };

  // ---------------- spatial grid for foes
  const CELL = 32;
  function buildGrid(r) {
    const gmap = new Map();
    for (const f of r.foes) { const k = ((f.x / CELL) | 0) * 73856093 ^ ((f.y / CELL) | 0) * 19349663; let a = gmap.get(k); if (!a) gmap.set(k, (a = [])); a.push(f); }
    r.grid = gmap;
  }
  function near(r, x, y, rad, fn) {
    const x0 = Math.floor((x - rad) / CELL), x1 = Math.floor((x + rad) / CELL), y0 = Math.floor((y - rad) / CELL), y1 = Math.floor((y + rad) / CELL);
    for (let cx = x0; cx <= x1; cx++) for (let cy = y0; cy <= y1; cy++) { const a = r.grid.get(cx * 73856093 ^ cy * 19349663); if (a) for (const f of a) if (f.hp > 0) fn(f); }
  }
  G.nearest = function (r, x, y, maxD) {
    let best = null, bd = maxD * maxD;
    for (const f of r.foes) { if (f.hp <= 0) continue; const dx = f.x - x, dy = f.y - y, d = dx * dx + dy * dy; if (d < bd) { bd = d; best = f; } }
    return best;
  };
  // ranged skills go for a boss when one is in range
  G.target = function (r, x, y, maxD) {
    for (const f of r.foes) if (f.boss && f.hp > 0 && (f.x - x) ** 2 + (f.y - y) ** 2 < maxD * maxD) return f;
    return G.nearest(r, x, y, maxD);
  };
  function inRadius(r, x, y, rad, fn) { near(r, x, y, rad + 20, (f) => { const dx = f.x - x, dy = f.y - y; if (dx * dx + dy * dy <= (rad + f.r) * (rad + f.r)) fn(f); }); }

  // ---------------- damage
  function damage(r, f, dmg, src, kx, ky) {
    if (f.hp <= 0) return;
    let crit = r.rnd() < critChance(r);
    let d = dmg * might(r) * (crit ? 2 : 1);
    d = Math.max(1, Math.round(d));
    f.hp -= d; f.flash = 0.1; r.stats.dmg += d;
    if (kx || ky) { const kb = f.boss ? 0.1 : 1; f.kx += kx * kb; f.ky += ky * kb; }
    r.ev.push({ type: 'hit', x: f.x, y: f.y - f.r, dmg: d, crit, src });
    if (f.hp <= 0) kill(r, f);
  }
  function kill(r, f) {
    r.kills++;
    r.ev.push({ type: 'kill', x: f.x, y: f.y, foe: f.type, elite: !!f.elite, boss: f.boss });
    if (f.boss === 2) { r.won = true; end(r, 'won'); return; }
    const xp = f.xp * (f.elite ? 5 : 1);
    if (xp) r.gems.push({ x: f.x, y: f.y, v: xp, id: r.uid++ });
    if (f.elite || f.boss === 1) r.items.push({ x: f.x + 6, y: f.y, kind: 'chest', id: r.uid++ });
    if (f.boss === 1) { r.items.push({ x: f.x - 8, y: f.y + 4, kind: 'potion', id: r.uid++ }); r.ev.push({ type: 'bossDown', foe: f.type }); }
    else if (r.rnd() < 0.02 + (f.elite ? 1 : 0)) r.items.push({ x: f.x, y: f.y + 3, kind: 'potion', id: r.uid++ });
    else if (r.rnd() < 0.003) r.items.push({ x: f.x, y: f.y, kind: 'magnet', id: r.uid++ });
  }
  function end(r, why) { if (r.over) return; r.over = true; r.reason = why; r.ev.push({ type: 'end', why }); }
  function hurt(r, dmg, x, y) {
    if (r.inv > 0 || r.over) return;
    dmg = Math.max(1, Math.round(dmg - pas(r, 'guard')));
    r.hp -= dmg; r.inv = +env('INV') || 0.8;
    r.ev.push({ type: 'hurt', dmg, x, y });
    if (r.hp <= 0) { r.hp = 0; end(r, 'fell'); }
  }
  function heal(r, n) { if (n <= 0 || r.over) return; const before = r.hp; r.hp = Math.min(r.hpMax, r.hp + n); if (r.hp - before >= 1) r.ev.push({ type: 'heal', n: Math.round(r.hp - before) }); }

  // ---------------- skills: each returns nothing; spawns shots/areas or hits directly
  const shoot = (r, o) => { r.shots.push(Object.assign({ id: r.uid++, hit: new Set(), life: 1.6, pierce: 1, r: 3 }, o)); };
  const aimAt = (h, f) => { const dx = f.x - h.x, dy = f.y - h.y, d = Math.hypot(dx, dy) || 1; return { x: dx / d, y: dy / d, d }; };
  const CAST = {
    slash(r, h, l) {
      const f = G.nearest(r, h.x, h.y, 46); if (!f) return false;
      const a = aimAt(h, f), reach = 26 + 2 * l, ang = Math.atan2(a.y, a.x);
      inRadius(r, h.x, h.y, reach, (o) => { const da = Math.atan2(o.y - h.y, o.x - h.x) - ang; const w = Math.abs(Math.atan2(Math.sin(da), Math.cos(da))); if (w < 1.15) damage(r, o, 14 + 6 * l, 'slash', a.x * 60, a.y * 60); });
      r.ev.push({ type: 'slash', x: h.x, y: h.y, ang, r: reach }); return true;
    },
    whirl(r, h, l) {
      if (!G.nearest(r, h.x, h.y, 50)) return false;
      const rad = 30 + 3 * l; inRadius(r, h.x, h.y, rad, (o) => { const a = aimAt(h, o); damage(r, o, 12 + 6 * l, 'whirl', a.x * 80, a.y * 80); });
      r.ev.push({ type: 'whirl', x: h.x, y: h.y, r: rad }); return true;
    },
    wave(r, h, l) {
      const f = G.target(r, h.x, h.y, 150); if (!f) return false; const a = aimAt(h, f);
      shoot(r, { kind: 'wave', x: h.x, y: h.y, vx: a.x * 130, vy: a.y * 130, dmg: 12 + 5 * l, pierce: 2 + l, r: 7, life: 1.4 }); return true;
    },
    fire(r, h, l) {
      const n = 1 + Math.floor(l / 3), targets = [];
      for (let i = 0; i < n; i++) { const f = i ? G.nearest(r, h.x + (r.rnd() - 0.5) * 60, h.y + (r.rnd() - 0.5) * 60, 160) : G.target(r, h.x, h.y, 160); if (f) targets.push(f); }
      if (!targets.length) return false;
      for (const f of targets) { const a = aimAt(h, f); shoot(r, { kind: 'fire', x: h.x, y: h.y, vx: a.x * 115, vy: a.y * 115, dmg: 14 + 6 * l, burst: 14 + 2 * l, r: 4 }); }
      return true;
    },
    thunder(r, h, l) {
      const pool = r.foes.filter((f) => f.hp > 0 && Math.abs(f.x - h.x) < 110 && Math.abs(f.y - h.y) < 150); if (!pool.length) return false;
      pool.sort((a, b) => (b.boss || 0) - (a.boss || 0)); for (let i = 0; i < 1 + l && pool.length; i++) { const f = pool.splice(i === 0 && pool[0].boss ? 0 : r.rnd.int(pool.length), 1)[0]; damage(r, f, 18 + 7 * l, 'thunder'); r.ev.push({ type: 'bolt', x: f.x, y: f.y }); inRadius(r, f.x, f.y, 10, (o) => { if (o !== f) damage(r, o, (18 + 7 * l) * 0.4, 'thunder'); }); }
      return true;
    },
    ice(r, h, l) {
      const f = G.target(r, h.x, h.y, 140); if (!f) return false; const a = aimAt(h, f), base = Math.atan2(a.y, a.x), n = 2 + l;
      for (let i = 0; i < n; i++) { const an = base + (i - (n - 1) / 2) * 0.16; shoot(r, { kind: 'ice', x: h.x, y: h.y, vx: Math.cos(an) * 140, vy: Math.sin(an) * 140, dmg: 8 + 3 * l, pierce: 2, chill: 1.5, r: 3, life: 1 }); }
      return true;
    },
    holy(r, h, l) { const rad = 28 + 3 * l; let any = false; inRadius(r, h.x, h.y, rad, (o) => { any = true; const a = aimAt(h, o); damage(r, o, 4 + 2 * l, 'holy', a.x * 25, a.y * 25); }); r.ev.push({ type: 'holy', x: h.x, y: h.y, r: rad, any }); return true; },
    cure(r, h, l) { if (r.hp >= r.hpMax) return false; heal(r, 5 + 3 * l); r.ev.push({ type: 'cure', x: h.x, y: h.y }); return true; },
    pillar(r, h, l) {
      const pool = r.foes.filter((f) => f.hp > 0 && Math.abs(f.x - h.x) < 110 && Math.abs(f.y - h.y) < 150); if (!pool.length) return false;
      pool.sort((a, b) => b.hp - a.hp);
      for (let i = 0; i < l && i < pool.length; i++) { const f = pool[i]; r.ev.push({ type: 'pillar', x: f.x, y: f.y }); inRadius(r, f.x, f.y, 12, (o) => damage(r, o, 24 + 9 * l, 'pillar')); }
      return true;
    },
    dagger(r, h, l) {
      const f = G.target(r, h.x, h.y, 150); if (!f) return false; const a = aimAt(h, f), n = 1 + Math.floor(l / 2);
      for (let i = 0; i < n; i++) { const an = Math.atan2(a.y, a.x) + (i - (n - 1) / 2) * 0.12; shoot(r, { kind: 'dagger', x: h.x, y: h.y, vx: Math.cos(an) * 190, vy: Math.sin(an) * 190, dmg: 6 + 3 * l, r: 3, life: 0.9 }); }
      return true;
    },
    fan(r, h, l) {
      if (!G.nearest(r, h.x, h.y, 90)) return false; const n = 6 + 2 * l;
      for (let i = 0; i < n; i++) { const an = (i / n) * Math.PI * 2; shoot(r, { kind: 'dagger', x: h.x, y: h.y, vx: Math.cos(an) * 170, vy: Math.sin(an) * 170, dmg: 7 + 3 * l, r: 3, life: 0.6 }); }
      return true;
    },
    fist(r, h, l) {
      const f = G.nearest(r, h.x, h.y, 24 + f0(l)); if (!f) return false; const a = aimAt(h, f);
      damage(r, f, 6 + 3 * l, 'fist', a.x * 120, a.y * 120); r.ev.push({ type: 'fist', x: (h.x + f.x) / 2, y: (h.y + f.y) / 2 }); return true;
    },
    quake(r, h, l) { if (!G.nearest(r, h.x, h.y, 60)) return false; r.areas.push({ kind: 'ring', x: h.x, y: h.y, rad: 4, max: 44 + 8 * l, dmg: 12 + 6 * l, hit: new Set(), life: 0.6, t: 0 }); return true; },
    arrow(r, h, l) { const f = G.target(r, h.x, h.y, 180); if (!f) return false; const a = aimAt(h, f); shoot(r, { kind: 'arrow', x: h.x, y: h.y, vx: a.x * 220, vy: a.y * 220, dmg: 12 + 4 * l, pierce: 1 + l, r: 3, life: 1, kb: 3 }); return true; },
    volley(r, h, l) {
      const f = G.target(r, h.x, h.y, 150); if (!f) return false; const a = aimAt(h, f), base = Math.atan2(a.y, a.x), n = 3 + l;
      for (let i = 0; i < n; i++) { const an = base + (i - (n - 1) / 2) * 0.22; shoot(r, { kind: 'arrow', x: h.x, y: h.y, vx: Math.cos(an) * 200, vy: Math.sin(an) * 200, dmg: 8 + 3 * l, pierce: 1, r: 3, life: 0.8 }); }
      return true;
    },
    rain(r, h, l) {
      // aim at the thickest crowd in view
      let best = null, bn = 0;
      for (let i = 0; i < 12; i++) { const f = r.foes[r.rnd.int(r.foes.length || 1)]; if (!f || f.hp <= 0 || Math.abs(f.x - h.x) > 110 || Math.abs(f.y - h.y) > 150) continue; let n = 0; inRadius(r, f.x, f.y, 24, () => n++); if (n > bn) { bn = n; best = f; } }
      if (!best) return false; r.areas.push({ kind: 'rain', x: best.x, y: best.y, rad: 24, dmg: 5 + 2 * l, life: 2, tick: 0, t: 0 }); return true;
    },
  };
  const f0 = (l) => l; // flurry reach grows a little with level

  // ---------------- choices: level-ups and recruits
  function offer(r) {
    const recruit = r.owed > 0 && r.party.length < G.MAX_PARTY;
    if (r.owed > 0 && !recruit) r.owed = 0;
    let cards = [];
    if (recruit) {
      const have = new Set(r.party.map((h) => h.job));
      const pool = G.JOB_IDS.filter((j) => !have.has(j));
      while (cards.length < 3 && pool.length) { const j = pool.splice(r.rnd.int(pool.length), 1)[0]; cards.push({ kind: 'recruit', job: j }); }
    }
    if (!cards.length) {
      const pool = [];
      for (let i = 0; i < r.party.length; i++) {
        const h = r.party[i];
        for (const s of G.JOBS[h.job].skills) {
          const l = h.skills[s] || 0;
          if (l >= G.MAXLV) continue;
          pool.push({ kind: l ? 'skill' : 'learn', hero: i, skill: s, w: l ? 1.2 : (s === 'thunder' ? 6 : 0.9) });
        }
      }
      for (const k in G.PASSIVES) if (pas(r, k) < G.PASSIVE_MAX) pool.push({ kind: 'passive', id: k, w: 0.7 });
      const th = pool.findIndex((c) => c.skill === 'thunder' && c.kind === 'learn'); if (th >= 0) cards.push(pool.splice(th, 1)[0]);
      while (cards.length < 3 && pool.length) {
        let tot = pool.reduce((a, c) => a + c.w, 0), x = r.rnd() * tot, i = 0;
        for (; i < pool.length - 1; i++) { x -= pool[i].w; if (x <= 0) break; }
        cards.push(pool.splice(i, 1)[0]);
      }
      if (!cards.length) cards.push({ kind: 'potion' });
    }
    r.pending = { cards, recruit, from: 'level' };
    r.ev.push({ type: 'choice', recruit });
  }
  G.cardText = function (r, c) {
    if (c.kind === 'recruit') return { title: G.JOBS[c.job].name + ' joins', body: G.JOBS[c.job].blurb + ' Starts with ' + G.SKILLS[G.JOBS[c.job].skills[0]].name + '.', tag: 'NEW HERO' };
    if (c.kind === 'learn' || c.kind === 'skill') {
      const h = r.party[c.hero], s = G.SKILLS[c.skill], l = (h.skills[c.skill] || 0) + 1;
      return { title: s.name + (l > 1 ? ' ' + roman(l) : ''), body: s.desc(l), tag: G.JOBS[h.job].name + (l > 1 ? ' · LV ' + l : ' · NEW') };
    }
    if (c.kind === 'passive') { const p = G.PASSIVES[c.id]; return { title: p.name + ' ' + roman(pas(r, c.id) + 1), body: p.desc, tag: 'PARTY' }; }
    return { title: 'Potion', body: 'Heal 40 HP.', tag: 'ITEM' };
  };
  const roman = (n) => ['', 'I', 'II', 'III', 'IV', 'V', 'VI'][n] || String(n);
  G.choose = function (r, i) {
    const p = r.pending; if (!p) return false;
    const c = p.cards[Math.max(0, Math.min(p.cards.length - 1, i))];
    if (c.kind === 'recruit') { addHero(r, c.job); r.owed = Math.max(0, r.owed - 1); }
    else if (c.kind === 'learn' || c.kind === 'skill') { const h = r.party[c.hero]; h.skills[c.skill] = (h.skills[c.skill] || 0) + 1; h.cds[c.skill] = Math.min(h.cds[c.skill] || 0, 0.3); }
    else if (c.kind === 'passive') { r.passive[c.id] = pas(r, c.id) + 1; if (c.id === 'vigor') { r.hpMax += 20; heal(r, 20); } }
    else heal(r, 40);
    r.pending = null; r.choices++;
    r.ev.push({ type: 'chosen', card: c });
    // more level-ups waiting (several gems at once), or a chest
    if (r.queued > 0) { r.queued--; offer(r); }
    return true;
  };
  G.xpNeed = (lv) => Math.round(4 + (lv - 1) * 3.2 + Math.pow(Math.max(0, lv - 8), 1.6) * 1.4);
  function gainXp(r, v) {
    r.xp += v * XPX * (1 + 0.1 * pas(r, 'wisdom'));
    while (r.xp >= G.xpNeed(r.lv)) { r.xp -= G.xpNeed(r.lv); r.lv++; if (G.RECRUIT_AT.includes(r.lv) && r.party.length + r.owed < G.MAX_PARTY) r.owed++; r.ev.push({ type: 'level', lv: r.lv }); if (r.pending) r.queued = (r.queued || 0) + 1; else offer(r); }
  }

  // ---------------- spawning
  function spawnFoe(r, type, opts) {
    const d = G.FOES[type], e = edge(r, r.rnd() * Math.PI * 2, 14 + r.rnd() * 30);
    const scale = (1 + r.t / HPT) * HPX, elite = !!(opts && opts.elite);
    const f = { id: r.uid++, type, x: e.x, y: e.y, hp: d.hp * (d.boss ? HPX : scale) * (elite ? 7 : 1), r: d.r * (elite ? 1.5 : 1), spd: d.spd * (elite ? 0.9 : 1),
      dmg: d.dmg * DPS * (1 + r.t / 400) * (elite ? 1.5 : 1), xp: d.xp, boss: d.boss || 0, elite, kind: d.kind || 'melee', wob: d.wobble ? r.rnd() * 6 : 0, kx: 0, ky: 0, flash: 0, chill: 0, shotT: 2 + r.rnd() * 2, hitT: 0 };
    f.max = f.hp;
    r.foes.push(f);
    if (f.boss) r.ev.push({ type: 'boss', foe: type, name: d.name });
    return f;
  }
  // a point just beyond the edge of the view, in direction a
  function edge(r, a, margin) {
    const hw = r.view.w / 2 + margin, hh = r.view.h / 2 + margin, c = Math.cos(a), s = Math.sin(a);
    const k = Math.min(Math.abs(c) > 1e-6 ? hw / Math.abs(c) : 1e9, Math.abs(s) > 1e-6 ? hh / Math.abs(s) : 1e9);
    return { x: r.x + c * k, y: r.y + s * k };
  }
  G.edge = edge;
  function director(r, dt) {
    const minute = Math.min(G.WAVES.length - 1, Math.floor(r.t / 60)), wave = G.WAVES[minute];
    const target = Math.min(300, (18 + r.t * 0.4) * SPAWNX) * (r.foes.some((f) => f.boss) ? 0.45 : 1);
    const alive = r.foes.length;
    r.spawnT -= dt;
    if (r.spawnT <= 0 && alive < target) {
      r.spawnT = Math.max(0.05, 0.8 - r.t / 600);
      const n = Math.min(6, Math.ceil((target - alive) / 8));
      const keys = Object.keys(wave), tot = keys.reduce((a, k) => a + wave[k], 0);
      for (let i = 0; i < n; i++) { let x = r.rnd() * tot, k = keys[0]; for (const kk of keys) { x -= wave[kk]; if (x <= 0) { k = kk; break; } } spawnFoe(r, k); }
    }
    // a ring of foes closes in now and then
    if (Math.floor((r.t - dt) / 50) !== Math.floor(r.t / 50) && r.t > 40) { const k = Object.keys(wave)[0]; for (let i = 0; i < 16; i++) { const f = spawnFoe(r, k); const a = (i / 16) * Math.PI * 2; f.x = r.x + Math.cos(a) * Math.min(r.view.w * 0.45, 140); f.y = r.y + Math.sin(a) * Math.min(r.view.h * 0.4, 170); } r.ev.push({ type: 'ring' }); }
    // elites every 75 s
    if (Math.floor((r.t - dt) / 75) !== Math.floor(r.t / 75) && r.t > 10) { const keys = Object.keys(wave); spawnFoe(r, keys[keys.length - 1], { elite: true }); r.ev.push({ type: 'elite' }); }
    if (r.bossDone === 0 && r.t >= G.BOSS1_AT) { r.bossDone = 1; spawnFoe(r, 'golem'); }
    if (!r.final && r.t >= G.RUN_TIME) { r.final = spawnFoe(r, 'wyrm'); }
  }

  // ---------------- the step
  G.step = function (r, dt) {
    if (r.over || r.pending) return;
    r.t += dt; r.inv = Math.max(0, r.inv - dt);
    // leader movement
    const m = r.move, ml = Math.hypot(m.x, m.y);
    if (ml > 0.05) { const k = Math.min(1, ml) / ml, sp = G.speed(r); r.x += m.x * k * sp * dt; r.y += m.y * k * sp * dt; r.dir = { x: m.x / ml, y: m.y / ml }; }
    // the marching line: followers walk the leader's path
    const tr = r.trail, last = tr[tr.length - 1];
    if (Math.hypot(r.x - last.x, r.y - last.y) >= 2) { tr.push({ x: r.x, y: r.y }); if (tr.length > 120) tr.shift(); }
    r.party[0].x = r.x; r.party[0].y = r.y;
    for (let i = 1; i < r.party.length; i++) { const p = tr[Math.max(0, tr.length - 1 - Math.round(i * G.SPACING / 2))]; const h = r.party[i]; h.x += (p.x - h.x) * Math.min(1, dt * 12); h.y += (p.y - h.y) * Math.min(1, dt * 12); }
    director(r, dt);
    buildGrid(r);
    // heroes act
    const cm = cdMul(r);
    for (const h of r.party) for (const s in h.skills) {
      const l = h.skills[s]; if (!l || G.SKILLS[s].passive) continue;
      h.cds[s] -= dt;
      if (h.cds[s] <= 0) { const ok = CAST[s](r, h, l); h.cds[s] = ok ? G.SKILLS[s].cd(l) * cm : 0.2; }
      if (r.over) return;
    }
    // passive heal
    let regen = 0; for (const h of r.party) regen += lvOf(r, h, 'chakra') ? 0.6 + 0.5 * lvOf(r, h, 'chakra') : 0;
    if (regen) { r.regenAcc = (r.regenAcc || 0) + regen * dt; if (r.regenAcc >= 1) { const n = Math.floor(r.regenAcc); r.regenAcc -= n; r.hp = Math.min(r.hpMax, r.hp + n); } }
    // hero shots
    for (const s of r.shots) {
      s.life -= dt; s.x += s.vx * dt; s.y += s.vy * dt;
      near(r, s.x, s.y, s.r + 20, (f) => {
        if (s.life <= 0 || s.hit.has(f.id)) return;
        const dx = f.x - s.x, dy = f.y - s.y; if (dx * dx + dy * dy > (f.r + s.r) * (f.r + s.r)) return;
        s.hit.add(f.id);
        const v = Math.hypot(s.vx, s.vy) || 1;
        if (s.kind === 'fire') { s.life = 0; r.ev.push({ type: 'blast', x: s.x, y: s.y, r: s.burst }); inRadius(r, s.x, s.y, s.burst, (o) => damage(r, o, s.dmg, 'fire', s.vx / v * 40, s.vy / v * 40)); return; }
        damage(r, f, s.dmg, s.kind, s.vx / v * 30 * (s.kb || 1), s.vy / v * 30 * (s.kb || 1));
        if (s.chill) f.chill = s.chill;
        if (--s.pierce <= 0) s.life = 0;
      });
    }
    r.shots = r.shots.filter((s) => s.life > 0);
    // lingering areas
    for (const a of r.areas) {
      a.life -= dt; a.t += dt;
      if (a.kind === 'ring') { a.rad = a.max * Math.min(1, a.t / 0.5); inRadius(r, a.x, a.y, a.rad, (o) => { if (a.hit.has(o.id)) return; const d = Math.hypot(o.x - a.x, o.y - a.y); if (d < a.rad - 12) return; a.hit.add(o.id); const k = 90 / (d || 1); damage(r, o, a.dmg, 'quake', (o.x - a.x) * k, (o.y - a.y) * k); }); }
      else if (a.kind === 'rain') { a.tick -= dt; if (a.tick <= 0) { a.tick = 0.33; inRadius(r, a.x, a.y, a.rad, (o) => damage(r, o, a.dmg, 'rain')); r.ev.push({ type: 'rain', x: a.x, y: a.y, r: a.rad }); } }
    }
    r.areas = r.areas.filter((a) => a.life > 0);
    // foes move, separate, touch, shoot
    const px = r.x, py = r.y, far = Math.max(300, Math.hypot(r.view.w, r.view.h) * 0.75), reach2 = far * far;
    for (const f of r.foes) {
      if (f.hp <= 0) continue;
      f.flash = Math.max(0, f.flash - dt); f.chill = Math.max(0, f.chill - dt); f.hitT = Math.max(0, f.hitT - dt);
      // foes hunt the leader; the heroes marching behind shove them aside
      const tx = px, ty = py;
      let dx = tx - f.x, dy = ty - f.y; const d = Math.hypot(dx, dy) || 1;
      if (d * d > reach2) { const p = edge(r, Math.atan2(r.dir.y, r.dir.x) + (r.rnd() - 0.5) * (f.boss ? 0.6 : 3), f.r + 6); f.x = p.x; f.y = p.y; continue; } // left behind: comes back from the edge (bosses from ahead)
      let sp = f.spd * (f.chill ? 0.5 : 1);
      if (f.kind === 'shooter') {
        if (d < 70) sp = -sp * 0.7; else if (d < 95) sp = 0;
        f.shotT -= dt;
        if (f.shotT <= 0 && d < 150) {
          f.shotT = f.boss ? 2.4 : 3 + r.rnd();
          const n = f.boss ? 7 : 1, base = Math.atan2(dy, dx);
          for (let i = 0; i < n; i++) { const an = base + (i - (n - 1) / 2) * 0.22; r.foeShots.push({ x: f.x, y: f.y, vx: Math.cos(an) * (f.boss ? 75 : 62), vy: Math.sin(an) * (f.boss ? 75 : 62), dmg: f.dmg * (f.boss ? 0.6 : 1), life: 3, r: f.boss ? 5 : 3 }); }
          r.ev.push({ type: 'foeShot', x: f.x, y: f.y, boss: f.boss });
        }
      }
      let wx = 0, wy = 0; if (f.wob) { f.wob += dt * 5; wx = Math.cos(f.wob) * 0.6; wy = Math.sin(f.wob * 1.3) * 0.6; }
      f.x += ((dx / d + wx) * sp + f.kx) * dt; f.y += ((dy / d + wy) * sp + f.ky) * dt;
      f.kx *= Math.pow(0.02, dt); f.ky *= Math.pow(0.02, dt);
      // contact
      if ((px - f.x) ** 2 + (py - f.y) ** 2 < (f.r + 5) ** 2) hurt(r, f.dmg, f.x, f.y);
      for (let i = 1; i < r.party.length; i++) { const h = r.party[i], hx = f.x - h.x, hy = f.y - h.y, hd = Math.hypot(hx, hy); if (hd < f.r + 6 && hd > 0) { const k = (f.r + 6 - hd) / hd; f.x += hx * k * (f.boss ? 0.1 : 0.6); f.y += hy * k * (f.boss ? 0.1 : 0.6); } }
      if (r.over) return;
    }
    // separation (cheap): push apart foes sharing space
    for (const f of r.foes) { if (f.hp <= 0) continue; near(r, f.x, f.y, f.r * 2, (o) => { if (o === f || o.hp <= 0) return; const dx = f.x - o.x, dy = f.y - o.y, d2 = dx * dx + dy * dy, rr = f.r + o.r; if (d2 > 0 && d2 < rr * rr) { const d = Math.sqrt(d2), push = (rr - d) * 0.25 / d; f.x += dx * push; f.y += dy * push; } }); }
    r.foes = r.foes.filter((f) => f.hp > 0);
    // foe shots
    for (const s of r.foeShots) {
      s.life -= dt; s.x += s.vx * dt; s.y += s.vy * dt;
      if ((r.x - s.x) ** 2 + (r.y - s.y) ** 2 < (s.r + 5) ** 2) { hurt(r, s.dmg, s.x, s.y); s.life = 0; }
    }
    r.foeShots = r.foeShots.filter((s) => s.life > 0);
    if (r.over) return;
    // pickups: gems fly to the leader once in reach
    const rc = G.reach(r);
    for (const g of r.gems) {
      const dx = r.x - g.x, dy = r.y - g.y, d = Math.hypot(dx, dy);
      if (g.pull || d < rc) { g.pull = true; const sp = 160 + (g.sp = (g.sp || 0) + dt * 400); g.x += dx / (d || 1) * Math.min(d, sp * dt); g.y += dy / (d || 1) * Math.min(d, sp * dt); }
      if (d < 7) { g.got = true; gainXp(r, g.v); r.ev.push({ type: 'gem', v: g.v }); }
    }
    r.gems = r.gems.filter((g) => !g.got);
    if (r.gems.length > 350) { // merge the oldest far-away gems into one big gem
      const old = r.gems.splice(0, 100); const v = old.reduce((a, g) => a + g.v, 0); r.gems.push({ x: old[0].x, y: old[0].y, v, id: r.uid++ });
    }
    for (const it of r.items) {
      const d = Math.hypot(r.x - it.x, r.y - it.y);
      if (d < 12) {
        it.got = true; r.ev.push({ type: 'item', kind: it.kind, x: it.x, y: it.y });
        if (it.kind === 'potion') heal(r, 30);
        else if (it.kind === 'magnet') for (const g of r.gems) g.pull = true;
        else if (it.kind === 'chest') { if (r.pending) r.queued = (r.queued || 0) + 1; else offer(r); }
      }
    }
    r.items = r.items.filter((i) => !i.got);
  };

  G.result = (r) => ({ t: r.t, lv: r.lv, kills: r.kills, won: r.won, reason: r.reason, party: r.party.map((h) => h.job), recruits: r.recruits, dmg: r.stats.dmg });

  if (typeof module !== 'undefined' && module.exports) module.exports = G; else root.RE = G;
})(typeof window !== 'undefined' ? window : globalThis);
