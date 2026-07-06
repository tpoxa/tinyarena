import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import express from 'express';
import { WebSocketServer } from 'ws';
import {
  BOXES, SPAWNS, PICKUPS, PICKUP_DEFS, NAV_NODES, KILL_Y, raycastWorld,
} from '../shared/map.js';
import {
  WEAPONS, START_AMMO, MAX_AMMO, SELF_SPLASH_SCALE,
  MAX_HP, MAX_OVERHEAL, MAX_ARMOR, ARMOR_ABSORB, FRAG_LIMIT, RESPAWN_SECONDS,
} from '../shared/weapons.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3377;
const BOT_COUNT = process.env.BOTS !== undefined ? Number(process.env.BOTS) : 3;

const TICK_HZ = 30;
const SNAP_HZ = 20;
const PLAYER_RADIUS = 0.9;
const PICKUP_RADIUS = 1.5;
const EYE = 1.62;

// ---------------------------------------------------------------- web server

const app = express();
app.use(express.static(path.join(__dirname, '../public')));
app.use('/shared', express.static(path.join(__dirname, '../shared')));
app.use('/vendor/three', express.static(path.join(__dirname, '../node_modules/three/build')));
app.get('/healthz', (_req, res) => res.json({ ok: true, players: alivePlayerCount() }));

const server = http.createServer(app);
const wss = new WebSocketServer({ server });

// ---------------------------------------------------------------- game state

const players = new Map(); // id -> player
const rockets = new Map(); // id -> rocket
const pickups = new Map(PICKUPS.map(p => [p.id, { ...p, active: true, respawnAt: 0 }]));
let nextId = 1;
let nextRocketId = 1;
let matchLockedUntil = 0;

const COLORS = ['#5b6cff', '#27e0ff', '#ff3df0', '#ff9a3d', '#7dff3d', '#ff4b4b', '#ffe83d', '#3dffc8'];
const BOT_NAMES = ['CRASH', 'ORBB', 'SARGE', 'MYNX', 'BITTERMAN', 'PHOBOS'];

function now() { return Date.now() / 1000; }

function makePlayer({ name, bot = false, ws = null }) {
  const id = nextId++;
  const p = {
    id, name, bot, ws,
    color: COLORS[id % COLORS.length],
    pos: [0, 0.2, 0], yaw: 0, pitch: 0,
    hp: MAX_HP, armor: 0,
    ammo: { ...START_AMMO },
    weapon: 0,
    dead: true, respawnAt: now() + 0.5,
    frags: 0, deaths: 0,
    lastFire: {}, lastSeen: now(),
    // bot brain
    navTarget: null, botFireAt: 0, botWanderJitter: 0,
  };
  players.set(id, p);
  return p;
}

function alivePlayerCount() {
  return [...players.values()].filter(p => !p.bot).length;
}

function pickSpawn(forPlayer) {
  // farthest spawn from living enemies
  let best = SPAWNS[0], bestScore = -1;
  for (const s of SPAWNS) {
    let score = Infinity;
    for (const p of players.values()) {
      if (p.id === forPlayer.id || p.dead) continue;
      const dx = p.pos[0] - s.p[0], dy = p.pos[1] - s.p[1], dz = p.pos[2] - s.p[2];
      score = Math.min(score, dx * dx + dy * dy + dz * dz);
    }
    if (score === Infinity) score = Math.random() * 1000;
    if (score > bestScore) { bestScore = score; best = s; }
  }
  return best;
}

function respawn(p) {
  const s = pickSpawn(p);
  p.pos = [...s.p];
  p.yaw = s.yaw;
  p.pitch = 0;
  p.hp = MAX_HP;
  p.armor = 0;
  p.ammo = { ...START_AMMO };
  p.weapon = p.bot ? 0 : p.weapon;
  p.dead = false;
  broadcast({ t: 'spawn', id: p.id, p: p.pos, yaw: p.yaw });
}

// ---------------------------------------------------------------- messaging

function send(p, msg) {
  if (p.ws && p.ws.readyState === 1) p.ws.send(JSON.stringify(msg));
}

function broadcast(msg, exceptId = null) {
  const s = JSON.stringify(msg);
  for (const p of players.values()) {
    if (p.bot || p.id === exceptId) continue;
    if (p.ws && p.ws.readyState === 1) p.ws.send(s);
  }
}

function publicInfo(p) {
  return { id: p.id, name: p.name, color: p.color, bot: p.bot, frags: p.frags, deaths: p.deaths, dead: p.dead };
}

// ---------------------------------------------------------------- combat

function applyDamage(target, dmg, attacker, weaponId, knockVec) {
  if (target.dead || now() < matchLockedUntil) return;
  let remaining = dmg;
  if (target.armor > 0) {
    const absorbed = Math.min(target.armor, Math.round(dmg * ARMOR_ABSORB));
    target.armor -= absorbed;
    remaining = dmg - absorbed;
  }
  target.hp -= remaining;
  if (knockVec && !target.bot) send(target, { t: 'push', v: knockVec });
  if (attacker && attacker.id !== target.id && !attacker.bot) {
    send(attacker, { t: 'hit', target: target.id, dmg });
  }
  if (!target.bot && attacker) {
    send(target, { t: 'dmg', from: attacker.id, amount: dmg, p: attacker.pos });
  }
  if (target.hp <= 0) kill(target, attacker, weaponId);
}

function kill(victim, attacker, weaponId) {
  if (victim.dead) return;
  victim.dead = true;
  victim.deaths++;
  victim.respawnAt = now() + RESPAWN_SECONDS;
  const suicide = !attacker || attacker.id === victim.id;
  if (suicide) {
    victim.frags = Math.max(0, victim.frags - 1);
  } else {
    attacker.frags++;
  }
  broadcast({
    t: 'die', victim: victim.id, killer: suicide ? victim.id : attacker.id, w: weaponId ?? -1,
  });
  if (!suicide && attacker.frags >= FRAG_LIMIT && now() >= matchLockedUntil) {
    broadcast({ t: 'win', id: attacker.id, name: attacker.name, frags: attacker.frags });
    matchLockedUntil = now() + 6;
    setTimeout(resetMatch, 6000);
  }
}

function resetMatch() {
  for (const p of players.values()) {
    p.frags = 0; p.deaths = 0;
    p.dead = true; p.respawnAt = now() + 0.5;
  }
  for (const pk of pickups.values()) { pk.active = true; pk.respawnAt = 0; }
  broadcast({ t: 'reset' });
}

function norm(v) {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
}

function eyePos(p) { return [p.pos[0], p.pos[1] + EYE, p.pos[2]]; }

// segment vs sphere around player chest, returns t or null
function segmentVsPlayer(a, d, p) {
  const c = [p.pos[0], p.pos[1] + 0.9, p.pos[2]];
  const m = [a[0] - c[0], a[1] - c[1], a[2] - c[2]];
  const dd = d[0] * d[0] + d[1] * d[1] + d[2] * d[2];
  if (dd < 1e-9) return null;
  const b = (m[0] * d[0] + m[1] * d[1] + m[2] * d[2]) / dd;
  const cc = (m[0] * m[0] + m[1] * m[1] + m[2] * m[2] - PLAYER_RADIUS * PLAYER_RADIUS) / dd;
  const disc = b * b - cc;
  if (disc < 0) return null;
  const t = -b - Math.sqrt(disc);
  if (t < 0 || t > 1) return null;
  return t;
}

function fireHitscan(shooter, weapon, origin, dir) {
  const delta = [dir[0] * weapon.range, dir[1] * weapon.range, dir[2] * weapon.range];
  const tWall = raycastWorld(origin, delta) ?? 1;
  const hits = [];
  for (const p of players.values()) {
    if (p.id === shooter.id || p.dead) continue;
    const t = segmentVsPlayer(origin, delta, p);
    if (t !== null && t < tWall) hits.push({ p, t });
  }
  hits.sort((a, b) => a.t - b.t);
  const victims = weapon.key === 'rg' ? hits : hits.slice(0, 1); // rail penetrates
  for (const h of victims) {
    const knock = [dir[0] * weapon.knock, Math.abs(dir[1]) * weapon.knock * 0.3 + 0.5, dir[2] * weapon.knock];
    applyDamage(h.p, weapon.dmg, shooter, weapon.id, knock);
  }
  const end = [
    origin[0] + delta[0] * tWall,
    origin[1] + delta[1] * tWall,
    origin[2] + delta[2] * tWall,
  ];
  broadcast({ t: 'shot', id: shooter.id, w: weapon.id, o: origin, e: end }, shooter.bot ? null : shooter.id);
}

function spawnRocket(shooter, origin, dir) {
  const id = nextRocketId++;
  rockets.set(id, { id, owner: shooter.id, pos: [...origin], dir: [...dir], born: now() });
}

function explodeRocket(r, at, directVictimId = null) {
  rockets.delete(r.id);
  const weapon = WEAPONS[1];
  const owner = players.get(r.owner);
  broadcast({ t: 'boom', p: at, owner: r.owner });
  for (const p of players.values()) {
    if (p.dead || p.id === directVictimId) continue; // direct hit already paid full damage
    const c = [p.pos[0], p.pos[1] + 0.9, p.pos[2]];
    const dx = c[0] - at[0], dy = c[1] - at[1], dz = c[2] - at[2];
    const dist = Math.hypot(dx, dy, dz);
    if (dist > weapon.splashRadius) continue;
    const falloff = 1 - dist / weapon.splashRadius;
    let dmg = Math.round(weapon.splashDmg * falloff);
    const isSelf = owner && p.id === owner.id;
    if (isSelf) dmg = Math.round(dmg * SELF_SPLASH_SCALE);
    const kn = norm([dx, dy + 0.6, dz]);
    const kv = [kn[0] * weapon.knock * falloff, kn[1] * weapon.knock * falloff, kn[2] * weapon.knock * falloff];
    // self knockback is applied client-side for crisp rocket jumps
    applyDamage(p, dmg, owner ?? p, weapon.id, isSelf ? null : kv);
  }
}

function stepRockets(dt) {
  for (const r of [...rockets.values()]) {
    if (now() - r.born > 6) { explodeRocket(r, r.pos); continue; }
    const weapon = WEAPONS[1];
    const delta = [r.dir[0] * weapon.speed * dt, r.dir[1] * weapon.speed * dt, r.dir[2] * weapon.speed * dt];
    const tWall = raycastWorld(r.pos, delta);
    let tHit = tWall ?? 2;
    let directVictim = null;
    for (const p of players.values()) {
      if (p.id === r.owner || p.dead) continue;
      const t = segmentVsPlayer(r.pos, delta, p);
      if (t !== null && t < tHit) { tHit = t; directVictim = p; }
    }
    if (tHit <= 1) {
      const at = [r.pos[0] + delta[0] * tHit, r.pos[1] + delta[1] * tHit, r.pos[2] + delta[2] * tHit];
      if (directVictim) {
        const owner = players.get(r.owner);
        applyDamage(directVictim, WEAPONS[1].dmg, owner ?? directVictim, 1, null);
      }
      explodeRocket(r, at, directVictim?.id ?? null);
      continue;
    }
    r.pos[0] += delta[0]; r.pos[1] += delta[1]; r.pos[2] += delta[2];
    if (r.pos[1] < KILL_Y) rockets.delete(r.id);
  }
}

function handleFire(p, msg) {
  if (p.dead || now() < matchLockedUntil) return;
  const weapon = WEAPONS[msg.w];
  if (!weapon) return;
  const t = now();
  const last = p.lastFire[weapon.id] ?? 0;
  if (t - last < weapon.rate * 0.9) return;
  if ((p.ammo[weapon.ammoType] ?? 0) <= 0) return;
  const origin = msg.o;
  if (!Array.isArray(origin) || origin.length !== 3 || origin.some(v => typeof v !== 'number' || !isFinite(v))) return;
  const de = eyePos(p);
  const drift = Math.hypot(origin[0] - de[0], origin[1] - de[1], origin[2] - de[2]);
  if (drift > 3) return; // origin must be near the player the server knows about
  const dir = norm(msg.d);
  p.lastFire[weapon.id] = t;
  p.ammo[weapon.ammoType]--;
  if (weapon.hitscan) {
    // nudge off any surface the shooter is flush against (t=0 self-eat)
    const o = [origin[0] + dir[0] * 0.05, origin[1] + dir[1] * 0.05, origin[2] + dir[2] * 0.05];
    fireHitscan(p, weapon, o, dir);
  } else {
    // matches the client's local rocket spawn offset
    const o = [origin[0] + dir[0] * 0.6, origin[1] + dir[1] * 0.6 - 0.15, origin[2] + dir[2] * 0.6];
    spawnRocket(p, o, dir);
  }
}

// ---------------------------------------------------------------- pickups

function stepPickups() {
  const t = now();
  for (const pk of pickups.values()) {
    if (!pk.active) {
      if (t >= pk.respawnAt) {
        pk.active = true;
        broadcast({ t: 'pickup', id: pk.id, active: true });
      }
      continue;
    }
    for (const p of players.values()) {
      if (p.dead) continue;
      const dx = p.pos[0] - pk.p[0], dy = (p.pos[1] + 0.9) - pk.p[1], dz = p.pos[2] - pk.p[2];
      if (dx * dx + dy * dy + dz * dz > PICKUP_RADIUS * PICKUP_RADIUS) continue;
      const def = PICKUP_DEFS[pk.type];
      let used = false;
      if (def.hp) {
        const cap = def.overheal ? MAX_OVERHEAL : MAX_HP;
        if (p.hp < cap) { p.hp = Math.min(cap, p.hp + def.hp); used = true; }
      }
      if (def.armor && p.armor < MAX_ARMOR) {
        p.armor = Math.min(MAX_ARMOR, p.armor + def.armor); used = true;
      }
      if (def.ammo && p.ammo[def.ammo] < MAX_AMMO[def.ammo]) {
        p.ammo[def.ammo] = Math.min(MAX_AMMO[def.ammo], p.ammo[def.ammo] + def.amount); used = true;
      }
      if (!used) continue;
      pk.active = false;
      pk.respawnAt = t + pk.respawn;
      broadcast({ t: 'pickup', id: pk.id, active: false, by: p.id, label: def.label });
      break;
    }
  }
}

// ---------------------------------------------------------------- bots

function botCanSee(bot, target) {
  const a = eyePos(bot), b = eyePos(target);
  const d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const dist = Math.hypot(...d);
  if (dist > 55) return null;
  const tWall = raycastWorld(a, d);
  if (tWall !== null && tWall < 0.98) return null;
  return dist;
}

function stepBots(dt) {
  const t = now();
  for (const bot of players.values()) {
    if (!bot.bot || bot.dead) continue;

    // pick / chase waypoint on the main floor
    if (!bot.navTarget || Math.hypot(bot.pos[0] - bot.navTarget[0], bot.pos[2] - bot.navTarget[2]) < 1.2) {
      bot.navTarget = NAV_NODES[Math.floor(Math.random() * NAV_NODES.length)];
      bot.botWanderJitter = (Math.random() - 0.5) * 2;
    }
    const mv = norm([bot.navTarget[0] - bot.pos[0], 0, bot.navTarget[2] - bot.pos[2]]);
    const speed = 6.5;
    bot.pos[0] += mv[0] * speed * dt;
    bot.pos[2] += mv[2] * speed * dt;
    bot.pos[1] = 0.2; // bots live on the main floor

    // combat
    let target = null, targetDist = Infinity;
    for (const p of players.values()) {
      if (p.id === bot.id || p.dead) continue;
      const d = botCanSee(bot, p);
      if (d !== null && d < targetDist) { target = p; targetDist = d; }
    }
    if (target) {
      const a = eyePos(bot), b = eyePos(target);
      const dir = norm([b[0] - a[0], b[1] - a[1], b[2] - a[2]]);
      bot.yaw = Math.atan2(-dir[0], -dir[2]);
      bot.pitch = Math.asin(Math.max(-1, Math.min(1, dir[1])));
      if (t >= bot.botFireAt) {
        const useRl = targetDist > 9 && bot.ammo.rockets > 0 && Math.random() < 0.35;
        const w = useRl ? WEAPONS[1] : WEAPONS[0];
        const err = 0.13;
        const shotDir = norm([
          dir[0] + (Math.random() - 0.5) * err,
          dir[1] + (Math.random() - 0.5) * err,
          dir[2] + (Math.random() - 0.5) * err,
        ]);
        handleFire(bot, { w: w.id, o: eyePos(bot), d: shotDir });
        bot.botFireAt = t + w.rate + 0.35 + Math.random() * 0.4;
      }
    } else {
      bot.yaw = Math.atan2(-mv[0], -mv[2]) + bot.botWanderJitter * 0.2;
      bot.pitch = 0;
    }
  }
}

// ---------------------------------------------------------------- main loop

let lastTick = now();
setInterval(() => {
  const t = now();
  const dt = Math.min(0.1, t - lastTick);
  lastTick = t;

  for (const p of players.values()) {
    if (p.dead && t >= p.respawnAt && (p.bot || (p.ws && p.ws.readyState === 1))) respawn(p);
    if (!p.dead && p.pos[1] < KILL_Y) kill(p, null, -1);
    if (!p.bot && p.ws && t - p.lastSeen > 15) p.ws.terminate();
  }
  stepBots(dt);
  stepRockets(dt);
  stepPickups();
}, 1000 / TICK_HZ);

setInterval(() => {
  const snapPlayers = [...players.values()].map(p => ({
    i: p.id,
    p: p.pos.map(v => Math.round(v * 100) / 100),
    yw: Math.round(p.yaw * 1000) / 1000,
    pt: Math.round(p.pitch * 1000) / 1000,
    w: p.weapon, d: p.dead ? 1 : 0,
    f: p.frags, dt: p.deaths,
  }));
  const snapRockets = [...rockets.values()].map(r => ({
    i: r.id, o: r.owner,
    p: r.pos.map(v => Math.round(v * 100) / 100),
    d: r.dir.map(v => Math.round(v * 100) / 100),
  }));
  for (const p of players.values()) {
    if (p.bot) continue;
    send(p, {
      t: 'snap', ts: Date.now(),
      players: snapPlayers,
      rockets: snapRockets,
      you: { hp: p.hp, ar: p.armor, ammo: p.ammo },
    });
  }
}, 1000 / SNAP_HZ);

// ---------------------------------------------------------------- connections

wss.on('connection', (ws) => {
  let me = null;

  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }

    if (!me) {
      if (msg.t !== 'join') return;
      let name = String(msg.name || 'PLAYER').replace(/[^\w\-. ]/g, '').trim().slice(0, 14) || 'PLAYER';
      const taken = new Set([...players.values()].map(p => p.name));
      let candidate = name, n = 2;
      while (taken.has(candidate)) candidate = `${name}.${n++}`;
      me = makePlayer({ name: candidate, ws });
      send(me, {
        t: 'welcome', id: me.id, color: me.color, name: me.name,
        players: [...players.values()].map(publicInfo),
        pickups: [...pickups.values()].map(pk => ({ id: pk.id, active: pk.active })),
        fragLimit: FRAG_LIMIT,
      });
      broadcast({ t: 'pjoin', player: publicInfo(me) }, me.id);
      console.log(`+ ${me.name} joined (${alivePlayerCount()} humans online)`);
      return;
    }

    me.lastSeen = now();
    switch (msg.t) {
      case 'state': {
        if (me.dead) break;
        const { p, yw, pt, w } = msg;
        if (Array.isArray(p) && p.length === 3 && p.every(v => typeof v === 'number' && isFinite(v) && Math.abs(v) < 500)) {
          me.pos = p;
        }
        if (typeof yw === 'number' && isFinite(yw)) me.yaw = yw;
        if (typeof pt === 'number' && isFinite(pt)) me.pitch = pt;
        if (Number.isInteger(w) && WEAPONS[w]) me.weapon = w;
        break;
      }
      case 'fire': handleFire(me, msg); break;
      case 'ping': send(me, { t: 'pong', ts: msg.ts }); break;
    }
  });

  ws.on('close', () => {
    if (!me) return;
    players.delete(me.id);
    broadcast({ t: 'pleave', id: me.id });
    console.log(`- ${me.name} left`);
  });
});

// ---------------------------------------------------------------- bots + boot

for (let i = 0; i < BOT_COUNT; i++) {
  makePlayer({ name: `${BOT_NAMES[i % BOT_NAMES.length]}-BOT`, bot: true });
}

server.listen(PORT, () => {
  console.log(`TINY ARENA up on http://localhost:${PORT}  (bots: ${BOT_COUNT})`);
});
