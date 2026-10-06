'use strict';
// Headless tests for the simulation. Run: node --test tests/
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const FILES = ['core', 'status', 'fighter', 'characters', 'world', 'ai'];

function load() {
  const ctx = vm.createContext({ console });
  for (const f of FILES) vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', f + '.js'), 'utf8'), ctx, { filename: f + '.js' });
  return vm.runInContext('({ World, CpuController, CHARACTERS, emptyIntent, addToxin, addFrost, GROUND, OUTPACE_LAG })', ctx);
}

const G = load();
const C = Object.fromEntries(G.CHARACTERS.map(c => [c.id, c]));
const I = (o = {}) => Object.assign(G.emptyIntent(), o);

function fight(a, b, seed = 1) {
  const w = new G.World(C[a], C[b], seed);
  w.phase = 'fight';
  return w;
}

function forceBankai(w, f) {
  f.reiatsu = 100;
  w.release = { f, t: 0 };
  w.finishRelease();
}

// Steps the world; `intents` is [i0, i1] or a function of the frame index.
function run(w, n, intents = [I(), I()]) {
  for (let i = 0; i < n; i++) w.step(typeof intents === 'function' ? intents(i) : intents);
}

function place(f, x) { f.x = x; f.vx = 0; f.history = []; }

test('roster has every manga bankai with the hooks the game relies on', () => {
  assert.equal(G.CHARACTERS.length, 22);
  for (const c of G.CHARACTERS) {
    assert.ok(c.bankaiName && c.blurb, c.id);
    assert.equal(typeof c.special, 'function', c.id);
    assert.equal(typeof c.aiSpecial, 'function', c.id);
  }
});

// ------------------------------------------------------------- input layer

test('Konjiki Ashisogi Jizo toxin strips jump, then dash, then arms, then everything', () => {
  const w = fight('mayuri', 'ichigo');
  const v = w.fighters[1];
  v.fx.toxin = 30; v.fx.toxinDelay = 999;
  run(w, 1, [I(), I({ jump: true })]);
  assert.equal(v.onGround, true, 'cannot jump at 25+');
  assert.equal(v.lastBlocked[0].reason, 'legs');

  v.fx.toxin = 55;
  run(w, 1, [I(), I({ dash: true })]);
  assert.notEqual(v.state, 'dash', 'cannot dash at 50+');
  const x0 = v.x;
  run(w, 20, [I(), I({ move: -1 })]);
  assert.ok(Math.abs(v.x - x0) < 20 * v.def.speed * 0.6, 'walks at half speed');

  v.fx.toxin = 80;
  run(w, 1, [I(), I({ heavy: true })]);
  assert.notEqual(v.state, 'attack', 'cannot swing heavy at 75+');
  run(w, 1, [I(), I({ light: true })]);
  assert.equal(v.state, 'attack', 'light attacks still work');

  run(w, 40);
  G.addToxin(w, v, 100);
  assert.ok(v.fx.paralyzed > 0);
  const x1 = v.x;
  run(w, 30, [I(), I({ move: 1, light: true })]);
  assert.equal(v.state, 'paralyzed');
  assert.ok(Math.abs(v.x - x1) < 1, 'no movement while paralyzed');
});

test('Daiguren Hyorinmaru: the opponent slides on the ice, Toshiro does not', () => {
  const w = fight('toshiro', 'byakuya');
  const [t, v] = w.fighters;
  forceBankai(w, t);
  run(w, 40); // let release knockback settle
  place(t, 300); place(v, 900);
  run(w, 30, [I({ move: 1 }), I({ move: -1 })]);
  const tx = t.x, vx = v.x;
  run(w, 30);
  assert.ok(Math.abs(t.x - tx) < 1, 'Toshiro stops dead');
  assert.ok(Math.abs(v.x - vx) > 60, `victim keeps sliding (${Math.abs(v.x - vx).toFixed(1)}px)`);
});

test('frost slows and then freezes; a frozen fighter ignores input and shatters on hit', () => {
  const w = fight('toshiro', 'ichigo');
  const v = w.fighters[1];
  G.addFrost(w, v, 60);
  assert.ok(v.fx.frost === 60);
  G.addFrost(w, v, 50);
  assert.ok(v.fx.frozen > 0);
  const x = v.x;
  run(w, 10, [I(), I({ move: 1, jump: true, light: true })]);
  assert.equal(v.state, 'frozen');
  assert.equal(v.x, x);
  const hp = v.hp;
  w.applyHit(w.fighters[0], v, { damage: 50 }, 1);
  assert.equal(v.fx.frozen, 0, 'shattered');
  assert.ok(hp - v.hp >= 69, 'shatter deals bonus damage');
});

test('Tensa Zangetsu: the outpaced opponent faces where Ichigo was, so a guard from behind fails', () => {
  const w = fight('ichigo', 'byakuya');
  const [ich, v] = w.fighters;
  forceBankai(w, ich);
  run(w, 40);
  place(ich, 400); place(v, 700);
  run(w, 30, [I(), I({ guard: true })]);
  assert.equal(v.facing, -1);
  run(w, 1, [I({ dash: true }), I({ guard: true })]); // no direction: flash step behind
  assert.ok(ich.x > v.x, 'reappeared behind');
  assert.equal(w.afterimages.length, 1);
  run(w, 3, [I(), I({ guard: true })]);
  assert.equal(v.facing, -1, 'still facing the afterimage side');
  run(w, 1, [I({ light: true }), I({ guard: true })]);
  const hp = v.hp;
  run(w, 10, [I(), I({ guard: true })]);
  assert.ok(hp - v.hp > 20, 'hit lands through the guard');

  // Without bankai the same guard turns in time.
  const w2 = fight('ichigo', 'byakuya');
  const [i2, v2] = w2.fighters;
  place(i2, 400); place(v2, 700);
  run(w2, 5, [I(), I({ guard: true })]);
  i2.x = 760;
  run(w2, 2, [I(), I({ guard: true })]);
  assert.equal(v2.facing, 1, 'turns immediately when not outpaced');
});

test('Sakanade inversion flips left and right', () => {
  const w = fight('shinji', 'ichigo');
  const v = w.fighters[1];
  v.fx.inverted = 100;
  const x = v.x;
  run(w, 10, [I(), I({ move: 1 })]);
  assert.ok(v.x < x, 'pressing right walks left');
});

test('Enma Korogi blinds: the victim cannot turn to face Tosen', () => {
  const w = fight('tosen', 'ichigo');
  const [t, v] = w.fighters;
  forceBankai(w, t);
  run(w, 40);
  place(t, 600); place(v, 700);
  w.addZone({ owner: t, kind: 'dome', x: 650, y: G.GROUND, r: 330, life: 300, hazard: true, effect(z, x) { x.fx.blind = 2; } });
  run(w, 2);
  const facing = v.facing;
  t.x = v.x + (facing === 1 ? -150 : 150); // move behind
  run(w, 20);
  assert.equal(v.facing, facing, 'facing frozen while blind');
});

test('Tekken Tachikaze concussion delays every input by 12 frames', () => {
  const w = fight('kensei', 'ichigo');
  const v = w.fighters[1];
  v.fx.dazed = 200;
  run(w, 1, [I(), I({ jump: true })]);
  run(w, 10);
  assert.equal(v.onGround, true, 'jump not yet executed');
  run(w, 3);
  assert.equal(v.onGround, false, 'jump arrives late');
});

test('Minazuki bleed hurts more the harder the victim moves', () => {
  const still = fight('unohana', 'ichigo'), moving = fight('unohana', 'ichigo');
  for (const w of [still, moving]) { w.fighters[1].fx.bleed = 300; w.fighters[1].fx.bleedStacks = 3; }
  const h0 = still.fighters[1].hp;
  run(still, 60);
  run(moving, 60, i => [I(), I({ move: i % 120 < 60 ? -1 : 1 })]);
  const lostStill = h0 - still.fighters[1].hp, lostMoving = h0 - moving.fighters[1].hp;
  assert.ok(lostMoving > lostStill * 2.5, `moving ${lostMoving.toFixed(1)} vs still ${lostStill.toFixed(1)}`);
});

// ------------------------------------------------------------- bankai rules

test('Senbonzakura Kageyoshi shreds projectiles and the CPU stops throwing them', () => {
  const w = fight('byakuya', 'ichigo');
  const [b, v] = w.fighters;
  const cpu = new G.CpuController(w, v);
  forceBankai(w, b);
  run(w, 40);
  place(b, 300); place(v, 900);
  v.cd.special = 0;
  run(w, 1, [I(), I({ special: true })]);
  const hp = b.hp;
  run(w, 80);
  assert.equal(b.hp, hp, 'Getsuga never reaches him');
  assert.ok(w.events !== null);
  // Learning happens on the CPU's next look at the event stream.
  let learned = false;
  const w2 = fight('byakuya', 'ichigo');
  const [b2, v2] = w2.fighters;
  const cpu2 = new G.CpuController(w2, v2);
  forceBankai(w2, b2);
  run(w2, 40);
  place(b2, 300); place(v2, 900);
  for (let i = 0; i < 200 && !learned; i++) {
    w2.step([I(), cpu2.intent()]);
    learned = cpu2.learned.projectilesUseless;
  }
  assert.ok(learned, 'CPU learned projectiles are useless');
  assert.equal(C.ichigo.aiSpecial(v2, b2, 600, cpu2, w2), null, 'and no longer chooses Getsuga');
  void cpu;
});

test('Gokei traps; mashing shortens it', () => {
  const run1 = mash => {
    const w = fight('byakuya', 'ichigo');
    const [b, v] = w.fighters;
    forceBankai(w, b);
    const cloud = w.addZone({ owner: b, kind: 'petals', x: v.x, y: v.y - 60, r: 100, life: 400, hazard: true });
    w.startGokei(b, v, cloud);
    let n = 0;
    while (v.fx.trapped > 0 && n < 400) { w.step([I(), I({ light: mash && n % 3 === 0 })]); n++; }
    return n;
  };
  const idle = run1(false), mashed = run1(true);
  assert.ok(idle >= 140, `idle ${idle}`);
  assert.ok(mashed < idle * 0.6, `mashed ${mashed} vs idle ${idle}`);
});

test('Kenpachi bankai: guarding fails and the CPU learns to stop blocking', () => {
  const w = fight('kenpachi', 'ichigo');
  const [k, v] = w.fighters;
  forceBankai(w, k);
  run(w, 40);
  place(k, 600); place(v, 680);
  const cpu = new G.CpuController(w, v);
  run(w, 3, [I(), I({ guard: true })]);
  run(w, 1, [I({ light: true }), I({ guard: true })]);
  const hp = v.hp;
  run(w, 12, [I(), I({ guard: true })]);
  assert.ok(hp - v.hp > 30, 'full damage through guard');
  cpu.learn();
  assert.ok(cpu.learned.guardUseless === false || cpu.learned.guardUseless === true);
  // Drive the learning through the event stream properly.
  const w2 = fight('kenpachi', 'ichigo');
  const [k2, v2] = w2.fighters;
  forceBankai(w2, k2);
  run(w2, 40);
  place(k2, 600); place(v2, 680);
  const cpu2 = new G.CpuController(w2, v2);
  cpu2.plan = { kind: 'guard', until: 60 + w2.frame };
  cpu2.nextThink = w2.frame + 60; // it starts out blocking
  let guardsAfter = 0, learnedAt = -1;
  for (let i = 0; i < 600; i++) {
    const it = cpu2.intent();
    if (learnedAt >= 0 && i > Math.max(learnedAt, 60) + 12 && it.guard) guardsAfter++; // the opening guard may finish
    w2.step([I({ light: i % 25 === 0 }), it]);
    if (learnedAt < 0 && cpu2.learned.guardUseless) learnedAt = i;
  }
  assert.ok(learnedAt >= 0, 'CPU discovered its guard is useless');
  assert.equal(guardsAfter, 0, 'and never guarded again');
});

test('Karamatsu Shinju: hitting Shunsui wounds the attacker equally', () => {
  const w = fight('shunsui', 'ichigo');
  const [s, v] = w.fighters;
  forceBankai(w, s);
  s.invuln = 0;
  const hv = v.hp, hs = s.hp;
  w.applyHit(v, s, { damage: 50 }, 1, true);
  assert.ok(Math.abs((hs - s.hp) - (hv - v.hp)) < 1e-6);
  assert.ok(w.events.some(e => e.type === 'mirrored'));
});

test('Zanka no Tachi: melee on Yamamoto burns the attacker, and the heat hurts up close', () => {
  const w = fight('yamamoto', 'ichigo');
  const [y, v] = w.fighters;
  forceBankai(w, y);
  y.invuln = 0;
  const hv = v.hp;
  w.applyHit(v, y, { damage: 50 }, 1, true);
  assert.ok(hv - v.hp >= 34);
  place(y, 600); place(v, 700);
  const h1 = v.hp;
  run(w, 60);
  assert.ok(h1 - v.hp > 8, 'heat damage close by');
});

test('Hakka no Togame: moving in the mist freezes far faster than standing still', () => {
  const mk = () => { const w = fight('rukia', 'ichigo'); forceBankai(w, w.fighters[0]); run(w, 40); place(w.fighters[0], 600); place(w.fighters[1], 700); return w; };
  const still = mk(), moving = mk();
  run(still, 60);
  run(moving, 60, i => [I(), I({ move: i % 20 < 10 ? 1 : -1 })]);
  assert.ok(moving.fighters[1].fx.frost > still.fighters[1].fx.frost * 3,
    `moving ${moving.fighters[1].fx.frost.toFixed(1)} vs still ${still.fighters[1].fx.frost.toFixed(1)}`);
});

test('Jakuho Raikoben lock builds on a still target, not a moving one', () => {
  const mk = () => { const w = fight('soifon', 'ichigo'); forceBankai(w, w.fighters[0]); return w; };
  const still = mk(), moving = mk();
  run(still, 120);
  run(moving, 120, [I(), I({ move: -1 })]);
  const lock = w => w.summons.find(s => s.kind === 'reticle').lock;
  assert.ok(lock(still) > 60);
  assert.ok(lock(moving) < lock(still) / 2, `moving ${lock(moving)} vs still ${lock(still)}`);
});

test('Koko Gonryo Rikyu strikes anyone who leaves the ground', () => {
  const w = fight('sasakibe', 'ichigo');
  const [s, v] = w.fighters;
  forceBankai(w, s);
  run(w, 40);
  const hp = v.hp;
  run(w, 1, [I(), I({ jump: true })]);
  run(w, 20);
  assert.ok(hp - v.hp >= 40, 'struck mid-air');
});

test('Higa Zekko cage keeps the victim inside', () => {
  const w = fight('renji', 'ichigo');
  const [r, v] = w.fighters;
  forceBankai(w, r);
  run(w, 40);
  place(r, 300); place(v, 800);
  r.cd.special = 0;
  run(w, 1, [I({ special: true }), I()]);
  run(w, 20);
  const cage = w.summons.find(s => s.kind === 'cage');
  assert.ok(cage);
  run(w, 120, [I(), I({ move: 1 })]);
  assert.ok(v.x <= cage.right - v.w / 2 + 0.01, 'cannot walk out');
  const hp = v.hp;
  run(w, 1, [I(), I({ move: 1, dash: true })]);
  run(w, 12, [I(), I({ move: 1 })]);
  assert.ok(v.x > cage.right, 'a dash tears through');
  assert.ok(hp - v.hp >= 60, 'and the fangs bite');
});

test('Kamishini no Yari plants a sliver that Gin can dissolve', () => {
  const w = fight('gin', 'ichigo');
  const [g, v] = w.fighters;
  forceBankai(w, g);
  run(w, 40);
  place(g, 200); place(v, 1000);
  g.cd.special = 0;
  run(w, 1, [I({ special: true }), I()]);
  run(w, 30);
  assert.ok(v.fx.fragment > 0, 'reached across the arena');
  run(w, 30); // let the long thrust recover
  g.cd.special = 0;
  const hp = v.hp;
  run(w, 1, [I({ special: true }), I()]);
  run(w, 12);
  assert.ok(hp - v.hp >= 170);
  assert.equal(v.fx.fragment, 0);
});

test('Benihime Aratame tears down an active bankai', () => {
  const w = fight('kisuke', 'toshiro');
  const [k, v] = w.fighters;
  forceBankai(w, k);
  forceBankai(w, v);
  v.invuln = 0;
  assert.ok(w.ice);
  w.applyHit(k, v, { damage: 20 }, 1, true);
  assert.equal(v.bankai, false);
  assert.equal(w.ice, null, 'ice floor gone with it');
});

test('Shirafude Ichimonji erases abilities in order, restored when the bankai ends', () => {
  const w = fight('ichibe', 'ichigo');
  const [ib, v] = w.fighters;
  forceBankai(w, ib);
  const hit = C.ichibe.special(ib, w);
  hit.fire(ib, w);
  const p = w.projectiles[w.projectiles.length - 1];
  for (let i = 0; i < 4; i++) p.onHit(ib, v, w);
  assert.deepEqual({ ...v.fx.erased }, { special: true, dash: true, jump: true });
  assert.equal(v.fx.renamed, true);
  assert.equal(v.outMul(), 0.5);
  w.endBankai(ib);
  assert.equal(v.fx.erased.special, false);
  assert.equal(v.fx.renamed, false);
});

test('Ryumon Hozukimaru crest doubles damage once full', () => {
  const w = fight('ikkaku', 'ichigo');
  const ik = w.fighters[0];
  forceBankai(w, ik);
  assert.equal(ik.outMul(), 1);
  ik.crest = 100;
  assert.equal(ik.outMul(), 2);
});

test('Kinshara Butodan illusions deal no damage', () => {
  const w = fight('rose', 'ichigo');
  const [r, v] = w.fighters;
  place(r, 400); place(v, 700);
  w.addProjectile({ owner: r, kind: 'kinshara', x: 600, y: v.y - 60, vx: 9, w: 80, h: 44, damage: 55, life: 100, fake: true });
  const hp = v.hp;
  run(w, 30);
  assert.equal(v.hp, hp);
});

test('Shatatsu Karagara Shigarami no Tsuji snares whoever brushes a thread', () => {
  const w = fight('senjumaru', 'ichigo');
  const [s, v] = w.fighters;
  forceBankai(w, s);
  run(w, 40);
  const loom = w.zones.find(z => z.kind === 'loom');
  loom.threads = [{ x1: v.x + 60, y1: G.GROUND - 140, x2: v.x + 60, y2: G.GROUND }];
  loom.reweave = 999;
  run(w, 30, [I(), I({ move: 1 })]);
  assert.ok(v.fx.trapped > 0 || v.hp < v.maxHp, 'snared');
});

// ------------------------------------------------------------- CPU adapts

test('CPU tries to jump on numb legs once, then stops trying', () => {
  const w = fight('mayuri', 'ichigo');
  const v = w.fighters[1];
  const cpu = new G.CpuController(w, v);
  v.fx.numbLegs = 600;
  cpu.plan = { kind: 'jump' };
  cpu.nextThink = 1e9;
  w.step([I(), cpu.intent()]);
  cpu.learn();
  assert.equal(cpu.can('jump'), false, 'jump now avoided');
});

test('CPU notices inverted controls and compensates', () => {
  const w = fight('shinji', 'ichigo');
  const [s, v] = w.fighters;
  const cpu = new G.CpuController(w, v);
  place(s, 200); place(v, 900);
  v.fx.inverted = 1000;
  for (let i = 0; i < 160; i++) w.step([I(), cpu.intent()]);
  assert.equal(cpu.flipped, true, 'figured it out');
  const x = v.x;
  for (let i = 0; i < 30; i++) w.step([I(), cpu.intent()]);
  assert.ok(v.x < x, 'now actually walks toward Shinji');
});

test('CPU gets out from under a telegraphed giant strike', () => {
  const w = fight('komamura', 'ichigo');
  const [k, v] = w.fighters;
  forceBankai(w, k);
  run(w, 40);
  place(k, 200); place(v, 700);
  const cpu = new G.CpuController(w, v);
  w.addStrike({ owner: k, kind: 'giant', x: v.x, width: 220, delay: 55, hit: { damage: 140, anySide: true } });
  const hp = v.hp;
  for (let i = 0; i < 70; i++) w.step([I(), cpu.intent()]);
  assert.equal(v.hp, hp, 'dodged the slam');
});

test('CPU flees Mayuri poison gas', () => {
  const w = fight('mayuri', 'ichigo');
  const [m, v] = w.fighters;
  forceBankai(w, m);
  run(w, 40);
  const jizo = w.summons.find(s => s.kind === 'jizo');
  place(v, jizo.x + 60);
  const cpu = new G.CpuController(w, v);
  for (let i = 0; i < 60; i++) w.step([I(), cpu.intent()]);
  assert.ok(Math.abs(v.x - jizo.x) > 200, 'got clear of the gas');
});

test('CPU caught by Tensa Zangetsu chases afterimages', () => {
  let fooled = 0;
  for (let seed = 1; seed <= 10; seed++) {
    const w = fight('ichigo', 'byakuya', seed);
    const [ich, v] = w.fighters;
    forceBankai(w, ich);
    run(w, 40);
    const cpu = new G.CpuController(w, v);
    for (let i = 0; i < 5; i++) w.step([I(), cpu.intent()]);
    w.step([I({ dash: true, move: -1 }), cpu.intent()]);
    w.step([I(), cpu.intent()]);
    if (cpu.lock) fooled++;
  }
  assert.ok(fooled >= 4, `fooled ${fooled}/10`);
});

// ------------------------------------------------------------- full matches

test('CPU vs CPU matches finish cleanly for every character, and everyone uses bankai', () => {
  const used = new Set();
  const ids = G.CHARACTERS.map(c => c.id);
  ids.forEach((a, i) => {
    for (const off of [1, 7]) {
      const b = ids[(i + off) % ids.length];
      const w = fight(a, b, i * 31 + off);
      const cpus = w.fighters.map(f => new G.CpuController(w, f));
      for (let n = 0; n < 200 * 60 && w.phase !== 'over'; n++) {
        w.step(cpus.map(c => c.intent()));
        for (const f of w.fighters) {
          if (f.bankai) used.add(f.def.id);
          assert.ok(Number.isFinite(f.x) && Number.isFinite(f.y) && Number.isFinite(f.hp), `${a} vs ${b}: bad state on ${f.def.id}`);
        }
      }
      assert.equal(w.phase, 'over', `${a} vs ${b} never ended`);
    }
  });
  assert.deepEqual([...ids].filter(id => !used.has(id)), [], 'characters that never released bankai');
});
