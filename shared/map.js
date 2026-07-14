// Arena geometry — data lives in arena.json (single source of truth for the
// JS client and the Go server). This module loads it and re-exports the
// pieces plus the AABB math helpers. Works in browsers (fetch) and Node (fs).

let data;
if (typeof window === 'undefined') {
  const { readFile } = await import('node:fs/promises');
  const name = process.env.MAP || 'neon-yard';
  data = JSON.parse(await readFile(new URL(`./maps/${name}.json`, import.meta.url), 'utf8'));
} else {
  // the server serves whichever map is active at this path
  data = await (await fetch('/shared/arena.json')).json();
}

export const ARENA = data;
export const KILL_Y = data.killY;
export const BOXES = data.boxes;
export const JUMP_PADS = data.jumpPads;
export const TELEPORTERS = data.teleporters;
export const SPAWNS = data.spawns;
export const PICKUPS = data.pickups;
export const PICKUP_DEFS = data.pickupDefs;
export const NAV_NODES = data.navNodes;

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
