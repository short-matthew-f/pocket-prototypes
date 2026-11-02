# Pocket Prototypes

Six phone game MVPs to feel the loop of each idea. Vector art only. Site: GitHub Pages (`/<game>/`).

## Kit contract (`kit/kit.js` + `kit/kit.css`)
Each game is `<game>/index.html` (loads Google Fonts Lilita One + Nunito, `../kit/kit.css`, `../kit/kit.js`, then `game.js`)
and `game.js`, which calls `Kit.game(config)`:

- `id, title, tagline, howTo, runVerb` (button label, e.g. "Dig!"), `winTitle, loseTitle`
- `colors: {accent, bg, card}`
- `currencies: [{id, name, color}]`, first = main currency
- `characters: [{id, name, blurb, unlock (wins needed: 0,1,2,3), icon}]`, `drawFace(ctx, who, x, y, r)` optional
- `nodes: [{id, name, desc, icon (emoji), cost, grow, max, req: [ids], reqAll?, x, y (grid; y up negative), cur?, who?, win?, extra?: {cur: n}, fx(stats, level)}]`
  - exactly one `win: true` node: buying it makes the next run a boss run (`env.boss`); winning resets it and unlocks the next character
- `baseStats(who)` -> plain object the nodes' `fx` mutate
- `createRun(env)` -> run object. `env = {who, stats, levels, W, H, boss, sfx, fx, fmt, ui, runNo}`
  - run: `update(dt, input)`, `draw(ctx)` (kit set the DPR transform; draw in CSS px), `over` (bool), `t` (seconds), `result()` -> `{earned: {cur: n}, won, title?, lines: [str]}`
  - `input = {x, y, down, taps: [{x, y}] (this frame), released}`
  - `env.ui` is a DOM layer over the canvas (bottom-anchored) for in-run buttons; `env.sfx` has pop/crack/hit/zap/boom/ding/coin/... ; `env.fx` = particles/floaters/rings + `shake`
- options: `touchOffset` (px the touch point is lifted above the finger), `hoverIsDown` (desktop mouse hover counts as pressing)
- `?dev` in the URL adds a "+lots" currency button on the tree screen.

Balance target: runs start ~8-15 s and grow to ~45-60 s; a first win in ~25-40 runs (~15-25 min); each character replays the tree.
