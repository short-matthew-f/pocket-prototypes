// Pocket Prototypes kit: the shared frame every game MVP plugs into.
//   characters screen -> upgrade tree -> run (game-owned canvas) -> results -> tree ... ; the tree's win node makes the
//   next run a "boss" run; winning unlocks the next character, who replays the whole tree from scratch.
// A game calls Kit.game(config). See README.md for the config contract. Saves are per game, this device only.
(function () {
  'use strict';
  const $ = (s) => document.querySelector(s);
  const DEV = /[?&]dev\b/.test(location.search);
  const fmt = (n) => { n = Math.floor(n); return n >= 999950000 ? (n / 1e9).toFixed(1) + 'B' : n >= 999950 ? (n / 1e6).toFixed(1) + 'M' : n >= 1e4 ? (n / 1e3).toFixed(1) + 'k' : String(n); };

  // ---------------------------------------------------------------- sound
  let AC = null, muted = false;
  const audio = () => { if (!AC) try { AC = new (window.AudioContext || window.webkitAudioContext)(); } catch { AC = null; } if (AC && AC.state === 'suspended') AC.resume(); return AC; };
  function tone(f, d = 0.1, type = 'sine', v = 0.1, slide = 0, delay = 0) {
    const a = audio(); if (!a || muted) return;
    const o = a.createOscillator(), g = a.createGain(), t = a.currentTime + delay;
    o.type = type; o.frequency.setValueAtTime(f, t); if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, f * slide), t + d);
    g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    o.connect(g).connect(a.destination); o.start(t); o.stop(t + d + 0.02);
  }
  function noise(d = 0.12, v = 0.08, hp = 800) {
    const a = audio(); if (!a || muted) return;
    const b = a.createBuffer(1, Math.ceil(a.sampleRate * d), a.sampleRate), ch = b.getChannelData(0);
    for (let i = 0; i < ch.length; i++) ch[i] = (Math.random() * 2 - 1) * (1 - i / ch.length);
    const s = a.createBufferSource(), f = a.createBiquadFilter(), g = a.createGain();
    s.buffer = b; f.type = 'highpass'; f.frequency.value = hp; g.gain.value = v; s.connect(f).connect(g).connect(a.destination); s.start();
  }
  const last = {};
  const throttle = (k, ms) => { const n = performance.now(); if (n - (last[k] || 0) < ms) return false; last[k] = n; return true; };
  const sfx = {
    tone, noise,
    pop: (p = 1) => throttle('pop', 30) && tone(280 * p + Math.random() * 200, 0.08, 'triangle', 0.12, 0.5),
    crack: () => throttle('crack', 40) && noise(0.09, 0.09, 1500),
    hit: () => throttle('hit', 45) && tone(120 + Math.random() * 40, 0.1, 'square', 0.06, 0.6),
    zap: () => throttle('zap', 50) && tone(900, 0.07, 'sawtooth', 0.04, 0.4),
    boom: () => { noise(0.35, 0.16, 120); tone(70, 0.4, 'sine', 0.2, 0.5); },
    ding: () => { tone(1320, 0.12, 'sine', 0.09); tone(1760, 0.14, 'sine', 0.07, 1, 0.07); },
    coin: () => throttle('coin', 40) && tone(1500 + Math.random() * 300, 0.06, 'square', 0.035),
    buy: () => { tone(520, 0.08, 'triangle', 0.1); tone(780, 0.1, 'triangle', 0.1, 1, 0.06); },
    nope: () => tone(140, 0.12, 'square', 0.05),
    end: () => tone(330, 0.45, 'triangle', 0.1, 0.5),
    win: () => [523, 659, 784, 1046, 1318].forEach((f, i) => tone(f, 0.22, 'triangle', 0.11, 1, i * 0.11)),
  };

  // ---------------------------------------------------------------- juice helpers (games may use these)
  /** Particle/floater bag a game owns: fx.burst(x,y,n,colors), fx.text(x,y,str,color), fx.ring(x,y,r,color); fx.update(dt); fx.draw(ctx). */
  function makeFx() {
    let ps = [];
    return {
      shake: 0,
      burst(x, y, n = 8, colors = ['#ffd166'], speed = 160, size = 3.5) { for (let i = 0; i < n; i++) { const a = Math.random() * 6.283, v = speed * (0.35 + Math.random()); ps.push({ k: 'p', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - speed * 0.4, t: 0, life: 0.5 + Math.random() * 0.4, c: colors[i % colors.length], s: size }); } },
      text(x, y, s, c = '#fff', size = 15) { ps.push({ k: 't', x, y, s, c, size, t: 0, life: 0.9 }); },
      ring(x, y, r = 60, c = '#fff') { ps.push({ k: 'r', x, y, r, c, t: 0, life: 0.35 }); },
      update(dt) { for (const p of ps) p.t += dt; ps = ps.filter((p) => p.t < p.life); this.shake = Math.max(0, this.shake - dt * 30); },
      draw(g) {
        for (const p of ps) {
          const q = p.t / p.life; g.globalAlpha = 1 - q;
          if (p.k === 'p') { g.fillStyle = p.c; g.beginPath(); g.arc(p.x + p.vx * p.t, p.y + p.vy * p.t + 300 * p.t * p.t, p.s, 0, 6.283); g.fill(); }
          else if (p.k === 't') { g.fillStyle = p.c; g.font = `800 ${p.size}px "Lilita One", system-ui`; g.textAlign = 'center'; g.fillText(p.s, p.x, p.y - 36 * q); }
          else { g.strokeStyle = p.c; g.lineWidth = 4 * (1 - q) + 1; g.beginPath(); g.arc(p.x, p.y, p.r * (0.3 + q), 0, 6.283); g.stroke(); }
        }
        g.globalAlpha = 1;
      },
    };
  }

  // ---------------------------------------------------------------- the game frame
  function game(cfg) {
    const KEY = 'pp.' + cfg.id;
    const CUR = cfg.currencies; // [{id, name, color}]
    const cur0 = CUR[0].id;
    let S;
    try { S = JSON.parse(localStorage.getItem(KEY)) || null; } catch { S = null; }
    if (!S) S = { cur: cfg.characters[0].id, wins: 0, chars: {}, muted: false };
    // saves outlive builds: nodes and characters are looked up by id, so new ones simply start at 0. A game that renames
    // or removes ids can fix old saves here (S.v is the game's saveVersion the save was last written with).
    if (cfg.migrate && (S.v || 0) < (cfg.saveVersion || 0)) try { cfg.migrate(S, S.v || 0); } catch { /* keep the save as is */ }
    S.v = cfg.saveVersion || 0;
    muted = S.muted;
    const save = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch { /* private window: still playable */ } };
    const charSave = (who) => (S.chars[who] ||= { levels: {}, wallet: {}, runs: 0, won: false, best: null, time: 0 });
    const ch = () => cfg.characters.find((c) => c.id === S.cur) || cfg.characters[0];
    const nodesFor = (who) => cfg.nodes.filter((n) => !n.who || n.who === who);
    const costOf = (n, lv) => Math.ceil(n.cost * (n.grow || 1.6) ** lv);
    const curOf = (n) => n.cur || cur0;
    const visible = (n, lv) => !n.req || !n.req.length || n.req.filter((r) => (lv[r] || 0) > 0).length >= (n.reqAll || 1);
    const extraOk = (n, C) => !n.extra || Object.entries(n.extra).every(([k, v]) => (C.wallet[k] || 0) >= v);
    function statsFor(who, levels) {
      const s = cfg.baseStats(who);
      for (const n of nodesFor(who)) { const l = levels[n.id] || 0; if (l && n.fx) n.fx(s, l); }
      return s;
    }
    const unlocked = () => cfg.characters.filter((c) => S.wins >= (c.unlock || 0)).map((c) => c.id);
    const wallet = (C) => CUR.filter((c, i) => i === 0 || (C.wallet[c.id] || 0) > 0 || nodesFor(S.cur).some((n) => curOf(n) === c.id && visible(n, C.levels)))
      .map((c) => `<b style="color:${c.color || 'var(--accent)'}">${fmt(C.wallet[c.id] || 0)}</b> ${c.name}`).join(' · ');

    document.title = cfg.title;
    // iOS home-screen app: status bar coloured by theme-color (no apple-mobile-web-app-status-bar-style meta: on iOS 26.1+
    // both values draw a blurred band over the page; Apple says to omit it), and the icon's name
    const meta = (n, c) => { let m = document.querySelector(`meta[name="${n}"]`); if (!m) { m = document.createElement('meta'); m.name = n; document.head.appendChild(m); } m.content = c; };
    meta('theme-color', cfg.colors?.bg || '#16141f'); meta('apple-mobile-web-app-title', cfg.title);
    document.documentElement.style.setProperty('--accent', cfg.colors?.accent || '#ffd166');
    document.documentElement.style.setProperty('--bg', cfg.colors?.bg || '#16141f');
    document.documentElement.style.setProperty('--card', cfg.colors?.card || '#24213a');
    document.body.insertAdjacentHTML('beforeend', `
      <section class="screen" id="k-title"><div class="wrap">
        <p class="crumbs"><a href="../">← All prototypes</a></p>
        <h1>${cfg.title}</h1><p class="tag">${cfg.tagline}</p>
        <div id="k-chars"></div>
        <button type="button" class="big" id="k-go">Play</button>
        <div class="row"><button type="button" class="ghost" id="k-mute"></button><button type="button" class="ghost" id="k-reset">Reset progress</button></div>
        <p class="how">${cfg.howTo || ''}</p>
      </div></section>
      <section class="screen" id="k-tree" hidden>
        <div class="top wrap"><button type="button" class="ghost" id="k-back">← Characters</button><span id="k-who"></span><span id="k-wallet"></span></div>
        <div id="k-map"></div>
        <div class="bar wrap"><div id="k-info"></div><button type="button" class="big" id="k-start">${cfg.runVerb || 'Go!'}</button></div>
      </section>
      <section class="screen" id="k-run" hidden><canvas id="k-field"></canvas><div id="k-ui"></div>
        <button type="button" id="k-pause" aria-label="Pause">❚❚</button><div id="k-modal" hidden></div><div id="k-over" hidden></div></section>`);
    const show = (id) => document.querySelectorAll('.screen').forEach((s) => { s.hidden = s.id !== id; });

    // ---- characters
    function title() {
      show('k-title');
      const un = unlocked();
      $('#k-chars').innerHTML = cfg.characters.map((c) => {
        const open = un.includes(c.id), C = S.chars[c.id];
        return `<button type="button" class="char${c.id === S.cur ? ' on' : ''}" data-c="${c.id}" ${open ? '' : 'disabled'}>
          <canvas width="168" height="168" data-face="${c.id}"></canvas><span class="cn">${open ? c.name : '???'}</span>
          <span class="cb">${open ? c.blurb : `Beat the boss ${c.unlock === 1 ? 'once' : c.unlock + ' times'} to unlock`}</span>
          <span class="cs">${C?.won ? `<span class="badge">Won${C.best ? ` in ${C.best} runs` : ''}</span>` : C?.runs ? `<span class="badge dim">${C.runs} run${C.runs > 1 ? 's' : ''}</span>` : open ? '<span class="badge dim">New</span>' : ''}
          ${open && C?.top ? `<span class="cbest">Best ${cfg.scoreName || 'score'} ${fmt(C.top)}</span>` : ''}</span></button>`;
      }).join('');
      document.querySelectorAll('[data-face]').forEach((cv) => {
        const g = cv.getContext('2d'); g.scale(2, 2); const locked = !un.includes(cv.dataset.face);
        if (locked || !cfg.drawFace) { g.fillStyle = '#ffffff14'; g.beginPath(); g.arc(42, 42, 32, 0, 6.283); g.fill(); g.font = '900 30px system-ui'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#ffffff66'; g.fillText(locked ? '?' : (cfg.characters.find((c) => c.id === cv.dataset.face).icon || '★'), 42, 44); }
        else cfg.drawFace(g, cv.dataset.face, 42, 44, 30);
      });
      $('#k-mute').textContent = S.muted ? 'Sound: off' : 'Sound: on';
      playLabel();
    }
    function playLabel() {
      const C = S.chars[S.cur];
      $('#k-go').textContent = `${C?.runs ? 'Continue' : 'Play'} as ${ch().name}`;
    }
    function pickChar(id) { // select in place: no re-render, nothing moves
      S.cur = id; save();
      document.querySelectorAll('.char').forEach((b) => { b.classList.toggle('on', b.dataset.c === id); b.setAttribute('aria-pressed', b.dataset.c === id); });
      playLabel();
    }

    // ---- tree
    let sel = null, justBought = null, overAt = 0;
    const CELL = 92;
    function tree() {
      show('k-tree');
      const who = S.cur, C = charSave(who), nodes = nodesFor(who);
      $('#k-wallet').innerHTML = wallet(C) + (DEV ? ' <button type="button" class="ghost tiny" id="k-dev">+lots</button>' : '');
      $('#k-who').textContent = ch().name;
      const vis = nodes.filter((n) => n.win || visible(n, C.levels) || (n.req || []).some((r) => (C.levels[r] || 0) > 0)); // the goal shows (fogged) from the start
      const xs = nodes.map((n) => n.x), ys = nodes.map((n) => n.y); // all nodes, hidden too: the plane never resizes
      const x0 = Math.min(...xs) - 1, y0 = Math.min(...ys) - 1, w = (Math.max(...xs) - x0 + 2) * CELL, h = (Math.max(...ys) - y0 + 2) * CELL;
      const pos = (n) => [(n.x - x0) * CELL + CELL / 2, (n.y - y0) * CELL + CELL / 2];
      const lines = vis.flatMap((n) => (n.req || []).map((r) => nodes.find((m) => m.id === r)).filter((m) => m && vis.includes(m)).map((m) => {
        const [a, b] = pos(n), [c, d] = pos(m); return `<line x1="${a}" y1="${b}" x2="${c}" y2="${d}" class="${(C.levels[m.id] || 0) ? 'on' : ''}"/>`;
      })).join('');
      const btn = (n) => {
        const lv = C.levels[n.id] || 0, shown = visible(n, C.levels), max = lv >= (n.max || 1);
        const can = shown && !max && (C.wallet[curOf(n)] || 0) >= costOf(n, lv) && extraOk(n, C);
        const [x, y] = pos(n);
        return `<button type="button" class="node${max ? ' max' : can ? ' can' : ''}${shown ? '' : ' fog'}${n.win ? ' win' : ''}${sel === n.id ? ' sel' : ''}${justBought === n.id ? ' just' : ''}" style="left:${x}px;top:${y}px" data-n="${n.id}" aria-label="${n.name}">
          <span class="ni">${n.icon || '•'}</span>${(n.max || 1) > 1 ? `<span class="nl">${lv}/${n.max}</span>` : ''}</button>`;
      };
      $('#k-map').innerHTML = `<div class="plane" style="width:${w}px;height:${h}px"><svg width="${w}" height="${h}">${lines}</svg>${vis.map(btn).join('')}</div>`;
      info(); justBought = null;
      const root = nodes.find((n) => !n.req || !n.req.length) || nodes[0], [rx, ry] = pos(root), m = $('#k-map');
      if (!m.dataset.centred) { m.scrollLeft = rx - m.clientWidth / 2; m.scrollTop = ry - m.clientHeight / 2; m.dataset.centred = '1'; }
    }
    function info() {
      const C = charSave(S.cur), n = nodesFor(S.cur).find((x) => x.id === sel);
      if (!n) {
        const ready = nodesFor(S.cur).filter((x) => visible(x, C.levels) && (C.levels[x.id] || 0) < (x.max || 1) && (C.wallet[curOf(x)] || 0) >= costOf(x, C.levels[x.id] || 0) && extraOk(x, C)).length;
        $('#k-info').innerHTML = `<div class="it"><div class="ih"><b>${ready ? `${ready} upgrade${ready > 1 ? 's' : ''} ready` : 'Upgrades'}</b></div><p>${ready ? 'Glowing ones are affordable. Tap one to see it.' : `Nothing affordable yet. Run again to earn more ${CUR[0].name}.`}</p></div>
          <button type="button" class="buy" disabled>Select one</button>`;
        return;
      }
      if (!visible(n, C.levels)) { // a fogged node still explains itself: what it is and what opens it
        const need = (n.req || []).filter((r) => !(C.levels[r] || 0)).map((r) => nodesFor(S.cur).find((m) => m.id === r)?.name).filter(Boolean);
        const k = n.reqAll || 1, have = (n.req || []).length - need.length;
        $('#k-info').innerHTML = `<div class="it"><div class="ih"><b>${n.name}</b><span class="lvl">Locked</span></div><p>${n.win ? 'The goal. ' : ''}Needs ${k > 1 ? `${k - have} more of: ` : ''}${need.join(k > 1 ? ', ' : ' or ')}</p></div>
          <button type="button" class="buy" disabled>Locked</button>`;
        return;
      }
      const lv = C.levels[n.id] || 0, max = lv >= (n.max || 1), c = costOf(n, lv), cu = CUR.find((x) => x.id === curOf(n));
      const can = !max && (C.wallet[curOf(n)] || 0) >= c && extraOk(n, C);
      const extra = n.extra ? Object.entries(n.extra).map(([k, v]) => ` + ${fmt(v)} ${CUR.find((x) => x.id === k).name}`).join('') : '';
      $('#k-info').innerHTML = `<div class="it"><div class="ih"><b>${n.name}</b>${(n.max || 1) > 1 ? `<span class="lvl">Lv ${lv}/${n.max}</span>` : ''}</div><p>${typeof n.desc === 'function' ? n.desc(lv, C.levels) : n.desc}</p></div>
        <button type="button" id="k-buy" class="buy" ${can ? '' : 'disabled'}>${max ? 'Maxed' : `<span class="bv">${can ? 'Buy' : 'Need'}</span> ${fmt(c)} ${cu.name}${extra}`}</button>`;
    }
    function buy(id) {
      const C = charSave(S.cur), n = nodesFor(S.cur).find((x) => x.id === id);
      if (!n || !visible(n, C.levels)) return false;
      const lv = C.levels[id] || 0; if (lv >= (n.max || 1)) return false;
      const c = costOf(n, lv), k = curOf(n);
      if ((C.wallet[k] || 0) < c || !extraOk(n, C)) return false;
      C.wallet[k] -= c; if (n.extra) for (const [x, v] of Object.entries(n.extra)) C.wallet[x] -= v;
      C.levels[id] = lv + 1; return true;
    }

    // ---- a run
    let R = null, raf = 0, lastT = 0, DPR = 1, cv, g, paused = false, picking = null;
    const input = { x: 0, y: 0, down: false, taps: [], released: false };
    function startRun() {
      const C = charSave(S.cur), winNode = nodesFor(S.cur).find((n) => n.win);
      show('k-run'); $('#k-over').hidden = true; $('#k-modal').hidden = true; $('#k-ui').innerHTML = ''; paused = false; picking = null; $('#k-pause').hidden = false;
      cv = $('#k-field'); g = cv.getContext('2d'); DPR = Math.min(2, window.devicePixelRatio || 1);
      const W = cv.clientWidth, H = cv.clientHeight; cv.width = Math.round(W * DPR); cv.height = Math.round(H * DPR);
      input.x = W / 2; input.y = H * 0.6; input.down = false; input.taps = [];
      R = cfg.createRun({ who: S.cur, stats: statsFor(S.cur, C.levels), levels: C.levels, W, H, boss: !!(winNode && C.levels[winNode.id]), sfx, fx: makeFx(), fmt, ui: $('#k-ui'), runNo: C.runs + 1, pick, best: C.top || 0 });
      lastT = performance.now(); cancelAnimationFrame(raf); raf = requestAnimationFrame(loop);
    }
    function loop(now) {
      const dt = Math.max(0, Math.min(0.05, (now - lastT) / 1000)); lastT = now; // the first rAF time can predate lastT
      if (!paused && !picking) R.update(dt, input);
      input.taps = []; input.released = false;
      g.setTransform(DPR, 0, 0, DPR, 0, 0);
      R.draw(g);
      if (R.over) return finish();
      raf = requestAnimationFrame(loop);
    }
    /** Mid-run "pick one" card choice: pauses the run until a card is tapped, then calls done(index).
        options: [{icon, name, desc, tag?}] (2-4). Games call env.pick(title, options, done). */
    function pick(heading, options, done) {
      picking = { done }; input.down = false;
      const m = $('#k-modal'); m.hidden = false;
      m.innerHTML = `<h2>${heading}</h2><div class="picks">${options.map((o, i) => `<button type="button" class="pk" data-pick="${i}">
        <span class="pi">${o.icon || '★'}</span><span class="pn">${o.name}</span><span class="pd">${o.desc || ''}</span>${o.tag ? `<span class="badge dim">${o.tag}</span>` : ''}</button>`).join('')}</div>`;
      sfx.ding();
    }
    function setPaused(on) {
      if (!R || R.over || picking) return;
      paused = on; input.down = false;
      const m = $('#k-modal'); m.hidden = !on;
      if (on) m.innerHTML = `<h2>Paused</h2><button type="button" class="big" id="k-resume">Resume</button>
        <button type="button" class="ghost" id="k-quit">End run (keep what you earned)</button>`;
      else lastT = performance.now();
    }
    function quitRun() { paused = false; $('#k-modal').hidden = true; if (R.quit) R.quit(); try { R.over = true; } catch { /* over is a getter in some games */ } cancelAnimationFrame(raf); finish(); }
    document.addEventListener('visibilitychange', () => { if (document.hidden && !$('#k-run').hidden) setPaused(true); });
    const readyCount = (C) => nodesFor(S.cur).filter((x) => !x.win && visible(x, C.levels) && (C.levels[x.id] || 0) < (x.max || 1) && (C.wallet[curOf(x)] || 0) >= costOf(x, C.levels[x.id] || 0) && extraOk(x, C)).length;
    function finish() {
      const C = charSave(S.cur), res = R.result(); // {earned: {cur: n}, won, lines: [str], score?}
      $('#k-pause').hidden = true; let newTop = false;
      if (res.score != null && res.score > (C.top || 0)) { newTop = C.runs > 0; C.top = Math.floor(res.score); }
      for (const [k, v] of Object.entries(res.earned || {})) C.wallet[k] = (C.wallet[k] || 0) + Math.floor(v);
      C.runs++; C.time += R.t || 0;
      let newChar = null;
      if (res.won) {
        if (!C.won) { C.won = true; S.wins++; newChar = cfg.characters.find((c) => (c.unlock || 0) === S.wins) || null; }
        C.best = C.best == null ? C.runs : Math.min(C.best, C.runs);
        const wn = nodesFor(S.cur).find((n) => n.win); if (wn) C.levels[wn.id] = 0;
        sfx.win();
      } else sfx.end();
      save();
      const o = $('#k-over'); o.hidden = false; o.classList.remove('in'); void o.offsetWidth; o.classList.add('in'); overAt = performance.now();
      const got = Object.entries(res.earned || {}).filter(([, v]) => v >= 1).map(([k, v]) => `<b>+${fmt(v)}</b> ${CUR.find((c) => c.id === k).name}`).join(' · ');
      o.innerHTML = res.won
        ? `<h2>${cfg.winTitle || 'Victory!'}</h2><p>${ch().name} won in ${C.runs} runs.</p>${got ? `<p>${got}</p>` : ''}
           ${newChar ? `<p class="unlock">Unlocked: <b>${newChar.name}</b></p><p class="small">${newChar.blurb}</p>` : '<p class="small">Pick another character for a fresh tree, or buy the final upgrade again.</p>'}
           <div class="obtns"><button type="button" class="big" id="k-totitle">${newChar ? 'Meet ' + newChar.name : 'Characters'}</button>
           <button type="button" class="ghost" id="k-totree">Keep playing ${ch().name}</button></div>`
        : `<h2>${res.title || cfg.loseTitle || 'Run over'}</h2>${newTop ? `<p class="unlock">New best ${cfg.scoreName || 'score'}: <b>${fmt(res.score)}</b></p>` : ''}${got ? `<p>${got}</p>` : ''}${(res.lines || []).map((l) => `<p class="small">${l}</p>`).join('')}
           <div class="obtns"><button type="button" class="big" id="k-totree">${readyCount(C) ? `Upgrade · ${readyCount(C)} ready` : 'Upgrade'}</button>
           <button type="button" class="ghost" id="k-again">Run again</button></div>`;
    }

    // ---- input
    const field = () => $('#k-field');
    const pt = (e) => { const r = field().getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top - (e.pointerType === 'touch' ? (cfg.touchOffset || 0) : 0)]; };
    field().addEventListener('pointerdown', (e) => { audio(); field().setPointerCapture?.(e.pointerId); const [x, y] = pt(e); input.x = x; input.y = y; input.down = true; input.taps.push({ x, y }); e.preventDefault(); });
    field().addEventListener('pointermove', (e) => { const [x, y] = pt(e); input.x = x; input.y = y; if (e.pointerType === 'mouse' && cfg.hoverIsDown) input.down = true; });
    field().addEventListener('pointerup', (e) => { if (!(e.pointerType === 'mouse' && cfg.hoverIsDown)) { input.down = false; input.released = true; } });
    field().addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') input.down = false; });
    document.addEventListener('click', (e) => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.closest('#k-over') && performance.now() - overAt < 600) return; // a tap still landing from the run can't skip the results
      audio();
      if (b.dataset.c) { sfx.pop(); pickChar(b.dataset.c); }
      else if (b.id === 'k-go') { sel = null; $('#k-map').dataset.centred = ''; charSave(S.cur).runs ? tree() : startRun(); }
      else if (b.id === 'k-mute') { S.muted = muted = !S.muted; save(); b.textContent = S.muted ? 'Sound: off' : 'Sound: on'; }
      else if (b.id === 'k-reset') { if (b.dataset.sure) { localStorage.removeItem(KEY); location.reload(); } else { b.dataset.sure = '1'; b.textContent = 'Tap again to erase'; } }
      else if (b.dataset.n) { if (sel !== b.dataset.n) { sel = b.dataset.n; sfx.pop(1.4); tree(); } }
      else if (b.dataset.pick && picking) { const p = picking; picking = null; $('#k-modal').hidden = true; lastT = performance.now(); sfx.buy(); p.done(+b.dataset.pick); }
      else if (b.id === 'k-pause') setPaused(!paused);
      else if (b.id === 'k-resume') setPaused(false);
      else if (b.id === 'k-quit') quitRun();
      else if (b.id === 'k-buy') { if (buy(sel)) { sfx.buy(); justBought = sel; save(); } else sfx.nope(); tree(); }
      else if (b.id === 'k-start' || b.id === 'k-again') startRun();
      else if (b.id === 'k-totree') tree();
      else if (b.id === 'k-totitle' || b.id === 'k-back') title();
      else if (b.id === 'k-dev') { const C = charSave(S.cur); for (const c of CUR) C.wallet[c.id] = (C.wallet[c.id] || 0) + 1e6; save(); tree(); }
    });
    title();
    return { S, statsFor, buy, charSave };
  }

  window.Kit = { game, sfx, makeFx, fmt, DEV };
})();
