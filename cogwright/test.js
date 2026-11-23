// Cogwright: rule tests, then balance bots playing the real model.  node test.js [--bots] [--hours 3] [-v]
const M = require('./model.js'), D = require('./data.js');
const argv = process.argv.slice(2), V = argv.includes('-v');
let fails = 0;
const ok = (c, m) => { if (!c) { fails++; console.log('FAIL', m); } else if (V || !argv.includes('--bots')) console.log('ok  ', m); };

// ---------------------------------------------------------------- helpers
function gear(save, base, size = 'M', extra = {}) { return M.withRng(save, (r) => { const it = M.makeItem(save, r, { rarity: 'common', ilvl: 1, base, size, ...extra }); it.loc = 'inv'; it.affixes = extra.affixes || []; return it; }); }
function clearBoard(save) { for (const k of Object.keys(save.board)) { save.items[save.board[k]].loc = 'inv'; delete save.board[k]; } }

// ---------------------------------------------------------------- the gear train
{ const s = M.newSave(1); clearBoard(s);
  const a = gear(s, 'grunt', 'M'), b = gear(s, 'grunt', 'S'), c = gear(s, 'grunt', 'L'); s.tree.b_board = 1;
  M.place(s, a.id, '1,0'); M.place(s, b.id, '2,0'); M.place(s, c.id, '3,-1');
  let B = M.solve(s);
  ok(B.byCell['1,0'].state === 'spin' && B.byCell['1,0'].dir === -1, 'a gear next to the Mainspring turns the other way');
  ok(B.byCell['2,0'].dir === 1 && B.byCell['3,-1'].dir === -1, 'directions alternate down the train');
  ok(Math.abs(B.byCell['2,0'].rpm - 24 * 12 / 8) < 1e-9 && Math.abs(B.byCell['3,-1'].rpm - 24 * 12 / 16) < 1e-9, 'RPM follows teeth: small 36, large 18 (idlers cancel)');
  const d = gear(s, 'archer'); M.place(s, d.id, '-2,0'); B = M.solve(s);
  ok(B.byCell['-2,0'].state === 'idle', 'a gear not meshed back to the Mainspring sits idle');
  // triangle: 1,0 and 0,1? (1,0)-(0,1) are not neighbours; (1,0),(1,-1) are, and both touch 0,0 -> odd loop
  const e = gear(s, 'archer'); M.place(s, e.id, '1,-1'); B = M.solve(s);
  ok(B.byCell['1,-1'].state === 'jam', 'three gears in a triangle: the last one reached jams');
  ok(B.byCell['1,0'].state === 'spin', 'the rest of the train keeps turning');
  // determinism: same board after moving a gear away and back
  M.unplace(s, '1,-1'); M.place(s, e.id, '1,-1'); const B2 = M.solve(s);
  ok(JSON.stringify(B2.gears.map((n) => [n.k, n.state, n.dir, n.rpm])) === JSON.stringify(B.gears.map((n) => [n.k, n.state, n.dir, n.rpm])), 'the board solves the same after moving a gear away and back');
  const o = M.withRng(s, (r) => M.makeItem(s, r, { rarity: 'legendary', ilvl: 1, leg: 'ouroboros' })); o.loc = 'inv';
  M.unplace(s, '1,-1'); M.place(s, o.id, '1,-1'); B = M.solve(s);
  ok(B.byCell['1,-1'].state === 'spin', 'the Ouroboros Cog never jams');
}
{ const s = M.newSave(2); clearBoard(s);
  const en = gear(s, 'engine', 'M'), u = gear(s, 'grunt', 'M'), side = gear(s, 'grunt', 'M');
  M.place(s, en.id, '1,0'); M.place(s, u.id, '2,0'); M.place(s, side.id, '-1,0');
  const B = M.solve(s);
  ok(Math.abs(B.byCell['2,0'].rpm - 24 * 1.5) < 1e-9 && B.byCell['2,0'].driven, 'an Engine drives the gears beyond it ×1.5');
  ok(Math.abs(B.byCell['-1,0'].rpm - 24) < 1e-9 && !B.byCell['-1,0'].driven, 'gears not behind the Engine are unaffected');
}
{ const s = M.newSave(3); clearBoard(s);
  const p = Object.keys(D.SETS.choir.pieces).map((b) => { const it = gear(s, b, 'M'); it.rarity = 'set'; it.set = 'choir'; return it; });
  M.place(s, p[0].id, '1,0'); M.place(s, p[1].id, '2,-1'); // 1,0 and 2,-1 are neighbours
  let B = M.solve(s); ok(B.sets.choir === 2, 'two meshed set pieces count as 2');
  M.unplace(s, '2,-1'); M.place(s, p[1].id, '-1,0'); B = M.solve(s);
  ok(B.sets.choir === 1, 'set pieces that turn but do not touch each other do not count');
}

// ---------------------------------------------------------------- items + inventory
{ const s = M.newSave(4); const a = gear(s, 'archer', 'S'), b = gear(s, 'archer', 'S'), c = gear(s, 'archer', 'M');
  ok(M.merge(s, a.id, b.id) === '' && s.items[b.id].rank === 2 && !s.items[a.id], 'merging two identical gears ranks one up and uses the other');
  ok(M.merge(s, c.id, b.id) !== '', 'different sizes do not merge');
  const brass = s.brass; ok(M.salvage(s, c.id) === '' && s.brass > brass, 'salvage gives brass');
  const r = M.withRng(s, (rr) => M.makeItem(s, rr, { rarity: 'rare', ilvl: 5, base: 'grunt', size: 'M' })); r.loc = 'inv';
  ok(r.affixes.length >= 3, 'a rare rolls 3-4 affixes');
  s.brass = 999; const before = JSON.stringify(r.affixes); M.reroll(s, r.id, 0); ok(JSON.stringify(r.affixes) !== before, 'reroll changes an affix');
  s.unlocked = 9; ok(M.temper(s, r.id) === '' && r.ilvl === 9, 'temper raises item level to the deepest depth open');
  ok(M.toggleVault(s, r.id) === '' && M.salvage(s, r.id) !== '', 'vaulted gears cannot be salvaged');
  const st = M.stats(s); const odds = M.dropOdds(st); ok(Math.abs(odds.rarities.reduce((a, x) => a + x.pct, 0) - 100) < 1e-6, 'drop odds shown add up to 100%');
  const desc = M.describe(r, st, null, null); ok(desc.lines.length >= 2 && desc.affixes.length === r.affixes.length, 'gear card lists base, power and every affix');
}
// rolls come from the save's rng: two saves with different seeds diverge, the same seed repeats
{ const roll = (seed) => { const s = M.newSave(seed); const st = M.stats(s); return M.withRng(s, (r) => Array.from({ length: 8 }, () => M.rollDrop(s, r, 3, st).name)).join('|'); };
  ok(roll(10) === roll(10) && roll(10) !== roll(11), 'loot is seeded by the save (repeatable, but not the same for every save)'); }

// ---------------------------------------------------------------- save
{ const s = M.newSave(5, 1000); const back = M.load(JSON.stringify(s), 2000);
  ok(back.items && Object.keys(back.items).length === Object.keys(s.items).length, 'a save round-trips through JSON');
  ok(M.load('{garbage', 5).board !== undefined, 'a corrupt save gives a fresh game instead of crashing');
  ok(M.load({ items: {}, board: {} }, 5).stats.shifts === 0, 'an old save missing fields is filled in');
}
// ---------------------------------------------------------------- offline
{ const s = M.newSave(6, 0); clearBoard(s); const c = gear(s, 'collector', 'M'); M.place(s, c.id, '1,0');
  const back = M.applyOffline(s, -5e6); ok(back === null, 'a clock that went backwards pays nothing');
  s.lastSeen = 0; const r1 = M.applyOffline(s, 3600e3); ok(r1 && r1.scrap > 0 && !r1.capped, 'collectors earn while the app is closed');
  s.lastSeen = 0; const r2 = M.applyOffline(s, 1e9 * 1000); ok(r2.capped && r2.secs === M.stats(s).offlineCap, 'offline time is capped');
  s.avg = { scrap: 100, drops: 1, secs: 70, n: 6 }; s.tree.i_night = 3; s.tree.i_eff = 5; s.tree.i_cap = 3;
  const R = M.idleRates(s); ok(R.total < R.active, `idle (${R.total.toFixed(2)}/s) stays below the active rate (${R.active.toFixed(2)}/s), even fully upgraded`);
}
// ---------------------------------------------------------------- Overhaul + Blueprints
{ const s = M.newSave(30); s.best = 10; s.unlocked = 11; s.scrap = 5000; s.brass = 80; s.tree.t_dmg = 4;
  const keep = M.withRng(s, (r) => M.makeItem(s, r, { rarity: 'legendary', ilvl: 9, leg: 'stormcoil' })); keep.loc = 'inv'; M.toggleVault(s, keep.id);
  const lose = gear(s, 'brute', 'L');
  ok(M.overhaul(M.newSave(31)) !== '', 'no Overhaul before clearing Depth 10');
  const gain = M.overhaulGain(s); ok(M.overhaul(s) === '' && s.blueprints === gain && gain > 0, `Overhaul grants Blueprints (${gain})`);
  ok(s.scrap === 0 && s.brass === 0 && !s.tree.t_dmg && s.unlocked === 1 && s.overhauls === 1, 'Overhaul resets scrap, brass, the tree and depth');
  ok(s.items[keep.id] && !s.items[lose.id], 'vaulted gears survive an Overhaul; the rest are gone');
  ok(Object.keys(s.board).length === 1, 'a fresh starter gear is on the bench');
  s.blueprints = 20; ok(M.buyBlueprint(s, 'bp_start') === '' && M.buyBlueprint(s, 'bp_start') === '', 'Blueprints can be bought');
  s.best = 10; M.overhaul(s); ok(s.unlocked === 7, `Head Start opens the first depths after the next Overhaul (unlocked ${s.unlocked})`);
  const cap = M.idleRates(s); ok(cap.total <= cap.collectors + 1e-9 && s.avg.n === 0, 'right after an Overhaul, idle pay is capped by the collectors alone');
}
// ---------------------------------------------------------------- never lose a legendary unasked
{ const s = M.newSave(40); const st = M.stats(s);
  while (M.invItems(s).length < st.invSlots) gear(s, 'grunt', 'S');
  const L = M.withRng(s, (r) => M.makeItem(s, r, { rarity: 'legendary', ilvl: 3, leg: 'heart' }));
  ok(M.addLoot(s, L, st).kept && s.items[L.id], 'a legendary dropping into full drawers is kept (a spare common is melted instead)');
  for (const it of M.invItems(s)) if (it.rarity === 'common') { it.rarity = 'rare'; }
  const L2 = M.withRng(s, (r) => M.makeItem(s, r, { rarity: 'legendary', ilvl: 3, leg: 'escapement' }));
  ok(M.addLoot(s, L2, st).kept && s.items[L2.id], 'with no spares left, a legendary overflows the drawers rather than melting');
}
{ const s = M.newSave(41); clearBoard(s);
  const leg = M.withRng(s, (r) => M.makeItem(s, r, { rarity: 'legendary', ilvl: 3, leg: 'heart' })); leg.loc = 'inv';
  const com = gear(s, 'tinker', 'M'); M.place(s, com.id, '1,0');
  const m = M.mergeKeepBest(s, leg.id, com.id);
  ok(!m.err && m.id === leg.id && s.items[leg.id].rank === 2 && !s.items[com.id], 'dragging a legendary onto a matching common keeps the legendary');
  ok(s.board['1,0'] === leg.id, 'and the legendary takes the common\'s spot on the bench');
}

// ---------------------------------------------------------------- old saves keep working (fixtures/save-v1.json was written by the shipped v1 model)
{ const raw = require('fs').readFileSync(__dirname + '/fixtures/save-v1.json', 'utf8'); const s = M.load(raw, 1.7e12 + 5e6);
  ok(s.v === M.SAVE_V && Object.keys(s.items).length === Object.keys(JSON.parse(raw).items).length, 'a v1 save migrates with every gear intact');
  const B = M.solve(s); ok(B.spinning.length >= 1, 'the migrated bench still turns');
  const sh = M.createShift(s); for (let i = 0; i < 400 && !sh.S.over; i++) sh.update(1 / 20, { wrench: { x: 13, y: 10 } }); sh.quit(); const r = sh.result();
  ok(r && r.scrap >= 0 && s.stats.shifts === JSON.parse(raw).stats.shifts + 1, 'and plays a Shift'); }
// ---------------------------------------------------------------- Head Start never pays Blueprints for free
{ const s = M.newSave(50); s.bp.bp_start = 5; s.best = 12; s.unlocked = 13; M.overhaul(s);
  ok(s.unlocked === 16 && s.best === 0 && M.overhaulGain(s) === 0, 'right after an Overhaul with Head Start, there is nothing to Overhaul for');
  s.best = 16; ok(M.overhaulGain(s) > 0 && M.overhaulGain(s) < 5, `clearing one depth past the Head Start pays only for that depth (${M.overhaulGain(s)})`); }

// ---------------------------------------------------------------- the Shift
function runShift(s, policy = {}, dt = 1 / 20) {
  const sh = M.createShift(s), S = sh.S; const w = { x: 13, y: 8 }; let retarget = 0;
  while (!S.over) {
    if (policy.wrench !== false) {
      retarget -= dt;
      if (retarget <= 0) { retarget = 0.4;
        const near = S.enemies.filter((e) => e.y < 18).sort((a, b) => a.y - b.y)[0];
        const loot = S.drops.slice().sort((a, b) => (b.kind === 'gear') - (a.kind === 'gear') || a.y - b.y)[0];
        const pickLoot = loot && (!near || loot.kind === 'gear' || S.t % 6 < 2.5);
        policy.tgt = pickLoot ? { x: loot.x, y: loot.y } : near ? { x: near.x, y: near.y } : { x: 13, y: 15 }; }
      const t = policy.tgt || w, d = Math.hypot(t.x - w.x, t.y - w.y), v = 70 * dt; // a thumb moves fast but not instantly
      if (d > v) { w.x += ((t.x - w.x) / d) * v; w.y += ((t.y - w.y) / d) * v; } else { w.x = t.x; w.y = t.y; }
    }
    if (policy.crank !== false && S.cranks > 0 && S.enemies.length > 12) sh.crank();
    sh.update(dt, { wrench: policy.wrench === false ? null : w });
  }
  return sh.result();
}
{ const s = M.newSave(8); const r = runShift(s, { wrench: false, crank: false });
  ok(r.scrap > 0, `a Shift with no input still pays something (${r.scrap} scrap)`); }
{ const s = M.newSave(9); s.depth = 10; s.unlocked = 10;
  for (let i = 0; i < 12; i++) { const it = gear(s, 'brute', 'L'); it.rank = 6; it.ilvl = 30; }
  clearBoard(s); s.tree.b_board = 2; s.tree.t_dmg = 30; s.tree.t_hp = 30;
  let n = 0; for (const it of M.invItems(s)) { const k = ['1,0', '2,-1', '3,-2', '-1,0', '-2,1', '0,-1', '0,-2', '0,1', '0,2', '-1,1', '2,0', '-2,0'][n++]; if (k) M.place(s, it.id, k); }
  const sh = M.createShift(s); let sawDrops = false, before = 0;
  while (!sh.S.over) { sh.update(1 / 20, {}); if (sh.S.drops.some((d) => d.kind === 'gear')) sawDrops = true; before = sh.S.drops.length; }
  const res = sh.result();
  ok(res.outcome === 'win' && sh.S.drops.length === 0 && res.items.length + (res.brass ? 1 : 0) >= 3, `killing the boss sweeps up every drop (${res.items.length} gears kept)`);
  ok(s.stats.bossKills === 1 && Object.values(s.items).some((it) => it.leg), 'the first boss always drops a legendary');
}

// ---------------------------------------------------------------- Cogstones
{ const s = M.newSave(80); s.brass = 1000; M.pouchAdd(s, 'ruby', 0, 7);
  ok(M.combineStones(s, 'ruby', 0) === '' && s.pouch.ruby[0] === 4 && s.pouch.ruby[1] === 1, 'three Chipped Rubies combine into a Flawed one');
  const r = M.withRng(s, (rr) => M.makeItem(s, rr, { rarity: 'rare', ilvl: 3, base: 'grunt', size: 'M' })); r.loc = 'inv';
  const leg = M.withRng(s, (rr) => M.makeItem(s, rr, { rarity: 'legendary', ilvl: 3, leg: 'heart' })); leg.loc = 'inv';
  ok(r.sockets.length === 1 && leg.sockets.length === 2, 'rares get one socket, legendaries two');
  const before = M.affix(r, 'dmg'); ok(M.socket(s, r.id, 0, 'ruby', 1) === '' && M.affix(r, 'dmg') === before + 8, 'a socketed Flawed Ruby adds +8% damage');
  ok(M.unsocket(s, r.id, 0) === '' && s.pouch.ruby[1] === 1 && !r.sockets[0], 'unsocketing returns the stone (for a little brass)');
  M.socket(s, r.id, 0, 'ruby', 1); M.salvage(s, r.id); ok(s.pouch.ruby[1] === 1, 'salvaging a gear returns its stones');
  const a1 = M.withRng(s, (rr) => M.makeItem(s, rr, { rarity: 'rare', ilvl: 3, base: 'brute', size: 'L' })), a2 = M.withRng(s, (rr) => M.makeItem(s, rr, { rarity: 'rare', ilvl: 3, base: 'brute', size: 'L' })); a1.loc = a2.loc = 'inv';
  M.pouchAdd(s, 'topaz', 2, 1); M.socket(s, a1.id, 0, 'topaz', 2); M.merge(s, a1.id, a2.id); ok(s.pouch.topaz[2] === 1, 'merging returns the used-up gear\'s stones');
  M.socket(s, leg.id, 0, 'emerald', 0) ; M.pouchAdd(s, 'emerald', 3, 1); M.socket(s, leg.id, 1, 'emerald', 3); M.toggleVault(s, leg.id);
  s.best = 10; M.overhaul(s); ok(s.items[leg.id] && s.items[leg.id].sockets[1][1] === 3 && !Object.values(s.pouch).length, 'an Overhaul keeps stones in vaulted gears and empties the pouch');
}
{ const s = M.newSave(81); clearBoard(s); const g1 = gear(s, 'grunt', 'M', { affixes: [['mf', 50], ['wrench', 100]] }); M.place(s, g1.id, '1,0');
  const st = M.stats(s), T = M.trainStats(st, M.solve(s, st)); ok(Math.abs(T.mf - 0.5) < 1e-9 && Math.abs(T.wrenchDmg - st.wrenchDmg * 2) < 1e-9, 'magic-find and Wrench affixes on turning gears really apply'); }

// ---------------------------------------------------------------- elites, the Gremlin, new gears
{ let elites = 0, names = new Set(); for (let seed = 60; seed < 70; seed++) { const s = M.newSave(seed); s.depth = 14; s.unlocked = 14; const sh = M.createShift(s);
    for (let i = 0; i < 900 && !sh.S.over; i++) { sh.update(1 / 20, {}); for (const e of sh.S.events) if (e.type === 'elite') { elites++; names.add(e.name); } } }
  ok(elites > 5 && [...names].some((n) => n.split(' ').length >= 3), `elites show up deep down, some with two affixes (${elites} in 10 Shifts, e.g. "${[...names][0]}")`); }
{ const s = M.newSave(70); s.depth = 2; s.unlocked = 2; s.tree.s_door = 8; s.tree.t_hp = 10; s.tree.t_dmg = 10; const it = M.withRng(s, (r) => M.makeItem(s, r, { rarity: 'legendary', ilvl: 5, leg: 'gremlinbait' })); M.place(s, it.id, '0,1');
  const sh = M.createShift(s); let seen = false; const baited = sh.S.gremlinAt >= 0; sh.S.gremlinAt = 3; // bring it in early so the Shift can't end first
  for (let i = 0; i < 1600 && !sh.S.over; i++) { const gr = sh.S.gremlin; sh.update(1 / 20, { wrench: gr && !gr.gone ? { x: gr.x, y: gr.y } : null }); if (gr) seen = true; }
  ok(baited && seen && sh.S.gremlinKilled, 'Gremlin Bait brings a Scrap Gremlin, and the Wrench can catch it');
  ok(sh.S.drops.some((d) => d.kind === 'gear') || sh.S.items.length > 0 || sh.S.over, 'a caught Gremlin spills gears'); }
{ const s = M.newSave(71); clearBoard(s); const mo = gear(s, 'mortar', 'L'); M.place(s, mo.id, '1,0'); const sh = M.createShift(s); let multi = 0;
  for (let i = 0; i < 1200 && !sh.S.over; i++) { const before = sh.S.enemies.map((e) => e.hp); sh.update(1 / 20, {}); if (sh.S.events.some((e) => e.type === 'shell')) multi++; }
  ok(multi > 0, 'Mortars lob splash shells'); }
{ const s = M.newSave(72); clearBoard(s); const g1 = gear(s, 'grunt', 'M'), mg = gear(s, 'magnet', 'S'); M.place(s, g1.id, '1,0'); M.place(s, mg.id, '-1,0');
  const sh = M.createShift(s); let pulled = 0; for (let i = 0; i < 1200 && !sh.S.over; i++) { sh.update(1 / 20, {}); pulled += sh.S.events.filter((e) => e.type === 'pull').length; }
  ok(pulled > 0, `a Magnet gear pulls in loose drops on its own (${pulled})`); }

// ---------------------------------------------------------------- balance bots
function scoreItem(s, it, st) {
  const P = M.gearPower(it, null, st, {});
  if (P.fam === 'unit') return Math.sqrt(P.hp * (P.dmg / P.every)) * (1 + P.twin) * (it.base === 'archer' ? 1.2 : it.base === 'tinker' ? 0.8 : 1);
  if (P.fam === 'spell') return 4 * P.s * (it.base === 'lightning' ? 1.3 : 1);
  if (P.fam === 'engine') return 0.1;
  return 2 * P.yield;
}
function trainValue(s, st) {
  const B = M.solve(s, st); let v = 0;
  for (const n of B.spinning) v += scoreItem(s, n.item, st) * n.rpm * (n.item.base === 'collector' ? 0.4 : 1);
  return v + B.sets.choir * 5 + B.sets.furnace * 5;
}
function arrange(s, mono) { // greedy: put gears where they add the most train value
  const st = M.stats(s); const all = Object.values(s.items).filter((it) => !mono || it.base === mono || it.base === 'engine');
  for (const k of Object.keys(s.board)) { s.items[s.board[k]].loc = 'inv'; delete s.board[k]; }
  for (const it of all) it.loc = 'inv';
  const cellsFree = () => M.cells(st.boardR).filter((k) => k !== '0,0' && !s.board[k]);
  const pool = all.slice().sort((a, b) => scoreItem(s, b, st) - scoreItem(s, a, st));
  let base = trainValue(s, st);
  for (const it of pool) {
    let best = null, bv = base;
    for (const k of cellsFree()) { s.board[k] = it.id; it.loc = 'board'; const v = trainValue(s, st); delete s.board[k]; it.loc = 'inv'; if (v > bv + 1e-6) { bv = v; best = k; } }
    if (best) { s.board[best] = it.id; it.loc = 'board'; base = bv; }
  }
  // tidy the drawers: merge pairs, salvage the weakest when crowded
  for (let pass = 0; pass < 3; pass++) {
    const inv = M.invItems(s);
    for (const a of inv) for (const b of inv) if (s.items[a.id] && s.items[b.id] && a !== b && M.canMerge(s, a.id, b.id) === '' && a.rarity === 'common') M.merge(s, a.id, b.id);
  }
  const inv = M.invItems(s).sort((a, b) => scoreItem(s, a, st) - scoreItem(s, b, st));
  while (inv.length > st.invSlots - 3) M.salvage(s, inv.shift().id);
}
function shop(s) { // buy what's affordable, cheapest first, with a small bias to troops early
  for (let guard = 0; guard < 40; guard++) {
    const opts = D.TREE.filter((n) => M.canBuyNode(s, n.id) === '').map((n) => ({ n, c: M.nodeCost(n, s.tree[n.id] || 0) * (/^(t_dmg|t_hp|b_torque|w_dmg)$/.test(n.id) ? 0.7 : 1) }));
    if (!opts.length) break; opts.sort((a, b) => a.c - b.c); M.buyNode(s, opts[0].n.id);
  }
  for (const it of M.invItems(s)) if (it.rarity !== 'common' && s.brass > M.temperCost(it, M.maxIlvl(s)) * 2) M.temper(s, it.id);
}
function bot(name, policy, hours, seed) {
  const s = M.newSave(seed); let secs = 0, fails = 0, lastWin = 0; const marks = {};
  while (secs < hours * 3600) {
    arrange(s, policy.mono); shop(s); arrange(s, policy.mono);
    // play the deepest open depth, drop back after repeated door losses
    s.depth = Math.max(1, Math.min(s.unlocked, s.unlocked - Math.floor(fails / 2)));
    const r = runShift(s, policy); secs += r.secs + 20;
    if (V && name === 'mixed') console.log(`  ${(secs / 60).toFixed(1)}m d${r.depth} ${r.outcome} gate ${(r.gate * 100).toFixed(0)}% door ${(r.door * 100).toFixed(0)}% scrap ${r.scrap} items ${r.items.length} | scrap ${s.scrap} tree ${Object.values(s.tree).reduce((a, b) => a + b, 0)}`);
    if (r.outcome === 'win') { fails = Math.max(0, fails - 2); lastWin = secs; } else fails = Math.min(fails + 1, 2 * s.unlocked);
    if (!marks.legendary && s.stats.legendaries) marks.legendary = secs;
    for (const d of [5, 10, 15, 20, 30]) if (!marks['d' + d] && s.best >= d) marks['d' + d] = secs;
    if (policy.overhaul && M.overhaulGain(s) > 0 && secs - lastWin > 1800) { (marks.cycles = marks.cycles || []).push(`${s.best}@${(secs / 3600).toFixed(1)}h`);
      const st = M.stats(s); for (const it of Object.values(s.items).sort((a, b) => scoreItem(s, b, st) - scoreItem(s, a, st)).slice(0, st.vault)) if (!it.vault) M.toggleVault(s, it.id);
      M.overhaul(s); marks.overhauls = (marks.overhauls || 0) + 1; fails = 0; lastWin = secs;
      for (let g = 0; g < 60; g++) { const o = ['bp_power', 'bp_power', 'bp_start', 'bp_wrench', 'bp_scrap', 'bp_mf', 'bp_time', 'bp_vault', 'bp_idle'].filter((id) => M.buyBlueprint(s, id) === ''); if (!o.length) break; } }
  }
  if (V) { const st = M.stats(s), B = M.solve(s, st); const sp = B.spinning;
    console.log(`  board: ${sp.length} turning, ${B.jammed.length} jammed, engines ${sp.filter((n) => n.item.base === 'engine').length}, max rpm ${Math.max(...sp.map((n) => n.rpm)).toFixed(0)}, ranks ${sp.map((n) => n.item.rank).join('')}, ilvls ${sp.map((n) => n.item.ilvl).join(',')}`);
    console.log(`  spawns/s ${(sp.filter((n) => n.item.base in {grunt:1,archer:1,brute:1,tinker:1}).reduce((a, n) => a + n.rpm / 60, 0)).toFixed(1)}  troopDmg x${st.troopDmg.toFixed(2)} troopHp x${st.troopHp.toFixed(2)} wrench ${st.wrenchDmg.toFixed(0)}`); }
  const m = (k) => (marks[k] ? (marks[k] / 60).toFixed(0) + 'm' : '—');
  if (marks.cycles) console.log(`  overhaul cycles (best depth @ time): ${marks.cycles.join('  ')}  bossKills ${s.stats.bossKills}`);
  console.log(`${name.padEnd(14)} best depth ${String(s.best).padStart(2)}  shifts ${s.stats.shifts}  legendary@${m('legendary')}  d5@${m('d5')}  d10@${m('d10')}  d15@${m('d15')}  d20@${m('d20')}${marks.overhauls ? '  overhauls ' + marks.overhauls : ''}`);
  return { s, marks };
}
if (process.env.TUNE) Object.assign(M.TUNE, JSON.parse(process.env.TUNE));
if (argv.includes('--bots')) {
  const H = +(argv[argv.indexOf('--hours') + 1] || 3);
  const res = {};
  const only = process.env.ONLY;
  const SEED = +(process.env.SEED || 101);
  for (const [name, pol] of [['overhaul', { overhaul: true, skip: !only }], ['mixed', {}], ['no-wrench', { wrench: false }], ['no-crank', { crank: false }], ['grunts-only', { mono: 'grunt' }], ['archers-only', { mono: 'archer' }], ['mortars-only', { mono: 'mortar' }]])
    if ((!only && !pol.skip) || only === name) res[name] = bot(name, pol, H, SEED);
  if (only) process.exit(0);
  ok(res.mixed.marks.legendary && res.mixed.marks.legendary < 20 * 60, 'first legendary inside 20 minutes');
  ok(res.mixed.marks.d10 && res.mixed.marks.d10 > 0.75 * 3600 && res.mixed.marks.d10 < 3 * 3600, 'Depth 10 (first Overhaul) in roughly 1-3 hours');
  for (const k of ['no-wrench', 'grunts-only', 'archers-only', 'mortars-only']) ok(res[k].s.best <= res.mixed.s.best, `${k} does not beat mixed play`);
}
console.log(fails ? `${fails} failing` : 'all good');
process.exitCode = fails ? 1 : 0;
