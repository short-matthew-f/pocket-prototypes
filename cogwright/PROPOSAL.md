# Cogwright: game design proposal

Working title. It's a phone PWA for Matt, with no ads, no energy timers and no gacha.

## As built (2026-11-22)

The open questions were settled on the defaults: keep the crank burst, keep Night Shift, use the clockwork theme, host in pocket-prototypes.

Changes from the proposal:

- **The board is hexagonal.** On a square grid every loop has an even number of gears, so nothing could ever jam.
- **The jam rule is local and deterministic.** Gears are visited outward from the Mainspring. A gear that touches two turning gears spinning opposite ways jams. The rest of the train keeps turning.
- **Engine boosts don't stack.** A gear gets the biggest single boost between it and the Mainspring. When they multiplied, chained Engines reached 12,000 RPM.
- **Three zones, 30 depths in total,** with a boss at depths 10, 20 and 30. Overhaul unlocks after Depth 10.
- **Every Shift pays something.** A timeout sweeps up 20% of loose scrap even without the Sweeper upgrade.
- **Idle earnings are capped at 90% of your recent active rate.**

Pacing, measured by a bot playing the real model (`node test.js --bots`):

- First legendary at 3–16 minutes across three seeds. A pity timer guarantees one within 20 drops.
- Depth 10 at 1.5–2.3 hours across three seeds.
- Bots that never use the Wrench, or use only one troop type, progress less.

## Pitch

You're a tinkerer in a besieged clockwork workshop. On a grid you build a gear train, driven by a hand-wound **Mainspring**, that churns out little brass soldiers. You fight in short, frantic **Shifts**: the factory runs itself while your thumb sweeps the battlefield as a sparking wrench, zapping enemies and scooping up scrap. Enemies drop **gears as loot**, Diablo-style, with rarities and random affixes, and you slot them into the gear train. Between Shifts you spend scrap on a huge upgrade tree. While you're away, the workshop keeps ticking.

## Where each influence lands

| Influence | What we take | What we leave out |
|---|---|---|
| Gear Fight | Gears mesh to a spinning core; each rotation produces troops; unit gears and spell gears; merging; wave battles that end at an enemy base | Ads, energy, chests you pay to open, levels tuned to make you pay |
| Diablo | Rarity tiers, random affixes, item level, build-changing legendaries, set bonuses, salvage and rerolls, rising difficulty tiers | Trading, an endless stash, gambling |
| Nodebuster | Short timed runs, cursor damage and pickup, one big upgrade tree, quick restarts, bosses, prestige | The flaw where killing a boss ends the run before you can collect your loot (we vacuum all drops on a boss kill) |
| Active/idle | Inside a Shift: the factory is idle and your thumb is active. Outside a Shift: the workshop earns while the app is closed, and automation nodes can run Shifts for you | Being punished for playing actively (active play always earns more) |

## The three loops

### 1. The Shift (60–90 s, active)

- The screen is split. The battlefield lane is on top, with enemies marching down toward your workshop door. A strip at the bottom shows your gear train turning.
- Every rotation of a unit gear spawns its troop. The troops march up and fight on their own.
- **Your thumb is the Wrench.** Wherever you hold it on the battlefield, a spark field damages enemies and pulls in scrap and loot drops. This is the Nodebuster verb: always active, always useful.
- **Crank burst:** spin your thumb in a circle on the Mainspring to over-wind it for a few seconds of double RPM. It costs Wrench time, so you're trading damage for production.
- **The Shift ends** when the timer runs out, the door breaks, or you kill the zone boss. A boss kill auto-collects everything on the field.
- **Rewards:** scrap (for the tree), loot gears, and depth progress. Each boss kill opens a deeper Depth.

### 2. The Workbench (between Shifts, about 30 s)

The Gear Fight puzzle, with real gear physics as the twist:

- **The grid:** a hex grid, about 19 cells at the start, growing with the upgrade tree. It has to be hexes, not squares: on a square grid every closed loop has an even number of gears, so nothing could ever jam. The Mainspring sits in a fixed cell, and a gear only turns if it meshes, through neighbouring cells, back to the Mainspring.
- **Ratios matter:** gears come in three sizes.
  - A small gear driven by a large one spins about 2× faster: more, weaker spawns and more spell ticks.
  - A large gear spins slower but spawns elites.
  - RPM is calculated down the chain, so where you place things matters.
- **Direction matters:** meshed gears alternate clockwise and counter-clockwise. Some affixes only work one way ("CCW: +40% damage"). A closed loop with an odd number of gears **jams**, just like real gears; the simplest case is three gears in a triangle. Jammed gears stop. This gives the board a light puzzle feel.
- **Gear families:**
  - **Unit gears** spawn a troop each rotation. The troops are Grunt, Archer, Brute and Tinker (who repairs the door).
  - **Spell gears** pulse a buff or effect every N rotations: Haste, Overcharge, Chain Lightning, Shield.
  - **Engine gears** spawn nothing but multiply the RPM of the gears they drive.
  - **Collector gears** earn scrap per rotation. They're the idle economy, and they also run while the app is closed.
- **Merging:** drag a gear onto an identical gear (same type and size) to raise its rank by one. The gear you drag onto keeps its affixes, and the other is consumed. You choose which affixes survive.

### 3. The Upgrade Tree + Overhaul (meta, Nodebuster)

- **The tree:** about 60 nodes radiating out from the centre, bought with scrap. Branches:
  - **Wrench:** radius, damage, pickup range, crit
  - **Shift:** time, door HP, number of crank bursts
  - **Workbench:** grid size, inventory slots, Mainspring torque
  - **Loot:** drop rate, magic find, auto-salvage filter
  - **Idle:** offline cap of 2 → 4 → 8 → 12 h, Collector efficiency
  - **Automation:** auto-Wrench (a weak orbiting spark), and finally **Night Shift**, which plays a Shift for you on a timer at about 60% of the rewards of an active Shift
- **Overhaul (prestige):** once you've cleared Depth 10, you can reset the tree and depth. Legendary gears in the **Vault**, which has a few slots, are kept. You earn **Blueprints**, a permanent currency for a small second tree that unlocks new gear families, new zones and loot tiers above Legendary.

## Loot

| Rarity | Colour | Affixes | Notes |
|---|---|---|---|
| Common | grey | 0 | Base stats only; fodder for merging |
| Magic | blue | 1–2 | |
| Rare | yellow | 3–4 | |
| Legendary | orange | 2–3 plus a unique power | Build-defining |
| Set | green | 2 plus a set bonus | The bonus only applies while set pieces **mesh with each other**. That's the hook tying loot to the board. |

- **Item level** comes from Depth and scales base stats and the range of affix values.
- **Example affixes:** +% spawn per rotation; troops gain lifesteal; every 10th rotation fires a bolt; +X% RPM to driven gears; CW-only or CCW-only damage bonuses; "while jammed, store energy and release it on unjam".
- **Example legendaries:**
  - *The Escapement*: the whole train ticks in bursts, with 3 rotations' worth of spawns at once.
  - *Ouroboros Cog*: lets an odd loop turn without jamming.
  - *Grandfather Wheel*: a huge gear that drives every neighbour at 3× ratio.
  - *Tinker's Heart*: the Wrench heals troops it passes over.
- **Salvage and craft:** salvage gears into brass. Spend brass to reroll one affix (Diablo-style enchanting: you lock one affix and reroll another) or to temper item level up to your current Depth.
- **Drops on the field** are colour-coded beams. Your Wrench has to collect them before the Shift ends, unless it ends with a boss kill. That keeps the active verb meaningful.

## Structure and pacing

- **Zones** work like Diablo Acts. Each has 10 Depths and a boss that guards the enemy base: the Foundry, then the Flooded Mines, then the Clocktower. The first prototype ships one zone.
- **Depth** is the difficulty dial, like Torment levels. Deeper means tougher waves, higher item levels and better rarity odds. You can drop back to a shallower Depth to farm.
- **A typical session:**
  1. Open the app and collect your offline scrap and a few Collector drops.
  2. Play 3–6 Shifts of about 75 s each.
  3. Tinker with the board, merge gears, buy tree nodes, close the app.
- **Steady progress:** the first Overhaul is reachable in about 3–4 hours of play, and the first legendary within the first 20 minutes.

## Fair-to-the-player rules

- No ads, energy, premium currency, timers you can pay to skip, or loot boxes.
- Idle play always earns less than active play, but it's never zero. Offline earnings are capped, so there's no reason to check in obsessively.
- Every number that matters is visible: RPM, drop odds, set requirements.

## Build plan (if approved)

- **Engine:**
  - Canvas 2D and plain JavaScript.
  - The game model is DOM-free, as in Loop Line, so headless balance bots can play it.
  - The save lives in localStorage. Offline earnings are calculated from a timestamp.
  - Service worker for offline play; portrait phone first.
- **Hosting:** decide at kickoff. One option is pocket-prototypes on GitHub Pages, using the shared kit. The other is a standalone repo, which needs Matt's go-ahead.
- **Art and sound:** placeholders drawn in code first. Real art and sound come later via the Media Helper: brass and rust palette, gear sprites in three sizes, rarity glows, troop sprites, and tick, clank and loot-drop sounds.
- **MVP scope:**
  - One zone and 10 Depths with one boss
  - 4 unit gears, 3 spell gears, 1 engine gear, 1 collector gear
  - 4 rarities, ~25 affixes, 4 legendaries and one 3-piece set
  - A ~40-node tree, offline earnings, and a stub of the Overhaul screen
- **Testing:**
  - Rule tests for meshing, RPM, jamming and merging.
  - A bot that plays Shifts and the tree, to check pacing: first legendary under 20 minutes, Depth 10 in about 3 hours.
  - Browser checks on a phone-sized viewport.

## Open questions for Matt

1. Should the Wrench be the only active verb, or should crank bursts stay in? (Recommended: keep them. They're the "do I damage or produce?" decision.)
2. Should Night Shift automation exist, or should idle play only earn scrap while closed?
3. Theme: clockwork and brass, as proposed, or something else?
4. Hosting: pocket-prototypes, or a standalone repo?
