'use strict';
// Status effects are how a bankai changes the opponent's behaviour. Every
// intent, from a keyboard or from the CPU, passes through filterIntent before
// the fighter acts on it, so the same rules bind humans and the AI.

function freshStatus() {
  return {
    frost: 0, frostDelay: 0, frozen: 0, frostImmune: 0,  // Daiguren Hyorinmaru, Hakka no Togame
    toxin: 0, toxinDelay: 0, paralyzed: 0, paraImmune: 0, // Konjiki Ashisogi Jizo
    numbLegs: 0, numbArms: 0,                             // Ashisogi Jizo cuts
    outpaced: 0,                                          // Tensa Zangetsu
    lacerated: 0,                                         // Senbonzakura Kageyoshi
    trapped: 0, trapX: 0, trapY: 0, trapKind: '', trapDps: 0, trapBy: null, // Gokei, Itodome, skeletons, threads
    inverted: 0,                                          // Sakanade / Sakashima Yokoshima Happofusagari
    blind: 0,                                             // Enma Korogi
    dazed: 0,                                             // Tekken Tachikaze: concussion delays every input
    bleed: 0, bleedStacks: 0,                             // Minazuki
    fragment: 0,                                          // Kamishini no Yari
    homonka: 0,                                           // Suzumebachi
    sealed: { special: 0, dash: 0, jump: 0, heavy: 0, light: 0 }, // Benihime Aratame
    erased: { special: false, dash: false, jump: false }, // Shirafude Ichimonji
    renamed: false, renamedT: 0,
    disease: 0, drowning: 0,                              // Karamatsu Shinju acts two and three
    reversed: 0, selfCut: 0,                              // Sakanade: front and back swap, swings cut yourself
    onIce: false,
  };
}

function incapacitated(s) { return s.frozen > 0 || s.paralyzed > 0 || s.trapped > 0; }
function canJump(s) { return s.numbLegs <= 0 && s.toxin < 25; }
function legsDead(s) { return s.numbLegs > 0 || s.toxin >= 50; }
function armsDead(s) { return s.numbArms > 0 || s.toxin >= 75; }

// Why an action can't happen right now, or null if it can.
function blockReason(s, action) {
  if (s.frozen > 0) return 'frozen';
  if (s.paralyzed > 0) return 'paralyzed';
  if (s.trapped > 0) return 'trapped';
  if (s.erased[action]) return 'erased';
  if (s.sealed[action] > 0) return 'sealed';
  if (action === 'jump' && !canJump(s)) return 'legs';
  if (action === 'dash' && legsDead(s)) return 'legs';
  if ((action === 'heavy' || action === 'special' || action === 'guard') && armsDead(s)) return 'arms';
  return null;
}

function filterIntent(f, raw) {
  const s = f.fx, intent = emptyIntent(), blocked = [];
  const guardHeld = raw.guard;
  if (s.inverted > 0) {
    // Up is down: guarding jumps, and jumping throws up a brief guard.
    if (raw.jump) f.invertedGuard = 24;
    raw = Object.assign({}, raw, { jump: raw.guard && !f.guardHeldPrev, guard: f.invertedGuard > 0 });
  }
  if (f.invertedGuard > 0) f.invertedGuard--;
  intent.move = incapacitated(s) ? 0 : s.inverted > 0 ? -raw.move : raw.move;
  for (const a of ACTIONS) {
    if (!raw[a]) continue;
    const why = blockReason(s, a);
    if (!why) intent[a] = true;
    else if (a !== 'guard' || !f.guardHeldPrev) blocked.push({ action: a, reason: why }); // guard is held; report the attempt once
  }
  f.guardHeldPrev = guardHeld;
  return { intent, blocked };
}

function speedMul(s) {
  let m = 1 - 0.5 * (s.frost / 100);
  if (legsDead(s)) m *= 0.5;
  if (s.lacerated > 0) m *= 0.55;
  if (s.drowning > 0) m *= 0.7;
  return m;
}

// Frost slows everything a fighter does: attacks, recovery and hitstun.
function timeScale(s) { return 1 - 0.45 * (s.frost / 100); }

const TIMED = ['frozen', 'frostImmune', 'paralyzed', 'paraImmune', 'numbLegs', 'numbArms', 'outpaced', 'lacerated',
  'inverted', 'blind', 'dazed', 'bleed', 'fragment', 'homonka', 'renamedT', 'disease', 'drowning', 'reversed', 'selfCut'];

function tickStatus(s) {
  for (const k of TIMED) if (s[k] > 0) s[k]--;
  for (const k in s.sealed) if (s.sealed[k] > 0) s.sealed[k]--;
  if (s.bleed <= 0) s.bleedStacks = 0;
  if (s.frostDelay > 0) s.frostDelay--; else s.frost = Math.max(0, s.frost - 0.12);
  if (s.toxinDelay > 0) s.toxinDelay--; else s.toxin = Math.max(0, s.toxin - 0.15);
}

function addFrost(world, f, amount) {
  const s = f.fx;
  if (s.frozen > 0 || s.frostImmune > 0 || f.state === 'ko') return;
  s.frost = Math.min(100, s.frost + amount);
  s.frostDelay = 90;
  if (s.frost >= 100) {
    s.frost = 0;
    s.frozen = 100;
    s.frostImmune = 100 + 150;
    f.interrupt();
    world.damage(world.opponentOf(f), f, 50);
    world.say(f, 'FROZEN SOLID', '#aef');
  }
}

const TOXIN_STAGES = [[25, 'LEGS GOING NUMB'], [50, "CAN'T FEEL LEGS"], [75, 'ARMS GOING NUMB']];

function addToxin(world, f, amount) {
  const s = f.fx;
  if (s.paralyzed > 0 || f.state === 'ko') return;
  const before = s.toxin;
  s.toxin = Math.min(s.paraImmune > 0 ? 99 : 100, s.toxin + amount);
  s.toxinDelay = 30;
  for (const [t, msg] of TOXIN_STAGES) if (before < t && s.toxin >= t) world.say(f, msg, '#d9f');
  if (s.toxin >= 100) {
    s.toxin = 40;
    s.paralyzed = 110;
    s.paraImmune = 110 + 180;
    f.interrupt();
    world.say(f, 'FULLY PARALYZED', '#d9f');
  }
}

function addBleed(f, stacks) {
  const s = f.fx;
  s.bleedStacks = Math.min(3, s.bleedStacks + stacks);
  s.bleed = 300;
}

// Damage over time from bankai abilities: cold, nerve poison, disease, bleeding.
function statusDamage(f) {
  const s = f.fx;
  return bleedRate(f) + s.frost * 0.0025 + s.toxin * 0.004 + (s.disease > 0 ? 0.3 : 0);
}

// Bleeding gets worse the harder the victim exerts themselves.
function bleedRate(f) {
  const s = f.fx;
  if (s.bleed <= 0) return 0;
  const exertion = 0.4 + Math.abs(f.vx) / 4 + (f.onGround ? 0 : 1) + (f.state === 'dash' ? 3 : 0);
  return 0.05 * s.bleedStacks * exertion;
}
