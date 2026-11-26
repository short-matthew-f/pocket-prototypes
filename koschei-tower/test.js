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
function empty(r) { r.grid.fill(0); r.gold.fill(0); r.mon.fill(-1); r.mons.length = 0; r.dropQ.length = 0; r.res = 'idle'; }
function putMon(r, x, y, hp, s = 1) { const m = { uid: 900 + r.mons.length, x, y, w: s, h: s, hp, max: hp, shield: 0, n: 0, dmg: 5, weak: 'fire', gold: 10, xp: 5, floor: 1, size: s, name: 'T', boss: false, script: [{ k: 'attack', n: 1 }], intent: { k: 'attack', n: 1, dmg: 5, t: 999, total: 999 } };
  for (let yy = y; yy < y + s; yy++) for (let xx = x; xx < x + s; xx++) { r.grid[yy * W + xx] = K.MON; r.mon[yy * W + xx] = m.uid; } r.mons.push(m); return m; }
const settle = (r, sec = 2) => { for (let i = 0; i < sec * 60 && !r.over; i++) K.step(r, 1 / 60); };
const place = (r, cells, x, shape = 'D2', rot = 0) => { r.piece = { shape, el: cells[0], cells, gold: cells.map(() => 0), x, y: 3, rot }; K.hard(r); };
const quiet = (r) => { r.st.fall = 1e9; r.st.foeSlow = 1e9; };
t('rotations keep cell count and stay in box', () => {
  for (const k in K.SHAPES) { const s = K.SHAPES[k]; for (const c of s.rots) { assert.equal(c.length, s.c.length); for (const [x, y] of c) assert(x >= 0 && y >= 0 && x < s.n && y < s.n, k); } }
});
t('a run starts with monsters dropped in and more to come', () => {
  const r = K.newRun({ stats: ST(), seed: 1, floor: 9 }); assert(r.mons.length === 2 && r.dropQ.length >= 1 && r.piece);
  for (const m of r.mons) assert(m.intent && m.intent.t > 0);
});
t('two Knights side by side attack the monster they touch (melee)', () => {
  const r = K.newRun({ stats: ST(), seed: 2 }); empty(r); quiet(r);
  const m = putMon(r, 0, R - 1, 9999); place(r, [1, 1], 1); settle(r, 1);
  assert(m.hp < 9999); assert.equal(r.grid[(R - 1) * W + 1], 0);
});
t('Knights out of reach whiff', () => {
  const r = K.newRun({ stats: ST(), seed: 3 }); empty(r); quiet(r);
  const m = putMon(r, 0, R - 1, 9999); place(r, [1, 1], 4); settle(r, 1);
  assert.equal(m.hp, 9999); assert.equal(r.grid[(R - 1) * W + 4], 0, 'they still leave');
});
t('Archers shoot along their row from afar', () => {
  const r = K.newRun({ stats: ST(), seed: 4 }); empty(r); quiet(r);
  const m = putMon(r, 0, R - 1, 9999); place(r, [3, 3], 5); settle(r, 1); assert(m.hp < 9999);
});
t('Mages hit the nearest monster anywhere and splash its neighbour', () => {
  const r = K.newRun({ stats: ST(), seed: 5 }); empty(r); quiet(r);
  const a = putMon(r, 0, R - 1, 9999), b = putMon(r, 1, R - 1, 9999), far = putMon(r, 7, R - 6, 9999);
  r.grid[(R - 1) * W + 7] = 5; for (let y = R - 5; y < R; y++) r.grid[y * W + 7] = 5;
  place(r, [2, 2], 2); settle(r, 1); assert(a.hp < 9999 || b.hp < 9999); assert(a.hp < 9999 && b.hp < 9999, 'splash');
});
t('monsters fall as solid blocks when what holds them is cleared', () => {
  const r = K.newRun({ stats: ST(), seed: 6 }); empty(r); quiet(r);
  r.grid[(R - 1) * W + 0] = 1; r.grid[(R - 1) * W + 1] = 5; const m = putMon(r, 0, R - 2, 9999);
  place(r, [1], 2, 'P1'); // not adjacent to the knight below; just triggers a settle
  r.grid[(R - 1) * W + 0] = 0; r.res = 'settle'; settle(r, 1); assert.equal(m.y, R - 1);
});
t('a slain monster pays out and the floor ends when the wave is gone', () => {
  const r = K.newRun({ stats: ST(), seed: 7 }); empty(r); quiet(r);
  putMon(r, 0, R - 1, 1); place(r, [1, 1], 1); settle(r, 1); assert.equal(r.kills, 1); assert(r.kopeks > 0);
  settle(r, 2); assert.equal(r.floor, 2);
});
t('monsters act on their telegraphed intent', () => {
  const r = K.newRun({ stats: ST(), seed: 8 }); empty(r); r.st.fall = 1e9;
  const m = putMon(r, 3, R - 1, 500); m.script = [{ k: 'attack', n: 1 }, { k: 'rocks', n: 2 }]; m.intent = { k: 'attack', n: 1, dmg: 7, t: 0.01, total: 1 }; m.every = 5;
  const hp0 = r.hp; K.step(r, 0.02); assert.equal(r.hp, hp0 - 7); assert.equal(m.intent.k, 'attack');
  m.intent = { k: 'rocks', n: 2, dmg: 0, t: 0.01, total: 1 }; K.step(r, 0.02); let st = 0; for (const v of r.grid) if (v === K.STONE) st++; assert(st >= 1);
});
t('chains: a settle that forms a new group attacks again', () => {
  const r = K.newRun({ stats: ST(), seed: 9 }); empty(r); quiet(r);
  const m = putMon(r, 0, R - 1, 99999);
  r.grid[(R - 1) * W + 1] = 3; r.grid[(R - 1) * W + 2] = 2; r.grid[(R - 2) * W + 2] = 3; // archer | mage with an archer on top
  place(r, [2], 3, 'P1'); // mage pair fires, the top archer drops beside the other archer: a second group
  settle(r, 2); assert(r.best.lines >= 2, 'chain ' + r.best.lines); assert(m.hp < 99999);
});
t('overflow costs HP and keeps playing', () => {
  const r = K.newRun({ stats: ST(), seed: 10 }); empty(r); quiet(r); putMon(r, 0, R - 1, 500);
  for (let y = 0; y < R; y++) for (let x = 0; x < W; x++) if (r.grid[y * W + x] !== K.MON) r.grid[y * W + x] = 5;
  const hp0 = r.hp; r.res = 'settle'; settle(r, 0.5); assert(r.hp < hp0 && !r.over);
});
t('the candle ends the run', () => {
  const r = K.newRun({ stats: ST(), seed: 11 }); quiet(r);
  for (let i = 0; i < 80 * 30 && !r.over; i++) K.step(r, 1 / 30);
  assert(r.over && r.reason === 'candle');
});
t('Koschei cannot die without the Needle', () => {
  const r = K.newRun({ stats: ST(), seed: 12, floor: 30 });
  const m = r.mons.find((o) => o.boss); assert(m && m.deathless && m.w === 2); r.st.atk = 1e9; r.st.spells.fire = 1; r.mana.fire = 99;
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
// Plans each piece with K.preview: damage it would deal now (kills count extra), minus a messy, tall stack.
function score(r, pv) {
  let s = 0;
  for (const uid in pv.dmgBy) { const m = r.mons.find((o) => o.uid === +uid); if (!m) continue; const d = Math.min(pv.dmgBy[uid], m.hp + m.shield); s += d / Math.max(1, r.st.atk) + (d >= m.hp + m.shield ? 6 : 0); }
  s += pv.groups.length * 0.4;
  let maxH = 0, singles = 0; const g = pv.grid;
  for (let x = 0; x < W; x++) for (let y = K.HID; y < R; y++) if (g[y * W + x]) { maxH = Math.max(maxH, R - y); break; }
  // heroes that sit next to a same-type hero are one drop away from a group: a little credit for setting up
  for (let i = K.HID * W; i < W * R; i++) { const v = g[i]; if (v < 1 || v > 4) continue; singles++; }
  s -= maxH * (maxH > 10 ? 1.5 : 0.3) + singles * 0.08;
  return s;
}
function plan(r) {
  const p = r.piece; let best = null;
  for (let rot = 0; rot < 4; rot++) for (let x = -2; x < W; x++) { const pv = K.preview(r, p, x, rot); if (!pv) continue; const sc = score(r, pv); if (!best || sc > best.score) best = { score: sc, rot, x }; }
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
      if (cur && r.st.hold && !r.holdUsed && cur.curse) { K.hold(r); cur = null; continue; }
    }
    wait -= dt;
    if (cur && wait <= 0 && r.piece === cur) {
      if (target) { target = plan(r) || target; let tries = 0; while (cur.rot !== target.rot && tries++ < 4) if (!K.rotate(r, 1)) break; const dir = Math.sign(target.x - cur.x); tries = 0; while (cur.x !== target.x && tries++ < 10) if (!K.move(r, dir)) break; }
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
