'use strict';
// The roster: every fighter whose bankai appears in the manga. Each bankai's
// raw power bump is kept small on purpose. What it changes is how the
// *opponent* is able to fight: their inputs, senses, footing or options.
//
// Hooks a character can define (all optional):
//   special(f, w)       -> move to perform (or null). Sets its own cooldown.
//   dash(f, it, w)      -> true if it replaced the normal dash.
//   bankaiStart/Tick/End(f, ...)
//   onHitDealt(f, target, dmg, hit, w, melee), onHitTaken(f, attacker, dmg, hit, w, melee)
//   damageMul(f)        -> outgoing damage multiplier while in bankai.
//   victimHints(f, victim, w) -> what a sensible opponent can *see* they should do.
//   aiSpecial(f, opp, dist, cpu, w) -> a callout if the CPU should use its special now.

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
    hp: 1000, speed: 5.0, jump: 17, dashSpeed: 15, height: 120,
    moves: { shikai: buildMoves({ reach: 1.1 }), bankai: buildMoves({ reach: 1.1 }) },
  }, o);
}

function shoot(f, w, p) {
  return w.addProjectile(Object.assign({ owner: f, x: f.x + f.facing * 50, y: f.y - 70, vx: 0, life: 110, kb: 6, stun: 22, guardDmg: 20 }, p));
}

function summonOf(w, f, kind) { return w.summons.find(s => s.owner === f && s.kind === kind); }
function zoneOf(w, f, kind) { return w.zones.find(z => z.owner === f && z.kind === kind); }

// Once the CPU has watched Senbonzakura Kageyoshi eat a projectile, it stops throwing them.
function projectileWorthIt(opp, cpu) { return !(opp.bankai && cpu.learned.projectilesUseless); }

// ---------------------------------------------------------------- Ichigo
const ICHIGO = character({
  id: 'ichigo', name: 'Ichigo Kurosaki', shikai: 'Zangetsu', bankaiName: 'Tensa Zangetsu',
  blurb: 'Power compressed into speed. Flash steps leave afterimages, and the opponent tracks where he was: their turns, attacks and guard lag a beat behind him.',
  speed: 5.0, bankaiStats: { speed: 7.6 },
  moves: {
    shikai: buildMoves({ reach: 1.3, dmg: 1.05 }),            // the giant cleaver: long reach
    bankai: buildMoves({ startup: -1 }),                        // thin black blade: quick
  },
  special(f, w) {
    const black = f.bankai;
    f.cd.special = black ? 100 : 130;
    return {
      name: 'getsuga', startup: black ? 9 : 14, active: 2, recovery: 18,
      fire: (f, w) => shoot(f, w, {
        kind: black ? 'getsugaBlack' : 'getsuga', x: f.x + f.facing * 40, vx: f.facing * (black ? 15 : 11),
        w: black ? 60 : 44, h: black ? 150 : 120, damage: black ? 110 : 80, kb: 10, kby: -4, stun: 30, guardDmg: 40,
      }),
    };
  },
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
  bankaiTick(f, opp) { opp.fx.outpaced = 2; },
  aiSpecial(f, opp, dist, cpu) {
    return dist > 260 && projectileWorthIt(opp, cpu) ? (f.bankai ? 'Black Getsuga Tensho!' : 'Getsuga Tensho!') : null;
  },
});

// ---------------------------------------------------------------- Byakuya
const BYAKUYA = character({
  id: 'byakuya', name: 'Byakuya Kuchiki', shikai: 'Senbonzakura', bankaiName: 'Senbonzakura Kageyoshi',
  blurb: 'A million blades. They shred incoming projectiles and drift as clouds that cut and slow anyone inside, herding the opponent into Gokei.',
  moves: { shikai: buildMoves(), bankai: buildMoves({ reach: 1.1 }) },
  special(f, w) {
    if (!f.bankai) {
      f.cd.special = 110;
      return {
        name: 'senbonzakura', startup: 12, active: 2, recovery: 20,
        fire: (f, w) => shoot(f, w, { kind: 'petals', x: f.x + f.facing * 60, vx: f.facing * 8.5, w: 100, h: 70, damage: 22, kb: 3, stun: 14, guardDmg: 10, life: 80, hits: 3, hitEvery: 8 }),
      };
    }
    const opp = f.opp;
    const clouds = w.zones.filter(z => z.owner === f && z.kind === 'petals');
    const holding = clouds.find(z => z.inside);
    if (holding && f.cd.gokei <= 0) {
      f.cd.special = 40;
      f.cd.gokei = 540;
      return { name: 'gokei', startup: 10, active: 2, recovery: 20, fire: (f, w) => w.startGokei(f, opp, holding) };
    }
    f.cd.special = 70;
    return {
      name: 'kageyoshi', startup: 10, active: 2, recovery: 16,
      fire(f, w) {
        if (clouds.length >= 2) clouds[0].dead = true;
        w.addZone({
          owner: f, kind: 'petals', x: f.x + f.facing * 60, y: f.y - 70, r: 100, life: 420, seek: 3.4, seekSlow: 1.1, hazard: true,
          effect(z, t, w) { w.damage(z.owner, t, 0.33); t.fx.lacerated = 8; },
        });
      },
    };
  },
  // The blades swarm around him and intercept anything thrown at him.
  bankaiTick(f, opp, w) {
    for (const p of w.projectiles) {
      if (p.owner === f || p.dead) continue;
      if (Math.hypot(p.x - f.x, p.y - (f.y - 60)) < 175) {
        p.dead = true;
        w.burst(p.x, p.y, '#f8b4d0', 18);
        w.say(f, 'PETAL GUARD', '#fbd');
        w.emit({ type: 'negated', by: f, owner: p.owner });
      }
    }
  },
  aiSpecial(f, opp, dist, cpu, w) {
    if (!f.bankai) return dist > 240 && projectileWorthIt(opp, cpu) ? 'Scatter, Senbonzakura!' : null;
    const clouds = w.zones.filter(z => z.owner === f && z.kind === 'petals');
    if (f.cd.gokei <= 0 && clouds.some(z => z.inside)) return 'Gokei!';
    return clouds.length < 2 ? 'Kageyoshi!' : null;
  },
});

// ---------------------------------------------------------------- Toshiro
const TOSHIRO = character({
  id: 'toshiro', name: 'Toshiro Hitsugaya', shikai: 'Hyorinmaru', bankaiName: 'Daiguren Hyorinmaru',
  blurb: 'The battlefield turns to ice. The opponent loses traction and slides, and every hit builds frost that slows their body until they freeze solid.',
  hp: 950, speed: 5.5, jump: 18, dashSpeed: 16, height: 104,
  moves: {
    shikai: buildMoves({ reach: 1.05, dmg: 0.95 }),
    bankai: buildMoves({ reach: 1.15, dmg: 0.95, onHit: (f, t, w, m) => addFrost(w, t, m.name === 'heavy' ? 30 : 16) }),
  },
  special(f, w) {
    if (!f.bankai) {
      f.cd.special = 120;
      return {
        name: 'dragon', startup: 14, active: 2, recovery: 20,
        fire: (f, w) => shoot(f, w, { kind: 'dragon', y: f.y - 60, vx: f.facing * 9.5, w: 90, h: 70, damage: 60, kb: 8, kby: -3, stun: 26, guardDmg: 30, onHit: (f, t, w) => addFrost(w, t, 30) }),
      };
    }
    // Hyoten Hyakkaso: snowflakes fall around the opponent; each touch blooms into ice.
    f.cd.special = 140;
    return {
      name: 'hyakkaso', startup: 12, active: 2, recovery: 18,
      fire(f, w) {
        const opp = f.opp;
        for (let i = 0; i < 7; i++) {
          shoot(f, w, {
            kind: 'flake', x: opp.x + (i - 3) * 42 + (w.rng() - 0.5) * 20, y: GROUND - 420 - w.rng() * 160, vy: 3 + w.rng() * 2.2,
            w: 26, h: 26, damage: 12, stun: 8, kb: 0, guardDmg: 6, life: 240, anySide: true, dieOnGround: true, onHit: (f, t, w) => addFrost(w, t, 32),
          });
        }
      },
    };
  },
  bankaiStart(f, w) { w.ice = f; },
  bankaiEnd(f, w) { if (w.ice === f) w.ice = null; },
  aiSpecial(f, opp, dist, cpu) {
    if (f.bankai) return dist < 520 ? 'Hyoten Hyakkaso!' : null;
    return dist > 240 && projectileWorthIt(opp, cpu) ? 'Hyorinmaru!' : null;
  },
});

// ---------------------------------------------------------------- Mayuri
const JIZO_LUNGE = { damage: 60, stun: 26, kb: 9, kby: -5, guardDmg: 30, onHit: (f, t, w) => addToxin(w, t, 30) };

function gasZone(owner, extra) {
  return Object.assign({ owner, kind: 'gas', r: 190, rate: 0.42, hazard: true, effect: (z, t, w) => addToxin(w, t, z.rate) }, extra);
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

const MAYURI = character({
  id: 'mayuri', name: 'Mayuri Kurotsuchi', shikai: 'Ashisogi Jizo', bankaiName: 'Konjiki Ashisogi Jizo',
  blurb: 'A giant golden Jizo crawls after the opponent breathing nerve poison. As it builds they lose jumping, then dashing, then their arms, then everything.',
  speed: 4.9, jump: 16, dashSpeed: 14,
  moves: { shikai: buildMoves({ reach: 1.2 }), bankai: buildMoves({ reach: 1.2 }) },
  special(f, w) {
    if (!f.bankai) {
      // A cut from Ashisogi Jizo leaves the struck limb unable to move.
      f.cd.special = 150;
      return {
        name: 'jizoStab', startup: 12, active: 4, recovery: 22, reach: 150, height: 40, yOff: 85,
        damage: 45, stun: 30, kb: 5, guardDmg: 20, lunge: 7,
        onHit(f, t, w) {
          if (w.rng() < 0.5) { t.fx.numbLegs = 240; w.say(t, 'LEGS PARALYZED', '#d9f'); }
          else { t.fx.numbArms = 240; w.say(t, 'ARMS PARALYZED', '#d9f'); }
        },
      };
    }
    const jizo = summonOf(w, f, 'jizo');
    if (!jizo) return null;
    f.cd.special = 200;
    return { name: 'jizoLunge', startup: 8, active: 2, recovery: 14, fire: () => { jizo.lunge = 24; } };
  },
  bankaiStart(f, w) {
    const jizo = w.addSummon({ owner: f, kind: 'jizo', x: clamp(f.x - f.facing * 120, ARENA_L + 100, ARENA_R - 100), y: GROUND, w: 200, h: 190, dir: f.facing, lunge: 0, update: jizoUpdate });
    w.addZone(gasZone(f, { follow: jizo }));
  },
  aiSpecial(f, opp, dist, cpu, w) {
    if (!f.bankai) return dist < 170 ? 'Ashisogi Jizo!' : null;
    const jizo = summonOf(w, f, 'jizo');
    return jizo && Math.abs(opp.x - jizo.x) < 380 ? 'Go, Jizo!' : null;
  },
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
  blurb: 'Higa Zekko: floating fangs pen the opponent into a narrow cage they cannot walk out of, then snap shut, and no guard covers that. They can only tear out with a dash, and the fangs bite.',
  hp: 1050, speed: 4.9, height: 126,
  moves: { shikai: buildMoves({ reach: 1.45 }), bankai: buildMoves({ reach: 1.7, dmg: 1.05 }) },
  special(f, w) {
    if (!f.bankai) {
      f.cd.special = 120;
      return { name: 'zabimaru', startup: 13, active: 4, recovery: 22, reach: 270, height: 40, yOff: 85, damage: 60, stun: 26, kb: 8, guardDmg: 25 };
    }
    const cage = summonOf(w, f, 'cage');
    if (cage) {
      if (cage.closing) return null;
      f.cd.special = 60;
      return { name: 'zekko', startup: 8, active: 2, recovery: 18, fire: () => { cage.closing = 36; } };
    }
    f.cd.special = 90;
    return {
      name: 'higaZekko', startup: 12, active: 2, recovery: 16,
      fire(f, w) {
        const t = f.opp, cx = clamp(t.x, ARENA_L + CAGE_HALF, ARENA_R - CAGE_HALF);
        w.addSummon({ owner: f, kind: 'cage', cx, left: cx - CAGE_HALF, right: cx + CAGE_HALF, life: 330, closing: 0, update: cageUpdate });
        w.say(t, 'CAGED BY FANGS', '#ff8a7a');
      },
    };
  },
  victimHints(f, t, w) {
    const cage = summonOf(w, f, 'cage');
    return cage && !cage.escaped ? { penned: cage } : null;
  },
  aiSpecial(f, opp, dist, cpu, w) {
    if (!f.bankai) return dist < 280 && dist > 120 ? 'Roar, Zabimaru!' : null;
    const cage = summonOf(w, f, 'cage');
    if (!cage) return 'Higa Zekko!';
    return !cage.closing && cage.age > 45 && opp.x > cage.left && opp.x < cage.right ? 'Snap shut!' : null;
  },
});

// ---------------------------------------------------------------- Rukia
const RUKIA = character({
  id: 'rukia', name: 'Rukia Kuchiki', shikai: 'Sode no Shirayuki', bankaiName: 'Hakka no Togame',
  blurb: 'She becomes absolute zero. Inside her white mist every movement builds frost, so the opponent must hold still or creep. Striking her body freezes the attacker.',
  hp: 900, speed: 5.4, jump: 18, dashSpeed: 16, height: 108, bankaiSeconds: 12,
  moves: { shikai: buildMoves({ reach: 1.05, dmg: 0.95 }), bankai: buildMoves({ reach: 1.05, dmg: 0.95, onHit: (f, t, w) => addFrost(w, t, 12) }) },
  special(f, w) {
    if (!f.bankai) {
      f.cd.special = 120;
      return {
        name: 'hakuren', startup: 14, active: 2, recovery: 20,
        fire: (f, w) => shoot(f, w, { kind: 'hakuren', vx: f.facing * 8, w: 120, h: 110, damage: 55, kb: 6, stun: 26, guardDmg: 25, onHit: (f, t, w) => addFrost(w, t, 30) }),
      };
    }
    f.cd.special = 180;
    return {
      name: 'flashFreeze', startup: 14, active: 2, recovery: 18,
      fire(f, w) {
        const mist = zoneOf(w, f, 'mist');
        if (mist && mist.inside) addFrost(w, f.opp, 45);
        w.ring(f.x, f.y - 60, 230, '#eaf8ff');
      },
    };
  },
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
  aiSpecial(f, opp, dist, cpu) {
    if (!f.bankai) return dist > 220 && projectileWorthIt(opp, cpu) ? 'Tsugi no mai, Hakuren!' : null;
    return dist < 230 ? 'Hakka no Togame.' : null;
  },
});

// ---------------------------------------------------------------- Kenpachi
const KENPACHI = character({
  id: 'kenpachi', name: 'Kenpachi Zaraki', shikai: 'Nozarashi', bankaiName: 'Nameless Bankai',
  blurb: 'His body turns demonic and his swings cut through anything: blocking is useless and hits do not stagger him. The opponent has to stop guarding and start evading. (Its name was never revealed.)',
  hp: 1150, speed: 4.8, jump: 16, dashSpeed: 14, height: 132, armor: true,
  moves: { shikai: buildMoves({ reach: 1.2, dmg: 1.1 }), bankai: buildMoves({ reach: 1.3, dmg: 1.1, unblockable: true }) },
  special(f, w) {
    if (!f.bankai) {
      f.cd.special = 150;
      return { name: 'nozarashi', startup: 18, active: 5, recovery: 26, reach: 150, height: 120, yOff: 130, damage: 130, stun: 36, kb: 14, kby: -8, guardDmg: 70 };
    }
    f.cd.special = 160;
    return {
      name: 'cleave', startup: 16, active: 2, recovery: 24,
      fire(f, w) {
        shoot(f, w, { kind: 'cleave', y: GROUND - 80, vx: f.facing * 13, w: 70, h: 160, damage: 140, kb: 12, kby: -6, stun: 34, unblockable: true, life: 90 });
        w.shake = 10;
      },
    };
  },
  bankaiTick(f, opp, w) { w.damage(opp, f, 0.12); }, // the transformation tears at his own body
  aiSpecial(f, opp, dist) {
    if (!f.bankai) return dist < 160 ? 'Nozarashi!' : null;
    return dist > 200 ? 'Cut it all down!' : null;
  },
});

// ---------------------------------------------------------------- Shunsui
const SHUNSUI = character({
  id: 'shunsui', name: 'Shunsui Kyoraku', shikai: 'Katen Kyokotsu', bankaiName: 'Katen Kyokotsu: Karamatsu Shinju',
  blurb: 'A tragic play. Act one shares wounds: whatever he suffers, the opponent suffers too, so hitting him is self-harm. The final act, Itodome, strangles with thread.',
  speed: 5.1, dashSpeed: 16, height: 126, bankaiSeconds: 15,
  moves: { shikai: buildMoves({ reach: 1.1 }), bankai: buildMoves({ reach: 1.1, dmg: 0.85 }) },
  special(f, w) {
    if (!f.bankai) {
      f.cd.special = 120;
      return { name: 'bushogoma', startup: 12, active: 2, recovery: 18, fire: (f, w) => shoot(f, w, { kind: 'bushogoma', vx: f.facing * 9, w: 70, h: 70, damage: 55, kb: 7, stun: 24 }) };
    }
    f.cd.special = 200;
    return {
      name: 'itodome', startup: 14, active: 2, recovery: 20,
      fire: (f, w) => shoot(f, w, {
        kind: 'thread', vx: f.facing * 13, w: 60, h: 30, damage: 10, stun: 10, kb: 0, guardDmg: 15,
        onHit(f, t, w) { w.trap(f, t, 90, 1.0, 'itodome'); w.say(t, 'ITODOME', '#f7a8c8'); },
      }),
    };
  },
  onHitTaken(f, src, dmg, hit, w) {
    w.damage(f, src, dmg);
    w.say(src, 'SHARED WOUND', '#f7a8c8');
    w.emit({ type: 'mirrored', by: f, target: src });
  },
  aiSpecial(f, opp, dist, cpu) {
    if (!f.bankai) return dist > 240 && projectileWorthIt(opp, cpu) ? 'Bushogoma!' : null;
    return dist < 600 ? 'Final act: Itodome.' : null;
  },
});

// ---------------------------------------------------------------- Yamamoto
const YAMAMOTO = character({
  id: 'yamamoto', name: 'Genryusai Yamamoto', shikai: 'Ryujin Jakka', bankaiName: 'Zanka no Tachi',
  blurb: 'Every flame folds into the blade. The air around him scorches and touching him burns the attacker. Keep your distance and the burnt dead of Kaka Jumanokushi rise to hold you.',
  hp: 1100, speed: 4.6, jump: 16, dashSpeed: 14, height: 118, bankaiSeconds: 15,
  moves: { shikai: buildMoves({ reach: 1.15, dmg: 1.05 }), bankai: buildMoves({ reach: 1.15, dmg: 1.05 }) },
  special(f, w) {
    const t = f.opp;
    if (!f.bankai) {
      f.cd.special = 140;
      return { name: 'jokaku', startup: 12, active: 2, recovery: 20, fire: (f, w) => w.addStrike({ owner: f, kind: 'fire', x: t.x, width: 120, delay: 30, hit: { damage: 75, stun: 28, kb: 4, kby: -10, guardDmg: 30, anySide: true } }) };
    }
    f.cd.special = 200;
    return {
      name: 'kaka', startup: 14, active: 2, recovery: 20,
      fire: (f, w) => w.addStrike({
        owner: f, kind: 'skeletons', x: t.x, width: 160, delay: 40,
        hit: { damage: 30, stun: 10, kb: 0, guardDmg: 20, anySide: true, onHit(f, t, w) { w.trap(f, t, 100, 0.8, 'skeletons'); w.say(t, 'KAKA JUMANOKUSHI', '#ffb070'); } },
      }),
    };
  },
  bankaiStart(f, w) {
    w.addZone({ owner: f, kind: 'heat', follow: f, r: 250, hazard: true, effect(z, t, w) { w.damage(f, t, 0.22); } });
  },
  onHitTaken(f, src, dmg, hit, w, melee) {
    if (!melee) return;
    w.damage(f, src, dmg * 0.7);
    w.say(src, 'BURNED', '#ff9a4a');
    w.emit({ type: 'burned', by: f, target: src });
  },
  aiSpecial(f, opp, dist) {
    if (!f.bankai) return dist > 200 ? 'Ryujin Jakka!' : null;
    return dist > 250 ? 'Kaka Jumanokushi.' : null;
  },
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

function reticleUpdate(r, w, t) {
  const dx = t.x - r.x, dy = t.y - t.h / 2 - r.y, d = Math.hypot(dx, dy);
  if (d > 1) { r.x += dx / d * Math.min(2.6, d); r.y += dy / d * Math.min(2.6, d); }
  r.lock = d < 70 ? Math.min(90, r.lock + 1) : Math.max(0, r.lock - 3);
}

const SOIFON = character({
  id: 'soifon', name: 'Soi Fon', shikai: 'Suzumebachi', bankaiName: 'Jakuho Raikoben',
  blurb: 'A missile launcher bolted to her arm. A lock-on reticle stalks the opponent, and the longer they stay inside it the bigger the blast, so they can never stop moving.',
  hp: 900, speed: 5.6, jump: 18, dashSpeed: 18, height: 112,
  moves: { shikai: buildMoves({ dmg: 0.8, startup: -1 }), bankai: buildMoves({ dmg: 0.8, startup: -1 }) },
  special(f, w) {
    if (!f.bankai) {
      f.cd.special = 90;
      return { name: 'suzumebachi', startup: 6, active: 3, recovery: 14, reach: 110, height: 40, yOff: 90, damage: 25, stun: 18, kb: 2, guardDmg: 10, lunge: 9, onHit: suzumebachi };
    }
    const ret = summonOf(w, f, 'reticle');
    if (!ret) return null;
    f.cd.special = 240;
    return {
      name: 'raikoben', startup: 30, active: 2, recovery: 30,
      fire(f, w) {
        const lock = ret.lock / 90;
        w.addStrike({ owner: f, kind: 'missile', x: ret.x, width: 300, delay: 24, shake: 16, hit: { damage: 60 + 180 * lock, stun: 40, kb: 14, kby: -12, guardDmg: 80, anySide: true } });
        ret.lock = 0;
      },
    };
  },
  bankaiStart(f, w) {
    const t = f.opp;
    w.addSummon({ owner: f, kind: 'reticle', x: t.x, y: t.y - t.h / 2, lock: 0, update: reticleUpdate });
  },
  victimHints(f, t, w) {
    const r = summonOf(w, f, 'reticle');
    return r && Math.abs(r.x - t.x) < 130 ? { keepMoving: true, dashNow: r.lock > 40 } : null;
  },
  aiSpecial(f, opp, dist, cpu, w) {
    if (!f.bankai) return dist < 130 ? (opp.fx.homonka > 0 ? 'Nigeki Kessatsu!' : 'Sting all enemies to death!') : null;
    const r = summonOf(w, f, 'reticle');
    return r && r.lock > 70 ? 'Jakuho Raikoben!' : null;
  },
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
  blurb: 'A colossal armoured giant mirrors his swings across the whole arena. Its shadow marks where the blade will land, and the opponent has to read it and get out from under it.',
  hp: 1050, speed: 4.4, jump: 15, dashSpeed: 13, height: 140,
  moves: { shikai: buildMoves({ reach: 1.2, dmg: 1.05 }), bankai: buildMoves({ reach: 1.2, dmg: 1.05 }) },
  special(f, w) {
    const t = f.opp;
    if (!f.bankai) {
      f.cd.special = 130;
      return { name: 'tenken', startup: 12, active: 2, recovery: 20, fire: (f, w) => w.addStrike({ owner: f, kind: 'tenken', x: t.x, width: 110, delay: 26, hit: { damage: 80, stun: 28, kb: 6, kby: -6, guardDmg: 35, anySide: true } }) };
    }
    f.cd.special = 150;
    return { name: 'myooSlam', startup: 10, active: 2, recovery: 18, fire: (f, w) => w.addStrike({ owner: f, kind: 'giant', x: t.x, width: 260, delay: 42, shake: 14, hit: GIANT_HIT }) };
  },
  bankaiStart(f, w) { w.addSummon({ owner: f, kind: 'giant', x: f.x - f.facing * 160, timer: 120, update: giantUpdate }); },
  aiSpecial(f, opp, dist) {
    if (!f.bankai) return dist > 160 ? 'Tenken!' : null;
    return 'Kokujo Tengen Myo-o!';
  },
});

// ---------------------------------------------------------------- Unohana
const UNOHANA = character({
  id: 'unohana', name: 'Retsu Unohana', shikai: 'Minazuki', bankaiName: 'Minazuki',
  blurb: 'Her cuts bleed, and they bleed faster the harder the victim exerts themselves. The opponent has to stop running and dashing, while she heals from every wound she opens.',
  speed: 5.2, dashSpeed: 16, height: 124,
  moves: { shikai: buildMoves({ reach: 1.1 }), bankai: buildMoves({ reach: 1.2 }) },
  special(f, w) {
    if (!f.bankai) {
      f.cd.special = 300;
      return { name: 'heal', startup: 20, active: 40, recovery: 10, fire(f, w) { w.heal(f, 100); w.say(f, 'MINAZUKI HEALS', '#9fe0b0'); } };
    }
    f.cd.special = 130;
    return { name: 'bloodWave', startup: 12, active: 2, recovery: 18, fire: (f, w) => shoot(f, w, { kind: 'blood', vx: f.facing * 10, w: 80, h: 100, damage: 45, kb: 6, stun: 24, onHit: (f, t) => addBleed(t, 2) }) };
  },
  onHitDealt(f, t, dmg, hit, w) {
    addBleed(t, 1);
    w.heal(f, dmg * 0.6);
  },
  aiSpecial(f, opp, dist) {
    if (!f.bankai) return f.hp < f.maxHp * 0.7 && dist > 250 ? 'Minazuki.' : null;
    return dist > 200 ? 'Minazuki.' : null;
  },
});

// ---------------------------------------------------------------- Gin
const GIN = character({
  id: 'gin', name: 'Gin Ichimaru', shikai: 'Shinso', bankaiName: 'Kamishini no Yari',
  blurb: 'A blade that crosses the whole arena in an instant, so keeping distance is pointless. A hit leaves a sliver inside that he can dissolve at will. The opponent must rush him and keep him busy.',
  hp: 950, speed: 5.3, dashSpeed: 16, height: 124,
  moves: { shikai: buildMoves({ reach: 1.1 }), bankai: buildMoves({ reach: 1.1 }) },
  special(f, w) {
    const t = f.opp;
    if (!f.bankai) {
      f.cd.special = 120;
      return { name: 'shinso', startup: 10, active: 3, recovery: 22, reach: 380, height: 24, yOff: 82, damage: 50, stun: 22, kb: 5, guardDmg: 20 };
    }
    if (t.fx.fragment > 0) {
      f.cd.special = 60;
      return {
        name: 'korose', startup: 6, active: 2, recovery: 20,
        fire(f, w) {
          if (t.fx.fragment <= 0) return;
          t.fx.fragment = 0;
          w.damage(f, t, 170);
          w.say(t, 'KOROSE: CELLS DISSOLVING', '#e0e6f0');
          w.burst(t.x, t.y - t.h / 2, '#c9a0ff', 30, 7);
          w.shake = 10;
        },
      };
    }
    f.cd.special = 70;
    return {
      name: 'kamishini', startup: 10, active: 3, recovery: 16, reach: 1150, height: 24, yOff: 82, damage: 60, stun: 22, kb: 4, guardDmg: 25,
      onHit(f, t, w) { t.fx.fragment = 420; w.say(t, 'A SLIVER STAYS INSIDE', '#e0e6f0'); },
    };
  },
  victimHints(f, t) { return { rush: true, urgent: t.fx.fragment > 0 }; },
  aiSpecial(f, opp, dist) {
    if (!f.bankai) return dist < 380 && dist > 120 ? 'Shoot to kill, Shinso.' : null;
    if (opp.fx.fragment > 0) return 'Korose.';
    return dist > 150 ? 'Kamishini no Yari.' : null;
  },
});

// ---------------------------------------------------------------- Tosen
const SUZUMUSHI_HIT = { damage: 30, stun: 45, kb: 2, guardDmg: 20, anySide: true };

const TOSEN = character({
  id: 'tosen', name: 'Kaname Tosen', shikai: 'Suzumushi', bankaiName: 'Suzumushi Tsuishiki: Enma Korogi',
  blurb: "A dome that strips away sight, hearing, smell and spiritual sense. Inside it the opponent can't see him or turn to face him, and has to guess from the sound of his blade.",
  speed: 5.2, dashSpeed: 16, height: 124,
  moves: { shikai: buildMoves({ reach: 1.15, dmg: 1.05 }), bankai: buildMoves({ reach: 1.15, dmg: 1.05 }) },
  special(f, w) {
    if (!f.bankai) {
      f.cd.special = 140;
      return {
        name: 'suzumushi', startup: 12, active: 2, recovery: 20,
        fire(f, w) {
          const t = f.opp;
          if (Math.hypot(t.x - f.x, t.y - f.y) < 170) w.applyHit(f, t, SUZUMUSHI_HIT, sign(f.x - t.x));
          w.ring(f.x, f.y - 60, 170, '#b9a6ff');
        },
      };
    }
    if (zoneOf(w, f, 'dome')) return null;
    f.cd.special = 700;
    return {
      name: 'enmaKorogi', startup: 14, active: 2, recovery: 18,
      fire: (f, w) => w.addZone({ owner: f, kind: 'dome', x: f.x, y: GROUND, r: 330, life: 600, hazard: true, effect(z, t) { t.fx.blind = 2; } }),
    };
  },
  aiSpecial(f, opp, dist, cpu, w) {
    if (!f.bankai) return dist < 160 ? 'Cry, Suzumushi.' : null;
    return dist < 300 ? 'Enma Korogi.' : null;
  },
});

// ---------------------------------------------------------------- Shinji
function flipInversion(f, w) {
  f.inverting = !f.inverting;
  f.flipT = 180 + Math.floor(w.rng() * 150);
  w.say(f.opp, f.inverting ? 'INVERTED' : 'FLIPPED BACK?!', '#ffe08a');
}

const SHINJI = character({
  id: 'shinji', name: 'Shinji Hirako', shikai: 'Sakanade', bankaiName: 'Sakashima Yokoshima Happofusagari',
  blurb: 'An inverted world. Left and right swap for the opponent, and so do up and down (jump and guard). Just as they adapt, Shinji flips it back. The harder they think, the deeper they fall.',
  speed: 5.3, dashSpeed: 16, height: 122,
  special(f, w) {
    if (!f.bankai) {
      f.cd.special = 160;
      return {
        name: 'sakanade', startup: 12, active: 2, recovery: 18,
        fire: (f, w) => shoot(f, w, {
          kind: 'scent', vx: f.facing * 6, w: 130, h: 110, damage: 20, kb: 2, stun: 14, guardDmg: 10, life: 120,
          onHit(f, t, w) { t.fx.inverted = 240; w.say(t, 'WORLD INVERTED', '#ffe08a'); },
        }),
      };
    }
    f.cd.special = 90;
    return { name: 'flip', startup: 6, active: 2, recovery: 10, fire: (f, w) => flipInversion(f, w) };
  },
  bankaiStart(f) { f.inverting = true; f.flipT = 300; },
  bankaiTick(f, opp, w) {
    if (--f.flipT <= 0) flipInversion(f, w);
    if (f.inverting) opp.fx.inverted = 2;
  },
  aiSpecial(f, opp, dist, cpu, w) {
    if (!f.bankai) return dist > 200 && dist < 600 && projectileWorthIt(opp, cpu) ? 'Collapse, Sakanade.' : null;
    const adapted = Math.abs(opp.vx) > 1 && sign(opp.vx) === sign(f.x - opp.x); // they're walking straight at him again
    return adapted ? 'Which way is up?' : null;
  },
});

// ---------------------------------------------------------------- Rose
const ROSE = character({
  id: 'rose', name: 'Rojuro Otoribashi', shikai: 'Kinshara', bankaiName: 'Kinshara Butodan',
  blurb: "A stage of music-driven illusions. Golden phantoms fly at the opponent alongside the real attacks and look identical, so they waste guards and jumps on attacks that aren't there. Only the real ones cast a shadow.",
  height: 128,
  moves: { shikai: buildMoves({ reach: 1.3, dmg: 1.05 }), bankai: buildMoves({ reach: 1.3, dmg: 1.05 }) },
  special(f, w) {
    if (!f.bankai) {
      f.cd.special = 110;
      return { name: 'kinshara', startup: 12, active: 4, recovery: 20, reach: 250, height: 50, yOff: 95, damage: 55, stun: 24, kb: 6, guardDmg: 22 };
    }
    f.cd.special = 120;
    return {
      name: 'finale', startup: 12, active: 2, recovery: 18,
      fire(f, w) {
        const real = Math.floor(w.rng() * 3);
        for (let i = 0; i < 3; i++) {
          shoot(f, w, { kind: 'kinshara', y: f.y - 40 - i * 45, vx: f.facing * 9, wait: i * 10, w: 80, h: 44, damage: 55, kb: 6, stun: 24, guardDmg: 20, fake: i !== real });
        }
      },
    };
  },
  bankaiStart(f) { f.illusionT = 60; },
  bankaiTick(f, opp, w) {
    if (--f.illusionT > 0) return;
    f.illusionT = 90 + Math.floor(w.rng() * 60);
    shoot(f, w, { kind: 'kinshara', y: f.y - 40 - w.rng() * 90, vx: f.facing * 9, w: 80, h: 44, damage: 0, fake: true });
  },
  aiSpecial(f, opp, dist) {
    if (!f.bankai) return dist < 260 && dist > 110 ? 'Play, Kinshara.' : null;
    return dist > 150 ? 'Grand finale.' : null;
  },
});

// ---------------------------------------------------------------- Kensei
const KENSEI = character({
  id: 'kensei', name: 'Kensei Muguruma', shikai: 'Tachikaze', bankaiName: 'Tekken Tachikaze',
  blurb: "Brass knuckles that hit with shockwaves. Every blow concusses: the opponent's inputs arrive late, so their timing, blocks and escapes all lag a beat behind.",
  hp: 1050, speed: 5.3, height: 122,
  moves: { shikai: buildMoves({ reach: 1.1 }), bankai: buildMoves({ reach: 0.85, startup: -2 }) },
  special(f, w) {
    if (!f.bankai) {
      f.cd.special = 110;
      return { name: 'tachikaze', startup: 11, active: 2, recovery: 18, fire: (f, w) => shoot(f, w, { kind: 'wind', vx: f.facing * 12, w: 40, h: 110, damage: 55, kb: 7, stun: 24 }) };
    }
    f.cd.special = 110;
    return {
      name: 'shockwave', startup: 10, active: 2, recovery: 18,
      fire: (f, w) => shoot(f, w, { kind: 'shockwave', x: f.x + f.facing * 60, vx: f.facing * 14, life: 16, w: 150, h: 130, damage: 70, kb: 12, stun: 30, guardDmg: 50, onHit: (f, t) => { t.fx.dazed = 200; } }),
    };
  },
  onHitDealt(f, t, dmg, hit, w) {
    if (t.fx.dazed <= 0) w.say(t, 'CONCUSSED', '#bfe0ff');
    t.fx.dazed = Math.max(t.fx.dazed, 150);
  },
  aiSpecial(f, opp, dist, cpu) {
    if (!f.bankai) return dist > 220 && projectileWorthIt(opp, cpu) ? 'Tachikaze!' : null;
    return dist < 260 ? 'Shockwave!' : null;
  },
});

// ---------------------------------------------------------------- Ikkaku
const IKKAKU = character({
  id: 'ikkaku', name: 'Ikkaku Madarame', shikai: 'Hozukimaru', bankaiName: 'Ryumon Hozukimaru',
  blurb: 'Three giant blades and a dragon crest that fills red with every clash, hits given and taken alike, until his strength doubles. Trading blows feeds him, so the opponent has to disengage and wait it out.',
  hp: 1050, speed: 5.1, height: 124,
  moves: { shikai: buildMoves({ reach: 1.2 }), bankai: buildMoves({ reach: 1.3, dmg: 1.05, startup: 1 }) },
  damageMul: f => 1 + f.crest / 100,
  special(f, w) {
    if (!f.bankai) {
      f.cd.special = 110;
      return { name: 'hozukimaru', startup: 11, active: 4, recovery: 20, reach: 200, height: 50, yOff: 70, damage: 60, stun: 24, kb: 7, guardDmg: 22 };
    }
    const full = f.crest >= 100;
    f.cd.special = 150;
    return {
      name: full ? 'dragonRoar' : 'spin', startup: 14, active: 2, recovery: 22,
      fire(f, w) {
        const t = f.opp, r = full ? 200 : 140;
        if (Math.abs(t.x - f.x) < r && Math.abs(t.y - f.y) < 160) {
          w.applyHit(f, t, { damage: full ? 160 : 70, stun: 34, kb: 12, kby: -8, guardDmg: 50, anySide: true }, sign(f.x - t.x));
        }
        w.ring(f.x, f.y - 60, r, '#ff5a3a');
        if (full) { f.crest = 40; w.say(f, 'THE DRAGON ROARS', '#ff7a5a'); }
      },
    };
  },
  bankaiStart(f) { f.crest = 0; },
  onHitDealt(f, t, dmg) { f.crest = Math.min(100, f.crest + dmg * 0.1); },
  onHitTaken(f, src, dmg) { f.crest = Math.min(100, f.crest + dmg * 0.1); },
  victimHints(f) { return f.crest >= 40 ? { stall: true } : null; },
  aiSpecial(f, opp, dist) {
    if (!f.bankai) return dist < 210 && dist > 100 ? 'Extend, Hozukimaru!' : null;
    return dist < 200 ? (f.crest >= 100 ? 'Ryumon Hozukimaru!' : 'Spin!') : null;
  },
});

// ---------------------------------------------------------------- Sasakibe
const SKY_BOLT = { damage: 45, stun: 30, kb: 0, kby: 8, guardDmg: 20, unblockable: true };
const GROUND_BOLT = { damage: 55, stun: 28, kb: 4, kby: -6, guardDmg: 25, anySide: true };

const SASAKIBE = character({
  id: 'sasakibe', name: 'Chojiro Sasakibe', shikai: 'Gonryomaru', bankaiName: 'Koko Gonryo Rikyu',
  blurb: 'He commands the lightning of the whole sky. Anyone who leaves the ground is struck, so the opponent loses jumping entirely, and bolts keep raining on marked ground across the arena.',
  hp: 950,
  moves: { shikai: buildMoves({ reach: 1.1 }), bankai: buildMoves({ reach: 1.1 }) },
  special(f, w) {
    if (!f.bankai) {
      f.cd.special = 110;
      return { name: 'gonryomaru', startup: 8, active: 3, recovery: 18, reach: 150, height: 30, yOff: 85, damage: 45, stun: 40, kb: 3, guardDmg: 18, lunge: 6 };
    }
    f.cd.special = 160;
    const t = f.opp;
    return {
      name: 'storm', startup: 12, active: 2, recovery: 18,
      fire(f, w) {
        for (let i = 0; i < 4; i++) {
          w.addStrike({ owner: f, kind: 'lightning', x: t.x + (i - 1.5) * 120 + (w.rng() - 0.5) * 40, width: 80, delay: 45 + i * 6, hit: GROUND_BOLT });
        }
      },
    };
  },
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
  aiSpecial(f, opp, dist) {
    if (!f.bankai) return dist < 150 ? 'Gonryomaru!' : null;
    return 'Koko Gonryo Rikyu.';
  },
});

// ---------------------------------------------------------------- Kisuke
const KISUKE = character({
  id: 'kisuke', name: 'Kisuke Urahara', shikai: 'Benihime', bankaiName: 'Kannonbiraki Benihime Aratame',
  blurb: 'Restructures whatever it touches. A hit tears down an active bankai, or else seals one of the opponent\'s tools: light or heavy attacks, special, dash or jump. He can restructure his own wounds too.',
  speed: 5.2, dashSpeed: 16, height: 124,
  special(f, w) {
    if (!f.bankai) {
      f.cd.special = 110;
      return { name: 'nake', startup: 12, active: 2, recovery: 18, fire: (f, w) => shoot(f, w, { kind: 'benihime', vx: f.facing * 12, w: 60, h: 60, damage: 60, kb: 7, stun: 24 }) };
    }
    if (f.hp >= f.maxHp * 0.6) {
      f.cd.special = 100;
      return { name: 'nake', startup: 12, active: 2, recovery: 18, fire: (f, w) => shoot(f, w, { kind: 'benihime', vx: f.facing * 12, w: 70, h: 70, damage: 50, kb: 7, stun: 24 }) };
    }
    f.cd.special = 300;
    return {
      name: 'restructure', startup: 20, active: 2, recovery: 16,
      fire(f, w) { w.heal(f, f.maxHp * 0.15); f.fx = freshStatus(); w.say(f, 'RESTRUCTURED', '#ff8a9a'); },
    };
  },
  bankaiTick(f) { if (f.sealCd > 0) f.sealCd--; },
  onHitDealt(f, t, dmg, hit, w) {
    if (t.bankai) {
      w.endBankai(t);
      w.say(t, 'BANKAI TAKEN APART', '#ff8a9a');
      return;
    }
    if (f.sealCd > 0) return;
    const s = t.fx, open = ['light', 'heavy', 'special', 'dash', 'jump'].filter(a => s.sealed[a] <= 0);
    if (!open.length) return;
    const a = open[Math.floor(w.rng() * open.length)];
    s.sealed[a] = a === 'light' ? 240 : 420;
    f.sealCd = 60;
    w.say(t, a.toUpperCase() + ' SEALED', '#ff8a9a');
  },
  aiSpecial(f, opp, dist, cpu) {
    if (!f.bankai) return dist > 230 && projectileWorthIt(opp, cpu) ? 'Awaken, Benihime.' : null;
    return f.hp < f.maxHp * 0.6 ? 'Restructure.' : dist > 200 && projectileWorthIt(opp, cpu) ? 'Kannonbiraki.' : null;
  },
});

// ---------------------------------------------------------------- Ichibe
function eraseName(f, t, w) {
  const s = t.fx, next = ['special', 'dash', 'jump'].find(a => !s.erased[a]);
  if (next) { s.erased[next] = true; w.say(t, `"${next.toUpperCase()}" ERASED`, '#eee'); }
  else if (!s.renamed) { s.renamed = true; w.say(t, 'RENAMED: POWER HALVED', '#eee'); }
}

const ICHIBE = character({
  id: 'ichibe', name: 'Ichibe Hyosube', shikai: 'Ichimonji', bankaiName: 'Shirafude Ichimonji',
  blurb: 'Ink that blots out names and a brush that writes new ones. Each stroke erases one of the opponent\'s abilities for the rest of the bankai (special, then dash, then jump), then renames them into something weak.',
  hp: 1150, speed: 4.5, jump: 15, height: 132,
  moves: { shikai: buildMoves({ reach: 1.25, dmg: 1.05 }), bankai: buildMoves({ reach: 1.25, dmg: 1.05 }) },
  special(f, w) {
    if (!f.bankai) {
      f.cd.special = 140;
      return {
        name: 'ichimonji', startup: 12, active: 2, recovery: 18,
        fire: (f, w) => shoot(f, w, { kind: 'ink', vx: f.facing * 9, w: 90, h: 90, damage: 40, kb: 4, stun: 22, onHit(f, t, w) { t.fx.sealed.special = 300; w.say(t, 'NAME BLOTTED OUT', '#ddd'); } }),
      };
    }
    f.cd.special = 160;
    return { name: 'shirafude', startup: 12, active: 2, recovery: 18, fire: (f, w) => shoot(f, w, { kind: 'whiteInk', vx: f.facing * 10, w: 100, h: 100, damage: 40, kb: 4, stun: 22, onHit: eraseName }) };
  },
  bankaiEnd(f) {
    const s = f.opp.fx;
    s.erased = { special: false, dash: false, jump: false };
    s.renamed = false;
  },
  aiSpecial(f, opp, dist, cpu) {
    if (!f.bankai) return dist > 200 && projectileWorthIt(opp, cpu) ? 'Ichimonji.' : null;
    return dist > 150 && !opp.fx.renamed ? 'Shirafude Ichimonji.' : null;
  },
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
  blurb: 'A great loom weaves threads through the arena. Brushing one snares the opponent, so they have to pick their way through the gaps, and she can re-weave the lattice tight around them.',
  height: 126,
  moves: { shikai: buildMoves({ reach: 1.15 }), bankai: buildMoves({ reach: 1.15 }) },
  special(f, w) {
    if (!f.bankai) {
      f.cd.special = 100;
      return {
        name: 'needles', startup: 10, active: 2, recovery: 18,
        fire(f, w) {
          for (let i = -1; i <= 1; i++) shoot(f, w, { kind: 'needle', y: f.y - 70 + i * 22, vx: f.facing * 13, vy: i * 0.8, w: 30, h: 10, damage: 18, kb: 2, stun: 12, guardDmg: 6 });
        },
      };
    }
    f.cd.special = 200;
    return { name: 'weave', startup: 12, active: 2, recovery: 18, fire(f, w) { const loom = zoneOf(w, f, 'loom'); if (loom) weaveAround(loom, f.opp.x); } };
  },
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
  aiSpecial(f, opp, dist, cpu) {
    if (!f.bankai) return dist > 200 && projectileWorthIt(opp, cpu) ? 'Needlework.' : null;
    return dist > 160 ? 'Re-weave.' : null;
  },
});

const CHARACTERS = [
  ICHIGO, BYAKUYA, TOSHIRO, MAYURI, RENJI, RUKIA, KENPACHI, SHUNSUI, YAMAMOTO, SOIFON, KOMAMURA,
  UNOHANA, GIN, TOSEN, SHINJI, ROSE, KENSEI, IKKAKU, SASAKIBE, KISUKE, ICHIBE, SENJUMARU,
];
