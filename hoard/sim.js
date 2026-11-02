// Balance sim for Hoard: node hoard/sim.js [who] [taps/s]
// Plays runs with a thumb-limited bot (shared tap budget for dispatching + breathing), buys the cheapest tree node
// between runs, and reports run length / renown curve and runs-to-win.
const { NODES, baseStats, Model } = require('./game.js');
const who = process.argv[2] || 'ember', TAPS = +(process.argv[3] || 2.5), W = 390, H = 750;
const nodes = NODES.filter((n) => !n.who || n.who === who);
const costOf = (n, lv) => Math.ceil(n.cost * (n.grow || 1.6) ** lv);
const visible = (n, lv) => !n.req || !n.req.length || n.req.filter((r) => (lv[r] || 0) > 0).length >= (n.reqAll || 1);
function stats(levels) { const s = baseStats(who); for (const n of nodes) { const l = levels[n.id] || 0; if (l && n.fx) n.fx(s, l); } return s; }

function playRun(levels, boss) {
  const M = Model.create({ who, s: stats(levels), W, H, boss });
  const dt = 1 / 30; let tapT = 0, buyT = 0;
  while (!M.over && M.t < 400) {
    tapT += dt * TAPS;
    while (tapT >= 1) {
      tapT -= 1;
      let k = Model.lead(M);
      const danger = k && (k.atWall || k.y > M.G.wallY - 220);
      if (!danger && M.boss && M.boss.hp > 0) k = M.boss; // a thumb goes for the Paladin when it can
      if (k && M.fireCd <= 0 && (danger || !Model.idle(M))) Model.breathe(M, k.x, k.y);
      else if (Model.idle(M)) Model.dispatch(M, Model.best(M, 'kobold'));
      else if (k) Model.breathe(M, k.x, k.y);
    }
    buyT -= dt;
    if (buyT <= 0) {
      buyT = 0.5;
      if (M.wall < M.wallMax * 0.35 && Model.shopOpen(M, 'patch')) Model.buy(M, 'patch');
      const raiders = ['kobold', 'thief', 'wagon', 'sapper'].filter((k) => Model.shopOpen(M, k));
      const nRaid = M.units.length;
      if (Model.shopOpen(M, 'drake') && M.drakes.length < nRaid / 4) Model.buy(M, 'drake');
      // cheapest raider; kobolds only while the bot can still tap them out (or a foreman does)
      const pick = raiders.filter((k) => k !== 'kobold' || M.s.foreman || M.units.filter((u) => u.type === 'kobold').length < 10).sort((a, b) => Model.cost(M, a) - Model.cost(M, b))[0];
      if (pick) Model.buy(M, pick);
    }
    Model.step(M, dt); M.ev.length = 0;
  }
  return { t: M.t, won: M.won, ...Model.earnedOf(M), earned: M.earned };
}

const levels = {}, wallet = { renown: 0, gems: 0 }; const log = [];
let run = 0, wonAt = 0;
while (run < 120 && !wonAt) {
  run++;
  const win = nodes.find((n) => n.win), boss = !!levels[win.id];
  const r = playRun(levels, boss);
  wallet.renown += r.renown; wallet.gems += r.gems;
  if (boss && r.won) { wonAt = run; }
  log.push(`#${run}${boss ? ' BOSS' : ''} ${r.t.toFixed(0)}s raided ${Math.round(r.earned)} -> +${r.renown}r +${r.gems}g ${r.won ? 'WON' : ''}`);
  // spend: win node first if affordable, else cheapest
  for (;;) {
    const opts = nodes.filter((n) => visible(n, levels) && (levels[n.id] || 0) < (n.max || 1)).map((n) => ({ n, c: costOf(n, levels[n.id] || 0) }))
      .filter(({ n, c }) => wallet[n.cur || 'renown'] >= c && (!n.extra || Object.entries(n.extra).every(([k, v]) => wallet[k] >= v)));
    if (!opts.length) break;
    const o = opts.find((x) => x.n.win) || opts.sort((a, b) => a.c / (a.n.cur ? 30 : 1) - b.c / (b.n.cur ? 30 : 1))[0];
    wallet[o.n.cur || 'renown'] -= o.c; if (o.n.extra) for (const [k, v] of Object.entries(o.n.extra)) wallet[k] -= v;
    levels[o.n.id] = (levels[o.n.id] || 0) + 1;
    if (o.n.win) { log.push(`   bought WIN node after run ${run}`); break; }
  }
}
console.log(log.join('\n'));
console.log(`\n${who} @${TAPS} taps/s: ${wonAt ? 'won at run ' + wonAt : 'no win in ' + run}; levels`, JSON.stringify(levels));
