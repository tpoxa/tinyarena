// Arena geometry, shared verbatim by client (render + collide) and server (rockets + bots).
// All solids are AABBs: p = center, s = full size. Units are meters, +y is up.

export const KILL_Y = -25;

export const BOXES = [
  // main floor
  { p: [0, -0.6, 0], s: [44, 1.2, 44], c: 0x14162a, e: 0x3d48ff },

  // central plinth + step rings (north/south)
  { p: [0, 1.2, 0], s: [10, 2.4, 10], c: 0x1a1d38, e: 0x5b6cff },
  { p: [0, 0.3, 6.8], s: [7, 0.6, 2.4], c: 0x181b33, e: 0x5b6cff },
  { p: [0, 0.6, 5.6], s: [7, 1.2, 1.6], c: 0x181b33, e: 0x5b6cff },
  { p: [0, 0.9, 4.9], s: [7, 1.8, 1.4], c: 0x181b33, e: 0x5b6cff },
  { p: [0, 0.3, -6.8], s: [7, 0.6, 2.4], c: 0x181b33, e: 0x5b6cff },
  { p: [0, 0.6, -5.6], s: [7, 1.2, 1.6], c: 0x181b33, e: 0x5b6cff },
  { p: [0, 0.9, -4.9], s: [7, 1.8, 1.4], c: 0x181b33, e: 0x5b6cff },

  // pillars
  { p: [7, 2.75, 7], s: [1.8, 5.5, 1.8], c: 0x20244a, e: 0x27e0ff },
  { p: [-7, 2.75, 7], s: [1.8, 5.5, 1.8], c: 0x20244a, e: 0x27e0ff },
  { p: [7, 2.75, -7], s: [1.8, 5.5, 1.8], c: 0x20244a, e: 0x27e0ff },
  { p: [-7, 2.75, -7], s: [1.8, 5.5, 1.8], c: 0x20244a, e: 0x27e0ff },

  // cover walls
  { p: [11, 1.25, 0], s: [1, 2.5, 6], c: 0x191c36, e: 0x3d48ff },
  { p: [-11, 1.25, 0], s: [1, 2.5, 6], c: 0x191c36, e: 0x3d48ff },
  { p: [0, 1.25, 11], s: [6, 2.5, 1], c: 0x191c36, e: 0x3d48ff },
  { p: [0, 1.25, -11], s: [6, 2.5, 1], c: 0x191c36, e: 0x3d48ff },

  // high side platforms (rail perches)
  { p: [24, 6.5, 0], s: [14, 1, 10], c: 0x171a31, e: 0xff3df0 },
  { p: [-24, 6.5, 0], s: [14, 1, 10], c: 0x171a31, e: 0xff3df0 },

  // floating pads (north = armor, south = rockets)
  { p: [0, 4.5, 24], s: [8, 1, 8], c: 0x171a31, e: 0x27e0ff },
  { p: [0, 4.5, -24], s: [8, 1, 8], c: 0x171a31, e: 0x27e0ff },
];

// step onto pad -> get launched. v is the exact velocity applied.
export const JUMP_PADS = [
  { p: [14, 0, 0], r: 1.6, v: [6.5, 20, 0] },
  { p: [-14, 0, 0], r: 1.6, v: [-6.5, 20, 0] },
  { p: [0, 0, 16], r: 1.6, v: [0, 17.5, 7.4] },
  { p: [0, 0, -16], r: 1.6, v: [0, 17.5, -7.4] },
];

export const TELEPORTERS = [
  { p: [-19, 0, 19], r: 1.4, dest: [24, 7.6, 3], yaw: Math.PI * 0.75 },
];

// yaw here follows the player convention: 0 looks toward -z, positive turns left (CCW from above)
export const SPAWNS = [
  { p: [16, 0.2, 16], yaw: Math.PI * 0.75 },
  { p: [-16, 0.2, 16], yaw: -Math.PI * 0.75 },
  { p: [16, 0.2, -16], yaw: Math.PI * 0.25 },
  { p: [-16, 0.2, -16], yaw: -Math.PI * 0.25 },
  { p: [24, 7.6, -3], yaw: Math.PI * 0.5 },
  { p: [-24, 7.6, -3], yaw: -Math.PI * 0.5 },
  { p: [0, 5.6, 24], yaw: Math.PI },
  { p: [0, 5.6, -24], yaw: 0 },
];

export const PICKUPS = [
  { id: 'mega', type: 'mega', p: [0, 2.9, 0], respawn: 30 },
  { id: 'hp1', type: 'hp25', p: [12, 0.5, 12], respawn: 15 },
  { id: 'hp2', type: 'hp25', p: [-12, 0.5, 12], respawn: 15 },
  { id: 'hp3', type: 'hp25', p: [12, 0.5, -12], respawn: 15 },
  { id: 'hp4', type: 'hp25', p: [-12, 0.5, -12], respawn: 15 },
  { id: 'arm1', type: 'armor50', p: [0, 5.5, 24], respawn: 25 },
  { id: 'rkt1', type: 'rockets', p: [0, 5.5, -24], respawn: 15 },
  { id: 'rkt2', type: 'rockets', p: [-21, 7.5, 3], respawn: 15 },
  { id: 'slg1', type: 'slugs', p: [-28, 7.5, 0], respawn: 15 },
  { id: 'blt1', type: 'bullets', p: [28, 7.5, 0], respawn: 15 },
];

export const PICKUP_DEFS = {
  mega: { hp: 100, overheal: true, label: 'MEGA HEALTH' },
  hp25: { hp: 25, label: '+25 HEALTH' },
  armor50: { armor: 50, label: '+50 ARMOR' },
  rockets: { ammo: 'rockets', amount: 5, label: 'ROCKETS' },
  slugs: { ammo: 'slugs', amount: 5, label: 'SLUGS' },
  bullets: { ammo: 'bullets', amount: 50, label: 'BULLETS' },
};

// flat waypoints on the main floor — bots roam these
export const NAV_NODES = [
  [12, 0.2, 12], [-12, 0.2, 12], [12, 0.2, -12], [-12, 0.2, -12],
  [16, 0.2, 8], [16, 0.2, -8], [-16, 0.2, 8], [-16, 0.2, -8],
  [8, 0.2, 16], [-8, 0.2, 16], [8, 0.2, -16], [-8, 0.2, -16],
  [4, 0.2, 9], [-4, 0.2, 9], [4, 0.2, -9], [-4, 0.2, -9],
];

// axis-aligned box helpers used by both sides
export function boxMin(b) { return [b.p[0] - b.s[0] / 2, b.p[1] - b.s[1] / 2, b.p[2] - b.s[2] / 2]; }
export function boxMax(b) { return [b.p[0] + b.s[0] / 2, b.p[1] + b.s[1] / 2, b.p[2] + b.s[2] / 2]; }

// segment vs AABB, returns t in [0,1] or null (slab method)
export function segmentVsBox(a, d, b) {
  const mn = boxMin(b), mx = boxMax(b);
  let t0 = 0, t1 = 1;
  for (let i = 0; i < 3; i++) {
    if (Math.abs(d[i]) < 1e-9) {
      if (a[i] < mn[i] || a[i] > mx[i]) return null;
    } else {
      let ta = (mn[i] - a[i]) / d[i];
      let tb = (mx[i] - a[i]) / d[i];
      if (ta > tb) [ta, tb] = [tb, ta];
      t0 = Math.max(t0, ta);
      t1 = Math.min(t1, tb);
      if (t0 > t1) return null;
    }
  }
  return t0;
}

// first world-geometry hit along segment from `a` with delta `d`
export function raycastWorld(a, d) {
  let best = null;
  for (const b of BOXES) {
    const t = segmentVsBox(a, d, b);
    if (t !== null && (best === null || t < best)) best = t;
  }
  return best;
}
