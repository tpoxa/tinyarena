// Protocol smoke test: two clients join, A rails B until a frag lands.
// Run with the server already up: node server/smoke.js

import WebSocket from 'ws';

const URL = process.env.URL || 'ws://localhost:3388';
const results = { welcomeA: false, welcomeB: false, snap: false, hit: false, die: false, spawnSeen: false };

function client(name) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(URL);
    const c = { ws, id: null, name, msgs: [], you: null, players: [] };
    ws.on('open', () => ws.send(JSON.stringify({ t: 'join', name })));
    ws.on('message', (raw) => {
      const m = JSON.parse(raw);
      c.msgs.push(m);
      if (m.t === 'welcome') { c.id = m.id; resolve(c); }
      if (m.t === 'snap') { c.you = m.you; c.players = m.players; results.snap = true; }
      if (m.t === 'hit') results.hit = true;
      if (m.t === 'die') results.die = true;
      if (m.t === 'spawn' && m.id === c.id) { c.spawn = m; results.spawnSeen = true; }
    });
    ws.on('error', reject);
    setTimeout(() => reject(new Error(`${name}: no welcome`)), 4000);
  });
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const A = await client('SMOKE-A');
results.welcomeA = true;
const B = await client('SMOKE-B');
results.welcomeB = true;
console.log(`joined: A=#${A.id} B=#${B.id}`);

await sleep(1200); // wait for server auto-spawn
if (!A.spawn || !B.spawn) throw new Error('players were not spawned by server');

// park both at fixed spots on the main floor, A aims straight at B
const posA = [5, 0.2, 0], posB = [10, 0.2, 0];
const state = (ws, p, yw) => ws.send(JSON.stringify({ t: 'state', p, yw, pt: 0, w: 2 }));
const stateTimer = setInterval(() => { state(A.ws, posA, 0); state(B.ws, posB, 0); }, 33);

await sleep(300);

// A fires railgun +x at B's chest until B dies (rail: 90 dmg, needs 2 shots)
let bDead = false;
B.ws.on('message', (raw) => { const m = JSON.parse(raw); if (m.t === 'die' && m.victim === B.id) bDead = true; });
for (let i = 0; i < 4 && !bDead; i++) {
  A.ws.send(JSON.stringify({ t: 'fire', w: 2, o: [posA[0], posA[1] + 1.62, posA[2]], d: [1, -0.14, 0] }));
  await sleep(1600); // rail cooldown
}
await sleep(500);

clearInterval(stateTimer);

const bSelf = B.players.find(p => p.i === B.id);
const aSelf = A.players.find(p => p.i === A.id);
console.log('B hp after shots:', B.you?.hp, 'B dead flag:', bSelf?.d, 'A frags:', aSelf?.f);
console.log('checks:', results);

const pass = results.welcomeA && results.welcomeB && results.snap && results.hit
  && results.die && results.spawnSeen && aSelf?.f === 1;
console.log(pass ? 'SMOKE PASS' : 'SMOKE FAIL');
A.ws.close(); B.ws.close();
process.exit(pass ? 0 : 1);
