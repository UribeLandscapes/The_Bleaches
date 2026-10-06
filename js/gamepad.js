'use strict';
// Xbox (and any standard-mapping) controllers through the browser Gamepad API.
// Controller 1 plays as P1 and controller 2 as P2; the keyboard keeps working.

// Standard mapping button indices (Xbox layout).
const PAD_BUTTONS = { a: 0, b: 1, x: 2, y: 3, lb: 4, rb: 5, lt: 6, rt: 7, back: 8, start: 9, up: 12, down: 13, left: 14, right: 15 };
const STICK = 0.5;      // left stick tilt that counts as left/right
const STICK_UD = 0.65;  // a firmer tilt for up (jump) and down (guard)

const pads = [0, 1].map(() => ({ connected: false, held: {}, pressed: new Set() }));
let padsBlocked = false; // embedded pages (e.g. inside an iframe) may be refused controller access

function readPad(gp) {
  const s = {};
  for (const k in PAD_BUTTONS) {
    const b = gp.buttons[PAD_BUTTONS[k]];
    s[k] = !!b && (b.pressed || b.value > 0.5);
  }
  const ax = gp.axes[0] || 0, ay = gp.axes[1] || 0;
  s.left = s.left || ax < -STICK;
  s.right = s.right || ax > STICK;
  s.up = s.up || ay < -STICK_UD;
  s.down = s.down || ay > STICK_UD;
  return s;
}

// Reads every controller once per frame and reports each new press.
function pollPads(onPress) {
  let list = [];
  try {
    list = navigator.getGamepads ? Array.from(navigator.getGamepads()).filter(g => g && g.connected) : [];
  } catch (e) {
    padsBlocked = true;
  }
  pads.forEach((pad, slot) => {
    const gp = list[slot];
    pad.connected = !!gp;
    const now = gp ? readPad(gp) : {};
    for (const k in now) {
      if (now[k] && !pad.held[k]) { pad.pressed.add(k); onPress(slot, k); }
    }
    pad.held = now;
  });
}

function clearPadPresses() { for (const p of pads) p.pressed.clear(); }

class GamepadController {
  constructor(slot) { this.pad = pads[slot]; }
  intent() {
    const h = this.pad.held, p = this.pad.pressed, it = emptyIntent();
    it.move = (h.right ? 1 : 0) - (h.left ? 1 : 0);
    it.guard = !!(h.down || h.lb || h.lt);
    it.jump = p.has('a') || p.has('up');
    it.light = p.has('x');
    it.heavy = p.has('y');
    it.special = p.has('b');
    it.dash = p.has('rb');
    it.bankai = p.has('rt');
    return it;
  }
}

// Keyboard and controller together: either can drive the same fighter.
class MergedController {
  constructor(parts) { this.parts = parts; }
  intent() {
    const out = emptyIntent();
    for (const c of this.parts) {
      const it = c.intent();
      if (it.move) out.move = it.move;
      for (const k in it) if (k !== 'move' && it[k]) out[k] = true;
    }
    return out;
  }
}
