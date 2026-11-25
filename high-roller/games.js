// High Roller: the four games' real rules and their exact (or measured) returns. DOM-free; every function takes an rng () => [0,1).
//   slots     3x3 independent weighted cells, up to 9 lines, wilds, scatter stars -> free spins. Return is exact (per-line enumeration).
//   poker     Jacks or Better, 52-card deck, hold/draw. The auto-hold is the standard simple strategy; its return comes from measured
//             final-hand frequencies (POKER_FREQ, 20M hands), so any paytable's return is sum(freq x pay).
//   blackjack infinite deck, dealer peeks for blackjack, double any two, double after split, one split, split aces get one card.
//             An exact EV engine picks the best play (that's the auto-player and the hint) and gives the exact return of any rule set.
//   roulette  American / European / La Partage wheels, with Lucky Numbers that pay 50-500x on straight-up bets.
(function (root) {
  'use strict';

  // ================================================================ slots
  const SYM = ['blank', 'cherry', 'lemon', 'plum', 'bell', 'bar', 'seven', 'wild', 'star'];
  const PAY3 = { cherry: 28, lemon: 44, plum: 64, bell: 130, bar: 270, seven: 650, wild: 1500 };
  const CHERRY2 = 6; // two cherries from the left
  const LINES = [[1, 1, 1], [0, 0, 0], [2, 2, 2], [0, 1, 2], [2, 1, 0], [0, 1, 0], [2, 1, 2], [1, 0, 1], [1, 2, 1]];
  const LINE_DIV = { 3: 3, 5: 4.6, 7: 6.2, 9: 7.8 }; // a spin's bet is split into this many line stakes, so extra lines are a bonus
  const FREE_SPINS = [0, 5, 7, 10, 15];
  function slotWeights(cfg) { // cfg: {lines, lucky 0-5, wild 0-4, star 0-4}; upgrades take weight from the blanks
    const L = cfg.lucky || 0, W = 0.22 * (cfg.wild || 0), S = cfg.star ? 4 : 0;
    return { blank: 30 - 0.9 * L - W - S, cherry: 18, lemon: 16, plum: 13, bell: 9, bar: 5, seven: 2, wild: W, star: S };
  }
  function linePay(a, b, c) { // symbols of one line, left to right; returns multiple of the line stake
    const s = [a, b, c]; if (s.includes('star')) { // a star breaks the line, but two cherries before it still pay
      return a === 'cherry' && (b === 'cherry' || b === 'wild') || (a === 'wild' && b === 'cherry') ? CHERRY2 : 0;
    }
    const base = s.find((x) => x !== 'wild');
    if (!base) return PAY3.wild;
    if (base !== 'blank' && s.every((x) => x === base || x === 'wild')) return PAY3[base];
    if ((a === 'cherry' || a === 'wild') && (b === 'cherry' || b === 'wild') && (a === 'cherry' || b === 'cherry')) return CHERRY2;
    return 0;
  }
  function slotRtp(cfg) {
    const w = slotWeights(cfg), tot = SYM.reduce((t, k) => t + w[k], 0), p = (k) => w[k] / tot;
    let e = 0; for (const a of SYM) for (const b of SYM) for (const c of SYM) { const pay = linePay(a, b, c); if (pay) e += p(a) * p(b) * p(c) * pay; }
    const base = (cfg.lines / LINE_DIV[cfg.lines]) * e;
    let trig = 0; const ps = p('star'); // P(3+ stars among 9 cells)
    if (ps > 0) { const C = (n, k) => { let r = 1; for (let i = 0; i < k; i++) r = r * (n - i) / (i + 1); return r; }; for (let k = 3; k <= 9; k++) trig += C(9, k) * Math.pow(ps, k) * Math.pow(1 - ps, 9 - k); }
    return { base, trig, free: FREE_SPINS[cfg.star || 0], rtp: base * (1 + trig * FREE_SPINS[cfg.star || 0]), hit: e };
  }
  function pickW(r, w) { let tot = 0; for (const k of SYM) tot += w[k]; let x = r() * tot; for (const k of SYM) { x -= w[k]; if (x < 0) return k; } return 'cherry'; }
  function slotSpin(r, cfg, bet) { // -> {grid[reel][row], wins:[{line, pay, amount}], win, stars, free}
    const w = slotWeights(cfg), grid = [0, 1, 2].map(() => [0, 1, 2].map(() => pickW(r, w)));
    const wins = []; const stake = bet / LINE_DIV[cfg.lines]; let win = 0;
    for (let i = 0; i < cfg.lines; i++) { const L = LINES[i], pay = linePay(grid[0][L[0]], grid[1][L[1]], grid[2][L[2]]); if (pay) { wins.push({ line: i, pay, amount: pay * stake }); win += pay * stake; } }
    let stars = 0; for (const col of grid) for (const s of col) if (s === 'star') stars++;
    return { grid, wins, win, stars, free: stars >= 3 ? FREE_SPINS[cfg.star || 0] : 0 };
  }

  // ================================================================ cards
  const RANKS = '23456789TJQKA', SUITS = '♠♥♦♣';
  const rk = (c) => c % 13, su = (c) => Math.floor(c / 13);
  const cardName = (c) => RANKS[rk(c)] + SUITS[su(c)];
  function shuffled(r) { const d = []; for (let i = 0; i < 52; i++) d.push(i); for (let i = 51; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [d[i], d[j]] = [d[j], d[i]]; } return d; }

  // ================================================================ video poker
  const HANDS = ['royal', 'sf', 'quads', 'fh', 'flush', 'straight', 'trips', 'twopair', 'jacks', 'none'];
  const HAND_NAME = { royal: 'Royal Flush', sf: 'Straight Flush', quads: 'Four of a Kind', fh: 'Full House', flush: 'Flush', straight: 'Straight', trips: 'Three of a Kind', twopair: 'Two Pair', jacks: 'Jacks or Better', none: 'No win' };
  function evalHand(h) {
    const cnt = new Array(13).fill(0), sc = [0, 0, 0, 0]; for (const c of h) { cnt[rk(c)]++; sc[su(c)]++; }
    const flush = sc.some((n) => n === 5);
    const groups = cnt.filter((n) => n > 0).sort((a, b) => b - a);
    let straight = false, high = -1;
    if (groups.length === 5) { const rs = h.map(rk).sort((a, b) => a - b); if (rs[4] - rs[0] === 4) { straight = true; high = rs[4]; } else if (rs[4] === 12 && rs[3] === 3) { straight = true; high = 3; } }
    if (straight && flush) return high === 12 ? 'royal' : 'sf';
    if (groups[0] === 4) return 'quads';
    if (groups[0] === 3 && groups[1] === 2) return 'fh';
    if (flush) return 'flush'; if (straight) return 'straight';
    if (groups[0] === 3) return 'trips';
    if (groups[0] === 2 && groups[1] === 2) return 'twopair';
    if (groups[0] === 2) { for (let r = 9; r <= 12; r++) if (cnt[r] === 2) return 'jacks'; }
    return 'none';
  }
  // the standard Jacks or Better simple strategy, top rule first. Returns which of the five cards to hold.
  function pokerHold(h) {
    const cat = evalHand(h), idx = [0, 1, 2, 3, 4], R = h.map(rk), S = h.map(su);
    const holdIdx = (ids) => idx.map((i) => ids.includes(i));
    const all = () => [true, true, true, true, true];
    if (cat === 'royal' || cat === 'sf' || cat === 'quads' || cat === 'fh' || cat === 'flush' || cat === 'straight') {
      if (cat === 'flush' || cat === 'straight') { const r4 = toRoyal(4); if (r4) return holdIdx(r4); } // 4 to a royal beats a made flush/straight
      return all();
    }
    function toRoyal(n) { for (let s = 0; s < 4; s++) { const ids = idx.filter((i) => S[i] === s && R[i] >= 8); if (ids.length >= n) return ids.slice(0, n); } return null; }
    function sfDraw(n) { // n suited cards that fit inside one straight window (A counts low in the A-5 window)
      for (let s = 0; s < 4; s++) { const ids = idx.filter((i) => S[i] === s); if (ids.length < n) continue;
        for (let lo = 8; lo >= -1; lo--) { const win = ids.filter((i) => (R[i] >= lo && R[i] <= lo + 4) || (lo === -1 && R[i] === 12)); if (win.length >= n) return win.slice(0, n); } }
      return null;
    }
    const byRank = {}; idx.forEach((i) => (byRank[R[i]] = byRank[R[i]] || []).push(i));
    const pairs = Object.keys(byRank).filter((r) => byRank[r].length === 2).map(Number);
    const r4 = toRoyal(4); if (r4) return holdIdx(r4);
    if (cat === 'trips') return holdIdx(Object.values(byRank).find((v) => v.length === 3));
    const sf4 = sfDraw(4); if (sf4) return holdIdx(sf4);
    if (cat === 'twopair') return holdIdx(pairs.flatMap((r) => byRank[r]));
    if (cat === 'jacks') return holdIdx(byRank[pairs.find((r) => r >= 9)]);
    const r3 = toRoyal(3); if (r3) return holdIdx(r3);
    for (let s = 0; s < 4; s++) { const ids = idx.filter((i) => S[i] === s); if (ids.length === 4) return holdIdx(ids); }
    if (pairs.length) return holdIdx(byRank[pairs[0]]);
    // 4 to an outside straight (4 in a row, no ace)
    const uniq = [...new Set(R)].sort((a, b) => a - b);
    for (let lo = 0; lo <= 8; lo++) { if ([0, 1, 2, 3].every((d) => uniq.includes(lo + d)) && lo + 3 <= 11) return holdIdx([0, 1, 2, 3].map((d) => byRank[lo + d][0])); }
    const hi = idx.filter((i) => R[i] >= 9);
    for (let s = 0; s < 4; s++) { const ids = hi.filter((i) => S[i] === s); if (ids.length >= 2) return holdIdx(ids.slice(0, 2)); }
    const sf3 = sfDraw(3); if (sf3) return holdIdx(sf3);
    if (hi.length >= 2) return holdIdx(hi.sort((a, b) => R[a] - R[b]).slice(0, 2));
    for (const t of idx) if (R[t] === 8) for (const o of hi) if (S[o] === S[t] && R[o] <= 11) return holdIdx([t, o]);
    if (hi.length === 1) return holdIdx(hi);
    return [false, false, false, false, false];
  }
  // final-hand frequencies under pokerHold, measured over 20,000,000 hands (node test.js --measure-poker N re-measures)
  const POKER_FREQ = {"royal":0.000025,"sf":0.0001118,"quads":0.00235,"fh":0.0114819,"flush":0.0110919,"straight":0.0106139,"trips":0.0745579,"twopair":0.1295736,"jacks":0.2145258,"none":0.5456682};
  const pokerRtp = (pay) => HANDS.reduce((t, k) => t + POKER_FREQ[k] * (pay[k] || 0), 0);
  function pokerDeal(r) { const d = shuffled(r); return { deck: d, hand: d.slice(0, 5), next: 5 }; }
  function pokerDraw(st, hold) { const hand = st.hand.slice(); for (let i = 0; i < 5; i++) if (!hold[i]) hand[i] = st.deck[st.next++]; return hand; }

  // ================================================================ blackjack (infinite deck)
  // card values 1 (ace) .. 10; P(10) = 4/13
  const PV = [0, 1 / 13, 1 / 13, 1 / 13, 1 / 13, 1 / 13, 1 / 13, 1 / 13, 1 / 13, 1 / 13, 4 / 13];
  const bjVal = (c) => { const r = rk(c); return r === 12 ? 1 : r >= 8 ? 10 : r + 2; }; // A -> 1, T J Q K -> 10
  function addCard(t, soft, v) { // t = best total, soft = an ace is being counted as 11
    let nt = t + (v === 1 && !soft ? 11 : v), ns = soft || v === 1;
    if (nt > 21 && ns) { nt -= 10; ns = false; }
    return [nt, ns];
  }
  function handTotal(vals) { let t = 0, soft = false; for (const v of vals) [t, soft] = addCard(t, soft, v); return { t, soft }; }
  const ruleKey = (R) => `${R.bjPay}|${R.s17 ? 1 : 0}|${R.surrender ? 1 : 0}|${R.charlie ? 1 : 0}|${R.peek ? 1 : 0}|${R.ties ? 1 : 0}`;
  const dealerMemo = new Map();
  function dealerDist(t, soft, s17) { // -> [p17, p18, p19, p20, p21, pBust]
    const key = `${t}|${soft ? 1 : 0}|${s17 ? 1 : 0}`; const m = dealerMemo.get(key); if (m) return m;
    let out;
    if (t > 21) out = [0, 0, 0, 0, 0, 1];
    else if (t > 17 || (t === 17 && (!soft || s17))) { out = [0, 0, 0, 0, 0, 0]; out[t - 17] = 1; }
    else { out = [0, 0, 0, 0, 0, 0]; for (let v = 1; v <= 10; v++) { const [nt, ns] = addCard(t, soft, v); const d = dealerDist(nt, ns, s17); for (let i = 0; i < 6; i++) out[i] += PV[v] * d[i]; } }
    dealerMemo.set(key, out); return out;
  }
  // dealer's final distribution given the up card (hole unknown, no blackjack), or given both cards (peek)
  function dealerView(up, hole, R) {
    if (hole) { const h = handTotal([up, hole]); return dealerDist(h.t, h.soft, R.s17); }
    const out = [0, 0, 0, 0, 0, 0]; let norm = 0;
    for (let v = 1; v <= 10; v++) { if ((up === 1 && v === 10) || (up === 10 && v === 1)) continue; const h = handTotal([up, v]); const d = dealerDist(h.t, h.soft, R.s17); norm += PV[v]; for (let i = 0; i < 6; i++) out[i] += PV[v] * d[i]; }
    return out.map((x) => x / norm);
  }
  function makeEV(D, R) { // EV functions for one dealer distribution
    const memoH = new Map();
    const standF = (t, n) => { if (t > 21) return -1; if (R.charlie && n >= 5) return 1; let e = D[5]; for (let i = 0; i < 5; i++) { const d = 17 + i; e += t > d ? D[i] : t < d ? -D[i] : R.ties ? D[i] : 0; } return e; };
    function best(t, soft, n) { // stand or hit, no double
      if (t > 21) return -1; if (R.charlie && n >= 5) return 1;
      const key = t * 100 + (soft ? 50 : 0) + n; const m = memoH.get(key); if (m !== undefined) return m;
      const s = standF(t, n); let h = 0; for (let v = 1; v <= 10; v++) { const [nt, ns] = addCard(t, soft, v); h += PV[v] * best(nt, ns, n + 1); }
      const r = Math.max(s, h); memoH.set(key, r); return r;
    }
    function hit(t, soft, n) { let h = 0; for (let v = 1; v <= 10; v++) { const [nt, ns] = addCard(t, soft, v); h += PV[v] * best(nt, ns, n + 1); } return h; }
    function dbl(t, soft, n) { let e = 0; for (let v = 1; v <= 10; v++) { const [nt] = addCard(t, soft, v); e += PV[v] * standF(nt, n + 1); } return 2 * e; }
    function afterSplit(v) { // one hand started from a single card; double allowed, no resplit; split aces take one card
      let e = 0; for (let c = 1; c <= 10; c++) { const h = handTotal([v, c]); e += PV[c] * (v === 1 ? standF(h.t, 2) : Math.max(standF(h.t, 2), hit(h.t, h.soft, 2), dbl(h.t, h.soft, 2))); } return e;
    }
    return { stand: standF, hit, dbl, best, afterSplit };
  }
  // the options for a hand: {stand, hit, double?, split?, surrender?} EVs, per unit of the hand's starting bet
  const evMemo = new Map();
  function evFor(dealer, R) { const hole = R.peek ? dealer.hole : 0, key = ruleKey(R) + '#' + dealer.up + ',' + hole; let E = evMemo.get(key); if (!E) { E = makeEV(dealerView(dealer.up, hole || null, R), R); evMemo.set(key, E); } return E; }
  function bjOptions(vals, dealer, R, opts = {}) { // dealer: {up, hole|null}; opts: {first, canSplit, splitAces}
    const E = evFor(dealer, R), h = handTotal(vals), n = vals.length;
    const o = { stand: E.stand(h.t, n) };
    if (opts.splitAces) return o;
    o.hit = E.hit(h.t, h.soft, n);
    if (n === 2) o.double = E.dbl(h.t, h.soft, n);
    if (n === 2 && opts.canSplit && vals[0] === vals[1]) o.split = 2 * E.afterSplit(vals[0]);
    if (n === 2 && opts.first && R.surrender) o.surrender = -0.5;
    return o;
  }
  function bjBest(vals, dealer, R, opts) { const o = bjOptions(vals, dealer, R, opts); let k = 'stand'; for (const x of Object.keys(o)) if (o[x] > o[k] + 1e-12) k = x; return { action: k, ev: o[k], options: o }; }
  const rtpMemo = new Map();
  function bjRtp(R) { // exact return per unit bet for these rules under the engine's best play
    const key = ruleKey(R); if (rtpMemo.has(key)) return rtpMemo.get(key);
    let ev = 0;
    for (let up = 1; up <= 10; up++) for (let hole = 1; hole <= 10; hole++) {
      const pd = PV[up] * PV[hole], dBJ = (up === 1 && hole === 10) || (up === 10 && hole === 1);
      for (let a = 1; a <= 10; a++) for (let b = 1; b <= 10; b++) {
        const p = pd * PV[a] * PV[b], pBJ = (a === 1 && b === 10) || (a === 10 && b === 1);
        if (pBJ) { ev += p * (dBJ ? 0 : R.bjPay); continue; }
        if (dBJ) { ev -= p; continue; }
        // without peek the decision depends only on the up card (the hole is known not to make blackjack)
        ev += p * bjBest([a, b], { up, hole }, R, { first: true, canSplit: true }).ev;
      }
    }
    const r = 1 + ev; rtpMemo.set(key, r); return r;
  }
  // a playable round: cards are 0..51 ids drawn with replacement (infinite deck)
  function bjDeal(r) { const c = () => Math.floor(r() * 52); return { dealer: [c(), c()], hands: [{ cards: [c(), c()], bet: 1, done: false }], at: 0, split: false, over: false }; }
  const vals = (cards) => cards.map(bjVal);
  const isBJ = (cards) => cards.length === 2 && handTotal(vals(cards)).t === 21;
  function bjStart(st, R) { // resolve blackjacks before any play (the dealer peeks)
    const pB = isBJ(st.hands[0].cards), dB = isBJ(st.dealer);
    if (pB || dB) { st.over = true; st.hands[0].done = true; st.hands[0].result = pB && dB ? 'push' : pB ? 'blackjack' : 'lose'; st.hands[0].ret = pB && dB ? 1 : pB ? 1 + R.bjPay : 0; st.dealerShown = true; }
    return st;
  }
  function bjLegal(st, R) {
    const h = st.hands[st.at]; if (!h || st.over) return [];
    const n = h.cards.length, a = ['hit', 'stand'];
    if (h.splitAces) return ['stand'];
    if (n === 2) a.push('double');
    if (n === 2 && !st.split && bjVal(h.cards[0]) === bjVal(h.cards[1])) a.push('split');
    if (n === 2 && !st.split && R.surrender) a.push('surrender');
    return a;
  }
  function bjAdvise(st, R) {
    const h = st.hands[st.at]; const legal = bjLegal(st, R); if (!legal.length) return null;
    const o = bjOptions(vals(h.cards), { up: bjVal(st.dealer[0]), hole: bjVal(st.dealer[1]) }, R, { first: !st.split, canSplit: !st.split, splitAces: h.splitAces });
    let best = 'stand'; for (const k of legal) if (o[k] !== undefined && o[k] > o[best] + 1e-12) best = k; return { action: best, options: o };
  }
  function bjAct(st, R, act, r) {
    const c = () => Math.floor(r() * 52), h = st.hands[st.at];
    if (!bjLegal(st, R).includes(act)) return 'not now';
    if (act === 'hit') { h.cards.push(c()); const t = handTotal(vals(h.cards)).t; if (t >= 21 || (R.charlie && h.cards.length >= 5)) h.done = true; }
    else if (act === 'stand') h.done = true;
    else if (act === 'double') { h.bet = 2; h.cards.push(c()); h.done = true; }
    else if (act === 'surrender') { h.done = true; h.surrendered = true; }
    else if (act === 'split') {
      const aces = bjVal(h.cards[0]) === 1; st.split = true;
      const h2 = { cards: [h.cards[1], c()], bet: 1, done: false, splitAces: aces }; h.cards = [h.cards[0], c()]; h.splitAces = aces;
      st.hands.push(h2); if (aces) { h.done = true; h2.done = true; }
    }
    while (st.at < st.hands.length && st.hands[st.at].done) st.at++;
    if (st.at >= st.hands.length) bjFinish(st, R, r);
    return '';
  }
  function bjFinish(st, R, r) {
    st.over = true; st.dealerShown = true;
    const live = st.hands.some((h) => !h.surrendered && handTotal(vals(h.cards)).t <= 21 && !(R.charlie && h.cards.length >= 5));
    if (live) { for (;;) { const d = handTotal(vals(st.dealer)); if (d.t > 21 || d.t > 17 || (d.t === 17 && (!d.soft || R.s17))) break; st.dealer.push(Math.floor(r() * 52)); } }
    const dt = handTotal(vals(st.dealer)).t;
    for (const h of st.hands) {
      const t = handTotal(vals(h.cards)).t;
      if (h.surrendered) { h.result = 'surrender'; h.ret = 0.5; }
      else if (t > 21) { h.result = 'bust'; h.ret = 0; }
      else if (R.charlie && h.cards.length >= 5) { h.result = 'charlie'; h.ret = 2 * h.bet; }
      else if (dt > 21 || t > dt) { h.result = 'win'; h.ret = 2 * h.bet; }
      else if (t === dt) { if (R.ties) { h.result = 'tie win'; h.ret = 2 * h.bet; } else { h.result = 'push'; h.ret = h.bet; } }
      else { h.result = 'lose'; h.ret = 0; }
    }
  }
  // total staked and returned, per unit of the starting bet
  const bjStaked = (st) => st.hands.reduce((t, h) => t + h.bet, 0);
  const bjReturned = (st) => st.hands.reduce((t, h) => t + (h.ret || 0), 0);
  function bjAutoRound(r, R) { const st = bjStart(bjDeal(r), R); while (!st.over) bjAct(st, R, bjAdvise(st, R).action, r); return st; }

  // ================================================================ roulette
  const REDS = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);
  const WHEELS = { american: { pockets: 38, name: 'American (0, 00)' }, european: { pockets: 37, name: 'European (single 0)' }, partage: { pockets: 37, name: 'La Partage (half back on 0)' } };
  const LUCKY_MULTS = [[50, 0.5], [100, 0.3], [200, 0.15], [500, 0.05]];
  const luckyMean = LUCKY_MULTS.reduce((t, [m, p]) => t + m * p, 0);
  // pocket numbers: 0..36, and 37 means 00
  function rouletteRtp(cfg, bet) { // bet kind: 'straight' | 'even' | 'dozen'
    const N = WHEELS[cfg.wheel].pockets, k = cfg.lucky || 0;
    if (bet === 'straight') return ((1 - k / 36) * 36 + (k / 36) * (luckyMean + 1)) / N;
    if (bet === 'dozen') return 36 / N;
    return (36 + (cfg.wheel === 'partage' ? 0.5 : 0)) / N;
  }
  function rouletteSpin(r, cfg) {
    const N = WHEELS[cfg.wheel].pockets, n = Math.floor(r() * N), lucky = [];
    const pool = []; for (let i = 1; i <= 36; i++) pool.push(i);
    for (let i = 0; i < (cfg.lucky || 0); i++) { const j = Math.floor(r() * pool.length); const num = pool.splice(j, 1)[0]; let x = r(), m = 50; for (const [mm, p] of LUCKY_MULTS) { if (x < p) { m = mm; break; } x -= p; } lucky.push({ n: num, m }); }
    return { n, lucky };
  }
  // bet: {kind:'straight', n} | {kind:'red'|'black'|'odd'|'even'|'low'|'high'} | {kind:'dozen', d:0..2}; returns chips back per unit staked
  function rouletteReturn(spin, bet, cfg) {
    const n = spin.n, zero = n === 0 || n === 37;
    if (bet.kind === 'straight') { if (n !== bet.n) return 0; const l = spin.lucky.find((x) => x.n === n); return (l ? l.m : 35) + 1; }
    if (bet.kind === 'dozen') return !zero && Math.floor((n - 1) / 12) === bet.d ? 3 : 0;
    if (zero) return cfg.wheel === 'partage' ? 0.5 : 0;
    const win = { red: REDS.has(n), black: !REDS.has(n), odd: n % 2 === 1, even: n % 2 === 0, low: n <= 18, high: n >= 19 }[bet.kind];
    return win ? 2 : 0;
  }
  const pocketName = (n) => (n === 37 ? '00' : String(n));
  const pocketColor = (n) => (n === 0 || n === 37 ? 'green' : REDS.has(n) ? 'red' : 'black');

  const api = { SYM, PAY3, CHERRY2, LINES, LINE_DIV, FREE_SPINS, slotWeights, linePay, slotRtp, slotSpin,
    RANKS, SUITS, rk, su, cardName, shuffled, HANDS, HAND_NAME, evalHand, pokerHold, POKER_FREQ, pokerRtp, pokerDeal, pokerDraw,
    PV, bjVal, handTotal, dealerDist, dealerView, bjOptions, bjBest, bjRtp, bjDeal, bjStart, bjLegal, bjAdvise, bjAct, bjStaked, bjReturned, bjAutoRound, isBJ,
    REDS, WHEELS, LUCKY_MULTS, luckyMean, rouletteRtp, rouletteSpin, rouletteReturn, pocketName, pocketColor };
  if (typeof module !== 'undefined') module.exports = api; else root.HRGames = api;
})(typeof window !== 'undefined' ? window : globalThis);
