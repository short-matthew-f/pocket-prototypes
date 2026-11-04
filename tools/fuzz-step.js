// In-page crash hunt (run through tools/shot.mjs on a ?dev URL): every character x {fresh, maxed, boss} x seeds,
// fast-forwarding each run with a random thumb. Returns only the configurations that threw.
const K = window.__kit, out = [], seeds = [1, 2, 3, 4];
K.S.wins = 9;
for (const c of K.cfg.characters) for (const mode of ['fresh', 'mid', 'maxed', 'boss']) for (const seed of seeds) {
  K.S.cur = c.id; const C = K.charSave(c.id); C.levels = {};
  if (mode === 'mid') { let i = 0; for (const n of K.nodesFor(c.id)) if (!n.win && (i++ % 2 === 0)) C.levels[n.id] = Math.ceil((n.max || 1) / 2); }
  if (mode === 'maxed' || mode === 'boss') K.maxAll(c.id, mode === 'boss');
  let r;
  try { K.startRun(); r = K.fuzz(5400, seed, window.FUZZ_UI || 0.02); } catch (e) { r = { errors: ['start: ' + String(e.stack || e).split('\n').slice(0, 3).join(' | ')] }; }
  if (r.errors.length) out.push({ who: c.id, mode, seed, ...r });
}
localStorage.clear();
return { configs: K.cfg.characters.length * 4 * seeds.length, failures: out };
