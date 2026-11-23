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
  const sfx = {
    tick: () => thr('tick', 70) && tone(2400, 0.02, 'square', 0.015),
    clank: () => { noise(0.08, 0.08, 1800); tone(320, 0.09, 'triangle', 0.08, 0.7); },
    hit: () => thr('hit', 60) && tone(150 + Math.random() * 40, 0.07, 'square', 0.03, 0.6),
    zap: () => thr('zap', 90) && tone(1100 + Math.random() * 300, 0.05, 'sawtooth', 0.02, 0.5),
    coin: () => thr('coin', 45) && tone(1600 + Math.random() * 300, 0.05, 'square', 0.025),
    bolt: () => thr('bolt', 80) && (noise(0.12, 0.05, 2500), tone(700, 0.1, 'sawtooth', 0.03, 0.3)),
    loot: (r) => { const f = { common: [660], magic: [660, 880], rare: [660, 880, 1100], set: [523, 784, 1046, 1318], legendary: [392, 523, 659, 784, 1046, 1318] }[r] || [660]; f.forEach((x, i) => tone(x, 0.18, 'triangle', 0.07, 1, i * 0.07)); },
    crank: () => { for (let i = 0; i < 8; i++) tone(200 + i * 60, 0.05, 'square', 0.03, 1, i * 0.03); },
    boss: () => { tone(90, 0.8, 'sawtooth', 0.08, 0.6); noise(0.6, 0.06, 200); },
    win: () => [523, 659, 784, 1046, 1318].forEach((f, i) => tone(f, 0.22, 'triangle', 0.09, 1, i * 0.1)),
    lose: () => tone(300, 0.5, 'triangle', 0.09, 0.4),
    buy: () => { tone(520, 0.08, 'triangle', 0.08); tone(780, 0.1, 'triangle', 0.08, 1, 0.06); },
    nope: () => tone(140, 0.12, 'square', 0.04),
    door: () => thr('door', 200) && (noise(0.1, 0.07, 300)),
  };

  // ------------------------------------------------------------------ save
  let save = M.load(safeGet(), Date.now());
  function safeGet() { try { return localStorage.getItem(KEY); } catch { return null; } }
  function persist() { save.lastSeen = Date.now(); try { localStorage.setItem(KEY, JSON.stringify(save)); } catch { /* private mode: play on without saving */ } }
  save.codex = save.codex || {};
  setInterval(() => { if (!document.hidden) persist(); }, 5000);
  addEventListener('pagehide', persist);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { if (shift && !shift.res) shift.paused = true; persist(); }
    else { const away = M.applyOffline(save, Date.now()); if (away) welcomeBack(away); persist(); refresh(); }
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
    invalidate();
    $('#c-scrap').textContent = fmt(save.scrap); $('#c-brass').textContent = fmt(save.brass);
    $('#c-bp').textContent = fmt(save.blueprints); $('#c-bp-wrap').hidden = !(save.overhauls || save.blueprints);
    save.depth = Math.max(1, Math.min(save.depth, save.unlocked));
    $('#d-num').textContent = 'Depth ' + save.depth; $('#d-zone').textContent = M.zoneOf(save.depth).name.replace('The ', '') + (M.isBossDepth(save.depth) ? ' · Boss' : '');
    $('#d-prev').disabled = save.depth <= 1; $('#d-next').disabled = save.depth >= save.unlocked;
    $('#tree-dot').hidden = !D.TREE.some((n) => M.canBuyNode(save, n.id) === '') && !M.overhaulGain(save);
    if (tab === 'codex') renderCodex();
    if (sel && !save.items[sel]) closeSheet();
  }
  document.querySelectorAll('nav button').forEach((b) => b.addEventListener('click', () => setTab(b.dataset.tab)));
  function setTab(t) {
    tab = t; closeSheet();
    document.querySelectorAll('nav button').forEach((b) => b.classList.toggle('on', b.dataset.tab === t));
    document.body.classList.toggle('codex', t === 'codex');
    $('#foot').style.display = t === 'bench' ? '' : 'none';
    refresh(); requestAnimationFrame(resize);
  }
  $('#d-prev').onclick = () => { save.depth--; refresh(); };
  $('#d-next').onclick = () => { save.depth++; refresh(); };
  $('#go').onclick = startShift;

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

  // ------------------------------------------------------------------ Bench
  let BL = null; // layout
  function benchLayout() {
    const slots = stats.invSlots, cols = 8, slot = Math.min(50, (W - 24) / cols), rows = Math.ceil(slots / cols);
    const drawerH = rows * slot + 34, bh = H - drawerH - 6, R = stats.boardR;
    HX.size = Math.min((W - 16) / (SQ3 * (2 * R + 1)), (bh - 16) / (3 * R + 2)); HX.cx = W / 2; HX.cy = bh / 2 + 4;
    BL = { slot, cols, rows, dx: (W - cols * slot) / 2, dy: bh + 28, bh };
    return BL;
  }
  const slotRect = (i) => ({ x: BL.dx + (i % BL.cols) * BL.slot, y: BL.dy + Math.floor(i / BL.cols) * BL.slot, s: BL.slot });
  let invOrder = [];
  function drawerItems() { // stable order: keep the player's order, new things at the end
    const ids = M.invItems(save).map((it) => it.id), set = new Set(ids);
    invOrder = invOrder.filter((id) => set.has(id)); for (const id of ids) if (!invOrder.includes(id)) invOrder.push(id);
    return invOrder.map((id) => save.items[id]);
  }
  function drawBench(t) {
    benchLayout();
    const bg = g.createLinearGradient(0, 0, 0, H); bg.addColorStop(0, '#2d2219'); bg.addColorStop(1, '#1f1812'); g.fillStyle = bg; g.fillRect(0, 0, W, H);
    // the bench plate
    const inr = (HX.size * SQ3) / 2;
    for (const k of M.cells(stats.boardR)) { const p = hexPx(k); hexOutline(p.x, p.y, HX.size * 0.97); g.fillStyle = k === '0,0' ? '#4a3622' : '#33271d'; g.fill(); g.strokeStyle = '#4c3a28'; g.lineWidth = 1; g.stroke(); }
    // drop hint
    if (drag && drag.live) { const k = pxHex(drag.x, drag.y - 30); if (M.cells(stats.boardR).includes(k) && k !== '0,0') { const p = hexPx(k); hexOutline(p.x, p.y, HX.size * 0.97); g.strokeStyle = '#ffe28a'; g.lineWidth = 3; g.stroke(); } }
    // set glow
    const setGlow = {};
    for (const n of board.spinning) if (n.item.set && board.sets[n.item.set] >= 2) setGlow[n.k] = '#3fcf74';
    // main
    const mp = hexPx('0,0'), mainAng = (t * stats.mainRpm) / 60 * TAU;
    drawGear(mp.x, mp.y, inr * 0.95, 12, mainAng, null, { main: true, glow: '#f0c86a66' });
    for (const n of board.gears) {
      if (drag && drag.live && drag.fromCell === n.k) continue;
      const p = hexPx(n.k), it = n.item, spin = n.state === 'spin';
      const ang = spin ? ((t * n.rpm) / 60) * TAU * n.dir + (n.dir === -1 ? Math.PI / teethOf(it) : 0) : 0;
      g.globalAlpha = n.state === 'idle' ? 0.45 : 1;
      const shake = n.state === 'jam' ? Math.sin(t * 40) * 1.2 : 0;
      drawGear(p.x + shake, p.y, radOf(it, inr), teethOf(it), ang, it, { jam: n.state === 'jam', glow: setGlow[n.k] || (sel === it.id ? '#ffffffaa' : null) });
      g.globalAlpha = 1;
      if (spin) { const ty = p.y + inr * 0.66, txt = Math.round(n.rpm) + ' rpm'; g.font = '800 9px Nunito, system-ui'; const tw = g.measureText(txt).width + 8; g.fillStyle = '#1d1712cc'; g.beginPath(); g.roundRect(p.x - tw / 2, ty - 7, tw, 12, 6); g.fill(); g.fillStyle = '#f3e6c6'; g.textAlign = 'center'; g.fillText(txt, p.x, ty + 2.5); }
      if (sel === it.id) { hexOutline(p.x, p.y, HX.size * 0.97); g.strokeStyle = '#fff'; g.lineWidth = 2; g.stroke(); }
    }
    // drawers
    const items = drawerItems();
    g.fillStyle = '#d4a94e'; g.font = '900 13px Cinzel, serif'; g.textAlign = 'left'; g.fillText(`Drawers ${items.length}/${stats.invSlots}`, BL.dx + 2, BL.dy - 9);
    g.textAlign = 'right'; g.fillStyle = '#a8957a'; g.font = '800 12px Nunito, system-ui'; g.fillText('Sort ⇅', BL.dx + BL.cols * BL.slot - 2, BL.dy - 9);
    for (let i = 0; i < stats.invSlots; i++) {
      const r = slotRect(i); g.fillStyle = '#00000045'; g.beginPath(); g.roundRect(r.x + 2, r.y + 2, r.s - 4, r.s - 4, 8); g.fill();
      const it = items[i]; if (!it || (drag && drag.live && drag.id === it.id)) continue;
      g.strokeStyle = rarity(it.rarity).color; g.lineWidth = it.rarity === 'common' ? 1 : 2.5; g.stroke();
      drawGear(r.x + r.s / 2, r.y + r.s / 2, r.s * ({ S: 0.3, M: 0.36, L: 0.42 })[it.size], teethOf(it), 0, it, { glow: sel === it.id ? '#fff' : null });
    }
    if (drag && drag.live) { const it = save.items[drag.id]; drawGear(drag.x, drag.y - 30, radOf(it, inr) * 1.1, teethOf(it), t * 2, it, { glow: '#ffe28a' }); }
    if (!board.spinning.some((n) => D.GEARS[n.item.base].fam === 'unit')) { g.fillStyle = '#ffd38a'; g.font = '800 13px Nunito, system-ui'; g.textAlign = 'center'; g.fillText('Drag a gear next to the Mainspring so it turns', W / 2, 18); }
  }
  // bench input
  let drag = null;
  function benchHit(x, y) {
    if (y < BL.bh) { const k = pxHex(x, y); const id = save.board[k]; if (id && M.cells(stats.boardR).includes(k)) return { id, cell: k }; return { cell: k }; }
    if (y > BL.dy - 26 && y < BL.dy && x > BL.dx + BL.cols * BL.slot - 70) return { sort: true };
    const c = Math.floor((x - BL.dx) / BL.slot), r = Math.floor((y - BL.dy) / BL.slot), i = r * BL.cols + c;
    if (c >= 0 && c < BL.cols && r >= 0 && i < stats.invSlots) { const it = drawerItems()[i]; return { drawer: true, id: it ? it.id : null, i }; }
    return {};
  }
  function benchDown(x, y) { const h = benchHit(x, y); drag = { x, y, sx: x, sy: y, id: h.id || null, fromCell: h.cell && h.id ? h.cell : null, live: false, h }; }
  function benchMove(x, y) { if (!drag) return; drag.x = x; drag.y = y; if (!drag.live && drag.id && Math.hypot(x - drag.sx, y - drag.sy) > 9) { drag.live = true; closeSheet(); } }
  function benchUp(x, y) {
    if (!drag) return; const d = drag; drag = null;
    if (!d.live) { // a tap
      if (d.h.sort) { sortDrawers(); return; }
      if (d.id) openGear(d.id); else closeSheet();
      return;
    }
    const h = benchHit(x, y - 30), it = save.items[d.id];
    let err = '';
    if (h.id && h.id !== d.id && M.canMerge(save, d.id, h.id) === '') { err = M.merge(save, d.id, h.id); if (!err) { sfx.clank(); toast(`Merged: ${save.items[h.id].name} is now rank ${save.items[h.id].rank}`); } }
    else if (y - 30 < BL.bh && h.cell) { if (h.cell === '0,0') err = 'The Mainspring stays put'; else if (!M.cells(stats.boardR).includes(h.cell)) err = ''; else { err = M.place(save, d.id, h.cell); if (!err) sfx.tick(); } }
    else if (h.drawer && d.fromCell) { err = M.unplace(save, d.fromCell); if (!err) sfx.tick(); }
    if (err) { toast(err); sfx.nope(); }
    void it; persist(); refresh();
  }
  function sortDrawers() {
    const ord = ['legendary', 'set', 'rare', 'magic', 'common'];
    invOrder = M.invItems(save).sort((a, b) => ord.indexOf(a.rarity) - ord.indexOf(b.rarity) || a.base.localeCompare(b.base) || b.ilvl - a.ilvl).map((it) => it.id);
    toast('Sorted by rarity');
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
      ${ds.set ? `<div class="set"><b>${ds.set.name}</b> (${ds.set.have} meshed)<br>${ds.set.bonus.map((b, i) => `<span class="${ds.set.have >= i + 2 ? 'on' : ''}">${ds.set.have >= i + 2 ? '✓' : '·'} ${b}</span>`).join('<br>')}<br><small>Set pieces only count while they turn and touch each other.</small></div>` : ''}
      <div class="acts">
        ${n ? `<button data-a="off">Take off</button>` : `<button class="pri" data-a="place">Place</button>`}
        <button data-a="merge" ${same.length ? '' : 'disabled'}>Merge${same.length ? ` (${same.length})` : ''}</button>
        <button data-a="temper" ${tc && save.brass >= tc ? '' : 'disabled'}>${tc ? `Temper → ${to} (${tc}🔩)` : 'Temper: maxed'}</button>
        <button data-a="vault">${it.vault ? 'Unvault' : `Vault (${M.vaultCount(save)}/${stats.vault})`}</button>
        <button data-a="salvage" ${it.vault ? 'disabled' : ''}>Salvage +${sv}🔩</button>
      </div>
      ${same.length ? '' : `<div class="sub" style="margin-top:6px">Merging needs another ${D.SIZES[it.size].name.toLowerCase()} ${D.GEARS[it.base].name} of rank ${it.rank}.</div>`}`;
    sheet.hidden = false;
    sheet.onclick = (e) => {
      const b = e.target.closest('button'); if (!b) return; const a = b.dataset.a; let err = '';
      if (a === 'close') return closeSheet();
      if (a === 'off') { const k = Object.keys(save.board).find((c) => save.board[c] === id); err = M.unplace(save, k); }
      if (a === 'place') err = autoPlace(id);
      if (a === 'merge') { const src = same.sort((x, y) => (x.loc === 'board') - (y.loc === 'board') || D.RARITIES.findIndex((r) => r.id === x.rarity) - D.RARITIES.findIndex((r) => r.id === y.rarity))[0]; err = M.merge(save, src.id, id); if (!err) { sfx.clank(); toast(`Rank ${save.items[id].rank}!`); } }
      if (a === 'temper') { err = M.temper(save, id); if (!err) sfx.buy(); }
      if (a === 'vault') err = M.toggleVault(save, id);
      if (a === 'reroll') { err = M.reroll(save, id, +b.dataset.i); if (!err) sfx.buy(); }
      if (a === 'salvage') { if (b.dataset.sure) { err = M.salvage(save, id); if (!err) { sfx.clank(); toast(`+${sv} brass`); persist(); refresh(); return closeSheet(); } } else { b.dataset.sure = 1; b.textContent = `Sure? +${sv}🔩`; return; } }
      if (err) { toast(err); sfx.nope(); }
      persist(); refresh(); if (save.items[id]) openGear(id);
    };
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
  function startShift() {
    if (!board.spinning.some((n) => D.GEARS[n.item.base].fam === 'unit')) { toast('Mesh at least one troop gear to the Mainspring first'); sfx.nope(); return; }
    audio(); closeSheet();
    const sh = M.createShift(save, { depth: save.depth });
    shift = { sh, S: sh.S, paused: false, acc: 0, res: null, wrench: null, crank: null, pointers: new Map() };
    fx = []; document.body.classList.add('shift'); requestAnimationFrame(resize);
    if (sh.S.boss) toast(`${sh.S.zone.names.boss} guards this depth`);
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
      case 'kill': fx.push({ k: 'burst', x: lx(e.x), y: ly(e.y), t: 0, life: 0.45, c: S().zone.colors[e.kind] || '#c55' }); sfx.hit(); break;
      case 'die': fx.push({ k: 'burst', x: lx(e.x), y: ly(e.y), t: 0, life: 0.35, c: '#d4a94e' }); break;
      case 'shot': fx.push({ k: 'line', x1: lx(e.x1), y1: ly(e.y1), x2: lx(e.x2), y2: ly(e.y2), c: e.side === 1 ? '#f3e6c6' : '#ff9a6a', t: 0, life: 0.15 }); break;
      case 'bolt': fx.push({ k: 'bolt', x1: lx(e.x1), y1: ly(e.y1), x2: lx(e.x2), y2: ly(e.y2), t: 0, life: 0.25, seed: Math.random() }); sfx.bolt(); break;
      case 'pick': fx.push({ k: 'fly', x: lx(e.x), y: ly(e.y), t: 0, life: 0.4 }); sfx.coin(); break;
      case 'loot': { const R = rarity(e.rarity); fx.push({ k: 'text', x: lx(e.x), y: ly(e.y) - 10, s: e.name, c: R.color, t: 0, life: 1.6, big: e.rarity === 'legendary' || e.rarity === 'set' }); sfx.loot(e.rarity); if (e.rarity === 'legendary') { fx.push({ k: 'flash', t: 0, life: 0.5, c: '#ff8a1f' }); try { navigator.vibrate && navigator.vibrate(60); } catch { /* no haptics */ } } break; }
      case 'salvage': fx.push({ k: 'text', x: lx(e.x), y: ly(e.y) - 10, s: 'salvaged', c: '#a8957a', t: 0, life: 0.9 }); sfx.coin(); break;
      case 'crank': fx.push({ k: 'text', x: W / 2, y: SL.sy - 14, s: 'WOUND UP! ×3', c: '#ffe28a', t: 0, life: 1.2, big: true }); sfx.crank(); break;
      case 'boss': fx.push({ k: 'flash', t: 0, life: 0.6, c: '#ff3b2a' }); sfx.boss(); break;
      case 'surge': fx.push({ k: 'text', x: W / 2, y: SL.y + 26, s: 'Surge!', c: '#ff9a6a', t: 0, life: 1 }); break;
      case 'doorhit': sfx.door(); break;
      case 'spell': fx.push({ k: 'ring', x: W / 2, y: SL.y + SL.h / 2, r: SL.w * 0.6, c: D.GEARS[e.base].color, t: 0, life: 0.35 }); break;
      case 'win': sfx.win(); break;
      case 'door': sfx.lose(); break;
      case 'timeout': sfx.lose(); break;
      default:
    }
    void U;
  }
  const S = () => shift.S;
  function drawShift(t) {
    shiftLayout();
    const st = S(), Z = st.zone, U = unit();
    g.fillStyle = Z.bg; g.fillRect(0, 0, W, H);
    // lane
    g.fillStyle = Z.lane; g.beginPath(); g.roundRect(SL.x, SL.y, SL.w, SL.h, 12); g.fill();
    g.strokeStyle = '#00000030'; g.lineWidth = 1; for (let y = 5; y < M.LANE.L; y += 5) { g.beginPath(); g.moveTo(SL.x + 6, ly(y)); g.lineTo(SL.x + SL.w - 6, ly(y)); g.stroke(); }
    // gate
    const gy = ly(M.LANE.L);
    g.fillStyle = '#00000060'; g.fillRect(SL.x, gy, SL.w, 16); g.fillStyle = Z.accent; for (let i = 0; i < 9; i++) g.fillRect(SL.x + 6 + i * (SL.w - 12) / 9, gy, (SL.w - 12) / 18, 10);
    const gf = Math.max(0, st.gate.hp / st.gate.max);
    g.fillStyle = '#00000080'; g.fillRect(SL.x + 40, gy + 12, SL.w - 80, 7); g.fillStyle = Z.accent; g.fillRect(SL.x + 40, gy + 12, (SL.w - 80) * gf, 7);
    // door
    const dy = ly(0), df = Math.max(0, st.door.hp / st.door.max);
    g.fillStyle = '#5a3a1e'; g.fillRect(SL.x, dy - 12, SL.w, 12); g.strokeStyle = '#3a2410'; for (let i = 0; i < 8; i++) { g.beginPath(); g.moveTo(SL.x + i * SL.w / 8, dy - 12); g.lineTo(SL.x + i * SL.w / 8, dy); g.stroke(); }
    g.fillStyle = '#00000080'; g.fillRect(SL.x + 40, dy - 6, SL.w - 80, 5); g.fillStyle = df > 0.35 ? '#7fd36b' : '#ff5a3a'; g.fillRect(SL.x + 40, dy - 6, (SL.w - 80) * df, 5);
    // drops
    for (const d of st.drops) {
      const x = lx(d.x), y = ly(d.y);
      if (d.kind === 'scrap') { g.fillStyle = '#e8c05a'; g.beginPath(); g.arc(x, y, 3 + Math.min(3, Math.log10(1 + d.v)), 0, TAU); g.fill(); g.strokeStyle = '#7a5a1a'; g.stroke(); }
      else { const c = d.force === 'legendary' ? '#ff8a1f' : '#ffe28a'; const grd = g.createLinearGradient(x, y - 60, x, y); grd.addColorStop(0, c + '00'); grd.addColorStop(1, c + 'aa'); g.fillStyle = grd; g.fillRect(x - 5, y - 60, 10, 60); drawGear(x, y - 6 + Math.sin(t * 4) * 2, 8, 8, t * 2, { base: 'grunt', size: 'S', rarity: 'rare', rank: 1 }, {}); }
    }
    // units
    for (const e of st.enemies) drawFoe(e, Z, U, t);
    for (const tr of st.troops) drawTroop(tr, U, t);
    // wrench + sprite
    if (st.stats.autoWrench) { const p = st.sprite; g.fillStyle = '#9fe7ff'; g.shadowColor = '#9fe7ff'; g.shadowBlur = 12; g.beginPath(); g.arc(lx(p.x), ly(p.y), 4, 0, TAU); g.fill(); g.shadowBlur = 0; }
    if (shift.wrench) {
      const x = shift.wrench.x, y = shift.wrench.y - LIFT, r = st.stats.wrenchRad * U;
      g.strokeStyle = '#ffe28a'; g.lineWidth = 2.5; g.setLineDash([6, 5]); g.lineDashOffset = -t * 30; g.beginPath(); g.arc(x, y, r, 0, TAU); g.stroke(); g.setLineDash([]);
      g.strokeStyle = '#ffe28a40'; g.beginPath(); g.arc(x, y, st.stats.pickRad * U, 0, TAU); g.stroke();
      g.font = '22px system-ui'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('🔧', x, y); g.textBaseline = 'alphabetic';
      if (st.enemies.some((e) => Math.hypot(lx(e.x) - x, ly(e.y) - y) < r + e.r * U)) { sfx.zap(); for (let i = 0; i < 2; i++) { const a = Math.random() * TAU; fx.push({ k: 'spark', x: x + Math.cos(a) * r * Math.random(), y: y + Math.sin(a) * r * Math.random(), t: 0, life: 0.2 }); } }
    }
    // fx
    drawFx(1 / 60);
    // HUD
    const tl = Math.max(0, st.time - st.t);
    g.fillStyle = '#00000070'; g.fillRect(8, 8, W - 70, 30); g.fillStyle = st.crankT > 0 ? '#ffe28a' : '#d4a94e'; g.fillRect(8, 8, (W - 70) * (tl / st.time), 4);
    g.fillStyle = '#f3e6c6'; g.font = '900 15px Cinzel, serif'; g.textAlign = 'left'; g.fillText(`Depth ${st.depth}`, 14, 32);
    g.font = '800 14px Nunito, system-ui'; g.textAlign = 'center'; g.fillText(`⏱ ${Math.ceil(tl)}s`, W * 0.42, 32);
    g.textAlign = 'right'; g.fillText(`⛭ ${fmt(st.scrap)}  ⚙ ${st.items.length}`, W - 72, 32);
    g.fillStyle = '#00000070'; g.beginPath(); g.roundRect(W - 54, 6, 46, 34, 10); g.fill(); g.fillStyle = '#f3e6c6'; g.font = '900 16px system-ui'; g.textAlign = 'center'; g.fillText('❚❚', W - 31, 29);
    if (st.boss && st.enemies.find((e) => e.kind === 'boss')) { const b = st.enemies.find((e) => e.kind === 'boss'); g.fillStyle = '#000a'; g.fillRect(SL.x + 20, SL.y + 26, SL.w - 40, 10); g.fillStyle = '#ff5a3a'; g.fillRect(SL.x + 20, SL.y + 26, (SL.w - 40) * Math.max(0, b.hp / b.max), 10); g.fillStyle = '#fff'; g.font = '800 11px Nunito'; g.fillText(Z.names.boss, W / 2, SL.y + 50); }
    drawStrip(t);
    if (shift.paused && !shift.res) { g.fillStyle = '#000a'; g.fillRect(0, 0, W, H); g.fillStyle = '#f3e6c6'; g.font = '900 26px Cinzel, serif'; g.textAlign = 'center'; g.fillText('Paused', W / 2, H * 0.4); }
  }
  function drawTroop(tr, U, t) {
    const x = lx(tr.x), y = ly(tr.y), r = Math.max(4, tr.r * U * 0.62);
    const col = D.GEARS[tr.kind].color;
    g.fillStyle = tr.hit > 0.07 ? '#fff4dc' : col; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
    g.strokeStyle = '#2a1d10'; g.lineWidth = 1.5; g.stroke();
    g.fillStyle = '#e8c05a'; g.beginPath(); g.arc(x, y - r * 0.35, r * 0.55, Math.PI, TAU); g.fill(); // brass helmet
    if (tr.shield > 0) { g.strokeStyle = '#7fe0ff70'; g.lineWidth = 1.2; g.beginPath(); g.arc(x, y, r + 2.5, 0, TAU); g.stroke(); }
    if (tr.hp < tr.max) { g.fillStyle = '#000'; g.fillRect(x - r, y + r + 2, r * 2, 2.5); g.fillStyle = '#7fd36b'; g.fillRect(x - r, y + r + 2, r * 2 * Math.max(0, tr.hp / tr.max), 2.5); }
    void t;
  }
  function drawFoe(e, Z, U, t) {
    const x = lx(e.x), y = ly(e.y), r = Math.max(5, e.r * U * 0.85), col = Z.colors[e.kind];
    g.fillStyle = col; g.beginPath();
    const wob = Math.sin(t * 6 + e.x) * 0.08;
    g.ellipse(x, y, r * (1 + wob), r * (1 - wob), 0, 0, TAU); g.fill();
    if (e.kind === 'armor' || e.kind === 'boss') { g.strokeStyle = '#d7d2cc'; g.lineWidth = 2; g.stroke(); }
    if (e.hit > 0.06) { g.fillStyle = '#ffffff55'; g.fill(); }
    g.fillStyle = '#fff'; g.beginPath(); g.arc(x - r * 0.32, y + r * 0.1, r * 0.22, 0, TAU); g.arc(x + r * 0.32, y + r * 0.1, r * 0.22, 0, TAU); g.fill();
    g.fillStyle = '#1a0f08'; g.beginPath(); g.arc(x - r * 0.32, y + r * 0.18, r * 0.11, 0, TAU); g.arc(x + r * 0.32, y + r * 0.18, r * 0.11, 0, TAU); g.fill();
    if (e.hp < e.max && e.kind !== 'boss') { g.fillStyle = '#000'; g.fillRect(x - r, y - r - 5, r * 2, 3); g.fillStyle = '#ff6a4a'; g.fillRect(x - r, y - r - 5, r * 2 * Math.max(0, e.hp / e.max), 3); }
  }
  function drawStrip(t) {
    const st = S(), y0 = SL.sy, h = SL.strip;
    g.fillStyle = '#1a130e'; g.fillRect(0, y0, W, h + 10);
    g.strokeStyle = '#4a3826'; g.lineWidth = 2; g.beginPath(); g.moveTo(0, y0); g.lineTo(W, y0); g.stroke();
    // the train, small, centred on the Mainspring
    // fit the cells that hold gears (plus the Mainspring), not the whole bench
    let x0 = -1, x1 = 1, y0c = -1, y1c = 1;
    for (const gr of st.train) { const [q, r] = M.unkey(gr.k); const ux = SQ3 * (q + r / 2), uy = 1.5 * r; x0 = Math.min(x0, ux - 1); x1 = Math.max(x1, ux + 1); y0c = Math.min(y0c, uy - 1); y1c = Math.max(y1c, uy + 1); }
    const size = Math.min((h - 16) / (y1c - y0c), (W * 0.56) / (x1 - x0), 30);
    const cx = W / 2 - ((x0 + x1) / 2) * size, cy = y0 + h / 2 - ((y0c + y1c) / 2) * size;
    shift.stripC = { x: cx, y: cy };
    const inr = (size * SQ3) / 2, P = (k) => { const [q, r] = M.unkey(k); return [cx + size * SQ3 * (q + r / 2), cy + size * 1.5 * r]; };
    const crankGlow = st.crankT > 0 ? '#ffe28a' : null;
    drawGear(cx, cy, inr * 0.95, 12, st.mainAngle, null, { main: true, glow: crankGlow || '#f0c86a55' });
    for (const gr of st.train) {
      const [x, y] = P(gr.k);
      g.globalAlpha = gr.n.state === 'idle' ? 0.35 : 1;
      drawGear(x, y, radOf(gr.item, inr), teethOf(gr.item), gr.angle + (gr.n.dir === -1 ? Math.PI / teethOf(gr.item) : 0), gr.item, { jam: gr.n.state === 'jam', glow: gr.pulse > 0 ? '#fff8' : null });
      g.globalAlpha = 1;
    }
    // crank prompt
    g.textAlign = 'left'; g.fillStyle = st.cranks > 0 ? '#ffe28a' : '#6b5a44'; g.font = '900 13px Cinzel, serif';
    g.fillText(`⟲ ×${st.cranks}`, 12, y0 + 24);
    g.font = '700 11px Nunito, system-ui'; g.fillStyle = '#a8957a';
    if (st.cranks > 0 && st.crankT <= 0) { g.fillText('circle your thumb', 12, y0 + 40); g.fillText('here to wind up', 12, y0 + 54); }
    if (shift.crank) { // progress ring of the current circle
      const f = Math.min(1, Math.abs(shift.crank.acc) / (TAU * 0.9));
      g.strokeStyle = '#ffe28a'; g.lineWidth = 4; g.beginPath(); g.arc(cx, cy, inr * 1.25, -Math.PI / 2, -Math.PI / 2 + f * TAU); g.stroke();
    }
    const B = st.buffs; let bx = W - 12; g.textAlign = 'right'; g.font = '800 12px Nunito, system-ui';
    if (B.haste > 0) { g.fillStyle = D.GEARS.haste.color; g.fillText(`» haste ${B.haste.toFixed(1)}s`, bx, y0 + 24); }
    if (B.over > 0) { g.fillStyle = D.GEARS.overcharge.color; g.fillText(`ϟ over ${B.over.toFixed(1)}s`, bx, y0 + 40); }
    g.fillStyle = '#a8957a'; g.fillText(`${st.troops.length} troops`, bx, y0 + h - 14);
    void t;
  }
  function drawFx(dt) {
    for (const f of fx) {
      f.t += dt; const q = f.t / f.life; g.globalAlpha = Math.max(0, 1 - q);
      if (f.k === 'burst') { g.fillStyle = f.c; for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU + f.x; g.beginPath(); g.arc(f.x + Math.cos(a) * 18 * q, f.y + Math.sin(a) * 18 * q, 2.5, 0, TAU); g.fill(); } }
      else if (f.k === 'line') { g.strokeStyle = f.c; g.lineWidth = 1.5; g.beginPath(); g.moveTo(f.x1, f.y1); g.lineTo(f.x1 + (f.x2 - f.x1) * Math.min(1, q * 2), f.y1 + (f.y2 - f.y1) * Math.min(1, q * 2)); g.stroke(); }
      else if (f.k === 'bolt') { g.strokeStyle = '#c9b8ff'; g.lineWidth = 2.5; g.beginPath(); g.moveTo(f.x1, f.y1); for (let i = 1; i <= 6; i++) { const p = i / 6; g.lineTo(f.x1 + (f.x2 - f.x1) * p + (i < 6 ? Math.sin(f.seed * 99 + i * 7) * 7 : 0), f.y1 + (f.y2 - f.y1) * p); } g.stroke(); }
      else if (f.k === 'fly') { const x = f.x + (W - 60 - f.x) * q * q, y = f.y + (20 - f.y) * q * q; g.fillStyle = '#e8c05a'; g.beginPath(); g.arc(x, y, 3, 0, TAU); g.fill(); }
      else if (f.k === 'text') { g.fillStyle = f.c; g.font = `900 ${f.big ? 18 : 13}px Cinzel, serif`; g.textAlign = 'center'; g.strokeStyle = '#000'; g.lineWidth = 3; g.strokeText(f.s, f.x, f.y - 24 * q); g.fillText(f.s, f.x, f.y - 24 * q); }
      else if (f.k === 'ring') { g.strokeStyle = f.c; g.lineWidth = 3 * (1 - q) + 1; g.beginPath(); g.arc(f.x, f.y, f.r * (0.2 + q), 0, TAU); g.stroke(); }
      else if (f.k === 'spark') { g.fillStyle = '#fff7c2'; g.fillRect(f.x - 1.5, f.y - 1.5, 3, 3); }
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
    const r = shift.res, st = shift.S;
    const title = { win: st.boss ? `${st.zone.names.boss} falls!` : 'Gate broken!', door: 'The door gave way', timeout: 'Shift over' }[r.outcome];
    const items = r.items.map((id) => save.items[id]).filter(Boolean);
    const lines = [`+${fmt(r.scrap)} scrap · ${r.kills} kills${r.brass ? ` · +${r.brass} brass from salvage` : ''}`];
    if (r.opened) lines.push(`Depth ${save.unlocked} is open${M.isBossDepth(save.unlocked) ? ' — a boss waits there' : ''}.`);
    if (r.outcome !== 'win') lines.push(r.outcome === 'door' ? 'Upgrade the door, troop health, or put a Tinker on the bench.' : `Gate ${Math.round(r.gate * 100)}% left. More troops, more damage, or a longer Shift will get it.`);
    if (r.outcome === 'win' && st.boss && st.depth === 10 && save.overhauls === 0) lines.push('You can now Overhaul from the Upgrades tab for permanent Blueprints.');
    showModal(`<h2>${title}</h2>${lines.map((l) => `<p>${l}</p>`).join('')}
      ${items.length ? `<div class="loot">${items.map((it) => `<div style="color:${rarity(it.rarity).color === '#b9b3a6' ? '#5a4c3a' : rarity(it.rarity).color};${it.rarity === 'legendary' ? 'background:#2a1a08' : ''}">⚙ ${it.name} <small>(ilvl ${it.ilvl})</small></div>`).join('')}</div>` : ''}
      <div class="row"><button class="alt" data-a="bench">Bench</button><button data-a="again">${r.opened ? 'Go deeper' : 'Again'}</button></div>`, (a) => {
      hideModal(); endShift();
      if (a === 'again') { if (r.opened) save.depth = save.unlocked; refresh(); startShift(); }
    });
  }
  function endShift() { shift = null; fx = []; document.body.classList.remove('shift'); refresh(); requestAnimationFrame(resize); }

  // ------------------------------------------------------------------ Upgrade tree + Blueprints
  const NODE_SP = 74;
  const treeNodePx = (n) => ({ x: W / 2 + treePan.x + n.x * NODE_SP, y: H / 2 + 20 + treePan.y + n.y * NODE_SP });
  const bpNodePx = (i) => { const a = (i / D.BLUEPRINTS.length) * TAU - Math.PI / 2, r = Math.min(W, H) * 0.32; return { x: W / 2 + Math.cos(a) * r, y: H / 2 + 30 + Math.sin(a) * r }; };
  const showBp = () => save.overhauls > 0 || save.blueprints > 0;
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
        g.globalAlpha = open ? 1 : 0.35; g.font = '20px system-ui'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(n.icon, p.x, p.y + 1); g.textBaseline = 'alphabetic'; g.globalAlpha = 1;
        g.fillStyle = '#a8957a'; g.font = '800 10px Nunito, system-ui';
        if (n.id !== 'root') g.fillText(maxed ? 'MAX' : open ? `${l}/${n.max} · ${fmt(M.nodeCost(n, l))}` : '🔒', p.x, p.y + 39);
        if (sel === 'node:' + n.id) { g.strokeStyle = '#fff'; g.lineWidth = 2; g.beginPath(); g.arc(p.x, p.y, 32, 0, TAU); g.stroke(); }
      }
    } else {
      D.BLUEPRINTS.forEach((b, i) => {
        const p = bpNodePx(i), l = save.bp[b.id] || 0, maxed = l >= b.max, c = M.nodeCost(b, l), can = !maxed && save.blueprints >= c;
        g.fillStyle = maxed ? '#2f4a33' : '#24302a'; g.beginPath(); g.arc(p.x, p.y, 27, 0, TAU); g.fill();
        g.strokeStyle = can ? '#7fe0a0' : '#3c5a44'; g.lineWidth = can ? 3 : 2; g.stroke();
        g.font = '20px system-ui'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(b.icon, p.x, p.y + 1); g.textBaseline = 'alphabetic';
        g.fillStyle = '#9fc7a8'; g.font = '800 10px Nunito, system-ui'; g.fillText(maxed ? 'MAX' : `${l}/${b.max} · ${c}📜`, p.x, p.y + 41);
      });
      g.fillStyle = '#9fc7a8'; g.font = '900 15px Cinzel, serif'; g.textAlign = 'center'; g.fillText(`${save.blueprints} Blueprints`, W / 2, H / 2 + 34); g.font = '700 11px Nunito'; g.fillText('permanent: kept through every Overhaul', W / 2, H / 2 + 52);
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
  function renderCodex() {
    const st = stats, odds = M.dropOdds(st), R = M.idleRates(save, st), cx = save.codex;
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
      <h2>Legendaries</h2>
      <table>${legs.map(([k, L]) => `<tr><td class="${cx[k] ? 'leg' : 'unk'}">${cx[k] ? L.name : '???'}</td><td style="font-weight:600;font-size:12px;text-align:left">${cx[k] ? L.power : 'Not found yet'}</td></tr>`).join('')}</table>
      <h2>Sets</h2>
      ${sets.map(([k, s]) => `<p><b style="color:#3fcf74">${s.name}</b>: ${Object.values(s.pieces).join(', ')}<br>${s.bonus.slice(2).join('<br>')}</p>`).join('')}
      <h2>Your workshop</h2>
      <table><tr><td>Shifts</td><td>${save.stats.shifts}</td></tr><tr><td>Kills</td><td>${fmt(save.stats.kills)}</td></tr><tr><td>Deepest cleared</td><td>${save.best}</td></tr>
      <tr><td>Bosses beaten</td><td>${save.stats.bossKills || 0}</td></tr><tr><td>Overhauls</td><td>${save.overhauls}</td></tr><tr><td>Time in Shifts</td><td>${dur(save.stats.playSecs)}</td></tr>
      <tr><td>Scrap earned</td><td>${fmt(save.stats.scrapTotal)}</td></tr></table>
      <h2>Settings</h2>
      <button data-a="mute">${save.settings.muted ? '🔇 Sound off' : '🔊 Sound on'}</button>
      <button data-a="export">Copy save</button><button data-a="import">Paste save</button>
      <button class="danger" data-a="reset">Start over</button>
      <p style="color:#6b5a44;font-size:12px">No ads, no energy, no shop. Saved on this device only.</p>`;
    page.onclick = async (e) => {
      const b = e.target.closest('button'); if (!b) return; const a = b.dataset.a;
      if (a === 'mute') { save.settings.muted = !save.settings.muted; persist(); renderCodex(); }
      if (a === 'export') { const txt = btoa(unescape(encodeURIComponent(JSON.stringify(save)))); try { await navigator.clipboard.writeText(txt); toast('Save copied to the clipboard'); } catch { showModal(`<h2>Your save</h2><p>Copy this text:</p><textarea style="width:100%;height:120px" readonly>${txt}</textarea><button data-a="ok">Done</button>`, hideModal); } }
      if (a === 'import') showModal(`<h2>Paste a save</h2><textarea id="imp" style="width:100%;height:120px"></textarea><div class="row"><button class="alt" data-a="no">Cancel</button><button data-a="yes">Load it</button></div>`, (r) => {
        if (r === 'yes') { try { const s = JSON.parse(decodeURIComponent(escape(atob($('#imp').value.trim())))); if (!s.items) throw 0; save = M.load(s, Date.now()); save.codex = save.codex || {}; persist(); invOrder = []; toast('Save loaded'); } catch { toast("That doesn't look like a Cogwright save"); } }
        hideModal(); refresh(); });
      if (a === 'reset') { if (!b.dataset.sure) { b.dataset.sure = 1; b.textContent = 'Tap again to wipe everything'; return; } try { localStorage.removeItem(KEY); } catch { /* ignore */ } save = M.newSave((Date.now() * 2654435761) >>> 0, Date.now()); save.codex = {}; invOrder = []; persist(); setTab('bench'); intro(); }
    };
  }

  // ------------------------------------------------------------------ modal
  function showModal(html, onAct) { modal.innerHTML = `<div class="card">${html}</div>`; modal.hidden = false; modal.onclick = (e) => { const b = e.target.closest('button'); if (b && b.dataset.a) onAct(b.dataset.a); }; }
  function hideModal() { modal.hidden = true; modal.innerHTML = ''; }
  function welcomeBack(a) {
    if (!a || (!a.scrap && !a.items.length)) return;
    showModal(`<h2>Welcome back</h2><p>You were away ${dur(a.secs)}${a.capped ? ' (earnings capped)' : ''}.</p>
      <p>+${fmt(a.scrap)} scrap${a.items.length ? ` · ${a.items.length} gears from the Night Shift` : ''}${a.brass ? ` · +${a.brass} brass` : ''}</p>
      ${a.items.length ? `<div class="loot">${a.items.map((id) => save.items[id]).filter(Boolean).map((it) => `<div style="color:${rarity(it.rarity).color === '#b9b3a6' ? '#5a4c3a' : rarity(it.rarity).color}">⚙ ${it.name}</div>`).join('')}</div>` : ''}
      <button data-a="ok">To the bench</button>`, () => { hideModal(); refresh(); });
  }
  function intro() {
    showModal(`<h2>Cogwright</h2><p>The workshop is under siege. Build a gear train, wind the Mainspring, and send brass soldiers up the lane to break the enemy gate.</p>
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
  if (!save.seenIntro) intro();
  persist();

  if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(() => {});

  const cl = (p) => { const r = cv.getBoundingClientRect(); return { x: Math.round(p.x + r.left), y: Math.round(p.y + r.top) }; };
  if (DEV) window.__cw = {
    M, D, get save() { return save; }, set save(s) { save = s; }, refresh, setTab, startShift, invalidate,
    // all in page (client) pixels, ready for synthetic pointer events
    cellPx: (k) => cl(hexPx(k)), slotPx: (i) => { const r = slotRect(i); return cl({ x: r.x + r.s / 2, y: r.y + r.s / 2 }); },
    lanePx: (x, y) => cl({ x: lx(x), y: ly(y) + LIFT }), stripCenter: () => cl(shift.stripC),
    get shift() { return shift; }, give: (n = 1e6) => { save.scrap += n; save.brass += n / 100; refresh(); },
    nodePx: (id) => cl(treeNodePx(D.TREE.find((n) => n.id === id))),
  };
})();
