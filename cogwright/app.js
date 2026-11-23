// Cogwright page: the Bench (hex gear board + drawers), Shifts (lane battle + crank strip), the upgrade tree, the Codex.
// All rules are in model.js; this file draws, takes touches, plays sounds and keeps the save in localStorage.
(function () {
  'use strict';
  const M = window.CogModel, D = window.CogData;
  const DEV = /[?&]dev\b/.test(location.search);
  const $ = (s) => document.querySelector(s);
  const KEY = 'cogwright.save.v1';
  const TAU = Math.PI * 2, SQ3 = Math.sqrt(3);
  const fmt = (n) => { n = Math.floor(n); return n >= 1e12 ? (n / 1e12).toFixed(1) + 'T' : n >= 1e9 ? (n / 1e9).toFixed(1) + 'B' : n >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : n >= 1e4 ? (n / 1e3).toFixed(1) + 'k' : String(n); };
  const dur = (s) => { s = Math.round(s); const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60); return h ? `${h} h ${m} m` : m ? `${m} m` : `${s} s`; };
  const rarity = (id) => D.RARITIES.find((r) => r.id === id);

  // ------------------------------------------------------------------ sound (small synth; mutable)
  let AC = null;
  const audio = () => { if (!AC) try { AC = new (window.AudioContext || window.webkitAudioContext)(); } catch { AC = null; } if (AC && AC.state === 'suspended') AC.resume(); return AC; };
  const last = {};
  const thr = (k, ms) => { const n = performance.now(); if (n - (last[k] || 0) < ms) return false; last[k] = n; return true; };
  function tone(f, d = 0.1, type = 'sine', v = 0.08, slide = 0, delay = 0) {
    if (save.settings.muted) return; const a = audio(); if (!a) return;
    const o = a.createOscillator(), gn = a.createGain(), t = a.currentTime + delay;
    o.type = type; o.frequency.setValueAtTime(f, t); if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, f * slide), t + d);
    gn.gain.setValueAtTime(v, t); gn.gain.exponentialRampToValueAtTime(0.0001, t + d); o.connect(gn).connect(a.destination); o.start(t); o.stop(t + d + 0.02);
  }
  function noise(d = 0.1, v = 0.06, hp = 900) {
    if (save.settings.muted) return; const a = audio(); if (!a) return;
    const b = a.createBuffer(1, Math.ceil(a.sampleRate * d), a.sampleRate), ch = b.getChannelData(0);
    for (let i = 0; i < ch.length; i++) ch[i] = (Math.random() * 2 - 1) * (1 - i / ch.length);
    const s = a.createBufferSource(), f = a.createBiquadFilter(), gn = a.createGain(); s.buffer = b; f.type = 'highpass'; f.frequency.value = hp; gn.gain.value = v; s.connect(f).connect(gn).connect(a.destination); s.start();
  }
  // ------------------------------------------------------------------ art + sound files (Media Helper), all optional
  const ASSETS = (DEV && /[?&]noart\b/.test(location.search)) ? { img: {}, sfx: {} } : (window.PP_ASSETS || { img: {}, sfx: {} });
  const IMG = {}, BUF = {}; let artVer = 0;
  for (const [k, url] of Object.entries(ASSETS.img || {})) { const im = new Image(); im.decoding = 'async'; im.onload = () => { IMG[k] = im; artVer++; }; im.src = url; }
  const art = (n) => IMG[n] || null;
  let samplesAsked = false;
  function loadSamples() {
    if (samplesAsked) return; const a = audio(); if (!a) return; samplesAsked = true;
    for (const [k, url] of Object.entries(ASSETS.sfx || {})) fetch(url).then((r) => (r.ok ? r.arrayBuffer() : Promise.reject())).then((ab) => new Promise((ok, no) => a.decodeAudioData(ab, ok, no))).then((b) => { BUF[k] = b; if (k.startsWith('music')) music(); }).catch(() => {});
  }
  addEventListener('pointerdown', loadSamples, { passive: true });
  function play(name, v = 0.7, rate = 1) { // -> false when there is no such sample yet, so callers fall back to the synth
    const b = BUF[name]; if (!b) return false; if (save.settings.muted) return true;
    const a = audio(); if (!a) return true; const src = a.createBufferSource(), gn = a.createGain();
    src.buffer = b; src.playbackRate.value = rate; gn.gain.value = v; src.connect(gn).connect(a.destination); src.start(); return true;
  }
  let musicNow = null, musicSrc = null, musicGain = null;
  function music() { // bench loop at the bench, battle loop in a Shift; quiet, cross-faded
    const want = save.settings.muted || save.settings.musicOff ? null : shift ? 'music-battle' : 'music-bench';
    if (want === musicNow && (musicSrc || !want)) return;
    const a = AC; if (!a) return;
    if (musicSrc) { const old = musicSrc, og = musicGain; og.gain.setTargetAtTime(0, a.currentTime, 0.4); setTimeout(() => { try { old.stop(); } catch { /* already stopped */ } }, 1500); musicSrc = null; }
    musicNow = want; if (!want || !BUF[want]) return;
    musicSrc = a.createBufferSource(); musicSrc.buffer = BUF[want]; musicSrc.loop = true; musicGain = a.createGain(); musicGain.gain.value = 0;
    musicSrc.connect(musicGain).connect(a.destination); musicSrc.start(); musicGain.gain.setTargetAtTime(0.28, a.currentTime, 0.8);
  }
  const sfx = {
    tick: () => thr('tick', 70) && (play('tick', 0.5) || tone(2400, 0.02, 'square', 0.015)),
    clank: () => play('clank', 0.8) || (noise(0.08, 0.08, 1800), tone(320, 0.09, 'triangle', 0.08, 0.7)),
    merge: () => play('merge', 0.9) || sfx.clank(),
    hit: () => thr('hit', 60) && (play('hit', 0.35, 0.9 + Math.random() * 0.2) || tone(150 + Math.random() * 40, 0.07, 'square', 0.03, 0.6)),
    pop: () => thr('pop', 50) && (play('pop', 0.45, 0.9 + Math.random() * 0.25) || tone(150 + Math.random() * 40, 0.07, 'square', 0.03, 0.6)),
    zap: () => thr('zap', 90) && (play('zap', 0.3, 0.9 + Math.random() * 0.2) || tone(1100 + Math.random() * 300, 0.05, 'sawtooth', 0.02, 0.5)),
    coin: () => thr('coin', 45) && (play('coin', 0.4, 0.95 + Math.random() * 0.15) || tone(1600 + Math.random() * 300, 0.05, 'square', 0.025)),
    bolt: () => thr('bolt', 80) && (play('bolt', 0.5) || (noise(0.12, 0.05, 2500), tone(700, 0.1, 'sawtooth', 0.03, 0.3))),
    spell: () => thr('spell', 150) && play('spell', 0.4),
    loot: (r) => play(r === 'legendary' || r === 'set' ? 'loot-legendary' : r === 'rare' ? 'loot-rare' : 'loot', 0.8) || (() => { const f = { common: [660], magic: [660, 880], rare: [660, 880, 1100], set: [523, 784, 1046, 1318], legendary: [392, 523, 659, 784, 1046, 1318] }[r] || [660]; f.forEach((x, i) => tone(x, 0.18, 'triangle', 0.07, 1, i * 0.07)); })(),
    crank: () => play('crank', 0.8) || (() => { for (let i = 0; i < 8; i++) tone(200 + i * 60, 0.05, 'square', 0.03, 1, i * 0.03); })(),
    boss: () => play('boss', 0.9) || (tone(90, 0.8, 'sawtooth', 0.08, 0.6), noise(0.6, 0.06, 200)),
    win: () => play('win', 0.8) || [523, 659, 784, 1046, 1318].forEach((f, i) => tone(f, 0.22, 'triangle', 0.09, 1, i * 0.1)),
    lose: () => play('lose', 0.8) || tone(300, 0.5, 'triangle', 0.09, 0.4),
    buy: () => play('buy', 0.7) || (tone(520, 0.08, 'triangle', 0.08), tone(780, 0.1, 'triangle', 0.08, 1, 0.06)),
    nope: () => play('nope', 0.6) || tone(140, 0.12, 'square', 0.04),
    door: () => thr('door', 200) && (play('door', 0.6) || noise(0.1, 0.07, 300)),
  };

  // ------------------------------------------------------------------ save
  let save = M.load(safeGet(), Date.now());
  function safeGet() { try { return localStorage.getItem(KEY); } catch { return null; } }
  function persist() { save.lastSeen = Date.now(); try { localStorage.setItem(KEY, JSON.stringify(save)); } catch { /* private mode: play on without saving */ } }
  save.codex = save.codex || {};
  setInterval(() => { if (!document.hidden) persist(); }, 5000);
  addEventListener('pagehide', persist);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { if (shift && !shift.res) shift.paused = true; persist(); try { AC && AC.suspend(); } catch { /* no audio */ } }
    else { try { AC && AC.resume(); } catch { /* no audio */ } const away = M.applyOffline(save, Date.now()); if (away) welcomeBack(away); persist(); refresh(); }
  });

  // ------------------------------------------------------------------ dom
  const cv = $('#cv'), g = cv.getContext('2d'), page = $('#page'), sheet = $('#sheet'), modal = $('#modal');
  let W = 300, H = 300, DPR = 1;
  function resize() { const r = cv.getBoundingClientRect(); if (!r.width) return; DPR = Math.min(2, window.devicePixelRatio || 1); W = r.width; H = r.height; cv.width = Math.round(W * DPR); cv.height = Math.round(H * DPR); }
  new ResizeObserver(resize).observe($('main'));
  let toastT = 0;
  function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('on'), 1800); }

  let tab = 'bench', shift = null, sel = null, treeView = 'up', treePan = { x: 0, y: 0 }, board = null, stats = null;
  function invalidate() { stats = M.stats(save); board = M.solve(save, stats); }
  invalidate();
  function refresh() {
    invalidate(); computeMergeable();
    const got = M.checkMilestones(save, board);
    if (got.length) { persist(); setTimeout(() => { toast(got.map((m) => `🏅 ${m.name}: +${m.brass} brass${m.bp ? ` +${m.bp} Blueprints` : ''}`).join('  ·  ')); play('milestone', 0.8) || sfx.win(); }, shift ? 900 : 50); }
    $('#c-scrap').textContent = fmt(save.scrap); $('#c-brass').textContent = fmt(save.brass);
    $('#c-bp').textContent = fmt(save.blueprints); $('#c-bp-wrap').hidden = !showBp();
    save.depth = Math.max(1, Math.min(save.depth, save.unlocked));
    $('#d-num').textContent = 'Depth ' + save.depth; $('#d-zone').textContent = M.zoneOf(save.depth).name.replace('The ', '') + (M.isBossDepth(save.depth) ? ' · Boss' : '');
    $('#d-prev').disabled = save.depth <= 1; $('#d-next').disabled = save.depth >= save.unlocked;
    { const L = save.bounties ? save.bounties.list : []; const now = Date.now(); $('#jobs-dot').hidden = !(!M.dailyContract(save, today()).done || L.some((b) => b.progress >= b.n)); $('#ws-dot').hidden = !(save.research.slots.some((x) => now >= x.end)); }
    if (tab === 'workshop') renderWorkshop(); if (tab === 'jobs') renderJobs();
    $('#tree-dot').hidden = !D.TREE.some((n) => M.canBuyNode(save, n.id) === '') && !M.overhaulGain(save);
    if (tab === 'codex') renderCodex(); if (tab === 'armory') renderArmory();
    if (sel && !save.items[sel]) closeSheet();
  }
  document.querySelectorAll('nav button').forEach((b) => b.addEventListener('click', () => setTab(b.dataset.tab)));
  function setTab(t) {
    tab = t; closeSheet();
    document.querySelectorAll('nav button').forEach((b) => b.classList.toggle('on', b.dataset.tab === t));
    document.body.classList.toggle('codex', ['codex', 'armory', 'workshop', 'jobs'].includes(t)); if (t === 'jobs' && !(save.exp && !save.exp.over)) JOB.view = 'main'; document.body.classList.toggle('tree', t === 'tree');
    $('#foot').style.display = t === 'bench' ? '' : 'none';
    refresh(); requestAnimationFrame(resize);
  }
  $('#d-prev').onclick = () => { save.depth--; refresh(); };
  $('#d-next').onclick = () => { save.depth++; refresh(); };
  $('#go').onclick = () => startShift();
  const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  function dailyPrompt() {
    const c = M.dailyContract(save, today());
    if (c.done) { toast('Today\'s Contract is done. A new one comes tomorrow.'); return; }
    showModal(`<h2>Daily Contract</h2><p><b>${c.text}</b></p><p>Depth ${c.depth}. Win it for a chest: a rare gear, another gear, a Flawed Cogstone and 30 brass. One a day.</p><div class="row"><button class="alt" data-a="no">Later</button><button data-a="go">Take the job</button></div>`, (a) => { hideModal(); if (a === 'go') startShift({ depth: c.depth, mod: c.mod, contract: c.day }); });
  }
  $('#codexbtn').onclick = () => setTab('codex');

  // ------------------------------------------------------------------ drawing helpers
  const gearPaths = {};
  function gearPath(teeth, R) { // unit-size path, scaled at draw time
    const k = teeth; if (gearPaths[k]) return gearPaths[k];
    const p = new Path2D(), n = teeth, ro = 1, ri = 0.8;
    for (let i = 0; i < n; i++) {
      const a0 = (i / n) * TAU, a1 = ((i + 0.25) / n) * TAU, a2 = ((i + 0.5) / n) * TAU, a3 = ((i + 0.75) / n) * TAU;
      const pt = (a, r) => [Math.cos(a) * r, Math.sin(a) * r];
      const P = [pt(a0, ri), pt(a1 - 0.04, ro), pt(a2 + 0.04, ro), pt(a3, ri)];
      if (i === 0) p.moveTo(...P[0]); else p.lineTo(...P[0]);
      p.lineTo(...P[1]); p.lineTo(...P[2]); p.lineTo(...P[3]);
    }
    p.closePath(); gearPaths[k] = p; return p;
  }
  function drawGear(x, y, R, teeth, ang, it, o = {}) {
    const G = it ? D.GEARS[it.base] : null, col = o.main ? '#c99a3a' : G.color, rim = it ? rarity(it.rarity).color : '#f0c86a';
    g.save(); g.translate(x, y);
    if (o.glow) { g.shadowColor = o.glow; g.shadowBlur = 14; }
    g.save(); g.rotate(ang); g.scale(R, R);
    g.fillStyle = col; g.fill(gearPath(teeth));
    g.lineWidth = 1.6 / R * (o.rimW || 1.4); g.strokeStyle = it && it.rarity !== 'common' ? rim : '#00000090'; g.stroke(gearPath(teeth));
    g.shadowBlur = 0;
    g.fillStyle = '#00000038'; g.beginPath(); g.arc(0, 0, 0.62, 0, TAU); g.fill();
    // spokes
    g.strokeStyle = '#0000004d'; g.lineWidth = 0.09;
    for (let i = 0; i < 4; i++) { g.beginPath(); g.moveTo(0, 0); g.lineTo(Math.cos((i * TAU) / 4) * 0.62, Math.sin((i * TAU) / 4) * 0.62); g.stroke(); }
    g.fillStyle = '#f7e7b8'; g.beginPath(); g.arc(0, 0, 0.36, 0, TAU); g.fill();
    g.restore();
    if (o.main) { // the Mainspring: a coiled spring
      g.strokeStyle = '#5a3d12'; g.lineWidth = 2; g.beginPath();
      for (let i = 0; i < 60; i++) { const a = ang * 1.3 + i * 0.35, r = R * 0.06 + (i / 60) * R * 0.32; const px = Math.cos(a) * r, py = Math.sin(a) * r; i ? g.lineTo(px, py) : g.moveTo(px, py); }
      g.stroke();
    } else if (it) {
      g.fillStyle = '#2a1d10'; g.font = `800 ${Math.round(R * 0.5)}px system-ui`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(G.icon, 0, 1);
      if (it.rank > 1) { g.fillStyle = '#ffe28a'; for (let i = 0; i < it.rank - 1; i++) { g.beginPath(); g.arc((i - (it.rank - 2) / 2) * R * 0.22, R * 0.52, R * 0.08, 0, TAU); g.fill(); } }
      if (it.leg) { g.strokeStyle = '#ff8a1f'; g.lineWidth = 2; g.beginPath(); g.arc(0, 0, R * 1.04, 0, TAU); g.stroke(); }
      if (it.vault) { g.font = `${Math.round(R * 0.36)}px system-ui`; g.fillText('🔒', R * 0.62, -R * 0.62); }
    }
    if (o.jam) { g.strokeStyle = '#ff4a3a'; g.lineWidth = 3; g.beginPath(); g.moveTo(-R * 0.4, -R * 0.4); g.lineTo(R * 0.4, R * 0.4); g.moveTo(R * 0.4, -R * 0.4); g.lineTo(-R * 0.4, R * 0.4); g.stroke(); }
    g.restore();
  }
  const teethOf = (it) => (it ? D.SIZES[it.size].teeth : 12);
  const radOf = (it, inr) => inr * (it ? ({ S: 0.66, M: 0.82, L: 0.98 })[it.size] : 0.9);

  // ------------------------------------------------------------------ hex layout
  let HX = { cx: 0, cy: 0, size: 20 };
  const hexPx = (k) => { const [q, r] = M.unkey(k); return { x: HX.cx + HX.size * SQ3 * (q + r / 2), y: HX.cy + HX.size * 1.5 * r }; };
  function pxHex(x, y) {
    const px = (x - HX.cx) / HX.size, py = (y - HX.cy) / HX.size;
    let q = (SQ3 / 3) * px - py / 3, r = (2 / 3) * py, s = -q - r;
    let rq = Math.round(q), rr = Math.round(r), rs = Math.round(s);
    const dq = Math.abs(rq - q), dr = Math.abs(rr - r), ds = Math.abs(rs - s);
    if (dq > dr && dq > ds) rq = -rr - rs; else if (dr > ds) rr = -rq - rs;
    return M.key(rq, rr);
  }
  function hexOutline(x, y, s) { g.beginPath(); for (let i = 0; i < 6; i++) { const a = (Math.PI / 180) * (60 * i - 30); const px = x + s * Math.cos(a), py = y + s * Math.sin(a); i ? g.lineTo(px, py) : g.moveTo(px, py); } g.closePath(); }

  // ------------------------------------------------------------------ Bench: the board, plus a tray of spare gears
  // what a gear is for, readable at a glance: a glyph, a colour per family, a short name
  const FAMC = { unit: '#ff9466', spell: '#c39bff', engine: '#a9c2d8', collector: '#ffd166', magnet: '#ff7a7a' };
  function roleOf(it) {
    const G = D.GEARS[it.base], fam = G.fam;
    const short = fam === 'unit' ? D.TROOPS[G.troop].name + 's' : fam === 'engine' ? 'Engine' : fam === 'collector' ? 'Collector' : fam === 'magnet' ? 'Magnet' : G.name.replace(' Gear', '');
    return { glyph: G.icon, color: FAMC[fam], short, fam };
  }
  function summary(it) { // one plain line: what this gear does
    const P = M.gearPower(it, null, stats, {}), G = D.GEARS[it.base];
    if (P.fam === 'unit') return `1 ${D.TROOPS[G.troop].name} per turn · ${Math.round(P.hp)} hp · ${P.dmg.toFixed(0)} dmg`;
    if (P.fam === 'spell') return G.desc(P.p, P.s).replace(/^Every (\d+) turns: /, 'Every $1 turns, ');
    if (P.fam === 'engine') return `Gears beyond it spin ×${P.factor.toFixed(2)}`;
    if (P.fam === 'magnet') return `Pulls in ${P.pull} loose drop${P.pull > 1 ? 's' : ''} per turn`;
    return `+${P.yield.toFixed(1)} scrap per turn, even while away`;
  }
  let mergeable = new Set();
  function computeMergeable() { // gears that have an identical partner somewhere (bench or drawers)
    const groups = {}; mergeable = new Set();
    for (const it of Object.values(save.items)) { const k = it.base + '|' + it.size + '|' + it.rank; (groups[k] = groups[k] || []).push(it); }
    for (const list of Object.values(groups)) if (list.length >= 2) for (const a of list) if (list.some((b) => b !== a && M.canMerge(save, a.id, b.id) === '')) mergeable.add(a.id);
  }
  let BL = null, trayScroll = 0, trayFilter = 'all', invOrder = [];
  const TRAY = { h: 112, chip: 28, cw: 64, ch: 74, gap: 6 };
  function benchLayout() {
    const R = stats.boardR, ty = H - TRAY.h, bh = ty - 4;
    HX.size = Math.min((W - 16) / (SQ3 * (2 * R + 1)), (bh - 16) / (3 * R + 2)); HX.cx = W / 2; HX.cy = bh / 2 + 4;
    BL = { bh, ty, cy: ty + TRAY.chip + 4, slots: stats.invSlots };
    return BL;
  }
  const FILTERS = [['all', 'All'], ['unit', 'Troops'], ['spell', 'Spells'], ['other', 'Other']];
  const RORD = ['legendary', 'set', 'rare', 'magic', 'common'];
  function trayItems() {
    return M.invItems(save).filter((it) => { const f = D.GEARS[it.base].fam; return trayFilter === 'all' || (trayFilter === 'other' ? f !== 'unit' && f !== 'spell' : f === trayFilter); })
      .sort((a, b) => RORD.indexOf(a.rarity) - RORD.indexOf(b.rarity) || a.base.localeCompare(b.base) || b.rank - a.rank || b.ilvl - a.ilvl);
  }
  const cardRect = (i) => ({ x: 10 + i * (TRAY.cw + TRAY.gap) - trayScroll, y: BL.cy, w: TRAY.cw, h: TRAY.ch });
  // the wood + engraved hex sockets under the 3D gears (redrawn only when the layout or art changes)
  const placedAt = {};
  const popScale = (id) => { const t0 = placedAt[id]; if (t0 == null) return 1; const q = (clock - t0) / 0.35; if (q >= 1) { delete placedAt[id]; return 1; } return 1 + 0.25 * Math.sin(q * Math.PI) * (1 - q); };
  let underC = null, underK = '';
  function benchUnder() {
    const k = `${W}x${H}:${stats.boardR}:${artVer}:${BL.ty}`; if (k === underK) return underC;
    underK = k; underC = underC || document.createElement('canvas'); const s = Math.min(2, DPR);
    underC.width = Math.round(W * s); underC.height = Math.round(H * s); const u = underC.getContext('2d'); u.setTransform(s, 0, 0, s, 0, 0);
    const bgi = art('bg-bench');
    if (bgi) { const sc = Math.max(W / bgi.width, H / bgi.height); u.drawImage(bgi, (W - bgi.width * sc) / 2, (H - bgi.height * sc) / 2, bgi.width * sc, bgi.height * sc); }
    else { // procedural walnut
      const gr = u.createLinearGradient(0, 0, W, H); gr.addColorStop(0, '#4a3322'); gr.addColorStop(0.5, '#3b281a'); gr.addColorStop(1, '#2c1d13'); u.fillStyle = gr; u.fillRect(0, 0, W, H);
      u.globalAlpha = 0.08; u.strokeStyle = '#140c06';
      for (let i = 0; i < 70; i++) { const y = (i / 70) * H + Math.sin(i * 7.3) * 6; u.lineWidth = 1 + (i % 3); u.beginPath(); u.moveTo(0, y); u.bezierCurveTo(W * 0.3, y + Math.sin(i) * 10, W * 0.7, y - Math.cos(i) * 10, W, y + Math.sin(i * 2) * 6); u.stroke(); }
      u.globalAlpha = 1;
    }
    const v = u.createRadialGradient(W / 2, HX.cy, HX.size, W / 2, HX.cy, Math.max(W, H) * 0.8); v.addColorStop(0, '#00000000'); v.addColorStop(1, '#000000a0'); u.fillStyle = v; u.fillRect(0, 0, W, H);
    for (const ck of M.cells(stats.boardR)) { // engraved sockets
      const p = hexPx(ck), sz = HX.size * 0.95;
      const path = () => { u.beginPath(); for (let i = 0; i < 6; i++) { const a = (Math.PI / 180) * (60 * i - 30); u[i ? 'lineTo' : 'moveTo'](p.x + sz * Math.cos(a), p.y + sz * Math.sin(a)); } u.closePath(); };
      path(); u.fillStyle = ck === '0,0' ? '#00000055' : '#0000003a'; u.fill();
      u.save(); path(); u.clip(); u.shadowColor = '#000c'; u.shadowBlur = 8; u.shadowOffsetY = 3; u.lineWidth = 6; u.strokeStyle = '#000a'; path(); u.stroke(); u.restore();
      path(); u.lineWidth = 1.2; u.strokeStyle = '#c9a24a66'; u.stroke();
    }
    // the drawer tray
    const ty = BL.ty, th = H - ty;
    const tg = u.createLinearGradient(0, ty, 0, H); tg.addColorStop(0, '#1d140d'); tg.addColorStop(1, '#120c08'); u.fillStyle = tg; u.fillRect(0, ty, W, th);
    u.fillStyle = '#c9a24a'; u.fillRect(0, ty, W, 2); u.fillStyle = '#00000080'; u.fillRect(0, ty + 2, W, 3);
    return underC;
  }
  const iconSpec = (it, state = 'spin') => ({ teeth: teethOf(it), base: it.base, rarity: it.rarity, state, emblem: art('emblem-' + it.base) });
  function drawItem(it, x, y, r, ang = 0, o = {}) { // a gear as a still 3D render (or the 2D fallback)
    if (window.CogGL && window.CogGL.ready) {
      const im = window.CogGL.icon(iconSpec(it), 96);
      g.save(); g.translate(x, y); g.rotate(ang);
      if (o.glow) { g.shadowColor = o.glow; g.shadowBlur = 14; }
      g.drawImage(im, -r * 1.15, -r * 1.15, r * 2.3, r * 2.3); g.restore();
      if (it.rank > 1) { g.fillStyle = '#ffe28a'; g.strokeStyle = '#2a1d10'; g.lineWidth = 1; for (let i = 0; i < it.rank - 1; i++) { g.beginPath(); g.arc(x + (i - (it.rank - 2) / 2) * r * 0.3, y + r * 0.95, Math.max(2, r * 0.1), 0, TAU); g.fill(); g.stroke(); } }
      if (it.vault) { g.font = `${Math.round(r * 0.55)}px system-ui`; g.textAlign = 'center'; g.fillText('🔒', x + r * 0.75, y - r * 0.6); }
    } else drawGear(x, y, r, teethOf(it), ang, it, o);
  }
  function drawBench(t) {
    benchLayout();
    const GL = window.CogGL && window.CogGL.ready, inr = (HX.size * SQ3) / 2;
    const setGlow = {};
    for (const n of board.spinning) if (n.item.set && board.sets[n.item.set] >= 2) setGlow[n.k] = '#3fcf74';
    const mp = hexPx('0,0'), mainAng = (t * stats.mainRpm) / 60 * TAU;
    const angOf = (n) => (n.state === 'spin' ? ((t * n.rpm) / 60) * TAU * n.dir + (n.dir === -1 ? Math.PI / teethOf(n.item) : 0) : 0);
    if (GL) {
      g.clearRect(0, 0, W, H);
      const gears = [{ id: 'main', x: mp.x, y: mp.y, R: inr * 0.95, teeth: 12, angle: mainAng, base: 'main', rarity: 'common', state: 'spin' }];
      for (const n of board.gears) {
        if (drag && drag.live && drag.fromCell === n.k) continue;
        const p = hexPx(n.k), shake = n.state === 'jam' ? Math.sin(t * 40) * 1.2 : 0;
        gears.push({ id: 'b' + n.item.id, x: p.x + shake, y: p.y, R: radOf(n.item, inr) * popScale(n.item.id), lift: (popScale(n.item.id) - 1) * 80, angle: angOf(n), sel: sel === n.item.id, ...iconSpec(n.item, n.state) });
      }
      window.CogGL.frame({ W, H, dpr: DPR, under: benchUnder(), underKey: underK, gears });
    } else {
      const bg = g.createLinearGradient(0, 0, 0, H); bg.addColorStop(0, '#2d2219'); bg.addColorStop(1, '#1f1812'); g.fillStyle = bg; g.fillRect(0, 0, W, H);
      for (const k of M.cells(stats.boardR)) { const p = hexPx(k); hexOutline(p.x, p.y, HX.size * 0.97); g.fillStyle = k === '0,0' ? '#4a3622' : '#33271d'; g.fill(); g.strokeStyle = '#4c3a28'; g.lineWidth = 1; g.stroke(); }
      drawGear(mp.x, mp.y, inr * 0.95, 12, mainAng, null, { main: true, glow: '#f0c86a66' });
      for (const n of board.gears) {
        if (drag && drag.live && drag.fromCell === n.k) continue;
        const p = hexPx(n.k); g.globalAlpha = n.state === 'idle' ? 0.45 : 1;
        drawGear(p.x + (n.state === 'jam' ? Math.sin(t * 40) * 1.2 : 0), p.y, radOf(n.item, inr), teethOf(n.item), angOf(n), n.item, { jam: n.state === 'jam', glow: setGlow[n.k] || (sel === n.item.id ? '#ffffffaa' : null) });
        g.globalAlpha = 1;
      }
    }
    // overlays: drop hint, set glow, jams, rpm, selection
    if (drag && drag.live) { const k = pxHex(drag.x, drag.y - 30); if (M.cells(stats.boardR).includes(k) && k !== '0,0') { const p = hexPx(k); hexOutline(p.x, p.y, HX.size * 0.97); g.strokeStyle = '#ffe28a'; g.lineWidth = 3; g.shadowColor = '#ffe28a'; g.shadowBlur = 10; g.stroke(); g.shadowBlur = 0; } }
    for (const n of board.gears) {
      if (drag && drag.live && drag.fromCell === n.k) continue;
      const p = hexPx(n.k), it = n.item;
      if (GL && setGlow[n.k]) { g.strokeStyle = '#3fcf74aa'; g.lineWidth = 3; g.shadowColor = '#3fcf74'; g.shadowBlur = 12; g.beginPath(); g.arc(p.x, p.y, radOf(it, inr) * 1.12, 0, TAU); g.stroke(); g.shadowBlur = 0; }
      if (GL && n.state === 'jam') { const R = radOf(it, inr) * 0.35; g.strokeStyle = '#ff4a3a'; g.lineWidth = 3.5; g.lineCap = 'round'; g.beginPath(); g.moveTo(p.x - R, p.y - R); g.lineTo(p.x + R, p.y + R); g.moveTo(p.x + R, p.y - R); g.lineTo(p.x - R, p.y + R); g.stroke(); g.lineCap = 'butt'; }
      const ro = roleOf(it), rc = rarity(it.rarity).color;
      if (it.rarity !== 'common') { g.strokeStyle = rc; g.globalAlpha = 0.85; g.lineWidth = 2.5; g.beginPath(); g.arc(p.x, p.y, radOf(it, inr) * 1.08, 0, TAU); g.stroke(); g.globalAlpha = 1; }
      { const ty = p.y + inr * 0.7, txt = `${ro.glyph} ${ro.short}${n.state === 'spin' ? ' · ' + Math.round(n.rpm) : n.state === 'jam' ? ' · jammed' : ' · idle'}`; g.font = '800 9px Nunito, system-ui'; const tw = g.measureText(txt).width + 10;
        g.fillStyle = '#140e09e0'; g.beginPath(); g.roundRect(p.x - tw / 2, ty - 7, tw, 13, 6); g.fill(); g.strokeStyle = ro.color; g.lineWidth = 1; g.stroke(); g.fillStyle = n.state === 'spin' ? '#f3e6c6' : '#ff9a8a'; g.textAlign = 'center'; g.fillText(txt, p.x, ty + 3); }
      if (mergeable.has(it.id)) mergeBadge(p.x + radOf(it, inr) * 0.75, p.y - radOf(it, inr) * 0.75);
      if (sel === it.id) { hexOutline(p.x, p.y, HX.size * 0.97); g.strokeStyle = '#fff'; g.lineWidth = 2; g.stroke(); }
    }
    // the tray: filter chips, then a scrolling row of named cards
    g.textBaseline = 'middle';
    let cx = 10; for (const [k, lbl] of FILTERS) { g.font = '800 12px Nunito, system-ui'; const w = g.measureText(lbl).width + 18; g.fillStyle = trayFilter === k ? '#d4a94e' : '#ffffff14'; g.beginPath(); g.roundRect(cx, BL.ty + 5, w, 22, 11); g.fill(); g.fillStyle = trayFilter === k ? '#241a12' : '#cdbb98'; g.textAlign = 'center'; g.fillText(lbl, cx + w / 2, BL.ty + 16.5); BL['chip_' + k] = [cx, cx + w]; cx += w + 6; }
    const nStones = pouchList().reduce((a, p) => a + p.n, 0);
    g.textAlign = 'right'; g.font = '800 12px Nunito, system-ui'; g.fillStyle = '#d4a94e'; g.fillText('Armory ›', W - 12, BL.ty + 16.5); g.fillStyle = nStones ? '#c9a8ff' : '#6b5a44'; g.fillText(`◆${nStones}`, W - 76, BL.ty + 16.5);
    const items = trayItems(), maxScroll = Math.max(0, items.length * (TRAY.cw + TRAY.gap) + 14 - W); trayScroll = Math.max(0, Math.min(maxScroll, trayScroll)); BL.maxScroll = maxScroll;
    g.save(); g.beginPath(); g.rect(0, BL.cy - 2, W, TRAY.ch + 6); g.clip();
    items.forEach((it, i) => {
      const r = cardRect(i); if (r.x > W || r.x + r.w < 0 || (drag && drag.live && drag.id === it.id)) return;
      const rc = rarity(it.rarity).color, ro = roleOf(it);
      g.fillStyle = '#1a120c'; g.beginPath(); g.roundRect(r.x, r.y, r.w, r.h, 10); g.fill(); g.strokeStyle = it.rarity === 'common' ? '#4a3826' : rc; g.lineWidth = it.rarity === 'common' ? 1 : 2; g.stroke();
      g.fillStyle = ro.color; g.fillRect(r.x + 8, r.y + 2, r.w - 16, 2);
      drawItem(it, r.x + r.w / 2, r.y + 28, ({ S: 15, M: 18, L: 21 })[it.size], 0, { glow: sel === it.id ? '#fff' : null });
      g.font = '800 9.5px Nunito, system-ui'; g.textAlign = 'center'; g.fillStyle = '#f3e6c6'; g.fillText(`${ro.glyph} ${ro.short}`, r.x + r.w / 2, r.y + r.h - 9);
      if (mergeable.has(it.id)) mergeBadge(r.x + r.w - 10, r.y + 10);
    });
    if (!items.length) { g.fillStyle = '#8a7a62'; g.font = '700 12px Nunito, system-ui'; g.textAlign = 'center'; g.fillText(M.invItems(save).length ? 'Nothing in this filter' : 'Every spare gear is on the bench', W / 2, BL.cy + TRAY.ch / 2); }
    g.restore(); g.textBaseline = 'alphabetic';
    if (drag && drag.live) { const it = save.items[drag.id]; g.save(); g.shadowColor = '#000'; g.shadowBlur = 18; g.shadowOffsetY = 10; drawItem(it, drag.x, drag.y - 30, radOf(it, inr) * 1.1, t * 2); g.restore(); if (drag.fromCell) { g.fillStyle = drag.y > BL.ty ? '#ffe28a' : '#ffe28a80'; g.font = '800 11px Nunito'; g.textAlign = 'center'; g.fillText('drop here to take it off', W / 2, BL.ty - 6); } }
    if (!board.spinning.some((n) => D.GEARS[n.item.base].fam === 'unit')) { g.fillStyle = '#ffd38a'; g.font = '800 13px Nunito, system-ui'; g.textAlign = 'center'; g.fillText('Drag a troop gear next to the Mainspring so it turns', W / 2, 18); }
  }
  function mergeBadge(x, y) { g.fillStyle = '#2f9e5a'; g.beginPath(); g.arc(x, y, 7, 0, TAU); g.fill(); g.strokeStyle = '#0d2a18'; g.lineWidth = 1.5; g.stroke(); g.fillStyle = '#fff'; g.font = '900 10px system-ui'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('⇧', x, y + 0.5); g.textBaseline = 'alphabetic'; }
  // bench input: drag gears between board and tray; swipe the tray sideways to scroll it
  let drag = null;
  function benchHit(x, y) {
    if (y < BL.ty) { const k = pxHex(x, y); const id = save.board[k]; if (id && M.cells(stats.boardR).includes(k)) return { id, cell: k }; return { cell: k }; }
    if (y < BL.cy) { for (const [k] of FILTERS) { const c = BL['chip_' + k]; if (c && x >= c[0] && x <= c[1]) return { chip: k }; } if (x > W - 64) return { armory: true }; if (x > W - 110) return { pouch: true }; return { tray: true }; }
    const items = trayItems(); for (let i = 0; i < items.length; i++) { const r = cardRect(i); if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) return { tray: true, id: items[i].id }; }
    return { tray: true };
  }
  function benchDown(x, y) { const h = benchHit(x, y); drag = { x, y, sx: x, sy: y, id: h.id || null, fromCell: h.cell && h.id ? h.cell : null, live: false, mode: null, scroll0: trayScroll, h }; }
  function benchMove(x, y) {
    if (!drag) return; drag.x = x; drag.y = y; const dx = x - drag.sx, dy = y - drag.sy;
    if (!drag.mode && Math.hypot(dx, dy) > 9) { drag.mode = drag.h.tray && Math.abs(dx) > Math.abs(dy) ? 'scroll' : drag.id ? 'gear' : 'none'; if (drag.mode === 'gear') { drag.live = true; closeSheet(); } }
    if (drag.mode === 'scroll') trayScroll = Math.max(0, Math.min(BL.maxScroll || 0, drag.scroll0 - dx));
  }
  function benchUp(x, y) {
    if (!drag) return; const d = drag; drag = null;
    if (!d.mode) { // a tap
      if (d.h.chip) { trayFilter = d.h.chip; trayScroll = 0; sfx.tick(); return; }
      if (d.h.armory) { setTab('armory'); return; }
      if (d.h.pouch) { openPouch(); return; }
      if (d.id) openGear(d.id); else closeSheet();
      return;
    }
    if (d.mode !== 'gear') return;
    const h = benchHit(x, y - 30);
    let err = '';
    if (h.id && h.id !== d.id && M.canMerge(save, d.id, h.id) === '') { const m = M.mergeKeepBest(save, d.id, h.id); err = m.err; if (!err) { sfx.merge(); toast(`Merged: ${save.items[m.id].name} is now rank ${save.items[m.id].rank}`); } }
    else if (y - 30 < BL.ty && h.cell) { if (h.cell === '0,0') err = 'The Mainspring stays put'; else if (!M.cells(stats.boardR).includes(h.cell)) err = ''; else { err = M.place(save, d.id, h.cell); if (!err) { sfx.clank(); placedAt[d.id] = clock; } } }
    else if (y > BL.ty && d.fromCell) { err = M.unplace(save, d.fromCell); if (!err) sfx.tick(); }
    if (err) { toast(err); sfx.nope(); }
    persist(); refresh();
  }

  // gear card
  function openGear(id) {
    const it = save.items[id]; if (!it) return; sel = id;
    const n = board.byCell[Object.keys(save.board).find((k) => save.board[k] === id)] || null;
    const ds = M.describe(it, stats, n, board.sets), R = ds.rarity;
    const same = Object.values(save.items).filter((o) => o.id !== id && M.canMerge(save, o.id, id) === '');
    const sv = M.salvageValue(save, it, stats), to = M.maxIlvl(save), tc = it.ilvl < to ? M.temperCost(it, to) : 0, rc = M.rerollCost(it);
    sheet.innerHTML = `<button class="x" data-a="close">✕</button>
      <h3 style="color:${R.id === 'common' ? '#4a3c2a' : R.color === '#f2c14e' ? '#a77b00' : R.color}">${it.name}</h3>
      <div class="sub">${R.name} ${D.GEARS[it.base].name}</div>
      <ul>${ds.lines.map((l) => `<li>${l}</li>`).join('')}
      ${ds.affixes.map((a, i) => `<li class="aff ${a.dim ? 'dim' : ''}">${a.txt}<button data-a="reroll" data-i="${i}" ${save.brass < rc ? 'disabled' : ''}>reroll ${rc}🔩</button></li>`).join('')}</ul>
      ${ds.power ? `<div class="power">★ ${ds.power}</div>` : ''}
      ${ds.ench ? `<div class="power" style="color:${ds.ench.color === '#ffd24a' ? '#a77b00' : ds.ench.color}">${ds.ench.icon} ${ds.ench.name}: ${ds.ench.line}</div>` : ''}
      ${ds.sockets.length ? `<ul>${ds.sockets.map((x, i) => x ? `<li style="color:${x.color}">◆ ${x.name}: ${x.txt}<button data-a="unsock" data-i="${i}" style="border:1px solid ${x.color};background:#fff;border-radius:8px;font:800 11px var(--body);margin-left:6px;color:${x.color}">remove ${M.unsocketCost(x.tier)}🔩</button></li>` : `<li style="color:#6b5a44">◇ Empty socket <button data-a="sock" data-i="${i}" style="border:1px solid #6b5a44;background:#fff;border-radius:8px;font:800 11px var(--body);margin-left:6px" ${pouchList().length ? '' : 'disabled'}>${pouchList().length ? 'add a stone' : 'no stones yet'}</button></li>`).join('')}</ul>` : ''}
      ${ds.set ? `<div class="set"><b>${ds.set.name}</b> (${ds.set.have} meshed)<br>${ds.set.bonus.map((b, i) => `<span class="${ds.set.have >= i + 2 ? 'on' : ''}">${ds.set.have >= i + 2 ? '✓' : '·'} ${b}</span>`).join('<br>')}<br><small>Set pieces only count while they turn and touch each other.</small></div>` : ''}
      <div class="acts">
        ${n ? `<button data-a="off">Take off</button>` : `<button class="pri" data-a="place">Place</button>`}
        <button data-a="merge" ${same.length ? '' : 'disabled'}>Merge${same.length ? ` (${same.length})` : ''}</button>
        <button data-a="temper" ${tc && save.brass >= tc ? '' : 'disabled'}>${tc ? `Temper → ${to} (${tc}🔩)` : 'Temper: maxed'}</button>
        <button data-a="vault">${it.vault ? 'Unvault' : `Vault (${M.vaultCount(save)}/${stats.vault})`}</button>
        <button data-a="salvage" ${it.vault ? 'disabled' : ''}>Salvage +${sv}🔩</button>
        ${!n && !it.vault && !it.leg && !it.set ? `<button data-a="toforge">⇧ Send to the Merge Workshop</button>` : ''}
        ${D.GEARS[it.base].fam === 'unit' ? `<button data-a="toench">✨ ${it.ench ? 'Re-enchant' : 'Enchant'}</button>` : ''}
        ${M.roomLvl(save, 'forge') >= 2 && !it.leg && !it.set ? `<select data-a="reforge" style="flex:1 1 30%;min-height:42px;border:2px solid var(--ink);border-radius:12px;font:800 13px var(--body)"><option value="">Reforge (${M.reforgeCost(it)}🔩)…</option>${Object.keys(D.GEARS).filter((k) => D.GEARS[k].fam === D.GEARS[it.base].fam && k !== it.base).map((k) => `<option value="${k}">into ${D.GEARS[k].name}</option>`).join('')}</select>` : ''}
      </div>
      ${same.length ? '' : `<div class="sub" style="margin-top:6px">Merging needs another ${D.SIZES[it.size].name.toLowerCase()} ${D.GEARS[it.base].name} of rank ${it.rank}.</div>`}`;
    sheet.hidden = false;
    const rf = sheet.querySelector('select[data-a=reforge]'); if (rf) rf.onchange = () => { if (!rf.value) return; const err = M.reforge(save, id, rf.value); if (err) { toast(err); sfx.nope(); } else { sfx.merge(); toast('Reforged'); } persist(); refresh(); openGear(id); };
    sheet.onclick = (e) => {
      const b = e.target.closest('button'); if (!b) return; const a = b.dataset.a; let err = '';
      if (a === 'close') return closeSheet();
      if (a === 'off') { const k = Object.keys(save.board).find((c) => save.board[c] === id); err = M.unplace(save, k); }
      if (a === 'place') err = autoPlace(id);
      if (a === 'merge') { const src = same.sort((x, y) => (x.loc === 'board') - (y.loc === 'board') || D.RARITIES.findIndex((r) => r.id === x.rarity) - D.RARITIES.findIndex((r) => r.id === y.rarity))[0]; err = M.merge(save, src.id, id); if (!err) { sfx.merge(); toast(`Rank ${save.items[id].rank}!`); } }
      if (a === 'temper') { err = M.temper(save, id); if (!err) sfx.buy(); }
      if (a === 'vault') err = M.toggleVault(save, id);
      if (a === 'reroll') { err = M.reroll(save, id, +b.dataset.i); if (!err) sfx.buy(); }
      if (a === 'toench') { ENCH.target = id; closeSheet(); setTab('workshop'); setTimeout(() => { const h = [...page.querySelectorAll('h3')].find((x) => x.textContent === 'Enchanting'); h && h.scrollIntoView({ behavior: 'smooth' }); }, 50); return; }
      if (a === 'toforge') { if (!FORGE.picked.includes(id)) FORGE.picked = [...FORGE.picked, id].slice(-3); closeSheet(); setTab('workshop'); toast('In the Merge Workshop'); return; }
      if (a === 'unsock') err = M.unsocket(save, id, +b.dataset.i);
      if (a === 'sock') return stonePicker(id, +b.dataset.i);
      if (a === 'salvage') { if (b.dataset.sure) { err = M.salvage(save, id); if (!err) { sfx.clank(); toast(`+${sv} brass`); persist(); refresh(); return closeSheet(); } } else { b.dataset.sure = 1; b.textContent = `Sure? +${sv}🔩`; return; } }
      if (err) { toast(err); sfx.nope(); }
      persist(); refresh(); if (save.items[id]) openGear(id); else closeSheet();
    };
  }
  function pouchList() { const out = []; for (const [ty, tiers] of Object.entries(save.pouch || {})) tiers.forEach((n, ti) => { if (n > 0) out.push({ ty, ti, n }); }); return out.sort((a, b) => b.ti - a.ti || a.ty.localeCompare(b.ty)); }
  const stoneRow = (p, btn) => `<li style="display:flex;align-items:center;gap:8px"><span style="color:${D.STONES[p.ty].color};font-size:20px">◆</span><span style="flex:1"><b>${D.STONE_TIERS[p.ti]} ${D.STONES[p.ty].name}</b> ×${p.n}<br><small>${D.STONES[p.ty].txt(D.STONES[p.ty].v[p.ti])}</small></span>${btn}</li>`;
  function stonePicker(id, slot) {
    const it = save.items[id];
    sheet.innerHTML = `<button class="x" data-a="close">✕</button><h3>Socket a stone</h3><div class="sub">into ${it.name}</div><ul>${pouchList().map((p, i) => stoneRow(p, `<button data-a="pick" data-i="${i}" style="border:2px solid var(--ink);border-radius:10px;background:var(--brass);font:800 13px var(--body);padding:6px 10px">Socket</button>`)).join('')}</ul>`;
    sheet.hidden = false;
    sheet.onclick = (e) => { const b = e.target.closest('button'); if (!b) return; if (b.dataset.a === 'close') return openGear(id);
      const p = pouchList()[+b.dataset.i]; const err = M.socket(save, id, slot, p.ty, p.ti); if (err) { toast(err); sfx.nope(); } else { play('socket', 0.8) || sfx.buy(); persist(); refresh(); } openGear(id); };
  }
  function openPouch() {
    sel = null; const list = pouchList();
    sheet.innerHTML = `<button class="x" data-a="close">✕</button><h3>◆ Cogstones</h3><div class="sub">Socket them from a rare, set or legendary gear's card. Three of a kind combine into the next tier.</div>
      ${list.length ? `<ul>${list.map((p, i) => stoneRow(p, p.ti < 4 ? `<button data-a="comb" data-i="${i}" ${p.n >= 3 && save.brass >= M.combineCostJ(save, p.ti) ? '' : 'disabled'} style="border:2px solid var(--ink);border-radius:10px;background:#fff;font:800 12px var(--body);padding:6px 8px">3 → 1 (${M.combineCostJ(save, p.ti)}🔩)</button>${M.roomLvl(save, 'jeweller') >= 2 ? `<button data-a="polish" data-i="${i}" ${save.brass >= M.polishCost(p.ti) ? '' : 'disabled'} style="border:2px solid var(--ink);border-radius:10px;background:#fff;font:800 12px var(--body);padding:6px 8px">Polish (${M.polishCost(p.ti)}🔩)</button>` : ''}` : '<b>Perfect</b>')).join('')}</ul>` : '<p class="sub">No stones yet. Elites, bosses and Scrap Gremlins drop them; pick them up with the Wrench.</p>'}`;
    sheet.hidden = false;
    sheet.onclick = (e) => { const b = e.target.closest('button'); if (!b) return; if (b.dataset.a === 'close') return closeSheet();
      const p = pouchList()[+b.dataset.i]; const err = b.dataset.a === 'polish' ? M.polishStone(save, p.ty, p.ti) : M.combineStones(save, p.ty, p.ti); if (err) { toast(err); sfx.nope(); } else { play('socket', 0.8) || sfx.merge(); persist(); refresh(); } openPouch(); };
  }
  function autoPlace(id) { // the first free cell where it turns without jamming anything
    const it = save.items[id];
    const free = M.cells(stats.boardR).filter((k) => k !== '0,0' && !save.board[k]).sort((a, b) => M.hexDist(...M.unkey(a)) - M.hexDist(...M.unkey(b)));
    const jamBefore = board.jammed.length;
    for (const k of free) { save.board[k] = id; it.loc = 'board'; const b = M.solve(save, stats); if (b.byCell[k].state === 'spin' && b.jammed.length <= jamBefore) return ''; delete save.board[k]; it.loc = 'inv'; }
    return 'no free cell where it would turn';
  }
  function closeSheet() { sheet.hidden = true; sel = null; sheet.onclick = null; }

  // ------------------------------------------------------------------ Shift
  let fx = [];
  function startShift(opts = {}) {
    if (!board.spinning.some((n) => D.GEARS[n.item.base].fam === 'unit')) { toast('Mesh at least one troop gear to the Mainspring first'); sfx.nope(); return; }
    audio(); closeSheet();
    const { ctx, ...o } = opts; const sh = M.createShift(save, { ...o, depth: o.depth || save.depth });
    shift = { sh, S: sh.S, ctx: ctx || {}, paused: false, acc: 0, res: null, wrench: null, crank: null, pointers: new Map() };
    fx = []; document.body.classList.remove('codex', 'tree'); document.body.classList.add('shift'); requestAnimationFrame(resize); music();
    if (sh.S.boss) toast(`${sh.S.zone.names.boss} guards this depth`);
    if (opts.mod) toast(M.MODS[opts.mod]); if (opts.heat) toast(`Boss Trial, Heat ${opts.heat}`);
    persist();
  }
  let SL = null;
  function shiftLayout() { const strip = Math.min(128, H * 0.17), top = 46; SL = { x: 8, y: top, w: W - 16, h: H - top - strip - 6, strip, sy: H - strip }; return SL; }
  const lx = (x) => SL.x + (x / M.LANE.W) * SL.w, ly = (y) => SL.y + SL.h - (y / M.LANE.L) * SL.h;
  const unit = () => SL.w / M.LANE.W;
  function toLane(px, py) { return { x: ((px - SL.x) / SL.w) * M.LANE.W, y: ((SL.y + SL.h - py) / SL.h) * M.LANE.L }; }
  const LIFT = 46; // the wrench sits above the thumb so you can see it

  function shiftStep(dt) {
    const sh = shift.sh, S = shift.S;
    const w = shift.wrench ? toLane(shift.wrench.x, shift.wrench.y - LIFT) : null;
    sh.update(dt, { wrench: w });
    for (const e of S.events) onEvent(e);
    if (S.over && !shift.res) { shift.res = sh.result(); persist(); setTimeout(showResult, 650); }
  }
  function onEvent(e) {
    const U = unit();
    switch (e.type) {
      case 'kill': fx.push({ k: 'burst', x: lx(e.x), y: ly(e.y), t: 0, life: 0.45, c: S().zone.colors[e.kind] || '#cc5555' }); sfx.pop(); if (e.kind === 'boss') shake(14); break;
      case 'elite': toast(`${e.name}!`); play('elite', 0.7) || sfx.boss(); break;
      case 'gremlin': toast('A Scrap Gremlin! Catch it with the Wrench!'); play('gremlin', 0.8) || sfx.loot('magic'); break;
      case 'gremlinaway': toast('The Gremlin got away…'); break;
      case 'lap': toast('Won! Now catch that Gremlin!'); break;
      case 'gremlinkill': fx.push({ k: 'ring', x: lx(e.x), y: ly(e.y), r: 60, c: '#ffe28a', t: 0, life: 0.5 }); fx.push({ k: 'text', x: lx(e.x), y: ly(e.y) - 14, s: 'Gremlin caught!', c: '#ffe28a', t: 0, life: 1.4, big: true }); sfx.loot('rare'); shake(6); break;
      case 'shell': fx.push({ k: 'arc', x1: lx(e.x1), y1: ly(e.y1), x2: lx(e.x2), y2: ly(e.y2), r: e.r * unit(), t: 0, life: 0.45 }); thr('mortar', 120) && (play('mortar', 0.4) || sfx.hit()); break;
      case 'blast': fx.push({ k: 'ring', x: lx(e.x), y: ly(e.y), r: e.r * unit(), c: '#ff7a2a', t: 0, life: 0.4 }); shake(4); break;
      case 'stone': fx.push({ k: 'text', x: lx(e.x), y: ly(e.y) - 10, s: `${D.STONE_TIERS[e.tier]} ${D.STONES[e.type].name}`, c: D.STONES[e.type].color, t: 0, life: 1.3 }); play('socket', 0.7) || sfx.loot('magic'); break;
      case 'summon': fx.push({ k: 'ring', x: lx(e.x), y: ly(e.y), r: 40, c: '#c77dff', t: 0, life: 0.5 }); toast('The boss calls for help'); break;
      case 'enrage': fx.push({ k: 'flash', t: 0, life: 0.5, c: '#ff3b2a' }); toast('The boss is enraged!'); shake(8); sfx.boss(); break;
      case 'pull': fx.push({ k: 'fly', x: lx(e.x), y: ly(e.y), t: 0, life: 0.4 }); sfx.coin(); break;
      case 'spawn': if (Math.random() < 0.5) fx.push({ k: 'ring', x: lx(e.x), y: ly(1.5), r: 14, c: '#f3e6c6', t: 0, life: 0.3 }); break;
      case 'die': fx.push({ k: 'burst', x: lx(e.x), y: ly(e.y), t: 0, life: 0.35, c: '#d4a94e' }); break;
      case 'shot': fx.push({ k: 'line', x1: lx(e.x1), y1: ly(e.y1), x2: lx(e.x2), y2: ly(e.y2), c: e.side === 1 ? '#f3e6c6' : '#ff9a6a', t: 0, life: 0.15 }); break;
      case 'bolt': fx.push({ k: 'bolt', x1: lx(e.x1), y1: ly(e.y1), x2: lx(e.x2), y2: ly(e.y2), t: 0, life: 0.25, seed: Math.random() }); sfx.bolt(); break;
      case 'pick': fx.push({ k: 'fly', x: lx(e.x), y: ly(e.y), t: 0, life: 0.4 }); sfx.coin(); break;
      case 'loot': { const R = rarity(e.rarity); fx.push({ k: 'text', x: lx(e.x), y: ly(e.y) - 10, s: e.name, c: R.color, t: 0, life: 1.6, big: e.rarity === 'legendary' || e.rarity === 'set' }); sfx.loot(e.rarity); if (e.rarity === 'legendary') { fx.push({ k: 'flash', t: 0, life: 0.5, c: '#ff8a1f' }); try { navigator.vibrate && navigator.vibrate(60); } catch { /* no haptics */ } } break; }
      case 'salvage': fx.push({ k: 'text', x: lx(e.x), y: ly(e.y) - 10, s: 'salvaged', c: '#a8957a', t: 0, life: 0.9 }); sfx.coin(); break;
      case 'crank': fx.push({ k: 'text', x: W / 2, y: SL.sy - 14, s: 'WOUND UP! ×3', c: '#ffe28a', t: 0, life: 1.2, big: true }); sfx.crank(); break;
      case 'boss': fx.push({ k: 'flash', t: 0, life: 0.6, c: '#ff3b2a' }); sfx.boss(); shake(12); break;
      case 'surge': fx.push({ k: 'text', x: W / 2, y: SL.y + 26, s: 'Surge!', c: '#ff9a6a', t: 0, life: 1 }); break;
      case 'doorhit': sfx.door(); shake(3); break;
      case 'spell': sfx.spell(); fx.push({ k: 'ring', x: W / 2, y: SL.y + SL.h / 2, r: SL.w * 0.6, c: D.GEARS[e.base].color, t: 0, life: 0.35 }); break;
      case 'win': sfx.win(); break;
      case 'door': sfx.lose(); break;
      case 'timeout': sfx.lose(); break;
      default:
    }
    void U;
  }
  const S = () => shift.S;
  let shakeAmt = 0;
  const shake = (n) => { shakeAmt = Math.max(shakeAmt, n); };
  function drawShift(t) {
    shiftLayout();
    const st = S(), Z = st.zone, U = unit();
    g.fillStyle = Z.bg; g.fillRect(0, 0, W, SL.sy);
    g.save();
    if (shakeAmt > 0.2) { g.translate((Math.random() - 0.5) * shakeAmt, (Math.random() - 0.5) * shakeAmt); shakeAmt *= 0.88; } else shakeAmt = 0;
    // lane: painted floor (or flat colour), vignette, faint distance marks
    g.save(); g.beginPath(); g.roundRect(SL.x, SL.y, SL.w, SL.h, 12); g.clip();
    const bgi = art('bg-' + Z.id);
    if (bgi) { const sc = Math.max(SL.w / bgi.width, SL.h / bgi.height); g.drawImage(bgi, SL.x + (SL.w - bgi.width * sc) / 2, SL.y + (SL.h - bgi.height * sc) / 2, bgi.width * sc, bgi.height * sc); }
    else { g.fillStyle = Z.lane; g.fillRect(SL.x, SL.y, SL.w, SL.h); g.strokeStyle = '#00000030'; g.lineWidth = 1; for (let y = 5; y < M.LANE.L; y += 5) { g.beginPath(); g.moveTo(SL.x + 6, ly(y)); g.lineTo(SL.x + SL.w - 6, ly(y)); g.stroke(); } }
    const vg = g.createLinearGradient(SL.x, 0, SL.x + SL.w, 0); vg.addColorStop(0, '#0000008c'); vg.addColorStop(0.18, '#00000000'); vg.addColorStop(0.82, '#00000000'); vg.addColorStop(1, '#0000008c'); g.fillStyle = vg; g.fillRect(SL.x, SL.y, SL.w, SL.h);
    if (st.crankT > 0) { g.fillStyle = `rgba(255,226,138,${0.06 + 0.04 * Math.sin(t * 12)})`; g.fillRect(SL.x, SL.y, SL.w, SL.h); }
    g.restore();
    // gate
    const gy = ly(M.LANE.L), gf = Math.max(0, st.gate.hp / st.gate.max), gimg = art('obj-gate-' + Z.id);
    if (gimg) { const s2 = SL.w * 0.66; g.drawImage(gimg, W / 2 - s2 / 2, gy + 14 - s2 / 2, s2, s2); }
    else { g.fillStyle = '#00000060'; g.fillRect(SL.x, gy, SL.w, 16); g.fillStyle = Z.accent; for (let i = 0; i < 9; i++) g.fillRect(SL.x + 6 + i * (SL.w - 12) / 9, gy, (SL.w - 12) / 18, 10); }
    bar(SL.x + 40, gy + 56, SL.w - 80, 7, gf, Z.accent);
    // door
    const dy = ly(0), df = Math.max(0, st.door.hp / st.door.max), dimg = art('obj-door');
    if (dimg) { const s2 = SL.w * 0.55; g.drawImage(dimg, W / 2 - s2 / 2, dy - 18 - s2 / 2, s2, s2); }
    else { g.fillStyle = '#5a3a1e'; g.fillRect(SL.x, dy - 12, SL.w, 12); g.strokeStyle = '#3a2410'; for (let i = 0; i < 8; i++) { g.beginPath(); g.moveTo(SL.x + i * SL.w / 8, dy - 12); g.lineTo(SL.x + i * SL.w / 8, dy); g.stroke(); } }
    bar(SL.x + 40, dy - 4, SL.w - 80, 5, df, df > 0.35 ? '#7fd36b' : '#ff5a3a');
    // drops
    const scrapImg = art('obj-scrap');
    for (const d of st.drops) {
      const x = lx(d.x), y = ly(d.y);
      if (d.kind === 'stone') { const c = D.STONES[d.type].color, si = art('stone-' + d.type); glow(x, y, 16, c); if (si) g.drawImage(si, x - 9, y - 9, 18, 18); else { g.fillStyle = c; g.beginPath(); g.moveTo(x, y - 7); g.lineTo(x + 6, y); g.lineTo(x, y + 7); g.lineTo(x - 6, y); g.closePath(); g.fill(); g.strokeStyle = '#fff8'; g.stroke(); } continue; }
      if (d.kind === 'scrap') { const r = 4 + Math.min(4, Math.log10(1 + d.v)); if (scrapImg) g.drawImage(scrapImg, x - r * 1.6, y - r * 1.6, r * 3.2, r * 3.2); else { g.fillStyle = '#e8c05a'; g.beginPath(); g.arc(x, y, r - 1, 0, TAU); g.fill(); g.strokeStyle = '#7a5a1a'; g.stroke(); } }
      else {
        const c = d.force === 'legendary' ? '#ff8a1f' : '#ffe28a', grd = g.createLinearGradient(x, y - 80, x, y);
        grd.addColorStop(0, c + '00'); grd.addColorStop(1, c + 'bb'); g.globalCompositeOperation = 'lighter'; g.fillStyle = grd; g.fillRect(x - 6, y - 80, 12, 80); g.globalCompositeOperation = 'source-over';
        drawItem({ base: 'collector', size: 'S', rarity: d.force === 'legendary' ? 'legendary' : 'rare', rank: 1 }, x, y - 8 + Math.sin(t * 4) * 2, 9, t * 2);
      }
    }
    // units, sorted so lower ones draw on top
    const all = st.enemies.map((e) => [e, 0]).concat(st.troops.map((tr) => [tr, 1])).sort((a, b) => b[0].y - a[0].y);
    for (const [u, side] of all) side ? drawTroop(u, U, t) : drawFoe(u, Z, U, t);
    if (st.gremlin && !st.gremlin.gone) drawGremlin(st.gremlin, U, t);
    // wrench + sprite
    if (st.stats.autoWrench) { const p = st.sprite; glow(lx(p.x), ly(p.y), 16, '#9fe7ff'); g.fillStyle = '#e8fbff'; g.beginPath(); g.arc(lx(p.x), ly(p.y), 3.5, 0, TAU); g.fill(); }
    if (shift.wrench) {
      const x = shift.wrench.x, y = shift.wrench.y - LIFT, r = st.stats.wrenchRad * U;
      const rg = g.createRadialGradient(x, y, r * 0.2, x, y, r); rg.addColorStop(0, '#ffe28a00'); rg.addColorStop(0.8, '#ffe28a22'); rg.addColorStop(1, '#ffe28a55');
      g.fillStyle = rg; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
      g.strokeStyle = '#ffe28a'; g.lineWidth = 2.5; g.setLineDash([6, 5]); g.lineDashOffset = -t * 30; g.beginPath(); g.arc(x, y, r, 0, TAU); g.stroke(); g.setLineDash([]);
      g.strokeStyle = '#ffe28a40'; g.lineWidth = 1; g.beginPath(); g.arc(x, y, st.stats.pickRad * U, 0, TAU); g.stroke();
      g.font = '24px system-ui'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('🔧', x, y); g.textBaseline = 'alphabetic';
      if (st.enemies.some((e) => Math.hypot(lx(e.x) - x, ly(e.y) - y) < r + e.r * U)) { sfx.zap(); for (let i = 0; i < 3; i++) { const a = Math.random() * TAU, d2 = r * Math.random(); fx.push({ k: 'spark', x: x + Math.cos(a) * d2, y: y + Math.sin(a) * d2, vx: Math.cos(a) * 60, vy: Math.sin(a) * 60, t: 0, life: 0.25 }); } }
    }
    drawFx(1 / 60);
    g.restore();
    // HUD
    const tl = Math.max(0, st.time - st.t);
    g.fillStyle = '#0b0806c0'; g.beginPath(); g.roundRect(8, 6, W - 70, 34, 10); g.fill();
    g.fillStyle = '#ffffff18'; g.fillRect(14, 10, W - 82, 4); g.fillStyle = st.crankT > 0 ? '#ffe28a' : '#d4a94e'; g.fillRect(14, 10, (W - 82) * (tl / st.time), 4);
    g.fillStyle = '#f3e6c6'; g.font = '900 15px Cinzel, serif'; g.textAlign = 'left'; g.fillText(`Depth ${st.depth}`, 16, 33);
    g.font = '800 14px Nunito, system-ui'; g.textAlign = 'center'; g.fillText(`⏱ ${Math.ceil(tl)}s`, W * 0.42, 33);
    g.textAlign = 'right'; g.fillText(`⛭ ${fmt(st.scrap)}  ⚙ ${st.items.length}`, W - 72, 33);
    g.fillStyle = '#0b0806c0'; g.beginPath(); g.roundRect(W - 54, 6, 46, 34, 10); g.fill(); g.fillStyle = '#f3e6c6'; g.font = '900 16px system-ui'; g.textAlign = 'center'; g.fillText('❚❚', W - 31, 29);
    const boss = st.boss && st.enemies.find((e) => e.kind === 'boss');
    if (boss) { bar(SL.x + 20, SL.y + 74, SL.w - 40, 10, boss.hp / boss.max, '#ff5a3a'); g.fillStyle = '#fff'; g.font = '900 12px Cinzel, serif'; g.textAlign = 'center'; g.strokeStyle = '#000'; g.lineWidth = 3; g.strokeText(Z.names.boss, W / 2, SL.y + 100); g.fillText(Z.names.boss, W / 2, SL.y + 100); }
    drawStrip(t);
    if (shift.paused && !shift.res) { g.fillStyle = '#000a'; g.fillRect(0, 0, W, H); g.fillStyle = '#f3e6c6'; g.font = '900 26px Cinzel, serif'; g.textAlign = 'center'; g.fillText('Paused', W / 2, H * 0.4); }
  }
  function bar(x, y, w, h, f, col) {
    g.fillStyle = '#000000a0'; g.beginPath(); g.roundRect(x - 1, y - 1, w + 2, h + 2, h); g.fill();
    if (f > 0) { const gr = g.createLinearGradient(0, y, 0, y + h); gr.addColorStop(0, '#ffffff60'); gr.addColorStop(0.5, col); gr.addColorStop(1, col); g.fillStyle = gr; g.beginPath(); g.roundRect(x, y, Math.max(h, w * Math.min(1, f)), h, h / 2); g.fill(); }
  }
  function glow(x, y, r, c) { const rg = g.createRadialGradient(x, y, 0, x, y, r); rg.addColorStop(0, c + 'aa'); rg.addColorStop(1, c + '00'); g.fillStyle = rg; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill(); }
  function shadowAt(x, y, r) { g.fillStyle = '#00000055'; g.beginPath(); g.ellipse(x, y + r * 0.75, r * 0.8, r * 0.3, 0, 0, TAU); g.fill(); }
  function drawTroop(tr, U, t) {
    const x = lx(tr.x), y = ly(tr.y), r = Math.max(4, tr.r * U * 0.62), img = art('unit-' + tr.kind);
    shadowAt(x, y, r);
    if (img) { const s2 = r * 3.9, bob = Math.sin(t * 10 + tr.x * 3) * r * 0.08; g.drawImage(img, x - s2 / 2, y - s2 / 2 - r * 0.25 + bob, s2, s2); if (tr.hit > 0.07) { g.globalCompositeOperation = 'lighter'; g.globalAlpha = 0.5; g.drawImage(img, x - s2 / 2, y - s2 / 2 - r * 0.25, s2, s2); g.globalAlpha = 1; g.globalCompositeOperation = 'source-over'; } }
    else {
      g.fillStyle = tr.hit > 0.07 ? '#fff4dc' : D.GEARS[tr.kind].color; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
      g.strokeStyle = '#2a1d10'; g.lineWidth = 1.5; g.stroke();
      g.fillStyle = '#e8c05a'; g.beginPath(); g.arc(x, y - r * 0.35, r * 0.55, Math.PI, TAU); g.fill();
    }
    if (tr.ench) { g.fillStyle = D.ENCHANTS[tr.ench.t].color; g.beginPath(); g.arc(x + r * 0.8, y - r * 0.9, Math.max(2, r * 0.22), 0, TAU); g.fill(); }
    if (tr.shield > 0) { g.strokeStyle = '#7fe0ff70'; g.lineWidth = 1.2; g.beginPath(); g.arc(x, y, r + 2.5, 0, TAU); g.stroke(); }
    if (tr.hp < tr.max) bar(x - r, y + r + 3, r * 2, 2.5, tr.hp / tr.max, '#7fd36b');
  }
  function drawFoe(e, Z, U, t) {
    const az = Z.id === 'deep' && e.kind !== 'boss' ? ['foundry', 'mines', 'tower'][Math.floor(e.max) % 3] : Z.id;
    const x = lx(e.x), y = ly(e.y), r = Math.max(5, e.r * U * 0.85), img = art(e.kind === 'boss' ? 'boss-' + Z.id : `enemy-${az}-${e.kind}`);
    shadowAt(x, y, r);
    if (img) {
      const s2 = r * (e.kind === 'boss' ? 2.8 : 2.9), wob = Math.sin(t * 7 + e.x) * r * 0.06;
      g.drawImage(img, x - s2 / 2, y - s2 / 2 - r * 0.2 + wob, s2, s2);
      if (e.hit > 0.06) { g.globalCompositeOperation = 'lighter'; g.globalAlpha = 0.45; g.drawImage(img, x - s2 / 2, y - s2 / 2 - r * 0.2, s2, s2); g.globalAlpha = 1; g.globalCompositeOperation = 'source-over'; }
    } else {
      g.fillStyle = Z.colors[e.kind]; g.beginPath();
      const wob = Math.sin(t * 6 + e.x) * 0.08;
      g.ellipse(x, y, r * (1 + wob), r * (1 - wob), 0, 0, TAU); g.fill();
      if (e.kind === 'armor' || e.kind === 'boss') { g.strokeStyle = '#d7d2cc'; g.lineWidth = 2; g.stroke(); }
      if (e.hit > 0.06) { g.fillStyle = '#ffffff55'; g.fill(); }
      g.fillStyle = '#fff'; g.beginPath(); g.arc(x - r * 0.32, y + r * 0.1, r * 0.22, 0, TAU); g.arc(x + r * 0.32, y + r * 0.1, r * 0.22, 0, TAU); g.fill();
      g.fillStyle = '#1a0f08'; g.beginPath(); g.arc(x - r * 0.32, y + r * 0.18, r * 0.11, 0, TAU); g.arc(x + r * 0.32, y + r * 0.18, r * 0.11, 0, TAU); g.fill();
    }
    if (e.burnT > 0) { g.globalCompositeOperation = 'lighter'; glow(x, y - r * 0.2, r * 1.3, '#ff6a2a'); g.globalCompositeOperation = 'source-over'; if (Math.random() < 0.3) fx.push({ k: 'spark', x: x + (Math.random() - 0.5) * r, y: y - r * 0.5, vx: 0, vy: -40, t: 0, life: 0.3 }); }
    if (e.slowT > 0) { g.fillStyle = '#9fe0ff40'; g.beginPath(); g.arc(x, y, r * 1.05, 0, TAU); g.fill(); }
    if (e.hp < e.max && e.kind !== 'boss') bar(x - r, y - r - 7, r * 2, 3, e.hp / e.max, e.elite ? '#c77dff' : '#ff6a4a');
    if (e.shieldUp) { g.strokeStyle = '#9fe7ff'; g.lineWidth = 3; g.globalAlpha = 0.6 + 0.3 * Math.sin(t * 20); g.beginPath(); g.arc(x, y, r * 1.5, 0, TAU); g.stroke(); g.globalAlpha = 1; g.fillStyle = '#9fe7ff'; g.font = '900 11px Nunito'; g.textAlign = 'center'; g.fillText('SHIELDED', x, y - r * 1.6); }
    if (e.elite) { // Diablo-style champion: a pulsing aura ring and its name
      const pc = e.elite.includes('molten') ? '#ff6a2a' : e.elite.includes('warding') ? '#7fd8ff' : e.elite.includes('vampiric') ? '#ff3a5a' : '#c77dff';
      g.strokeStyle = pc; g.globalAlpha = 0.55 + 0.3 * Math.sin(t * 6 + e.x); g.lineWidth = 2.5; g.beginPath(); g.ellipse(x, y + r * 0.6, r * 1.05, r * 0.42, 0, 0, TAU); g.stroke(); g.globalAlpha = 1;
      if (e.elite.includes('warding')) { g.strokeStyle = '#7fd8ff30'; g.lineWidth = 1; g.beginPath(); g.arc(x, y, 6 * U, 0, TAU); g.stroke(); }
      g.font = '800 9px Nunito, system-ui'; g.textAlign = 'center'; g.fillStyle = pc; g.strokeStyle = '#000'; g.lineWidth = 2.5; g.strokeText(e.name, x, y - r - 11); g.fillText(e.name, x, y - r - 11);
    }
  }
  function drawGremlin(gr, U, t) {
    const x = lx(gr.x), y = ly(gr.y), r = 1.1 * U, img = art('enemy-gremlin');
    glow(x, y, r * 3, '#ffe28a'); shadowAt(x, y, r);
    if (img) { const s2 = r * 3.2; g.save(); g.translate(x, y + Math.abs(Math.sin(t * 14)) * -3); if (gr.dir < 0) g.scale(-1, 1); g.drawImage(img, -s2 / 2, -s2 / 2, s2, s2); g.restore(); }
    else {
      g.fillStyle = gr.hit > 0 ? '#fff6c8' : '#c99a3a'; g.beginPath(); g.ellipse(x, y, r, r * 0.85, 0, 0, TAU); g.fill(); g.strokeStyle = '#3a2614'; g.lineWidth = 1.5; g.stroke();
      g.fillStyle = '#8a5a2a'; g.beginPath(); g.arc(x - gr.dir * r * 0.9, y - r * 0.2, r * 0.7, 0, TAU); g.fill(); g.fillStyle = '#ffe28a'; g.fillRect(x - gr.dir * r * 0.9 - 2, y - r * 0.5, 4, 3);
      g.fillStyle = '#fff'; g.beginPath(); g.arc(x + gr.dir * r * 0.3, y - r * 0.2, r * 0.22, 0, TAU); g.fill(); g.fillStyle = '#000'; g.beginPath(); g.arc(x + gr.dir * r * 0.36, y - r * 0.2, r * 0.1, 0, TAU); g.fill();
    }
    bar(x - r * 1.2, y - r * 1.6, r * 2.4, 4, gr.hp / gr.max, '#ffe28a');
  }
  let stripU = null, stripK = '';
  function stripUnder() {
    const k = `${W}x${H}:${SL.sy}`; if (k === stripK) return stripU;
    stripK = k; stripU = stripU || document.createElement('canvas'); const s2 = Math.min(2, DPR);
    stripU.width = Math.round(W * s2); stripU.height = Math.round(H * s2); const u = stripU.getContext('2d'); u.setTransform(s2, 0, 0, s2, 0, 0); u.clearRect(0, 0, W, H);
    const y0 = SL.sy, gr = u.createLinearGradient(0, y0, 0, H); gr.addColorStop(0, '#2a2420'); gr.addColorStop(1, '#141110'); u.fillStyle = gr; u.fillRect(0, y0, W, H - y0);
    u.fillStyle = '#c9a24a'; u.fillRect(0, y0, W, 2); u.fillStyle = '#00000090'; u.fillRect(0, y0 + 2, W, 4);
    for (const x of [10, W - 10]) for (const y of [y0 + 14, H - 14]) { u.fillStyle = '#6b5a44'; u.beginPath(); u.arc(x, y, 3, 0, TAU); u.fill(); u.fillStyle = '#c9a24a88'; u.beginPath(); u.arc(x - 0.8, y - 0.8, 1.2, 0, TAU); u.fill(); }
    return stripU;
  }
  function drawStrip(t) {
    const st = S(), y0 = SL.sy, h = SL.strip, GL = window.CogGL && window.CogGL.ready;
    // fit the cells that hold gears (plus the Mainspring), not the whole bench
    let x0 = -1, x1 = 1, y0c = -1, y1c = 1;
    for (const gr of st.train) { const [q, r] = M.unkey(gr.k); const ux = SQ3 * (q + r / 2), uy = 1.5 * r; x0 = Math.min(x0, ux - 1); x1 = Math.max(x1, ux + 1); y0c = Math.min(y0c, uy - 1); y1c = Math.max(y1c, uy + 1); }
    const size = Math.min((h - 16) / (y1c - y0c), (W * 0.56) / (x1 - x0), 30);
    const cx = W / 2 - ((x0 + x1) / 2) * size, cy = y0 + h / 2 - ((y0c + y1c) / 2) * size;
    shift.stripC = { x: cx, y: cy };
    const inr = (size * SQ3) / 2, P = (k) => { const [q, r] = M.unkey(k); return [cx + size * SQ3 * (q + r / 2), cy + size * 1.5 * r]; };
    const angOf = (gr) => gr.angle + (gr.n.dir === -1 ? Math.PI / teethOf(gr.item) : 0);
    if (GL) {
      g.clearRect(0, y0, W, H - y0);
      const gears = [{ id: 'smain', x: cx, y: cy, R: inr * 0.95, teeth: 12, angle: st.mainAngle, base: 'main', rarity: 'common', state: 'spin' }];
      for (const gr of st.train) { const [x, y] = P(gr.k); gears.push({ id: 's' + gr.item.id, x, y, R: radOf(gr.item, inr), angle: angOf(gr), ...iconSpec(gr.item, gr.n.state) }); }
      window.CogGL.frame({ W, H, dpr: DPR, under: stripUnder(), underKey: stripK, region: { y: y0, h: H - y0 }, gears });
      if (st.crankT > 0) glow(cx, cy, inr * 2.2, '#ffe28a');
      for (const gr of st.train) if (gr.pulse > 0) { const [x, y] = P(gr.k); g.globalAlpha = gr.pulse * 3; glow(x, y, radOf(gr.item, inr) * 1.5, '#fff6c8'); g.globalAlpha = 1; }
    } else {
      g.fillStyle = '#1a130e'; g.fillRect(0, y0, W, h + 10);
      g.strokeStyle = '#4a3826'; g.lineWidth = 2; g.beginPath(); g.moveTo(0, y0); g.lineTo(W, y0); g.stroke();
      drawGear(cx, cy, inr * 0.95, 12, st.mainAngle, null, { main: true, glow: st.crankT > 0 ? '#ffe28a' : '#f0c86a55' });
      for (const gr of st.train) { const [x, y] = P(gr.k); g.globalAlpha = gr.n.state === 'idle' ? 0.35 : 1; drawGear(x, y, radOf(gr.item, inr), teethOf(gr.item), angOf(gr), gr.item, { jam: gr.n.state === 'jam', glow: gr.pulse > 0 ? '#fff8' : null }); g.globalAlpha = 1; }
    }
    // crank prompt
    g.textAlign = 'left'; g.fillStyle = st.cranks > 0 ? '#ffe28a' : '#6b5a44'; g.font = '900 13px Cinzel, serif';
    g.fillText(`⟲ ×${st.cranks}`, 14, y0 + 26);
    g.font = '700 11px Nunito, system-ui'; g.fillStyle = '#a8957a';
    if (st.cranks > 0 && st.crankT <= 0) { g.fillText('circle your thumb', 14, y0 + 42); g.fillText('here to wind up', 14, y0 + 56); }
    if (shift.crank) { const f = Math.min(1, Math.abs(shift.crank.acc) / (TAU * 0.9)); g.strokeStyle = '#ffe28a'; g.lineWidth = 4; g.lineCap = 'round'; g.beginPath(); g.arc(cx, cy, inr * 1.25, -Math.PI / 2, -Math.PI / 2 + f * TAU); g.stroke(); g.lineCap = 'butt'; }
    const B = st.buffs, bx = W - 14; g.textAlign = 'right'; g.font = '800 12px Nunito, system-ui';
    if (B.haste > 0) { g.fillStyle = D.GEARS.haste.color; g.fillText(`» haste ${B.haste.toFixed(1)}s`, bx, y0 + 26); }
    if (B.over > 0) { g.fillStyle = D.GEARS.overcharge.color; g.fillText(`ϟ over ${B.over.toFixed(1)}s`, bx, y0 + 42); }
    g.fillStyle = '#a8957a'; g.fillText(`${st.troops.length} troops`, bx, y0 + h - 14);
    void t;
  }
  function drawFx(dt) {
    for (const f of fx) {
      f.t += dt; const q = f.t / f.life; g.globalAlpha = Math.max(0, 1 - q);
      if (f.k === 'burst') { glow(f.x, f.y, 22 * (1 - q) + 6, f.c); g.fillStyle = f.c; for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU + f.x; g.beginPath(); g.arc(f.x + Math.cos(a) * 18 * q, f.y + Math.sin(a) * 18 * q, 2.5, 0, TAU); g.fill(); } }
      else if (f.k === 'line') { g.strokeStyle = f.c; g.lineWidth = 1.5; g.beginPath(); g.moveTo(f.x1, f.y1); g.lineTo(f.x1 + (f.x2 - f.x1) * Math.min(1, q * 2), f.y1 + (f.y2 - f.y1) * Math.min(1, q * 2)); g.stroke(); }
      else if (f.k === 'bolt') { g.strokeStyle = '#c9b8ff'; g.lineWidth = 2.5; g.beginPath(); g.moveTo(f.x1, f.y1); for (let i = 1; i <= 6; i++) { const p = i / 6; g.lineTo(f.x1 + (f.x2 - f.x1) * p + (i < 6 ? Math.sin(f.seed * 99 + i * 7) * 7 : 0), f.y1 + (f.y2 - f.y1) * p); } g.stroke(); }
      else if (f.k === 'fly') { const x = f.x + (W - 60 - f.x) * q * q, y = f.y + (20 - f.y) * q * q; g.fillStyle = '#e8c05a'; g.beginPath(); g.arc(x, y, 3, 0, TAU); g.fill(); }
      else if (f.k === 'text') { g.fillStyle = f.c; g.font = `900 ${f.big ? 18 : 13}px Cinzel, serif`; g.textAlign = 'center'; g.strokeStyle = '#000'; g.lineWidth = 3; g.strokeText(f.s, f.x, f.y - 24 * q); g.fillText(f.s, f.x, f.y - 24 * q); }
      else if (f.k === 'ring') { g.strokeStyle = f.c; g.lineWidth = 3 * (1 - q) + 1; g.beginPath(); g.arc(f.x, f.y, f.r * (0.2 + q), 0, TAU); g.stroke(); }
      else if (f.k === 'arc') { const p = Math.min(1, q * 1.6), x = f.x1 + (f.x2 - f.x1) * p, y = f.y1 + (f.y2 - f.y1) * p - Math.sin(p * Math.PI) * 60; if (p < 1) { g.fillStyle = '#3a2a1a'; g.beginPath(); g.arc(x, y, 4, 0, TAU); g.fill(); } else { glow(f.x2, f.y2, f.r * 1.2, '#ff9a3c'); } }
      else if (f.k === 'spark') { g.globalCompositeOperation = 'lighter'; g.fillStyle = '#fff2a8'; const sx = f.x + (f.vx || 0) * f.t, sy = f.y + (f.vy || 0) * f.t; g.fillRect(sx - 1.5, sy - 1.5, 3, 3); g.globalCompositeOperation = 'source-over'; }
      else if (f.k === 'flash') { g.fillStyle = f.c; g.globalAlpha = 0.3 * (1 - q); g.fillRect(0, 0, W, H); }
    }
    g.globalAlpha = 1; fx = fx.filter((f) => f.t < f.life);
    if (fx.length > 300) fx.splice(0, fx.length - 300);
  }
  // shift input: one finger is the Wrench (lane), another can wind the Mainspring (strip) at the same time
  function shiftDown(e, x, y) {
    if (shift.res) return;
    if (x > W - 56 && y < 44) { pauseMenu(); return; }
    if (shift.paused) { shift.paused = false; return; }
    if (y >= SL.sy) { const c = shift.stripC || { x: W / 2, y: SL.sy + SL.strip / 2 }; shift.crank = { id: e.pointerId, a: Math.atan2(y - c.y, x - c.x), acc: 0 }; return; }
    shift.wrench = { id: e.pointerId, x, y };
  }
  function shiftMove(e, x, y) {
    if (shift.crank && shift.crank.id === e.pointerId) {
      const c = shift.stripC || { x: W / 2, y: SL.sy + SL.strip / 2 }; const a = Math.atan2(y - c.y, x - c.x); let d = a - shift.crank.a; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU;
      shift.crank.a = a; shift.crank.acc += d;
      if (Math.abs(shift.crank.acc) >= TAU * 0.9) { shift.crank.acc = 0; if (!shift.sh.crank()) toast(shift.S.cranks <= 0 ? 'No crank bursts left this Shift' : 'Already wound up'); }
      return;
    }
    if (shift.wrench && shift.wrench.id === e.pointerId) { shift.wrench.x = x; shift.wrench.y = y; }
  }
  function shiftUp(e) { if (shift.crank && shift.crank.id === e.pointerId) shift.crank = null; if (shift.wrench && shift.wrench.id === e.pointerId) shift.wrench = null; }
  function pauseMenu() {
    shift.paused = true;
    showModal(`<h2>Paused</h2><p>Depth ${shift.S.depth}: ${Math.ceil(shift.S.time - shift.S.t)} s left. Ending now keeps the scrap and gears you've picked up.</p>
      <div class="row"><button class="alt" data-a="end">End Shift</button><button data-a="resume">Resume</button></div>`, (a) => { hideModal(); if (a === 'end') shift.sh.quit(); shift.paused = false; });
  }
  function showResult() {
    const r = shift.res, st = shift.S, ctx = shift.ctx;
    const doneB = r.run ? M.bountiesFromRun(save, r.run) : [];
    if (ctx.exp) return expResult(r, doneB);
    if (ctx.trial) return trialResult(r, ctx.trial, doneB);
    const title = { win: st.boss ? `${st.zone.names.boss} falls!` : 'Gate broken!', door: 'The door gave way', timeout: 'Shift over' }[r.outcome];
    const items = r.items.map((id) => save.items[id]).filter(Boolean);
    const lines = [`+${fmt(r.scrap)} scrap · ${r.kills} kills${r.brass ? ` · +${r.brass} brass from salvage` : ''}`];
    if (r.contract) lines.unshift('📜 Contract complete! The chest held a rare gear, a gear, a Flawed Cogstone and 30 brass.');
    if (r.opened) lines.push(`Depth ${save.unlocked} is open${M.isBossDepth(save.unlocked) ? ' — a boss waits there' : ''}.`);
    if (r.outcome !== 'win') lines.push(r.outcome === 'door' ? 'Upgrade the door, troop health, or put a Tinker on the bench.' : `Gate ${Math.round(r.gate * 100)}% left. More troops, more damage, or a longer Shift will get it.`);
    if (r.outcome === 'win' && st.boss && st.depth === 10 && save.overhauls === 0) lines.push('You can now Overhaul from the Upgrades tab for permanent Blueprints.');
    for (const b of doneB) lines.push(`📋 Bounty done: ${b.text}. Claim it in Jobs.`);
    showModal(`<h2>${title}</h2>${lines.map((l) => `<p>${l}</p>`).join('')}
      ${r.stones && r.stones.length ? `<p>${r.stones.map(([ty, ti]) => `<span style="color:${D.STONES[ty].color}">◆ ${D.STONE_TIERS[ti]} ${D.STONES[ty].name}</span>`).join(' · ')}</p>` : ''}
      ${items.length ? `<div class="loot">${items.map((it) => `<div style="color:${rarity(it.rarity).color === '#b9b3a6' ? '#5a4c3a' : rarity(it.rarity).color};${it.rarity === 'legendary' ? 'background:#2a1a08' : ''}">⚙ ${it.name} <small>(ilvl ${it.ilvl})</small></div>`).join('')}</div>` : ''}
      <div class="row"><button class="alt" data-a="bench">Bench</button><button data-a="again">${r.opened ? 'Go deeper' : 'Again'}</button></div>`, (a) => {
      hideModal(); endShift();
      if (a === 'again') { if (r.opened) save.depth = save.unlocked; refresh(); startShift(); }
    });
  }
  function endShift() { shift = null; fx = []; document.body.classList.remove('shift'); setTab(tab); requestAnimationFrame(resize); music(); }

  function lootList(ids) { const items = ids.map((id) => save.items[id]).filter(Boolean); return items.length ? `<div class="loot">${items.map((it) => `<div style="color:${rarity(it.rarity).color === '#b9b3a6' ? '#5a4c3a' : rarity(it.rarity).color}">⚙ ${it.name} <small>(ilvl ${it.ilvl})</small></div>`).join('')}</div>` : ''; }
  function expResult(r, doneB) {
    const out = M.expAfterShift(save, r), E = save.exp; persist();
    const title = r.outcome === 'win' ? (E.won ? 'Expedition complete!' : 'Node cleared') : out.retry ? 'Out of time' : 'The Expedition ends';
    const lines = [`+${fmt(r.scrap)} scrap · door at ${Math.round(E.integrity * 100)}% · 🎟 ${E.coins} tickets`];
    if (out.bp) lines.push('+1 Blueprint and a treasure chest!'); if (out.retry) lines.push('The gate held. It cost you 25% of your door; try that node again from the map.'); if (out.over && !E.won) lines.push('You keep everything you found.');
    for (const b of doneB) lines.push(`📋 Bounty done: ${b.text}`);
    showModal(`<h2>${title}</h2>${lines.map((l) => `<p>${l}</p>`).join('')}${lootList([...(r.items || []), ...(out.items || [])])}<div class="row"><button data-a="map">${E.over ? 'Back to Jobs' : 'To the map'}</button></div>`, () => { hideModal(); endShift(); JOB.view = E.over ? 'main' : 'map'; setTab('jobs'); });
  }
  function trialResult(r, t, doneB) {
    const out = M.trialAfter(save, t.d, t.heat, r); persist();
    const T = D.TROPHIES[M.trophyKey(t.d)], lines = [];
    if (out.won) lines.push(out.newHeat ? `🏆 ${T.name}, Heat ${t.heat}: ${T.txt(save.trophies[M.trophyKey(t.d)])} for good` : `Heat ${t.heat} beaten again.`); else lines.push('Not this time. The trophy waits.');
    if (out.legendary) lines.push(`★ A boss legendary: ${save.items[out.legendary].name}!`);
    for (const b of doneB) lines.push(`📋 Bounty done: ${b.text}`);
    showModal(`<h2>${out.won ? 'Trial won!' : 'Trial lost'}</h2>${lines.map((l) => `<p>${l}</p>`).join('')}${lootList(r.items || [])}<div class="row"><button data-a="ok">Back to Jobs</button></div>`, () => { hideModal(); endShift(); setTab('jobs'); });
  }

  // ------------------------------------------------------------------ Workshop: rooms
  const FORGE = { picked: [] }, ENCH = { target: null };
  const gemPl = (ty) => ({ ruby: 'Rubies', topaz: 'Topazes' })[ty] || D.STONES[ty].name + 's';
  const hhmm = (ms) => { const s2 = Math.max(0, Math.ceil(ms / 1000)), h = Math.floor(s2 / 3600), m = Math.floor((s2 % 3600) / 60), sec = s2 % 60; return h ? `${h}h ${String(m).padStart(2, '0')}m` : `${m}:${String(sec).padStart(2, '0')}`; };
  function roomHead(k) {
    const R = D.ROOMS[k], l = M.roomLvl(save, k), c = M.roomCost(save, k);
    return `<div class="room-h"><b>${R.icon} ${R.name}</b><span>${l ? `level ${l}` : 'not built'}</span>${c != null ? `<button class="act" data-a="build" data-k="${k}" ${save.brass >= c ? '' : 'disabled'}>${l ? 'Upgrade' : 'Build'} · ${c} 🔩</button>` : '<span class="maxed">fully built</span>'}</div>
      <p class="room-d">${l ? R.desc.slice(0, l).map((d) => '✓ ' + d).join('<br>') : ''}${c != null ? `${l ? '<br>' : ''}<span class="next">Next: ${R.desc[l]}</span>` : ''}</p>`;
  }
  function fuseCandidates(rar) { return M.invItems(save).filter((it) => it.rarity === rar && !it.vault).sort((a, b) => a.ilvl - b.ilvl || a.affixes.length - b.affixes.length); }
  function renderWorkshop() {
    const now = Date.now(), ms = save.mainspring, fl = M.roomLvl(save, 'forge');
    const pickedIts = FORGE.picked.map((id) => save.items[id]).filter(Boolean); FORGE.picked = pickedIts.map((it) => it.id);
    const fuseErr = M.canFuse(save, FORGE.picked);
    const spare = M.invItems(save).filter((it) => !it.vault && it.rarity === 'common');
    const gemList = pouchList(), troops = Object.values(save.items).filter((it) => D.GEARS[it.base].fam === 'unit').sort((a, b) => RORD.indexOf(a.rarity) - RORD.indexOf(b.rarity)), tgt = save.items[ENCH.target];
    page.innerHTML = `<h2>Workshop</h2><p class="arm-sub">Rooms stay built through Overhauls. Build and upgrade them with brass.</p>
      <section class="room">${roomHead('merge')}
        <p class="room-d">Three junk gears of one rarity become one random gear of the next: Common → Magic → Rare → Rare, Set or <b style="color:#ff8a1f">Legendary</b>. Picking here skips the bench and the Vault; to merge gears off your bench, select them in the Armory.</p>
        <div class="chips">${['common', 'magic', 'rare'].map((rr) => { const n = fuseCandidates(rr).length; return `<button class="chip" data-a="auto3" data-r="${rr}" ${n >= 3 ? '' : 'disabled'}>Pick 3 ${rarity(rr).name} (${n})</button>`; }).join('')}</div>
        <div class="fuse">${[0, 1, 2].map((i) => { const it = pickedIts[i]; return it ? `<button class="slot" data-a="unpick" data-id="${it.id}" style="border-color:${rarity(it.rarity).color}">${iconURL(it) ? `<img src="${iconURL(it)}">` : roleOf(it).glyph}<small>${it.name}</small></button>` : '<span class="slot empty">+</span>'; }).join('')}
          <button class="act" data-a="fuse" ${fuseErr ? 'disabled' : ''}>⇧ Merge</button></div>
        <p class="room-d">${fuseErr && FORGE.picked.length ? fuseErr : 'Tip: in the Armory, select three gears of one rarity, or tap a gear and “Send to the Merge Workshop”.'}</p>
        <h3>Gems</h3>
        ${gemList.length ? `<ul class="gems">${gemList.map((p, i) => `<li><span style="color:${D.STONES[p.ty].color}">◆</span><b>${D.STONE_TIERS[p.ti]} ${D.STONES[p.ty].name}</b> ×${p.n}${p.ti < 4 ? `<button class="act small" data-a="gem3" data-i="${i}" ${p.n >= 3 && save.brass >= M.combineCostJ(save, p.ti) ? '' : 'disabled'}>3 → 1 ${D.STONE_TIERS[p.ti + 1]} (${M.combineCostJ(save, p.ti)}🔩)</button>` : ''}</li>`).join('')}</ul>
          <div class="chips">${D.STONE_TIERS.slice(0, 4).map((tn, ti) => { const n = gemList.filter((p) => p.ti === ti).reduce((a, p) => a + p.n, 0); return n >= 3 ? `<button class="act small" data-a="gemmix" data-t="${ti}" ${save.brass >= M.mixCost(ti) ? '' : 'disabled'}>Mix any 3 ${tn} → random ${D.STONE_TIERS[ti + 1]} (${M.mixCost(ti)}🔩)</button>` : ''; }).join('')}</div>`
          : '<p class="room-d">No gems yet. Elites, bosses, Scrap Gremlins, Bounties and the Research desk give them.</p>'}
        <h3>Enchanting</h3>
        <p class="room-d">Give a troop gear one enchantment by spending two gems of a kind. Better gems, stronger magic. A new enchantment replaces the old.</p>
        <div class="chips">${troops.map((it) => `<button class="chip ${ENCH.target === it.id ? 'on' : ''}" data-a="etarget" data-id="${it.id}" style="border-color:${rarity(it.rarity).color}">${roleOf(it).glyph} ${it.name}${it.ench ? ` ${D.ENCHANTS[it.ench[0]].icon}` : ''}</button>`).join('') || '<span class="room-d">No troop gears.</span>'}</div>
        ${tgt ? `<p class="room-d">${tgt.name}: ${tgt.ench ? `<b style="color:${D.ENCHANTS[tgt.ench[0]].color}">${D.ENCHANTS[tgt.ench[0]].icon} ${D.ENCHANTS[tgt.ench[0]].name}</b> (${D.ENCHANTS[tgt.ench[0]].txt(1 + 0.5 * tgt.ench[1])})` : 'not enchanted'}</p>
          <div class="enchs">${Object.entries(D.ENCHANTS).map(([ty, E]) => { const tiers = (save.pouch[ty] || []).map((n, ti) => [n, ti]).filter(([n]) => n >= 2); const ti = tiers.length ? tiers[tiers.length - 1][1] : 0; const err = M.canEnchant(save, tgt.id, ty, ti);
            return `<button class="ench" data-a="enchant" data-ty="${ty}" data-ti="${ti}" ${err ? 'disabled' : ''} style="--ec:${E.color}"><b>${E.icon} ${E.name}</b><small>${E.txt(1 + 0.5 * ti)}</small><i>${tiers.length ? `2 ${D.STONE_TIERS[ti]} ${gemPl(ty)} + ${M.enchantCost(ti)}🔩` : `needs 2 ${gemPl(ty)}`}</i></button>`; }).join('')}</div>` : '<p class="room-d">Pick a troop gear above.</p>'}
      </section>
      <section class="room">${roomHead('forge')}
        <h3>Feed the Mainspring</h3>
        <p class="room-d">Spare gears melt into the Mainspring: each level is +2% speed for the whole train. Level ${ms.l} / ${M.msMax(save)} (+${2 * ms.l}% RPM). Resets on Overhaul.</p>
        <div class="bar"><i style="width:${Math.min(100, (100 * ms.xp) / M.msNeed(ms.l))}%"></i></div>
        <div class="chips"><button class="act" data-a="feedcommons" ${spare.length ? '' : 'disabled'}>Feed all spare Commons (${spare.length})</button><button class="act" data-a="feedpicked" ${FORGE.picked.length ? '' : 'disabled'}>Feed the ${FORGE.picked.length || ''} picked in the Merge Workshop</button></div>
        ${fl >= 2 ? '<p class="room-d">Reforge: open any non-legendary gear\'s card and pick a new shape from its family.</p>' : ''}
      </section>
      <section class="room">${roomHead('research')}
        ${M.roomLvl(save, 'research') ? `${save.research.slots.map((x, i) => { const R = D.RESEARCH[x.k], done = now >= x.end, f = Math.min(1, (now - x.start) / (x.end - x.start)); return `<div class="proj"><b>${R.icon} ${R.name}</b><div class="bar"><i style="width:${f * 100}%"></i></div><span>${done ? 'Done!' : hhmm(x.end - now) + ' left'}</span>${done ? `<button class="act" data-a="claimR" data-i="${i}">Claim</button>` : ''}</div>`; }).join('')}
          ${save.research.slots.length < M.researchSlots(save) ? `<div class="projs">${Object.entries(D.RESEARCH).map(([k, R]) => `<button class="pbtn" data-a="startR" data-k="${k}" ${M.roomLvl(save, 'research') >= R.lvl ? '' : 'disabled'}><b>${R.icon} ${R.name}</b><small>${R.desc}</small><i>${(M.researchHours(save, k) * 60).toFixed(0)} min</i></button>`).join('')}</div>` : '<p class="room-d">Every desk is busy. Projects keep running while the app is closed.</p>'}` : ''}
      </section>
      <section class="room">${roomHead('jeweller')}
        ${M.roomLvl(save, 'jeweller') ? '<div class="chips"><button class="act" data-a="pouch">◆ Open the stone pouch</button></div>' : ''}
      </section>
      <section class="room"><div class="room-h"><b>🏆 Trophy Wall</b><span>${Object.keys(save.trophies).length} trophies</span></div>
        <p class="room-d">${Object.entries(D.TROPHIES).map(([k, T]) => { const h = save.trophies[k] || 0; return `${h ? '🏆' : '·'} <b>${T.name}</b>: ${h ? `Heat ${h}, ${T.txt(h)}` : 'beat this boss in a Boss Trial (Jobs)'}`; }).join('<br>')}</p>
      </section>`;
    page.onclick = (e) => {
      const b = e.target.closest('button'); if (!b) return; const a = b.dataset.a; let err = '';
      if (a === 'build') { err = M.buildRoom(save, b.dataset.k); if (!err) { sfx.buy(); toast(`${D.ROOMS[b.dataset.k].name} level ${M.roomLvl(save, b.dataset.k)}!`); } }
      if (a === 'auto3') FORGE.picked = fuseCandidates(b.dataset.r).slice(0, 3).map((it) => it.id);
      if (a === 'unpick') FORGE.picked = FORGE.picked.filter((id) => id !== +b.dataset.id);
      if (a === 'fuse') { const out = M.fuse(save, FORGE.picked); err = out.err; if (!err) { FORGE.picked = []; const it = save.items[out.id]; sfx.loot(it.rarity); showModal(`<h2>Merged!</h2>${lootList([out.id])}<button data-a="ok">Nice</button>`, hideModal); } }
      if (a === 'feedcommons' || a === 'feedpicked') { const ids = a === 'feedpicked' ? FORGE.picked : spare.map((it) => it.id); const r2 = M.feedMainspring(save, ids); if (r2.err) { err = r2.err; } else { FORGE.picked = []; sfx.merge(); toast(`Fed ${r2.fed} gears${r2.ups ? `: Mainspring level ${save.mainspring.l}!` : ''}`); } }
      if (a === 'startR') { err = M.startResearch(save, b.dataset.k, Date.now()); if (!err) sfx.tick(); }
      if (a === 'claimR') { const out = M.claimResearch(save, +b.dataset.i, Date.now()); err = out.err; if (!err) { sfx.loot('rare'); toast(out.scrap ? `+${fmt(out.scrap)} scrap` : out.bp ? '+1 Blueprint' : out.stone ? `A Flawed ${D.STONES[out.stone].name}` : out.item ? `${save.items[out.item] ? save.items[out.item].name : 'A gear'}!` : 'Study done: +25% scrap for 5 Shifts'); } }
      if (a === 'pouch') { openPouch(); return; }
      if (a === 'gem3') { const p = gemList[+b.dataset.i]; err = M.combineStones(save, p.ty, p.ti); if (!err) { play('socket', 0.8) || sfx.merge(); toast(`A ${D.STONE_TIERS[p.ti + 1]} ${D.STONES[p.ty].name}!`); } }
      if (a === 'gemmix') { const out = M.mergeGemsAny(save, +b.dataset.t); err = out.err; if (!err) { play('socket', 0.8) || sfx.merge(); toast(`A ${D.STONE_TIERS[+b.dataset.t + 1]} ${D.STONES[out.type].name}!`); } }
      if (a === 'etarget') ENCH.target = +b.dataset.id;
      if (a === 'enchant') { err = M.enchant(save, ENCH.target, b.dataset.ty, +b.dataset.ti); if (!err) { sfx.loot('rare'); toast(`${D.ENCHANTS[b.dataset.ty].icon} ${D.ENCHANTS[b.dataset.ty].name}!`); } }
      if (err) { toast(err); sfx.nope(); }
      persist(); refresh();
    };
  }
  setInterval(() => { if (tab === 'workshop' && !shift && sheet.hidden && modal.hidden && save.research.slots.length) renderWorkshop(); }, 1000);

  // ------------------------------------------------------------------ Jobs: Daily Contract, Bounties, Expeditions, Boss Trials
  const JOB = { view: 'main', heat: {} };
  const BOSSNAME = (d) => M.zoneOf(d).names.boss + (d > 30 ? ` (Depth ${d})` : '');
  const NODE = { fight: ['⚔', 'Fight'], elite: ['☠', 'Elite fight'], treasure: ['🎁', 'Treasure'], shop: ['🛒', 'Tinker\'s stall'], rest: ['🛠', 'Repair bench'], event: ['❓', 'Something odd'], boss: ['👑', 'Boss'] };
  function renderJobs() {
    if (JOB.view === 'map' && save.exp && !save.exp.over) return renderMap();
    const c = M.dailyContract(save, today()), L = M.ensureBounties(save), E = save.exp, bosses = M.trialBosses(save);
    const rw = (b) => ({ brass: `${b.amount} 🔩`, gear: 'a rare+ gear', stone: 'a Flawed Cogstone', bp: '1 📜 Blueprint' })[b.reward];
    page.innerHTML = `<h2>Jobs</h2>
      <section class="room"><div class="room-h"><b>📜 Daily Contract</b><span>${c.done ? 'done today ✓' : 'available'}</span></div>
        <p class="room-d"><b>${c.text}</b>. Depth ${c.depth}. Win it for a chest: a rare gear, another gear, a stone and 30 brass.</p>
        <div class="chips"><button class="act" data-a="daily" ${c.done ? 'disabled' : ''}>Take the job</button></div></section>
      <section class="room"><div class="room-h"><b>📋 Bounties</b><span>progress from any Shift</span></div>
        ${L.map((b) => `<div class="bounty"><b>${b.text}</b><div class="bar"><i style="width:${(100 * b.progress) / b.n}%"></i></div><span>${b.progress}/${b.n} · reward: ${rw(b)}</span>
          ${b.progress >= b.n ? `<button class="act" data-a="claimB" data-id="${b.id}">Claim</button>` : `<button class="act small" data-a="rerollB" data-id="${b.id}" ${save.bounties.rerollDay === today() ? 'disabled' : ''}>↻</button>`}</div>`).join('')}
        <p class="room-d">One free ↻ reroll a day.</p></section>
      <section class="room"><div class="room-h"><b>🗺 Expedition</b><span>${E && !E.over ? `row ${E.at ? E.at[0] + 1 : 1} of 7` : 'none under way'}</span></div>
        <p class="room-d">A branching route of fights, elites, treasure, a stall, repairs and odd events, ending at a boss. Your door's damage carries from node to node; if it breaks, the Expedition ends (you keep the loot). Win the boss for a Blueprint and a legendary-or-set chest. Doesn't affect your depth progress.</p>
        <div class="chips">${E && !E.over ? `<button class="act" data-a="map">Open the map</button><button class="act small" data-a="abandon">Abandon</button>` : `<button class="act" data-a="startE">Set out (Depth ${Math.max(1, save.unlocked - 1)})</button>`}</div></section>
      <section class="room"><div class="room-h"><b>👑 Boss Trials</b><span>${bosses.length ? `${bosses.length} boss${bosses.length > 1 ? 'es' : ''}` : 'beat a boss first'}</span></div>
        <p class="room-d">Rematch a beaten boss at higher Heat. Each Heat you clear is a permanent trophy bonus; from Heat 3 the boss may drop its own legendary.</p>
        ${bosses.map((d) => { const open = M.trialHeatOpen(save, d), h = Math.min(open, JOB.heat[d] || open), T = D.TROPHIES[M.trophyKey(d)]; return `<div class="bounty"><b>${BOSSNAME(d)}</b><span>Trophy: ${T.name}, ${save.trophies[M.trophyKey(d)] ? `Heat ${save.trophies[M.trophyKey(d)]}` : 'none yet'}</span>
          <div class="heat"><button class="act small" data-a="heat" data-d="${d}" data-v="-1">−</button><b>Heat ${h}</b><button class="act small" data-a="heat" data-d="${d}" data-v="1" ${h >= open ? 'disabled' : ''}>+</button><button class="act" data-a="trial" data-d="${d}" data-h="${h}">Challenge</button></div>
          <small>${D.HEAT.slice(1, h + 1).filter(Boolean).join(' · ')}</small></div>`; }).join('')}</section>`;
    page.onclick = (e) => {
      const b = e.target.closest('button'); if (!b) return; const a = b.dataset.a; let err = '';
      if (a === 'daily') return dailyPrompt();
      if (a === 'claimB') { const out = M.claimBounty(save, +b.dataset.id); err = out.err; if (!err) { sfx.loot('rare'); toast(out.brass ? `+${out.brass} brass` : out.bp ? '+1 Blueprint' : out.stone ? `A ${D.STONES[out.stone].name}` : 'A new gear in your drawers'); } }
      if (a === 'rerollB') { err = M.rerollBounty(save, +b.dataset.id, today()); }
      if (a === 'startE') { err = M.startExpedition(save, today()); if (!err) { JOB.view = 'map'; sfx.buy(); } }
      if (a === 'map') JOB.view = 'map';
      if (a === 'abandon') { if (!b.dataset.sure) { b.dataset.sure = 1; b.textContent = 'Tap to give up'; return; } M.abandonExpedition(save); }
      if (a === 'heat') { const d = +b.dataset.d; JOB.heat[d] = Math.max(1, Math.min(M.trialHeatOpen(save, d), (JOB.heat[d] || M.trialHeatOpen(save, d)) + +b.dataset.v)); }
      if (a === 'trial') { const d = +b.dataset.d, h = +b.dataset.h; persist(); return startShift({ ...M.trialOpts(save, d, h), ctx: { trial: { d, heat: h } } }); }
      if (err) { toast(err); sfx.nope(); }
      persist(); refresh();
    };
  }
  function renderMap() {
    const E = save.exp, ch = M.expChoices(save);
    page.innerHTML = `<h2>Expedition</h2><p class="arm-sub">Depth ${E.depth} · door ${Math.round(E.integrity * 100)}% · 🎟 ${E.coins} tickets${E.buffs.rpm ? ` · +${Math.round(E.buffs.rpm * 100)}% RPM` : ''}${E.buffs.dmg ? ` · +${Math.round(E.buffs.dmg * 100)}% damage` : ''}</p>
      <div class="bar"><i style="width:${E.integrity * 100}%;background:${E.integrity > 0.35 ? '#7fd36b' : '#ff5a3a'}"></i></div>
      <div class="map">${E.rows.slice().reverse().map((row) => `<div class="mrow">${row.map((nd) => { const here = E.at && E.at[0] === nd.y && E.at[1] === nd.x, can = ch.includes(nd); return `<button class="node ${nd.done ? 'done' : ''} ${here ? 'here' : ''} ${can ? 'can' : ''}" data-a="node" data-y="${nd.y}" data-x="${nd.x}" ${can ? '' : 'disabled'}><b>${NODE[nd.type][0]}</b><small>${NODE[nd.type][1]}</small></button>`; }).join('')}</div>`).join('')}</div>
      <div class="chips"><button class="act" data-a="back">‹ Jobs</button></div>`;
    drawPaths(E);
    page.onclick = (e) => {
      const b = e.target.closest('button'); if (!b) return; const a = b.dataset.a;
      if (a === 'back') { JOB.view = 'main'; renderJobs(); return; }
      if (a === 'node') { const err = M.expEnter(save, +b.dataset.y, +b.dataset.x); if (err) { toast(err); return; } persist(); openExpNode(save.exp.rows[+b.dataset.y][+b.dataset.x]); }
    };
  }
  function drawPaths(E) { // lines between nodes, so the route ahead is visible
    const map = page.querySelector('.map'); if (!map) return; const box = map.getBoundingClientRect();
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); svg.setAttribute('class', 'paths'); svg.setAttribute('width', box.width); svg.setAttribute('height', box.height);
    const at = (y, x) => { const el = map.querySelector(`.node[data-y="${y}"][data-x="${x}"]`); if (!el) return null; const r = el.getBoundingClientRect(); return [r.left - box.left + r.width / 2, r.top - box.top + r.height / 2]; };
    for (const row of E.rows) for (const nd of row) for (const nx of nd.next || []) { const a = at(nd.y, nd.x), b = at(nd.y + 1, nx); if (!a || !b) continue; const ln = document.createElementNS('http://www.w3.org/2000/svg', 'line'); ln.setAttribute('x1', a[0]); ln.setAttribute('y1', a[1]); ln.setAttribute('x2', b[0]); ln.setAttribute('y2', b[1]); ln.setAttribute('stroke', nd.done ? '#7fd36b' : '#6b5a44'); ln.setAttribute('stroke-width', nd.done ? 3 : 2); ln.setAttribute('stroke-dasharray', nd.done ? '' : '4 4'); svg.appendChild(ln); }
    map.prepend(svg);
  }
  function openExpNode(nd) {
    if (['fight', 'elite', 'boss'].includes(nd.type)) { const o = M.expShiftOpts(save); return startShift({ ...o, ctx: { exp: true } }); }
    const E = save.exp, done = (out) => { persist(); refresh(); const loot = out && out.items ? lootList(out.items) : ''; showModal(`<h2>${NODE[nd.type][1]}</h2>${out && out.brass ? `<p>+${out.brass} brass</p>` : ''}${loot}<p>Door ${Math.round(E.integrity * 100)}% · 🎟 ${E.coins}</p><button data-a="ok">Onward</button>`, () => { hideModal(); renderMap(); }); };
    if (nd.type === 'treasure' || nd.type === 'rest') { const out = M.expResolve(save); sfx.loot(nd.type === 'treasure' ? 'rare' : 'magic'); return done(out); }
    if (nd.type === 'shop') {
      const shop = () => showModal(`<h2>Tinker's stall</h2><p>🎟 ${E.coins} tickets · door ${Math.round(E.integrity * 100)}%</p>
        <div class="row"><button class="alt" data-a="repair">Repair +50% (2🎟)</button><button class="alt" data-a="oil">Oil +15% RPM (3🎟)</button></div><div class="row"><button class="alt" data-a="gear">A rare gear (4🎟)</button><button data-a="leave">Move on</button></div>`, (a) => {
        const out = M.expResolve(save, a); if (out.err) { toast(out.err); sfx.nope(); return; } if (a === 'leave') { hideModal(); persist(); renderMap(); return; } sfx.buy(); if (out.items && out.items.length) toast(save.items[out.items[0]] ? save.items[out.items[0]].name : 'A gear'); persist(); hideModal(); setTimeout(shop, 140); });
      return shop();
    }
    if (nd.type === 'event') { const ev = M.expEvent(nd); showModal(`<h2>${ev.title}</h2><p>${ev.text}</p>${ev.choices.map((c, i) => `<button data-a="${i}" class="${i ? '' : 'alt'}" style="margin-top:6px">${c.label}</button>`).join('')}`, (a) => { hideModal(); const out = M.expResolve(save, +a); setTimeout(() => done(out), 140); }); }
  }

  // ------------------------------------------------------------------ Upgrade tree + Blueprints
  const NODE_SP = 96;
  const treeNodePx = (n) => ({ x: W / 2 + treePan.x + n.x * NODE_SP, y: H / 2 + 20 + treePan.y + n.y * NODE_SP });
  const bpNodePx = (i) => { const a = (i / D.BLUEPRINTS.length) * TAU - Math.PI / 2, r = Math.min(W, H) * 0.32; return { x: W / 2 + Math.cos(a) * r, y: H / 2 + 30 + Math.sin(a) * r }; };
  function showBp() { return save.overhauls > 0 || save.blueprints > 0 || Object.values(save.bp || {}).some((l) => l > 0); }
  function drawTree(t) {
    g.fillStyle = '#1d1712'; g.fillRect(0, 0, W, H);
    g.strokeStyle = '#2a2019'; g.lineWidth = 1; for (let x = (treePan.x % 37) - 37; x < W; x += 37) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H); g.stroke(); }
    if (treeView === 'up') {
      for (const n of D.TREE) for (const rq of n.req) { const p = D.TREE.find((m) => m.id === rq); const a = treeNodePx(p), b = treeNodePx(n); g.strokeStyle = (save.tree[rq] || 0) > 0 ? '#a37b2c' : '#3a2c21'; g.lineWidth = 3; g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke(); }
      for (const n of D.TREE) {
        const p = treeNodePx(n), l = save.tree[n.id] || 0, open = M.nodeOpen(save, n), can = M.canBuyNode(save, n.id) === '', maxed = l >= n.max;
        if (p.x < -40 || p.x > W + 40 || p.y < -40 || p.y > H + 40) continue;
        g.fillStyle = maxed ? '#6b4f1c' : open ? '#3a2c21' : '#1f1813'; g.beginPath(); g.arc(p.x, p.y, 25, 0, TAU); g.fill();
        g.strokeStyle = can ? '#ffe28a' : maxed ? '#d4a94e' : open ? '#6b5a44' : '#2f251c'; g.lineWidth = can ? 3 + Math.sin(t * 4) : 2; g.stroke();
        if (l && !maxed) { g.strokeStyle = '#d4a94e'; g.lineWidth = 3; g.beginPath(); g.arc(p.x, p.y, 29, -Math.PI / 2, -Math.PI / 2 + (l / n.max) * TAU); g.stroke(); }
        g.globalAlpha = open ? 1 : 0.35; const ic = art('icon-' + n.id);
        if (ic) g.drawImage(ic, p.x - 23, p.y - 23, 46, 46); else { g.fillStyle = '#f3e6c6'; g.font = '20px system-ui'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(n.icon, p.x, p.y + 1); g.textBaseline = 'alphabetic'; }
        g.globalAlpha = 1; g.textAlign = 'center';
        g.fillStyle = open ? '#f3e6c6' : '#7a6a52'; g.font = '800 10px Nunito, system-ui'; g.fillText(n.name, p.x, p.y + 39);
        g.fillStyle = can ? '#ffe28a' : '#a8957a'; g.font = '700 9px Nunito, system-ui';
        if (n.id !== 'root') g.fillText(maxed ? 'MAX' : open ? `${l}/${n.max} · ${fmt(M.nodeCost(n, l))}` : '🔒 locked', p.x, p.y + 50);
        if (sel === 'node:' + n.id) { g.strokeStyle = '#fff'; g.lineWidth = 2; g.beginPath(); g.arc(p.x, p.y, 32, 0, TAU); g.stroke(); }
      }
    } else {
      D.BLUEPRINTS.forEach((b, i) => {
        const p = bpNodePx(i), l = save.bp[b.id] || 0, maxed = l >= b.max, c = M.nodeCost(b, l), can = !maxed && save.blueprints >= c;
        g.fillStyle = maxed ? '#2f4a33' : '#24302a'; g.beginPath(); g.arc(p.x, p.y, 27, 0, TAU); g.fill();
        g.strokeStyle = can ? '#7fe0a0' : '#3c5a44'; g.lineWidth = can ? 3 : 2; g.stroke();
        const bic = art('icon-' + b.id); g.textAlign = 'center';
        if (bic) g.drawImage(bic, p.x - 25, p.y - 25, 50, 50); else { g.fillStyle = '#e9f5ec'; g.font = '20px system-ui'; g.textBaseline = 'middle'; g.fillText(b.icon, p.x, p.y + 1); g.textBaseline = 'alphabetic'; }
        g.fillStyle = '#9fc7a8'; g.font = '800 10px Nunito, system-ui'; g.fillText(maxed ? 'MAX' : `${l}/${b.max} · ${c}📜`, p.x, p.y + 41);
      });
      g.fillStyle = '#9fc7a8'; g.font = '900 15px Cinzel, serif'; g.textAlign = 'center'; g.fillText(`${save.blueprints} Blueprints`, W / 2, H / 2 + 34); g.font = '700 11px Nunito'; g.fillText('kept through Overhauls', W / 2, H / 2 + 52);
    }
    // top controls
    g.textBaseline = 'middle';
    const tabsW = showBp() ? 220 : 0;
    if (showBp()) { for (const [i, v, lbl] of [[0, 'up', 'Upgrades'], [1, 'bp', 'Blueprints']]) { g.fillStyle = treeView === v ? '#d4a94e' : '#00000060'; g.beginPath(); g.roundRect(10 + i * 110, 10, 104, 32, 10); g.fill(); g.fillStyle = treeView === v ? '#241a12' : '#f3e6c6'; g.font = '800 13px Nunito'; g.textAlign = 'center'; g.fillText(lbl, 62 + i * 110, 27); } }
    const gain = M.overhaulGain(save);
    if (gain) { g.fillStyle = '#7a2a18'; g.beginPath(); g.roundRect(W - 150, 10, 140, 32, 10); g.fill(); g.strokeStyle = '#ff9a6a'; g.lineWidth = 2; g.stroke(); g.fillStyle = '#fff'; g.font = '900 13px Cinzel, serif'; g.textAlign = 'center'; g.fillText(`Overhaul +${gain}📜`, W - 80, 27); }
    else if (treeView === 'up') { g.fillStyle = '#6b5a44'; g.font = '700 11px Nunito'; g.textAlign = 'right'; g.fillText('drag to look around', W - 12, 27); }
    g.textBaseline = 'alphabetic'; void tabsW;
  }
  let tdrag = null;
  function treeDown(x, y) { tdrag = { x, y, sx: x, sy: y, px: treePan.x, py: treePan.y, moved: false }; }
  function treeMove(x, y) { if (!tdrag) return; if (Math.hypot(x - tdrag.sx, y - tdrag.sy) > 8) tdrag.moved = true; if (tdrag.moved && treeView === 'up') { treePan.x = tdrag.px + x - tdrag.sx; treePan.y = tdrag.py + y - tdrag.sy; } }
  function treeUp(x, y) {
    const d = tdrag; tdrag = null; if (!d || d.moved) return;
    if (showBp() && y < 44 && x < 230) { treeView = x < 120 ? 'up' : 'bp'; closeSheet(); return; }
    if (M.overhaulGain(save) && y < 44 && x > W - 152) { overhaulPrompt(); return; }
    if (treeView === 'up') { const n = D.TREE.find((m) => { const p = treeNodePx(m); return Math.hypot(p.x - x, p.y - y) < 32; }); if (n) openNode(n); else closeSheet(); }
    else { const i = D.BLUEPRINTS.findIndex((b, j) => { const p = bpNodePx(j); return Math.hypot(p.x - x, p.y - y) < 32; }); if (i >= 0) openBlueprint(D.BLUEPRINTS[i]); else closeSheet(); }
  }
  function openNode(n) {
    sel = 'node:' + n.id; const l = save.tree[n.id] || 0, err = M.canBuyNode(save, n.id), c = M.nodeCost(n, l);
    const reqs = n.req.map((id) => D.TREE.find((m) => m.id === id).name).join(' or ');
    sheet.innerHTML = `<button class="x" data-a="close">✕</button><h3>${n.icon} ${n.name}</h3><div class="sub">Level ${l} of ${n.max}</div>
      <ul><li>${n.desc(l, save.tree)}</li></ul>
      ${err === 'locked' ? `<div class="warn">Needs ${reqs} first.</div>` : ''}
      <div class="acts">${n.id === 'root' ? '' : `<button class="pri" data-a="buy" ${err ? 'disabled' : ''}>${err === 'maxed' ? 'Maxed' : `Buy for ${fmt(c)} ⛭`}</button>`}</div>
      ${err === 'not enough scrap' ? `<div class="sub" style="margin-top:6px">You have ${fmt(save.scrap)} scrap.</div>` : ''}`;
    sheet.hidden = false;
    sheet.onclick = (e) => { const b = e.target.closest('button'); if (!b) return; if (b.dataset.a === 'close') return closeSheet();
      if (b.dataset.a === 'buy') { const er = M.buyNode(save, n.id); if (er) { toast(er); sfx.nope(); } else { sfx.buy(); persist(); refresh(); } openNode(n); } };
  }
  function openBlueprint(b) {
    const l = save.bp[b.id] || 0, c = M.nodeCost(b, l), maxed = l >= b.max;
    sheet.innerHTML = `<button class="x" data-a="close">✕</button><h3>${b.icon} ${b.name}</h3><div class="sub">Blueprint · level ${l} of ${b.max}</div><ul><li>${b.desc(l)}</li></ul>
      <div class="acts"><button class="pri" data-a="buy" ${maxed || save.blueprints < c ? 'disabled' : ''}>${maxed ? 'Maxed' : `Buy for ${c} 📜`}</button></div>`;
    sheet.hidden = false;
    sheet.onclick = (e) => { const t = e.target.closest('button'); if (!t) return; if (t.dataset.a === 'close') return closeSheet();
      const er = M.buyBlueprint(save, b.id); if (er) { toast(er); sfx.nope(); } else { sfx.buy(); persist(); refresh(); } openBlueprint(b); };
  }
  function overhaulPrompt() {
    const gain = M.overhaulGain(save), vault = Object.values(save.items).filter((it) => it.vault);
    showModal(`<h2>Overhaul?</h2><p>Strip the workshop back to the studs for <b>${gain} Blueprints</b> (permanent upgrades).</p>
      <p>You lose: scrap, brass, the upgrade tree, depth progress, and every gear not in the Vault.</p>
      <p>You keep: Blueprints and ${vault.length ? vault.map((it) => it.name).join(', ') : 'nothing in the Vault yet (Vault a gear from its card first)'}.</p>
      <div class="row"><button class="alt" data-a="no">Not yet</button><button data-a="yes">Overhaul</button></div>`, (a) => {
      hideModal(); if (a !== 'yes') return;
      const er = M.overhaul(save); if (er) { toast(er); return; }
      sfx.win(); treeView = 'bp'; invOrder = []; persist(); refresh(); toast(`+${gain} Blueprints. Spend them, then start again!`);
    });
  }

  // ------------------------------------------------------------------ Codex (DOM page)
  // ------------------------------------------------------------------ Armory: every gear in one place
  const ARM = { fam: 'all', rar: 'any', where: 'all', sort: 'rarity', select: false, picked: new Set() };
  const iconCache = {};
  function iconURL(it) {
    const k = [it.base, it.size, it.rarity, artVer].join('|'); if (iconCache[k]) return iconCache[k];
    if (window.CogGL && window.CogGL.ready) { try { return (iconCache[k] = window.CogGL.icon(iconSpec(it), 96).toDataURL()); } catch { /* fall through */ } }
    return null;
  }
  function armoryList() {
    const pw = (it) => { const P = M.gearPower(it, null, stats, {}); return P.fam === 'unit' ? Math.sqrt(P.hp * (P.dmg / P.every)) : (P.s || P.factor || P.yield || P.pull || 1) * 5; };
    return Object.values(save.items).filter((it) => {
      const f = D.GEARS[it.base].fam;
      if (ARM.fam !== 'all' && !(ARM.fam === 'other' ? f !== 'unit' && f !== 'spell' : f === ARM.fam)) return false;
      if (ARM.rar === 'magic+' && it.rarity === 'common') return false; if (ARM.rar === 'rare+' && !['rare', 'set', 'legendary'].includes(it.rarity)) return false; if (ARM.rar === 'special' && !['set', 'legendary'].includes(it.rarity)) return false;
      if (ARM.where === 'bench' && it.loc !== 'board') return false; if (ARM.where === 'drawers' && it.loc !== 'inv') return false;
      return true;
    }).sort((a, b) => ARM.sort === 'type' ? a.base.localeCompare(b.base) || b.rank - a.rank : ARM.sort === 'ilvl' ? b.ilvl - a.ilvl : ARM.sort === 'power' ? pw(b) - pw(a) : RORD.indexOf(a.rarity) - RORD.indexOf(b.rarity) || a.base.localeCompare(b.base));
  }
  function mergePlan() { // merge spare commons/magics into an identical gear; the better one always survives
    const plan = []; const used = new Set();
    const groups = {}; for (const it of Object.values(save.items)) { if (it.vault) continue; const k = it.base + '|' + it.size + '|' + it.rank; (groups[k] = groups[k] || []).push(it); }
    for (const list of Object.values(groups)) {
      list.sort((a, b) => RORD.indexOf(a.rarity) - RORD.indexOf(b.rarity) || b.affixes.length - a.affixes.length);
      const keep = list.filter((it) => !used.has(it.id)), donors = keep.filter((it) => it.rarity === 'common' || it.rarity === 'magic').reverse();
      for (const d of donors) { const t = keep.find((x) => x !== d && !used.has(x.id) && !used.has(d.id) && M.canMerge(save, d.id, x.id) === '' && RORD.indexOf(x.rarity) <= RORD.indexOf(d.rarity)); if (t) { plan.push([d.id, t.id]); used.add(d.id); used.add(t.id); } }
    }
    return plan;
  }
  function renderArmory() {
    const all = Object.values(save.items), list = armoryList(), plan = mergePlan(), inv = M.invItems(save).length;
    const chip = (grp, val, lbl) => `<button class="chip ${ARM[grp] === val ? 'on' : ''}" data-a="f" data-g="${grp}" data-v="${val}">${lbl}</button>`;
    const sv = [...ARM.picked].reduce((a, id) => a + (save.items[id] ? M.salvageValue(save, save.items[id], stats) : 0), 0);
    page.innerHTML = `
      <h2>Armory</h2>
      <p class="arm-sub">${all.length} gears · drawers ${inv}/${stats.invSlots} · ${all.length - inv} on the bench · Vault ${M.vaultCount(save)}/${stats.vault} · ◆ ${pouchList().reduce((a, p) => a + p.n, 0)} stones</p>
      <div class="chips">${chip('fam', 'all', 'All')}${chip('fam', 'unit', '⚔ Troops')}${chip('fam', 'spell', '✦ Spells')}${chip('fam', 'other', '⟳ Other')}</div>
      <div class="chips">${chip('rar', 'any', 'Any rarity')}${chip('rar', 'magic+', 'Magic+')}${chip('rar', 'rare+', 'Rare+')}${chip('rar', 'special', 'Set & Legendary')}</div>
      <div class="chips">${chip('where', 'all', 'Everywhere')}${chip('where', 'bench', 'On the bench')}${chip('where', 'drawers', 'In drawers')}
        <select data-a="sort"><option value="rarity">Sort: rarity</option><option value="type">Sort: type</option><option value="power">Sort: power</option><option value="ilvl">Sort: item level</option></select></div>
      <div class="chips">
        <button class="act" data-a="mergeall" ${plan.length ? '' : 'disabled'}>⇧ Merge duplicates${plan.length ? ` (${plan.length})` : ''}</button>
        <button class="act" data-a="select">${ARM.select ? 'Done selecting' : '☐ Select (salvage or merge)'}</button>
        <button class="act" data-a="pouch">◆ Stones</button>
      </div>
      ${ARM.select ? `<div class="selbar"><span>${ARM.picked.size} selected</span><button class="act" data-a="pickall">Select all shown (not vaulted)</button><button class="act danger" data-a="salv" ${ARM.picked.size ? '' : 'disabled'}>Salvage ${ARM.picked.size} for +${sv} 🔩</button>${(() => { const ids = [...ARM.picked]; const e = M.canFuse(save, ids); const r0 = ids.length ? save.items[ids[0]] : null; return ids.length === 3 ? `<button class="act" data-a="fuse3" ${e ? 'disabled' : ''}>⇧ ${e ? e : `Merge into a ${({ common: 'Magic', magic: 'Rare', rare: 'Rare, Set or Legendary' })[r0.rarity]} gear`}</button>` : '<span style="opacity:.7">Pick 3 of one rarity to merge them</span>'; })()}</div>` : ''}
      <div class="arm-grid">${list.map((it) => {
        const R = rarity(it.rarity), ro = roleOf(it), url = iconURL(it), picked = ARM.picked.has(it.id);
        return `<button class="gcard ${picked ? 'picked' : ''}" data-a="card" data-id="${it.id}" style="--rc:${R.color};--fc:${ro.color}">
          <span class="gi">${url ? `<img src="${url}" alt="">` : `<b>${ro.glyph}</b>`}</span>
          <span class="gn" style="color:${it.rarity === 'common' ? '#f3e6c6' : R.color}">${it.name}</span>
          <span class="gr">${R.name} · ${D.SIZES[it.size].name} · ilvl ${it.ilvl}${it.rank > 1 ? ` · rank ${it.rank}` : ''}</span>
          <span class="gw"><i style="color:${ro.color}">${ro.glyph} ${ro.short}</i>: ${summary(it)}</span>
          <span class="gb">${mergeable.has(it.id) ? '<em class="m">⇧ can merge</em>' : ''}${it.loc === 'board' ? '<em>on bench</em>' : ''}${it.vault ? '<em>🔒 vault</em>' : ''}${it.leg ? '<em class="l">★ legendary</em>' : ''}${(it.sockets || []).some(Boolean) ? '<em>◆</em>' : ''}</span>
        </button>`; }).join('') || '<p>No gears match.</p>'}</div>`;
    const sel2 = page.querySelector('select[data-a=sort]'); if (sel2) { sel2.value = ARM.sort; sel2.onchange = () => { ARM.sort = sel2.value; renderArmory(); }; }
    page.onclick = (e) => {
      const b = e.target.closest('button'); if (!b) return; const a = b.dataset.a;
      if (a === 'f') { ARM[b.dataset.g] = b.dataset.v; renderArmory(); return; }
      if (a === 'select') { ARM.select = !ARM.select; ARM.picked.clear(); renderArmory(); return; }
      if (a === 'pickall') { for (const it of armoryList()) if (!it.vault && it.loc !== 'board' && it.rarity !== 'legendary' && it.rarity !== 'set') ARM.picked.add(it.id); renderArmory(); toast('Picked everything shown except bench, vault, set and legendary gears'); return; }
      if (a === 'pouch') { openPouch(); return; }
      if (a === 'card') { const id = +b.dataset.id; if (ARM.select) { if (save.items[id] && save.items[id].vault) { toast('Vaulted gears can\'t be salvaged'); return; } ARM.picked.has(id) ? ARM.picked.delete(id) : ARM.picked.add(id); renderArmory(); } else openGear(id); return; }
      if (a === 'salv') { if (!b.dataset.sure) { b.dataset.sure = 1; b.textContent = `Tap again to salvage ${ARM.picked.size}`; return; } let n = 0; const before = save.brass; for (const id of ARM.picked) if (!M.salvage(save, id)) n++; ARM.picked.clear(); ARM.select = false; sfx.clank(); toast(`Salvaged ${n} gears for +${save.brass - before} brass`); persist(); refresh(); return; }
      if (a === 'fuse3') { const onB = [...ARM.picked].filter((id) => save.items[id] && save.items[id].loc === 'board').length; if (onB && !b.dataset.sure) { b.dataset.sure = 1; b.textContent = `Tap again: ${onB} ${onB > 1 ? 'are' : 'is'} on your bench`; return; } const out = M.fuse(save, [...ARM.picked]); if (out.err) { toast(out.err); sfx.nope(); return; } ARM.picked.clear(); ARM.select = false; const it = save.items[out.id]; sfx.loot(it.rarity); persist(); refresh(); showModal(`<h2>Merged!</h2>${lootList([out.id])}<button data-a="ok">Nice</button>`, hideModal); return; }
      if (a === 'mergeall') { let n = 0; for (const [src, dst] of mergePlan()) if (!M.mergeKeepBest(save, src, dst).err) n++; sfx.merge(); toast(`Merged ${n} pairs`); persist(); refresh(); return; }
    };
  }
  function renderCodex() {
    const st = { ...stats, ...M.trainStats(stats, board) }, odds = M.dropOdds(st), R = M.idleRates(save, st), cx = save.codex;
    const legs = Object.entries(D.LEGENDARIES), sets = Object.entries(D.SETS);
    page.innerHTML = `
      <h2>How to play</h2>
      <p>Build a gear train on the <b>Bench</b>: gears turn only if they mesh back to the Mainspring in the middle. Neighbouring gears turn opposite ways, so <b>three gears in a triangle jam</b>. Small gears spin fast, large ones slow but strong. Each turn of a troop gear sends out a soldier.</p>
      <p>In a <b>Shift</b>, hold your thumb on the field: the Wrench zaps enemies and scoops up scrap and gears. Circle your thumb on the gear strip at the bottom to wind the Mainspring for a burst. Break the gate (or beat the boss) to open the next depth; a win sweeps up everything left on the field.</p>
      <p>Spend scrap on <b>Upgrades</b>, salvage spare gears for brass to reroll and temper the good ones, and merge identical gears to rank them up. Clear Depth 10 to <b>Overhaul</b> for permanent Blueprints.</p>
      <h2>Drop odds</h2>
      <table><tr><td>Gear drop per kill (basic enemy)</td><td>${(odds.perKill * 100).toFixed(1)}%</td></tr>
      ${odds.rarities.map((r) => `<tr><td style="color:${r.color}">${r.name}</td><td>${r.pct.toFixed(1)}%</td></tr>`).join('')}
      <tr><td>Magic find</td><td>+${Math.round(st.mf * 100)}%</td></tr><tr><td>Tougher enemies drop more often (up to ×4); bosses drop 3.</td><td></td></tr></table>
      <h2>While you're away</h2>
      <table><tr><td>Collector gears</td><td>${R.collectors.toFixed(2)} scrap/s</td></tr>
      <tr><td>Night Shift ${st.nightEff ? `(${Math.round(st.nightEff * 100)}%)` : '(not yet built)'}</td><td>${R.night.toFixed(2)} scrap/s</td></tr>
      <tr><td>Paid while away${R.capped ? ' (capped below your active rate)' : ''}</td><td>${R.total.toFixed(2)} scrap/s</td></tr>
      <tr><td>Your recent active rate</td><td>${R.active ? R.active.toFixed(2) + ' scrap/s' : 'play a Shift first'}</td></tr>
      <tr><td>Builds for up to</td><td>${st.offlineCap / 3600} h</td></tr></table>
      <h2>Milestones (${Object.keys(save.milestones || {}).length}/${D.MILESTONES.length})</h2>
      <table>${D.MILESTONES.map((m) => `<tr><td class="${(save.milestones || {})[m.id] ? 'leg' : 'unk'}">${(save.milestones || {})[m.id] ? '🏅' : '○'} ${m.name}<br><span style="font-weight:600;font-size:12px;color:var(--dim)">${m.desc}</span></td><td style="font-size:12px">${m.brass ? m.brass + ' 🔩' : ''}${m.bp ? ' ' + m.bp + ' 📜' : ''}</td></tr>`).join('')}</table>
      <h2>Legendaries</h2>
      <table>${legs.map(([k, L]) => `<tr><td class="${cx[k] ? 'leg' : 'unk'}">${cx[k] ? L.name : '???'}</td><td style="font-weight:600;font-size:12px;text-align:left">${cx[k] ? L.power : 'Not found yet'}</td></tr>`).join('')}</table>
      <h2>Sets</h2>
      ${sets.map(([k, s]) => `<p><b style="color:#3fcf74">${s.name}</b>: ${Object.values(s.pieces).join(', ')}<br>${s.bonus.slice(2).join('<br>')}</p>`).join('')}
      <h2>Your workshop</h2>
      <table><tr><td>Shifts</td><td>${save.stats.shifts}</td></tr><tr><td>Kills</td><td>${fmt(save.stats.kills)}</td></tr><tr><td>Deepest cleared (ever)</td><td>${save.stats.deepest || save.best}</td></tr><tr><td>Deepest this Overhaul</td><td>${save.best}</td></tr>
      <tr><td>Bosses beaten</td><td>${save.stats.bossKills || 0}</td></tr><tr><td>Overhauls</td><td>${save.overhauls}</td></tr><tr><td>Time in Shifts</td><td>${dur(save.stats.playSecs)}</td></tr>
      <tr><td>Scrap earned</td><td>${fmt(save.stats.scrapTotal)}</td></tr></table>
      <h2>Settings</h2>
      <button data-a="mute">${save.settings.muted ? '🔇 Sound off' : '🔊 Sound on'}</button><button data-a="music">${save.settings.musicOff ? '🎵 Music off' : '🎵 Music on'}</button>
      <button data-a="export">Copy save</button><button data-a="import">Paste save</button>
      <button class="danger" data-a="reset">Start over</button>
      <p style="color:#6b5a44;font-size:12px">No ads, no energy, no shop. Saved on this device only.</p>`;
    page.onclick = async (e) => {
      const b = e.target.closest('button'); if (!b) return; const a = b.dataset.a;
      if (a === 'mute') { save.settings.muted = !save.settings.muted; persist(); music(); renderCodex(); }
      if (a === 'music') { save.settings.musicOff = !save.settings.musicOff; persist(); music(); renderCodex(); }
      if (a === 'export') { const txt = btoa(unescape(encodeURIComponent(JSON.stringify(save)))); try { await navigator.clipboard.writeText(txt); toast('Save copied to the clipboard'); } catch { showModal(`<h2>Your save</h2><p>Copy this text:</p><textarea style="width:100%;height:120px" readonly>${txt}</textarea><button data-a="ok">Done</button>`, hideModal); } }
      if (a === 'import') showModal(`<h2>Paste a save</h2><textarea id="imp" style="width:100%;height:120px"></textarea><div class="row"><button class="alt" data-a="no">Cancel</button><button data-a="yes">Load it</button></div>`, (r) => {
        if (r === 'yes') { try { const s = JSON.parse(decodeURIComponent(escape(atob($('#imp').value.trim())))); if (!s.items) throw 0; save = M.load(s, Date.now()); save.codex = save.codex || {}; persist(); invOrder = []; toast('Save loaded'); } catch { toast("That doesn't look like a Cogwright save"); } }
        hideModal(); refresh(); });
      if (a === 'reset') { if (!b.dataset.sure) { b.dataset.sure = 1; b.textContent = 'Tap again to wipe everything'; return; } try { localStorage.removeItem(KEY); } catch { /* ignore */ } save = M.newSave((Date.now() * 2654435761) >>> 0, Date.now()); save.codex = {}; invOrder = []; persist(); setTab('bench'); intro(); }
    };
  }

  // ------------------------------------------------------------------ modal
  const modalQ = []; // a second card waits for the first (e.g. welcome-back, then what's new)
  function showModal(html, onAct, queued) { if (!modal.hidden && !queued) { modalQ.push([html, onAct]); return; } modal.innerHTML = `<div class="card">${html}</div>`; modal.hidden = false; modal.onclick = (e) => { const b = e.target.closest('button'); if (b && b.dataset.a) onAct(b.dataset.a); }; }
  function hideModal() { modal.hidden = true; modal.innerHTML = ''; const n = modalQ.shift(); if (n) setTimeout(() => showModal(n[0], n[1], true), 120); }
  function welcomeBack(a) {
    if (!a || (!a.scrap && !a.items.length)) return;
    showModal(`<h2>Welcome back</h2><p>You were away ${dur(a.secs)}${a.capped ? ' (earnings capped)' : ''}.</p>
      <p>+${fmt(a.scrap)} scrap${a.items.length ? ` · ${a.items.length} gears from the Night Shift` : ''}${a.brass ? ` · +${a.brass} brass` : ''}</p>
      ${a.items.length ? `<div class="loot">${a.items.map((id) => save.items[id]).filter(Boolean).map((it) => `<div style="color:${rarity(it.rarity).color === '#b9b3a6' ? '#5a4c3a' : rarity(it.rarity).color}">⚙ ${it.name}</div>`).join('')}</div>` : ''}
      <button data-a="ok">To the bench</button>`, () => { hideModal(); refresh(); });
  }
  function intro() {
    showModal(`${ASSETS.img['bg-title'] ? `<img src="${ASSETS.img['bg-title']}" alt="" style="width:100%;border-radius:12px;aspect-ratio:4/3;object-fit:cover;object-position:50% 70%">` : ''}<h2>Cogwright</h2><p>The workshop is under siege. Build a gear train, wind the Mainspring, and send brass soldiers up the lane to break the enemy gate.</p>
      <p>1. <b>Drag</b> the spare gears from your drawers onto the bench, touching the turning ones.<br>2. Tap <b>Start Shift</b>.<br>3. <b>Hold your thumb</b> on the field to zap enemies and grab scrap.</p>
      <button data-a="ok">Let's build</button>`, () => { hideModal(); save.seenIntro = true; persist(); });
  }

  // ------------------------------------------------------------------ input routing
  const pos = (e) => { const r = cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  cv.addEventListener('pointerdown', (e) => { audio(); cv.setPointerCapture(e.pointerId); const [x, y] = pos(e); if (shift) shiftDown(e, x, y); else if (tab === 'bench') benchDown(x, y); else if (tab === 'tree') treeDown(x, y); });
  cv.addEventListener('pointermove', (e) => { const [x, y] = pos(e); if (shift) shiftMove(e, x, y); else if (tab === 'bench') benchMove(x, y); else if (tab === 'tree') treeMove(x, y); });
  const up = (e) => { const [x, y] = pos(e); if (shift) shiftUp(e); else if (tab === 'bench') benchUp(x, y); else if (tab === 'tree') treeUp(x, y); };
  cv.addEventListener('pointerup', up);
  cv.addEventListener('pointercancel', (e) => { if (shift) shiftUp(e); else { drag = null; tdrag = null; } });
  addEventListener('keydown', (e) => { if (shift && e.key === 'Escape') pauseMenu(); });

  // ------------------------------------------------------------------ loop
  let lastT = performance.now(), clock = 0;
  function frame(now) {
    const dt = Math.min(0.1, (now - lastT) / 1000); lastT = now; clock += dt;
    if (W > 1) {
      g.setTransform(DPR, 0, 0, DPR, 0, 0);
      if (shift) {
        if (!shift.paused && !shift.res) { shift.acc += dt; let n = 0; while (shift.acc >= 1 / 60 && n++ < 6) { shiftStep(1 / 60); shift.acc -= 1 / 60; } }
        drawShift(clock);
      } else if (tab === 'bench') drawBench(clock);
      else if (tab === 'tree') drawTree(clock);
    }
    requestAnimationFrame(frame);
  }
  resize(); refresh(); requestAnimationFrame(frame);
  { const away = M.applyOffline(save, Date.now()); if (away) welcomeBack(away); }
  // what's new, per release (independent of the save format version)
  const NEWS = {
    2: '⚙ <b>3D gears</b> · ☠ <b>Elites</b> · 💰 <b>Scrap Gremlins</b> · ☄ <b>Mortar, Mender, Magnet</b> · ◆ <b>Cogstones</b> · 📜 <b>Daily Contract</b> · 🏅 <b>Milestones</b> · 🌀 <b>The Deep Works</b>',
    3: '🗄 <b>The Armory</b>: every gear in one place, with filters, sorting, <b>merge duplicates</b> and bulk salvage.<br>⇧ <b>Green badges</b> mark gears that can merge. A coloured ring shows rarity.<br>🏷 Every gear on the bench says what it is (and its RPM).<br>🧰 The bench tray scrolls and filters by Troops, Spells and Other.<br>✦ Upgrades show their names, and the Blueprint toggle no longer vanishes.',
  };
  NEWS[4] = '🔥 <b>The Workshop</b>: a Forge to fuse three unwanted gears into a rarer one (sometimes a legendary), feed spares to the Mainspring for speed, and reforge; a Research desk that works while you\'re away; a Jeweller; a Trophy Wall.<br>📋 <b>Jobs</b>: the Daily Contract, three <b>Bounties</b>, <b>Expeditions</b> (a branching map of fights, elites, treasure, a stall, events and a boss) and <b>Boss Trials</b> at rising Heat for trophies and boss-only legendaries.<br>📖 The Codex moved to the button at the top.';
  NEWS[5] = '⇧ <b>The Merge Workshop</b> has its own room: merge three junk gears into one of the next rarity, <b>merge gems</b> (three of a kind, or any three of a tier into a random better one), and <b>enchant</b> troop gears with two gems: Searing, Frost, Storm, Gilded or Verdant.';
  const NEWS_V = 5;
  if (!save.seenIntro) { intro(); save.seenNews = NEWS_V; }
  else if ((save.seenNews || 1) < NEWS_V) {
    const from = save.seenNews || 1; save.seenNews = NEWS_V; persist();
    const items = Object.keys(NEWS).map(Number).filter((v) => v > from).sort((a, b) => b - a).map((v) => `<p style="text-align:left">${NEWS[v]}</p>`).join('<hr style="border:0;border-top:1px solid #c9b48a">');
    showModal(`<h2>New in the workshop</h2>${items}<button data-a="ok">Back to work</button>`, hideModal);
  }
  persist();

  if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(() => {});

  const cl = (p) => { const r = cv.getBoundingClientRect(); return { x: Math.round(p.x + r.left), y: Math.round(p.y + r.top) }; };
  if (DEV) window.__cw = {
    M, D, get save() { return save; }, set save(s) { save = s; }, refresh, setTab, startShift, invalidate,
    // all in page (client) pixels, ready for synthetic pointer events
    cellPx: (k) => cl(hexPx(k)), slotPx: (i) => { const r = cardRect(i); return cl({ x: r.x + r.w / 2, y: r.y + r.h / 2 }); },
    lanePx: (x, y) => cl({ x: lx(x), y: ly(y) + LIFT }), stripCenter: () => cl(shift.stripC),
    get shift() { return shift; }, give: (n = 1e6) => { save.scrap += n; save.brass += n / 100; refresh(); },
    nodePx: (id) => cl(treeNodePx(D.TREE.find((n) => n.id === id))),
  };
})();
