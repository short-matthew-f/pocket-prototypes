# Delve Deck: asset spec

**Style.** A torch-lit mine-dungeon in a chunky, painted storybook style (think a warm board-game illustration, not
photo-real): bold readable silhouettes, soft rim light from an orange torch, deep purple-black shadows. Everything has to
read at ~110 px tall on a phone, so big shapes, few tiny details, clear faces/eyes. Palette: night purple #15111c and
#271f30 (shadows, backgrounds), torch orange #ffb35c, gold #ffd166, copper ore #f4a261, crystal violet #b388eb, magic
cyan #7df9ff, danger red #e76f51 / #ff4d6d, moss green #7cb66a. Avoid: any text or letters, UI frames or borders, gore,
photo realism, busy cast shadows, ground planes or scenery behind sprites (sprites must be cut-out objects on a plain
backdrop). Monsters and the King stand on the right of the screen and **face LEFT** toward the hero; show the whole
body, feet at the bottom of the image. Backgrounds keep the middle band calm and dark so cards and numbers read on top.

## Images (24)
| name | kind | subject | priority |
|---|---|---|---|
| hero-fighter | hero bust | A young dwarf-ish fighter in a dented steel half-helm with a red plume, blue tabard, sword hilt over the shoulder, determined grin. | 1 |
| hero-miner | hero bust | A stocky miner with a yellow hard hat and lit headlamp, bushy brown beard, leather braces, pickaxe on the shoulder, ore dust on the cheeks. | 1 |
| hero-cleric | hero bust | A calm cleric in cream robes with a gold holy-symbol staff, faint golden halo ring above the head, kind but steely eyes. | 1 |
| hero-rogue | hero bust | A hooded rogue in charcoal leather, dark mask over the lower face, glinting teal eyes, a dagger held near the chin. | 1 |
| boss-king | boss | The Mountain King: a huge stone-skinned dwarf lord in a spiked gold crown, long grey beard, glowing orange eyes, holding a giant war hammer, cracks in his skin leaking faint cyan light; facing left. | 1 |
| mon-rat | monster | A fat brown cave rat with pink ears and tail, beady red eyes, crouched to pounce; facing left. | 1 |
| mon-bat | monster | A purple-grey gloom bat with ragged wings spread wide, red eyes, tiny fangs, mid-flap; facing left. | 1 |
| mon-slime | monster | A translucent green ooze blob with two dark eye dots and a few swallowed coins and bones floating inside. | 1 |
| mon-goblin | monster | A wiry green goblin digger with big pointed ears, yellow eyes, ragged brown vest, holding a rusty pick-axe; facing left. | 1 |
| mon-skel | monster | A rattling skeleton warrior with a cracked round shield and a notched short sword, dim blue eye-lights; facing left. | 1 |
| mon-orc | monster | A hulking moss-green orc brute with one tusk, red eye, crude iron cleaver raised; facing left. | 2 |
| mon-wraith | monster | A floating violet-black wraith with a tattered cloak trailing into wisps, two glowing cyan eyes, no legs; facing left. | 2 |
| mon-troll | monster | A grey-blue cave troll, hunched and massive, warty skin, yellow eyes, dragging a tree-trunk club; facing left. | 2 |
| mon-golem | monster | A blocky ore golem made of brown boulders studded with glowing copper-orange ore nuggets, yellow eye slits; facing left. | 2 |
| mon-lich | monster | A gaunt lich in purple robes with a small gold crown on a bare skull, cyan eye glow, a staff topped with a pale green orb; facing left. | 2 |
| obj-chest | prop | A sturdy wooden treasure chest with gold bands and a heavy lock, closed, front 3/4 view. | 1 |
| obj-vein | prop | A rough brown-grey rock outcrop, waist-high, cracked and chipped, with NO ore showing (the game paints the ore on top). | 1 |
| obj-campfire | prop | A small campfire of crossed logs ringed with stones, bright orange flames, a bedroll beside it. | 2 |
| obj-trader | prop | A hooded travelling trader in green, crouched beside a big backpack hung with lanterns, potions and pick heads; facing left. | 2 |
| obj-shrine | prop | An old carved stone shrine to a dwarf god, cyan light glowing from a rune in its niche, offering bowl at its base. | 2 |
| obj-runestone | prop | A tall cracked standing stone with a glowing violet rune, mist curling at its foot (used for mysterious events). | 3 |
| obj-reliquary | prop | A small stone altar holding a glowing copper urn with a gold lid, soft orange light spilling out. | 3 |
| obj-throne | prop | A towering throne of rough-cut dark rock and ore crystals, gold-veined, empty, front view, tall and narrow. | 2 |
| bg-mine | background | Looking down a deep mine gallery: timber shoring on the edges, rails vanishing into darkness, faint crystals in the walls, a warm torch glow at the left; the centre band is plain, dark and low-contrast. | 1 |

## Sounds (13)
| name | what it sounds like | length (s) |
|---|---|---|
| hit | Sword striking a creature: a meaty thwack with a short metal ring. | 0.15 |
| crack | A monster's blow landing on you: a blunt thud with a grunt-free crunch. | 0.15 |
| coin | A small handful of gold coins clinking into a pouch. | 0.3 |
| ding | A bright, warm bell chime (good thing happened). | 0.4 |
| boom | A rumbling cave-in: rocks crashing down, low and heavy. | 0.8 |
| buy | Coins slapped on a counter plus a pleased short chime. | 0.4 |
| nope | A dull wooden knock, "can't do that". | 0.15 |
| win | A triumphant short brass-and-bells fanfare. | 0.8 |
| pick | A pickaxe biting into rock: sharp metallic clink with gravel. | 0.15 |
| chest | A heavy wooden lid creaking open with a small sparkle. | 0.5 |
| ambush | Two deep war-drum hits with a guttural horn stab. | 0.8 |
| roar | The Mountain King's deep, rumbling roar with stone grinding under it. | 0.8 |
| step | Two quick boot steps on gravel (stepping into a room). | 0.25 |

| music-loop | quiet ambient mine loop: slow low drone, distant drips, faint far-off pick taps, a soft minor melody on a muted lute every few bars; seamless | 32 |
