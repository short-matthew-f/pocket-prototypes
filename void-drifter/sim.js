// Void Drifter balance sim: node void-drifter/sim.js [who|all] [runsCap] [-v] [--file=path/to/game.js]
// Drives the real createRun() model headlessly with a thumb-like bot: a virtual stick that re-aims ~5x/s, dodges what
// is close, drifts toward salvage, kites the Leviathan, takes sensible level-up picks, and buys cheapest-first between
// runs (win node as soon as it can). Reports runs-to-win, minutes and run lengths per character.
// --file loads another build (e.g. the pre-buildout copy) in a sandbox with a stub Kit, for before/after numbers.
const args = process.argv.slice(2), V = args.includes('-v');
const pos = args.filter((a) => a[0] !== '-');
const fileArg = (args.find((a) => a.startsWith('--file=')) || '').slice(7);
const seedArg = +((args.find((a) => a.startsWith('--seed=')) || '').slice(7) || 12345);
const whoArg = pos[0] || 'all', CAP = +(pos[1] || 150), W = 390, H = 740, DT = 1 / 30;
let seed = seedArg; Math.random = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648); // before load: the game captures Math.random

let G;
if (fileArg) { // old builds have no module export: run them in a sandbox and catch the Kit.game config
  const fs = require('fs'), vm = require('vm'); let cfg;
  const el = { insertAdjacentHTML() {}, dataset: {} };
  const ctx = { Kit: { game: (c) => { cfg = c; } }, Math, console, setTimeout: () => 0, document: { head: el, body: el } };
  ctx.window = ctx; vm.createContext(ctx); vm.runInContext(fs.readFileSync(fileArg, 'utf8'), ctx);
  G = { NODES: cfg.nodes, CONFIG: cfg, createRun: cfg.createRun, baseStats: cfg.baseStats };
} else G = require('./game.js');
const { NODES, CONFIG, createRun, baseStats } = G;

const noop = () => {};
const sfx = new Proxy({}, { get: () => noop });
const mkfx = () => ({ shake: 0, burst: noop, text: noop, ring: noop, update: noop, draw: noop });
const ui = { innerHTML: '', querySelectorAll: () => [], appendChild: noop, querySelector: () => null };
const costOf = (n, lv) => Math.ceil(n.cost * (n.grow || 1.6) ** lv);
const visible = (n, lv) => !n.req || !n.req.length || n.req.filter((r) => (lv[r] || 0) > 0).length >= (n.reqAll || 1);

// level-up taste: new weapons and evolutions first, then the main gun, then raw stats; repair when hurting
const PREF = ['evo', 'blades', 'missiles', 'nova', 'beam', 'wing', 'main', 'spread', 'dmg', 'rate', 'crit', 'speed', 'mag', 'repair'];
function choose(opts, R) {
  const score = (o) => {
    const id = o.id || '';
    if (id === 'repair' && R.hp < R.s.hull * 0.5) return -1;
    const i = PREF.findIndex((p) => id.startsWith(p)); return i < 0 ? 50 : i;
  };
  let best = 0; opts.forEach((o, i) => { if (score(o) < score(opts[best])) best = i; });
  return Math.random() < 0.2 ? Math.floor(Math.random() * opts.length) : best; // humans misread a card now and then
}

function playRun(who, levels, boss, runNo, best) {
  const nodes = NODES.filter((n) => !n.who || n.who === who);
  const s = baseStats(who); for (const n of nodes) { const l = levels[n.id] || 0; if (l && n.fx) n.fx(s, l); }
  let run = null, picks = 0;
  const env = { who, stats: s, levels, W, H, boss, sfx, fx: mkfx(), fmt: (n) => String(Math.floor(n)), ui, runNo, best,
    pick: (h, opts, done) => { picks++; done(choose(opts, run.R)); } };
  run = createRun(env);
  const R = run.R, inp = { x: W / 2, y: H * 0.75, down: true, taps: [{ x: W / 2, y: H * 0.75 }], released: false };
  let aim = { x: 0, y: -1 }, lagT = 0, orbit = Math.random() < 0.5 ? 1 : -1;
  for (let i = 0; !run.over && i < 30 * 200; i++) {
    if (R.paused && R.choice) { if (R.armT <= 0) run.pick(choose(R.choice, R)); run.update(DT, inp); continue; } // old in-house pick panel
    const sh = R.ship;
    lagT -= DT;
    if (lagT <= 0) { // the thumb re-aims a few times a second
      lagT = 0.3 + Math.random() * 0.15; // human-ish reaction time
      let vx = 0, vy = 0, threat = 0;
      const B = R.boss && R.boss.hp > 0 ? R.boss : null;
      const foes = R.enemies.concat(B ? B.segs : []).map((e) => [e, Math.hypot(e.x - sh.x, e.y - sh.y)]).sort((a, b) => a[1] - b[1]).slice(0, 4).map((p) => p[0]); // only notices the few closest things
      for (const e of foes) {
        const dx = sh.x - e.x, dy = sh.y - e.y, d = Math.hypot(dx, dy) || 1, near = e.seg ? 200 : e.k === 'rock' || e.k === 'crystal' ? 85 : 140;
        if (d < near + e.r) { const w = ((near + e.r - d) / near) ** 2 * (e.k === 'rock' ? 1 : 1.6); vx += dx / d * w; vy += dy / d * w; threat += w; }
      }
      for (const b of R.ebullets) { const dx = sh.x - b.x, dy = sh.y - b.y, d = Math.hypot(dx, dy) || 1; if (d < 90) { const w = ((90 - d) / 90) ** 2 * 1.5; vx += dx / d * w; vy += dy / d * w; threat += w; } }
      if (R.hazards) for (const z of R.hazards) { const dx = sh.x - z.x, dy = sh.y - z.y, d = Math.hypot(dx, dy) || 1; if (d < (z.r || 100) * 1.6) { const w = 1.2; vx += dx / d * w; vy += dy / d * w; threat += w; } }
      if (B) { const h = B.segs[0], dx = sh.x - h.x, dy = sh.y - h.y, d = Math.hypot(dx, dy) || 1; vx += -dy / d * orbit * 0.8; vy += dx / d * orbit * 0.8; if (d > 280) { vx -= dx / d; vy -= dy / d; } }
      let ob = null, od = 260; for (const o of R.orbs) { const d = Math.hypot(o.x - sh.x, o.y - sh.y); if (d < od && (!o.shard || true)) { od = d; ob = o; } }
      if (R.s.weapon === 'flail' && threat < 0.5 && R.hp > R.s.hull * 0.5) { // the wrecker swings into things on purpose: keep the nearest foe at chain length
        let fe = null, fd = 320; for (const e of R.enemies) { const d = Math.hypot(e.x - sh.x, e.y - sh.y); if (d < fd && e.k !== 'wreck' || (d < fd && e.k === 'wreck')) { fd = d; fe = e; } }
        if (fe && fd > R.s.chain * 1.1) { vx += (fe.x - sh.x) / fd * 0.5; vy += (fe.y - sh.y) / fd * 0.5; }
      }
      if (ob && threat < 1.2) { vx += (ob.x - sh.x) / od * 0.7; vy += (ob.y - sh.y) / od * 0.7; }
      if (Math.hypot(vx, vy) < 0.15) { const a = Math.atan2(aim.y, aim.x) + orbit * 0.5; vx += Math.cos(a) * 0.3; vy += Math.sin(a) * 0.3; } // keep drifting, don't sit still
      const n = Math.hypot(vx, vy) || 1, jit = (Math.random() - 0.5) * 0.5, a = Math.atan2(vy / n, vx / n) + jit;
      aim = { x: Math.cos(a), y: Math.sin(a) };
      if (run.blink && R.blinkT <= 0 && threat > 1.6 && Math.random() < 0.6) run.blink(); // presses the blink button when boxed in
    }
    const an = R.anchor || { x: W / 2, y: H * 0.75 };
    inp.x = an.x + aim.x * 55; inp.y = an.y + aim.y * 55;
    run.update(DT, inp);
    inp.taps = [];
  }
  return { res: run.result(), t: run.t, picks, R };
}

function campaign(who) {
  const nodes = NODES.filter((n) => !n.who || n.who === who), levels = {}, wallet = {};
  const lens = [], log = []; let wonAt = 0, mins = 0, best = 0, bossTries = 0;
  const cur0 = CONFIG.currencies[0].id;
  for (let run = 1; run <= CAP && !wonAt; run++) {
    const win = nodes.find((n) => n.win), boss = !!levels[win.id];
    const { res, t, picks } = playRun(who, levels, boss, run, best);
    if (res.score != null) best = Math.max(best, res.score);
    for (const [k, v] of Object.entries(res.earned || {})) wallet[k] = (wallet[k] || 0) + Math.floor(v);
    lens.push(Math.round(t)); mins += (t + 8) / 60; if (boss) bossTries++;
    if (V) log.push(`#${run}${boss ? ' BOSS' : ''} ${t.toFixed(0)}s picks ${picks} ${Object.entries(res.earned).map(([k, v]) => `+${Math.floor(v)} ${k}`).join(' ')} ${res.won ? 'WON' : ''} | ${(res.lines || []).join(' | ')}`);
    if (res.won) { wonAt = run; break; }
    if (boss) levels[win.id] = 1; // lost the boss: the lure stays bought
    for (let guard = 0; guard < 300; guard++) {
      const opts = nodes.filter((n) => visible(n, levels) && (levels[n.id] || 0) < (n.max || 1))
        .map((n) => ({ n, c: costOf(n, levels[n.id] || 0) }))
        .filter(({ n, c }) => (wallet[n.cur || cur0] || 0) >= c && (!n.extra || Object.entries(n.extra).every(([k, v]) => (wallet[k] || 0) >= v)));
      if (!opts.length) break;
      const o = opts.find((x) => x.n.win) || opts.sort((a, b) => a.c / (a.n.cur ? 25 : 1) - b.c / (b.n.cur ? 25 : 1))[0];
      wallet[o.n.cur || cur0] -= o.c; if (o.n.extra) for (const [k, v] of Object.entries(o.n.extra)) wallet[k] -= v;
      levels[o.n.id] = (levels[o.n.id] || 0) + 1;
      if (V) log.push(`   buy ${o.n.id} -> ${levels[o.n.id]}`);
    }
  }
  if (V) console.log(log.join('\n'));
  const q = (a) => a.filter((_, i) => i % Math.max(1, Math.floor(a.length / 12)) === 0).join(' ');
  console.log(`${who.padEnd(8)} ${wonAt ? 'WON at run ' + wonAt : 'not won in ' + CAP} · ${mins.toFixed(1)} min · boss tries ${bossTries} · max ${Math.max(...lens)}s · run secs: ${q(lens)}`);
}
for (const c of CONFIG.characters) if (whoArg === 'all' || whoArg === c.id) campaign(c.id);
