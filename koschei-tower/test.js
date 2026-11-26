// Koschei's Tower: rule tests, and with --bots a whole-campaign balance run by a placement bot.
//   node koschei-tower/test.js          rules
//   node koschei-tower/test.js --bots   + campaign (think time per piece: --think 0.9, runs cap: --runs 400)
const K = require('./model.js');
const assert = require('assert');
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? +args[i + 1] : d; };
let pass = 0;
const t = (name, fn) => { try { fn(); pass++; } catch (e) { console.log('FAIL', name, '\n ', e.message); process.exitCode = 1; } };
const W = K.W, R = K.R;

// ---------------------------------------------------------------- rules
const ST = () => K.stats('bogatyr', {}, 1, {});
function empty(r) { r.grid.fill(0); r.gold.fill(0); r.mon.fill(-1); r.mons.length = 0; }
function putMon(r, x, y, color, hp, s = 1) { const m = { uid: 900 + r.mons.length, x, y, w: s, h: s, hp, max: hp, color, atk: ['rocks1'], n: 0, atkT: 0, every: 99, dmg: 5, weak: K.EL[color], gold: 10, xp: 5, floor: 1, size: s, name: 'T', boss: s > 1 };
  for (let yy = y; yy < y + s; yy++) for (let xx = x; xx < x + s; xx++) { r.grid[yy * W + xx] = K.MON; r.mon[yy * W + xx] = m.uid; } r.mons.push(m); return m; }
const settle = (r, sec = 2) => { for (let i = 0; i < sec * 60 && !r.over; i++) K.step(r, 1 / 60); };
const place = (r, cells, x, y = 3, shape = 'I3', rot = 0) => { r.piece = { shape, el: cells[0], cells, gold: cells.map(() => 0), x, y, rot }; r.phase = 'play'; K.hard(r); };
t('rotations keep cell count and stay in box', () => {
  for (const k in K.SHAPES) { const s = K.SHAPES[k]; for (const c of s.rots) { assert.equal(c.length, s.c.length); for (const [x, y] of c) assert(x >= 0 && y >= 0 && x < s.n && y < s.n, k); } }
});
t('a floor starts with monsters low in the well, none pre-matched', () => {
  for (let seed = 1; seed < 30; seed++) { const r = K.newRun({ stats: ST(), seed, floor: 1 + seed % 29 }); assert(r.mons.length >= 2 && r.piece); assert.equal(K.findMatches(r).length, 0); }
});
t('cells settle straight down after landing', () => {
  const r = K.newRun({ stats: ST(), seed: 2 }); empty(r); r.st.fall = 1e9; r.hordeT = -99;
  r.grid[(R - 1) * W + 1] = 5; // a step under one end
  place(r, [1, 2, 3], 0, 3, 'I3', 0); // horizontal I3 over x=0..2 lands on the step, then x=0 and x=2 fall
  settle(r, 1);
  assert.equal(r.grid[(R - 1) * W + 0], 1); assert.equal(r.grid[(R - 2) * W + 1], 2); assert.equal(r.grid[(R - 1) * W + 2], 3);
});
t('a line of four including a monster strikes it and clears the heroes', () => {
  const r = K.newRun({ stats: ST(), seed: 3 }); empty(r); r.st.fall = 1e9; r.hordeT = -99;
  const m = putMon(r, 0, R - 1, 1, 9999); putMon(r, 7, R - 1, 2, 9999);
  place(r, [1, 1, 1], 1, 3, 'I3', 0); settle(r, 1.5);
  assert(m.hp < 9999, 'hp ' + m.hp); for (let x = 1; x < 4; x++) assert.equal(r.grid[(R - 1) * W + x], 0);
});
t('a monster that drops to 0 HP dies and the floor ends when all are gone', () => {
  const r = K.newRun({ stats: ST(), seed: 4 }); empty(r); r.st.fall = 1e9; r.hordeT = -99;
  putMon(r, 0, R - 1, 3, 1);
  place(r, [3, 3, 3], 1, 3, 'I3', 0); settle(r, 1); assert.equal(r.mons.length, 0); assert.equal(r.kills, 1);
  settle(r, 2); assert.equal(r.floor, 2); assert(r.mons.length >= 2);
});
t('settling makes chains', () => {
  const r = K.newRun({ stats: ST(), seed: 5 }); empty(r); r.st.fall = 1e9; r.hordeT = -99;
  const m = putMon(r, 0, R - 1, 2, 9999); putMon(r, 7, R - 1, 3, 9999);
  // column 1..3 bottom: blue blue blue under red red red; clearing reds? build: bottom row 1-3 = red red red is matched with a red at x=4
  for (let x = 1; x <= 3; x++) { r.grid[(R - 1) * W + x] = 1; r.grid[(R - 2) * W + x] = 2; }
  place(r, [1], 4, 3, 'P1', 0); settle(r, 2.5);
  assert(r.best.lines >= 2, 'chain ' + r.best.lines); assert(m.hp < 9999);
});
t('Priests are wild', () => {
  const r = K.newRun({ stats: ST(), seed: 6 }); empty(r); r.st.fall = 1e9; r.hordeT = -99;
  const m = putMon(r, 0, R - 1, 2, 9999); putMon(r, 7, R - 1, 3, 9999);
  place(r, [2, 4, 2], 1, 3, 'I3', 0); settle(r, 1.5); assert(m.hp < 9999);
});
t('monster strike drops rocks and hurts', () => {
  const r = K.newRun({ stats: ST(), seed: 7 }); empty(r); r.st.fall = 1e9; const m = putMon(r, 3, R - 1, 1, 500); m.boss = false;
  const hp0 = r.hp; r.hordeT = 99; K.step(r, 0.02); assert(r.hp < hp0); let st = 0; for (const v of r.grid) if (v === K.STONE) st++; assert(st >= 1);
});
t('overflow costs HP and keeps playing', () => {
  const r = K.newRun({ stats: ST(), seed: 8 }); empty(r); putMon(r, 0, R - 1, 1, 500);
  for (let y = 1; y < R; y++) for (let x = 0; x < W; x++) if (r.grid[y * W + x] !== K.MON) r.grid[y * W + x] = 5;
  const hp0 = r.hp; r.phase = 'settle'; settle(r, 0.5); assert(r.hp < hp0 && !r.over);
});
t('the candle ends the run', () => {
  const r = K.newRun({ stats: ST(), seed: 9 }); r.st.fall = 1e9; r.st.foeSlow = 1e9;
  for (let i = 0; i < 70 * 30 && !r.over; i++) K.step(r, 1 / 30);
  assert(r.over && r.reason === 'candle');
});
t('Koschei cannot die without the Needle', () => {
  const r = K.newRun({ stats: ST(), seed: 10, floor: 30 });
  const m = r.mons.find((o) => o.boss); assert(m.deathless && m.w === 2); r.st.atk = 1e9; r.st.spells.fire = 1; r.mana.fire = 99;
  K.cast(r, 'fire'); assert.equal(m.hp, 1);
  r.st.needle = 1; K.cast(r, 'fire'); assert(r.won && !r.mons.includes(m));
});
t('tree: every node reachable, no overlaps', () => {
  const lv = {}; let changed = true;
  while (changed) { changed = false; for (const n of K.NODES) if (!lv[n.id] && K.nodeOpen(n, lv, { bosses: { 25: 1 } })) { lv[n.id] = 1; changed = true; } }
  for (const n of K.NODES) assert(lv[n.id], n.id + ' unreachable');
  const pos = new Set(); for (const n of K.NODES) { const k = n.x + ',' + n.y; assert(!pos.has(k), 'overlap ' + k); pos.add(k); }
});
t('boss kill on applyRun gives relic and checkpoint; win unlocks a hero', () => {
  const S = K.newSave(); const o = K.applyRun(S, 'bogatyr', { kopeks: 5, feathers: 3, xp: 1, t: 10, floor: 5, bossKills: [5], won: false });
  assert.deepEqual(o.relics, ['mortar']); assert(K.checkpoints(S.heroes.bogatyr).includes(6));
  const o2 = K.applyRun(S, 'bogatyr', { kopeks: 0, feathers: 0, xp: 0, t: 1, floor: 30, bossKills: [30], won: true }); assert(o2.unlocked === 'vedma');
});
t('random play never corrupts monster bookkeeping', () => {
  for (let seed = 1; seed < 25; seed++) {
    const r = K.newRun({ stats: K.stats('bogatyr', { str: 10, hammer: 3 }, 8, { mortar: 1 }), seed, floor: 1 + (seed % 30) }); r.st.spells = { fire: 1, ice: 1, earth: 1, storm: 1 };
    for (let i = 0; i < 4000 && !r.over; i++) {
      const a = r.rnd(); if (a < 0.2) K.move(r, -1); else if (a < 0.4) K.move(r, 1); else if (a < 0.5) K.rotate(r, 1); else if (a < 0.53) K.hard(r); else if (a < 0.55) for (const e of ['fire', 'ice', 'earth', 'storm']) K.cast(r, e);
      K.step(r, 1 / 30); r.ev.length = 0;
      for (const m of r.mons) for (let y = m.y; y < m.y + m.h; y++) for (let x = m.x; x < m.x + m.w; x++) assert.equal(r.mon[y * W + x], m.uid, 'seed ' + seed);
      for (let k = 0; k < W * R; k++) { if (r.mon[k] >= 0) assert.equal(r.grid[k], K.MON); else assert.notEqual(r.grid[k], K.MON); }
    }
  }
});
console.log(`${pass} rule tests passed`);

// ---------------------------------------------------------------- bot
// Plans each piece by simulating the landing, settling and match chains on a scratch copy of the well.
function simulate(r, p, rot, x) {
  if (!K.fits(r, p, x, p.y, rot)) return null;
  let y = p.y; while (K.fits(r, p, x, y + 1, rot)) y++;
  const c = K.SHAPES[p.shape].rots[rot];
  if (c.some(([, cy]) => y + cy < K.HID)) return null;
  const s = { grid: r.grid.slice(), mon: r.mon, mons: r.mons, st: r.st, gold: r.gold.slice() };
  if (p.shape === 'BOMB') { let near = 0; for (const m of r.mons) if (Math.abs(m.x - (x + c[0][0])) <= 1 && Math.abs(m.y - (y + c[0][1])) <= 1) near++; return { score: near * 15 - (R - y) * 0.2, rot, x }; }
  c.forEach(([cx, cy], i) => { s.grid[(y + cy) * W + x + cx] = p.cells[i]; });
  const settleS = () => { let mv = true; while (mv) { mv = false; for (let yy = R - 2; yy >= 0; yy--) for (let xx = 0; xx < W; xx++) { const i = yy * W + xx, v = s.grid[i]; if (v && v !== K.MON && !s.grid[i + W]) { s.grid[i + W] = v; s.grid[i] = 0; mv = true; } } } };
  settleS();
  // quality of the shape before any matches: same-colour lines building up (monsters count)
  const colAt = (xx, yy) => { if (xx < 0 || xx >= W || yy < K.HID || yy >= R) return 0; const v = s.grid[yy * W + xx]; if (v >= 1 && v <= 3) return v; if (v === 4) return 9; if (v === K.MON) { const m = r.mons.find((o) => o.uid === r.mon[yy * W + xx]); return m ? m.color : 0; } return 0; };
  let build = 0;
  for (let yy = K.HID; yy < R; yy++) for (let xx = 0; xx < W; xx++) {
    const cc = colAt(xx, yy); if (!cc || cc === 9) continue;
    if (colAt(xx + 1, yy) === cc) build += s.grid[yy * W + xx] === K.MON || s.grid[yy * W + xx + 1] === K.MON ? 1.6 : 0.6;
    if (colAt(xx, yy + 1) === cc) build += s.grid[(yy + 1) * W + xx] === K.MON ? 1.6 : 0.6;
    if (s.grid[(yy + 1) * W + xx] === K.MON && colAt(xx, yy + 1) !== cc && yy + 1 < R) build -= 1.2; // burying a monster under the wrong colour
  }
  let monHits = 0, matched = 0, chain = 0;
  for (;;) {
    const groups = K.findMatches(s); if (!groups.length) break; chain++;
    for (const g of groups) for (const i of g.cells) { if (s.grid[i] === K.MON) monHits++; else { s.grid[i] = 0; matched++; } }
    settleS();
  }
  let maxH = 0, holes = 0;
  for (let xx = 0; xx < W; xx++) { let seen = false; for (let yy = K.HID; yy < R; yy++) { const v = s.grid[yy * W + xx]; if (v && !seen) { seen = true; maxH = Math.max(maxH, R - yy); } } }
  const score = monHits * 14 + matched * 1.2 + chain * 5 + build - maxH * (maxH > 10 ? 2 : 0.4);
  return { score, rot, x };
}
function plan(r) {
  const p = r.piece; let best = null;
  for (let rot = 0; rot < 4; rot++) for (let x = -2; x < W; x++) { const o = simulate(r, p, rot, x); if (o && (!best || o.score > best.score)) best = o; }
  return best;
}
function botRun(S, who, think, seed) {
  const h = S.heroes[who], st = K.heroStats(S, who);
  const cps = K.checkpoints(h); const floor = cps[cps.length - 1];
  const r = K.newRun({ stats: st, seed, floor, firstKill: h.bosses, who });
  const dt = 1 / 30; let wait = 0, target = null, cur = null;
  while (!r.over && r.t < 900) {
    if (r.piece !== cur) {
      cur = r.piece; wait = think * (0.7 + 0.6 * r.rnd());
      target = cur ? plan(r) : null;
      if (cur && r.st.hold && !r.holdUsed && (cur.curse || (target && target.score < -3))) { K.hold(r); cur = null; continue; }
    }
    wait -= dt;
    if (cur && wait <= 0 && r.piece === cur && r.phase === 'play') {
      if (target) { let tries = 0; while (cur.rot !== target.rot && tries++ < 4) if (!K.rotate(r, 1)) break; const dir = Math.sign(target.x - cur.x); tries = 0; while (cur.x !== target.x && tries++ < 10) if (!K.move(r, dir)) break; }
      K.hard(r); if (r.over) break;
    }
    if (r.mons.length) for (const el of ['fire', 'storm']) if (K.canCast(r, el)) K.cast(r, el);
    let stones = 0; for (const v of r.grid) if (v === K.STONE) stones++;
    if (stones > 6 && K.canCast(r, 'earth')) K.cast(r, 'earth');
    if (r.mons.some((m) => m.boss) && !r.fx.frozen && K.canCast(r, 'ice')) K.cast(r, 'ice');
    K.step(r, dt); r.ev.length = 0;
  }
  return r;
}
const PRIORITY = { hammer: 1.6, rhythm: 1.4, str: 3, candle: 2.2, vit: 1.6, greed: 1.8, seer: 1.2, hold: 1.5, armor: 1.3, gold: 1.1, bounty: 1.3, wax: 1.5, fire: 2, frost: 1.4, quake: 1.2, bolt: 1.4, keen: 1, heavy: 0.8, scholar: 1.1, might: 3, needle: 99, grace: 1.5, touch: 1.2 };
function botShop(S, who) {
  const h = S.heroes[who]; let n = 0;
  for (;;) {
    let best = null, bv = 0;
    for (const nd of K.NODES) {
      const lv = h.levels[nd.id] || 0; if (lv >= nd.max || !K.nodeOpen(nd, h.levels, h)) continue;
      const c = K.nodeCost(nd, lv), have = nd.cur === 'f' ? h.feathers : h.kopeks; if (c > have) continue;
      const v = (PRIORITY[nd.id] || 0.7) / (c / (nd.cur === 'f' ? 0.05 : 1));
      if (v > bv) { bv = v; best = nd; }
    }
    // once the Needle can be bought, save kopeks for it
    const nd = K.NODE.needle; if (!h.levels.needle && K.nodeOpen(nd, h.levels, h) && best && best.cur === 'k' && best.id !== 'needle' && h.kopeks - K.nodeCost(best, h.levels[best.id] || 0) < nd.cost) { if (h.kopeks >= nd.cost) best = nd; else break; }
    if (!best) break; K.buy(S, who, best.id); n++;
  }
  return n;
}
if (args.includes('--bots')) {
  const think = opt('--think', 1.2), maxRuns = opt('--runs', 400);
  const S = K.newSave(); const who = 'bogatyr'; const h = S.heroes[who];
  let time = 0; const ms = {};
  const log = [];
  for (let i = 1; i <= maxRuns; i++) {
    const r = botRun(S, who, think, 1000 + i);
    const res = K.result(r); time += res.t + 12; // + time in menus
    const o = K.applyRun(S, who, res); botShop(S, who);
    for (const f of res.bossKills) if (!ms[f]) { ms[f] = { run: i, min: (time / 60).toFixed(1) }; }
    if (i <= 5 || i % 10 === 0 || o.newWin || res.bossKills.length) log.push(`run ${String(i).padStart(3)} ${res.reason.padEnd(6)} t=${res.t.toFixed(0).padStart(3)}s floors ${res.startFloor}->${res.floor} kills ${res.kills} lines ${res.lines} +${res.kopeks}k ${res.feathers ? '+' + res.feathers + 'f ' : ''}lv${h.lv} atk ${K.heroStats(S, who).atk.toFixed(0)} hp ${K.heroStats(S, who).hp}${res.bossKills.length ? ' BOSS ' + res.bossKills.join(',') : ''}${o.newWin ? ' WIN' : ''}`);
    if (o.newWin) break;
  }
  console.log(log.join('\n'));
  console.log('milestones (first boss kills):', Object.entries(ms).map(([f, v]) => `F${f} run ${v.run} @ ${v.min} min`).join(' | '));
  console.log('tree:', Object.entries(h.levels).map(([k, v]) => k + v).join(' '));
}
