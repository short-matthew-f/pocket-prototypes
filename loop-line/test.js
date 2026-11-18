// Plays the model in node: a do-nothing player, and one who builds detours and drafts guns, to sanity-check balance.
const { createGame, WAVES } = require('./game.js');
function play(label, plan, seed) {
  const G = createGame({ seed }), S = G.S;
  for (let guard = 0; guard < 200000 && !S.over; guard++) {
    if (S.phase === 'build') { plan.build && plan.build(G, S.wave); G.send(); }
    else if (S.phase === 'draft') G.pick(plan.pick ? plan.pick(S.draft, S) : S.draft[0]);
    else G.update(1 / 30);
  }
  return `${label.padEnd(10)} seed ${seed}: ${S.won ? 'WON ' : 'lost'} wave ${S.wave} ♥${S.hp} pops ${S.pops || 0} cars ${S.cars.join(',')} t=${Math.round(S.t)}s laps(last)=${S.laps}`;
}
const lazy = { pick: (d) => d[0] };
const tryLay = (G, path) => { const e = G.lay(path); if (e) console.log('  lay:', e); };
const builder = { // a top loop where the marbles come in, then a long detour down the right side
  pick: (d) => (d.includes('gun') ? 'gun' : d.includes('mirror') ? 'mirror' : d[0]),
  build(G, w) {
    if (w === 0) tryLay(G, [[2, 4], [2, 3], [2, 2], [2, 1], [3, 1], [4, 1], [5, 1], [5, 2], [5, 3], [5, 4]]);
    if (w === 1) tryLay(G, [[5, 6], [6, 6], [7, 6], [7, 7], [7, 8], [7, 9], [6, 9], [5, 9], [4, 9], [4, 8]]);
    if (w === 2) tryLay(G, [[3, 8], [3, 9], [3, 10], [2, 10], [1, 10], [1, 9], [1, 8], [1, 7], [2, 7]]);
  },
};
const guard = { // run the line past the depot, where every marble ends up
  pick: (d) => (d.includes('gun') ? 'gun' : d.includes('mirror') ? 'mirror' : d[0]),
  build(G, w) { if (w === 0) tryLay(G, [[2, 8], [2, 9], [2, 10], [3, 10], [4, 10], [5, 10], [5, 9], [5, 8]]); if (w === 1) tryLay(G, [[5, 5], [6, 5], [7, 5], [7, 6], [7, 7], [7, 8], [7, 9], [6, 9]].slice(0, 0)); },
};
for (const seed of [1, 2, 3, 4, 5, 6]) { console.log(play('lazy', lazy, seed)); console.log(play('builder', builder, seed)); console.log(play('guard', guard, seed)); }
