// Ore Sweeper balance sim: loads game.js with a stub Kit, plays each character with a greedy bot.
const fs = require('fs'), vm = require('vm');
let cfg; const noop = () => {};
const sfx = new Proxy({}, { get: () => noop });
const ctx = { window: {}, Kit: { game: (c) => { cfg = c; } }, Math, console, document: {} };
ctx.window = ctx; vm.createContext(ctx); vm.runInContext(fs.readFileSync(__dirname + '/../ore-sweeper/game.js', 'utf8'), ctx);
const fx = () => ({ shake: 0, burst: noop, text: noop, ring: noop, update: noop, draw: noop });
const W = 390, H = 700, DT = 1 / 30;
for (const ch of cfg.characters) {
  const C = { levels: {}, wallet: {}, runs: 0 }; let mins = 0, won = false; const lens = [];
  const nodes = cfg.nodes.filter((n) => !n.who || n.who === ch.id);
  const vis = (n) => !n.req || !n.req.length || n.req.filter((r) => C.levels[r]).length >= (n.reqAll || 1);
  const cost = (n) => Math.ceil(n.cost * (n.grow || 1.6) ** (C.levels[n.id] || 0));
  while (!won && C.runs < 300) {
    const s = cfg.baseStats(ch.id); for (const n of nodes) if (C.levels[n.id] && n.fx) n.fx(s, C.levels[n.id]);
    const win = nodes.find((n) => n.win);
    const R = cfg.createRun({ who: ch.id, stats: s, levels: C.levels, W, H, boss: !!C.levels[win.id], sfx, fx: fx(), fmt: String, ui: null, runNo: C.runs + 1 });
    const p = { x: W / 2, y: H / 2, down: true, taps: [] };
    // greedy aim: chase the node with the most neighbours (or the heart)
    let guard = 0;
    while (!R.over && guard++ < 30 * 300) {
      R.draw && 0;
      R.update(DT, p);
    }
    const res = R.result(); lens.push(Math.round(R.t));
    for (const [k, v] of Object.entries(res.earned)) C.wallet[k] = (C.wallet[k] || 0) + Math.floor(v);
    C.runs++; mins += (R.t + 4) / 60;
    if (res.won) { won = true; break; }
    for (let g = 0; g < 200; g++) {
      const o = nodes.filter((n) => vis(n) && (C.levels[n.id] || 0) < (n.max || 1)).sort((a, b) => (b.win ? 1 : 0) - (a.win ? 1 : 0) || cost(a) - cost(b))
        .find((n) => (C.wallet[n.cur || 'ore'] || 0) >= cost(n) && (!n.extra || Object.entries(n.extra).every(([k, v]) => (C.wallet[k] || 0) >= v)));
      if (!o) break; C.wallet[o.cur || 'ore'] -= cost(o); if (o.extra) for (const [k, v] of Object.entries(o.extra)) C.wallet[k] -= v; C.levels[o.id] = (C.levels[o.id] || 0) + 1;
    }
  }
  console.log(ch.id.padEnd(6), won ? 'WON' : 'not won', 'runs', C.runs, 'minutes', mins.toFixed(1), 'run secs', lens.filter((_, i) => i % 3 === 0).join(' '));
}
