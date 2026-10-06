'use strict';
// Menus, keyboard input and the main loop.

const canvas = document.getElementById('hud');   // 2D overlay: HUD, menus, text
const ctx = canvas.getContext('2d');
const view = new Scene3D(document.getElementById('scene'));
const portraits = makePortraits(CHARACTERS);

const KEYMAPS = [
  { left: 'KeyA', right: 'KeyD', jump: 'KeyW', guard: 'KeyS', light: 'KeyF', heavy: 'KeyG', special: 'KeyH', dash: 'KeyR', bankai: 'KeyT' },
  { left: 'ArrowLeft', right: 'ArrowRight', jump: 'ArrowUp', guard: 'ArrowDown', light: 'Comma', heavy: 'Period', special: 'Slash', dash: 'Semicolon', bankai: 'Quote' },
];
const KEY_LABELS = [
  'A/D move · W jump · S guard · F light · G heavy · H special · R dash · T bankai',
  "←/→ move · ↑ jump · ↓ guard · , light · . heavy · / special · ; dash · ' bankai",
];
const GAME_KEYS = new Set([...KEYMAPS.flatMap(m => Object.values(m)), 'Space', 'Enter', 'Escape']);

const held = new Set();
const pressed = new Set();

class KeyboardController {
  constructor(map) { this.map = map; }
  intent() {
    const m = this.map, it = emptyIntent();
    it.move = (held.has(m.right) ? 1 : 0) - (held.has(m.left) ? 1 : 0);
    it.guard = held.has(m.guard);
    for (const a of ['jump', 'light', 'heavy', 'special', 'dash', 'bankai']) it[a] = pressed.has(m[a]);
    return it;
  }
}

const state = {
  screen: 'title',
  menuIndex: 0,
  mode: 'cpu',
  cursor: [0, 1],
  locked: [false, false],
  picks: [null, null],
  world: null,
  controllers: null,
  overT: 0,
  t: 0,
};
window.game = state; // handy for debugging from the console

const TITLE_ITEMS = ['VS CPU', 'LOCAL 2 PLAYERS', 'HOW TO PLAY'];
const PAUSE_ITEMS = ['RESUME', 'REMATCH', 'CHARACTER SELECT', 'TITLE'];
const RESULT_ITEMS = ['REMATCH', 'CHARACTER SELECT', 'TITLE'];
const GRID_COLS = 11;
const SHORT_NAMES = { soifon: 'Soi Fon', komamura: 'Komamura', unohana: 'Unohana', tosen: 'Tosen', rose: 'Rose', sasakibe: 'Sasakibe', yamamoto: 'Yamamoto' };

// ------------------------------------------------------------------ flow

function startFight() {
  const [a, b] = state.picks.map(i => CHARACTERS[i]);
  state.world = new World(a, b, (Math.random() * 1e9) | 0);
  state.controllers = [
    new KeyboardController(KEYMAPS[0]),
    state.mode === 'cpu' ? new CpuController(state.world, state.world.fighters[1]) : new KeyboardController(KEYMAPS[1]),
  ];
  state.overT = 0;
  state.screen = 'fight';
}

function toSelect() {
  state.screen = 'select';
  state.locked = [false, false];
}

function choose(items, i) {
  const item = items[i];
  if (item === 'RESUME') state.screen = 'fight';
  if (item === 'REMATCH') startFight();
  if (item === 'CHARACTER SELECT') toSelect();
  if (item === 'TITLE') { state.screen = 'title'; state.menuIndex = 0; }
}

function moveCursor(p, dx, dy) {
  const n = CHARACTERS.length, c = state.cursor[p];
  let col = c % GRID_COLS, row = Math.floor(c / GRID_COLS);
  col = (col + dx + GRID_COLS) % GRID_COLS;
  row = (row + dy + 2) % 2;
  state.cursor[p] = Math.min(n - 1, row * GRID_COLS + col);
}

function lockPick(p) {
  state.picks[p] = state.cursor[p];
  state.locked[p] = true;
}

function onKey(code) {
  const s = state;
  const up = code === 'KeyW' || code === 'ArrowUp', down = code === 'KeyS' || code === 'ArrowDown';
  const ok = code === 'Enter' || code === 'Space' || code === 'KeyF' || code === 'Comma';
  const back = code === 'Escape' || code === 'Backspace';
  const menu = items => {
    if (up) s.menuIndex = (s.menuIndex + items.length - 1) % items.length;
    if (down) s.menuIndex = (s.menuIndex + 1) % items.length;
  };

  if (s.screen === 'title') {
    menu(TITLE_ITEMS);
    if (ok) {
      if (s.menuIndex === 2) s.screen = 'howto';
      else { s.mode = s.menuIndex === 0 ? 'cpu' : 'versus'; toSelect(); }
    }
  } else if (s.screen === 'howto') {
    if (ok || back) s.screen = 'title';
  } else if (s.screen === 'select') {
    if (back) {
      if (s.locked[0] || s.locked[1]) { s.locked = [false, false]; return; }
      s.screen = 'title';
      return;
    }
    if (s.mode === 'cpu') {
      // P1 picks a fighter, then picks the CPU's fighter with the same keys.
      const p = s.locked[0] ? 1 : 0;
      if (code === 'KeyA' || code === 'ArrowLeft') moveCursor(p, -1, 0);
      if (code === 'KeyD' || code === 'ArrowRight') moveCursor(p, 1, 0);
      if (up) moveCursor(p, 0, -1);
      if (down) moveCursor(p, 0, 1);
      if (ok) { lockPick(p); if (p === 1) startFight(); }
      if (code === 'KeyG' && s.locked[0]) s.locked[0] = false;
    } else {
      const sets = [['KeyA', 'KeyD', 'KeyW', 'KeyS', 'KeyF', 'KeyG'], ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Comma', 'Period']];
      sets.forEach(([l, r, u, d, pick, undo], p) => {
        if (s.locked[p]) { if (code === undo) s.locked[p] = false; return; }
        if (code === l) moveCursor(p, -1, 0);
        if (code === r) moveCursor(p, 1, 0);
        if (code === u) moveCursor(p, 0, -1);
        if (code === d) moveCursor(p, 0, 1);
        if (code === pick || (code === 'Enter' && p === 0)) lockPick(p);
      });
      if (s.locked[0] && s.locked[1]) startFight();
    }
  } else if (s.screen === 'fight') {
    if (code === 'Escape') { s.screen = 'pause'; s.menuIndex = 0; }
  } else if (s.screen === 'pause') {
    menu(PAUSE_ITEMS);
    if (back) s.screen = 'fight';
    else if (ok) choose(PAUSE_ITEMS, s.menuIndex);
  } else if (s.screen === 'result') {
    menu(RESULT_ITEMS);
    if (ok) choose(RESULT_ITEMS, s.menuIndex);
  }
}

addEventListener('keydown', e => {
  if (GAME_KEYS.has(e.code)) e.preventDefault();
  held.add(e.code);
  if (e.repeat) return;
  pressed.add(e.code);
  onKey(e.code);
});
addEventListener('keyup', e => held.delete(e.code));
addEventListener('blur', () => held.clear());

// ------------------------------------------------------------------ loop

function update() {
  state.t++;
  if (state.screen === 'fight') {
    const w = state.world;
    w.step(state.controllers.map(c => c.intent()));
    if (w.phase === 'over' && ++state.overT > 150) { state.screen = 'result'; state.menuIndex = 0; }
  }
  pressed.clear(); // presses are consumed by the first simulation step that sees them
}

function render() {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  if (canvas.width !== W * dpr) { canvas.width = W * dpr; canvas.height = H * dpr; }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, W, H);
  const s = state;
  if (s.screen === 'title' || s.screen === 'howto') drawTitle();
  else if (s.screen === 'select') drawSelect();
  else {
    view.renderFight(s.world);
    drawWorldOverlay(ctx, s.world, (x, y) => view.project(x, y));
    drawHud(ctx, s.world, s.controllers.map(c => c.mind !== undefined ? c.mind : null), s.mode);
    drawReleaseText(ctx, s.world);
    drawBanner(ctx, s.world);
    if (s.world.phase === 'intro') text(ctx, s.mode === 'cpu' ? 'P1  ' + KEY_LABELS[0] + '   ·   Esc pause' : 'P1  ' + KEY_LABELS[0] + '      P2  ' + KEY_LABELS[1], W / 2, H - 18, 15, '#d8d2e4', 'center', FONT_UI, 600);
    if (s.screen === 'pause') drawMenuOverlay('PAUSED', PAUSE_ITEMS, true);
    if (s.screen === 'result') {
      const w = s.world, who = w.winner ? w.winner.def.name.toUpperCase() + ' WINS' : 'DRAW';
      drawMenuOverlay(who, RESULT_ITEMS, false, w.winner && s.mode === 'cpu' ? (w.winner.side === 0 ? 'You win' : 'The CPU wins') : null);
    }
  }
}

let last = performance.now(), acc = 0;
function frame(now) {
  acc += Math.min(100, now - last);
  last = now;
  while (acc >= 1000 / 60) { update(); acc -= 1000 / 60; }
  render();
  requestAnimationFrame(frame);
}

// ------------------------------------------------------------------ screens

function drawTitle() {
  view.renderMenu(state.t);
  ctx.fillStyle = 'rgba(6,6,14,0.45)'; ctx.fillRect(0, 0, W, H);
  // A drifting veil of petals behind the logo
  for (let i = 0; i < 50; i++) {
    const x = (i * 211 + state.t * (0.6 + (i % 4) * 0.3)) % (W + 40) - 20, y = (i * 97 + state.t * 0.4) % H;
    ctx.fillStyle = i % 2 ? 'rgba(246,168,200,0.6)' : 'rgba(255,214,230,0.5)';
    ctx.beginPath(); ctx.ellipse(x, y, 4, 2, i + state.t * 0.02, 0, Math.PI * 2); ctx.fill();
  }
  outlinedText(ctx, 'THE BLEACHES', W / 2, 230, 118, PAPER, 'center', FONT_DISPLAY);
  text(ctx, 'Every bankai changes how your opponent can fight', W / 2, 280, 26, GOLD, 'center', FONT_UI, 600);
  if (state.screen === 'howto') return drawHowTo();
  TITLE_ITEMS.forEach((item, i) => {
    const sel = i === state.menuIndex, y = 380 + i * 58;
    if (sel) { ctx.fillStyle = 'rgba(242,193,78,0.16)'; ctx.fillRect(W / 2 - 200, y - 36, 400, 48); ctx.fillStyle = GOLD; ctx.fillRect(W / 2 - 200, y - 36, 4, 48); }
    text(ctx, item, W / 2, y, 34, sel ? PAPER : '#9a94ab', 'center');
  });
  text(ctx, 'W/S or ↑/↓ to choose · Enter to confirm · keyboard required (click the game first if keys do nothing)', W / 2, H - 32, 17, '#8d88a0', 'center', FONT_UI, 600);
}

function drawHowTo() {
  ctx.fillStyle = 'rgba(8,8,14,0.88)'; roundRect(ctx, 130, 300, W - 260, 400, 10); ctx.fill();
  const lines = [
    ['Player 1', KEY_LABELS[0]],
    ['Player 2', KEY_LABELS[1]],
    ['Bankai', 'Your reiatsu gauge fills as you fight. When it flashes BANKAI READY, release your bankai. It changes how the opponent can fight, and its damage matches its strength.'],
    ['Abilities', 'In bankai the special key does four things: on its own, toward the opponent, away from them, or while guarding. Each has its own cooldown.'],
    ['Escapes', 'Each hit in a row stuns for less. Dash while being hit to burst free (25 reiatsu). Trapped? Mash attack buttons.'],
    ['Spirit orbs', 'Each fighter has two. Empty the health bar to shatter one; shatter both to win.'],
  ];
  lines.forEach(([k, v], i) => {
    text(ctx, k.toUpperCase(), 170, 344 + i * 58, 18, GOLD);
    wrapText(ctx, v, 300, 344 + i * 58, W - 460, 22, 18, PAPER);
  });
  text(ctx, 'Enter or Esc to go back', W / 2, H - 20, 16, '#8d88a0', 'center', FONT_UI, 600);
}

function drawCard(i, x, y, w, h) {
  const def = CHARACTERS[i];
  ctx.fillStyle = '#16141f'; ctx.fillRect(x, y, w, h);
  ctx.drawImage(portraits[def.id], x + (w - h) / 2, y, h, h);
  ctx.fillStyle = 'rgba(8,8,14,0.8)'; ctx.fillRect(x, y + h - 22, w, 22);
  const short = SHORT_NAMES[def.id] || def.name.split(' ')[0];
  text(ctx, short.toUpperCase(), x + w / 2, y + h - 6, 15, PAPER, 'center');
}

function drawSelect() {
  const s = state;
  const active = s.mode === 'cpu' ? [0, s.locked[0] ? 1 : -1] : [0, 1];
  // The preview alternates between shikai and bankai so you can see what changes.
  const showBankai = Math.floor(state.t / 150) % 2 === 1;
  view.renderMenu(state.t, [0, 1].map(p => (active[p] >= 0 || s.locked[p])
    ? { slot: p, def: CHARACTERS[s.cursor[p]], bankai: showBankai, sx: (p === 0 ? 30 : W / 2 + 10) + 110, sy: 316 + 380 - 34, facing: 1 }
    : null));
  ctx.fillStyle = 'rgba(6,6,14,0.78)'; ctx.fillRect(0, 0, W, 312);
  const title = s.mode === 'cpu' ? (s.locked[0] ? 'CHOOSE THE CPU\'S FIGHTER' : 'CHOOSE YOUR FIGHTER') : 'CHOOSE YOUR FIGHTERS';
  text(ctx, title, W / 2, 46, 34, PAPER, 'center');
  const cw = 100, ch = 112, gap = 6, gx = (W - (GRID_COLS * (cw + gap) - gap)) / 2, gy = 68;
  CHARACTERS.forEach((_, i) => drawCard(i, gx + (i % GRID_COLS) * (cw + gap), gy + Math.floor(i / GRID_COLS) * (ch + gap), cw, ch));
  for (const p of [0, 1]) {
    if (active[p] < 0 && !s.locked[p]) continue;
    const i = s.cursor[p], x = gx + (i % GRID_COLS) * (cw + gap), y = gy + Math.floor(i / GRID_COLS) * (ch + gap);
    ctx.strokeStyle = SIDE_COLORS[p]; ctx.lineWidth = s.locked[p] ? 5 : 3;
    ctx.strokeRect(x + p * 3, y + p * 3, cw - p * 6, ch - p * 6);
    text(ctx, s.mode === 'cpu' && p === 1 ? 'CPU' : 'P' + (p + 1), x + 6 + p * 56, y + 18, 15, SIDE_COLORS[p]);
  }
  for (const p of [0, 1]) drawInfoPanel(p, s.cursor[p], p === 0 ? 30 : W / 2 + 10, 316, W / 2 - 40, 380, active[p] >= 0 || s.locked[p], showBankai);
  ctx.fillStyle = 'rgba(6,6,14,0.78)'; ctx.fillRect(0, 696, W, H - 696); ctx.fillRect(0, 312, 30, 384); ctx.fillRect(W / 2 - 10, 312, 20, 384); ctx.fillRect(W - 30, 312, 30, 384);
  const hint = s.mode === 'cpu'
    ? 'Arrows or WASD to move · Enter or F to pick · G to change your pick · Esc back'
    : 'P1: WASD + F to pick (G undo) · P2: arrows + , to pick (. undo) · Esc back';
  text(ctx, hint, W / 2, H - 12, 16, '#8d88a0', 'center', FONT_UI, 600);
}

function drawInfoPanel(p, i, x, y, w, h, shown, showBankai) {
  ctx.fillStyle = 'rgba(14,12,22,0.9)';
  // The left of the panel is a window onto the 3D model.
  ctx.fillRect(x + 220, y, w - 220, h);
  if (!shown) ctx.fillRect(x, y, 220, h);
  ctx.strokeStyle = 'rgba(255,255,255,0.12)'; ctx.lineWidth = 1; ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
  ctx.fillStyle = SIDE_COLORS[p]; ctx.fillRect(x, y + 14, 4, 40);
  if (!shown) { text(ctx, 'Waiting for player 1', x + w / 2, y + h / 2, 22, '#6f6a80', 'center'); return; }
  const def = CHARACTERS[i];
  ctx.fillStyle = 'rgba(8,8,14,0.75)'; ctx.fillRect(x, y + h - 24, 220, 24);
  text(ctx, showBankai ? 'BANKAI' : 'SHIKAI', x + 110, y + h - 7, 13, showBankai ? GOLD : '#9a94ab', 'center');
  const tx = x + 230, tw = w - 250;
  const owner = state.mode === 'cpu' && p === 1 ? 'CPU' : 'P' + (p + 1);
  text(ctx, owner + (state.locked[p] ? ' · LOCKED IN' : ''), tx, y + 28, 13, SIDE_COLORS[p]);
  text(ctx, def.name.toUpperCase(), tx, y + 58, 30, PAPER);
  text(ctx, 'SHIKAI', tx, y + 82, 12, '#9a94ab');
  text(ctx, def.shikai, tx + 50, y + 82, 15, PAPER, 'left', FONT_UI, 600);
  text(ctx, 'BANKAI', tx, y + 102, 12, GOLD);
  const by = wrapText(ctx, def.bankaiName, tx + 50, y + 102, tw - 50, 18, 15, GOLD, 600);
  const ay = wrapText(ctx, def.blurb, tx, by + 22, tw, 17, 14, '#e2dcea');
  text(ctx, 'BANKAI ABILITIES', tx, ay + 24, 11, GOLD);
  def.abilities.forEach((a, k) => {
    const cx = tx + (k % 2) * (tw / 2), cy = ay + 42 + Math.floor(k / 2) * 18;
    text(ctx, SLOT_KEYS[0][a.slot], cx, cy, 12, '#9a94ab');
    ctx.save(); ctx.beginPath(); ctx.rect(cx + 30, cy - 14, tw / 2 - 34, 18); ctx.clip();
    text(ctx, a.name, cx + 30, cy, 13, PAPER, 'left', FONT_UI, 600);
    ctx.restore();
  });
}

function drawMenuOverlay(title, items, showControls, sub) {
  ctx.fillStyle = 'rgba(6,6,14,0.72)'; ctx.fillRect(0, 0, W, H);
  outlinedText(ctx, title, W / 2, 210, 72, PAPER, 'center', FONT_DISPLAY);
  if (sub) text(ctx, sub, W / 2, 252, 24, GOLD, 'center', FONT_UI, 600);
  items.forEach((item, i) => {
    const sel = i === state.menuIndex, y = 330 + i * 54;
    if (sel) { ctx.fillStyle = 'rgba(242,193,78,0.16)'; ctx.fillRect(W / 2 - 200, y - 34, 400, 46); ctx.fillStyle = GOLD; ctx.fillRect(W / 2 - 200, y - 34, 4, 46); }
    text(ctx, item, W / 2, y, 30, sel ? PAPER : '#9a94ab', 'center');
  });
  if (showControls) {
    text(ctx, 'P1  ' + KEY_LABELS[0], W / 2, H - 70, 17, '#cfc8dc', 'center', FONT_UI, 600);
    if (state.mode === 'versus') text(ctx, 'P2  ' + KEY_LABELS[1], W / 2, H - 44, 17, '#cfc8dc', 'center', FONT_UI, 600);
  }
}

if (document.fonts && document.fonts.load) {
  document.fonts.load(`700 20px ${FONT_UI}`);
  document.fonts.load(`400 20px ${FONT_DISPLAY}`);
}
canvas.addEventListener('pointerdown', () => canvas.focus());
canvas.focus();
requestAnimationFrame(frame);
