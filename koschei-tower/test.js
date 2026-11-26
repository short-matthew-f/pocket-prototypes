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
function empty(r) { r.grid.fill(0); r.mon.fill(-1); r.mons.length = 0; r.spawnQ.length = 0; }
function putMon(r, x, y, s, hp) { const m = { uid: 900 + r.mons.length, x, y, w: s, h: s, hp, max: hp, atk: ['garbage1'], n: 0, atkT: 0, every: 99, dmg: 5, weak: 'fire', resist: 'ice', gold: 10, xp: 5, floor: 1, size: s, name: 'T' };
  for (let yy = y; yy < y + s; yy++) for (let xx = x; xx < x + s; xx++) { r.grid[yy * W + xx] = K.MON; r.mon[yy * W + xx] = m.uid; } r.mons.push(m); return m; }
t('rotations keep cell count and stay in box', () => {
  for (const k in K.SHAPES) { const s = K.SHAPES[k]; for (const c of s.rots) { assert.equal(c.length, s.c.length); for (const [x, y] of c) assert(x >= 0 && y >= 0 && x < s.n && y < s.n, k); } }
});
t('a run starts with a monster in the well and a hero piece', () => {
  const r = K.newRun({ stats: ST(), seed: 1 });
  assert(r.piece && r.mons.length === 1 && r.mons[0].w === 2);
  assert(r.piece.cells.every((c) => c >= 1 && c <= 6));
  const m = r.mons[0]; for (let y = m.y; y < m.y + 2; y++) for (let x = m.x; x < m.x + 2; x++) assert.equal(r.grid[y * W + x], K.MON);
});
t('landing a knight beside a monster wounds it', () => {
  const r = K.newRun({ stats: ST(), seed: 2 }); empty(r);
  const m = putMon(r, 0, R - 2, 2, 500);
  r.piece = { shape: 'P1', el: 1, cells: [1], x: 2, y: 3, rot: 0 }; K.hard(r);
  assert(m.hp < 500, 'hp ' + m.hp);
});
t('heroes in reach keep fighting every second', () => {
  const r = K.newRun({ stats: ST(), seed: 3 }); empty(r);
  const m = putMon(r, 0, R - 2, 2, 500); r.grid[(R - 1) * W + 2] = 1; r.st.fall = 1e9;
  const hp0 = m.hp; for (let i = 0; i < 70; i++) K.step(r, 1 / 60);
  assert(m.hp < hp0);
});
t('a full row clears and volleys every monster; rows with a monster do not clear', () => {
  const r = K.newRun({ stats: ST(), seed: 4 }); empty(r);
  const m = putMon(r, 0, R - 3, 2, 500);
  for (let x = 0; x < W - 1; x++) r.grid[(R - 1) * W + x] = 2;
  for (let x = 2; x < W - 1; x++) r.grid[(R - 2) * W + x] = 3;
  r.piece = { shape: 'I3', el: 1, cells: [1, 1, 1], x: 6, y: 3, rot: 1 }; K.hard(r);
  assert.equal(r.lines, 1); assert(m.hp < 500); assert.equal(r.grid[(R - 1) * W + 3], 3, 'monster row stayed'); assert.equal(m.y, R - 2);
});
t('a slain monster leaves a hole that loose heroes fall into', () => {
  const r = K.newRun({ stats: ST(), seed: 5 }); empty(r);
  putMon(r, 0, R - 2, 2, 1); r.grid[(R - 3) * W + 0] = 3; r.grid[(R - 3) * W + 1] = 3;
  r.piece = { shape: 'P1', el: 1, cells: [1], x: 2, y: 3, rot: 0 }; K.hard(r);
  assert.equal(r.mons.length, 0); assert.equal(r.grid[(R - 1) * W + 0], 3); assert.equal(r.kills, 1);
});
t('clearing the floor brings the next one', () => {
  const r = K.newRun({ stats: ST(), seed: 6 }); r.st.fall = 1e9; r.st.atk = 1e6;
  const m = r.mons[0]; r.piece = { shape: 'P1', el: 1, cells: [1], x: m.x === 0 ? 2 : m.x - 1, y: 3, rot: 0 }; K.hard(r);
  assert.equal(r.floor, 2); for (let i = 0; i < 90; i++) K.step(r, 1 / 60); assert(r.mons.length >= 1 && r.mons[0].floor === 2);
});
t('monster strike adds a stone row and lifts the monster', () => {
  const r = K.newRun({ stats: ST(), seed: 7 }); empty(r); r.st.fall = 1e9;
  const m = putMon(r, 3, R - 2, 2, 500); m.every = 1; m.atkT = 0.99; const hp0 = r.hp;
  K.step(r, 0.02); assert(r.hp < hp0); assert.equal(m.y, R - 3);
  let st = 0; for (let x = 0; x < W; x++) if (r.grid[(R - 1) * W + x] === K.STONE) st++; assert.equal(st, W - 1);
});
t('overflow costs HP and keeps playing', () => {
  const r = K.newRun({ stats: ST(), seed: 8 }); empty(r);
  for (let y = 1; y < R; y++) for (let x = 1; x < W; x++) r.grid[y * W + x] = 5;
  const hp0 = r.hp; K.hard(r); assert(r.hp < hp0 && !r.over);
});
t('the candle ends the run', () => {
  const r = K.newRun({ stats: ST(), seed: 9 }); r.st.fall = 1e9; r.st.foeSlow = 1e9;
  for (let i = 0; i < 40 * 30 && !r.over; i++) K.step(r, 1 / 30);
  assert(r.over && r.reason === 'candle');
});
t('Koschei cannot die without the Needle', () => {
  const r = K.newRun({ stats: ST(), seed: 10, floor: 30 });
  const m = r.mons[0]; assert(m.deathless && m.w === 3); r.st.atk = 1e9; r.st.spells.fire = 1; r.mana.fire = 99;
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
    const r = K.newRun({ stats: K.stats('bogatyr', { str: 10 }, 8, { mortar: 1 }), seed, floor: 1 + (seed % 30) }); r.st.spells = { fire: 1, ice: 1, earth: 1, storm: 1 };
    for (let i = 0; i < 4000 && !r.over; i++) {
      const a = r.rnd(); if (a < 0.2) K.move(r, -1); else if (a < 0.4) K.move(r, 1); else if (a < 0.5) K.rotate(r, 1); else if (a < 0.53) K.hard(r); else if (a < 0.55) for (const e of ['fire', 'ice', 'earth', 'storm']) K.cast(r, e);
      K.step(r, 1 / 30); r.ev.length = 0;
      for (const m of r.mons) for (let y = m.y; y < m.y + m.h; y++) for (let x = m.x; x < m.x + m.w; x++) assert.equal(r.mon[y * W + x], m.uid, 'seed ' + seed);
      let n = 0; for (let k = 0; k < W * R; k++) { if (r.mon[k] >= 0) { n++; assert.equal(r.grid[k], K.MON); } else assert.notEqual(r.grid[k], K.MON); }
      assert.equal(n, r.mons.reduce((a2, m) => a2 + m.w * m.h, 0));
    }
  }
});
console.log(`${pass} rule tests passed`);

// ---------------------------------------------------------------- bot
function evalGrid(g) {
  let agg = 0, holes = 0, bump = 0, prev = -1, wells = 0; const hs = [];
  for (let x = 0; x < W; x++) {
    let h = 0, seen = false;
    for (let y = 0; y < R; y++) { const v = g[y * W + x]; if (v && !seen) { seen = true; h = R - y; } else if (!v && seen) holes++; }
    hs.push(h); agg += h; if (prev >= 0) bump += Math.abs(h - prev); prev = h;
  }
  for (let x = 0; x < W; x++) { const l = x ? hs[x - 1] : 99, r = x < W - 1 ? hs[x + 1] : 99; const d = Math.min(l, r) - hs[x]; if (d > 2) wells += d - 2; }
  return { agg, holes, bump, wells, max: Math.max(...hs) };
}
function simDrop(r, p, rot, x) {
  if (!K.fits(r, p, x, p.y, rot)) return null;
  let y = p.y; while (K.fits(r, p, x, y + 1, rot)) y++;
  const c = K.SHAPES[p.shape].rots[rot];
  if (p.shape === 'BOMB') { let touch = 0; for (const m of r.mons) if (K.distRect(x + c[0][0], y + c[0][1], m) <= 1) touch++; return { score: touch * 5 - (R - y) * 0.1, rot, x }; }
  const g = r.grid.slice(); let fight = 0;
  c.forEach(([cx, cy], i) => { if (y + cy < 0) return; g[(y + cy) * W + x + cx] = p.cells[i] || 1; const code = p.cells[i]; if (code >= 1 && code <= 4) { const n = K.reach(r, x + cx, y + cy, code).length; fight += n * (code === 1 ? 1.4 : code === 4 ? 0.5 : 1); } });
  if (c.some(([, cy]) => y + cy < 0)) return null;
  let lines = 0;
  for (let yy = 0; yy < R; yy++) { let f = true; for (let xx = 0; xx < W; xx++) { const v = g[yy * W + xx]; if (!v || v === K.MON) { f = false; break; } } if (f) { lines++; g.copyWithin(W, 0, yy * W); g.fill(0, 0, W); } }
  const e = evalGrid(g);
  const danger = e.max > 10 ? 2 : 1;
  const score = -0.51 * e.agg + 0.9 * lines * (lines >= 2 ? 1.3 : 1) * danger - 0.7 * e.holes - 0.18 * e.bump - 0.2 * e.wells - (e.max > 12 ? 5 : 0) + fight * 0.9 / danger;
  return { score, rot, x, lines };
}
function plan(r) {
  const p = r.piece; let best = null;
  for (let rot = 0; rot < 4; rot++) for (let x = -2; x < W; x++) { const o = simDrop(r, p, rot, x); if (o && (!best || o.score > best.score)) best = o; }
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
      // try hold if it would be better (simple: compare with held/next)
      if (cur && r.st.hold && !r.holdUsed && target && (target.score < -12 || cur.curse)) { K.hold(r); cur = null; continue; }
    }
    wait -= dt;
    if (cur && wait <= 0 && r.piece === cur) {
      if (target) { let tries = 0; while (cur.rot !== target.rot && tries++ < 4) if (!K.rotate(r, 1)) break; const dir = Math.sign(target.x - cur.x); tries = 0; while (cur.x !== target.x && tries++ < 10) if (!K.move(r, dir)) break; }
      K.hard(r); if (r.over) break;
    }
    // spells
    if (r.mons.length) for (const el of ['fire', 'storm']) if (K.canCast(r, el)) K.cast(r, el);
    const e = evalGrid(r.grid);
    if (e.max > 9 && K.canCast(r, 'earth')) K.cast(r, 'earth');
    if ((e.max > 10 || r.mons.some((m) => m.boss)) && !r.fx.frozen && K.canCast(r, 'ice')) K.cast(r, 'ice');
    K.step(r, dt);
  }
  return r;
}
const PRIORITY = { hammer: 2, rhythm: 1.6, str: 3, candle: 2.2, vit: 1.6, greed: 1.8, seer: 1.2, hold: 1.5, armor: 1.3, gold: 1.1, bounty: 1.3, wax: 1.5, fire: 2, frost: 1.4, quake: 1.2, bolt: 1.4, keen: 1, heavy: 0.8, scholar: 1.1, might: 3, needle: 99, grace: 1.5, touch: 1.2 };
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
