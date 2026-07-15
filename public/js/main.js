// TINY ARENA — entry point. Wires renderer, world, player, net, HUD together.

import * as THREE from 'three';
import { World } from '/js/world.js';
import { LocalPlayer } from '/js/player.js';
import { Remotes } from '/js/remotes.js';
import { Effects } from '/js/effects.js';
import { Hud } from '/js/hud.js';
import { AudioEngine } from '/js/audio.js';
import { Net } from '/js/net.js';
import { MODELS, buildModel } from '/js/models.js';
import { PICKUP_DEFS, PICKUPS } from '/shared/map.js';

const canvas = document.getElementById('game');
// laptop-friendly: 1.5x pixel cap + 60fps cap do the thermal work; MSAA stays on
// (it is cheap on tiled GPUs and the neon edge lines shimmer badly without it)
const PIXEL_RATIO = Math.min(window.devicePixelRatio, 1.5);
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(PIXEL_RATIO);
renderer.setSize(window.innerWidth, window.innerHeight);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(92, window.innerWidth / window.innerHeight, 0.05, 600);
scene.add(camera);

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

const world = new World(scene);
const effects = new Effects(scene);
const audio = new AudioEngine();
const hud = new Hud();
const net = new Net();
const remotes = new Remotes(scene, effects, audio);

const player = new LocalPlayer(camera, effects, audio, (w, o, d) => {
  net.send({ t: 'fire', w, o, d });
});
player.remotesRef = remotes;

// pre-join camera: slow orbit over the arena
let joined = false;
let orbitT = 0;

const roster = new Map(); // id -> public info (mine included), for scoreboard

function playerName(id) {
  return roster.get(id)?.name ?? '???';
}

// ------------------------------------------------ net events

net.on('pjoin', (msg) => {
  roster.set(msg.player.id, msg.player);
  remotes.addPlayer(msg.player);
  hud.centerMessage(`${msg.player.name.toUpperCase()} ENTERED THE ARENA`);
});

net.on('pleave', (msg) => {
  roster.delete(msg.id);
  remotes.removePlayer(msg.id);
});

let quadOn = false;
let prevTl = Infinity;

net.on('snap', (msg) => {
  remotes.onSnapshot(msg);
  if (typeof msg.tl === 'number') {
    hud.setClock(msg.tl);
    if (msg.tl <= 5 && msg.tl > 0 && msg.tl < prevTl) audio.play('tick');
    prevTl = msg.tl;
  }
  for (const s of msg.players) {
    const info = roster.get(s.i);
    if (info) { info.frags = s.f; info.deaths = s.dt; info.dead = !!s.d; }
  }
  if (msg.you) {
    player.ammo = { ...msg.you.ammo };
    hud.setStats(msg.you.hp, msg.you.ar, player.ammo, player.weapon);
    const q = msg.you.quad ?? 0;
    hud.setQuad(q);
    if ((q > 0) !== quadOn) {
      quadOn = q > 0;
      document.body.classList.toggle('quad-active', quadOn);
      audio.setQuadHum(quadOn);
      if (quadOn) audio.play('quad');
    }
  }
});

net.on('streak', (msg) => {
  if (msg.id === net.myId) {
    hud.streakBanner(msg.label, msg.n);
    audio.streak(msg.n, true);
  } else {
    hud.centerMessage(`${msg.name.toUpperCase()} — ${msg.label}`);
    audio.streak(msg.n, false);
  }
});

net.on('spawn', (msg) => {
  if (msg.id === net.myId) {
    player.spawn(msg.p, msg.yaw);
    hud.hideDeath();
    hud.centerMessage('FIGHT!');
    audio.play('switch');
  }
});

net.on('die', (msg) => {
  if (msg.victim !== net.myId) remotes.killBurst(msg.victim, msg.kv);
  const killer = playerName(msg.killer);
  const victim = playerName(msg.victim);
  const suicide = msg.killer === msg.victim;
  const voidDeath = suicide && msg.w === -1; // weapon -1 = fell out of the world
  hud.killRow(voidDeath ? 'THE VOID' : killer, victim, msg.w,
    msg.killer === net.myId || msg.victim === net.myId, suicide && !voidDeath);
  if (msg.victim === net.myId) {
    player.die();
    if (!voidDeath) {
      effects.deathBurst(
        [player.pos.x, player.pos.y, player.pos.z],
        roster.get(net.myId)?.color ?? '#5b6cff',
        msg.kv,
      );
    }
    audio.play('die');
    hud.showDeath(suicide ? null : killer, msg.w, voidDeath);
  } else if (msg.killer === net.myId) {
    audio.play('frag');
    hud.centerMessage(`YOU FRAGGED ${victim.toUpperCase()}`);
    document.body.classList.remove('frag-flash');
    void document.body.offsetWidth;
    document.body.classList.add('frag-flash');
  }
});

net.on('hit', () => { hud.hitmark(); audio.play('hit'); });

net.on('dmg', (msg) => {
  hud.damageFlash(Math.min(1, msg.amount / 60));
  effects.shake = Math.min(1, effects.shake + msg.amount / 120); // feel the hit
  audio.play('hurt');
});

net.on('push', (msg) => player.applyPush(msg.v));

net.on('shot', (msg) => {
  if (msg.id === net.myId) return;
  const w = msg.w;
  if (w === 2) {
    effects.railBeam(msg.o, msg.e, 0x27e0ff);
    audio.playAt('rail', msg.o, player.pos, 70);
  } else {
    effects.beamBetween(msg.o, msg.e, 0.016, 0xffe83d, 0.07, 0.6);
    effects.impactSpark(msg.e, 0xffb43d, 0.2);
    audio.playAt('mg', msg.o, player.pos);
  }
});

net.on('boom', (msg) => {
  if (msg.owner === net.myId) return; // own rockets explode via local sim
  effects.explosion(msg.p);
  audio.playAt('boom', msg.p, player.pos, 60);
});

net.on('pickup', (msg) => {
  world.setPickupActive(msg.id, msg.active);
  if (!msg.active && msg.by === net.myId) {
    const def = PICKUP_DEFS[PICKUPS.find(p => p.id === msg.id)?.type];
    hud.pickupMessage(msg.label ?? 'PICKED UP');
    if (def?.buff !== 'quad') audio.play(def?.overheal ? 'mega' : 'pickup'); // quad has its own fanfare
  }
});

net.on('win', (msg) => {
  hud.showWin(msg.name, !!msg.timeup);
  audio.play('win');
  player.die();
});

net.on('reset', () => {
  hud.hideWin();
  hud.hideDeath();
  hud.setScoreboardVisible(false);
});

net.on('note', (msg) => hud.centerMessage(msg.msg));

net.on('disconnect', () => {
  document.getElementById('join-status').textContent = 'DISCONNECTED — REFRESH TO REJOIN';
  document.getElementById('join').classList.remove('hidden');
  joined = false;
});

// ------------------------------------------------ model picker

const mpRenderer = new THREE.WebGLRenderer({
  canvas: document.getElementById('model-preview'), antialias: true, alpha: true,
});
mpRenderer.setPixelRatio(PIXEL_RATIO);
mpRenderer.setSize(200, 200, false);
const mpScene = new THREE.Scene();
mpScene.add(new THREE.HemisphereLight(0x6a78d8, 0x1a1638, 2.6));
const mpDir = new THREE.DirectionalLight(0xc4ccff, 2.2);
mpDir.position.set(3, 6, 4);
mpScene.add(mpDir);
const mpCam = new THREE.PerspectiveCamera(40, 1, 0.1, 20);
mpCam.position.set(0, 1.35, 3.2);
mpCam.lookAt(0, 0.8, 0);

let modelIdx = Math.max(0, MODELS.findIndex((m) => m.id === localStorage.getItem('ta-model')));
let mpMesh = null;

function setModel(i) {
  modelIdx = (i + MODELS.length) % MODELS.length;
  localStorage.setItem('ta-model', MODELS[modelIdx].id);
  document.getElementById('model-name').textContent = MODELS[modelIdx].name;
  if (mpMesh) mpScene.remove(mpMesh);
  mpMesh = buildModel(MODELS[modelIdx].id, '#27e0ff');
  mpMesh.rotation.y = Math.PI; // face the camera first
  mpScene.add(mpMesh);
}
setModel(modelIdx);
document.getElementById('model-prev').addEventListener('click', () => setModel(modelIdx - 1));
document.getElementById('model-next').addEventListener('click', () => setModel(modelIdx + 1));

// ------------------------------------------------ join flow

const joinForm = document.getElementById('join-form');
const joinName = document.getElementById('join-name');
joinName.value = localStorage.getItem('ta-name') ?? '';

joinForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (joined) return;
  const name = joinName.value.trim() || 'PLAYER';
  localStorage.setItem('ta-name', name);
  document.getElementById('join-status').textContent = 'CONNECTING…';
  try {
    const welcome = await net.connect(name, MODELS[modelIdx].id);
    joined = true;
    remotes.myId = net.myId;
    roster.set(net.myId, { id: net.myId, name: welcome.name, color: welcome.color, bot: false, frags: 0, deaths: 0 });
    const nameEl = document.getElementById('hud-name');
    nameEl.textContent = welcome.name;
    nameEl.style.color = welcome.color;
    for (const p of welcome.players) {
      if (p.id === net.myId) continue;
      roster.set(p.id, p);
      remotes.addPlayer(p);
    }
    for (const pk of welcome.pickups) world.setPickupActive(pk.id, pk.active);
    document.getElementById('sb-limit').textContent = welcome.fragLimit;
    if (welcome.map) document.getElementById('sb-map').textContent = welcome.map.toUpperCase().replace('-', ' ');
    hud.show();
    audio.ensure();
    net.startLoops(player);
    lockPointer();
  } catch (err) {
    document.getElementById('join-status').textContent = `CONNECTION FAILED: ${err.message}`;
  }
});

function lockPointer() {
  try { canvas.requestPointerLock()?.catch?.(() => {}); } catch { /* headless / unsupported */ }
}

canvas.addEventListener('click', () => {
  if (joined && document.pointerLockElement === null) lockPointer();
});

window.addEventListener('keydown', (e) => {
  if (!joined) return;
  if (e.code === 'Tab') { e.preventDefault(); hud.setScoreboardVisible(true); }
  else if (e.code === 'KeyB') net.send({ t: 'addbot' });
  else if (e.code === 'KeyN') net.send({ t: 'kickbot' });
});
window.addEventListener('keyup', (e) => {
  if (e.code === 'Tab') hud.setScoreboardVisible(false);
});

// ------------------------------------------------ main loop

let last = performance.now();
let fps = 60;
const FRAME_MIN = 1000 / 62; // render cap ~60fps — keeps 120Hz laptops cool
let lowPerf = false;
let lowSince = null;
let renderMs = 0;

function loop(now) {
  requestAnimationFrame(loop);
  if (now - last < FRAME_MIN - 0.5) return;
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  fps = fps * 0.95 + (1 / Math.max(1e-3, dt)) * 0.05;

  world.update(dt);
  hud.update(dt);

  if (!joined) {
    // menu orbit cam + model preview
    orbitT += dt * 0.08;
    camera.position.set(Math.sin(orbitT) * 34, 16, Math.cos(orbitT) * 34);
    camera.lookAt(0, 2, 0);
    if (mpMesh) {
      mpMesh.rotation.y += dt * 1.1;
      mpRenderer.render(mpScene, mpCam);
    }
  } else {
    player.update(dt, true);
    if (player.alive) {
      const f = player.forwardDir();
      remotes.update(dt, player.eye(), [f.x, f.y, f.z]);
    } else {
      remotes.update(dt);
    }
    hud.updateScoreboard([...roster.values()], net.myId);
    hud.setMeta(net.ping, fps);

    // GPU-bound (thermal throttle, weak GPU): drop render resolution once.
    // High render time distinguishes this from the OS rationing frames on battery.
    if (!lowPerf) {
      lowSince = (fps < 45 && renderMs > 12) ? (lowSince ?? now) : null;
      if (lowSince && now - lowSince > 4000) {
        lowPerf = true;
        renderer.setPixelRatio(1);
        renderer.setSize(window.innerWidth, window.innerHeight);
        hud.centerMessage('PERFORMANCE MODE');
      }
    }
  }

  effects.update(dt, camera);
  const r0 = performance.now();
  renderer.render(scene, camera);
  renderMs = renderMs * 0.9 + (performance.now() - r0) * 0.1;
}

requestAnimationFrame(loop);
