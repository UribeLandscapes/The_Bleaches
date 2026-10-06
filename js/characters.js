'use strict';
// The roster: every fighter whose bankai appears in the manga.
//
// In shikai a fighter has one special (H). In bankai they get four abilities,
// picked by direction: H, toward+H, away+H, guard+H. Each bankai also has a
// passive rule that changes how the *opponent* is able to fight, and a power
// tier (bankaiPower) that scales its damage to its strength in the story.
//
// Hooks a character can define (all optional):
//   special(f, w)            -> shikai special move (sets its own cooldown)
//   abilities: [ab(...)]     -> bankai abilities, one per slot n/f/b/d
//   dash(f, it, w)           -> true if it replaced the normal dash
//   bankaiStart/Tick/End(f, ...)
//   onHitDealt(f, target, dmg, hit, w, melee), onHitTaken(f, attacker, dmg, hit, w, melee)
//   damageMul(f)             -> extra outgoing damage multiplier while in bankai
//   victimHints(f, victim, w) -> what a sensible opponent can *see* they should do
//   aiSpecial(f, opp, dist, cpu, w) -> a callout if the CPU should use its shikai special now

function buildMoves(mod = {}) {
  const out = {};
  for (const name in BASE_MOVES) {
    const b = BASE_MOVES[name];
    out[name] = Object.assign({}, b, {
      name,
      reach: Math.round(b.reach * (mod.reach || 1)),
      damage: Math.round(b.damage * (mod.dmg || 1)),
      startup: Math.max(3, b.startup + (mod.startup || 0)),
      onHit: mod.onHit,
      unblockable: mod.unblockable,
    });
  }
  return out;
}

function character(o) {
  return Object.assign({
    hp: 1000, speed: 5.0, jump: 17, dashSpeed: 15, height: 120, weight: 1, bankaiPower: 1.1,
    moves: { shikai: buildMoves({ reach: 1.1 }), bankai: buildMoves({ reach: 1.1 }) },
  }, o);
}

// slot: 'n' (H), 'f' (toward+H), 'b' (away+H), 'd' (guard+H)
function ab(slot, name, cd, cost, use, ai) { return { slot, name, cd, cost, use, ai }; }

// A technique that doesn't swing a blade: wind-up, then `fire` happens once.
function cast(startup, recovery, fire) { return { startup, active: 2, recovery, fire }; }

function shoot(f, w, p) {
  return w.addProjectile(Object.assign({ owner: f, x: f.x + f.facing * 50, y: f.y - 70, vx: 0, life: 110, kb: 6, stun: 22, guardDmg: 20 }, p));
}

function strikeAt(f, w, x, s) { return w.addStrike(Object.assign({ owner: f, x }, s)); }

// Hits the opponent if they are within `r` of the user; draws the shock ring.
function burstAround(f, w, r, hit, color) {
  const t = f.opp;
  if (Math.abs(t.x - f.x) < r && Math.abs(t.y - f.y) < r) w.applyHit(f, t, hit, sign(f.x - t.x));
  w.ring(f.x, f.y - 60, r, color);
}

function summonOf(w, f, kind) { return w.summons.find(s => s.owner === f && s.kind === kind && !s.dead); }
function zoneOf(w, f, kind) { return w.zones.find(z => z.owner === f && z.kind === kind && !z.dead); }
function tick(f, k) { if (f[k] > 0) f[k]--; }

// Once the CPU has watched Senbonzakura Kageyoshi eat a projectile, it stops throwing them.
function projectileWorthIt(opp, cpu) { return !(opp.bankai && cpu.learned.projectilesUseless); }

// Clones (Ichigo) and decoys (Shinji) walk at the opponent. Clones swing; both soak up attacks.
const CLONE_HIT = { damage: 24, stun: 16, kb: 3 };
const CLONE_SWING = { name: 'light1', startup: 5, active: 4, recovery: 8, reach: 70 };

function spawnClone(f, w, x, extra) {
  const c = w.addSummon(Object.assign({
    owner: f, kind: 'clone', decoy: true, def: f.def, h: f.h, bankai: true, onGround: true,
    x: clamp(x, ARENA_L + 30, ARENA_R - 30), y: GROUND, facing: f.facing, life: 240, atk: 0, animT: 0, state: 'idle', speed: 6,
    update: cloneUpdate,
  }, extra));
  w.emit({ type: 'clone', ref: c, owner: f });
  return c;
}

function cloneUpdate(c, w, t) {
  c.animT++;
  if (--c.life <= 0) { c.dead = true; w.burst(c.x, c.y - 60, '#888', 12, 4); return; }
  const dx = t.x - c.x, dir = sign(dx);
  c.facing = dir;
  if (c.atk > 0) {
    c.atk--;
    c.moveT = 17 - c.atk;
    if (c.atk === 12 && Math.abs(dx) < 90 && Math.abs(t.y - c.y) < 100) w.applyHit(c.owner, t, CLONE_HIT, -dir);
    if (c.atk === 0) { c.state = 'idle'; c.move = null; }
  } else if (Math.abs(dx) > 70) {
    c.x = clamp(c.x + dir * c.speed, ARENA_L + 30, ARENA_R - 30);
    c.state = 'walk';
  } else if (!c.harmless) {
    c.atk = 17;
    c.state = 'attack';
    c.move = CLONE_SWING;
  } else {
    c.state = 'idle';
  }
}

// ---------------------------------------------------------------- Ichigo
const RUSH_HIT = { damage: 26, stun: 16, kb: 3 };

const ICHIGO = character({
  id: 'ichigo', name: 'Ichigo Kurosaki', shikai: 'Zangetsu', bankaiName: 'True Tensa Zangetsu',
  blurb: 'The reforged twin blades from the war with Yhwach. Power compressed into speed: flash steps leave afterimages and the opponent tracks where he was, so their turns and guard lag behind him. When the bankai breaks, the shell crumbles to reveal the original blade for one final strike.',
  bankaiPower: 1.3, bankaiStats: { speed: 7.6 },
  moves: {
    shikai: buildMoves({ reach: 1.3, dmg: 1.05 }), // the giant cleaver: long reach
    bankai: buildMoves({ reach: 1.1, startup: -1 }), // two black blades: quick
  },
  special(f, w) {
    if (f.finalBlade > 0) {
      // The outer blade has crumbled; what was inside cuts once, with everything.
      f.finalBlade = 0;
      f.cd.special = 60;
      return { name: 'originalBlade', call: 'The Original Blade', startup: 8, active: 4, recovery: 26, reach: 175, height: 100, yOff: 115, damage: 220, unblockable: true, kb: 16, kby: -10, stun: 40, lunge: 10 };
    }
    f.cd.special = 130;
    return cast(14, 18, (f, w) => shoot(f, w, { kind: 'getsuga', x: f.x + f.facing * 40, vx: f.facing * 11, w: 44, h: 120, damage: 80, kb: 10, kby: -4, stun: 30, guardDmg: 40 }));
  },
  abilities: [
    ab('n', 'Getsuga Tensho', 50, 3,
      () => cast(8, 14, (f, w) => shoot(f, w, { kind: 'getsugaBlack', x: f.x + f.facing * 40, vx: f.facing * 15, w: 50, h: 130, damage: 60, kb: 9, kby: -3, stun: 26, guardDmg: 30 })),
      (f, opp, dist, cpu) => dist > 200 && projectileWorthIt(opp, cpu)),
    ab('f', 'Getsuga Jujisho', 150, 8,
      () => cast(14, 20, (f, w) => shoot(f, w, { kind: 'jujisho', x: f.x + f.facing * 50, vx: f.facing * 13, w: 90, h: 160, damage: 130, kb: 14, kby: -6, stun: 36, guardDmg: 120, pierceShield: true })),
      (f, opp, dist) => dist > 160 && dist < 700),
    ab('b', 'Afterimage Clone', 360, 10,
      (f, w) => summonOf(w, f, 'clone') ? null : cast(6, 10, (f, w) => spawnClone(f, w, f.x - f.facing * 60)),
      (f, opp, dist, cpu, w) => !summonOf(w, f, 'clone') && dist < 650),
    ab('d', 'Tensa Rush', 200, 8,
      (f) => { f.rush = 4; f.rushT = 0; return { name: 'rush', startup: 1, active: 1, recovery: 34 }; },
      (f, opp, dist) => dist < 320),
  ],
  // Bankai dash is a flash step. With no direction held he reappears behind
  // the opponent. Each one burns bankai time.
  dash(f, it, w) {
    if (!f.bankai) return false;
    const opp = f.opp;
    w.addAfterimage(f);
    const nx = it.move ? f.x + it.move * 250 : opp.x - opp.facing * 75;
    f.x = clamp(nx, ARENA_L + f.w / 2, ARENA_R - f.w / 2);
    f.vx = 0;
    f.invuln = 6;
    f.cd.dash = 24;
    f.reiatsu = Math.max(0.5, f.reiatsu - 3);
    f.facing = opp.x >= f.x ? 1 : -1;
    return true;
  },
  bankaiTick(f, opp, w) {
    opp.fx.outpaced = 2;
    // Tensa Rush: four flash-step slashes from alternating sides.
    if (f.rush > 0 && f.state === 'attack' && f.rushT++ % 8 === 0) {
      const side = f.rush % 2 ? 1 : -1;
      w.addAfterimage(f);
      f.x = clamp(opp.x + side * 60, ARENA_L + f.w / 2, ARENA_R - f.w / 2);
      f.facing = -side;
      w.applyHit(f, opp, RUSH_HIT, sign(f.x - opp.x), true);
      f.rush--;
    }
  },
  bankaiEnd(f, w) {
    f.rush = 0;
    f.finalBlade = 300;
    w.say(f, 'THE SHELL CRUMBLES', '#f2f2f2');
  },
  aiSpecial(f, opp, dist, cpu) {
    if (f.finalBlade > 0) return dist < 190 ? 'The Original Blade' : null;
    return dist > 260 && projectileWorthIt(opp, cpu) ? 'Getsuga Tensho!' : null;
  },
});

// ---------------------------------------------------------------- Byakuya
function senkeiZone(f, w) {
  const t = f.opp, mid = clamp((f.x + t.x) / 2, ARENA_L + 330, ARENA_R - 330);
  return w.addZone({
    owner: f, kind: 'senkei', x0: mid - 320, x1: mid + 320, x: mid, y: GROUND - 100, r: 0, life: 360, hazard: true,
    update(z, w, t) { z.x = Math.abs(t.x - z.x0) < Math.abs(t.x - z.x1) ? z.x0 : z.x1; },
    contains(z, t) { return t.x - t.w / 2 < z.x0 + 14 || t.x + t.w / 2 > z.x1 - 14; },
    effect(z, t, w) {
      // The rows of blades cut whoever brushes them and won't let them leave.
      t.x = clamp(t.x, z.x0 + t.w / 2 + 14, z.x1 - t.w / 2 - 14);
      t.vx = 0;
      w.damage(z.owner, t, 0.6);
      t.fx.lacerated = 10;
    },
    blocksPath(z, x0, x1) { return x1 < z.x0 || x1 > z.x1 ? { x: x1 < z.x0 ? z.x0 : z.x1, jumpable: false } : null; },
  });
}

const BYAKUYA = character({
  id: 'byakuya', name: 'Byakuya Kuchiki', shikai: 'Senbonzakura', bankaiName: 'Senbonzakura Kageyoshi',
  blurb: 'A million blades. They shred incoming projectiles on their own and drift as clouds that cut and slow anyone inside. Senkei walls the opponent in with rows of swords, Gokei crushes whoever a cloud holds, and Shukei: Hakuteiken gathers every petal into one white blade.',
  bankaiPower: 1.2,
  moves: { shikai: buildMoves({ reach: 1.1 }), bankai: buildMoves({ reach: 1.15 }) },
  damageMul: f => zoneOf(f.world, f, 'senkei') ? 1.25 : 1,
  special(f, w) {
    f.cd.special = 110;
    return cast(12, 20, (f, w) => shoot(f, w, { kind: 'petals', x: f.x + f.facing * 60, vx: f.facing * 8.5, w: 100, h: 70, damage: 22, kb: 3, stun: 14, guardDmg: 10, life: 80, hits: 3, hitEvery: 8 }));
  },
  abilities: [
    ab('n', 'Kageyoshi', 70, 3,
      () => cast(10, 16, (f, w) => {
        const clouds = w.zones.filter(z => z.owner === f && z.kind === 'petals');
        if (clouds.length >= 2) clouds[0].dead = true;
        w.addZone({
          owner: f, kind: 'petals', x: f.x + f.facing * 60, y: f.y - 70, r: 100, life: 420, seek: 3.4, seekSlow: 1.1, hazard: true,
          effect(z, t, w) { w.damage(z.owner, t, 0.33); t.fx.lacerated = 8; },
        });
      }),
      (f, opp, dist, cpu, w) => w.zones.filter(z => z.owner === f && z.kind === 'petals').length < 2),
    ab('f', 'Shukei: Hakuteiken', 300, 15,
      (f, w) => {
        for (const z of w.zones) if (z.owner === f && z.kind === 'petals') z.dead = true; // every petal gathers into the blade
        return { name: 'hakuteiken', startup: 12, active: 6, recovery: 26, reach: 150, height: 110, yOff: 120, damage: 170, kb: 14, kby: -8, stun: 40, guardDmg: 100, lunge: 18 };
      },
      (f, opp, dist) => dist < 300),
    ab('b', 'Senkei', 480, 15,
      (f, w) => zoneOf(w, f, 'senkei') ? null : cast(14, 18, (f, w) => senkeiZone(f, w)),
      (f, opp, dist, cpu, w) => !zoneOf(w, f, 'senkei') && dist < 500),
    ab('d', 'Gokei', 540, 12,
      (f, w) => {
        const holding = w.zones.find(z => z.owner === f && z.kind === 'petals' && z.inside);
        return holding ? cast(10, 20, (f, w) => w.startGokei(f, f.opp, holding)) : null;
      },
      (f, opp, dist, cpu, w) => w.zones.some(z => z.owner === f && z.kind === 'petals' && z.inside)),
  ],
  // The blades swarm around him and intercept anything thrown at him.
  bankaiTick(f, opp, w) {
    for (const p of w.projectiles) {
      if (p.owner === f || p.dead || p.pierceShield) continue;
      if (Math.hypot(p.x - f.x, p.y - (f.y - 60)) < 175) {
        p.dead = true;
        w.burst(p.x, p.y, '#f8b4d0', 18);
        w.say(f, 'PETAL GUARD', '#fbd');
        w.emit({ type: 'negated', by: f, owner: p.owner });
      }
    }
  },
  aiSpecial(f, opp, dist, cpu) { return dist > 240 && projectileWorthIt(opp, cpu) ? 'Scatter, Senbonzakura!' : null; },
});

// ---------------------------------------------------------------- Toshiro
const TOSHIRO = character({
  id: 'toshiro', name: 'Toshiro Hitsugaya', shikai: 'Hyorinmaru', bankaiName: 'Daiguren Hyorinmaru',
  blurb: 'The battlefield turns to ice. The opponent loses traction and slides, and every hit builds frost that slows their body and burns with cold until they freeze solid. Ryusenka impales in ice, Sennen Hyoro crushes them in a prison of pillars.',
  hp: 950, speed: 5.5, jump: 18, dashSpeed: 16, height: 104, weight: 0.85, bankaiPower: 1.15,
  moves: {
    shikai: buildMoves({ reach: 1.05, dmg: 0.95 }),
    bankai: buildMoves({ reach: 1.15, dmg: 0.95, onHit: (f, t, w, m) => addFrost(w, t, m.name === 'heavy' ? 30 : 16) }),
  },
  special(f, w) {
    f.cd.special = 120;
    return cast(14, 20, (f, w) => shoot(f, w, { kind: 'dragon', y: f.y - 60, vx: f.facing * 9.5, w: 90, h: 70, damage: 60, kb: 8, kby: -3, stun: 26, guardDmg: 30, onHit: (f, t, w) => addFrost(w, t, 30) }));
  },
  abilities: [
    ab('n', 'Hyoten Hyakkaso', 140, 5,
      () => cast(12, 18, (f, w) => {
        const opp = f.opp;
        for (let i = 0; i < 7; i++) {
          shoot(f, w, {
            kind: 'flake', x: opp.x + (i - 3) * 42 + (w.rng() - 0.5) * 20, y: GROUND - 420 - w.rng() * 160, vy: 3 + w.rng() * 2.2,
            w: 26, h: 26, damage: 12, stun: 8, kb: 0, guardDmg: 6, life: 240, anySide: true, dieOnGround: true, onHit: (f, t, w) => addFrost(w, t, 32),
          });
        }
      }),
      (f, opp, dist) => dist < 520),
    ab('f', 'Ryusenka', 150, 6,
      () => ({ name: 'ryusenka', startup: 10, active: 4, recovery: 22, reach: 140, height: 40, yOff: 85, damage: 70, stun: 30, kb: 6, guardDmg: 30, lunge: 8, onHit: (f, t, w) => addFrost(w, t, 55) }),
      (f, opp, dist) => dist < 160),
    ab('b', 'Sennen Hyoro', 400, 14,
      () => cast(14, 20, (f, w) => strikeAt(f, w, f.opp.x, { kind: 'icePrison', width: 220, delay: 40, hit: { damage: 120, stun: 30, kb: 0, guardDmg: 90, anySide: true, onHit: (f, t, w) => addFrost(w, t, 40) } })),
      (f, opp, dist) => dist < 650),
    ab('d', 'Guncho Tsurara', 100, 4,
      () => cast(10, 16, (f, w) => {
        for (let i = -2; i <= 2; i++) shoot(f, w, { kind: 'icicle', y: f.y - 80, vx: f.facing * 13, vy: i * 0.6, w: 30, h: 12, damage: 18, stun: 10, kb: 2, guardDmg: 6, onHit: (f, t, w) => addFrost(w, t, 10) });
      }),
      (f, opp, dist) => dist > 180),
  ],
  bankaiStart(f, w) { w.ice = f; },
  bankaiEnd(f, w) { if (w.ice === f) w.ice = null; },
  aiSpecial(f, opp, dist, cpu) { return dist > 240 && projectileWorthIt(opp, cpu) ? 'Hyorinmaru!' : null; },
});

// ---------------------------------------------------------------- Mayuri
const JIZO_LUNGE = { damage: 60, stun: 26, kb: 9, kby: -5, guardDmg: 30, onHit: (f, t, w) => addToxin(w, t, 30) };

function gasZone(owner, extra) {
  return Object.assign({
    owner, kind: 'gas', r: 190, rate: 0.42, hazard: true,
    effect: (z, t, w) => addToxin(w, t, z.rate * (z.owner.potent > 0 ? 2 : 1)),
  }, extra);
}

function jizoUpdate(s, w, t) {
  const dir = sign(t.x - s.x);
  s.dir = dir;
  if (s.lunge > 0) {
    s.lunge--;
    s.x += dir * 11;
    if (!s.lungeHit && Math.abs(t.x - s.x) < s.w / 2 + 10 && t.y > GROUND - s.h) {
      s.lungeHit = true;
      w.applyHit(s.owner, t, JIZO_LUNGE, -dir);
    }
    if (s.lunge === 0) {
      s.lungeHit = false;
      w.addZone(gasZone(s.owner, { x: s.x, y: GROUND - 100, r: 250, life: 130, rate: 0.6 }));
    }
  } else if (Math.abs(t.x - s.x) > 50) {
    s.x += dir * 0.8;
  }
  s.x = clamp(s.x, ARENA_L + 80, ARENA_R - 80);
}

function limbCut(f, t, w) {
  if (w.rng() < 0.5) { t.fx.numbLegs = 240; w.say(t, 'LEGS PARALYZED', '#d9f'); }
  else { t.fx.numbArms = 240; w.say(t, 'ARMS PARALYZED', '#d9f'); }
}
const JIZO_STAB = { name: 'jizoStab', startup: 12, active: 4, recovery: 22, reach: 150, height: 40, yOff: 85, damage: 45, stun: 30, kb: 5, guardDmg: 20, lunge: 7, onHit: limbCut };

const MAYURI = character({
  id: 'mayuri', name: 'Mayuri Kurotsuchi', shikai: 'Ashisogi Jizo', bankaiName: 'Konjiki Ashisogi Jizo',
  blurb: 'A giant golden Jizo crawls after the opponent breathing nerve poison. As it builds they lose jumping, then dashing, then their arms, then everything, and the poison eats at them the whole time. He can reformulate it to work twice as fast.',
  speed: 4.9, jump: 16, dashSpeed: 14, bankaiPower: 1.15,
  moves: { shikai: buildMoves({ reach: 1.2 }), bankai: buildMoves({ reach: 1.2 }) },
  special(f) {
    f.cd.special = 150;
    return Object.assign({}, JIZO_STAB);
  },
  abilities: [
    ab('n', 'Jizo Lunge', 200, 6,
      (f, w) => { const jizo = summonOf(w, f, 'jizo'); return jizo ? cast(8, 14, () => { jizo.lunge = 24; }) : null; },
      (f, opp, dist, cpu, w) => { const j = summonOf(w, f, 'jizo'); return !!j && Math.abs(opp.x - j.x) < 380; }),
    ab('f', 'Poison Breath', 180, 6,
      () => cast(12, 16, (f, w) => w.addZone(gasZone(f, { x: f.opp.x, y: GROUND - 90, r: 200, life: 120, rate: 0.8 }))),
      (f, opp, dist) => dist < 650),
    ab('b', 'Reformulated Poison', 480, 10,
      () => cast(10, 14, (f, w) => { f.potent = 360; w.say(f.opp, 'THE POISON CHANGES', '#d9f'); }),
      (f, opp, dist, cpu, w) => w.zones.some(z => z.owner === f && z.kind === 'gas' && z.inside)),
    ab('d', 'Ashisogi Jizo', 150, 4,
      () => Object.assign({}, JIZO_STAB),
      (f, opp, dist) => dist < 170),
  ],
  bankaiStart(f, w) {
    const jizo = w.addSummon({ owner: f, kind: 'jizo', x: clamp(f.x - f.facing * 120, ARENA_L + 100, ARENA_R - 100), y: GROUND, w: 200, h: 190, dir: f.facing, lunge: 0, update: jizoUpdate });
    w.addZone(gasZone(f, { follow: jizo }));
  },
  bankaiTick(f) { tick(f, 'potent'); },
  bankaiEnd(f) { f.potent = 0; },
  aiSpecial(f, opp, dist) { return dist < 170 ? 'Ashisogi Jizo!' : null; },
});

// ---------------------------------------------------------------- Renji
const ZEKKO_HIT = { damage: 120, stun: 40, kb: 6, kby: -10, unblockable: true }; // fangs from every side: no guard covers it
const CAGE_HALF = 190;

function cageUpdate(c, w, t) {
  if (--c.life <= 0) c.dead = true;
  if (c.closing > 0 && --c.closing === 0) {
    if (!c.escaped && t.x > c.left && t.x < c.right) w.applyHit(c.owner, t, ZEKKO_HIT, sign(c.cx - t.x));
    w.shake = 12;
    c.dead = true;
  }
  // The fangs hold the opponent in (Renji moves freely). Dashing tears
  // through them at the cost of a bite.
  if (c.dead || c.escaped || t.fx.trapped > 0) return;
  const nx = clamp(t.x, c.left + t.w / 2, c.right - t.w / 2);
  if (nx === t.x) return;
  if (t.state === 'dash') {
    c.escaped = true;
    c.dead = true;
    w.damage(c.owner, t, 60);
    w.say(t, 'TORE THROUGH THE FANGS', '#ff8a7a');
    w.burst(t.x, t.y - t.h / 2, '#ffffff', 16, 6);
  } else {
    t.x = nx;
    t.vx = 0;
  }
}

const RENJI = character({
  id: 'renji', name: 'Renji Abarai', shikai: 'Zabimaru', bankaiName: 'Soo Zabimaru',
  blurb: 'Higa Zekko: floating fangs pen the opponent into a narrow cage they cannot walk out of, then snap shut, and no guard covers that. They can only tear out with a dash, and the fangs bite. Hikotsu Taiho fires a bone cannon; the baboon arm grabs and throws.',
  hp: 1050, speed: 4.9, height: 126, weight: 1.1, bankaiPower: 1.15,
  moves: { shikai: buildMoves({ reach: 1.45 }), bankai: buildMoves({ reach: 1.7, dmg: 1.05 }) },
  special(f) {
    f.cd.special = 120;
    return { name: 'zabimaru', startup: 13, active: 4, recovery: 22, reach: 270, height: 40, yOff: 85, damage: 60, stun: 26, kb: 8, guardDmg: 25 };
  },
  abilities: [
    ab('n', 'Higa Zekko', 60, 6,
      (f, w) => {
        const cage = summonOf(w, f, 'cage');
        if (cage) return cage.closing ? null : Object.assign(cast(8, 18, () => { cage.closing = 36; }), { call: 'Zekko!' });
        return cast(12, 16, (f, w) => {
          const t = f.opp, cx = clamp(t.x, ARENA_L + CAGE_HALF, ARENA_R - CAGE_HALF);
          w.addSummon({ owner: f, kind: 'cage', cx, left: cx - CAGE_HALF, right: cx + CAGE_HALF, life: 330, closing: 0, update: cageUpdate });
          w.say(t, 'CAGED BY FANGS', '#ff8a7a');
        });
      },
      (f, opp, dist, cpu, w) => {
        const cage = summonOf(w, f, 'cage');
        return !cage || (!cage.closing && cage.age > 45 && opp.x > cage.left && opp.x < cage.right);
      }),
    ab('f', 'Hikotsu Taiho', 200, 10,
      () => cast(16, 22, (f, w) => shoot(f, w, { kind: 'taiho', vx: f.facing * 16, w: 120, h: 90, damage: 120, kb: 12, kby: -4, stun: 34, guardDmg: 60 })),
      (f, opp, dist) => dist > 250),
    ab('b', 'Snake Lash', 90, 3,
      () => ({ name: 'lash', startup: 12, active: 4, recovery: 20, reach: 330, height: 40, yOff: 85, damage: 60, stun: 24, kb: 8, guardDmg: 20 }),
      (f, opp, dist) => dist > 140 && dist < 330),
    ab('d', "Baboon King's Arm", 160, 6,
      () => ({ name: 'baboonArm', startup: 9, active: 4, recovery: 22, reach: 95, height: 100, yOff: 110, damage: 85, unblockable: true, kb: 6, kby: -11, stun: 40 }),
      (f, opp, dist) => dist < 110),
  ],
  victimHints(f, t, w) {
    const cage = summonOf(w, f, 'cage');
    return cage && !cage.escaped ? { penned: cage } : null;
  },
  aiSpecial(f, opp, dist) { return dist < 280 && dist > 120 ? 'Roar, Zabimaru!' : null; },
});

// ---------------------------------------------------------------- Rukia
const RUKIA = character({
  id: 'rukia', name: 'Rukia Kuchiki', shikai: 'Sode no Shirayuki', bankaiName: 'Hakka no Togame',
  blurb: 'She becomes absolute zero. Inside her white mist every movement builds frost, so the opponent must hold still or creep, and striking her body freezes the attacker. Her dances are hers to call: Tsukishiro, Hakuren and Shirafune.',
  hp: 900, speed: 5.4, jump: 18, dashSpeed: 16, height: 108, weight: 0.85, bankaiSeconds: 12, bankaiPower: 1.15,
  moves: { shikai: buildMoves({ reach: 1.05, dmg: 0.95 }), bankai: buildMoves({ reach: 1.05, dmg: 0.95, onHit: (f, t, w) => addFrost(w, t, 12) }) },
  special(f) {
    f.cd.special = 120;
    return cast(14, 20, (f, w) => shoot(f, w, { kind: 'hakuren', vx: f.facing * 8, w: 120, h: 110, damage: 55, kb: 6, stun: 26, guardDmg: 25, onHit: (f, t, w) => addFrost(w, t, 30) }));
  },
  abilities: [
    ab('n', 'Hakka no Togame', 180, 6,
      () => cast(14, 18, (f, w) => {
        const mist = zoneOf(w, f, 'mist');
        if (mist && mist.inside) addFrost(w, f.opp, 45);
        w.ring(f.x, f.y - 60, 230, '#eaf8ff');
      }),
      (f, opp, dist) => dist < 230),
    ab('f', 'Some no mai: Tsukishiro', 140, 6,
      () => cast(10, 16, (f, w) => strikeAt(f, w, f.opp.x, { kind: 'tsukishiro', width: 150, delay: 28, hit: { damage: 70, stun: 24, kby: -6, guardDmg: 30, anySide: true, onHit: (f, t, w) => addFrost(w, t, 40) } })),
      (f, opp, dist) => dist > 120),
    ab('b', 'Tsugi no mai: Hakuren', 120, 5,
      () => cast(14, 20, (f, w) => shoot(f, w, { kind: 'hakuren', vx: f.facing * 8, w: 120, h: 110, damage: 55, kb: 6, stun: 26, guardDmg: 25, onHit: (f, t, w) => addFrost(w, t, 30) })),
      (f, opp, dist, cpu) => dist > 220 && projectileWorthIt(opp, cpu)),
    ab('d', 'San no mai: Shirafune', 120, 5,
      () => ({ name: 'shirafune', startup: 11, active: 4, recovery: 20, reach: 320, height: 30, yOff: 85, damage: 65, stun: 22, kb: 6, guardDmg: 20, onHit: (f, t, w) => addFrost(w, t, 25) }),
      (f, opp, dist) => dist > 120 && dist < 320),
  ],
  bankaiStart(f, w) {
    w.addZone({
      owner: f, kind: 'mist', follow: f, r: 230, hazard: true,
      effect(z, t, w) { addFrost(w, t, 0.06 + 0.1 * Math.abs(t.vx) + (t.onGround ? 0 : 0.4)); },
    });
  },
  onHitTaken(f, src, dmg, hit, w, melee) {
    if (!melee) return;
    addFrost(w, src, 25);
    w.say(src, 'FROSTBITE', '#cfefff');
  },
  victimHints(f, t, w) {
    const mist = zoneOf(w, f, 'mist');
    return mist && mist.inside ? { stayStill: true, creep: t.fx.frost < 55 } : null;
  },
  aiSpecial(f, opp, dist, cpu) { return dist > 220 && projectileWorthIt(opp, cpu) ? 'Tsugi no mai, Hakuren!' : null; },
});

// ---------------------------------------------------------------- Kenpachi
const KENPACHI = character({
  id: 'kenpachi', name: 'Kenpachi Zaraki', shikai: 'Nozarashi', bankaiName: 'Nameless Bankai',
  blurb: 'His body turns demonic and his swings cut through anything: blocking is useless and hits do not stagger him. The opponent has to stop guarding and start evading. His roar freezes them in place. (The bankai\'s name was never revealed.)',
  hp: 1150, speed: 4.8, jump: 16, dashSpeed: 14, height: 132, weight: 1.25, armor: true, bankaiPower: 1.3,
  moves: { shikai: buildMoves({ reach: 1.2, dmg: 1.1 }), bankai: buildMoves({ reach: 1.3, dmg: 1.1, unblockable: true }) },
  special(f) {
    f.cd.special = 150;
    return { name: 'nozarashi', startup: 18, active: 5, recovery: 26, reach: 150, height: 120, yOff: 130, damage: 130, stun: 36, kb: 14, kby: -8, guardDmg: 70 };
  },
  abilities: [
    ab('n', 'Cleave', 160, 6,
      () => cast(16, 24, (f, w) => {
        shoot(f, w, { kind: 'cleave', y: GROUND - 80, vx: f.facing * 13, w: 70, h: 160, damage: 140, kb: 12, kby: -6, stun: 34, unblockable: true, life: 90 });
        w.shake = 10;
      }),
      (f, opp, dist) => dist > 200),
    ab('f', 'Two-Handed Kendo Slash', 240, 10,
      () => ({ name: 'kendo', startup: 20, active: 5, recovery: 28, reach: 175, height: 130, yOff: 135, damage: 210, unblockable: true, kb: 16, kby: -10, stun: 44 }),
      (f, opp, dist) => dist < 190),
    ab('b', 'Roar', 360, 8,
      () => cast(10, 14, (f, w) => burstAround(f, w, 300, { damage: 10, stun: 45, kb: 7, anySide: true, unblockable: true }, '#f2d23a')),
      (f, opp, dist) => dist < 280),
    ab('d', 'Ground Smash', 200, 8,
      () => cast(14, 20, (f, w) => {
        const t = f.opp;
        if (Math.abs(t.x - f.x) < 210 && t.y > GROUND - 150) w.applyHit(f, t, { damage: 100, stun: 30, kb: 8, kby: -9, anySide: true, unblockable: true }, sign(f.x - t.x));
        w.ring(f.x, GROUND - 10, 210, '#e8c06a');
        w.shake = 12;
      }),
      (f, opp, dist) => dist < 200),
  ],
  bankaiTick(f, opp, w) { w.damage(opp, f, 0.12); }, // the transformation tears at his own body
  aiSpecial(f, opp, dist) { return dist < 160 ? 'Nozarashi!' : null; },
});

// ---------------------------------------------------------------- Shunsui
const SHUNSUI = character({
  id: 'shunsui', name: 'Shunsui Kyoraku', shikai: 'Katen Kyokotsu', bankaiName: 'Katen Kyokotsu: Karamatsu Shinju',
  blurb: 'A tragic play in four acts, staged at his command. The first act shares wounds, so hitting him is self-harm. The second spreads black spots of incurable disease. In the third the opponent drowns and their reiatsu drains away. The final act, Itodome, strangles with thread.',
  speed: 5.1, dashSpeed: 16, height: 126, bankaiSeconds: 15, bankaiPower: 1.2,
  moves: { shikai: buildMoves({ reach: 1.1 }), bankai: buildMoves({ reach: 1.1, dmg: 0.95 }) },
  special(f) {
    f.cd.special = 120;
    return cast(12, 18, (f, w) => shoot(f, w, { kind: 'bushogoma', vx: f.facing * 9, w: 70, h: 70, damage: 55, kb: 7, stun: 24 }));
  },
  abilities: [
    ab('n', 'Final Act: Itokiribasami Chizome no Nodobue', 240, 10,
      () => cast(14, 20, (f, w) => shoot(f, w, {
        kind: 'thread', vx: f.facing * 13, w: 60, h: 30, damage: 10, stun: 10, kb: 0, guardDmg: 15,
        onHit(f, t, w) { w.trap(f, t, 90, 1.0, 'itodome'); w.say(t, 'ITODOME', '#f7a8c8'); },
      })),
      (f, opp, dist) => dist < 600),
    ab('f', 'First Act: Chucho Kizu Wakeai', 360, 10,
      () => cast(10, 14, (f, w) => { f.act1 = 420; w.say(f.opp, 'WOUNDS ARE SHARED', '#f7a8c8'); }),
      () => true),
    ab('b', 'Second Act: Zanki no Shitone', 360, 10,
      () => cast(10, 14, (f, w) => { f.opp.fx.disease = 300; f.act2 = 300; w.say(f.opp, 'BLACK SPOTS: INCURABLE', '#c88ab0'); }),
      (f, opp) => opp.fx.disease <= 0),
    ab('d', 'Third Act: Drowning', 480, 12,
      () => cast(12, 16, (f, w) => { f.opp.fx.drowning = 240; w.say(f.opp, 'DROWNING', '#8ac8ff'); }),
      (f, opp) => opp.bankai || opp.reiatsu > 50),
  ],
  bankaiTick(f, opp, w) {
    tick(f, 'act1');
    if (f.act2 > 0) { f.act2--; w.damage(opp, f, 0.08); } // the disease is shared too, more lightly
  },
  bankaiEnd(f) { f.act1 = 0; f.act2 = 0; },
  onHitTaken(f, src, dmg, hit, w) {
    if (!(f.act1 > 0)) return;
    w.damage(f, src, dmg);
    w.say(src, 'SHARED WOUND', '#f7a8c8');
    w.emit({ type: 'mirrored', by: f, target: src });
  },
  victimHints(f) { return f.act1 > 0 ? { mirror: true } : null; },
  aiSpecial(f, opp, dist, cpu) { return dist > 240 && projectileWorthIt(opp, cpu) ? 'Bushogoma!' : null; },
});

// ---------------------------------------------------------------- Yamamoto
const YAMAMOTO = character({
  id: 'yamamoto', name: 'Genryusai Yamamoto', shikai: 'Ryujin Jakka', bankaiName: 'Zanka no Tachi',
  blurb: 'Every flame folds into the blade and the air around him scorches. Its four aspects are his to call: East, Kyokujitsujin, an edge that incinerates; West, Zanjitsu Gokui, armour of fifteen-million-degree flame; South, Kaka Jumanokushi, the burnt dead rising to hold you; North, Tenchi Kaijin, one slash that erases everything in front of him.',
  hp: 1100, speed: 4.6, jump: 16, dashSpeed: 14, height: 118, weight: 1.1, bankaiSeconds: 15, bankaiPower: 1.35,
  moves: { shikai: buildMoves({ reach: 1.15, dmg: 1.05 }), bankai: buildMoves({ reach: 1.15, dmg: 1.05 }) },
  special(f) {
    const t = f.opp;
    f.cd.special = 140;
    return cast(12, 20, (f, w) => strikeAt(f, w, t.x, { kind: 'fire', width: 120, delay: 30, hit: { damage: 75, stun: 28, kb: 4, kby: -10, guardDmg: 30, anySide: true } }));
  },
  abilities: [
    ab('n', 'North: Tenchi Kaijin', 420, 25,
      () => cast(30, 30, (f, w) => {
        shoot(f, w, { kind: 'tenchi', x: f.x + f.facing * 80, y: GROUND - 210, vx: f.facing * 22, w: 120, h: 420, damage: 230, guardDmg: 200, kb: 18, kby: -10, stun: 50, life: 70, pierceShield: true });
        w.shake = 18;
      }),
      (f, opp, dist, cpu, w) => dist > 150 && w.rng() < 0.35),
    ab('f', 'East: Kyokujitsujin', 120, 6,
      () => ({ name: 'kyokujitsujin', startup: 10, active: 5, recovery: 22, reach: 170, height: 90, yOff: 110, damage: 150, kb: 12, kby: -6, stun: 34, guardDmg: 60, lunge: 6 }),
      (f, opp, dist) => dist < 190),
    ab('b', 'West: Zanjitsu Gokui', 420, 12,
      () => cast(8, 10, (f, w) => { f.robe = 300; w.say(f, 'ZANJITSU GOKUI', '#ffb070'); }),
      (f, opp, dist) => dist < 250 && (opp.state === 'attack' || f.hp < f.maxHp * 0.6)),
    ab('d', 'South: Kaka Jumanokushi', 220, 10,
      () => cast(14, 20, (f, w) => strikeAt(f, w, f.opp.x, {
        kind: 'skeletons', width: 160, delay: 40,
        hit: { damage: 30, stun: 10, kb: 0, guardDmg: 20, anySide: true, onHit(f, t, w) { w.trap(f, t, 100, 0.8, 'skeletons'); w.say(t, 'THE BURNT DEAD HOLD YOU', '#ffb070'); } },
      })),
      (f, opp, dist) => dist > 250),
  ],
  bankaiStart(f, w) {
    w.addZone({ owner: f, kind: 'heat', follow: f, r: 250, hazard: true, effect(z, t, w) { w.damage(f, t, 0.22); } });
  },
  bankaiTick(f) { tick(f, 'robe'); },
  bankaiEnd(f) { f.robe = 0; },
  // Touching him always burns a little; through Zanjitsu Gokui it burns everything.
  onHitTaken(f, src, dmg, hit, w, melee) {
    if (!melee) return;
    w.damage(f, src, dmg * (f.robe > 0 ? 2.5 : 0.35));
    w.say(src, 'BURNED', '#ff9a4a');
    w.emit({ type: 'burned', by: f, target: src });
  },
  victimHints(f) { return f.robe > 0 ? { noMelee: true } : null; },
  aiSpecial(f, opp, dist) { return dist > 200 ? 'Ryujin Jakka!' : null; },
});

// ---------------------------------------------------------------- Soi Fon
function suzumebachi(f, t, w) {
  if (t.fx.homonka > 0) {
    t.fx.homonka = 0;
    w.damage(f, t, 200);
    w.say(t, 'NIGEKI KESSATSU', '#ffd23a');
    w.shake = 10;
  } else {
    t.fx.homonka = 360;
    w.say(t, 'HOMONKA', '#ffd23a');
  }
}
const STINGER = { name: 'suzumebachi', startup: 6, active: 3, recovery: 14, reach: 110, height: 40, yOff: 90, damage: 25, stun: 18, kb: 2, guardDmg: 10, lunge: 9, onHit: suzumebachi };

function reticleUpdate(r, w, t) {
  const dx = t.x - r.x, dy = t.y - t.h / 2 - r.y, d = Math.hypot(dx, dy);
  if (d > 1) { r.x += dx / d * Math.min(2.6, d); r.y += dy / d * Math.min(2.6, d); }
  r.lock = d < 70 ? Math.min(90, r.lock + 1) : Math.max(0, r.lock - 3);
}

const SOIFON = character({
  id: 'soifon', name: 'Soi Fon', shikai: 'Suzumebachi', bankaiName: 'Jakuho Raikoben',
  blurb: 'A missile launcher bolted to her arm. A lock-on reticle stalks the opponent, and the longer they stay inside it the bigger the blast, so they can never stop moving. Shunko wraps her in lightning; Suzumebachi still kills in two stings.',
  hp: 900, speed: 5.6, jump: 18, dashSpeed: 18, height: 112, weight: 0.85, bankaiPower: 1.1,
  moves: { shikai: buildMoves({ dmg: 0.8, startup: -1 }), bankai: buildMoves({ dmg: 0.8, startup: -1 }) },
  special(f) {
    f.cd.special = 90;
    return Object.assign({}, STINGER);
  },
  abilities: [
    ab('n', 'Jakuho Raikoben', 240, 15,
      (f, w) => {
        const ret = summonOf(w, f, 'reticle');
        return ret ? cast(30, 30, (f, w) => {
          w.addStrike({ owner: f, kind: 'missile', x: ret.x, width: 300, delay: 24, shake: 16, hit: { damage: 60 + 180 * ret.lock / 90, stun: 40, kb: 14, kby: -12, guardDmg: 80, anySide: true } });
          ret.lock = 0;
        }) : null;
      },
      (f, opp, dist, cpu, w) => { const r = summonOf(w, f, 'reticle'); return !!r && r.lock > 70; }),
    ab('f', 'Shunko', 160, 6,
      () => ({ name: 'shunko', startup: 8, active: 6, recovery: 18, reach: 100, height: 80, yOff: 100, damage: 75, stun: 30, kb: 9, guardDmg: 30, lunge: 20 }),
      (f, opp, dist) => dist < 320),
    ab('b', 'Nigeki Kessatsu', 90, 3,
      () => Object.assign({}, STINGER),
      (f, opp, dist) => dist < 130),
    ab('d', 'Shunko Burst', 240, 6,
      () => cast(10, 16, (f, w) => burstAround(f, w, 170, { damage: 60, stun: 28, kb: 14, kby: -5, guardDmg: 30, anySide: true }, '#fff27a')),
      (f, opp, dist) => dist < 160),
  ],
  bankaiStart(f, w) {
    const t = f.opp;
    w.addSummon({ owner: f, kind: 'reticle', x: t.x, y: t.y - t.h / 2, lock: 0, update: reticleUpdate });
  },
  victimHints(f, t, w) {
    const r = summonOf(w, f, 'reticle');
    return r && Math.abs(r.x - t.x) < 130 ? { keepMoving: true, dashNow: r.lock > 40 } : null;
  },
  aiSpecial(f, opp, dist) { return dist < 130 ? (opp.fx.homonka > 0 ? 'Nigeki Kessatsu!' : 'Sting all enemies to death!') : null; },
});

// ---------------------------------------------------------------- Komamura
const GIANT_HIT = { damage: 100, stun: 36, kb: 10, kby: -10, guardDmg: 70, anySide: true };

function giantUpdate(g, w, t) {
  g.x += clamp(g.owner.x - g.owner.facing * 160 - g.x, -3, 3); // stays behind its master
  if (--g.timer <= 0) {
    g.timer = 300;
    w.addStrike({ owner: g.owner, kind: 'giant', x: t.x, width: 220, delay: 55, shake: 12, hit: GIANT_HIT });
  }
}

const KOMAMURA = character({
  id: 'komamura', name: 'Sajin Komamura', shikai: 'Tenken', bankaiName: 'Kokujo Tengen Myo-o',
  blurb: 'A colossal armoured giant mirrors his swings across the whole arena. Its shadow marks where the blade will land and the opponent has to read it and get out from under it. Its sweep must be jumped, its fist pounds from above, and its armour can wrap Komamura himself.',
  hp: 1050, speed: 4.4, jump: 15, dashSpeed: 13, height: 140, weight: 1.35, bankaiPower: 1.15,
  moves: { shikai: buildMoves({ reach: 1.2, dmg: 1.05 }), bankai: buildMoves({ reach: 1.2, dmg: 1.05 }) },
  special(f) {
    const t = f.opp;
    f.cd.special = 130;
    return cast(12, 20, (f, w) => strikeAt(f, w, t.x, { kind: 'tenken', width: 110, delay: 26, hit: { damage: 80, stun: 28, kb: 6, kby: -6, guardDmg: 35, anySide: true } }));
  },
  abilities: [
    ab('n', "Myo-o's Slam", 150, 6,
      () => cast(10, 18, (f, w) => strikeAt(f, w, f.opp.x, { kind: 'giant', width: 260, delay: 42, shake: 14, hit: GIANT_HIT })),
      () => true),
    ab('f', "Myo-o's Sweep", 200, 8,
      () => cast(10, 18, (f, w) => strikeAt(f, w, f.x + f.facing * 330, { kind: 'sweep', width: 620, delay: 30, top: GROUND - 55, hit: { damage: 90, stun: 30, kby: -6, guardDmg: 50, anySide: true } })),
      (f, opp, dist) => dist < 620),
    ab('b', "Myo-o's Armour", 480, 10,
      () => cast(8, 10, (f, w) => { f.armorT = 300; w.say(f, 'ARMOURED BY THE GIANT', '#ffb23a'); }),
      (f, opp, dist) => f.hp < f.maxHp * 0.7 || (opp.state === 'attack' && dist < 200)),
    ab('d', "Myo-o's Fist", 180, 6,
      () => cast(10, 16, (f, w) => strikeAt(f, w, f.opp.x, { kind: 'fist', width: 180, delay: 30, shake: 10, hit: { damage: 110, stun: 34, kby: -8, guardDmg: 60, anySide: true } })),
      () => true),
  ],
  bankaiStart(f, w) { w.addSummon({ owner: f, kind: 'giant', x: f.x - f.facing * 160, timer: 120, update: giantUpdate }); },
  bankaiTick(f) { tick(f, 'armorT'); },
  bankaiEnd(f) { f.armorT = 0; },
  victimHints(f) { return f.armorT > 0 ? { evade: true } : null; },
  aiSpecial(f, opp, dist) { return dist > 160 ? 'Tenken!' : null; },
});

// ---------------------------------------------------------------- Unohana
const UNOHANA = character({
  id: 'unohana', name: 'Retsu Unohana', shikai: 'Minazuki', bankaiName: 'Minazuki',
  blurb: 'Her cuts bleed, and they bleed faster the harder the victim exerts themselves, so the opponent has to stop running and dashing while she heals from every wound she opens. Blood rains from above, and the first Kenpachi\'s swordsmanship comes back in a flurry.',
  speed: 5.2, dashSpeed: 16, height: 124, bankaiPower: 1.2,
  moves: { shikai: buildMoves({ reach: 1.1 }), bankai: buildMoves({ reach: 1.2 }) },
  special(f) {
    f.cd.special = 300;
    return { name: 'heal', call: 'Minazuki', startup: 20, active: 40, recovery: 10, fire(f, w) { w.heal(f, 100); w.say(f, 'HEALED', '#9fe0b0'); } };
  },
  abilities: [
    ab('n', 'Minazuki', 130, 5,
      () => cast(12, 18, (f, w) => shoot(f, w, { kind: 'blood', vx: f.facing * 10, w: 80, h: 100, damage: 45, kb: 6, stun: 24, onHit: (f, t) => addBleed(t, 2) })),
      (f, opp, dist) => dist > 200),
    ab('f', 'Blood Rain', 220, 8,
      () => cast(10, 16, (f, w) => strikeAt(f, w, f.opp.x, { kind: 'bloodRain', width: 200, delay: 30, hit: { damage: 60, stun: 20, guardDmg: 30, anySide: true, onHit: (f, t) => addBleed(t, 2) } })),
      (f, opp, dist) => dist > 150),
    ab('b', 'Restoration', 480, 15,
      () => cast(20, 10, (f, w) => { w.heal(f, f.maxHp * 0.15); w.say(f, 'HEALED', '#9fe0b0'); }),
      (f) => f.hp < f.maxHp * 0.6),
    ab('d', "First Kenpachi's Flurry", 200, 8,
      () => ({ name: 'flurry', startup: 6, active: 26, recovery: 16, reach: 120, height: 70, yOff: 100, damage: 32, stun: 14, kb: 2, guardDmg: 12, multi: 4, hitEvery: 6 }),
      (f, opp, dist) => dist < 140),
  ],
  onHitDealt(f, t, dmg, hit, w) {
    addBleed(t, 1);
    w.heal(f, dmg * 0.6);
  },
  aiSpecial(f, opp, dist) { return f.hp < f.maxHp * 0.7 && dist > 250 ? 'Minazuki.' : null; },
});

// ---------------------------------------------------------------- Gin
const GIN = character({
  id: 'gin', name: 'Gin Ichimaru', shikai: 'Shinso', bankaiName: 'Kamishini no Yari',
  blurb: 'A blade that crosses the whole arena in an instant, so keeping distance is pointless. A hit leaves a sliver inside that he can dissolve at will with Korose. The opponent must rush him and keep him busy.',
  hp: 950, speed: 5.3, dashSpeed: 16, height: 124, bankaiPower: 1.15,
  moves: { shikai: buildMoves({ reach: 1.1 }), bankai: buildMoves({ reach: 1.1 }) },
  special(f) {
    f.cd.special = 120;
    return { name: 'shinso', startup: 10, active: 3, recovery: 22, reach: 380, height: 24, yOff: 82, damage: 50, stun: 22, kb: 5, guardDmg: 20 };
  },
  abilities: [
    ab('n', 'Kamishini no Yari', 60, 4,
      () => ({
        name: 'kamishini', startup: 10, active: 3, recovery: 16, reach: 1150, height: 24, yOff: 82, damage: 60, stun: 22, kb: 4, guardDmg: 25,
        onHit(f, t, w) { t.fx.fragment = 420; w.say(t, 'A SLIVER STAYS INSIDE', '#e0e6f0'); },
      }),
      (f, opp, dist) => dist > 150 && opp.fx.fragment <= 0),
    ab('f', 'Korose', 60, 6,
      (f) => f.opp.fx.fragment > 0 ? cast(6, 20, (f, w) => {
        const t = f.opp;
        if (t.fx.fragment <= 0) return;
        t.fx.fragment = 0;
        w.damage(f, t, 190 * f.outMul());
        w.say(t, 'CELLS DISSOLVING', '#e0e6f0');
        w.burst(t.x, t.y - t.h / 2, '#c9a0ff', 30, 7);
        w.shake = 10;
      }) : null,
      (f, opp) => opp.fx.fragment > 0),
    ab('b', 'Buto Renjin', 150, 5,
      () => ({ name: 'renjin', startup: 8, active: 26, recovery: 18, reach: 320, height: 24, yOff: 82, damage: 22, stun: 12, kb: 2, guardDmg: 8, multi: 5, hitEvery: 5 }),
      (f, opp, dist) => dist < 320),
    ab('d', 'Wide Sweep', 180, 6,
      () => ({ name: 'sweep', startup: 14, active: 4, recovery: 22, reach: 900, height: 30, yOff: 32, damage: 60, stun: 20, kb: 6, guardDmg: 20 }),
      (f, opp, dist) => dist > 200),
  ],
  victimHints(f, t) { return { rush: true, urgent: t.fx.fragment > 0 }; },
  aiSpecial(f, opp, dist) { return dist < 380 && dist > 120 ? 'Shoot to kill, Shinso.' : null; },
});

// ---------------------------------------------------------------- Tosen
const SUZUMUSHI_HIT = { damage: 30, stun: 45, kb: 2, guardDmg: 20, anySide: true };

const TOSEN = character({
  id: 'tosen', name: 'Kaname Tosen', shikai: 'Suzumushi', bankaiName: 'Suzumushi Tsuishiki: Enma Korogi',
  blurb: "A dome that strips away sight, hearing, smell and spiritual sense, and wears the victim down while it does. Inside it the opponent can't see him or turn to face him and has to guess from the sound of his blade. Benihiko rains blades; the silent step puts him behind them.",
  speed: 5.2, dashSpeed: 16, height: 124, bankaiPower: 1.1,
  moves: { shikai: buildMoves({ reach: 1.15, dmg: 1.05 }), bankai: buildMoves({ reach: 1.15, dmg: 1.05 }) },
  special(f) {
    f.cd.special = 140;
    return cast(12, 20, (f, w) => burstAround(f, w, 170, SUZUMUSHI_HIT, '#b9a6ff'));
  },
  abilities: [
    ab('n', 'Enma Korogi', 700, 15,
      (f, w) => zoneOf(w, f, 'dome') ? null : cast(14, 18, (f, w) => w.addZone({
        owner: f, kind: 'dome', x: f.x, y: GROUND, r: 330, life: 600, hazard: true,
        effect(z, t, w) { t.fx.blind = 2; w.damage(f, t, 0.12); },
      })),
      (f, opp, dist, cpu, w) => !zoneOf(w, f, 'dome') && dist < 300),
    ab('f', 'Suzumushi Nishiki: Benihiko', 200, 8,
      () => cast(12, 18, (f, w) => strikeAt(f, w, f.opp.x, { kind: 'blades', width: 220, delay: 30, hit: { damage: 90, stun: 26, guardDmg: 40, anySide: true } })),
      () => true),
    ab('b', 'Suzumushi', 160, 4,
      () => cast(12, 20, (f, w) => burstAround(f, w, 170, SUZUMUSHI_HIT, '#b9a6ff')),
      (f, opp, dist) => dist < 170),
    ab('d', 'Silent Step', 150, 4,
      (f) => {
        const t = f.opp;
        f.x = clamp(t.x - t.facing * 70, ARENA_L + f.w / 2, ARENA_R - f.w / 2);
        f.facing = t.x >= f.x ? 1 : -1;
        return { name: 'silentStep', startup: 5, active: 3, recovery: 14, reach: 80, height: 60, yOff: 95, damage: 60, stun: 22, kb: 6, guardDmg: 20 };
      },
      (f, opp, dist) => opp.fx.blind > 0 || dist > 250),
  ],
  aiSpecial(f, opp, dist) { return dist < 160 ? 'Cry, Suzumushi.' : null; },
});

// ---------------------------------------------------------------- Shinji
function flipInversion(f, w) {
  f.inverting = !f.inverting;
  f.flipT = 180 + Math.floor(w.rng() * 150);
  w.say(f.opp, f.inverting ? 'INVERTED' : 'FLIPPED BACK?!', '#ffe08a');
}

const SHINJI = character({
  id: 'shinji', name: 'Shinji Hirako', shikai: 'Sakanade', bankaiName: 'Sakashima Yokoshima Happofusagari',
  blurb: 'An inverted world. Left and right swap for the opponent, and so do up and down (jump and guard); any swing that finds nothing cuts the swinger. Just as they adapt, Shinji flips it back. Decoys draw their attacks, and his strikes arrive from the side they aren\'t facing.',
  speed: 5.3, dashSpeed: 16, height: 122, bankaiPower: 1.1,
  special(f) {
    f.cd.special = 160;
    return cast(12, 18, (f, w) => shoot(f, w, {
      kind: 'scent', vx: f.facing * 6, w: 130, h: 110, damage: 20, kb: 2, stun: 14, guardDmg: 10, life: 120,
      onHit(f, t, w) { t.fx.inverted = 240; w.say(t, 'WORLD INVERTED', '#ffe08a'); },
    }));
  },
  abilities: [
    ab('n', 'Flip', 90, 2,
      () => Object.assign(cast(6, 10, (f, w) => flipInversion(f, w)), { call: 'Which way is up?' }),
      (f, opp) => Math.abs(opp.vx) > 1 && sign(opp.vx) === sign(f.x - opp.x)), // they're walking straight at him again
    ab('f', 'Sakanade', 160, 5,
      () => cast(12, 18, (f, w) => shoot(f, w, {
        kind: 'scent', vx: f.facing * 7, w: 150, h: 130, damage: 40, kb: 3, stun: 16, guardDmg: 10, life: 120,
        onHit(f, t, w) { t.fx.reversed = 180; w.say(t, 'FRONT AND BACK SWAPPED', '#ffe08a'); },
      })),
      (f, opp, dist, cpu) => dist > 150 && projectileWorthIt(opp, cpu)),
    ab('b', 'Inverted Strike', 120, 4,
      () => ({ name: 'invertedStrike', startup: 8, active: 4, recovery: 18, reach: 110, height: 70, yOff: 100, damage: 70, stun: 26, kb: 8, guardDmg: 20, fromBehind: true }),
      (f, opp, dist) => dist < 130),
    ab('d', 'Happofusagari Decoys', 360, 10,
      (f, w) => summonOf(w, f, 'clone') ? null : cast(8, 12, (f, w) => {
        for (const d of [-1, 1]) spawnClone(f, w, f.opp.x + d * 160, { harmless: true, speed: 3, life: 360 });
      }),
      (f, opp, dist, cpu, w) => !summonOf(w, f, 'clone') && dist < 700),
  ],
  bankaiStart(f) { f.inverting = true; f.flipT = 300; },
  bankaiTick(f, opp, w) {
    if (--f.flipT <= 0) flipInversion(f, w);
    if (f.inverting) { opp.fx.inverted = 2; opp.fx.selfCut = 2; }
  },
  aiSpecial(f, opp, dist, cpu) { return dist > 200 && dist < 600 && projectileWorthIt(opp, cpu) ? 'Collapse, Sakanade.' : null; },
});

// ---------------------------------------------------------------- Rose
const ROSE = character({
  id: 'rose', name: 'Rojuro Otoribashi', shikai: 'Kinshara', bankaiName: 'Kinshara Butodan',
  blurb: "An orchestra of music-driven illusions real enough to wound. Golden phantoms fly at the opponent alongside the real attacks and look identical (only the real ones cast a shadow). He conducts the programs: Prometheus engulfs them in flame, Sea Drift drowns them in a whirlpool, and Ein Heldenleben strikes anyone who doesn't cover their ears.",
  height: 128, bankaiPower: 1.1,
  moves: { shikai: buildMoves({ reach: 1.3, dmg: 1.05 }), bankai: buildMoves({ reach: 1.3, dmg: 1.05 }) },
  special(f) {
    f.cd.special = 110;
    return { name: 'kinshara', startup: 12, active: 4, recovery: 20, reach: 250, height: 50, yOff: 95, damage: 55, stun: 24, kb: 6, guardDmg: 22 };
  },
  abilities: [
    ab('n', 'Grand Finale', 120, 4,
      () => cast(12, 18, (f, w) => {
        const real = Math.floor(w.rng() * 3);
        for (let i = 0; i < 3; i++) shoot(f, w, { kind: 'kinshara', y: f.y - 40 - i * 45, vx: f.facing * 9, wait: i * 10, w: 80, h: 44, damage: 55, kb: 6, stun: 24, guardDmg: 20, fake: i !== real, fakeDamage: 8 });
      }),
      (f, opp, dist) => dist > 150),
    ab('f', 'Program: Prometheus', 200, 8,
      () => cast(12, 18, (f, w) => strikeAt(f, w, f.opp.x, { kind: 'prometheus', width: 170, delay: 24, hit: { damage: 90, stun: 28, kby: -6, guardDmg: 40, anySide: true } })),
      () => true),
    ab('b', 'Program: Sea Drift', 300, 10,
      () => cast(12, 18, (f, w) => w.addZone({
        owner: f, kind: 'whirlpool', x: f.opp.x, y: GROUND - 60, r: 150, life: 180, hazard: true,
        effect(z, t, w) { t.x += sign(z.x - t.x) * 2.2; w.damage(f, t, 0.3); t.fx.drowning = Math.max(t.fx.drowning, 4); },
      })),
      (f, opp, dist) => dist < 700),
    ab('d', 'Ein Heldenleben', 600, 25,
      () => cast(40, 20, (f, w) => {
        const t = f.opp, covered = t.state === 'guard';
        w.applyHit(f, t, { damage: covered ? 50 : 200, stun: 40, kby: -8, unblockable: true, anySide: true }, sign(f.x - t.x));
        if (covered) w.say(t, 'COVERED THEIR EARS', '#ffe9a0');
        w.ring(f.x, f.y - 80, 600, '#ffd86a');
      }),
      (f, opp, dist, cpu, w) => w.rng() < 0.5),
  ],
  bankaiStart(f) { f.illusionT = 60; },
  bankaiTick(f, opp, w) {
    if (--f.illusionT > 0) return;
    f.illusionT = 90 + Math.floor(w.rng() * 60);
    shoot(f, w, { kind: 'kinshara', y: f.y - 40 - w.rng() * 90, vx: f.facing * 9, w: 80, h: 44, damage: 0, fake: true, fakeDamage: 8 });
  },
  aiSpecial(f, opp, dist) { return dist < 260 && dist > 110 ? 'Play, Kinshara.' : null; },
});

// ---------------------------------------------------------------- Kensei
const KENSEI = character({
  id: 'kensei', name: 'Kensei Muguruma', shikai: 'Tachikaze', bankaiName: 'Tekken Tachikaze',
  blurb: "Brass knuckles that hit with shockwaves. Every blow concusses: the opponent's inputs arrive late, so their timing, blocks and escapes all lag a beat behind. Barrages, uppercuts and a ground punch that must be jumped.",
  hp: 1100, speed: 5.3, height: 122, bankaiPower: 1.15,
  moves: { shikai: buildMoves({ reach: 1.1 }), bankai: buildMoves({ reach: 0.95, startup: -2 }) },
  special(f) {
    f.cd.special = 110;
    return cast(11, 18, (f, w) => shoot(f, w, { kind: 'wind', vx: f.facing * 12, w: 40, h: 110, damage: 55, kb: 7, stun: 24 }));
  },
  abilities: [
    ab('n', 'Shockwave', 110, 4,
      () => cast(10, 18, (f, w) => shoot(f, w, { kind: 'shockwave', x: f.x + f.facing * 60, vx: f.facing * 14, life: 16, w: 150, h: 130, damage: 70, kb: 12, stun: 30, guardDmg: 50, onHit: (f, t) => { t.fx.dazed = 200; } })),
      (f, opp, dist) => dist < 260),
    ab('f', 'Tekken Barrage', 160, 6,
      () => ({ name: 'barrage', startup: 6, active: 26, recovery: 16, reach: 85, height: 70, yOff: 100, damage: 20, stun: 12, kb: 2, guardDmg: 10, lunge: 4, multi: 5, hitEvery: 5 }),
      (f, opp, dist) => dist < 110),
    ab('b', 'Uppercut', 140, 5,
      () => ({ name: 'uppercut', startup: 9, active: 4, recovery: 22, reach: 80, height: 110, yOff: 120, damage: 80, stun: 30, kb: 4, kby: -14, guardDmg: 70 }),
      (f, opp, dist) => dist < 100),
    ab('d', 'Ground Punch', 200, 7,
      () => cast(14, 20, (f, w) => strikeAt(f, w, f.x, { kind: 'quake', width: 460, delay: 14, top: GROUND - 50, hit: { damage: 70, stun: 24, kby: -7, guardDmg: 30, anySide: true, onHit: (f, t) => { t.fx.dazed = 150; } } })),
      (f, opp, dist) => dist < 230),
  ],
  onHitDealt(f, t, dmg, hit, w) {
    if (t.fx.dazed <= 0) w.say(t, 'CONCUSSED', '#bfe0ff');
    t.fx.dazed = Math.max(t.fx.dazed, 150);
  },
  aiSpecial(f, opp, dist, cpu) { return dist > 220 && projectileWorthIt(opp, cpu) ? 'Tachikaze!' : null; },
});

// ---------------------------------------------------------------- Ikkaku
const IKKAKU = character({
  id: 'ikkaku', name: 'Ikkaku Madarame', shikai: 'Hozukimaru', bankaiName: 'Ryumon Hozukimaru',
  blurb: 'Three giant blades and a dragon crest that fills red with every clash, hits given and taken alike, until his strength doubles. Trading blows feeds him, so the opponent has to disengage and wait it out. He can throw the crescent blade or roar to fill the crest.',
  hp: 1100, speed: 5.1, height: 124, weight: 1.1, bankaiPower: 1.05,
  moves: { shikai: buildMoves({ reach: 1.2 }), bankai: buildMoves({ reach: 1.3, dmg: 1.05, startup: 1 }) },
  damageMul: f => 1 + f.crest / 100,
  special(f) {
    f.cd.special = 110;
    return { name: 'hozukimaru', startup: 11, active: 4, recovery: 20, reach: 200, height: 50, yOff: 70, damage: 60, stun: 24, kb: 7, guardDmg: 22 };
  },
  abilities: [
    ab('n', 'Spin', 150, 5,
      (f) => {
        const full = f.crest >= 100;
        return Object.assign(cast(14, 22, (f, w) => {
          burstAround(f, w, full ? 200 : 140, { damage: full ? 160 : 70, stun: 34, kb: 12, kby: -8, guardDmg: 50, anySide: true }, '#ff5a3a');
          if (full) { f.crest = 40; w.say(f, 'THE DRAGON ROARS', '#ff7a5a'); }
        }), { call: full ? 'Ryumon Hozukimaru!' : 'Spin!' });
      },
      (f, opp, dist) => dist < 200),
    ab('f', 'Crescent Throw', 140, 5,
      () => cast(12, 18, (f, w) => shoot(f, w, { kind: 'crescent', vx: f.facing * 12, w: 60, h: 60, damage: 60, kb: 7, stun: 24 })),
      (f, opp, dist) => dist > 180),
    ab('b', 'Crest Charge', 360, 6,
      () => cast(10, 40, (f, w) => { f.crest = Math.min(100, f.crest + 30); w.say(f, 'THE CREST BURNS', '#ff5a3a'); }),
      (f, opp, dist) => f.crest < 70 && dist > 300),
    ab('d', 'Overhead Smash', 160, 5,
      () => ({ name: 'smash', startup: 16, active: 5, recovery: 24, reach: 130, height: 120, yOff: 130, damage: 110, stun: 32, kb: 10, kby: -6, guardDmg: 60 }),
      (f, opp, dist) => dist < 140),
  ],
  bankaiStart(f) { f.crest = 0; },
  onHitDealt(f, t, dmg) { f.crest = Math.min(100, f.crest + dmg * 0.1); },
  onHitTaken(f, src, dmg) { f.crest = Math.min(100, f.crest + dmg * 0.1); },
  victimHints(f) { return f.crest >= 40 ? { stall: true } : null; },
  aiSpecial(f, opp, dist) { return dist < 210 && dist > 100 ? 'Extend, Hozukimaru!' : null; },
});

// ---------------------------------------------------------------- Sasakibe
const SKY_BOLT = { damage: 45, stun: 30, kb: 0, kby: 8, guardDmg: 20, unblockable: true };
const GROUND_BOLT = { damage: 55, stun: 28, kb: 4, kby: -6, guardDmg: 25, anySide: true };

const SASAKIBE = character({
  id: 'sasakibe', name: 'Chojiro Sasakibe', shikai: 'Gonryomaru', bankaiName: 'Koko Gonryo Rikyu',
  blurb: 'He commands the lightning of the whole sky. Anyone who leaves the ground is struck, so the opponent loses jumping entirely, and bolts keep raining on marked ground across the arena. He can call a bolt down on them or charge the air around himself.',
  hp: 950, bankaiPower: 1.05,
  moves: { shikai: buildMoves({ reach: 1.1 }), bankai: buildMoves({ reach: 1.1 }) },
  special(f) {
    f.cd.special = 110;
    return { name: 'gonryomaru', startup: 8, active: 3, recovery: 18, reach: 150, height: 30, yOff: 85, damage: 45, stun: 40, kb: 3, guardDmg: 18, lunge: 6 };
  },
  abilities: [
    ab('n', 'Thunderstorm', 160, 6,
      () => cast(12, 18, (f, w) => {
        const t = f.opp;
        for (let i = 0; i < 4; i++) w.addStrike({ owner: f, kind: 'lightning', x: t.x + (i - 1.5) * 120 + (w.rng() - 0.5) * 40, width: 80, delay: 45 + i * 6, hit: GROUND_BOLT });
      }),
      () => true),
    ab('f', 'Lightning Thrust', 110, 4,
      () => ({ name: 'thrust', startup: 8, active: 3, recovery: 18, reach: 170, height: 30, yOff: 85, damage: 55, stun: 40, kb: 3, guardDmg: 18, lunge: 6 }),
      (f, opp, dist) => dist < 180),
    ab('b', 'Lightning Field', 360, 10,
      () => cast(10, 14, (f, w) => w.addZone({ owner: f, kind: 'field', follow: f, r: 150, life: 240, hazard: true, effect(z, t, w) { w.damage(f, t, 0.4); t.fx.lacerated = 10; } })),
      (f, opp, dist) => dist < 220),
    ab('d', "Heaven's Bolt", 160, 6,
      () => cast(8, 14, (f, w) => strikeAt(f, w, f.opp.x, { kind: 'lightning', width: 80, delay: 12, hit: { damage: 80, stun: 30, guardDmg: 30, anySide: true } })),
      () => true),
  ],
  bankaiStart(f) { f.stormT = 90; },
  bankaiTick(f, opp, w) {
    if (--f.stormT <= 0) {
      f.stormT = 150;
      for (let i = 0; i < 3; i++) w.addStrike({ owner: f, kind: 'lightning', x: ARENA_L + 60 + w.rng() * (ARENA_R - ARENA_L - 120), width: 80, delay: 40, hit: GROUND_BOLT });
      w.addStrike({ owner: f, kind: 'lightning', x: opp.x, width: 80, delay: 40, hit: GROUND_BOLT });
    }
    opp.airT = opp.onGround ? 0 : (opp.airT || 0) + 1;
    if (f.boltCd > 0) f.boltCd--;
    else if (opp.airT > 10) {
      f.boltCd = 30;
      w.addStrike({ owner: f, kind: 'lightning', x: opp.x, width: 70, delay: 1, hit: SKY_BOLT });
      w.say(opp, 'STRUCK FROM THE SKY', '#fff27a');
      w.emit({ type: 'skyStrike', target: opp });
    }
  },
  victimHints() { return { noJump: true }; },
  aiSpecial(f, opp, dist) { return dist < 150 ? 'Gonryomaru!' : null; },
});

// ---------------------------------------------------------------- Kisuke
function restructure(f, t, w, seals) {
  if (t.bankai) {
    w.endBankai(t);
    w.say(t, 'BANKAI TAKEN APART', '#ff8a9a');
    return;
  }
  const s = t.fx;
  for (let n = 0; n < seals; n++) {
    const open = ['light', 'heavy', 'special', 'dash', 'jump'].filter(a => s.sealed[a] <= 0);
    if (!open.length) return;
    const a = open[Math.floor(w.rng() * open.length)];
    s.sealed[a] = a === 'light' ? 240 : 420;
    w.damage(f, t, 25);
    w.say(t, a.toUpperCase() + ' SEALED', '#ff8a9a');
  }
}

const KISUKE = character({
  id: 'kisuke', name: 'Kisuke Urahara', shikai: 'Benihime', bankaiName: 'Kannonbiraki Benihime Aratame',
  blurb: "Restructures whatever it touches. A hit tears down an active bankai, or else seals one of the opponent's tools (light or heavy attacks, special, dash or jump) and the rewrite hurts. Chikasumi no Tate throws up a shield, and he can restructure his own wounds.",
  speed: 5.2, dashSpeed: 16, height: 124, bankaiPower: 1.2,
  special(f) {
    f.cd.special = 110;
    return cast(12, 18, (f, w) => shoot(f, w, { kind: 'benihime', vx: f.facing * 12, w: 60, h: 60, damage: 60, kb: 7, stun: 24 }));
  },
  abilities: [
    ab('n', 'Nake, Benihime', 100, 3,
      () => cast(12, 18, (f, w) => shoot(f, w, { kind: 'benihime', vx: f.facing * 12, w: 70, h: 70, damage: 50, kb: 7, stun: 24 })),
      (f, opp, dist, cpu) => dist > 200 && projectileWorthIt(opp, cpu)),
    ab('f', 'Benihime Aratame', 300, 10,
      () => ({ name: 'aratame', startup: 8, active: 4, recovery: 20, reach: 110, height: 70, yOff: 100, damage: 40, stun: 26, kb: 5, guardDmg: 20, onHit: (f, t, w) => restructure(f, t, w, 2) }),
      (f, opp, dist) => dist < 120),
    ab('b', 'Chikasumi no Tate', 300, 8,
      () => cast(4, 8, (f) => { f.shield = 120; }),
      (f, opp, dist, cpu) => !!cpu.threat() || (opp.state === 'attack' && dist < 200)),
    ab('d', 'Restructure Self', 480, 12,
      () => cast(20, 16, (f, w) => { w.heal(f, f.maxHp * 0.15); f.fx = freshStatus(); w.say(f, 'RESTRUCTURED', '#ff8a9a'); }),
      (f) => f.hp < f.maxHp * 0.6),
  ],
  bankaiTick(f) { tick(f, 'sealCd'); tick(f, 'shield'); },
  bankaiEnd(f) { f.shield = 0; },
  onHitDealt(f, t, dmg, hit, w) {
    if (!t.bankai && f.sealCd > 0) return;
    f.sealCd = 60;
    restructure(f, t, w, 1);
  },
  victimHints(f) { return f.shield > 0 ? { holdOff: 'His shield is up, wait' } : null; },
  aiSpecial(f, opp, dist, cpu) { return dist > 230 && projectileWorthIt(opp, cpu) ? 'Awaken, Benihime.' : null; },
});

// ---------------------------------------------------------------- Ichibe
function eraseName(f, t, w) {
  const s = t.fx, next = ['special', 'dash', 'jump'].find(a => !s.erased[a]);
  w.damage(f, t, 40);
  if (next) { s.erased[next] = true; w.say(t, `"${next.toUpperCase()}" ERASED`, '#eee'); }
  else if (!s.renamed) { s.renamed = true; w.say(t, 'RENAMED: POWER HALVED', '#eee'); }
}

const ICHIBE = character({
  id: 'ichibe', name: 'Ichibe Hyosube', shikai: 'Ichimonji', bankaiName: 'Shirafude Ichimonji',
  blurb: "Ink that blots out names and a brush that writes new ones. Each white stroke erases one of the opponent's abilities for the rest of the bankai (special, then dash, then jump) and the loss of a name hurts. His brush can rename them into something weak, and Futen Taisatsuryo brings down a great blast.",
  hp: 1150, speed: 4.5, jump: 15, height: 132, weight: 1.3, bankaiPower: 1.3,
  moves: { shikai: buildMoves({ reach: 1.25, dmg: 1.05 }), bankai: buildMoves({ reach: 1.25, dmg: 1.05 }) },
  special(f) {
    f.cd.special = 140;
    return cast(12, 18, (f, w) => shoot(f, w, { kind: 'ink', vx: f.facing * 9, w: 90, h: 90, damage: 40, kb: 4, stun: 22, onHit(f, t, w) { t.fx.sealed.special = 300; w.say(t, 'NAME BLOTTED OUT', '#ddd'); } }));
  },
  abilities: [
    ab('n', 'Shirafude Ichimonji', 160, 6,
      () => cast(12, 18, (f, w) => shoot(f, w, { kind: 'whiteInk', vx: f.facing * 10, w: 100, h: 100, damage: 40, kb: 4, stun: 22, onHit: eraseName })),
      (f, opp, dist) => dist > 150 && !opp.fx.renamed),
    ab('f', 'Ichimonji', 140, 5,
      () => cast(12, 18, (f, w) => shoot(f, w, { kind: 'ink', vx: f.facing * 9, w: 90, h: 90, damage: 40, kb: 4, stun: 22, onHit(f, t, w) { t.fx.sealed.special = 300; w.say(t, 'NAME BLOTTED OUT', '#ddd'); } })),
      (f, opp, dist) => dist > 200),
    ab('b', 'Rename', 360, 10,
      () => ({ name: 'rename', startup: 10, active: 4, recovery: 20, reach: 150, height: 70, yOff: 100, damage: 40, stun: 24, kb: 4, guardDmg: 20, onHit(f, t, w) { t.fx.renamedT = 360; w.say(t, 'RENAMED: POWER HALVED', '#eee'); } }),
      (f, opp, dist) => dist < 160 && !opp.fx.renamed),
    ab('d', 'Futen Taisatsuryo', 480, 20,
      () => cast(16, 22, (f, w) => strikeAt(f, w, f.opp.x, { kind: 'kido', width: 400, delay: 40, shake: 14, hit: { damage: 180, stun: 40, kby: -10, guardDmg: 120, anySide: true } })),
      () => true),
  ],
  bankaiEnd(f) {
    const s = f.opp.fx;
    s.erased = { special: false, dash: false, jump: false };
    s.renamed = false;
  },
  aiSpecial(f, opp, dist, cpu) { return dist > 200 && projectileWorthIt(opp, cpu) ? 'Ichimonji.' : null; },
});

// ---------------------------------------------------------------- Senjumaru
const POST_H = 140;   // vertical threads: low enough to hop over
const BEAM_Y = 230;   // horizontal threads: catch anyone jumping underneath

function weaveRandom(loom, w, avoid) {
  loom.threads = [];
  let placed = 0;
  for (let tries = 0; placed < 3 && tries < 30; tries++) {
    const x = ARENA_L + 80 + w.rng() * (ARENA_R - ARENA_L - 160);
    if (avoid.some(a => Math.abs(a - x) < 100) || loom.threads.some(t => Math.abs(t.x1 - x) < 160)) continue;
    loom.threads.push({ x1: x, y1: GROUND - POST_H, x2: x, y2: GROUND });
    placed++;
  }
  for (let i = 0; i < 2; i++) {
    const a = ARENA_L + w.rng() * (ARENA_R - ARENA_L - 400);
    loom.threads.push({ x1: a, y1: GROUND - BEAM_Y, x2: a + 300 + w.rng() * 200, y2: GROUND - BEAM_Y });
  }
  loom.reweave = 360;
}

function weaveAround(loom, x) {
  loom.threads = [
    { x1: x - 110, y1: GROUND - POST_H - 60, x2: x - 110, y2: GROUND },
    { x1: x + 110, y1: GROUND - POST_H - 60, x2: x + 110, y2: GROUND },
    { x1: x - 130, y1: GROUND - 200, x2: x + 130, y2: GROUND - 200 },
  ];
  loom.reweave = 300;
}

// Threads are axis-aligned, so contact is a simple box test.
function threadHits(t, b) {
  if (t.cut) return false;
  if (t.x1 === t.x2) return t.x1 > b.x && t.x1 < b.x + b.w && b.y < t.y2 && b.y + b.h > t.y1;
  return t.y1 > b.y && t.y1 < b.y + b.h && b.x < t.x2 && b.x + b.w > t.x1;
}

const SENJUMARU = character({
  id: 'senjumaru', name: 'Senjumaru Shutara', shikai: '(never shown)', bankaiName: 'Shatatsu Karagara Shigarami no Tsuji',
  blurb: 'A great loom weaves threads through the arena. Brushing one snares the opponent, so they have to pick their way through the gaps. She can re-weave the lattice tight around them, pull them across it, or wrap them where they stand.',
  height: 126, bankaiPower: 1.2,
  moves: { shikai: buildMoves({ reach: 1.15 }), bankai: buildMoves({ reach: 1.15 }) },
  special(f) {
    f.cd.special = 100;
    return cast(10, 18, (f, w) => {
      for (let i = -1; i <= 1; i++) shoot(f, w, { kind: 'needle', y: f.y - 70 + i * 22, vx: f.facing * 13, vy: i * 0.8, w: 30, h: 10, damage: 18, kb: 2, stun: 12, guardDmg: 6 });
    });
  },
  abilities: [
    ab('n', 'Re-weave', 200, 6,
      () => cast(12, 18, (f, w) => { const loom = zoneOf(w, f, 'loom'); if (loom) weaveAround(loom, f.opp.x); }),
      (f, opp, dist) => dist > 160),
    ab('f', 'Needle Volley', 90, 3,
      () => cast(10, 16, (f, w) => {
        for (let i = -2; i <= 2; i++) shoot(f, w, { kind: 'needle', y: f.y - 70 + i * 16, vx: f.facing * 14, vy: i * 0.6, w: 30, h: 10, damage: 22, kb: 2, stun: 12, guardDmg: 6 });
      }),
      (f, opp, dist, cpu) => dist > 200 && projectileWorthIt(opp, cpu)),
    ab('b', 'Thread Pull', 200, 6,
      () => cast(10, 16, (f, w) => {
        const t = f.opp;
        if (Math.abs(t.x - f.x) < 650) w.applyHit(f, t, { damage: 20, stun: 18, kb: -16, guardDmg: 10, anySide: true, unblockable: true }, sign(f.x - t.x));
      }),
      (f, opp, dist) => dist > 250),
    ab('d', 'Binding Wrap', 240, 8,
      () => cast(10, 16, (f, w) => strikeAt(f, w, f.opp.x, { kind: 'wrap', width: 160, delay: 30, hit: { damage: 20, stun: 10, guardDmg: 10, anySide: true, onHit(f, t, w) { w.trap(f, t, 90, 0.6, 'threads'); w.say(t, 'WRAPPED IN THREAD', '#d8b8ff'); } } })),
      () => true),
  ],
  bankaiStart(f, w) {
    const loom = w.addZone({
      owner: f, kind: 'loom', x: W / 2, y: GROUND - 150, r: 0, threads: [], hazard: true,
      update(z, w, t) { if (--z.reweave <= 0) weaveRandom(z, w, [t.x, f.x]); },
      contains(z, t) { return z.threads.some(th => threadHits(th, t.hurtbox())); },
      effect(z, t, w) {
        if (t.fx.trapped > 0) return;
        for (const th of z.threads) if (threadHits(th, t.hurtbox())) th.cut = true;
        w.trap(f, t, 60, 0.5, 'threads');
        w.damage(f, t, 20);
        w.say(t, 'SNARED', '#d8b8ff');
      },
      // Which uncut post stands between x0 and x1, and can it be hopped?
      blocksPath(z, x0, x1) {
        const lo = Math.min(x0, x1), hi = Math.max(x0, x1);
        const post = z.threads.find(th => !th.cut && th.x1 === th.x2 && th.x1 > lo && th.x1 < hi);
        if (!post) return null;
        const beam = z.threads.some(th => !th.cut && th.y1 === th.y2 && post.x1 > th.x1 - 60 && post.x1 < th.x2 + 60);
        return { x: post.x1, jumpable: !beam && post.y1 >= GROUND - POST_H };
      },
    });
    weaveRandom(loom, w, [f.opp.x, f.x]);
  },
  aiSpecial(f, opp, dist, cpu) { return dist > 200 && projectileWorthIt(opp, cpu) ? 'Needlework.' : null; },
});

const CHARACTERS = [
  ICHIGO, BYAKUYA, TOSHIRO, MAYURI, RENJI, RUKIA, KENPACHI, SHUNSUI, YAMAMOTO, SOIFON, KOMAMURA,
  UNOHANA, GIN, TOSEN, SHINJI, ROSE, KENSEI, IKKAKU, SASAKIBE, KISUKE, ICHIBE, SENJUMARU,
];
