// Drives the Loop Line model in node: track-building rules, then bots comparing a tight ring with a wide loop.
const { createGame, WAVES } = require('./game.js');
const assert = (c, m) => { if (!c) { console.log('FAIL', m); process.exitCode = 1; } else console.log('ok  ', m); };
const ring = [[4, 7], [5, 7], [5, 6], [5, 5], [5, 4], [4, 4], [3, 4], [2, 4], [2, 5], [2, 6], [2, 7], [3, 7]]; // hugs the base
const wide = [[4, 7], [5, 7], [6, 7], [6, 6], [6, 5], [6, 4], [6, 3], [6, 2], [6, 1], [5, 1], [4, 1], [3, 1], [2, 1], [1, 1], [1, 2], [1, 3], [1, 4], [1, 5], [1, 6], [1, 7], [1, 8], [1, 9], [1, 10], [2, 10], [3, 10], [3, 9], [3, 8], [3, 7]]; // out near the edges

// --- rules
{ const G = createGame({ seed: 1 });
  assert(G.send() !== '', 'cannot send before the loop is closed');
  assert(G.lay(ring) === '', 'draw a loop round the base from the shed');
  assert(G.send() === '', 'send once the loop is closed');
  for (let i = 0; i < 300; i++) G.update(1 / 30);
  assert(G.routeOK(), 'train still on a good route after 10 s'); }
{ const G = createGame({ seed: 1 }); G.lay(ring);
  const e = G.lay([[5, 5], [6, 5], [7, 5], [7, 6], [7, 7], [7, 8], [6, 8], [5, 8], [4, 8], [4, 7]]);
  assert(e === '' , 'branch a detour off the loop and back (' + e + ')');
  assert(G.routeOK(), 'route still loops after the detour');
  let saw = false; G.send(); for (let i = 0; i < 600; i++) { G.update(1 / 30); if (G.E.c === '7,6') saw = true; }
  assert(saw, 'train actually takes the new detour');
  const pts = [...G.S.track.entries()].filter(([, n]) => n.links.length === 3).map(([k]) => k);
  assert(pts.length === 2, 'detour makes two sets of points: ' + pts);
  let flipped = false; for (const k of pts) if (G.flip(k)) flipped = true; assert(flipped, 'points flip'); }
{ const G = createGame({ seed: 1 }); G.lay(ring); // drawn the other way round: should still work
  const e = G.lay([[4, 7], [4, 8], [5, 8], [6, 8], [7, 8], [7, 7], [7, 6], [7, 5], [6, 5], [5, 5]]);
  assert(e === '' && G.routeOK(), 'detour drawn against the traffic still runs');
  let saw = false; G.send(); for (let i = 0; i < 600; i++) { G.update(1 / 30); if (G.E.c === '7,6') saw = true; } assert(saw, '...and the train uses it'); }
{ const G = createGame({ seed: 1 }); G.lay(ring);
  const e = G.lay([[3, 4], [3, 3], [3, 2], [2, 2], [1, 2], [1, 3], [1, 4], [1, 5], [2, 5]]);
  // cross the loop: a stroke that runs straight over a straight rail makes a bridge
  const G2 = createGame({ seed: 1 }); G2.lay(ring);
  const b = G2.lay([[2, 5], [1, 5], [1, 4], [1, 3], [2, 3], [3, 3], [3, 4], [3, 5]].slice(0, 0));
  const G3 = createGame({ seed: 1 }); G3.lay([[4, 7], [5, 7], [6, 7], [6, 6], [6, 5], [6, 4], [5, 4], [4, 4], [3, 4], [2, 4], [1, 4], [1, 5], [1, 6], [1, 7], [1, 8], [2, 8], [3, 8], [3, 7]]);
  const br = G3.lay([[5, 4], [5, 3], [5, 2], [6, 2], [7, 2], [7, 3], [7, 4], [7, 5], [7, 6], [6, 6]].slice(0, 0));
  assert(e === '' && G.routeOK(), 'second detour at the top (' + e + ')'); }
{ const G = createGame({ seed: 1 }); // figure of eight through a bridge
  const e1 = G.lay([[4, 7], [5, 7], [6, 7], [6, 8], [6, 9], [5, 9], [4, 9], [3, 9], [3, 8], [3, 7]]);
  const e2 = G.lay([[5, 7].slice(), [5, 8], [5, 9], [5, 10], [4, 10], [3, 10], [2, 10], [2, 9], [2, 8], [2, 7], [3, 7]].slice(0, 0));
  assert(e1 === '' && G.routeOK(), 'loop below the shed'); }
{ const G = createGame({ seed: 1 }); G.lay(ring);
  assert(G.place('cannon', '0,5') === 'Put it right next to a rail so the train can set it off.', 'gadgets must touch a rail');
  assert(G.place('cannon', '1,4') === '' && G.S.coins === 90 - 20 - 20, 'place a cannon (coins ' + G.S.coins + ')');
  assert(G.erase('1,4') === '' && G.S.coins === 70, 'full refund between waves'); }

// --- balance: a ring that only fills its own gadget spots vs one that grows outward once they run out
const { GADGETS, key, unkey } = require('./game.js');
const ORDER = ['cannon', 'cannon', 'hammer', 'bumper', 'cannon', 'bell', 'hammer', 'cannon'];
const DETOURS = [ // grown in this order, each out and back onto the line
  [[5, 4], [5, 3], [5, 2], [4, 2], [3, 2], [2, 2], [2, 3], [2, 4]],
  [[2, 6], [1, 6], [1, 7], [1, 8], [1, 9], [2, 9], [3, 9], [4, 9], [5, 9], [6, 9], [6, 8], [6, 7], [5, 7]],
  [[4, 2], [4, 1], [5, 1], [6, 1], [6, 2], [6, 3], [6, 4], [6, 5], [5, 5]],
];
function slots(G, reserved = new Set()) { // open grass beside the line, best first: most rails touching, then nearest the base
  const S = G.S, out = [];
  for (let r = 0; r < 12; r++) for (let c = 0; c < 8; c++) { const k = key(c, r); if (S.track.has(k) || S.base.has(k) || S.gadgets.has(k) || reserved.has(k)) continue;
    const n = [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([dc, dr]) => S.track.has(key(c + dc, r + dr))).length; if (n) out.push([k, n, Math.hypot(c - 3.5, r - 5.5)]); }
  return out.sort((a, b) => b[1] - a[1] || a[2] - b[2]).map((x) => x[0]);
}
function bot(label, grow, seed) {
  const G = createGame({ seed }), S = G.S; G.lay(ring); let gi = 0, di = 0;
  const reserved = new Set(grow ? DETOURS.flatMap((d) => d.slice(1, -1).map((p) => key(...p))) : []);
  for (let guard = 0; guard < 400000 && !S.over; guard++) {
    if (S.phase === 'build') {
      if (grow !== null && S.wave >= 2 && S.cars.length < 2 && S.coins >= 45) G.place('spark', '');
      if (grow !== null && S.wave >= 3 && S.cars.length < 3 && S.coins >= 25) G.place('coal', '');
      for (;grow !== null;) {
        const t = ORDER[gi % ORDER.length]; if (S.coins < GADGETS[t].cost) break;
        const sl = slots(G, reserved);
        if (!sl.length) { if (grow && di < DETOURS.length && S.coins >= 30) { const e = G.lay(DETOURS[di]); if (e) { console.log('  grow:', e); break; } di++; continue; } break; }
        if (G.place(t, sl[0])) break; gi++;
      }
      (S.log = S.log || []).push(`w${S.wave}:${S.gadgets.size}g/${S.coins}c`);
      const e = G.send(); if (e) { console.log(label, 'send:', e); break; }
    } else G.update(1 / 30);
  }
  return `${label.padEnd(6)} seed ${seed}: ${S.won ? 'WON ' : 'lost'} w${S.wave} ♥${S.hp} pops ${S.pops} combo ${S.best} gadgets ${S.gadgets.size} track ${S.track.size} cars ${S.cars.join(',')} | ${S.log.join(' ')}`;
}
for (const seed of [1, 2, 3, 4, 5]) { console.log(bot('none', null, seed)); console.log(bot('ring', false, seed)); console.log(bot('grow', true, seed)); }
