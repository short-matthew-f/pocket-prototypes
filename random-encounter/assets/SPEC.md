# Random Encounter: asset spec

This is a portrait phone game: a survivors-style run across an overworld. The player leads a party of up to four job heroes; every hero attacks on its own.

The game ships with code-drawn pixel art and synthesized chiptune, so every asset here is an upgrade. **The names below are the contract** the code looks up.

## Size and view (read first)

- **On-screen sizes.** Sprites are drawn tiny:
  - heroes, about 18 px tall;
  - regular monsters, about 16 px;
  - the ogre, about 22 px;
  - the golem boss, about 36 px;
  - the wyrm boss, about 44 px;
  - items, about 12 px.
- **Silhouettes.** Only big, bold shapes and 2 to 3 flat colours per part survive at those sizes. The code samples the art nearest-neighbour.
- **View.** Classic 8-bit overworld view: characters seen from the front, slightly from above, standing on the ground, full body.
- **Facing.** Heroes and monsters face **right**; the code mirrors them.

## Style

**Look.** NES-era pixel art:
- a visible fat-pixel grid (about 16×16 to 24×24 "pixels" for regulars), nearest-neighbour upscaled;
- a 1-pixel dark outline (#140c10);
- no anti-aliasing, gradients or text.

**Originality.** Generic fantasy adventurers, not any specific game's characters. In particular, the Mage must have a **visible face** with a white beard and a tall **blue** pointed hat with a gold star. No shadowed face and no glowing eyes.

**Backdrop.** A flat #ff00ff backdrop, or transparent.

**Palette** (stay close to it):
- Grass: #4ca444, #2c6c34
- Sand: #c8a86c
- Ink: #140c10
- Cream: #f4ecd8
- Gold: #f0c850
- Red: #d8343c
- Blue: #3c64b4
- Purple: #6c3c9c
- Brown: #7c4c2c
- Steel: #c0bcc8
- Skin: #f0c090

## Delivery

- Images: `deliveries/pocket-prototypes/random-encounter/assets/img/<name>.png`.
- Sounds: `deliveries/pocket-prototypes/random-encounter/assets/sfx/<name>.wav`.

## Heroes (`img/hero-*.png`, 512 px square)

| Name | Subject |
|---|---|
| `hero-fighter` | A young swordsman: a steel helmet with a gold band, a red tunic, a sword held up at the side |
| `hero-mage` | An old wizard with a tall blue pointed hat with a gold star, a white beard, a purple robe and a wooden staff |
| `hero-cleric` | A healer in a white hooded robe with a red cross on the chest, holding a gold staff |
| `hero-thief` | A nimble rogue in a green hood, a dark face mask and dark clothes, holding a dagger |
| `hero-monk` | A bald martial artist with a red headband, an orange gi, a black belt and bare fists |
| `hero-ranger` | An archer in a brown feathered cap and a green cloak, holding a longbow |

## Monsters (`img/foe-*.png`, 512 px square)

| Name | Subject |
|---|---|
| `foe-slime` | A green slime blob with two big eyes |
| `foe-bat` | A purple bat with spread wings and red eyes |
| `foe-goblin` | A small green goblin with big ears and a wooden club |
| `foe-wolf` | A grey wolf, side view, snarling |
| `foe-skeleton` | A walking skeleton warrior |
| `foe-ghost` | A pale blue sheet ghost with dark eyes |
| `foe-imp` | A red horned imp with small bat wings, conjuring a fireball |
| `foe-ogre` | A hulking brown ogre with tusks and a loincloth |
| `foe-golem` | Boss, 768 px: a huge grey stone golem with glowing green eyes |
| `foe-wyrm` | Boss, 768 px: a big red dragon, wings half spread, breathing fire |

## Items (`img/item-*.png`, 256 px square)

| Name | Subject |
|---|---|
| `item-potion` | A small round red potion bottle with a cork |
| `item-chest` | A wooden treasure chest with gold bands |
| `item-magnet` | A red horseshoe magnet |

## Sound effects (`sfx/<name>.wav`, short, mono, 8-bit: pulse, triangle and noise)

| Name | Sound |
|---|---|
| `hit` | A small hit (under 60 ms, quiet, plays constantly) |
| `crit` | A sharper critical hit |
| `kill` | A tiny monster pop |
| `hurt` | The party is hit |
| `gem` | Picking up an XP gem: a short high blip (the code shifts the pitch for streaks) |
| `levelup` | A short rising level-up arpeggio |
| `join` | A new hero joins the party: a bright 1 s jingle |
| `potion` | Drinking a potion |
| `chest` | Opening a chest |
| `slash` | A sword swish |
| `whirl` | A spinning blade |
| `fire` | A fireball launch |
| `blast` | A fireball burst |
| `thunder` | A lightning crack |
| `ice` | Ice shards |
| `holy` | A soft holy chime (plays often, keep it subtle) |
| `cure` | A healing sparkle |
| `pillar` | A beam of light from the sky |
| `dagger` | A thrown knife |
| `fist` | A punch |
| `quake` | A ground-shaking thump |
| `arrow` | A bow twang |
| `rain` | Arrows raining down |
| `foeShot` | A monster spits a fireball |
| `boss` | A boss appears: an ominous 1.2 s sting |
| `elite` | A strong monster appears: a short warning |
| `win` | Victory: a 2 s fanfare (original, not resembling any game's well-known victory theme) |
| `lose` | The party falls: a sad 1.5 s jingle |
| `select` | Choosing a card |

The music is composed and synthesized in code, so no music is needed.
