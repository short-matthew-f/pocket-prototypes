// Cog & Marble balance sim: node cog-marble/sim.js [who|all] [runsCap] [-v]
// Drives the real createRun() model headlessly with a simple builder bot: fills the pads that see the most track first,
// rotates tower types, upgrades when it can't build, HOLDs while marbles queue near the vault, and on the Sorting Office
// flips the switch like an attentive player (steel left, everything else right). Leaves the gears at their defaults.
// Buys a build between runs (each `excl` path is tested).
const { NODES, CONFIG, createRun, baseStats } = require('./game.js');
const args = process.argv.slice(2), V = args.includes('-v');
const pos = args.filter((a) => a[0] !== '-');
const whoArg = pos[0] || 'all', CAP = +(pos[1] || 60), W = 390, H = 790, DT = 1 / 30;
const noop = () => {};
const sfx = new Proxy({}, { get: () => noop });
const mkfx = () => ({ shake: 0, burst: noop, text: noop, ring: noop, update: noop, draw: noop });
const costOf = (n, lv) => Math.ceil(n.cost * (n.grow || 1.6) ** lv);
const visible = (n, lv) => !n.req || !n.req.length || n.req.filter((r) => (lv[r] || 0) > 0).length >= (n.reqAll || 1);
const GROUPS = {}; for (const n of NODES) if (n.excl) (GROUPS[n.excl] ||= []).push(n.id);
const combos = Object.entries(GROUPS).reduce((acc, [g, ids]) => acc.flatMap((c) => ids.map((id) => ({ ...c, [g]: id }))), [{}]);
for (const who of CONFIG.characters.map((c) => c.id)) for (const c of combos) {
  const closed = new Set(Object.entries(GROUPS).flatMap(([g, ids]) => ids.filter((id) => id !== c[g]))), lv = {};
  const nodes = NODES.filter((n) => (!n.who || n.who === who) && !closed.has(n.id));
  for (let grew = true; grew;) { grew = false; for (const n of nodes) if (!lv[n.id] && visible(n, lv)) { lv[n.id] = 1; grew = true; } }
  if (!lv[NODES.find((n) => n.win).id]) { console.error(`UNREACHABLE win for ${who} with ${JSON.stringify(c)}`); process.exit(1); }
}
let seed = 12345; Math.random = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);

function playRun(who, levels, boss, runNo) {
  const s = baseStats(who); for (const n of NODES) { const l = levels[n.id] || 0; if (l && n.fx) n.fx(s, l); }
  const env = { who, stats: s, levels, W, H, boss, sfx, fx: mkfx(), fmt: String, ui: null, runNo, best: 0, sprite: () => false, art: () => null,
    pick: (h, opts, done) => done(Math.floor(Math.random() * opts.length)) };
  const run = createRun(env), R = run.R;
  const types = ['pin', 'pin', 'hammer', 'magnet', 'pin', 'hammer', 'pin', 'magnet'].filter((t) => t === 'pin' || s[t]);
  let built = 0, holdT = 0, G = null;
  const inp = { x: 0, y: 0, down: false, taps: [], released: false };
  for (let i = 0; !run.over && i < 30 * 3000; i++) {
    if (R.G !== G) { G = R.G; built = 0; }
    for (let guard = 0; guard < 6; guard++) { // spend
      const want = types[built % types.length], pad = G.pads.find((p) => !R.towers[p.id]);
      if (pad && built < 4 + R.wave && R.brass >= run.buildCost(want)) { run.act.build(pad.id, want); built++; continue; }
      const up = Object.keys(R.towers).filter((id) => R.towers[id].lvl < 2).sort((a, b) => run.upCost(R.towers[a]) - run.upCost(R.towers[b]))[0];
      if (up && R.brass >= run.upCost(R.towers[up]) + 20) { run.act.upgrade(up); continue; }
      if (pad && R.brass >= run.buildCost(want)) { run.act.build(pad.id, want); built++; continue; }
      break;
    }
    if (R.state === 'build') run.act.send();
    const sw = G.N.S1;
    if (sw && R.G.N.F) { // sorting: look at the next marble coming down to the switch
      const inE = G.N.in.outs[0], next = R.marbles.filter((m) => m.st === 'track' && m.e === inE).sort((a, b) => b.s - a.s)[0];
      if (next) run.act.flip('S1', next.T.steel ? 0 : 1);
    }
    const V0 = G.N.V, danger = R.marbles.some((m) => { const p = run.marblePos(m); return p[1] > V0.y - 160; });
    if (danger && R.steam > R.steamMax * 0.5) holdT = 1.2; holdT -= DT;
    run.act.hold(holdT > 0);
    run.update(DT, inp);
  }
  return { res: run.result(), t: run.t, R };
}

function campaign(who, path) {
  const closed = new Set(Object.entries(GROUPS).flatMap(([g, ids]) => ids.filter((id) => id !== path[g])));
  const nodes = NODES.filter((n) => (!n.who || n.who === who) && !closed.has(n.id)), levels = {}, wallet = {};
  const want = new Set(Object.values(path));
  const lens = [], waves = []; let wonAt = 0, mins = 0, firstBoss = 0, bossTries = 0; const log = [];
  for (let run = 1; run <= CAP && !wonAt; run++) {
    const win = nodes.find((n) => n.win), boss = !!levels[win.id];
    if (boss) { bossTries++; firstBoss ||= run; }
    const { res, t, R } = playRun(who, levels, boss, run);
    for (const [k, v] of Object.entries(res.earned || {})) wallet[k] = (wallet[k] || 0) + Math.floor(v);
    lens.push(Math.round(t)); waves.push(res.score); mins += (t + 8) / 60;
    if (V) log.push(`#${run}${boss ? ' BOSS' : ''} ${t.toFixed(0)}s waves ${res.score} lives ${R.lives} lives/board ${R.stageLives.join(',')} sorted ${R.sortAll} clogs ${R.clogs}${R.bossLeftHp ? ' bossHP ' + R.bossLeftHp : ''} +${res.earned.cogs} cogs ${res.won ? 'WON' : ''} | ${res.lines.join(' | ')}`);
    if (res.won) { wonAt = run; break; }
    for (let guard = 0; guard < 100; guard++) {
      const opts = nodes.filter((n) => visible(n, levels) && (levels[n.id] || 0) < (n.max || 1)).map((n) => ({ n, c: costOf(n, levels[n.id] || 0) })).filter(({ c }) => (wallet.cogs || 0) >= c);
      if (!opts.length) break;
      const val = (x) => x.c / (want.has(x.n.id) ? 3 : 1);
      const o = opts.find((x) => x.n.win) || opts.sort((a, b) => val(a) - val(b))[0];
      wallet.cogs -= o.c; levels[o.n.id] = (levels[o.n.id] || 0) + 1;
      if (V) log.push(`   buy ${o.n.id} -> ${levels[o.n.id]}`);
    }
  }
  if (V) console.log(log.join('\n'));
  console.log(`${who.padEnd(6)} ${Object.values(path).join('+').padEnd(20)} ${wonAt ? 'WON at run ' + wonAt : 'not won in ' + CAP} · ${mins.toFixed(0)} min · boss from run ${firstBoss}, ${bossTries} tries · waves: ${waves.join(' ')} · secs: ${lens.slice(0, 8).join(' ')}`);
}
for (const c of CONFIG.characters) if (whoArg === 'all' || whoArg === c.id) combos.forEach((p) => campaign(c.id, p));
