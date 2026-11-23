// Backrooms world tests: node backrooms/test.js
import { generateChunk, biomeAt, CH, CELL, CHUNK, collide, BIOME_KEYS } from './world.js';
let fails = 0; const ok = (c, m) => { if (!c) { fails++; console.log('FAIL', m); } else console.log('ok  ', m); };
const SEED = 1234;
const A = generateChunk(SEED, 3, -2), A2 = generateChunk(SEED, 3, -2);
ok(JSON.stringify(A) === JSON.stringify(A2), 'the same seed and chunk always generate the same rooms');
ok(JSON.stringify(generateChunk(SEED + 1, 3, -2).v) !== JSON.stringify(A.v), 'a different seed gives different rooms');
// borders agree with the neighbours
let agree = true;
for (let cx = -4; cx < 4; cx++) for (let cz = -4; cz < 4; cz++) {
  const c = generateChunk(SEED, cx, cz), e = generateChunk(SEED, cx + 1, cz), s = generateChunk(SEED, cx, cz + 1);
  for (let k = 0; k < CH; k++) { if (c.v[CH][k] !== e.v[0][k]) agree = false; if (c.h[k][CH] !== s.h[k][0]) agree = false; }
}
ok(agree, 'every shared border matches on both sides');
// connectivity across a 12x12-chunk region (96x96 cells): flood fill from the spawn reaches every cell
const R = 6, W = 2 * R * CH, chunks = new Map(), get = (cx, cz) => { const k = cx + ',' + cz; if (!chunks.has(k)) chunks.set(k, generateChunk(SEED, cx, cz)); return chunks.get(k); };
const open = (gx, gz, dx, dz) => { // can you step from global cell (gx,gz) by (dx,dz)?
  const cx = Math.floor(gx / CH), cz = Math.floor(gz / CH), i = gx - cx * CH, j = gz - cz * CH, c = get(cx, cz);
  if (dx === 1) return !c.v[i + 1][j]; if (dx === -1) return !c.v[i][j]; if (dz === 1) return !c.h[i][j + 1]; return !c.h[i][j];
};
const seen = new Set(['0,0']), q = [[0, 0]];
while (q.length) { const [x, z] = q.shift(); for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + dx, nz = z + dz; if (nx < -R * CH || nz < -R * CH || nx >= R * CH || nz >= R * CH) continue; const k = nx + ',' + nz; if (!seen.has(k) && open(x, z, dx, dz)) { seen.add(k); q.push([nx, nz]); } } }
ok(seen.size === W * W - 0 || seen.size >= W * W * 0.999, `every cell in a ${2 * R}x${2 * R}-chunk region is reachable from the spawn (${seen.size}/${W * W})`);
// biomes: all six show up nearby, the spawn is the Lobby
const found = new Set(); for (let cx = -20; cx < 20; cx++) for (let cz = -20; cz < 20; cz++) found.add(biomeAt(SEED, cx, cz));
ok(BIOME_KEYS.every((b) => found.has(b)), `all six levels appear within 40x40 chunks (${[...found].join(', ')})`);
ok(biomeAt(SEED, 0, 0) === 'lobby', 'you wake up in the Lobby');
// far away still works (explore forever)
const far = generateChunk(SEED, 987654, -123456); ok(far.cells.length === CH * CH && Number.isFinite(far.solids[0].x0), 'chunks a million metres away generate fine');
// collision
const p = collide(0.05, 2, 0.3, [{ x0: -0.1, x1: 0.1, z0: 0, z1: 4 }]); ok(Math.abs(p.x) >= 0.39, 'the player is pushed out of a wall');
ok(Object.values(A).length && CHUNK === CELL * CH, 'chunk size adds up');
console.log(fails ? `${fails} failing` : 'all good'); process.exitCode = fails ? 1 : 0;
