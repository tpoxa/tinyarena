// Builds the Three.js scene from shared map data: geometry, neon edges,
// jump pads, teleporters, pickups, sky. Owns per-frame world animation.

import * as THREE from 'three';
import { BOXES, JUMP_PADS, TELEPORTERS, PICKUPS } from '/shared/map.js';

export class World {
  constructor(scene) {
    this.scene = scene;
    this.time = 0;
    this.pads = [];
    this.pickupMeshes = new Map();

    scene.background = new THREE.Color(0x06070f);
    scene.fog = new THREE.FogExp2(0x0a0c1e, 0.011);

    this.buildLights();
    this.buildGeometry();
    this.buildPads();
    this.buildTeleporters();
    this.buildPickups();
    this.buildSky();
  }

  buildLights() {
    this.scene.add(new THREE.HemisphereLight(0x4a55c0, 0x0a0714, 1.35));
    const dir = new THREE.DirectionalLight(0xaab4ff, 1.1);
    dir.position.set(18, 40, 12);
    this.scene.add(dir);
    const fill = new THREE.PointLight(0x27e0ff, 60, 40);
    fill.position.set(0, 10, 0);
    this.scene.add(fill);
  }

  gridTexture() {
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const g = c.getContext('2d');
    g.fillStyle = '#14162a';
    g.fillRect(0, 0, 256, 256);
    g.strokeStyle = 'rgba(91,108,255,0.28)';
    g.lineWidth = 2;
    g.strokeRect(0, 0, 256, 256);
    g.strokeStyle = 'rgba(91,108,255,0.10)';
    for (let i = 64; i < 256; i += 64) {
      g.beginPath(); g.moveTo(i, 0); g.lineTo(i, 256); g.stroke();
      g.beginPath(); g.moveTo(0, i); g.lineTo(256, i); g.stroke();
    }
    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    return tex;
  }

  buildGeometry() {
    const gridTex = this.gridTexture();
    BOXES.forEach((b, idx) => {
      const geo = new THREE.BoxGeometry(...b.s);
      let mat;
      if (idx === 0) {
        const tex = gridTex.clone();
        tex.repeat.set(b.s[0] / 4, b.s[2] / 4);
        mat = new THREE.MeshLambertMaterial({ map: tex });
      } else {
        mat = new THREE.MeshLambertMaterial({ color: b.c });
      }
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(...b.p);
      this.scene.add(mesh);

      const edges = new THREE.LineSegments(
        new THREE.EdgesGeometry(geo),
        new THREE.LineBasicMaterial({ color: b.e, transparent: true, opacity: 0.8 }),
      );
      edges.position.copy(mesh.position);
      this.scene.add(edges);
    });
  }

  buildPads() {
    for (const pad of JUMP_PADS) {
      const disc = new THREE.Mesh(
        new THREE.CylinderGeometry(pad.r, pad.r * 1.15, 0.16, 24),
        new THREE.MeshBasicMaterial({ color: 0x27e0ff, transparent: true, opacity: 0.85 }),
      );
      disc.position.set(pad.p[0], pad.p[1] + 0.08, pad.p[2]);
      this.scene.add(disc);

      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(pad.r, 0.06, 8, 32),
        new THREE.MeshBasicMaterial({ color: 0x9be8ff }),
      );
      ring.rotation.x = Math.PI / 2;
      ring.position.copy(disc.position);
      this.scene.add(ring);
      this.pads.push({ disc, ring, base: disc.position.y });
    }
  }

  buildTeleporters() {
    for (const tp of TELEPORTERS) {
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(tp.r, 0.09, 10, 40),
        new THREE.MeshBasicMaterial({ color: 0xff3df0 }),
      );
      ring.rotation.x = Math.PI / 2;
      ring.position.set(tp.p[0], tp.p[1] + 0.12, tp.p[2]);
      this.scene.add(ring);

      const beam = new THREE.Mesh(
        new THREE.CylinderGeometry(tp.r * 0.7, tp.r * 0.7, 3.2, 20, 1, true),
        new THREE.MeshBasicMaterial({ color: 0xff3df0, transparent: true, opacity: 0.16, side: THREE.DoubleSide }),
      );
      beam.position.set(tp.p[0], tp.p[1] + 1.7, tp.p[2]);
      this.scene.add(beam);
      this.pads.push({ disc: ring, ring: beam, base: ring.position.y, tp: true });
    }
  }

  pickupMesh(type) {
    const g = new THREE.Group();
    if (type === 'mega' || type === 'hp25') {
      const color = type === 'mega' ? 0xff3df0 : 0xffb43d;
      const size = type === 'mega' ? 0.85 : 0.55;
      const mat = new THREE.MeshBasicMaterial({ color });
      const a = new THREE.Mesh(new THREE.BoxGeometry(size, size * 0.34, size * 0.34), mat);
      const b = new THREE.Mesh(new THREE.BoxGeometry(size * 0.34, size, size * 0.34), mat);
      g.add(a, b);
    } else if (type === 'armor50') {
      g.add(new THREE.Mesh(
        new THREE.OctahedronGeometry(0.45),
        new THREE.MeshBasicMaterial({ color: 0x7dff3d, wireframe: false }),
      ));
      g.add(new THREE.Mesh(
        new THREE.OctahedronGeometry(0.58),
        new THREE.MeshBasicMaterial({ color: 0x7dff3d, wireframe: true, transparent: true, opacity: 0.5 }),
      ));
    } else {
      const color = type === 'rockets' ? 0xff4b2e : type === 'slugs' ? 0x27e0ff : 0xffe83d;
      g.add(new THREE.Mesh(
        new THREE.BoxGeometry(0.5, 0.35, 0.5),
        new THREE.MeshLambertMaterial({ color, emissive: color, emissiveIntensity: 0.45 }),
      ));
      g.add(new THREE.Mesh(
        new THREE.BoxGeometry(0.62, 0.1, 0.62),
        new THREE.MeshBasicMaterial({ color }),
      ));
    }
    return g;
  }

  buildPickups() {
    for (const pk of PICKUPS) {
      const mesh = this.pickupMesh(pk.type);
      mesh.position.set(...pk.p);
      this.scene.add(mesh);
      this.pickupMeshes.set(pk.id, { mesh, base: pk.p[1], active: true });
    }
  }

  setPickupActive(id, active) {
    const pk = this.pickupMeshes.get(id);
    if (pk) { pk.active = active; pk.mesh.visible = active; }
  }

  buildSky() {
    const starGeo = new THREE.BufferGeometry();
    const n = 1600;
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const r = 220 + Math.random() * 160;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      pos[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      pos[i * 3 + 1] = Math.abs(r * Math.cos(phi)) - 40;
      pos[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
    }
    starGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const stars = new THREE.Points(starGeo, new THREE.PointsMaterial({
      color: 0x9ba8ff, size: 0.7, sizeAttenuation: false, transparent: true, opacity: 0.8,
    }));
    this.scene.add(stars);
  }

  update(dt) {
    this.time += dt;
    for (const p of this.pads) {
      const s = 1 + Math.sin(this.time * (p.tp ? 2.2 : 4)) * 0.07;
      p.ring.scale.setScalar?.(s);
      if (!p.tp) p.disc.position.y = p.base + Math.sin(this.time * 4) * 0.03;
    }
    for (const pk of this.pickupMeshes.values()) {
      if (!pk.active) continue;
      pk.mesh.rotation.y += dt * 1.8;
      pk.mesh.position.y = pk.base + Math.sin(this.time * 2.4) * 0.12;
    }
  }
}
