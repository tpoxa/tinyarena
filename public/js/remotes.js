// Remote players & server rockets: meshes, name tags, snapshot interpolation.

import * as THREE from 'three';
import { makeGun } from '/js/guns.js';

const INTERP_DELAY = 0.12; // render remotes this far in the past

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

// articulated neon arena droid; parts wired into userData for animation
function playerMesh(color) {
  const g = new THREE.Group();
  const col = new THREE.Color(color);
  const armor = new THREE.MeshLambertMaterial({ color: 0x23264a });
  const dark = new THREE.MeshLambertMaterial({ color: 0x14162e });
  const glowMat = new THREE.MeshBasicMaterial({ color: col });

  // legs — pivot at the hip so they can swing
  function leg(x) {
    const hip = new THREE.Group();
    hip.position.set(x, 0.88, 0);
    const thigh = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.42, 0.15), armor);
    thigh.position.y = -0.21;
    const shin = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.4, 0.12), dark);
    shin.position.set(0, -0.6, 0.01);
    const foot = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.08, 0.22), dark);
    foot.position.set(0, -0.84, -0.04);
    const kneeGlow = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.02), glowMat);
    kneeGlow.position.set(0, -0.42, -0.08);
    hip.add(thigh, shin, foot, kneeGlow);
    return hip;
  }
  const legL = leg(-0.11);
  const legR = leg(0.11);

  // upper body — pivots at the waist so it can pitch with aim
  const upper = new THREE.Group();
  upper.position.y = 1.0;

  const pelvis = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.16, 0.22), dark);
  pelvis.position.y = -0.06;
  const waist = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.18, 0.2), armor);
  waist.position.y = 0.1;
  const chest = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.34, 0.26), armor);
  chest.position.y = 0.36;
  const core = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.12, 0.02), glowMat);
  core.position.set(0, 0.38, -0.14);

  const shoulderL = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.12, 0.2), armor);
  shoulderL.position.set(-0.3, 0.48, 0);
  const shoulderR = shoulderL.clone();
  shoulderR.position.x = 0.3;
  const padGlowL = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.02, 0.21), glowMat);
  padGlowL.position.set(-0.3, 0.545, 0);
  const padGlowR = padGlowL.clone();
  padGlowR.position.x = 0.3;

  const head = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.22, 0.26), armor);
  head.position.y = 0.68;
  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.06, 0.02), glowMat);
  visor.position.set(0, 0.7, -0.14);
  const antenna = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.14, 0.02), glowMat);
  antenna.position.set(0.1, 0.85, 0.05);

  // arms reach toward the gun
  const armR = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.09, 0.34), armor);
  armR.position.set(0.24, 0.3, -0.16);
  armR.rotation.x = 0.35;
  const armL = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.09, 0.3), armor);
  armL.position.set(-0.16, 0.22, -0.26);
  armL.rotation.set(0.5, -0.5, 0);

  const gunMount = new THREE.Group();
  gunMount.position.set(0.18, 0.26, -0.38);
  gunMount.add(makeGun(0));

  upper.add(pelvis, waist, chest, core, shoulderL, shoulderR, padGlowL, padGlowR,
    head, visor, antenna, armR, armL, gunMount);

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
    const renderT = performance.now() / 1000 - INTERP_DELAY;
    for (const r of this.players.values()) {
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
