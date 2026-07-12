# TINY ARENA

Quake 3 Arena-style browser FPS. Go server (WebSocket, authoritative), Three.js client, bots, deathmatch to 15 frags. No build step, no client deps — assets are embedded in the binary.

## Run

```sh
go build -o tiny-arena-server . && ./tiny-arena-server
# open http://localhost:3377
```

Env: `PORT` (default 3377), `BOTS` (default 3), `DEV=1` serves `public/` and `shared/` from disk so client edits apply on refresh.

## Play

WASD + mouse, SPACE jump (hold = auto-hop), 1/2/3 or wheel — machinegun / rockets / railgun, TAB scoreboard. Rocket-jump: shoot at your feet mid-jump.

Colleagues on the same network: `http://<your-lan-ip>:3377`.

## Tests

```sh
PORT=3388 BOTS=0 ./tiny-arena-server &   # protocol smoke test needs a bot-free server
node server/smoke.js
```

## Layout

- `main.go`, `game.go`, `bots.go`, `arena.go` — server
- `shared/arena.json` — map + weapons data, single source for Go and JS
- `shared/map.js` — loads arena.json, AABB math shared client-side
- `public/` — client (Three.js vendored in `public/vendor/three`)
