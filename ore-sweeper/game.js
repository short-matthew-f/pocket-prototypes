// Ore Sweeper: drag the drill across the rock face; ore under it cracks and pays out until the lamp oil runs out.
// Reference game for the kit (see ../README.md). Nodebuster loop in mining clothes.
(function () {
  'use strict';
  const NODES = [
    { id: 'drill', name: 'Wider Bit', icon: '⛏️', desc: '+8 drill size', cost: 4, grow: 1.55, max: 8, req: [], x: 0, y: 0, fx: (s, l) => { s.radius += 8 * l; } },
    { id: 'steel', name: 'Tempered Steel', icon: '🔩', desc: '+35% drill damage', cost: 7, grow: 1.6, max: 10, req: ['drill'], x: 1, y: 0, fx: (s, l) => { s.dps *= 1.35 ** l; } },
    { id: 'oil', name: 'Bigger Lamp', icon: '🪔', desc: '+2s lamp oil', cost: 9, grow: 1.7, max: 8, req: ['drill'], x: -1, y: 0, fx: (s, l) => { s.oil += 2 * l; } },
    { id: 'seams', name: 'Rich Seams', icon: '🪨', desc: 'Ore appears faster', cost: 14, grow: 1.7, max: 8, req: ['steel'], x: 1, y: -1, fx: (s, l) => { s.spawn *= 0.86 ** l; } },
    { id: 'assay', name: 'Assayer', icon: '⚖️', desc: '+40% ore per node', cost: 18, grow: 1.75, max: 10, req: ['steel'], x: 2, y: 0, fx: (s, l) => { s.value *= 1 + 0.4 * l; } },
    { id: 'wick', name: 'Long Wick', icon: '🕯️', desc: 'Each crack refills a little oil', cost: 35, grow: 1.9, max: 5, req: ['oil'], x: -1, y: -1, fx: (s, l) => { s.onPop += 0.12 * l; } },
    { id: 'face', name: 'Wider Face', icon: '🧱', desc: '+4 ore nodes at once', cost: 30, grow: 1.8, max: 6, req: ['seams'], x: 1, y: -2, fx: (s, l) => { s.maxNodes += 4 * l; } },
    { id: 'lucky', name: 'Lucky Strike', icon: '🍀', desc: '+6% chance of a x3 hit', cost: 45, grow: 1.9, max: 8, req: ['assay'], x: 3, y: 0, fx: (s, l) => { s.crit += 0.06 * l; } },
    { id: 'blast', name: 'Blasting Caps', icon: '🧨', desc: 'Cracked ore blasts its neighbours', cost: 70, grow: 2, max: 6, req: ['lucky'], x: 4, y: 0, fx: (s, l) => { s.splash += 0.3 * l; } },
    { id: 'carts', name: 'Mine Carts', icon: '🛒', desc: '+1 cart that rolls into ore on its own', cost: 80, grow: 2.05, max: 6, req: ['wick'], x: -2, y: -1, fx: (s, l) => { s.helpers += l; } },
    { id: 'rails', name: 'Better Rails', icon: '🛤️', desc: 'Carts hit 50% harder', cost: 120, grow: 1.95, max: 6, req: ['carts'], x: -3, y: -1, fx: (s, l) => { s.helperDps *= 1.5 ** l; } },
    { id: 'iron', name: 'Iron Veins', icon: '⚙️', desc: 'Iron nodes: 5x tougher, 8x ore', cost: 110, grow: 2.1, max: 5, req: ['face'], x: 1, y: -3, fx: (s, l) => { s.big += 0.08 * l; } },
    { id: 'geode', name: 'Geode Sense', icon: '💎', desc: 'Geodes drop gems', cost: 40, grow: 2.2, max: 5, req: ['assay'], x: 2, y: 1, fx: (s, l) => { s.gem += 0.035 * l; } },
    { id: 'cluster', name: 'Crystal Clusters', icon: '🔮', desc: 'Clusters shatter into shards', cost: 260, grow: 2.2, max: 5, req: ['iron'], x: 2, y: -3, fx: (s, l) => { s.cluster += 0.06 * l; } },
    { id: 'canary', name: 'Canary', icon: '🐤', desc: 'Oil burns 10% slower', cost: 3, grow: 1.8, max: 5, req: ['geode'], x: 2, y: 2, cur: 'gems', fx: (s, l) => { s.drain *= 0.9 ** l; } },
    { id: 'crew', name: 'Night Shift', icon: '👷', desc: '+2 carts', cost: 4, grow: 1.9, max: 4, req: ['rails'], x: -4, y: -1, cur: 'gems', fx: (s, l) => { s.helpers += 2 * l; } },
    { id: 'chain', name: 'Chain Charges', icon: '💥', desc: 'Blasts reach further', cost: 4, grow: 1.9, max: 4, req: ['blast'], x: 5, y: 0, cur: 'gems', fx: (s, l) => { s.splashR += 22 * l; } },
    { id: 'auger', name: 'Mithril Auger', icon: '🌀', desc: '+14 size, +25% damage', cost: 5, grow: 2, max: 4, req: ['geode'], x: 3, y: 1, cur: 'gems', fx: (s, l) => { s.radius += 14 * l; s.dps *= 1.25 ** l; } },
    { id: 'dwarfsp', who: 'dwarf', name: 'Stubborn', icon: '🧔', desc: '+20% damage per node under the drill', cost: 40, grow: 1.9, max: 5, req: ['steel'], x: 0, y: -1, fx: (s, l) => { s.crowd += 0.2 * l; } },
    { id: 'gnomesp', who: 'gnome', name: 'Clockwork', icon: '🔧', desc: 'Starts with +2 carts; carts faster', cost: 40, grow: 1.9, max: 5, req: ['oil'], x: 0, y: -1, fx: (s, l) => { s.helpers += 1; s.cartSpeed *= 1.15 ** l; } },
    { id: 'molesp', who: 'mole', name: 'Deep Rumble', icon: '🌋', desc: 'Tremors hit harder and more often', cost: 40, grow: 1.9, max: 5, req: ['drill'], x: 0, y: -1, fx: (s, l) => { s.quake *= 1.4 ** l; s.quakeEvery *= 0.9 ** l; } },
    { id: 'heart', name: 'Map to the Heart', icon: '❤️‍🔥', desc: 'Your next dig reaches the Heart of the Mountain. Crack it to win.', cost: 3000, grow: 1, max: 1, req: ['cluster', 'canary', 'crew', 'chain', 'auger'], reqAll: 3, extra: { gems: 15 }, x: 3, y: -4, win: true },
  ];

  const HEART_HP = 9000;
  function createRun(env) {
    const s = env.stats, W = env.W, H = env.H, fx = env.fx, sfx = env.sfx, rnd = Math.random;
    const R = { t: 0, over: false, oil: s.oil, nodes: [], ore: 0, gems: 0, cracked: 0, spawnT: 0, quakeT: s.quakeEvery, won: false,
      heart: env.boss ? { x: W / 2, y: H * 0.42, r: Math.min(W, H) * 0.19, hp: HEART_HP, max: HEART_HP, hitT: -1 } : null,
      carts: Array.from({ length: s.helpers }, (_, i) => ({ x: W * (0.15 + 0.7 * ((i * 0.37) % 1)), y: H - 40, target: null })) };
    function spawn(x, y, kind) {
      if (!kind) kind = rnd() < s.cluster ? 'cluster' : rnd() < s.big ? 'iron' : rnd() < s.gem ? 'geode' : 'copper';
      const k = { copper: [1, 1, 20], iron: [5, 8, 30], geode: [2, 3, 22], cluster: [3, 4, 24], shard: [0.5, 1, 12] }[kind];
      R.nodes.push({ kind, x: x ?? 34 + rnd() * (W - 68), y: y ?? 100 + rnd() * (H - 190), r: k[2], hp: s.hp * k[0], max: s.hp * k[0], val: s.value * k[1], born: R.t, hitT: -1, rot: rnd() * 6 });
    }
    function hit(n, d) {
      if (rnd() < s.crit) { d *= 3; if (sfx) sfx.hit(); }
      n.hp -= d; n.hitT = R.t;
      if (n.hp <= 0 && !n.dead) crack(n);
    }
    function crack(n) {
      n.dead = true; R.ore += n.val; R.cracked++;
      R.oil = Math.min(R.oil + s.onPop / (1 + R.cracked / 120), s.oil + 6);
      sfx.crack();
      fx.burst(n.x, n.y, n.kind === 'iron' ? 12 : 6, n.kind === 'geode' ? ['#c77dff', '#e0aaff'] : n.kind === 'iron' ? ['#adb5bd', '#ced4da'] : ['#e09f3e', '#f4a261', '#9c6644'], 150);
      fx.text(n.x, n.y - 8, '+' + env.fmt(n.val), '#ffe8b0');
      if (n.kind === 'geode') { R.gems++; sfx.ding(); fx.text(n.x, n.y - 30, '+1 gem', '#e0aaff', 18); }
      if (n.kind === 'iron' || n.kind === 'cluster') fx.shake = Math.max(fx.shake, 5);
      if (n.kind === 'cluster') for (let i = 0; i < 4; i++) { const a = i * 1.57 + rnd(); spawn(n.x + Math.cos(a) * 28, n.y + Math.sin(a) * 28, 'shard'); }
      if (s.splash) for (const o of R.nodes) if (!o.dead && o !== n && Math.hypot(o.x - n.x, o.y - n.y) < s.splashR + o.r) hit(o, n.max * s.splash);
    }
    return {
      get over() { return R.over; }, get t() { return R.t; },
      update(dt, input) {
        R.in = { x: input.x, y: input.y, down: input.down };
        if (R.over) return;
        R.t += dt;
        R.oil -= s.drain * (1 + Math.max(0, R.t - 10) / 10) * dt; // the deeper you dig, the faster the lamp burns
        R.spawnT -= dt;
        while (R.spawnT <= 0) { R.spawnT += s.spawn; if (R.nodes.length < s.maxNodes) spawn(); }
        if (input.down) {
          const under = R.nodes.filter((n) => Math.hypot(n.x - input.x, n.y - input.y) < s.radius + n.r);
          const m = 1 + s.crowd * Math.max(0, under.length - 1);
          for (const n of under) hit(n, s.dps * m * dt);
          if (R.heart && Math.hypot(R.heart.x - input.x, R.heart.y - input.y) < s.radius + R.heart.r) { R.heart.hp -= s.dps * dt; R.heart.hitT = R.t; }
        }
        if (s.quake) {
          R.quakeT -= dt;
          if (R.quakeT <= 0) { R.quakeT += s.quakeEvery; sfx.boom(); fx.shake = 8; fx.ring(W / 2, H / 2, Math.max(W, H) * 0.7, '#ffd08a'); for (const n of R.nodes) hit(n, s.quake * s.dps / 4.8); if (R.heart) R.heart.hp -= s.quake * s.dps / 4.8; }
        }
        for (const c of R.carts) {
          if (!c.target || c.target.dead) c.target = R.nodes.filter((n) => !n.dead).sort((a, b) => Math.hypot(a.x - c.x, a.y - c.y) - Math.hypot(b.x - c.x, b.y - c.y))[0] || null;
          const t = c.target || (R.heart && { x: R.heart.x, y: R.heart.y + R.heart.r * 0.8 });
          if (!t) continue;
          const d = Math.hypot(t.x - c.x, t.y - c.y);
          if (d > 18) { const sp = 240 * s.cartSpeed * dt; c.x += (t.x - c.x) / d * Math.min(sp, d); c.y += (t.y - c.y) / d * Math.min(sp, d); }
          else if (c.target) hit(c.target, s.helperDps * dt); else if (R.heart) R.heart.hp -= s.helperDps * dt;
        }
        R.nodes = R.nodes.filter((n) => !n.dead);
        fx.update(dt);
        if (R.heart && R.heart.hp <= 0) { R.won = true; R.over = true; sfx.boom(); return; }
        if (R.oil <= 0) { R.oil = 0; R.over = true; }
      },
      draw(g) {
        const sx = (rnd() - 0.5) * fx.shake, sy = (rnd() - 0.5) * fx.shake;
        g.save(); g.translate(sx, sy);
        // rock face with strata and lamp light around the drill
        const bg = g.createLinearGradient(0, 0, 0, H); bg.addColorStop(0, '#2b2118'); bg.addColorStop(1, '#120d09');
        g.fillStyle = bg; g.fillRect(-20, -20, W + 40, H + 40);
        g.strokeStyle = 'rgba(255,220,170,.05)'; g.lineWidth = 2;
        for (let i = 0; i < 9; i++) { g.beginPath(); const y = 80 + i * (H / 9); g.moveTo(0, y); for (let x = 0; x <= W; x += 40) g.lineTo(x, y + Math.sin(x * 0.02 + i) * 10); g.stroke(); }
        const lx = R.in?.down ? R.in.x : W / 2, ly = R.in?.down ? R.in.y : H / 2;
        const lamp = g.createRadialGradient(lx, ly, 20, lx, ly, Math.max(W, H) * 0.8);
        lamp.addColorStop(0, 'rgba(255,200,120,.10)'); lamp.addColorStop(0.4, 'rgba(0,0,0,0)'); lamp.addColorStop(1, 'rgba(0,0,0,.55)'); g.fillStyle = lamp; g.fillRect(0, 0, W, H);
        if (R.heart) drawHeart(g, R.heart, R.t);
        for (const n of R.nodes) drawNode(g, n, R.t);
        for (const c of R.carts) { g.fillStyle = '#6c584c'; g.fillRect(c.x - 12, c.y - 7, 24, 12); g.fillStyle = '#222'; g.beginPath(); g.arc(c.x - 7, c.y + 6, 4, 0, 6.28); g.arc(c.x + 7, c.y + 6, 4, 0, 6.28); g.fill(); }
        fx.draw(g);
        g.restore();
        // drill
        if (R.in?.down) drawDrill(g, R.in.x, R.in.y, s.radius, R.t);
        // HUD
        const full = s.oil + 6, w = W - 32;
        g.fillStyle = 'rgba(0,0,0,.5)'; rr(g, 16, 14, w, 14, 7); g.fill();
        g.fillStyle = R.oil < 3 ? '#f28482' : '#ffb703'; rr(g, 16, 14, Math.max(0, w * Math.min(1, R.oil / full)), 14, 7); g.fill();
        g.font = '800 15px Nunito, system-ui'; g.fillStyle = '#fff'; g.textAlign = 'left'; g.fillText('Lamp oil', 18, 46);
        g.textAlign = 'right'; g.fillText(`${env.fmt(R.ore)} ore${R.gems ? ' · ' + R.gems + ' gems' : ''}`, W - 16, 46);
        if (R.heart) { g.textAlign = 'center'; g.fillStyle = '#ff6b6b'; g.fillText('HEART OF THE MOUNTAIN', W / 2, 70); const bw = W - 64; g.fillStyle = 'rgba(0,0,0,.5)'; g.fillRect(32, 80, bw, 9); g.fillStyle = '#ff6b6b'; g.fillRect(32, 80, bw * Math.max(0, R.heart.hp / R.heart.max), 9); }
        if (R.t < 2.2 && !R.in?.down) { g.textAlign = 'center'; g.fillStyle = 'rgba(255,255,255,.85)'; g.font = '800 20px Nunito, system-ui'; g.fillText('Drag the drill over the ore!', W / 2, H * 0.5); }
      },
      result() {
        return R.won ? { won: true, earned: { ore: R.ore, gems: R.gems } }
          : { won: false, title: 'Lamp burned out', earned: { ore: R.ore, gems: R.gems }, lines: [`${R.cracked} nodes cracked in ${Math.round(R.t)}s`] };
      },
    };
    function rr(g, x, y, w, h, r) { g.beginPath(); g.roundRect ? g.roundRect(x, y, w, h, r) : g.rect(x, y, w, h); }
  }

  function drawNode(g, n, t) {
    const pop = Math.min(1, (t - n.born) * 6), hit = Math.max(0, 1 - (t - n.hitT) * 8), r = n.r * (0.4 + 0.6 * pop);
    g.save(); g.translate(n.x + (Math.random() - 0.5) * hit * 3, n.y); g.rotate(n.rot);
    const col = { copper: ['#b5651d', '#e09f3e'], iron: ['#6c757d', '#adb5bd'], geode: ['#5a189a', '#c77dff'], cluster: ['#3a86ff', '#8ecae6'], shard: ['#3a86ff', '#8ecae6'] }[n.kind];
    g.fillStyle = '#00000055'; g.beginPath(); g.ellipse(2, r * 0.9, r * 0.9, r * 0.25, 0, 0, 6.28); g.fill();
    g.fillStyle = hit ? '#fff' : col[0]; g.beginPath();
    const k = n.kind === 'cluster' || n.kind === 'shard' ? 5 : 7;
    for (let i = 0; i < k; i++) { const a = i / k * 6.283, rr = r * (0.8 + 0.2 * Math.sin(i * 2.3 + n.rot)); g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); }
    g.closePath(); g.fill();
    g.fillStyle = col[1]; g.beginPath(); g.arc(-r * 0.25, -r * 0.2, r * 0.3, 0, 6.28); g.fill();
    if (n.kind === 'geode') { g.fillStyle = '#fff'; g.beginPath(); g.arc(r * 0.2, r * 0.15, r * 0.12, 0, 6.28); g.fill(); }
    g.restore();
    if (n.hp < n.max) { g.strokeStyle = 'rgba(255,255,255,.75)'; g.lineWidth = 3; g.beginPath(); g.arc(n.x, n.y, r + 6, -1.57, -1.57 + 6.283 * (n.hp / n.max)); g.stroke(); }
  }
  function drawHeart(g, B, t) {
    const hit = Math.max(0, 1 - (t - B.hitT) * 10), pulse = 1 + Math.sin(t * 4) * 0.04;
    g.save(); g.translate(B.x + (Math.random() - 0.5) * hit * 6, B.y); g.scale(pulse, pulse);
    const gr = g.createRadialGradient(0, 0, 4, 0, 0, B.r * 1.6); gr.addColorStop(0, 'rgba(255,90,90,.5)'); gr.addColorStop(1, 'rgba(255,90,90,0)');
    g.fillStyle = gr; g.beginPath(); g.arc(0, 0, B.r * 1.6, 0, 6.28); g.fill();
    g.fillStyle = hit ? '#fff' : '#d62828'; g.beginPath();
    for (let i = 0; i < 6; i++) { const a = i / 6 * 6.283 + 0.5; g.lineTo(Math.cos(a) * B.r, Math.sin(a) * B.r * 1.2); } g.closePath(); g.fill();
    g.fillStyle = '#ff8fa3'; g.beginPath(); g.moveTo(-B.r * 0.3, -B.r * 0.6); g.lineTo(B.r * 0.1, -B.r * 0.1); g.lineTo(-B.r * 0.4, 0); g.fill();
    g.restore();
  }
  function drawDrill(g, x, y, r, t) {
    g.strokeStyle = 'rgba(255,230,180,.45)'; g.lineWidth = 2; g.fillStyle = 'rgba(255,220,160,.08)';
    g.beginPath(); g.arc(x, y, r, 0, 6.28); g.fill(); g.stroke();
    g.save(); g.translate(x, y); g.rotate(t * 18);
    g.fillStyle = '#ced4da'; for (let i = 0; i < 3; i++) { g.rotate(2.094); g.beginPath(); g.moveTo(0, 0); g.lineTo(r * 0.45, -r * 0.12); g.lineTo(r * 0.45, r * 0.12); g.fill(); }
    g.fillStyle = '#495057'; g.beginPath(); g.arc(0, 0, r * 0.14, 0, 6.28); g.fill(); g.restore();
  }
  function drawFace(g, who, x, y, r) {
    g.save(); g.translate(x, y);
    if (who === 'dwarf') { g.fillStyle = '#f2c6a0'; g.beginPath(); g.arc(0, -4, r * 0.7, 0, 6.28); g.fill(); g.fillStyle = '#b5651d'; g.beginPath(); g.moveTo(-r * 0.7, 0); g.quadraticCurveTo(0, r * 1.5, r * 0.7, 0); g.fill(); g.fillStyle = '#ffb703'; g.beginPath(); g.arc(0, -r * 0.55, r * 0.72, 3.14, 6.28); g.fill(); g.fillStyle = '#fff3b0'; g.beginPath(); g.arc(0, -r * 0.95, r * 0.14, 0, 6.28); g.fill(); g.fillStyle = '#222'; g.beginPath(); g.arc(-r * 0.25, -r * 0.15, 3, 0, 6.28); g.arc(r * 0.25, -r * 0.15, 3, 0, 6.28); g.fill(); }
    else if (who === 'gnome') { g.fillStyle = '#f2c6a0'; g.beginPath(); g.arc(0, 2, r * 0.6, 0, 6.28); g.fill(); g.fillStyle = '#d62828'; g.beginPath(); g.moveTo(-r * 0.65, -r * 0.1); g.lineTo(0, -r * 1.3); g.lineTo(r * 0.65, -r * 0.1); g.fill(); g.fillStyle = '#eee'; g.beginPath(); g.moveTo(-r * 0.5, r * 0.2); g.quadraticCurveTo(0, r * 1.2, r * 0.5, r * 0.2); g.fill(); g.fillStyle = '#90e0ef'; g.beginPath(); g.arc(-r * 0.22, 0, 5, 0, 6.28); g.arc(r * 0.22, 0, 5, 0, 6.28); g.fill(); }
    else { g.fillStyle = '#6d597a'; g.beginPath(); g.ellipse(0, 0, r * 0.8, r * 0.7, 0, 0, 6.28); g.fill(); g.fillStyle = '#ffafcc'; g.beginPath(); g.arc(0, r * 0.15, r * 0.2, 0, 6.28); g.fill(); g.fillStyle = '#ffe5ec'; for (const s of [-1, 1]) { g.beginPath(); g.ellipse(s * r * 0.7, r * 0.45, r * 0.22, r * 0.12, 0, 0, 6.28); g.fill(); } g.fillStyle = '#111'; g.beginPath(); g.arc(-r * 0.25, -r * 0.15, 2.5, 0, 6.28); g.arc(r * 0.25, -r * 0.15, 2.5, 0, 6.28); g.fill(); }
    g.restore();
  }

  window.OreSweeper = { NODES, HEART_HP };
  Kit.game({
    id: 'ore-sweeper', title: 'Ore Sweeper', tagline: 'Drag your drill across the rock face, crack ore before the lamp burns out, and dig your way to the Heart of the Mountain.',
    howTo: 'Hold and drag to drill. Ore under the drill cracks. Spend ore on the upgrade map between digs.', runVerb: 'Dig!', winTitle: 'The Heart is yours!', loseTitle: 'Lamp burned out',
    colors: { accent: '#ffb703', bg: '#17120d', card: '#2a2118' },
    currencies: [{ id: 'ore', name: 'ore', color: '#ffb703' }, { id: 'gems', name: 'gems', color: '#e0aaff' }],
    characters: [
      { id: 'dwarf', name: 'Brakka the Dwarf', blurb: 'A big drill and a stubborn streak.', unlock: 0 },
      { id: 'gnome', name: 'Fizzwick the Gnome', blurb: 'Weak drill, but brings clockwork mine carts.', unlock: 1 },
      { id: 'mole', name: 'Grub the Mole', blurb: 'Every few seconds a tremor hits every node.', unlock: 2 },
    ],
    drawFace, nodes: NODES, touchOffset: 50, hoverIsDown: true,
    baseStats(who) {
      const s = { radius: 36, dps: 6, oil: 8, drain: 1, spawn: 0.62, maxNodes: 12, hp: 4, value: 1, crit: 0, splash: 0, splashR: 70, helpers: 0, helperDps: 3,
        cartSpeed: 1, big: 0, gem: 0, cluster: 0, onPop: 0, crowd: 0, quake: 0, quakeEvery: 3.2 };
      if (who === 'dwarf') s.radius += 6;
      if (who === 'gnome') { s.dps *= 0.7; s.helpers = 2; }
      if (who === 'mole') { s.quake = 6; s.dps *= 0.8; }
      return s;
    },
    createRun,
  });
})();
