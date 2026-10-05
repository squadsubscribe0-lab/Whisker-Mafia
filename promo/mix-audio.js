// Rebuilds the game's sound track from the logged Sfx.play events.
// usage: node mix-audio.js frames/sfx.json ../sfx mix.f32 19.6   (then ffmpeg -f f32le -ar 48000 -ac 2 -i mix.f32 ...)
const { execFileSync } = require('child_process'); const fs = require('fs');
const [log, SFX, OUTRAW, DUR] = [JSON.parse(fs.readFileSync(process.argv[2])), process.argv[3], process.argv[4], +process.argv[5]];
const SR = 48000, out = new Float32Array(Math.ceil(DUR * SR) * 2), cache = {};
const load = k => cache[k] || (cache[k] = (() => { const b = execFileSync('ffmpeg', ['-loglevel', 'error', '-i', `${SFX}/${k}.mp3`, '-f', 'f32le', '-ac', '2', '-ar', SR, '-'], { maxBuffer: 1 << 28 }); return new Float32Array(b.buffer, b.byteOffset, b.length / 4); })());
let seed = 3; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const flame = (() => { const n = Math.round(.26 * SR), a = new Float32Array(n * 2); let y1 = 0, y2 = 0, x1 = 0, x2 = 0;
  const w = 2 * Math.PI * 900 / SR, al = Math.sin(w) / (2 * .7), b0 = al, a0 = 1 + al, a1 = -2 * Math.cos(w), a2 = 1 - al;   // bandpass 900Hz Q .7
  for (let i = 0; i < n; i++) { const x = Math.random() * 2 - 1, y = (b0 * x - b0 * x2 - a1 * y1 - a2 * y2) / a0; x2 = x1; x1 = x; y2 = y1; y1 = y; const g = .18 * Math.pow(.001 / .18, i / (.25 * SR)); a[2 * i] = a[2 * i + 1] = y * Math.max(0, g); }
  return a; })();
const ends = [];
for (const e of log) {
  if (e.t < 0 || e.t >= DUR) continue;
  const src = e.k === 'flame' ? flame : load(e.k), g = e.k === 'flame' ? 1 : e.g;
  const rate = e.k === 'flame' ? 1 : e.rate * (.97 + rnd() * .06), len = src.length / 2 / rate;
  for (let i = ends.length - 1; i >= 0; i--) if (ends[i] <= e.t) ends.splice(i, 1);
  if (ends.length > 16) continue; ends.push(e.t + len / SR);
  const s0 = Math.round(e.t * SR);
  for (let i = 0; i < len && s0 + i < out.length / 2; i++) {
    const p = i * rate, j = p | 0, f = p - j, j2 = Math.min(j + 1, src.length / 2 - 1);
    for (let c = 0; c < 2; c++) out[2 * (s0 + i) + c] += .3 * g * (src[2 * j + c] * (1 - f) + src[2 * j2 + c] * f);
  }
}
let pk = 0; for (const v of out) pk = Math.max(pk, Math.abs(v)); console.log('peak', pk.toFixed(3));
fs.writeFileSync(OUTRAW, Buffer.from(out.buffer));
