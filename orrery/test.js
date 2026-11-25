// Orrery tests: rules first, then (with --bots) a bot that plays the campaign the way a player would.
// node orrery/test.js [--bots] [--runs 120]
const M = require('./model.js');
let fails = 0;
const ok = (c, m) => { if (!c) { fails++; console.log('FAIL', m); } else console.log('ok  ', m); };
const near = (a, b, e = 1e-6) => Math.abs(a - b) < e;

// ---------------------------------------------------------------- motion
{ const n = { m: 'rotor', spd: 1, rev: false, ph: 0, kids: [null, null] };
  const a = M.jointLocal(n, 0, 0, 2), b = M.jointLocal(n, 0, 1, 2);
  ok(near(a.x, 0) && near(a.y, -34) && near(b.y, 34), 'a two-armed rotor at rest points one arm up, one down');
  const q = M.jointLocal(n, Math.PI / 2 / 1.6, 0, 2); ok(near(q.x, 34, 1e-6) && near(q.y, 0, 1e-6), 'a quarter turn later the arm points right');
  n.rev = true; const q2 = M.jointLocal(n, Math.PI / 2 / 1.6, 0, 2); ok(near(q2.x, -34, 1e-6), 'reversed, it turns the other way'); }
{ const n = { m: 'slider', spd: 1, ph: 0, kids: [null] }; const xs = [];
  for (let t = 0; t <= 1 / 0.45 + 1e-9; t += 0.05) xs.push(M.jointLocal(n, t, 0, 1).cx);
  const steps = xs.slice(1).map((x, i) => Math.abs(x - xs[i]));
  ok(Math.max(...xs) > 40 && Math.min(...xs) < -40, 'the slider travels side to side');
  const med = steps.slice().sort((a, b) => a - b)[Math.floor(steps.length / 2)]; ok(steps.filter((d) => Math.abs(d - med) < 0.05).length >= steps.length * 0.8, 'at a constant speed (linear, not a sine)'); }
{ const n = { m: 'stepper', spd: 1, ph: 0, kids: [null] };
  const a1 = M.jointLocal(n, 0.5 / 1.4, 0, 1).a, a2 = M.jointLocal(n, 0.9 / 1.4, 0, 1).a;
  ok(near(a1, Math.PI / 2, 1e-6) && near(a2, Math.PI / 2, 1e-6), 'the stepper holds still between ticks'); }
{ const n = { m: 'piston', spd: 1, ph: 0, kids: [null] }; const r0 = Math.hypot(M.jointLocal(n, 0, 0, 1).x, M.jointLocal(n, 0, 0, 1).y), r1 = Math.hypot(M.jointLocal(n, Math.PI / 2.4, 0, 1).x, M.jointLocal(n, Math.PI / 2.4, 0, 1).y);
  ok(r0 < 15 && r1 > 50, 'the piston pushes its arm out and back'); }
{ const n = { m: 'flywheel', spd: 1, ph: 0, kids: [null] }; const sp = (t) => (M.jointLocal(n, t + 0.01, 0, 1).a - M.jointLocal(n, t, 0, 1).a) / 0.01;
  ok(sp(0) > 3 * sp(Math.PI / 2.4), 'the flywheel surges and slows'); }
{ const n = { m: 'cam', spd: 1, ph: 0, kids: [null] }; let mx = 0, my = 0; for (let t = 0; t < 4; t += 0.05) { const p = M.jointLocal(n, t, 0, 1); mx = Math.max(mx, Math.abs(p.x)); my = Math.max(my, Math.abs(p.y)); }
  ok(near(mx, 50, 0.5) && near(my, 20, 0.5), 'the cam runs an oval, wider than tall'); }

// ---------------------------------------------------------------- the contraption
{ const s = M.newSave(), P = M.pose(s.tree, 0, 100, 500);
  ok(P.gadgets.length === 4 && P.joints.length === 2, 'the starter ship: a Disc hull, one rotor, three blasters and a saw');
  ok(M.available(s, 'blaster') === 0 && M.available(s, 'saw') === 0, 'every starter part is fitted');
  ok(M.remove(s, [1]) === '' && M.available(s, 'blaster') === 2 && M.available(s, 'rotor') === 1, 'removing a joint frees it and everything on it');
  ok(M.place(s, [1], 'blaster') === '', 'a gadget goes in an empty hull socket');
  ok(M.place(s, [1], 'blaster') !== '', 'not in a taken one');
  ok(M.place(s, [2, 0], 'blaster') !== '', 'not on a gadget');
  M.remove(s, [1]); ok(M.place(s, [1], 'rotor') === '' && M.place(s, [1, 0], 'rotor') !== '', 'joints only nest as deep as the Lab allows');
  ok(M.place(s, [1, 0], 'laser') === 'not unlocked yet', 'locked parts stay out'); }
{ const s = M.newSave(); s.cores = 99; M.unlock(s, 'depth3'); M.unlock(s, 'm_pendulum'); M.remove(s, [1]);
  ok(M.place(s, [1], 'rotor') === '' && M.place(s, [1, 0], 'pendulum') === '' && M.place(s, [1, 0, 0], 'blaster') === '', 'with deeper nesting a joint sits on a joint');
  const P = M.pose(s.tree, 1.3, 0, 0); ok(P.gadgets.some((g) => g.depth === 3), 'and its gadgets ride three levels out'); }
{ const s = M.newSave(); s.cores = 99;
  ok(M.setHull(s, 'hexagon') !== '', 'hulls start locked');
  M.unlock(s, 'h_hexagon'); ok(M.setHull(s, 'hexagon') === '' && s.tree.kids.length === 6 && M.stats(s).hull === 120, 'the Hexagon has six sockets and more hull');
  M.unlock(s, 'h_cross'); M.setHull(s, 'cross'); ok(s.tree.kids.length === 4, 'a smaller hull drops its extra sockets back into the drawer');
  M.unlock(s, 'h_needle'); M.setHull(s, 'needle'); ok(M.stats(s).speed > M.stats(M.newSave()).speed, 'the Needle flies faster');
  ok(M.tune(s, [], 'm', 'fixed') === '' && M.hullAngle(s.tree, 3) === 0, 'a hull can be set not to spin'); }
{ const s = M.newSave(); s.cores = 99; M.unlock(s, 'h_blob'); M.setHull(s, 'blob'); M.autoBuild(s);
  const R = M.createRun(s, 1, { seed: 1 }); for (let i = 0; i < 15; i++) R.update(1 / 60, { tx: 340, ty: 520 });
  const w = R.S.wob[0]; ok(w.x < -8, 'the Blob\'s rim stretches when you dart sideways');
  for (let i = 0; i < 180; i++) R.update(1 / 60, { tx: 340, ty: 520 }); ok(Math.hypot(R.S.wob[0].x, R.S.wob[0].y) < 1, 'and snaps back when you stop'); }
{ const s = M.newSave(); s.cores = 99; M.unlock(s, 'h_spine'); M.setHull(s, 'spine'); M.autoBuild(s);
  const R = M.createRun(s, 1, { seed: 1 }); for (let i = 0; i < 120; i++) R.update(1 / 60, { tx: 60, ty: 520 });
  const sg = R.S.seg; ok(Math.abs(Math.hypot(sg[0].x - R.S.hub.x, sg[0].y - R.S.hub.y) - 22) < 3 && sg[4].x > sg[0].x, 'the Caterpillar\'s segments trail along the path you flew'); }
{ const s = M.newSave(); s.cores = 999; for (const b of M.BLUEPRINTS) M.unlock(s, b.id);
  ok(M.stats(s).specSlots === 3 && M.stats(s).maxDepth === 4 && M.stats(s).jointSockets === 4, 'the Lab tops out at 3 special slots, 4 levels deep, 4 arms per joint');
  ok(Object.keys(M.GADGETS).every((g) => s.unl[g]) && Object.keys(M.HULLS).every((h) => s.hulls[h]) && Object.keys(M.SPECIALS).every((k) => s.specs[k]), 'every part, hull and special has a blueprint');
  for (const g of Object.keys(M.GADGETS)) s.inv[g] += 3; for (const m of Object.keys(M.MOTIONS)) s.inv[m] += 3;
  M.autoBuild(s); const used = M.placedCounts(s.tree); ok(Object.keys(M.GADGETS).every((g) => used[g]), 'auto-build fits every kind of gadget it owns');
  const R = M.createRun(s, 8, { seed: 4 }); const seen = new Set();
  for (let i = 0; i < 60 * 40 && !R.S.over; i++) { R.update(1 / 60, { tx: 180 + 100 * Math.sin(i / 40), ty: 520 }); for (const e of R.S.ev) seen.add(e.k); if (i === 600) for (let k = 0; k < 3; k++) R.special(k); }
  for (const k of ['fire', 'laser', 'zap', 'mine', 'lash', 'kill', 'special']) ok(seen.has(k), `a kitted-out ship sees '${k}' events`); }
{ const s = M.newSave(); const R = M.createRun(s, 3, { seed: 5 });
  ok(!R.special(0), 'a special starts half charged'); R.S.spec[0].cd = 0;
  for (let i = 0; i < 400; i++) R.update(1 / 60, { tx: 180, ty: 520 });
  const before = R.S.enemies.filter((e) => Math.hypot(e.x - R.S.hub.x, e.y - R.S.hub.y) < 150).length; R.S.spec[0].cd = 0;
  R.S.eshots.push({ x: R.S.hub.x, y: R.S.hub.y - 60, vx: 0, vy: 100, r: 4, dmg: 8 });
  ok(R.special(0) && R.S.eshots.every((b) => Math.hypot(b.x - R.S.hub.x, b.y - R.S.hub.y) > 160) && R.S.spec[0].cd > 0, 'Nova wipes nearby bullets and goes on cooldown'); void before; }
{ const s = M.newSave(); s.cores = 99; M.unlock(s, 's_timeslow'); M.setSpecial(s, 0, 'timeslow'); const A = M.createRun(s, 2, { seed: 2 }), B = M.createRun(s, 2, { seed: 2 });
  for (let i = 0; i < 240; i++) { A.update(1 / 60, {}); B.update(1 / 60, {}); } A.S.spec[0].cd = 0; A.special(0);
  const y0 = A.S.enemies[0] && A.S.enemies[0].y, y1 = B.S.enemies[0] && B.S.enemies[0].y; for (let i = 0; i < 60; i++) { A.update(1 / 60, {}); B.update(1 / 60, {}); }
  ok(A.S.enemies[0].y - y0 < (B.S.enemies[0].y - y1) * 0.5, 'Time slow makes enemies crawl'); }
{ const s = M.newSave(); s.cores = 99; M.unlock(s, 'g_shield'); M.autoBuild(s); const R = M.createRun(s, 1, { seed: 3 }); R.update(1 / 60, {});
  const sh = R.S.pose.gadgets.find((g) => g.node.g === 'shield'); R.S.eshots.push({ x: sh.x, y: sh.y - 6, vx: 0, vy: 30, r: 4, dmg: 8 }); R.update(1 / 60, {});
  ok(R.S.eshots.length === 0 && R.S.hub.hp === R.S.hub.max, 'a shield plate eats a bullet'); }
{ const s = M.newSave(); s.cores = 99; M.unlock(s, 'g_bubble'); M.remove(s, [2]); M.place(s, [2], 'bubble'); const R = M.createRun(s, 1, { seed: 3 }); R.update(1 / 60, {});
  R.S.eshots.push({ x: R.S.hub.x, y: R.S.hub.y, vx: 0, vy: 0, r: 4, dmg: 8 }); R.update(1 / 60, {});
  ok(R.S.hub.hp === R.S.hub.max && R.S.bubble.ch === 0, 'a bubble soaks up a hit'); }

// ---------------------------------------------------------------- levels, pay and the shop
{ const s = M.newSave(); const a = M.levelPlan(4), b = M.levelPlan(4); ok(JSON.stringify(a) === JSON.stringify(b), 'levels are the same every time');
  ok(M.levelPlan(5).boss && !M.levelPlan(4).boss, 'every fifth level is a boss');
  const R = M.createRun(s, 1, { seed: 9 }); for (let i = 0; i < 60 * 150 && !R.S.over; i++) R.update(1 / 60, { tx: 180, ty: 520 });
  const res = R.result(); ok(res.win, `level 1 with the starter ship, sitting still in the middle: won in ${res.t.toFixed(0)} s`);
  const c0 = s.coins, out = M.applyResult(s, res);
  ok(s.coins === c0 + res.coins + out.bonus && out.cores === res.stars && s.unlocked === 2, `pays coins + clear bonus (${res.coins} + ${out.bonus}) and a core per star (${res.stars})`);
  ok(M.applyResult(s, res).cores === 0, 'replaying for the same stars pays no more cores'); }
{ const s = M.newSave(); const R = M.createRun(s, 9, { seed: 1 }); R.S.hub.hp = 1; R.S.hub.inv = 0;
  for (let i = 0; i < 60 * 120 && !R.S.over; i++) R.update(1 / 60, {});
  const res = R.result(); ok(!res.win && res.stars === 0, 'losing earns no stars');
  const c = s.coins; M.applyResult(s, res); ok(s.coins === c + res.coins && s.unlocked === 1, 'but keeps the coins you picked up'); }
{ const s = M.newSave(); s.coins = 1000; const p0 = M.partPrice(s, 'blaster'); ok(M.buyPart(s, 'blaster') === '' && s.inv.blaster === 4 && M.partPrice(s, 'blaster') > p0, 'parts get pricier as you own more');
  ok(M.buyPart(s, 'laser') !== '', 'locked parts can\'t be bought'); const c = M.upCost(s, 'hull'); M.buyUp(s, 'hull'); ok(M.stats(s).hull === 120 && s.coins === 1000 - p0 - c, 'hull plating adds hull'); }
{ const s = M.newSave(); s.cores = 3; ok(M.unlock(s, 'arm4') !== '', 'blueprints with prerequisites wait');
  ok(M.unlock(s, 'g_spread') === '' && s.inv.spread === 1 && s.cores === 2, 'a part blueprint comes with one free'); }
{ const s = M.newSave(); s.coins = 50; s.tree.kids[0] = null; const raw = JSON.stringify(s), t = M.load(raw); ok(t.coins === 50 && t.tree.kids[0] === null && t.tree.kids.length === 3, 'a save round-trips');
  const old = { coins: 5, tree: { m: 'rotor', spd: 1, kids: [{ g: 'blaster' }, null] }, inv: { blaster: 3, rotor: 1 }, unl: { blaster: 1, rotor: 1 }, bp: { hub3: 1 }, up: { hull: 1, nose: 0, tractor: 0, g: {} }, stars: { 1: 3 }, unlocked: 2 };
  const m = M.load(JSON.stringify(old)); ok(m.tree.h === 'disc' && m.tree.kids.length === 3 && m.spec[0] === 'nova' && m.stars[1] === 3, 'an early v1 save loads into hulls and specials');
  ok(M.load('garbage').coins === 0, 'a broken save starts fresh'); }

// ---------------------------------------------------------------- bots
// A player-ish bot: hunts the lowest enemy, sidesteps bullets, fires specials when there's a crowd, then shops.
function botInput(S) {
  const hub = S.hub; let tx = hub.x, ty = H0;
  let tgt = null; for (const e of S.enemies) if (e.y > 0 && e.y < hub.y - 40 && (!tgt || e.y > tgt.y)) tgt = e;
  const boss = S.enemies.find((e) => e.type === 'boss' && e.st > 0);
  if (boss && (!tgt || tgt.y < 300)) tgt = boss;
  if (tgt) tx = tgt.x;
  let push = 0; for (const b of S.eshots) { const dy = hub.y - b.y; if (dy > -10 && dy < 140 && Math.abs(b.x - hub.x) < 34) push += b.x < hub.x ? 1 : -1; }
  for (const e of S.enemies) { const dy = hub.y - e.y; if (dy > -20 && dy < 70 && Math.abs(e.x - hub.x) < e.r + 22) push += e.x < hub.x ? 1.5 : -1.5; }
  if (push) tx = hub.x + Math.sign(push) * 70;
  return { tx, ty };
}
const H0 = M.H - 130;
function shop(s) {
  const st = () => M.stats(s);
  // structure first (more sockets, deeper nesting, more specials), then whatever's cheapest
  const PRI = ['depth3', 'arm3', 'h_hexagon', 'spec2', 'h_ring', 'depth4', 'arm4', 'spec3'];
  for (let k = 0; k < 40; k++) {
    const next = PRI.find((id) => !s.bp[id] && (!M.BP[id].req || s.bp[M.BP[id].req]));
    if (next && M.BP[next].cost > s.cores && s.cores < M.BP[next].cost + 1 && M.BLUEPRINTS.some((x) => !s.bp[x.id] && x.cost <= 2 && !M.canUnlock(s, x.id)) && Object.keys(s.bp).length > 6) break; // save up
    const id = (next && !M.canUnlock(s, next)) ? next : (M.BLUEPRINTS.find((x) => !M.canUnlock(s, x.id)) || {}).id; if (!id) break; M.unlock(s, id);
  }
  const hullsBy = Object.keys(M.HULLS).filter((h) => s.hulls[h] && h !== 'spine').sort((a, b) => M.HULLS[b].sockets.length - M.HULLS[a].sockets.length || M.HULLS[b].hp - M.HULLS[a].hp);
  if (hullsBy[0] !== s.tree.h) M.setHull(s, hullsBy[0]);
  const owned = Object.keys(M.SPECIALS).filter((k) => s.specs[k]); s.spec = owned.slice(0, st().specSlots);
  for (let guard = 0; guard < 200; guard++) {
    const cap = st().hubSockets * Math.pow(st().jointSockets, st().maxDepth - 1);
    const nG = Object.keys(M.GADGETS).reduce((a, g) => a + (s.inv[g] || 0), 0), nJ = Object.keys(M.MOTIONS).reduce((a, m) => a + (s.inv[m] || 0), 0);
    const opts = [];
    const bestG = ['laser', 'chain', 'mortar', 'missile', 'sword', 'flail', 'spread', 'blaster'].filter((g) => s.unl[g]);
    if (nG < cap) for (const g of bestG.slice(0, 3)) opts.push(['part', g, M.partPrice(s, g) * 0.8]);
    if (nG > st().hubSockets + nJ * (st().jointSockets - 1) - 1) { const j = Object.keys(M.MOTIONS).filter((m) => s.unl[m]).sort((a, b) => M.partPrice(s, a) - M.partPrice(s, b))[0]; opts.push(['part', j, M.partPrice(s, j) * 0.8]); }
    for (const k of ['hull', 'nose']) { const c = M.upCost(s, k); if (c != null) opts.push(['up', k, c * 1.2]); }
    const most = Object.keys(M.placedCounts(s.tree)).filter((g) => M.GADGETS[g] && g !== 'decoy').sort((a, b) => M.placedCounts(s.tree)[b] - M.placedCounts(s.tree)[a]).slice(0, 5);
    for (const g of most) { const c = M.upCost(s, 'g:' + g); if (c != null) opts.push(['up', 'g:' + g, c]); }
    if (s.spec.length) { const c = M.upCost(s, 'cap'); if (c != null) opts.push(['up', 'cap', c * 1.5]); }
    const real = (o) => (o[0] === 'part' ? M.partPrice(s, o[1]) : M.upCost(s, o[1]));
    const o = opts.filter((x) => real(x) <= s.coins).sort((a, b) => a[2] - b[2])[0]; if (!o) break;
    const err = o[0] === 'part' ? M.buyPart(s, o[1]) : M.buyUp(s, o[1]); if (err) break;
    M.autoBuild(s);
  }
  M.autoBuild(s);
}
function playLevel(s, level, seed) {
  const R = M.createRun(s, level, { seed });
  for (let i = 0; i < 60 * 240 && !R.S.over; i++) { R.update(1 / 60, botInput(R.S)); if (R.S.enemies.length >= 5 || R.S.enemies.some((e) => e.type === 'boss')) R.S.spec.forEach((sp, k) => { if (sp.cd <= 0) R.special(k); }); }
  return R.result();
}
if (process.argv.includes('--bots')) {
  const runs = +(process.argv[process.argv.indexOf('--runs') + 1] || 0) || 120;
  { const s = M.newSave(); const r = playLevel(s, 1, 1); ok(r.win && r.t > 45 && r.t < 95, `bot: level 1 with the starter ship takes ${r.t.toFixed(0)} s (${r.stars} stars)`); }
  for (const seed of [1, 2]) {
    const s = M.newSave(); let secs = 0, fails2 = 0, streak = 0, line = [];
    for (let n = 1; n <= runs; n++) {
      // like a player: push the frontier, but after two losses in a row go back for missing stars
      let lv = s.unlocked; if (streak >= 2) { const back = Array.from({ length: s.unlocked - 1 }, (_, i) => i + 1).filter((k) => (s.stars[k] || 0) < 3); lv = back.length ? back[back.length - 1] : Math.max(1, s.unlocked - 1); }
      const r = playLevel(s, lv, seed * 1000 + n); secs += r.t; M.applyResult(s, r);
      if (!r.win) { fails2++; if (lv === s.unlocked) streak++; } else if (lv === s.unlocked - 1 || lv < s.unlocked - 1) streak = streak >= 2 ? (r.stars === 3 ? 0 : streak) : 0; shop(s);
      if (n % 10 === 0 || n === 1) line.push(`#${n} L${s.unlocked} ${Math.round(secs / 60)}m`);
    }
    console.log(`bot seed ${seed}: ${line.join(' · ')}`);
    console.log(`   reached level ${s.unlocked} in ${runs} runs (${Math.round(secs / 60)} min), ${fails2} losses; hull ${s.tree.h}, ${Object.keys(M.placedCounts(s.tree)).length} part kinds fitted, ${M.pose(s.tree, 0, 0, 0).gadgets.length} gadgets; cores left ${s.cores}`);
    ok(s.unlocked >= 12, `bot seed ${seed} gets past the second boss within ${runs} runs`);
    ok(fails2 > 3, `bot seed ${seed} does lose sometimes (${fails2}), so upgrades matter`);
  }
}
console.log(fails ? `${fails} failed` : 'all good');
process.exitCode = fails ? 1 : 0;
