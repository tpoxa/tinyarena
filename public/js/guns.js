// Weapon model factory — three distinct silhouettes, barrel along -z.
// Used by the first-person viewmodel and by remote player droids.

import * as THREE from 'three';

const DARK = 0x11132a;
const STEEL = 0x2a2e55;

function lambert(color) { return new THREE.MeshLambertMaterial({ color }); }
function glow(color) { return new THREE.MeshBasicMaterial({ color }); }

function machinegun() {
  const g = new THREE.Group();
  const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.13, 0.36), lambert(STEEL));
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.024, 0.34, 10), lambert(DARK));
  barrel.rotation.x = Math.PI / 2;
  barrel.position.set(0, 0.02, -0.34);
  const brake = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.07), lambert(STEEL));
  brake.position.set(0, 0.02, -0.5);
  const mag = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.16, 0.09), lambert(DARK));
  mag.position.set(0, -0.13, 0.02);
  mag.rotation.x = 0.12;
  const rail = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.03, 0.22), lambert(DARK));
  rail.position.set(0, 0.085, -0.06);
  const strip = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.03, 0.24), glow(0x27e0ff));
  strip.position.set(0.052, 0.01, -0.04);
  const strip2 = strip.clone();
  strip2.position.x = -0.052;
  g.add(receiver, barrel, brake, mag, rail, strip, strip2);
  return g;
}

function rocketLauncher() {
  const g = new THREE.Group();
  const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.075, 0.52, 12), lambert(STEEL));
  tube.rotation.x = Math.PI / 2;
  tube.position.z = -0.1;
  const muzzle = new THREE.Mesh(new THREE.TorusGeometry(0.075, 0.02, 8, 16), glow(0xff9a3d));
  muzzle.position.z = -0.37;
  const rear = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.14, 0.16), lambert(DARK));
  rear.position.set(0, -0.02, 0.2);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.078, 0.014, 8, 16), lambert(DARK));
  ring.position.z = -0.16;
  const sight = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.06, 0.02), glow(0xff4b2e));
  sight.position.set(0, 0.11, -0.05);
  g.add(tube, muzzle, rear, ring, sight);
  return g;
}

function railgun() {
  const g = new THREE.Group();
  const stock = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.12, 0.24), lambert(STEEL));
  stock.position.z = 0.16;
  const core = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.64, 8), glow(0x3dffc8));
  core.rotation.x = Math.PI / 2;
  core.position.z = -0.24;
  const shroud = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.5, 8, 1, true), lambert(DARK));
  shroud.rotation.x = Math.PI / 2;
  shroud.position.z = -0.18;
  g.add(stock, core, shroud);
  for (let i = 0; i < 3; i++) {
    const coil = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.016, 8, 14), glow(0x27e0ff));
    coil.position.z = -0.1 - i * 0.18;
    g.add(coil);
  }
  return g;
}

export function makeGun(weaponId) {
  const g = weaponId === 1 ? rocketLauncher() : weaponId === 2 ? railgun() : machinegun();
  const grip = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.14, 0.07), lambert(DARK));
  grip.position.set(0, -0.12, 0.1);
  grip.rotation.x = -0.25;
  g.add(grip);
  return g;
}
