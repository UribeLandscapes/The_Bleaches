'use strict';
// A fighter turns a filtered intent into movement and attacks. It doesn't
// know whether a keyboard or the CPU is driving it.

// Frame data shared by everyone; characters scale reach, damage and speed.
const BASE_MOVES = {
  light1: { startup: 5, active: 3, recovery: 9, reach: 70, height: 50, yOff: 92, damage: 30, stun: 18, kb: 2, guardDmg: 8, lunge: 2, next: 'light2' },
  light2: { startup: 6, active: 3, recovery: 10, reach: 74, height: 50, yOff: 92, damage: 35, stun: 18, kb: 2, guardDmg: 8, lunge: 2, next: 'light3' },
  light3: { startup: 8, active: 4, recovery: 18, reach: 84, height: 60, yOff: 96, damage: 55, stun: 26, kb: 9, guardDmg: 14, lunge: 4 },
  heavy: { startup: 15, active: 5, recovery: 24, reach: 95, height: 80, yOff: 110, damage: 85, stun: 34, kb: 11, kby: -9, guardDmg: 35, lunge: 3 },
  air: { startup: 5, active: 6, recovery: 10, reach: 72, height: 70, yOff: 80, damage: 45, stun: 20, kb: 4, guardDmg: 10 },
};

const MASH_ACTIONS = ['light', 'heavy', 'special', 'jump', 'dash'];
const COMPLAINTS = { legs: "LEGS WON'T MOVE!", arms: "ARMS WON'T MOVE!", sealed: 'SEALED!', erased: 'NAME ERASED!' };
const DAZE_DELAY = 12; // frames of input lag while concussed

class Fighter {
  constructor(def, side, world) {
    this.def = def;
    this.side = side;
    this.world = world;
    this.w = 46;
    this.h = def.height || 120;
    this.maxHp = def.hp;
    this.hp = def.hp;
    this.orbs = 2;
    this.reiatsu = 0;
    this.bankai = false;
    this.x = side === 0 ? 400 : 880;
    this.y = GROUND;
    this.vx = 0;
    this.vy = 0;
    this.facing = side === 0 ? 1 : -1;
    this.onGround = true;
    this.state = 'idle';
    this.move = null;
    this.moveT = 0;
    this.moveHit = false;
    this.fired = false;
    this.buffer = null;
    this.stun = 0;
    this.invuln = 0;
    this.dashT = 0;
    this.dashDir = 1;
    this.guardHp = 100;
    this.guardRegen = 0;
    this.cd = { special: 0, dash: 0, gokei: 0 };
    this.fx = freshStatus();
    this.history = [];
    this.lastBlocked = [];
    this.complainedAt = {};
    this.guardHeldPrev = false;
    this.inputQueue = [];
    this.animT = 0;
  }

  get opp() { return this.world.opponentOf(this); }

  stat(k) {
    const b = this.def.bankaiStats;
    return this.bankai && b && b[k] !== undefined ? b[k] : this.def[k];
  }

  moves() { return this.bankai ? this.def.moves.bankai : this.def.moves.shikai; }

  hurtbox() { return { x: this.x - this.w / 2, y: this.y - this.h, w: this.w, h: this.h }; }

  // Where this fighter was `lag` frames ago: what a slow observer sees.
  historyAt(lag) {
    const h = this.history;
    return h[Math.max(0, h.length - 1 - lag)] || { x: this.x, y: this.y, attacking: false };
  }

  free() { return this.state === 'idle' || this.state === 'walk' || this.state === 'jump' || this.state === 'guard'; }

  isActive() {
    const m = this.move;
    return this.state === 'attack' && m.reach && !this.moveHit && this.moveT >= m.startup && this.moveT < m.startup + m.active;
  }

  hitbox() {
    const m = this.move, front = this.x + this.facing * (this.w / 2 - 6);
    return { x: this.facing > 0 ? front : front - m.reach, y: this.y - m.yOff, w: m.reach, h: m.height };
  }

  // Outgoing damage multiplier (Ikkaku's crest, Ichibe's renaming).
  outMul() { return (this.fx.renamed ? 0.5 : 1) * (this.bankai && this.def.damageMul ? this.def.damageMul(this) : 1); }

  interrupt() {
    this.move = null;
    this.buffer = null;
    if (this.state !== 'ko') this.state = 'idle';
  }

  update(raw) {
    const s = this.fx;
    tickStatus(s);
    for (const k in this.cd) if (this.cd[k] > 0) this.cd[k]--;
    if (this.invuln > 0) this.invuln--;
    if (this.guardRegen > 0) this.guardRegen--; else this.guardHp = Math.min(100, this.guardHp + 0.35);
    this.animT++;

    // Concussed: every input arrives late.
    if (s.dazed > 0) {
      this.inputQueue.push(raw);
      raw = this.inputQueue.length > DAZE_DELAY ? this.inputQueue.shift() : emptyIntent();
    } else if (this.inputQueue.length) {
      this.inputQueue = [];
    }

    // Gokei: struggling (mashing) is the only way out.
    if (s.trapped > 0) for (const a of MASH_ACTIONS) if (raw[a]) s.trapped = Math.max(1, s.trapped - 5);

    const { intent, blocked } = filterIntent(this, raw);
    this.lastBlocked = blocked;
    for (const b of blocked) this.complain(b);

    if (this.state === 'ko') return this.physics(intent);

    if (incapacitated(s)) {
      this.state = s.frozen > 0 ? 'frozen' : s.paralyzed > 0 ? 'paralyzed' : 'trapped';
      this.move = null;
      this.buffer = null;
    } else if (this.state === 'frozen' || this.state === 'paralyzed' || this.state === 'trapped') {
      this.state = 'idle';
    }

    const ts = timeScale(s);
    if (this.state === 'hitstun' || this.state === 'guardbreak') {
      this.stun -= ts;
      if (this.stun <= 0) this.state = this.onGround ? 'idle' : 'jump';
    } else if (this.state === 'attack') {
      this.stepAttack(intent, ts);
    } else if (this.state === 'dash') {
      if (--this.dashT <= 0) { this.state = 'idle'; this.vx *= 0.3; }
    }
    if (this.free()) this.act(intent);
    this.physics(intent);
  }

  act(it) {
    const w = this.world, opp = this.opp, s = this.fx;
    // An outpaced fighter turns toward where Tensa Zangetsu *was*; a blinded one can't turn toward anything.
    const faceX = s.outpaced > 0 ? opp.historyAt(OUTPACE_LAG).x : opp.x;
    if (s.blind <= 0 && Math.abs(faceX - this.x) > 6) this.facing = faceX > this.x ? 1 : -1;

    if (it.bankai && !this.bankai && this.reiatsu >= 100) return w.startRelease(this);
    if (it.special && this.cd.special <= 0) {
      const m = this.def.special(this, w);
      if (m) return this.startMove(m);
    }
    if (it.heavy) return this.startMove(this.moves().heavy);
    if (it.light) return this.startMove(this.onGround ? this.moves().light1 : this.moves().air);
    if (it.dash && this.cd.dash <= 0) {
      if (this.def.dash && this.def.dash(this, it, w)) return;
      return this.startDash(it.move || this.facing);
    }
    if (it.jump && this.onGround) { this.vy = -this.stat('jump'); this.onGround = false; }
    if (it.guard && this.onGround) { this.state = 'guard'; return; }
    this.state = !this.onGround ? 'jump' : it.move ? 'walk' : 'idle';
  }

  startMove(m) {
    this.state = 'attack';
    this.move = m;
    this.moveT = 0;
    this.moveHit = false;
    this.fired = false;
    this.buffer = null;
    if (m.lunge && this.onGround) this.vx = this.facing * m.lunge;
    this.world.emit({ type: 'noise', src: this }); // what a blinded opponent can still hear
  }

  startDash(dir) {
    this.state = 'dash';
    this.dashT = 10;
    this.dashDir = dir;
    this.invuln = 8;
    this.cd.dash = 36;
  }

  stepAttack(it, ts) {
    const m = this.move;
    this.moveT += ts;
    if (!this.fired && this.moveT >= m.startup) {
      this.fired = true;
      if (m.fire) m.fire(this, this.world);
    }
    if (it.light && m.next) this.buffer = m.next;
    if (this.buffer && this.moveT >= m.startup + m.active) return this.startMove(this.moves()[this.buffer]);
    if (this.moveT >= m.startup + m.active + m.recovery) {
      this.move = null;
      this.state = this.onGround ? 'idle' : 'jump';
    }
  }

  physics(it) {
    const s = this.fx;
    const walking = this.state === 'idle' || this.state === 'walk' || this.state === 'jump';
    const want = walking ? it.move * this.stat('speed') * speedMul(s) : 0;
    if (this.state === 'dash') {
      this.vx = this.dashDir * this.stat('dashSpeed');
      this.vy = 0;
    } else if (!this.onGround) {
      if (walking) this.vx += (want - this.vx) * 0.12;
    } else if (s.onIce) {
      // No traction: input only nudges momentum, and momentum bleeds off slowly.
      if (want) this.vx += clamp(want - this.vx, -0.22, 0.22);
      else this.vx *= 0.968;
    } else if (walking) {
      this.vx = want;
    } else {
      this.vx *= 0.8;
    }
    if (this.state !== 'dash') this.vy += GRAVITY;
    this.x += this.vx;
    this.y += this.vy;
    if (this.y >= GROUND) {
      this.y = GROUND;
      this.vy = 0;
      if (!this.onGround) {
        this.onGround = true;
        if (this.state === 'jump') this.state = 'idle';
      }
    } else {
      this.onGround = false;
    }
    const lo = ARENA_L + this.w / 2, hi = ARENA_R - this.w / 2;
    if (this.x < lo || this.x > hi) { this.x = clamp(this.x, lo, hi); this.vx = 0; }
  }

  complain(b) {
    const text = COMPLAINTS[b.reason];
    if (!text) return;
    const w = this.world;
    if (w.frame - (this.complainedAt[b.reason] ?? -999) < 50) return;
    this.complainedAt[b.reason] = w.frame;
    w.say(this, text, '#d9f');
  }
}
