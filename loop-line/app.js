// Loop Line v2: the page. Drawing, the toolbar, and touch input around the model in game.js.
(function () {
  'use strict';
  const { createGame, GADGETS, PIECES, CARS, WAVES, COLS, ROWS, key, unkey, TAU } = window.LoopLine;
  const $ = (s) => document.querySelector(s), K = window.Kit;
  const sfx = K ? K.sfx : new Proxy({}, { get: () => () => false });
  let game, cv, g, DPR = 1, W = 0, H = 0, T = 40, ox = 0, oy = 0, raf = 0, last = 0, sel = -1, drag = null, note = '', noteT = 0, tool = 'track';
  const TOP = 50;
  const TOOLS = [['track', '🛤', 'Track', `${2}🪙 a rail`], ['erase', '🧽', 'Remove', 'refund'],
    ...Object.entries(GADGETS).map(([k, v]) => [k, v.icon, v.name, `${v.cost}🪙`]), ...Object.entries(PIECES).map(([k, v]) => [k, v.icon, v.name, `${v.cost}🪙`]),
    ...Object.entries(CARS).map(([k, v]) => [k, v.icon, v.name, `${v.cost}🪙`])];
  const TIP = { track: 'Drag from the rails (or the shed) to lay track. Cross a straight rail to bridge it; branch off to make points.', erase: 'Tap a rail, piece or gadget to take it back.' };

  function makeFx() {
    let ps = [];
    return { shake: 0,
      burst(x, y, n, cols) { for (let i = 0; i < n; i++) { const a = Math.random() * TAU, v = 1.5 + Math.random() * 2.5; ps.push({ k: 'p', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 1.5, t: 0, life: 0.5 + Math.random() * 0.3, c: cols[i % cols.length], s: 0.05 + Math.random() * 0.05 }); } },
      text(x, y, s, c, size = 0.34) { ps.push({ k: 't', x, y, s, c, size, t: 0, life: 0.9 }); },
      puff(x, y) { ps.push({ k: 's', x: x + (Math.random() - 0.5) * 0.1, y, t: 0, life: 0.9 }); },
      ring(x, y, r, c) { ps.push({ k: 'r', x, y, r, c, t: 0, life: 0.3 }); },
      spark(x1, y1, x2, y2, c) { ps.push({ k: 'z', x: x1, y: y1, x2, y2, c, t: 0, life: 0.18, j: [Math.random() - 0.5, Math.random() - 0.5] }); },
      update(dt) { for (const p of ps) p.t += dt; ps = ps.filter((p) => p.t < p.life); this.shake = Math.max(0, this.shake - dt * 30); },
      draw(g) {
        for (const p of ps) { const q = p.t / p.life;
          if (p.k === 's') { g.globalAlpha = 0.5 * (1 - q); g.fillStyle = '#ffffff'; g.beginPath(); g.arc(p.x + q * 0.3, p.y - q * 0.7, 0.08 + q * 0.16, 0, TAU); g.fill(); }
          else if (p.k === 'p') { g.globalAlpha = 1 - q; g.fillStyle = p.c; g.beginPath(); g.arc(p.x + p.vx * p.t, p.y + p.vy * p.t + 5 * p.t * p.t, p.s, 0, TAU); g.fill(); }
          else if (p.k === 'r') { g.globalAlpha = 1 - q; g.strokeStyle = p.c; g.lineWidth = 0.09 * (1 - q) + 0.02; g.beginPath(); g.arc(p.x, p.y, p.r * (0.35 + 0.65 * q), 0, TAU); g.stroke(); }
          else if (p.k === 'z') { // a spark jumping from the rail to the gadget it set off
            g.globalAlpha = 1 - q; g.strokeStyle = p.c; g.lineWidth = 0.07; g.lineCap = 'round'; const mx = (p.x + p.x2) / 2 + p.j[0] * 0.35, my = (p.y + p.y2) / 2 + p.j[1] * 0.35;
            g.beginPath(); g.moveTo(p.x, p.y); g.lineTo(mx, my); g.lineTo(p.x2, p.y2); g.stroke(); g.fillStyle = '#ffffff'; g.beginPath(); g.arc(p.x2, p.y2, 0.12 * (1 - q), 0, TAU); g.fill(); }
          else { g.globalAlpha = Math.min(1, (1 - q) * 2); g.font = `${p.size}px "Lilita One", system-ui`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineWidth = 0.07; g.strokeStyle = '#1d2a1a'; g.strokeText(p.s, p.x, p.y - q * 0.7); g.fillStyle = p.c; g.fillText(p.s, p.x, p.y - q * 0.7); } }
        g.globalAlpha = 1;
      } };
  }

  function start() {
    const fx = makeFx(); game = createGame({ sfx, fx, seed: (Math.random() * 1e9) | 0 }); game.fx = fx; sel = -1; drag = null; tool = 'track';
    $('#modal').hidden = true; panel(true); layout(); last = performance.now(); cancelAnimationFrame(raf); raf = requestAnimationFrame(loop);
  }
  function layout() {
    DPR = Math.min(2, devicePixelRatio || 1); W = cv.clientWidth; H = cv.clientHeight; cv.width = W * DPR; cv.height = H * DPR;
    const uih = $('#ui').offsetHeight; T = Math.min((W - 12) / COLS, (H - TOP - uih - 8) / ROWS); ox = (W - COLS * T) / 2; oy = TOP + 4;
  }
  function loop(now) {
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    try { game.update(dt); game.fx.update(dt); noteT -= dt; if (game.S.msg) { say(game.S.msg); game.S.msg = ''; } draw(); panel(); } catch (e) { console.error('[loop-line]', e); }
    if (game.S.over) return finish();
    raf = requestAnimationFrame(loop);
  }
  function finish() {
    const S = game.S; draw(); panel(true);
    $('#modal').innerHTML = `<div class="card"><h2>${S.won ? 'Base saved!' : 'The base fell'}</h2><p>${S.won ? `All ${WAVES.length} waves held with ${S.hp} ♥ left.` : `Wave ${S.wave} of ${WAVES.length} got through.`}<br>${S.pops} marbles popped · best combo ${S.best} · ${S.gadgets.size} gadgets on ${S.track.size} rails.</p><button type="button" class="big" data-again>Play again</button></div>`;
    $('#modal').hidden = false;
  }
  const say = (s) => { note = s; noteT = 2.6; };

  // ---- drawing
  function draw() {
    const S = game.S; g.setTransform(DPR, 0, 0, DPR, 0, 0);
    g.fillStyle = '#5daa4b'; g.fillRect(0, 0, W, H);
    g.save(); if (game.fx.shake) g.translate((Math.random() - 0.5) * game.fx.shake, (Math.random() - 0.5) * game.fx.shake);
    g.translate(ox, oy); g.scale(T, T);
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) { g.fillStyle = (c + r) % 2 ? '#7cc35b' : '#86cc63'; g.fillRect(c, r, 1, 1); }
    if (S.phase === 'build' && GADGETS[tool]) for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) { // where a gadget can go
      const k = key(c, r); if (S.track.has(k) || S.base.has(k) || S.gadgets.has(k)) continue;
      if ([[1, 0], [-1, 0], [0, 1], [0, -1]].some(([a, b]) => S.track.has(key(c + a, r + b)))) { g.fillStyle = '#ffffff30'; g.beginPath(); g.roundRect(c + 0.1, r + 0.1, 0.8, 0.8, 0.15); g.fill(); }
    }
    drawBase(g, S); drawShed(g, S);
    drawTrack(g, S);
    for (const [k, G] of S.gadgets) drawGadget(g, k, G);
    if (drag && drag.path.length > 1) drawStroke(g);
    for (const m of S.enemies) drawMarble(g, m);
    for (const s of S.shots) { const q = Math.min(1, s.t / 0.16), x = s.x + (s.m.x - s.x) * q, y = s.y + (s.m.y - s.y) * q - Math.sin(q * Math.PI) * 0.4; g.fillStyle = '#26262b'; g.beginPath(); g.arc(x, y, 0.09, 0, TAU); g.fill(); }
    drawTrain(g, S);
    if (S.tracers) for (const tr of S.tracers) { g.strokeStyle = '#fff6b0'; g.lineWidth = 0.05; g.beginPath(); g.moveTo(tr.x, tr.y); g.lineTo(tr.x2, tr.y2); g.stroke(); }
    game.fx.draw(g);
    g.restore();
    // HUD
    g.fillStyle = '#2f6b2a'; g.fillRect(0, 0, W, TOP); g.fillStyle = '#24561f'; g.fillRect(0, TOP - 4, W, 4);
    g.textBaseline = 'middle'; g.font = '21px "Lilita One", system-ui'; g.textAlign = 'left';
    const m = game.mult(), hud = [[`Wave ${S.wave}/${WAVES.length}`, '#ffffff'], [`♥ ${S.hp}`, '#ff8a80'], [`🪙 ${S.coins}`, '#ffe08a']];
    let x = 10; for (const [s, c] of hud) { g.lineWidth = 4; g.strokeStyle = '#1d3d1a'; g.strokeText(s, x, TOP / 2 - 1); g.fillStyle = c; g.fillText(s, x, TOP / 2 - 1); x += g.measureText(s).width + 14; }
    if (S.combo > 0) { const s = `×${m.toFixed(1)}`, pulse = 1 + Math.min(0.25, S.combo / 120); g.save(); g.translate(W - 50, TOP / 2 - 1); g.scale(pulse, pulse); g.textAlign = 'right'; g.lineWidth = 4; g.strokeText(s, 0, 0); g.fillStyle = S.combo >= 30 ? '#ff5a4e' : S.combo >= 12 ? '#ffd23f' : '#ffffff'; g.fillText(s, 0, 0);
      g.font = '800 10px Nunito, system-ui'; g.fillStyle = '#cfe8c6'; g.fillText(`COMBO ${S.combo}`, 0, 15); g.restore(); }
    if (noteT > 0 && note) { g.font = '700 13.5px Nunito, system-ui'; const w = Math.min(W - 20, g.measureText(note).width + 24); g.globalAlpha = Math.min(1, noteT * 2); g.fillStyle = '#1d3d1aee'; g.beginPath(); g.roundRect(W / 2 - w / 2, TOP + 10, w, 30, 15); g.fill(); g.fillStyle = '#fff'; g.textAlign = 'center'; g.fillText(note, W / 2, TOP + 25, W - 30); g.globalAlpha = 1; }
  }
  function drawBase(g, S) { // a little fort with a flag in the middle of the mat
    const x = 4, y = 6, hit = S.hp <= 5;
    g.fillStyle = '#c9a26b'; g.beginPath(); g.roundRect(3.08, 5.08, 1.84, 1.84, 0.2); g.fill(); g.strokeStyle = '#8c6a3c'; g.lineWidth = 0.05; g.stroke();
    g.fillStyle = '#e8e2d4'; g.fillRect(x - 0.55, y - 0.35, 1.1, 0.8); g.strokeStyle = '#7d7466'; g.lineWidth = 0.04; g.strokeRect(x - 0.55, y - 0.35, 1.1, 0.8);
    for (let i = 0; i < 5; i++) { g.fillStyle = '#e8e2d4'; g.fillRect(x - 0.55 + i * 0.24, y - 0.5, 0.14, 0.16); }
    g.fillStyle = '#6b4a2b'; g.fillRect(x - 0.08, y + 0.1, 0.16, 0.35);
    g.fillStyle = '#4a4a4a'; g.fillRect(x - 0.02, y - 1.0, 0.04, 0.55);
    const wave = Math.sin(performance.now() / 250) * 0.04; g.fillStyle = hit ? '#ff5a4e' : '#e2453c'; g.beginPath(); g.moveTo(x + 0.02, y - 1.0); g.lineTo(x + 0.45, y - 0.88 + wave); g.lineTo(x + 0.02, y - 0.74); g.fill();
    g.font = '0.26px "Lilita One", system-ui'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineWidth = 0.06; g.strokeStyle = '#1d3d1a'; g.strokeText(`♥${S.hp}`, x, y + 0.66); g.fillStyle = '#fff'; g.fillText(`♥${S.hp}`, x, y + 0.66);
  }
  function drawShed(g, S) {
    const [a] = S.shed.map(unkey); g.fillStyle = '#8c3b2e'; g.globalAlpha = 0.35; g.fillRect(a[0] + 0.05, a[1] + 0.12, 1.9, 0.76); g.globalAlpha = 1;
    g.strokeStyle = '#8c3b2e'; g.lineWidth = 0.05; g.setLineDash([0.1, 0.08]); g.strokeRect(a[0] + 0.05, a[1] + 0.12, 1.9, 0.76); g.setLineDash([]);
    if (game.S.wave === 0 && game.S.track.size <= 2) { g.font = '0.22px "Lilita One", system-ui'; g.fillStyle = '#fff'; g.textAlign = 'center'; g.fillText('SHED', a[0] + 1, a[1] + 1.02); }
  }
  function railPts(p, c, n, off) { const s = game.seg(p, c, n), out = []; for (let i = 0; i <= 8; i++) { const t = i / 8, a = s.at(t), b = s.at(Math.min(1, t + 0.01)), b0 = s.at(Math.max(0, t - 0.01)), dx = b[0] - b0[0], dy = b[1] - b0[1], l = Math.hypot(dx, dy) || 1; out.push([a[0] - dy / l * off, a[1] + dx / l * off]); } return out; }
  function runs(S) { // every way through every cell: [prev, cell, next, live, layer]
    const out = [];
    for (const [k, n] of S.track) {
      const L = n.links, [c, r] = unkey(k);
      if (L.length === 1) { const [a, b] = unkey(L[0]); out.push([L[0], k, key(2 * c - a, 2 * r - b), true, 0, 'end']); }
      else if (L.length === 2) out.push([L[0], k, L[1], true, 0]);
      else if (L.length === 3) { const br = game.branches(n); br.forEach((b, i) => out.push([n.trunk, k, b, i === n.pt, 0])); }
      else if (L.length === 4) { const low = n.bridge || L[0], lo = [low, L.find((x) => { const [a, b] = unkey(low), [d, e] = unkey(x); return d === 2 * c - a && e === 2 * r - b; })]; const hi = L.filter((x) => !lo.includes(x)); out.push([lo[0], k, lo[1], true, 0], [hi[0], k, hi[1], true, 1]); }
    }
    return out;
  }
  function drawRun(g, [p, c, n, live, , end]) {
    g.globalAlpha = live ? 1 : 0.4; g.lineCap = 'round';
    const L = railPts(p, c, n, 0.27), R = railPts(p, c, n, -0.27), lim = end ? 4 : 8;
    g.strokeStyle = '#8a5a2e'; g.lineWidth = 0.1; for (const i of [1, 4, 7]) if (i <= lim) { g.beginPath(); g.moveTo(...L[i]); g.lineTo(...R[i]); g.stroke(); }
    for (const off of [0.16, -0.16]) { const pts = railPts(p, c, n, off).slice(0, lim + 1); g.strokeStyle = '#4b5563'; g.lineWidth = 0.075; g.beginPath(); pts.forEach((q, i) => (i ? g.lineTo(...q) : g.moveTo(...q))); g.stroke(); g.strokeStyle = '#d1d9e2'; g.lineWidth = 0.03; g.stroke(); }
    if (end) { const [x, y] = game.ctr(c); g.fillStyle = '#e2453c'; g.fillRect(x - 0.22, y - 0.22, 0.44, 0.44); g.fillStyle = '#fff'; g.fillRect(x - 0.16, y - 0.04, 0.32, 0.08); } // buffer stop
    g.globalAlpha = 1;
  }
  function drawTrack(g, S) {
    const all = runs(S);
    for (const r of all) if (!r[4]) drawRun(g, r);
    for (const r of all) if (r[4]) { const [x, y] = game.ctr(r[1]); g.fillStyle = '#00000040'; g.fillRect(x - 0.5, y - 0.42, 1, 0.92); g.fillStyle = '#a8794a'; const v = Math.abs(unkey(r[0])[0] - unkey(r[2])[0]) < 0.5; if (v) g.fillRect(x - 0.36, y - 0.5, 0.72, 1); else g.fillRect(x - 0.5, y - 0.36, 1, 0.72); drawRun(g, r); } // bridges on top
    if (S.flash) for (const k in S.flash) { const [x, y] = game.ctr(k); g.fillStyle = `rgba(255,243,160,${S.flash[k] * 2.4})`; g.beginPath(); g.roundRect(x - 0.42, y - 0.42, 0.84, 0.84, 0.15); g.fill(); }
    for (const [k, n] of S.track) {
      const [x, y] = game.ctr(k);
      if (n.piece === 'booster') { const [a, b] = n.links.map(unkey), ang = Math.atan2(b[1] - a[1], b[0] - a[0]); g.save(); g.translate(x, y); g.rotate(ang); g.strokeStyle = '#2ec4ff'; g.lineWidth = 0.08; for (const dx of [-0.12, 0.08]) { g.beginPath(); g.moveTo(dx - 0.08, -0.14); g.lineTo(dx + 0.06, 0); g.lineTo(dx - 0.08, 0.14); g.stroke(); } g.restore(); }
      if (n.links.length === 3) { const [tx, ty] = game.ctr(game.branches(n)[n.pt]), a = Math.atan2(ty - y, tx - x);
        g.fillStyle = n.piece === 'auto' ? '#ffd23f' : '#ffffff'; g.strokeStyle = '#1d3d1a'; g.lineWidth = 0.05; g.beginPath(); g.arc(x, y, 0.2, 0, TAU); g.fill(); g.stroke();
        g.save(); g.translate(x, y); g.rotate(a); g.fillStyle = '#e2453c'; g.beginPath(); g.moveTo(0.16, 0); g.lineTo(-0.08, -0.11); g.lineTo(-0.08, 0.11); g.fill(); g.restore(); }
    }
  }
  function drawGadget(g, k, G) {
    const [x, y] = game.ctr(k), s = 1 + (G.kick || 0) * 1.4;
    g.fillStyle = '#00000030'; g.beginPath(); g.ellipse(x + 0.04, y + 0.08, 0.34, 0.26, 0, 0, TAU); g.fill();
    g.save(); g.translate(x, y); g.scale(s, s);
    if (G.type === 'cannon') { g.fillStyle = '#6b4a2b'; g.beginPath(); g.arc(0, 0, 0.3, 0, TAU); g.fill(); g.save(); g.rotate(G.aim ?? -Math.PI / 2); g.fillStyle = '#2b2b31'; g.beginPath(); g.roundRect(-0.06, -0.11, 0.42, 0.22, 0.08); g.fill(); g.restore(); g.fillStyle = '#3b3b44'; g.beginPath(); g.arc(0, 0, 0.17, 0, TAU); g.fill(); }
    else if (G.type === 'hammer') { const sw = (G.kick || 0) * 4; g.fillStyle = '#c9a26b'; g.beginPath(); g.arc(0, 0, 0.3, 0, TAU); g.fill(); g.save(); g.rotate(-0.6 + sw); g.fillStyle = '#7a5530'; g.fillRect(-0.04, -0.3, 0.08, 0.42); g.fillStyle = '#8d97a5'; g.beginPath(); g.roundRect(-0.18, -0.38, 0.36, 0.17, 0.04); g.fill(); g.restore(); }
    else if (G.type === 'bumper') { for (const [r, c] of [[0.32, '#e2453c'], [0.23, '#ffffff'], [0.14, '#e2453c']]) { g.fillStyle = c; g.beginPath(); g.arc(0, 0, r, 0, TAU); g.fill(); } }
    else if (G.type === 'bell') { g.fillStyle = '#6b4a2b'; g.fillRect(-0.28, -0.32, 0.56, 0.06); g.fillStyle = '#ffd23f'; g.strokeStyle = '#9c7a12'; g.lineWidth = 0.035; g.beginPath(); g.moveTo(-0.22, 0.2); g.quadraticCurveTo(-0.2, -0.28, 0, -0.27); g.quadraticCurveTo(0.2, -0.28, 0.22, 0.2); g.closePath(); g.fill(); g.stroke(); g.fillStyle = '#9c7a12'; g.beginPath(); g.arc(0, 0.24, 0.06, 0, TAU); g.fill(); }
    g.restore();
  }
  function drawStroke(g) {
    const err = game.checkStroke(drag.path), ok = !err;
    g.globalAlpha = 0.55; for (const [c, r] of drag.path.slice(1)) { g.fillStyle = ok ? '#ffffff' : '#ff5a4e'; g.beginPath(); g.roundRect(c + 0.12, r + 0.12, 0.76, 0.76, 0.18); g.fill(); }
    g.globalAlpha = 1; g.strokeStyle = ok ? '#ffffff' : '#ff5a4e'; g.lineWidth = 0.08; g.setLineDash([0.12, 0.1]); g.beginPath(); drag.path.forEach(([c, r], i) => (i ? g.lineTo(c + 0.5, r + 0.5) : g.moveTo(c + 0.5, r + 0.5))); g.stroke(); g.setLineDash([]);
    const n = drag.path.slice(1).filter(([c, r]) => !game.S.track.has(key(c, r))).length * 2, [c, r] = drag.path[drag.path.length - 1];
    g.font = '0.32px "Lilita One", system-ui'; g.textAlign = 'center'; g.lineWidth = 0.08; g.strokeStyle = '#1d3d1a'; g.strokeText(`${n}🪙`, c + 0.5, r - 0.15); g.fillStyle = n > game.S.coins ? '#ff5a4e' : '#ffffff'; g.fillText(`${n}🪙`, c + 0.5, r - 0.15);
  }
  function drawMarble(g, m) {
    const r = m.T.r, x = m.x, y = m.y - (m.onRail ? Math.abs(Math.sin(m.age * 12)) * 0.08 : 0);
    g.fillStyle = '#00000033'; g.beginPath(); g.ellipse(m.x + 0.03, m.y + 0.08, r, r * 0.7, 0, 0, TAU); g.fill();
    const gr = g.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.1, x, y, r); gr.addColorStop(0, m.T.hi); gr.addColorStop(1, m.T.col);
    g.fillStyle = m.flash > 0 ? '#ffffff' : gr; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill(); g.strokeStyle = '#00000055'; g.lineWidth = 0.025; g.stroke();
    const lx = (m.vx || 0) * r * 0.1, ly = (m.vy || 0) * r * 0.1;
    for (const s of [-1, 1]) { g.fillStyle = '#fff'; g.beginPath(); g.arc(x + s * r * 0.33, y - r * 0.12, r * 0.24, 0, TAU); g.fill(); g.fillStyle = '#1a1a1a'; g.beginPath(); g.arc(x + s * r * 0.33 + lx, y - r * 0.12 + ly, r * 0.12, 0, TAU); g.fill(); }
    g.strokeStyle = '#1a1a1a'; g.lineWidth = r * 0.1; g.lineCap = 'round';
    if (m.type === 'bruiser') { g.beginPath(); g.moveTo(x - r * 0.55, y - r * 0.45); g.lineTo(x - r * 0.12, y - r * 0.3); g.moveTo(x + r * 0.55, y - r * 0.45); g.lineTo(x + r * 0.12, y - r * 0.3); g.stroke(); g.beginPath(); g.moveTo(x - r * 0.25, y + r * 0.42); g.lineTo(x + r * 0.25, y + r * 0.42); g.stroke(); }
    else if (m.type === 'bouncer') { g.beginPath(); g.arc(x, y + r * 0.25, r * 0.28, 0.15 * Math.PI, 0.85 * Math.PI); g.stroke(); }
    else { g.beginPath(); g.ellipse(x, y + r * 0.4, r * 0.14, r * 0.1, 0, 0, TAU); g.stroke(); }
    if (m.hp < m.max) { g.fillStyle = '#0008'; g.fillRect(x - r, y - r - 0.12, r * 2, 0.06); g.fillStyle = '#7ee08a'; g.fillRect(x - r, y - r - 0.12, r * 2 * Math.max(0, m.hp) / m.max, 0.06); }
  }
  function drawCar(g, p, col, len, wid, fn) {
    g.save(); g.translate(p.x, p.y); g.rotate(p.a);
    g.fillStyle = '#00000040'; g.beginPath(); g.roundRect(-len / 2 + 0.04, -wid / 2 + 0.07, len, wid, 0.1); g.fill();
    g.fillStyle = '#26262b'; for (const sx of [-len * 0.3, len * 0.3]) for (const sy of [-wid / 2, wid / 2]) { g.beginPath(); g.arc(sx, sy, 0.07, 0, TAU); g.fill(); }
    g.fillStyle = col; g.strokeStyle = '#1d1d22'; g.lineWidth = 0.035; g.beginPath(); g.roundRect(-len / 2, -wid / 2, len, wid, 0.1); g.fill(); g.stroke();
    fn && fn(); g.restore();
  }
  function drawTrain(g, S) {
    for (let i = S.cars.length - 1; i >= -1; i--) {
      const p = game.carPos(i);
      if (i < 0) { drawCar(g, p, '#e2453c', 0.86, 0.5, () => { g.fillStyle = '#b8312a'; g.fillRect(-0.43, -0.25, 0.3, 0.5); g.fillStyle = '#1d1d22'; g.beginPath(); g.arc(0.24, 0, 0.1, 0, TAU); g.fill(); g.fillStyle = '#ffd23f'; g.beginPath(); g.moveTo(0.43, -0.22); g.lineTo(0.56, 0); g.lineTo(0.43, 0.22); g.fill(); if (S.boost > 0) { g.fillStyle = '#2ec4ff'; g.fillRect(-0.62, -0.08, 0.16, 0.16); } }); continue; }
      const k = S.cars[i], C = CARS[k];
      drawCar(g, p, C.col, 0.8, 0.46, () => {
        if (k === 'gun') { const a = (S.aims && S.aims[i] != null ? S.aims[i] - p.a : -Math.PI / 2); g.fillStyle = '#1d1d22'; g.beginPath(); g.arc(0, 0, 0.14, 0, TAU); g.fill(); g.save(); g.rotate(a); g.fillRect(0, -0.04, 0.3, 0.08); g.restore(); }
        else if (k === 'spark') { g.strokeStyle = '#ffe14d'; g.lineWidth = 0.06; g.beginPath(); g.moveTo(-0.12, -0.16); g.lineTo(0.04, -0.02); g.lineTo(-0.06, 0.02); g.lineTo(0.12, 0.16); g.stroke(); }
        else if (k === 'coal') { g.fillStyle = '#111'; for (const [cx, cy] of [[-0.18, -0.06], [0, 0.07], [0.17, -0.05], [-0.06, -0.12], [0.1, 0.12]]) { g.beginPath(); g.arc(cx, cy, 0.08, 0, TAU); g.fill(); } }
      });
    }
  }

  // ---- the panel: a tip line, a toolbar, the train, and send/speed
  let pkey = '';
  function panel(force) {
    const S = game.S, k = JSON.stringify([S.phase, S.cars, sel, S.wave, S.speed, tool, S.coins, S.track.size]);
    if (k === pkey && !force) return; pkey = k;
    const info = GADGETS[tool] || PIECES[tool] || CARS[tool];
    const msg = S.phase === 'wave' ? 'Tap points to switch routes. You can still place gadgets mid-wave.' : sel >= 0 ? `Tap another car to swap it with the <b>${CARS[S.cars[sel]].name}</b> (tap it again to sell).`
      : info ? `<b>${info.name}:</b> ${info.blurb}` : TIP[tool];
    const tools = TOOLS.map(([t, ic, nm, cost]) => { const c = (GADGETS[t] || PIECES[t] || CARS[t] || {}).cost, off = (S.phase === 'wave' && !GADGETS[t] && t !== 'erase') || (c && c > S.coins);
      return `<button type="button" class="tool${tool === t ? ' on' : ''}${CARS[t] ? ' buy' : ''}" data-tool="${t}" ${off ? 'disabled' : ''}><b>${ic}</b><span>${nm}</span><small>${cost}</small></button>`; }).join('');
    const train = `<div class="train"><span class="eng">🚂</span>${S.cars.map((c, i) => `<button type="button" class="car${i === sel ? ' sel' : ''}" data-car="${i}" style="--c:${CARS[c].col}" ${S.phase === 'wave' ? 'disabled' : ''}>${CARS[c].icon}</button>`).join('')}</div>`;
    const go = S.phase === 'build' ? `<button type="button" id="go">Send wave ${S.wave + 1} ▶</button>` : `<button type="button" id="go" disabled>Wave ${S.wave} rolling…</button>`;
    const sc = $('#tools') ? $('#tools').scrollLeft : 0;
    $('#ui').innerHTML = `<p class="msg">${msg}</p><div class="tools" id="tools">${tools}</div><div class="bar">${train}${go}<button type="button" id="spd" class="${S.speed > 1 ? 'on' : ''}">${'▶'.repeat(S.speed)}<small>×${S.speed}</small></button></div>`;
    $('#tools').scrollLeft = sc;
  }

  // ---- input
  function cellAt(e) { const r = cv.getBoundingClientRect(); return [Math.floor((e.clientX - r.left - ox) / T), Math.floor((e.clientY - r.top - oy) / T)]; }
  function down(e) {
    if (!game || game.S.over) return; const [c, r] = cellAt(e);
    drag = { start: [c, r], moved: false, path: [[c, r]], draw: tool === 'track' && game.S.phase === 'build' && game.S.track.has(key(c, r)) }; cv.setPointerCapture(e.pointerId); e.preventDefault();
  }
  function move(e) {
    if (!drag || !drag.draw) return; const [c, r] = cellAt(e), P = drag.path, lc = P[P.length - 1];
    if (c === lc[0] && r === lc[1]) return;
    if (P.length > 1 && c === P[P.length - 2][0] && r === P[P.length - 2][1]) { P.pop(); return; }
    let [x, y] = lc;
    while ((x !== c || y !== r) && P.length < 60) { if (x !== c) x += Math.sign(c - x); else y += Math.sign(r - y); if (P.some(([a, b]) => a === x && b === y)) break; P.push([x, y]); drag.moved = true; }
  }
  function up() {
    if (!drag) return; const d = drag, S = game.S; drag = null; pkey = '';
    if (d.moved && d.path.length > 1) { const err = game.lay(d.path); if (err) say(err); return; }
    const k = key(...d.start);
    const n = S.track.get(k);
    if (n && n.links.length === 3 && (tool === 'track' || S.phase === 'wave' || !PIECES[tool])) { if (tool !== 'erase') { game.flip(k); return; } }
    if (tool === 'erase') { const err = game.erase(k); if (err) say(err); return; }
    if (GADGETS[tool] || PIECES[tool]) { const err = game.place(tool, k); if (err) say(err); return; }
    if (tool === 'track' && S.phase === 'build' && !n) say('Drag from the rails or the shed to lay track.');
  }

  addEventListener('load', () => {
    cv = $('#cv'); g = cv.getContext('2d');
    cv.addEventListener('pointerdown', down); cv.addEventListener('pointermove', move); cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', () => (drag = null));
    addEventListener('resize', () => game && layout());
    document.addEventListener('click', (e) => {
      const b = e.target.closest('button'); if (!b || !game) return; const S = game.S;
      if (b.dataset.again != null) start();
      else if (b.dataset.tool) { const t = b.dataset.tool; if (CARS[t]) { const err = game.place(t, ''); if (err) say(err); } else tool = t; sel = -1; }
      else if (b.dataset.car != null) { const i = +b.dataset.car; if (sel < 0) sel = i; else if (sel === i) { game.sellCar(i); sel = -1; } else { game.swap(sel, i); sel = -1; } }
      else if (b.id === 'go') { sel = -1; const err = game.send(); if (err) say(err); }
      else if (b.id === 'spd') S.speed = S.speed % 3 + 1;
      pkey = '';
    });
    start(); say('Drag from the shed around the base to lay your first loop.');
    if (/[?&]dev\b/.test(location.search)) window.__ll = { game: () => game, start, px: (c, r) => { const b = cv.getBoundingClientRect(); return [b.left + ox + (c + 0.5) * T, b.top + oy + (r + 0.5) * T]; }, setTool: (t) => { tool = t; pkey = ''; } };
  });
})();
