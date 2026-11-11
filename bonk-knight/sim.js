// Bonk Knight balance sim: node bonk-knight/sim.js [who|all] [taps/s] [seeds] [gamefile]
// Drives the real run model from game.js headlessly with a thumb-limited bot: one pointer, a capped tap rate, aim
// noise, a finger that has to travel to sweep loot. Between runs it plays a BUILD: one side of each either/or (excl)
// group, never its rivals, and it favours that build's branch (cost / 4) over other nodes; else cheapest-first with gems
// weighted. It buys the win node when it can. Reports runs-to-win per character per build and run lengths.
// BUILD=flurry,mimicry,owl node bonk-knight/sim.js  -> only that build (default: all four builds below)
const path = require('path');
const G = require(path.resolve(process.argv[5] || path.join(__dirname, 'game.js')));
const WHO = process.argv[2] || 'all', TAPS = +(process.argv[3] || 6), SEEDS = +(process.argv[4] || 3);
const W = 390, H = 800, DT = 1 / 60, SPEED = 1500; // px/s a thumb sweeps at
const noop = () => {};
const sfx = new Proxy({}, { get: () => noop });
const fx = () => ({ shake: 0, burst: noop, text: noop, ring: noop, update: noop, draw: noop });
const costOf = (n, lv) => Math.ceil(n.cost * (n.grow || 1.6) ** lv);
const PW = +(process.env.PW || 2); // how strongly the bot favours its build
const BUILDS = process.env.BUILD ? [process.env.BUILD.split(',')] : [['flurry', 'goldfever', 'broom'], ['eye', 'mimicry', 'owl'], ['flurry', 'mimicry', 'owl'], ['eye', 'goldfever', 'broom']];
const closed = (n, lv, nodes) => !!n.excl && nodes.some((m) => m !== n && m.excl === n.excl && (lv[m.id] || 0) > 0); // mirrors the kit's closedBy
const visible = (n, lv) => !n.req || !n.req.length || n.req.filter((r) => (lv[r] || 0) > 0).length >= (n.reqAll || 1);
let seed = 1;
const rand = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
const gauss = () => (rand() + rand() + rand() - 1.5) * 1.4;
Math.random = rand; // the model uses Math.random: seed it so runs are repeatable

function playRun(who, s, levels, boss, runNo) {
  const run = G.createRun({ who, stats: s, levels, W, H, boss, sfx, fx: fx(), fmt: (n) => String(Math.floor(n)), ui: null, runNo, pick: (h, o, done) => done(0), best: 0 });
  const R = run._R, inp = { x: W / 2, y: H / 2, down: false, taps: [], released: false };
  let tapT = 0, upT = 0, sweepT = 0, mode = 'atk', guard = 0;
  const life = (L) => (L.life || s.life + (L.kind === 'gem' ? 2 : 0)) - L.t;
  const mpos = () => [R.mx ?? run.MX, R.my ?? run.MY];
  while (!run.over && guard++ < 60 * 200) {
    inp.taps = []; inp.released = false;
    tapT -= DT; upT -= DT; sweepT -= DT;
    const loot = R.loot.filter((L) => L.bounced && !L.grab && !L.hazard);
    const M = R.M, [mx, my] = mpos();
    const busy = !M || R.trans > 0 || (M.shield > 0) || (M.phase && M.phased);
    const urgent = loot.some((L) => life(L) < 0.9) || loot.length >= 6 || (busy && loot.length);
    if (mode === 'atk' && urgent && !R.won) { mode = 'sweep'; sweepT = 1.6; }
    if (mode === 'sweep' && (!loot.length || sweepT <= 0)) mode = 'atk';
    // side targets worth a tap
    const side = (R.skulls || []).find((k) => !k.dead) || (R.gob && !R.gob.dead && R.gob) || (R.chest && !R.chest.dead && R.chest) || R.minions.find((m) => !m.dead);
    if (mode === 'sweep' && !side) {
      // drag toward the nearest loot (finger stays down; the model sweeps along the segment)
      let best = null, bd = 1e9; for (const L of loot) { const d = Math.hypot(L.x - inp.x, L.y - inp.y) - (life(L) < 1 ? 120 : 0); if (d < bd) { bd = d; best = L; } }
      if (!inp.down) { inp.down = true; if (best) { inp.x = best.x + 30; inp.y = best.y; } }
      if (best) { const dx = best.x - inp.x, dy = best.y - inp.y, d = Math.hypot(dx, dy) || 1, k = Math.min(1, SPEED * DT / d); inp.x += dx * k; inp.y += dy * k; }
    } else {
      if (mode === 'sweep') mode = 'atk';
      let tx = mx, ty = my;
      if (side) { tx = side.x; ty = side.y; }
      else if (R.eye && R.eye.on) { tx = R.eye.x; ty = R.eye.y; }
      const mage = who === 'battlemage' && !side && M && !busy;
      if (mage) { // hold to charge, release at full
        if (!inp.down) { inp.down = true; inp.x = tx; inp.y = ty; inp.taps.push({ x: tx, y: ty }); }
        else if (R.charge >= 1) { inp.down = false; inp.released = true; }
        else { inp.x = tx; inp.y = ty; }
      } else {
        if (inp.down && upT <= 0) { inp.down = false; inp.released = true; }
        let ready = tapT <= 0;
        if (ready && who === 'bard' && R.beat && !side) { // wait for the beat, with human timing error
          const nb = R.beat.next - R.t + gauss() * 0.035;
          ready = nb < DT || nb > R.beat.dt - 0.02 ? true : false;
          if (!ready && tapT < -0.6) ready = true;
        }
        if (ready && !inp.down && M !== undefined) {
          const x = tx + gauss() * 9, y = ty + gauss() * 9;
          inp.x = x; inp.y = y; inp.down = true; inp.taps.push({ x, y }); upT = 0.05; tapT = 1 / TAPS;
        }
      }
    }
    run.update(DT, inp);
  }
  const res = run.result();
  return { t: run.t, res, floor: R.floor, R };
}

function sim(who, sd, build) {
  seed = sd * 7919 + 13;
  const nodes = G.NODES.filter((n) => !n.who || n.who === who), win = nodes.find((n) => n.win);
  // the build's branch: its chosen excl nodes and everything that needs one of them
  const path = new Set(build); for (let grew = true; grew;) { grew = false; for (const n of nodes) if (!path.has(n.id) && (n.req || []).some((r) => path.has(r))) { path.add(n.id); grew = true; } }
  const banned = (n) => n.excl && !build.includes(n.id);
  const levels = {}, wallet = { coins: 0, gems: 0 }, lens = [], floors = [];
  let runs = 0, wonAt = 0, bossTries = 0, mins = 0;
  while (runs < 120 && !wonAt) {
    runs++;
    const s = G.baseStats(who); for (const n of nodes) if (levels[n.id] && n.fx) n.fx(s, levels[n.id]);
    const boss = !!levels[win.id];
    const r = playRun(who, s, levels, boss, runs);
    lens.push(Math.round(r.t)); floors.push(boss ? 'B' + Math.round(100 - 100 * (r.R.M ? Math.max(0, r.R.M.hp) / r.R.M.max : 0)) + '%' : r.floor);
    mins += (r.t + 8) / 60;
    for (const [k, v] of Object.entries(r.res.earned || {})) wallet[k] = (wallet[k] || 0) + Math.floor(v);
    if (boss) bossTries++;
    if (boss && process.env.DBG) console.log('  boss', who, Math.round(r.t), 'perf', r.R.perfects, 'crits', r.R.crits, 'combo', r.R.bestCombo, 'weak', r.R.weakHits, 'p2', r.R.M && r.R.M.p2, 'burned', r.R.burned, 'smash', r.R.smashes);
    if (r.res.won) { wonAt = runs; break; }
    for (;;) {
      const opts = nodes.filter((n) => visible(n, levels) && !banned(n) && !closed(n, levels, nodes) && (levels[n.id] || 0) < (n.max || 1)).map((n) => ({ n, c: costOf(n, levels[n.id] || 0) }))
        .filter(({ n, c }) => (wallet[n.cur || 'coins'] || 0) >= c && (!n.extra || Object.entries(n.extra).every(([k, v]) => (wallet[k] || 0) >= v)));
      if (!opts.length) break;
      const score = ({ n, c }) => c * (n.cur ? 60 : 1) / (path.has(n.id) ? PW : 1);
      const o = opts.find((x) => x.n.win) || opts.sort((a, b) => score(a) - score(b))[0];
      if (!o.n.win && win && visible(win, levels) && !levels[win.id] && !o.n.cur && wallet.coins > win.cost * 0.5 && wallet.coins - o.c < win.cost) break; // save up for the crypt key
      wallet[o.n.cur || 'coins'] -= o.c; if (o.n.extra) for (const [k, v] of Object.entries(o.n.extra)) wallet[k] -= v;
      levels[o.n.id] = (levels[o.n.id] || 0) + 1;
      if (o.n.win) break;
    }
  }
  return { wonAt, runs, lens, floors, bossTries, mins, levels };
}

const chars = WHO === 'all' ? (G.CHARACTERS || ['berserker', 'battlemage', 'rogue']) : [WHO];
for (const build of BUILDS) for (const who of chars) {
  const out = [];
  for (let k = 1; k <= SEEDS; k++) out.push(sim(who, k, build));
  const o = out[0];
  console.log(`${who.padEnd(10)} [${build.join('/')}] @${TAPS}/s wins at runs: ${out.map((x) => x.wonAt || 'none(' + x.runs + ')').join(', ')}  boss tries: ${out.map((x) => x.bossTries).join(',')}  minutes: ${out.map((x) => x.mins.toFixed(0)).join(',')}`);
  console.log(`   seed1 run secs: ${o.lens.join(' ')}`);
  console.log(`   seed1 floors:   ${o.floors.join(' ')}`);
  if (process.env.V) console.log('   levels', JSON.stringify(o.levels));
}
