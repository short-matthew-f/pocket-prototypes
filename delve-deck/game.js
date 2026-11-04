// Delve Deck: descend a mine-dungeon room by room. Each room deals cards (fight, mine, rest, treasure, shop, event,
// shrine, reliquary); retreat to camp any time to bank everything, die and keep only a fraction. Skipping fights raises
// Threat, and a full Threat meter means the next room is an Ambush. Depth 20 of a throne run is the Mountain King.
// Plugs into ../kit (see ../README.md). sim.js drives this same model headlessly.
(function () {
  'use strict';
  const BOSS_DEPTH = 20;
  const rnd = Math.random, R2 = (a, b) => a + rnd() * (b - a);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const pick = (a) => a[Math.floor(rnd() * a.length)];
  const shuffle = (a) => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const r1 = (v) => Math.round(v * 10) / 10, pct = (v) => Math.round(v * 100) + '%';

  // the tree's descriptions show the current value: the kit calls desc(level, levels, stats)
  let KIT = null, CUR = null;
  const cur = () => CUR;
  const now = (f) => { const c = cur(); return c ? ` (now ${f(c.s, c.lv)})` : ''; };

  // ------------------------------------------------------------------ camp (the kit's upgrade tree)
  // Left: tavern + chapel (survival) and the Relic branch below it. Right: smithy + mine office (ore) and the
  // Surveyors' Guild deck-shaping branch below it. Up: maps, bounties, steel and the throne. Down the middle: class skills.
  const NODES = [
    { id: 'blade', name: 'Sharpen Blade', icon: '⚔️', cost: 12, grow: 1.4, max: 10, req: [], x: 0, y: 0, fx: (s, l) => { s.atk += 1.5 * l; }, dx: () => '+1.5 attack' + now((s) => r1(s.atk)) },
    { id: 'stew', name: 'Hearty Stew', icon: '🍲', cost: 16, grow: 1.4, max: 10, req: ['blade'], x: -1, y: 0, fx: (s, l) => { s.hp += 8 * l; }, dx: () => '+8 max HP' + now((s) => s.hp) },
    { id: 'plate', name: 'Plate Armor', icon: '🛡️', cost: 14, grow: 1.5, max: 8, cur: 'ore', req: ['blade'], x: 1, y: 0, fx: (s, l) => { s.armor += l; }, dx: () => 'Every hit you take is 1 weaker' + now((s) => 'armor ' + s.armor) },
    { id: 'flask', name: 'Hip Flask', icon: '🧪', cost: 40, grow: 2.1, max: 3, req: ['stew'], x: -2, y: 0, fx: (s, l) => { s.potions += l; }, dx: () => 'Start every run with +1 potion' + now((s) => s.potions) },
    { id: 'brew', name: 'Strong Brew', icon: '⚗️', cost: 28, grow: 1.8, max: 3, cur: 'ore', req: ['flask'], x: -3, y: 0, fx: (s, l) => { s.potionHeal += 0.15 * l; }, dx: () => 'Potions heal +15% of max HP' + now((s) => pct(s.potionHeal)) },
    { id: 'tales', name: 'Tall Tales', icon: '📜', cost: 36, max: 1, req: ['stew'], x: -1, y: -1, fx: (s) => { s.event = true; }, dx: () => 'Event rooms appear: risky choices, big payoffs' },
    { id: 'chapel', name: 'Chapel', icon: '⛪', cost: 120, grow: 3, max: 2, req: ['tales', 'flask'], x: -2, y: -1, fx: (s, l) => { s.revive += l; }, dx: () => '+1 revive per run at half HP' + now((s) => s.revive) },
    { id: 'lucky', name: 'Lucky Charm', icon: '🍀', cost: 60, grow: 1.6, max: 5, req: ['chapel'], x: -2, y: -2, fx: (s, l) => { s.crit += 0.04 * l; }, dx: () => '+4% critical hit chance' + now((s) => pct(s.crit)) },
    { id: 'map', name: 'Map Room', icon: '🗺️', cost: 80, max: 1, req: ['blade'], x: 0, y: -1, fx: (s) => { s.extraCards += 1; }, dx: () => 'Every room deals a 4th card' },
    { id: 'carto', name: 'Cartographer', icon: '🧭', cost: 60, grow: 1.9, max: 3, req: ['map'], x: 0, y: -2, fx: (s, l) => { s.rerolls += l; }, dx: () => '+1 room reroll per run' + now((s) => s.rerolls) },
    { id: 'office', name: 'Mine Office', icon: '⚖️', cost: 17, grow: 1.6, max: 6, cur: 'ore', req: ['plate'], x: 2, y: 0, fx: (s, l) => { s.mine += 0.15 * l; }, dx: () => '+15% ore from veins' + now((s) => '×' + r1(s.mine)) },
    { id: 'timber', name: 'Shoring Timbers', icon: '🪵', cost: 22, grow: 1.7, max: 4, cur: 'ore', req: ['office'], x: 2, y: -1, fx: (s, l) => { s.cave *= 0.9 ** l; s.caveDmg *= 0.9 ** l; }, dx: () => 'Cave-ins 10% rarer and 10% softer' },
    { id: 'survey', name: 'Deep Survey', icon: '💎', cost: 70, max: 1, cur: 'ore', req: ['office'], x: 3, y: 0, fx: (s) => { s.gem = true; }, dx: () => 'Gem Vein rooms appear: lots of ore, shaky rock' },
    { id: 'trader', name: "Trader's Pass", icon: '🪙', cost: 60, max: 1, req: ['map', 'plate'], x: 1, y: -1, fx: (s) => { s.shop = true; }, dx: () => 'Trader rooms appear: spend run gold on gear' },
    { id: 'bounty', name: 'Bounty Board', icon: '📌', cost: 110, max: 1, req: ['trader'], x: 1, y: -2, fx: (s) => { s.elite = true; }, dx: () => 'Elite fights appear: tough foes, rich loot' },
    { id: 'purse', name: 'Deep Pockets', icon: '👝', cost: 50, grow: 1.7, max: 4, req: ['trader'], x: 2, y: -2, fx: (s, l) => { s.keep += 0.1 * l; }, dx: () => 'Death keeps +10% of your loot' + now((s) => pct(s.keep)) },
    // class skills (same slots, one per character)
    { id: 'cleave', who: 'fighter', name: 'Cleave', icon: '🪓', cost: 36, grow: 1.7, max: 5, req: ['blade'], x: 0, y: 1, fx: (s, l) => { s.crit += 0.06 * l; s.critMult += 0.15 * l; }, dx: () => '+6% crit chance; crits hit 15% harder' + now((s) => pct(s.crit)) },
    { id: 'nose', who: 'miner', name: 'Gold Nose', icon: '👃', cost: 36, grow: 1.7, max: 5, req: ['blade'], x: 0, y: 1, fx: (s, l) => { s.veinGold += 0.15 * l; }, dx: () => 'Streak veins also pay gold: +15% of their ore' + now((s) => pct(s.veinGold)) },
    { id: 'smite', who: 'cleric', name: 'Smite', icon: '✨', cost: 36, grow: 1.7, max: 5, req: ['blade'], x: 0, y: 1, fx: (s, l) => { s.holy += 0.3 * l; s.killHeal += 2 * l; }, dx: () => '+30% damage vs undead, heal +2 per kill' + now((s) => '×' + r1(s.holy)) },
    { id: 'pickpocket', who: 'rogue', name: 'Light Fingers', icon: '🧤', cost: 36, grow: 1.7, max: 5, req: ['blade'], x: 0, y: 1, fx: (s, l) => { s.sneak += 0.05 * l; s.steal += 0.12 * l; }, dx: () => '+5% sneak chance, steal 12% more' + now((s) => pct(s.sneak)) },
    { id: 'rhythm', who: 'fighter', name: 'Battle Rhythm', icon: '🥁', cost: 70, grow: 1.8, max: 3, req: ['cleave'], x: 0, y: 2, fx: (s, l) => { s.rhythm += 1.5 * l; }, dx: () => 'Each fight in a row: +1.5 attack (max 3 stacks)' + now((s) => '+' + s.rhythm) },
    { id: 'dynamite', who: 'miner', name: 'Dynamite', icon: '🧨', cost: 70, grow: 1.8, max: 3, req: ['nose'], x: 0, y: 2, fx: (s, l) => { s.blasts += l; }, dx: () => '+1 Blast per run: opens a fight for 40% of its HP' + now((s) => s.blasts) },
    { id: 'sanctum', who: 'cleric', name: 'Sanctuary', icon: '🕯️', cost: 70, grow: 1.8, max: 3, req: ['smite'], x: 0, y: 2, fx: (s, l) => { s.restCalm = true; s.rest += 0.08 * l; }, dx: () => "Campfires heal +8% and don't raise Threat" + now((s) => pct(s.rest)) },
    { id: 'shadow', who: 'rogue', name: 'Shadowstep', icon: '🌒', cost: 70, grow: 1.8, max: 3, req: ['pickpocket'], x: 0, y: 2, fx: (s, l) => { s.shadow = true; s.sneak += 0.04 * l; }, dx: () => 'A clean sneak lowers Threat; +4% sneak' + now((s) => pct(s.sneak)) },
    // the Relic branch (carry items for the run)
    { id: 'relics', name: 'Relic Hunter', icon: '🏺', cost: 70, max: 1, req: ['stew'], x: -1, y: 1, fx: (s) => { s.relics = true; }, dx: () => 'Reliquary rooms appear; elites drop relics' },
    { id: 'satchel', name: 'Relic Satchel', icon: '🎒', cost: 140, max: 1, req: ['relics'], x: -2, y: 1, fx: (s) => { s.satchel = true; }, dx: () => 'Start every run by picking a relic' },
    { id: 'curator', name: 'Curator', icon: '🔍', cost: 84, max: 1, cur: 'ore', req: ['satchel'], x: -3, y: 1, fx: (s) => { s.relicChoices = 4; }, dx: () => 'Relic picks offer 4 choices instead of 3' },
    { id: 'cursed', name: 'Cursed Relics', icon: '🩸', cost: 63, max: 1, cur: 'ore', req: ['satchel'], x: -2, y: 2, fx: (s) => { s.cursed = true; }, dx: () => 'Strong relics with a catch join the pool' },
    // the Surveyors' Guild branch: shape which rooms the deck deals
    { id: 'guild', name: "Surveyors' Guild", icon: '🏛️', cost: 42, max: 1, cur: 'ore', req: ['plate'], x: 1, y: 1, fx: (s) => { s.guild = true; }, dx: () => 'Shrines appear from depth 3, twice as often' },
    { id: 'deepseam', name: 'Deep Seams', icon: '🪨', cost: 63, max: 1, cur: 'ore', req: ['guild'], x: 2, y: 1, fx: (s) => { s.noCopper = true; }, dx: () => 'Removes copper: every vein is silver or better' },
    { id: 'nocamp', name: 'Cold Camp', icon: '🧊', cost: 98, max: 1, cur: 'ore', req: ['deepseam'], x: 3, y: 1, fx: (s) => { s.noRest = true; s.killHealPct += 0.06; }, dx: () => 'Removes Campfires; every kill heals 6% max HP' },
    { id: 'quiet', name: 'Soft Boots', icon: '🥾', cost: 84, grow: 2.2, max: 2, cur: 'ore', req: ['guild'], x: 1, y: 2, fx: (s, l) => { s.threatMax += l; }, dx: () => 'Ambush comes one room later' + now((s) => 'after ' + s.threatMax) },
    { id: 'lure', name: 'Blood Bait', icon: '🥩', cost: 112, max: 1, cur: 'ore', req: ['quiet'], x: 2, y: 2, fx: (s) => { s.ambushLoot += 0.6; }, dx: () => 'Ambush fights pay +60% loot' },
    // more survival, more steel
    { id: 'vigor', name: 'Second Wind', icon: '🌬️', cost: 90, grow: 1.8, max: 3, req: ['brew'], x: -3, y: -1, fx: (s, l) => { s.vigor += 0.1 * l; }, dx: () => 'Heal 10% max HP every 5 depths' + now((s) => pct(s.vigor)) },
    { id: 'story', name: 'Storyteller', icon: '🎭', cost: 70, grow: 1.7, max: 3, req: ['tales'], x: -1, y: -2, fx: (s, l) => { s.evMult += 0.25 * l; }, dx: () => 'Event payoffs +25%' + now((s) => '×' + r1(s.evMult)) },
    { id: 'veteran', name: 'Veteran', icon: '🎖️', cost: 90, grow: 2, max: 2, req: ['chapel'], x: -3, y: -2, fx: (s, l) => { s.reviveHp += 0.15 * l; }, dx: () => 'Revives come back with +15% HP' + now((s) => pct(s.reviveHp)) },
    { id: 'bane', name: 'Kingsbane', icon: '🔱', cost: 84, grow: 1.8, max: 3, cur: 'ore', req: ['lucky'], x: -2, y: -3, fx: (s, l) => { s.kingDmg += 0.2 * l; }, dx: () => '+20% damage vs the Mountain King' + now((s) => '×' + r1(s.kingDmg)) },
    { id: 'lantern', name: 'Safety Lamp', icon: '🏮', cost: 56, grow: 1.8, max: 3, cur: 'ore', req: ['timber'], x: 3, y: -1, fx: (s, l) => { s.trap *= 0.75 ** l; }, dx: () => 'Chest traps 25% rarer' },
    { id: 'cart', name: 'Supply Cart', icon: '🛒', cost: 100, grow: 1.8, max: 3, req: ['purse'], x: 3, y: -2, fx: (s, l) => { s.retreatBonus += 0.1 * l; }, dx: () => 'Retreating banks +10% bonus loot' + now((s) => '+' + pct(s.retreatBonus)) },
    { id: 'steel', name: 'Dwarven Steel', icon: '⚒️', cost: 126, grow: 1.9, max: 3, cur: 'ore', req: ['bounty', 'purse'], x: 2, y: -3, fx: (s, l) => { s.atk += 3 * l; s.armor += l; }, dx: () => '+3 attack and +1 armor' },
    { id: 'throne', name: 'Deep Throne', icon: '👑', cost: 1000, grow: 1, max: 1, req: ['carto', 'bounty', 'bane', 'steel', 'purse'], reqAll: 2, extra: { ore: 450 }, x: 0, y: -3, win: true, dx: () => `Next run's depth ${BOSS_DEPTH} is the Mountain King. Beat him!` },
  ];
  for (const n of NODES) { const dx = n.dx; delete n.dx; n.desc = (lv, levels, stats) => { CUR = stats ? { s: stats, lv: levels || {} } : null; try { return dx(); } catch { return ''; } finally { CUR = null; } }; }

  const CHARS = [
    { id: 'fighter', name: 'Fighter', blurb: 'Balanced: good sword, sturdy, a little armor.', unlock: 0 },
    { id: 'miner', name: 'Miner', blurb: 'Vein streaks: each mine in a row pays more, and shakes more.', unlock: 1 },
    { id: 'cleric', name: 'Cleric', blurb: 'Big heals at campfires, holy damage vs undead.', unlock: 2 },
    { id: 'rogue', name: 'Rogue', blurb: 'Sneaks past fights to pick pockets. No chest traps.', unlock: 3 },
  ];
  function baseStats(who) {
    const s = { hp: 32, atk: 6, armor: 1, crit: 0.05, critMult: 2, potions: 0, potionHeal: 0.45, revive: 0, reviveHp: 0.5, mine: 1, cave: 1, caveDmg: 1, rest: 0.25,
      gold: 1, keep: 0.3, extraCards: 0, rerolls: 0, shop: false, event: false, elite: false, gem: false, holy: 1, killHeal: 0, killHealPct: 0, veinGold: 0,
      streakOre: 0, rhythm: 0, blasts: 0, restCalm: false, sneak: 0, steal: 0, shadow: false, relics: false, satchel: false, relicChoices: 3, cursed: false,
      guild: false, noCopper: false, noRest: false, threatMax: 3, ambushLoot: 0, vigor: 0, evMult: 1, kingDmg: 1, trap: 1, retreatBonus: 0 };
    if (who === 'miner') { s.hp = 30; s.armor = 0; s.atk = 4.5; s.cave = 0.85; s.caveDmg = 0.9; s.streakOre = 0.3; }
    if (who === 'cleric') { s.hp = 28; s.atk = 5; s.armor = 0; s.holy = 1.6; s.rest = 0.45; s.killHeal = 1; }
    if (who === 'rogue') { s.hp = 26; s.atk = 5; s.armor = 0; s.crit = 0.15; s.critMult = 2.2; s.sneak = 0.62; s.steal = 0.6; s.trap = 0; }
    return s;
  }

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
  const KING = { id: 'king', name: 'Mountain King', icon: '👑', hp: 320, atk: 15, gold: 250, ore: 80, king: true };
  const AFFIX = { armored: ['Armored', '🔩'], brutal: ['Brutal', '💢'], swift: ['Swift', '💨'], frenzied: ['Frenzied', '🔥'] };
  const COL = { fight: '#e76f51', elite: '#ff4d6d', mine: '#e9a23b', rest: '#2a9d8f', treasure: '#ffd166', shop: '#5fa8d3', event: '#b388eb', shrine: '#4cc9f0', relic: '#f4845f', king: '#ff4d6d', none: '#4a4458' };

  // ------------------------------------------------------------------ relics (carried for the run) and shrines (trade-offs)
  const RELICS = [
    { id: 'fang', icon: '🦷', name: 'Vampire Fang', desc: 'Heal 3 HP after every kill', go: (R) => { R.killHeal += 3; } },
    { id: 'coin', icon: '🪙', name: 'Lucky Coin', desc: '+30% gold from everything', go: (R) => { R.goldMult *= 1.3; } },
    { id: 'epick', icon: '⛏️', name: 'Ember Pick', desc: '+40% ore from veins', go: (R) => { R.oreMult *= 1.4; } },
    { id: 'skin', icon: '🧱', name: 'Iron Skin', desc: '+2 armor', go: (R) => { R.armor += 2; } },
    { id: 'ring', icon: '💍', name: 'Whetstone Ring', desc: '+3 attack', go: (R) => { R.atk += 3; } },
    { id: 'lamp', icon: '🏮', name: 'Warding Lamp', desc: 'Ambush comes one room later', go: (R) => { R.threatMax += 1; } },
    { id: 'feather', icon: '🪶', name: 'Phoenix Feather', desc: 'Revive once at 40% HP', go: (R) => { R.revive += 1; } },
    { id: 'die', icon: '🎲', name: 'Loaded Die', desc: '+12% critical hit chance', go: (R) => { R.crit += 0.12; } },
    { id: 'water', icon: '💧', name: 'Holy Water', desc: '+50% damage vs undead', go: (R) => { R.holy *= 1.5; } },
    { id: 'shard', icon: '🔱', name: 'Kingsbane Shard', desc: '+40% damage vs the Mountain King', go: (R) => { R.kingDmg *= 1.4; } },
    { id: 'mule', icon: '🐴', name: 'Pack Mule', desc: 'Death keeps +20% of your loot', go: (R) => { R.keep += 0.2; } },
    { id: 'kit', icon: '🩹', name: 'Field Kit', desc: '+1 potion; potions heal +15%', go: (R) => { R.potions += 1; R.potionHeal += 0.15; } },
    { id: 'glass', cursed: true, icon: '🗡️', name: 'Glass Blade', desc: '+6 attack · −25% max HP', go: (R) => { R.atk += 6; R.max = Math.round(R.max * 0.75); R.hp = Math.min(R.hp, R.max); } },
    { id: 'idol', cursed: true, icon: '🗿', name: 'Greed Idol', desc: '+60% gold and ore · Ambush a room sooner', go: (R) => { R.goldMult *= 1.6; R.oreMult *= 1.6; R.threatMax = Math.max(2, R.threatMax - 1); } },
    { id: 'crown', cursed: true, icon: '🫅', name: 'Heavy Crown', desc: '+3 armor · Campfires heal half', go: (R) => { R.armor += 3; R.restMult *= 0.5; } },
  ];
  const SHRINES = [
    { id: 'greed', icon: '💰', name: 'Shrine of Greed', desc: '+40% gold · foes hit 15% harder', go: (R) => { R.goldMult *= 1.4; R.foeAtk *= 1.15; } },
    { id: 'iron', icon: '⚙️', name: 'Shrine of Iron', desc: '+2 armor · −15% max HP', go: (R) => { R.armor += 2; R.max = Math.round(R.max * 0.85); R.hp = Math.min(R.hp, R.max); } },
    { id: 'blood', icon: '🩸', name: 'Shrine of Blood', desc: '+3 attack · lose 25% of your HP', go: (R, f) => { R.atk += 3; f.hurt(Math.max(1, Math.round(R.hp * 0.25)), 'the Shrine of Blood'); } },
    { id: 'stone', icon: '🪨', name: 'Shrine of Stone', desc: '+50% ore · cave-ins 30% likelier', go: (R) => { R.oreMult *= 1.5; R.caveMult *= 1.3; } },
    { id: 'stars', icon: '✨', name: 'Shrine of Stars', desc: '+2 rerolls · Threat +2', go: (R) => { R.rerolls += 2; R.threat = Math.min(R.threatMax, R.threat + 2); } },
    { id: 'dusk', icon: '🌙', name: 'Shrine of Dusk', desc: 'Heal to full · the next room is an Ambush', go: (R, f) => { f.heal(R.max); R.threat = R.threatMax; } },
  ];

  // ------------------------------------------------------------------ styles for the in-run card UI (fixed slots: nothing reflows)
  if (typeof document !== 'undefined' && document.head && !document.getElementById('dd-style')) {
    const st = document.createElement('style'); st.id = 'dd-style';
    st.textContent = `
.dd{display:grid;gap:7px;max-width:520px;margin:0 auto;padding-bottom:12px;transition:opacity .12s}
.dd.busy{opacity:.45;pointer-events:none}
.dd-hd{height:22px;display:flex;align-items:center;justify-content:space-between;gap:8px;font-weight:800;font-size:13px;color:#d9d2ea;white-space:nowrap;overflow:hidden;padding:0 4px}
.dd-hd b{font:400 15px var(--display);color:#ffd166;letter-spacing:.02em;overflow:hidden;text-overflow:ellipsis}
.dd-hd.amb b{color:#ff6b6b}.dd-hd.tip b{color:#8be29a}.dd-hd.boss b{color:#ff8fa3}
.dd-hd span{color:var(--muted);font-size:12.5px;flex:none}
.dd-card{display:flex;gap:6px;height:62px}
.dd-main{flex:1;min-width:0;display:grid;grid-template-columns:32px 1fr auto;align-items:center;gap:8px;text-align:left;background:var(--card);border:2px solid color-mix(in srgb,var(--c) 45%,transparent);border-left:7px solid var(--c);border-radius:14px;padding:5px 10px;height:62px;box-sizing:border-box;color:var(--ink)}
.dd-main:disabled{opacity:.42;filter:grayscale(.6)}
.dd-main.ph{border-style:dashed;border-left-width:2px;background:transparent}
.dd-main:active,.dd-side:active,.dd-row button:active{transform:translateY(2px)}
.dd .ic{font-size:25px;line-height:1;text-align:center}
.dd .tx{display:grid;min-width:0}
.dd .tx b{font:400 17px/1.15 var(--display);letter-spacing:.01em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.dd .tx small{font-size:12.5px;color:var(--muted);font-weight:800;line-height:1.3;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.dd .tx small.rw{color:#ffd166}
.dd .chip{font-weight:800;font-size:13.5px;border-radius:999px;padding:4px 8px;background:#ffffff12;white-space:nowrap}
.dd .chip.bad{background:#c1121f;color:#fff}.dd .chip.hurt{color:#ff9a8d}.dd .chip.good{color:#8be29a}.dd .chip.gold{color:#ffd166}.dd .chip.cy{color:#8ecae6}
.dd-side{width:74px;flex:none;display:grid;place-content:center;gap:0;background:var(--card);border:2px solid var(--line);border-radius:14px;padding:2px;color:var(--ink);text-align:center;font-weight:800;font-size:13px;height:62px;box-sizing:border-box}
.dd-side small{font-size:12px;color:var(--muted);font-weight:800;line-height:1.25}
.dd-side.info{background:transparent;border-style:dashed;color:var(--muted)}
.dd-side:disabled{opacity:.42}
.dd-row{display:grid;grid-template-columns:1fr 1fr 1.35fr;gap:8px;margin-top:3px}
.dd-row button{height:52px;border-radius:12px;border:2px solid var(--line);background:#ffffff0c;color:var(--ink);font-weight:800;font-size:14px;padding:2px 6px;line-height:1.15;white-space:nowrap;overflow:hidden}
.dd-row button:disabled{opacity:.38}
.dd-row .ret{border-color:#7bd389;background:#7bd3891a;color:#c4f2cb;font:400 17px/1.1 var(--display);letter-spacing:.02em}
.dd-row small{display:block;font:800 12px/1.2 var(--body);color:var(--muted);overflow:hidden;text-overflow:ellipsis}
.dd-row .ret small{color:#a9dcb1}`;
    document.head.appendChild(st);
  }

  // ------------------------------------------------------------------ a run
  function createRun(env) {
    const s = env.stats, W = env.W, H = env.H, fx = env.fx, sfx = env.sfx, ui = env.ui && env.ui.ownerDocument ? env.ui : null, fmt = env.fmt;
    const slots = 3 + s.extraCards;
    const R = { t: 0, over: false, phase: 'intro', depth: 1, hp: s.hp, max: s.hp, gold: 0, ore: 0, kills: 0, ended: null, killer: '', cards: [], obj: null,
      atk: s.atk, armor: s.armor, crit: s.crit, critMult: s.critMult, holy: s.holy, kingDmg: s.kingDmg, potions: s.potions, potionHeal: s.potionHeal,
      revive: s.revive, reviveHp: s.reviveHp, rerolls: s.rerolls, keep: s.keep, killHeal: s.killHeal, goldMult: s.gold, oreMult: 1, foeAtk: 1, caveMult: 1, restMult: 1,
      threat: 0, threatMax: s.threatMax, ambush: false, fstreak: 0, mstreak: 0, bestStreak: 0, blasts: s.blasts, relics: [], elites: 0, sneaks: 0, K: null,
      banner: { s: 'Depth 1', sub: env.boss ? `The Throne waits at depth ${BOSS_DEPTH}` : zoneOf(1).name, t: 0 }, uh: 0, stop: 0, slow: 0,
      hero: { atkT: -9, hurtT: -9, healT: -9, walkT: 0, guard: false, out: -1, dead: 0 }, wait: 0, rocksT: -9, quakeT: -9, hint: null, tapped: 0, endT: 0 };
    const Q = []; let qThen = null;
    function play(steps, then) { Q.push(...steps); qThen = then || null; R.phase = 'anim'; R.wait = 0; render(); }
    const HX = () => W * 0.27, OX = () => W * 0.7, FY = () => Math.max(250, H - (R.uh || 330) - 6) - 30;

    // ---- cards
    const mhp = (d) => 6 + 2.2 * d + 0.1 * d * d + 0.003 * d * d * d, matk = (d) => 4 + 0.8 * d + 0.012 * d * d;
    function monsterFor(d, elite) {
      const b = pick(MONS.filter((m) => d >= m.min && d <= m.max)), m = { ...b, elite, armor: 0, first: false, affix: null };
      m.hp = Math.round(mhp(d) * b.hp * (elite ? 1.7 : 1)); m.atk = Math.round(matk(d) * b.atk * (elite ? 1.2 : 1));
      m.gold = (3 + d * 1.6) * R2(0.85, 1.15) * (elite ? 2.5 : 1); m.ore = elite ? Math.round(3 + d * 0.8) : b.ore ? Math.round(2 + d * 0.4) : 0;
      // deeper foes come with a twist: elites from depth 10, any foe can be frenzied from depth 12
      const af = elite && d >= 10 ? pick(['armored', 'brutal', 'swift']) : d >= 12 && rnd() < 0.18 ? 'frenzied' : null;
      if (af === 'armored') m.armor = Math.round(2 + d * 0.15);
      if (af === 'brutal') { m.atk = Math.round(m.atk * 1.3); m.gold *= 1.2; }
      if (af === 'swift') m.first = true;
      if (af === 'frenzied') { m.atk = Math.round(m.atk * 1.2); m.gold *= 1.4; }
      m.affix = af; m.name = (af ? AFFIX[af][0] + ' ' : elite ? 'Elite ' : '') + b.name;
      if (R.ambush) { m.gold *= 1 + 0.25 + s.ambushLoot; m.ore = Math.round(m.ore * (1 + s.ambushLoot)); }
      m.gold = Math.round(m.gold * R.goldMult); m.relic = elite && s.relics;
      return m;
    }
    function makeCard(type) {
      const d = R.depth;
      if (type === 'fight' || type === 'elite') {
        const c = { type: 'fight', m: monsterFor(d, type === 'elite') };
        if (env.who === 'rogue') c.sneak = clamp(s.sneak - 0.012 * d - (c.m.elite ? 0.15 : 0), 0.15, 0.92);
        return c;
      }
      if (type === 'mine') {
        let kind = s.gem && rnd() < 0.3 ? 'gem' : d >= 7 && rnd() < 0.45 ? 'silver' : 'copper';
        if (kind === 'copper' && s.noCopper) kind = 'silver';
        if (d >= 8 && rnd() < 0.05) kind = 'lode';
        else if (d >= 12 && kind !== 'gem' && rnd() < 0.22) kind = 'gas';
        const K = { copper: [1, 1, 'Copper Vein'], silver: [1.6, 1.25, 'Silver Vein'], gem: [2.2, 1.6, 'Gem Vein'], gas: [2.1, 1.7, 'Gassy Seam'], lode: [5, 1.3, 'Mother Lode!'] }[kind];
        const st = 1 + s.streakOre * R.mstreak;
        const ore = Math.max(1, Math.round((3 + d * 0.9) * K[0] * s.mine * R.oreMult * st * R2(0.85, 1.15)));
        return { type, kind, name: K[2], ore, st, gold: Math.round(ore * ((R.mstreak ? s.veinGold : 0) + (kind === 'lode' ? 1 : 0))),
          cave: clamp(((0.22 + 0.028 * d) * K[1] * s.cave + 0.07 * R.mstreak * (s.streakOre ? 1 : 0)) * R.caveMult, 0.1, 0.9),
          dmg: Math.max(1, Math.round((3 + d * 1.1 + 0.015 * d * d) * s.caveDmg * (kind === 'gas' ? 1.5 : 1))) };
      }
      if (type === 'rest') return { type };
      if (type === 'treasure') return { type, gold: Math.round((4 + d * 1.6) * R2(0.8, 1.2) * R.goldMult), potion: rnd() < 0.2, trap: d >= 3 ? clamp((0.03 + 0.022 * d) * s.trap, 0, 0.7) : 0, dmg: Math.round(3 + d * 1.1 + 0.015 * d * d) };
      if (type === 'shop') return { type };
      if (type === 'event') return { type, ev: pick(EVENTS)() };
      if (type === 'shrine') return { type, opts: shuffle(SHRINES).slice(0, 2) };
      if (type === 'relic') return { type };
    }
    function deal() {
      const out = [];
      if (R.threat >= R.threatMax) { // Ambush: every path is guarded
        R.ambush = true;
        for (let i = 0; i < slots; i++) out.push(makeCard(i === 0 && s.elite && R.depth >= 3 ? 'elite' : 'fight'));
        return out;
      }
      R.ambush = false;
      const d = R.depth, w = [['fight', 4], ['mine', 2.5], ['rest', s.noRest ? 0 : d < 3 ? 0.3 : 0.7], ['treasure', s.noRest ? 1.3 : 0.8]];
      if (s.shop && d >= 3) w.push(['shop', 0.9]);
      if (s.event) w.push(['event', 1.2]);
      if (s.elite && d >= 3) w.push(['elite', 1]);
      if (d >= (s.guild ? 3 : 6)) w.push(['shrine', s.guild ? 1.2 : 0.55]);
      if (s.relics && d >= 4) w.push(['relic', 0.55]);
      const tot = w.reduce((a, x) => a + x[1], 0);
      for (let g = 0; out.length < slots && g < 120; g++) {
        let r = rnd() * tot, type = w[0][0]; for (const x of w) { r -= x[1]; if (r <= 0) { type = x[0]; break; } }
        const fights = out.filter((c) => c.type === 'fight').length;
        if (type === 'fight' ? fights >= 2 : type === 'elite' ? out.some((c) => c.m && c.m.elite) : out.some((c) => c.type === type)) continue;
        out.push(makeCard(type));
      }
      while (out.length < slots) out.push(makeCard(out.some((c) => c.type === 'mine') ? 'fight' : 'mine'));
      if (!out.some((c) => c.type === 'fight')) out[out.length - 1] = makeCard('fight');
      if (out.every((c) => c.type === 'fight')) out[out.length - 1] = makeCard('mine');
      return out.sort((a, b) => order(a) - order(b));
    }
    const order = (c) => ['fight', 'mine', 'treasure', 'relic', 'shrine', 'event', 'shop', 'rest'].indexOf(c.type) + (c.m && c.m.elite ? 0.5 : 0);
    const threatOf = (c) => (c.type === 'fight' ? -1 : c.type === 'rest' && s.restCalm ? 0 : 1);

    // ---- events: each returns {name, icon, text, choices:[{k, l, sub, fn, dis?}]} for the current depth
    const ev = (v) => Math.round(v * s.evMult);
    const EVENTS = [
      () => { const hp = Math.max(1, Math.round(R.max * 0.2)), g = ev((8 + R.depth * 2.5) * R.goldMult);
        return { name: 'Blood Altar', icon: '🩸', text: 'A stone bowl full of coins. It wants blood.', choices: [{ k: 'altar', icon: '🩸', l: `Bleed ${hp} HP`, sub: `+${g} gold`, fn: () => { hurtNow(hp, 'the Blood Altar'); addGold(g); } }] }; },
      () => { const h = ev(R.max * 0.4), p = Math.round(4 + R.depth * 0.7);
        return { name: 'Glowing Mushrooms', icon: '🍄', text: 'They smell sweet. Some of them.', choices: [{ k: 'mush', icon: '🍄', l: 'Eat a handful', sub: `60%: +${h} HP · 40%: −${p} HP`, fn: () => { if (rnd() < 0.6) heal(h); else hurtNow(p, 'bad mushrooms'); } }] }; },
      () => { const b = Math.max(2, Math.floor(R.gold / 2));
        return { name: 'Dwarf Gambler', icon: '🎲', text: 'Double or nothing, friend. One roll.', choices: [{ k: 'bet', icon: '🎲', l: `Bet ${b} gold`, sub: `50%: +${b} · 50%: −${b} gold`, dis: R.gold < 2, fn: () => { if (rnd() < 0.5) { addGold(b); sfx.ding(); } else { R.gold -= b; say(`−${b} gold`, '#ff9a8d'); sfx.nope(); } } }] }; },
      () => { const p = Math.round(3 + R.depth * 0.6), o = ev((6 + R.depth * 1.8) * s.mine * R.oreMult);
        return { name: 'Collapsed Tunnel', icon: '🪨', text: 'Ore glitters behind the rubble.', choices: [{ k: 'dig', icon: '⛏️', l: 'Dig through', sub: `−${p} HP · +${o} ore`, fn: () => { hurtNow(p, 'falling rubble'); addOre(o); } }] }; },
      () => { const p = Math.round(R.max * 0.15);
        return { name: 'Old Statue', icon: '🗿', text: 'A forgotten dwarf god. Pray?', choices: [{ k: 'pray', icon: '🙏', l: 'Pray', sub: `50%: +2 attack · 50%: −${p} max HP`, fn: () => { if (rnd() < 0.5) { R.atk += 2; say('+2 attack', '#ffd166'); sfx.ding(); } else { R.max = Math.max(5, R.max - p); R.hp = Math.min(R.hp, R.max); say(`−${p} max HP`, '#ff9a8d'); sfx.nope(); } } }] }; },
      () => { const o = ev((5 + R.depth * 1.5) * s.mine * R.oreMult), g = ev((4 + R.depth * 1.5) * R.goldMult), st = Math.round(R.max * 0.25);
        return { name: 'Lost Miner', icon: '🧔', text: 'Hurt and lost. He has a sack of ore.', choices: [
          { k: 'give', icon: '🧪', l: 'Give him a potion', sub: `+${o} ore +${g} gold`, dis: R.potions < 1, fn: () => { R.potions--; addOre(o); addGold(g); } },
          { k: 'rob', icon: '🗡️', l: 'Rob him', sub: `+${o} ore · 50%: −${st} HP`, fn: () => { addOre(o); if (rnd() < 0.5) hurtNow(st, 'a desperate miner'); } }] }; },
      () => { const c = Math.max(5, Math.round(6 + R.depth));
        return { name: 'Wishing Well', icon: '⛲', text: 'Coins glint far below. Make a wish?', choices: [{ k: 'well', icon: '🪙', l: `Toss ${c} gold`, sub: '60%: a potion · 40%: +1 reroll', dis: R.gold < c, fn: () => { R.gold -= c; if (rnd() < 0.6) { R.potions++; say('+1 potion', '#ff8fa3'); } else { R.rerolls++; say('+1 reroll', '#8ecae6'); } sfx.ding(); } }] }; },
      () => { const p = Math.round(4 + R.depth * 0.9), o = ev((4 + R.depth) * R.oreMult);
        return { name: 'Runaway Cart', icon: '🛤️', text: 'An ore cart on the rails, pointing down.', choices: [{ k: 'ride', icon: '🛒', l: 'Ride it down', sub: `Skip a depth +${o} ore · 35%: crash −${p}`, fn: () => { R.depth++; addOre(o); say('Wheee!', '#ffd166'); if (rnd() < 0.35) hurtNow(p, 'a cart crash'); } }] }; },
    ];
    const SHOP = [
      { k: 'potion', l: 'Healing Potion', icon: '🧪', sub: () => `Heal ${pct(R.potionHeal)} any time`, price: () => 6 + Math.round(R.depth * 0.7), go: () => { R.potions++; } },
      { k: 'whet', l: 'Whetstone', icon: '🗡️', sub: () => '+2 attack this run', price: () => 10 + R.depth, go: () => { R.atk += 2; } },
      { k: 'patch', l: 'Iron Patch', icon: '🔩', sub: () => '+1 armor this run', price: () => 12 + R.depth, go: () => { R.armor += 1; } },
      { k: 'bandage', l: 'Bandages', icon: '🩹', sub: () => 'Heal 35% now', price: () => 5 + Math.round(R.depth * 0.5), go: () => { heal(Math.round(R.max * 0.35)); } },
      { k: 'scrap', l: 'Map Scrap', icon: '📜', sub: () => '+1 reroll', price: () => 6, go: () => { R.rerolls++; } },
    ];

    // ---- effects
    function say(t, c = '#fff', at = 'hero', size = 18) { fx.text(at === 'hero' ? HX() : OX(), FY() - 110, t, c, size); }
    function addGold(g) { g = Math.round(g); if (g <= 0) return; R.gold += g; say(`+${g} gold`, '#ffd166', 'obj', 19); sfx.coin(); }
    function addOre(o) { o = Math.round(o); if (o <= 0) return; R.ore += o; fx.text(OX() + 24, FY() - 88, `+${o} ore`, '#f4a261', 18); }
    function heal(h) { h = Math.min(Math.round(h), R.max - R.hp); if (h <= 0) return; R.hp += h; R.hero.healT = R.t; say(`+${h} HP`, '#8be29a'); fx.burst(HX(), FY() - 50, 8, ['#8be29a', '#d8f3dc'], 90, 3); }
    function hurtNow(d, by) {
      R.hp -= d; R.hero.hurtT = R.t; fx.shake = Math.max(fx.shake, 5); sfx.hit(); say(`−${d} HP`, '#ff6b6b', 'hero', 21);
      if (R.hp <= 0) { R.killer = by; if (R.revive > 0) revive(); }
    }
    const F = { hurt: hurtNow, heal };
    function revive() { R.revive--; R.hp = Math.round(R.max * R.reviveHp); sfx.ding(); fx.ring(HX(), FY() - 40, 70, '#ffe066'); fx.text(HX(), FY() - 140, 'Revived!', '#ffe066', 24); R.stop = 0.25; }
    function drink() { R.potions--; heal(Math.round(R.max * R.potionHeal)); sfx.ding(); render(); }
    const effAtk = (m) => (R.atk + Math.min(R.fstreak, 3) * s.rhythm) * (m.undead ? R.holy : 1) * (m.king ? R.kingDmg : 1);
    const blowOf = (m, a) => Math.max(1, a - (m.armor || 0));
    /** HP a fight will cost (the card chip; the bot reads the same number). o: {guard, free (enemy hits first), pre (opening damage)} */
    function estimate(m, guard, o = {}) {
      const pd = blowOf(m, effAtk(m)) * (1 + R.crit * (R.critMult - 1));
      const hits = Math.max(0, Math.ceil((m.hp - (o.pre || 0)) / pd) - 1) + (m.first ? 1 : 0) + (o.free || 0);
      let md = Math.max(1, m.atk * R.foeAtk - R.armor); if (guard) md = Math.max(1, md * 0.5);
      return Math.round(hits * md);
    }
    const foeHit = (m, guard) => { let md = Math.max(1, Math.round(m.atk * R.foeAtk * R2(0.8, 1.2)) - R.armor); if (guard) md = Math.max(1, Math.round(md * 0.5)); return md; };
    const myHit = (m, mult = 1) => { let d = effAtk(m) * R2(0.85, 1.15) * mult; const crit = rnd() < R.crit; if (crit) d *= R.critMult; return { d: blowOf(m, Math.round(d)), crit }; };

    // ---- room flow
    function next() {
      if (R.hp <= 0) return die();
      R.depth++; R.obj = null;
      const z = zoneOf(R.depth), zPrev = zoneOf(R.depth - 1);
      if (s.vigor && R.depth % 5 === 0) heal(R.max * s.vigor);
      if (env.boss && R.depth >= BOSS_DEPTH) return throne();
      if (R.depth >= BOSS_DEPTH) { R.sealed = true; R.banner = { s: 'The Sealed Gate', sub: 'Only the throne key opens the way', t: R.t, big: true }; sfx.tone(196, 0.5, 'triangle', 0.07, 0.8); return retreat(); }
      R.cards = deal();
      R.banner = R.ambush ? { s: 'Ambush!', sub: 'The deep has your scent', t: R.t, red: true } : { s: `Depth ${R.depth}`, sub: z.id !== zPrev.id ? z.name : '', t: R.t };
      if (R.ambush) { sfx.tone(196, 0.35, 'sawtooth', 0.06, 0.7); sfx.tone(147, 0.45, 'sawtooth', 0.05, 0.7, 0.15); fx.shake = 6; }
      R.hero.walkT = R.t; R.phase = 'pick'; render();
    }
    function afterRoom(c) {
      const t = threatOf(c);
      if (t < 0) R.threat = 0; else R.threat = Math.min(R.threatMax, R.threat + t);
      if (c.type !== 'fight') R.fstreak = 0;
      if (c.type !== 'mine') R.mstreak = 0;
    }
    function enter(c, side) {
      R.tapped++; sfx.pop(0.8);
      if (c.type !== 'fight' && c.type !== 'mine') afterRoom(c);
      if (c.type === 'fight') {
        if (side === 'k') return sneak(c);
        if (side === 'b') { R.blasts--; return fight(c.m, false, { pre: Math.round(c.m.hp * 0.4) }, c); }
        return fight(c.m, side === 'g', {}, c);
      }
      if (c.type === 'mine') return mine(c);
      if (c.type === 'rest') {
        R.obj = { kind: 'rest', inT: R.t };
        return play([[0.35, () => sfx.pop(0.5)], [0.55, () => heal(Math.round(R.max * s.rest * R.restMult))]], next);
      }
      if (c.type === 'treasure') {
        R.obj = { kind: 'chest', inT: R.t, open: false };
        const trap = rnd() < c.trap;
        return play([[0.35, null], [0.6, () => { R.obj.open = true; sfx.ding(); fx.burst(OX(), FY() - 30, 14, ['#ffd166', '#fff3b0'], 170); addGold(c.gold); if (c.potion) { R.potions++; fx.text(OX(), FY() - 140, '+1 potion', '#ff8fa3', 18); } }],
          ...(trap ? [[0.5, () => { fx.text(OX(), FY() - 160, 'Dart trap!', '#ff6b6b', 21); hurtNow(c.dmg, 'a dart trap'); }]] : [])], next);
      }
      if (c.type === 'shop') { R.obj = { kind: 'shop', inT: R.t }; return shop([SHOP[0], ...shuffle(SHOP.slice(1)).slice(0, 2)].map((it) => ({ ...it, p: it.price() }))); }
      if (c.type === 'event') { R.obj = { kind: 'event', inT: R.t }; sfx.zap(); return event(c.ev); }
      if (c.type === 'shrine') { R.obj = { kind: 'shrine', inT: R.t }; sfx.zap(); return shrine(c); }
      if (c.type === 'relic') { R.obj = { kind: 'relic', inT: R.t }; return relicPick('Ancient Reliquary: take one relic', next); }
    }
    // mid-run choices use the kit's pick cards (stable layout); 'k' keys let the sim read them
    function choose(head, opts, done) {
      R.phase = 'modal'; render();
      const go = (i) => { R.phase = 'anim'; done(i); };
      if (env.pick) env.pick(head, opts, go); else go(opts.length - 1);
    }
    function shop(items) {
      const opts = items.map((it) => ({ k: it.k, icon: it.icon, name: it.l, desc: it.sub(), tag: R.gold >= it.p ? `Buy · ${it.p} gold` : `${it.p} gold · need ${it.p - R.gold} more`, price: it.p, disabled: R.gold < it.p }));
      opts.push({ k: 'leave', icon: '🚶', name: 'Move on', desc: 'Keep your gold', tag: '' });
      choose(`🛒 Wandering Trader · you have ${R.gold} gold`, opts, (i) => {
        const it = items[i];
        if (!it) return play([[0.3, null]], next);
        if (R.gold < it.p) { sfx.nope(); return play([[0.3, null]], next); }
        R.gold -= it.p; it.go(); sfx.buy(); say(it.l, '#8ecae6', 'obj', 17); play([[0.6, null]], next);
      });
    }
    function event(e) {
      const opts = e.choices.map((c) => ({ k: c.dis ? 'no' : c.k, icon: c.icon, name: c.l, desc: c.sub, tag: c.dis ? "Can't right now" : 'Risky', disabled: !!c.dis }));
      opts.push({ k: 'leave', icon: '🚶', name: 'Walk away', desc: 'Nothing happens', tag: '' });
      choose(`${e.icon} ${e.name}: ${e.text}`, opts, (i) => {
        const c = e.choices[i];
        if (!c || c.dis) { if (c) sfx.nope(); return play([[0.3, null]], next); }
        c.fn(); play([[0.8, null]], next);
      });
    }
    function shrine(c) {
      const opts = c.opts.map((x) => ({ k: x.id, icon: x.icon, name: x.name, desc: x.desc, tag: 'Blessing · with a cost' }));
      opts.push({ k: 'leave', icon: '🚶', name: 'Leave it be', desc: 'No blessing, no cost', tag: '' });
      choose('⛩️ An old shrine hums in the dark', opts, (i) => {
        const x = c.opts[i]; if (!x) return play([[0.3, null]], next);
        x.go(R, F); sfx.ding(); fx.ring(OX(), FY() - 50, 70, COL.shrine); say(x.name, COL.shrine, 'obj', 17); R.stop = 0.12; play([[0.8, null]], next);
      });
    }
    function relicPick(head, then) {
      const pool = shuffle(RELICS.filter((r) => (!r.cursed || s.cursed) && !R.relics.includes(r.id))).slice(0, s.relicChoices);
      if (!pool.length) return then();
      choose(head, pool.map((r) => ({ k: r.id, icon: r.icon, name: r.name, desc: r.desc, tag: r.cursed ? 'Cursed' : 'Relic' })), (i) => {
        const r = pool[i] || pool[0]; R.relics.push(r.id); r.go(R, F);
        sfx.ding(); sfx.tone(660, 0.2, 'triangle', 0.08, 1.5, 0.1); fx.ring(HX(), FY() - 50, 60, '#f4845f'); say(r.icon + ' ' + r.name, '#f4845f', 'hero', 17);
        play([[0.6, null]], then);
      });
    }
    function resolve(m, guard, o) {
      const ev = []; let ph = R.hp, mh = m.hp, rev = R.revive;
      const foe = () => { const md = foeHit(m, guard); ph -= md; ev.push({ p: 0, d: md, ph: Math.max(0, ph) }); if (ph <= 0) { if (rev > 0) { rev--; ph = Math.round(R.max * R.reviveHp); ev.push({ rev: 1 }); } else return true; } return false; };
      if (o.pre) { mh -= o.pre; ev.push({ blast: 1, d: o.pre, mh: Math.max(0, mh) }); }
      for (let i = 0; i < (o.free || 0) + (m.first ? 1 : 0); i++) if (foe()) return ev;
      for (let r = 0; r < 160 && mh > 0; r++) {
        const h = myHit(m); mh -= h.d; ev.push({ p: 1, d: h.d, crit: h.crit, mh: Math.max(0, mh) });
        if (mh <= 0) break;
        if (foe()) break;
      }
      return ev;
    }
    function fight(m, guard, o, c) {
      const ev = resolve(m, guard, o);
      R.obj = { kind: 'mon', m, hp: m.hp, max: m.hp, inT: R.t, hitT: -9, atkT: -9, dead: -1 };
      R.hero.guard = guard;
      const step = clamp(1.6 / ev.length, 0.1, 0.26);
      const steps = [[0.28, () => { if (guard) say('Guard!', '#8ecae6'); if (o.free) say('Caught!', '#ff6b6b', 'obj', 22); }]];
      for (const e of ev) steps.push([e.rev ? 0.5 : e.blast ? 0.45 : step, () => {
        if (e.rev) return revive();
        if (e.blast) { R.obj.hp = e.mh; R.obj.hitT = R.t; sfx.boom(); fx.shake = 9; fx.burst(OX(), FY() - 40, 18, ['#ffb703', '#e85d04', '#6b5e55'], 220); fx.text(OX(), FY() - 120, 'BLAST ' + e.d, '#ffb703', 24); R.stop = 0.1; return; }
        if (e.p) { R.obj.hp = e.mh; R.hero.atkT = R.t; R.obj.hitT = R.t; sfx.hit(); fx.text(OX() + R2(-14, 14), FY() - 100, (e.crit ? 'CRIT ' : '') + e.d, e.crit ? '#ffd166' : '#fff', e.crit ? 25 : 19); if (e.crit) { fx.shake = 5; R.stop = 0.07; sfx.tone(1200, 0.06, 'square', 0.04); } fx.burst(OX() - 10, FY() - 45, e.crit ? 8 : 4, ['#fff', '#ffd6a5'], 110, 2.5); }
        else { R.hp = e.ph; R.obj.atkT = R.t; R.hero.hurtT = R.t; sfx.crack(); fx.text(HX() + R2(-10, 10), FY() - 100, '−' + e.d, '#ff6b6b', 20); fx.shake = Math.max(fx.shake, 3); }
      }]);
      play(steps, () => {
        R.hero.guard = false;
        if (R.hp <= 0) { R.killer = m.name; return die(); }
        R.kills++; if (m.elite) R.elites++; R.obj.dead = R.t; R.stop = 0.09; sfx.crack(); fx.burst(OX(), FY() - 40, 14, ['#e76f51', '#ffd6a5', '#6d597a'], 190);
        afterRoom(c); R.fstreak++; R.bestStreak = Math.max(R.bestStreak, R.fstreak);
        if (R.fstreak >= 2) { fx.text(W / 2, FY() - 160, `Bloodlust ×${R.fstreak}`, '#ff8fa3', 20 + Math.min(8, R.fstreak * 2)); sfx.tone(440 * 1.12 ** R.fstreak, 0.12, 'triangle', 0.06); }
        addGold(guard ? m.gold / 2 : m.gold); if (m.ore) Q.unshift([0.15, () => addOre(guard ? m.ore / 2 : m.ore)]);
        if (R.killHeal) heal(R.killHeal); if (s.killHealPct) heal(R.max * s.killHealPct);
        play([[0.5, null]], m.relic ? () => relicPick(`${m.name} dropped a relic!`, next) : next);
      });
    }
    function sneak(c) {
      const m = c.m; R.obj = { kind: 'mon', m, hp: m.hp, max: m.hp, inT: R.t, hitT: -9, atkT: -9, dead: -1, sneak: true };
      if (rnd() < c.sneak) {
        R.sneaks++;
        return play([[0.3, () => { R.hero.out = -1; say('Shh…', '#c9c2dc'); }], [0.45, () => { addGold(m.gold * s.steal); sfx.tone(880, 0.08, 'sine', 0.06); sfx.tone(1320, 0.1, 'sine', 0.05, 1, 0.06); fx.text(W / 2, FY() - 150, 'Pickpocketed!', '#b8f2e6', 21); }]], () => {
          R.fstreak = 0; R.mstreak = 0; R.threat = s.shadow ? Math.max(0, R.threat - 1) : Math.min(R.threatMax, R.threat + 1); play([[0.35, null]], next);
        });
      }
      return fight(m, false, { free: 2 }, c);
    }
    function mine(c) {
      R.obj = { kind: 'vein', c, inT: R.t, hitT: -9, broke: -1 };
      const cave = rnd() < c.cave, swing = () => { R.hero.atkT = R.t; R.obj.hitT = R.t; sfx.crack(); fx.burst(OX() - 20, FY() - 30, 4, ['#9c6644', '#b08968'], 120, 2.5); };
      play([[0.22, swing], [0.22, swing], [0.22, swing]], () => {
        R.obj.broke = R.t; sfx.ding(); fx.burst(OX(), FY() - 30, c.kind === 'lode' ? 34 : 12, c.kind === 'gem' ? ['#c77dff', '#e0aaff'] : c.kind === 'silver' ? ['#dee2e6', '#adb5bd'] : c.kind === 'gas' ? ['#b5e48c', '#e9a23b'] : ['#e09f3e', '#f4a261', '#ffd166'], c.kind === 'lode' ? 260 : 160);
        if (c.kind === 'lode') { fx.shake = 8; R.stop = 0.15; fx.text(W / 2, FY() - 170, 'MOTHER LODE!', '#ffd166', 28); [523, 659, 784, 1046].forEach((f, i) => sfx.tone(f, 0.14, 'triangle', 0.07, 1, i * 0.06)); }
        addOre(c.ore); if (c.gold) addGold(c.gold);
        afterRoom(c);
        if (cave) {
          R.mstreak = 0;
          play([[0.25, () => { sfx.boom(); fx.shake = 10; R.rocksT = R.t; if (c.st > 1) fx.text(W / 2, FY() - 150, 'Streak broken', '#ff9a8d', 18); }], [0.6, () => hurtNow(c.dmg, c.kind === 'gas' ? 'a gas blast' : 'a cave-in')]], next);
        } else {
          R.mstreak++; R.bestStreak = Math.max(R.bestStreak, R.mstreak);
          if (s.streakOre && R.mstreak >= 2) { fx.text(W / 2, FY() - 150, `Vein streak ×${r1(1 + s.streakOre * R.mstreak)}`, '#ffd166', 19 + R.mstreak * 2); sfx.tone(520 * 1.15 ** R.mstreak, 0.12, 'triangle', 0.06); }
          play([[0.45, null]], next);
        }
      });
    }

    // ---- the Mountain King: a fight in rounds. Phase 1 telegraphs a Hammer Slam every third round; at half HP he
    // wakes the mountain: Quakes every other round and grows ore crystals that heal him until you shatter them.
    function throne() {
      const k = KING;
      R.K = { ...k, hp: k.hp, max: k.hp, phase: 1, round: 0, crystals: 0, intent: 'swing', armor: 0, hitT: -9, atkT: -9 };
      R.obj = { kind: 'king', inT: R.t };
      R.banner = { s: 'The Deep Throne', sub: 'The Mountain King rises', t: R.t, red: true, big: true };
      sfx.tone(82, 1.2, 'sawtooth', 0.07, 0.8); sfx.tone(123, 1.0, 'triangle', 0.06, 1, 0.35); sfx.tone(98, 1.1, 'triangle', 0.06, 1, 0.8); sfx.noise(0.6, 0.06, 200);
      fx.shake = 8; R.cards = []; R.phase = 'boss'; if (ui) draw(true);
      play([[1.8, () => { fx.shake = 6; sfx.boom(); }], [0.4, null]], () => { R.phase = 'boss'; render(); });
    }
    const kingIntent = (K) => K.phase === 1 ? (K.round % 3 === 2 ? 'slam' : 'swing') : (K.round % 2 === 0 ? 'quake' : 'swing');
    const INTENT = { swing: ['2 swings · Strike!', '⚔️'], slam: ['Hammer Slam ×3 · Brace!', '🔨'], quake: ['Quake ×2.6 · Brace!', '🌋'] };
    function kingBlow(K, kind, mult) { // one round of the King's attack; returns damage
      const base = K.atk * R.foeAtk * R2(0.85, 1.15);
      if (kind === 'swing') return [0, 1].map(() => Math.max(1, Math.round(base * mult) - R.armor));
      if (kind === 'slam') return [Math.max(1, Math.round(base * 3 * mult) - R.armor)];
      return [Math.max(1, Math.round(base * 2.6 * mult) - Math.floor(R.armor / 2))];
    }
    function kingEstimate(a) { // HP this choice costs this round (shown on the card)
      const K = R.K, i = K.intent, avg = K.atk * R.foeAtk, mult = a === 'brace' ? 0.3 : a === 'shatter' ? 0.6 : 1;
      if (i === 'swing') return 2 * Math.max(1, Math.round(avg * mult) - R.armor);
      if (i === 'slam') return Math.max(1, Math.round(avg * 3 * mult) - R.armor);
      return Math.max(1, Math.round(avg * 2.6 * mult) - Math.floor(R.armor / 2));
    }
    const kingDeal = (a) => Math.round(blowOf(R.K, effAtk(R.K)) * (a === 'strike' ? 3 : a === 'brace' ? 1 : 0) * (1 + R.crit * (R.critMult - 1)));
    function bossAct(a) {
      const K = R.K, steps = [];
      if (a === 'shatter' && !K.crystals) return sfx.nope();
      R.tapped++; R.hero.guard = a === 'brace';
      const hits = a === 'strike' ? 3 : a === 'brace' ? 1 : 0;
      for (let i = 0; i < hits; i++) steps.push([0.22, () => {
        if (K.hp <= 0) return;
        const h = myHit(K); K.hp = Math.max(0, K.hp - h.d); K.hitT = R.t; R.hero.atkT = R.t; sfx.hit();
        fx.text(OX() + R2(-16, 16), FY() - 150, (h.crit ? 'CRIT ' : '') + h.d, h.crit ? '#ffd166' : '#fff', h.crit ? 26 : 20); fx.burst(OX() - 10, FY() - 70, 5, ['#fff', '#ffd6a5'], 120, 2.5);
        if (h.crit) { fx.shake = 6; R.stop = 0.08; }
      }]);
      if (a === 'shatter') steps.push([0.35, () => { K.crystals--; sfx.crack(); sfx.tone(1500, 0.15, 'triangle', 0.06, 0.5); fx.burst(OX() + 50, FY() - 60, 18, ['#7df9ff', '#e0aaff', '#fff'], 200); fx.text(OX() + 40, FY() - 130, 'Shattered!', '#7df9ff', 21); addOre(10); R.stop = 0.1; }]);
      steps.push([0.3, () => {
        if (K.hp <= 0) return;
        if (K.phase === 1 && K.hp <= K.max / 2) return wake();
        const blows = kingBlow(K, K.intent, a === 'brace' ? 0.3 : a === 'shatter' ? 0.6 : 1);
        K.atkT = R.t; if (K.intent === 'quake') { R.quakeT = R.t; R.rocksT = R.t; sfx.boom(); fx.shake = 14; } else if (K.intent === 'slam') { sfx.boom(); fx.shake = 12; } else sfx.crack();
        blows.forEach((d, i) => Q.unshift([0.2 * i, () => { if (R.hp > 0) { hurtNow(d, 'the Mountain King'); if (a === 'brace') say('Braced', '#8ecae6', 'hero', 16); } }]));
      }]);
      steps.push([0.4, () => {
        if (K.hp > 0 && K.crystals && K.phase === 2) { const h = Math.round(K.max * 0.04 * K.crystals); K.hp = Math.min(K.max, K.hp + h); fx.text(OX(), FY() - 175, `+${h} (crystals)`, '#7df9ff', 17); sfx.zap(); }
      }]);
      play(steps, () => {
        R.hero.guard = false;
        if (R.hp <= 0) { R.killer = 'the Mountain King'; return die(); }
        if (K.hp <= 0) return win();
        K.round++; if (K.phase === 2 && K.round % 3 === 0 && K.crystals < 4) { K.crystals++; fx.text(OX() + 50, FY() - 140, 'A crystal grows', '#7df9ff', 16); }
        K.intent = kingIntent(K); R.phase = 'boss'; render();
      });
    }
    function wake() {
      const K = R.K; K.phase = 2; K.round = -1; K.crystals = 2; K.intent = 'quake'; K.armor = 0;
      R.banner = { s: 'The Mountain wakes!', sub: 'Crystals heal him · Quakes shake the hall', t: R.t, red: true, big: true };
      fx.shake = 16; R.stop = 0.35; sfx.boom(); sfx.tone(65, 1.2, 'sawtooth', 0.08, 0.7); sfx.tone(98, 0.9, 'square', 0.04, 0.6, 0.3); sfx.tone(196, 0.5, 'triangle', 0.06, 1, 0.9);
      for (let i = 0; i < 3; i++) fx.ring(OX(), FY() - 70, 70 + i * 35, '#7df9ff');
      Q.length = 0; Q.push([1.4, null]);
    }

    function retreat() {
      R.ended = 'retreat'; R.hero.out = R.t; sfx.pop(1.2); sfx.tone(523, 0.12, 'triangle', 0.07); sfx.tone(784, 0.16, 'triangle', 0.07, 1, 0.1);
      if (s.retreatBonus) { const g = Math.round(R.gold * s.retreatBonus), o = Math.round(R.ore * s.retreatBonus); R.gold += g; R.ore += o; if (g + o) say(`Supply cart +${g}g +${o}o`, '#8be29a', 'obj', 16); }
      R.endT = R.t; play([[0.9, null]], () => { R.over = true; render(); });
    }
    function die() {
      R.ended = 'dead'; R.hp = 0; R.hero.dead = R.t; R.endT = R.t; R.slow = 1; sfx.boom(); fx.shake = 12; sfx.tone(220, 0.8, 'triangle', 0.07, 0.4, 0.15);
      play([[1.4, null]], () => { R.over = true; render(); });
    }
    function win() {
      R.ended = 'won'; R.endT = R.t; if (ui) draw(true); R.stop = 0.4; R.obj.dead = R.t; sfx.win(); fx.shake = 18;
      for (let i = 0; i < 5; i++) fx.ring(OX(), FY() - 60, 60 + i * 30, '#ffd166');
      fx.burst(OX(), FY() - 70, 50, ['#ffd166', '#fff3b0', '#7df9ff', '#e76f51'], 280, 4);
      addGold(KING.gold); addOre(KING.ore);
      play([[2.2, null]], () => { R.over = true; render(); });
    }

    // ---- input from the card UI
    function act(a) {
      if (R.over || R.ended) return;
      if (R.phase === 'anim' || R.phase === 'modal' || R.phase === 'intro') return;
      if (a === 'potion') { if (R.potions > 0 && R.hp < R.max) drink(); else sfx.nope(); return; }
      if (R.phase === 'boss') { const m = /^b(\d)$/.exec(a); if (m) bossAct(['strike', 'brace', 'shatter'][+m[1]]); return; }
      if (R.phase === 'pick') {
        if (a === 'retreat') return retreat();
        if (a === 'reroll') { if (R.rerolls > 0 && !R.ambush) { R.rerolls--; R.cards = deal(); sfx.zap(); fx.text(W / 2, FY() - 150, 'New paths', '#8ecae6', 18); render(); } else sfx.nope(); return; }
        const m = /^([cgkb])(\d)$/.exec(a), c = m && R.cards[+m[2]]; if (c) enter(c, m[1]);
      }
    }
    if (ui) ui.onclick = (e) => { const b = e.target.closest('[data-a]'); if (b && !b.disabled) act(b.dataset.a); };

    // ---- DOM card UI: a header line, `slots` card rows and a 3-button action row, all fixed height
    function render() {
      if (!ui) return;
      if (R.over) { ui.innerHTML = ''; return; }
      if (R.phase === 'anim' || R.phase === 'modal' || R.phase === 'intro') { if (ui.firstElementChild) ui.firstElementChild.classList.add('busy'); else draw(true); return; }
      draw(false);
    }
    function draw(busy) {
      const card = (col, a, ic, title, l1, l2, chip, chipCls, side, dis) => `<div class="dd-card" style="--c:${col}"><button type="button" class="dd-main${a ? '' : ' ph'}" ${a ? `data-a="${a}"` : ''}${dis || !a ? ' disabled' : ''}><span class="ic">${ic}</span><span class="tx"><b>${title}</b><small>${l1 || '&nbsp;'}</small>${l2 != null ? `<small class="rw">${l2 || '&nbsp;'}</small>` : ''}</span>${chip ? `<span class="chip ${chipCls || ''}">${chip}</span>` : ''}</button>${side}</div>`;
      const info = (t, sub) => `<div class="dd-side info">${t}<small>${sub}</small></div>`;
      const thr = (c) => { const t = threatOf(c); return t > 0 ? info('👁 +1', 'Threat') : t === 0 ? info('👁 0', 'calm') : ''; };
      const hp = (e) => (e >= R.hp ? ['☠ deadly', 'bad'] : e ? [`−${e} HP`, 'hurt'] : ['no harm', 'good']);
      let head = '', cards = '';
      if (R.K) {
        const K = R.K, [it, ii] = INTENT[K.intent];
        head = R.ended === 'won' || K.hp <= 0 ? `<div class="dd-hd tip"><b>👑 The Mountain King falls!</b><span></span></div>` : `<div class="dd-hd boss"><b>${ii} Next: ${it}</b><span>Phase ${K.phase}/2</span></div>`;
        const opt = [
          ['⚔️', 'Strike', `Hit 3× for ~${kingDeal('strike')} · take his full blow`, 'strike'],
          ['🛡️', 'Brace', `Hit once for ~${kingDeal('brace')} · take 30%`, 'brace'],
          ['💎', K.phase === 2 ? `Shatter crystal (${K.crystals} left)` : 'Shatter crystal', K.phase === 2 ? (K.crystals ? 'Stop his healing · take 60%' : 'No crystals right now') : 'Crystals grow when he wakes', 'shatter'],
        ];
        cards = opt.map(([ic, name, l1, k], i) => { const e = kingEstimate(k), [ch, cl] = hp(e), dis = k === 'shatter' && !K.crystals; return card(k === 'shatter' ? '#7df9ff' : COL.king, 'b' + i, ic, name, l1, null, dis ? '' : ch, cl, '', dis); }).join('');
        for (let i = 3; i < slots; i++) cards += card(COL.none, '', '·', '', '', null, '', '', '');
      } else {
        const tip = R.hint;
        const first = env.runNo <= 1 && !R.tapped;
        if (first) head = `<div class="dd-hd tip"><b>👆 Tap a room card to step into it</b><span>Depth ${R.depth}</span></div>`;
        else if (tip) head = `<div class="dd-hd tip"><b>${tip}</b><span>Depth ${R.depth}</span></div>`;
        else if (R.ambush) head = `<div class="dd-hd amb"><b>⚠ Ambush! Every path is guarded</b><span>+loot</span></div>`;
        else head = `<div class="dd-hd"><b>▼ Push deeper · pick a room</b><span>to depth ${R.depth + 1}</span></div>`;
        cards = R.cards.map((c, i) => {
          if (c.type === 'fight') {
            const m = c.m, e = estimate(m, false), [ch, cl] = hp(e), af = m.affix ? ` · ${AFFIX[m.affix][1]} ${AFFIX[m.affix][0].toLowerCase()}` : '';
            const loot = `+${m.gold} gold${m.ore ? ` +${m.ore} ore` : ''}${m.relic ? ' + relic' : ''}`;
            let side;
            if (env.who === 'rogue') { const ef = estimate(m, false, { free: 2 }); side = `<button type="button" class="dd-side" data-a="k${i}">🥷 Sneak<small style="color:#b8f2e6">${pct(c.sneak)} · ${Math.round(m.gold * s.steal)}g</small><small style="color:${ef >= R.hp ? '#ff6b6b' : '#ff9a8d'}">fail −${ef}</small></button>`; }
            else if (R.blasts > 0) { const eb = estimate(m, false, { pre: m.hp * 0.4 }); side = `<button type="button" class="dd-side" data-a="b${i}">🧨 Blast<small style="color:${eb >= R.hp ? '#ff6b6b' : eb ? '#ff9a8d' : '#8be29a'}">${eb >= R.hp ? '☠' : eb ? `−${eb}` : 'no harm'} · ${R.blasts}</small><small>full loot</small></button>`; }
            else { const eg = estimate(m, true); side = `<button type="button" class="dd-side" data-a="g${i}">🛡 Guard<small style="color:${eg >= R.hp ? '#ff6b6b' : eg ? '#ff9a8d' : '#8be29a'}">${eg >= R.hp ? '☠ deadly' : eg ? `−${eg} HP` : 'no harm'}</small><small>½ loot</small></button>`; }
            return card(m.elite ? COL.elite : COL.fight, 'c' + i, m.icon, m.name, `❤ ${m.hp} · hits ${Math.round(m.atk * R.foeAtk)}${m.undead ? ' · undead' : ''}${m.armor ? ` · 🔩${m.armor}` : ''}${m.first ? ' · strikes first' : ''}${af && !m.armor && !m.first ? af : ''}`, loot, ch, cl, side);
          }
          if (c.type === 'mine') return card(COL.mine, 'c' + i, c.kind === 'gem' ? '💎' : c.kind === 'lode' ? '🌟' : c.kind === 'gas' ? '☁️' : '⛏️', c.name, `${Math.round(c.cave * 100)}% cave-in: −${c.dmg} HP`, `${c.st > 1 ? `Streak ×${r1(c.st)} · ` : ''}${c.gold ? `+${c.gold} gold` : ''}`, `+${c.ore} ore`, 'gold', thr(c));
          if (c.type === 'rest') { const hh = Math.min(R.max - R.hp, Math.round(R.max * s.rest * R.restMult)); return card(COL.rest, 'c' + i, '🔥', 'Campfire', 'Rest and patch up', '', `+${hh} HP`, 'good', thr(c)); }
          if (c.type === 'treasure') return card(COL.treasure, 'c' + i, '🧰', 'Treasure Chest', c.trap ? `${Math.round(c.trap * 100)}% trap: −${c.dmg} HP` : 'No trap', c.potion ? 'A potion inside!' : '', `+${c.gold} gold`, 'gold', thr(c));
          if (c.type === 'shop') return card(COL.shop, 'c' + i, '🛒', 'Wandering Trader', 'Buy one item with run gold', `You have ${R.gold} gold`, 'shop', 'cy', thr(c));
          if (c.type === 'event') return card(COL.event, 'c' + i, c.ev.icon, c.ev.name, 'Event · a risky choice', '', '?', '', thr(c));
          if (c.type === 'shrine') return card(COL.shrine, 'c' + i, '⛩️', 'Old Shrine', 'A blessing with a cost', c.opts.map((x) => x.icon).join(' '), 'bless', 'cy', thr(c));
          if (c.type === 'relic') return card(COL.relic, 'c' + i, '🏺', 'Reliquary', `Pick 1 of ${s.relicChoices} relics for this run`, `${R.relics.length} carried`, 'relic', 'gold', thr(c));
          return '';
        }).join('');
        for (let i = R.cards.length; i < slots; i++) cards += card(COL.none, '', '·', '…', '', null, '', '', '');
      }
      const boss = !!R.K, bank = `${fmt(R.gold)}g · ${fmt(R.ore)}o`;
      const row = `<div class="dd-row">
        <button type="button" data-a="potion" ${R.potions > 0 && R.hp < R.max ? '' : 'disabled'}>🧪 Drink ×${R.potions}<small>${R.potions ? `+${pct(R.potionHeal)} HP` : 'no potions'}</small></button>
        <button type="button" data-a="reroll" ${R.rerolls > 0 && !boss && !R.ambush ? '' : 'disabled'}>🔄 Reroll ×${R.rerolls}<small>${R.ambush ? 'not in ambush' : 'new rooms'}</small></button>
        <button type="button" data-a="retreat" class="ret" ${boss ? 'disabled' : ''}>⛺ Retreat<small>${boss ? 'no way back' : `keep all ${bank}`}</small></button></div>`;
      ui.innerHTML = `<div class="dd${busy ? ' busy' : ''}">${head}${cards}${row}</div>`;
    }

    R.cards = deal(); render();
    // point-of-need hints for the first runs: shown once, in the header line (no layout change)
    function hints() {
      if (R.phase !== 'pick' || env.runNo > 4) { return; }
      const want = R.hp < R.max * 0.45 && R.gold + R.ore > 0 && env.runNo <= 3 ? '⛺ Low HP? Retreat keeps all your loot' : R.threat === R.threatMax - 1 && env.runNo <= 4 ? '👁 One more quiet room and they ambush you' : null;
      if (want !== R.hint) { R.hint = want; render(); }
    }

    // ---- canvas scene
    function drawScene(g) {
      const fy = FY(), sb = fy + 30, t = R.t, z = zoneOf(R.depth), boss = R.obj && R.obj.kind === 'king';
      const bg = g.createLinearGradient(0, 0, 0, sb);
      bg.addColorStop(0, boss ? '#2a1030' : z.top); bg.addColorStop(1, boss ? '#0c0612' : z.bot);
      g.fillStyle = bg; g.fillRect(-20, -20, W + 40, sb + 20);
      // far rock silhouettes (seeded by depth so each room looks a little different)
      const sd = R.depth * 7.13;
      g.fillStyle = 'rgba(0,0,0,.28)'; g.beginPath(); g.moveTo(-10, sb);
      for (let x = -10; x <= W + 20; x += 24) g.lineTo(x, fy - 120 - Math.abs(Math.sin(x * 0.021 + sd)) * 90 - Math.sin(x * 0.07 + sd * 2) * 14);
      g.lineTo(W + 20, sb); g.fill();
      // strata
      g.strokeStyle = 'rgba(255,220,170,.05)'; g.lineWidth = 2;
      for (let i = 0; i < 6; i++) { g.beginPath(); const y = 130 + i * ((fy - 130) / 6); g.moveTo(0, y); for (let x = 0; x <= W; x += 30) g.lineTo(x, y + Math.sin(x * 0.03 + i * 2 + R.depth) * 7); g.stroke(); }
      // crystal clusters glowing in the walls
      for (let i = 0; i < z.crystals; i++) {
        const cx = ((i * 131 + R.depth * 53) % (W - 40)) + 20, cy = 140 + ((i * 89 + R.depth * 31) % Math.max(40, fy - 200)), p = 0.55 + Math.sin(t * 2 + i * 1.7) * 0.25;
        const gl = g.createRadialGradient(cx, cy, 1, cx, cy, 26); gl.addColorStop(0, z.glow + Math.round(p * 120).toString(16).padStart(2, '0')); gl.addColorStop(1, z.glow + '00'); g.fillStyle = gl; g.fillRect(cx - 26, cy - 26, 52, 52);
        g.fillStyle = z.glow; g.globalAlpha = 0.5 + p * 0.4;
        for (const [dx, h, w2] of [[-5, 13, 4], [0, 19, 5], [6, 11, 4]]) { g.beginPath(); g.moveTo(cx + dx - w2, cy + 6); g.lineTo(cx + dx, cy + 6 - h); g.lineTo(cx + dx + w2, cy + 6); g.fill(); }
        g.globalAlpha = 1;
      }
      // timber shoring in the upper mine
      if (z.id === 'upper' && !boss) for (const bx of [W * 0.06, W * 0.94]) { g.fillStyle = '#4a3222'; g.fillRect(bx - 6, 92, 12, fy - 92); g.fillStyle = '#3a2618'; g.fillRect(bx - 6, 92, 3, fy - 92); }
      if (z.id === 'upper' && !boss) { g.fillStyle = '#4a3222'; g.fillRect(0, 92, W, 10); g.fillStyle = '#5c3d2e'; g.fillRect(0, 92, W, 3); }
      // ambush: red vignette
      if (R.ambush && R.phase !== 'boss') { const v = g.createRadialGradient(W / 2, fy - 60, 60, W / 2, fy - 60, W * 0.9); v.addColorStop(0, 'rgba(120,0,20,0)'); v.addColorStop(1, `rgba(150,10,30,${0.35 + Math.sin(t * 4) * 0.08})`); g.fillStyle = v; g.fillRect(0, 0, W, sb); }
      // dark arches (the paths) while choosing
      if (R.phase === 'pick' && !R.obj) {
        const n = R.cards.length;
        for (let i = 0; i < n; i++) {
          const ax = W * (0.66 + (i - (n - 1) / 2) * (n > 3 ? 0.14 : 0.17)), aw = 34, ah = 64, ay = fy - 6, c = R.cards[i];
          g.fillStyle = 'rgba(0,0,0,.6)'; g.beginPath(); g.moveTo(ax - aw / 2, ay); g.lineTo(ax - aw / 2, ay - ah + aw / 2); g.arc(ax, ay - ah + aw / 2, aw / 2, Math.PI, 0); g.lineTo(ax + aw / 2, ay); g.fill();
          g.strokeStyle = 'rgba(255,255,255,.08)'; g.lineWidth = 2; g.stroke();
          const col = c.type === 'fight' ? (c.m.elite ? COL.elite : COL.fight) : COL[c.type] || COL.none;
          const gl = g.createRadialGradient(ax, ay - ah * 0.5, 1, ax, ay - ah * 0.5, 14); gl.addColorStop(0, col + 'cc'); gl.addColorStop(1, col + '00');
          g.fillStyle = gl; g.beginPath(); g.arc(ax, ay - ah * 0.5, 12 + Math.sin(t * 3 + i) * 2, 0, 6.283); g.fill();
        }
      }
      // ceiling with stalactites
      g.fillStyle = boss ? '#120818' : z.ceil; g.beginPath(); g.moveTo(-10, 0); g.lineTo(-10, 92);
      for (let x = 0; x <= W + 20; x += 22) { const j = Math.sin(x * 0.37 + R.depth * 1.7), yy = 88 + j * 8; g.lineTo(x, yy); if (j > 0.3) { g.lineTo(x + 6, yy + 14 + j * 16); g.lineTo(x + 11, yy); } }
      g.lineTo(W + 20, 0); g.fill();
      // torch glow
      const tx = boss ? W * 0.1 : W * 0.5, ty = fy - 120, fl = 1 + Math.sin(t * 13) * 0.05 + Math.sin(t * 7.3) * 0.04;
      const glow = g.createRadialGradient(tx, ty, 4, tx, ty, 200 * fl); glow.addColorStop(0, boss ? 'rgba(255,80,120,.25)' : 'rgba(255,180,90,.3)'); glow.addColorStop(1, 'rgba(255,160,80,0)');
      g.fillStyle = glow; g.fillRect(0, 0, W, sb);
      g.fillStyle = '#5c3d2e'; g.fillRect(tx - 3, ty, 6, 18); g.fillStyle = '#ffb703'; g.beginPath(); g.ellipse(tx, ty - 4, 6 * fl, 10 * fl, 0, 0, 6.283); g.fill(); g.fillStyle = '#fff3b0'; g.beginPath(); g.ellipse(tx, ty - 2, 3, 5, 0, 0, 6.283); g.fill();
      // dust motes
      g.fillStyle = 'rgba(255,230,190,.35)';
      for (let i = 0; i < 16; i++) { const x = (i * 71 + t * (8 + (i % 4) * 3)) % W, y = 110 + ((i * 113 + Math.sin(t * 0.7 + i) * 20) % Math.max(60, fy - 120)); g.beginPath(); g.arc(x, y, 1 + (i % 3) * 0.6, 0, 6.283); g.fill(); }
      // floor (rails in the upper mine, lava cracks in the molten deep)
      const fl2 = g.createLinearGradient(0, fy, 0, sb); fl2.addColorStop(0, z.floor); fl2.addColorStop(1, '#0b0a12');
      g.fillStyle = fl2; g.beginPath(); g.moveTo(0, fy); for (let x = 0; x <= W; x += 26) g.lineTo(x, fy + Math.sin(x * 0.11 + R.depth) * 3); g.lineTo(W, sb); g.lineTo(0, sb); g.fill();
      if (z.id === 'upper') { g.strokeStyle = '#6c757d'; g.lineWidth = 2; for (const ry of [fy + 10, fy + 20]) { g.beginPath(); g.moveTo(0, ry); g.lineTo(W, ry); g.stroke(); } g.fillStyle = '#4a3222'; for (let x = (R.depth * 13) % 30; x < W; x += 30) g.fillRect(x, fy + 8, 6, 14); }
      if (z.id === 'molten' || boss) { g.strokeStyle = `rgba(255,${boss ? 80 : 110},40,${0.5 + Math.sin(t * 3) * 0.2})`; g.lineWidth = 2; for (let i = 0; i < 5; i++) { const x0 = (i * 89 + R.depth * 37) % W; g.beginPath(); g.moveTo(x0, fy + 6); g.lineTo(x0 + 14, fy + 14); g.lineTo(x0 + 6, fy + 24); g.stroke(); } }
      // the room's occupant
      const o = R.obj, ox = OX();
      if (o) {
        const a = clamp((t - o.inT) / 0.25, 0, 1), slide = (1 - a) * 50;
        g.save(); g.globalAlpha = a; g.translate(slide, 0);
        if (o.kind === 'mon') {
          const dz = o.dead > 0 ? clamp((t - o.dead) / 0.4, 0, 1) : 0, la = t - o.atkT;
          g.globalAlpha = a * (1 - dz);
          drawMon(g, o.m, ox, fy + dz * 10, t, { hit: t - o.hitT < 0.09, atk: la < 0.2 ? Math.sin(la / 0.2 * Math.PI) : 0 });
          if (dz < 1) { const bw = 96, by = fy - 132; g.fillStyle = 'rgba(0,0,0,.6)'; rr(g, ox - bw / 2, by, bw, 10, 5); g.fill(); g.fillStyle = '#e63946'; rr(g, ox - bw / 2, by, bw * o.hp / o.max, 10, 5); g.fill();
            g.font = '800 12px Nunito, system-ui'; g.textAlign = 'center'; g.fillStyle = '#fff'; g.fillText(`${o.hp}/${o.max}`, ox, by - 5); }
        } else if (o.kind === 'king' && R.K) {
          const K = R.K, dz = o.dead > 0 ? clamp((t - o.dead) / 1.2, 0, 1) : 0, la = t - K.atkT;
          drawThrone(g, ox + 10, fy, t, K.phase);
          g.globalAlpha = a * (1 - dz * 0.9);
          drawMon(g, { id: 'king', king: true, phase: K.phase }, ox, fy + dz * 20, t, { hit: t - K.hitT < 0.09, atk: la < 0.25 ? Math.sin(la / 0.25 * Math.PI) : 0 });
          g.globalAlpha = a;
          for (let i = 0; i < K.crystals; i++) { const ang = t * 0.8 + i * (6.283 / Math.max(1, K.crystals)), cx = ox + Math.cos(ang) * 62, cy = fy - 80 + Math.sin(ang) * 22; drawCrystal(g, cx, cy, t + i); }
          if (K.intent && R.phase === 'boss' && !R.ended) { const [, ic] = INTENT[K.intent]; const pu = 1 + Math.sin(t * 6) * 0.08; g.font = `400 ${Math.round(28 * pu)}px "Lilita One", system-ui`; g.textAlign = 'center'; g.fillText(ic, W * 0.5, fy - 195); }
        } else if (o.kind === 'vein') drawVein(g, o, ox, fy, t);
        else if (o.kind === 'rest') drawFire(g, ox, fy, t);
        else if (o.kind === 'chest') drawChest(g, ox, fy, o.open);
        else if (o.kind === 'shop') drawTrader(g, ox, fy, t);
        else if (o.kind === 'event') drawRune(g, ox, fy, t, '#b388eb');
        else if (o.kind === 'shrine') drawRune(g, ox, fy, t, '#4cc9f0');
        else if (o.kind === 'relic') drawReliquary(g, ox, fy, t);
        g.restore();
      }
      // the hero
      const h = R.hero, la = t - h.atkT, walk = clamp((t - h.walkT) / 0.35, 0, 1), out = h.out > 0 ? clamp((t - h.out) / 0.6, 0, 1) : 0;
      const sneakN = o && o.sneak && o.dead < 0 ? clamp((t - o.inT) / 0.6, 0, 1) : 0;
      const hx = HX() - (1 - walk) * 40 + (la < 0.2 ? Math.sin(la / 0.2 * Math.PI) * 26 : 0) - (t - h.hurtT < 0.15 ? 8 : 0) - out * W * 0.4 + Math.sin(sneakN * Math.PI) * 30;
      g.save();
      if (h.dead) { const d = clamp((t - h.dead) / 0.5, 0, 1); g.translate(hx, fy); g.rotate(-d * 1.4); g.translate(-hx, -fy); }
      if (sneakN > 0 && sneakN < 1) g.globalAlpha = 0.55;
      drawHero(g, env.who, hx, fy, t, { swing: la < 0.2 ? Math.sin(la / 0.2 * Math.PI) : 0, hurt: t - h.hurtT < 0.12, guard: h.guard, walk: walk < 1 || out > 0, heal: t - h.healT < 0.4, flip: out > 0 });
      g.restore();
      // cave-in / quake rocks
      const rk = t - R.rocksT;
      if (rk < 0.9) for (let i = 0; i < (t - R.quakeT < 1 ? 18 : 9); i++) { const x = (t - R.quakeT < 1 ? W * 0.1 + i * W * 0.045 : HX() - 50 + i * 13) + Math.sin(i * 5) * 8, y = 90 + Math.min(fy - 100, (rk * (1 + i % 3 * 0.3)) ** 2 * 900); g.globalAlpha = 1 - Math.max(0, rk - 0.6) / 0.3; g.fillStyle = i % 2 ? '#6b5e55' : '#8a7968'; g.beginPath(); g.arc(x, y, 5 + (i % 3) * 2.5, 0, 6.283); g.fill(); }
      g.globalAlpha = 1;
      g.fillStyle = '#0b0a12'; g.fillRect(-20, sb, W + 40, H - sb + 20);
      g.fillStyle = '#ffffff10'; g.fillRect(0, sb, W, 2);
    }
    // HUD: fixed slots. Top-right 60x56 stays clear for the kit's pause button.
    function drawHud(g) {
      const w = W - 32 - 56;
      g.fillStyle = 'rgba(0,0,0,.55)'; rr(g, 16, 14, w, 24, 12); g.fill();
      const hpk = Math.max(0, R.hp / R.max), hg = g.createLinearGradient(0, 14, 0, 38); hg.addColorStop(0, hpk < 0.3 ? '#ff6b81' : '#ef476f'); hg.addColorStop(1, hpk < 0.3 ? '#c9184a' : '#b5179e');
      g.fillStyle = hg; rr(g, 16, 14, Math.max(0, w * hpk), 24, 12); g.fill();
      if (hpk < 0.3 && !R.ended) { g.strokeStyle = `rgba(255,107,129,${0.4 + Math.sin(R.t * 8) * 0.3})`; g.lineWidth = 2; rr(g, 16, 14, w, 24, 12); g.stroke(); }
      g.font = '800 14px Nunito, system-ui'; g.textAlign = 'center'; g.fillStyle = '#fff'; g.fillText(`❤ ${Math.max(0, Math.ceil(R.hp))} / ${R.max}`, 16 + w / 2, 31);
      // row 2: depth left; loot in two right-aligned fixed slots
      g.textAlign = 'left'; g.font = '400 22px "Lilita One", system-ui'; g.fillStyle = '#ffd166'; g.fillText(`Depth ${R.depth}`, 16, 72);
      const slot = (rx, txt, col, icon) => { g.textAlign = 'right'; g.font = '800 17px Nunito, system-ui'; g.fillStyle = col; g.fillText(txt, rx, 72); icon(rx - 54, 66); };
      slot(W - 16, fmt(R.ore), '#f4a261', (cx, cy) => { g.fillStyle = '#e09f3e'; g.beginPath(); g.moveTo(cx, cy - 7); g.lineTo(cx + 6, cy); g.lineTo(cx, cy + 7); g.lineTo(cx - 6, cy); g.fill(); g.fillStyle = '#ffd6a5'; g.fillRect(cx - 1, cy - 4, 2, 3); });
      slot(W - 96, fmt(R.gold), '#ffd166', (cx, cy) => { g.fillStyle = '#ffb703'; g.beginPath(); g.arc(cx, cy, 7, 0, 6.283); g.fill(); g.fillStyle = '#fff3b0'; g.beginPath(); g.arc(cx - 2, cy - 2, 2.5, 0, 6.283); g.fill(); });
      // row 3: stats in fixed columns; death keeps on the right
      g.font = '800 13px Nunito, system-ui'; g.fillStyle = '#c9c2dc'; g.textAlign = 'left';
      const cols = [`⚔ ${r1(R.atk + Math.min(R.fstreak, 3) * s.rhythm)}`, `🛡 ${R.armor}`, `🧪 ${R.potions}`, R.revive ? `✝ ${R.revive}` : ''];
      cols.forEach((c, i) => g.fillText(c, 16 + i * 52, 93));
      g.textAlign = 'right'; g.fillStyle = '#a49eb8'; g.font = '800 12px Nunito, system-ui';
      g.fillText(R.K ? `keeps ${pct(Math.min(1, R.keep))}` : env.boss ? `👑 at ${BOSS_DEPTH} · keeps ${pct(Math.min(1, R.keep))}` : `death keeps ${pct(Math.min(1, R.keep))}`, W - 16, 93);
      // row 4: threat pips left, relics right
      if (R.phase !== 'boss' && !(R.obj && R.obj.kind === 'king')) {
        g.textAlign = 'left'; g.font = '800 12px Nunito, system-ui'; g.fillStyle = R.ambush ? '#ff6b6b' : '#a49eb8'; g.fillText('Threat', 16, 114);
        for (let i = 0; i < R.threatMax; i++) {
          const x = 70 + i * 18, y = 110, on = i < R.threat || R.ambush, pulse = R.threat === R.threatMax - 1 && i === R.threat ? 0.5 + Math.sin(R.t * 6) * 0.5 : 0;
          g.fillStyle = on ? '#ff6b6b' : pulse ? `rgba(255,107,107,${0.25 + pulse * 0.4})` : '#ffffff22'; g.beginPath(); g.ellipse(x, y, 7, 4.5, 0, 0, 6.283); g.fill();
          if (on) { g.fillStyle = '#2b0a0a'; g.beginPath(); g.arc(x, y, 2, 0, 6.283); g.fill(); }
        }
        const sk = s.streakOre && R.mstreak ? `⛏ ×${r1(1 + s.streakOre * R.mstreak)}` : R.fstreak >= 2 ? `🔥 ×${R.fstreak}` : '';
        if (sk) { g.fillStyle = '#ffd166'; g.fillText(sk, 80 + R.threatMax * 18, 114); }
        g.textAlign = 'right'; g.font = '16px system-ui';
        R.relics.forEach((id, i) => { const r = RELICS.find((x) => x.id === id); g.fillText(r.icon, W - 16 - i * 22, 117); });
      }
      // the King's health bar
      if (R.K && R.obj && R.obj.kind === 'king') {
        const K = R.K, bw = W - 32, by = 122;
        g.textAlign = 'left'; g.font = '400 16px "Lilita One", system-ui'; g.fillStyle = '#ff8fa3'; g.fillText(`👑 Mountain King${K.phase === 2 ? ' · awake' : ''}`, 16, by - 4);
        g.textAlign = 'right'; g.font = '800 13px Nunito, system-ui'; g.fillStyle = '#fff'; g.fillText(`${Math.ceil(K.hp)} / ${K.max}`, W - 16, by - 4);
        g.fillStyle = 'rgba(0,0,0,.6)'; rr(g, 16, by, bw, 14, 7); g.fill();
        const kg = g.createLinearGradient(16, 0, 16 + bw, 0); kg.addColorStop(0, '#9d0208'); kg.addColorStop(1, K.phase === 2 ? '#7df9ff' : '#ff4d6d');
        g.fillStyle = kg; rr(g, 16, by, bw * Math.max(0, K.hp) / K.max, 14, 7); g.fill();
        g.fillStyle = '#ffffffaa'; g.fillRect(16 + bw / 2 - 1, by - 2, 2, 18);
      }
    }
    function drawBanner(g) {
      const b = R.banner, bt = R.t - b.t, dur = b.big ? 2.2 : 1.4, y = R.K ? 192 : 168;
      if (bt < dur) {
        const al = clamp(dur - bt, 0, 1) * clamp(bt * 6, 0, 1), sc = b.big ? 1 + Math.max(0, 0.3 - bt) : 1;
        g.globalAlpha = al; g.textAlign = 'center';
        if (b.big) { g.fillStyle = 'rgba(0,0,0,.55)'; g.fillRect(0, y - 40, W, 74); }
        g.font = `400 ${Math.round((b.big ? 34 : 30) * sc)}px "Lilita One", system-ui`; g.fillStyle = '#000a'; g.fillText(b.s, W / 2, y + 2); g.fillStyle = b.red ? '#ff6b6b' : '#ffd166'; g.fillText(b.s, W / 2, y);
        if (b.sub) { g.font = '800 14px Nunito, system-ui'; g.fillStyle = '#e9e3f5'; g.fillText(b.sub, W / 2, y + 24); }
        g.globalAlpha = 1;
      }
      const et = R.t - R.endT;
      if (R.ended) {
        g.globalAlpha = clamp(et * 3, 0, 1); g.textAlign = 'center'; g.fillStyle = 'rgba(0,0,0,.5)'; g.fillRect(0, y - 36, W, 64);
        g.font = '400 30px "Lilita One", system-ui';
        if (R.ended === 'retreat') { g.fillStyle = '#8be29a'; g.fillText(R.sealed ? 'Sealed gate: back to camp' : 'Back to camp!', W / 2, y); g.font = '800 14px Nunito, system-ui'; g.fillStyle = '#e9e3f5'; g.fillText(`All loot banked from depth ${R.depth}`, W / 2, y + 22); }
        if (R.ended === 'dead') { g.fillStyle = '#ff6b6b'; g.fillText('Slain!', W / 2, y); g.font = '800 14px Nunito, system-ui'; g.fillStyle = '#e9e3f5'; g.fillText(`by ${R.killer || 'the dark'} · keeping ${pct(Math.min(1, R.keep))}`, W / 2, y + 22); }
        if (R.ended === 'won') { g.fillStyle = '#ffd166'; g.fillText('The King falls!', W / 2, y); }
        g.globalAlpha = 1;
      }
    }

    const api = {
      get over() { return R.over; }, get t() { return R.t; }, act, R, estimate, kingEstimate, kingDeal, deal, slots,
      devJump(d) { R.depth = Math.max(1, d - 1); R.atk += d * 1.2; R.max = R.hp = R.max + d * 6; R.gold += d * 20; R.ore += d * 9; next(); },
      update(dt) {
        if (R.stop > 0) { R.stop -= dt; fx.update(dt * 0.15); return; } // hit pause
        if (R.slow) dt *= 0.45; // slow-mo on death
        R.t += dt;
        if (ui && ui.getBoundingClientRect) { const target = ui.getBoundingClientRect().height; if (target > 0) R.uh = R.uh ? R.uh + (target - R.uh) * Math.min(1, dt * 14) : target; }
        if (R.phase === 'intro' && R.t > 0.7) { R.phase = 'pick'; render(); if (s.satchel) relicPick('Relic Satchel: pick a relic for this run', () => { R.phase = 'pick'; render(); }); }
        if (R.phase === 'anim') {
          R.wait -= dt;
          while (R.wait <= 0) {
            if (!Q.length) { const th = qThen; qThen = null; R.phase = 'idle'; if (th) th(); if (R.phase === 'idle' && !R.over) { R.phase = 'pick'; render(); } break; }
            const [d, f] = Q.shift(); if (f) f(); R.wait += d;
            if (R.stop > 0) break;
          }
        }
        hints();
        fx.update(dt);
      },
      draw(g) {
        g.save(); g.translate((rnd() - 0.5) * fx.shake, (rnd() - 0.5) * fx.shake);
        drawScene(g); fx.draw(g); g.restore();
        drawHud(g); drawBanner(g);
      },
      // ending from the pause menu between rooms banks like a Retreat; mid-room (or vs the King) it counts as a death
      quit() { if (R.ended) return; if (R.phase === 'pick') R.ended = 'retreat'; else { R.ended = 'dead'; R.killer = R.killer || 'giving up'; } },
      result() {
        const relics = R.relics.length, lines = [`Depth ${R.depth} · ${R.kills} kill${R.kills === 1 ? '' : 's'}${R.elites ? ` (${R.elites} elite)` : ''} · best streak ×${R.bestStreak}${relics ? ` · ${relics} relic${relics > 1 ? 's' : ''}` : ''}${R.sneaks ? ` · ${R.sneaks} sneaks` : ''}`];
        const score = R.ended === 'won' ? BOSS_DEPTH : R.depth;
        if (R.ended === 'won') return { won: true, score, earned: { gold: R.gold, ore: R.ore }, lines };
        if (R.ended === 'dead') {
          const kp = Math.min(1, R.keep);
          return { won: false, score, title: `Slain by ${R.killer || 'the dark'}`, earned: { gold: R.gold * kp, ore: R.ore * kp },
            lines: [...lines, `Kept ${pct(kp)} of ${fmt(R.gold)} gold and ${fmt(R.ore)} ore. Retreat sooner to keep it all.`] };
        }
        return { won: false, score, title: R.sealed ? `The Sealed Gate at depth ${BOSS_DEPTH}` : `Retreated from depth ${R.depth}`, earned: { gold: R.gold, ore: R.ore }, lines: [...lines, 'Retreated safely: kept everything.'] };
      },
    };
    if (typeof window !== 'undefined' && window.DelveDeck) window.DelveDeck.run = api;
    return api;
  }
  function zoneOf(d) {
    if (d <= 6) return { id: 'upper', name: 'The Upper Mine', top: '#3b2a1f', bot: '#1a120d', ceil: '#140e0a', floor: '#2c2018', glow: '#ffb35c', crystals: 2 };
    if (d <= 13) return { id: 'crystal', name: 'The Crystal Caves', top: '#2a2244', bot: '#100c1e', ceil: '#0c0a16', floor: '#1d1830', glow: '#b388eb', crystals: 6 };
    return { id: 'molten', name: 'The Molten Deep', top: '#3a1a14', bot: '#140806', ceil: '#0f0605', floor: '#2a1410', glow: '#ff6b35', crystals: 4 };
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
    const body = { fighter: '#4f6d94', miner: '#c8702a', cleric: '#e8e2cf', rogue: '#3d405b' }[who] || '#4f6d94';
    g.fillStyle = F('#3d2c22'); g.fillRect(-11, -24, 8, 24); g.fillRect(3, -24, 8, 24);
    g.fillStyle = '#2a1d16'; g.fillRect(-13, -4, 11, 5); g.fillRect(2, -4, 12, 5);
    if (who === 'cleric') { g.fillStyle = F(body); g.beginPath(); g.moveTo(-15, -58 + bob); g.lineTo(15, -58 + bob); g.lineTo(19, -8); g.lineTo(-19, -8); g.fill(); g.fillStyle = '#d4a017'; g.fillRect(-2, -56 + bob, 4, 46); g.fillRect(-8, -48 + bob, 16, 4); }
    else if (who === 'rogue') { g.fillStyle = F('#2b2d42'); g.beginPath(); g.moveTo(-17, -60 + bob); g.lineTo(17, -60 + bob); g.lineTo(22, -14 + Math.sin(t * 5) * 2); g.lineTo(-24, -12 + Math.sin(t * 5 + 1) * 2); g.fill(); g.fillStyle = F(body); rr(g, -13, -58 + bob, 26, 36, 8); g.fill(); g.fillStyle = '#8d5a2b'; g.fillRect(-13, -32 + bob, 26, 4); g.fillStyle = '#d4a017'; g.fillRect(-2, -33 + bob, 5, 6); }
    else { g.fillStyle = F(body); rr(g, -16, -58 + bob, 32, 38, 9); g.fill(); g.fillStyle = '#2a1d16'; g.fillRect(-16, -28 + bob, 32, 5); if (who === 'miner') { g.fillStyle = '#7a4a1e'; g.fillRect(-10, -56 + bob, 4, 30); g.fillRect(6, -56 + bob, 4, 30); } }
    // head
    if (who === 'cleric') circ(g, 0, -70 + bob, 17, F('#f1ead6'));
    circ(g, 0, -70 + bob, 13, F('#f2c6a0'));
    circ(g, 6, -71 + bob, 2.2, '#222');
    if (who === 'fighter') { g.fillStyle = '#adb5bd'; g.beginPath(); g.arc(0, -73 + bob, 14, Math.PI, 0); g.fill(); g.fillRect(-14, -74 + bob, 28, 4); g.fillStyle = '#6c757d'; g.fillRect(9, -74 + bob, 3, 11); g.fillStyle = '#e63946'; g.fillRect(-3, -92 + bob, 6, 8); }
    else if (who === 'miner') { g.fillStyle = '#ffb703'; g.beginPath(); g.arc(0, -74 + bob, 14, Math.PI, 0); g.fill(); g.fillRect(-16, -75 + bob, 33, 4); circ(g, 12, -80 + bob, 4, '#fff3b0'); g.fillStyle = '#6b3e1d'; g.beginPath(); g.moveTo(-8, -64 + bob); g.quadraticCurveTo(3, -48 + bob, 13, -64 + bob); g.fill(); }
    else if (who === 'rogue') { g.fillStyle = F('#2b2d42'); g.beginPath(); g.arc(0, -71 + bob, 16, Math.PI * 0.95, Math.PI * 2.05); g.lineTo(14, -60 + bob); g.lineTo(-16, -60 + bob); g.fill(); g.beginPath(); g.moveTo(-14, -80 + bob); g.lineTo(-22, -62 + bob); g.lineTo(-10, -66 + bob); g.fill(); g.fillStyle = '#1b1b2f'; g.fillRect(-4, -68 + bob, 18, 6); circ(g, 7, -71 + bob, 2.2, '#b8f2e6'); }
    else { g.strokeStyle = 'rgba(255,224,102,.7)'; g.lineWidth = 2.5; g.beginPath(); g.ellipse(0, -92 + bob, 11, 3.5, 0, 0, 6.283); g.stroke(); }
    // weapon
    g.save(); g.translate(12, -42 + bob); g.rotate(-0.5 + (o.swing || 0) * 1.9);
    if (who === 'fighter') { g.fillStyle = '#dee2e6'; g.fillRect(-2.5, -40, 5, 34); g.beginPath(); g.moveTo(-2.5, -40); g.lineTo(0, -46); g.lineTo(2.5, -40); g.fill(); g.fillStyle = '#d4a017'; g.fillRect(-8, -7, 16, 4); g.fillStyle = '#5c3d2e'; g.fillRect(-2, -3, 4, 9); }
    else if (who === 'miner') { g.fillStyle = '#8d5a2b'; g.fillRect(-2.5, -36, 5, 40); g.strokeStyle = '#adb5bd'; g.lineWidth = 5; g.lineCap = 'round'; g.beginPath(); g.arc(0, -24, 16, -2.6, -0.5); g.stroke(); g.lineCap = 'butt'; }
    else if (who === 'rogue') { g.fillStyle = '#ced4da'; g.beginPath(); g.moveTo(-2.5, -6); g.lineTo(0, -30); g.lineTo(2.5, -6); g.fill(); g.fillStyle = '#5c3d2e'; g.fillRect(-5, -7, 10, 3); g.fillRect(-1.5, -4, 3, 8); g.save(); g.translate(-22, 4); g.rotate(0.9); g.fillStyle = '#ced4da'; g.beginPath(); g.moveTo(-2, -6); g.lineTo(0, -24); g.lineTo(2, -6); g.fill(); g.restore(); }
    else { g.fillStyle = '#8d5a2b'; g.fillRect(-2, -30, 4, 36); circ(g, 0, -33, 8, '#d4a017'); if (o.swing) circ(g, 0, -33, 14, 'rgba(255,224,102,.35)'); }
    g.restore();
    if (o.guard && who !== 'cleric' && who !== 'rogue') { circ(g, 16, -40 + bob, 13, '#6c757d'); circ(g, 16, -40 + bob, 8, '#adb5bd'); }
    else if (o.guard && who === 'cleric') { g.strokeStyle = 'rgba(255,224,102,.75)'; g.lineWidth = 3; g.beginPath(); g.arc(4, -45, 40, -0.9, 0.9); g.stroke(); }
    g.restore();
  }
  function drawFace(g, who, x, y, r) { const sc = r / 26; drawHero(g, who, x - 2 * sc, y + 70 * sc, 0, { sc }); }

  function drawMon(g, m, x, y, t, o) {
    g.save(); g.translate(x - o.atk * 26, y);
    const z = (m.elite ? 1.2 : 1) * (m.king ? 1.55 : 1);
    ell(g, 0, 2, 30 * z, 6, 'rgba(0,0,0,.35)');
    g.scale(z, z);
    if (m.affix && !m.elite) { const gr = g.createRadialGradient(0, -40, 5, 0, -40, 60); gr.addColorStop(0, 'rgba(255,140,40,.3)'); gr.addColorStop(1, 'rgba(255,140,40,0)'); g.fillStyle = gr; g.fillRect(-70, -110, 140, 120); }
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
        g.fillStyle = '#6b4423'; g.fillRect(-42, -96 + b, 6, 76); g.fillStyle = '#6c757d'; rr(g, -54, -108 + b, 30, 18, 4); g.fill(); g.fillStyle = '#adb5bd'; g.fillRect(-54, -108 + b, 30, 4);
        if (m.phase === 2) { const p = 0.5 + Math.sin(t * 6) * 0.3; g.strokeStyle = `rgba(125,249,255,${p + 0.2})`; g.lineWidth = 2; g.beginPath(); g.moveTo(-20, -66 + b); g.lineTo(-8, -54 + b); g.lineTo(-14, -40 + b); g.moveTo(14, -70 + b); g.lineTo(6, -56 + b); g.lineTo(16, -44 + b); g.stroke();
          const cg = g.createRadialGradient(0, -110 + b, 2, 0, -110 + b, 34); cg.addColorStop(0, `rgba(125,249,255,${p})`); cg.addColorStop(1, 'rgba(125,249,255,0)'); g.fillStyle = cg; g.fillRect(-36, -146 + b, 72, 72); circ(g, -7, -90 + b, 3.5, '#7df9ff'); circ(g, 6, -90 + b, 3.5, '#7df9ff'); }
        break;
    }
    if (m.elite) { g.font = '800 12px Nunito, system-ui'; g.textAlign = 'center'; g.fillStyle = '#ff8fa3'; g.fillText(m.affix ? AFFIX[m.affix][0].toUpperCase() : 'ELITE', 0, 16); }
    g.restore();
  }
  function drawVein(g, o, x, y, t) {
    const sh = t - o.hitT < 0.1 ? (Math.random() - 0.5) * 6 : 0, broke = o.broke > 0 ? clamp((t - o.broke) / 0.3, 0, 1) : 0;
    const col = { copper: ['#e09f3e', '#f4a261'], silver: ['#ced4da', '#f8f9fa'], gem: ['#9d4edd', '#e0aaff'], gas: ['#b5e48c', '#e9f5db'], lode: ['#ffd166', '#fff3b0'] }[o.c.kind] || ['#e09f3e', '#f4a261'];
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
  function drawRune(g, x, y, t, col = '#b388eb') {
    const p = 0.6 + Math.sin(t * 3) * 0.25, gr = g.createRadialGradient(x, y - 50, 4, x, y - 50, 80); gr.addColorStop(0, col + Math.round(115 * p).toString(16).padStart(2, '0')); gr.addColorStop(1, col + '00');
    g.fillStyle = gr; g.fillRect(x - 90, y - 140, 180, 140);
    g.fillStyle = '#4a4458'; g.beginPath(); g.moveTo(x - 22, y); g.lineTo(x - 18, y - 80); g.quadraticCurveTo(x, y - 96, x + 18, y - 80); g.lineTo(x + 22, y); g.fill();
    g.strokeStyle = col; g.globalAlpha *= Math.min(1, p + 0.3); g.lineWidth = 3; g.beginPath(); g.moveTo(x, y - 70); g.lineTo(x, y - 30); g.moveTo(x - 10, y - 58); g.lineTo(x + 10, y - 44); g.moveTo(x + 10, y - 58); g.lineTo(x - 10, y - 44); g.stroke();
  }
  function drawCrystal(g, x, y, t) {
    const p = 0.6 + Math.sin(t * 4) * 0.3, gr = g.createRadialGradient(x, y, 2, x, y, 26); gr.addColorStop(0, `rgba(125,249,255,${0.5 * p})`); gr.addColorStop(1, 'rgba(125,249,255,0)');
    g.fillStyle = gr; g.fillRect(x - 26, y - 26, 52, 52);
    const lg = g.createLinearGradient(x - 8, y - 16, x + 8, y + 12); lg.addColorStop(0, '#e0fbfc'); lg.addColorStop(0.5, '#7df9ff'); lg.addColorStop(1, '#3a86ff');
    g.fillStyle = lg; g.beginPath(); g.moveTo(x, y - 18); g.lineTo(x + 8, y - 4); g.lineTo(x + 4, y + 12); g.lineTo(x - 4, y + 12); g.lineTo(x - 8, y - 4); g.closePath(); g.fill();
    g.fillStyle = 'rgba(255,255,255,.6)'; g.beginPath(); g.moveTo(x - 1, y - 14); g.lineTo(x - 5, y - 3); g.lineTo(x - 2, y + 4); g.fill();
  }
  function drawThrone(g, x, y, t, phase) {
    // a throne of rough-cut ore behind the King, crystals pulsing brighter once he wakes
    const gr = g.createLinearGradient(0, y - 220, 0, y); gr.addColorStop(0, '#3c2f4f'); gr.addColorStop(1, '#1b1428');
    g.fillStyle = gr; g.beginPath(); g.moveTo(x - 70, y); g.lineTo(x - 64, y - 150); g.lineTo(x - 40, y - 200); g.lineTo(x - 20, y - 170); g.lineTo(x, y - 230); g.lineTo(x + 20, y - 170); g.lineTo(x + 40, y - 200); g.lineTo(x + 64, y - 150); g.lineTo(x + 70, y); g.fill();
    for (const [dx, dy, s] of [[-48, -170, 1], [48, -170, 1], [0, -205, 1.3], [-60, -100, 0.8], [60, -100, 0.8]]) {
      const p = phase === 2 ? 0.7 + Math.sin(t * 5 + dx) * 0.3 : 0.35;
      g.fillStyle = phase === 2 ? `rgba(125,249,255,${p})` : `rgba(255,209,102,${p})`; g.beginPath(); g.moveTo(x + dx, y + dy - 12 * s); g.lineTo(x + dx + 6 * s, y + dy); g.lineTo(x + dx, y + dy + 10 * s); g.lineTo(x + dx - 6 * s, y + dy); g.fill();
    }
  }
  function drawReliquary(g, x, y, t) {
    const p = 0.6 + Math.sin(t * 3) * 0.3, gr = g.createRadialGradient(x, y - 50, 4, x, y - 50, 80); gr.addColorStop(0, `rgba(244,132,95,${0.45 * p})`); gr.addColorStop(1, 'rgba(244,132,95,0)');
    g.fillStyle = gr; g.fillRect(x - 90, y - 140, 180, 140);
    g.fillStyle = '#5a4a3f'; rr(g, x - 30, y - 22, 60, 22, 4); g.fill(); g.fillStyle = '#6f5d50'; g.fillRect(x - 34, y - 26, 68, 6);
    const vg = g.createLinearGradient(x - 14, 0, x + 14, 0); vg.addColorStop(0, '#9c6644'); vg.addColorStop(0.5, '#f4a261'); vg.addColorStop(1, '#9c6644');
    g.fillStyle = vg; g.beginPath(); g.moveTo(x - 10, y - 26); g.quadraticCurveTo(x - 22, y - 50, x - 8, y - 66); g.lineTo(x + 8, y - 66); g.quadraticCurveTo(x + 22, y - 50, x + 10, y - 26); g.fill();
    g.fillStyle = '#ffd166'; g.fillRect(x - 10, y - 70, 20, 5); circ(g, x, y - 48, 4 + p * 2, '#fff3b0');
  }

  const API = { CHARS, NODES, MONS, KING, RELICS, SHRINES, BOSS_DEPTH, createRun, baseStats };
  if (typeof window === 'undefined') { module.exports = API; return; }
  window.DelveDeck = API;
  const kit = Kit.game({
    id: 'delve-deck', title: 'Delve Deck', tagline: 'Descend the mine-dungeon one room at a time. Fight, mine, rest, gamble, and know when to turn back.',
    howTo: 'Each room deals cards: tap one to enter that room. Fights show how much HP they will cost; Guard halves the damage and the loot. Skipping fights raises Threat: fill it and the next room is an Ambush. Retreat between rooms to bank everything; die and you keep only a fraction.',
    runVerb: 'Delve!', winTitle: 'The Mountain King falls!', loseTitle: 'Slain in the deep', scoreName: 'depth',
    colors: { accent: '#ffb35c', bg: '#15111c', card: '#271f30' },
    currencies: [{ id: 'gold', name: 'gold', color: '#ffd166' }, { id: 'ore', name: 'ore', color: '#f4a261' }],
    characters: CHARS, drawFace, nodes: NODES, baseStats, createRun,
  });
  KIT = kit; window.DelveDeck.kit = kit;
  if (typeof document !== 'undefined' && document.body) document.body.dataset.ready = '1';
})();
