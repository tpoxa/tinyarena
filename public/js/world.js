// Builds the Three.js scene from shared map data: geometry, neon edges,
// jump pads, teleporters, pickups, sky. Owns per-frame world animation.

import * as THREE from 'three';
import { BOXES, JUMP_PADS, TELEPORTERS, PICKUPS } from '/shared/map.js';

export class World {
  constructor(scene) {
    this.scene = scene;
    this.root = new THREE.Group(); // everything world-owned — swapped on map change
    scene.add(this.root);
    this.time = 0;
    this.pads = [];
    this.pickupMeshes = new Map();
    this.edgeMats = [];
    this.beamMats = [];

    scene.background = new THREE.Color(0x06070f);
    scene.fog = new THREE.FogExp2(0x0a0c1e, 0.011);

    this.buildLights();
    this.buildGeometry();
    this.buildPads();
    this.buildTeleporters();
    this.buildPickups();
    this.buildSky();
    this.buildOutlands();
  }

  buildLights() {
    this.root.add(new THREE.HemisphereLight(0x4a55c0, 0x0a0714, 1.35));
    const dir = new THREE.DirectionalLight(0xaab4ff, 1.1);
    dir.position.set(18, 40, 12);
    this.root.add(dir);
    const fill = new THREE.PointLight(0x27e0ff, 60, 40);
    fill.position.set(0, 10, 0);
    this.root.add(fill);
  }

  gridTexture() {
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const g = c.getContext('2d');
    g.fillStyle = '#0b0e20';
    g.fillRect(0, 0, 256, 256);
    // tron light-grid: hot cyan cell border with a soft halo
    g.shadowColor = 'rgba(39,224,255,0.9)';
    g.shadowBlur = 10;
    g.strokeStyle = 'rgba(39,224,255,0.5)';
    g.lineWidth = 2.5;
    g.strokeRect(1, 1, 254, 254);
    g.shadowBlur = 0;
    g.strokeStyle = 'rgba(39,224,255,0.13)';
    g.lineWidth = 1;
    for (let i = 64; i < 256; i += 64) {
      g.beginPath(); g.moveTo(i, 0); g.lineTo(i, 256); g.stroke();
      g.beginPath(); g.moveTo(0, i); g.lineTo(256, i); g.stroke();
    }
    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.anisotropy = 8; // keep grid lines crisp at grazing angles
    return tex;
  }

  buildGeometry() {
    const gridTex = this.gridTexture();
    BOXES.forEach((b, idx) => {
      const geo = new THREE.BoxGeometry(...b.s);
      let mat;
      if (b.p[1] < 0) { // ground-level slabs get the light-grid, whatever the map
        const tex = gridTex.clone();
        tex.repeat.set(b.s[0] / 4, b.s[2] / 4);
        mat = new THREE.MeshLambertMaterial({ map: tex });
      } else {
        mat = new THREE.MeshLambertMaterial({ color: b.c });
      }
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(...b.p);
      this.root.add(mesh);

      const edgeMat = new THREE.LineBasicMaterial({
        color: b.e, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false,
      });
      const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geo), edgeMat);
      edges.position.copy(mesh.position);
      edges.scale.setScalar(1.002); // sit just off the faces — no z-fighting
      this.root.add(edges);
      this.edgeMats.push({ mat: edgeMat, phase: idx * 0.9 });

      // tall slim boxes are the corner pillars — give them recognizer sky-beams
      if (b.s[1] >= 5 && b.s[0] <= 3) {
        const beamMat = new THREE.MeshBasicMaterial({
          color: b.e, transparent: true, opacity: 0.05,
          blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
        });
        const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.7, 70, 12, 1, true), beamMat);
        beam.position.set(b.p[0], b.p[1] + b.s[1] / 2 + 35, b.p[2]);
        this.root.add(beam);
        this.beamMats.push({ mat: beamMat, base: 0.05, phase: idx });
      }
    });
  }

  buildPads() {
    for (const pad of JUMP_PADS) {
      const disc = new THREE.Mesh(
        new THREE.CylinderGeometry(pad.r, pad.r * 1.15, 0.16, 24),
        new THREE.MeshBasicMaterial({ color: 0x27e0ff, transparent: true, opacity: 0.85 }),
      );
      disc.position.set(pad.p[0], pad.p[1] + 0.08, pad.p[2]);
      this.root.add(disc);

      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(pad.r, 0.06, 8, 32),
        new THREE.MeshBasicMaterial({ color: 0x9be8ff }),
      );
      ring.rotation.x = Math.PI / 2;
      ring.position.copy(disc.position);
      this.root.add(ring);
      this.pads.push({ disc, ring, base: disc.position.y });

      // launch column: soft light shaft rising off the pad
      const colMat = new THREE.MeshBasicMaterial({
        color: 0x27e0ff, transparent: true, opacity: 0.07,
        blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
      });
      const col = new THREE.Mesh(new THREE.CylinderGeometry(pad.r * 0.8, pad.r, 5.5, 18, 1, true), colMat);
      col.position.set(pad.p[0], pad.p[1] + 2.8, pad.p[2]);
      this.root.add(col);
      this.beamMats.push({ mat: colMat, base: 0.07, phase: pad.p[0] + pad.p[2] });
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
      this.root.add(ring);

      const beam = new THREE.Mesh(
        new THREE.CylinderGeometry(tp.r * 0.7, tp.r * 0.7, 3.2, 20, 1, true),
        new THREE.MeshBasicMaterial({ color: 0xff3df0, transparent: true, opacity: 0.16, side: THREE.DoubleSide }),
      );
      beam.position.set(tp.p[0], tp.p[1] + 1.7, tp.p[2]);
      this.root.add(beam);
      this.pads.push({ disc: ring, ring: beam, base: ring.position.y, tp: true });
    }
  }

  pickupMesh(type) {
    const g = new THREE.Group();
    if (type === 'quad') {
      // electric-blue core in a counter-spinning wire shell
      const core = new THREE.Mesh(
        new THREE.BoxGeometry(0.42, 0.42, 0.42),
        new THREE.MeshBasicMaterial({ color: 0xbfe0ff }),
      );
      const shell = new THREE.Mesh(
        new THREE.BoxGeometry(0.8, 0.8, 0.8),
        new THREE.MeshBasicMaterial({
          color: 0x5b9bff, wireframe: true, transparent: true, opacity: 0.9,
          blending: THREE.AdditiveBlending, depthWrite: false,
        }),
      );
      const light = new THREE.PointLight(0x6ba8ff, 26, 12);
      light.position.y = 0.2;
      g.add(core, shell, light);
      g.userData.quadShell = shell;
    } else if (type === 'mega' || type === 'hp25') {
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
      this.root.add(mesh);
      this.pickupMeshes.set(pk.id, { mesh, base: pk.p[1], active: true });
    }
  }

  setPickupActive(id, active) {
    const pk = this.pickupMeshes.get(id);
    if (pk) { pk.active = active; pk.mesh.visible = active; }
  }

  buildOutlands() {
    // infinite data-plane under the arena — visible over every ledge and on the way down
    const grid = new THREE.GridHelper(700, 70, 0x27e0ff, 0x2a3480);
    grid.position.y = -19;
    for (const m of grid.material instanceof Array ? grid.material : [grid.material]) {
      m.transparent = true;
      m.opacity = 0.33;
      m.blending = THREE.AdditiveBlending;
      m.depthWrite = false;
      m.fog = false;
    }
    this.root.add(grid);
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
    this.root.add(stars);
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
      const shell = pk.mesh.userData.quadShell;
      if (shell) {
        shell.rotation.x += dt * 1.3;
        shell.rotation.z -= dt * 0.9;
        shell.scale.setScalar(1 + Math.sin(this.time * 5) * 0.08);
      }
    }
    // slow energy wave around the arena edges; beams breathe
    for (const e of this.edgeMats) {
      e.mat.opacity = 0.62 + Math.sin(this.time * 1.6 + e.phase) * 0.25;
    }
    for (const b of this.beamMats) {
      b.mat.opacity = b.base * (1 + Math.sin(this.time * 2.1 + b.phase) * 0.45);
    }
  }

  dispose() {
    this.scene.remove(this.root);
    this.root.traverse((o) => {
      o.geometry?.dispose?.();
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of mats) { m?.map?.dispose?.(); m?.dispose?.(); }
    });
  }
}
