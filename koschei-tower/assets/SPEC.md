# Koschei's Tower: asset spec

This is a portrait phone game: a falling-block puzzle RPG set in Russian folklore. Each row you clear strikes the monster on the current floor of Koschei's tower.

The game ships with code-drawn pixel art and synthesized chiptune sound, so every asset here is an upgrade. **The names below are the contract** the code looks up.

## Style

**Look.** 8-bit pixel art in the NES / Famicom era, inspired by Russian lacquer-box and Khokhloma folk painting:
- deep red, gold and black, with birch white and night blue;
- chunky sprites with a 1-pixel dark outline (#140c10);
- flat colour with at most 2 to 3 shades per hue;
- no anti-aliasing and no gradients.

**Grid.** Paint each sprite on a visible pixel grid of about 32×32 to 48×48 "fat pixels", upscaled with nearest-neighbour to the delivery size. The code reduces each sprite back to about 40 px with a fixed palette, so clean big pixels survive and fine detail does not.

**Tone.** Spooky fairy tale, not gore. No text, no letters and no UI frames.

**Backdrop.** A plain flat backdrop (a single flat colour, ideally #ff00ff or a flat light grey) or transparent. Centre the subject with a clear margin.

**Palette** (stay close to it):
- Reds: #8c1c2c, #d8343c
- Golds: #f0b43c, #ffe08a
- Inks: #140c10, #2a1a24
- Birch: #f4ecd8
- Night: #1c2a5c, #3c64b4
- Ice: #8cd8f0
- Forest: #2c6c3c, #6cb44c
- Earth: #7c4c2c, #b47c4c
- Violet: #6c3c9c

## Delivery

- Images: `deliveries/pocket-prototypes/koschei-tower/assets/img/<name>.png`.
- Sounds: `deliveries/pocket-prototypes/koschei-tower/assets/sfx/<name>.wav`.
- Add a `manifest.md`, and send a message per batch.

**Order:** bosses, then the first 4 monsters (kikimora, grey-wolf, bes, vodyanoy), then heroes, then the rest of the art, then sfx.

## Heroes (`img/hero-*.png`, 512 px square, full body, facing RIGHT, standing ready)

| Name | Subject |
|---|---|
| `hero-bogatyr` | Ivan the Bogatyr: a Russian knight with a pointed helmet, red cloak, round shield and sword |
| `hero-vedma` | Vasilisa the Wise: a young sorceress with a long braid, a kokoshnik headdress, a blue sarafan and a glowing hand |
| `hero-skomorokh` | Petrushka the Jester: a minstrel in a red-and-gold jester cap, holding a balalaika |

## Monsters (`img/foe-*.png`, 512 px square, full body, facing LEFT toward the hero)

| Name | Subject |
|---|---|
| `foe-kikimora` | A small, spiteful, hunched house spirit with a beak nose and straggly hair |
| `foe-grey-wolf` | A big grey wolf, snarling |
| `foe-bes` | A little horned imp with a shovel |
| `foe-vodyanoy` | A frog-faced old man of the millpond, green and dripping, with a long beard |
| `foe-rusalka` | A pale water maiden with long green hair, singing |
| `foe-bannik` | A bathhouse spirit: a steaming old man with a birch whisk and hot stones |
| `foe-upyr` | A pale vampire in a peasant shirt, red eyes |
| `foe-bear-spirit` | A huge brown bear wrapped in ghostly blue light |
| `foe-leshy` | The forest lord: a tall bark-skinned giant with antlers and moss |
| `foe-polevik` | A field spirit made of wheat, with one wild eye |
| `foe-bolotnik` | A swamp creature made of mud and reeds |
| `foe-navka` | A drowned maiden with a hollow back, cold blue |
| `foe-viy` | A squat giant with enormous drooping eyelids that touch the ground |
| `foe-psoglav` | A dog-headed giant with iron teeth |
| `foe-ovinnik` | A barn spirit: a black cat-like creature with glowing ember eyes |
| `foe-morok` | A shadowy mist figure with lantern eyes |
| `foe-karachun` | A winter-night spirit: a frost-bearded ghoul with claws |
| `foe-mara` | A nightmare hag with a black veil |
| `foe-bone-rider` | A skeleton knight on a skeletal horse |
| `foe-likhoradka` | The fever spirit: a gaunt woman in red rags, shivering heat haze |
| `foe-deathless-guard` | An empty suit of black armour, glowing visor |
| `foe-sirin` | A dark bird with a woman's face and a crown |
| `foe-iron-hound` | A mechanical iron dog with furnace eyes |
| `foe-chernokniga` | A floating black spellbook with teeth and a single eye |

## Bosses (`img/foe-*.png`, 768 px square, bigger and more ornate)

| Name | Subject |
|---|---|
| `foe-yaga` | Baba Yaga flying in her mortar, pestle raised, iron teeth |
| `foe-likho` | Likho One-Eye: a tall gaunt one-eyed hag-giant |
| `foe-zmey` | Zmey Gorynych: a green three-headed dragon |
| `foe-tugarin` | Tugarin: a serpent-knight with paper wings and a curved saber |
| `foe-chudo` | Chudo-Yudo: a many-headed water monster rising from a river |
| `foe-koschei` | Koschei the Deathless: a skeletal sorcerer-king with a crown, a black-and-gold robe and a green glow |

## Scenery (`img/bg-*.png`, 1024×512, a wide strip, no characters)

| Name | Subject |
|---|---|
| `bg-tower` | The inside of a dark stone tower: brick walls, two torches, a red-and-gold carpet floor. Keep it low-contrast so sprites pop. |
| `bg-boss` | The same tower hall, redder, with Koschei's green fire in braziers |

## Relics + spells (`img/icon-*.png`, 256 px square)

| Name | Subject |
|---|---|
| `icon-mortar` | Baba Yaga's wooden mortar and pestle |
| `icon-eye` | A single glowing eye in a gold setting |
| `icon-scale` | A green dragon scale |
| `icon-saber` | A curved golden saber |
| `icon-water` | A small flask of glowing living water |
| `icon-needle` | A golden needle inside a cracked egg |
| `icon-feather` | A glowing orange-gold Firebird feather (the second currency) |
| `icon-kopek` | A small copper coin (the main currency) |

## Sound effects (`sfx/<name>.wav`, short, mono, 8-bit/chiptune style: square, triangle and noise channels, NES-like)

| Name | Sound |
|---|---|
| `move` | A tiny tick when a piece shifts (under 40 ms, very quiet) |
| `rotate` | A short blip |
| `lock` | A soft thud when a piece lands |
| `clear` | A bright sweep for one cleared row |
| `clear4` | A big triumphant 4-row clear (about 0.6 s) |
| `hit` | A sword strike on a monster |
| `crit` | A heavier critical strike, with a ring |
| `kill` | A monster defeated: a descending crumble (about 0.5 s) |
| `boss` | A boss appears: a low ominous fanfare (about 1.2 s) |
| `attack` | A monster attacks: a growl or roar plus impact |
| `garbage` | Stone rows grinding up from below |
| `rocks` | Pebbles clattering down |
| `overflow` | The stack bursts: a crash plus a hurt sound |
| `fire` | Firebird spell: a whoosh of flame with a bird shriek |
| `ice` | Frost spell: crystalline shimmer |
| `earth` | Quake spell: a rumbling boom |
| `storm` | Thunder spell: a lightning crack |
| `levelup` | A level-up jingle (about 0.8 s) |
| `coin` | A kopek pickup |
| `buy` | An upgrade bought |
| `nope` | Can't afford |
| `win` | Koschei defeated: a victory fanfare (about 2 s) |
| `lose` | Fallen hero: a sad descending jingle (about 1.5 s) |
| `warn` | A monster is about to strike: two quick alarm beeps |

The music is composed and synthesized in code, so no music is needed.
