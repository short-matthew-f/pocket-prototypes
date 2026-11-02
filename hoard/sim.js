// Balance sim for Hoard: node hoard/sim.js [who|all] [taps/s] [-v]
// Plays the real game model (game.js exports it) with a thumb-limited bot: one shared tap budget for dispatching
// kobolds, breathing on knights / caravans and taking wing. Between runs it buys the cheapest tree node (the win node
// as soon as it can). Reports run lengths, the boss run and runs-to-win per dragon.
const { NODES, baseStats, Model } = require('./game.js');
const arg = process.argv.slice(2), VERB = arg.includes('-v'), pos = arg.filter((a) => a !== '-v');
const WHO = !pos[0] || pos[0] === 'all' ? ['ember', 'rime', 'moss', 'volt'] : [pos[0]], TAPS = +(pos[1] || 2.5), W = 390, H = 750;
const costOf = (n, lv) => Math.ceil(n.cost * (n.grow || 1.6) ** lv);
const visible = (n, lv) => !n.req || !n.req.length || n.req.filter((r) => (lv[r] || 0) > 0).length >= (n.reqAll || 1);
const OMEN_PREF = ['blood', 'mortar', 'fever', 'quick', 'clutch', 'fog'];

function playRun(who, nodes, levels, boss) {
  const s = baseStats(who); for (const n of nodes) { const l = levels[n.id] || 0; if (l && n.fx) n.fx(s, l); }
  const M = Model.create({ who, s, W, H, boss });
  const dt = 1 / 30; let tapT = 0, buyT = 0, wardAt = 0, wardLen = -1;
  while (!M.over && M.t < 400) {
    if (M.omen) { const i = M.omen.map((o) => OMEN_PREF.indexOf(o.id)); Model.choose(M, i.indexOf(Math.min(...i))); }
    tapT += dt * TAPS;
    while (tapT >= 1) {
      tapT -= 1;
      let k = Model.lead(M);
      const danger = k && (k.atWall || k.y > M.G.wallY - 220);
      if (Model.canFly(M) && (M.knights.length >= 4 || (M.boss && !M.boss.ward))) { Model.fly(M); continue; }
      if (M.boss && M.boss.hp > 0 && !danger) k = M.boss.ward ? M.knights.find((q) => q.kind === 'acolyte') || k : M.boss; // a thumb goes for the Paladin (or his acolytes)
      const cart = !danger && M.carts.find((c) => c.x > 20 && c.x < W - 20);
      if (cart && M.fireCd <= 0) { Model.breathe(M, cart.x, cart.y); continue; }
      if (k && M.fireCd <= 0 && (danger || !Model.idle(M))) Model.breathe(M, k.x, k.y);
      else if (Model.idle(M)) Model.dispatch(M, Model.best(M, 'kobold'));
      else if (k) Model.breathe(M, k.x, k.y);
    }
    buyT -= dt;
    if (buyT <= 0) {
      buyT = 0.5;
      if (M.wall < M.wallMax * 0.35 && Model.shopOpen(M, 'patch')) Model.buy(M, 'patch');
      const raiders = ['kobold', 'thief', 'wagon', 'sapper'].filter((k) => Model.shopOpen(M, k));
      if (Model.shopOpen(M, 'drake') && M.drakes.length < M.units.length / 4) Model.buy(M, 'drake');
      // cheapest raider; kobolds only while the bot can still tap them out (or a foreman does)
      const pick = raiders.filter((k) => k !== 'kobold' || M.s.foreman || M.units.filter((u) => u.type === 'kobold').length < 10).sort((a, b) => Model.cost(M, a) - Model.cost(M, b))[0];
      if (pick) Model.buy(M, pick);
    }
    Model.step(M, dt);
    for (const e of M.ev) { if (e.k === 'phase') wardAt = M.t; if (e.k === 'enrage') wardLen = M.t - wardAt; }
    M.ev.length = 0;
  }
  return { t: M.t, won: M.won, siege: M.siege, earned: M.earned, carts: M.carsHit, flights: M.flights, boss: M.boss && { hp: M.boss.hp / M.boss.max, p2: !!M.boss.p2, ward: wardLen }, ...Model.earnedOf(M) };
}

function campaign(who) {
  const nodes = NODES.filter((n) => !n.who || n.who === who), win = nodes.find((n) => n.win);
  const levels = {}, wallet = { renown: 0, gems: 0 }, log = [], lens = [];
  let run = 0, wonAt = 0, bossRuns = [];
  while (run < 120 && !wonAt) {
    run++;
    const boss = !!levels[win.id], r = playRun(who, nodes, levels, boss);
    wallet.renown += r.renown; wallet.gems += r.gems; lens.push(r.t);
    if (boss) bossRuns.push(`${r.t.toFixed(0)}s${r.boss.ward >= 0 ? ` (ward ${r.boss.ward.toFixed(0)}s)` : ''} ${r.won ? 'WON' : `lost, Paladin at ${Math.round(r.boss.hp * 100)}%${r.boss.p2 ? ' (phase 2)' : ''}`}`);
    if (boss && r.won) wonAt = run;
    log.push(`#${run}${boss ? ' BOSS' : ''} ${r.t.toFixed(0)}s${r.siege ? ' siege' : ''} raided ${Math.round(r.earned)} -> +${r.renown}r +${r.gems}g carts ${r.carts} fly ${r.flights} ${r.won ? 'WON' : ''}`);
    for (;;) {
      const opts = nodes.filter((n) => visible(n, levels) && (levels[n.id] || 0) < (n.max || 1)).map((n) => ({ n, c: costOf(n, levels[n.id] || 0) }))
        .filter(({ n, c }) => wallet[n.cur || 'renown'] >= c && (!n.extra || Object.entries(n.extra).every(([k, v]) => wallet[k] >= v)));
      if (!opts.filter((x) => !x.n.win || !levels[win.id]).length) break;
      const o = (!levels[win.id] && opts.find((x) => x.n.win)) || opts.filter((x) => !x.n.win).sort((a, b) => a.c / (a.n.cur ? 30 : 1) - b.c / (b.n.cur ? 30 : 1))[0];
      wallet[o.n.cur || 'renown'] -= o.c; if (o.n.extra) for (const [k, v] of Object.entries(o.n.extra)) wallet[k] -= v;
      levels[o.n.id] = (levels[o.n.id] || 0) + 1;
      if (o.n.win) { log.push(`   bought WIN node after run ${run}`); break; }
    }
  }
  if (VERB) console.log(log.join('\n'));
  const nonBoss = lens.slice(0, lens.length - bossRuns.length);
  console.log(`${who.padEnd(5)} @${TAPS} taps/s: ${wonAt ? 'won at run ' + wonAt : 'NO WIN in ' + run} | runs 1-3 ${lens.slice(0, 3).map((x) => x.toFixed(0)).join('/')}s, last 5 ${nonBoss.slice(-5).map((x) => x.toFixed(0)).join('/')}s, max ${Math.max(...lens).toFixed(0)}s | boss: ${bossRuns.join(', ') || '-'}`);
  return { wonAt, max: Math.max(...lens) };
}
const res = WHO.map(campaign);
if (res.some((r) => r.max > 75)) console.log('WARNING: a run went over 75s');
