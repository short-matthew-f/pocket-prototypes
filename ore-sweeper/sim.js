// Ore Sweeper balance sim: plays the real game model (game.js exports) headlessly with a bot that aims like a thumb.
// The bot steers the drill toward the nearest worthwhile ore at a capped drag speed, with a reaction delay and aim
// wobble, swipes back and forth over hard rock, avoids gas, dodges most cave-ins, grabs oil flasks when low, throws
// dynamite into crowds and, in the boss run, goes for magma stones, then veins, then the Heart.
// Between runs it buys the cheapest affordable upgrade (the win node first once it can), like a new player would.
// Usage: node ore-sweeper/sim.js [trials=12] [--legacy path/to/old-game.js] [--speed 550] [--verbose]
const path = require('path');
const args = process.argv.slice(2);
const flag = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const TRIALS = +(args.find((a) => /^\d+$/.test(a)) || 12), SPEED = +flag('--speed', 550), VERBOSE = args.includes('--verbose');
const legacy = flag('--legacy', null);

// seeded Math.random so trials are repeatable
let seed = 1; Math.random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };

let cfg;
if (legacy) { global.window = global; global.Kit = { game: (c) => { cfg = c; } }; require(path.resolve(legacy)); }
else cfg = require('./game.js').CONFIG;

const noop = () => {};
const sfx = new Proxy({}, { get: () => noop });
const mkfx = () => ({ shake: 0, burst: noop, text: noop, ring: noop, update: noop, draw: noop });
const W = 390, H = 744, DT = 1 / 30; // 390x800 phone minus the safe area

function bot(R, st, s, p, b, dt) {
  // b: bot memory {tx, ty, target, react, wob, side}
  const nodes = st.nodes, x = p.x, y = p.y, caves = st.caves || [], flasks = st.flasks || [];
  b.react -= dt;
  const lost = !b.target || b.target.dead || b.target.got;
  if (lost && b.react > 0.15) b.react = 0.15; // notices the crack, takes a moment to pick the next one
  if (b.react <= 0 || (lost && b.react <= 0)) {
    b.react = 0.22;
    const oilLow = st.oil < s.oil * 0.5;
    let best = null, bs = 1e9;
    const consider = (o, w) => { const d = Math.hypot(o.x - x, o.y - y) * w; if (d < bs) { bs = d; best = o; } };
    for (const n of nodes) {
      if (n.dead || n.kind === 'gas') continue;
      if (caves.some((c) => !c.fell && Math.hypot(c.x - n.x, c.y - n.y) < c.r)) continue;
      let w = 1;
      if (n.kind === 'sentinel') w = 0.3; else if (n.kind === 'vein') w = 0.6; else if (n.kind === 'mother') w = 0.5; else if (n.kind === 'granite') w = 1.6;
      consider(n, w);
    }
    for (const f of flasks) consider(f, oilLow ? 0.35 : 0.8);
    if (st.heart) { const h = st.heart, shield = h.phase === 1 && h.veins.some((v) => !v.dead); consider(h, shield ? 4 : 0.8); }
    if (best !== b.target) b.side = 1;
    b.target = best; b.wob = [(Math.random() - 0.5) * 18, (Math.random() - 0.5) * 18];
  }
  let tx = x, ty = y;
  const t = b.target;
  if (t) {
    tx = t.x + b.wob[0]; ty = t.y + b.wob[1];
    if (t.kind === 'granite') { // swipe across it: aim past one side, then the other
      const off = s.radius + t.r + 14; tx = t.x + b.side * off;
      if (Math.abs(x - tx) < 12) b.side = -b.side;
    }
    if (t === st.heart) { tx = t.x + Math.sin(st.t * 2) * t.r * 0.3; ty = t.y; }
  }
  // dodge a cave-in shadow it is standing in (most of the time)
  for (const c of caves) if (!c.fell && Math.hypot(c.x - x, c.y - y) < c.r + 6) { if (c.seen == null) c.seen = Math.random() < 0.75; if (c.seen) { const a = Math.atan2(y - c.y, x - c.x); tx = c.x + Math.cos(a) * (c.r + 40); ty = c.y + Math.sin(a) * (c.r + 40); } }
  const d = Math.hypot(tx - x, ty - y), v = SPEED * dt;
  if (d > 1) { p.x += (tx - x) / d * Math.min(v, d); p.y += (ty - y) / d * Math.min(v, d); }
  p.x = Math.max(0, Math.min(W, p.x)); p.y = Math.max(60, Math.min(H, p.y));
  // dynamite into a crowd (or the Heart)
  if (st.sticks > 0 && st.t > 1.5) {
    const near = nodes.filter((n) => !n.dead && n.kind !== 'gas' && Math.hypot(n.x - p.x, n.y - p.y) < s.dynaR).length;
    const heartNear = st.heart && Math.hypot(st.heart.x - p.x, st.heart.y - p.y) < s.dynaR && !(st.heart.phase === 1 && st.heart.veins.some((v2) => !v2.dead));
    if (near >= 5 || heartNear) R.dynamite();
  }
}

function playChar(ch) {
  const C = { levels: {}, wallet: {}, runs: 0 }; let won = false, secs = 0; const lens = [], depths = [], log = [], earn = [];
  const nodes = cfg.nodes.filter((n) => !n.who || n.who === ch.id);
  const vis = (n) => !n.req || !n.req.length || n.req.filter((r) => C.levels[r]).length >= (n.reqAll || 1);
  const cost = (n) => Math.ceil(n.cost * (n.grow || 1.6) ** (C.levels[n.id] || 0));
  const win = nodes.find((n) => n.win);
  let bossRuns = 0, heartAt = 0;
  while (!won && C.runs < 150) {
    const s = cfg.baseStats(ch.id); for (const n of nodes) if (C.levels[n.id] && n.fx) n.fx(s, C.levels[n.id]);
    const boss = !!C.levels[win.id];
    const R = cfg.createRun({ who: ch.id, stats: s, levels: C.levels, W, H, boss, sfx, fx: mkfx(), fmt: String, ui: null, runNo: C.runs + 1, pick: (h, o, d) => d(0), best: 0 });
    const p = { x: W / 2, y: H * 0.6, down: true, taps: [] }, b = { react: 0, side: 1, wob: [0, 0] };
    let guard = 0;
    while (!R.over && guard++ < 30 * 200) { if (R.state && R.state.nodes) bot(R, R.state, s, p, b, DT); R.update(DT, p); }
    const res = R.result(); lens.push(Math.round(R.t)); depths.push(res.score || 0); earn.push(Math.floor(res.earned.ore) + (res.earned.gems ? '/' + res.earned.gems : ''));
    if (boss) { bossRuns++; if (VERBOSE) log.push(`boss run ${C.runs + 1}: ${res.won ? 'WON' : res.lines[0]} in ${Math.round(R.t)}s · dps ${s.dps.toFixed(0)} r ${s.radius} oil ${s.oil} carts ${s.helpers}x${s.helperDps.toFixed(0)} splash ${s.splash} · levels ${JSON.stringify(C.levels)}`); }
    for (const [k, v] of Object.entries(res.earned)) C.wallet[k] = (C.wallet[k] || 0) + Math.floor(v);
    C.runs++; secs += R.t + 1.5;
    if (res.won) { won = true; break; }
    for (let g = 0; g < 300; g++) {
      const can = (n) => (C.wallet[n.cur || cfg.currencies[0].id] || 0) >= cost(n) && (!n.extra || Object.entries(n.extra).every(([k, v]) => (C.wallet[k] || 0) >= v));
      const open = nodes.filter((n) => vis(n) && (C.levels[n.id] || 0) < (n.max || 1));
      if (open.includes(win) && !can(win)) { // save up for the Heart once it shows, but keep buying gem nodes (separate currency)
        const o = open.filter((n) => n.cur && n.cur !== cfg.currencies[0].id && !win.extra?.[n.cur] && can(n)).sort((a, z) => cost(a) - cost(z))[0];
        if (!o) break; C.wallet[o.cur] -= cost(o); C.levels[o.id] = (C.levels[o.id] || 0) + 1; continue;
      }
      const o = open.sort((a, z) => (z.win ? 1 : 0) - (a.win ? 1 : 0) || cost(a) - cost(z)).find(can);
      if (!o) break;
      C.wallet[o.cur || cfg.currencies[0].id] -= cost(o); if (o.extra) for (const [k, v] of Object.entries(o.extra)) C.wallet[k] -= v;
      C.levels[o.id] = (C.levels[o.id] || 0) + 1; if (o.win) heartAt = C.runs;
    }
  }
  return { won, runs: C.runs, mins: secs / 60, lens, depths, bossRuns, heartAt, log, earn };
}

const med = (a) => { const b = a.slice().sort((x, y) => x - y); return b[Math.floor(b.length / 2)]; };
console.log(`${legacy ? 'LEGACY ' + legacy : 'ore-sweeper/game.js'} · ${TRIALS} trials · drag speed ${SPEED}px/s`);
for (const ch of cfg.characters) {
  const out = []; for (let i = 0; i < TRIALS; i++) { seed = 1000 + i * 7919; out.push(playChar(ch)); }
  const runs = out.map((o) => (o.won ? o.runs : 999)), r0 = out[0];
  const allLens = out.flatMap((o) => o.lens);
  console.log(`${ch.id.padEnd(6)} runs-to-win median ${med(runs)} (min ${Math.min(...runs)}, max ${Math.max(...runs)}), won ${out.filter((o) => o.won).length}/${TRIALS}` +
    ` · ~${med(out.map((o) => o.mins)).toFixed(1)} min · heart bought run ${med(out.map((o) => o.heartAt))}, boss tries ${med(out.map((o) => o.bossRuns))} · longest run ${Math.max(...allLens)}s`);
  console.log(`       trial 1 run secs: ${r0.lens.join(' ')}`);
  console.log(`       trial 1 depth m : ${r0.depths.join(' ')}`);
  if (VERBOSE) console.log(`       trial 1 ore/gems: ${r0.earn.join(' ')}`);
  if (VERBOSE) for (const o of out) for (const l of o.log) console.log('       ' + l);
}
