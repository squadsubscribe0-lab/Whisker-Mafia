// Deterministic frame-by-frame capture of Whisker Mafia gameplay.
// Serve the repo root on :8765 (python3 -m http.server 8765), then: N=18 RK=7,10 FIGHT=14.5 node capture.js frames
// usage: node rec.js <outdir|-> [seed]   ("-" = dry run, no screenshots, prints timeline)
const { chromium } = require('playwright');
const fs = require('fs');
const OUT = process.argv[2] || '-', DRY = OUT === '-', SEED = +(process.argv[3] || 7);
const FPS = 30, DT = 1000 / FPS;
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--disable-gpu-vsync'] });
  const p = await b.newPage({ viewport: { width: 720, height: 1280 }, deviceScaleFactor: +(process.env.DSF || 3), hasTouch: false });
  p.on('pageerror', e => console.log('ERR', e.message));
  await p.route('**/sdk.crazygames.com/**', r => r.fulfill({ body: '', contentType: 'text/javascript' }));
  await p.addInitScript(seed => {
    // seeded RNG
    let s = seed >>> 0; Math.random = () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; };
    // virtual clock
    let vt = 0; const base = Date.now();
    performance.now = () => vt; Date.now = () => base + vt;
    let raf = [], tid = 1; const timers = new Map();
    window.requestAnimationFrame = cb => { raf.push(cb); return raf.length; };
    window.cancelAnimationFrame = () => {};
    window.setTimeout = (fn, ms, ...a) => { const id = tid++; timers.set(id, { at: vt + (+ms || 0), fn, a }); return id; };
    window.setInterval = (fn, ms, ...a) => { const id = tid++; timers.set(id, { at: vt + (+ms || 0), fn, a, every: Math.max(1, +ms || 0) }); return id; };
    window.clearTimeout = window.clearInterval = id => timers.delete(id);
    const animT = new WeakMap();
    window.__step = async dt => {
      vt += dt;
      for (;;) {
        let best = null, bid = 0; for (const [id, t] of timers) if (t.at <= vt && (!best || t.at < best.at)) { best = t; bid = id; }
        if (!best) break;
        if (best.every) best.at += best.every; else timers.delete(bid);
        try { typeof best.fn === 'function' ? best.fn(...best.a) : eval(best.fn); } catch (e) { console.error(e); }
        await 0;
      }
      await new Promise(r => queueMicrotask(r));
      const q = raf; raf = []; q.forEach(cb => { try { cb(vt); } catch (e) { console.error(e); } });
      for (const an of document.getAnimations()) {
        if (!animT.has(an)) { animT.set(an, true); an.pause(); an.currentTime = 0; }
        else { an.pause(); an.currentTime = (an.currentTime || 0) + dt; }
        try { const e = an.effect.getComputedTiming(); if (e.endTime !== Infinity && an.currentTime >= e.endTime && an.playState !== 'finished') an.finish(); } catch (e) {}
      }
    };
    const s0 = { coins: 5400, gems: 320, energy: 30, eTime: Date.now(), bolts: 400, stage: 14, sel: 14, tutDone: true, tut: 9, runs: 20, merges: 150, v: 3,
      truck: { cannon: 3, saw: 3, medkit: 2, armor: 3 }, truckSel: 'rust', trucks: ['rust'], squad: { sel: 'ginger', lv: { rookie: 3, ginger: 3 }, shards: {} },
      seenRW: ['knife','bat','pistol','tommy','shotgun','grenade','mgun','laser','bazooka','sniper','minigun','flame','cane'],
      seenFeat: ['vehicle','gear','patrol','loot','starter','shop','tasks','energy','gems','deal','gang','files','speed','fund','pass','bounty','dungeon'], savedAt: Date.now() };
    localStorage.setItem('whiskermafia_v2', JSON.stringify(s0));
  }, SEED);
  await p.goto('http://localhost:8765/index.html');
  // cursor overlay
  let T0 = 0, frame = 0, cur = { x: 600, y: 1350, down: false };
  const step = () => p.evaluate(dt => window.__step(dt), DT);
  for (let i = 0; i < 90; i++) await step();   // let the menu / fonts settle
  await p.evaluate(() => { const d = document.createElement('div'); d.id = 'vcur'; d.innerHTML = COACH_HAND;
    d.style.cssText = 'position:fixed;left:0;top:0;width:96px;height:96px;z-index:99999;pointer-events:none;filter:drop-shadow(0 6px 6px rgba(0,0,0,.35));transform-origin:34% 9%';
    document.body.appendChild(d); });
  const shot = async () => {
    await p.evaluate(c => { const d = document.getElementById('vcur'); d.style.transform = `translate(${c.x - 33}px,${c.y - 9}px) scale(${c.down ? .86 : 1})`; }, cur);
    if (frame === 0) T0 = await p.evaluate(() => performance.now());
    if (!DRY) await p.screenshot({ path: `${OUT}/f${String(frame).padStart(4, '0')}.jpg`, type: 'jpeg', quality: 95 });
    frame++;
  };
  const tick = async () => { await step(); await shot(); };
  const wait = async n => { for (let i = 0; i < n; i++) await tick(); };
  const ease = t => t < .5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
  const moveTo = async (x, y, n) => { const x0 = cur.x, y0 = cur.y; for (let i = 1; i <= n; i++) { const k = ease(i / n); cur.x = x0 + (x - x0) * k; cur.y = y0 + (y - y0) * k; if (cur.down) await p.mouse.move(cur.x, cur.y); await tick(); } };
  const down = async () => { await p.mouse.move(cur.x, cur.y); await p.mouse.down(); cur.down = true; };
  const up = async () => { await p.mouse.up(); cur.down = false; };
  const tap = async (pt, n = 12) => { await moveTo(pt.x, pt.y, n); await down(); await wait(3); await up(); await wait(2); };
  const drag = async (a, bpt, n = 16) => { await moveTo(a.x, a.y, 12); await down(); await wait(3); await moveTo(bpt.x, bpt.y, n); await wait(2); await up(); await wait(2); };
  const ctr = sel => p.evaluate(s => { const e = document.querySelector(s); if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; }, sel);
  const cellPt = (c, r) => p.evaluate(([c, r]) => { const g = document.querySelector('#grid') || document.querySelector('.grid'); return null; }, [c, r]);

  await p.evaluate(() => {
    resizeCanvas = function () { RK = SC * (window.devicePixelRatio || 1) || 1; cv.width = Math.round(W * RK); cv.height = Math.round(WH * RK); };
    makeBg = function (ri) { const c = document.createElement('canvas'); c.width = W * 3; c.height = WH * 3; const g = c.getContext('2d'); g.scale(3, 3); drawBattleBg(g, ri); bgCanvas = c; bgRegion = ri; };
  });
  // log every sound the game plays (virtual ms) so the audio track can be rebuilt offline
  await p.evaluate(() => {
    window.__sfx = []; const orig = Sfx.play;
    Sfx.play = function (k, vol, rate) {
      if (!this.muted()) { const cfg = this.CFG[k], now = performance.now();
        if (now - (this.last[k] || 0) >= (cfg ? cfg[0] : 45)) __sfx.push({ k, t: now, rate: rate || 1, g: (cfg ? cfg[1] : .6) * (vol == null ? 1 : vol), file: !!this.buf[k] }); }
      return orig.call(this, k, vol, rate);
    };
  });
  // ---- start a run with a built-up board ----
  await p.evaluate(async () => { await startRun('normal'); });
  await p.evaluate(() => {
    for (let c = 0; c < 5; c++) for (let r = 0; r < 7; r++) R.unlocked.add(key(c, r));
    R.wave = 10; R.cash = 140; R.rockets = 5;
    const add = (type, lvl, c, r) => { const it = { id: R.nid++, type, lvl, c, r }; R.items.push(it); return it.id; };
    window.__ids = {
      catA: add('cat', 4, 2, 1), catB: add('cat', 3, 2, 4),
      mgun: add('mgun', 3, 0, 1), baz: add('bazooka', 2, 3, 1), laser: add('laser', 2, 1, 2), tommy: add('tommy', 3, 3, 2),
      nade: add('grenade', 3, 2, 0), pistol: add('pistol', 3, 2, 3), shotgun: add('shotgun', 3, 0, 4), bat: add('bat', 3, 3, 4),
      knife: add('knife', 4, 2, 6), nade2: add('grenade', 2, 1, 5)
    };
    R.hand = [{ id: R.nid++, type: 'bazooka', lvl: 2 }, { id: R.nid++, type: 'laser', lvl: 2 }, { id: R.nid++, type: 'mgun', lvl: 3 }, null];
    renderBag(); layoutGame();
  });
  const LOG = async tag => { if (!DRY) return; const s = await p.evaluate(() => R ? `${R.phase} wave=${R.wave} rats=${B.rats.length} q=${B.spawnQ.length} cats=${B.cats.length} hp=${Math.round(R.truckHp)}/${R.truckMax} boss=${B.rats.some(r=>r.boss)}` : 'noR'); console.log(`${(frame / FPS).toFixed(1)}s ${tag || ''} ${s}`); };
  const itemPt = id => ctr(`#grid [data-id="${id}"]`);
  const hand = i => ctr(`#hs${i} .item`);
  await wait(8);
  const ids = await p.evaluate(() => window.__ids);
  await drag(await hand(0), await itemPt(ids.baz));
  await drag(await hand(1), await itemPt(ids.laser));
  await drag(await hand(2), await itemPt(ids.mgun));
  await wait(6);
  await tap(await ctr('#fightB'), 14);
  await p.evaluate(([st, wv, N]) => { B.loaders.forEach((l, i) => l.t = l.dur * .8 - i * .12); const q = buildWave(st, wv).filter(x => !x.boss).slice(0, +N); q.splice(7, 0, { type: 'boss', s: stageScale(st) }); B.spawnQ = q; B.total = B.spawnQ.length; }, [+(process.env.WST || 6), 10, process.env.N || 20]);
  await moveTo(780, 1100, 14);   // cursor leaves the screen
  await LOG('fight');
  const T = +(process.env.FIGHT || 15) * FPS, rk = await ctr('#rocketB');
  const rockets = (process.env.RK || '').split(',').filter(Boolean).map(Number);
  let i = 0;
  const run = async n => { for (let k = 0; k < n; k++, i++) { await tick(); if (i % 30 === 0) await LOG(); } };
  for (const at of rockets) { await run(at * FPS - 14 - i); await moveTo(rk.x, rk.y, 14); await down(); await wait(3); await up(); await LOG('rocket'); await moveTo(780, rk.y + 120, 12); i += 29; }
  await run(T - i);
  const log = await p.evaluate(() => __sfx);
  fs.writeFileSync((DRY ? '.' : OUT) + '/sfx.json', JSON.stringify(log.map(e => ({ ...e, t: (e.t - T0) / 1000 }))));
  console.log('sounds', log.length, 'frames', frame);
  await b.close();
})();
