// Cog & Marble balance sim: node cog-marble/sim.js [-v]
// Plays every level at every difficulty with a simple builder bot on the real createRun() model: builds on the free
// squares that see the most track, mixes tower types, upgrades (pins toward Steel Tips once Bruisers show up), and sends
// waves as soon as it can. Reports win/loss, lives left and minutes per level. A decent human should beat the bot.
const { LEVELS, DIFFS, TOWERS, createRun, buildLevel } = require('./game.js');
const V = process.argv.includes('-v'), DT = 1 / 30;
const noop = () => {}, sfx = new Proxy({}, { get: () => noop });
const fx = { shake: 0, burst: noop, text: noop, ring: noop, update: noop, draw: noop };
let seed = 7; Math.random = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);

function play(L, diff, skill = 1) {
  const run = createRun(L, diff, { sfx, fx, seen: {} }), R = run.R, G = buildLevel(L);
  const pts = G.E.flatMap((e) => e.pts.filter((_, i) => i % 4 === 0));
  const see = (c, r, rng) => pts.filter(([x, y]) => Math.hypot(x - c - 0.5, y - r - 0.5) <= rng).length;
  const spots = G.free.map(([c, r]) => ({ c, r, pin: see(c, r, 2.3), near: see(c, r, 1.25) })).sort((a, b) => b.pin - a.pin);
  const mix = ['pin', 'pin', 'hammer', 'pin', 'magnet', 'hammer', 'pin', 'pin', 'hammer', 'magnet'].filter((t) => L.towers.includes(t));
  let n = 0;
  const cap = Math.floor(3 + 1.6 * skill);
  for (let f = 0; !run.over && f < 30 * 60 * 30; f++) {
    for (let guard = 0; guard < 8; guard++) {
      const type = mix[n % mix.length], free = spots.filter((s) => !R.towers[`${s.c},${s.r}`]);
      const best = type === 'hammer' ? free.slice().sort((a, b) => b.near - a.near)[0] : free[0];
      const owned = Object.keys(R.towers);
      if (best && owned.length < cap + R.wave * skill && R.brass >= run.buildCost(type)) { run.act.build(best.c, best.r, type); n++; continue; }
      // upgrade the cheapest worthwhile tier (pins go Sharper when steel is around)
      let pickK = null, pickP = 0, pickC = 1e9;
      for (const k of owned) { const t = R.towers[k]; const prefer = t.type === 'pin' ? (L.roster.some(([m]) => m === 'bruiser') ? 0 : 1) : t.type === 'hammer' ? 0 : 1;
        for (const p of [prefer, 1 - prefer]) { const nt = run.nextTier(t, p); if (nt && run.price(nt[1]) * (p === prefer ? 1 : 1.6) < pickC) { pickC = run.price(nt[1]) * (p === prefer ? 1 : 1.6); pickK = k; pickP = p; } } }
      if (pickK && R.brass >= pickC + 30) { run.act.upgrade(pickK, pickP); continue; }
      if (best && R.brass >= run.buildCost(type) + 40) { run.act.build(best.c, best.r, type); n++; continue; }
      break;
    }
    if (R.state === 'build') run.act.send();
    run.update(DT);
  }
  return { won: run.won, lives: R.lives, wave: R.wave, t: run.t, towers: Object.keys(R.towers).length, cause: R.endCause + (R.bossLeft ? ` boss hp left ${R.bossLeft}/${R.boss ? R.boss.max : '?'}` : '') };
}
for (const L of LEVELS) {
  const row = [];
  for (const d of Object.keys(DIFFS)) { const r = play(L, d, +(process.env.SKILL || 1)); row.push(`${d.padEnd(6)} ${r.won ? 'WON ' : 'lost'} w${String(r.wave).padStart(2)} ♥${String(r.lives).padStart(2)} ${(r.t / 60).toFixed(1)}m T${r.towers}${!r.won && V ? ' (' + r.cause + ')' : ''}`); }
  console.log(`${L.id} ${L.name.padEnd(14)} | ${row.join(' | ')}`);
}
