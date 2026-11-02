// Delve Deck balance sim: node delve-deck/sim.js [who|all] [seeds] [-v]
// Plays the real run model (game.js createRun, headless: ui null, stub fx/sfx) with a push-or-retreat bot, buys
// sensibly between runs (cheapest first, saving for the throne once it shows), and reports runs-to-win per character,
// decisions per run and seconds per run (animation time + ~1.3 s to read and tap each decision).
const D = require('./game.js');
const args = process.argv.slice(2), VERB = args.includes('-v'), pos = args.filter((a) => a[0] !== '-');
const WHO = !pos[0] || pos[0] === 'all' ? D.CHARS.map((c) => c.id) : [pos[0]], SEEDS = +(pos[1] || 12), READ = 1.3;
const noop = () => {}, sfx = new Proxy({}, { get: () => noop });
const fxStub = () => ({ shake: 0, burst: noop, text: noop, ring: noop, update: noop, draw: noop });
const costOf = (n, lv) => Math.ceil(n.cost * (n.grow || 1.6) ** lv);
const visible = (n, lv) => !n.req || !n.req.length || n.req.filter((r) => (lv[r] || 0) > 0).length >= (n.reqAll || 1);

// ---------------------------------------------------------------- one run
function playRun(who, levels, boss, runNo) {
  const nodes = D.NODES.filter((n) => !n.who || n.who === who), s = D.baseStats(who);
  for (const n of nodes) { const l = levels[n.id] || 0; if (l && n.fx) n.fx(s, l); }
  let decisions = 0, pending = null;
  const env = { who, stats: s, levels, W: 390, H: 800, boss, sfx, fx: fxStub(), fmt: String, ui: null, runNo, best: 0,
    pick: (h, opts, done) => { pending = () => { decisions++; done(choose(run.R, s, opts)); }; } };
  const run = D.createRun(env), R = run.R;
  const act = (a) => { decisions++; if (process.env.TRACE && runNo <= +process.env.TRACE) console.log(`  d${R.depth} hp${R.hp}/${R.max} thr${R.threat}${R.ambush ? 'A' : ''} [${R.cards.map((c) => c.type === 'fight' ? c.m.id + run.estimate(c.m, false) : c.type).join(',')}] -> ${a}`); run.act(a); };
  for (let guard = 0; !run.over && guard < 200000; guard++) {
    if (pending) { const p = pending; pending = null; p(); continue; }
    if (R.phase !== 'pick' && R.phase !== 'boss') { run.update(1 / 30, {}); continue; }
    bot(run, R, s, boss, act);
    run.update(1 / 30, {});
  }
  const res = run.result();
  return { ...res, t: R.t, decisions, depth: R.depth, secs: R.t + decisions * READ };
}

// value of 1 HP in loot terms rises with depth and as HP runs low
const hpW = (R) => (1.2 + R.depth * 0.35) * Math.max(1, (R.max * 0.6) / Math.max(1, R.hp));
// kit pick cards (events, trader, shrines, relics): options carry a k key
const RELIC_PREF = ['ring', 'skin', 'feather', 'glass', 'kit', 'fang', 'die', 'shard', 'lamp', 'coin', 'epick', 'idol', 'water', 'mule', 'crown'];
function choose(R, s, opts) {
  const ks = opts.map((o) => o.k), hp = R.hp / R.max, has = (k) => ks.indexOf(k), leave = Math.max(0, has('leave'));
  if (ks.every((k) => RELIC_PREF.includes(k))) return ks.map((k, i) => [RELIC_PREF.indexOf(k), i]).sort((a, b) => a[0] - b[0])[0][1];
  if (has('potion') >= 0 || has('whet') >= 0 || has('patch') >= 0) { // the trader: one buy
    const want = opts.findIndex((o) => o.price != null && o.price <= R.gold && (o.k === 'potion' ? R.potions < 2 : (o.k === 'whet' || o.k === 'patch') && R.gold > o.price * 2.5));
    return want >= 0 ? want : leave;
  }
  const rules = { altar: hp > 0.6, mush: hp < 0.65, dig: hp > 0.5, pray: true, rob: hp > 0.65, give: false, bet: false, well: R.potions < 1, ride: hp > 0.45,
    greed: true, iron: hp > 0.7, blood: hp > 0.75, stone: true, stars: false, dusk: hp < 0.4 };
  const i = ks.findIndex((k) => rules[k]);
  return i >= 0 ? i : leave;
}
// the King: brace the big telegraphed blows, shatter crystals, strike otherwise
function bossMove(run, R) {
  const K = R.K;
  if (K.intent === 'slam' || K.intent === 'quake') return 'b1';
  if (K.crystals >= 2 || (K.crystals === 1 && K.hp > K.max * 0.25)) return 'b2';
  return 'b0';
}
function bot(run, R, s, boss, act) {
  if (R.phase === 'boss') { if (R.potions > 0 && R.hp < R.max * 0.5) return act('potion'); return act(bossMove(run, R)); }
  if (R.potions > 0 && R.hp < R.max * 0.42) return act('potion');
  const w = hpW(R), safe = R.max * 0.12, opts = [];
  R.cards.forEach((c, i) => {
    const o = (a, val, worst) => opts.push({ a, val, worst });
    if (c.type === 'fight') {
      const e = run.estimate(c.m, false), eg = run.estimate(c.m, true), loot = c.m.gold + (c.m.ore || 0) * 1.6 + (c.m.relic ? 25 : 0);
      if (c.m.king) { o('c' + i, 1e6, 0); return; }
      o('c' + i, loot - e * w, e * 1.25); o('g' + i, loot / 2 - eg * w, eg * 1.25);
      if (c.sneak != null) { const ef = run.estimate(c.m, false, { free: 2 }); o('k' + i, c.sneak * c.m.gold * s.steal - (1 - c.sneak) * (ef * w - loot), ef * 1.2); }
      if (R.blasts > 0 && !c.sneak) { const eb = run.estimate(c.m, false, { pre: c.m.hp * 0.4 }); o('b' + i, loot - eb * w - 4, eb * 1.25); }
    } else if (c.type === 'mine') o('c' + i, c.ore * 1.6 + (c.gold || 0) - c.cave * c.dmg * w + (c.streakBonus || 0), c.dmg);
    else if (c.type === 'rest') o('c' + i, Math.min(R.max - R.hp, R.max * s.rest) * w * 0.9 - 2, 0);
    else if (c.type === 'treasure') o('c' + i, c.gold - c.trap * c.dmg * w + (c.potion ? 4 : 0), c.trap ? c.dmg : 0);
    else if (c.type === 'shop') o('c' + i, R.gold >= 8 + R.depth && R.potions < 2 ? 6 : -5, 0);
    else if (c.type === 'event') o('c' + i, 3, 0);
    else if (c.type === 'shrine' || c.type === 'relic') o('c' + i, c.botVal != null ? c.botVal : 8, 0);
    else o('c' + i, 1, 0);
  });
  const ok = opts.filter((x) => x.worst < R.hp - safe).sort((a, b) => b.val - a.val);
  const bank = R.gold + R.ore * 1.6;
  if (!ok.length) { if (R.rerolls > 0 && !R.ambush) return act('reroll'); if (R.potions > 0 && R.hp < R.max) return act('potion'); return act(boss && R.depth > 16 ? opts.sort((a, b) => a.worst - b.worst)[0].a : 'retreat'); }
  // push or retreat: a non-boss run turns back when the next room could leave it nearly dead with nothing to fall back on
  const after = R.hp - ok[0].worst, cushion = R.potions * R.max * s.potionHeal + (R.revive ? R.max * 0.5 : 0);
  if (!boss && bank > 0 && after + cushion < R.max * 0.22) return act('retreat');
  return act(ok[0].a);
}

function ready(who, levels, win) {
  const lv = { ...levels, [win.id]: 1 }; let w = 0;
  for (let i = 0; i < 6; i++) if (playRun(who, lv, true, 99).won) w++;
  return w >= 2;
}
// ---------------------------------------------------------------- a whole climb to the first win
function climb(who) {
  const nodes = D.NODES.filter((n) => !n.who || n.who === who), win = nodes.find((n) => n.win);
  const levels = {}, wallet = { gold: 0, ore: 0 }, log = [];
  let run = 0, wonAt = 0, secs = 0;
  const lens = [];
  while (run < 150 && !wonAt) {
    run++;
    const boss = !!levels[win.id], r = playRun(who, levels, boss, run);
    for (const [k, v] of Object.entries(r.earned || {})) wallet[k] = (wallet[k] || 0) + Math.floor(v);
    secs += r.secs; lens.push(r);
    if (r.won) wonAt = run;
    log.push(`#${run}${boss ? ' BOSS' : ''} d${r.depth} ${r.decisions}dec ${r.secs.toFixed(0)}s ${r.title || ''} +${Math.floor(r.earned.gold)}g +${Math.floor(r.earned.ore)}o${r.won ? ' WON' : ''}`);
    for (let g = 0; g < 100; g++) {
      const throneVis = visible(win, levels) && !levels[win.id];
      const need = throneVis ? { gold: costOf(win, 0), ...win.extra } : {};
      const opts = nodes.filter((n) => visible(n, levels) && (levels[n.id] || 0) < (n.max || 1)).map((n) => ({ n, c: costOf(n, levels[n.id] || 0), k: n.cur || 'gold' }))
        .filter(({ n, c, k }) => wallet[k] >= c && (!n.extra || Object.entries(n.extra).every(([x, v]) => wallet[x] >= v)))
        // saving for the throne: only small buys that leave enough, or buys that are cheap next to it
        .filter(({ n }) => !n.win).filter(({ n, c, k }) => !need[k] || wallet[k] - c >= need[k] || c <= need[k] * 0.06);
      if (!opts.length) break;
      // the throne only once a trial says the climb is winnable (a player buys it when they feel strong enough)
      const canThrone = throneVis && wallet.gold >= costOf(win, 0) && Object.entries(win.extra || {}).every(([x, v]) => wallet[x] >= v);
      if (canThrone && ready(who, levels, win)) { wallet.gold -= costOf(win, 0); for (const [x, v] of Object.entries(win.extra || {})) wallet[x] -= v; levels[win.id] = 1; log.push(`   bought THRONE after run ${run}`); break; }
      if (canThrone === false && throneVis && !log.at(-1).includes('wait')) log.push(`   waiting: gold ${wallet.gold}/${costOf(win, 0)} ore ${wallet.ore}/${win.extra.ore}`);
      const o = opts.sort((a, b) => a.c / (a.k === 'ore' ? 0.6 : 1) - b.c / (b.k === 'ore' ? 0.6 : 1))[0];
      wallet[o.k] -= o.c; if (o.n.extra) for (const [x, v] of Object.entries(o.n.extra)) wallet[x] -= v;
      levels[o.n.id] = (levels[o.n.id] || 0) + 1;
    }
  }
  return { who, wonAt, run, secs, lens, log, levels, wallet };
}

const out = [];
for (const who of WHO) {
  const rs = []; for (let i = 0; i < SEEDS; i++) rs.push(climb(who));
  if (VERB) console.log(rs[0].log.join('\n'), '\n', JSON.stringify(rs[0].levels));
  const wins = rs.filter((r) => r.wonAt).map((r) => r.wonAt).sort((a, b) => a - b), med = wins[Math.floor(wins.length / 2)];
  const all = rs.flatMap((r) => r.lens), at = (k) => all.filter((_, i) => true);
  const early = rs.flatMap((r) => r.lens.slice(0, 3)), late = rs.flatMap((r) => r.lens.slice(-4));
  const avg = (a, f) => (a.reduce((x, y) => x + f(y), 0) / Math.max(1, a.length));
  const bossRuns = rs.flatMap((r) => r.lens.filter((l, i) => r.log[0] && l.depth >= 18));
  console.log(`${who.padEnd(8)} won ${wins.length}/${SEEDS}  runs-to-win median ${med} (range ${wins[0]}-${wins[wins.length - 1]})  minutes ${(avg(rs, (r) => r.secs) / 60).toFixed(1)}`
    + `  | runs 1-3: ${avg(early, (l) => l.decisions).toFixed(0)} dec ${avg(early, (l) => l.secs).toFixed(0)}s depth ${avg(early, (l) => l.depth).toFixed(1)}`
    + `  | last 4: ${avg(late, (l) => l.decisions).toFixed(0)} dec ${avg(late, (l) => l.secs).toFixed(0)}s depth ${avg(late, (l) => l.depth).toFixed(1)}`
    + `  | longest ${Math.max(...all.map((l) => l.secs)).toFixed(0)}s`);
}
