'use strict';
// All drawing. Everything is procedural canvas art, so there are no image assets.

const FONT_DISPLAY = '"Yuji Syuku", "Hiragino Mincho ProN", "Yu Mincho", Georgia, serif';
const FONT_UI = '"Barlow Condensed", "Arial Narrow", "Roboto Condensed", sans-serif';
const INK = '#0c0b14';
const PAPER = '#f1ede4';
const GOLD = '#f2c14e';
const REI = '#6fc3ff';
const BLOOD = '#d8343f';
const SIDE_COLORS = ['#ff5a4f', '#53a8ff'];

const LOOKS = {
  ichigo: { skin: '#f0c8a0', hair: '#ff8a1e', style: 'spiky', weapon: 'cleaver', blade: 76, aura: '#e8323c' },
  byakuya: { skin: '#f3d6bd', hair: '#121218', style: 'long', haori: true, scarf: '#d9d4ef', kenseikan: true, weapon: 'katana', blade: 64, aura: '#f6a8c8' },
  toshiro: { skin: '#f3d6bd', hair: '#e9eef4', style: 'spiky', haori: true, strap: '#2e8f68', weapon: 'katana', blade: 62, aura: '#8fe3ff' },
  mayuri: { skin: '#f6f6f6', hair: '#2b48c8', style: 'mayuri', haori: true, scarf: '#6b3fa0', weapon: 'trident', blade: 68, aura: '#c98bff' },
  renji: { skin: '#efc7a2', hair: '#c9212b', style: 'ponytail', bandana: true, tattoo: true, weapon: 'whip', blade: 72, aura: '#ff5a4a' },
  rukia: { skin: '#f6dcc6', hair: '#121218', style: 'bob', weapon: 'whiteKatana', blade: 60, aura: '#cfefff' },
  kenpachi: { skin: '#e9bd98', hair: '#18181e', style: 'kenpachi', haori: true, tattered: true, eyepatch: true, weapon: 'bigCleaver', blade: 84, aura: '#f2d23a' },
  shunsui: { skin: '#e9c09c', hair: '#4a3324', style: 'wavy', haori: true, kimono: '#d9558a', hat: 'straw', weapon: 'dual', blade: 58, aura: '#e47aa8' },
  yamamoto: { skin: '#e9c7a6', hair: null, style: 'bald', beard: '#f2f2f2', haori: true, weapon: 'katana', blade: 66, aura: '#ff7a1a' },
  soifon: { skin: '#f3d6bd', hair: '#121218', style: 'braids', haori: true, sleeveless: true, weapon: 'stinger', blade: 20, aura: '#ffd23a' },
  komamura: { skin: '#9a6b3c', hair: '#7a5228', style: 'wolf', haori: true, weapon: 'katana', blade: 84, aura: '#ffb23a', build: 1.2 },
  unohana: { skin: '#f3d9c4', hair: '#15151b', style: 'braidFront', haori: true, weapon: 'katana', blade: 70, aura: '#c2304a' },
  gin: { skin: '#f3dcc8', hair: '#d6dce4', style: 'short', squint: true, haori: true, weapon: 'wakizashi', blade: 46, aura: '#c9d2dd' },
  tosen: { skin: '#7b5034', hair: '#16161c', style: 'dreads', visor: true, haori: true, scarf: '#e9a23b', weapon: 'katana', blade: 66, aura: '#8a6cff' },
  shinji: { skin: '#f3d6bd', hair: '#f0d36a', style: 'bobStraight', haori: true, weapon: 'ringKatana', blade: 64, aura: '#ffcf4a' },
  rose: { skin: '#f3d6bd', hair: '#f0d36a', style: 'longWavy', haori: true, weapon: 'goldWhip', blade: 66, aura: '#ffd86a' },
  kensei: { skin: '#eec6a4', hair: '#d6dce4', style: 'spiky', haori: true, sleeveless: true, weapon: 'knife', blade: 38, aura: '#9fd0ff' },
  ikkaku: { skin: '#efc7a2', hair: null, style: 'bald', weapon: 'spear', blade: 88, aura: '#ff4a2a' },
  sasakibe: { skin: '#eec8a6', hair: '#a8adb4', style: 'slick', mustache: true, weapon: 'rapier', blade: 66, aura: '#ffe24a' },
  kisuke: { skin: '#f0cfae', hair: '#e6cf7a', style: 'shaggy', hat: 'bucket', robe: '#26332c', coat: '#2b2b2e', weapon: 'katana', hilt: '#b8323c', blade: 64, aura: '#d23a4a' },
  ichibe: { skin: '#d9a98a', hair: null, style: 'bald', beard: '#141414', robe: '#1b1b1b', weapon: 'brush', blade: 84, aura: '#f4f4f4', build: 1.25 },
  senjumaru: { skin: '#f3d6bd', hair: '#2a2430', style: 'updo', robe: '#3a2a4f', haori: true, haoriColor: '#e9e2f2', weapon: 'needle', blade: 42, aura: '#b98aff', extraArms: true },
};

// What changes on the body once the bankai is out.
const BANKAI_LOOKS = {
  ichigo: { coat: '#0d0c12', weapon: 'blackKatana', blade: 70 },
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
};

function lookOf(f) { return Object.assign({ robe: '#17161d' }, LOOKS[f.def.id], f.bankai ? BANKAI_LOOKS[f.def.id] : null); }

const ease = u => 1 - (1 - u) * (1 - u);

function attackAngles(m) {
  switch (m.name) {
    case 'light1': return [-2.2, 0.5];
    case 'light2': return [0.9, -1.5];
    case 'light3': return [-0.15, -0.05];
    case 'heavy': return [-2.8, 0.9];
    case 'air': return [-2.2, 1.3];
  }
  return m.reach ? [-0.4, -0.05] : [-1.9, 0.1]; // melee specials thrust; others cast
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
  else if (st === 'ko') p.ko = true;
  if (st === 'attack' && f.move) {
    const m = f.move, k = f.moveT, [w0, e] = attackAngles(m), rest = -0.65;
    if (k < m.startup) p.arm = rest + (w0 - rest) * ease(k / m.startup);
    else if (k < m.startup + m.active) {
      p.arm = w0 + (e - w0) * ease((k - m.startup) / m.active);
      p.trail = [w0, p.arm];
      p.lean = 0.12;
      if (m.reach) p.reach = m.reach;
    } else p.arm = e + (rest - e) * ease((k - m.startup - m.active) / m.recovery);
  }
  return p;
}

// ------------------------------------------------------------------ figure

function drawFighter(ctx, f, alpha = 1) {
  const L = lookOf(f), s = f.h / 120, P = pose(f), t = f.animT || 0;
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.translate(f.x + (P.tremble ? Math.sin(t * 2.3) * 1.5 : 0), f.y);
  if (P.ko) { ctx.translate(0, -10); ctx.rotate(-f.facing * Math.PI * 0.47); }
  ctx.scale(f.facing * s * (L.build || 1), s);
  ctx.translate(0, P.bob - 54);
  ctx.rotate(P.lean);
  ctx.translate(0, 54);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  if (L.wings) drawIceWings(ctx, f);
  if (L.ghost) drawBenihimeGhost(ctx, t);
  if (L.extraArms) drawExtraArms(ctx, t);
  if (L.coat) drawCoatTails(ctx, L.coat, t);
  if (L.style === 'long' || L.style === 'longWavy' || L.style === 'dreads') drawHairBack(ctx, L);
  if (L.scarf && L.style !== 'mayuri') drawScarf(ctx, L.scarf, t);

  // Legs (hakama)
  const lf = P.air ? [-8, -12] : [-10 + P.step * 13, 0], rf = P.air ? [10, -20] : [10 - P.step * 13, 0];
  ctx.strokeStyle = shade(L.robe, -0.15);
  ctx.lineWidth = 15;
  line(ctx, -4, -52, lf[0], lf[1]);
  ctx.strokeStyle = L.robe;
  line(ctx, 4, -52, rf[0], rf[1]);
  ctx.fillStyle = '#e8e2d4';
  ctx.fillRect(lf[0] - 6, lf[1] - 3, 12, 4);
  ctx.fillRect(rf[0] - 6, rf[1] - 3, 12, 4);

  // Haori / coat behind the torso
  if (L.haori || L.coat) {
    ctx.fillStyle = L.coat || L.haoriColor || '#f4f2ec';
    ctx.beginPath();
    ctx.moveTo(-15, -97); ctx.lineTo(15, -97); ctx.lineTo(21, -30); ctx.lineTo(-23, -30);
    ctx.closePath(); ctx.fill();
    if (L.tattered) {
      ctx.fillStyle = L.robe;
      for (let i = 0; i < 5; i++) tri(ctx, -21 + i * 9, -30, -17 + i * 9, -38, -13 + i * 9, -30);
    }
  }
  if (L.kimono) {
    ctx.fillStyle = L.kimono;
    ctx.beginPath(); ctx.moveTo(-17, -98); ctx.lineTo(-8, -98); ctx.lineTo(-10, -26); ctx.lineTo(-24, -28); ctx.closePath(); ctx.fill();
  }

  // Torso
  ctx.fillStyle = L.robe;
  roundRect(ctx, -12, -99, 24, 50, 5); ctx.fill();
  ctx.fillStyle = '#ece6d8';
  ctx.beginPath(); ctx.moveTo(-3, -99); ctx.lineTo(5, -99); ctx.lineTo(1, -84); ctx.closePath(); ctx.fill(); // collar
  ctx.fillStyle = L.sash || '#cfc8b8';
  ctx.fillRect(-12, -60, 24, 5);
  if (L.strap) { ctx.strokeStyle = L.strap; ctx.lineWidth = 4; line(ctx, -10, -98, 10, -58); }
  if (L.tattoo) { ctx.strokeStyle = '#1a1a1a'; ctx.lineWidth = 1.5; line(ctx, -6, -95, -2, -88); line(ctx, 2, -95, 6, -88); }
  if (L.pelt) { ctx.fillStyle = '#c9b48a'; ctx.beginPath(); ctx.ellipse(0, -96, 17, 7, 0, 0, Math.PI * 2); ctx.fill(); }
  if (L.drip) { ctx.fillStyle = BLOOD; for (let i = 0; i < 3; i++) ctx.fillRect(18 + i * 6, -60 + ((t * 2 + i * 13) % 50), 2, 6); }

  // Back arm (and an off-hand blade)
  ctx.strokeStyle = L.sleeveless ? L.skin : L.coat || (L.haori ? L.haoriColor || '#f4f2ec' : L.robe);
  ctx.lineWidth = 8;
  const bh = [-3 + Math.cos(P.arm + 0.4) * 18, -92 + Math.sin(P.arm + 0.4) * 18];
  line(ctx, -5, -92, bh[0], bh[1]);
  if (L.weapon === 'dual' || L.weapon === 'axes') {
    ctx.save(); ctx.translate(bh[0], bh[1]); ctx.rotate(P.arm + 0.9);
    drawWeapon(ctx, L.weapon === 'dual' ? 'wakizashi' : 'axe', L.weapon === 'dual' ? 40 : L.blade, f);
    ctx.restore();
  }

  drawHead(ctx, f, L);

  // Front arm + weapon
  const reachBonus = P.reach ? Math.min(14, P.reach / 20) : 0;
  const hand = [5 + Math.cos(P.arm) * (22 + reachBonus), -92 + Math.sin(P.arm) * (22 + reachBonus)];
  ctx.strokeStyle = L.sleeveless ? L.skin : L.coat || (L.haori ? L.haoriColor || '#f4f2ec' : L.robe);
  ctx.lineWidth = 8;
  line(ctx, 5, -92, hand[0], hand[1]);
  ctx.fillStyle = L.skin;
  circle(ctx, hand[0], hand[1], 3.5);
  if (P.trail) drawTrail(ctx, hand, P.trail, L.blade + 24, L.aura);
  ctx.save();
  ctx.translate(hand[0], hand[1]);
  ctx.rotate(P.arm);
  const extended = P.reach / s > L.blade + 50 ? P.reach / s - 10 : 0;
  drawWeapon(ctx, L.weapon, extended || L.blade, f, !!extended);
  ctx.restore();
  if (L.launcher) drawLauncher(ctx, hand);
  ctx.restore();
}

function drawHead(ctx, f, L) {
  const hx = 2, hy = -108, t = f.animT || 0;
  ctx.fillStyle = L.skin;
  ctx.fillRect(-3, -100, 7, 6); // neck
  if (L.style === 'wolf') {
    ctx.fillStyle = L.skin;
    circle(ctx, hx, hy, 13);
    ctx.beginPath(); ctx.moveTo(hx + 6, hy - 6); ctx.lineTo(hx + 25, hy + 2); ctx.lineTo(hx + 6, hy + 8); ctx.closePath(); ctx.fill();
    tri(ctx, hx - 6, hy - 9, hx - 1, hy - 24, hx + 4, hy - 10);
    ctx.fillStyle = INK; circle(ctx, hx + 24, hy + 2, 2.5); circle(ctx, hx + 8, hy - 3, 1.6);
    return;
  }
  ctx.fillStyle = L.skin;
  circle(ctx, hx, hy, 11);
  if (L.horn) { ctx.fillStyle = '#efe6d0'; tri(ctx, hx + 2, hy - 9, hx + 6, hy - 24, hx + 9, hy - 8); }
  // Face
  if (L.style === 'mayuri') {
    ctx.fillStyle = INK; ctx.fillRect(hx + 2, hy - 5, 10, 5);
    ctx.fillStyle = GOLD; ctx.fillRect(hx + 7, hy + 2, 5, 2);
  }
  ctx.fillStyle = L.redEyes ? '#c23a2a' : INK;
  if (L.squint) { ctx.strokeStyle = INK; ctx.lineWidth = 1.5; line(ctx, hx + 5, hy - 2, hx + 10, hy - 2); }
  else if (!L.visor) circle(ctx, hx + 7, hy - 2, 1.6);
  if (L.eyepatch) { ctx.fillStyle = INK; ctx.fillRect(hx + 4, hy - 5, 7, 6); }
  if (L.visor) { ctx.fillStyle = '#c9ccd6'; ctx.fillRect(hx + 1, hy - 5, 12, 4); }
  if (L.mustache) { ctx.fillStyle = L.hair; ctx.fillRect(hx + 5, hy + 3, 7, 2); }
  if (L.beard) {
    ctx.fillStyle = L.beard;
    ctx.beginPath(); ctx.moveTo(hx - 2, hy + 4); ctx.lineTo(hx + 12, hy + 3); ctx.lineTo(hx + 6, hy + (f.def.id === 'yamamoto' ? 34 : 18)); ctx.closePath(); ctx.fill();
  }
  drawHair(ctx, L, hx, hy, t);
}

function drawHair(ctx, L, hx, hy, t) {
  const c = L.hair;
  ctx.fillStyle = c;
  switch (L.style) {
    case 'spiky':
      for (let i = 0; i < 6; i++) {
        const a = -Math.PI + i * 0.5 - 0.2;
        tri(ctx, hx + Math.cos(a) * 9, hy + Math.sin(a) * 9 - 2, hx + Math.cos(a - 0.25) * 22 - 3, hy + Math.sin(a - 0.25) * 20 - 2, hx + Math.cos(a + 0.3) * 9, hy + Math.sin(a + 0.3) * 9);
      }
      cap(ctx, hx, hy, 11.5);
      break;
    case 'kenpachi':
      for (let i = 0; i < 9; i++) {
        const a = -Math.PI - 0.3 + i * 0.42, ex = hx + Math.cos(a) * 26, ey = hy + Math.sin(a) * 24;
        tri(ctx, hx + Math.cos(a - 0.2) * 9, hy + Math.sin(a - 0.2) * 9, ex, ey, hx + Math.cos(a + 0.2) * 9, hy + Math.sin(a + 0.2) * 9);
        ctx.fillStyle = GOLD; circle(ctx, ex, ey, 1.8); ctx.fillStyle = c;
      }
      cap(ctx, hx, hy, 11.5);
      break;
    case 'long': case 'bob': case 'short': case 'bobStraight': case 'slick': case 'shaggy': case 'updo': case 'braids': case 'braidFront': case 'longWavy': case 'dreads': case 'ponytail': case 'wavy':
      cap(ctx, hx, hy, 11.8);
      if (L.style === 'bob' || L.style === 'bobStraight') ctx.fillRect(hx - 11, hy - 4, 8, 14);
      if (L.style === 'bob') ctx.fillRect(hx + 6, hy - 8, 2, 10);
      if (L.style === 'bobStraight') ctx.fillRect(hx + 1, hy - 9, 12, 4);
      if (L.style === 'shaggy') for (let i = 0; i < 4; i++) tri(ctx, hx - 8 + i * 5, hy - 6, hx - 6 + i * 5, hy + 4, hx - 4 + i * 5, hy - 6);
      if (L.style === 'updo') { circle(ctx, hx - 6, hy - 15, 8); ctx.strokeStyle = GOLD; ctx.lineWidth = 2; line(ctx, hx - 16, hy - 20, hx + 4, hy - 12); }
      if (L.style === 'braids') {
        ctx.fillRect(hx - 11, hy - 4, 6, 10);
        ctx.strokeStyle = '#f2f2f2'; ctx.lineWidth = 4;
        const sw = Math.sin(t * 0.1) * 3;
        line(ctx, hx - 8, hy + 6, hx - 14 + sw, hy + 40); line(ctx, hx - 5, hy + 6, hx - 9 + sw, hy + 42);
        ctx.fillStyle = GOLD; circle(ctx, hx - 14 + sw, hy + 42, 2.5); circle(ctx, hx - 9 + sw, hy + 44, 2.5);
      }
      if (L.style === 'braidFront') { ctx.strokeStyle = c; ctx.lineWidth = 5; line(ctx, hx + 4, hy + 8, hx + 8, hy + 48); }
      if (L.style === 'ponytail') {
        for (let i = 0; i < 5; i++) tri(ctx, hx - 6, hy - 8, hx - 26 - i * 2, hy - 16 + i * 5, hx - 8, hy - 2);
        if (L.bandana) { ctx.fillStyle = '#f2f2f2'; ctx.fillRect(hx - 10, hy - 7, 21, 4); }
      }
      if (L.style === 'wavy') { for (let i = 0; i < 3; i++) circle(ctx, hx - 10 - i * 3, hy + 2 + i * 6, 4); }
      if (L.kenseikan) { ctx.fillStyle = '#f4f4f4'; ctx.fillRect(hx - 9, hy - 9, 4, 3); ctx.fillRect(hx - 9, hy - 3, 4, 3); }
      if (L.style === 'dreads' && L.scarf) { ctx.fillStyle = L.scarf; ctx.fillRect(hx - 9, hy + 9, 18, 4); }
      break;
    case 'mayuri':
      ctx.fillStyle = c; cap(ctx, hx, hy, 11.5);
      ctx.fillStyle = GOLD;
      tri(ctx, hx - 8, hy - 9, hx - 30, hy - 18, hx - 9, hy + 2);
      ctx.fillRect(hx - 3, hy - 2, 6, 10);
      break;
    case 'bald':
      ctx.fillStyle = 'rgba(255,255,255,0.35)'; circle(ctx, hx - 2, hy - 6, 3);
      break;
  }
  if (L.hat === 'straw') {
    ctx.fillStyle = '#d9b46a';
    ctx.beginPath(); ctx.ellipse(hx, hy - 9, 22, 5, -0.1, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(hx, hy - 13, 9, 6, 0, Math.PI, 0); ctx.fill();
  }
  if (L.hat === 'bucket') {
    ctx.fillStyle = '#3c6b4a'; ctx.fillRect(hx - 13, hy - 12, 27, 5);
    ctx.fillRect(hx - 9, hy - 21, 19, 10);
    ctx.fillStyle = '#e9e9e9'; for (let i = 0; i < 3; i++) ctx.fillRect(hx - 8 + i * 7, hy - 21, 3, 10);
  }
}

function drawHairBack(ctx, L) {
  ctx.fillStyle = L.hair;
  if (L.style === 'dreads') { for (let i = 0; i < 5; i++) ctx.fillRect(-10 + i * 3, -112, 3, 28); return; }
  ctx.beginPath();
  ctx.moveTo(-6, -118); ctx.lineTo(-14, -108); ctx.lineTo(-13, L.style === 'longWavy' ? -70 : -86); ctx.lineTo(-2, -92); ctx.closePath(); ctx.fill();
}

function drawScarf(ctx, color, t) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(-8, -100);
  ctx.quadraticCurveTo(-26, -96 + Math.sin(t * 0.12) * 4, -38, -86 + Math.sin(t * 0.1) * 6);
  ctx.lineTo(-32, -82);
  ctx.quadraticCurveTo(-20, -90, -6, -94);
  ctx.closePath(); ctx.fill();
}

function drawCoatTails(ctx, color, t) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(-14, -60); ctx.lineTo(10, -60);
  ctx.lineTo(4, -4); ctx.lineTo(-10 + Math.sin(t * 0.2) * 3, -10); ctx.lineTo(-26 + Math.sin(t * 0.15) * 5, 0);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#7a1a22'; ctx.fillRect(-14, -60, 3, 50);
}

function drawIceWings(ctx, f) {
  ctx.fillStyle = 'rgba(190,240,255,0.75)';
  ctx.strokeStyle = 'rgba(255,255,255,0.9)';
  ctx.lineWidth = 1.5;
  for (const k of [1, 0.75]) {
    ctx.beginPath();
    ctx.moveTo(-6, -92); ctx.lineTo(-60 * k, -150 * k); ctx.lineTo(-40 * k, -110); ctx.lineTo(-70 * k, -100); ctx.lineTo(-30, -80);
    ctx.closePath(); ctx.fill(); ctx.stroke();
  }
  ctx.beginPath(); ctx.moveTo(-6, -50); ctx.quadraticCurveTo(-50, -30, -60, -2); ctx.lineTo(-40, -10); ctx.quadraticCurveTo(-30, -30, -6, -42); ctx.fill(); ctx.stroke();
  // The ice flowers count down the bankai: one petal falls with each twelfth of the gauge.
  const petals = Math.ceil(f.reiatsu / 100 * 12);
  for (let fl = 0; fl < 3; fl++) {
    const cx = -34 - fl * 16, cy = -150 + fl * 10;
    for (let p = 0; p < 4; p++) {
      if (fl * 4 + p >= petals) continue;
      const a = p * Math.PI / 2 + fl;
      ctx.beginPath(); ctx.ellipse(cx + Math.cos(a) * 5, cy + Math.sin(a) * 5, 5, 2.5, a, 0, Math.PI * 2); ctx.fill();
    }
  }
}

function drawBenihimeGhost(ctx, t) {
  ctx.save();
  ctx.globalAlpha *= 0.28;
  ctx.fillStyle = '#c8323e';
  ctx.beginPath(); ctx.ellipse(-30, -150, 16, 18, 0, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.moveTo(-50, -132); ctx.lineTo(-10, -132); ctx.lineTo(0, -20); ctx.lineTo(-62, -20); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = '#ffd0d6'; ctx.lineWidth = 2;
  line(ctx, -14, -110, 30, -150 + Math.sin(t * 0.05) * 6);
  ctx.restore();
}

function drawExtraArms(ctx, t) {
  ctx.strokeStyle = '#8a7aa8';
  ctx.lineWidth = 3;
  for (let i = 0; i < 4; i++) {
    const a = -2.4 + i * 0.35 + Math.sin(t * 0.08 + i) * 0.1;
    line(ctx, -6, -88, -6 + Math.cos(a) * 34, -88 + Math.sin(a) * 34);
  }
}

function drawLauncher(ctx, hand) {
  ctx.fillStyle = GOLD;
  roundRect(ctx, hand[0] - 30, hand[1] - 10, 62, 18, 6); ctx.fill();
  ctx.fillStyle = '#7a5a12';
  ctx.fillRect(hand[0] + 28, hand[1] - 8, 6, 14);
}

function drawTrail(ctx, hand, [a0, a1], r, color) {
  ctx.save();
  ctx.globalAlpha *= 0.45;
  ctx.fillStyle = color;
  ctx.beginPath();
  const lo = Math.min(a0, a1), hi = Math.max(a0, a1);
  ctx.arc(5, -92, r, lo, hi);
  ctx.arc(5, -92, r * 0.55, hi, lo, true);
  ctx.closePath(); ctx.fill();
  ctx.restore();
}

// Weapon drawn along +x from the hand.
function drawWeapon(ctx, type, len, f, extended) {
  const hiltCol = '#2a1e1a';
  ctx.lineCap = 'round';
  const hilt = c => { ctx.strokeStyle = c || hiltCol; ctx.lineWidth = 4; line(ctx, -10, 0, 0, 0); };
  const tsuba = () => { ctx.fillStyle = GOLD; ctx.fillRect(-1, -5, 3, 10); };
  const blade = (c, w = 3) => { ctx.strokeStyle = c; ctx.lineWidth = w; line(ctx, 0, 0, len, -len * 0.04); };
  switch (type) {
    case 'katana': hilt(LOOKS[f.def.id].hilt); tsuba(); blade('#dfe6ee'); break;
    case 'charred': hilt(); tsuba(); blade('#3a2a24', 4); ctx.strokeStyle = 'rgba(255,140,60,0.6)'; ctx.lineWidth = 1; line(ctx, 2, -1, len, -len * 0.04 - 1); break;
    case 'whiteKatana':
      hilt('#f2f2f2'); blade('#ffffff', 3.5);
      ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(-10, 0); ctx.quadraticCurveTo(-20, 12, -30, 8 + Math.sin((f.animT || 0) * 0.15) * 4); ctx.stroke();
      break;
    case 'blackKatana':
      hilt('#111'); ctx.strokeStyle = GOLD; ctx.lineWidth = 2; line(ctx, 0, -6, 0, 6); line(ctx, -3, -4, 3, 4);
      blade('#111', 3.5); ctx.strokeStyle = '#555'; ctx.lineWidth = 1; line(ctx, -10, 0, -22, 6);
      break;
    case 'cleaver':
      ctx.strokeStyle = '#f2efe6'; ctx.lineWidth = 5; line(ctx, -14, 0, 0, 0);
      ctx.fillStyle = '#2a2a30'; ctx.beginPath(); ctx.moveTo(0, -7); ctx.lineTo(len, -9); ctx.lineTo(len + 6, 0); ctx.lineTo(len, 6); ctx.lineTo(0, 6); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#d9dee5'; ctx.fillRect(4, -9, len - 4, 3);
      break;
    case 'bigCleaver':
      hilt();
      ctx.fillStyle = '#9aa1aa'; ctx.beginPath(); ctx.moveTo(0, -8); ctx.lineTo(len, -12); ctx.lineTo(len + 8, -2); ctx.lineTo(len, 8); ctx.lineTo(0, 7); ctx.closePath(); ctx.fill();
      ctx.fillStyle = INK; for (let i = 1; i < 5; i++) tri(ctx, i * len / 5, 7, i * len / 5 + 4, 3, i * len / 5 + 8, 7);
      break;
    case 'trident':
      hilt(); ctx.fillStyle = GOLD; circle(ctx, 0, 0, 5);
      blade('#d8dde6', 3);
      ctx.strokeStyle = '#d8dde6'; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.moveTo(len * 0.55, 0); ctx.quadraticCurveTo(len * 0.7, -14, len * 0.85, -10); ctx.moveTo(len * 0.55, 0); ctx.quadraticCurveTo(len * 0.7, 14, len * 0.85, 10); ctx.stroke();
      break;
    case 'whip': case 'boneSnake': {
      hilt();
      const seg = type === 'boneSnake' ? 7 : 5, step = len / seg, size = type === 'boneSnake' ? 9 : 5;
      ctx.fillStyle = type === 'boneSnake' ? '#efe4cc' : '#d8dde6';
      for (let i = 0; i < seg; i++) {
        const x = i * step + 4, y = extended ? Math.sin(i * 1.3 + (f.animT || 0) * 0.4) * 4 : 0;
        ctx.beginPath(); ctx.moveTo(x, y - size); ctx.lineTo(x + step - 2, y); ctx.lineTo(x, y + size); ctx.closePath(); ctx.fill();
      }
      if (type === 'boneSnake') { ctx.fillStyle = '#c23a2a'; circle(ctx, len, 0, 4); }
      break;
    }
    case 'goldWhip':
      hilt(); ctx.strokeStyle = GOLD; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(0, 0);
      for (let x = 0; x <= len; x += 8) ctx.lineTo(x, Math.sin(x * 0.12 + (f.animT || 0) * 0.3) * (extended ? 8 : 3));
      ctx.stroke();
      break;
    case 'dual': hilt(); tsuba(); blade('#dfe6ee'); break;
    case 'wakizashi': hilt(); tsuba(); blade('#e6ebf2', 2.5); break;
    case 'ringKatana': hilt(); ctx.strokeStyle = GOLD; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(-14, 0, 5, 0, Math.PI * 2); ctx.stroke(); blade('#dfe6ee'); break;
    case 'stinger': ctx.fillStyle = GOLD; ctx.beginPath(); ctx.moveTo(0, -3); ctx.lineTo(len, 0); ctx.lineTo(0, 3); ctx.closePath(); ctx.fill(); break;
    case 'knife': hilt(); ctx.strokeStyle = GOLD; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(-12, 0, 4, 0, Math.PI * 2); ctx.stroke(); blade('#e6ebf2', 4); break;
    case 'knuckles': ctx.fillStyle = '#b48a3a'; roundRect(ctx, -4, -7, 12, 14, 3); ctx.fill(); ctx.strokeStyle = 'rgba(160,210,255,0.6)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(10, 0, 9, -1, 1); ctx.stroke(); break;
    case 'spear':
      ctx.strokeStyle = '#8a5a2a'; ctx.lineWidth = 3.5; line(ctx, -26, 0, len, 0);
      ctx.fillStyle = '#dfe6ee'; tri(ctx, len, -4, len + 14, 0, len, 4);
      ctx.fillStyle = '#c23a2a'; circle(ctx, len - 4, 5, 3);
      break;
    case 'axes': case 'axe': {
      ctx.strokeStyle = '#7a4a2a'; ctx.lineWidth = 3.5; line(ctx, -10, 0, len * 0.5, 0);
      ctx.fillStyle = '#c9ced6';
      ctx.beginPath(); ctx.moveTo(len * 0.35, -2); ctx.quadraticCurveTo(len * 0.9, -26, len, -2); ctx.quadraticCurveTo(len * 0.8, 6, len * 0.35, 4); ctx.closePath(); ctx.fill();
      if (f.crest) { ctx.fillStyle = `rgba(220,40,30,${0.25 + f.crest / 130})`; ctx.fillRect(len * 0.55, -14, len * 0.3 * f.crest / 100, 6); }
      break;
    }
    case 'rapier': ctx.strokeStyle = GOLD; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, 0, 6, -1.6, 1.6); ctx.stroke(); hilt(); blade('#eef2f7', 2); break;
    case 'brush':
      ctx.strokeStyle = '#5a3a1a'; ctx.lineWidth = 5; line(ctx, -12, 0, len, 0);
      ctx.fillStyle = f.bankai ? '#f4f4f4' : INK;
      ctx.beginPath(); ctx.ellipse(len + 10, 0, 14, 7, 0, 0, Math.PI * 2); ctx.fill();
      break;
    case 'needle': ctx.strokeStyle = '#e6e2f2'; ctx.lineWidth = 2.5; line(ctx, 0, 0, len, 0); ctx.strokeStyle = '#b98aff'; ctx.lineWidth = 1; line(ctx, -2, 0, -24, 8); break;
    case 'hilt': hilt(); tsuba(); break;
  }
  if (extended && type !== 'whip' && type !== 'boneSnake' && type !== 'goldWhip') {
    ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 6; line(ctx, 0, 0, len, -len * 0.04);
  }
}

// ------------------------------------------------------------------ helpers

function line(ctx, x1, y1, x2, y2) { ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); }
function circle(ctx, x, y, r) { ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); }
function cap(ctx, x, y, r) { ctx.beginPath(); ctx.arc(x, y, r, Math.PI * 0.95, Math.PI * 2.05); ctx.fill(); }
function tri(ctx, a, b, c, d, e, g) { ctx.beginPath(); ctx.moveTo(a, b); ctx.lineTo(c, d); ctx.lineTo(e, g); ctx.closePath(); ctx.fill(); }
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}
function shade(hex, k) {
  const n = parseInt(hex.slice(1), 16), f = v => Math.round(clamp(v + v * k, 0, 255));
  return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`;
}
function alphaHex(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`;
}
function text(ctx, str, x, y, size, color, align = 'left', font = FONT_UI, weight = 700) {
  ctx.font = `${weight} ${size}px ${font}`;
  ctx.textAlign = align;
  ctx.fillStyle = color;
  ctx.fillText(str, x, y);
}
function outlinedText(ctx, str, x, y, size, color, align = 'center', font = FONT_UI) {
  ctx.font = `700 ${size}px ${font}`;
  ctx.textAlign = align;
  ctx.lineWidth = Math.max(3, size / 6);
  ctx.strokeStyle = 'rgba(8,8,14,0.9)';
  ctx.strokeText(str, x, y);
  ctx.fillStyle = color;
  ctx.fillText(str, x, y);
}

// ------------------------------------------------------------------ arena

let bgCache = null;

function drawBackdrop(ctx) {
  if (!bgCache) {
    bgCache = document.createElement('canvas');
    bgCache.width = W; bgCache.height = H;
    const g = bgCache.getContext('2d');
    const sky = g.createLinearGradient(0, 0, 0, GROUND);
    sky.addColorStop(0, '#141a3a'); sky.addColorStop(0.6, '#2c2f5c'); sky.addColorStop(1, '#5b4a6e');
    g.fillStyle = sky; g.fillRect(0, 0, W, GROUND);
    const rng = makeRng(7);
    g.fillStyle = 'rgba(255,255,255,0.7)';
    for (let i = 0; i < 90; i++) g.fillRect(rng() * W, rng() * 300, 1.5, 1.5);
    g.fillStyle = '#f3ecd6'; g.beginPath(); g.arc(1020, 120, 46, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#2c2f5c'; g.beginPath(); g.arc(1038, 108, 40, 0, Math.PI * 2); g.fill();
    // Sokyoku hill
    g.fillStyle = '#262849';
    g.beginPath(); g.moveTo(560, GROUND - 120); g.quadraticCurveTo(760, GROUND - 330, 980, GROUND - 120); g.fill();
    g.fillStyle = '#1d1f3a'; g.fillRect(752, GROUND - 330, 10, 70); g.fillRect(722, GROUND - 316, 70, 8);
    // Seireitei walls and roofs
    for (let i = 0; i < 9; i++) {
      const x = i * 160 - 40 + (i % 2) * 30, hgt = 120 + (i * 37) % 70;
      g.fillStyle = '#6f6a7c'; g.fillRect(x, GROUND - hgt, 140, hgt);
      g.fillStyle = '#1e2033'; g.beginPath(); g.moveTo(x - 14, GROUND - hgt); g.lineTo(x + 70, GROUND - hgt - 34); g.lineTo(x + 154, GROUND - hgt); g.closePath(); g.fill();
      g.fillStyle = 'rgba(255,214,150,0.18)'; for (let j = 0; j < 3; j++) g.fillRect(x + 20 + j * 40, GROUND - hgt + 30, 18, 26);
    }
    g.fillStyle = 'rgba(20,22,48,0.45)'; g.fillRect(0, 0, W, GROUND);
    // Courtyard stone
    const st = g.createLinearGradient(0, GROUND, 0, H);
    st.addColorStop(0, '#8f877a'); st.addColorStop(1, '#4f4a44');
    g.fillStyle = st; g.fillRect(0, GROUND, W, H - GROUND);
    g.strokeStyle = 'rgba(60,54,46,0.35)'; g.lineWidth = 1;
    for (let y = GROUND + 20; y < H; y += 28) { g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); }
    for (let x = 0; x < W; x += 90) { g.beginPath(); g.moveTo(x, GROUND); g.lineTo(x - 60, H); g.stroke(); }
  }
  ctx.drawImage(bgCache, 0, 0);
}

function drawArenaMood(ctx, w) {
  const t = w.frame;
  if (w.ice) {
    ctx.fillStyle = 'rgba(170,230,255,0.45)';
    ctx.fillRect(0, GROUND, W, H - GROUND);
    ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.lineWidth = 1;
    for (let i = 0; i < 14; i++) line(ctx, i * 97 % W, GROUND + 6, i * 97 % W + 40, GROUND + 50);
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    for (let i = 0; i < 70; i++) ctx.fillRect((i * 173 + t * (1 + i % 3)) % W, (i * 89 + t * 1.5) % GROUND, 2, 2);
  }
  for (const f of w.fighters) {
    if (!f.bankai) continue;
    const id = f.def.id;
    if (id === 'sasakibe') {
      ctx.fillStyle = 'rgba(20,20,40,0.55)';
      for (let i = 0; i < 8; i++) { ctx.beginPath(); ctx.ellipse(i * 180 + (t * 0.3) % 180, 40, 140, 50, 0, 0, Math.PI * 2); ctx.fill(); }
      if (t % 47 < 3) { ctx.fillStyle = 'rgba(255,250,200,0.15)'; ctx.fillRect(0, 0, W, H); }
    }
    if (id === 'shunsui') { // the stage of a tragedy
      ctx.fillStyle = 'rgba(110,20,40,0.75)';
      for (const side of [0, 1]) {
        ctx.beginPath();
        const x0 = side ? W : 0, d = side ? -1 : 1;
        ctx.moveTo(x0, 0); ctx.lineTo(x0 + d * 110, 0); ctx.quadraticCurveTo(x0 + d * 60, 300, x0 + d * 90, H); ctx.lineTo(x0, H); ctx.closePath(); ctx.fill();
      }
    }
    if (id === 'yamamoto') { ctx.fillStyle = 'rgba(255,120,40,0.08)'; ctx.fillRect(0, 0, W, H); }
    if (id === 'rose') {
      ctx.fillStyle = 'rgba(255,220,120,0.7)';
      for (let i = 0; i < 6; i++) { const a = t * 0.02 + i; outlinedText(ctx, '♪', f.x + Math.cos(a) * 90, f.y - 140 + Math.sin(a * 1.3) * 30, 20, '#ffe08a'); }
    }
  }
}

// ------------------------------------------------------------------ bankai things

function drawZone(ctx, z, w) {
  const t = w.frame + z.age;
  switch (z.kind) {
    case 'petals': {
      for (let i = 0; i < 60; i++) {
        const a = i * 2.4 + t * 0.06 * (i % 2 ? 1 : -1), r = z.r * Math.sqrt((i * 37 % 100) / 100);
        ctx.fillStyle = i % 3 ? '#f6a8c8' : '#ffd6e6';
        ctx.beginPath(); ctx.ellipse(z.x + Math.cos(a) * r, z.y + Math.sin(a) * r * 0.8, 4, 2, a, 0, Math.PI * 2); ctx.fill();
      }
      break;
    }
    case 'gas': {
      const g = ctx.createRadialGradient(z.x, z.y, 10, z.x, z.y, z.r);
      g.addColorStop(0, 'rgba(160,90,200,0.45)'); g.addColorStop(0.7, 'rgba(110,160,80,0.25)'); g.addColorStop(1, 'rgba(110,160,80,0)');
      ctx.fillStyle = g; circle(ctx, z.x, z.y, z.r);
      break;
    }
    case 'mist': {
      const g = ctx.createRadialGradient(z.x, z.y, 20, z.x, z.y, z.r);
      g.addColorStop(0, 'rgba(240,250,255,0.4)'); g.addColorStop(1, 'rgba(240,250,255,0)');
      ctx.fillStyle = g; circle(ctx, z.x, z.y, z.r);
      break;
    }
    case 'heat': {
      ctx.strokeStyle = 'rgba(255,140,60,0.25)'; ctx.lineWidth = 3;
      for (let k = 0; k < 3; k++) {
        ctx.beginPath();
        for (let a = 0; a <= Math.PI * 2 + 0.01; a += 0.2) {
          const r = z.r * (0.6 + k * 0.2) + Math.sin(a * 6 + t * 0.2 + k) * 6;
          ctx.lineTo(z.x + Math.cos(a) * r, z.y + Math.sin(a) * r);
        }
        ctx.stroke();
      }
      break;
    }
    case 'loom': {
      ctx.lineWidth = 2;
      for (const th of z.threads) {
        if (th.cut) continue;
        ctx.strokeStyle = 'rgba(216,184,255,0.9)';
        line(ctx, th.x1, th.y1, th.x2, th.y2);
        ctx.strokeStyle = 'rgba(216,184,255,0.25)'; ctx.lineWidth = 6;
        line(ctx, th.x1, th.y1, th.x2, th.y2);
        ctx.lineWidth = 2;
      }
      break;
    }
  }
}

function drawDome(ctx, z, w) {
  ctx.save();
  ctx.beginPath(); ctx.arc(z.x, z.y, z.r, Math.PI, 0); ctx.closePath();
  ctx.fillStyle = 'rgba(6,4,14,0.93)'; ctx.fill();
  ctx.strokeStyle = 'rgba(150,120,255,0.6)'; ctx.lineWidth = 3; ctx.stroke();
  ctx.restore();
}

function drawStrike(ctx, s, w) {
  const hit = s.t <= 0, k = hit ? 1 - s.after / 18 : 1 - s.t / s.delay;
  ctx.save();
  if (!hit) {
    ctx.fillStyle = s.kind === 'lightning' ? `rgba(255,240,120,${0.2 + k * 0.4})` : s.kind === 'missile' ? `rgba(255,200,60,${0.2 + k * 0.4})` : `rgba(10,8,20,${0.25 + k * 0.4})`;
    ctx.beginPath(); ctx.ellipse(s.x, GROUND + 4, s.width / 2, 10, 0, 0, Math.PI * 2); ctx.fill();
    if (s.kind === 'giant' || s.kind === 'tenken') { // a blade descends
      ctx.fillStyle = `rgba(30,24,40,${0.15 + k * 0.4})`;
      ctx.fillRect(s.x - 14, -40 + k * (GROUND - 300), 28, 260);
    }
    if (s.kind === 'missile') { ctx.strokeStyle = GOLD; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(s.x, GROUND - 40, 30 * (1.5 - k), 0, Math.PI * 2); ctx.stroke(); }
  } else {
    ctx.globalAlpha = Math.max(0, k);
    switch (s.kind) {
      case 'lightning':
        ctx.strokeStyle = '#fff6a8'; ctx.lineWidth = 5;
        ctx.beginPath(); ctx.moveTo(s.x, 0);
        for (let y = 0; y < GROUND; y += 60) ctx.lineTo(s.x + ((y * 7) % 40) - 20, y);
        ctx.lineTo(s.x, GROUND); ctx.stroke();
        break;
      case 'fire':
        ctx.fillStyle = '#ff7a1a'; ctx.fillRect(s.x - s.width / 2, GROUND - 260, s.width, 260);
        ctx.fillStyle = '#ffd36a'; ctx.fillRect(s.x - s.width / 4, GROUND - 260, s.width / 2, 260);
        break;
      case 'skeletons':
        ctx.strokeStyle = '#efe6d4'; ctx.lineWidth = 4;
        for (let i = 0; i < 6; i++) { const x = s.x - s.width / 2 + i * s.width / 5; line(ctx, x, GROUND, x + 8, GROUND - 90 - (i % 2) * 30); }
        break;
      case 'missile':
        ctx.fillStyle = '#ffcf5a'; circle(ctx, s.x, GROUND - 60, s.width / 2);
        ctx.fillStyle = '#fff3c4'; circle(ctx, s.x, GROUND - 60, s.width / 4);
        break;
      default: // the giant's blade
        ctx.fillStyle = '#1c1826'; ctx.fillRect(s.x - 18, 0, 36, GROUND);
        ctx.fillStyle = '#c8ccd6'; ctx.fillRect(s.x - 4, 0, 8, GROUND);
    }
  }
  ctx.restore();
}

function drawSummon(ctx, s, w) {
  const t = w.frame;
  if (s.kind === 'jizo') {
    const d = s.dir;
    for (let i = 5; i >= 1; i--) { ctx.fillStyle = i % 2 ? '#d9a52a' : '#f2c14e'; circle(ctx, s.x - d * i * 30, GROUND - 60 - Math.sin(t * 0.08 + i) * 6, 46 - i * 3); }
    ctx.strokeStyle = '#c9ced6'; ctx.lineWidth = 3;
    for (let i = 0; i < 6; i++) line(ctx, s.x - d * i * 24, GROUND - 30, s.x - d * i * 24 + d * 10, GROUND);
    ctx.fillStyle = '#f2c14e'; circle(ctx, s.x, GROUND - 120, 62);
    ctx.fillStyle = '#7a3fa0'; circle(ctx, s.x + d * 8, GROUND - 120, 44);
    ctx.fillStyle = '#f6efe0'; circle(ctx, s.x + d * 22, GROUND - 132, 7); circle(ctx, s.x - d * 4, GROUND - 132, 7);
    ctx.fillStyle = INK; circle(ctx, s.x + d * 10, GROUND - 100, 9);
    ctx.strokeStyle = 'rgba(242,193,78,0.7)'; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(s.x, GROUND - 120, 74, Math.PI * 1.1, Math.PI * 1.9); ctx.stroke();
  } else if (s.kind === 'giant') {
    ctx.save();
    ctx.globalAlpha = 0.55;
    ctx.fillStyle = '#16131f';
    ctx.beginPath(); ctx.moveTo(s.x - 120, GROUND); ctx.lineTo(s.x - 90, GROUND - 330); ctx.lineTo(s.x + 90, GROUND - 330); ctx.lineTo(s.x + 120, GROUND); ctx.closePath(); ctx.fill();
    circle(ctx, s.x, GROUND - 380, 56);
    tri(ctx, s.x - 50, GROUND - 400, s.x - 80, GROUND - 470, s.x - 20, GROUND - 420);
    tri(ctx, s.x + 50, GROUND - 400, s.x + 80, GROUND - 470, s.x + 20, GROUND - 420);
    ctx.fillStyle = '#ffb23a'; circle(ctx, s.x - 18, GROUND - 384, 6); circle(ctx, s.x + 18, GROUND - 384, 6);
    ctx.fillStyle = '#2a2436'; ctx.fillRect(s.x + 100, GROUND - 560, 20, 330);
    ctx.restore();
  } else if (s.kind === 'reticle') {
    const k = s.lock / 90;
    ctx.strokeStyle = k > 0.75 ? '#ff4a3a' : GOLD; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(s.x, s.y, 46, 0, Math.PI * 2); ctx.stroke();
    line(ctx, s.x - 60, s.y, s.x - 30, s.y); line(ctx, s.x + 30, s.y, s.x + 60, s.y);
    line(ctx, s.x, s.y - 60, s.x, s.y - 30); line(ctx, s.x, s.y + 30, s.x, s.y + 60);
    ctx.lineWidth = 5; ctx.beginPath(); ctx.arc(s.x, s.y, 54, -Math.PI / 2, -Math.PI / 2 + k * Math.PI * 2); ctx.stroke();
  } else if (s.kind === 'cage') {
    const k = s.closing ? 1 - s.closing / 36 : 0;
    for (const side of [-1, 1]) {
      const x = side < 0 ? s.left + k * 170 : s.right - k * 170;
      for (let y = GROUND; y > GROUND - 260; y -= 26) {
        ctx.fillStyle = '#efe4cc';
        tri(ctx, x - 9, y, x + 9, y, x - side * 18, y - 14 + Math.sin(t * 0.2 + y) * 2);
      }
    }
  }
}

function drawProjectile(ctx, p, w) {
  const d = sign(p.vx || 1), t = w.frame;
  ctx.save();
  if (p.kind === 'kinshara' && !p.fake) { ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.beginPath(); ctx.ellipse(p.x, GROUND + 3, 26, 5, 0, 0, Math.PI * 2); ctx.fill(); }
  ctx.translate(p.x, p.y);
  ctx.scale(d, 1);
  const crescent = (fill, rim) => {
    ctx.fillStyle = fill;
    ctx.beginPath(); ctx.ellipse(0, 0, p.w * 0.6, p.h / 2, 0, -Math.PI / 2, Math.PI / 2); ctx.ellipse(-p.w * 0.25, 0, p.w * 0.4, p.h / 2 * 0.85, 0, Math.PI / 2, -Math.PI / 2, true); ctx.fill();
    if (rim) { ctx.strokeStyle = rim; ctx.lineWidth = 2; ctx.stroke(); }
  };
  switch (p.kind) {
    case 'getsuga': crescent('rgba(150,210,255,0.9)', '#fff'); break;
    case 'getsugaBlack': crescent('rgba(12,8,16,0.95)', '#e8323c'); break;
    case 'benihime': crescent('rgba(210,40,60,0.9)', '#ffb0b8'); break;
    case 'blood': crescent('rgba(160,20,40,0.9)', '#ff6a7a'); break;
    case 'wind': crescent('rgba(230,240,255,0.7)'); break;
    case 'dragon':
      ctx.fillStyle = 'rgba(160,230,255,0.9)'; ctx.beginPath(); ctx.moveTo(p.w / 2, 0); ctx.lineTo(-p.w / 2, -p.h / 2); ctx.lineTo(-p.w / 4, 0); ctx.lineTo(-p.w / 2, p.h / 2); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#fff'; circle(ctx, p.w / 4, -6, 4);
      break;
    case 'hakuren':
      ctx.fillStyle = 'rgba(240,250,255,0.75)'; roundRect(ctx, -p.w / 2, -p.h / 2, p.w, p.h, 30); ctx.fill();
      break;
    case 'flake':
      ctx.strokeStyle = '#eaf8ff'; ctx.lineWidth = 2;
      for (let i = 0; i < 3; i++) { const a = i * Math.PI / 3 + t * 0.05; line(ctx, -Math.cos(a) * 12, -Math.sin(a) * 12, Math.cos(a) * 12, Math.sin(a) * 12); }
      break;
    case 'petals':
      for (let i = 0; i < 26; i++) { ctx.fillStyle = i % 2 ? '#f6a8c8' : '#ffd6e6'; ctx.beginPath(); ctx.ellipse(Math.cos(i * 2.1 + t * 0.2) * p.w / 2, Math.sin(i * 1.7 + t * 0.2) * p.h / 2, 4, 2, i, 0, Math.PI * 2); ctx.fill(); }
      break;
    case 'cleave':
      ctx.fillStyle = 'rgba(255,210,80,0.85)'; tri(ctx, -p.w / 2, p.h / 2, p.w / 2, p.h / 2, 0, -p.h / 2);
      ctx.fillStyle = 'rgba(200,40,30,0.8)'; tri(ctx, -p.w / 4, p.h / 2, p.w / 4, p.h / 2, 0, -p.h / 4);
      break;
    case 'bushogoma':
      ctx.strokeStyle = 'rgba(220,240,255,0.8)'; ctx.lineWidth = 3;
      for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.ellipse(0, 0, p.w / 2 - i * 8, p.h / 4, (t * 0.3 + i) % Math.PI, 0, Math.PI * 2); ctx.stroke(); }
      break;
    case 'thread':
      ctx.strokeStyle = '#f7a8c8'; ctx.lineWidth = 2; line(ctx, -200, 0, p.w / 2, 0);
      ctx.fillStyle = '#fff'; circle(ctx, p.w / 2, 0, 4);
      break;
    case 'scent':
      ctx.fillStyle = 'rgba(255,224,138,0.35)';
      for (let i = 0; i < 5; i++) circle(ctx, Math.cos(i * 1.3 + t * 0.05) * 30, Math.sin(i * 1.9) * 25, 30);
      break;
    case 'kinshara':
      ctx.strokeStyle = GOLD; ctx.lineWidth = 4;
      ctx.beginPath(); for (let x = -p.w / 2; x <= p.w / 2; x += 6) ctx.lineTo(x, Math.sin(x * 0.15 + t * 0.4) * p.h / 3); ctx.stroke();
      break;
    case 'shockwave':
      ctx.strokeStyle = 'rgba(180,220,255,0.8)'; ctx.lineWidth = 4;
      for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.arc(-i * 18, 0, p.h / 2 - i * 10, -1.1, 1.1); ctx.stroke(); }
      break;
    case 'ink': case 'whiteInk':
      ctx.fillStyle = p.kind === 'ink' ? '#0b0b0f' : '#f6f6f6';
      for (let i = 0; i < 6; i++) circle(ctx, Math.cos(i * 1.1) * 26, Math.sin(i * 2.3) * 24, 18 - i);
      break;
    case 'needle':
      ctx.strokeStyle = '#efeaff'; ctx.lineWidth = 2; line(ctx, -p.w / 2, 0, p.w / 2, 0);
      break;
    default:
      ctx.fillStyle = '#fff'; circle(ctx, 0, 0, 10);
  }
  ctx.restore();
}

function drawStatusOverlay(ctx, f, w) {
  const s = f.fx, top = f.y - f.h;
  if (s.frozen > 0) {
    ctx.fillStyle = 'rgba(180,235,255,0.55)'; ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(f.x - 34, f.y); ctx.lineTo(f.x - 40, top - 10); ctx.lineTo(f.x + 6, top - 22); ctx.lineTo(f.x + 38, top - 4); ctx.lineTo(f.x + 34, f.y); ctx.closePath(); ctx.fill(); ctx.stroke();
  }
  if (s.trapped > 0) {
    const col = { gokei: '#f6a8c8', itodome: '#f7a8c8', skeletons: '#efe6d4', threads: '#d8b8ff' }[s.trapKind] || '#fff';
    if (s.trapKind === 'gokei') {
      ctx.fillStyle = alphaHex(col, 0.55); circle(ctx, f.x, f.y - f.h / 2, f.h * 0.75);
    } else {
      ctx.strokeStyle = col; ctx.lineWidth = 3;
      for (let i = 0; i < 5; i++) line(ctx, f.x - 30, top + 20 + i * 18, f.x + 30, top + 28 + i * 18);
    }
  }
  if (s.paralyzed > 0) { ctx.fillStyle = 'rgba(190,120,255,0.25)'; ctx.fillRect(f.x - 26, top, 52, f.h); }
  if (s.toxin > 0 && s.paralyzed <= 0) { ctx.fillStyle = `rgba(190,120,255,${s.toxin / 400})`; ctx.fillRect(f.x - 26, top, 52, f.h); }
  if (s.frost > 0 && s.frozen <= 0) { ctx.fillStyle = `rgba(190,240,255,${s.frost / 260})`; ctx.fillRect(f.x - 26, top, 52, f.h); }
  if (s.bleed > 0) { ctx.fillStyle = BLOOD; for (let i = 0; i < s.bleedStacks; i++) ctx.fillRect(f.x - 10 + i * 9, f.y - 30 + ((w.frame * 1.5 + i * 11) % 30), 3, 5); }
  if (s.fragment > 0) { ctx.fillStyle = '#e0e6f0'; tri(ctx, f.x - 3, f.y - f.h * 0.6, f.x + 3, f.y - f.h * 0.6, f.x, f.y - f.h * 0.6 - 12); }
  if (s.homonka > 0) { ctx.strokeStyle = '#ffd23a'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(f.x, f.y - f.h * 0.6, 8, 0, Math.PI * 2); ctx.stroke(); }
  if (s.dazed > 0) for (let i = 0; i < 3; i++) { const a = w.frame * 0.1 + i * 2.1; ctx.fillStyle = '#bfe0ff'; circle(ctx, f.x + Math.cos(a) * 18, top - 8 + Math.sin(a) * 5, 3); }
  if (s.inverted > 0) outlinedText(ctx, '逆', f.x, top - 14, 22, '#ffe08a');
  if (f.state === 'guard' || f.guardHp < 100) {
    ctx.fillStyle = 'rgba(8,8,14,0.6)'; ctx.fillRect(f.x - 24, f.y + 8, 48, 4);
    ctx.fillStyle = f.guardHp < 35 ? '#ff9a3a' : '#cfe0ff'; ctx.fillRect(f.x - 24, f.y + 8, 48 * f.guardHp / 100, 4);
  }
}

function drawPetalGuard(ctx, f, w) {
  for (let i = 0; i < 40; i++) {
    const a = i * 0.157 + w.frame * 0.05, r = 120 + Math.sin(i * 3 + w.frame * 0.04) * 40;
    ctx.fillStyle = i % 2 ? '#f6a8c8' : '#ffd6e6';
    ctx.beginPath(); ctx.ellipse(f.x + Math.cos(a) * r, f.y - 60 + Math.sin(a) * r * 0.6, 4, 2, a, 0, Math.PI * 2); ctx.fill();
  }
}

// ------------------------------------------------------------------ scene

// The camera zooms in when the fighters are close. It scales about the
// ground line so the floor stays put against the static backdrop.
function updateCamera(w) {
  const [a, b] = w.fighters, mid = (a.x + b.x) / 2;
  const z = clamp(W / (Math.abs(a.x - b.x) + 560), 1, 1.45);
  const cam = w.cam || (w.cam = { x: mid, z });
  cam.z += (z - cam.z) * 0.08;
  const half = W / 2 / cam.z;
  cam.x += (clamp(mid, half, W - half) - cam.x) * 0.12;
  cam.x = clamp(cam.x, half, W - half);
  return cam;
}

function applyCamera(ctx, cam) {
  ctx.translate(W / 2, GROUND);
  ctx.scale(cam.z, cam.z);
  ctx.translate(-cam.x, -GROUND);
}

function drawWorld(ctx, w) {
  const cam = updateCamera(w);
  ctx.save();
  if (w.shake) ctx.translate((Math.random() - 0.5) * w.shake, (Math.random() - 0.5) * w.shake);
  drawBackdrop(ctx);
  applyCamera(ctx, cam);
  drawArenaMood(ctx, w);
  for (const s of w.summons) if (s.kind === 'giant') drawSummon(ctx, s, w);
  for (const z of w.zones) if (z.kind !== 'dome') drawZone(ctx, z, w);
  for (const s of w.strikes) if (s.t > 0) drawStrike(ctx, s, w);
  for (const s of w.summons) if (s.kind === 'jizo') drawSummon(ctx, s, w);
  for (const a of w.afterimages) drawFighter(ctx, a, 0.6 * Math.min(1, a.life / 20));

  // Fighters; the release cinematic puts the releaser on top.
  const order = [...w.fighters].sort((a, b) => (w.release && w.release.f === a ? 1 : 0) - (w.release && w.release.f === b ? 1 : 0));
  for (const f of order) {
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath(); ctx.ellipse(f.x, GROUND + 3, 26, 6, 0, 0, Math.PI * 2); ctx.fill();
    if (f.bankai) {
      ctx.fillStyle = alphaHex(LOOKS[f.def.id].aura, 0.18 + Math.sin(w.frame * 0.2) * 0.06);
      ctx.beginPath(); ctx.ellipse(f.x, f.y - f.h / 2, 40, f.h * 0.65, 0, 0, Math.PI * 2); ctx.fill();
    }
    drawFighter(ctx, f, f.invuln > 0 && f.state === 'dash' ? 0.6 : 1);
    drawStatusOverlay(ctx, f, w);
    if (f.bankai && f.def.id === 'byakuya') drawPetalGuard(ctx, f, w);
  }
  // Enma Korogi swallows everything; only the victim stays visible.
  for (const z of w.zones) {
    if (z.kind !== 'dome') continue;
    drawDome(ctx, z, w);
    const v = w.opponentOf(z.owner);
    if (z.inside) { drawFighter(ctx, v); drawStatusOverlay(ctx, v, w); }
  }
  for (const s of w.strikes) if (s.t <= 0) drawStrike(ctx, s, w);
  for (const s of w.summons) if (s.kind === 'reticle' || s.kind === 'cage') drawSummon(ctx, s, w);
  for (const p of w.projectiles) drawProjectile(ctx, p, w);
  for (const p of w.particles) { ctx.fillStyle = p.color; ctx.globalAlpha = Math.min(1, p.life / 20); ctx.fillRect(p.x, p.y, p.size, p.size); }
  ctx.globalAlpha = 1;
  for (const r of w.rings) { ctx.strokeStyle = alphaHex(r.color, r.life / 18); ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(r.x, r.y, r.r * (1.2 - r.life / 36), 0, Math.PI * 2); ctx.stroke(); }
  const [fa, fb] = w.fighters, close = Math.abs(fa.x - fb.x) < 160;
  for (const t of w.texts) {
    ctx.globalAlpha = Math.min(1, t.life / 20);
    const spread = close ? (t.follow.x <= w.opponentOf(t.follow).x ? -50 : 50) : 0; // keep the two sides' callouts apart
    outlinedText(ctx, t.text, clamp(t.follow.x + spread, 90, W - 90), t.y, 19, t.color);
  }
  ctx.globalAlpha = 1;
  ctx.restore();
}

// ------------------------------------------------------------------ HUD

function statusChips(f, w) {
  const s = f.fx, chips = [];
  const add = (label, color, value) => chips.push({ label, color, value });
  if (s.frozen > 0) add('FROZEN', '#aef');
  else if (s.frost > 0.5) add('FROST', '#aef', s.frost / 100);
  if (s.paralyzed > 0) add('PARALYZED', '#d9f');
  else if (s.toxin > 0.5) add(s.toxin >= 75 ? 'TOXIN: ARMS NUMB' : s.toxin >= 50 ? 'TOXIN: NO DASH' : s.toxin >= 25 ? 'TOXIN: NO JUMP' : 'TOXIN', '#d9f', s.toxin / 100);
  if (s.numbLegs > 0) add('LEGS CUT', '#d9f');
  if (s.numbArms > 0) add('ARMS CUT', '#d9f');
  if (s.outpaced > 0) add('OUTPACED', '#ff8a7a');
  if (s.lacerated > 0) add('LACERATED', '#f9c');
  if (s.trapped > 0) add('TRAPPED: MASH', '#fff');
  if (s.inverted > 0) add('INVERTED', '#ffe08a');
  if (s.blind > 0) add('SENSES GONE', '#b9a6ff');
  if (s.dazed > 0) add('CONCUSSED', '#bfe0ff');
  if (s.bleed > 0) add('BLEEDING x' + s.bleedStacks, '#ff6a7a');
  if (s.fragment > 0) add('SLIVER INSIDE', '#e0e6f0');
  if (s.homonka > 0) add('HOMONKA', '#ffd23a');
  for (const k in s.sealed) if (s.sealed[k] > 0) add(k.toUpperCase() + ' SEALED', '#ff8a9a');
  for (const k in s.erased) if (s.erased[k]) add(k.toUpperCase() + ' ERASED', '#eee');
  if (s.renamed) add('RENAMED', '#eee');
  if (s.onIce) add('ON ICE', '#aef');
  if (f.bankai && f.def.id === 'ikkaku') add('CREST ' + Math.round(f.crest) + '%', '#ff5a3a', f.crest / 100);
  if (f.bankai && f.def.id === 'shunsui') add('SHARED WOUNDS', '#f7a8c8');
  if (f.bankai && f.def.id === 'kenpachi') add('UNBLOCKABLE / NO FLINCH', '#f2d23a');
  if (f.bankai && f.def.id === 'yamamoto') add('BURNS ON TOUCH', '#ff9a4a');
  if (f.bankai && f.def.id === 'rukia') add('ABSOLUTE ZERO', '#cfefff');
  return chips;
}

function drawHud(ctx, w, minds) {
  for (const f of w.fighters) {
    const left = f.side === 0, x0 = left ? 32 : W - 32, dir = left ? 1 : -1, barW = 500;
    const bx = left ? x0 : x0 - barW;
    text(ctx, f.def.name.toUpperCase(), x0, 34, 24, PAPER, left ? 'left' : 'right');
    const modeLabel = f.bankai ? 'BANKAI · ' + f.def.bankaiName.toUpperCase() : 'SHIKAI · ' + f.def.shikai.toUpperCase();
    ctx.font = `700 24px ${FONT_UI}`;
    const nameW = ctx.measureText(f.def.name.toUpperCase()).width;
    text(ctx, modeLabel, x0 + dir * (nameW + 14), 33, 15, f.bankai ? GOLD : '#a9a3b8', left ? 'left' : 'right');
    // Spirit orbs
    for (let i = 0; i < 2; i++) {
      const ox = left ? bx + barW - 10 - i * 22 : bx + 10 + i * 22;
      ctx.fillStyle = i < f.orbs ? '#e9f6ff' : 'rgba(255,255,255,0.12)';
      circle(ctx, ox, 26, 8);
      if (i < f.orbs) { ctx.fillStyle = REI; circle(ctx, ox, 26, 4); }
    }
    // Health, with the recent damage trailing behind
    f.hpShown = f.hpShown === undefined ? f.hp : f.hpShown + (f.hp - f.hpShown) * 0.06;
    if (f.hpShown < f.hp) f.hpShown = f.hp;
    ctx.fillStyle = 'rgba(8,8,14,0.75)'; ctx.fillRect(bx - 3, 41, barW + 6, 22);
    const hpW = barW * Math.max(0, f.hp) / f.maxHp, lagW = barW * Math.max(0, f.hpShown) / f.maxHp;
    ctx.fillStyle = '#f6e6c8'; ctx.fillRect(left ? bx : bx + barW - lagW, 44, lagW, 16);
    ctx.fillStyle = f.hp / f.maxHp < 0.25 ? BLOOD : '#e8503a'; ctx.fillRect(left ? bx : bx + barW - hpW, 44, hpW, 16);
    // Reiatsu
    ctx.fillStyle = 'rgba(8,8,14,0.75)'; ctx.fillRect(bx - 3, 66, barW * 0.7 + 6, 12);
    const rw = barW * 0.7 * f.reiatsu / 100, full = !f.bankai && f.reiatsu >= 100;
    ctx.fillStyle = f.bankai ? GOLD : full ? (w.frame % 30 < 15 ? '#bfe6ff' : REI) : REI;
    ctx.fillRect(left ? bx : bx + barW - rw, 69, rw, 6);
    const reiLabel = f.bankai ? 'BANKAI ACTIVE' : full ? `BANKAI READY · ${f.side === 0 ? 'T' : "'"}` : 'REIATSU';
    text(ctx, reiLabel, left ? bx + barW * 0.7 + 12 : bx + barW * 0.3 - 12, 77, 14, full || f.bankai ? GOLD : '#8d88a0', left ? 'left' : 'right');
    // Status chips
    let cx = left ? bx : bx + barW;
    ctx.font = `700 13px ${FONT_UI}`;
    for (const c of statusChips(f, w)) {
      const tw = ctx.measureText(c.label).width + 14 + (c.value !== undefined ? 34 : 0);
      const x = left ? cx : cx - tw;
      if (left ? x + tw > bx + barW + 40 : x < bx - 40) break;
      ctx.fillStyle = 'rgba(8,8,14,0.7)'; roundRect(ctx, x, 86, tw, 20, 4); ctx.fill();
      ctx.strokeStyle = c.color; ctx.lineWidth = 1; ctx.stroke();
      text(ctx, c.label, x + 7, 101, 13, c.color);
      if (c.value !== undefined) {
        ctx.fillStyle = 'rgba(255,255,255,0.15)'; ctx.fillRect(x + tw - 38, 93, 30, 6);
        ctx.fillStyle = c.color; ctx.fillRect(x + tw - 38, 93, 30 * clamp(c.value, 0, 1), 6);
      }
      cx += dir * (tw + 6);
    }
    if (minds && minds[f.side]) text(ctx, 'CPU · ' + minds[f.side], x0, 126, 15, '#c9c3d8', left ? 'left' : 'right', FONT_UI, 600);
  }
  // Timer
  const secs = Math.ceil(w.timer / 60);
  ctx.fillStyle = 'rgba(8,8,14,0.75)'; roundRect(ctx, W / 2 - 38, 18, 76, 52, 8); ctx.fill();
  text(ctx, String(secs), W / 2, 60, 40, secs <= 10 ? BLOOD : PAPER, 'center');
}

function drawBanner(ctx, w) {
  let main = null, sub = null;
  if (w.phase === 'intro') { main = w.phaseT > 40 ? 'READY' : 'FIGHT'; }
  else if (w.phase === 'orbbreak') { main = 'SPIRIT ORB SHATTERED'; sub = w.orbBroken ? w.orbBroken.def.name : null; }
  else if (w.phase === 'over') { main = w.timeout ? 'TIME' : 'K.O.'; }
  if (!main) return;
  ctx.fillStyle = 'rgba(8,8,14,0.45)'; ctx.fillRect(0, H / 2 - 70, W, 120);
  outlinedText(ctx, main, W / 2, H / 2 + 12, 72, PAPER, 'center', FONT_DISPLAY);
  if (sub) outlinedText(ctx, sub, W / 2, H / 2 + 44, 22, '#cfc8dc');
}

function drawRelease(ctx, w) {
  const r = w.release;
  if (!r) return;
  const k = 1 - r.t / RELEASE_FRAMES, f = r.f, look = LOOKS[f.def.id];
  const fade = r.t < 10 ? r.t / 10 : 1;
  ctx.save();
  ctx.globalAlpha = fade;
  ctx.fillStyle = 'rgba(4,4,10,0.72)'; ctx.fillRect(0, 0, W, H);
  // An ink stroke in the bankai's colour sweeps across the screen.
  const sweep = Math.min(1, k * 4);
  ctx.fillStyle = alphaHex(look.aura, 0.85);
  ctx.beginPath();
  ctx.moveTo(0, H / 2 - 60); ctx.lineTo(W * sweep, H / 2 - 90); ctx.lineTo(W * sweep, H / 2 + 50); ctx.lineTo(0, H / 2 + 80);
  ctx.closePath(); ctx.fill();
  ctx.save();
  if (w.cam) applyCamera(ctx, w.cam);
  drawFighter(ctx, f);
  ctx.restore();
  const scale = 1 + Math.max(0, 0.25 - k) * 2;
  ctx.translate(W / 2, H / 2);
  ctx.scale(scale, scale);
  outlinedText(ctx, 'BANKAI', 0, 0, 120, PAPER, 'center', FONT_DISPLAY);
  outlinedText(ctx, f.def.bankaiName.toUpperCase(), 0, 54, 34, GOLD);
  ctx.restore();
}
