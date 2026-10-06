'use strict';
// The 3D view, built with Three.js (vendor/three.min.js). The simulation is a
// side-on 2D plane; this maps it into a 3D Seireitei courtyard: toon-shaded
// procedural fighters with ink outlines, a following camera, and every bankai
// effect. Nothing here changes the fight.

const U = 100;                      // simulation pixels per 3D unit
const X3 = x => (x - W / 2) / U;
const Y3 = y => (GROUND - y) / U;
const color = c => new THREE.Color(c);

// ------------------------------------------------------------------ shared resources

const GEO = {};
const MAT = {};
function geo(key, make) { return GEO[key] || (GEO[key] = make()); }
function mat(key, make) { return MAT[key] || (MAT[key] = make()); }

let GRADIENT = null;
function toonGradient() {
  if (GRADIENT) return GRADIENT;
  const data = new Uint8Array([70, 70, 70, 160, 160, 160, 255, 255, 255]);
  GRADIENT = new THREE.DataTexture(data, 3, 1, THREE.RGBFormat);
  GRADIENT.minFilter = GRADIENT.magFilter = THREE.NearestFilter;
  GRADIENT.needsUpdate = true;
  return GRADIENT;
}

function canvasTexture(w, h, paint) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  paint(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.needsUpdate = true;
  return t;
}

const glowTexture = () => mat('glowTex', () => canvasTexture(64, 64, (g) => {
  const r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.4, 'rgba(255,255,255,0.45)'); r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r; g.fillRect(0, 0, 64, 64);
}));

function glowSprite(c, sx, sy, opacity = 0.7) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: color(c), transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false }));
  s.scale.set(sx, sy, 1);
  return s;
}

const OUTLINE = () => mat('outline', () => new THREE.MeshBasicMaterial({ color: 0x0b0a10, side: THREE.BackSide }));
const basic = (c, o = 1, extra) => new THREE.MeshBasicMaterial(Object.assign({ color: color(c), transparent: o < 1, opacity: o, depthWrite: o >= 1 }, extra));
const additive = (c, o = 0.8) => new THREE.MeshBasicMaterial({ color: color(c), transparent: true, opacity: o, blending: THREE.AdditiveBlending, depthWrite: false });

// ------------------------------------------------------------------ fighter models

// Every model gets its own materials so status tints never leak between fighters.
class ModelKit {
  constructor(ghost) { this.ghost = ghost; this.toons = []; }
  toon(c, extra) {
    const m = new THREE.MeshToonMaterial(Object.assign({ color: color(c), gradientMap: toonGradient() }, extra));
    if (this.ghost) { m.transparent = true; m.opacity = 0.5; m.depthWrite = false; }
    this.toons.push(m);
    return m;
  }
  mesh(g, m, x = 0, y = 0, z = 0, outline = 1.07) {
    const o = new THREE.Mesh(g, m);
    o.position.set(x, y, z);
    o.castShadow = !this.ghost;
    if (outline && !this.ghost) {
      const ol = new THREE.Mesh(g, OUTLINE());
      ol.scale.setScalar(outline);
      o.add(ol);
    }
    return o;
  }
}

const G = {
  box: (w, h, d) => geo(`box${w},${h},${d}`, () => new THREE.BoxGeometry(w, h, d)),
  cyl: (rt, rb, h, s = 10) => geo(`cyl${rt},${rb},${h},${s}`, () => new THREE.CylinderGeometry(rt, rb, h, s)),
  // A cylinder lying along +X, centred on its own midpoint.
  rod: (r, len, s = 8) => geo(`rod${r},${len},${s}`, () => new THREE.CylinderGeometry(r, r, len, s).rotateZ(-Math.PI / 2)),
  cone: (r, h, s = 8) => geo(`cone${r},${h},${s}`, () => new THREE.ConeGeometry(r, h, s)),
  sphere: (r, ws = 14, hs = 10) => geo(`sph${r},${ws},${hs}`, () => new THREE.SphereGeometry(r, ws, hs)),
  cap: (r) => geo(`cap${r}`, () => new THREE.SphereGeometry(r, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.55)),
  // An open coat: a tapered shell with the front left open.
  shell: (rt, rb, h, gap) => geo(`shell${rt},${rb},${h},${gap}`, () => new THREE.CylinderGeometry(rt, rb, h, 18, 1, true, Math.PI / 2 + gap, Math.PI * 2 - gap * 2)),
  torus: (r, t, arc = Math.PI * 2) => geo(`tor${r},${t},${arc}`, () => new THREE.TorusGeometry(r, t, 6, 24, arc)),
};

function buildWeapon(kit, type, L, look) {
  const steel = kit.toon('#dfe6ee', { emissive: color('#30363e') });
  const dark = kit.toon('#1a1a20');
  const gold = kit.toon('#e2b84a', { emissive: color('#3a2a08') });
  const hiltMat = kit.toon(look.hilt || '#2a1e1a');
  const g = new THREE.Group(), back = new THREE.Group();
  const hilt = (m = hiltMat, len = 0.1) => g.add(kit.mesh(G.rod(0.013, len), m, -len / 2, 0, 0, 1.15));
  const tsuba = (m = gold) => g.add(kit.mesh(G.cyl(0.032, 0.032, 0.012, 12).clone().rotateZ(Math.PI / 2), m, 0, 0, 0, 0));
  const blade = (len, w, m, x0 = 0, into = g) => into.add(kit.mesh(G.box(len, w, 0.008), m, x0 + len / 2, 0, 0, 1.08));
  switch (type) {
    case 'katana': hilt(); tsuba(); blade(L, 0.022, steel); break;
    case 'charred': hilt(); tsuba(); blade(L, 0.026, kit.toon('#3a2a24', { emissive: color('#5a1e08') })); break;
    case 'whiteKatana': hilt(kit.toon('#f4f6fa')); blade(L, 0.024, kit.toon('#ffffff', { emissive: color('#5a6a74') })); break;
    case 'cleaver': hilt(kit.toon('#f2efe6'), 0.14); blade(L, 0.09, dark); blade(L, 0.016, steel); break;
    case 'twinBlades': // True Tensa Zangetsu: a great black blade and a short one
      hilt(dark); blade(L, 0.07, dark); blade(L, 0.012, kit.toon('#f2f2f2'));
      back.add(kit.mesh(G.rod(0.012, 0.08), dark, -0.04, 0, 0, 1.15));
      blade(L * 0.55, 0.035, dark, 0, back);
      break;
    case 'originalBlade': // what was inside: a long black blade edged in white light
      hilt(dark); blade(L, 0.035, dark);
      blade(L, 0.01, kit.toon('#ffffff', { emissive: color('#d8e8ff') }));
      for (let i = 0; i < 4; i++) g.add(kit.mesh(G.box(0.05, 0.03, 0.01), dark, L * (0.2 + i * 0.2), 0.06 + (i % 2) * 0.03, 0.02, 0));
      break;
    case 'bigCleaver': hilt(); blade(L, 0.11, kit.toon('#9aa1aa')); for (let i = 1; i < 5; i++) g.add(kit.mesh(G.box(0.03, 0.03, 0.012), dark, L * i / 5, -0.05, 0, 0)); break;
    case 'trident':
      hilt(); g.add(kit.mesh(G.sphere(0.035), gold, 0, 0, 0, 0)); blade(L, 0.02, steel);
      for (const s of [1, -1]) { const p = kit.mesh(G.box(L * 0.3, 0.014, 0.008), steel, L * 0.7, s * 0.04, 0, 0); p.rotation.z = s * 0.5; g.add(p); }
      break;
    case 'whip': case 'boneSnake': {
      hilt();
      const n = type === 'boneSnake' ? 7 : 5, m = type === 'boneSnake' ? kit.toon('#efe4cc') : steel, size = type === 'boneSnake' ? 0.07 : 0.04;
      for (let i = 0; i < n; i++) { const s = kit.mesh(G.cone(size, L / n, 4).clone().rotateZ(-Math.PI / 2), m, (i + 0.5) * L / n, 0, 0, 1.1); g.add(s); }
      if (type === 'boneSnake') g.add(kit.mesh(G.sphere(0.025), kit.toon('#c23a2a'), L, 0.02, 0.03, 0));
      break;
    }
    case 'goldWhip': hilt(); for (let i = 0; i < 8; i++) g.add(kit.mesh(G.box(L / 8, 0.018, 0.018), gold, (i + 0.5) * L / 8, Math.sin(i) * 0.02, 0, 0)); break;
    case 'dual': hilt(); tsuba(); blade(L, 0.022, steel); back.add(kit.mesh(G.rod(0.012, 0.08), hiltMat, -0.04, 0, 0, 1.15)); blade(0.4, 0.02, steel, 0, back); break;
    case 'wakizashi': hilt(); tsuba(); blade(L, 0.02, steel); break;
    case 'ringKatana': hilt(); g.add(kit.mesh(G.torus(0.04, 0.008), gold, -0.14, 0, 0, 0)); blade(L, 0.022, steel); break;
    case 'stinger': g.add(kit.mesh(G.cone(0.02, L, 6).clone().rotateZ(-Math.PI / 2), gold, L / 2, 0, 0, 1.1)); break;
    case 'knife': hilt(); g.add(kit.mesh(G.torus(0.03, 0.007), gold, -0.12, 0, 0, 0)); blade(L, 0.035, steel); break;
    case 'knuckles': g.add(kit.mesh(G.box(0.1, 0.09, 0.09), kit.toon('#b48a3a'), 0.02, 0, 0)); break;
    case 'spear': g.add(kit.mesh(G.rod(0.014, L + 0.26), kit.toon('#8a5a2a'), (L - 0.26) / 2, 0, 0, 1.1)); g.add(kit.mesh(G.cone(0.03, 0.14, 6).clone().rotateZ(-Math.PI / 2), steel, L + 0.07, 0, 0)); g.add(kit.mesh(G.sphere(0.025), kit.toon('#c23a2a'), L - 0.04, -0.04, 0, 0)); break;
    case 'axes': {
      const axe = into => {
        into.add(kit.mesh(G.rod(0.014, L * 0.6), kit.toon('#7a4a2a'), L * 0.2, 0, 0, 1.1));
        const head = kit.mesh(G.torus(L * 0.28, 0.025, Math.PI), kit.toon('#c9ced6', { emissive: color('#000000') }), L * 0.55, 0.02, 0, 1.1);
        head.rotation.z = -Math.PI / 2;
        into.add(head);
        return head;
      };
      g.userData.crest = axe(g);
      axe(back);
      break;
    }
    case 'rapier': g.add(kit.mesh(G.sphere(0.04, 10, 6), gold, 0, 0, 0, 0)); hilt(); blade(L, 0.012, steel); break;
    case 'brush': g.add(kit.mesh(G.rod(0.02, L), kit.toon('#5a3a1a'), L / 2 - 0.1, 0, 0, 1.1)); g.userData.bristle = kit.mesh(G.sphere(0.07, 10, 8), kit.toon('#141414'), L, 0, 0); g.userData.bristle.scale.set(1.8, 1, 1); g.add(g.userData.bristle); break;
    case 'needle': g.add(kit.mesh(G.rod(0.008, L), kit.toon('#e6e2f2'), L / 2, 0, 0, 1.2)); break;
    case 'hilt': hilt(); tsuba(); break;
  }
  return { front: g, back };
}

function buildHair(kit, L, head) {
  if (!L.hair && L.style !== 'wolf') return;
  const hm = kit.toon(L.hair || '#333');
  const add = (m, x, y, z, rx = 0, ry = 0, rz = 0) => { m.position.set(x, y, z); m.rotation.set(rx, ry, rz); head.add(m); return m; };
  const capMesh = () => add(kit.mesh(G.cap(0.118), hm), 0, 0.005, 0, 0, 0, 0.25);
  switch (L.style) {
    case 'spiky':
      capMesh();
      for (let i = 0; i < 9; i++) {
        const a = -0.4 + (i % 5) * 0.45, b = i < 5 ? 0.6 : 1.1;
        const s = kit.mesh(G.cone(0.04, 0.16, 5), hm);
        add(s, -Math.cos(a) * 0.08 * b, 0.06 + Math.sin(b) * 0.04, (i % 3 - 1) * 0.06, (i % 3 - 1) * 0.5, 0, 0.9 + a);
      }
      break;
    case 'kenpachi': {
      capMesh();
      const bell = kit.toon('#e2b84a');
      for (let i = 0; i < 9; i++) {
        const a = -2.6 + i * 0.6, s = kit.mesh(G.cone(0.03, 0.26, 5), hm);
        add(s, Math.cos(a) * 0.12, Math.sin(a) * 0.12 + 0.03, (i % 3 - 1) * 0.06, 0, 0, a - Math.PI / 2);
        add(kit.mesh(G.sphere(0.018, 6, 4), bell, 0), Math.cos(a) * 0.25, Math.sin(a) * 0.25 + 0.03, (i % 3 - 1) * 0.06);
      }
      break;
    }
    case 'long': case 'longWavy': capMesh(); add(kit.mesh(G.box(0.12, L.style === 'long' ? 0.32 : 0.44, 0.2), hm), -0.07, L.style === 'long' ? -0.12 : -0.18, 0); break;
    case 'bob': capMesh(); add(kit.mesh(G.box(0.14, 0.14, 0.24), hm), -0.04, -0.04, 0); break;
    case 'bobStraight': capMesh(); add(kit.mesh(G.box(0.15, 0.13, 0.25), hm), -0.03, -0.03, 0); add(kit.mesh(G.box(0.04, 0.05, 0.2), hm), 0.09, 0.06, 0); break;
    case 'ponytail':
      capMesh();
      for (let i = 0; i < 5; i++) add(kit.mesh(G.cone(0.045, 0.24, 5), hm), -0.16, 0.08 + i * 0.02, (i - 2) * 0.03, 0, 0, 1.1 + i * 0.1);
      if (L.bandana) add(kit.mesh(G.cyl(0.118, 0.118, 0.03, 14), kit.toon('#f2f2f2'), 0), 0, 0.04, 0, 0, 0, 0.2);
      break;
    case 'braids': {
      capMesh(); add(kit.mesh(G.box(0.12, 0.12, 0.22), hm), -0.04, -0.03, 0);
      const wrap = kit.toon('#f2f2f2');
      for (const z of [0.05, -0.05]) add(kit.mesh(G.cyl(0.02, 0.02, 0.4, 6), wrap), -0.1, -0.28, z);
      break;
    }
    case 'braidFront': capMesh(); add(kit.mesh(G.box(0.12, 0.1, 0.22), hm), -0.05, -0.02, 0); add(kit.mesh(G.cyl(0.03, 0.025, 0.42, 6), hm), 0.06, -0.3, 0.06); break;
    case 'wavy': capMesh(); for (let i = 0; i < 3; i++) add(kit.mesh(G.sphere(0.05, 8, 6), hm), -0.1 - i * 0.03, -0.02 - i * 0.06, 0); break;
    case 'short': case 'slick': capMesh(); break;
    case 'shaggy': capMesh(); for (let i = 0; i < 4; i++) add(kit.mesh(G.cone(0.025, 0.08, 4), hm), 0.08, -0.02, (i - 1.5) * 0.04, 0, 0, Math.PI); break;
    case 'dreads': capMesh(); for (let i = 0; i < 6; i++) add(kit.mesh(G.cyl(0.015, 0.015, 0.3, 5), hm), -0.06 - (i % 2) * 0.03, -0.13, (i - 2.5) * 0.035); break;
    case 'updo': capMesh(); add(kit.mesh(G.sphere(0.07, 10, 8), hm), -0.06, 0.13, 0); add(kit.mesh(G.rod(0.008, 0.26), kit.toon('#e2b84a'), 0), -0.06, 0.14, 0, 0, 0.3, 0.4); break;
    case 'mayuri': {
      capMesh();
      const gold = kit.toon('#e2b84a');
      add(kit.mesh(G.cone(0.07, 0.32, 8), gold), -0.2, 0.06, 0, 0, 0, 1.3);
      for (const z of [0.11, -0.11]) add(kit.mesh(G.cyl(0.035, 0.035, 0.08, 8), gold), 0, -0.01, z, Math.PI / 2, 0, 0);
      add(kit.mesh(G.box(0.03, 0.05, 0.18), kit.toon('#111111'), 0), 0.105, 0.01, 0);
      break;
    }
  }
  if (L.hat === 'straw') { const h = kit.toon('#d9b46a'); add(kit.mesh(G.cyl(0.3, 0.3, 0.02, 18), h), 0, 0.1, 0, 0, 0, 0.12); add(kit.mesh(G.cone(0.13, 0.1, 12), h), 0, 0.16, 0, 0, 0, 0.12); }
  if (L.hat === 'bucket') {
    add(kit.mesh(G.cyl(0.17, 0.17, 0.02, 14), kit.toon('#3c6b4a')), 0, 0.09, 0);
    add(kit.mesh(G.cyl(0.11, 0.12, 0.12, 14), kit.toon('#3c6b4a')), 0, 0.15, 0);
    add(kit.mesh(G.cyl(0.113, 0.123, 0.03, 14), kit.toon('#f0f0f0'), 0), 0, 0.15, 0);
  }
}

function buildModel(def, ghost = false) {
  const base = Object.assign({ robe: '#17161d' }, LOOKS[def.id]);
  const kit = new ModelKit(ghost);
  const M = { def, kit, mats: {}, weapons: {}, extras: {} };
  M.mats.skin = kit.toon(base.skin);
  M.mats.robe = kit.toon(base.robe);
  M.mats.hair = null;
  const sleeveMat = base.sleeveless ? M.mats.skin : base.coat ? kit.toon(base.coat) : base.haori ? kit.toon(base.haoriColor || '#f4f2ec') : M.mats.robe;
  M.root = new THREE.Group();
  M.posture = new THREE.Group();
  M.root.add(M.posture);
  M.hips = new THREE.Group();
  M.hips.position.y = 0.54;
  M.posture.add(M.hips);

  // Legs: hakama and white tabi
  const tabi = kit.toon('#ece6da');
  M.legs = [0.07, -0.07].map(z => {
    const leg = new THREE.Group();
    leg.position.z = z;
    leg.add(kit.mesh(G.cyl(0.075, 0.12, 0.52, 10), M.mats.robe, 0, -0.26, 0));
    leg.add(kit.mesh(G.box(0.15, 0.05, 0.08), tabi, 0.03, -0.52, 0));
    M.hips.add(leg);
    return leg;
  });

  M.torso = new THREE.Group();
  M.hips.add(M.torso);
  const chest = kit.mesh(G.cyl(0.15, 0.13, 0.44, 12), M.mats.robe, 0, 0.21, 0);
  chest.scale.z = 0.82;
  M.torso.add(chest);
  M.torso.add(kit.mesh(G.cyl(0.138, 0.138, 0.05, 12), kit.toon(base.sash || '#d8d0be'), 0, 0.05, 0, 0));
  M.torso.add(kit.mesh(G.box(0.03, 0.12, 0.08), kit.toon('#efe8d8'), 0.13, 0.36, 0, 0)); // collar
  if (base.haori || base.coat) {
    const h = kit.mesh(G.shell(0.17, 0.25, 0.8, 0.35), kit.toon(base.coat || base.haoriColor || '#f4f2ec', { side: THREE.DoubleSide }), 0, 0.03, 0, 1.03);
    M.torso.add(h);
  }
  if (base.kimono) M.torso.add(kit.mesh(G.shell(0.19, 0.28, 0.82, 1.1), kit.toon(base.kimono, { side: THREE.DoubleSide }), 0, 0.02, 0, 0));
  if (base.strap) { const s = kit.mesh(G.box(0.03, 0.5, 0.25), kit.toon(base.strap), 0.02, 0.22, 0, 0); s.rotation.x = 0.7; M.torso.add(s); }
  if (base.scarf) {
    M.extras.scarf = kit.mesh(G.box(0.36, 0.05, 0.16), kit.toon(base.scarf), -0.2, 0.42, 0, 0);
    M.torso.add(M.extras.scarf);
  }

  // Head
  M.head = new THREE.Group();
  M.head.position.set(0.02, 0.54, 0);
  M.torso.add(M.head);
  M.torso.add(kit.mesh(G.cyl(0.04, 0.045, 0.08, 8), M.mats.skin, 0.01, 0.47, 0, 0));
  if (base.style === 'wolf') {
    M.head.add(kit.mesh(G.sphere(0.135), M.mats.skin));
    const snout = kit.mesh(G.cone(0.07, 0.2, 8).clone().rotateZ(-Math.PI / 2), M.mats.skin, 0.17, -0.02, 0);
    M.head.add(snout);
    for (const z of [0.07, -0.07]) M.head.add(kit.mesh(G.cone(0.04, 0.12, 5), M.mats.skin, -0.02, 0.15, z));
    M.head.add(kit.mesh(G.sphere(0.022, 6, 4), kit.toon('#111'), 0.27, -0.01, 0, 0));
  } else {
    M.head.add(kit.mesh(G.sphere(0.11), M.mats.skin));
  }
  const eyeMat = kit.toon(base.redEyes ? '#c23a2a' : '#141414');
  if (base.squint) for (const z of [0.04, -0.04]) M.head.add(kit.mesh(G.box(0.01, 0.006, 0.03), eyeMat, 0.106, 0.01, z, 0));
  else if (!base.visor) for (const z of [0.042, -0.042]) M.head.add(kit.mesh(G.sphere(0.014, 6, 4), eyeMat, 0.098, 0.012, z, 0));
  if (base.visor) M.head.add(kit.mesh(G.box(0.04, 0.035, 0.22), kit.toon('#c9ccd6'), 0.09, 0.015, 0, 0));
  if (base.eyepatch) M.head.add(kit.mesh(G.box(0.03, 0.04, 0.05), kit.toon('#111'), 0.1, 0.015, 0.04, 0));
  if (base.kenseikan) for (const y of [0.06, 0.0]) M.head.add(kit.mesh(G.box(0.05, 0.03, 0.02), kit.toon('#f6f6f6'), -0.02, y, 0.11, 0));
  if (base.mustache) M.head.add(kit.mesh(G.box(0.02, 0.015, 0.09), kit.toon(base.hair), 0.105, -0.035, 0, 0));
  if (base.beard) {
    const b = kit.mesh(G.cone(0.07, base.longBeard ? 0.42 : 0.2, 8), kit.toon(base.beard), 0.06, base.longBeard ? -0.27 : -0.15, 0, 0);
    b.rotation.z = Math.PI;
    M.head.add(b);
  }
  buildHair(kit, base, M.head);
  M.extras.horn = kit.mesh(G.cone(0.025, 0.14, 6), kit.toon('#efe6d0'), 0.06, 0.13, 0, 0);
  M.extras.horn.rotation.z = -0.4;
  M.head.add(M.extras.horn);

  // Arms: pivot at the shoulder, extending along +X; weapons hang off the hand.
  const arm = z => {
    const a = new THREE.Group();
    a.position.set(0.01, 0.4, z);
    a.add(kit.mesh(G.rod(0.05, 0.24), sleeveMat, 0.12, 0, 0));
    a.add(kit.mesh(G.sphere(0.038, 8, 6), M.mats.skin, 0.25, 0, 0));
    const hand = new THREE.Group();
    hand.position.x = 0.25;
    a.add(hand);
    a.userData.hand = hand;
    M.torso.add(a);
    return a;
  };
  M.armF = arm(0.17);
  M.armB = arm(-0.17);

  // Every weapon this fighter can hold, built once and toggled.
  const kinds = new Set([base.weapon, (BANKAI_LOOKS[def.id] || {}).weapon, def.id === 'ichigo' ? 'originalBlade' : null].filter(Boolean));
  for (const k of kinds) {
    const len = (k === (BANKAI_LOOKS[def.id] || {}).weapon && BANKAI_LOOKS[def.id].blade ? BANKAI_LOOKS[def.id].blade : k === 'originalBlade' ? 92 : base.blade) / U;
    const w = buildWeapon(kit, k, len, base);
    M.armF.userData.hand.add(w.front);
    M.armB.userData.hand.add(w.back);
    M.weapons[k] = w;
  }
  M.ext = new THREE.Mesh(G.box(1, 0.025, 0.012), additive('#ffffff', 0.55));
  M.ext.visible = false;
  M.armF.userData.hand.add(M.ext);

  // Bankai transformations
  const X = M.extras;
  X.coat = kit.mesh(G.shell(0.18, 0.34, 1.0, 0.3), kit.toon('#0d0c12', { side: THREE.DoubleSide }), -0.02, -0.06, 0, 1.03);
  M.torso.add(X.coat);
  X.pelt = kit.mesh(G.torus(0.16, 0.05), kit.toon('#c9b48a'), 0, 0.42, 0, 0);
  X.pelt.rotation.x = Math.PI / 2;
  M.torso.add(X.pelt);
  X.launcher = kit.mesh(G.rod(0.07, 0.5, 12), kit.toon('#e2b84a', { emissive: color('#3a2a08') }), 0.2, 0.05, 0);
  M.armF.add(X.launcher);
  if (def.id === 'toshiro') {
    const ice = new THREE.MeshToonMaterial({ color: color('#bfefff'), gradientMap: toonGradient(), transparent: true, opacity: 0.75, emissive: color('#2a5a6a') });
    const wingShape = new THREE.Shape();
    wingShape.moveTo(0, 0); wingShape.lineTo(-0.45, 0.6); wingShape.lineTo(-0.3, 0.2); wingShape.lineTo(-0.62, 0.15); wingShape.lineTo(-0.25, -0.1);
    const wg = geo('wing', () => new THREE.ShapeGeometry(wingShape));
    X.wings = new THREE.Group();
    for (const z of [0.12, -0.12]) { const m = new THREE.Mesh(wg, ice); m.position.set(-0.08, 0.42, z); m.rotation.y = z > 0 ? -0.5 : 0.5; m.material.side = THREE.DoubleSide; X.wings.add(m); }
    const tail = new THREE.Mesh(G.cone(0.05, 0.6, 6), ice);
    tail.position.set(-0.32, -0.15, 0); tail.rotation.z = 1.2;
    X.wings.add(tail);
    // Twelve ice petals behind him fall away as the bankai runs out.
    X.petals = [];
    for (let fl = 0; fl < 3; fl++) for (let p = 0; p < 4; p++) {
      const m = new THREE.Mesh(G.box(0.08, 0.035, 0.01), ice);
      const a = p * Math.PI / 2 + fl;
      m.position.set(-0.36 - fl * 0.16 + Math.cos(a) * 0.06, 0.95 - fl * 0.1 + Math.sin(a) * 0.06, -0.05);
      m.rotation.z = a;
      X.wings.add(m);
      X.petals.push(m);
    }
    M.torso.add(X.wings);
  }
  if (base.extraArms) {
    X.arms = new THREE.Group();
    for (let i = 0; i < 4; i++) { const a = kit.mesh(G.rod(0.015, 0.36), kit.toon('#8a7aa8'), -0.16, 0.4 + i * 0.05, (i % 2 ? 1 : -1) * 0.1, 0); a.rotation.z = -2.2 + i * 0.3; X.arms.add(a); }
    M.torso.add(X.arms);
  }
  X.ghost = new THREE.Group();
  X.ghost.add(new THREE.Mesh(G.sphere(0.18), basic('#c8323e', 0.28)));
  X.ghost.children[0].position.set(-0.45, 1.55, -0.3);
  const gb = new THREE.Mesh(G.cone(0.38, 1.2, 10), basic('#c8323e', 0.22));
  gb.position.set(-0.45, 0.85, -0.3);
  X.ghost.add(gb);
  M.posture.add(X.ghost);
  X.hands = new THREE.Group(); // Kinshara Butodan: giant golden hands, one with a baton
  for (const z of [0.5, -0.5]) {
    const hand = new THREE.Mesh(G.sphere(0.16, 10, 8), kit.toon('#e2b84a', { emissive: color('#4a3208') }));
    hand.position.set(-0.3, 2.1, z);
    hand.scale.set(1, 0.7, 1.2);
    X.hands.add(hand);
  }
  const baton = new THREE.Mesh(G.rod(0.015, 0.6), kit.toon('#f2f2f2'));
  baton.position.set(0.0, 2.2, 0.5);
  baton.rotation.z = -0.6;
  X.hands.add(baton);
  M.posture.add(X.hands);

  // Status visuals
  M.aura = glowSprite(base.aura, 1.4, 2.0, 0.55);
  M.aura.position.set(-0.05, 0.62, -0.25);
  M.root.add(M.aura);
  M.frozen = new THREE.Mesh(G.box(0.7, 1.4, 0.6), new THREE.MeshPhongMaterial({ color: 0xbfeaff, transparent: true, opacity: 0.45, shininess: 90, depthWrite: false }));
  M.frozen.position.y = 0.66;
  M.root.add(M.frozen);
  M.sphere = new THREE.Mesh(G.sphere(0.85, 18, 12), basic('#f6a8c8', 0.4));
  M.sphere.position.y = 0.6;
  M.root.add(M.sphere);
  M.bands = new THREE.Group();
  for (let i = 0; i < 3; i++) { const b = new THREE.Mesh(G.torus(0.26, 0.018), basic('#ffffff', 0.9)); b.rotation.x = Math.PI / 2; b.position.y = 0.4 + i * 0.3; M.bands.add(b); }
  M.root.add(M.bands);
  M.fire = new THREE.Group(); // Zanjitsu Gokui
  for (let i = 0; i < 7; i++) { const s = glowSprite('#ff7a1a', 0.6, 0.9, 0.7); s.position.set(Math.cos(i) * 0.25, 0.2 + i * 0.17, Math.sin(i) * 0.25); M.fire.add(s); }
  M.root.add(M.fire);
  M.shell = new THREE.Mesh(G.sphere(0.6, 16, 10), basic('#ffcf5a', 0.22)); // Myo-o's armour
  M.shell.scale.set(0.9, 1.3, 0.9);
  M.shell.position.y = 0.65;
  M.root.add(M.shell);
  M.shieldDisc = new THREE.Mesh(geo('disc', () => new THREE.CircleGeometry(0.45, 24).rotateY(Math.PI / 2)), basic('#d23a4a', 0.45, { side: THREE.DoubleSide }));
  M.shieldDisc.position.set(0.45, 0.7, 0);
  M.root.add(M.shieldDisc);
  M.bubble = new THREE.Mesh(G.sphere(0.2, 12, 8), basic('#8ac8ff', 0.3)); // drowning
  M.bubble.position.set(0.02, 1.08, 0);
  M.root.add(M.bubble);
  M.trail = new THREE.Mesh(geo('trail', () => new THREE.RingGeometry(0.55, 0.85, 18, 1, 0, 1.6)), additive('#ffffff', 0.22));
  M.trail.material.side = THREE.DoubleSide;
  M.trail.position.set(0.01, 0.94, 0.05);
  M.posture.add(M.trail);
  M.flash = 0;
  M.lastHp = null;
  return M;
}

function setTint(M, c, k) {
  for (const m of M.kit.toons) { m.emissive.copy(c).multiplyScalar(k); }
}

function poseModel(M, f, t) {
  const L = lookOf(f), P = pose(f), s = (f.h || 120) / 120, build = LOOKS[f.def.id].build || 1, fx = f.fx || {};
  M.root.position.set(X3(f.x) + (P.tremble ? Math.sin(t * 2.3) * 0.015 : 0), Y3(f.y), 0);
  M.root.scale.set(f.facing * s * build, s, s * build);
  M.root.rotation.y = -0.35 * f.facing;
  M.posture.rotation.z = P.down ? Math.PI * 0.47 : 0;
  M.posture.position.y = P.down ? 0.12 : 0;
  M.hips.position.y = 0.54 + P.bob / U;
  M.torso.rotation.z = -P.lean;
  if (P.air) { M.legs[0].rotation.z = 0.6; M.legs[1].rotation.z = -0.25; }
  else { M.legs[0].rotation.z = P.step * 0.45; M.legs[1].rotation.z = -P.step * 0.45; }
  M.armF.rotation.z = -P.arm;
  M.armB.rotation.z = -(P.arm + 0.5);
  for (const k in M.weapons) {
    const on = k === L.weapon;
    M.weapons[k].front.visible = on;
    M.weapons[k].back.visible = on;
  }
  // Long thrusts and lashes: draw the blade out to the attack's real reach.
  const bladeLen = (L.blade || 60) / U, reach = P.reach / U / s;
  M.ext.visible = reach > bladeLen + 0.5;
  if (M.ext.visible) { M.ext.scale.x = reach; M.ext.position.x = reach / 2; }
  M.trail.visible = !!P.trail;
  if (P.trail) {
    const lo = Math.min(P.trail[0], P.trail[1]);
    M.trail.rotation.z = -lo - 1.6;
    M.trail.material.color.set(L.aura);
  }
  const X = M.extras, bk = !!f.bankai;
  X.coat.visible = bk && !!L.coat && f.def.id === 'ichigo';
  X.pelt.visible = bk && !!L.pelt;
  X.launcher.visible = bk && !!L.launcher;
  X.horn.visible = bk && !!L.horn;
  X.ghost.visible = bk && !!L.ghost;
  X.hands.visible = bk && !!L.hands;
  if (X.hands.visible) X.hands.position.y = Math.sin(t * 0.05) * 0.05;
  if (X.wings) {
    X.wings.visible = bk;
    const petals = Math.ceil((f.reiatsu || 0) / 100 * 12);
    X.petals.forEach((p, i) => { p.visible = i < petals; });
  }
  if (X.scarf) X.scarf.rotation.z = Math.sin(t * 0.1) * 0.15 - 0.1;
  M.mats.skin.color.set(L.skin);
  M.mats.robe.color.set(L.robe);
  const crest = M.weapons.axes && M.weapons.axes.front.userData.crest;
  if (crest) crest.material.emissive.setRGB((f.crest || 0) / 120, 0, 0);
  const brush = M.weapons.brush && M.weapons.brush.front.userData.bristle;
  if (brush) brush.material.color.set(bk ? '#f4f4f4' : '#141414');

  M.aura.visible = bk;
  if (bk) M.aura.material.opacity = 0.45 + Math.sin(t * 0.2) * 0.12;
  M.frozen.visible = fx.frozen > 0;
  M.sphere.visible = fx.trapped > 0 && fx.trapKind === 'gokei';
  M.bands.visible = fx.trapped > 0 && fx.trapKind !== 'gokei';
  if (M.bands.visible) {
    const c = { itodome: '#f7a8c8', skeletons: '#efe6d4', threads: '#d8b8ff' }[fx.trapKind] || '#ffffff';
    M.bands.children.forEach((b, i) => { b.material.color.set(c); b.rotation.z = Math.sin(t * 0.2 + i) * 0.2; });
  }
  M.fire.visible = f.robe > 0;
  if (M.fire.visible) M.fire.children.forEach((s, i) => { s.position.y = 0.15 + ((t * 0.03 + i * 0.17) % 1.3); s.material.opacity = 0.4 + Math.random() * 0.4; });
  M.shell.visible = f.armorT > 0;
  M.shieldDisc.visible = f.shield > 0;
  M.bubble.visible = fx.drowning > 0;

  // Tints: hit flash, then the strongest status
  if (M.lastHp !== null && f.hp < M.lastHp - 1) M.flash = 3;
  M.lastHp = f.hp;
  if (M.flash > 0) { M.flash--; setTint(M, color('#ffffff'), 0.3); }
  else if (fx.paralyzed > 0) setTint(M, color('#b070ff'), 0.45);
  else if (fx.frost > 1) setTint(M, color('#8fe3ff'), fx.frost / 220);
  else if (fx.toxin > 1) setTint(M, color('#a050d0'), fx.toxin / 300);
  else if (fx.disease > 0) setTint(M, color('#401028'), 0.5);
  else if (bk && L.frost) setTint(M, color('#cfefff'), 0.18);
  else setTint(M, color('#000000'), 0);
}

// ------------------------------------------------------------------ the scene

class Scene3D {
  constructor(canvas) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    this.renderer.setSize(W, H, false);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(38, W / H, 0.1, 200);
    this.cam = { x: 0, dist: 8, y: 1.7, look: 1.0 };
    this.models = new Map();   // fighter or clone -> model
    this.spare = new Map();    // def.id -> unused models for reuse
    this.vis = new Map();      // sim object -> { obj, update }
    this.flashT = 0;
    this.fxGroup = new THREE.Group();
    this.scene.add(this.fxGroup);
    this.buildArena();
    this.buildParticles();
  }

  buildArena() {
    const S = this.scene;
    S.background = canvasTexture(16, 256, (g, w, h) => {
      const gr = g.createLinearGradient(0, 0, 0, h);
      gr.addColorStop(0, '#0d1230'); gr.addColorStop(0.55, '#2a2d5a'); gr.addColorStop(1, '#5d4a70');
      g.fillStyle = gr; g.fillRect(0, 0, w, h);
    });
    S.fog = new THREE.Fog(0x1e2142, 10, 36);
    this.hemi = new THREE.HemisphereLight(0x9aaaf0, 0x2e2622, 0.6);
    S.add(this.hemi);
    const moon = new THREE.DirectionalLight(0xd8e0ff, 0.85);
    moon.position.set(-6, 12, 9);
    moon.castShadow = true;
    moon.shadow.mapSize.set(1024, 1024);
    Object.assign(moon.shadow.camera, { left: -9, right: 9, top: 6, bottom: -3, near: 1, far: 40 });
    S.add(moon);
    this.moonLight = moon;
    this.heatLight = new THREE.PointLight(0xff7a2a, 0, 6);
    S.add(this.heatLight);
    for (const x of [-7, 7]) { const l = new THREE.PointLight(0xffb060, 0.6, 9); l.position.set(x, 2, -3); S.add(l); }

    // Stars and moon
    const starGeo = new THREE.BufferGeometry(), pts = [];
    const rng = makeRng(7);
    for (let i = 0; i < 300; i++) pts.push((rng() - 0.5) * 120, 8 + rng() * 30, -60 - rng() * 10);
    starGeo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    S.add(new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xffffff, size: 0.18, fog: false })));
    const moonDisc = new THREE.Mesh(new THREE.CircleGeometry(2.4, 32), new THREE.MeshBasicMaterial({ color: 0xf3ecd6, fog: false }));
    moonDisc.position.set(16, 17, -55);
    S.add(moonDisc);
    const moonGlow = glowSprite('#f3ecd6', 14, 14, 0.25);
    moonGlow.position.copy(moonDisc.position);
    moonGlow.material.fog = false;
    S.add(moonGlow);

    // Courtyard floor
    const tiles = canvasTexture(256, 256, (g, w, h) => {
      g.fillStyle = '#5e584f'; g.fillRect(0, 0, w, h);
      const r = makeRng(3);
      for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) {
        const v = 92 + Math.floor(r() * 24);
        g.fillStyle = `rgb(${v},${v - 6},${v - 16})`;
        g.fillRect(x * 64 + 2, y * 64 + 2, 60, 60);
      }
    });
    tiles.wrapS = tiles.wrapT = THREE.RepeatWrapping;
    tiles.repeat.set(30, 15);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(60, 30), new THREE.MeshLambertMaterial({ map: tiles }));
    floor.rotation.x = -Math.PI / 2;
    floor.position.z = -8;
    floor.receiveShadow = true;
    S.add(floor);
    this.ice = new THREE.Mesh(new THREE.PlaneGeometry(14, 6), new THREE.MeshPhongMaterial({ color: 0xbfeaff, transparent: true, opacity: 0.55, shininess: 120, specular: 0xffffff }));
    this.ice.rotation.x = -Math.PI / 2;
    this.ice.position.set(0, 0.006, 0);
    this.ice.visible = false;
    S.add(this.ice);

    // Arena edge markers: low stone posts where the walls are
    const stone = new THREE.MeshLambertMaterial({ color: 0x6f6a62 });
    for (const x of [X3(ARENA_L), X3(ARENA_R)]) for (const z of [-1.2, 1.2]) {
      const p = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.5, 0.18), stone);
      p.position.set(x, 0.25, z);
      p.castShadow = true;
      S.add(p);
    }

    // Seireitei: white walls, dark tiled roofs, lit windows
    const wall = new THREE.MeshLambertMaterial({ color: 0x8e889a });
    const roof = new THREE.MeshLambertMaterial({ color: 0x23263a });
    const lit = new THREE.MeshBasicMaterial({ color: 0xffc070 });
    const r2 = makeRng(11);
    for (let row = 0; row < 3; row++) {
      for (let i = 0; i < 9; i++) {
        const w = 2.2 + r2() * 1.6, h = 1.6 + r2() * 1.4 + row * 0.6, d = 2.2;
        const x = -16 + i * 4 + (row % 2) * 2 + r2() * 0.6, z = -5.5 - row * 5;
        const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), wall);
        b.position.set(x, h / 2, z);
        b.receiveShadow = true;
        S.add(b);
        const rf = new THREE.Mesh(new THREE.ConeGeometry(Math.max(w, d) * 0.8, 0.9, 4), roof);
        rf.position.set(x, h + 0.45, z);
        rf.rotation.y = Math.PI / 4;
        rf.scale.set(1, 1, d / w);
        S.add(rf);
        if (r2() < 0.6) { const win = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.4), lit); win.position.set(x + (r2() - 0.5) * w * 0.6, h * 0.55, z + d / 2 + 0.01); S.add(win); }
      }
    }
    // Sokyoku hill and its execution frame
    const hill = new THREE.Mesh(new THREE.ConeGeometry(14, 7, 24), new THREE.MeshLambertMaterial({ color: 0x2c2f52 }));
    hill.position.set(-2, 2.5, -34);
    S.add(hill);
    const frame = new THREE.MeshLambertMaterial({ color: 0x1a1c34 });
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.5, 4, 0.5), frame);
    post.position.set(-2, 7.5, -34);
    S.add(post);
    const beam = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.4, 0.4), frame);
    beam.position.set(-2, 8.6, -34);
    S.add(beam);
    // Storm clouds (Koko Gonryo Rikyu)
    this.clouds = new THREE.Group();
    for (let i = 0; i < 8; i++) { const c = new THREE.Mesh(G.sphere(2.2, 10, 6), new THREE.MeshLambertMaterial({ color: 0x1a1a2a })); c.position.set(-14 + i * 4, 7.5, -3 - (i % 3)); c.scale.set(1.6, 0.6, 1); this.clouds.add(c); }
    this.clouds.visible = false;
    S.add(this.clouds);
    // Snow (Daiguren Hyorinmaru)
    const snow = new THREE.BufferGeometry(), sp = [];
    for (let i = 0; i < 400; i++) sp.push((rng() - 0.5) * 16, rng() * 7, (rng() - 0.5) * 6);
    snow.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3));
    this.snow = new THREE.Points(snow, new THREE.PointsMaterial({ color: 0xffffff, size: 0.05 }));
    this.snow.visible = false;
    S.add(this.snow);
  }

  buildParticles() {
    this.maxParticles = 900;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(this.maxParticles * 3), 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(this.maxParticles * 3), 3));
    this.particles = new THREE.Points(g, new THREE.PointsMaterial({ size: 0.06, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.particles.frustumCulled = false;
    this.scene.add(this.particles);
  }

  // A pooled model for this definition (fighters, clones and afterimages).
  takeModel(def, ghost) {
    const key = def.id + (ghost ? ':ghost' : '');
    const pool = this.spare.get(key) || [];
    const M = pool.pop() || buildModel(def, ghost);
    M.key = key;
    M.lastHp = null;
    this.scene.add(M.root);
    return M;
  }

  giveBack(M) {
    this.scene.remove(M.root);
    if (!this.spare.has(M.key)) this.spare.set(M.key, []);
    this.spare.get(M.key).push(M);
  }

  syncModels(list, ghostOf) {
    const seen = new Set();
    for (const o of list) {
      let M = this.models.get(o);
      if (!M) { M = this.takeModel(o.def, ghostOf(o)); this.models.set(o, M); }
      seen.add(o);
    }
    for (const [o, M] of this.models) if (!seen.has(o)) { this.giveBack(M); this.models.delete(o); }
  }

  syncVis(list, make) {
    const seen = new Set();
    for (const o of list) {
      let v = this.vis.get(o);
      if (!v) {
        v = make(o);
        if (!v) continue;
        this.vis.set(o, v);
        this.fxGroup.add(v.obj);
      }
      v.alive = true;
      seen.add(o);
    }
    return seen;
  }

  // ---------------------------------------------------------------- per frame

  renderFight(w) {
    const t = w.frame + (w.release ? RELEASE_FRAMES - w.release.t : 0);
    const clones = w.summons.filter(s => s.kind === 'clone');
    const imgs = w.afterimages;
    this.syncModels([...w.fighters, ...clones, ...imgs], o => imgs.includes(o));
    for (const f of w.fighters) poseModel(this.models.get(f), f, t);
    for (const c of clones) poseModel(this.models.get(c), c, c.animT);
    for (const a of imgs) {
      const M = this.models.get(a);
      poseModel(M, Object.assign({ state: 'idle', fx: {}, onGround: true }, a), a.animT);
      for (const m of M.kit.toons) m.opacity = 0.55 * Math.min(1, a.life / 20);
    }
    // Enma Korogi: inside the dome Tosen can't be seen at all.
    for (const z of w.zones) if (z.kind === 'dome') this.models.get(z.owner).root.visible = !(Math.abs(z.owner.x - z.x) < z.r);
    for (const f of w.fighters) if (!w.zones.some(z => z.kind === 'dome' && z.owner === f)) this.models.get(f).root.visible = true;

    this.syncEffects(w, t);
    this.updateMood(w, t);
    this.updateParticles(w);
    this.updateCamera(w, t);
    this.renderer.render(this.scene, this.camera);
  }

  renderMenu(t, previews) {
    // previews: [{ slot, def, bankai, sx, sy, facing }] models standing at overlay pixel (sx, sy)
    if (previews) {
      this.camera.position.set(0, 2.15, 6.2);
      this.camera.lookAt(0, 2.15, 0);
      this.camera.updateMatrixWorld();
    }
    const list = previews ? previews.filter(Boolean) : [];
    const fakes = list.map(p => this.previewFighter(Object.assign({}, p, this.screenToSim(p.sx, p.sy)), t));
    this.syncModels(fakes, () => false);
    fakes.forEach(f => poseModel(this.models.get(f), f, t));
    for (const [o, v] of this.vis) { this.fxGroup.remove(v.obj); this.vis.delete(o); }
    this.ice.visible = this.snow.visible = this.clouds.visible = false;
    this.particles.geometry.setDrawRange(0, 0);
    if (!previews) {
      const a = t * 0.002;
      this.camera.position.set(Math.sin(a) * 3, 2.2, 9 + Math.cos(a) * 1.5);
      this.camera.lookAt(0, 1.4, -2);
    }
    this.renderer.render(this.scene, this.camera);
  }

  // Stable fake fighters so preview models persist between frames.
  previewFighter(p, t) {
    this.previewCache = this.previewCache || {};
    const key = p.slot + ':' + p.def.id;
    const f = this.previewCache[key] || (this.previewCache[key] = { def: p.def, state: 'idle', onGround: true, fx: {}, facing: 1, y: 0, h: 0 });
    Object.assign(f, { x: p.x, y: p.y, h: 1.6 * (p.def.height || 120), facing: p.facing, bankai: p.bankai, reiatsu: 100, crest: 60, animT: t });
    return f;
  }

  updateCamera(w, t) {
    const [a, b] = w.fighters, c = this.cam;
    let x = (X3(a.x) + X3(b.x)) / 2, dist = clamp(Math.abs(a.x - b.x) / U * 0.8 + 3.6, 5.2, 10.5), y = 1.5 + dist * 0.05, look = 1.0;
    if (w.release) { const f = w.release.f; x = X3(f.x) + Math.sin(t * 0.04) * 0.6; dist = 3.4; y = 1.3; look = 0.95; }
    const halfW = dist * Math.tan(THREE.MathUtils.degToRad(38) / 2) * (W / H);
    x = clamp(x, X3(ARENA_L) - 0.6 + halfW * 0.55, X3(ARENA_R) + 0.6 - halfW * 0.55);
    const k = w.release ? 0.2 : 0.08;
    c.x += (x - c.x) * k; c.dist += (dist - c.dist) * k; c.y += (y - c.y) * k; c.look += (look - c.look) * k;
    const sh = w.shake / U;
    this.camera.position.set(c.x + (Math.random() - 0.5) * sh, c.y + (Math.random() - 0.5) * sh, c.dist);
    this.camera.lookAt(c.x, c.look, 0);
  }

  // Overlay pixels -> simulation coordinates on the fighters' plane (z = 0).
  screenToSim(sx, sy) {
    const v = new THREE.Vector3(sx / W * 2 - 1, 1 - sy / H * 2, 0.5).unproject(this.camera);
    const o = this.camera.position, d = v.sub(o).normalize(), k = -o.z / d.z;
    return { x: W / 2 + (o.x + d.x * k) * U, y: GROUND - (o.y + d.y * k) * U };
  }

  // Simulation coordinates -> overlay pixels.
  project(x, y, z = 0) {
    const v = new THREE.Vector3(X3(x), Y3(y), z).project(this.camera);
    return { x: (v.x + 1) / 2 * W, y: (1 - v.y) / 2 * H, visible: v.z < 1 };
  }

  updateMood(w, t) {
    const by = id => w.fighters.find(f => f.bankai && f.def.id === id);
    this.ice.visible = this.snow.visible = !!w.ice;
    if (this.snow.visible) {
      const p = this.snow.geometry.attributes.position;
      for (let i = 0; i < p.count; i++) { let y = p.getY(i) - 0.02; if (y < 0) y = 7; p.setY(i, y); }
      p.needsUpdate = true;
      this.snow.position.x = this.cam.x;
    }
    this.clouds.visible = !!by('sasakibe');
    const yama = by('yamamoto');
    this.heatLight.intensity = yama ? 1.6 + Math.sin(t * 0.3) * 0.3 : 0;
    if (yama) this.heatLight.position.set(X3(yama.x), 1, 0.8);
    if (w.strikes.some(s => s.kind === 'lightning' && s.t <= 0 && s.after < 3)) this.flashT = 4;
    this.hemi.intensity = 0.6 + (this.flashT > 0 ? 1.4 : 0);
    if (this.flashT > 0) this.flashT--;
    this.scene.fog.color.set(yama ? 0x4a2a2a : 0x1e2142);
  }

  updateParticles(w) {
    const pos = this.particles.geometry.attributes.position, colr = this.particles.geometry.attributes.color;
    const tmp = new THREE.Color();
    let n = 0;
    for (const p of w.particles) {
      if (n >= this.maxParticles) break;
      pos.setXYZ(n, X3(p.x), Y3(p.y), 0.2);
      tmp.set(p.color);
      colr.setXYZ(n, tmp.r, tmp.g, tmp.b);
      n++;
    }
    pos.needsUpdate = true;
    colr.needsUpdate = true;
    this.particles.geometry.setDrawRange(0, n);
  }

  syncEffects(w, t) {
    for (const v of this.vis.values()) v.alive = false;
    this.syncVis(w.projectiles, p => makeProjectile(p));
    this.syncVis(w.zones, z => makeZone(z));
    this.syncVis(w.strikes, s => makeStrike(s));
    this.syncVis(w.summons.filter(s => s.kind !== 'clone'), s => makeSummon(s));
    this.syncVis(w.rings, r => ({ obj: new THREE.Mesh(G.torus(1, 0.03), additive(r.color, 0.8)), update(r, v) { const k = r.r / U * (1.2 - r.life / 36); v.obj.scale.setScalar(k); v.obj.position.set(X3(r.x), Y3(r.y), 0); v.obj.material.opacity = r.life / 18; } }));
    // Petals orbiting Byakuya while his bankai guards him
    for (const f of w.fighters) {
      const key = f;
      const on = f.bankai && f.def.id === 'byakuya';
      let v = this.vis.get(key);
      if (on && !v) { v = petalOrbit(); this.vis.set(key, v); this.fxGroup.add(v.obj); }
      if (v) { v.alive = on; if (on) { v.obj.position.set(X3(f.x), Y3(f.y) + 0.6, 0); v.obj.rotation.y = t * 0.05; } }
    }
    const sources = new Map();
    for (const list of [w.projectiles, w.zones, w.strikes, w.summons, w.rings]) for (const o of list) sources.set(o, true);
    for (const [o, v] of this.vis) {
      if (!v.alive) { this.fxGroup.remove(v.obj); this.vis.delete(o); continue; }
      if (v.update && sources.has(o)) v.update(o, v, t, w);
    }
  }
}

// ------------------------------------------------------------------ effect builders

function crescent(c, rim, r, thick) {
  const g = new THREE.Group();
  const m = new THREE.Mesh(G.torus(r, thick, Math.PI), additive(c, 0.9));
  m.rotation.z = -Math.PI / 2;
  g.add(m);
  if (rim) { const e = new THREE.Mesh(G.torus(r * 1.08, thick * 0.4, Math.PI), additive(rim, 0.9)); e.rotation.z = -Math.PI / 2; g.add(e); }
  return g;
}

const PROJECTILE_LOOKS = {
  getsuga: p => crescent('#9fd8ff', '#ffffff', p.h / U / 2, 0.08),
  getsugaBlack: p => crescent('#140c18', '#e8323c', p.h / U / 2, 0.09),
  jujisho: p => { const g = new THREE.Group(); for (const a of [0.8, -0.8]) { const c = crescent('#140c18', '#e8323c', p.h / U / 2, 0.1); c.rotation.x = a; g.add(c); } return g; },
  benihime: p => crescent('#d2283c', '#ffb0b8', 0.32, 0.07),
  blood: p => crescent('#a01428', '#ff6a7a', 0.45, 0.08),
  wind: p => crescent('#e6f0ff', null, 0.5, 0.03),
  tenchi: p => { const g = new THREE.Group(); g.add(new THREE.Mesh(G.box(p.w / U, p.h / U, 0.6), additive('#ff6a1a', 0.55))); g.add(new THREE.Mesh(G.box(p.w / U * 0.4, p.h / U, 0.3), additive('#fff0c0', 0.7))); return g; },
  dragon: () => { const g = new THREE.Group(); const head = new THREE.Mesh(G.cone(0.25, 0.8, 6).clone().rotateZ(-Math.PI / 2), basic('#bfefff', 0.85)); g.add(head); for (let i = 1; i < 4; i++) { const s = new THREE.Mesh(G.cone(0.15 - i * 0.03, 0.4, 5).clone().rotateZ(Math.PI / 2), basic('#dff6ff', 0.6)); s.position.x = -0.35 * i; g.add(s); } return g; },
  hakuren: p => new THREE.Mesh(G.box(p.w / U, p.h / U, 0.6), basic('#f0faff', 0.55)),
  flake: () => new THREE.Mesh(geo('octa', () => new THREE.OctahedronGeometry(0.12)), basic('#eaf8ff', 0.95)),
  icicle: () => new THREE.Mesh(G.cone(0.04, 0.3, 6).clone().rotateZ(-Math.PI / 2), basic('#bfefff', 0.9)),
  petals: () => petalCloud(0.5, 120),
  cleave: p => new THREE.Mesh(G.cone(p.w / U / 2, p.h / U, 4), additive('#ffd250', 0.8)),
  bushogoma: () => new THREE.Mesh(G.torus(0.32, 0.05), additive('#dcf0ff', 0.8)),
  thread: () => { const g = new THREE.Group(); const l = new THREE.Mesh(G.rod(0.008, 2), basic('#f7a8c8')); l.position.x = -1; g.add(l); g.add(new THREE.Mesh(G.sphere(0.04, 6, 4), basic('#ffffff'))); return g; },
  scent: p => { const g = new THREE.Group(); for (let i = 0; i < 5; i++) { const s = new THREE.Mesh(G.sphere(0.28, 10, 8), basic('#ffe08a', 0.25)); s.position.set(Math.cos(i * 1.3) * 0.3, Math.sin(i * 1.9) * 0.25, Math.sin(i) * 0.2); g.add(s); } return g; },
  kinshara: p => { const m = new THREE.Mesh(G.torus(0.35, 0.03, Math.PI * 1.5), new THREE.MeshToonMaterial({ color: color('#f2c14e'), gradientMap: toonGradient(), emissive: color('#5a3a08') })); m.castShadow = !p.fake; return m; },
  shockwave: () => { const g = new THREE.Group(); for (let i = 0; i < 3; i++) { const r = new THREE.Mesh(G.torus(0.5 - i * 0.12, 0.03, Math.PI), additive('#b4dcff', 0.7)); r.rotation.z = -Math.PI / 2; r.position.x = -i * 0.18; g.add(r); } return g; },
  ink: () => blobs('#0b0b0f'),
  whiteInk: () => blobs('#f6f6f6'),
  needle: () => new THREE.Mesh(G.rod(0.01, 0.3), basic('#efeaff')),
  taiho: p => { const g = new THREE.Group(); g.add(new THREE.Mesh(G.sphere(0.45), additive('#ff5a4a', 0.7))); g.add(new THREE.Mesh(G.sphere(0.25), additive('#ffffff', 0.9))); return g; },
  crescent: () => new THREE.Mesh(G.torus(0.28, 0.04, Math.PI * 1.2), basic('#c9ced6')),
};

function blobs(c) {
  const g = new THREE.Group();
  for (let i = 0; i < 6; i++) { const s = new THREE.Mesh(G.sphere(0.16 - i * 0.015, 8, 6), basic(c)); s.position.set(Math.cos(i * 1.1) * 0.25, Math.sin(i * 2.3) * 0.22, 0); g.add(s); }
  return g;
}

function petalCloud(r, n) {
  const g = new THREE.BufferGeometry(), pts = [], cols = [], rng = makeRng(n);
  for (let i = 0; i < n; i++) {
    const a = rng() * Math.PI * 2, b = rng() * Math.PI, rr = r * Math.cbrt(rng());
    pts.push(Math.cos(a) * Math.sin(b) * rr, Math.cos(b) * rr, Math.sin(a) * Math.sin(b) * rr);
    const c = color(i % 3 ? '#f6a8c8' : '#ffd6e6');
    cols.push(c.r, c.g, c.b);
  }
  g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  return new THREE.Points(g, new THREE.PointsMaterial({ size: 0.07, vertexColors: true }));
}

function petalOrbit() {
  const obj = petalCloud(1.4, 160);
  obj.scale.set(1, 0.6, 0.6);
  return { obj };
}

function makeProjectile(p) {
  const make = PROJECTILE_LOOKS[p.kind];
  const obj = make ? make(p) : new THREE.Mesh(G.sphere(0.1), basic('#ffffff'));
  return {
    obj,
    update(p, v, t) {
      v.obj.visible = !(p.wait > 0);
      v.obj.position.set(X3(p.x), Y3(p.y), 0);
      const d = sign(p.vx || 1);
      v.obj.scale.x = d;
      if (p.kind === 'bushogoma' || p.kind === 'crescent' || p.kind === 'flake') v.obj.rotation.z += 0.3;
      if (p.kind === 'petals') v.obj.rotation.y += 0.2;
      if (p.kind === 'shockwave') v.obj.scale.setScalar(0.7 + p.age * 0.06), v.obj.scale.x *= d;
    },
  };
}

function makeZone(z) {
  let obj;
  switch (z.kind) {
    case 'petals': obj = petalCloud(z.r / U, 220); break;
    case 'gas': obj = new THREE.Group(); obj.add(new THREE.Mesh(G.sphere(1, 16, 12), basic('#9a5ac8', 0.22))); obj.add(new THREE.Mesh(G.sphere(0.7, 12, 8), basic('#7aa850', 0.18))); break;
    case 'mist': obj = new THREE.Mesh(G.sphere(1, 16, 12), basic('#f0faff', 0.18)); break;
    case 'heat': obj = new THREE.Group(); for (let i = 0; i < 3; i++) obj.add(new THREE.Mesh(G.torus(0.6 + i * 0.2, 0.02), additive('#ff8a3a', 0.35))); break;
    case 'field': obj = new THREE.Group(); for (let i = 0; i < 2; i++) { const r = new THREE.Mesh(G.torus(1, 0.03), additive('#fff27a', 0.6)); r.rotation.x = Math.PI / 2 + i * 0.6; obj.add(r); } break;
    case 'whirlpool': obj = new THREE.Mesh(G.cone(1, 0.6, 18), basic('#4a8ad8', 0.35)); break;
    case 'dome': obj = new THREE.Mesh(geo('dome', () => new THREE.SphereGeometry(1, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2)), new THREE.MeshBasicMaterial({ color: 0x06040e, transparent: true, opacity: 0.78, side: THREE.DoubleSide, depthWrite: false })); break;
    case 'senkei': obj = new THREE.Group(); for (const side of [0, 1]) for (let i = 0; i < 7; i++) { const s = new THREE.Mesh(G.box(0.05, 1.4, 0.02), new THREE.MeshToonMaterial({ color: color('#e6e9f0'), gradientMap: toonGradient(), emissive: color('#3a2a34') })); s.userData.side = side; s.position.set(0, 0.7, -1.2 + i * 0.4); obj.add(s); } break;
    case 'loom': obj = new THREE.Group(); break;
    default: obj = new THREE.Mesh(G.sphere(1, 12, 8), basic('#ffffff', 0.15));
  }
  return {
    obj,
    update(z, v, t) {
      const o = v.obj;
      if (z.kind === 'senkei') { o.children.forEach(s => { s.position.x = X3(s.userData.side ? z.x1 : z.x0); }); return; }
      if (z.kind === 'loom') { syncThreads(o, z); return; }
      o.position.set(X3(z.x), z.kind === 'dome' ? 0 : Y3(z.y), 0);
      const r = z.r / U;
      if (z.kind === 'petals') { o.rotation.y = t * 0.06; o.rotation.x = t * 0.03; return; }
      o.scale.setScalar(r);
      if (z.kind === 'heat') o.children.forEach((c, i) => { c.rotation.x = Math.PI / 2; c.scale.setScalar(1 + Math.sin(t * 0.15 + i) * 0.05); });
      if (z.kind === 'whirlpool') { o.rotation.y = t * 0.2; o.rotation.x = Math.PI; o.scale.set(r, r * 0.6, r); }
      if (z.kind === 'field') o.rotation.y = t * 0.1;
    },
  };
}

function syncThreads(group, z) {
  while (group.children.length < z.threads.length) group.add(new THREE.Mesh(G.box(1, 0.02, 0.02), additive('#d8b8ff', 0.9)));
  group.children.forEach((m, i) => {
    const th = z.threads[i];
    m.visible = !!th && !th.cut;
    if (!m.visible) return;
    const x1 = X3(th.x1), x2 = X3(th.x2), y1 = Y3(th.y1), y2 = Y3(th.y2);
    m.position.set((x1 + x2) / 2, (y1 + y2) / 2, 0);
    const vertical = th.x1 === th.x2;
    m.rotation.z = vertical ? Math.PI / 2 : 0;
    m.scale.x = vertical ? Math.abs(y2 - y1) : Math.abs(x2 - x1);
  });
}

const STRIKE_COLORS = { lightning: '#fff27a', missile: '#ffcf5a', fire: '#ff7a1a', prometheus: '#ff5a2a', icePrison: '#bfefff', tsukishiro: '#ffffff', bloodRain: '#c2304a', blades: '#e6e9f0', kido: '#c8a8ff', wrap: '#d8b8ff', quake: '#e8c06a', skeletons: '#efe6d4' };

function makeStrike(s) {
  const obj = new THREE.Group();
  const decal = new THREE.Mesh(geo('decal', () => new THREE.CircleGeometry(0.5, 32).rotateX(-Math.PI / 2)), basic(STRIKE_COLORS[s.kind] || '#120c1a', 0.4));
  decal.position.y = 0.02;
  obj.add(decal);
  const impact = new THREE.Group();
  const c = STRIKE_COLORS[s.kind] || '#c8ccd6', wd = s.width / U;
  switch (s.kind) {
    case 'lightning': for (let i = 0; i < 6; i++) { const seg = new THREE.Mesh(G.box(0.06, 1.4, 0.06), additive('#fff6a8', 1)); seg.position.set(Math.sin(i * 2.7) * 0.15, 0.7 + i * 1.3, 0); seg.rotation.z = Math.sin(i * 1.9) * 0.4; impact.add(seg); } break;
    case 'missile': impact.add(new THREE.Mesh(G.sphere(wd / 2), additive('#ffcf5a', 0.7))); impact.children[0].position.y = 0.6; break;
    case 'skeletons': for (let i = 0; i < 6; i++) { const b = new THREE.Mesh(G.cyl(0.03, 0.03, 0.9, 5), basic('#efe6d4')); b.position.set(-wd / 2 + i * wd / 5, 0.45, (i % 2 - 0.5) * 0.4); b.rotation.z = (i % 2 ? 1 : -1) * 0.3; impact.add(b); } break;
    case 'icePrison': for (let i = 0; i < 8; i++) { const p = new THREE.Mesh(G.cone(0.18, 1.6, 6), basic('#bfefff', 0.85)); const a = i / 8 * Math.PI * 2; p.position.set(Math.cos(a) * wd * 0.4, 0.8, Math.sin(a) * 0.5); impact.add(p); } break;
    case 'giant': case 'tenken': case 'fist': {
      const blade = s.kind === 'fist' ? new THREE.Mesh(G.sphere(wd * 0.33), new THREE.MeshToonMaterial({ color: color('#2a2436'), gradientMap: toonGradient() }))
        : new THREE.Mesh(G.box(0.4, 7, 0.1), new THREE.MeshToonMaterial({ color: color('#c8ccd6'), gradientMap: toonGradient(), emissive: color('#2a2a34') }));
      blade.position.y = s.kind === 'fist' ? wd * 0.33 : 3.5;
      impact.add(blade);
      break;
    }
    case 'sweep': { const b = new THREE.Mesh(G.box(wd, 0.12, 0.3), new THREE.MeshToonMaterial({ color: color('#c8ccd6'), gradientMap: toonGradient() })); b.position.y = 0.3; impact.add(b); break; }
    case 'blades': for (let i = 0; i < 10; i++) { const b = new THREE.Mesh(G.box(0.03, 0.7, 0.03), basic('#e6e9f0')); b.position.set((Math.random() - 0.5) * wd, 0.35 + Math.random() * 1.6, (Math.random() - 0.5) * 0.6); impact.add(b); } break;
    case 'bloodRain': for (let i = 0; i < 12; i++) { const b = new THREE.Mesh(G.box(0.025, 0.3, 0.025), basic('#c2304a')); b.position.set((Math.random() - 0.5) * wd, Math.random() * 2.5, (Math.random() - 0.5) * 0.6); impact.add(b); } break;
    case 'quake': case 'wrap': { const r = new THREE.Mesh(G.torus(wd / 2, 0.05), additive(c, 0.8)); r.rotation.x = Math.PI / 2; r.position.y = 0.1; impact.add(r); break; }
    case 'kido': { const b = new THREE.Mesh(G.sphere(wd * 0.32, 18, 12), additive('#a880ff', 0.4)); b.position.y = 0.9; impact.add(b); const core = new THREE.Mesh(G.sphere(wd * 0.12, 12, 8), additive('#ffffff', 0.6)); core.position.y = 0.9; impact.add(core); break; }
    default: { const p = new THREE.Mesh(G.cyl(wd * 0.4, wd * 0.4, 3.2, 16), additive(c, 0.45)); p.position.y = 1.6; impact.add(p); }
  }
  impact.visible = false;
  obj.add(impact);
  return {
    obj,
    update(s, v) {
      v.obj.position.set(X3(s.x), 0, 0);
      const hit = s.t <= 0;
      decal.visible = !hit;
      if (!hit) {
        const k = 1 - s.t / s.delay;
        decal.scale.set(wd, 1, 0.9);
        decal.material.opacity = 0.25 + k * 0.5;
        // the giant's blade descends while the shadow darkens
        if (s.kind === 'giant' || s.kind === 'tenken') { impact.visible = true; impact.children[0].position.y = 3.5 + (1 - k) * 6; impact.children[0].material.transparent = true; impact.children[0].material.opacity = 0.2 + k * 0.6; }
      } else {
        impact.visible = true;
        const k = 1 - s.after / 18;
        impact.scale.setScalar(s.kind === 'missile' ? 1.2 - k * 0.4 : 1);
        if (s.kind === 'giant' || s.kind === 'tenken') impact.children[0].position.y = 3.5;
        impact.traverse(o => { if (o.material && o.material.transparent) o.material.opacity = Math.max(0, k); });
      }
    },
  };
}

function makeSummon(s) {
  let obj;
  if (s.kind === 'jizo') {
    obj = new THREE.Group();
    const gold = new THREE.MeshToonMaterial({ color: color('#f2c14e'), gradientMap: toonGradient(), emissive: color('#3a2a08') });
    for (let i = 1; i <= 5; i++) { const seg = new THREE.Mesh(G.sphere(0.46 - i * 0.03, 14, 10), gold); seg.position.set(-i * 0.3, 0.6, 0); seg.castShadow = true; obj.add(seg); }
    const head = new THREE.Mesh(G.sphere(0.62, 16, 12), gold);
    head.position.y = 1.2;
    obj.add(head);
    const face = new THREE.Mesh(G.sphere(0.45, 14, 10), new THREE.MeshToonMaterial({ color: color('#7a3fa0'), gradientMap: toonGradient() }));
    face.position.set(0.25, 1.2, 0);
    obj.add(face);
    for (const z of [0.18, -0.18]) { const e = new THREE.Mesh(G.sphere(0.07, 8, 6), basic('#f6efe0')); e.position.set(0.66, 1.32, z); obj.add(e); }
    const halo = new THREE.Mesh(G.torus(0.75, 0.04), additive('#f2c14e', 0.7));
    halo.position.set(-0.1, 1.3, 0);
    halo.rotation.y = Math.PI / 2;
    obj.add(halo);
    for (let i = 0; i < 6; i++) { const leg = new THREE.Mesh(G.box(0.03, 0.4, 0.03), basic('#c9ced6')); leg.position.set(-i * 0.24, 0.2, (i % 2 - 0.5) * 0.5); obj.add(leg); }
  } else if (s.kind === 'giant') {
    obj = new THREE.Group();
    const armour = new THREE.MeshToonMaterial({ color: color('#1e1a28'), gradientMap: toonGradient() });
    const body = new THREE.Mesh(G.cyl(0.9, 1.3, 3.4, 10), armour);
    body.position.y = 1.7;
    obj.add(body);
    const helm = new THREE.Mesh(G.sphere(0.6, 14, 10), armour);
    helm.position.y = 3.9;
    obj.add(helm);
    for (const z of [0.4, -0.4]) { const horn = new THREE.Mesh(G.cone(0.12, 0.8, 6), armour); horn.position.set(0, 4.5, z); horn.rotation.x = z > 0 ? -0.4 : 0.4; obj.add(horn); }
    for (const z of [0.18, -0.18]) { const eye = new THREE.Mesh(G.sphere(0.07, 8, 6), basic('#ffb23a')); eye.position.set(0.5, 3.95, z); obj.add(eye); }
    const sword = new THREE.Mesh(G.box(0.18, 3.6, 0.06), new THREE.MeshToonMaterial({ color: color('#3a3446'), gradientMap: toonGradient() }));
    sword.position.set(0.9, 3.4, 0.6);
    obj.add(sword);
    obj.traverse(o => { if (o.isMesh) o.castShadow = true; });
  } else if (s.kind === 'reticle') {
    obj = new THREE.Group();
    obj.add(new THREE.Mesh(G.torus(0.46, 0.015), basic('#f2c14e')));
    for (const [x, y] of [[0.6, 0], [-0.6, 0], [0, 0.6], [0, -0.6]]) { const l = new THREE.Mesh(G.box(Math.abs(x) ? 0.3 : 0.02, Math.abs(y) ? 0.3 : 0.02, 0.01), basic('#f2c14e')); l.position.set(x, y, 0); obj.add(l); }
    obj.userData.lock = new THREE.Mesh(G.torus(0.54, 0.03, 0.01), basic('#ff4a3a'));
    obj.add(obj.userData.lock);
  } else if (s.kind === 'cage') {
    obj = new THREE.Group();
    const bone = new THREE.MeshToonMaterial({ color: color('#efe4cc'), gradientMap: toonGradient() });
    for (const side of [0, 1]) for (let i = 0; i < 10; i++) { const fang = new THREE.Mesh(G.cone(0.08, 0.26, 5), bone); fang.userData.side = side; fang.position.set(0, 0.15 + i * 0.26, (i % 2 - 0.5) * 0.3); fang.rotation.z = side ? Math.PI / 2 : -Math.PI / 2; obj.add(fang); }
  } else return null;
  return {
    obj,
    update(s, v, t) {
      const o = v.obj;
      if (s.kind === 'jizo') { o.position.set(X3(s.x), 0, -0.4); o.scale.x = s.dir; o.position.y = Math.sin(t * 0.08) * 0.04; }
      if (s.kind === 'giant') { o.position.set(X3(s.x), 0, -2.6); o.scale.x = sign(s.owner.facing); }
      if (s.kind === 'reticle') {
        o.position.set(X3(s.x), Y3(s.y), 0.5);
        const k = s.lock / 90;
        o.children[0].material.color.set(k > 0.75 ? '#ff4a3a' : '#f2c14e');
        o.userData.lock.geometry = G.torus(0.54, 0.03, Math.max(0.05, Math.round(k * 20) / 20 * Math.PI * 2));
        o.rotation.z = t * 0.02;
      }
      if (s.kind === 'cage') {
        const k = s.closing ? 1 - s.closing / 36 : 0;
        o.position.set(0, 0, 0);
        o.children.forEach(f => { f.position.x = X3(f.userData.side ? s.right - k * 170 : s.left + k * 170); });
      }
    },
  };
}

// ------------------------------------------------------------------ portraits

// Small head-and-shoulders renders of every fighter for the select grid.
function makePortraits(defs, size = 120) {
  const canvas = document.createElement('canvas');
  const r = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
  r.setSize(size, size, false);
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xffffff, 0x404060, 1.0));
  const key = new THREE.DirectionalLight(0xffffff, 0.6);
  key.position.set(2, 3, 4);
  scene.add(key);
  const cam = new THREE.PerspectiveCamera(30, 1, 0.1, 20);
  const out = {};
  for (const def of defs) {
    const M = buildModel(def);
    const f = { def, x: W / 2, y: GROUND, h: def.height || 120, facing: 1, state: 'idle', animT: 0, onGround: true, fx: {}, reiatsu: 0, portrait: true };
    poseModel(M, f, 0);
    scene.add(M.root);
    const top = (def.height || 120) / U * (LOOKS[def.id].build || 1);
    cam.position.set(0.35, top * 0.82, 1.5);
    cam.lookAt(0, top * 0.8, 0);
    r.render(scene, cam);
    const c = document.createElement('canvas');
    c.width = c.height = size;
    c.getContext('2d').drawImage(canvas, 0, 0);
    out[def.id] = c;
    scene.remove(M.root);
  }
  r.dispose();
  return out;
}
