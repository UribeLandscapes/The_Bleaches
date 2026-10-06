'use strict';
// Browser smoke test: drives the real page in headless Chromium, walks the
// menus with the keyboard, then shows every bankai in a CPU-vs-CPU fight and
// saves screenshots. Fails on any console or page error.
//   NODE_PATH=$(npm root -g) node tests/smoke.js [outDir]
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const outDir = process.argv[2] || path.join(__dirname, '..', 'screenshots');
fs.mkdirSync(outDir, { recursive: true });

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error' && !/fonts\.(googleapis|gstatic)/.test(m.text())) errors.push('console: ' + m.text()); });
  await page.goto('file://' + path.join(__dirname, '..', 'index.html'));
  await page.waitForTimeout(500);
  const shot = name => page.screenshot({ path: path.join(outDir, name + '.png') });

  await shot('01-title');
  await page.keyboard.press('Enter');            // VS CPU
  await page.waitForTimeout(200);
  await shot('02-select');
  await page.keyboard.press('Enter');            // P1 picks Ichigo
  await page.keyboard.press('ArrowRight');       // CPU cursor to Byakuya
  await page.keyboard.press('Enter');
  await page.waitForTimeout(300);
  const screen = await page.evaluate(() => window.game.screen);
  if (screen !== 'fight') throw new Error('menus did not reach a fight: ' + screen);

  // Play a little with real key presses: walk in and attack.
  await page.waitForTimeout(1800);
  await page.keyboard.down('KeyD');
  await page.waitForTimeout(600);
  await page.keyboard.up('KeyD');
  for (let i = 0; i < 4; i++) { await page.keyboard.press('KeyF'); await page.waitForTimeout(80); }
  await shot('03-fight');

  // Release P1's bankai with T (retrying until P1 is free to act) and catch the cinematic.
  await page.evaluate(() => { window.game.world.fighters[0].reiatsu = 100; });
  for (let i = 0; i < 20 && !(await page.evaluate(() => !!window.game.world.release)); i++) {
    await page.keyboard.press('KeyT');
    await page.waitForTimeout(60);
  }
  await page.waitForTimeout(400);
  await shot('04-release');

  // Every character: a CPU-vs-CPU fight with P1's bankai forced on.
  const ids = await page.evaluate(() => CHARACTERS.map(c => c.id));
  for (let i = 0; i < ids.length; i++) {
    await page.evaluate(i => {
      const g = window.game;
      g.mode = 'cpu';
      g.picks = [i, (i + 5) % CHARACTERS.length];
      startFight();
      const w = g.world;
      w.phase = 'fight';
      g.controllers[0] = new CpuController(w, w.fighters[0]);
      w.fighters[0].reiatsu = 100;
      w.release = { f: w.fighters[0], t: 0 };
      w.finishRelease();
      w.fighters[0].cd.special = 0;
    }, i);
    await page.waitForTimeout(2600);
    await shot(String(10 + i).padStart(2, '0') + '-' + ids[i]);
  }

  await page.keyboard.press('Escape');
  await page.waitForTimeout(100);
  await shot('40-pause');
  await browser.close();
  if (errors.length) { console.error(errors.join('\n')); process.exit(1); }
  console.log('smoke ok:', ids.length, 'characters, screenshots in', outDir);
})().catch(e => { console.error(e); process.exit(1); });
