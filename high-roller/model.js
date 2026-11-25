// High Roller economy: chips, levels, bets, upgrades, auto-players, offline earnings and the VIP reset.
// DOM-free so node tests and pacing bots can drive it. The games' own rules live in games.js.
//   save          plain JSON (localStorage in the app)
//   cfg(save, g)  a game's current rules (slot reels, poker paytable, blackjack rules, roulette wheel) from its upgrades
//   rtp(save, g)  that game's return per chip staked (exact for slots/blackjack/roulette, measured strategy for poker), VIP bonus included
//   settle()      every round, manual or auto, goes through here: chips, XP (= chips staked), level-ups and their rewards
//   tick()        auto-players play real rounds while the app is open; offline() pays expected value for time away, capped
(function (root) {
  'use strict';
  const G = typeof module !== 'undefined' ? require('./games.js') : root.HRGames;
  const SAVE_V = 1;
  const T = { // tuning knobs (the pacing bot in test.js checks them)
    startChips: 250, xpBase: 40, xpGrow: 1.75, levelReward: 0.15, offlineCapH: 8, offlineRate: 0.8, vipLevel: 20, price: 0.6,
  };
  // bets: 1, 2, 5, 10, 25, 50, 100, 250, 500, 1K ...
  const BETS = []; for (let e = 0; BETS.length < 60; e++) for (const m of [1, 2.5, 5]) BETS.push(m === 2.5 && e === 0 ? 2 : m * Math.pow(10, e));
  const maxTier = (save) => Math.min(BETS.length - 1, Math.floor((save.level - 1) / 2)); // a new bet every two levels

  const GAMES = {
    slots: { name: 'Slots', icon: '🎰', unlockLevel: 1, rate: 0.55, blurb: 'Three reels, up to nine lines. Wilds, lucky reels and free spins.' },
    blackjack: { name: 'Blackjack', icon: '🂡', unlockLevel: 5, rate: 0.3, blurb: 'Real rules, infinite shoe. Buy better rules until the house is the one sweating.' },
    poker: { name: 'Video Poker', icon: '🃏', unlockLevel: 12, rate: 0.35, blurb: 'Jacks or Better. Hold, draw, and upgrade the paytable past full pay.' },
    roulette: { name: 'Roulette', icon: '🎡', unlockLevel: 22, rate: 0.22, blurb: 'Swap the double-zero wheel for a better one, then light up Lucky Numbers that pay up to 500 to 1.' },
  };
  const GAME_IDS = Object.keys(GAMES);
  const PAYTABLES = [ // Jacks or Better: full house / flush
    { name: '6/5', fh: 6, flush: 5 }, { name: '7/5', fh: 7, flush: 5 }, { name: '8/5', fh: 8, flush: 5 }, { name: '9/5', fh: 9, flush: 5 }, { name: '9/6 full pay', fh: 9, flush: 6 }];
  const QUADS = [25, 35, 50, 80];
  const BJ_PAYS = [[1.2, '6:5'], [1.5, '3:2'], [1.75, '7:4'], [2, '2:1']];
  const WHEEL_ORDER = ['american', 'european', 'partage'];
  // upgrades: each level has a target player level `at`; its price is price(at), so costs keep pace with the bets
  const UP = {
    slots: [
      { id: 'lines', name: 'More lines', max: 3, at: [2, 6, 12], desc: (l) => `${[3, 5, 7, 9][l]} lines → ${[3, 5, 7, 9][l + 1]} (extra lines come at a discount)` },
      { id: 'lucky', name: 'Lucky reels', max: 5, at: [3, 5, 8, 11, 15], desc: () => 'Fewer blanks on every reel' },
      { id: 'wild', name: 'Wilds', max: 4, at: [4, 9, 14, 20], desc: (l) => (l ? 'More wilds on the reels' : 'Add a wild symbol that stands in for anything (three pay 1500)') },
      { id: 'star', name: 'Free spins', max: 4, at: [7, 13, 19, 26], desc: (l) => (l ? `Free spins ${G.FREE_SPINS[l]} → ${G.FREE_SPINS[l + 1]}` : `Add stars: 3+ anywhere give ${G.FREE_SPINS[1]} free spins`) },
      { id: 'auto', name: 'Auto-spinner', max: 12, at: [2, 3, 5, 7, 9, 12, 15, 18, 22, 26, 30, 35], desc: (l) => `${l} → ${l + 1} machines spinning on their own` },
      { id: 'speed', name: 'Faster reels', max: 5, at: [8, 14, 20, 28, 36], desc: (l) => `Auto-spinners ${(1 + 0.5 * l).toFixed(1)}× → ${(1.5 + 0.5 * l).toFixed(1)}× speed` },
    ],
    blackjack: [
      { id: 'card', name: 'Strategy card', max: 1, at: [5], desc: () => 'Shows the best play every hand (needed for auto-dealers)' },
      { id: 'pay', name: 'Blackjack pays', max: 3, at: [7, 16, 28], desc: (l) => `Blackjack pays ${BJ_PAYS[l][1]} → ${BJ_PAYS[l + 1][1]}` },
      { id: 's17', name: 'Dealer stands on soft 17', max: 1, at: [10], desc: () => 'The dealer stops on soft 17 instead of hitting' },
      { id: 'surrender', name: 'Surrender', max: 1, at: [13], desc: () => 'Give up a bad hand for half your bet back' },
      { id: 'charlie', name: 'Five-card Charlie', max: 1, at: [20], desc: () => 'Five cards without busting wins on the spot' },
      { id: 'ties', name: 'Ties win', max: 1, at: [32], desc: () => 'Every push pays as a win' },
      { id: 'peek', name: 'X-ray specs', max: 1, at: [42], desc: () => "See the dealer's hole card. The strategy card uses it" },
      { id: 'auto', name: 'Auto-dealer', max: 12, at: [6, 8, 10, 12, 15, 18, 21, 25, 29, 33, 38, 44], desc: (l) => `${l} → ${l + 1} tables playing perfect strategy`, req: 'card' },
      { id: 'speed', name: 'Faster dealing', max: 5, at: [11, 19, 27, 35, 45], desc: (l) => `Auto-dealers ${(1 + 0.5 * l).toFixed(1)}× → ${(1.5 + 0.5 * l).toFixed(1)}× speed` },
    ],
    poker: [
      { id: 'card', name: 'Strategy card', max: 1, at: [12], desc: () => 'Highlights the cards to hold (needed for auto-players)' },
      { id: 'table', name: 'Better paytable', max: 4, at: [13, 17, 22, 28], desc: (l) => `Full house/flush ${PAYTABLES[l].name} → ${PAYTABLES[l + 1].name}` },
      { id: 'quads', name: 'Bonus quads', max: 3, at: [19, 26, 34], desc: (l) => `Four of a kind pays ${QUADS[l]} → ${QUADS[l + 1]}` },
      { id: 'twopair', name: 'Two pair pays 3', max: 1, at: [46], desc: () => 'Two pair pays 3 instead of 2' },
      { id: 'auto', name: 'Auto-player', max: 12, at: [13, 15, 17, 20, 23, 26, 29, 32, 36, 40, 44, 48], desc: (l) => `${l} → ${l + 1} machines holding by the strategy card`, req: 'card' },
      { id: 'speed', name: 'Faster deals', max: 5, at: [18, 25, 33, 41, 49], desc: (l) => `Auto-players ${(1 + 0.5 * l).toFixed(1)}× → ${(1.5 + 0.5 * l).toFixed(1)}× speed` },
    ],
    roulette: [
      { id: 'wheel', name: 'Better wheel', max: 2, at: [24, 33], desc: (l) => `${G.WHEELS[WHEEL_ORDER[l]].name} → ${G.WHEELS[WHEEL_ORDER[l + 1]].name}` },
      { id: 'lucky', name: 'Lucky Numbers', max: 5, at: [25, 30, 36, 42, 48], desc: (l) => `${l} → ${l + 1} numbers a spin pay 50-500 to 1 on straight-up bets` },
      { id: 'auto', name: 'Auto-croupier', max: 12, at: [22, 24, 26, 28, 31, 34, 37, 40, 43, 46, 50, 54], desc: (l) => `${l} → ${l + 1} wheels betting straight-up numbers` },
      { id: 'speed', name: 'Faster wheels', max: 5, at: [29, 37, 45, 52, 58], desc: (l) => `Auto-croupiers ${(1 + 0.5 * l).toFixed(1)}× → ${(1.5 + 0.5 * l).toFixed(1)}× speed` },
    ],
  };
  const upDef = (g, id) => UP[g].find((u) => u.id === id);
  const lvl = (save, g, id) => (save.games[g].up[id] || 0);
  function upCost(save, g, id) { const u = upDef(g, id), l = lvl(save, g, id); return l >= u.max ? null : price(u.at[l]); }
  const unlockCost = (g) => (GAMES[g].unlockLevel > 1 ? price(GAMES[g].unlockLevel) * 2 : 0);
  function canBuy(save, g, id) {
    const u = upDef(g, id), c = upCost(save, g, id); if (!save.games[g].open) return 'locked'; if (c == null) return 'maxed';
    if (u.req && !lvl(save, g, u.req)) return `needs the ${upDef(g, u.req).name}`;
    return save.chips >= c ? '' : 'not enough chips';
  }
  function buy(save, g, id) { const e = canBuy(save, g, id); if (e) return e; save.chips -= upCost(save, g, id); save.games[g].up[id] = lvl(save, g, id) + 1; save.stats.upgrades++; return ''; }
  function canUnlock(save, g) { const D = GAMES[g]; if (save.games[g].open) return 'open'; if (save.level < D.unlockLevel) return `reach level ${D.unlockLevel}`; return save.chips >= unlockCost(g) ? '' : 'not enough chips'; }
  function unlock(save, g) { const e = canUnlock(save, g); if (e) return e; save.chips -= unlockCost(g); save.games[g].open = true; save.games[g].bet = Math.max(0, maxTier(save) - 2); return ''; }

  function cfg(save, g) {
    const L = (id) => lvl(save, g, id);
    if (g === 'slots') return { lines: [3, 5, 7, 9][L('lines')], lucky: L('lucky'), wild: L('wild'), star: L('star') };
    if (g === 'blackjack') return { bjPay: BJ_PAYS[L('pay')][0], s17: !!L('s17'), surrender: !!L('surrender'), charlie: !!L('charlie'), ties: !!L('ties'), peek: !!L('peek') };
    if (g === 'poker') { const pt = PAYTABLES[L('table')]; return { pay: { royal: 800, sf: 50, quads: QUADS[L('quads')], fh: pt.fh, flush: pt.flush, straight: 4, trips: 3, twopair: L('twopair') ? 3 : 2, jacks: 1 }, table: pt.name }; }
    return { wheel: WHEEL_ORDER[L('wheel')], lucky: L('lucky') };
  }
  const vipBonus = (save) => 0.01 * (save.vip || 0); // each VIP star: +1% on every return
  function baseRtp(save, g) {
    const c = cfg(save, g);
    if (g === 'slots') return G.slotRtp(c).rtp;
    if (g === 'blackjack') return G.bjRtp(c);
    if (g === 'poker') return G.pokerRtp(c.pay);
    return G.rouletteRtp(c, 'straight');
  }
  // what a round actually pays back is multiplied by (1 + vip), so the shown return includes it
  const rtp = (save, g) => baseRtp(save, g) * (1 + vipBonus(save));
  const machines = (save, g) => (save.games[g].open ? lvl(save, g, 'auto') : 0);
  const roundRate = (save, g) => GAMES[g].rate * (1 + 0.5 * lvl(save, g, 'speed')); // rounds per second per auto machine
  const betTier = (save, g) => (save.games[g].betMax !== false ? maxTier(save) : Math.min(save.games[g].bet, maxTier(save))); // 'max' follows your level
  function autoBet(save, g) { // the chosen bet, stepped down while chips are short (keeps 20 bets in hand)
    let t = betTier(save, g); while (t > 0 && save.chips < BETS[t] * 20) t--; return BETS[t];
  }
  const price = (L) => { const p = T.price * xpNeed(L); const e = Math.pow(10, Math.floor(Math.log10(p)) - 1); return Math.round(p / e) * e; }; // two significant figures
  const xpNeed = (L) => Math.round(T.xpBase * Math.pow(T.xpGrow, L - 1));
  function levelReward(L) { return Math.round(T.levelReward * xpNeed(L)); } // paid on reaching L+1
  const xpMult = (save) => 1 + 0.05 * (save.vip || 0);

  function newSave(now = Date.now()) {
    const games = {}; for (const g of GAME_IDS) games[g] = { open: g === 'slots', up: {}, bet: 0, acc: 0, net: 0, rounds: 0 };
    return { v: SAVE_V, chips: T.startChips, level: 1, xp: 0, games, vip: 0, life: { wagered: 0, won: 0 }, stats: { rounds: 0, biggest: 0, upgrades: 0, resets: 0 }, lastSeen: now, created: now, sound: true, events: [] };
  }
  function load(raw, now = Date.now()) {
    let s = null; try { s = raw ? JSON.parse(raw) : null; } catch { s = null; }
    if (!s || s.v !== SAVE_V) return newSave(now);
    const fresh = newSave(now); for (const g of GAME_IDS) s.games[g] = Object.assign(fresh.games[g], s.games[g] || {});
    s.stats = Object.assign(fresh.stats, s.stats || {}); s.life = Object.assign(fresh.life, s.life || {}); s.events = [];
    return s;
  }

  // every round goes through here. staked and returned in chips (returned already includes the VIP bonus)
  function settle(save, g, staked, returned, auto) {
    save.chips += returned - staked; save.life.wagered += staked; save.life.won += returned;
    const gs = save.games[g]; gs.net += returned - staked; gs.rounds++; save.stats.rounds++;
    if (returned - staked > save.stats.biggest) save.stats.biggest = returned - staked;
    const ups = addXp(save, staked);
    if (!auto) pitBoss(save);
    return ups;
  }
  // the pit boss never lets you sit there broke: when you can't cover a quarter of your top bet, a stack of 25 top bets, at most every 2 minutes
  function pitBoss(save, now = Date.now()) {
    const top = BETS[maxTier(save)]; if (save.chips >= Math.max(BETS[0], top / 4)) return 0;
    if (now - (save.markerAt || 0) < 120000 && save.chips >= BETS[0]) return 0;
    const amt = 25 * top; save.chips += amt; save.markerAt = now; save.events.push({ k: 'marker', amount: amt }); return amt;
  }
  function addXp(save, x) {
    save.xp += x * xpMult(save); let ups = 0;
    while (save.xp >= xpNeed(save.level)) { save.xp -= xpNeed(save.level); const rw = levelReward(save.level); save.chips += rw; save.level++; ups++; save.events.push({ k: 'level', level: save.level, reward: rw }); }
    return ups;
  }
  const vipMul = (save) => 1 + vipBonus(save);

  // ---- one auto round per game, real cards and reels
  function autoRound(save, g, r, manual = false) {
    const bet = autoBet(save, g), c = cfg(save, g), m = vipMul(save);
    if (save.chips < bet) return null;
    let staked = bet, ret = 0, big = null;
    if (g === 'slots') {
      const s = G.slotSpin(r, c, bet); ret = s.win;
      for (let i = 0; i < s.free; i++) ret += G.slotSpin(r, c, bet).win;
      if (ret >= bet * 25) big = s.free ? `${s.free} free spins` : 'big win';
    } else if (g === 'blackjack') {
      const st = G.bjAutoRound(r, c); staked = bet * G.bjStaked(st); ret = bet * G.bjReturned(st);
      if (st.hands[0].result === 'blackjack') big = null;
    } else if (g === 'poker') {
      const st = G.pokerDeal(r), h = G.pokerDraw(st, G.pokerHold(st.hand)), cat = G.evalHand(h); ret = bet * (c.pay[cat] || 0);
      if (['royal', 'sf', 'quads'].includes(cat)) big = G.HAND_NAME[cat];
    } else {
      const n = 1 + Math.floor(r() * 36), sp = G.rouletteSpin(r, c); ret = bet * G.rouletteReturn(sp, { kind: 'straight', n }, c);
      if (ret > 0) big = `${n} hit${ret > bet * 40 ? ' a Lucky Number' : ''}`;
    }
    ret *= m;
    settle(save, g, staked, ret, !manual);
    if (big && ret - staked > 0) save.events.push({ k: 'big', g, text: big, amount: ret - staked });
    return { staked, ret };
  }
  // advance auto-players by dt seconds. Up to `cap` real rounds per game per call; the rest is paid as expected value
  function tick(save, dt, r, cap = 60) {
    for (const g of GAME_IDS) {
      const n = machines(save, g); if (!n) continue; const gs = save.games[g];
      gs.acc += n * roundRate(save, g) * dt;
      let played = 0; while (gs.acc >= 1 && played < cap) { gs.acc--; played++; if (!autoRound(save, g, r)) { gs.acc = 0; break; } }
      if (gs.acc >= 1) { const k = Math.floor(gs.acc); gs.acc -= k; evRounds(save, g, k); }
    }
  }
  function evRounds(save, g, k) { // k rounds paid at expected value (catch-up and offline)
    const bet = autoBet(save, g); if (save.chips < bet) return 0;
    const staked = k * bet * (g === 'blackjack' ? 1.1 : 1), net = staked * (rtp(save, g) - 1);
    save.chips = Math.max(0, save.chips + net); save.life.wagered += staked; save.life.won += staked + net; save.games[g].net += net; save.games[g].rounds += k; save.stats.rounds += k;
    addXp(save, staked); return net;
  }
  function incomeRate(save) { // expected chips per second from the auto-players (level rewards not included)
    let t = 0; for (const g of GAME_IDS) { const n = machines(save, g); if (n) t += n * roundRate(save, g) * autoBet(save, g) * (rtp(save, g) - 1); } return t;
  }
  function offline(save, now = Date.now()) { // pays for time away. Only winning games pay; losing ones sit idle
    const away = Math.max(0, (now - (save.lastSeen ?? now)) / 1000); save.lastSeen = now;
    if (away < 60) return null;
    const secs = Math.min(away, T.offlineCapH * 3600) * T.offlineRate, before = save.chips, lv = save.level; let rounds = 0;
    for (const g of GAME_IDS) { const n = machines(save, g); if (!n || rtp(save, g) < 1) continue; const k = Math.floor(n * roundRate(save, g) * secs); rounds += k; evRounds(save, g, k); }
    save.events = save.events.filter((e) => e.k !== 'level');
    if (!rounds) return null;
    return { away, capped: away > T.offlineCapH * 3600, rounds, chips: save.chips - before, levels: save.level - lv };
  }
  // ---- VIP reset: sell the casino for stars
  const vipTotal = (w) => Math.max(0, Math.floor(5 * (Math.log10(Math.max(1, w)) - 9.5))); // 2 stars at 10B lifetime wagered, +5 per tenfold
  const vipGain = (save) => Math.max(0, vipTotal(save.life.wagered) - (save.vipFromWager || 0));
  function canVip(save) { if (save.level < T.vipLevel) return `reach level ${T.vipLevel}`; return vipGain(save) > 0 ? '' : 'wager more first'; }
  function vipReset(save, now = Date.now()) {
    const e = canVip(save); if (e) return e;
    const gain = vipGain(save), keep = { vip: (save.vip || 0) + gain, vipFromWager: (save.vipFromWager || 0) + gain, life: save.life, stats: save.stats, sound: save.sound, created: save.created };
    const fresh = newSave(now); Object.assign(save, fresh, keep); save.stats.resets++; save.chips = T.startChips * (1 + keep.vip); return '';
  }

  const api = { G, T, SAVE_V, BETS, maxTier, GAMES, GAME_IDS, UP, PAYTABLES, QUADS, BJ_PAYS, WHEEL_ORDER, upDef, lvl, upCost, unlockCost, price, canBuy, buy, canUnlock, unlock,
    cfg, rtp, baseRtp, pitBoss, betTier, vipMul, machines, roundRate, autoBet, xpNeed, levelReward, newSave, load, settle, addXp, autoRound, tick, evRounds, incomeRate, offline, vipTotal, vipGain, canVip, vipReset };
  if (typeof module !== 'undefined') module.exports = api; else root.HRModel = api;
})(typeof window !== 'undefined' ? window : globalThis);
