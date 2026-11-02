// Dev helper: open a URL in headless Chrome over the DevTools protocol, wait
// for document.body.dataset.ready (or a timeout), print console errors, save a
// screenshot. Optional JS steps run in the page before the shot.
// Usage: node tools/chrome_shot.mjs <url> <out.png> [width] [height] [jsBeforeShot]
import { spawn } from 'node:child_process';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const [url, out, W = '1100', H = '2400', js = ''] = process.argv.slice(2);
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const port = 9300 + Math.floor(Math.random() * 500);
const prof = mkdtempSync(join(tmpdir(), 'cps-'));
const proc = spawn(CHROME, ['--headless=new', '--disable-gpu', '--hide-scrollbars', `--remote-debugging-port=${port}`, `--user-data-dir=${prof}`, `--window-size=${W},${H}`, 'about:blank'], { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let target;
for (let i = 0; i < 50 && !target; i++) { await sleep(200); try { target = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find(t => t.type === 'page'); } catch {} }
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise(r => ws.addEventListener('open', r));
let id = 0; const pending = {};
const errors = [];
ws.addEventListener('message', ev => {
  const m = JSON.parse(ev.data);
  if (m.id && pending[m.id]) { pending[m.id](m); delete pending[m.id]; }
  if (m.method === 'Runtime.consoleAPICalled' && ['error', 'warning'].includes(m.params.type)) errors.push(m.params.args.map(a => a.value || a.description).join(' '));
  if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
});
const send = (method, params = {}) => new Promise(r => { const i = ++id; pending[i] = r; ws.send(JSON.stringify({ id: i, method, params })); });
await send('Runtime.enable'); await send('Page.enable');
if (process.env.LIGHT) await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'light' }] });
await send('Emulation.setDeviceMetricsOverride', { width: +W, height: +H, deviceScaleFactor: 1, mobile: +W < 500 });
if (process.env.PRE) await send('Page.addScriptToEvaluateOnNewDocument', { source: process.env.PRE }); // e.g. seed localStorage
await send('Page.navigate', { url });
for (let i = 0; i < 60; i++) { await sleep(150); const r = await send('Runtime.evaluate', { expression: 'document.body && document.body.dataset.ready', returnByValue: true }); if (r.result?.result?.value) break; }
if (js) { const r = await send('Runtime.evaluate', { expression: `(async () => { ${js} })()`, awaitPromise: true, returnByValue: true }); if (r.result?.exceptionDetails) errors.push('step: ' + r.result.exceptionDetails.exception?.description); else if (r.result?.result?.value !== undefined) console.log('step ->', JSON.stringify(r.result.result.value)); }
await sleep(+(process.env.WAIT || 300)); // WAIT=ms lets a run play out before the shot
const shot = await send('Page.captureScreenshot', { format: 'png' });
writeFileSync(out, Buffer.from(shot.result.data, 'base64'));
console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'no console errors');
ws.close(); proc.kill();
process.exit(0);
