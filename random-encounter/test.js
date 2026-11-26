// Random Encounter: rule tests, a step-time check, and with --bots a batch of runs by a steering bot.
//   node random-encounter/test.js            rules + perf
//   node random-encounter/test.js --bots     + runs (--n 20 runs per starting job, --skill 1 = dodge strength)
const G = require('./model.js');
const assert = require('assert');
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? +args[i + 1] : d; };
let pass = 0;
const t = (name, fn) => { try { fn(); pass++; } catch (e) { console.log('FAIL', name, '\n ', e.message); process.exitCode = 1; } };
const run = (r, sec, fn) => { for (let i = 0; i < sec * 60 && !r.over; i++) { if (fn) fn(r); if (r.pending) G.choose(r, 0); G.step(r, 1 / 60); r.ev.length = 0; } };

t('a run starts with one hero', () => { const r = G.newRun({ seed: 1, job: 'mage' }); assert.equal(r.party.length, 1); assert.equal(r.party[0].skills.fire, 1); });
t('the leader moves and followers walk the path', () => {
  const r = G.newRun({ seed: 2 }); r.move = { x: 1, y: 0 }; run(r, 1);
  assert(r.x > 40); G.choose(r, 0);
});
t('foes arrive and the fighter cuts them down', () => {
  const r = G.newRun({ seed: 3, job: 'fighter' }); run(r, 20); assert(r.kills > 0, 'kills ' + r.kills); assert(r.lv > 1);
});
t('every skill fires without errors', () => {
  for (const j of G.JOB_IDS) {
    const r = G.newRun({ seed: 4, job: j }); const h = r.party[0];
    for (const s of G.JOBS[j].skills) h.skills[s] = 6;
    run(r, 30); assert(r.kills > 0 || r.over, j);
  }
});
t('the first level-up at recruit level offers three new jobs, and choosing adds a hero', () => {
  const r = G.newRun({ seed: 5, job: 'fighter' });
  while (r.lv < G.RECRUIT_AT[0]) { if (r.pending) G.choose(r, 0); G.step(r, 1 / 60); r.ev.length = 0; }
  // the level-3 offer is pending (or is about to be)
  for (let i = 0; i < 5 && !r.pending; i++) G.step(r, 1 / 60);
  assert(r.pending && r.pending.recruit, 'recruit offer'); assert.equal(r.pending.cards.length, 3);
  assert(r.pending.cards.every((c) => c.kind === 'recruit' && c.job !== 'fighter'));
  G.choose(r, 1); assert.equal(r.party.length, 2);
});
t('the party caps at four and later recruit levels give normal cards', () => {
  const r = G.newRun({ seed: 6, job: 'cleric' });
  for (const j of ['mage', 'thief', 'monk']) r.party.push(G.makeHero(j, { [G.JOBS[j].skills[0]]: 1 }));
  r.lv = G.RECRUIT_AT[2] - 1; r.xp = 0; r.gems.push({ x: r.x, y: r.y, v: 999, id: 1 }); G.step(r, 1 / 60);
  assert(r.pending && !r.pending.recruit); assert.equal(r.party.length, 4);
});
t('touching a foe hurts, with a moment of grace after', () => {
  const r = G.newRun({ seed: 7 }); r.party[0].skills = {}; r.foes.push({ id: 99, type: 'slime', x: 2, y: 0, hp: 50, max: 50, r: 6, spd: 0, dmg: 5, xp: 1, kind: 'melee', kx: 0, ky: 0, flash: 0, chill: 0, hitT: 0, shotT: 9 });
  const hp0 = r.hp; G.step(r, 1 / 60); const hp = r.hp; assert(hp < hp0); G.step(r, 1 / 60); assert.equal(r.hp, hp);
});
t('potions heal and chests open a choice', () => {
  const r = G.newRun({ seed: 8 }); r.hp = 50; r.items.push({ x: 0, y: 0, kind: 'potion', id: 1 }, { x: 0, y: 0, kind: 'chest', id: 2 }); G.step(r, 1 / 60);
  assert(r.hp > 50); assert(r.pending);
});
t('the boss arrives at 4:00 and the wyrm at 8:00; slaying the wyrm wins', () => {
  const r = G.newRun({ seed: 9 }); r.t = G.BOSS1_AT - 0.01; G.step(r, 1 / 60); assert(r.foes.some((f) => f.type === 'golem'));
  r.t = G.RUN_TIME - 0.01; G.step(r, 1 / 60); const w = r.foes.find((f) => f.type === 'wyrm'); assert(w);
  w.hp = 1; w.x = r.x + 10; w.y = r.y; r.party[0].cds.slash = 0; G.step(r, 1 / 60); assert(r.won && r.over);
});
t('two levels at once still owe the recruit; a chest at a recruit level does not add one', () => {
  const r = G.newRun({ seed: 12, job: 'fighter' }); r.party.push(G.makeHero('mage', { fire: 1 })); r.recruits.push({}); r.lv = 5; r.xp = 0;
  r.gems.push({ x: r.x, y: r.y, v: (G.xpNeed(5) + G.xpNeed(6)) / 1.4 + 0.01, id: 1 }); G.step(r, 1 / 60);
  assert.equal(r.lv, 7); let recruits = 0; while (r.pending) { if (r.pending.recruit) recruits++; G.choose(r, 0); }
  assert.equal(recruits, 1); assert.equal(r.party.length, 3);
  const q = G.newRun({ seed: 13, job: 'fighter' }); q.party.push(G.makeHero('mage', { fire: 1 })); q.lv = 2; q.items.push({ x: 0, y: 0, kind: 'chest', id: 2 }); G.step(q, 1 / 60);
  assert(q.pending && !q.pending.recruit);
});
t('monsters spawn outside the view', () => {
  for (const view of [{ w: 195, h: 422 }, { w: 640, h: 400 }]) {
    const r = G.newRun({ seed: 14, view }); r.party[0].skills = {};
    for (let i = 0; i < 600; i++) { const n = r.foes.length; G.step(r, 1 / 60); r.ev.length = 0; for (const f of r.foes.slice(n)) assert(Math.abs(f.x - r.x) > view.w / 2 || Math.abs(f.y - r.y) > view.h / 2, `inside view ${JSON.stringify(view)}`); }
  }
});
t('a Mage is offered Thunder first', () => {
  const r = G.newRun({ seed: 15, job: 'mage' }); r.owed = 0; r.lv = 2; r.gems.push({ x: r.x, y: r.y, v: 50, id: 1 }); r.owed = 0; r.party.push(G.makeHero('thief', { dagger: 1 }), G.makeHero('monk', { fist: 1 }), G.makeHero('cleric', { holy: 1 }));
  G.step(r, 1 / 60); assert(r.pending.cards.some((c) => c.skill === 'thunder'));
});
console.log(`${pass} rule tests passed`);

// step time with a crowd
{
  const r = G.newRun({ seed: 11, job: 'mage' });
  for (const j of ['fighter', 'ranger', 'thief']) r.party.push(G.makeHero(j, Object.fromEntries(G.JOBS[j].skills.map((s) => [s, 6]))));
  for (const s of G.JOBS.mage.skills) r.party[0].skills[s] = 6;
  r.t = 400; for (let i = 0; i < 300; i++) { const a = i * 2.4; r.foes.push({ id: 1000 + i, type: 'skeleton', x: Math.cos(a) * (40 + i % 120), y: Math.sin(a) * (60 + i % 140), hp: 1e6, max: 1e6, r: 6, spd: 25, dmg: 0, xp: 1, kind: 'melee', kx: 0, ky: 0, flash: 0, chill: 0, hitT: 0, shotT: 9 }); }
  const t0 = process.hrtime.bigint(); for (let i = 0; i < 300; i++) { G.step(r, 1 / 60); r.ev.length = 0; if (r.pending) G.choose(r, 0); }
  const ms = Number(process.hrtime.bigint() - t0) / 1e6 / 300;
  console.log(`step with ${r.foes.length} foes and 4 heroes on all skills: ${ms.toFixed(2)} ms (shots in flight ${r.shots.length}, damage dealt ${Math.round(r.stats.dmg)})`);
}

// ---------------------------------------------------------------- bot
// Steers away from nearby foes and shots, toward gems and potions when it is safe; picks cards by a simple taste.
function steer(r, skill) {
  let ax = 0, ay = 0;
  const look = 55 * Math.sqrt(skill);
  for (const f of r.foes) { const dx = r.x - f.x, dy = r.y - f.y, d2 = dx * dx + dy * dy; if (d2 < look * look) { const w = (f.boss ? 3 : 1) / Math.max(40, d2); ax += dx * w; ay += dy * w; } }
  for (const s of r.foeShots) { const dx = r.x - s.x, dy = r.y - s.y, d2 = dx * dx + dy * dy; if (d2 < 40 * 40) { const w = 2 / Math.max(20, d2); ax += dx * w; ay += dy * w; } }
  ax *= 60; ay *= 60;
  const danger = Math.hypot(ax, ay);
  let tgt = null, bd = 1e9;
  for (const it of r.items) { const d = Math.hypot(it.x - r.x, it.y - r.y) * (it.kind === 'potion' && r.hp > r.hpMax * 0.7 ? 4 : 0.5); if (d < bd) { bd = d; tgt = it; } }
  for (const g of r.gems) { const d = Math.hypot(g.x - r.x, g.y - r.y); if (d < bd && d < 120) { bd = d; tgt = g; } }
  if (tgt && danger < 1.2) { const dx = tgt.x - r.x, dy = tgt.y - r.y, d = Math.hypot(dx, dy) || 1; ax += dx / d * 0.8; ay += dy / d * 0.8; }
  if (Math.hypot(ax, ay) < 0.1) { const a = r.t * 0.3; ax = Math.cos(a) * 0.5; ay = Math.sin(a) * 0.5; } // drift in a slow circle
  r.move = { x: ax, y: ay };
}
const TASTE = { recruit: 10, learn: 5, skill: 3, passive: 2, potion: 1 };
function pick(r) {
  const c = r.pending.cards; let bi = 0, bv = -1;
  c.forEach((k, i) => { let v = TASTE[k.kind] + Math.random(); if (k.kind === 'passive' && (k.id === 'vigor' || k.id === 'might')) v += 1.5; if (v > bv) { bv = v; bi = i; } });
  G.choose(r, bi);
}
if (args.includes('--bots')) {
  const n = opt('--n', 12), skill = opt('--skill', 1);
  const rows = [];
  for (const job of G.JOB_IDS) {
    let wins = 0, tsum = 0, lvs = 0; const rec = [[], [], []], size = [0, 0, 0, 0, 0];
    for (let i = 0; i < n; i++) {
      const r = G.newRun({ seed: 500 + i * 7 + job.length, job });
      while (!r.over && r.t < G.RUN_TIME + 240) { steer(r, skill); if (r.pending) pick(r); G.step(r, 1 / 30); r.ev.length = 0; }
      if (r.won) wins++; tsum += r.t; lvs += r.lv;
      r.recruits.slice(1).forEach((x, k) => rec[k].push(x.t)); size[r.party.length]++;
    }
    const avg = (a) => (a.length ? (a.reduce((x, y) => x + y, 0) / a.length).toFixed(0) + 's' : '-');
    rows.push(`${job.padEnd(8)} win ${String(wins).padStart(2)}/${n}  survived avg ${(tsum / n / 60).toFixed(1)} min  lv ${(lvs / n).toFixed(0)}  recruits at ${rec.map(avg).join(' / ')}  party size reached 1/2/3/4: ${size.slice(1).join('/')}`);
  }
  console.log(rows.join('\n'));
}
