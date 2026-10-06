'use strict';
// Shared constants and helpers. Scripts are plain globals (no modules) so the
// game runs by opening index.html straight from disk.

const W = 1280;
const H = 720;
const GROUND = 620;
const ARENA_L = 30;
const ARENA_R = 1250;
const GRAVITY = 0.85;

const OUTPACE_LAG = 22;               // frames an outpaced fighter's tracking trails Tensa Zangetsu
const BANKAI_DRAIN = 100 / (20 * 60); // a full gauge sustains bankai for 20 s
const RELEASE_FRAMES = 80;            // bankai release cinematic
const MATCH_FRAMES = 180 * 60;

const ACTIONS = ['jump', 'guard', 'light', 'heavy', 'special', 'dash', 'bankai'];

function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
function sign(v) { return v < 0 ? -1 : 1; }

function overlap(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

function circleRect(cx, cy, r, b) {
  const nx = clamp(cx, b.x, b.x + b.w), ny = clamp(cy, b.y, b.y + b.h);
  return (nx - cx) * (nx - cx) + (ny - cy) * (ny - cy) <= r * r;
}

// mulberry32: seeded so CPU behaviour is reproducible in tests.
function makeRng(seed) {
  let s = seed >>> 0;
  return function () {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// What a controller (keyboard or CPU) asks a fighter to do this frame.
// move/guard are held; everything else is a press on this frame.
function emptyIntent() {
  return { move: 0, jump: false, guard: false, light: false, heavy: false, special: false, dash: false, bankai: false };
}
