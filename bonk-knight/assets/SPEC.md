# Bonk Knight: asset spec

**Style.** A chunky, cheerful dungeon-crawler piñata game: think Saturday-morning cartoon fantasy. Bold rounded shapes, a
thick dark outline (#1b1830), soft cel shading with one highlight, big expressive eyes, readable at 100-200 px on a phone.
Monsters are round, squashable and more goofy than scary (they burst into coins when bonked). Palette: gold #ffd166,
night purple #15121f / #26213a, coral #ff5d73, arcane violet #b388eb, ghost mint #7effbe, ember orange #ff9f1c, plus
each monster's own colour below. Avoid: realism, gore, blood, text or numbers, UI frames, ground shadows (the code draws
them), motion blur, effect sprites, busy backdrops behind sprites. Sprites: 512x512 transparent PNG, one character centred,
facing the viewer (3/4 front), whole body in frame. hero-*: head-and-shoulders bust portrait. bg-*: 780x1688 portrait.

| name | kind | subject | priority |
|---|---|---|---|
| hero-berserker | image | Hilda the Berserker: a grinning red-braided Viking woman in a horned steel helm, freckles, fur collar, war-paint stripe, bust portrait. | 1 |
| hero-battlemage | image | Orrin the Battlemage: an old white-bearded wizard in a deep-blue starry hat with a gold star, eyes glowing pale cyan, violet sparks at his fingertips, bust portrait. | 1 |
| hero-rogue | image | Vex the Rogue: a hooded rogue in charcoal leather, face mask over the nose, sly gold cat-like eyes, a dagger glinting at the shoulder, bust portrait. | 1 |
| hero-bard | image | Wren the Bard: a cheeky young bard with chestnut hair, green feathered cap with a red plume, lute neck over the shoulder, mid-grin, bust portrait. | 1 |
| boss-lich | image | The Lich King: a towering skeletal sorcerer in tattered violet robes, a gold spiked crown, mint-green glowing eye sockets, a staff topped with a glowing violet orb in his right hand, a dark phylactery gem on his chest; facing the viewer, full body. | 1 |
| mon-slime | image | A big round green jelly slime (#6ed37f), glossy and wobbly, two huge eyes, a goofy open smile. | 1 |
| mon-goblin | image | A round-bellied lime-green goblin (#9bc34a) with huge pointy ears, snaggle teeth and a cheeky scowl, arms out. | 1 |
| mon-skeleton | image | A chunky cartoon skeleton warrior (bone white #ece6d2) with a big round skull, red pinpoint eyes and a toothy grin, holding a rusty sword. | 1 |
| bg-tower | image | Inside a tower hall at night: stone-brick wall with an arched window showing a moon in the top 60%, wall torches at the far left and right edges, worn flagstone floor in the bottom 40%; dim purple-brown, centre calm and low-contrast. | 1 |
| mon-orc | image | A stocky green orc (#5e9c55) in a dented iron half-helm, big lower tusks, a frown, fists clenched. | 1 |
| mon-troll | image | A hulking blue-grey cave troll (#6e9bb5) with curled horns, a jutting underbite with teeth, mossy shoulders. | 2 |
| mon-golem | image | A boulder golem of grey-brown stone (#9a8f80) with one glowing amber eye in a cracked face, moss in the seams. | 2 |
| mon-fire-imp | image | A small pot-bellied red fire imp (#e0613f) with stubby horns, tusks, a flaming tail and a mischievous grin. | 2 |
| mon-wyrm | image | A plump young purple wyrm (#7a68c2) coiled upright, horns, one big eye, toothy grin, little useless wings. | 2 |
| mon-shroom | image | A walking mushroom with a big red white-spotted cap and a cream stalk body (#efe0c4), stubby feet, grumpy face. | 2 |
| mon-crystal-golem | image | A teal stone golem (#7fb8c9) with icy-blue crystal shards growing from its shoulders and head, one glowing eye. | 2 |
| mon-magma-blob | image | A dark charred-rock blob (#6b2a1c) split by glowing orange lava cracks, molten orange eyes and mouth. | 2 |
| mon-ghost | image | A classic sheet ghost, pale blue-white (#e4ecf7), wavy tattered hem, big hollow black eyes and an "O" mouth, slightly translucent look. | 2 |
| mon-wraith | image | A hooded wraith in slate-dark tattered robes (#3b4d5e), the hood a black void with two mint-green (#7effbe) glowing eyes, floating. | 2 |
| obj-chest | image | A wooden treasure chest with gold bands and a gold lock plate, lid closed, warm and inviting. | 1 |
| obj-mimic | image | The same treasure chest awake as a mimic: lid gaping open with rows of white fangs, a long coral tongue, two yellow eyes on the lid. | 1 |
| obj-golden-goblin | image | A small gleeful golden goblin (#f2c14e) running sideways to the right with a bulging coin sack over its shoulder, legs mid-stride. | 1 |
| obj-coin | image | A single fat gold coin seen face-on with a simple embossed crown and a bright highlight. | 2 |
| obj-shrine | image | A small stone shrine: a mossy pedestal with a softly glowing gold-and-violet rune crystal floating above it, candles at its base. | 3 |

(The Crypt's Bone Knight reuses mon-skeleton with a code-drawn helm; gems, minions, skull bombs and embers stay vector.)

## Sounds

| name | what it sounds like | length (s) |
|---|---|---|
| hit | a soft, meaty "bonk" of a club on a squishy monster; plays on every normal hit, so keep it light | 0.12 |
| crit | a heavy cartoon "BONK!" with a bright metallic ring on top: a critical hit | 0.3 |
| coin | one small bright coin "tink" (plays many times a second while sweeping) | 0.08 |
| boom | a monster bursting: a chunky poof-explosion with a little coin jingle in the tail | 0.6 |
| pop | a small cartoon pop, like a bubble or a minion going "pip" | 0.08 |
| crack | stone/metal armour plate cracking: a short crunchy clank | 0.15 |
| ding | a sparkly two-note chime for a gem or flask pickup | 0.35 |
| zap | a dull magic-shield "thunk-bzzt" when a hit is blocked | 0.15 |
| chomp | a mimic biting: wooden lid slam with a wet snap | 0.3 |
| jackpot | a coin-shower fanfare: rapid rising coin jingles ending on a bright chord (chest opened, goblin caught) | 0.8 |
| roar | the Lich King's deep, echoing undead roar | 0.8 |
| end | a deflating "out of breath" wheeze with a low falling note | 0.6 |
| win | a short triumphant brass-and-bells victory flourish | 0.8 |
| music-loop | a quiet, playful dungeon march: plucked lute, soft tom drum, low pad; seamless loop, no sharp transients | 30 |
