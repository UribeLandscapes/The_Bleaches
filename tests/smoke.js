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

  // Xbox controller: a fake standard-mapping gamepad drives menus and the fight.
  await page.close();
  const pad = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  pad.on('pageerror', e => errors.push('pageerror (pad): ' + e.message));
  await pad.addInitScript(() => {
    const gp = { index: 0, id: 'Xbox Wireless Controller (STANDARD GAMEPAD)', connected: true, mapping: 'standard', axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })) };
    window.__pad = gp;
    Object.defineProperty(navigator, 'getGamepads', { value: () => [gp] });
  });
  await pad.goto('file://' + path.join(__dirname, '..', 'index.html'));
  await pad.waitForTimeout(500);
  const btn = (i, on) => pad.evaluate(([i, on]) => { __pad.buttons[i].pressed = on; __pad.buttons[i].value = on ? 1 : 0; }, [i, on]);
  const tap = async i => { await btn(i, true); await pad.waitForTimeout(80); await btn(i, false); await pad.waitForTimeout(80); };
  const g = expr => pad.evaluate(expr);
  const expect = (cond, msg) => { if (!cond) throw new Error('controller: ' + msg); };
  await tap(0);                                   // A: VS CPU
  expect(await g(() => window.game.screen) === 'select', 'A did not open character select');
  await tap(0);                                   // A: pick Ichigo
  await tap(15);                                  // D-pad right: CPU picks the next fighter
  await tap(0);                                   // A: confirm
  expect(await g(() => window.game.screen) === 'fight', 'did not reach the fight');
  await pad.evaluate(() => { window.game.controllers[1] = { intent: () => emptyIntent() }; }); // a still opponent: this checks the controller, not the fight
  await pad.waitForFunction(() => window.game.world.phase === 'fight', null, { timeout: 15000 }); // headless 3D can run slower than real time
  const x0 = await g(() => window.game.world.fighters[0].x);
  await pad.evaluate(() => { __pad.axes[0] = 1; });
  await pad.waitForFunction(x0 => window.game.world.fighters[0].x > x0 + 30, x0, { timeout: 5000 }).catch(() => {});
  await pad.evaluate(() => { __pad.axes[0] = 0; });
  expect(await g(() => window.game.world.fighters[0].x) > x0 + 30, 'left stick did not move the fighter');
  let attacked = false;
  for (let i = 0; i < 15 && !attacked; i++) { // X is ignored while P1 is reeling from a hit, so retry like a player would
    await btn(2, true);
    attacked = await pad.waitForFunction(() => window.game.world.fighters[0].state === 'attack', null, { timeout: 400 }).then(() => true, () => false);
    await btn(2, false);
    await pad.waitForTimeout(80);
  }
  expect(attacked, 'X did not attack');
  await pad.waitForTimeout(400);
  await pad.evaluate(() => { window.game.world.fighters[0].reiatsu = 100; });
  for (let i = 0; i < 20 && !(await g(() => !!window.game.world.release || window.game.world.fighters[0].bankai)); i++) await tap(7); // RT: bankai
  expect(await g(() => !!window.game.world.release || window.game.world.fighters[0].bankai), 'RT did not release bankai');
  await pad.waitForTimeout(1800);
  await pad.screenshot({ path: path.join(outDir, '41-controller-hud.png') });
  await tap(9);                                   // Menu: pause
  expect(await g(() => window.game.screen) === 'pause', 'Menu did not pause');
  await pad.close();

  // A page refused controller access (as embedded views can be) must keep working on the keyboard.
  const blocked = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  blocked.on('pageerror', e => errors.push('pageerror (blocked): ' + e.message));
  await blocked.addInitScript(() => {
    Object.defineProperty(navigator, 'getGamepads', { value: () => { throw new DOMException('gamepad is disallowed by permissions policy', 'SecurityError'); } });
  });
  await blocked.goto('file://' + path.join(__dirname, '..', 'index.html'));
  await blocked.waitForTimeout(500);
  await blocked.keyboard.press('Enter');
  await blocked.waitForTimeout(200);
  expect(await blocked.evaluate(() => padsBlocked && window.game.screen === 'select'), 'blocked controllers broke the game');
  await browser.close();
  if (errors.length) { console.error(errors.join('\n')); process.exit(1); }
  console.log('smoke ok:', ids.length, 'characters, screenshots in', outDir);
})().catch(e => { console.error(e); process.exit(1); });
