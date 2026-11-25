// High Roller app: draws the four machines, takes taps, plays synth sounds, runs the auto-players and keeps the save in localStorage.
// All rules and odds are in games.js; the economy (chips, levels, upgrades, offline) is in model.js.
(function () {
  'use strict';
  const M = window.HRModel, G = window.HRGames, KEY = 'high-roller-v1';
  const $ = (s, el = document) => el.querySelector(s);
  const rand = Math.random;

  // ------------------------------------------------------------------ numbers
  const SUF = ['', 'K', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx', 'Sp', 'Oc', 'No', 'Dc'];
  function fmt(n, dec = false) {
    if (!isFinite(n)) return '∞'; const neg = n < 0; n = Math.abs(n);
    let s; if (n < 1000) s = dec && n < 100 && n % 1 ? n.toFixed(1) : String(Math.floor(n));
    else { const e = Math.min(SUF.length - 1, Math.floor(Math.log10(n) / 3)); const v = n / Math.pow(1000, e); s = (v < 10 ? v.toFixed(2) : v < 100 ? v.toFixed(1) : Math.floor(v)) + SUF[e]; }
    return (neg ? '−' : '') + s;
  }
  const pct = (x) => (x * 100).toFixed(1) + '%';

  // ------------------------------------------------------------------ sound (WebAudio synth)
  let AC = null;
  function ac() { if (!AC) { try { AC = new (window.AudioContext || window.webkitAudioContext)(); } catch { AC = null; } } if (AC && AC.state === 'suspended') AC.resume(); return AC; }
  function tone(f, dur, type = 'sine', vol = 0.08, slide = 1, delay = 0) {
    if (!save.sound) return; const a = ac(); if (!a) return; const t = a.currentTime + delay, o = a.createOscillator(), g = a.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t); if (slide !== 1) o.frequency.exponentialRampToValueAtTime(f * slide, t + dur);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur); o.connect(g).connect(a.destination); o.start(t); o.stop(t + dur + 0.02);
  }
  function noise(dur, vol = 0.05, hp = 1000, delay = 0) {
    if (!save.sound) return; const a = ac(); if (!a) return; const t = a.currentTime + delay, n = Math.floor(a.sampleRate * dur), b = a.createBuffer(1, n, a.sampleRate), d = b.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n); const s = a.createBufferSource(), f = a.createBiquadFilter(), g = a.createGain();
    f.type = 'highpass'; f.frequency.value = hp; g.gain.value = vol; s.buffer = b; s.connect(f).connect(g).connect(a.destination); s.start(t);
  }
  const sfx = {
    tap: () => tone(660, 0.05, 'triangle', 0.05),
    tick: () => tone(1400 + Math.random() * 300, 0.025, 'square', 0.02),
    stop: () => (tone(180, 0.09, 'triangle', 0.1), noise(0.05, 0.04, 2500)),
    card: (d = 0) => noise(0.07, 0.07, 1800, d),
    chip: (d = 0) => (tone(2400, 0.04, 'triangle', 0.05, 1, d), tone(3100, 0.05, 'triangle', 0.04, 1, d + 0.03)),
    win: () => [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.18, 'triangle', 0.08, 1, i * 0.07)),
    big: () => { [523, 659, 784, 1046, 1318, 1568].forEach((f, i) => tone(f, 0.25, 'square', 0.05, 1, i * 0.08)); for (let i = 0; i < 10; i++) sfx.chip(0.5 + i * 0.06); },
    lose: () => tone(220, 0.25, 'triangle', 0.06, 0.6),
    level: () => [392, 523, 659, 784, 1046].forEach((f, i) => tone(f, 0.22, 'triangle', 0.08, 1, i * 0.09)),
    buy: () => (tone(520, 0.08, 'triangle', 0.08), tone(780, 0.12, 'triangle', 0.08, 1, 0.06)),
    nope: () => tone(140, 0.12, 'square', 0.04),
    ball: () => tone(2000 + Math.random() * 800, 0.02, 'sine', 0.03),
  };

  // ------------------------------------------------------------------ save
  function safeGet() { try { return localStorage.getItem(KEY); } catch { return null; } }
  let save = M.load(safeGet(), Date.now());
  if (save.pending) { save.chips += save.pending; save.pending = 0; } // a round cut off by closing the app: the stake comes back
  const stake = (n) => { save.chips -= n; save.pending = (save.pending || 0) + n; };
  const unstake = () => { save.chips += save.pending || 0; save.pending = 0; };
  function persist() { save.lastSeen = Date.now(); try { localStorage.setItem(KEY, JSON.stringify(save)); } catch { /* private mode: play on without saving */ } }
  setInterval(() => { if (!document.hidden) persist(); }, 5000);
  addEventListener('pagehide', persist);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { persist(); try { AC && AC.suspend(); } catch { /* no audio */ } }
    else { const away = M.offline(save, Date.now()); if (away) welcomeBack(away); lastTick = performance.now(); persist(); render(); }
  });

  // ------------------------------------------------------------------ chrome
  const page = $('#page'), nav = $('#nav'), chipsEl = $('#chips');
  let tab = (() => { try { return localStorage.getItem(KEY + '-tab'); } catch { return null; } })() || 'slots';
  if (!M.GAMES[tab] && tab !== 'lounge') tab = 'slots';
  let shown = save.chips, toastT = 0;
  function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('on'), 2000); }
  function modal(html, onClick) { $('#mbox').innerHTML = html; $('#modal').hidden = false; $('#mbox').onclick = (e) => { const b = e.target.closest('button'); if (!b) return; onClick && onClick(b.dataset.a, b); }; }
  const hideModal = () => { $('#modal').hidden = true; };
  function floatText(text, el) { const r = (el || chipsEl).getBoundingClientRect(), f = document.createElement('div'); f.className = 'float'; f.textContent = text; f.style.left = r.left + r.width / 2 + 'px'; f.style.top = r.top + 'px'; $('#fx').appendChild(f); setTimeout(() => f.remove(), 1500); }
  function coinShower(n, from) {
    const fx = $('#fx'), r = (from || page).getBoundingClientRect(), to = chipsEl.getBoundingClientRect();
    for (let i = 0; i < n; i++) {
      const c = document.createElement('div'); c.className = 'coin' + (i % 3 ? '' : ' g'); fx.appendChild(c);
      const x0 = r.left + r.width / 2 + (Math.random() - 0.5) * r.width * 0.6, y0 = r.top + r.height / 2 + (Math.random() - 0.5) * 40;
      const mx = x0 + (Math.random() - 0.5) * 160, my = y0 - 60 - Math.random() * 120;
      c.animate([{ transform: `translate(${x0}px,${y0}px) scale(.4)`, opacity: 0 }, { transform: `translate(${mx}px,${my}px) scale(1)`, opacity: 1, offset: 0.35 }, { transform: `translate(${to.right - 30}px,${to.top + 6}px) scale(.5)`, opacity: 0.9 }], { duration: 900 + Math.random() * 300, delay: i * 25, easing: 'cubic-bezier(.3,.7,.4,1)', fill: 'both' }).onfinish = () => c.remove();
    }
  }
  function bigWin(title, amount) { const d = document.createElement('div'); d.className = 'bigwin'; d.innerHTML = `<b>${title}<small>+${fmt(amount)}</small></b>`; document.body.appendChild(d); setTimeout(() => d.remove(), 1900); sfx.big(); coinShower(24); }
  function celebrate(net, staked, el) {
    if (net <= 0) return;
    const x = net / Math.max(staked, 1e-9);
    if (x >= 20) bigWin(x >= 100 ? 'MEGA WIN!' : 'BIG WIN!', net);
    else { sfx.win(); coinShower(Math.min(14, 3 + Math.round(x * 2)), el); floatText('+' + fmt(net, true), el); }
  }
  function drawHeader() {
    const lv = save.level, need = M.xpNeed(lv);
    $('#lvl').textContent = 'LV ' + lv; $('#xpbar').style.width = Math.min(100, (save.xp / need) * 100) + '%';
  }
  function animateChips() {
    const d = save.chips - shown; shown = Math.abs(d) < 0.5 ? save.chips : shown + d * 0.18;
    chipsEl.innerHTML = `<i></i>${fmt(shown)}`; chipsEl.className = 'chips' + (d > 0.5 ? ' up' : d < -0.5 ? ' down' : '');
  }
  function drainEvents() {
    for (const e of save.events) {
      if (e.k === 'level') { sfx.level(); toast(`Level ${e.level}! +${fmt(e.reward)} chips${e.level % 2 === 1 ? ' · new top bet ' + fmt(M.BETS[M.maxTier(save)]) : ''}${unlockNote(e.level)}`); }
      else if (e.k === 'marker') { toast(`The pit boss slides you ${fmt(e.amount)} chips. On the house.`); sfx.chip(); }
      else if (e.k === 'big' && e.amount >= M.autoBet(save, e.g) * 40) { toast(`${M.GAMES[e.g].icon} Auto: ${e.text}! +${fmt(e.amount)}`); }
    }
    save.events.length = 0;
  }
  const unlockNote = (L) => { const g = M.GAME_IDS.find((x) => M.GAMES[x].unlockLevel === L); return g ? ` · ${M.GAMES[g].name} can open!` : ''; };
  function renderNav() {
    const items = M.GAME_IDS.map((g) => ({ id: g, icon: M.GAMES[g].icon, name: M.GAMES[g].name.replace('Video ', ''), locked: !save.games[g].open, dot: !save.games[g].open && !M.canUnlock(save, g) })).concat([{ id: 'lounge', icon: '🍸', name: 'Lounge', dot: !M.canVip(save) }]);
    nav.innerHTML = items.map((it) => `<button data-tab="${it.id}" class="${tab === it.id ? 'on' : ''} ${it.locked ? 'locked' : ''}"><span>${it.icon}</span>${it.name}${it.dot ? '<i class="dot"></i>' : ''}</button>`).join('');
  }
  nav.onclick = (e) => { const b = e.target.closest('button'); if (!b) return; if (busy()) { toast('Finish this round first'); return; } tab = b.dataset.tab; try { localStorage.setItem(KEY + '-tab', tab); } catch { /* ok */ } sfx.tap(); page.scrollTop = 0; render(); };

  // ------------------------------------------------------------------ shared pieces
  function betBox(g) {
    const t = M.betTier(save, g), mx = M.maxTier(save), isMax = save.games[g].betMax !== false;
    return `<div class="bet"><button data-a="bet-" ${t <= 0 ? 'disabled' : ''}>−</button><span><small>${isMax ? 'MAX BET' : 'BET'}</small>${fmt(M.BETS[t])}</span><button data-a="bet+" ${t >= mx ? 'disabled' : ''}>+</button></div>`;
  }
  function changeBet(g, d) {
    const gs = save.games[g], t = M.betTier(save, g), mx = M.maxTier(save), nt = Math.max(0, Math.min(mx, t + d));
    gs.bet = nt; gs.betMax = nt === mx; sfx.chip(); render();
  }
  const curBet = (g) => M.BETS[M.betTier(save, g)];
  function rtpLine(g) {
    const r = M.rtp(save, g), n = M.machines(save, g), inc = n ? n * M.roundRate(save, g) * M.autoBet(save, g) * (r - 1) : 0;
    return `<div id="rtpbox"><div class="rtp"><span>Return to player <b class="${r >= 1 ? 'pos' : 'neg'}">${pct(r)}</b></span><span>${r >= 1 ? 'the house is losing' : 'house edge ' + pct(1 - r)}</span></div>` +
      (n ? `<div class="auto"><span class="spinner">${M.GAMES[g].icon}</span><span><b>${n}</b> auto ${n > 1 ? 'machines' : 'machine'} · ${(n * M.roundRate(save, g)).toFixed(1)} rounds/s · <b class="${inc >= 0 ? 'pos' : 'neg'}">${inc >= 0 ? '+' : ''}${fmt(inc, true)}/s</b> expected</span></div>` : '') + '</div>';
  }
  function previewUp(g, id) { // what the next level would do to the return
    const gs = save.games[g], before = M.rtp(save, g), l = M.lvl(save, g, id); gs.up[id] = l + 1; const after = M.rtp(save, g); gs.up[id] = l;
    return Math.abs(after - before) > 1e-6 ? `Return <em>${pct(before)} → ${pct(after)}</em>` : '';
  }
  function upgradesHtml(g) {
    return `<div class="ups"><h3>Upgrades</h3>${M.UP[g].map((u) => {
      const l = M.lvl(save, g, u.id), c = M.upCost(save, g, u.id), err = M.canBuy(save, g, u.id), at = u.at[l];
      const pips = u.max > 1 ? `<div class="pips">${Array.from({ length: u.max }, (_, i) => `<i class="${i < l ? 'on' : ''}"></i>`).join('')}</div>` : '';
      const pre = c != null ? previewUp(g, u.id) : '';
      const btn = c == null ? '<button class="max" disabled>MAX</button>' : err && err.startsWith('needs') ? `<button disabled>${err.replace('needs the ', 'Needs ')}</button>` : `<button data-a="buy" data-id="${u.id}" ${err ? 'disabled' : ''}>${fmt(c)}</button>`;
      return `<div class="up" data-up="${u.id}"><div class="t"><b>${u.name}${u.max > 1 ? ` <small style="color:var(--dim)">${l}/${u.max}</small>` : ''}</b><p>${c == null ? 'Fully upgraded' : u.desc(l)}${pre ? '<br>' + pre : ''}${c != null && save.level < at - 4 ? `<br><span style="opacity:.7">Priced for level ${at}</span>` : ''}</p>${pips}</div>${btn}</div>`;
    }).join('')}</div>`;
  }
  function buyUp(g, id) {
    const e = M.buy(save, g, id); if (e) { sfx.nope(); toast(e); return; }
    sfx.buy(); persist(); render(); const el = page.querySelector(`[data-up="${id}"]`); if (el) el.classList.add('flash');
  }
  function lockedHtml(g) {
    const D = M.GAMES[g], e = M.canUnlock(save, g), c = M.unlockCost(g);
    return `<div class="panel lock"><div class="ic">${D.icon}</div><h2>${D.name}</h2><p>${D.blurb}</p>
      <p>Opens at <b style="color:var(--cream)">level ${D.unlockLevel}</b> · costs <b style="color:var(--cream)">${fmt(c)}</b> chips</p>
      <button class="big" data-a="unlock" ${e ? 'disabled' : ''}>${e === 'not enough chips' ? `Need ${fmt(c)}` : e ? e[0].toUpperCase() + e.slice(1) : `Open for ${fmt(c)}`}</button></div>`;
  }
  // a round played by hand: settles chips + XP through the model
  function settleManual(g, staked, returned, el, ref) {
    const ret = returned * M.vipMul(save), net = ret - staked;
    M.settle(save, g, staked, ret, false); drainEvents(); persist();
    celebrate(net, ref || staked, el); if (net < 0 && ret === 0) sfx.lose();
    return net;
  }

  // ------------------------------------------------------------------ slots
  const SYMS = { blank: '', cherry: '🍒', lemon: '🍋', plum: '🍇', bell: '🔔', bar: '<span class="bar">BAR</span>', seven: '<span class="seven">7</span>', wild: '<span class="wild">WILD</span>', star: '⭐' };
  const SYM_NAME = { cherry: 'Cherry', lemon: 'Lemon', plum: 'Grapes', bell: 'Bell', bar: 'BAR', seven: 'Seven', wild: 'Wild' };
  const LINE_COLORS = ['#ffd23f', '#ff5a7a', '#5ad1ff', '#7dff6a', '#ff9f3f', '#c77dff', '#ff6ad5', '#6affd5', '#fff'];
  const SL = { grid: null, spinning: false, free: 0, freeTotal: 0, freeWin: 0, msg: '', msgCls: '', wins: [] };
  function slotsHtml() {
    const c = M.cfg(save, 'slots'), cell = Math.min(78, Math.floor((Math.min(innerWidth, 480) - 24 - 24 - 12 - 12) / 3));
    const grid = SL.grid || [['cherry', 'seven', 'bell'], ['lemon', 'seven', 'plum'], ['bar', 'seven', 'cherry']];
    const freeOn = SL.free > 0;
    return `<div class="cab" style="--cell:${cell}px">
      <div class="marquee ${freeOn ? 'free' : ''}">${freeOn ? `FREE SPIN ${SL.freeTotal - SL.free + 1} / ${SL.freeTotal}` : '★ Lucky Sevens ★'}</div>
      <div class="window" id="win">${grid.map((col, i) => `<div class="reel"><div class="strip" id="strip${i}">${col.map((s) => `<div class="sym">${SYMS[s]}</div>`).join('')}</div></div>`).join('')}
        <svg class="lines" id="lines" viewBox="0 0 300 ${cell * 3}" preserveAspectRatio="none"></svg></div>
      <div class="msg ${SL.msgCls}" id="smsg">${SL.msg || `${c.lines} lines · ${c.wild ? 'wilds · ' : ''}${c.star ? `3 ⭐ = ${G.FREE_SPINS[c.star]} free spins` : 'good luck'}`}</div>
      <div class="row">${betBox('slots')}<button class="big" data-a="spin" ${SL.spinning || save.chips < curBet('slots') ? 'disabled' : ''}>${SL.spinning ? '…' : 'Spin'}</button></div>
      <details><summary>Paytable (per line, × line stake)</summary><div class="paytable">${['seven', 'bar', 'bell', 'plum', 'lemon', 'cherry'].concat(c.wild ? ['wild'] : []).map((k) => `<div><span>3 × ${SYM_NAME[k]}</span><b>${G.PAY3[k]}</b></div>`).join('')}<div><span>🍒🍒 from the left</span><b>${G.CHERRY2}</b></div><div><span>Line stake</span><b>bet ÷ ${G.LINE_DIV[c.lines]}</b></div></div></details>
    </div>${rtpLine('slots')}`;
  }
  function slotSpin() {
    if (SL.spinning) return; const bet = curBet('slots'), free = SL.free > 0;
    if (!free && save.chips < bet) { M.pitBoss(save); drainEvents(); if (save.chips < bet) { sfx.nope(); toast('Not enough chips: lower your bet'); return; } }
    const c = M.cfg(save, 'slots'), res = G.slotSpin(rand, c, bet);
    if (!free) stake(bet); // shown at once; settled when the reels stop
    SL.spinning = true; SL.msg = ''; SL.msgCls = ''; render();
    const cell = parseFloat(getComputedStyle($('.cab')).getPropertyValue('--cell')), w = M.G.slotWeights(c), keys = G.SYM.filter((k) => w[k] > 0);
    const old = SL.grid || [['cherry', 'seven', 'bell'], ['lemon', 'seven', 'plum'], ['bar', 'seven', 'cherry']];
    const durs = free ? [450, 600, 750] : [800, 1100, 1400];
    for (let i = 0; i < 3; i++) {
      const n = 14 + i * 5, strip = $('#strip' + i), syms = [...res.grid[i]]; for (let k = 0; k < n; k++) syms.push(keys[Math.floor(rand() * keys.length)]); syms.push(...old[i]);
      strip.innerHTML = syms.map((s) => `<div class="sym">${SYMS[s]}</div>`).join(''); // final symbols on top; we scroll down from the old ones
      const end = 0, start = -(syms.length - 3) * cell;
      strip.animate([{ transform: `translateY(${start}px)` }, { transform: `translateY(${end + 8}px)`, offset: 0.92 }, { transform: `translateY(${end}px)` }], { duration: durs[i], easing: 'cubic-bezier(.2,.6,.3,1)', fill: 'forwards' });
      setTimeout(sfx.stop, durs[i] - 60);
    }
    let tk = setInterval(sfx.tick, 70); setTimeout(() => clearInterval(tk), durs[2] - 100);
    setTimeout(() => {
      SL.grid = res.grid; SL.spinning = false;
      const ret = res.win; let net;
      if (free) { net = settleManual('slots', 0, ret, $('#win'), bet); SL.freeWin += ret * M.vipMul(save); }
      else { unstake(); net = settleManual('slots', bet, ret, $('#win')); }
      SL.wins = res.wins;
      if (res.wins.length) { SL.msg = `Win ${fmt(ret * M.vipMul(save), true)}!`; SL.msgCls = 'win'; } else { SL.msg = free ? 'No luck' : 'No win'; SL.msgCls = 'lose'; }
      if (res.free && !free) { SL.free = res.free; SL.freeTotal = res.free; SL.freeWin = 0; SL.msg = `⭐⭐⭐ ${res.free} FREE SPINS!`; SL.msgCls = 'win'; sfx.big(); }
      else if (free) { SL.free--; if (!SL.free) { SL.msg = `Free spins paid ${fmt(SL.freeWin, true)}`; SL.msgCls = 'win'; } }
      render(); drawLines(res);
      void net;
      if (SL.free > 0) setTimeout(slotSpin, 900);
    }, durs[2] + 30);
  }
  function drawLines(res) {
    const svg = $('#lines'); if (!svg || !res) return; const cell = parseFloat(getComputedStyle($('.cab')).getPropertyValue('--cell'));
    const reels = [...document.querySelectorAll('.reel')], wr = $('#win').getBoundingClientRect();
    svg.setAttribute('viewBox', `0 0 ${wr.width - 12} ${cell * 3}`);
    const cx = reels.map((r) => { const b = r.getBoundingClientRect(); return b.left - wr.left - 6 + b.width / 2; });
    svg.innerHTML = res.wins.map((w) => `<polyline stroke="${LINE_COLORS[w.line]}" points="${G.LINES[w.line].map((row, i) => `${cx[i]},${row * cell + cell / 2}`).join(' ')}"/>`).join('');
    for (const w of res.wins) G.LINES[w.line].forEach((row, i) => { const strip = $('#strip' + i); const el = strip && strip.children[row]; if (el && (w.pay !== G.CHERRY2 || i < 2)) el.classList.add('hit'); });
  }

  // ------------------------------------------------------------------ cards
  function cardHtml(c, opts = {}) {
    if (opts.back) return `<div class="card back ${opts.cls || ''}"></div>`;
    const r = G.RANKS[G.rk(c)], s = G.SUITS[G.su(c)], red = G.su(c) === 1 || G.su(c) === 2;
    return `<div class="card ${red ? 'red' : ''} ${opts.cls || ''}" ${opts.attr || ''} style="${opts.delay ? `animation-delay:${opts.delay}ms` : ''}"><b>${r === 'T' ? '10' : r}</b><i>${s}</i></div>`;
  }
  const cw = () => Math.min(64, Math.floor((Math.min(innerWidth, 480) - 60) / 5.6));

  // ------------------------------------------------------------------ blackjack
  const BJ = { st: null, bet: 0, seen: {}, msg: '', msgCls: '', busy: false };
  const bjRules = () => M.cfg(save, 'blackjack');
  function bjCards(list, key, hideHole) {
    const seen = BJ.seen[key] || 0; let html = '', newIdx = 0;
    list.forEach((c, i) => {
      const isNew = i >= seen, delay = isNew ? newIdx++ * 220 : 0;
      if (i === 1 && hideHole) html += bjRules().peek ? cardHtml(c, { cls: 'xray' + (isNew ? ' new' : ''), delay }) : cardHtml(c, { back: true, cls: isNew ? 'new' : '' });
      else html += cardHtml(c, { cls: isNew ? 'new' : '', delay });
    });
    BJ.seen[key] = list.length; return { html, n: newIdx };
  }
  function bjHtml() {
    const R = bjRules(), st = BJ.st, w = cw(); let dealer = '', hands = '', dTot = '', played = 0;
    if (st) {
      const hide = !st.dealerShown, d = bjCards(st.dealer, 'd', hide); dealer = d.html; played += d.n;
      const dv = hide ? (R.peek ? G.handTotal(st.dealer.map(G.bjVal)).t : G.handTotal([G.bjVal(st.dealer[0])]).t) : G.handTotal(st.dealer.map(G.bjVal)).t;
      dTot = `<div class="tot">${dv}${hide && !R.peek ? '+?' : ''}</div>`;
      hands = st.hands.map((h, i) => {
        const c = bjCards(h.cards, 'h' + i); played += c.n; const t = G.handTotal(h.cards.map(G.bjVal));
        const res = h.result, cls = !res ? '' : ['win', 'blackjack', 'charlie', 'tie win'].includes(res) ? 'win' : res === 'push' ? 'push' : 'lose';
        const many = h.cards.length > (st.hands.length > 1 ? 2 : 4) ? 'many' : '';
        return `<div class="hand ${!st.over && i === st.at && st.hands.length > 1 ? 'cur' : ''}"><div class="cards ${many}">${c.html}</div><div class="tot ${cls}">${res ? res.toUpperCase() : (t.soft && t.t < 21 ? 'soft ' : '') + t.t}${h.bet > 1 ? ' ×2' : ''}</div></div>`;
      }).join('');
    }
    if (played) setTimeout(() => { for (let i = 0; i < played; i++) sfx.card(i * 0.22); }, 0);
    const legal = st && !st.over ? G.bjLegal(st, R) : [], adv = st && !st.over && M.lvl(save, 'blackjack', 'card') ? G.bjAdvise(st, R) : null;
    const canAfford = save.chips >= BJ.bet;
    const btn = (a, label) => `<button class="act ${adv && adv.action === a ? 'hint' : ''}" data-a="bj-${a}" ${legal.includes(a) && (!['double', 'split'].includes(a) || canAfford) ? '' : 'disabled'}>${label}</button>`;
    return `<div class="felt" style="--cw:${w}px">
      <div class="lbl">DEALER ${R.s17 ? 'STANDS' : 'HITS'} ON SOFT 17 · BLACKJACK PAYS ${M.BJ_PAYS[M.lvl(save, 'blackjack', 'pay')][1]}${R.peek ? ' · X-RAY' : ''}</div>
      <div class="hand"><div class="cards ${st && st.dealer.length > 4 ? 'many' : ''}">${dealer || '<div class="card back" style="opacity:.15"></div><div class="card back" style="opacity:.15"></div>'}</div>${dTot}</div>
      <div class="msg ${BJ.msgCls}">${BJ.msg || (st ? '' : 'Place your bet')}</div>
      <div class="hands">${hands || '<div class="hand"><div class="cards"><div class="card back" style="opacity:.15"></div><div class="card back" style="opacity:.15"></div></div></div>'}</div>
    </div>
    <div class="panel" style="margin-top:10px">${st && !st.over ? `<div class="row">${btn('hit', 'Hit')}${btn('stand', 'Stand')}${btn('double', 'Double')}</div><div class="row" style="margin-top:8px">${btn('split', 'Split')}${R.surrender ? btn('surrender', 'Surrender') : ''}</div>${adv ? `<p class="sub" style="margin:8px 0 0">Strategy card: <b style="color:var(--green)">${adv.action}</b></p>` : ''}`
      : `<div class="row">${betBox('blackjack')}<button class="big" data-a="bj-deal" ${save.chips < curBet('blackjack') ? 'disabled' : ''}>Deal</button></div>`}</div>${rtpLine('blackjack')}`;
  }
  function bjDeal() {
    const bet = curBet('blackjack'); if (save.chips < bet) { M.pitBoss(save); drainEvents(); if (save.chips < bet) { sfx.nope(); return; } }
    BJ.bet = bet; BJ.seen = {}; BJ.msg = ''; BJ.msgCls = '';
    BJ.st = G.bjStart(G.bjDeal(rand), bjRules()); stake(bet); // the stake goes on the table
    if (BJ.st.over) bjSettle(); else render();
  }
  function bjAct(a) {
    const st = BJ.st, R = bjRules(); if (!st || st.over) return;
    if ((a === 'double' || a === 'split')) { if (save.chips < BJ.bet) { sfx.nope(); return; } stake(BJ.bet); }
    G.bjAct(st, R, a, rand); if (st.over) bjSettle(); else render();
  }
  function bjSettle() {
    const st = BJ.st, staked = BJ.bet * G.bjStaked(st), ret = BJ.bet * G.bjReturned(st);
    unstake(); // put the table stake back, then settle properly
    const net = settleManual('blackjack', staked, ret, $('.felt') || page);
    const r0 = st.hands.map((h) => h.result);
    BJ.msg = st.hands.length > 1 ? `${r0.join(' · ')} · ${net >= 0 ? '+' : ''}${fmt(net, true)}` : r0[0] === 'blackjack' ? `Blackjack! +${fmt(net, true)}` : net > 0 ? `You win +${fmt(net, true)}` : net === 0 ? 'Push' : r0[0] === 'surrender' ? 'Surrendered' : r0[0] === 'bust' ? 'Bust' : 'Dealer wins';
    BJ.msgCls = net > 0 ? 'win' : 'lose'; render();
  }

  // ------------------------------------------------------------------ video poker
  const PK = { st: null, hold: [false, false, false, false, false], final: null, cat: null, seen: 0, msg: '', msgCls: '', bet: 0 };
  function pkHtml() {
    const c = M.cfg(save, 'poker'), w = cw(), hasCard = M.lvl(save, 'poker', 'card');
    const cards = PK.final || (PK.st && PK.st.hand), phase = !PK.st ? 'idle' : PK.final ? 'done' : 'hold';
    const sug = phase === 'hold' && hasCard ? G.pokerHold(PK.st.hand) : null;
    let html = '';
    if (cards) { const fresh = phase === 'done' ? PK.final.map((x, i) => PK.seen === 2 && !PK.hold[i]) : [1, 1, 1, 1, 1].map(() => PK.seen === 0); let k = 0;
      html = cards.map((x, i) => `<div class="pkcol"><div class="holdlbl">${phase === 'hold' && PK.hold[i] ? 'HELD' : ''}</div>${cardHtml(x, { cls: `${phase === 'hold' && PK.hold[i] ? 'held' : ''} ${sug && sug[i] ? 'sug' : ''} ${fresh[i] ? 'new' : ''}`, attr: `data-a="pk-hold" data-i="${i}"`, delay: fresh[i] ? k++ * 120 : 0 })}</div>`).join('');
      if (k) setTimeout(() => { for (let i = 0; i < k; i++) sfx.card(i * 0.12); }, 0); PK.seen = phase === 'done' ? 3 : 1; }
    else html = [0, 1, 2, 3, 4].map(() => '<div class="pkcol"><div class="holdlbl"></div><div class="card back"></div></div>').join('');
    const rows = G.HANDS.filter((k) => k !== 'none').map((k) => `<span class="${PK.cat === k ? 'on' : ''}">${G.HAND_NAME[k]}</span><span class="${PK.cat === k ? 'on' : ''}">${c.pay[k]}</span>`).join('');
    return `<div class="pkscreen" style="--cw:${w}px"><div class="ptab">${rows}</div>
      <div class="cards" style="gap:4px">${html}</div>
      <div class="msg ${PK.msgCls}">${PK.msg || (phase === 'hold' ? 'Tap cards to hold, then draw' : 'Jacks or Better · ' + c.table)}</div></div>
      <div class="panel" style="margin-top:10px"><div class="row">${phase === 'hold' ? `${hasCard ? '<button class="act" data-a="pk-auto" style="flex:0 0 auto">Auto-hold</button>' : ''}<button class="big" data-a="pk-draw">Draw</button>` : `${betBox('poker')}<button class="big" data-a="pk-deal" ${save.chips < curBet('poker') ? 'disabled' : ''}>Deal</button>`}</div></div>${rtpLine('poker')}`;
  }
  function pkDeal() {
    const bet = curBet('poker'); if (save.chips < bet) { M.pitBoss(save); drainEvents(); if (save.chips < bet) { sfx.nope(); return; } }
    PK.bet = bet; stake(bet); PK.st = G.pokerDeal(rand); PK.final = null; PK.cat = null; PK.seen = 0; PK.msg = ''; PK.msgCls = ''; PK.hold = [false, false, false, false, false];
    const cat = G.evalHand(PK.st.hand); if (cat !== 'none') { PK.msg = `Dealt: ${G.HAND_NAME[cat]}`; PK.msgCls = ''; }
    render();
  }
  function pkDraw() {
    PK.final = G.pokerDraw(PK.st, PK.hold); PK.seen = 2; PK.cat = G.evalHand(PK.final); const pay = M.cfg(save, 'poker').pay[PK.cat] || 0;
    unstake(); const net = settleManual('poker', PK.bet, PK.bet * pay, $('.pkscreen'));
    PK.msg = PK.cat === 'none' ? 'No win' : `${G.HAND_NAME[PK.cat]}! ${net > 0 ? '+' + fmt(net, true) : 'Push'}`; PK.msgCls = PK.cat === 'none' ? 'lose' : 'win';
    if (PK.cat === 'royal') bigWin('ROYAL FLUSH!', net); render();
  }

  // ------------------------------------------------------------------ roulette
  const ORDER = {
    american: [0, 28, 9, 26, 30, 11, 7, 20, 32, 17, 5, 22, 34, 15, 3, 24, 36, 13, 1, 37, 27, 10, 25, 29, 12, 8, 19, 31, 18, 6, 21, 33, 16, 4, 23, 35, 14, 2],
    european: [0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26],
  };
  const RL = { bet: { kind: 'straight', n: 17 }, spinning: false, lucky: [], last: null, angle: 0, ball: 0, msg: '', msgCls: '' };
  const wheelOrder = () => ORDER[M.cfg(save, 'roulette').wheel === 'american' ? 'american' : 'european'];
  function rlHtml() {
    const c = M.cfg(save, 'roulette'), b = RL.bet, sel = (k, extra) => (b.kind === k && (extra === undefined || b.d === extra) ? 'sel' : '');
    const luckyOf = (n) => RL.lucky.find((x) => x.n === n);
    let grid = ''; for (let row = 2; row >= 0; row--) for (let col = 0; col < 12; col++) { const n = col * 3 + row + 1, l = luckyOf(n);
      grid += `<button class="${G.pocketColor(n)} ${b.kind === 'straight' && b.n === n ? 'sel' : ''} ${l ? 'lucky' : ''} ${RL.last && RL.last.n === n && !RL.spinning ? 'hitn' : ''}" data-a="rl-n" data-n="${n}">${n}${l ? `<em>${l.m}×</em>` : ''}</button>`; }
    const zeros = (c.wheel === 'american' ? [0, 37] : [0]).map((n) => `<button class="green ${b.kind === 'straight' && b.n === n ? 'sel' : ''} ${RL.last && RL.last.n === n && !RL.spinning ? 'hitn' : ''}" data-a="rl-n" data-n="${n}">${G.pocketName(n)}</button>`).join('');
    const bkind = b.kind === 'straight' ? `straight up on ${G.pocketName(b.n)} (pays 35, or the Lucky multiple)` : b.kind === 'dozen' ? `${['1st', '2nd', '3rd'][b.d]} dozen (pays 2)` : `${b.kind} (pays 1${c.wheel === 'partage' ? ', half back on 0' : ''})`;
    const rr = M.rtp(save, 'roulette') / G.rouletteRtp(c, 'straight') * G.rouletteRtp(c, b.kind === 'straight' ? 'straight' : b.kind === 'dozen' ? 'dozen' : 'even');
    return `<div class="panel" style="padding:10px"><div class="wheelbox"><canvas id="wheel" width="600" height="600"></canvas><div class="result"><b id="rres"></b></div></div>
      <div class="msg ${RL.msgCls}">${RL.msg || G.WHEELS[c.wheel].name}</div>
      <div class="board">${grid}</div><div class="zeros">${zeros}</div>
      <div class="outside"><button class="r ${sel('red')}" data-a="rl-k" data-k="red">Red</button><button class="k ${sel('black')}" data-a="rl-k" data-k="black">Black</button><button class="${sel('odd')}" data-a="rl-k" data-k="odd">Odd</button>
        <button class="${sel('even')}" data-a="rl-k" data-k="even">Even</button><button class="${sel('low')}" data-a="rl-k" data-k="low">1–18</button><button class="${sel('high')}" data-a="rl-k" data-k="high">19–36</button>
        ${[0, 1, 2].map((d) => `<button class="${sel('dozen', d)}" data-a="rl-d" data-d="${d}">${['1st', '2nd', '3rd'][d]} 12</button>`).join('')}</div>
      <p class="sub" style="margin:8px 0">Betting ${bkind} · this bet returns <b style="color:${rr >= 1 ? 'var(--green)' : '#ff8fa0'}">${pct(rr)}</b></p>
      <div class="row">${betBox('roulette')}<button class="big" data-a="rl-spin" ${RL.spinning || save.chips < curBet('roulette') ? 'disabled' : ''}>${RL.spinning ? '…' : 'Spin'}</button></div></div>${rtpLine('roulette')}`;
  }
  function drawWheel() {
    const cv = $('#wheel'); if (!cv) return; const x = cv.getContext('2d'), W = 600, R = 290, ord = wheelOrder(), n = ord.length, seg = (Math.PI * 2) / n;
    x.clearRect(0, 0, W, W); x.save(); x.translate(W / 2, W / 2);
    x.beginPath(); x.arc(0, 0, R, 0, Math.PI * 2); x.fillStyle = '#5a2e12'; x.fill(); x.lineWidth = 8; x.strokeStyle = '#d9a441'; x.stroke();
    x.rotate(RL.angle);
    for (let i = 0; i < n; i++) {
      const num = ord[i], a0 = i * seg - Math.PI / 2 - seg / 2; x.beginPath(); x.moveTo(0, 0); x.arc(0, 0, R - 22, a0, a0 + seg); x.closePath();
      const col = G.pocketColor(num); x.fillStyle = col === 'red' ? '#b51c2e' : col === 'green' ? '#0e7a3d' : '#151515'; x.fill(); x.strokeStyle = '#d9a44188'; x.lineWidth = 2; x.stroke();
      x.save(); x.rotate(i * seg); x.fillStyle = '#fff'; x.font = 'bold 22px Nunito, sans-serif'; x.textAlign = 'center'; x.fillText(G.pocketName(num), 0, -(R - 46)); x.restore();
    }
    x.beginPath(); x.arc(0, 0, R - 92, 0, Math.PI * 2); x.fillStyle = '#3a1d0c'; x.fill(); x.strokeStyle = '#d9a441'; x.lineWidth = 6; x.stroke();
    for (let i = 0; i < 4; i++) { x.save(); x.rotate(i * Math.PI / 2); x.fillStyle = '#d9a441'; x.fillRect(-6, -(R - 100), 12, R - 120); x.restore(); }
    x.beginPath(); x.arc(0, 0, 30, 0, Math.PI * 2); x.fillStyle = '#f2c14e'; x.fill();
    x.restore();
    // ball (in screen space)
    const br = RL.ballR || (R - 34); x.beginPath(); x.arc(W / 2 + Math.cos(RL.ball) * br, W / 2 + Math.sin(RL.ball) * br, 11, 0, Math.PI * 2); x.fillStyle = '#fff'; x.shadowColor = '#000'; x.shadowBlur = 8; x.fill(); x.shadowBlur = 0;
  }
  function rlSpin() {
    if (RL.spinning) return; const bet = curBet('roulette'); if (save.chips < bet) { M.pitBoss(save); drainEvents(); if (save.chips < bet) { sfx.nope(); return; } }
    const c = M.cfg(save, 'roulette'), sp = G.rouletteSpin(rand, c); stake(bet); RL.spinning = true; RL.msg = c.lucky ? 'Lucky Numbers…' : 'No more bets'; RL.msgCls = ''; RL.lucky = sp.lucky; RL.last = null; render();
    if (sp.lucky.length) sp.lucky.forEach((_, i) => tone(880 + i * 220, 0.15, 'sine', 0.06, 1.5, i * 0.12));
    const ord = wheelOrder(), n = ord.length, seg = (Math.PI * 2) / n, idx = ord.indexOf(sp.n);
    const a0 = RL.angle, b0 = RL.ball, dur = 4200, t0 = performance.now();
    const aEnd = a0 + Math.PI * 2 * 2 + Math.random() * Math.PI; // wheel turns clockwise
    const pocketAt = (a) => a + idx * seg - Math.PI / 2; // screen angle of the winning pocket for wheel angle a
    let bEnd = pocketAt(aEnd); while (bEnd > b0 - Math.PI * 2 * 4) bEnd -= Math.PI * 2; // ball runs the other way, at least 4 laps
    let lastTick = 0;
    const step = (now) => {
      const k = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - k, 3);
      RL.angle = a0 + (aEnd - a0) * e; RL.ball = b0 + (bEnd - b0) * e; RL.ballR = 256 - Math.max(0, (k - 0.6) / 0.4) * 34;
      if (k > 0.55 && now - lastTick > 60 + 300 * k) { lastTick = now; sfx.ball(); }
      drawWheel();
      if (k < 1) requestAnimationFrame(step); else rlDone(sp, bet);
    };
    requestAnimationFrame(step);
  }
  function rlDone(sp, bet) {
    const c = M.cfg(save, 'roulette'), ret = bet * G.rouletteReturn(sp, RL.bet, c); RL.spinning = false; RL.last = sp;
    unstake(); const net = settleManual('roulette', bet, ret, $('.wheelbox'));
    const l = sp.lucky.find((x) => x.n === sp.n && RL.bet.kind === 'straight' && RL.bet.n === sp.n);
    RL.msg = `${G.pocketName(sp.n)} ${G.pocketColor(sp.n)}${net > 0 ? ` · ${l ? `LUCKY ${l.m}×! ` : ''}+${fmt(net, true)}` : net === 0 ? ' · push' : ret > 0 ? ' · half back' : ''}`; RL.msgCls = net > 0 ? 'win' : 'lose';
    if (l && net > 0) bigWin(`LUCKY ${l.m}×`, net);
    render(); const rb = $('#rres'); if (rb) { rb.textContent = G.pocketName(sp.n); rb.style.background = { red: '#b51c2e', black: '#151515', green: '#0e7a3d' }[G.pocketColor(sp.n)]; requestAnimationFrame(() => rb.classList.add('on')); }
  }

  // ------------------------------------------------------------------ lounge
  function loungeStats() {
    const s = save.stats, games = M.GAME_IDS.filter((g) => save.games[g].open).map((g) => `<div class="stat"><span>${M.GAMES[g].icon} ${M.GAMES[g].name}</span><b style="color:${save.games[g].net >= 0 ? 'var(--green)' : '#ff8fa0'}">${save.games[g].net >= 0 ? '+' : ''}${fmt(save.games[g].net)} · ${fmt(save.games[g].rounds)} rounds</b></div>`).join('');
    return `<div class="panel" id="lstats"><div class="stat"><span>Level</span><b>${save.level}</b></div><div class="stat"><span>Top bet</span><b>${fmt(M.BETS[M.maxTier(save)])}</b></div>
        <div class="stat"><span>Rounds played</span><b>${fmt(s.rounds)}</b></div><div class="stat"><span>Biggest win</span><b>${fmt(s.biggest)}</b></div>
        <div class="stat"><span>Auto income now</span><b>${fmt(M.incomeRate(save), true)}/s</b></div>${games}
        <div class="stat"><span>While you're away</span><b>up to ${M.T.offlineCapH} h, winning games only</b></div></div>`;
  }
  function loungeHtml() {
    const gain = M.vipGain(save), err = M.canVip(save);
    return `<h2>The Lounge</h2><p class="sub">Chips are pretend. No ads, no purchases, ever.</p>
      <div class="panel vip"><div class="stars">${'★'.repeat(Math.min(10, save.vip || 0))}${(save.vip || 0) > 10 ? ' ×' + save.vip : ''}${!save.vip ? '☆' : ''}</div>
        <h3 style="font:400 20px var(--display);color:var(--gold);margin:4px 0">VIP Stars: ${save.vip || 0}</h3>
        <p style="color:var(--dim);font-size:13px;margin:4px 0 10px">Each star adds <b style="color:var(--cream)">+1% to every return</b> and +5% XP, forever. Sell the casino (level ${M.T.vipLevel}+) to cash in your lifetime betting for stars, then start fresh with a bigger bankroll. The first star comes at about 5B chips bet in your lifetime, then about +5 for every tenfold.</p>
        <button class="big" data-a="vip" ${err ? 'disabled' : ''}>${err ? (err.startsWith('reach') ? `Reach level ${M.T.vipLevel}` : 'Bet more first') : `Sell for ${gain} ★`}</button>
        <p class="sub" style="margin:8px 0 0">Lifetime bet ${fmt(save.life.wagered)} · next star at ${fmt(Math.pow(10, 9.5 + (M.vipTotal(save.life.wagered) + 1) / 5))}</p></div>
      ${loungeStats()}
      <div class="panel"><div class="row"><button class="act" data-a="sound">${save.sound ? '🔊 Sound on' : '🔇 Sound off'}</button><button class="act danger" data-a="wipe">Wipe save</button></div></div>
      <details class="panel"><summary>How the odds work</summary><p style="color:var(--dim);font-size:13px;line-height:1.45">Every game is the real thing. Slots use weighted reels; the return shown is exact. Blackjack is dealt from an infinite shoe, and the strategy card and auto-dealers play perfect strategy, worked out exactly for your table's rules. Video poker deals from a real 52-card deck, and its auto-hold uses the standard Jacks or Better strategy. Roulette is a real wheel. Upgrades change the rules until each game pays more than it takes. Every chip you bet also earns XP, and every level pays a bonus.</p></details>`;
  }

  // ------------------------------------------------------------------ render + input
  function busy() { return SL.spinning || SL.free > 0 || RL.spinning || (BJ.st && !BJ.st.over) || (PK.st && !PK.final); }
  function render() {
    renderNav(); drawHeader();
    const g = tab;
    if (g === 'lounge') page.innerHTML = loungeHtml();
    else if (!save.games[g].open) page.innerHTML = lockedHtml(g);
    else {
      const body = g === 'slots' ? slotsHtml() : g === 'blackjack' ? bjHtml() : g === 'poker' ? pkHtml() : rlHtml();
      page.innerHTML = `<h2>${M.GAMES[g].icon} ${M.GAMES[g].name}</h2>${body}${upgradesHtml(g)}`;
      if (g === 'roulette') drawWheel();
      if (g === 'slots' && SL.wins.length && !SL.spinning) requestAnimationFrame(() => drawLines({ wins: SL.wins }));
    }
  }
  page.addEventListener('click', (e) => {
    const b = e.target.closest('[data-a]'); if (!b || b.disabled) return; const a = b.dataset.a, g = tab; ac();
    if (a === 'bet-' || a === 'bet+') { if (busy()) return; changeBet(g, a === 'bet+' ? 1 : -1); return; }
    if (a === 'buy') { buyUp(g, b.dataset.id); return; }
    if (a === 'unlock') { const err = M.unlock(save, g); if (err) { sfx.nope(); toast(err); return; } sfx.big(); persist(); render(); toast(`${M.GAMES[g].name} is open!`); return; }
    if (a === 'spin') { SL.wins = []; slotSpin(); return; }
    if (a === 'bj-deal') { sfx.chip(); bjDeal(); return; }
    if (a.startsWith('bj-')) { bjAct(a.slice(3)); return; }
    if (a === 'pk-deal') { sfx.chip(); pkDeal(); return; }
    if (a === 'pk-hold') { if (!PK.st || PK.final) return; const i = +b.dataset.i; PK.hold[i] = !PK.hold[i]; sfx.tap(); render(); return; }
    if (a === 'pk-auto') { PK.hold = G.pokerHold(PK.st.hand); sfx.tap(); render(); return; }
    if (a === 'pk-draw') { pkDraw(); return; }
    if (a === 'rl-n') { if (RL.spinning) return; RL.bet = { kind: 'straight', n: +b.dataset.n }; sfx.chip(); render(); return; }
    if (a === 'rl-k') { if (RL.spinning) return; RL.bet = { kind: b.dataset.k }; sfx.chip(); render(); return; }
    if (a === 'rl-d') { if (RL.spinning) return; RL.bet = { kind: 'dozen', d: +b.dataset.d }; sfx.chip(); render(); return; }
    if (a === 'rl-spin') { rlSpin(); return; }
    if (a === 'sound') { save.sound = !save.sound; persist(); render(); return; }
    if (a === 'wipe') { if (!b.dataset.sure) { b.dataset.sure = 1; b.textContent = 'Tap again to wipe'; return; } try { localStorage.removeItem(KEY); } catch { /* ok */ } save = M.newSave(Date.now()); shown = save.chips; render(); return; }
    if (a === 'vip') { const gain = M.vipGain(save);
      modal(`<h2>Sell the casino?</h2><p>You'll start over at level 1 with every upgrade and game reset, and keep <b style="color:var(--gold)">${(save.vip || 0) + gain} VIP stars</b>: +${(save.vip || 0) + gain}% on every return.</p><div class="row"><button class="act" data-a="no">Not yet</button><button class="big" data-a="yes">Sell</button></div>`,
        (x) => { if (x === 'yes') { const err = M.vipReset(save, Date.now()); if (err) toast(err); else { sfx.big(); tab = 'slots'; SL.grid = null; BJ.st = null; PK.st = null; RL.last = null; toast(`Welcome back, VIP. ${save.vip} stars.`); } persist(); } hideModal(); render(); });
      return; }
  });
  function welcomeBack(r) {
    const h = Math.floor(r.away / 3600), m = Math.floor((r.away % 3600) / 60);
    modal(`<h2>Welcome back</h2><p>You were away ${h ? h + ' h ' : ''}${m} min${r.capped ? ` (the floor runs for ${M.T.offlineCapH} h at most)` : ''}. Your machines played ${fmt(r.rounds)} rounds.</p><p style="font:900 26px var(--body);color:var(--green)">+${fmt(r.chips)}</p>${r.levels ? `<p>+${r.levels} level${r.levels > 1 ? 's' : ''}</p>` : ''}<button class="big" data-a="ok">Collect</button>`, () => { hideModal(); sfx.chip(); coinShower(16); });
  }

  // ------------------------------------------------------------------ loop
  let lastTick = performance.now(), lastRender = 0, lastLevel = save.level;
  function frame(now) {
    const dt = Math.min(1, (now - lastTick) / 1000);
    if (dt >= 0.25) { lastTick = now; M.tick(save, dt, rand); drainEvents(); }
    animateChips(); drawHeader();
    if (now - lastRender > 1500 && !busy()) { lastRender = now; refreshLight(); }
    if (save.level !== lastLevel) { lastLevel = save.level; if (!busy()) render(); }
    requestAnimationFrame(frame);
  }
  // cheap refresh: just the buttons' enabled state and the auto line, without rebuilding the machine
  function refreshLight() {
    renderNav(); if (tab === 'lounge') { const st = $('#lstats'); if (st) st.outerHTML = loungeStats(); return; }
    const g = tab; if (!save.games[g].open) { const b = page.querySelector('[data-a="unlock"]'); if (b) { const was = b.disabled; if (was !== !!M.canUnlock(save, g)) render(); } return; }
    for (const b of page.querySelectorAll('[data-a="buy"]')) b.disabled = !!M.canBuy(save, g, b.dataset.id);
    const box = $('#rtpbox'); if (box) box.outerHTML = rtpLine(g);
  }

  // ------------------------------------------------------------------ start
  const away = M.offline(save, Date.now());
  render(); shown = save.chips;
  if (away) welcomeBack(away);
  else if (save.stats.rounds === 0) modal(`<h2>High Roller</h2><p>A casino where the upgrades are on your side. Play slots by hand, buy auto-spinners, and keep improving the rules until every game pays more than it takes.</p><p>Chips are pretend. No ads, no purchases.</p><button class="big" data-a="ok">Let's play</button>`, () => { hideModal(); ac(); });
  requestAnimationFrame(frame);
  document.body.dataset.ready = '1';
  window.__hr = { M, G, get save() { return save; }, render, setTab: (t) => { tab = t; render(); } };
})();
