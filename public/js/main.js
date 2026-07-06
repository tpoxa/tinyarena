// TINY ARENA — entry point. Wires renderer, world, player, net, HUD together.

import * as THREE from 'three';
import { World } from '/js/world.js';
import { LocalPlayer } from '/js/player.js';
import { Remotes } from '/js/remotes.js';
import { Effects } from '/js/effects.js';
import { Hud } from '/js/hud.js';
import { AudioEngine } from '/js/audio.js';
import { Net } from '/js/net.js';
import { PICKUP_DEFS, PICKUPS } from '/shared/map.js';

const canvas = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
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

net.on('snap', (msg) => {
  remotes.onSnapshot(msg);
  for (const s of msg.players) {
    const info = roster.get(s.i);
    if (info) { info.frags = s.f; info.deaths = s.dt; info.dead = !!s.d; }
  }
  if (msg.you) {
    player.ammo = { ...msg.you.ammo };
    hud.setStats(msg.you.hp, msg.you.ar, player.ammo, player.weapon);
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
  const killer = playerName(msg.killer);
  const victim = playerName(msg.victim);
  const suicide = msg.killer === msg.victim;
  hud.killRow(suicide ? 'THE VOID' : killer, victim, msg.w, msg.killer === net.myId || msg.victim === net.myId);
  if (msg.victim === net.myId) {
    player.die();
    audio.play('die');
    hud.showDeath(suicide ? null : killer);
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
    audio.play(def?.overheal ? 'mega' : 'pickup');
  }
});

net.on('win', (msg) => {
  hud.showWin(msg.name);
  audio.play('win');
  player.die();
});

net.on('reset', () => {
  hud.hideWin();
  hud.hideDeath();
});

net.on('disconnect', () => {
  document.getElementById('join-status').textContent = 'DISCONNECTED — REFRESH TO REJOIN';
  document.getElementById('join').classList.remove('hidden');
  joined = false;
});

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
    const welcome = await net.connect(name);
    joined = true;
    remotes.myId = net.myId;
    roster.set(net.myId, { id: net.myId, name: welcome.name, color: welcome.color, bot: false, frags: 0, deaths: 0 });
    for (const p of welcome.players) {
      if (p.id === net.myId) continue;
      roster.set(p.id, p);
      remotes.addPlayer(p);
    }
    for (const pk of welcome.pickups) world.setPickupActive(pk.id, pk.active);
    document.getElementById('sb-limit').textContent = welcome.fragLimit;
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
  if (e.code === 'Tab' && joined) { e.preventDefault(); hud.setScoreboardVisible(true); }
});
window.addEventListener('keyup', (e) => {
  if (e.code === 'Tab') hud.setScoreboardVisible(false);
});

// ------------------------------------------------ main loop

let last = performance.now();
let fps = 60;

function loop(now) {
  requestAnimationFrame(loop);
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  fps = fps * 0.95 + (1 / Math.max(1e-3, dt)) * 0.05;

  world.update(dt);
  hud.update(dt);

  if (!joined) {
    // menu orbit cam
    orbitT += dt * 0.08;
    camera.position.set(Math.sin(orbitT) * 34, 16, Math.cos(orbitT) * 34);
    camera.lookAt(0, 2, 0);
  } else {
    player.update(dt, true);
    remotes.update(dt);
    hud.updateScoreboard([...roster.values()], net.myId);
    hud.setMeta(net.ping, fps);
  }

  effects.update(dt, camera);
  renderer.render(scene, camera);
}

requestAnimationFrame(loop);
