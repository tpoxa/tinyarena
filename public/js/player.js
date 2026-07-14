// Local player: Quake-style movement (ground friction, air control, bunny hop),
// AABB collision vs map with step-up, jump pads, teleporters, firing + viewmodel.

import * as THREE from 'three';
import { BOXES, JUMP_PADS, TELEPORTERS, boxMin, boxMax, raycastWorld } from '/shared/map.js';
import { WEAPONS, START_AMMO } from '/shared/weapons.js';
import { makeGun } from '/js/guns.js';

const GRAVITY = 22;
const MAX_SPEED = 9;
const GROUND_ACCEL = 10;
const AIR_ACCEL = 1.6;
const FRICTION = 8;
const JUMP_VEL = 8.5;
const STEP_HEIGHT = 0.68;
const HALF = [0.4, 0.9, 0.4]; // player half-extents; center = feet + 0.9
export const EYE = 1.62;

export class LocalPlayer {
  constructor(camera, effects, audio, onFire) {
    this.camera = camera;
    this.effects = effects;
    this.audio = audio;
    this.onFire = onFire; // (weaponId, origin[3], dir[3]) => void

    this.pos = new THREE.Vector3(0, 0.2, 0);
    this.vel = new THREE.Vector3();
    this.yaw = 0;
    this.pitch = 0;
    this.onGround = false;
    this.alive = false;

    this.weapon = 0;
    this.ammo = { ...START_AMMO };
    this.lastFire = {};
    this.firing = false;
    this.keys = {};
    this.bobPhase = 0;
    this.recoil = 0;
    this.localRockets = [];

    this.buildViewmodel();
    this.bindInput();
  }

  buildViewmodel() {
    const g = new THREE.Group();
    g.add(makeGun(this.weapon));
    g.position.set(0.26, -0.24, -0.45);
    g.scale.setScalar(0.8);
    this.viewmodel = g;
    this.camera.add(g);
  }

  setViewmodelWeapon(w) {
    this.viewmodel.clear();
    this.viewmodel.add(makeGun(w));
    this.recoil = 0.6; // small draw-kick on switch
  }

  bindInput() {
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Tab') e.preventDefault();
      this.keys[e.code] = true;
      if (e.code === 'Digit1') this.switchWeapon(0);
      if (e.code === 'Digit2') this.switchWeapon(1);
      if (e.code === 'Digit3') this.switchWeapon(2);
    });
    window.addEventListener('keyup', (e) => { this.keys[e.code] = false; });
    window.addEventListener('mousemove', (e) => {
      if (document.pointerLockElement === null || !this.alive) return;
      this.yaw -= e.movementX * 0.0021;
      this.pitch -= e.movementY * 0.0021;
      this.pitch = Math.max(-1.45, Math.min(1.45, this.pitch));
    });
    window.addEventListener('mousedown', (e) => {
      if (document.pointerLockElement === null) return;
      if (e.button === 0) this.firing = true;
    });
    window.addEventListener('mouseup', (e) => { if (e.button === 0) this.firing = false; });
    window.addEventListener('wheel', (e) => {
      if (document.pointerLockElement === null || !this.alive) return;
      const d = e.deltaY > 0 ? 1 : -1;
      this.switchWeapon((this.weapon + d + WEAPONS.length) % WEAPONS.length);
    });
  }

  switchWeapon(w) {
    if (w === this.weapon || !WEAPONS[w]) return;
    this.weapon = w;
    this.audio.play('switch');
    this.setViewmodelWeapon(w);
    document.dispatchEvent(new CustomEvent('weapon-changed', { detail: w }));
  }

  spawn(p, yaw) {
    this.pos.set(p[0], p[1], p[2]);
    this.vel.set(0, 0, 0);
    this.yaw = yaw;
    this.pitch = 0;
    this.alive = true;
    this.ammo = { ...START_AMMO };
  }

  die() {
    this.alive = false;
    this.firing = false;
    this.localRockets.length = 0;
  }

  forwardDir() {
    return new THREE.Vector3(
      -Math.sin(this.yaw) * Math.cos(this.pitch),
      Math.sin(this.pitch),
      -Math.cos(this.yaw) * Math.cos(this.pitch),
    );
  }

  eye() {
    return [this.pos.x, this.pos.y + EYE, this.pos.z];
  }

  // ------------------------------------------------ movement

  overlapsAt(px, py, pz) {
    const cx = px, cy = py + HALF[1], cz = pz;
    for (const b of BOXES) {
      const mn = boxMin(b), mx = boxMax(b);
      if (
        cx + HALF[0] > mn[0] && cx - HALF[0] < mx[0] &&
        cy + HALF[1] > mn[1] && cy - HALF[1] < mx[1] &&
        cz + HALF[2] > mn[2] && cz - HALF[2] < mx[2]
      ) return b;
    }
    return null;
  }

  moveAxis(axis, delta) {
    if (delta === 0) return false;
    const p = [this.pos.x, this.pos.y, this.pos.z];
    p[axis] += delta;
    const hit = this.overlapsAt(p[0], p[1], p[2]);
    if (!hit) {
      this.pos.setComponent(axis, p[axis]);
      return false;
    }
    // clamp flush against the box face
    const mn = boxMin(hit), mx = boxMax(hit);
    const half = axis === 1 ? HALF[1] : HALF[axis === 0 ? 0 : 2];
    const centerOff = axis === 1 ? HALF[1] : 0;
    if (delta > 0) this.pos.setComponent(axis, mn[axis] - half - centerOff - 0.001);
    else this.pos.setComponent(axis, mx[axis] + half - centerOff + 0.001);
    return true;
  }

  moveHorizontal(axis, delta) {
    if (delta === 0) return;
    const before = this.pos.getComponent(axis);
    const blocked = this.moveAxis(axis, delta);
    if (!blocked) return;
    // step-up: retry from a raised position, then settle back down
    const liftBase = [this.pos.x, this.pos.y, this.pos.z];
    liftBase[axis] = before;
    const lifted = [liftBase[0], liftBase[1] + STEP_HEIGHT, liftBase[2]];
    if (this.overlapsAt(lifted[0], lifted[1], lifted[2])) { this.vel.setComponent(axis, 0); return; }
    lifted[axis] += delta;
    if (this.overlapsAt(lifted[0], lifted[1], lifted[2])) { this.vel.setComponent(axis, 0); return; }
    // drop down to the step surface
    let y = lifted[1];
    for (let i = 0; i < 8; i++) {
      const ny = y - STEP_HEIGHT / 8;
      if (this.overlapsAt(lifted[0], ny, lifted[2])) break;
      y = ny;
    }
    this.pos.set(lifted[0], y, lifted[2]);
  }

  update(dt, netAlive) {
    if (this.alive && netAlive) this.updateMovement(dt);
    this.updateLocalRockets(dt);

    // camera + viewmodel
    this.camera.rotation.order = 'YXZ';
    this.camera.rotation.y = this.yaw;
    this.camera.rotation.x = this.pitch;
    this.camera.rotation.z = 0; // kill residual roll left over from the menu lookAt()
    this.camera.position.set(this.pos.x, this.pos.y + EYE, this.pos.z);

    const speed = Math.hypot(this.vel.x, this.vel.z);
    if (this.onGround && speed > 1) this.bobPhase += dt * speed * 1.4;
    const bob = Math.sin(this.bobPhase) * 0.008 * Math.min(1, speed / MAX_SPEED);
    this.recoil = Math.max(0, this.recoil - dt * 3);
    this.viewmodel.position.set(0.26, -0.24 + bob, -0.45 + this.recoil * 0.08);
    this.viewmodel.rotation.x = this.recoil * 0.35;

    if (this.alive && this.firing) this.tryFire();
  }

  updateMovement(dt) {
    // wish direction from keys, rotated by yaw
    let wx = 0, wz = 0;
    if (this.keys.KeyW) wz -= 1;
    if (this.keys.KeyS) wz += 1;
    if (this.keys.KeyA) wx -= 1;
    if (this.keys.KeyD) wx += 1;
    const len = Math.hypot(wx, wz);
    let wishX = 0, wishZ = 0;
    if (len > 0) {
      wx /= len; wz /= len;
      const sin = Math.sin(this.yaw), cos = Math.cos(this.yaw);
      wishX = wx * cos + wz * sin;
      wishZ = -wx * sin + wz * cos;
    }

    if (this.onGround) {
      // friction
      const speed = Math.hypot(this.vel.x, this.vel.z);
      if (speed > 0) {
        const drop = speed * FRICTION * dt;
        const scale = Math.max(0, speed - drop) / speed;
        this.vel.x *= scale;
        this.vel.z *= scale;
      }
    }

    // quake-style acceleration
    const accel = this.onGround ? GROUND_ACCEL : AIR_ACCEL;
    const wishSpeed = this.onGround ? MAX_SPEED : MAX_SPEED * 0.9;
    if (len > 0) {
      const cur = this.vel.x * wishX + this.vel.z * wishZ;
      const add = wishSpeed - cur;
      if (add > 0) {
        const acc = Math.min(accel * MAX_SPEED * dt, add);
        this.vel.x += wishX * acc;
        this.vel.z += wishZ * acc;
      }
    }

    // jump (held space = auto-hop)
    if (this.keys.Space && this.onGround) {
      this.vel.y = JUMP_VEL;
      this.onGround = false;
      this.audio.play('jump');
    }

    this.vel.y -= GRAVITY * dt;

    // integrate with collision
    this.moveHorizontal(0, this.vel.x * dt);
    this.moveHorizontal(2, this.vel.z * dt);
    const falling = this.vel.y <= 0;
    const hitY = this.moveAxis(1, this.vel.y * dt);
    if (hitY) {
      if (falling) {
        if (!this.onGround && this.vel.y < -12) this.audio.play('land');
        this.onGround = true;
      }
      this.vel.y = 0;
    } else if (this.vel.y > 0.5 || this.vel.y < -2) {
      this.onGround = false;
    }

    // jump pads
    for (const pad of JUMP_PADS) {
      const dx = this.pos.x - pad.p[0], dz = this.pos.z - pad.p[2];
      if (dx * dx + dz * dz < pad.r * pad.r && Math.abs(this.pos.y - pad.p[1]) < 0.6) {
        this.vel.set(pad.v[0], pad.v[1], pad.v[2]);
        this.onGround = false;
        this.audio.play('pad');
      }
    }

    // soft body-vs-body collision with other players
    if (this.remotesRef) {
      for (const rp of this.remotesRef.alivePositions()) {
        const dy = this.pos.y - rp.y;
        if (dy > 1.7 || dy < -1.7) continue;
        const dx = this.pos.x - rp.x, dz = this.pos.z - rp.z;
        const d2 = dx * dx + dz * dz, min = 0.78;
        if (d2 < min * min && d2 > 1e-6) {
          const d = Math.sqrt(d2), push = min - d;
          this.pos.x += (dx / d) * push;
          this.pos.z += (dz / d) * push;
        }
      }
    }

    // teleporters
    for (const tp of TELEPORTERS) {
      const dx = this.pos.x - tp.p[0], dz = this.pos.z - tp.p[2];
      if (dx * dx + dz * dz < tp.r * tp.r && Math.abs(this.pos.y - tp.p[1]) < 1.2) {
        this.pos.set(tp.dest[0], tp.dest[1], tp.dest[2]);
        this.vel.set(0, 0, 0);
        this.yaw = tp.yaw;
        this.audio.play('teleport');
        this.effects.teleportFlash();
      }
    }
  }

  // ------------------------------------------------ firing

  tryFire() {
    const w = WEAPONS[this.weapon];
    const now = performance.now() / 1000;
    if (now - (this.lastFire[w.id] ?? 0) < w.rate) return;
    if ((this.ammo[w.ammoType] ?? 0) <= 0) {
      if (now - (this.lastFire.empty ?? 0) > 0.4) { this.audio.play('empty'); this.lastFire.empty = now; }
      return;
    }
    this.lastFire[w.id] = now;
    this.ammo[w.ammoType]--;
    this.recoil = w.id === 0 ? 0.25 : 1;

    const dir = this.forwardDir();
    if (w.spread) {
      dir.x += (Math.random() - 0.5) * w.spread * 2;
      dir.y += (Math.random() - 0.5) * w.spread * 2;
      dir.z += (Math.random() - 0.5) * w.spread * 2;
      dir.normalize();
    }
    const o = this.eye();
    const d = [dir.x, dir.y, dir.z];
    this.onFire(w.id, o, d);

    if (w.key === 'mg' || w.key === 'rg') {
      // visual endpoint: nearest of wall / body along the shot
      const no = [o[0] + d[0] * 0.05, o[1] + d[1] * 0.05, o[2] + d[2] * 0.05];
      const delta = [d[0] * w.range, d[1] * w.range, d[2] * w.range];
      const tWall = raycastWorld(no, delta) ?? 1;
      const body = this.remotesRef?.segmentHit(no, delta);
      const flesh = !!(body && body.t < tWall);
      const end = flesh
        ? body.point
        : [no[0] + delta[0] * tWall, no[1] + delta[1] * tWall, no[2] + delta[2] * tWall];
      if (w.key === 'mg') {
        this.audio.play('mg');
        this.effects.tracerTo(o, d, end, flesh);
        this.effects.muzzleFlash(this.camera);
      } else {
        this.audio.play('rail');
        this.effects.railBeam(o, end, 0x27e0ff, flesh);
      }
    } else if (w.key === 'rl') {
      this.audio.play('rl');
      // local predicted rocket for crisp visuals + instant rocket jumps
      this.localRockets.push({
        pos: new THREE.Vector3(o[0] + d[0] * 0.6, o[1] + d[1] * 0.6 - 0.15, o[2] + d[2] * 0.6),
        dir: new THREE.Vector3(d[0], d[1], d[2]),
        mesh: this.effects.rocketMesh(),
        born: now,
      });
    }
  }

  updateLocalRockets(dt) {
    const w = WEAPONS[1];
    for (let i = this.localRockets.length - 1; i >= 0; i--) {
      const r = this.localRockets[i];
      const delta = r.dir.clone().multiplyScalar(w.speed * dt);
      const prev = [r.pos.x, r.pos.y, r.pos.z];
      // nearest of wall / body — the server owns damage, this is the visual boom
      let t = raycastWorld(prev, [delta.x, delta.y, delta.z]);
      if (t !== null && t > 1) t = null;
      const body = this.remotesRef?.segmentHit(prev, [delta.x, delta.y, delta.z]);
      if (body && (t === null || body.t < t)) t = body.t;
      if (t !== null) {
        const at = r.pos.clone().addScaledVector(delta, t);
        this.effects.rocketTrail(prev, [at.x, at.y, at.z]);
        this.effects.explosion([at.x, at.y, at.z]);
        this.audio.play('boom');
        this.selfKnockback(at, w);
        this.effects.removeRocket(r.mesh);
        this.localRockets.splice(i, 1);
        continue;
      }
      r.pos.add(delta);
      this.effects.rocketTrail(prev, [r.pos.x, r.pos.y, r.pos.z]);
      r.mesh.position.copy(r.pos);
      r.mesh.lookAt(r.pos.clone().add(r.dir));
      if (performance.now() / 1000 - r.born > 6 || r.pos.y < -30) {
        this.effects.removeRocket(r.mesh);
        this.localRockets.splice(i, 1);
      }
    }
  }

  selfKnockback(at, w) {
    const c = new THREE.Vector3(this.pos.x, this.pos.y + 0.9, this.pos.z);
    const d = c.clone().sub(at);
    const dist = d.length();
    if (dist > w.splashRadius) return;
    const falloff = 1 - dist / w.splashRadius;
    d.y += 0.6;
    d.normalize().multiplyScalar(w.knock * falloff);
    this.vel.add(d);
    this.onGround = false;
  }

  applyPush(v) {
    this.vel.x += v[0];
    this.vel.y += v[1];
    this.vel.z += v[2];
    // a real shove breaks ground contact, or friction eats it before the next frame
    if (v[1] > 0.5 || Math.hypot(v[0], v[1], v[2]) > 3) this.onGround = false;
  }
}
