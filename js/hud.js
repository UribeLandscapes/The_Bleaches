'use strict';
// The 2D overlay drawn on top of the 3D view: health and reiatsu bars, status
// effects, bankai abilities with cooldowns, callouts and banners.

const FONT_DISPLAY = '"Yuji Syuku", "Hiragino Mincho ProN", "Yu Mincho", Georgia, serif';
const FONT_UI = '"Barlow Condensed", "Arial Narrow", "Roboto Condensed", sans-serif';
const INK = '#0c0b14';
const PAPER = '#f1ede4';
const GOLD = '#f2c14e';
const REI = '#6fc3ff';
const BLOOD = '#d8343f';
const SIDE_COLORS = ['#ff5a4f', '#53a8ff'];
const SLOT_KEYS = [
  { n: 'H', f: '→H', b: '←H', d: 'S+H' },
  { n: '/', f: '→/', b: '←/', d: '↓+/' },
];
const PAD_SLOT_KEYS = { n: 'B', f: '→B', b: '←B', d: 'LB+B' };

function circle(ctx, x, y, r) { ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); }
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
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
function wrapText(ctx, str, x, y, maxW, lineH, size, color, weight = 500) {
  ctx.font = `${weight} ${size}px ${FONT_UI}`;
  let line = '';
  for (const word of str.split(' ')) {
    const test = line ? line + ' ' + word : word;
    if (ctx.measureText(test).width > maxW && line) {
      text(ctx, line, x, y, size, color, 'left', FONT_UI, weight);
      line = word;
      y += lineH;
    } else line = test;
  }
  if (line) text(ctx, line, x, y, size, color, 'left', FONT_UI, weight);
  return y;
}

function statusChips(f) {
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
  if (s.reversed > 0) add('FRONT/BACK SWAPPED', '#ffe08a');
  if (s.blind > 0) add('SENSES GONE', '#b9a6ff');
  if (s.dazed > 0) add('CONCUSSED', '#bfe0ff');
  if (s.bleed > 0) add('BLEEDING x' + s.bleedStacks, '#ff6a7a');
  if (s.disease > 0) add('INCURABLE DISEASE', '#c88ab0');
  if (s.drowning > 0) add('DROWNING', '#8ac8ff');
  if (s.fragment > 0) add('SLIVER INSIDE', '#e0e6f0');
  if (s.homonka > 0) add('HOMONKA', '#ffd23a');
  for (const k in s.sealed) if (s.sealed[k] > 0) add(k.toUpperCase() + ' SEALED', '#ff8a9a');
  for (const k in s.erased) if (s.erased[k]) add(k.toUpperCase() + ' ERASED', '#eee');
  if (s.renamed || s.renamedT > 0) add('RENAMED', '#eee');
  if (s.onIce) add('ON ICE', '#aef');
  if (f.bankai && f.def.id === 'ikkaku') add('CREST ' + Math.round(f.crest) + '%', '#ff5a3a', f.crest / 100);
  if (f.act1 > 0) add('SHARED WOUNDS', '#f7a8c8');
  if (f.robe > 0) add('FLAME ARMOUR', '#ff9a4a');
  if (f.armorT > 0) add("MYO-O'S ARMOUR", '#ffcf5a');
  if (f.shield > 0) add('SHIELD', '#ff5a6a');
  if (f.finalBlade > 0) add('ORIGINAL BLADE READY', '#ffffff', f.finalBlade / 300);
  if (f.bankai && f.def.id === 'kenpachi') add('UNBLOCKABLE / NO FLINCH', '#f2d23a');
  if (f.bankai && f.def.id === 'rukia') add('ABSOLUTE ZERO', '#cfefff');
  return chips;
}

function drawChips(ctx, chips, left, bx, barW, y) {
  let cx = left ? bx : bx + barW;
  ctx.font = `700 13px ${FONT_UI}`;
  for (const c of chips) {
    const tw = ctx.measureText(c.label).width + 14 + (c.value !== undefined ? 34 : 0);
    const x = left ? cx : cx - tw;
    if (left ? x + tw > bx + barW + 40 : x < bx - 40) break;
    ctx.fillStyle = 'rgba(8,8,14,0.7)'; roundRect(ctx, x, y, tw, 20, 4); ctx.fill();
    ctx.strokeStyle = c.color; ctx.lineWidth = 1; ctx.stroke();
    text(ctx, c.label, x + 7, y + 15, 13, c.color);
    if (c.value !== undefined) {
      ctx.fillStyle = 'rgba(255,255,255,0.15)'; ctx.fillRect(x + tw - 38, y + 7, 30, 6);
      ctx.fillStyle = c.color; ctx.fillRect(x + tw - 38, y + 7, 30 * clamp(c.value, 0, 1), 6);
    }
    cx += (left ? 1 : -1) * (tw + 6);
  }
}

// The four bankai abilities (or the shikai special) with their keys and cooldowns.
function drawAbilities(ctx, f, left, bx, barW, y, keys) {
  const items = f.bankai
    ? f.def.abilities.map(a => ({ key: keys[a.slot], name: a.name, cd: f.cd['ab_' + a.slot] || 0, max: a.cd }))
    : [{ key: keys.n, name: f.finalBlade > 0 ? 'The Original Blade' : f.def.shikai, cd: f.cd.special, max: 150 }];
  const slotW = f.bankai ? barW / 4 : barW / 2;
  items.forEach((it, i) => {
    const x = left ? bx + i * slotW : bx + barW - (i + 1) * slotW;
    const ready = it.cd <= 0;
    ctx.fillStyle = ready ? 'rgba(242,193,78,0.16)' : 'rgba(8,8,14,0.7)';
    roundRect(ctx, x, y, slotW - 4, 22, 4); ctx.fill();
    if (!ready) { ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.fillRect(x, y + 19, (slotW - 4) * (1 - it.cd / it.max), 3); }
    text(ctx, it.key, x + 5, y + 16, 12, ready ? GOLD : '#7a7590');
    ctx.save();
    ctx.beginPath(); ctx.rect(x + 34, y, slotW - 40, 22); ctx.clip();
    text(ctx, it.name, x + 34, y + 16, 12, ready ? PAPER : '#7a7590', 'left', FONT_UI, 600);
    ctx.restore();
  });
}

function drawHud(ctx, w, minds, mode, padSides = []) {
  for (const f of w.fighters) {
    const left = f.side === 0, x0 = left ? 32 : W - 32, dir = left ? 1 : -1, barW = 500;
    const bx = left ? x0 : x0 - barW;
    text(ctx, f.def.name.toUpperCase(), x0, 34, 24, PAPER, left ? 'left' : 'right');
    const modeLabel = f.bankai ? 'BANKAI · ' + f.def.bankaiName.toUpperCase() : 'SHIKAI · ' + f.def.shikai.toUpperCase();
    ctx.font = `700 24px ${FONT_UI}`;
    const nameW = ctx.measureText(f.def.name.toUpperCase()).width;
    ctx.save();
    ctx.beginPath(); ctx.rect(left ? x0 + nameW + 10 : bx + 44, 14, barW - nameW - 56, 26); ctx.clip();
    text(ctx, modeLabel, x0 + dir * (nameW + 14), 33, 15, f.bankai ? GOLD : '#a9a3b8', left ? 'left' : 'right');
    ctx.restore();
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
    // Reiatsu (drains while the bankai is out)
    ctx.fillStyle = 'rgba(8,8,14,0.75)'; ctx.fillRect(bx - 3, 66, barW * 0.7 + 6, 12);
    const rw = barW * 0.7 * Math.max(0, f.reiatsu) / 100, full = !f.bankai && f.reiatsu >= 100;
    ctx.fillStyle = f.bankai ? GOLD : full ? (w.frame % 30 < 15 ? '#bfe6ff' : REI) : REI;
    ctx.fillRect(left ? bx : bx + barW - rw, 69, rw, 6);
    const burst = f.cd.burst <= 0 && f.reiatsu >= BURST_COST;
    const pad = padSides[f.side];
    const reiLabel = f.bankai ? 'BANKAI ACTIVE' : full ? `BANKAI READY · ${pad ? 'RT' : f.side === 0 ? 'T' : "'"}` : burst ? `BURST READY · ${pad ? 'RB' : 'DASH'} WHILE HIT` : 'REIATSU';
    text(ctx, reiLabel, left ? bx + barW * 0.7 + 12 : bx + barW * 0.3 - 12, 77, 13, full || f.bankai ? GOLD : burst ? '#bfe6ff' : '#8d88a0', left ? 'left' : 'right');
    const isHuman = !(minds && minds[f.side]);
    drawAbilities(ctx, f, left, bx, barW, 84, pad ? PAD_SLOT_KEYS : SLOT_KEYS[mode === 'cpu' ? 0 : f.side]);
    drawChips(ctx, statusChips(f), left, bx, barW, 112);
    if (!isHuman) text(ctx, 'CPU · ' + minds[f.side], x0, 150, 15, '#c9c3d8', left ? 'left' : 'right', FONT_UI, 600);
    // Combo counter for the attacker
    const opp = w.opponentOf(f);
    if (opp.combo >= 2) outlinedText(ctx, opp.combo + ' HITS', left ? 40 : W - 40, 210, 34, GOLD, left ? 'left' : 'right', FONT_DISPLAY);
  }
  const secs = Math.ceil(w.timer / 60);
  ctx.fillStyle = 'rgba(8,8,14,0.75)'; roundRect(ctx, W / 2 - 38, 18, 76, 52, 8); ctx.fill();
  text(ctx, String(secs), W / 2, 60, 40, secs <= 10 ? BLOOD : PAPER, 'center');
}

// Callouts and markers that hang over the fighters, placed by the 3D camera.
function drawWorldOverlay(ctx, w, project) {
  const t = w.frame;
  for (const f of w.fighters) {
    const head = project(f.x, f.y - f.h - 10), feet = project(f.x, f.y + 6), s = f.fx;
    if (s.inverted > 0) outlinedText(ctx, '逆', head.x, head.y - 8, 24, '#ffe08a');
    if (s.dazed > 0) for (let i = 0; i < 3; i++) { const a = t * 0.1 + i * 2.1; ctx.fillStyle = '#bfe0ff'; circle(ctx, head.x + Math.cos(a) * 18, head.y + Math.sin(a) * 5, 3); }
    if (s.homonka > 0) { const p = project(f.x, f.y - f.h * 0.6); ctx.strokeStyle = '#ffd23a'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(p.x, p.y, 9, 0, Math.PI * 2); ctx.stroke(); }
    if (s.fragment > 0) { const p = project(f.x, f.y - f.h * 0.6); ctx.fillStyle = '#e0e6f0'; ctx.beginPath(); ctx.moveTo(p.x - 3, p.y); ctx.lineTo(p.x + 3, p.y); ctx.lineTo(p.x, p.y - 12); ctx.fill(); }
    if (f.state === 'guard' || f.guardHp < 100) {
      ctx.fillStyle = 'rgba(8,8,14,0.6)'; ctx.fillRect(feet.x - 24, feet.y + 6, 48, 4);
      ctx.fillStyle = f.guardHp < 35 ? '#ff9a3a' : '#cfe0ff'; ctx.fillRect(feet.x - 24, feet.y + 6, 48 * f.guardHp / 100, 4);
    }
    if (f.bankai && f.def.id === 'rose') for (let i = 0; i < 6; i++) { const a = t * 0.02 + i; outlinedText(ctx, '♪', head.x + Math.cos(a) * 90, head.y - 30 + Math.sin(a * 1.3) * 30, 20, '#ffe08a'); }
  }
  // Karamatsu Shinju turns the arena into the stage of a tragedy.
  if (w.fighters.some(f => f.bankai && f.def.id === 'shunsui')) {
    ctx.fillStyle = 'rgba(110,20,40,0.78)';
    for (const side of [0, 1]) {
      const x0 = side ? W : 0, d = side ? -1 : 1;
      ctx.beginPath(); ctx.moveTo(x0, 0); ctx.lineTo(x0 + d * 110, 0); ctx.quadraticCurveTo(x0 + d * 60, 300, x0 + d * 90, H); ctx.lineTo(x0, H); ctx.closePath(); ctx.fill();
    }
  }
  const [fa, fb] = w.fighters, close = Math.abs(fa.x - fb.x) < 160;
  for (const tx of w.texts) {
    ctx.globalAlpha = Math.min(1, tx.life / 20);
    const spread = close ? (tx.follow.x <= w.opponentOf(tx.follow).x ? -50 : 50) : 0; // keep the two sides' callouts apart
    const p = project(tx.follow.x, tx.y);
    const x = clamp(p.x + spread, 120, W - 120);
    if (tx.big) outlinedText(ctx, tx.text, x, p.y, 26, tx.color, 'center', FONT_DISPLAY);
    else outlinedText(ctx, tx.text, x, p.y, 19, tx.color);
  }
  ctx.globalAlpha = 1;
}

function drawBanner(ctx, w) {
  let main = null, sub = null;
  if (w.phase === 'intro') main = w.phaseT > 40 ? 'READY' : 'FIGHT';
  else if (w.phase === 'orbbreak') { main = 'SPIRIT ORB SHATTERED'; sub = w.orbBroken ? w.orbBroken.def.name : null; }
  else if (w.phase === 'over') main = w.timeout ? 'TIME' : 'K.O.';
  if (!main) return;
  ctx.fillStyle = 'rgba(8,8,14,0.45)'; ctx.fillRect(0, H / 2 - 70, W, 120);
  outlinedText(ctx, main, W / 2, H / 2 + 12, 72, PAPER, 'center', FONT_DISPLAY);
  if (sub) outlinedText(ctx, sub, W / 2, H / 2 + 44, 22, '#cfc8dc');
}

function drawReleaseText(ctx, w) {
  const r = w.release;
  if (!r) return;
  const k = 1 - r.t / RELEASE_FRAMES, f = r.f, look = LOOKS[f.def.id];
  ctx.save();
  ctx.globalAlpha = r.t < 10 ? r.t / 10 : 1;
  const sweep = Math.min(1, k * 4);
  ctx.fillStyle = alphaHex(look.aura, 0.8);
  ctx.beginPath();
  ctx.moveTo(0, H * 0.72 - 40); ctx.lineTo(W * sweep, H * 0.72 - 64); ctx.lineTo(W * sweep, H * 0.72 + 36); ctx.lineTo(0, H * 0.72 + 60);
  ctx.closePath(); ctx.fill();
  const scale = 1 + Math.max(0, 0.25 - k) * 2;
  ctx.translate(W / 2, H * 0.72);
  ctx.scale(scale, scale);
  outlinedText(ctx, 'BANKAI', 0, 4, 96, PAPER, 'center', FONT_DISPLAY);
  outlinedText(ctx, f.def.bankaiName.toUpperCase(), 0, 46, 30, GOLD);
  ctx.restore();
}
