'use strict';
// The CPU opponent. It never reads bankai rules directly. It perceives the
// fight (wrongly, when a bankai distorts its senses), notices which of its own
// actions fail, learns from what happens to it, and reacts to what it can see
// in the arena. That is why a bankai visibly changes how it behaves.

const CPU_REACT = 9; // frames between decisions (~150 ms)

const BLOCKED_SHOUTS = { legs: "Legs won't respond!", arms: "Arms won't respond!", sealed: 'That move is sealed!', erased: 'That move is gone!' };
const FLEE_SHOUTS = { gas: 'Get out of the poison!', petals: 'Get out of the blades!', heat: 'Too hot to stay close!', dome: 'Get out of the dark!' };
const BLOCK_SHOUTS = { gas: 'Poison in the way', petals: 'Blades in the way', heat: "Can't get near the heat", dome: "Won't walk into that dark", mist: "Won't step into that mist", loom: 'Threads in the way' };

class CpuController {
  constructor(world, self) {
    this.w = world;
    this.f = self;
    this.plan = { kind: 'wait' };
    this.mind = '';
    this.mindHold = 0;
    this.nextThink = 0;
    this.lock = null;     // an afterimage it has been fooled into chasing
    this.heard = null;    // last place it heard the opponent (while blind)
    this.guessX = null;
    this.learned = { projectilesUseless: false, guardUseless: false, meleeBurns: false, attackHurts: false, skyStrikes: false, armored: false };
    this.avoid = {};      // action -> frame until which it stops trying it
    this.flipped = false; // believes its left/right are inverted
    this.vflipped = false; // believes jump and guard are swapped
    this.fakeGuardAt = -99;
    this.mismatch = 0;
    this.wantMove = 0;
    this.patrol = 1;
    this.mashT = 0;
  }

  intent() {
    const w = this.w, f = this.f, s = f.fx;
    this.learn();
    if (this.mindHold > 0) this.mindHold--;
    if (s.frozen > 0) return this.idle('Frozen solid');
    if (s.paralyzed > 0) return this.idle("Body won't respond");
    if (s.trapped > 0) {
      const it = emptyIntent();
      if (++this.mashT % 4 === 0) it.light = true;
      this.note('Struggling free');
      return it;
    }
    if (w.frame >= this.nextThink) {
      this.think();
      this.nextThink = w.frame + Math.round(CPU_REACT / timeScale(s)); // frost slows its thinking too
    }
    const it = this.execute();
    this.wantMove = it.move;
    this.wantGuard = it.guard;
    // Compensate for the inversions it believes in.
    if (this.flipped) it.move = -it.move;
    if (this.vflipped) {
      const g = it.guard, j = it.jump;
      it.jump = g && w.frame - this.fakeGuardAt >= 20;
      if (it.jump) this.fakeGuardAt = w.frame;
      it.guard = j;
    }
    return it;
  }

  idle(mind) { this.note(mind); return emptyIntent(); }
  note(text) { if (this.mindHold <= 0) this.mind = text; }
  shout(text, hold = 45) { this.mind = text; this.mindHold = hold; }
  can(action) { return !(this.avoid[action] > this.w.frame); }
  set(kind, mind, extra) { this.plan = Object.assign({ kind }, extra); this.note(mind); }
  range() { return this.f.moves().light1.reach + 30; }

  learnOnce(key, text) {
    if (this.learned[key]) return;
    this.learned[key] = true;
    this.shout(text, 60);
  }

  learn() {
    const w = this.w, f = this.f, opp = w.opponentOf(f);
    for (const b of f.lastBlocked) {
      if (!BLOCKED_SHOUTS[b.reason]) continue;
      this.avoid[b.action] = w.frame + 100;
      this.shout(BLOCKED_SHOUTS[b.reason]);
    }
    for (const e of w.events) {
      if (e.type === 'negated' && e.owner === f) this.learnOnce('projectilesUseless', 'Projectiles are useless');
      if (e.type === 'guardCrushed' && e.target === f) this.learnOnce('guardUseless', "Can't block that!");
      if (e.type === 'burned' && e.target === f) this.learnOnce('meleeBurns', 'Touching him burns!');
      if (e.type === 'mirrored' && e.target === f) this.learnOnce('attackHurts', 'Hitting him hurts me too!');
      if (e.type === 'skyStrike' && e.target === f) this.learnOnce('skyStrikes', 'Stay on the ground!');
      if (e.type === 'armored' && e.src === f) this.learnOnce('armored', "He doesn't even flinch");
      if (e.type === 'afterimage' && e.owner !== f && f.fx.outpaced > 0 && w.rng() < 0.65) {
        this.lock = e.ref;
        this.shout('Got you-?!', 30);
      }
      if ((e.type === 'noise' || e.type === 'hit') && e.src === opp) this.heard = opp.x + (w.rng() - 0.5) * 120;
    }
    if (this.lock && this.lock.life <= 0) {
      this.lock = null;
      this.shout('Where did he go?', 30);
    }
    // Up/down inversion: it meant to guard and found itself in the air.
    if (this.wantGuard && !f.onGround && f.vy < 0 && this.plan.kind === 'guard' && !this.plan.vchecked) {
      this.plan.vchecked = true;
      this.vflipped = !this.vflipped;
      this.shout(this.vflipped ? 'Guarding makes me jump?!' : 'Up is up again?!', 50);
    }
    // Inversion: notice when walking keeps carrying it the wrong way.
    if (f.state === 'walk' && !f.fx.onIce && this.wantMove && Math.abs(f.vx) > 1) {
      if (sign(f.vx) !== sign(this.wantMove)) {
        if (++this.mismatch > 70) {
          this.flipped = !this.flipped;
          this.mismatch = 0;
          this.shout(this.flipped ? 'Left is right?!' : 'It flipped back?!', 50);
        }
      } else {
        this.mismatch = Math.max(0, this.mismatch - 2);
      }
    }
  }

  perceive() {
    const f = this.f, opp = this.w.opponentOf(f);
    if (f.fx.blind > 0) {
      // Enma Korogi: no sight, sound, smell or reiatsu. Only his blade gives him away.
      if (this.heard !== null) { this.guessX = this.heard; this.heard = null; }
      if (this.guessX === null) this.guessX = f.x + f.facing * 150;
      const x = this.guessX;
      return { opp, x, y: f.y, attacking: false, fake: false, blind: true, dx: x - f.x, dist: Math.abs(x - f.x) };
    }
    this.guessX = null;
    this.heard = null;
    const seen = opp.historyAt(f.fx.outpaced > 0 ? OUTPACE_LAG : 6);
    let x = seen.x, y = seen.y, attacking = seen.attacking, fake = false;
    if (this.lock) { x = this.lock.x; y = this.lock.y; attacking = false; fake = true; }
    return { opp, x, y, attacking, fake, blind: false, dx: x - f.x, dist: Math.abs(x - f.x) };
  }

  // What it has reason to believe about the opponent's bankai: things it can
  // see (victimHints) plus lessons it has learned the hard way.
  advice(opp) {
    const f = this.f, L = this.learned, b = opp.bankai;
    const a = Object.assign({}, b && opp.def.victimHints ? opp.def.victimHints(opp, f, this.w) : null);
    if (b && L.guardUseless) a.noGuard = true;
    if (b && L.armored) a.evade = true;
    if (b && L.meleeBurns) a.noMelee = true;
    if (b && L.attackHurts && this.score(f) <= this.score(opp)) a.noAttack = true; // trading wounds only pays when ahead
    if (b && L.skyStrikes) a.noJump = true;
    if (f.fx.bleed > 0) a.lowExertion = true;
    return a;
  }

  score(f) { return f.orbs + f.hp / f.maxHp; }

  zoneOn() { return this.w.zones.find(z => z.owner !== this.f && z.hazard && z.inside) || null; }

  pathBlock(x1) {
    const f = this.f;
    for (const z of this.w.zones) {
      if (z.owner === f || !z.hazard) continue;
      if (z.blocksPath) {
        const b = z.blocksPath(z, f.x, x1);
        if (b) return Object.assign(b, { zone: z });
        continue;
      }
      const lo = Math.min(f.x, x1), hi = Math.max(f.x, x1);
      if (z.x + z.r * 0.6 > lo && z.x - z.r * 0.6 < hi && z.y + z.r > GROUND - f.h) return { x: z.x, jumpable: false, zone: z };
    }
    return null;
  }

  threat() {
    const f = this.f, w = this.w;
    if (f.fx.blind > 0) return null;
    for (const pr of w.projectiles) {
      if (pr.owner === f || pr.wait > 0) continue;
      if (pr.kind === 'flake') {
        if (Math.abs(pr.x - f.x) < 50 && pr.y < f.y - f.h + 20 && pr.y > f.y - f.h - 320) return { kind: 'flake', x: pr.x };
        continue;
      }
      const dx = f.x - pr.x;
      if (pr.vx && sign(dx) === sign(pr.vx) && Math.abs(dx) < 240 && Math.abs(pr.y - (f.y - f.h / 2)) < f.h) return { kind: 'shot', x: pr.x };
    }
    for (const s of w.strikes) {
      if (s.owner !== f && s.t > 0 && Math.abs(s.x - f.x) < s.width / 2 + f.w / 2 + 10) return { kind: 'strike', x: s.x };
    }
    return null;
  }

  away(x) {
    const f = this.f;
    let d = sign(f.x - x);
    if (d < 0 && f.x < ARENA_L + 90) d = 1;
    if (d > 0 && f.x > ARENA_R - 90) d = -1;
    return d;
  }

  patrolDir() {
    const f = this.f;
    if (f.x < ARENA_L + 120) this.patrol = 1;
    else if (f.x > ARENA_R - 120) this.patrol = -1;
    return this.patrol;
  }

  think() {
    const w = this.w, f = this.f, s = f.fx, rng = w.rng;
    const p = this.perceive(), opp = p.opp, a = this.advice(opp);
    const dist = p.dist, toward = sign(p.dx), range = this.range();
    const can = k => this.can(k);
    const dashReady = () => can('dash') && f.cd.dash <= 0 && !a.lowExertion;

    // 1. Get out of whatever is hurting it (unless moving is what hurts).
    if (a.penned) {
      const out = this.away(a.penned.cx);
      if (dashReady()) return this.set('dash', 'Tear through the fangs!', { dir: out });
      if (a.penned.closing || opp.x < a.penned.left || opp.x > a.penned.right) return this.set('move', 'Caged! Find a way out', { dir: out });
    }
    const zone = p.blind ? null : this.zoneOn(); // blind, it has no idea where the dark ends
    if (a.stayStill) {
      if (p.attacking && dist < 170 && can('guard')) return this.set('guard', 'Blocking without moving a muscle', { until: w.frame + 18 });
      if (dist <= range && can('light') && rng() < 0.5) return this.set('attack', 'Strike without taking a step', { presses: 2 });
      if (a.creep) return this.set('creep', 'Creeping out of the mist', { dir: zone ? this.away(zone.x) : -toward });
      return this.set('still', 'Holding perfectly still', {});
    }
    if (zone) return this.set('flee', FLEE_SHOUTS[zone.kind] || 'Get clear!', { dir: this.away(zone.x) });

    // 2. Dodge what's coming. Illusions look exactly like the real thing.
    const th = this.threat();
    if (th) {
      if (th.kind !== 'shot') return this.set('move', th.kind === 'flake' ? 'Dodging snowflakes' : 'Get out from under it!', { dir: this.away(th.x) });
      if (f.onGround && can('jump') && !a.noJump && !a.lowExertion && rng() < 0.55) return this.set('jump', 'Jump it!');
      if (can('guard') && !a.noGuard && rng() < 0.85) return this.set('guard', 'Block!', { until: w.frame + 22 });
      if (dashReady()) return this.set('dash', 'Dodge!', { dir: this.away(th.x) });
    }

    if (!f.bankai && f.reiatsu >= 100 && can('bankai')) return this.set('bankai', 'BANKAI!');

    // 3. Pressures a sensible fighter would respond to.
    if (a.keepMoving) {
      if (a.dashNow && dashReady()) return this.set('dash', 'Break the lock-on!', { dir: this.patrolDir() });
      if (dist <= range && can('light') && rng() < 0.5) return this.set('attack', 'Hit and keep moving', { presses: 1 });
      return this.set('move', "Can't stand still", { dir: this.patrolDir() });
    }
    if (a.stall) {
      if (dist < 170 && can('guard')) return this.set('guard', 'Block, never trade', { until: w.frame + 20 });
      if (dist < 320) return this.set('retreat', "Don't feed that crest", { dir: this.away(p.x) });
      return this.set('still', 'Waiting out his bankai', { guard: p.attacking && can('guard') });
    }
    if (a.noAttack) {
      if (p.attacking && dist < 170 && can('guard')) return this.set('guard', 'Enduring', { until: w.frame + 18 });
      return this.set(dist < 220 ? 'retreat' : 'still', 'Hitting him hurts me too', { dir: this.away(p.x) });
    }

    // 4. Defend.
    if (p.attacking && dist < 170) {
      if (a.noGuard || a.evade) {
        if (dashReady()) return this.set('dash', 'Evade!', { dir: this.away(p.x) });
        return this.set('retreat', 'Back off!', { dir: this.away(p.x) });
      }
      if (can('guard') && rng() < 0.55) return this.set('guard', 'Guarding', { until: w.frame + 18 });
    }

    // 5. Special.
    if (f.cd.special <= 0 && can('special') && !p.blind) {
      const call = f.def.aiSpecial(f, opp, dist, this, w);
      if (call) return this.set('special', call);
    }

    // 6. Positioning.
    if (a.noMelee || (a.evade && rng() < 0.5)) {
      if (dist < 280) return this.set('retreat', a.noMelee ? "Can't touch him" : 'Keep away from that', { dir: this.away(p.x) });
      return this.set('still', 'Looking for an opening', {});
    }
    if (dist > range) {
      const block = this.pathBlock(p.x);
      if (block && rng() > 0.12) {
        if (block.jumpable && can('jump') && !a.noJump && Math.abs(block.x - f.x) < 90) return this.set('jump', 'Hop the thread', { dir: toward });
        const near = Math.abs(block.x - f.x) < 140;
        return this.set(near ? 'retreat' : 'still', BLOCK_SHOUTS[block.zone.kind] || 'Something in the way', { dir: this.away(block.x) });
      }
      if (a.rush && dashReady() && !s.onIce) return this.set('dash', a.urgent ? 'Get in before he dissolves it!' : "Range is useless against that blade", { dir: toward });
      if (dist > 380 && dashReady() && !s.onIce && rng() < 0.25) return this.set('dash', 'Closing in', { dir: toward });
      const mind = p.blind ? 'Feeling for him...' : p.fake ? 'Chasing an afterimage?!' : s.onIce ? 'Careful on the ice' : a.lowExertion ? 'Moving carefully, bleeding' : 'Closing in';
      return this.set(a.lowExertion ? 'creep' : 'approach', mind, { dir: toward });
    }

    // 7. In range: attack.
    if (rng() < 0.22 && can('heavy')) return this.set('heavy', p.fake ? 'Swinging at an afterimage' : 'Heavy strike');
    if (rng() < 0.1 && can('jump') && !a.noJump && !a.lowExertion) return this.set('jump', 'Jump in', { dir: toward, attack: true });
    if (!can('light')) return this.set('retreat', 'Nothing to attack with', { dir: this.away(p.x) });
    return this.set('attack', p.blind ? 'Swinging blind' : p.fake ? 'Slashing an afterimage' : 'Attacking', { presses: 3 });
  }

  execute() {
    const w = this.w, f = this.f, pl = this.plan, it = emptyIntent();
    switch (pl.kind) {
      case 'flee':
        it.move = pl.dir;
        if (!pl.dashed && this.can('dash') && f.cd.dash <= 0) { it.dash = true; pl.dashed = true; }
        break;
      case 'move': case 'retreat': it.move = pl.dir; break;
      case 'creep': it.move = w.frame % 3 === 0 ? pl.dir : 0; break;
      case 'still': it.guard = !!pl.guard; break;
      case 'guard': it.guard = w.frame < pl.until; break;
      case 'jump':
        if (!pl.done) { it.jump = true; pl.done = true; }
        it.move = pl.dir || 0;
        if (pl.attack && !f.onGround && f.vy > -4 && !pl.swung) { it.light = true; pl.swung = true; }
        break;
      case 'dash':
        if (!pl.done) { it.move = pl.dir; it.dash = true; pl.done = true; }
        break;
      case 'bankai': case 'special': case 'heavy':
        if (!pl.done) { it[pl.kind] = true; pl.done = true; }
        break;
      case 'approach': it.move = this.approachMove(pl.dir); break;
      case 'attack':
        if (pl.presses > 0 && w.frame % 6 === 0) { it.light = true; pl.presses--; }
        break;
    }
    return it;
  }

  // On Toshiro's ice it tries to brake early, but underestimates the slide.
  approachMove(dir) {
    const f = this.f;
    if (!f.fx.onIce) return dir;
    const stopDist = Math.abs(f.vx) / (1 - 0.968) * 0.55;
    if (sign(f.vx) === dir && this.perceive().dist - this.range() < stopDist) {
      if (Math.abs(f.vx) > 3) this.note('Sliding on the ice!');
      return 0;
    }
    return dir;
  }
}
