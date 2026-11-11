# Hoard: asset spec

**Style.** Storybook fantasy at night sliding into a red dawn: a cheeky young dragon on a gold pile in a cave mouth,
kobold minions scurrying out along dirt roads to cosy villages, and tin-can knights marching up the meadow to take the gold
back. Chunky shapes, soft cel shading, a thick dark outline (#1b1411), readable at 40-90 px on a phone. Palette: night
meadow greens (#2b5135, #3c6e47), road brown (#8a6f4d), warm gold (#ffd166, #ffe066, #c9871a), knight steel (#ced4da,
#868e96) with red plumes (#e63946), holy light (#fff3b0), cave rock (#6b5d52, #2a221d). Cute, not grim: no gore, no
realistic blood, no text or letters, no UI frames, no drop shadows baked under the feet (the code draws them), no busy
backgrounds behind sprites (plain flat backdrop or transparent). Sprites are 3/4 view; marching knights face the
viewer/downwards (they walk down the screen toward the cave); raiders face RIGHT (the code flips them).

## Images (24)

| name | kind | subject | priority |
|---|---|---|---|
| hero-ember | hero | Bust of a young red dragon (#d62828 scales, golden belly, cream curved horns), smug grin, a curl of flame at the lips, warm glow behind | 1 |
| hero-rime | hero | Bust of a young frost dragon, pale sky-blue scales, three icicle crest spikes, frosty breath, calm haughty eyes | 1 |
| hero-moss | hero | Bust of a young forest dragon, leaf-green scales, leafy frills instead of horns, a flower tucked by one ear, friendly | 1 |
| hero-volt | hero | Bust of a young storm dragon, violet scales, yellow lightning-bolt horns, sparks crackling round the jaw, wild grin | 1 |
| boss-paladin | boss | The Paladin Champion: towering knight in gleaming gold-and-white plate, blue cape, huge greatsword raised, faint halo of holy light, facing the viewer | 1 |
| enemy-knight | enemy | Small stubby foot knight in grey plate with a red plume and a little blue shield, marching toward the viewer, comically determined | 1 |
| enemy-lancer | enemy | Knight on a small brown horse charging forward with a long lance, red pennant, 3/4 view facing down-right | 1 |
| enemy-shield | enemy | Stocky shieldbearer knight hiding behind a huge tower shield with a red cross, orange plume, facing the viewer | 1 |
| enemy-priest | enemy | Knight-priest in white robes with a green stole and a little golden halo, hands raised in a healing glow, facing the viewer | 2 |
| enemy-captain | enemy | Knight captain: bigger, shinier plate, tall cyan plume, a gem set in his breastplate, sword raised, facing the viewer | 1 |
| enemy-acolyte | enemy | Kneeling robed acolyte in white and gold, hooded, holding a glowing candle, a thin halo above, facing the viewer | 2 |
| enemy-slayer | enemy | Dragonslayer: grim elite knight in blackened plate with a dark-red cloak and plume, aiming a big crossbow, a dragon-tooth necklace, facing the viewer | 1 |
| unit-kobold | unit | Scrawny orange-brown kobold (small lizard minion) running RIGHT with a sack over its shoulder, big yellow eyes, gleeful | 1 |
| unit-thief | unit | Kobold thief in a dark purple hood and mask, sprinting RIGHT on tiptoes with a dagger, sly grin | 2 |
| unit-sapper | unit | Kobold sapper in a yellow mining helmet, carrying a round black bomb with a lit fuse, running RIGHT | 2 |
| unit-wagon | unit | Small wooden loot wagon pulled by a stubby ox, facing RIGHT, a heap of gold coins in the back | 2 |
| obj-caravan | object | Treasure caravan: a horse pulling a covered wagon with a canvas canopy and an open chest spilling gold, facing RIGHT | 1 |
| obj-trebuchet | object | Wooden siege trebuchet on wheels, arm cocked back with a boulder in the sling, side view facing RIGHT | 2 |
| obj-farm | object | Tiny farmstead: one thatched cottage, a hay bale and striped crop rows, lit window, seen from slightly above | 2 |
| obj-hamlet | object | Little hamlet of three cottages with red, blue and tan roofs, a chimney puffing smoke, lit windows, seen from slightly above | 2 |
| obj-mill | object | Village watermill/windmill with sails, a sack pile and two cottages, seen from slightly above | 2 |
| obj-town | object | Small walled market town, four tall houses with coloured roofs and a bell tower, lit windows, seen from slightly above | 2 |
| obj-castle | object | Stone castle with two towers and a central keep, red banner, glowing windows, portcullis, front view | 2 |
| bg-meadow | background | 780x1688 portrait: top 18% a starry night sky over dark rolling hills; middle 44% a calm, low-contrast moonlit meadow (no props, gameplay goes here); bottom 38% the dark rocky mouth of a dragon's cave with a faint warm glow deep inside | 1 |

## Sounds (14)

| name | what it sounds like | length (s) |
|---|---|---|
| coin | a single bright gold coin clink, landing on a pile | 0.15 |
| pop | a soft cartoon "plip", a kobold scurrying off / a knight popping in a puff | 0.12 |
| crack | fireball impact: a short crackling whump of flame | 0.3 |
| boom | a heavy boulder crashing into a stone wall, rubble | 0.6 |
| hit | a small metal sword clank on stone (knight bashing the wall) | 0.12 |
| buy | a cheerful purse jingle, two coins and a little chime | 0.3 |
| nope | a dull wooden thunk, "can't do that" | 0.15 |
| ding | a crystal gem sparkle chime | 0.35 |
| win | a burst of a coin shower, chest bursting open | 0.8 |
| breath | a young dragon's short fire whoosh, rising | 0.35 |
| roar | a young dragon's proud roar with a wing flap, not scary | 0.8 |
| horn | a distant war horn blast, siege at dawn | 0.8 |
| ward | a shimmering holy choir chord / bell, a magical ward rising | 0.7 |
| clang | a bright shield block: metal "tonk" with ring | 0.25 |
| music-loop | (optional) 30 s seamless loop: quiet plucked lute and low cello drone, mischievous night mood, sparse | 30 |
