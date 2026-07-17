// Player body factory — low-poly office-desk heroes built from primitives.
// Every builder returns a ~1.6-1.9m tall Group with userData.parts:
//   upper    — pivots with aim pitch and bobs while running (required)
//   legL/R   — swing while running (optional, empty Groups are fine)
//   gunMount — the weapon attaches here (wrapper adds a default if missing)
// buildModel() wraps each body with an identity ring in the player color.

import * as THREE from 'three';
import { makeGun } from '/js/guns.js';

function lambert(color) { return new THREE.MeshLambertMaterial({ color }); }
function glow(color) { return new THREE.MeshBasicMaterial({ color }); }

// friendly toy space-trooper: white armor, player-color accents.
function trooper(col) {
  const g = new THREE.Group();
  const white = lambert(0xdfe3ff);
  const lightGrey = lambert(0xc9cef5);
  const joint = lambert(0x2a2e55);
  const accent = lambert(col.clone().lerp(new THREE.Color(0xffffff), 0.15));
  const glowCyan = glow(0x9be8ff);

  function leg(x) {
    const hip = new THREE.Group();
    hip.position.set(x, 0.72, 0);
    const limb = new THREE.Mesh(new THREE.CapsuleGeometry(0.08, 0.4, 4, 10), accent);
    limb.position.y = -0.34;
    const foot = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 8), joint);
    foot.scale.set(1.1, 0.6, 1.3);
    foot.position.set(0, -0.62, -0.02);
    hip.add(limb, foot);
    return hip;
  }
  const legL = leg(-0.13);
  const legR = leg(0.13);

  const upper = new THREE.Group();
  upper.position.y = 1.0;
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.26, 0.35, 4, 14), white);
  torso.position.y = 0.08;
  const belly = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.18, 0.05), accent);
  belly.position.set(0, 0.12, -0.24);
  const core = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.07, 0.03), glowCyan);
  core.position.set(0, 0.13, -0.265);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.19, 14, 12), white);
  head.scale.set(1, 0.92, 1);
  head.position.y = 0.62;
  const eyeL = new THREE.Mesh(new THREE.SphereGeometry(0.03, 8, 6), glowCyan);
  eyeL.scale.set(1.2, 1.7, 0.5);
  eyeL.position.set(-0.06, 0.64, -0.172);
  const eyeR = eyeL.clone();
  eyeR.position.x = 0.06;
  const earL = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 8), accent);
  earL.position.set(-0.19, 0.62, 0);
  const earR = earL.clone();
  earR.position.x = 0.19;
  const shoulderL = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 8), accent);
  shoulderL.position.set(-0.32, 0.32, 0);
  const shoulderR = shoulderL.clone();
  shoulderR.position.x = 0.32;
  const pack = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.3, 0.14), lightGrey);
  pack.position.set(0, 0.15, 0.27);
  const armR = new THREE.Mesh(new THREE.CapsuleGeometry(0.055, 0.24, 4, 8), joint);
  armR.position.set(0.24, 0.16, -0.16);
  armR.rotation.x = 1.1;
  const armL = new THREE.Mesh(new THREE.CapsuleGeometry(0.055, 0.22, 4, 8), joint);
  armL.position.set(-0.12, 0.12, -0.24);
  armL.rotation.set(1.2, -0.5, 0);
  const gunMount = new THREE.Group();
  gunMount.position.set(0.18, 0.18, -0.38);
  gunMount.scale.setScalar(0.9);
  upper.add(torso, belly, core, head, eyeL, eyeR, earL, earR,
    shoulderL, shoulderR, pack, armR, armL, gunMount);

  g.add(legL, legR, upper);
  g.userData.parts = { legL, legR, upper, gunMount };
  return g;
}

function duck(col) {
  const g = new THREE.Group();
  const yellow = lambert(0xffd93d);
  const orange = lambert(0xff9a3d);
  const upper = new THREE.Group();
  upper.position.y = 0.85;
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.55, 14, 12), yellow);
  body.scale.set(1, 0.82, 1.15);
  const tail = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8), yellow);
  tail.position.set(0, 0.25, 0.55);
  tail.scale.set(0.8, 0.9, 1);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.32, 14, 12), yellow);
  head.position.set(0, 0.62, -0.28);
  const beak = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.16, 0.22, 8), orange);
  beak.rotation.x = -Math.PI / 2;
  beak.position.set(0, 0.58, -0.62);
  beak.scale.set(1.4, 1, 0.6);
  const eyeL = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), lambert(0x11132a));
  eyeL.position.set(-0.15, 0.72, -0.5);
  const eyeR = eyeL.clone();
  eyeR.position.x = 0.15;
  const wingL = new THREE.Mesh(new THREE.SphereGeometry(0.25, 10, 8), yellow);
  wingL.scale.set(0.35, 0.6, 0.9);
  wingL.position.set(-0.52, 0, 0.05);
  const wingR = wingL.clone();
  wingR.position.x = 0.52;
  const bow = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.1, 0.06), glow(col));
  bow.position.set(0, 0.36, -0.42);
  upper.add(body, tail, head, beak, eyeL, eyeR, wingL, wingR, bow);
  const legL = new THREE.Group();
  legL.position.set(-0.18, 0.28, 0);
  const footL = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.06, 0.3), orange);
  footL.position.y = -0.25;
  legL.add(footL);
  const legR = legL.clone();
  legR.position.x = 0.18;
  g.add(upper, legL, legR);
  g.userData.parts = { upper, legL, legR };
  return g;
}

function tree(col) {
  const g = new THREE.Group();
  const green = lambert(0x2e9e4f);
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.16, 0.35, 10), lambert(0x6b4a2e));
  trunk.position.y = 0.18;
  const upper = new THREE.Group();
  upper.position.y = 0.35;
  const c1 = new THREE.Mesh(new THREE.ConeGeometry(0.62, 0.75, 10), green);
  c1.position.y = 0.32;
  const c2 = new THREE.Mesh(new THREE.ConeGeometry(0.48, 0.65, 10), green);
  c2.position.y = 0.78;
  const c3 = new THREE.Mesh(new THREE.ConeGeometry(0.32, 0.55, 10), green);
  c3.position.y = 1.2;
  const star = new THREE.Mesh(new THREE.OctahedronGeometry(0.14), glow(0xffe83d));
  star.position.y = 1.55;
  upper.add(c1, c2, c3, star);
  const baubles = [[0.35, 0.25, -0.4, 0xff4b4b], [-0.3, 0.65, -0.32, col.getHex()], [0.18, 1.02, -0.24, 0x27e0ff]];
  for (const [x, y, z, c] of baubles) {
    const b = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), glow(c));
    b.position.set(x, y, z);
    upper.add(b);
  }
  g.add(trunk, upper);
  g.userData.parts = { upper };
  return g;
}

function pizza(col) {
  const g = new THREE.Group();
  const upper = new THREE.Group();
  upper.position.y = 0.95;
  // slice = 3-sided prism, tip down
  const slice = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 0.95, 0.16, 3, 1), lambert(0xffd23d));
  slice.rotation.set(Math.PI / 2, 0, Math.PI); // stand upright, point at the floor
  const crust = new THREE.Mesh(new THREE.BoxGeometry(1.05, 0.22, 0.24), lambert(0xc98a4b));
  crust.position.y = 0.52;
  const peps = [[0, 0.22], [-0.25, -0.12], [0.28, -0.05], [0.02, -0.42]];
  for (const [x, y] of peps) {
    const p = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.04, 10), lambert(0xd63b3b));
    p.rotation.x = Math.PI / 2;
    p.position.set(x, y, -0.09);
    upper.add(p);
  }
  const olive = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.02, 6, 10), glow(col));
  olive.position.set(-0.12, 0.3, -0.1);
  upper.add(slice, crust, olive);
  g.add(upper);
  g.userData.parts = { upper };
  return g;
}

function mug(col) {
  const g = new THREE.Group();
  const white = lambert(0xe8eaff);
  const upper = new THREE.Group();
  upper.position.y = 0.85;
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.38, 1.05, 16), white);
  const stripe = new THREE.Mesh(new THREE.CylinderGeometry(0.425, 0.425, 0.16, 16), glow(col));
  stripe.position.y = 0.1;
  const coffee = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.04, 16), lambert(0x3b2a1e));
  coffee.position.y = 0.54;
  const handle = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.06, 8, 16), white);
  handle.position.set(0.46, 0.05, 0);
  const s1 = new THREE.Mesh(new THREE.SphereGeometry(0.045, 6, 5), lambert(0xf5f7ff));
  s1.position.set(-0.08, 0.72, 0);
  const s2 = s1.clone();
  s2.position.set(0.06, 0.86, 0);
  upper.add(body, stripe, coffee, handle, s1, s2);
  g.add(upper);
  g.userData.parts = { upper };
  return g;
}

function cactus(col) {
  const g = new THREE.Group();
  const green = lambert(0x3fae5a);
  const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.38, 0.38, 12), lambert(0xc96b3b));
  pot.position.y = 0.2;
  const rim = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.09, 12), lambert(0xb35a2e));
  rim.position.y = 0.4;
  const upper = new THREE.Group();
  upper.position.y = 0.45;
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.28, 0.75, 6, 12), green);
  body.position.y = 0.55;
  const armL = new THREE.Mesh(new THREE.CapsuleGeometry(0.13, 0.35, 6, 10), green);
  armL.position.set(-0.38, 0.55, 0);
  armL.rotation.z = 1.0;
  const armR = new THREE.Mesh(new THREE.CapsuleGeometry(0.13, 0.3, 6, 10), green);
  armR.position.set(0.36, 0.8, 0);
  armR.rotation.z = -1.1;
  const flower = new THREE.Mesh(new THREE.SphereGeometry(0.11, 8, 6), glow(col));
  flower.position.y = 1.12;
  upper.add(body, armL, armR, flower);
  g.add(pot, rim, upper);
  g.userData.parts = { upper };
  return g;
}

function cone(col) {
  const g = new THREE.Group();
  const base = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.1, 0.95), lambert(0xd66a1e));
  base.position.y = 0.05;
  const upper = new THREE.Group();
  upper.position.y = 0.1;
  const body = new THREE.Mesh(new THREE.ConeGeometry(0.48, 1.5, 14), lambert(0xff7b2e));
  body.position.y = 0.75;
  const stripe = new THREE.Mesh(new THREE.CylinderGeometry(0.31, 0.4, 0.28, 14), lambert(0xf5f7ff));
  stripe.position.y = 0.72;
  const tip = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), glow(col));
  tip.position.y = 1.52;
  upper.add(body, stripe, tip);
  g.add(base, upper);
  g.userData.parts = { upper };
  return g;
}

function penguin(col) {
  const g = new THREE.Group();
  const black = lambert(0x1c2033);
  const orange = lambert(0xff9a3d);
  const upper = new THREE.Group();
  upper.position.y = 0.9;
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.42, 0.6, 6, 14), black);
  const belly = new THREE.Mesh(new THREE.SphereGeometry(0.36, 12, 10), lambert(0xf5f7ff));
  belly.scale.set(0.75, 1.05, 0.5);
  belly.position.set(0, -0.08, -0.22);
  const eyeL = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), lambert(0xf5f7ff));
  eyeL.position.set(-0.13, 0.42, -0.32);
  const eyeR = eyeL.clone();
  eyeR.position.x = 0.13;
  const beak = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.22, 8), orange);
  beak.rotation.x = -Math.PI / 2;
  beak.position.set(0, 0.3, -0.46);
  const wingL = new THREE.Mesh(new THREE.CapsuleGeometry(0.09, 0.4, 4, 8), black);
  wingL.position.set(-0.45, 0, 0);
  wingL.rotation.z = 0.25;
  const wingR = wingL.clone();
  wingR.position.x = 0.45;
  wingR.rotation.z = -0.25;
  const scarf = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.07, 8, 16), glow(col));
  scarf.rotation.x = Math.PI / 2;
  scarf.position.y = 0.22;
  upper.add(body, belly, eyeL, eyeR, beak, wingL, wingR, scarf);
  const legL = new THREE.Group();
  legL.position.set(-0.15, 0.3, 0);
  const footL = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.06, 0.26), orange);
  footL.position.y = -0.27;
  legL.add(footL);
  const legR = legL.clone();
  legR.position.x = 0.15;
  g.add(upper, legL, legR);
  g.userData.parts = { upper, legL, legR };
  return g;
}

function ghost(col) {
  const g = new THREE.Group();
  const sheet = new THREE.MeshLambertMaterial({ color: 0xe8eaff, transparent: true, opacity: 0.88 });
  const upper = new THREE.Group();
  upper.position.y = 0.85;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.48, 14, 12), sheet);
  head.position.y = 0.35;
  const skirt = new THREE.Mesh(new THREE.ConeGeometry(0.48, 1.0, 14, 1, true), sheet);
  skirt.rotation.x = Math.PI;
  skirt.position.y = -0.15;
  const eyeL = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), lambert(0x11132a));
  eyeL.scale.set(1, 1.6, 0.5);
  eyeL.position.set(-0.16, 0.42, -0.42);
  const eyeR = eyeL.clone();
  eyeR.position.x = 0.16;
  const pendant = new THREE.Mesh(new THREE.OctahedronGeometry(0.08), glow(col));
  pendant.position.set(0, 0.05, -0.45);
  upper.add(head, skirt, eyeL, eyeR, pendant);
  g.add(upper);
  g.userData.parts = { upper };
  return g;
}

function donut(col) {
  const g = new THREE.Group();
  const upper = new THREE.Group();
  upper.position.y = 0.95;
  const dough = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.26, 12, 24), lambert(0xff7bac));
  const sprinkleCols = [0x27e0ff, 0xffe83d, 0x7dff3d, 0xf5f7ff, col.getHex()];
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    const s = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.11, 0.04), glow(sprinkleCols[i % sprinkleCols.length]));
    s.position.set(Math.cos(a) * 0.55, Math.sin(a) * 0.55, -0.22);
    s.rotation.z = a + 0.6;
    upper.add(s);
  }
  upper.add(dough);
  g.add(upper);
  g.userData.parts = { upper };
  return g;
}

function crt(col) {
  const g = new THREE.Group();
  const beige = lambert(0xd9cfa8);
  const foot = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.1, 0.5), beige);
  foot.position.y = 0.05;
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.18, 0.25, 10), beige);
  neck.position.y = 0.22;
  const upper = new THREE.Group();
  upper.position.y = 0.95;
  const shell = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.85, 0.85), beige);
  const bezel = new THREE.Mesh(new THREE.BoxGeometry(0.84, 0.68, 0.06), lambert(0x1c2033));
  bezel.position.set(0, 0, -0.43);
  const screen = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.54, 0.02), glow(0x27e0ff));
  screen.position.set(0, 0, -0.46);
  const prompt = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.06, 0.01), lambert(0x0a4a55));
  prompt.position.set(-0.16, 0.14, -0.475);
  const led = new THREE.Mesh(new THREE.SphereGeometry(0.04, 6, 5), glow(col));
  led.position.set(0.4, -0.32, -0.44);
  upper.add(shell, bezel, screen, prompt, led);
  g.add(foot, neck, upper);
  g.userData.parts = { upper };
  return g;
}

function snowman(col) {
  const g = new THREE.Group();
  const snow = lambert(0xf0f4ff);
  const upper = new THREE.Group();
  upper.position.y = 0.45;
  const bottom = new THREE.Mesh(new THREE.SphereGeometry(0.45, 14, 12), snow);
  const mid = new THREE.Mesh(new THREE.SphereGeometry(0.33, 12, 10), snow);
  mid.position.y = 0.55;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.24, 12, 10), snow);
  head.position.y = 1.0;
  const carrot = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.28, 8), lambert(0xff7b2e));
  carrot.rotation.x = -Math.PI / 2;
  carrot.position.set(0, 1.0, -0.34);
  const eyeL = new THREE.Mesh(new THREE.SphereGeometry(0.035, 6, 5), lambert(0x11132a));
  eyeL.position.set(-0.09, 1.08, -0.2);
  const eyeR = eyeL.clone();
  eyeR.position.x = 0.09;
  const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.03, 12), lambert(0x1c2033));
  brim.position.y = 1.18;
  const hat = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.28, 12), lambert(0x1c2033));
  hat.position.y = 1.33;
  const scarf = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.06, 8, 16), glow(col));
  scarf.rotation.x = Math.PI / 2;
  scarf.position.y = 0.8;
  upper.add(bottom, mid, head, carrot, eyeL, eyeR, brim, hat, scarf);
  g.add(upper);
  g.userData.parts = { upper };
  return g;
}

function burger(col) {
  const g = new THREE.Group();
  const upper = new THREE.Group();
  upper.position.y = 0.55;
  const bunBottom = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.46, 0.2, 16), lambert(0xe0a85c));
  const patty = new THREE.Mesh(new THREE.CylinderGeometry(0.52, 0.52, 0.15, 16), lambert(0x5c3a24));
  patty.position.y = 0.17;
  const cheese = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.05, 0.95), lambert(0xffc93d));
  cheese.position.y = 0.27;
  cheese.rotation.y = Math.PI / 4;
  const lettuce = new THREE.Mesh(new THREE.CylinderGeometry(0.54, 0.5, 0.07, 16), lambert(0x7dff3d));
  lettuce.position.y = 0.33;
  const tomato = new THREE.Mesh(new THREE.CylinderGeometry(0.48, 0.48, 0.07, 16), lambert(0xd63b3b));
  tomato.position.y = 0.4;
  const bunTop = new THREE.Mesh(new THREE.SphereGeometry(0.5, 16, 12), lambert(0xe0a85c));
  bunTop.scale.set(1, 0.62, 1);
  bunTop.position.y = 0.48;
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + 0.4;
    const seed = new THREE.Mesh(new THREE.SphereGeometry(0.025, 5, 4), lambert(0xfff2d9));
    seed.position.set(Math.cos(a) * 0.26, 0.68, Math.sin(a) * 0.26);
    upper.add(seed);
  }
  const pick = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.35, 6), lambert(0xc9cef5));
  pick.position.y = 0.85;
  const flag = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.09, 0.01), glow(col));
  flag.position.set(0.07, 0.95, 0);
  upper.add(bunBottom, patty, cheese, lettuce, tomato, bunTop, pick, flag);
  g.add(upper);
  g.userData.parts = { upper };
  return g;
}

function floppy(col) {
  const g = new THREE.Group();
  const upper = new THREE.Group();
  upper.position.y = 0.9;
  const disk = new THREE.Mesh(new THREE.BoxGeometry(1.05, 1.05, 0.12), lambert(0x2a2e55));
  const label = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.42, 0.02), lambert(0xf5f7ff));
  label.position.set(0, -0.26, -0.07);
  const scribble = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.05, 0.01), lambert(0x6b70a3));
  scribble.position.set(0, -0.18, -0.085);
  const scribble2 = scribble.clone();
  scribble2.position.y = -0.32;
  scribble2.scale.x = 0.7;
  const shutter = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.3, 0.02), lambert(0xc9cef5));
  shutter.position.set(0.06, 0.34, -0.07);
  const slot = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.2, 0.01), lambert(0x11132a));
  slot.position.set(0.16, 0.34, -0.085);
  const corner = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.13), glow(col));
  corner.position.set(-0.47, 0.47, 0);
  upper.add(disk, label, scribble, scribble2, shutter, slot, corner);
  g.add(upper);
  g.userData.parts = { upper };
  return g;
}

function robotvac(col) {
  const g = new THREE.Group();
  const upper = new THREE.Group();
  upper.position.y = 0.35;
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.62, 0.28, 20), lambert(0x2a2e55));
  const top = new THREE.Mesh(new THREE.CylinderGeometry(0.58, 0.58, 0.06, 20), lambert(0x1c2033));
  top.position.y = 0.17;
  const button = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.05, 12), glow(col));
  button.position.y = 0.22;
  const sensor = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.1, 0.12), lambert(0x11132a));
  sensor.position.set(0, 0.22, -0.4);
  const eye = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.04, 0.06), glow(0x27e0ff));
  eye.position.set(0, 0.22, -0.44);
  // a tiny mop pad — it cleans while it frags
  const pad = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.04, 12), lambert(0x9be8ff));
  pad.position.set(0.25, -0.16, 0.2);
  upper.add(body, top, button, sensor, eye, pad);
  g.add(upper);
  g.userData.parts = { upper };
  return g;
}

export const MODELS = [
  { id: 'trooper', name: 'TROOPER', build: trooper },
  { id: 'duck', name: 'RUBBER DUCK', build: duck },
  { id: 'tree', name: 'XMAS TREE', build: tree },
  { id: 'pizza', name: 'PIZZA SLICE', build: pizza },
  { id: 'mug', name: 'COFFEE MUG', build: mug },
  { id: 'cactus', name: 'CACTUS', build: cactus },
  { id: 'cone', name: 'TRAFFIC CONE', build: cone },
  { id: 'penguin', name: 'PENGUIN', build: penguin },
  { id: 'ghost', name: 'GHOST', build: ghost },
  { id: 'donut', name: 'DONUT', build: donut },
  { id: 'crt', name: 'RETRO PC', build: crt },
  { id: 'snowman', name: 'SNOWMAN', build: snowman },
  { id: 'burger', name: 'BURGER', build: burger },
  { id: 'floppy', name: 'FLOPPY DISK', build: floppy },
  { id: 'robotvac', name: 'ROBO VACUUM', build: robotvac },
];

const BY_ID = new Map(MODELS.map((m) => [m.id, m]));

export function buildModel(id, color) {
  const col = new THREE.Color(color);
  const g = (BY_ID.get(id) ?? BY_ID.get('trooper')).build(col);
  const parts = g.userData.parts ?? {};

  // identity ring: every body stands on a glowing disc in the player color
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(0.55, 0.045, 8, 24),
    new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.85 }),
  );
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.06;
  g.add(ring);

  if (!parts.gunMount) {
    const gm = new THREE.Group();
    gm.position.set(0.55, 0.85, -0.35);
    gm.scale.setScalar(0.9);
    parts.upper?.add(gm) ?? g.add(gm);
    if (parts.upper) gm.position.y -= parts.upper.position.y;
    parts.gunMount = gm;
  }
  parts.gunMount.add(makeGun(0));
  if (!parts.legL) parts.legL = new THREE.Group();
  if (!parts.legR) parts.legR = new THREE.Group();
  parts.upperBaseY = parts.upper?.position.y ?? 0;
  parts.phase = 0;
  parts.weapon = 0;
  parts.prev = null;
  g.userData.parts = parts;
  return g;
}
