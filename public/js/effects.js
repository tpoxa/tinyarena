// Transient visuals: tracers, rail beams, explosions, muzzle flashes, rockets.

import * as THREE from 'three';

export class Effects {
  constructor(scene) {
    this.scene = scene;
    this.items = []; // { obj, ttl, age, update? }
    this.shake = 0;
  }

  add(obj, ttl, update) {
    this.scene.add(obj);
    this.items.push({ obj, ttl, age: 0, update });
  }

  beamBetween(a, b, radius, color, ttl, opacity = 1) {
    const av = new THREE.Vector3(...a), bv = new THREE.Vector3(...b);
    const len = av.distanceTo(bv);
    if (len < 0.01) return;
    const geo = new THREE.CylinderGeometry(radius, radius, len, 6, 1, true);
    geo.rotateX(Math.PI / 2);
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.copy(av).add(bv).multiplyScalar(0.5);
    mesh.lookAt(bv);
    this.add(mesh, ttl, (it, k) => { mat.opacity = opacity * (1 - k); });
  }

  tracerTo(o, d, end, flesh) {
    const start = [o[0] + d[0] * 1.2, o[1] + d[1] * 1.2 - 0.12, o[2] + d[2] * 1.2];
    this.beamBetween(start, end, 0.016, 0xffe83d, 0.07, 0.75);
    this.impactSpark(end, flesh ? 0xff3d5e : 0xffb43d, flesh ? 0.4 : 0.24);
  }

  railBeam(o, end, color, flesh = false) {
    const start = [o[0], o[1] - 0.12, o[2]];
    this.beamBetween(start, end, 0.035, color, 0.5, 0.95);
    this.beamBetween(start, end, 0.1, color, 0.35, 0.25);
    this.impactSpark(end, flesh ? 0xff3d5e : color, 0.5);
  }

  impactSpark(p, color, size) {
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9 });
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(size * 0.4, 8, 6), mat);
    mesh.position.set(...p);
    this.add(mesh, 0.18, (it, k) => {
      mesh.scale.setScalar(1 + k * 2.4);
      mat.opacity = 0.9 * (1 - k);
    });
  }

  explosion(p) {
    const core = new THREE.Mesh(
      new THREE.SphereGeometry(0.5, 14, 10),
      new THREE.MeshBasicMaterial({ color: 0xffd23d, transparent: true, opacity: 1 }),
    );
    core.position.set(...p);
    this.add(core, 0.45, (it, k) => {
      core.scale.setScalar(1 + k * 7);
      core.material.opacity = 1 - k;
      core.material.color.setHSL(0.09 - k * 0.06, 1, 0.6 - k * 0.25);
    });

    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.5, 0.07, 8, 28),
      new THREE.MeshBasicMaterial({ color: 0xff4b2e, transparent: true, opacity: 0.9 }),
    );
    ring.position.set(...p);
    ring.rotation.x = Math.PI / 2;
    this.add(ring, 0.5, (it, k) => {
      ring.scale.setScalar(1 + k * 9);
      ring.material.opacity = 0.9 * (1 - k);
    });

    const light = new THREE.PointLight(0xff7b3d, 120, 18);
    light.position.set(p[0], p[1] + 0.4, p[2]);
    this.add(light, 0.35, (it, k) => { light.intensity = 120 * (1 - k); });
    this.shake = Math.min(1, this.shake + 0.5);
  }

  muzzleFlash(camera) {
    const light = new THREE.PointLight(0xffd23d, 14, 7);
    light.position.set(0.24, -0.16, -0.7);
    camera.add(light);
    this.items.push({
      obj: light, ttl: 0.05, age: 0,
      update: (it, k) => { light.intensity = 14 * (1 - k); },
      parent: camera,
    });
  }

  teleportFlash() {
    document.body.classList.remove('frag-flash');
    void document.body.offsetWidth;
    document.body.classList.add('frag-flash');
  }

  rocketMesh() {
    const g = new THREE.Group();
    const body = new THREE.Mesh(
      new THREE.CylinderGeometry(0.09, 0.13, 0.5, 8),
      new THREE.MeshBasicMaterial({ color: 0xffb43d }),
    );
    body.rotation.x = Math.PI / 2;
    const flame = new THREE.Mesh(
      new THREE.ConeGeometry(0.15, 0.6, 8),
      new THREE.MeshBasicMaterial({ color: 0xff7b2e, transparent: true, opacity: 0.95 }),
    );
    flame.rotation.x = -Math.PI / 2;
    flame.position.z = 0.5;
    const light = new THREE.PointLight(0xff9a3d, 22, 7); // dynamic lights are the fps killer
    g.add(body, flame, light);
    this.scene.add(g);
    return g;
  }

  // short-lived glowing segment behind a moving rocket — makes its path readable
  rocketTrail(a, b) {
    this.beamBetween(a, b, 0.03, 0xff9a3d, 0.25, 0.45);
  }

  removeRocket(mesh) {
    this.scene.remove(mesh);
  }

  deathBurst(p, colorHex, kick) {
    const color = new THREE.Color(colorHex);
    for (let i = 0; i < 18; i++) {
      const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.95 });
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.14, 0.14), mat);
      m.position.set(p[0], p[1] + 0.9, p[2]);
      const kb = 0.6 + Math.random() * 0.6; // cubes ride the killing blow
      const v = new THREE.Vector3(
        (Math.random() - 0.5) * 9 + (kick?.[0] ?? 0) * kb,
        Math.random() * 7 + 2 + Math.max(0, kick?.[1] ?? 0) * kb,
        (Math.random() - 0.5) * 9 + (kick?.[2] ?? 0) * kb,
      );
      this.add(m, 1.1, (it, k, dt) => {
        v.y -= 22 * dt;
        m.position.addScaledVector(v, dt);
        m.rotation.x += dt * 9;
        m.rotation.y += dt * 7;
        mat.opacity = 0.95 * (1 - k);
      });
    }
  }

  update(dt, camera) {
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i];
      it.age += dt;
      const k = Math.min(1, it.age / it.ttl);
      it.update?.(it, k, dt);
      if (it.age >= it.ttl) {
        (it.parent ?? this.scene).remove(it.obj);
        this.items.splice(i, 1);
      }
    }
    // camera shake decay
    if (this.shake > 0.001) {
      camera.position.x += (Math.random() - 0.5) * 0.06 * this.shake;
      camera.position.y += (Math.random() - 0.5) * 0.06 * this.shake;
      this.shake *= Math.max(0, 1 - dt * 6);
    }
  }
}
