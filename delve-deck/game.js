// Delve Deck: descend a mine-dungeon room by room. Each room deals cards (fight, mine, rest, treasure, shop, event);
// retreat to camp any time to bank everything, die and keep only a fraction. Plugs into ../kit (see ../README.md).
(function () {
  'use strict';
  const BOSS_DEPTH = 20;
  const rnd = Math.random, R2 = (a, b) => a + rnd() * (b - a);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const pick = (a) => a[Math.floor(rnd() * a.length)];

  // ------------------------------------------------------------------ camp (the kit's upgrade tree)
  const NODES = [
    { id: 'blade', name: 'Smithy: Sharpen Blade', icon: '⚔️', desc: '+1.5 attack', cost: 12, grow: 1.4, max: 10, req: [], x: 0, y: 0, fx: (s, l) => { s.atk += 1.5 * l; } },
    { id: 'stew', name: 'Tavern: Hearty Stew', icon: '🍲', desc: '+8 max HP', cost: 16, grow: 1.4, max: 10, req: ['blade'], x: -1, y: 0, fx: (s, l) => { s.hp += 8 * l; } },
    { id: 'plate', name: 'Smithy: Plate Armor', icon: '🛡️', desc: '+1 armor: every hit you take is 1 weaker', cost: 10, grow: 1.5, max: 8, cur: 'ore', req: ['blade'], x: 1, y: 0, fx: (s, l) => { s.armor += l; } },
    { id: 'flask', name: 'Tavern: Hip Flask', icon: '🧪', desc: 'Start every run with +1 potion', cost: 40, grow: 2.1, max: 3, req: ['stew'], x: -2, y: 0, fx: (s, l) => { s.potions += l; } },
    { id: 'brew', name: 'Strong Brew', icon: '⚗️', desc: 'Potions heal +15% of max HP', cost: 20, grow: 1.8, max: 3, cur: 'ore', req: ['flask'], x: -3, y: 0, fx: (s, l) => { s.potionHeal += 0.15 * l; } },
    { id: 'tales', name: 'Tavern: Tall Tales', icon: '📜', desc: 'Adds Event cards to the dungeon: risky choices, big payoffs', cost: 36, max: 1, req: ['stew'], x: -1, y: -1, fx: (s) => { s.event = true; } },
    { id: 'chapel', name: 'Chapel', icon: '⛪', desc: 'Revive once per run at 50% HP (level 2: twice)', cost: 120, grow: 3, max: 2, req: ['tales', 'flask'], x: -2, y: -1, fx: (s, l) => { s.revive += l; } },
    { id: 'lucky', name: 'Lucky Charm', icon: '🍀', desc: '+4% critical hit chance', cost: 60, grow: 1.6, max: 5, req: ['chapel'], x: -2, y: -2, fx: (s, l) => { s.crit += 0.04 * l; } },
    { id: 'map', name: 'Map Room', icon: '🗺️', desc: 'See an extra card in every room', cost: 80, max: 1, req: ['blade'], x: 0, y: -1, fx: (s) => { s.extraCards += 1; } },
    { id: 'carto', name: 'Map Room: Cartographer', icon: '🧭', desc: '+1 room reroll per run', cost: 60, grow: 1.9, max: 3, req: ['map'], x: 0, y: -2, fx: (s, l) => { s.rerolls += l; } },
    { id: 'office', name: 'Mine Office', icon: '⚖️', desc: '+15% ore from veins', cost: 12, grow: 1.6, max: 6, cur: 'ore', req: ['plate'], x: 2, y: 0, fx: (s, l) => { s.mine += 0.15 * l; } },
    { id: 'timber', name: 'Shoring Timbers', icon: '🪵', desc: 'Cave-ins 10% less likely and softer', cost: 16, grow: 1.7, max: 4, cur: 'ore', req: ['office'], x: 2, y: -1, fx: (s, l) => { s.cave *= 0.9 ** l; s.caveDmg *= 0.9 ** l; } },
    { id: 'survey', name: 'Deep Survey', icon: '💎', desc: 'Adds Gem Vein cards: lots of ore, shaky rock', cost: 50, max: 1, cur: 'ore', req: ['office'], x: 3, y: 0, fx: (s) => { s.gem = true; } },
    { id: 'trader', name: "Trader's Pass", icon: '🪙', desc: 'Adds Shop cards: spend run gold on potions and gear', cost: 60, max: 1, req: ['map', 'plate'], x: 1, y: -1, fx: (s) => { s.shop = true; } },
    { id: 'bounty', name: 'Bounty Board', icon: '📌', desc: 'Adds Elite fights: tough foes that drop gold and ore', cost: 110, max: 1, req: ['trader'], x: 1, y: -2, fx: (s) => { s.elite = true; } },
    { id: 'purse', name: 'Deep Pockets', icon: '👝', desc: 'Keep +10% of your loot when you die', cost: 50, grow: 1.7, max: 4, req: ['trader'], x: 2, y: -2, fx: (s, l) => { s.keep += 0.1 * l; } },
    { id: 'cleave', who: 'fighter', name: 'Cleave', icon: '🪓', desc: '+6% crit chance, crits hit harder', cost: 36, grow: 1.7, max: 5, req: ['blade'], x: 0, y: 1, fx: (s, l) => { s.crit += 0.06 * l; s.critMult += 0.15 * l; } },
    { id: 'nose', who: 'miner', name: 'Gold Nose', icon: '👃', desc: 'Veins also give gold (+15% of the ore per level)', cost: 36, grow: 1.7, max: 5, req: ['blade'], x: 0, y: 1, fx: (s, l) => { s.veinGold += 0.15 * l; } },
    { id: 'smite', who: 'cleric', name: 'Smite', icon: '✨', desc: '+30% holy damage vs undead; heal 2 HP per kill', cost: 36, grow: 1.7, max: 5, req: ['blade'], x: 0, y: 1, fx: (s, l) => { s.holy += 0.3 * l; s.killHeal += 2 * l; } },
    { id: 'throne', name: 'Into the Deep Throne', icon: '👑', desc: `Your next run's depth ${BOSS_DEPTH} is the Mountain King's throne. Defeat him to win.`, cost: 1000, grow: 1, max: 1, req: ['carto', 'bounty', 'chapel', 'purse', 'survey'], reqAll: 2, extra: { ore: 200 }, x: 0, y: -3, win: true },
  ];

  // ------------------------------------------------------------------ monsters (min/max = depth band)
  const MONS = [ // hp/atk are multipliers on the depth curve
    { id: 'rat', name: 'Cave Rat', icon: '🐀', hp: 0.8, atk: 0.8, min: 1, max: 4 },
    { id: 'bat', name: 'Gloom Bat', icon: '🦇', hp: 0.6, atk: 1, min: 1, max: 5 },
    { id: 'slime', name: 'Ooze', icon: '🫧', hp: 1.25, atk: 0.75, min: 2, max: 7 },
    { id: 'goblin', name: 'Goblin Digger', icon: '👺', hp: 1, atk: 1, min: 3, max: 9 },
    { id: 'skel', name: 'Skeleton', icon: '💀', hp: 1.05, atk: 1.05, min: 4, max: 11, undead: true },
    { id: 'orc', name: 'Orc Brute', icon: '👹', hp: 1.25, atk: 1.05, min: 7, max: 15 },
    { id: 'wraith', name: 'Wraith', icon: '👻', hp: 0.9, atk: 1.2, min: 9, max: 18, undead: true },
    { id: 'troll', name: 'Cave Troll', icon: '🧌', hp: 1.35, atk: 1.05, min: 12, max: 999 },
    { id: 'golem', name: 'Ore Golem', icon: '🗿', hp: 1.5, atk: 0.9, min: 13, max: 999, ore: true },
    { id: 'lich', name: 'Lich', icon: '☠️', hp: 1, atk: 1.25, min: 16, max: 999, undead: true },
  ];
  const KING = { id: 'king', name: 'Mountain King', icon: '👑', hp: 260, atk: 22, gold: 250, ore: 80, king: true };
  const COL = { fight: '#e76f51', elite: '#ff4d6d', mine: '#e9a23b', rest: '#2a9d8f', treasure: '#ffd166', shop: '#5fa8d3', event: '#b388eb', king: '#ff4d6d' };

  // ------------------------------------------------------------------ styles for the in-run card UI
  if (typeof document !== 'undefined' && document.head && !document.getElementById('dd-style')) {
    const st = document.createElement('style'); st.id = 'dd-style';
    st.textContent = `
.dd{display:grid;gap:7px;max-width:520px;margin:0 auto;transition:opacity .12s}
.dd.busy{opacity:.4;pointer-events:none}
.dd-card{display:flex;gap:6px}
.dd-main{flex:1;min-width:0;display:grid;grid-template-columns:34px 1fr auto;align-items:center;gap:9px;text-align:left;background:var(--card);border:2px solid color-mix(in srgb,var(--c) 45%,transparent);border-left:7px solid var(--c);border-radius:14px;padding:7px 10px;min-height:66px;color:var(--ink)}
.dd-main:disabled{opacity:.45}
.dd-main:active,.dd-side:active,.dd-row button:active{transform:translateY(2px)}
.dd .ic{font-size:26px;line-height:1;text-align:center}
.dd .tx{display:grid;min-width:0}
.dd .tx b{font:400 18px/1.15 var(--display);letter-spacing:.01em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.dd .tx small{font-size:12.5px;color:var(--muted);font-weight:800;line-height:1.3}
.dd .tx small.rw{color:#ffd166}
.dd .chip{font-weight:800;font-size:14px;border-radius:999px;padding:4px 9px;background:#ffffff12;white-space:nowrap}
.dd .chip.bad{background:#c1121f;color:#fff}.dd .chip.hurt{color:#ff9a8d}.dd .chip.good{color:#8be29a}.dd .chip.gold{color:#ffd166}
.dd-side{width:70px;flex:none;display:grid;place-content:center;gap:0;background:var(--card);border:2px solid var(--line);border-radius:14px;padding:4px 2px;color:var(--ink);text-align:center;font-weight:800;font-size:13px}
.dd-side small{font-size:11.5px;color:var(--muted);font-weight:800}
.dd-row{display:flex;gap:7px}
.dd-row button{flex:1;min-height:46px;border-radius:12px;border:2px solid var(--line);background:#ffffff0c;color:var(--ink);font-weight:800;font-size:14px;padding:4px 6px}
.dd-row button:disabled{opacity:.4}
.dd-row .ret{border-color:#7bd38999;color:#c4f2cb}
.dd-row small{display:block;font-size:11px;color:var(--muted)}
.dd-head{background:var(--card);border-radius:14px;padding:10px 12px;border-left:7px solid var(--c)}
.dd-head h3{margin:0;font:400 20px/1.1 var(--display)}.dd-head p{margin:3px 0 0;color:var(--muted);font-size:13.5px}`;
    document.head.appendChild(st);
  }

  // ------------------------------------------------------------------ a run
  function createRun(env) {
    const s = env.stats, W = env.W, H = env.H, fx = env.fx, sfx = env.sfx, ui = env.ui, fmt = env.fmt;
    const R = { t: 0, over: false, phase: 'pick', depth: 1, hp: s.hp, max: s.hp, atk: s.atk, armor: s.armor, potions: s.potions,
      revive: s.revive, rerolls: s.rerolls, gold: 0, ore: 0, kills: 0, ended: null, killer: '', cards: [], obj: null,
      banner: { s: env.boss ? `Depth 1 · the Throne waits at ${BOSS_DEPTH}` : 'Depth 1', t: 0 }, uh: 300,
      hero: { atkT: -9, hurtT: -9, healT: -9, walkT: 0, guard: false, out: -1 }, wait: 0, event: null, shop: null, rocksT: -9, best: 0, taps: 0 };
    const Q = []; let qThen = null;
    function play(steps, then) { Q.push(...steps); qThen = then || null; R.phase = 'anim'; R.wait = 0; render(); }
    const HX = () => W * 0.27, OX = () => W * 0.7, FY = () => Math.max(250, H - R.uh - 6) - 30;

    // ---- cards
    function monsterFor(d, elite) {
      const b = pick(MONS.filter((m) => d >= m.min && d <= m.max));
      return { ...b, name: (elite ? 'Elite ' : '') + b.name, elite,
        hp: Math.round((5 + 2 * d + 0.1 * d * d + 0.003 * d * d * d) * b.hp * (elite ? 1.7 : 1)), atk: Math.round((2.5 + 0.75 * d + 0.012 * d * d) * b.atk * (elite ? 1.2 : 1)),
        gold: Math.round((3 + d * 1.6) * R2(0.85, 1.15) * (elite ? 2.5 : 1) * s.gold),
        ore: elite ? Math.round(3 + d * 0.8) : b.ore ? Math.round(2 + d * 0.4) : 0 };
    }
    function makeCard(type) {
      const d = R.depth;
      if (type === 'fight' || type === 'elite') return { type: 'fight', m: monsterFor(d, type === 'elite') };
      if (type === 'mine') {
        const kind = s.gem && rnd() < 0.3 ? 'gem' : d >= 7 && rnd() < 0.45 ? 'silver' : 'copper';
        const K = { copper: [1, 1, 'Copper Vein'], silver: [1.6, 1.25, 'Silver Vein'], gem: [2.2, 1.6, 'Gem Vein'] }[kind];
        const ore = Math.max(1, Math.round((3 + d * 0.9) * K[0] * s.mine * R2(0.85, 1.15)));
        return { type, kind, name: K[2], ore, gold: Math.round(ore * s.veinGold), cave: clamp((0.22 + 0.028 * d) * K[1] * s.cave, 0.1, 0.85), dmg: Math.max(1, Math.round((3 + d * 1.1 + 0.015 * d * d) * s.caveDmg)) };
      }
      if (type === 'rest') return { type };
      if (type === 'treasure') return { type, gold: Math.round((4 + d * 1.6) * R2(0.8, 1.2) * s.gold), potion: rnd() < 0.2, trap: d >= 3 ? clamp(0.03 + 0.022 * d, 0, 0.7) : 0, dmg: Math.round(3 + d * 1.1 + 0.015 * d * d) };
      if (type === 'shop') return { type };
      if (type === 'event') return { type, ev: pick(EVENTS)() };
    }
    function deal() {
      if (env.boss && R.depth >= BOSS_DEPTH) return [{ type: 'fight', m: { ...KING } }];
      const n = 3 + s.extraCards, w = [['fight', 4], ['mine', 2.5], ['rest', R.depth < 3 ? 0.4 : 0.9], ['treasure', 0.8]];
      if (s.shop && R.depth >= 3) w.push(['shop', 0.9]);
      if (s.event) w.push(['event', 1.2]);
      if (s.elite && R.depth >= 3) w.push(['elite', 1]);
      const tot = w.reduce((a, x) => a + x[1], 0), out = [];
      for (let g = 0; out.length < n && g < 80; g++) {
        let r = rnd() * tot, type = w[0][0]; for (const x of w) { r -= x[1]; if (r <= 0) { type = x[0]; break; } }
        const fights = out.filter((c) => c.type === 'fight').length;
        if (type === 'fight' ? fights >= 2 : type === 'elite' ? out.some((c) => c.m && c.m.elite) : out.some((c) => c.type === type)) continue;
        out.push(makeCard(type));
      }
      if (out.every((c) => c.type === 'fight')) out[out.length - 1] = makeCard('mine');
      if (!out.some((c) => c.type === 'fight')) out[out.length - 1] = makeCard('fight');
      if (R.depth >= 8 && out.length >= 3 && out.filter((c) => c.type === 'fight').length < 2) out[out.findIndex((c) => c.type !== 'fight')] = makeCard('fight');
      return out.sort((a, b) => order(a) - order(b));
    }
    const order = (c) => ['fight', 'mine', 'treasure', 'event', 'shop', 'rest'].indexOf(c.type) + (c.m && c.m.elite ? 0.5 : 0);

    // ---- events: each returns {name, icon, text, choices:[{l, sub, fn}]} for the current depth
    const EVENTS = [
      () => { const hp = Math.max(1, Math.round(R.max * 0.2)), g = Math.round((8 + R.depth * 2.5) * s.gold);
        return { name: 'Blood Altar', icon: '🩸', text: 'A stone bowl full of coins. It wants blood.', choices: [{ l: `Bleed ${hp} HP`, sub: `+${g} gold`, fn: () => { hurtNow(hp, 'the Blood Altar'); addGold(g); } }] }; },
      () => { const h = Math.round(R.max * 0.4), p = Math.round(4 + R.depth * 0.7);
        return { name: 'Glowing Mushrooms', icon: '🍄', text: 'They smell sweet. Some of them.', choices: [{ l: 'Eat a handful', sub: `60%: +${h} HP · 40%: −${p} HP`, fn: () => { if (rnd() < 0.6) heal(h); else hurtNow(p, 'bad mushrooms', true); } }] }; },
      () => { const b = Math.max(2, Math.floor(R.gold / 2));
        return { name: 'Dwarf Gambler', icon: '🎲', text: 'Double or nothing, friend. One roll.', choices: [{ l: `Bet ${b} gold`, sub: `50%: +${b} gold · 50%: −${b} gold`, dis: R.gold < 2, fn: () => { if (rnd() < 0.5) { addGold(b); sfx.ding(); } else { R.gold -= b; say(`−${b} gold`, '#ff9a8d'); sfx.nope(); } } }] }; },
      () => { const p = Math.round(3 + R.depth * 0.6), o = Math.round((6 + R.depth * 1.8) * s.mine);
        return { name: 'Collapsed Tunnel', icon: '🪨', text: 'Ore glitters behind the rubble.', choices: [{ l: 'Dig through', sub: `−${p} HP · +${o} ore`, fn: () => { hurtNow(p, 'falling rubble'); addOre(o); } }] }; },
      () => { const p = Math.round(R.max * 0.15);
        return { name: 'Old Statue', icon: '🗿', text: 'A forgotten dwarf god. Pray?', choices: [{ l: 'Pray', sub: `50%: +2 attack · 50%: −${p} max HP`, fn: () => { if (rnd() < 0.5) { R.atk += 2; say('+2 attack', '#ffd166'); sfx.ding(); } else { R.max = Math.max(5, R.max - p); R.hp = Math.min(R.hp, R.max); say(`−${p} max HP`, '#ff9a8d'); sfx.nope(); } } }] }; },
      () => { const o = Math.round((5 + R.depth * 1.5) * s.mine), g = Math.round((4 + R.depth * 1.5) * s.gold);
        return { name: 'Lost Miner', icon: '🧔', text: 'Hurt and lost. He has a sack of ore.', choices: [
          { l: 'Give a potion', sub: `+${o} ore +${g} gold`, dis: R.potions < 1, fn: () => { R.potions--; addOre(o); addGold(g); } },
          { l: 'Rob him', sub: `+${o} ore · 50%: he stabs you −${Math.round(R.max * 0.25)}`, fn: () => { addOre(o); if (rnd() < 0.5) hurtNow(Math.round(R.max * 0.25), 'a desperate miner'); } }] }; },
    ];
    const SHOP = [
      { id: 'potion', l: 'Healing Potion', icon: '🧪', price: () => 6 + Math.round(R.depth * 0.7), go: () => { R.potions++; } },
      { id: 'whet', l: 'Whetstone', sub: '+2 attack this run', icon: '🗡️', price: () => 10 + R.depth, go: () => { R.atk += 2; } },
      { id: 'patch', l: 'Iron Patch', sub: '+1 armor this run', icon: '🔩', price: () => 12 + R.depth, go: () => { R.armor += 1; } },
      { id: 'bandage', l: 'Bandages', sub: 'Heal 35% now', icon: '🩹', price: () => 5 + Math.round(R.depth * 0.5), go: () => { heal(Math.round(R.max * 0.35)); } },
      { id: 'scrap', l: 'Map Scrap', sub: '+1 reroll', icon: '📜', price: () => 6, go: () => { R.rerolls++; } },
    ];

    // ---- effects
    function say(t, c = '#fff', at = 'hero', size = 18) { fx.text(at === 'hero' ? HX() : OX(), FY() - 110, t, c, size); }
    function addGold(g) { if (g <= 0) return; R.gold += g; say(`+${g} gold`, '#ffd166', 'obj'); sfx.coin(); }
    function addOre(o) { if (o <= 0) return; R.ore += o; say(`+${o} ore`, '#f4a261', 'obj', 17); }
    function heal(h) { h = Math.min(h, R.max - R.hp); if (h <= 0) return; R.hp += h; R.hero.healT = R.t; say(`+${h} HP`, '#8be29a'); fx.burst(HX(), FY() - 50, 8, ['#8be29a', '#d8f3dc'], 90, 3); }
    function hurtNow(d, by) {
      R.hp -= d; R.hero.hurtT = R.t; fx.shake = Math.max(fx.shake, 5); sfx.hit(); say(`−${d} HP`, '#ff6b6b', 'hero', 20);
      if (R.hp <= 0) { R.killer = by; if (R.revive > 0) revive(); }
    }
    function revive() { R.revive--; R.hp = Math.round(R.max * s.reviveHp); sfx.ding(); fx.ring(HX(), FY() - 40, 70, '#ffe066'); fx.text(HX(), FY() - 140, 'Revived!', '#ffe066', 22); }
    function drink() { R.potions--; heal(Math.round(R.max * s.potionHeal)); sfx.ding(); render(); }
    function estimate(m, guard) {
      const pd = R.atk * (m.undead ? s.holy : 1) * (1 + s.crit * (s.critMult - 1));
      const hits = Math.max(0, Math.ceil(m.hp / pd) - 1);
      let md = Math.max(1, m.atk - R.armor); if (guard) md = Math.max(1, md * 0.5);
      return Math.round(hits * md);
    }

    // ---- room actions
    function next() {
      if (R.hp <= 0) return die();
      R.best = R.depth; R.depth++; R.cards = deal(); R.obj = null; R.event = R.shop = null;
      R.banner = { s: env.boss && R.depth >= BOSS_DEPTH ? 'The Deep Throne' : `Depth ${R.depth}`, t: R.t }; R.hero.walkT = R.t;
      R.phase = 'pick'; render();
    }
    function enter(c, guard) {
      R.taps++;
      if (c.type === 'fight') return fight(c.m, guard);
      if (c.type === 'mine') return mine(c);
      if (c.type === 'rest') {
        R.obj = { kind: 'rest', inT: R.t };
        return play([[0.35, () => sfx.pop(0.5)], [0.55, () => heal(Math.round(R.max * s.rest))]], next);
      }
      if (c.type === 'treasure') {
        R.obj = { kind: 'chest', inT: R.t, open: false };
        const trap = rnd() < c.trap;
        return play([[0.35, null], [0.6, () => { R.obj.open = true; sfx.ding(); fx.burst(OX(), FY() - 30, 14, ['#ffd166', '#fff3b0'], 170); addGold(c.gold); if (c.potion) { R.potions++; fx.text(OX(), FY() - 140, '+1 potion', '#ff8fa3', 17); } }],
          ...(trap ? [[0.5, () => { fx.text(OX(), FY() - 160, 'Dart trap!', '#ff6b6b', 20); hurtNow(c.dmg, 'a dart trap'); }]] : [])], next);
      }
      if (c.type === 'shop') {
        const items = [SHOP[0], ...SHOP.slice(1).sort(() => rnd() - 0.5).slice(0, 2)].map((it) => ({ ...it, p: it.price(), sold: false }));
        R.shop = { items }; R.obj = { kind: 'shop', inT: R.t }; R.phase = 'shop'; return render();
      }
      if (c.type === 'event') { R.event = c.ev; R.obj = { kind: 'event', inT: R.t }; R.phase = 'event'; sfx.zap(); return render(); }
    }
    function resolve(m, guard) {
      const ev = []; let ph = R.hp, mh = m.hp, rev = R.revive;
      for (let r = 0; r < 120; r++) {
        let d = R.atk * R2(0.85, 1.15) * (m.undead ? s.holy : 1); const crit = rnd() < s.crit; if (crit) d *= s.critMult;
        d = Math.max(1, Math.round(d)); mh -= d; ev.push({ p: 1, d, crit, mh: Math.max(0, mh) });
        if (mh <= 0) break;
        let md = Math.max(1, Math.round(m.atk * R2(0.8, 1.2)) - R.armor); if (guard) md = Math.max(1, Math.round(md * 0.5));
        ph -= md; ev.push({ p: 0, d: md, ph: Math.max(0, ph) });
        if (ph <= 0) { if (rev > 0) { rev--; ph = Math.round(R.max * s.reviveHp); ev.push({ rev: 1 }); } else break; }
      }
      return ev;
    }
    function fight(m, guard) {
      const ev = resolve(m, guard);
      R.obj = { kind: 'mon', m, hp: m.hp, max: m.hp, inT: R.t, hitT: -9, atkT: -9, dead: -1 };
      R.hero.guard = guard;
      const step = clamp((m.king ? 4 : 1.7) / ev.length, 0.1, 0.27);
      const steps = [[0.28, () => { sfx.pop(0.6); if (guard) say('Guard!', '#8ecae6'); }]];
      for (const e of ev) steps.push([e.rev ? 0.5 : step, () => {
        if (e.rev) return revive();
        if (e.p) { R.obj.hp = e.mh; R.hero.atkT = R.t; R.obj.hitT = R.t; sfx.hit(); fx.text(OX() + R2(-14, 14), FY() - 100, (e.crit ? 'CRIT ' : '') + e.d, e.crit ? '#ffd166' : '#fff', e.crit ? 22 : 18); if (e.crit) fx.shake = 4; fx.burst(OX() - 10, FY() - 45, 4, ['#fff', '#ffd6a5'], 110, 2.5); }
        else { R.hp = e.ph; R.obj.atkT = R.t; R.hero.hurtT = R.t; sfx.crack(); fx.text(HX() + R2(-10, 10), FY() - 100, '−' + e.d, '#ff6b6b', 19); fx.shake = Math.max(fx.shake, 3); }
      }]);
      play(steps, () => {
        R.hero.guard = false;
        if (R.hp <= 0) { R.killer = m.king ? 'the Mountain King' : m.name; return die(); }
        R.kills++; R.obj.dead = R.t; sfx.crack(); fx.burst(OX(), FY() - 40, m.king ? 40 : 12, ['#e76f51', '#ffd6a5', '#6d597a'], 180);
        addGold(guard ? Math.round(m.gold / 2) : m.gold); if (m.ore) setTimeout0(() => addOre(guard ? Math.round(m.ore / 2) : m.ore));
        if (s.killHeal) heal(s.killHeal);
        if (m.king) return win();
        play([[0.5, null]], next);
      });
    }
    function setTimeout0(f) { Q.unshift([0.15, f]); }
    function mine(c) {
      R.obj = { kind: 'vein', c, inT: R.t, hitT: -9, broke: -1 };
      const cave = rnd() < c.cave, swing = () => { R.hero.atkT = R.t; R.obj.hitT = R.t; sfx.crack(); fx.burst(OX() - 20, FY() - 30, 4, ['#9c6644', '#b08968'], 120, 2.5); };
      play([[0.24, swing], [0.24, swing], [0.24, swing]], () => {
        R.obj.broke = R.t; sfx.ding(); fx.burst(OX(), FY() - 30, 12, c.kind === 'gem' ? ['#c77dff', '#e0aaff'] : c.kind === 'silver' ? ['#dee2e6', '#adb5bd'] : ['#e09f3e', '#f4a261'], 160);
        addOre(c.ore); if (c.gold) addGold(c.gold);
        if (cave) play([[0.25, () => { sfx.boom(); fx.shake = 10; R.rocksT = R.t; }], [0.6, () => hurtNow(c.dmg, 'a cave-in')]], next);
        else play([[0.45, null]], next);
      });
    }
    function retreat() {
      R.ended = 'retreat'; R.hero.out = R.t; sfx.pop(1.2);
      play([[0.7, null]], () => { R.over = true; render(); });
    }
    function die() {
      R.ended = 'dead'; R.hp = 0; R.hero.dead = R.t; sfx.boom(); fx.shake = 12;
      play([[1.1, null]], () => { R.over = true; render(); });
    }
    function win() {
      R.ended = 'won'; sfx.win(); fx.shake = 14;
      for (let i = 0; i < 4; i++) fx.ring(OX(), FY() - 60, 60 + i * 30, '#ffd166');
      play([[1.6, null]], () => { R.over = true; render(); });
    }

    // ---- input from the card UI
    function act(a) {
      if (R.over || R.ended || R.phase === 'anim') return;
      if (a === 'potion') { if (R.potions > 0 && R.hp < R.max) drink(); return; }
      if (R.phase === 'pick') {
        if (a === 'retreat') return retreat();
        if (a === 'reroll') { if (R.rerolls > 0) { R.rerolls--; R.cards = deal(); sfx.zap(); render(); } return; }
        const m = /^([cg])(\d)$/.exec(a), c = m && R.cards[+m[2]]; if (c) enter(c, m[1] === 'g');
      } else if (R.phase === 'event') {
        if (a === 'leave') { R.taps++; return play([[0.25, null]], next); }
        const ch = R.event.choices[+a.slice(1)]; if (!ch || ch.dis) return;
        R.taps++; ch.fn(); play([[0.8, null]], next);
      } else if (R.phase === 'shop') {
        if (a === 'leave') { R.taps++; return play([[0.25, null]], next); }
        const it = R.shop.items[+a.slice(1)]; if (!it || it.sold || R.gold < it.p) return sfx.nope();
        R.taps++; R.gold -= it.p; it.sold = true; it.go(); sfx.buy(); say(it.l, '#8ecae6', 'obj', 16); render();
      }
    }
    if (ui && ui.ownerDocument) ui.onclick = (e) => { const b = e.target.closest('[data-a]'); if (b && !b.disabled) act(b.dataset.a); };

    // ---- DOM card UI
    function render() {
      if (!ui || !ui.ownerDocument) return;
      if (R.over) { ui.innerHTML = ''; return; }
      if (R.phase === 'anim') { if (ui.firstElementChild) ui.firstElementChild.classList.add('busy'); return; }
      let h = '';
      const card = (col, a, ic, title, l1, l2, chip, chipCls, side = '') => `<div class="dd-card" style="--c:${col}"><button type="button" class="dd-main" data-a="${a}"${chipCls === 'dis' ? ' disabled' : ''}><span class="ic">${ic}</span><span class="tx"><b>${title}</b>${l1 ? `<small>${l1}</small>` : ''}${l2 ? `<small class="rw">${l2}</small>` : ''}</span>${chip ? `<span class="chip ${chipCls || ''}">${chip}</span>` : ''}</button>${side}</div>`;
      if (R.phase === 'pick') {
        h = R.cards.map((c, i) => {
          if (c.type === 'fight') {
            const m = c.m, e = estimate(m, false), eg = estimate(m, true), dead = e >= R.hp, gdead = eg >= R.hp;
            const loot = `+${m.gold} gold${m.ore ? ` +${m.ore} ore` : ''}`;
            return card(m.king ? COL.king : m.elite ? COL.elite : COL.fight, 'c' + i, m.icon, m.name, `Fight · ❤ ${m.hp} · hits ${m.atk}${m.undead ? ' · undead' : ''}`, loot,
              dead ? '☠ deadly' : e ? `−${e} HP` : 'no harm', dead ? 'bad' : e ? 'hurt' : 'good',
              `<button type="button" class="dd-side" data-a="g${i}">🛡 Guard<small style="color:${gdead ? '#ff6b6b' : eg ? '#ff9a8d' : '#8be29a'}">${gdead ? '☠ deadly' : eg ? `−${eg} HP` : 'no harm'}</small><small>½ loot</small></button>`);
          }
          if (c.type === 'mine') return card(COL.mine, 'c' + i, c.kind === 'gem' ? '💎' : '⛏️', c.name, `${Math.round(c.cave * 100)}% cave-in: −${c.dmg} HP`, c.gold ? `+${c.gold} gold too` : '', `+${c.ore} ore`, 'gold');
          if (c.type === 'rest') { const hh = Math.min(R.max - R.hp, Math.round(R.max * s.rest)); return card(COL.rest, 'c' + i, '🔥', 'Campfire', 'Rest and patch up', '', `+${hh} HP`, 'good'); }
          if (c.type === 'treasure') return card(COL.treasure, 'c' + i, '🧰', 'Treasure Chest', c.trap ? `${Math.round(c.trap * 100)}% trap: −${c.dmg} HP · maybe a potion` : 'Safe loot · maybe a potion', '', `+${c.gold} gold`, 'gold');
          if (c.type === 'shop') return card(COL.shop, 'c' + i, '🛒', 'Wandering Trader', 'Spend run gold on gear', `You have ${R.gold} gold`, 'shop', '');
          if (c.type === 'event') return card(COL.event, 'c' + i, c.ev.icon, c.ev.name, 'Event · a risky choice', '', '?', '');
          return '';
        }).join('');
      } else if (R.phase === 'event') {
        const ev = R.event;
        h = `<div class="dd-head" style="--c:${COL.event}"><h3>${ev.icon} ${ev.name}</h3><p>${ev.text}</p></div>` +
          ev.choices.map((c, i) => card(COL.event, 'e' + i, '🎲', c.l, c.sub, '', c.dis ? 'can\'t' : 'risky', c.dis ? 'dis' : 'hurt')).join('') +
          card('#6c757d', 'leave', '🚶', 'Walk away', 'Nothing happens', '', '', '');
      } else if (R.phase === 'shop') {
        h = `<div class="dd-head" style="--c:${COL.shop}"><h3>🛒 Wandering Trader</h3><p>Gold spent here is gone. You have <b style="color:#ffd166">${R.gold}</b> gold.</p></div>` +
          R.shop.items.map((it, i) => card(COL.shop, 's' + i, it.icon, it.l, it.sold ? 'Sold' : it.sub || `Heal ${Math.round(s.potionHeal * 100)}% any time`, '', `${it.p} gold`, it.sold || R.gold < it.p ? 'dis' : 'gold')).join('') +
          card('#6c757d', 'leave', '🚶', 'Move on', 'Back to the tunnels', '', '', '');
      }
      const row = [];
      if (R.potions > 0) row.push(`<button type="button" data-a="potion" ${R.hp >= R.max ? 'disabled' : ''}>🧪 Potion ×${R.potions}<small>+${Math.round(s.potionHeal * 100)}% HP</small></button>`);
      if (R.phase === 'pick' && R.rerolls > 0 && !(env.boss && R.depth >= BOSS_DEPTH)) row.push(`<button type="button" data-a="reroll">🔄 Reroll ×${R.rerolls}<small>new cards</small></button>`);
      if (R.phase === 'pick') row.push(`<button type="button" data-a="retreat" class="ret">⛺ Retreat<small>bank all loot</small></button>`);
      ui.innerHTML = `<div class="dd">${h}${row.length ? `<div class="dd-row">${row.join('')}</div>` : ''}</div>`;
    }

    R.cards = deal(); render();

    // ---- canvas scene
    function drawScene(g) {
      const fy = FY(), sb = fy + 30, k = clamp((R.depth - 1) / (BOSS_DEPTH - 1), 0, 1), t = R.t;
      const bg = g.createLinearGradient(0, 0, 0, sb);
      bg.addColorStop(0, mix('#3b2a1f', '#231a3a', k)); bg.addColorStop(1, mix('#1a120d', '#0d0a18', k));
      g.fillStyle = bg; g.fillRect(-20, -20, W + 40, sb + 20);
      // back wall: strata + three dark arches (the paths) while choosing
      g.strokeStyle = 'rgba(255,220,170,.06)'; g.lineWidth = 2;
      for (let i = 0; i < 6; i++) { g.beginPath(); const y = 110 + i * ((fy - 110) / 6); g.moveTo(0, y); for (let x = 0; x <= W; x += 30) g.lineTo(x, y + Math.sin(x * 0.03 + i * 2 + R.depth) * 7); g.stroke(); }
      if (R.phase === 'pick' && R.cards[0] && R.cards[0].m && R.cards[0].m.king) drawMon(g, R.cards[0].m, OX(), fy, t, { atk: 0 });
      else if (R.phase === 'pick') {
        const n = R.cards.length;
        for (let i = 0; i < n; i++) {
          const ax = W * (0.66 + (i - (n - 1) / 2) * 0.17), aw = 36, ah = 64, ay = fy - 6;
          g.fillStyle = 'rgba(0,0,0,.55)'; g.beginPath(); g.moveTo(ax - aw / 2, ay); g.lineTo(ax - aw / 2, ay - ah + aw / 2); g.arc(ax, ay - ah + aw / 2, aw / 2, Math.PI, 0); g.lineTo(ax + aw / 2, ay); g.fill();
          const c = R.cards[i]; g.fillStyle = (c.type === 'fight' ? (c.m.king ? COL.king : c.m.elite ? COL.elite : COL.fight) : COL[c.type]) + '55';
          g.beginPath(); g.arc(ax, ay - ah * 0.55, 5 + Math.sin(t * 3 + i) * 1.2, 0, 6.283); g.fill();
        }
      }
      // ceiling with stalactites
      g.fillStyle = mix('#140e0a', '#0b0814', k); g.beginPath(); g.moveTo(-10, 0); g.lineTo(-10, 92);
      for (let x = 0; x <= W + 20; x += 22) { const j = Math.sin(x * 0.37 + R.depth * 1.7), yy = 88 + j * 8; g.lineTo(x, yy); if (j > 0.3) { g.lineTo(x + 6, yy + 14 + j * 16); g.lineTo(x + 11, yy); } }
      g.lineTo(W + 20, 0); g.fill();
      // torch glow
      const tx = W * 0.5, ty = fy - 110, fl = 1 + Math.sin(t * 13) * 0.05 + Math.sin(t * 7.3) * 0.04;
      const glow = g.createRadialGradient(tx, ty, 4, tx, ty, 190 * fl); glow.addColorStop(0, 'rgba(255,180,90,.32)'); glow.addColorStop(1, 'rgba(255,160,80,0)');
      g.fillStyle = glow; g.fillRect(0, 0, W, sb);
      g.fillStyle = '#5c3d2e'; g.fillRect(tx - 3, ty, 6, 18); g.fillStyle = '#ffb703'; g.beginPath(); g.ellipse(tx, ty - 4, 6 * fl, 10 * fl, 0, 0, 6.283); g.fill(); g.fillStyle = '#fff3b0'; g.beginPath(); g.ellipse(tx, ty - 2, 3, 5, 0, 0, 6.283); g.fill();
      // floor
      g.fillStyle = mix('#2c2018', '#1b1628', k); g.beginPath(); g.moveTo(0, fy); for (let x = 0; x <= W; x += 26) g.lineTo(x, fy + Math.sin(x * 0.11 + R.depth) * 3); g.lineTo(W, sb); g.lineTo(0, sb); g.fill();
      g.fillStyle = 'rgba(0,0,0,.25)'; for (let i = 0; i < 9; i++) { const x = ((i * 97 + R.depth * 41) % W); g.beginPath(); g.ellipse(x, fy + 14, 10, 3, 0, 0, 6.283); g.fill(); }
      // the room's occupant
      const o = R.obj, ox = OX();
      if (o) {
        const a = clamp((t - o.inT) / 0.25, 0, 1), slide = (1 - a) * 50;
        g.save(); g.globalAlpha = a; g.translate(slide, 0);
        if (o.kind === 'mon') {
          const dz = o.dead > 0 ? clamp((t - o.dead) / 0.4, 0, 1) : 0, la = t - o.atkT;
          g.globalAlpha = a * (1 - dz);
          drawMon(g, o.m, ox, fy + dz * 10, t, { hit: t - o.hitT < 0.09, atk: la < 0.2 ? Math.sin(la / 0.2 * Math.PI) : 0 });
          if (dz < 1) { const bw = o.m.king ? 150 : 90, by = fy - (o.m.king ? 190 : o.m.id === 'bat' ? 112 : 112); g.fillStyle = 'rgba(0,0,0,.6)'; rr(g, ox - bw / 2, by, bw, 10, 5); g.fill(); g.fillStyle = '#e63946'; rr(g, ox - bw / 2, by, bw * o.hp / o.max, 10, 5); g.fill();
            g.font = '800 12px Nunito, system-ui'; g.textAlign = 'center'; g.fillStyle = '#fff'; g.fillText(`${o.m.name} ${o.hp}/${o.max}`, ox, by - 5); }
        } else if (o.kind === 'vein') drawVein(g, o, ox, fy, t);
        else if (o.kind === 'rest') drawFire(g, ox, fy, t);
        else if (o.kind === 'chest') drawChest(g, ox, fy, o.open);
        else if (o.kind === 'shop') drawTrader(g, ox, fy, t);
        else if (o.kind === 'event') drawRune(g, ox, fy, t);
        g.restore();
      }
      // the hero
      const h = R.hero, la = t - h.atkT, walk = clamp((t - h.walkT) / 0.35, 0, 1), out = h.out > 0 ? clamp((t - h.out) / 0.6, 0, 1) : 0;
      const hx = HX() - (1 - walk) * 40 + (la < 0.2 ? Math.sin(la / 0.2 * Math.PI) * 26 : 0) - (t - h.hurtT < 0.15 ? 8 : 0) - out * W * 0.4;
      g.save();
      if (h.dead) { const d = clamp((t - h.dead) / 0.5, 0, 1); g.translate(hx, fy); g.rotate(-d * 1.4); g.translate(-hx, -fy); }
      drawHero(g, env.who, hx, fy, t, { swing: la < 0.2 ? Math.sin(la / 0.2 * Math.PI) : 0, hurt: t - h.hurtT < 0.12, guard: h.guard, walk: walk < 1 || out > 0, heal: t - h.healT < 0.4, flip: out > 0 });
      g.restore();
      // cave-in rocks
      const rk = t - R.rocksT;
      if (rk < 0.9) for (let i = 0; i < 9; i++) { const x = HX() - 50 + i * 13 + Math.sin(i * 5) * 8, y = 90 + Math.min(fy - 100, (rk * (1 + i % 3 * 0.3)) ** 2 * 900); g.globalAlpha = 1 - Math.max(0, rk - 0.6) / 0.3; g.fillStyle = i % 2 ? '#6b5e55' : '#8a7968'; g.beginPath(); g.arc(x, y, 5 + (i % 3) * 2.5, 0, 6.283); g.fill(); }
      g.globalAlpha = 1;
      // dark band behind the cards
      g.fillStyle = '#0b0a12'; g.fillRect(-20, sb, W + 40, H - sb + 20);
      g.fillStyle = '#ffffff10'; g.fillRect(0, sb, W, 2);
    }
    function drawHud(g) {
      const w = W - 32;
      g.fillStyle = 'rgba(0,0,0,.55)'; rr(g, 16, 12, w, 22, 11); g.fill();
      g.fillStyle = R.hp / R.max < 0.3 ? '#ff4d6d' : '#e63946'; rr(g, 16, 12, Math.max(0, w * R.hp / R.max), 22, 11); g.fill();
      g.font = '800 14px Nunito, system-ui'; g.textAlign = 'center'; g.fillStyle = '#fff'; g.fillText(`❤ ${Math.max(0, Math.ceil(R.hp))} / ${R.max}`, W / 2, 28);
      g.textAlign = 'left'; g.font = '400 22px "Lilita One", system-ui'; g.fillStyle = '#ffd166';
      g.fillText(`Depth ${R.depth}`, 16, 60);
      g.font = '800 12px Nunito, system-ui'; g.fillStyle = '#c9c2dc';
      const sub = [`⚔ ${Math.round(R.atk * 10) / 10}`, R.armor ? `🛡 ${R.armor}` : '', R.revive ? `✝ ${R.revive}` : '', env.boss ? `👑 at ${BOSS_DEPTH}` : ''].filter(Boolean).join('  ');
      g.fillText(sub, 16, 77);
      // loot on the right
      g.textAlign = 'right'; g.font = '800 16px Nunito, system-ui';
      let x = W - 16;
      const item = (txt, col, icon) => { g.fillStyle = col; g.fillText(txt, x, 60); const tw = g.measureText(txt).width; icon(x - tw - 11, 54); x -= tw + 28; };
      item(String(R.ore), '#f4a261', (cx, cy) => { g.fillStyle = '#e09f3e'; g.beginPath(); g.moveTo(cx, cy - 7); g.lineTo(cx + 6, cy); g.lineTo(cx, cy + 7); g.lineTo(cx - 6, cy); g.fill(); });
      item(String(R.gold), '#ffd166', (cx, cy) => { g.fillStyle = '#ffb703'; g.beginPath(); g.arc(cx, cy, 7, 0, 6.283); g.fill(); g.fillStyle = '#fff3b0'; g.beginPath(); g.arc(cx - 2, cy - 2, 2.5, 0, 6.283); g.fill(); });
      g.font = '800 11px Nunito, system-ui'; g.fillStyle = '#a49eb8'; g.fillText(`death keeps ${Math.round(s.keep * 100)}%`, W - 16, 77);
    }
    function drawBanner(g) {
      const fy = FY(), bt = R.t - R.banner.t;
      if (bt < 1.3) { g.globalAlpha = clamp(1.3 - bt, 0, 1) * clamp(bt * 6, 0, 1); g.textAlign = 'center'; g.font = '400 30px "Lilita One", system-ui'; g.fillStyle = '#000a'; g.fillText(R.banner.s, W / 2, 132); g.fillStyle = '#ffd166'; g.fillText(R.banner.s, W / 2, 130); g.globalAlpha = 1; }
      if (R.phase === 'pick' && !R.ended) {
        g.textAlign = 'center'; g.font = '800 14px Nunito, system-ui'; g.fillStyle = 'rgba(255,255,255,.75)';
        if (env.runNo <= 2 && R.depth <= 2) {
          const ly = 162;
          g.fillStyle = 'rgba(0,0,0,.5)'; rr(g, 20, ly - 18, W - 40, 50, 12); g.fill();
          g.fillStyle = '#fff'; g.fillText('Pick a card below to enter that room.', W / 2, ly);
          g.fillStyle = '#c4f2cb'; g.fillText(`Retreat to bank loot · die and keep ${Math.round(s.keep * 100)}%`, W / 2, ly + 20);
        } else if (bt > 1.3) g.fillText('Choose your path', W / 2, 130);
      }
      if (R.ended === 'retreat') { g.textAlign = 'center'; g.font = '400 26px "Lilita One", system-ui'; g.fillStyle = '#8be29a'; g.fillText('Back to camp!', W / 2, 140); }
      if (R.ended === 'won') { g.textAlign = 'center'; g.font = '400 30px "Lilita One", system-ui'; g.fillStyle = '#ffd166'; g.fillText('The King falls!', W / 2, 140); }
    }

    const api = {
      get over() { return R.over; }, get t() { return R.t; }, act, R, estimate, deal,
      update(dt) {
        R.t += dt;
        if (ui && ui.getBoundingClientRect) { const target = ui.getBoundingClientRect().height; R.uh += (target - R.uh) * Math.min(1, dt * 14); if (R.t < 0.1) R.uh = target; }
        if (R.phase === 'anim') {
          R.wait -= dt;
          while (R.wait <= 0) {
            if (!Q.length) { const th = qThen; qThen = null; R.phase = 'idle'; if (th) th(); if (R.phase !== 'anim' && !R.over) render(); break; }
            const [d, f] = Q.shift(); if (f) f(); R.wait += d;
          }
        }
        fx.update(dt);
      },
      draw(g) {
        g.save(); g.translate((rnd() - 0.5) * fx.shake, (rnd() - 0.5) * fx.shake);
        drawScene(g); fx.draw(g); g.restore();
        drawHud(g); drawBanner(g);
      },
      result() {
        const lines = [`Reached depth ${R.depth} · ${R.kills} monster${R.kills === 1 ? '' : 's'} slain`];
        if (R.ended === 'won') return { won: true, earned: { gold: R.gold, ore: R.ore }, lines };
        if (R.ended === 'dead') {
          const kp = Math.min(1, s.keep);
          return { won: false, title: `Slain by ${R.killer || 'the dark'}`, earned: { gold: R.gold * kp, ore: R.ore * kp },
            lines: [...lines, `Kept ${Math.round(kp * 100)}% of ${fmt(R.gold)} gold and ${fmt(R.ore)} ore. Retreat sooner to keep it all.`] };
        }
        return { won: false, title: 'Back at camp', earned: { gold: R.gold, ore: R.ore }, lines: [...lines, 'Retreated safely: kept everything.'] };
      },
    };
    if (typeof window !== 'undefined' && window.DelveDeck) window.DelveDeck.run = api;
    return api;
  }

  // ------------------------------------------------------------------ art
  function rr(g, x, y, w, h, r) { g.beginPath(); if (g.roundRect) g.roundRect(x, y, w, h, r); else g.rect(x, y, w, h); }
  function mix(a, b, k) { const p = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)), A = p(a), B = p(b); return `rgb(${A.map((v, i) => Math.round(v + (B[i] - v) * k)).join(',')})`; }
  const circ = (g, x, y, r, c) => { g.fillStyle = c; g.beginPath(); g.arc(x, y, r, 0, 6.283); g.fill(); };
  const ell = (g, x, y, rx, ry, c) => { g.fillStyle = c; g.beginPath(); g.ellipse(x, y, rx, ry, 0, 0, 6.283); g.fill(); };

  function drawHero(g, who, x, y, t, o = {}) {
    g.save(); g.translate(x, y); const sc = o.sc || 1; g.scale(o.flip ? -sc : sc, sc);
    const bob = o.walk ? -Math.abs(Math.sin(t * 16)) * 4 : Math.sin(t * 2.2) * 1.2;
    const F = (c) => (o.hurt ? '#ff8a80' : c);
    if (!o.sc) ell(g, 0, 2, 26, 6, 'rgba(0,0,0,.35)');
    if (o.heal) { const gr = g.createRadialGradient(0, -40, 4, 0, -40, 60); gr.addColorStop(0, 'rgba(139,226,154,.5)'); gr.addColorStop(1, 'rgba(139,226,154,0)'); g.fillStyle = gr; g.fillRect(-60, -100, 120, 120); }
    const body = { fighter: '#4f6d94', miner: '#c8702a', cleric: '#e8e2cf' }[who] || '#4f6d94';
    g.fillStyle = F('#3d2c22'); g.fillRect(-11, -24, 8, 24); g.fillRect(3, -24, 8, 24);
    g.fillStyle = '#2a1d16'; g.fillRect(-13, -4, 11, 5); g.fillRect(2, -4, 12, 5);
    if (who === 'cleric') { g.fillStyle = F(body); g.beginPath(); g.moveTo(-15, -58 + bob); g.lineTo(15, -58 + bob); g.lineTo(19, -8); g.lineTo(-19, -8); g.fill(); g.fillStyle = '#d4a017'; g.fillRect(-2, -56 + bob, 4, 46); g.fillRect(-8, -48 + bob, 16, 4); }
    else { g.fillStyle = F(body); rr(g, -16, -58 + bob, 32, 38, 9); g.fill(); g.fillStyle = '#2a1d16'; g.fillRect(-16, -28 + bob, 32, 5); if (who === 'miner') { g.fillStyle = '#7a4a1e'; g.fillRect(-10, -56 + bob, 4, 30); g.fillRect(6, -56 + bob, 4, 30); } }
    // head
    if (who === 'cleric') circ(g, 0, -70 + bob, 17, F('#f1ead6'));
    circ(g, 0, -70 + bob, 13, F('#f2c6a0'));
    circ(g, 6, -71 + bob, 2.2, '#222');
    if (who === 'fighter') { g.fillStyle = '#adb5bd'; g.beginPath(); g.arc(0, -73 + bob, 14, Math.PI, 0); g.fill(); g.fillRect(-14, -74 + bob, 28, 4); g.fillStyle = '#6c757d'; g.fillRect(9, -74 + bob, 3, 11); g.fillStyle = '#e63946'; g.fillRect(-3, -92 + bob, 6, 8); }
    else if (who === 'miner') { g.fillStyle = '#ffb703'; g.beginPath(); g.arc(0, -74 + bob, 14, Math.PI, 0); g.fill(); g.fillRect(-16, -75 + bob, 33, 4); circ(g, 12, -80 + bob, 4, '#fff3b0'); g.fillStyle = '#6b3e1d'; g.beginPath(); g.moveTo(-8, -64 + bob); g.quadraticCurveTo(3, -48 + bob, 13, -64 + bob); g.fill(); }
    else { g.strokeStyle = 'rgba(255,224,102,.7)'; g.lineWidth = 2.5; g.beginPath(); g.ellipse(0, -92 + bob, 11, 3.5, 0, 0, 6.283); g.stroke(); }
    // weapon
    g.save(); g.translate(12, -42 + bob); g.rotate(-0.5 + (o.swing || 0) * 1.9);
    if (who === 'fighter') { g.fillStyle = '#dee2e6'; g.fillRect(-2.5, -40, 5, 34); g.beginPath(); g.moveTo(-2.5, -40); g.lineTo(0, -46); g.lineTo(2.5, -40); g.fill(); g.fillStyle = '#d4a017'; g.fillRect(-8, -7, 16, 4); g.fillStyle = '#5c3d2e'; g.fillRect(-2, -3, 4, 9); }
    else if (who === 'miner') { g.fillStyle = '#8d5a2b'; g.fillRect(-2.5, -36, 5, 40); g.strokeStyle = '#adb5bd'; g.lineWidth = 5; g.lineCap = 'round'; g.beginPath(); g.arc(0, -24, 16, -2.6, -0.5); g.stroke(); g.lineCap = 'butt'; }
    else { g.fillStyle = '#8d5a2b'; g.fillRect(-2, -30, 4, 36); circ(g, 0, -33, 8, '#d4a017'); if (o.swing) circ(g, 0, -33, 14, 'rgba(255,224,102,.35)'); }
    g.restore();
    if (o.guard && who !== 'cleric') { circ(g, 16, -40 + bob, 13, '#6c757d'); circ(g, 16, -40 + bob, 8, '#adb5bd'); }
    else if (o.guard) { g.strokeStyle = 'rgba(255,224,102,.75)'; g.lineWidth = 3; g.beginPath(); g.arc(4, -45, 40, -0.9, 0.9); g.stroke(); }
    g.restore();
  }
  function drawFace(g, who, x, y, r) { const sc = r / 26; drawHero(g, who, x - 2 * sc, y + 70 * sc, 0, { sc }); }

  function drawMon(g, m, x, y, t, o) {
    g.save(); g.translate(x - o.atk * 26, y);
    const z = (m.elite ? 1.2 : 1) * (m.king ? 1.55 : 1);
    ell(g, 0, 2, 30 * z, 6, 'rgba(0,0,0,.35)');
    g.scale(z, z);
    if (m.elite || m.king) { const gr = g.createRadialGradient(0, -40, 5, 0, -40, 70); gr.addColorStop(0, 'rgba(255,77,109,.35)'); gr.addColorStop(1, 'rgba(255,77,109,0)'); g.fillStyle = gr; g.fillRect(-80, -120, 160, 130); }
    const F = (c) => (o.hit ? '#ffffff' : c), b = Math.sin(t * 3) * 1.5;
    switch (m.id) {
      case 'rat':
        g.strokeStyle = '#e5989b'; g.lineWidth = 3; g.beginPath(); g.moveTo(18, -8); g.quadraticCurveTo(38, -6, 36, -26); g.stroke();
        ell(g, 0, -12 + b * 0.5, 22, 12, F('#8d7b68')); circ(g, -20, -15, 10, F('#8d7b68')); circ(g, -15, -25, 5, '#e5989b'); circ(g, -25, -17, 2.4, '#ff4d4d'); circ(g, -30, -13, 2, '#e5989b'); break;
      case 'bat': {
        const fy = -72 + Math.sin(t * 5) * 7, fl = Math.sin(t * 20);
        g.fillStyle = F('#3c2f4f'); for (const sd of [-1, 1]) { g.beginPath(); g.moveTo(0, fy); g.lineTo(sd * 30, fy - 10 * fl - 6); g.lineTo(sd * 22, fy + 6); g.lineTo(sd * 12, fy + 2); g.fill(); }
        circ(g, 0, fy, 11, F('#4a3b5f')); circ(g, -4, fy - 2, 2.4, '#ff4d4d'); circ(g, 4, fy - 2, 2.4, '#ff4d4d'); break; }
      case 'slime':
        g.fillStyle = F('rgba(123,211,137,.9)'); g.beginPath(); g.moveTo(-26, 0); g.quadraticCurveTo(-26 - b, -40 - b * 2, 0, -40 - b * 2); g.quadraticCurveTo(26 + b, -40 - b * 2, 26, 0); g.fill();
        circ(g, 8, -26, 5, 'rgba(255,255,255,.4)'); circ(g, -9, -18, 3, '#123'); circ(g, 3, -18, 3, '#123'); break;
      case 'goblin':
        g.fillStyle = F('#4a5d3a'); g.fillRect(-9, -18, 7, 18); g.fillRect(2, -18, 7, 18); g.fillStyle = F('#6b4f2a'); rr(g, -11, -40 + b, 22, 24, 6); g.fill();
        circ(g, 0, -50 + b, 12, F('#7cb66a')); g.fillStyle = F('#7cb66a'); g.beginPath(); g.moveTo(-9, -54 + b); g.lineTo(-24, -62 + b); g.lineTo(-10, -46 + b); g.moveTo(9, -54 + b); g.lineTo(22, -62 + b); g.lineTo(10, -46 + b); g.fill();
        circ(g, -5, -52 + b, 2.5, '#ffd60a'); g.fillStyle = '#8d5a2b'; g.fillRect(-22, -48 + b, 4, 30); g.fillStyle = '#adb5bd'; g.fillRect(-30, -50 + b, 18, 5); break;
      case 'skel':
        g.strokeStyle = F('#e9ecef'); g.lineWidth = 4; g.beginPath(); g.moveTo(-6, 0); g.lineTo(-4, -22); g.moveTo(6, 0); g.lineTo(4, -22); g.moveTo(0, -22); g.lineTo(0, -48); g.stroke();
        g.lineWidth = 3; for (let i = 0; i < 3; i++) { g.beginPath(); g.moveTo(-10, -44 + i * 7); g.lineTo(10, -44 + i * 7); g.stroke(); }
        circ(g, 0, -58 + b, 11, F('#f1f3f5')); circ(g, -5, -59 + b, 3, '#222'); circ(g, 3, -59 + b, 3, '#222'); g.fillStyle = '#222'; g.fillRect(-5, -52 + b, 8, 2);
        g.fillStyle = '#9c6644'; g.save(); g.translate(-14, -40); g.rotate(-0.4); g.fillRect(-2, -30, 4, 30); g.restore(); break;
      case 'orc':
        g.fillStyle = F('#3d4a35'); g.fillRect(-14, -24, 11, 24); g.fillRect(3, -24, 11, 24); rr(g, -19, -62 + b, 38, 42, 10); g.fillStyle = F('#5b7553'); g.fill();
        circ(g, -3, -72 + b, 14, F('#6f8f63')); g.fillStyle = '#fff'; g.beginPath(); g.moveTo(-12, -66 + b); g.lineTo(-10, -76 + b); g.lineTo(-7, -66 + b); g.fill(); circ(g, -8, -77 + b, 2.6, '#ff4d4d');
        g.fillStyle = '#8d5a2b'; g.fillRect(-30, -76 + b, 5, 50); g.fillStyle = '#adb5bd'; g.beginPath(); g.moveTo(-28, -78 + b); g.lineTo(-46, -86 + b); g.lineTo(-46, -62 + b); g.lineTo(-28, -68 + b); g.fill(); break;
      case 'wraith': {
        const fy = -8 + Math.sin(t * 2.5) * 5; g.fillStyle = F('rgba(60,42,90,.92)'); g.beginPath(); g.moveTo(-18, -70 + fy); g.quadraticCurveTo(0, -96 + fy, 18, -70 + fy); g.lineTo(24, fy);
        for (let i = 0; i <= 6; i++) g.lineTo(24 - i * 8, fy - 8 + (i % 2) * 10 + Math.sin(t * 6 + i) * 3); g.fill();
        circ(g, -7, -68 + fy, 3.2, '#7df9ff'); circ(g, 4, -68 + fy, 3.2, '#7df9ff'); break; }
      case 'troll':
        g.fillStyle = F('#4f5d6b'); g.fillRect(-18, -26, 13, 26); g.fillRect(5, -26, 13, 26); ell(g, 2, -46 + b, 30, 30, F('#6c7a89')); circ(g, -20, -70 + b, 14, F('#7d8b99'));
        circ(g, -30, -66 + b, 5, F('#8d99a6')); circ(g, -24, -73 + b, 2.6, '#ffd60a'); g.fillStyle = '#6b4423'; g.save(); g.translate(-30, -50 + b); g.rotate(-0.5); rr(g, -6, -46, 12, 52, 6); g.fill(); g.restore(); break;
      case 'golem':
        g.fillStyle = F('#6b5e55'); rr(g, -22, -70 + b, 44, 46, 8); g.fill(); rr(g, -14, -24, 12, 24, 3); g.fill(); rr(g, 2, -24, 12, 24, 3); g.fill(); rr(g, -14, -92 + b, 26, 22, 6); g.fill();
        circ(g, -32, -50 + b, 11, F('#7a6c62')); circ(g, -8, -82 + b, 3, '#ffd60a'); circ(g, 4, -82 + b, 3, '#ffd60a');
        for (const [px, py] of [[-10, -56], [8, -44], [12, -62]]) circ(g, px, py + b, 4, '#e09f3e'); break;
      case 'lich':
        g.fillStyle = F('#4a2c6a'); g.beginPath(); g.moveTo(-8, -66 + b); g.lineTo(8, -66 + b); g.lineTo(22, 0); g.lineTo(-22, 0); g.fill();
        circ(g, 0, -74 + b, 11, F('#e9ecef')); circ(g, -5, -75 + b, 3, '#7df9ff'); circ(g, 3, -75 + b, 3, '#7df9ff');
        g.fillStyle = '#d4a017'; g.beginPath(); g.moveTo(-10, -84 + b); for (let i = 0; i < 4; i++) { g.lineTo(-10 + i * 6.7 + 3.3, -94 + b); g.lineTo(-10 + (i + 1) * 6.7, -84 + b); } g.fill();
        g.fillStyle = '#5c3d2e'; g.fillRect(-28, -86 + b, 4, 86); circ(g, -26, -90 + b, 7, '#80ffdb'); circ(g, -26, -90 + b, 13, 'rgba(128,255,219,.25)'); break;
      case 'king':
        g.fillStyle = F('#2b2d42'); g.fillRect(-20, -26, 16, 26); g.fillRect(4, -26, 16, 26); g.fillStyle = F('#4a4e69'); rr(g, -28, -72 + b, 56, 50, 12); g.fill();
        g.fillStyle = '#9a8c98'; g.fillRect(-28, -44 + b, 56, 6);
        circ(g, 0, -86 + b, 17, F('#e0b896')); g.fillStyle = F('#ced4da'); g.beginPath(); g.moveTo(-17, -84 + b); g.lineTo(17, -84 + b); g.lineTo(0, -40 + b); g.fill();
        circ(g, -7, -90 + b, 3, '#ff7b00'); circ(g, 6, -90 + b, 3, '#ff7b00');
        g.fillStyle = '#ffd166'; g.beginPath(); g.moveTo(-16, -100 + b); for (let i = 0; i < 5; i++) { g.lineTo(-16 + i * 6.4 + 3.2, -116 + b); g.lineTo(-16 + (i + 1) * 6.4, -100 + b); } g.fill();
        g.fillStyle = '#6b4423'; g.fillRect(-42, -96 + b, 6, 76); g.fillStyle = '#6c757d'; rr(g, -54, -108 + b, 30, 18, 4); g.fill(); break;
    }
    if (m.elite) { g.font = '800 10px Nunito, system-ui'; g.textAlign = 'center'; g.fillStyle = '#ff8fa3'; g.fillText('ELITE', 0, 14); }
    g.restore();
  }
  function drawVein(g, o, x, y, t) {
    const sh = t - o.hitT < 0.1 ? (Math.random() - 0.5) * 6 : 0, broke = o.broke > 0 ? clamp((t - o.broke) / 0.3, 0, 1) : 0;
    const col = { copper: ['#e09f3e', '#f4a261'], silver: ['#ced4da', '#f8f9fa'], gem: ['#9d4edd', '#e0aaff'] }[o.c.kind];
    g.save(); g.translate(x + sh, y);
    g.fillStyle = '#5a4a3f'; g.beginPath(); g.moveTo(-46, 0); g.lineTo(-38, -40); g.lineTo(-12, -62); g.lineTo(18, -56); g.lineTo(42, -30); g.lineTo(48, 0); g.fill();
    g.fillStyle = '#6f5d50'; g.beginPath(); g.moveTo(-30, -36); g.lineTo(-12, -54); g.lineTo(6, -48); g.lineTo(-10, -30); g.fill();
    g.globalAlpha *= 1 - broke;
    for (const [px, py, r] of [[-20, -26, 9], [8, -36, 11], [24, -16, 8], [-4, -12, 7]]) { g.fillStyle = col[0]; g.beginPath(); g.moveTo(px, py - r); g.lineTo(px + r * 0.8, py); g.lineTo(px, py + r); g.lineTo(px - r * 0.8, py); g.fill(); circ(g, px - 2, py - 3, r * 0.25, col[1]); }
    g.restore();
  }
  function drawFire(g, x, y, t) {
    const gr = g.createRadialGradient(x, y - 20, 4, x, y - 20, 90); gr.addColorStop(0, 'rgba(255,170,60,.45)'); gr.addColorStop(1, 'rgba(255,170,60,0)'); g.fillStyle = gr; g.fillRect(x - 100, y - 120, 200, 130);
    g.fillStyle = '#5c3d2e'; g.save(); g.translate(x, y - 4); g.rotate(0.3); g.fillRect(-26, -4, 52, 8); g.rotate(-0.6); g.fillRect(-26, -4, 52, 8); g.restore();
    for (let i = 0; i < 3; i++) { const h = 30 + Math.sin(t * 11 + i * 2) * 6 - i * 6, w = 14 - i * 3; g.fillStyle = ['#e85d04', '#ffb703', '#fff3b0'][i]; g.beginPath(); g.moveTo(x - w, y - 6); g.quadraticCurveTo(x - w, y - h * 0.6, x + Math.sin(t * 9) * 3, y - h); g.quadraticCurveTo(x + w, y - h * 0.6, x + w, y - 6); g.fill(); }
    g.fillStyle = '#7a4a1e'; rr(g, x - 70, y - 8, 34, 10, 5); g.fill();
  }
  function drawChest(g, x, y, open) {
    g.fillStyle = '#7a4a1e'; rr(g, x - 30, y - 34, 60, 34, 5); g.fill(); g.fillStyle = '#d4a017'; g.fillRect(x - 30, y - 22, 60, 4); g.fillRect(x - 4, y - 28, 8, 10);
    g.save(); g.translate(x - 30, y - 34); if (open) g.rotate(-0.9); g.fillStyle = '#8d5a2b'; rr(g, 0, -16, 60, 16, 7); g.fill(); g.fillStyle = '#d4a017'; g.fillRect(0, -4, 60, 3); g.restore();
    if (open) { const gr = g.createRadialGradient(x, y - 40, 2, x, y - 40, 50); gr.addColorStop(0, 'rgba(255,209,102,.7)'); gr.addColorStop(1, 'rgba(255,209,102,0)'); g.fillStyle = gr; g.fillRect(x - 60, y - 100, 120, 100); }
  }
  function drawTrader(g, x, y, t) {
    g.fillStyle = '#6d4c41'; rr(g, x + 14, y - 46, 30, 40, 6); g.fill();
    g.fillStyle = '#2d6a4f'; g.beginPath(); g.moveTo(x - 16, y); g.lineTo(x - 10, y - 56); g.quadraticCurveTo(x, y - 82, x + 12, y - 56); g.lineTo(x + 18, y); g.fill();
    circ(g, x - 2, y - 58, 9, '#f2c6a0'); g.fillStyle = '#1b4332'; g.beginPath(); g.arc(x, y - 60, 12, Math.PI * 0.9, Math.PI * 2.1); g.fill(); circ(g, x - 6, y - 58, 1.8, '#222');
    g.fillStyle = '#5c3d2e'; g.fillRect(x - 32, y - 56, 3, 30); circ(g, x - 30, y - 58, 6 + Math.sin(t * 9) * 0.6, '#ffd166');
    for (const [i, c] of ['#e63946', '#8ecae6', '#adb5bd'].entries()) circ(g, x - 40 + i * 14, y - 4, 5, c);
  }
  function drawRune(g, x, y, t) {
    const p = 0.6 + Math.sin(t * 3) * 0.25, gr = g.createRadialGradient(x, y - 50, 4, x, y - 50, 80); gr.addColorStop(0, `rgba(179,136,235,${0.45 * p})`); gr.addColorStop(1, 'rgba(179,136,235,0)');
    g.fillStyle = gr; g.fillRect(x - 90, y - 140, 180, 140);
    g.fillStyle = '#4a4458'; g.beginPath(); g.moveTo(x - 22, y); g.lineTo(x - 18, y - 80); g.quadraticCurveTo(x, y - 96, x + 18, y - 80); g.lineTo(x + 22, y); g.fill();
    g.strokeStyle = `rgba(224,170,255,${p + 0.2})`; g.lineWidth = 3; g.beginPath(); g.moveTo(x, y - 70); g.lineTo(x, y - 30); g.moveTo(x - 10, y - 58); g.lineTo(x + 10, y - 44); g.moveTo(x + 10, y - 58); g.lineTo(x - 10, y - 44); g.stroke();
  }

  window.DelveDeck = { NODES, MONS, KING, BOSS_DEPTH, createRun };
  const kit = Kit.game({
    id: 'delve-deck', title: 'Delve Deck', tagline: 'Descend the mine-dungeon one room at a time. Fight, mine, rest, gamble, and know when to turn back.',
    howTo: 'Each room deals cards: tap one to enter that room. Fights show how much HP they will cost; Guard halves the damage and the loot. Retreat between rooms to bank everything. Die and you keep only a fraction. Spend gold and ore at camp.',
    runVerb: 'Delve!', winTitle: 'The Mountain King falls!', loseTitle: 'Slain in the deep',
    colors: { accent: '#ffb35c', bg: '#15111c', card: '#271f30' },
    currencies: [{ id: 'gold', name: 'gold', color: '#ffd166' }, { id: 'ore', name: 'ore', color: '#f4a261' }],
    characters: [
      { id: 'fighter', name: 'Fighter', blurb: 'Balanced: good sword, sturdy, a little armor.', unlock: 0 },
      { id: 'miner', name: 'Miner', blurb: 'Rich veins and fewer cave-ins, weaker in fights.', unlock: 1 },
      { id: 'cleric', name: 'Cleric', blurb: 'Big heals at campfires, holy damage vs undead.', unlock: 2 },
    ],
    drawFace, nodes: NODES,
    baseStats(who) {
      const s = { hp: 32, atk: 6, armor: 1, crit: 0.05, critMult: 2, potions: 0, potionHeal: 0.45, revive: 0, reviveHp: 0.5, mine: 1, cave: 1, caveDmg: 1, rest: 0.25,
        gold: 1, keep: 0.3, extraCards: 0, rerolls: 0, shop: false, event: false, elite: false, gem: false, holy: 1, killHeal: 0, veinGold: 0 };
      if (who === 'miner') { s.hp = 30; s.armor = 0; s.atk = 4; s.mine = 1.25; s.cave = 0.85; s.caveDmg = 0.9; }
      if (who === 'cleric') { s.hp = 28; s.atk = 5; s.armor = 0; s.holy = 1.6; s.rest = 0.45; s.killHeal = 1; }
      return s;
    },
    createRun,
  });
  window.DelveDeck.kit = kit;
  if (typeof document !== 'undefined' && document.body) document.body.dataset.ready = '1';
})();
