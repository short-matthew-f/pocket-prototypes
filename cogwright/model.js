// Cogwright rules: DOM-free and seeded, so node tests and balance bots can drive it.
//   save        plain JSON (localStorage in the app); every random roll comes from save.rng, so saves don't repeat drops
//   stats(save) the upgrade tree + Blueprints folded into one stats object
//   solve(save) the gear train: which gears turn, which way, how fast, which jam, which sets are meshed
//   shift       a 60-120 s battle; update(dt, {wrench:{x,y}|null}); crank() for a burst; end() → result
//   offline     earnings while away (collectors + Night Shift), clamped and capped, never above the active rate
(function (root) {
  'use strict';
  const D = typeof module !== 'undefined' ? require('./data.js') : root.CogData;
  const { SIZES, MAIN_TEETH, GEARS, TROOPS, ENEMY_KINDS, ZONES, MAX_DEPTH, RARITIES, AFFIXES, LEGENDARIES, SETS, TREE, BLUEPRINTS } = D;
  const SAVE_V = 1;
  // difficulty knobs (the balance bots in test.js tune these)
  const TUNE = { enemyGrowth: 1.5, enemyDmgGrowth: 1.4, armorGrowth: 1.3, gateBase: 400, scrapGrowth: 1.10, spawnBase: 0.55, spawnStep: 0.06, wrenchGrowth: 1.1, itemGrowth: 1.12 };
  const LANE = { L: 60, W: 26 };

  // ------------------------------------------------------------------ rng (mulberry32; the state lives in the save)
  function rngFrom(state) {
    const r = { s: state >>> 0 };
    r.next = () => { let t = (r.s = (r.s + 0x6d2b79f5) >>> 0); t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    r.int = (a, b) => a + Math.floor(r.next() * (b - a + 1));
    r.pick = (arr) => arr[Math.floor(r.next() * arr.length)];
    r.weighted = (pairs) => { const tot = pairs.reduce((a, p) => a + p[1], 0); let x = r.next() * tot; for (const p of pairs) { x -= p[1]; if (x < 0) return p[0]; } return pairs[pairs.length - 1][0]; };
    return r;
  }
  const withRng = (save, f) => { const r = rngFrom(save.rng); const out = f(r); save.rng = r.s; return out; };

  // ------------------------------------------------------------------ hexes (axial q, r; flat neighbour order is fixed)
  const NEI = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];
  const key = (q, r) => q + ',' + r;
  const unkey = (k) => k.split(',').map(Number);
  const hexDist = (q, r) => (Math.abs(q) + Math.abs(r) + Math.abs(q + r)) / 2;
  function cells(R) { const out = []; for (let q = -R; q <= R; q++) for (let r = -R; r <= R; r++) if (hexDist(q, r) <= R) out.push(key(q, r)); return out; }
  const neighbours = (k) => { const [q, r] = unkey(k); return NEI.map(([a, b]) => key(q + a, r + b)); };

  // ------------------------------------------------------------------ stats
  function baseStats() {
    return { wrenchDmg: 10, wrenchRad: 4, pickRad: 5, wrenchCrit: 0, autoWrench: 0, wrenchHeal: 0, shiftTime: 60, doorHp: 120, cranks: 1, crankTime: 5,
      sweep: 0.2, doorArmor: 0, troopDmg: 1, troopHp: 1, troopSpeed: 1, troopCap: 60, gateDmg: 1, maxRank: 5, mainRpm: 24, invSlots: 16, boardR: 2,
      engineBonus: 0, spellPower: 1, vault: 1, dropRate: 1, mf: 0, brassMult: 1, autoSalvage: 0, ilvlBonus: 0, scrapMult: 1, offlineCap: 7200,
      idleEff: 0.3, nightEff: 0, idleMult: 1, headStart: 0 };
  }
  function stats(save) {
    const s = baseStats();
    for (const n of TREE) { const l = save.tree[n.id] || 0; if (l > 0) n.fx(s, l); }
    for (const b of BLUEPRINTS) { const l = save.bp[b.id] || 0; if (l > 0) b.fx(s, l); }
    return s;
  }
  const nodeCost = (n, level) => Math.round(n.cost * Math.pow(n.grow, level));
  const nodeOpen = (save, n) => n.free || n.req.length === 0 || n.req.some((id) => (save.tree[id] || 0) > 0); // any one parent opens a node
  function canBuyNode(save, id) {
    const n = TREE.find((x) => x.id === id); if (!n) return 'no such upgrade';
    const l = save.tree[id] || 0;
    if (l >= n.max) return 'maxed';
    if (!nodeOpen(save, n)) return 'locked';
    if (save.scrap < nodeCost(n, l)) return 'not enough scrap';
    return '';
  }
  function buyNode(save, id) {
    const e = canBuyNode(save, id); if (e) return e;
    const n = TREE.find((x) => x.id === id); save.scrap -= nodeCost(n, save.tree[id] || 0); save.tree[id] = (save.tree[id] || 0) + 1; return '';
  }
  function buyBlueprint(save, id) {
    const b = BLUEPRINTS.find((x) => x.id === id); if (!b) return 'no such blueprint';
    const l = save.bp[id] || 0; if (l >= b.max) return 'maxed';
    const c = nodeCost(b, l); if (save.blueprints < c) return 'not enough blueprints';
    save.blueprints -= c; save.bp[id] = l + 1; return '';
  }

  // ------------------------------------------------------------------ items
  const ilvlMult = (il) => Math.pow(TUNE.itemGrowth, il - 1);
  const rankMult = (rk) => Math.pow(1.6, rk - 1);
  const rarityOf = (id) => RARITIES.find((r) => r.id === id);
  const PREFIX = { dmg: 'Keen', hp: 'Sturdy', aspd: 'Brisk', move: 'Swift', leech: 'Thirsty', crit: 'Cruel', twin: 'Twinned', thorns: 'Barbed', spshield: 'Plated',
    cw: 'Sunwise', ccw: 'Widdershins', rpm: 'Spinning', drive: 'Driving', bolt: 'Sparking', scrap: 'Thrifty', mf: 'Lucky', wrench: 'Handy', repair: 'Mending',
    door: 'Bolted', potency: 'Potent', quick: 'Hasty', chain: 'Forked', factor: 'Geared', yield: 'Bountiful', idle: 'Dreaming' };
  const RARE_A = ['Brass', 'Copper', 'Rust', 'Iron', 'Ember', 'Tick', 'Coil', 'Grim', 'Bright', 'Hollow', 'Molten', 'Sly'];
  const RARE_B = ['Howler', 'Heart', 'Grinder', 'Wheel', 'Choir', 'Turner', 'Biter', 'Crown', 'Engine', 'Whisper', 'Spindle', 'Hammer'];

  function rollAffix(r, base, il, not) {
    const fam = GEARS[base].fam;
    const pool = Object.keys(AFFIXES).filter((k) => !not.includes(k) && AFFIXES[k].fam.includes(fam) && (!AFFIXES[k].only || AFFIXES[k].only.includes(base)));
    if (!pool.length) return null;
    const k = r.pick(pool), A = AFFIXES[k];
    let v = r.int(A.v[0], A.v[1]);
    v = A.flat ? v * (1 + 0.12 * (il - 1)) : v * (1 + 0.02 * (il - 1));
    if (A.scale) v *= A.scale;
    v = A.scale ? Math.round(v * 100) / 100 : Math.round(v);
    return [k, v];
  }
  function makeItem(save, r, o) { // o: {base?, size?, rarity, ilvl, leg?, set?}
    const it = { id: save.nextId++, base: o.base, size: o.size, rarity: o.rarity, ilvl: o.ilvl, rank: 1, affixes: [] };
    if (o.rarity === 'legendary') { const L = LEGENDARIES[o.leg]; it.leg = o.leg; it.base = L.base; it.size = L.size; }
    if (o.rarity === 'set') it.set = o.set;
    const R = rarityOf(o.rarity), n = r.int(R.affixes[0], R.affixes[1]);
    for (let i = 0; i < n; i++) { const a = rollAffix(r, it.base, it.ilvl, it.affixes.map((x) => x[0])); if (a) it.affixes.push(a); }
    it.name = itemName(it, r);
    save.items[it.id] = it;
    return it;
  }
  function itemName(it, r) {
    const g = GEARS[it.base];
    if (it.leg) return LEGENDARIES[it.leg].name;
    if (it.set) return SETS[it.set].pieces[it.base];
    if (it.rarity === 'rare') return `${r.pick(RARE_A)} ${r.pick(RARE_B)}`;
    if (it.rarity === 'magic' && it.affixes[0]) return `${PREFIX[it.affixes[0][0]]} ${g.name}`;
    return `${SIZES[it.size].name} ${g.name}`;
  }
  const BASE_W = [['grunt', 1.3], ['archer', 1.2], ['brute', 1.0], ['tinker', 0.8], ['haste', 0.7], ['overcharge', 0.7], ['lightning', 0.8], ['shield', 0.6], ['engine', 0.7], ['collector', 0.8]];
  function rollDrop(save, r, il, st, force) {
    const mf = st.mf;
    let rar = force || r.weighted(RARITIES.map((R) => [R.id, R.weight * (R.id === 'common' ? 1 : R.id === 'magic' ? 1 + mf * 0.5 : 1 + mf)]));
    save.pity = (save.pity || 0) + 1;
    if (!force && !save.stats.legendaries && save.pity >= 20) rar = 'legendary'; // a first legendary always shows up early
    if (rar === 'legendary') { save.pity = 0; save.stats.legendaries = (save.stats.legendaries || 0) + 1; return makeItem(save, r, { rarity: rar, ilvl: il, leg: r.pick(Object.keys(LEGENDARIES)) }); }
    if (rar === 'set') { const sk = r.pick(Object.keys(SETS)); return makeItem(save, r, { rarity: rar, ilvl: il, set: sk, base: r.pick(Object.keys(SETS[sk].pieces)), size: 'M' }); }
    return makeItem(save, r, { rarity: rar, ilvl: il, base: r.weighted(BASE_W), size: r.weighted([['S', 35], ['M', 45], ['L', 20]]) });
  }
  function dropOdds(st) { // shown on screen: every number that matters is visible
    const ws = RARITIES.map((R) => [R, R.weight * (R.id === 'common' ? 1 : R.id === 'magic' ? 1 + st.mf * 0.5 : 1 + st.mf)]);
    const tot = ws.reduce((a, w) => a + w[1], 0);
    return { perKill: 0.025 * st.dropRate, rarities: ws.map(([R, w]) => ({ id: R.id, name: R.name, color: R.color, pct: (100 * w) / tot })) };
  }

  const invItems = (save) => Object.values(save.items).filter((it) => it.loc === 'inv');
  const vaultCount = (save) => Object.values(save.items).filter((it) => it.vault).length;
  function salvageValue(save, it, st) { return Math.max(1, Math.round(rarityOf(it.rarity).brass * (1 + it.ilvl / 10) * it.rank * st.brassMult)); }
  function addLoot(save, it, st) { // into the drawers, or salvaged when the filter says so / the drawers are full
    save.codex = save.codex || {}; if (it.leg) save.codex[it.leg] = 1; if (it.set) save.codex[it.set + ':' + it.base] = 1;
    const filtered = (st.autoSalvage >= 1 && it.rarity === 'common') || (st.autoSalvage >= 2 && it.rarity === 'magic');
    if (filtered || invItems(save).length >= st.invSlots) { const b = salvageValue(save, it, st); save.brass += b; delete save.items[it.id]; return { salvaged: b }; }
    it.loc = 'inv'; return { kept: true };
  }

  // ------------------------------------------------------------------ the gear train
  function solve(save, st = stats(save)) {
    const R = st.boardR, inBoard = new Set(cells(R));
    const at = (k) => (k === '0,0' ? 'main' : inBoard.has(k) && save.board[k] ? save.items[save.board[k]] : null);
    const G = {}; // cell -> node
    for (const k of Object.keys(save.board)) if (inBoard.has(k) && save.items[save.board[k]]) G[k] = { k, item: save.items[save.board[k]], state: 'idle', dir: 0, rpm: 0, parent: null, driven: false };
    const main = { k: '0,0', item: null, state: 'spin', dir: 1, boost: 1, rpm: st.mainRpm, parent: null, main: true };
    const node = (k) => (k === '0,0' ? main : G[k]);
    const queue = [], queued = new Set(['0,0']);
    const expand = (n) => { for (const nk of neighbours(n.k)) if (G[nk] && !queued.has(nk)) { queued.add(nk); G[nk].from = n; queue.push(G[nk]); } };
    expand(main);
    while (queue.length) {
      const n = queue.shift();
      const spinNb = neighbours(n.k).map(node).filter((x) => x && x.state === 'spin');
      const dirs = new Set(spinNb.map((x) => x.dir));
      if (dirs.size > 1 && n.item.leg !== 'ouroboros') { n.state = 'jam'; continue; }
      const p = n.from;
      n.state = 'spin'; n.dir = -p.dir; n.parent = p.k;
      // boosts don't stack down a chain: a gear gets the biggest one between it and the Mainspring
      n.boost = Math.max(p.boost, driveMult(p, st)); n.driven = n.boost > 1;
      n.rpm = ((st.mainRpm * MAIN_TEETH) / SIZES[n.item.size].teeth) * n.boost * (1 + affix(n.item, 'rpm') / 100);
      expand(n);
    }
    // sets: distinct pieces in the largest cluster of meshed, turning pieces of that set
    const sets = {};
    for (const sk of Object.keys(SETS)) {
      const mine = Object.values(G).filter((n) => n.state === 'spin' && n.item.set === sk), seen = new Set(); let best = 0;
      for (const n of mine) {
        if (seen.has(n.k)) continue; const stack = [n], bases = new Set(); seen.add(n.k);
        while (stack.length) { const c = stack.pop(); bases.add(c.item.base); for (const nk of neighbours(c.k)) { const m = G[nk]; if (m && m.state === 'spin' && m.item.set === sk && !seen.has(nk)) { seen.add(nk); stack.push(m); } } }
        best = Math.max(best, bases.size);
      }
      sets[sk] = best;
    }
    if (sets.furnace >= 2) for (const n of Object.values(G)) if (n.state === 'spin') n.rpm *= 1.2;
    const list = Object.values(G);
    return { main, gears: list, byCell: G, sets, spinning: list.filter((n) => n.state === 'spin'), jammed: list.filter((n) => n.state === 'jam') };
  }
  const affix = (it, k) => it.affixes.reduce((a, [kk, v]) => a + (kk === k ? v : 0), 0);
  function engineFactor(it, st) { return ({ S: 1.4, M: 1.5, L: 1.6 })[it.size] + st.engineBonus + affix(it, 'factor') + 0.1 * (it.rank - 1); }
  function driveMult(p, st) {
    if (p.main) return 1;
    let m = 1 + affix(p.item, 'drive') / 100;
    if (p.item.base === 'engine') m *= engineFactor(p.item, st);
    if (p.item.leg === 'grandfather') m *= 2;
    return m;
  }

  // what a gear does, as numbers (used by the Shift and shown on the gear card)
  function gearPower(it, n, st, sets) {
    const sm = SIZES[it.size].mult, scale = sm * rankMult(it.rank) * ilvlMult(it.ilvl), fam = GEARS[it.base].fam;
    const out = { fam, scale };
    if (fam === 'unit') {
      const T = TROOPS[GEARS[it.base].troop];
      const cw = n && n.dir === 1 ? affix(it, 'cw') : 0, ccw = n && n.dir === -1 ? affix(it, 'ccw') : 0;
      out.hp = T.hp * scale * (1 + (affix(it, 'hp') + ccw) / 100) * st.troopHp;
      out.dmg = T.dmg * scale * (1 + (affix(it, 'dmg') + cw) / 100) * st.troopDmg * (sets && sets.choir >= 2 ? 1.25 : 1);
      out.every = T.every / (1 + affix(it, 'aspd') / 100);
      out.speed = T.speed * (1 + affix(it, 'move') / 100) * st.troopSpeed;
      out.leech = affix(it, 'leech') / 100; out.crit = affix(it, 'crit') / 100; out.twin = affix(it, 'twin') / 100; out.thorns = affix(it, 'thorns') / 100;
      out.shield = affix(it, 'spshield') * rankMult(it.rank) + (sets && sets.choir >= 3 ? 20 * ilvlMult(it.ilvl) : 0);
      out.range = T.range; out.r = T.r * (it.size === 'L' ? 1.3 : it.size === 'S' ? 0.85 : 1);
      if (T.heal) { out.heal = T.heal * scale; out.repair = T.repair * scale; }
    } else if (fam === 'spell') {
      const p = st.spellPower * (1 + affix(it, 'potency') / 100) * (1 + 0.15 * (it.rank - 1)) * ({ S: 0.85, M: 1, L: 1.2 })[it.size];
      out.p = p; out.s = scale * st.spellPower * (1 + affix(it, 'potency') / 100); out.every = Math.max(1, GEARS[it.base].every - affix(it, 'quick'));
      out.chains = 3 + affix(it, 'chain');
    } else if (fam === 'engine') out.factor = engineFactor(it, st);
    else out.yield = 1.0 * scale * (1 + affix(it, 'yield') / 100);
    out.bolt = affix(it, 'bolt') * rankMult(it.rank); out.scrap = affix(it, 'scrap'); out.repairTurn = affix(it, 'repair'); out.door = affix(it, 'door');
    return out;
  }
  function describe(it, st, n, sets) { // lines for the gear card
    const g = GEARS[it.base], P = gearPower(it, n, st, sets), R = rarityOf(it.rarity), lines = [];
    lines.push(`${SIZES[it.size].name} · ${SIZES[it.size].teeth} teeth · item level ${it.ilvl}${it.rank > 1 ? ' · rank ' + it.rank : ''}`);
    if (n && n.state === 'spin') lines.push(`Turning ${n.dir === 1 ? 'clockwise' : 'counter-clockwise'} at ${n.rpm.toFixed(1)} RPM`);
    else if (n && n.state === 'jam') lines.push('JAMMED: it touches two gears turning opposite ways');
    else if (n) lines.push('Idle: not meshed to the Mainspring');
    if (P.fam === 'unit') lines.push(`Each turn: one ${TROOPS[g.troop].name} (${Math.round(P.hp)} hp, ${P.dmg.toFixed(1)} dmg every ${P.every.toFixed(2)} s)`);
    else if (P.fam === 'spell') lines.push(g.desc(P.p, P.s));
    else if (P.fam === 'engine') lines.push(g.desc(P.factor));
    else lines.push(g.desc(P.yield));
    const aff = it.affixes.map(([k, v]) => ({ k, txt: AFFIXES[k].txt(v), dim: (k === 'cw' && n && n.dir !== 1) || (k === 'ccw' && n && n.dir !== -1) }));
    return { name: it.name, rarity: R, lines, affixes: aff, power: it.leg ? LEGENDARIES[it.leg].power : null,
      set: it.set ? { name: SETS[it.set].name, have: sets ? sets[it.set] : 0, bonus: SETS[it.set].bonus.slice(2) } : null };
  }

  // ------------------------------------------------------------------ inventory actions ('' = ok, else a reason)
  function place(save, id, k) {
    const st = stats(save), it = save.items[id];
    if (!it) return 'no such gear';
    if (k === '0,0' || !cells(st.boardR).includes(k)) return 'not a free cell';
    const from = Object.keys(save.board).find((c) => save.board[c] === id);
    const other = save.board[k];
    if (other === id) return '';
    if (other) { if (from) { save.board[from] = other; } else { save.items[other].loc = 'inv'; delete save.board[k]; } }
    else if (from) delete save.board[from];
    save.board[k] = id; it.loc = 'board';
    return '';
  }
  function unplace(save, k) {
    const id = save.board[k]; if (!id) return 'empty';
    if (invItems(save).length >= stats(save).invSlots) return 'drawers are full';
    delete save.board[k]; save.items[id].loc = 'inv'; return '';
  }
  function canMerge(save, a, b) {
    const A = save.items[a], B = save.items[b]; if (!A || !B || a === b) return 'pick two gears';
    if (A.base !== B.base || A.size !== B.size) return 'only identical gears (same type and size) merge';
    if (A.rank !== B.rank) return 'ranks must match';
    if (B.rank >= stats(save).maxRank) return 'already at the top rank';
    if (A.vault && !B.vault) return 'take it out of the Vault first';
    return '';
  }
  function merge(save, src, dst) { // dst keeps its affixes and rises a rank; src is used up
    const e = canMerge(save, src, dst); if (e) return e;
    const k = Object.keys(save.board).find((c) => save.board[c] === src); if (k) delete save.board[k];
    delete save.items[src]; save.items[dst].rank++; return '';
  }
  function salvage(save, id) {
    const it = save.items[id]; if (!it) return 'no such gear';
    if (it.vault) return 'take it out of the Vault first';
    const k = Object.keys(save.board).find((c) => save.board[c] === id); if (k) delete save.board[k];
    save.brass += salvageValue(save, it, stats(save)); delete save.items[id]; return '';
  }
  const rerollCost = (it) => Math.round(5 * (RARITIES.findIndex((r) => r.id === it.rarity) + 1) * (1 + it.ilvl / 10));
  function reroll(save, id, idx) {
    const it = save.items[id]; if (!it || !it.affixes[idx]) return 'pick an affix';
    const c = rerollCost(it); if (save.brass < c) return 'not enough brass';
    const a = withRng(save, (r) => rollAffix(r, it.base, it.ilvl, it.affixes.map((x) => x[0])));
    if (!a) return 'nothing else can roll here';
    save.brass -= c; it.affixes[idx] = a; return '';
  }
  const temperCost = (it, to) => Math.round(4 * (to - it.ilvl) * (RARITIES.findIndex((r) => r.id === it.rarity) + 1));
  const maxIlvl = (save) => Math.min(MAX_DEPTH + 3, save.unlocked + stats(save).ilvlBonus);
  function temper(save, id) {
    const it = save.items[id]; if (!it) return 'no such gear';
    const to = maxIlvl(save); if (it.ilvl >= to) return 'already at your best item level';
    const c = temperCost(it, to); if (save.brass < c) return 'not enough brass';
    save.brass -= c;
    // flat affixes grow with the item
    for (const a of it.affixes) { const A = AFFIXES[a[0]]; if (A.flat) a[1] = Math.round(a[1] * (1 + 0.12 * (to - 1)) / (1 + 0.12 * (it.ilvl - 1)) * 100) / 100; }
    it.ilvl = to; return '';
  }
  function toggleVault(save, id) {
    const it = save.items[id]; if (!it) return 'no such gear';
    if (!it.vault && vaultCount(save) >= stats(save).vault) return 'the Vault is full';
    it.vault = !it.vault; return '';
  }

  // ------------------------------------------------------------------ save
  function starterKit(save) {
    withRng(save, (r) => {
      const a = makeItem(save, r, { rarity: 'common', ilvl: 1, base: 'grunt', size: 'M' }); a.loc = 'board'; save.board['1,0'] = a.id;
      makeItem(save, r, { rarity: 'common', ilvl: 1, base: 'grunt', size: 'S' }).loc = 'inv';
      makeItem(save, r, { rarity: 'common', ilvl: 1, base: 'archer', size: 'M' }).loc = 'inv';
    });
  }
  function newSave(seed = 12345, now = 0) {
    const save = { v: SAVE_V, rng: seed >>> 0, scrap: 0, brass: 0, blueprints: 0, tree: { root: 1 }, bp: {}, board: {}, items: {}, nextId: 1,
      depth: 1, unlocked: 1, best: 0, overhauls: 0, pity: 0,
      stats: { shifts: 0, kills: 0, legendaries: 0, playSecs: 0, firstLegendaryAt: 0, bossKills: 0, scrapTotal: 0 },
      avg: { scrap: 0, drops: 0, secs: 0, n: 0 }, lastSeen: now, settings: { muted: false }, codex: {} };
    starterKit(save);
    return save;
  }
  function load(json, now) { // tolerant: a corrupt or foreign save gives a fresh one
    let s; try { s = typeof json === 'string' ? JSON.parse(json) : json; } catch { s = null; }
    if (!s || typeof s !== 'object' || !s.items || !s.board) return newSave((now * 7919) >>> 0 || 1, now);
    if ((s.v || 0) < SAVE_V) { /* future migrations go here */ s.v = SAVE_V; }
    const fresh = newSave(1, now);
    for (const k of Object.keys(fresh)) if (s[k] === undefined) s[k] = fresh[k];
    for (const k of Object.keys(fresh.stats)) if (s.stats[k] === undefined) s.stats[k] = fresh.stats[k];
    if (!s.tree.root) s.tree.root = 1;
    for (const k of Object.keys(s.board)) if (!s.items[s.board[k]]) delete s.board[k];
    return s;
  }

  // ------------------------------------------------------------------ zones + enemies
  const zoneOf = (d) => ZONES.find((z) => d >= z.depths[0] && d <= z.depths[1]) || ZONES[ZONES.length - 1];
  const isBossDepth = (d) => d % 10 === 0;
  const enemyScale = (d) => Math.pow(TUNE.enemyGrowth, d - 1);
  function enemyMix(d) {
    const w = (d - 1) % 10 + 1; // depth inside the zone
    return [['basic', 60], ['ranged', w >= 2 ? 18 + w : 0], ['tank', w >= 3 ? 12 + w : 0], ['armor', w >= 5 ? 3 + w : 0]].filter((x) => x[1] > 0);
  }
  const gateHp = (d) => TUNE.gateBase * enemyScale(d);

  // ------------------------------------------------------------------ the Shift
  function createShift(save, opts = {}) {
    const st = stats(save), depth = opts.depth || save.depth, zone = zoneOf(depth);
    const seed = withRng(save, (r) => Math.floor(r.next() * 4294967296));
    const r = rngFrom(seed);
    const board = solve(save, st), sets = board.sets;
    const es = enemyScale(depth), boss = isBossDepth(depth);
    const S = { t: 0, time: st.shiftTime, depth, zone, boss, over: false, outcome: null,
      door: { hp: st.doorHp, max: st.doorHp }, gate: { hp: gateHp(depth), max: gateHp(depth) },
      troops: [], enemies: [], drops: [], shots: [], events: [], scrap: 0, brass: 0, kills: 0, items: [], salvaged: 0,
      cranks: st.cranks, crankT: 0, buffs: { haste: 0, hasteM: 0, over: 0, overM: 0 }, wrench: null, sprite: { a: 0, x: 13, y: 30 },
      bossSpawned: false, bossDead: false, spawnAcc: 0, surge: 0, held: 0, stats: st, sets };
    // per-gear runtime
    const esc = board.spinning.some((n) => n.item.leg === 'escapement');
    const heart = board.spinning.some((n) => n.item.leg === 'heart');
    const storm = board.spinning.some((n) => n.item.leg === 'stormcoil');
    S.door.max = S.door.hp = st.doorHp + board.spinning.reduce((a, n) => a + affix(n.item, 'door'), 0);
    S.train = board.gears.map((n) => ({ n, k: n.k, item: n.item, P: gearPower(n.item, n, st, sets), turns: 0, done: 0, angle: 0, pulse: 0 }));
    S.mainAngle = 0;
    const ev = (type, o = {}) => { if (S.events.length < 200) S.events.push({ type, ...o }); };

    function spawnTroop(g, mult = 1) {
      const P = g.P, T = TROOPS[GEARS[g.item.base].troop];
      if (S.troops.length >= st.troopCap) return;
      const tr = { side: 1, kind: g.item.base, x: 3 + r.next() * (LANE.W - 6), y: 1.5, hp: P.hp, max: P.hp, dmg: P.dmg * mult, every: P.every, cd: r.next() * 0.3, speed: P.speed, range: P.range, r: P.r,
        leech: P.leech, crit: P.crit, thorns: P.thorns, shield: P.shield, heal: P.heal || 0, size: g.item.size, rarity: g.item.rarity, ranged: T.range > 3, hit: 0 };
      if (P.repair) S.door.hp = Math.min(S.door.max, S.door.hp + P.repair);
      S.troops.push(tr);
      if (r.next() < P.twin && S.troops.length < st.troopCap) S.troops.push({ ...tr, x: Math.min(LANE.W - 2, tr.x + 1.5) });
      ev('spawn', { x: tr.x, kind: tr.kind });
    }
    function spawnEnemy(kind) {
      if (S.enemies.length >= 140) return;
      const K = ENEMY_KINDS[kind], m = kind === 'boss' ? es * 1.0 : es;
      S.enemies.push({ side: -1, kind, x: kind === 'boss' ? LANE.W / 2 : 2 + r.next() * (LANE.W - 4), y: LANE.L - 1, hp: K.hp * m, max: K.hp * m, dmg: K.dmg * Math.pow(TUNE.enemyDmgGrowth, depth - 1), every: K.every,
        cd: r.next() * 0.5, speed: K.speed, range: K.range, r: K.r, armor: (K.armor || 0) * Math.pow(TUNE.armorGrowth, depth - 1), ranged: K.range > 3, scrap: K.scrap, odds: K.gearOdds, hit: 0, shield: 0 });
      if (kind === 'boss') { S.bossSpawned = true; ev('boss'); }
    }
    function dropScrap(x, y, v) { if (S.drops.length < 400) S.drops.push({ kind: 'scrap', x, y, v, t: 0 }); else S.scrap += v * 0.5; }
    function kill(e) {
      e.dead = true; S.kills++; ev('kill', { x: e.x, y: e.y, kind: e.kind });
      let v = e.scrap * Math.pow(TUNE.scrapGrowth, depth - 1) * st.scrapMult * (sets.furnace >= 3 ? 1.5 : 1);
      dropScrap(e.x, e.y, v);
      const il = Math.min(MAX_DEPTH + 3, depth + st.ilvlBonus + (r.next() < 0.3 ? 1 : 0));
      if (e.kind === 'boss') {
        S.bossDead = true;
        const first = !(save.stats.bossKills > 0);
        for (let i = 0; i < 3; i++) S.drops.push({ kind: 'gear', x: e.x + (i - 1) * 3, y: e.y, il, force: i === 0 && first ? 'legendary' : i === 0 ? 'rare' : null, t: 0 });
      } else if (r.next() < 0.025 * e.odds * st.dropRate) S.drops.push({ kind: 'gear', x: e.x, y: e.y, il, t: 0 });
    }
    function hurt(u, dmg, src) {
      if (u.dead) return 0;
      if (u.side === -1 && u.armor) dmg = Math.max(dmg * 0.25, dmg - u.armor);
      if (u.shield > 0) { const a = Math.min(u.shield, dmg); u.shield -= a; dmg -= a; }
      u.hp -= dmg; u.hit = 0.12;
      if (u.hp <= 0) { if (u.side === -1) kill(u); else { u.dead = true; ev('die', { x: u.x, y: u.y }); } }
      return dmg;
    }
    function lightning(g) {
      const P = g.P; let tgt = S.enemies.filter((e) => !e.dead).sort((a, b) => a.y - b.y)[0]; if (!tgt) return;
      let dmg = 18 * P.s, hops = storm && g.item.leg === 'stormcoil' ? 12 : P.chains, last = { x: tgt.x, y: tgt.y }; const hit = new Set();
      for (let i = 0; i <= hops && tgt; i++) {
        hurt(tgt, dmg); hit.add(tgt); ev('bolt', { x1: last.x, y1: last.y, x2: tgt.x, y2: tgt.y }); last = { x: tgt.x, y: tgt.y };
        dmg *= storm ? 0.85 : 0.7;
        const near = S.enemies.filter((e) => !e.dead && !hit.has(e) && Math.hypot(e.x - last.x, e.y - last.y) < (storm ? 6 : 9)).sort((a, b) => Math.hypot(a.x - last.x, a.y - last.y) - Math.hypot(b.x - last.x, b.y - last.y));
        tgt = near[0];
      }
    }
    function onTurn(g) {
      const P = g.P, f = P.fam; g.done++; g.pulse = 0.25;
      if (f === 'unit') {
        if (esc) { g.held = (g.held || 0) + 1; if (g.done % 3 === 0) { for (let i = 0; i < g.held; i++) spawnTroop(g, 1.25); g.held = 0; } }
        else spawnTroop(g);
      } else if (f === 'spell' && g.done % P.every === 0) {
        const b = g.item.base; ev('spell', { k: g.k, base: b });
        if (b === 'haste') { S.buffs.hasteM = Math.max(S.buffs.haste > 0 ? S.buffs.hasteM : 0, 0.4 * P.p); S.buffs.haste = 3; }
        else if (b === 'overcharge') { S.buffs.overM = Math.max(S.buffs.over > 0 ? S.buffs.overM : 0, 0.5 * P.p); S.buffs.over = 3; }
        else if (b === 'lightning') lightning(g);
        else if (b === 'shield') for (const t of S.troops) t.shield = Math.min(t.max * 1.5, (t.shield || 0) + 12 * P.s);
      } else if (f === 'collector') { S.scrap += P.yield; ev('coin', { k: g.k }); }
      if (P.bolt && g.done % 8 === 0) { const e = S.enemies.filter((x) => !x.dead).sort((a, b) => a.y - b.y)[0]; if (e) { hurt(e, P.bolt); ev('bolt', { x1: e.x, y1: 0, x2: e.x, y2: e.y }); } }
      if (P.scrap) S.scrap += P.scrap;
      if (P.repairTurn) S.door.hp = Math.min(S.door.max, S.door.hp + P.repairTurn);
    }
    function collect(d) {
      if (d.kind === 'scrap') { S.scrap += d.v; ev('pick', { x: d.x, y: d.y }); }
      else {
        const it = withRng(save, (rr) => rollDrop(save, rr, d.il, st, d.force)); const res = addLoot(save, it, st);
        if (res.kept) { S.items.push(it.id); ev('loot', { x: d.x, y: d.y, rarity: it.rarity, name: it.name }); }
        else { S.brass += res.salvaged; ev('salvage', { x: d.x, y: d.y }); }
      }
      d.gone = true;
    }

    function fight(u, foes, dt, hasteM, overM) {
      if (u.dead) return;
      u.hit = Math.max(0, u.hit - dt);
      let best = null, bd = 1e9;
      for (const f of foes) { if (f.dead) continue; const d = Math.hypot(f.x - u.x, f.y - u.y) - f.r; if (d < bd) { bd = d; best = f; } }
      const spdM = u.side === 1 ? 1 + hasteM : 1;
      u.cd -= dt * spdM;
      const atGate = u.side === 1 && u.y >= LANE.L - 2, atDoor = u.side === -1 && u.y <= 1.2;
      if (best && bd <= u.range) {
        if (u.cd <= 0) {
          u.cd = u.every;
          let dmg = u.dmg * (u.side === 1 ? 1 + overM : 1);
          if (u.crit && r.next() < u.crit) dmg *= 2;
          const done = hurt(best, dmg, u);
          if (u.leech) u.hp = Math.min(u.max, u.hp + done * u.leech);
          if (!u.ranged && best.thorns) hurt(u, done * best.thorns);
          if (u.ranged) ev('shot', { x1: u.x, y1: u.y, x2: best.x, y2: best.y, side: u.side });
        }
        return; // in range: stand and fight
      }
      if (atGate) { if (u.cd <= 0) { u.cd = u.every; const g = u.dmg * st.gateDmg * (1 + overM); if (!(S.boss && !S.bossDead)) S.gate.hp -= g; else S.gate.hp = Math.max(S.gate.max * 0.02, S.gate.hp - g * 0.2); ev('gatehit'); } return; }
      if (atDoor) { if (u.cd <= 0) { u.cd = u.every; S.door.hp -= u.dmg * (1 - st.doorArmor); ev('doorhit'); } return; }
      u.y += u.side * u.speed * spdM * dt;
      // a little sideways drift toward the nearest foe keeps lines from stacking
      if (best && Math.abs(best.y - u.y) < 8) u.x += Math.sign(best.x - u.x) * Math.min(Math.abs(best.x - u.x), 1.5 * dt);
    }

    function update(dt, input = {}) {
      if (S.over) return;
      dt = Math.min(dt, 0.1);
      S.t += dt; S.events.length = 0;
      const crank = S.crankT > 0 ? 3 : 1; S.crankT = Math.max(0, S.crankT - dt);
      S.mainAngle += (st.mainRpm / 60) * crank * dt * 6.283;
      for (const g of S.train) {
        g.pulse = Math.max(0, g.pulse - dt);
        if (g.n.state !== 'spin') continue;
        g.turns += (g.n.rpm / 60) * crank * dt; g.angle = g.turns * 6.283 * g.n.dir;
        while (g.turns - g.done >= 1) onTurn(g);
      }
      S.buffs.haste = Math.max(0, S.buffs.haste - dt); S.buffs.over = Math.max(0, S.buffs.over - dt);
      const hasteM = S.buffs.haste > 0 ? S.buffs.hasteM : 0, overM = S.buffs.over > 0 ? S.buffs.overM : 0;
      // enemies
      const rate = TUNE.spawnBase + TUNE.spawnStep * ((depth - 1) % 10) + 0.12 * Math.floor((depth - 1) / 10);
      S.spawnAcc += rate * dt * (1 + S.t / 90);
      while (S.spawnAcc >= 1) { S.spawnAcc--; spawnEnemy(r.weighted(enemyMix(depth))); }
      if (S.t - S.surge >= 20) { S.surge = S.t; for (let i = 0; i < 4 + Math.floor(depth / 3); i++) spawnEnemy(r.weighted(enemyMix(depth))); ev('surge'); }
      if (boss && !S.bossSpawned && S.t >= 12) spawnEnemy('boss');
      // fighting
      for (const t of S.troops) fight(t, S.enemies, dt, hasteM, overM);
      for (const e of S.enemies) fight(e, S.troops, dt, 0, 0);
      for (const t of S.troops) if (t.heal && !t.dead) for (const o of S.troops) if (o !== t && !o.dead && Math.hypot(o.x - t.x, o.y - t.y) < 6) o.hp = Math.min(o.max, o.hp + t.heal * dt);
      // the Wrench
      S.wrench = input.wrench || null;
      const wdps = st.wrenchDmg * Math.pow(TUNE.wrenchGrowth, depth - 1);
      const zap = (x, y, rad, dps, pick, heal) => {
        for (const e of S.enemies) if (!e.dead && Math.hypot(e.x - x, e.y - y) < rad + e.r) { let d = dps * dt; if (r.next() < st.wrenchCrit) d *= 2; hurt(e, d); }
        for (const d of S.drops) if (!d.gone && Math.hypot(d.x - x, d.y - y) < pick) collect(d);
        if (heal) for (const t of S.troops) if (!t.dead && Math.hypot(t.x - x, t.y - y) < rad + t.r) t.hp = Math.min(t.max, t.hp + heal * dt);
      };
      if (S.wrench) zap(S.wrench.x, S.wrench.y, st.wrenchRad, wdps, st.pickRad, st.wrenchHeal + (heart ? 20 : 0));
      if (st.autoWrench) { const sp = S.sprite; sp.a += dt * 0.9; sp.x = LANE.W / 2 + Math.cos(sp.a) * (LANE.W * 0.36); sp.y = LANE.L * 0.45 + Math.sin(sp.a * 0.7) * LANE.L * 0.33; zap(sp.x, sp.y, st.wrenchRad * 0.7, wdps * 0.25 * st.autoWrench, st.pickRad * 0.8, 0); }
      // cleanup
      S.troops = S.troops.filter((t) => !t.dead && t.y < LANE.L + 1);
      S.enemies = S.enemies.filter((e) => !e.dead);
      for (const d of S.drops) d.t += dt;
      S.drops = S.drops.filter((d) => !d.gone);
      // ends
      if ((!boss && S.gate.hp <= 0) || (boss && S.bossDead)) finish('win');
      else if (S.door.hp <= 0) finish('door');
      else if (S.t >= S.time) finish('timeout');
    }
    function finish(outcome) {
      if (S.over) return;
      S.over = true; S.outcome = outcome; S.door.hp = Math.max(0, S.door.hp);
      if (outcome === 'win') { // the boss-kill/gate fix: everything left on the field is swept up
        for (const d of S.drops) if (!d.gone) collect(d);
        S.scrap += 25 * Math.pow(TUNE.scrapGrowth, depth - 1) * st.scrapMult; S.gate.hp = 0;
      } else for (const d of S.drops) if (!d.gone && d.kind === 'scrap') S.scrap += d.v * st.sweep;
      S.drops = [];
      ev(outcome);
    }
    function crankBurst() { if (S.over || S.cranks <= 0 || S.crankT > 0) return false; S.cranks--; S.crankT = st.crankTime; ev('crank'); return true; }
    function quit() { finish('timeout'); }
    function result() { // bank it into the save; call once after over
      const scrap = Math.round(S.scrap);
      save.scrap += scrap; save.brass += S.brass; save.stats.shifts++; save.stats.kills += S.kills; save.stats.scrapTotal += scrap; save.stats.playSecs += S.t;
      if (save.stats.legendaries && !save.stats.firstLegendaryAt) save.stats.firstLegendaryAt = save.stats.playSecs;
      let opened = false;
      if (S.outcome === 'win') {
        if (S.boss) save.stats.bossKills = (save.stats.bossKills || 0) + 1;
        save.best = Math.max(save.best, depth);
        if (depth === save.unlocked && save.unlocked < MAX_DEPTH) { save.unlocked++; opened = true; }
      }
      const a = save.avg, w = a.n < 5 ? 1 / (a.n + 1) : 0.2; // recent average, for Night Shift
      a.scrap += (scrap - a.scrap) * w; a.drops += (S.items.length + (S.brass > 0 ? 1 : 0) - a.drops) * w; a.secs += (S.t - a.secs) * w; a.n++;
      return { outcome: S.outcome, depth, scrap, brass: S.brass, items: S.items.slice(), kills: S.kills, opened, secs: S.t, door: S.door.hp / S.door.max, gate: Math.max(0, S.gate.hp / S.gate.max) };
    }
    return { S, update, crank: crankBurst, quit, result, LANE };
  }

  // ------------------------------------------------------------------ while you were away
  function idleRates(save, st = stats(save)) {
    const b = solve(save, st);
    const perp = b.spinning.some((n) => n.item.leg === 'perpetual') ? 2 : 1;
    let coll = 0;
    for (const n of b.spinning) {
      const P = gearPower(n.item, n, st, b.sets);
      const perTurn = (P.fam === 'collector' ? P.yield * (1 + affix(n.item, 'idle') / 100) : 0) + P.scrap;
      coll += (perTurn * n.rpm) / 60;
    }
    coll *= st.idleEff * st.idleMult * perp;
    const a = save.avg, cycle = a.secs + 20; // a Shift plus time at the bench
    const active = a.n ? a.scrap / cycle : 0;
    const night = st.nightEff && a.n ? (a.scrap / cycle) * st.nightEff * st.idleMult : 0;
    let total = coll + night;
    const cap = active ? active * 0.9 : Infinity; // idle never beats playing
    total = Math.min(total, cap);
    return { collectors: coll, night, total, active, capped: total >= cap - 1e-9 && cap !== Infinity };
  }
  function applyOffline(save, now) {
    const st = stats(save);
    let secs = (now - (save.lastSeen == null ? now : save.lastSeen)) / 1000;
    save.lastSeen = now;
    if (!(secs > 60)) return null; // clock went backwards, or barely away
    const capped = secs > st.offlineCap; secs = Math.min(secs, st.offlineCap);
    const R = idleRates(save, st);
    const scrap = Math.floor(R.total * secs);
    save.scrap += scrap; save.stats.scrapTotal += scrap;
    let items = [], brass = 0;
    if (R.night > 0 && save.avg.n) {
      const n = Math.min(15, Math.floor((secs / (save.avg.secs + 20)) * save.avg.drops * st.nightEff));
      withRng(save, (r) => { for (let i = 0; i < n; i++) { const it = rollDrop(save, r, Math.min(MAX_DEPTH, save.depth + st.ilvlBonus), st); const res = addLoot(save, it, st); if (res.kept) items.push(it.id); else brass += res.salvaged; } });
    }
    return { secs, capped, scrap, items, brass, rates: R };
  }

  // ------------------------------------------------------------------ Overhaul (prestige)
  const overhaulGain = (save) => (save.best < 10 ? 0 : 3 + (save.best - 10) + 4 * (Math.floor(save.best / 10) - 1));
  function overhaul(save) {
    const gain = overhaulGain(save); if (!gain) return 'clear Depth 10 first';
    const keep = Object.values(save.items).filter((it) => it.vault);
    save.blueprints += gain; save.overhauls++;
    save.scrap = 0; save.brass = 0; save.tree = { root: 1 }; save.board = {}; save.items = {}; save.pity = 0;
    for (const it of keep) { it.loc = 'inv'; save.items[it.id] = it; }
    starterKit(save);
    const st = stats(save);
    save.unlocked = Math.min(MAX_DEPTH, 1 + st.headStart); save.depth = save.unlocked; save.best = Math.max(0, save.unlocked - 1);
    save.avg = { scrap: 0, drops: 0, secs: 0, n: 0 };
    return '';
  }

  const api = { TUNE, SAVE_V, LANE, rngFrom, key, unkey, cells, neighbours, hexDist, NEI, stats, baseStats, nodeCost, nodeOpen, canBuyNode, buyNode, buyBlueprint,
    makeItem, rollDrop, dropOdds, describe, gearPower, solve, affix, place, unplace, canMerge, merge, salvage, salvageValue, reroll, rerollCost, temper, temperCost,
    maxIlvl, toggleVault, invItems, vaultCount, newSave, load, zoneOf, isBossDepth, enemyScale, gateHp, createShift, idleRates, applyOffline, overhaulGain, overhaul, withRng, addLoot };
  if (typeof module !== 'undefined') module.exports = api; else root.CogModel = api;
})(typeof window !== 'undefined' ? window : globalThis);
