// Remote players & server rockets: meshes, name tags, snapshot interpolation.

import * as THREE from 'three';
import { makeGun } from '/js/guns.js';

const INTERP_DELAY = 0.12; // render remotes this far in the past

// electric cage + glow around a quad-damage holder
function quadAura() {
  const g = new THREE.Group();
  const cage = new THREE.Mesh(
    new THREE.BoxGeometry(1.0, 2.0, 1.0),
    new THREE.MeshBasicMaterial({
      color: 0x5b9bff, wireframe: true, transparent: true, opacity: 0.55,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }),
  );
  cage.position.y = 1.0;
  const light = new THREE.PointLight(0x6ba8ff, 18, 9);
  light.position.y = 1.2;
  g.add(cage, light);
  g.userData = { cage, light };
  return g;
}

function nameSprite(name, color) {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 56;
  const g = c.getContext('2d');
  g.font = '700 30px "Chakra Petch", monospace';
  g.textAlign = 'center';
  g.fillStyle = color;
  g.shadowColor = color;
  g.shadowBlur = 10;
  g.fillText(name.toUpperCase(), 128, 38);
  const tex = new THREE.CanvasTexture(c);
  const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
  spr.scale.set(2.4, 0.52, 1);
  spr.position.y = 2.25;
  return spr;
}

// friendly toy space-trooper: white armor, player-color accents, no scary bits.
// parts wired into userData for animation; exported for the dev model viewer.
export function playerMesh(color) {
  const g = new THREE.Group();
  const col = new THREE.Color(color);
  const white = new THREE.MeshLambertMaterial({ color: 0xdfe3ff });
  const lightGrey = new THREE.MeshLambertMaterial({ color: 0xc9cef5 });
  const joint = new THREE.MeshLambertMaterial({ color: 0x2a2e55 });
  const accent = new THREE.MeshLambertMaterial({ color: col.clone().lerp(new THREE.Color(0xffffff), 0.15) });
  const glowCyan = new THREE.MeshBasicMaterial({ color: 0x9be8ff });

  // stubby legs — pivot at the hip so they can swing
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

  // upper body — pivots so it can pitch with aim
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

  // backpack with soft thrusters instead of anything horn-like
  const pack = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.3, 0.14), lightGrey);
  pack.position.set(0, 0.15, 0.27);
  const thrL = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.1, 10), joint);
  thrL.position.set(-0.09, -0.03, 0.29);
  const thrR = thrL.clone();
  thrR.position.x = 0.09;
  const jetL = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.02, 10), glowCyan);
  jetL.position.set(-0.09, -0.09, 0.29);
  const jetR = jetL.clone();
  jetR.position.x = 0.09;

  // arms reach toward the gun
  const armR = new THREE.Mesh(new THREE.CapsuleGeometry(0.055, 0.24, 4, 8), joint);
  armR.position.set(0.24, 0.16, -0.16);
  armR.rotation.x = 1.1;
  const armL = new THREE.Mesh(new THREE.CapsuleGeometry(0.055, 0.22, 4, 8), joint);
  armL.position.set(-0.12, 0.12, -0.24);
  armL.rotation.set(1.2, -0.5, 0);

  const gunMount = new THREE.Group();
  gunMount.position.set(0.18, 0.18, -0.38);
  gunMount.scale.setScalar(0.9);
  gunMount.add(makeGun(0));

  upper.add(torso, belly, core, head, eyeL, eyeR, earL, earR,
    shoulderL, shoulderR, pack, thrL, thrR, jetL, jetR, armR, armL, gunMount);

  g.add(legL, legR, upper);
  g.userData.parts = { legL, legR, upper, gunMount, phase: 0, weapon: 0, prev: null };
  return g;
}

export class Remotes {
  constructor(scene, effects, audio) {
    this.scene = scene;
    this.effects = effects;
    this.audio = audio;
    this.players = new Map(); // id -> { info, group, buf: [{t, p, yw, pt}], dead }
    this.rockets = new Map(); // id -> mesh
    this.myId = null;
    this.time = 0;
  }

  addPlayer(info) {
    if (this.players.has(info.id) || info.id === this.myId) return;
    const group = playerMesh(info.color);
    group.add(nameSprite(info.name, info.color));
    group.visible = false;
    this.scene.add(group);
    this.players.set(info.id, { info, group, buf: [], dead: true });
  }

  removePlayer(id) {
    const r = this.players.get(id);
    if (!r) return;
    this.scene.remove(r.group);
    this.players.delete(id);
  }

  get(id) { return this.players.get(id); }

  // world positions of visible alive bodies (for player-vs-body collision)
  alivePositions() {
    const out = [];
    for (const r of this.players.values()) {
      if (!r.dead && r.group.visible) out.push(r.group.position);
    }
    return out;
  }

  // first body hit along segment a -> a+d; returns { t, point } or null
  segmentHit(a, d) {
    let best = null;
    for (const r of this.players.values()) {
      if (r.dead || !r.group.visible) continue;
      const p = r.group.position;
      const c = [p.x, p.y + 0.9, p.z];
      const m = [a[0] - c[0], a[1] - c[1], a[2] - c[2]];
      const dd = d[0] * d[0] + d[1] * d[1] + d[2] * d[2];
      if (dd < 1e-9) continue;
      const b = (m[0] * d[0] + m[1] * d[1] + m[2] * d[2]) / dd;
      const cc = (m[0] * m[0] + m[1] * m[1] + m[2] * m[2] - 0.81) / dd;
      if (cc < 0) { // segment starts inside the body — point-blank hit
        if (!best || best.t > 0) best = { t: 0, point: [a[0], a[1], a[2]] };
        continue;
      }
      const disc = b * b - cc;
      if (disc < 0) continue;
      const t = -b - Math.sqrt(disc);
      if (t < 0 || t > 1) continue;
      if (!best || t < best.t) best = { t, point: [a[0] + d[0] * t, a[1] + d[1] * t, a[2] + d[2] * t] };
    }
    return best;
  }

  onSnapshot(msg) {
    const t = performance.now() / 1000;
    for (const s of msg.players) {
      if (s.i === this.myId) continue;
      const r = this.players.get(s.i);
      if (!r) continue;
      r.info.frags = s.f;
      r.info.deaths = s.dt;
      r.wantWeapon = s.w;
      r.quad = !!s.q;
      const wasDead = r.dead;
      r.dead = !!s.d;
      if (r.dead && !wasDead) {
        r.group.visible = false;
        this.effects.deathBurst(s.p, r.info.color);
      }
      if (!r.dead) {
        r.buf.push({ t, p: s.p, yw: s.yw, pt: s.pt });
        if (r.buf.length > 30) r.buf.shift();
      }
    }

    // server rockets (skip own — local sim covers those)
    const seen = new Set();
    for (const rk of msg.rockets) {
      if (rk.o === this.myId) continue;
      seen.add(rk.i);
      let mesh = this.rockets.get(rk.i);
      if (!mesh) {
        mesh = this.effects.rocketMesh();
        this.rockets.set(rk.i, mesh);
      }
      const target = new THREE.Vector3(...rk.p);
      mesh.userData.target = target;
      mesh.userData.dir = new THREE.Vector3(...rk.d);
      if (!mesh.userData.init) {
        mesh.position.copy(target);
        mesh.userData.init = true;
      }
    }
    for (const [id, mesh] of this.rockets) {
      if (!seen.has(id)) {
        this.effects.removeRocket(mesh);
        this.rockets.delete(id);
      }
    }
  }

  update(dt) {
    this.time += dt;
    const renderT = performance.now() / 1000 - INTERP_DELAY;
    for (const r of this.players.values()) {
      if (r.quad && !r.aura) {
        r.aura = quadAura();
        r.group.add(r.aura);
      }
      if (r.aura) {
        r.aura.visible = r.quad && !r.dead;
        if (r.aura.visible) {
          const k = 1 + Math.sin(this.time * 7) * 0.06;
          r.aura.userData.cage.scale.setScalar(k);
          r.aura.userData.cage.rotation.y += dt * 1.4;
          r.aura.userData.light.intensity = 14 + Math.sin(this.time * 9) * 6;
        }
      }
      if (r.dead || r.buf.length === 0) continue;
      let a = r.buf[0], b = r.buf[r.buf.length - 1];
      for (let i = 0; i < r.buf.length - 1; i++) {
        if (r.buf[i].t <= renderT && r.buf[i + 1].t >= renderT) {
          a = r.buf[i]; b = r.buf[i + 1];
          break;
        }
      }
      const span = Math.max(1e-4, b.t - a.t);
      const k = Math.max(0, Math.min(1, (renderT - a.t) / span));
      r.group.position.set(
        a.p[0] + (b.p[0] - a.p[0]) * k,
        a.p[1] + (b.p[1] - a.p[1]) * k,
        a.p[2] + (b.p[2] - a.p[2]) * k,
      );
      let dyaw = b.yw - a.yw;
      if (dyaw > Math.PI) dyaw -= Math.PI * 2;
      if (dyaw < -Math.PI) dyaw += Math.PI * 2;
      r.group.rotation.y = a.yw + dyaw * k;
      r.group.visible = true;

      // drive the droid: leg swing from actual motion, torso pitch from aim
      const parts = r.group.userData.parts;
      if (parts) {
        const p = r.group.position;
        if (parts.prev && dt > 0) {
          const speed = Math.min(10, Math.hypot(p.x - parts.prev.x, p.z - parts.prev.z) / dt);
          const amp = Math.min(1, speed / 8);
          parts.phase += dt * (2 + speed * 1.6);
          const swing = Math.sin(parts.phase) * 0.75 * amp;
          parts.legL.rotation.x = swing;
          parts.legR.rotation.x = -swing;
          parts.upper.position.y = 1.0 + Math.abs(Math.cos(parts.phase)) * 0.05 * amp;
        }
        parts.prev = { x: p.x, z: p.z };
        parts.upper.rotation.x = (a.pt + (b.pt - a.pt) * k) * 0.55;
        if (parts.weapon !== r.wantWeapon && r.wantWeapon !== undefined) {
          parts.weapon = r.wantWeapon;
          parts.gunMount.clear();
          parts.gunMount.add(makeGun(parts.weapon));
        }
      }
    }

    // smooth rockets toward their latest server position
    for (const mesh of this.rockets.values()) {
      const tg = mesh.userData.target;
      if (!tg) continue;
      const prev = [mesh.position.x, mesh.position.y, mesh.position.z];
      mesh.position.lerp(tg, Math.min(1, dt * 12));
      const d = mesh.userData.dir;
      if (d) mesh.lookAt(mesh.position.clone().add(d));
      const moved = (mesh.position.x - prev[0]) ** 2 + (mesh.position.y - prev[1]) ** 2 + (mesh.position.z - prev[2]) ** 2;
      if (moved > 0.02) this.effects.rocketTrail(prev, [mesh.position.x, mesh.position.y, mesh.position.z]);
    }
  }
}
