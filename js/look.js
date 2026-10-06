'use strict';
// How each fighter looks and how their body is posed this frame. Shared by
// the 3D scene and the 2D overlay; no drawing happens here.

const LOOKS = {
  ichigo: { skin: '#f0c8a0', hair: '#ff8a1e', style: 'spiky', weapon: 'cleaver', blade: 76, aura: '#e8323c' },
  byakuya: { skin: '#f3d6bd', hair: '#121218', style: 'long', haori: true, scarf: '#d9d4ef', kenseikan: true, weapon: 'katana', blade: 64, aura: '#f6a8c8' },
  toshiro: { skin: '#f3d6bd', hair: '#e9eef4', style: 'spiky', haori: true, strap: '#2e8f68', weapon: 'katana', blade: 62, aura: '#8fe3ff' },
  mayuri: { skin: '#f6f6f6', hair: '#2b48c8', style: 'mayuri', haori: true, scarf: '#6b3fa0', weapon: 'trident', blade: 68, aura: '#c98bff' },
  renji: { skin: '#efc7a2', hair: '#c9212b', style: 'ponytail', bandana: true, tattoo: true, weapon: 'whip', blade: 72, aura: '#ff5a4a' },
  rukia: { skin: '#f6dcc6', hair: '#121218', style: 'bob', weapon: 'whiteKatana', blade: 60, aura: '#cfefff' },
  kenpachi: { skin: '#e9bd98', hair: '#18181e', style: 'kenpachi', haori: true, tattered: true, eyepatch: true, weapon: 'bigCleaver', blade: 84, aura: '#f2d23a' },
  shunsui: { skin: '#e9c09c', hair: '#4a3324', style: 'wavy', haori: true, kimono: '#d9558a', hat: 'straw', weapon: 'dual', blade: 58, aura: '#e47aa8' },
  yamamoto: { skin: '#e9c7a6', hair: null, style: 'bald', beard: '#f2f2f2', longBeard: true, haori: true, weapon: 'katana', blade: 66, aura: '#ff7a1a' },
  soifon: { skin: '#f3d6bd', hair: '#121218', style: 'braids', haori: true, sleeveless: true, weapon: 'stinger', blade: 20, aura: '#ffd23a' },
  komamura: { skin: '#9a6b3c', hair: '#7a5228', style: 'wolf', haori: true, weapon: 'katana', blade: 84, aura: '#ffb23a', build: 1.2 },
  unohana: { skin: '#f3d9c4', hair: '#15151b', style: 'braidFront', haori: true, weapon: 'katana', blade: 70, aura: '#c2304a' },
  gin: { skin: '#f3dcc8', hair: '#d6dce4', style: 'short', squint: true, haori: true, weapon: 'wakizashi', blade: 46, aura: '#c9d2dd' },
  tosen: { skin: '#7b5034', hair: '#16161c', style: 'dreads', visor: true, haori: true, scarf: '#e9a23b', weapon: 'katana', blade: 66, aura: '#8a6cff' },
  shinji: { skin: '#f3d6bd', hair: '#f0d36a', style: 'bobStraight', haori: true, weapon: 'ringKatana', blade: 64, aura: '#ffcf4a' },
  rose: { skin: '#f3d6bd', hair: '#f0d36a', style: 'longWavy', haori: true, weapon: 'goldWhip', blade: 66, aura: '#ffd86a' },
  kensei: { skin: '#eec6a4', hair: '#d6dce4', style: 'spiky', haori: true, sleeveless: true, weapon: 'knife', blade: 38, aura: '#9fd0ff' },
  ikkaku: { skin: '#efc7a2', hair: null, style: 'bald', redEyes: true, weapon: 'spear', blade: 88, aura: '#ff4a2a' },
  sasakibe: { skin: '#eec8a6', hair: '#a8adb4', style: 'slick', mustache: true, weapon: 'rapier', blade: 66, aura: '#ffe24a' },
  kisuke: { skin: '#f0cfae', hair: '#e6cf7a', style: 'shaggy', hat: 'bucket', robe: '#26332c', coat: '#2b2b2e', weapon: 'katana', hilt: '#b8323c', blade: 64, aura: '#d23a4a' },
  ichibe: { skin: '#d9a98a', hair: null, style: 'bald', beard: '#141414', robe: '#1b1b1b', weapon: 'brush', blade: 84, aura: '#f4f4f4', build: 1.25 },
  senjumaru: { skin: '#f3d6bd', hair: '#2a2430', style: 'updo', robe: '#3a2a4f', haori: true, haoriColor: '#e9e2f2', weapon: 'needle', blade: 42, aura: '#b98aff', extraArms: true },
};

// What changes on the body once the bankai is out.
const BANKAI_LOOKS = {
  ichigo: { coat: '#0d0c12', weapon: 'twinBlades', blade: 74 },
  byakuya: { weapon: 'hilt' },
  toshiro: { wings: true },
  renji: { weapon: 'boneSnake', pelt: true },
  rukia: { robe: '#f4f6fa', hair: '#eef3fa', frost: true },
  kenpachi: { skin: '#b8322a', horn: true },
  yamamoto: { weapon: 'charred' },
  soifon: { launcher: true },
  unohana: { drip: true },
  kensei: { weapon: 'knuckles' },
  ikkaku: { weapon: 'axes', blade: 60 },
  kisuke: { ghost: true },
  rose: { hands: true },
};

function lookOf(f) {
  const L = Object.assign({ robe: '#17161d' }, LOOKS[f.def.id], f.bankai ? BANKAI_LOOKS[f.def.id] : null);
  if (!f.bankai && f.finalBlade > 0) { L.weapon = 'originalBlade'; L.blade = 92; } // Tensa Zangetsu's shell crumbled away
  return L;
}

const ease = u => 1 - (1 - u) * (1 - u);

// Arm angles (radians, 0 = straight ahead, negative = raised) at wind-up and follow-through.
function attackAngles(m) {
  switch (m.name) {
    case 'light1': return [-2.2, 0.5];
    case 'light2': return [0.9, -1.5];
    case 'light3': return [-0.15, -0.05];
    case 'heavy': case 'kendo': case 'smash': case 'kyokujitsujin': return [-2.8, 0.9];
    case 'air': return [-2.2, 1.3];
    case 'uppercut': return [1.2, -2.2];
  }
  return m.reach ? [-0.4, -0.05] : [-1.9, 0.1]; // melee techniques thrust; others cast
}

function pose(f) {
  const st = f.state || 'idle', t = f.animT || 0;
  const p = { lean: 0, arm: -0.65 + Math.sin(t * 0.07) * 0.05, step: 0, air: f.onGround === false, reach: 0, trail: null, bob: Math.sin(t * 0.07) * 1.2 };
  if (st === 'walk') { p.step = Math.sin(t * 0.32); p.bob = -Math.abs(p.step) * 2; }
  else if (st === 'jump') p.arm = -1.0;
  else if (st === 'guard') { p.arm = -1.45; p.guard = true; }
  else if (st === 'dash') { p.lean = 0.35; p.arm = 2.5; }
  else if (st === 'hitstun' || st === 'guardbreak') { p.lean = -0.3; p.arm = 0.9; }
  else if (st === 'paralyzed') { p.lean = 0.25; p.arm = 1.3; p.tremble = true; }
  else if (st === 'ko' || st === 'knockdown') p.down = true;
  if (f.portrait) p.arm = 0.8; // blade lowered so the face shows
  if (st === 'attack' && f.move) {
    const m = f.move, k = f.moveT, [w0, e] = attackAngles(m), rest = -0.65;
    if (k < m.startup) p.arm = rest + (w0 - rest) * ease(k / m.startup);
    else if (k < m.startup + m.active) {
      p.arm = m.multi ? -0.3 + Math.sin(k * 1.3) * 0.7 : w0 + (e - w0) * ease((k - m.startup) / m.active);
      p.trail = [w0, p.arm];
      p.lean = 0.12;
      if (m.reach) p.reach = m.reach;
    } else p.arm = e + (rest - e) * ease((k - m.startup - m.active) / m.recovery);
  }
  return p;
}
