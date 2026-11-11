// Balance sim for Hoard: node hoard/sim.js [who|all] [taps/s] [-v] [--plan fury|warband,avarice|warchest]
// Plays the real game model (game.js exports it) with a thumb-limited bot: one shared tap budget for dispatching
// kobolds, breathing on knights / caravans / slayers and taking wing. Between runs it buys tree nodes by a build plan:
// each either/or (`excl`) group gets one chosen side, plan nodes are favoured, the other side is never bought. With no
// --plan it plays every combination of the two choices for every dragon. Reports run lengths, boss runs and runs-to-win.
const { NODES, baseStats, Model } = require('./game.js');
const arg = process.argv.slice(2), VERB = arg.includes('-v'), pi = arg.indexOf('--plan');
const PLAN = pi >= 0 ? arg[pi + 1] : null, pos = arg.filter((a, i) => a !== '-v' && (pi < 0 || (i !== pi && i !== pi + 1)));
const WHO = !pos[0] || pos[0] === 'all' ? ['ember', 'rime', 'moss', 'volt'] : [pos[0]], TAPS = +(pos[1] || 2.5), W = 390, H = 750;
const costOf = (n, lv) => Math.ceil(n.cost * (n.grow || 1.6) ** lv);
const visible = (n, lv) => !n.req || !n.req.length || n.req.filter((r) => (lv[r] || 0) > 0).length >= (n.reqAll || 1);
const OMEN_PREF = ['blood', 'mortar', 'fever', 'quick', 'clutch', 'fog'];
// favoured follow-ups for each choice (cost is divided by FAVOUR when ranking)
const FOLLOW = { fury: ['fury', 'fury2', 'fury3', 'fury4', 'fury5'], spears: ['spears', 'snare', 'chief', 'warren'], avarice: ['avarice'], warchest: ['warchest', 'haggle'] };
const FAVOUR = 2.5;

function playRun(who, nodes, levels, boss, runNo, plan) {
  const s = baseStats(who); for (const n of nodes) { const l = levels[n.id] || 0; if (l && n.fx) n.fx(s, l); }
  const M = Model.create({ who, s, W, H, boss, runNo });
  const dt = 1 / 30; let tapT = 0, buyT = 0, wardAt = 0, wardLen = -1, smites = 0, staggers = 0;
  const koboldCap = s.spear ? 22 : 10, greedy = plan.includes('avarice') || s.stack > 0.3; // warband wants bodies on the road; greed holds gold
  while (!M.over && M.t < 400) {
    if (M.omen) { const i = M.omen.map((o) => OMEN_PREF.indexOf(o.id)); Model.choose(M, i.indexOf(Math.min(...i))); }
    tapT += dt * TAPS;
    while (tapT >= 1) {
      tapT -= 1;
      let k = Model.lead(M);
      const danger = k && (k.atWall || k.y > M.G.wallY - 220);
      if (Model.canFly(M) && (M.knights.length >= 4 || (M.boss && !M.boss.ward))) { Model.fly(M); continue; }
      if (M.boss && M.boss.hp > 0 && (!danger || M.boss.wind > 0)) k = M.boss.ward ? M.knights.find((q) => q.kind === 'acolyte') || k : M.boss; // a thumb goes for the Paladin (or his acolytes)
      const cart = !danger && M.carts.find((c) => c.x > 20 && c.x < W - 20);
      if (cart && M.fireCd <= 0 && !M.grounded) { Model.breathe(M, cart.x, cart.y); continue; }
      if (k && M.fireCd <= 0 && !M.grounded && (danger || !Model.idle(M))) Model.breathe(M, k.x, k.y);
      else if (Model.idle(M)) Model.dispatch(M, Model.best(M, 'kobold'));
      else if (k) Model.breathe(M, k.x, k.y);
    }
    buyT -= dt;
    if (buyT <= 0) {
      buyT = 0.5;
      if (M.wall < M.wallMax * 0.35 && Model.shopOpen(M, 'patch')) Model.buy(M, 'patch');
      const raiders = ['kobold', 'thief', 'wagon', 'sapper'].filter((k) => Model.shopOpen(M, k));
      if (Model.shopOpen(M, 'drake') && M.drakes.length < M.units.length / 4) Model.buy(M, 'drake');
      const pick = raiders.filter((k) => k !== 'kobold' || M.s.foreman || M.units.filter((u) => u.type === 'kobold').length < koboldCap).sort((a, b) => Model.cost(M, a) - Model.cost(M, b))[0];
      // greed: only spend when the hoard is already past its bonus cap (or the gold would buy something big)
      if (pick && (!greedy || M.gold - Model.cost(M, pick) > 100 * s.stackCap / s.stack)) Model.buy(M, pick);
    }
    Model.step(M, dt);
    for (const e of M.ev) { if (e.k === 'phase') wardAt = M.t; if (e.k === 'enrage') wardLen = M.t - wardAt; if (e.k === 'smite') smites++; if (e.k === 'stagger') staggers++; }
    M.ev.length = 0;
  }
  return { t: M.t, won: M.won, siege: M.siege, earned: M.earned, carts: M.carsHit, flights: M.flights, mod: M.mod && M.mod.id, slayers: M.slayers, boss: M.boss && { hp: M.boss.hp / M.boss.max, p2: !!M.boss.p2, ward: wardLen, smites, staggers }, ...Model.earnedOf(M) };
}

function campaign(who, plan) {
  const nodes = NODES.filter((n) => !n.who || n.who === who), win = nodes.find((n) => n.win);
  const chosen = new Set(plan), fav = new Set(plan.flatMap((p) => FOLLOW[p] || [p]));
  const skip = (n) => n.excl && !chosen.has(n.id); // the other side of each either/or is never bought
  const levels = {}, wallet = { renown: 0, gems: 0 }, log = [], lens = [];
  let run = 0, wonAt = 0, bossRuns = [], firstBuys = [];
  while (run < 120 && !wonAt) {
    run++;
    const boss = !!levels[win.id], r = playRun(who, nodes, levels, boss, run, plan);
    wallet.renown += r.renown; wallet.gems += r.gems; lens.push(r.t);
    if (boss) bossRuns.push(`${r.t.toFixed(0)}s${r.boss.ward >= 0 ? ` (ward ${r.boss.ward.toFixed(0)}s)` : ''} smite ${r.boss.smites}/stagger ${r.boss.staggers} ${r.won ? 'WON' : `lost, Paladin at ${Math.round(r.boss.hp * 100)}%${r.boss.p2 ? ' (phase 2)' : ''}`}`);
    if (boss && r.won) wonAt = run;
    log.push(`#${run}${boss ? ' BOSS' : ''} ${r.t.toFixed(0)}s${r.siege ? ' siege' : ''}${r.mod ? ' [' + r.mod + ']' : ''} raided ${Math.round(r.earned)} -> +${r.renown}r +${r.gems}g carts ${r.carts} fly ${r.flights} slayers ${r.slayers} ${r.won ? 'WON' : ''}`);
    const bought = [];
    for (;;) {
      const opts = nodes.filter((n) => !skip(n) && visible(n, levels) && (levels[n.id] || 0) < (n.max || 1)).map((n) => ({ n, c: costOf(n, levels[n.id] || 0) }))
        .filter(({ n, c }) => wallet[n.cur || 'renown'] >= c && (!n.extra || Object.entries(n.extra).every(([k, v]) => wallet[k] >= v)));
      if (!opts.filter((x) => !x.n.win || !levels[win.id]).length) break;
      const rank = (x) => x.c / (x.n.cur ? 30 : 1) / (fav.has(x.n.id) ? FAVOUR : 1);
      const o = (!levels[win.id] && opts.find((x) => x.n.win)) || opts.filter((x) => !x.n.win).sort((a, b) => rank(a) - rank(b))[0];
      wallet[o.n.cur || 'renown'] -= o.c; if (o.n.extra) for (const [k, v] of Object.entries(o.n.extra)) wallet[k] -= v;
      levels[o.n.id] = (levels[o.n.id] || 0) + 1; bought.push(o.n.id);
      if (o.n.win) { log.push(`   bought WIN node after run ${run}`); break; }
    }
    if (VERB && bought.length) log.push('   bought ' + bought.join(' '));
    if (run <= 5) firstBuys.push(bought.join('+') || '-');
  }
  if (VERB) console.log(log.join('\n'));
  const nonBoss = lens.slice(0, lens.length - bossRuns.length);
  console.log(`${who.padEnd(5)} ${plan.join('+').padEnd(16)} ${wonAt ? 'won at run ' + String(wonAt).padStart(2) : 'NO WIN in ' + run} | runs 1-3 ${lens.slice(0, 3).map((x) => x.toFixed(0)).join('/')}s, last 5 ${nonBoss.slice(-5).map((x) => x.toFixed(0)).join('/')}s, max ${Math.max(...lens).toFixed(0)}s | boss: ${bossRuns.join(', ') || '-'}`);
  if (VERB) console.log('   first 5 runs bought: ' + firstBuys.join(' | '));
  return { wonAt, max: Math.max(...lens) };
}
const PLANS = PLAN ? [PLAN.split(',')] : [['fury', 'avarice'], ['fury', 'warchest'], ['spears', 'avarice'], ['spears', 'warchest']];
const res = WHO.flatMap((w) => PLANS.map((p) => campaign(w, p)));
if (res.some((r) => r.max > 75)) console.log('WARNING: a run went over 75s');
const ws = res.map((r) => r.wonAt || 999); console.log(`runs to first win: min ${Math.min(...ws)}, max ${Math.max(...ws)}`);
