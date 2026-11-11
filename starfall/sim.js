// Starfall balance sim: node starfall/sim.js [who|all] [runsCap] [-v]
// Drives the real createRun() model headlessly with a thumb-like bot (holds and tracks the top gate, taps now and
// then, reacts with lag; pours into the repair bin when the shield is low, saves plasma for jackpot gates), buys a build
// between runs (each `excl` path is tested: one campaign per character x path), and reports runs-to-win and run lengths.
const { NODES, CONFIG, createRun, baseStats } = require('./game.js');
const args = process.argv.slice(2), V = args.includes('-v');
const pos = args.filter((a) => a[0] !== '-');
const whoArg = pos[0] || 'all', CAP = +(pos[1] || 150), W = 390, H = 740, DT = 1 / 30;
const noop = () => {};
const sfx = new Proxy({}, { get: () => noop });
const mkfx = () => ({ shake: 0, burst: noop, text: noop, ring: noop, update: noop, draw: noop });
const costOf = (n, lv) => Math.ceil(n.cost * (n.grow || 1.6) ** lv);
const visible = (n, lv) => !n.req || !n.req.length || n.req.filter((r) => (lv[r] || 0) > 0).length >= (n.reqAll || 1);
const GROUPS = {}; for (const n of NODES) if (n.excl) (GROUPS[n.excl] ||= []).push(n.id);
// every combination of either/or choices: [{group: chosenId}]
const combos = Object.entries(GROUPS).reduce((acc, [g, ids]) => acc.flatMap((c) => ids.map((id) => ({ ...c, [g]: id }))), [{}]);
// reachability: with the unchosen sides closed, can every character still reach the win node?
for (const who of CONFIG.characters.map((c) => c.id)) for (const c of combos) {
  const closed = new Set(Object.entries(GROUPS).flatMap(([g, ids]) => ids.filter((id) => id !== c[g]))), lv = {};
  const nodes = NODES.filter((n) => (!n.who || n.who === who) && !closed.has(n.id));
  for (let grew = true; grew;) { grew = false; for (const n of nodes) if (!lv[n.id] && visible(n, lv)) { lv[n.id] = 1; grew = true; } }
  if (!lv[NODES.find((n) => n.win).id]) { console.error(`UNREACHABLE win for ${who} with ${JSON.stringify(c)}`); process.exit(1); }
}
let seed = 12345; Math.random = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);

function playRun(who, levels, boss, runNo, best) {
  const nodes = NODES.filter((n) => !n.who || n.who === who);
  const s = baseStats(who); for (const n of nodes) { const l = levels[n.id] || 0; if (l && n.fx) n.fx(s, l); }
  let picks = 0;
  const env = { who, stats: s, levels, W, H, boss, sfx, fx: mkfx(), fmt: (n) => String(Math.floor(n)), ui: null, runNo, best,
    pick: (h, opts, done) => { picks++; done(Math.floor(Math.random() * opts.length)); } };
  const run = createRun(env);
  const inp = { x: W / 2, y: H * 0.7, down: true, taps: [], released: false };
  let tapT = 1, aimX = W / 2, lagT = 0, lastRx = W / 2;
  for (let i = 0; !run.over && i < 30 * 400; i++) {
    const R = run.R, g = (R.gates && R.gates.find((x) => !(x.jam > 0)) || R.gates[0]);
    const fix = R.bin && R.shield <= R.shMax * 0.4; // decision 1: defend (repair bin) or attack (gate)
    lagT -= DT; if (lagT <= 0) { // thumb re-aims 4x/s; weaver: lead the sweeping reactor with the gate
      lagT = 0.25;
      aimX = (s.auto ? R.rx + (R.rx - lastRx) * 4 : R.jack ? R.jack.x : fix ? R.bin.x : g ? g.x : W / 2) + (Math.random() - 0.5) * 30;
      lastRx = R.rx;
    }
    inp.x += (aimX - inp.x) * Math.min(1, DT * 8);
    inp.down = s.auto || !(R.jackTell > 0); // decision 2: let go during the jackpot tell to save the tank
    inp.taps = []; tapT -= DT;
    if (tapT <= 0 || (R.jack && R.charge >= s.burst && tapT < 0.8)) { tapT = 1.2 + Math.random(); inp.taps.push({ x: inp.x, y: inp.y }); }
    run.update(DT, inp);
  }
  const B = run.R.boss; return { res: run.result(), t: run.t, picks, bossInfo: B ? ` [boss phase ${B.phase} hp ${(B.hp / B.max * 100).toFixed(0)}%]` : '' };
}

function campaign(who, path) {
  const closed = new Set(Object.entries(GROUPS).flatMap(([g, ids]) => ids.filter((id) => id !== path[g])));
  const nodes = NODES.filter((n) => (!n.who || n.who === who) && !closed.has(n.id)), levels = {}, wallet = {};
  // the build: the chosen excl nodes and everything below them get priority (a player committing to a path)
  const want = new Set(Object.values(path)); for (let grew = true; grew;) { grew = false; for (const n of nodes) if (!want.has(n.id) && n.req.some((r) => want.has(r)) && !n.win) { want.add(n.id); grew = true; } }
  const lens = [], log = []; let wonAt = 0, mins = 0, best = 0, bossTries = 0, firstBoss = 0;
  for (let run = 1; run <= CAP && !wonAt; run++) {
    const win = nodes.find((n) => n.win), boss = !!levels[win.id];
    if (boss) { bossTries++; if (!firstBoss && V) log.push("LEVELS " + JSON.stringify(levels)); firstBoss ||= run; }
    const { res, t, bossInfo } = playRun(who, levels, boss, run, best);
    if (res.score != null) best = Math.max(best, res.score);
    for (const [k, v] of Object.entries(res.earned || {})) wallet[k] = (wallet[k] || 0) + Math.floor(v);
    lens.push(Math.round(t)); mins += (t + 6) / 60;
    if (V) log.push(`#${run}${boss ? ' BOSS' : ''} ${t.toFixed(0)}s ${Object.entries(res.earned).map(([k, v]) => `+${Math.floor(v)} ${k}`).join(' ')} ${res.won ? 'WON' : ''}${bossInfo} | ${(res.lines || []).join(' | ')}`);
    if (res.won) { wonAt = run; break; }
    if (boss) levels[win.id] = 1; // lost boss: still summoned
    for (let guard = 0; guard < 300; guard++) {
      const opts = nodes.filter((n) => visible(n, levels) && (levels[n.id] || 0) < (n.max || 1))
        .map((n) => ({ n, c: costOf(n, levels[n.id] || 0) }))
        .filter(({ n, c }) => (wallet[n.cur || 'credits'] || 0) >= c && (!n.extra || Object.entries(n.extra).every(([k, v]) => (wallet[k] || 0) >= v)));
      if (!opts.length) break;
      // win node first; otherwise cheapest relative to the wallet of its currency (cores nodes compete on their own)
      const val = (x) => x.c / (x.n.cur ? 25 : 1) / (want.has(x.n.id) ? 3 : 1);
      const o = opts.find((x) => x.n.win) || opts.sort((a, b) => val(a) - val(b))[0];
      wallet[o.n.cur || 'credits'] -= o.c; if (o.n.extra) for (const [k, v] of Object.entries(o.n.extra)) wallet[k] -= v;
      levels[o.n.id] = (levels[o.n.id] || 0) + 1;
      if (V) log.push(`   buy ${o.n.id} -> ${levels[o.n.id]}`);
    }
  }
  if (V) console.log(log.join('\n'));
  const q = (a) => a.filter((_, i) => i % Math.max(1, Math.floor(a.length / 12)) === 0).join(' ');
  console.log(`${who.padEnd(9)} ${Object.values(path).join('+').padEnd(23)} ${wonAt ? 'WON at run ' + wonAt : 'not won in ' + CAP} · ${mins.toFixed(1)} min · boss from run ${firstBoss}, ${bossTries} tries · max run ${Math.max(...lens.filter((_, i) => i < (firstBoss || 999) - 1))} s · run secs: ${q(lens)} · last5 ${lens.slice(-6, -1).join(' ')}`);
}
// per character: each machine x ordnance path (fortune alternates so both sides get tested)
const ONLY = process.env.PATH_ONLY;
for (const c of CONFIG.characters) if (whoArg === 'all' || whoArg === c.id) {
  const F = GROUPS.fortune || [];
  combos.filter((p) => (!ONLY || Object.values(p).join("+") === ONLY) && (ONLY || !F.length || p.fortune === F[(GROUPS.machine.indexOf(p.machine) + GROUPS.ordnance.indexOf(p.ordnance)) % F.length])).forEach((p) => campaign(c.id, p));
}
