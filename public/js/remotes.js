// Remote players & server rockets: meshes, name tags, snapshot interpolation.

import * as THREE from 'three';
import { makeGun } from '/js/guns.js';
import { buildModel } from '/js/models.js';

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

const TAG_HOLD = 0.4; // seconds a name stays up after the crosshair leaves

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
    const group = buildModel(info.model, info.color);
    const tag = nameSprite(info.name, info.color);
    tag.position.y = new THREE.Box3().setFromObject(group).max.y + 0.45;
    tag.visible = false; // revealed by crosshair hover
    group.add(tag);
    group.visible = false;
    this.scene.add(group);
    this.players.set(info.id, { info, group, tag, hoverUntil: 0, buf: [], dead: true });
  }

  removePlayer(id) {
    const r = this.players.get(id);
    if (!r) return;
    this.scene.remove(r.group);
    this.players.delete(id);
  }

  get(id) { return this.players.get(id); }

  // map changed under us — drop every stale position so nobody interpolates
  // across the old geometry (bots gliding through the air on the new map)
  resetAll() {
    for (const r of this.players.values()) {
      r.buf = [];
      r.dead = true;
      r.group.visible = false;
    }
  }

  // server respawn/teleport for a remote: pop to the new spot, don't interpolate there
  onSpawn(id, p, yaw = 0) {
    const r = this.players.get(id);
    if (!r) return;
    r.dead = false;
    r.buf = [{ t: performance.now() / 1000, p, yw: yaw, pt: 0 }];
    r.group.position.set(p[0], p[1], p[2]);
    r.group.visible = true;
  }

  // kill confirmed by the server — burst at the rendered position, riding the impulse
  killBurst(id, kick) {
    const r = this.players.get(id);
    if (!r || r.dead || !r.group.visible) return;
    r.dead = true;
    r.group.visible = false;
    const p = r.group.position;
    this.effects.deathBurst([p.x, p.y, p.z], r.info.color, kick);
  }

  // world positions of visible alive bodies (for player-vs-body collision)
  alivePositions() {
    const out = [];
    for (const r of this.players.values()) {
      if (!r.dead && r.group.visible) out.push(r.group.position);
    }
    return out;
  }

  // first body hit along segment a -> a+d; returns { t, point, id } or null
  segmentHit(a, d) {
    let best = null;
    for (const [id, r] of this.players) {
      if (r.dead || !r.group.visible) continue;
      const p = r.group.position;
      const c = [p.x, p.y + 0.9, p.z];
      const m = [a[0] - c[0], a[1] - c[1], a[2] - c[2]];
      const dd = d[0] * d[0] + d[1] * d[1] + d[2] * d[2];
      if (dd < 1e-9) continue;
      const b = (m[0] * d[0] + m[1] * d[1] + m[2] * d[2]) / dd;
      const cc = (m[0] * m[0] + m[1] * m[1] + m[2] * m[2] - 0.81) / dd;
      if (cc < 0) { // segment starts inside the body — point-blank hit
        if (!best || best.t > 0) best = { t: 0, point: [a[0], a[1], a[2]], id };
        continue;
      }
      const disc = b * b - cc;
      if (disc < 0) continue;
      const t = -b - Math.sqrt(disc);
      if (t < 0 || t > 1) continue;
      if (!best || t < best.t) best = { t, point: [a[0] + d[0] * t, a[1] + d[1] * t, a[2] + d[2] * t], id };
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
        r.buf.length = 0;
      }
      if (!r.dead) {
        if (wasDead) r.buf.length = 0; // respawn pops into place — no gliding through walls
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

  update(dt, eye, aimDir) {
    this.time += dt;
    const renderT = performance.now() / 1000 - INTERP_DELAY;

    // crosshair hover reveals that player's name tag for a moment
    if (eye && aimDir) {
      const hit = this.segmentHit(eye, [aimDir[0] * 70, aimDir[1] * 70, aimDir[2] * 70]);
      if (hit) {
        const r = this.players.get(hit.id);
        if (r) r.hoverUntil = this.time + TAG_HOLD;
      }
    }

    for (const r of this.players.values()) {
      if (r.tag) r.tag.visible = this.time < r.hoverUntil && !r.dead;
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
          parts.upper.position.y = parts.upperBaseY + Math.abs(Math.cos(parts.phase)) * 0.05 * amp;
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
