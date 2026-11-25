// High Roller: rule tests, then pacing bots playing the real model.  node test.js [--bots] [--hours 6] [--measure-poker N] [-v]
const G = require('./games.js'), M = require('./model.js');
const argv = process.argv.slice(2), V = argv.includes('-v'), BOTS = argv.includes('--bots');
let fails = 0;
const ok = (c, m) => { if (!c) { fails++; console.log('FAIL', m); } else if (V || !BOTS) console.log('ok  ', m); };
function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const hand = (str) => str.split(' ').map((s) => G.RANKS.indexOf(s[0]) + 13 * ('shdc'.indexOf(s[1])));

if (argv.includes('--measure-poker')) {
  const N = +argv[argv.indexOf('--measure-poker') + 1] || 2e6, r = rng(7), c = {}; for (const k of G.HANDS) c[k] = 0;
  for (let i = 0; i < N; i++) { const st = G.pokerDeal(r); c[G.evalHand(G.pokerDraw(st, G.pokerHold(st.hand)))]++; }
  const f = {}; for (const k of G.HANDS) f[k] = +(c[k] / N).toFixed(7); console.log(JSON.stringify(f)); process.exit(0);
}

if (!BOTS) {
  // ------------------------------------------------------------ poker hands
  const E = (s) => G.evalHand(hand(s));
  ok(E('Ts Js Qs Ks As') === 'royal', 'royal flush');
  ok(E('As 2s 3s 4s 5s') === 'sf' && E('9h Th Jh Qh Kh') === 'sf', 'straight flushes, ace low too');
  ok(E('7s 7h 7d 7c 2s') === 'quads', 'four of a kind');
  ok(E('7s 7h 7d 2c 2s') === 'fh', 'full house');
  ok(E('2s 9s Js 4s 6s') === 'flush', 'flush');
  ok(E('As 2h 3d 4c 5s') === 'straight' && E('Ts Jh Qd Kc As') === 'straight', 'wheel and broadway straights');
  ok(E('Qs Kh Ad 2c 3s') === 'none', 'no wrap-around straight');
  ok(E('7s 7h 7d Kc 2s') === 'trips' && E('7s 7h Kd Kc 2s') === 'twopair', 'trips, two pair');
  ok(E('Js Jh 4d 8c 2s') === 'jacks' && E('Ts Th 4d 8c 2s') === 'none', 'jacks or better; tens do not pay');
  const H = (s) => G.pokerHold(hand(s)).map((x) => (x ? 1 : 0)).join('');
  ok(H('Ts Js Qs Ks 3h') === '11110', 'holds four to a royal');
  ok(H('Ts Js Qs Ks 2s') === '11110', 'breaks a flush for four to a royal');
  ok(H('Js Jh 4s 5s 6s') === '11000', 'a high pair over three to a straight flush');
  ok(H('4h 4d Ks 8c 2s') === '11000', 'holds a low pair');
  ok(H('Ah Kh 4d 8c 2s') === '11000', 'two suited high cards');
  ok(H('Ah Kd Qc 8c 2s') === '01100', 'three unsuited high cards: keeps the lowest two');
  ok(H('3h 7d 8c 9s 2s') === '00000', 'nothing: draws five');
  ok(H('5h 6d 7c 8s Ks') === '11110', 'four to an outside straight');
  const pr = G.pokerRtp(M.cfg(M.newSave(), 'poker').pay), full = G.pokerRtp({ royal: 800, sf: 50, quads: 25, fh: 9, flush: 6, straight: 4, trips: 3, twopair: 2, jacks: 1 });
  ok(Math.abs(full - 0.9946) < 0.004, `9/6 Jacks or Better with the simple strategy returns ~99.46% (${(full * 100).toFixed(2)}%)`);
  { const r = rng(3), N = 300000; let ret = 0; const pay = M.cfg(M.newSave(), 'poker').pay; for (let i = 0; i < N; i++) { const st = G.pokerDeal(r); ret += pay[G.evalHand(G.pokerDraw(st, G.pokerHold(st.hand)))] || 0; }
    ok(Math.abs(ret / N - pr) < 0.012, `simulated 6/5 return matches the frequency table (${(ret / N * 100).toFixed(2)}% vs ${(pr * 100).toFixed(2)}%)`); }
  { const st = G.pokerDeal(rng(9)); const all = new Set([...st.deck]); ok(all.size === 52, 'a fresh 52-card deck'); const h2 = G.pokerDraw(st, [true, false, true, false, true]); ok(h2[0] === st.hand[0] && h2[1] !== st.hand[1] && new Set(h2).size === 5, 'draw replaces only the unheld cards, no duplicates'); }

  // ------------------------------------------------------------ blackjack
  const T = (...v) => G.handTotal(v);
  ok(T(1, 10).t === 21 && T(1, 10).soft, 'A+K is soft 21');
  ok(T(1, 1).t === 12 && T(1, 1).soft, 'A+A is soft 12');
  ok(T(1, 6, 10).t === 17 && !T(1, 6, 10).soft, 'A+6+10 is hard 17');
  ok(T(10, 6, 1, 1).t === 18 && !T(10, 6, 1, 1).soft, '10+6+A+A is hard 18');
  ok(T(1, 1, 1, 1, 1, 1).t === 16 && T(1, 1, 1, 1, 1, 1).soft, 'six aces are soft 16');
  const dS = G.dealerDist(17, true, true), dH = G.dealerDist(17, true, false);
  ok(dS[0] === 1 && dH[0] < 1, 'dealer stands on soft 17 (S17) or hits it (H17)');
  ok(Math.abs(G.dealerDist(10, false, true).reduce((a, b) => a + b, 0) - 1) < 1e-12, 'dealer outcome probabilities sum to 1');
  const R0 = { bjPay: 1.5, s17: true };
  const rS17 = G.bjRtp(R0); ok(rS17 > 0.99 && rS17 < 0.997, `3:2 S17 DAS infinite deck: return ${(rS17 * 100).toFixed(2)}% (book ~99.4-99.6%)`);
  ok(G.bjRtp({ ...R0, bjPay: 1.2 }) < rS17 - 0.012, '6:5 blackjack costs ~1.4%');
  ok(G.bjRtp({ ...R0, s17: false }) < rS17, 'H17 is worse than S17');
  ok(G.bjRtp({ ...R0, peek: true }) > 1.08, `seeing the hole card turns the game: ${(G.bjRtp({ ...R0, peek: true }) * 100).toFixed(1)}%`);
  const best = (a, b, up) => G.bjBest([a, b], { up, hole: 0 }, R0, { first: true, canSplit: true }).action;
  ok(best(10, 6, 7) === 'hit' && best(10, 6, 6) === 'stand', 'basic strategy: hit 16 vs 7, stand vs 6');
  ok(best(6, 5, 6) === 'double' && best(8, 8, 10) === 'split' && best(1, 1, 5) === 'split' && best(10, 10, 6) === 'stand', 'double 11, split 8s and aces, stand on 20');
  ok(best(1, 7, 9) === 'hit' && best(1, 7, 2) === 'stand' && best(1, 7, 4) === 'double', 'soft 18: hit vs 9, stand vs 2, double vs 4');
  { const r = rng(5), N = 200000; let st = 0, rt = 0; const R = { bjPay: 1.2, s17: false }; for (let i = 0; i < N; i++) { const s = G.bjAutoRound(r, R); st += 1; rt += G.bjReturned(s) - G.bjStaked(s) + 1; }
    const ex = G.bjRtp(R); ok(Math.abs(rt / st - ex) < 0.01, `simulated 6:5 H17 return ${(rt / st * 100).toFixed(2)}% matches exact ${(ex * 100).toFixed(2)}%`); }
  { const r = rng(6), N = 120000, R = { bjPay: 2, s17: true, surrender: true, charlie: true, ties: true, peek: true }; let rt = 0; for (let i = 0; i < N; i++) { const s = G.bjAutoRound(r, R); rt += G.bjReturned(s) - G.bjStaked(s) + 1; }
    const ex = G.bjRtp(R); ok(Math.abs(rt / N - ex) < 0.012, `simulated max-rules return ${(rt / N * 100).toFixed(2)}% matches exact ${(ex * 100).toFixed(2)}%`); }
  { const st = { dealer: [hand('Ts')[0], hand('7h')[0]], hands: [{ cards: hand('8s 8d'), bet: 1, done: false }], at: 0, split: false, over: false };
    const R = { bjPay: 1.5, s17: true }; ok(G.bjLegal(st, R).includes('split'), 'a pair can split');
    G.bjAct(st, R, 'split', rng(1)); ok(st.hands.length === 2 && !G.bjLegal(st, R).includes('split'), 'one split only'); }
  { const st = G.bjStart({ dealer: hand('As Kh'), hands: [{ cards: hand('9s 9d'), bet: 1 }], at: 0 }, R0); ok(st.over && st.hands[0].ret === 0, 'dealer blackjack takes the bet before play'); }
  { const st = G.bjStart({ dealer: hand('9s Kh'), hands: [{ cards: hand('As Qd'), bet: 1 }], at: 0 }, { bjPay: 1.2 }); ok(st.over && Math.abs(st.hands[0].ret - 2.2) < 1e-9, 'a 6:5 blackjack returns 2.2'); }

  // ------------------------------------------------------------ slots
  { const s0 = G.slotRtp({ lines: 3 }).rtp; const r = rng(8), N = 400000; let ret = 0; const cfg = { lines: 3 };
    for (let i = 0; i < N; i++) ret += G.slotSpin(r, cfg, 1).win;
    ok(Math.abs(ret / N - s0) < 0.03, `simulated slot return ${(ret / N * 100).toFixed(1)}% matches exact ${(s0 * 100).toFixed(1)}%`); }
  { const cfg = { lines: 9, lucky: 3, wild: 2, star: 3 }, ex = G.slotRtp(cfg).rtp, r = rng(9), N = 400000; let ret = 0;
    for (let i = 0; i < N; i++) { const s = G.slotSpin(r, cfg, 1); ret += s.win; for (let k = 0; k < s.free; k++) ret += G.slotSpin(r, cfg, 1).win; }
    ok(Math.abs(ret / N - ex) < 0.04, `simulated upgraded slot return (free spins included) ${(ret / N * 100).toFixed(1)}% matches exact ${(ex * 100).toFixed(1)}%`); }
  ok(G.linePay('wild', 'wild', 'seven') === G.PAY3.seven && G.linePay('wild', 'wild', 'wild') === G.PAY3.wild, 'wilds complete a line; three wilds pay the top prize');
  ok(G.linePay('cherry', 'cherry', 'blank') === G.CHERRY2 && G.linePay('blank', 'cherry', 'cherry') === 0, 'two cherries pay only from the left');
  ok(G.linePay('bell', 'star', 'bell') === 0, 'a star breaks a line');

  // ------------------------------------------------------------ roulette
  for (const w of ['american', 'european', 'partage']) for (const kind of ['red', 'straight', 'dozen']) {
    const c = { wheel: w, lucky: kind === 'straight' ? 3 : 0 }, r = rng(10), N = 400000, bet = kind === 'straight' ? { kind, n: 17 } : kind === 'dozen' ? { kind, d: 1 } : { kind };
    let ret = 0; for (let i = 0; i < N; i++) ret += G.rouletteReturn(G.rouletteSpin(r, c), bet, c);
    const ex = G.rouletteRtp(c, kind === 'red' ? 'even' : kind); if (!(Math.abs(ret / N - ex) < (kind === 'straight' ? 0.04 : 0.01))) ok(false, `roulette ${w} ${kind}: ${ret / N} vs ${ex}`);
  }
  ok(Math.abs(G.rouletteRtp({ wheel: 'american' }, 'even') - 36 / 38) < 1e-12 && Math.abs(G.rouletteRtp({ wheel: 'partage' }, 'even') - 36.5 / 37) < 1e-12, 'roulette returns: 94.7% American, 98.6% La Partage on even money');
  ok(true, 'simulated roulette matches the exact returns on every wheel');

  // ------------------------------------------------------------ economy
  { const s = M.newSave(1000); ok(s.chips === M.T.startChips && s.games.slots.open && !s.games.blackjack.open, 'a new save: chips, Slots open');
    ok(M.buy(s, 'blackjack', 'card') === 'locked', 'upgrades for locked games are refused');
    s.chips = 1e9; s.level = 30; ok(M.unlock(s, 'blackjack') === '' && s.games.blackjack.open, 'unlocking Blackjack');
    ok(M.buy(s, 'blackjack', 'auto') !== '', 'an auto-dealer needs the strategy card'); M.buy(s, 'blackjack', 'card'); ok(M.buy(s, 'blackjack', 'auto') === '', 'then it can be bought');
    const r1 = M.rtp(s, 'slots'); M.buy(s, 'slots', 'lines'); ok(M.rtp(s, 'slots') > r1, 'More lines raises the slot return');
    const lv = s.level; s.xp = 0; M.addXp(s, M.xpNeed(lv) + 1); ok(s.level === lv + 1, 'XP from betting levels you up');
    s.lastSeen = 0; const off = M.offline(s, 3600 * 1000 * 24); ok(!off || off.away > 0, 'offline runs');
    const raw = JSON.stringify(s), s2 = M.load(raw); ok(s2.level === s.level && s2.games.blackjack.up.auto === 1, 'saves round-trip');
    ok(M.load('garbage').chips === M.T.startChips, 'a broken save starts fresh'); }
  { const s = M.newSave(0); s.chips = 1e6; s.level = 10; M.unlock(s, 'blackjack'); M.buy(s, 'slots', 'auto'); M.buy(s, 'blackjack', 'card'); M.buy(s, 'blackjack', 'auto');
    const r = rng(11); const before = s.stats.rounds; M.tick(s, 30, r); ok(s.stats.rounds - before >= 20, `auto-players play real rounds (${s.stats.rounds - before} in 30 s)`);
    s.lastSeen = 0; s.games.slots.up = { auto: 3, lines: 3, wild: 4, lucky: 5 }; const off = M.offline(s, 2 * 3600 * 1000); ok(off && off.chips > 0 && off.rounds > 0, 'a winning slot floor earns while you are away');
    s.lastSeen = 0; const off2 = M.offline(s, 100 * 3600 * 1000); ok(off2.capped, 'time away is capped'); }

  { const s = M.newSave(0); s.level = 25; s.life.wagered = 2e11; s.games.blackjack.open = true; s.games.slots.up.auto = 5; const gain = M.vipGain(s), r0 = M.rtp(s, 'slots');
    ok(gain >= 5 && M.vipReset(s, 0) === '' && s.vip === gain && s.level === 1 && !s.games.blackjack.open && !s.games.slots.up.auto, `selling the casino at 200B lifetime bet: ${gain} stars, a fresh start`);
    ok(M.rtp(s, 'slots') > r0 * 1.04 && M.vipGain(s) === 0, 'stars raise every return; the same lifetime bet pays no more stars'); }
  { const s = M.newSave(0); s.chips = 0; M.pitBoss(s, 1e6); ok(s.chips > 0, 'broke: the pit boss spots you chips'); }
  // ------------------------------------------------------------ the return of every game at start and fully upgraded
  { const s = M.newSave(0), f = M.newSave(0); for (const g of M.GAME_IDS) { f.games[g].open = true; for (const u of M.UP[g]) f.games[g].up[u.id] = u.max; }
    const line = M.GAME_IDS.map((g) => `${g} ${(M.rtp(s, g) * 100).toFixed(1)}% → ${(M.rtp(f, g) * 100).toFixed(1)}%`).join(', ');
    ok(M.GAME_IDS.every((g) => M.rtp(s, g) < 1 && M.rtp(f, g) > 1.15), `every game starts below 100% and ends well above: ${line}`); }
}

// ---------------------------------------------------------------- pacing bots
if (BOTS) {
  const hours = +(argv[argv.indexOf('--hours') + 1] || 6);
  for (const style of ['active', 'idle']) for (const seed of [1, 2]) {
    const s = M.newSave(0), r = rng(seed * 101 + (style === 'idle' ? 7 : 0)); let t = 0; const marks = []; const dt = 1;
    const seen = {};
    const buyAll = () => {
      for (let guard = 0; guard < 50; guard++) {
        for (const g of M.GAME_IDS) if (!s.games[g].open && !M.canUnlock(s, g)) { M.unlock(s, g); }
        let pick = null; for (const g of M.GAME_IDS) { if (!s.games[g].open) continue; for (const u of M.UP[g]) { if (M.canBuy(s, g, u.id)) continue; const c = M.upCost(s, g, u.id); if (!pick || c < pick.c) pick = { g, id: u.id, c }; } }
        // save toward the next game when it's close
        const nextG = M.GAME_IDS.find((g) => !s.games[g].open && s.level >= M.GAMES[g].unlockLevel);
        if (nextG && pick && s.chips - pick.c < M.unlockCost(nextG) && pick.c > M.unlockCost(nextG) * 0.05) pick = null;
        if (!pick) break; M.buy(s, pick.g, pick.id);
      }
      for (const g of M.GAME_IDS) s.games[g].bet = M.maxTier(s);
    };
    let manualAcc = 0;
    while (t < hours * 3600) {
      const activeNow = style === 'active' || (t % 3600) < 600; // idle: 10 minutes an hour
      if (activeNow) {
        M.tick(s, dt, r);
        // manual play: the best open game, about one round every 2.5 s
        manualAcc += dt / 2.5; while (manualAcc >= 1) { manualAcc--; const g = M.GAME_IDS.filter((x) => s.games[x].open).sort((a, b) => M.rtp(s, b) - M.rtp(s, a))[0];
          M.pitBoss(s); M.autoRound(s, g, r, true); }
        if (t % 10 === 0) buyAll();
        t += dt;
      } else { s.lastSeen = 0; M.offline(s, 50 * 60 * 1000); t += 50 * 60; buyAll(); }
      s.events.length = 0;
      for (const g of M.GAME_IDS) if (s.games[g].open && !seen[g]) { seen[g] = 1; marks.push(`${g}@${(t / 60).toFixed(0)}m`); }
      for (const [k, test] of [['allBJ', () => M.UP.blackjack.every((u) => M.lvl(s, 'blackjack', u.id) >= u.max)], ['allSlots', () => M.UP.slots.every((u) => M.lvl(s, 'slots', u.id) >= u.max)], ['allPoker', () => M.UP.poker.every((u) => M.lvl(s, 'poker', u.id) >= u.max)], ['vip', () => !M.canVip(s)]])
        if (!seen[k] && test()) { seen[k] = 1; marks.push(`${k}@${(t / 60).toFixed(0)}m`); }
      if (t % 3600 === 0) console.log(`  ${style} s${seed} h${t / 3600}: wag ${s.life.wagered.toExponential(1)} L${s.level} chips ${s.chips.toExponential(2)} income/s ${M.incomeRate(s).toExponential(2)} rtp ${M.GAME_IDS.filter((g) => s.games[g].open).map((g) => g[0] + (M.rtp(s, g) * 100).toFixed(0)).join(' ')}`);
    }
    console.log(`${style} seed ${seed}: ${marks.join(', ')} | end L${s.level}, VIP stars on offer ${M.vipGain(s)}`);
  }
}
console.log(fails ? `${fails} FAILED` : 'all good');
process.exit(fails ? 1 : 0);
