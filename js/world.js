'use strict';
// The match simulation: two fighters plus everything their bankai put into
// the arena. No drawing here, so it runs headless in the tests.

function zoneContains(z, f) {
  return z.contains ? z.contains(z, f) : circleRect(z.x, z.y, z.r, f.hurtbox());
}

class World {
  constructor(defA, defB, seed = 1) {
    this.rng = makeRng(seed);
    this.fighters = [new Fighter(defA, 0, this), new Fighter(defB, 1, this)];
    this.projectiles = [];
    this.zones = [];     // lingering areas: petal clouds, poison, mist, heat, domes, the loom
    this.strikes = [];   // telegraphed blows that land after a delay
    this.summons = [];   // Jizo, the giant, the reticle, the fang cage
    this.afterimages = [];
    this.particles = [];
    this.rings = [];
    this.texts = [];
    this.events = [];
    this.frame = 0;
    this.hitstop = 0;
    this.shake = 0;
    this.release = null;
    this.ice = null;
    this.timer = MATCH_FRAMES;
    this.phase = 'intro';
    this.phaseT = 100;
    this.winner = null;
  }

  opponentOf(f) { return f === this.fighters[0] ? this.fighters[1] : this.fighters[0]; }

  say(f, text, color) {
    const stacked = this.texts.filter(t => t.follow === f && t.life > 45).length;
    this.texts.push({ follow: f, x: f.x, y: f.y - f.h - 34 - stacked * 22, text, color, life: 70 });
  }

  emit(e) { this.events.push(e); }

  burst(x, y, color, n = 10, speed = 5) {
    if (this.particles.length > 700) return;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, v = Math.random() * speed;
      this.particles.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 1, life: 20 + Math.random() * 20, color, size: 2 + Math.random() * 3 });
    }
  }

  ring(x, y, r, color) { this.rings.push({ x, y, r, color, life: 18 }); }

  addProjectile(p) { p.age = 0; p.hitsLeft = p.hits || 1; p.hitCd = 0; this.projectiles.push(p); return p; }
  addZone(z) { z.age = 0; z.inside = false; this.zones.push(z); return z; }
  addStrike(s) { s.age = 0; s.t = s.delay; s.after = 0; this.strikes.push(s); return s; }
  addSummon(s) { s.age = 0; this.summons.push(s); return s; }

  addAfterimage(f) {
    const img = { x: f.x, y: f.y, facing: f.facing, def: f.def, h: f.h, bankai: f.bankai, owner: f, life: 50, animT: f.animT };
    this.afterimages.push(img);
    this.emit({ type: 'afterimage', ref: img, owner: f });
    return img;
  }

  trap(src, t, frames, dps, kind) {
    const s = t.fx;
    s.trapped = frames;
    s.trapX = t.x;
    s.trapY = t.y;
    s.trapDps = dps;
    s.trapKind = kind;
    s.trapBy = src;
    t.interrupt();
  }

  startGokei(f, t, cloud) {
    cloud.dead = true;
    this.trap(f, t, 150, 1.0, 'gokei');
    this.say(t, 'GOKEI', '#fbd');
    this.shake = 8;
  }

  damage(src, t, amount) {
    if (t.state === 'ko' || amount <= 0) return;
    t.hp -= amount;
  }

  heal(f, amount) { f.hp = Math.min(f.maxHp, f.hp + amount); }

  gain(f, amount) { if (!f.bankai) f.reiatsu = Math.min(100, f.reiatsu + amount); }

  startRelease(f) {
    this.release = { f, t: RELEASE_FRAMES };
    f.interrupt();
    f.vx = 0;
    this.emit({ type: 'release', f });
  }

  finishRelease() {
    const f = this.release.f, opp = this.opponentOf(f);
    this.release = null;
    f.bankai = true;
    f.reiatsu = 100;
    f.invuln = 20;
    if (f.def.bankaiStart) f.def.bankaiStart(f, this);
    if (opp.fx.trapped <= 0) opp.vx = sign(opp.x - f.x) * 9;
    this.burst(f.x, f.y - f.h / 2, '#fff', 40, 9);
    this.shake = 14;
  }

  endBankai(f) {
    f.bankai = false;
    f.reiatsu = 0;
    if (f.def.bankaiEnd) f.def.bankaiEnd(f, this);
    for (const z of this.zones) if (z.owner === f) z.dead = true;
    this.summons = this.summons.filter(s => s.owner !== f);
    this.strikes = this.strikes.filter(s => s.owner !== f);
    this.say(f, 'BANKAI FADES', '#bbb');
  }

  step(intents) {
    this.events = [];
    this.tickFx();
    if (this.phase === 'over') {
      for (const f of this.fighters) f.update(emptyIntent());
      return;
    }
    if (this.phase !== 'fight') { if (--this.phaseT <= 0) this.phase = 'fight'; return; }
    if (this.release) { if (--this.release.t <= 0) this.finishRelease(); return; }
    if (this.hitstop > 0) { this.hitstop--; return; }
    this.frame++;
    if (--this.timer <= 0) return this.timeUp();

    for (const f of this.fighters) f.fx.onIce = !!this.ice && this.ice !== f;
    this.fighters[0].update(intents[0]);
    this.fighters[1].update(intents[1]);
    for (const f of this.fighters) {
      const opp = this.opponentOf(f);
      if (f.bankai) {
        f.reiatsu -= BANKAI_DRAIN * 20 / (f.def.bankaiSeconds || 20);
        if (f.def.bankaiTick) f.def.bankaiTick(f, opp, this);
        if (f.reiatsu <= 0 && f.bankai) this.endBankai(f);
      } else {
        f.reiatsu = Math.min(100, f.reiatsu + 1.5 / 60);
      }
      this.damage(opp, f, bleedRate(f));
    }
    this.separate();
    this.meleeHits();
    this.updateProjectiles();
    this.updateZones();
    this.updateStrikes();
    this.updateSummons();
    this.updateTraps();
    for (const a of this.afterimages) a.life--;
    this.afterimages = this.afterimages.filter(a => a.life > 0);
    for (const f of this.fighters) {
      f.history.push({ x: f.x, y: f.y, attacking: f.state === 'attack' && !!f.move.reach });
      if (f.history.length > 40) f.history.shift();
    }
    this.checkKo();
  }

  tickFx() {
    for (const p of this.particles) { p.x += p.vx; p.y += p.vy; p.vy += 0.15; p.life--; }
    this.particles = this.particles.filter(p => p.life > 0);
    for (const r of this.rings) r.life--;
    this.rings = this.rings.filter(r => r.life > 0);
    for (const t of this.texts) { t.life--; t.y -= 0.5; }
    this.texts = this.texts.filter(t => t.life > 0);
    this.shake = this.shake > 0.5 ? this.shake * 0.85 : 0;
  }

  separate() {
    const [a, b] = this.fighters;
    if (a.state === 'dash' || b.state === 'dash' || a.fx.trapped > 0 || b.fx.trapped > 0) return;
    const dx = b.x - a.x, minD = (a.w + b.w) / 2;
    if (Math.abs(dx) >= minD || Math.abs(a.y - b.y) > Math.min(a.h, b.h) * 0.8) return;
    const push = (minD - Math.abs(dx)) / 2, dir = dx === 0 ? (a.side === 0 ? 1 : -1) : sign(dx);
    a.x = clamp(a.x - dir * push, ARENA_L + a.w / 2, ARENA_R - a.w / 2);
    b.x = clamp(b.x + dir * push, ARENA_L + b.w / 2, ARENA_R - b.w / 2);
  }

  meleeHits() {
    const hits = [];
    for (const f of this.fighters) {
      if (!f.isActive()) continue;
      const t = this.opponentOf(f);
      if (overlap(f.hitbox(), t.hurtbox())) hits.push([f, t, f.move]);
    }
    // Trades resolve together: the first hit interrupts the second attacker's move.
    for (const [f, t, move] of hits) {
      f.moveHit = true;
      this.applyHit(f, t, move, sign(f.x - t.x), true);
    }
  }

  // fromSide: the side (from the target's point of view) the blow comes from.
  applyHit(src, t, hit, fromSide, melee = false) {
    if (t.invuln > 0 || t.state === 'ko' || this.phase !== 'fight') return 'miss';
    const s = t.fx;
    const guarding = t.state === 'guard' && (hit.anySide || t.facing === fromSide);
    if (guarding && !hit.unblockable) {
      t.hp -= hit.damage * 0.1;
      t.guardHp -= hit.guardDmg || 10;
      t.guardRegen = 60;
      t.vx = -fromSide * Math.max(2, (hit.kb || 2) * 0.7);
      this.gain(src, 3);
      this.gain(t, 2);
      this.hitstop = 3;
      this.burst(t.x + fromSide * 20, t.y - t.h * 0.6, '#dfe8ff', 8, 4);
      if (t.guardHp <= 0) {
        t.guardHp = 40;
        t.state = 'guardbreak';
        t.stun = 55;
        this.say(t, 'GUARD BREAK', '#fc6');
      }
      this.emit({ type: 'blocked', src, target: t });
      return 'block';
    }
    if (guarding) {
      this.say(t, 'GUARD USELESS', '#fc6');
      this.emit({ type: 'guardCrushed', src, target: t });
    }
    let dmg = hit.damage * src.outMul();
    if (s.frozen > 0) {
      dmg *= 1.4;
      s.frozen = 0;
      this.say(t, 'SHATTER', '#bff');
      this.burst(t.x, t.y - t.h / 2, '#cff', 24, 7);
    }
    this.damage(src, t, dmg);
    if (t.bankai && t.def.armor) {
      this.emit({ type: 'armored', src, target: t });
    } else if (s.trapped <= 0) {
      t.move = null;
      t.buffer = null;
      t.state = 'hitstun';
      t.stun = hit.stun || 16;
      t.vx = -fromSide * (hit.kb || 2);
      if (hit.kby) { t.vy = hit.kby; t.onGround = false; }
    }
    if (hit.onHit) hit.onHit(src, t, this, hit);
    if (src.bankai && src.def.onHitDealt) src.def.onHitDealt(src, t, dmg, hit, this, melee);
    if (t.bankai && t.def.onHitTaken) t.def.onHitTaken(t, src, dmg, hit, this, melee);
    this.gain(src, dmg * 0.14);
    this.gain(t, dmg * 0.1);
    this.hitstop = dmg >= 60 ? 6 : 4;
    this.shake = Math.max(this.shake, dmg >= 80 ? 6 : 2);
    this.burst(t.x + fromSide * 10, t.y - t.h * 0.6, '#fff', 12, 6);
    this.emit({ type: 'hit', src, target: t, dmg, melee });
    return 'hit';
  }

  updateProjectiles() {
    for (const p of this.projectiles) {
      if (p.dead) continue;
      p.age++;
      if (p.wait > 0) { p.wait--; continue; }
      p.x += p.vx || 0;
      p.y += p.vy || 0;
      if (--p.life <= 0 || p.x < -200 || p.x > W + 200) { p.dead = true; continue; }
      if (p.dieOnGround && p.y + p.h / 2 >= GROUND) { p.dead = true; this.burst(p.x, GROUND - 4, '#e8f6ff', 6, 3); continue; }
      const t = this.opponentOf(p.owner);
      const rect = { x: p.x - p.w / 2, y: p.y - p.h / 2, w: p.w, h: p.h };
      if (!overlap(rect, t.hurtbox())) continue;
      if (p.fake) { // Kinshara Butodan illusions dissolve on contact
        p.dead = true;
        this.burst(p.x, p.y, '#ffe9a0', 10, 3);
        continue;
      }
      if (p.hitCd > 0) { p.hitCd--; continue; }
      const fromSide = p.vx ? -sign(p.vx) : sign(p.x - t.x);
      if (this.applyHit(p.owner, t, p, fromSide) === 'miss') continue;
      if (--p.hitsLeft <= 0) p.dead = true; else p.hitCd = p.hitEvery || 8;
    }
    this.projectiles = this.projectiles.filter(p => !p.dead);
  }

  updateZones() {
    for (const z of this.zones) {
      if (z.dead) continue;
      z.age++;
      if (z.life !== undefined && --z.life <= 0) { z.dead = true; continue; }
      const t = this.opponentOf(z.owner);
      if (z.follow) {
        z.x = z.follow.x;
        z.y = z.follow.y - z.follow.h * 0.55;
      } else if (z.seek) {
        const spd = z.age < 50 ? z.seek : z.seekSlow;
        const dx = t.x - z.x, dy = clamp(t.y - t.h / 2, GROUND - 300, GROUND - z.r * 0.6) - z.y, d = Math.hypot(dx, dy);
        if (d > 1) { z.x += dx / d * Math.min(spd, d); z.y += dy / d * Math.min(spd, d); }
      }
      if (z.update) z.update(z, this, t);
      z.inside = zoneContains(z, t);
      if (z.inside && z.effect) z.effect(z, t, this);
    }
    this.zones = this.zones.filter(z => !z.dead);
  }

  updateStrikes() {
    for (const s of this.strikes) {
      s.age++;
      if (s.t > 0) {
        if (--s.t > 0) continue;
        const t = this.opponentOf(s.owner);
        const top = s.top ?? -2000;
        if (overlap({ x: s.x - s.width / 2, y: top, w: s.width, h: GROUND + 10 - top }, t.hurtbox())) {
          this.applyHit(s.owner, t, s.hit, sign(s.x - t.x));
        }
        this.shake = Math.max(this.shake, s.shake || 4);
        this.burst(s.x, GROUND - 10, '#fff', 14, 7);
      } else if (++s.after > 18) {
        s.dead = true;
      }
    }
    this.strikes = this.strikes.filter(s => !s.dead);
  }

  updateSummons() {
    for (const s of this.summons) {
      s.age++;
      if (s.update) s.update(s, this, this.opponentOf(s.owner));
    }
    this.summons = this.summons.filter(s => !s.dead);
  }

  updateTraps() {
    for (const f of this.fighters) {
      const s = f.fx;
      if (s.trapped <= 0) continue;
      s.trapped--;
      f.x = s.trapX;
      f.y = s.trapY;
      f.vx = 0;
      f.vy = 0;
      this.damage(s.trapBy, f, s.trapDps);
      if (s.trapped === 0) {
        this.burst(f.x, f.y - f.h / 2, '#fff', 20, 6);
        f.state = 'idle';
      }
    }
  }

  checkKo() {
    const down = this.fighters.filter(f => f.hp <= 0);
    if (!down.length) return;
    for (const f of down) {
      f.orbs--;
      if (f.orbs > 0) {
        f.hp = f.maxHp;
        f.fx = freshStatus();
        if (f.state !== 'attack') f.state = 'idle';
        this.gain(f, 35);
        this.say(f, 'SPIRIT ORB SHATTERED', '#fff');
      } else {
        f.hp = 0;
        f.state = 'ko';
      }
    }
    const dead = this.fighters.filter(f => f.orbs <= 0);
    if (dead.length) {
      this.phase = 'over';
      this.winner = dead.length === 2 ? null : this.opponentOf(dead[0]);
      this.emit({ type: 'ko' });
    } else {
      this.phase = 'orbbreak';
      this.phaseT = 90;
      this.orbBroken = down[0];
    }
  }

  timeUp() {
    const [a, b] = this.fighters;
    const score = f => f.orbs + f.hp / f.maxHp;
    this.phase = 'over';
    this.timeout = true;
    const sa = score(a), sb = score(b);
    this.winner = Math.abs(sa - sb) < 1e-6 ? null : sa > sb ? a : b;
  }
}
