package main

import (
	"encoding/json"
	"fmt"
	"log"
	"math"
	"math/rand"
	"os"
	"regexp"
	"sync/atomic"
	"time"
)

const (
	playerRadius = 0.9
	pickupRadius = 1.5
	eyeHeight    = 1.62
	maxBots      = 8
)

var colors = []string{"#5b6cff", "#27e0ff", "#ff3df0", "#ff9a3d", "#7dff3d", "#ff4b4b", "#ffe83d", "#3dffc8"}
var nameRe = regexp.MustCompile(`[^\w\-. ]`)
var debugCombat = os.Getenv("DEBUG") == "1"

// must match the registry in public/js/models.js
var modelIDs = []string{
	"trooper", "duck", "tree", "pizza", "mug", "cactus", "cone", "penguin",
	"ghost", "donut", "crt", "snowman", "burger", "floppy", "robotvac",
}

func validModel(id string) bool {
	for _, m := range modelIDs {
		if m == id {
			return true
		}
	}
	return false
}

type Player struct {
	ID     int
	Name   string
	Color  string
	Model  string
	Bot    bool
	Conn   *Conn
	Pos    Vec3
	Yaw    float64
	Pitch  float64
	HP     int
	Armor  int
	Ammo   map[string]int
	Weapon int
	Dead   bool

	RespawnAt float64
	Frags     int
	Deaths    int
	LastFire  map[int]float64
	LastSeen  float64

	QuadUntil  float64 // quad damage buff expiry
	Streak     int     // frags since last death
	MultiN     int     // frags inside the multi-kill window
	LastFragAt float64

	// who hit us last — void falls within 4s credit them with the frag
	LastAttacker int
	LastHitAt    float64

	// last shove taken — carried into the death burst so corpses blast away
	LastKnock   Vec3
	LastKnockAt float64

	// bot brain + ballistics (bots are knockback-simulated server-side)
	NodeI     int
	PrevI     int
	BotFireAt float64
	Vel       Vec3
	Grounded  bool
}

type Rocket struct {
	ID    int
	Owner int
	Pos   Vec3
	Dir   Vec3
	Born  float64
}

type PickupState struct {
	Spec      PickupSpec
	Active    bool
	RespawnAt float64
}

type Game struct {
	arena            *Arena
	mapName          string
	players          map[int]*Player
	rockets          map[int]*Rocket
	pickups          map[string]*PickupState
	navEdges         [][]int
	nextID           int
	nextRocketID     int
	matchLockedUntil float64
	matchSeconds     float64
	matchEndsAt      float64
	resetAt          float64
	humans           atomic.Int64 // read by /healthz outside the game goroutine
}

func nowSec() float64 { return float64(time.Now().UnixNano()) / 1e9 }

func newGame(arena *Arena) *Game {
	g := &Game{
		arena:        arena,
		players:      map[int]*Player{},
		rockets:      map[int]*Rocket{},
		pickups:      map[string]*PickupState{},
		nextID:       1,
		nextRocketID: 1,
	}
	for _, spec := range arena.Pickups {
		g.pickups[spec.ID] = &PickupState{Spec: spec, Active: true}
	}
	g.matchSeconds = arena.MatchSeconds
	g.matchEndsAt = nowSec() + g.matchSeconds
	g.buildNavEdges()
	return g
}

func copyAmmo(m map[string]int) map[string]int {
	out := make(map[string]int, len(m))
	for k, v := range m {
		out[k] = v
	}
	return out
}

func (g *Game) makePlayer(name string, bot bool, conn *Conn) *Player {
	id := g.nextID
	g.nextID++
	model := "trooper"
	if bot {
		model = modelIDs[rand.Intn(len(modelIDs))] // bots dress however they like
	}
	p := &Player{
		ID: id, Name: name, Bot: bot, Conn: conn,
		Model:     model,
		Color:     colors[id%len(colors)],
		Pos:       Vec3{0, 0.2, 0},
		HP:        g.arena.MaxHP,
		Ammo:      copyAmmo(g.arena.StartAmmo),
		Dead:      true,
		RespawnAt: nowSec() + 0.5,
		LastFire:  map[int]float64{},
		LastSeen:  nowSec(),
		NodeI:     -1, PrevI: -1,
	}
	g.players[id] = p
	return p
}

func (g *Game) humanCount() int {
	n := 0
	for _, p := range g.players {
		if !p.Bot {
			n++
		}
	}
	return n
}

func (g *Game) botCount() int {
	n := 0
	for _, p := range g.players {
		if p.Bot {
			n++
		}
	}
	return n
}

func (g *Game) addBot(by *Player) {
	if g.botCount() >= maxBots {
		g.send(by, map[string]any{"t": "note", "msg": "BOT LIMIT REACHED"})
		return
	}
	taken := map[string]bool{}
	for _, p := range g.players {
		taken[p.Name] = true
	}
	name := ""
	for _, base := range botNames {
		if cand := base + "-BOT"; !taken[cand] {
			name = cand
			break
		}
	}
	if name == "" { // all six names in play — suffix a random one
		base := botNames[rand.Intn(len(botNames))] + "-BOT"
		for n := 2; ; n++ {
			if cand := fmt.Sprintf("%s.%d", base, n); !taken[cand] {
				name = cand
				break
			}
		}
	}
	bot := g.makePlayer(name, true, nil)
	g.broadcast(map[string]any{"t": "pjoin", "player": publicInfo(bot)}, 0)
	log.Printf("+ %s added by %s (%d bots)", bot.Name, by.Name, g.botCount())
}

func (g *Game) kickBot(by *Player) {
	var victim *Player // most recently added goes first
	for _, p := range g.players {
		if p.Bot && (victim == nil || p.ID > victim.ID) {
			victim = p
		}
	}
	if victim == nil {
		g.send(by, map[string]any{"t": "note", "msg": "NO BOTS TO KICK"})
		return
	}
	delete(g.players, victim.ID)
	g.broadcast(map[string]any{"t": "pleave", "id": victim.ID}, 0)
	g.broadcast(map[string]any{"t": "note", "msg": fmt.Sprintf("%s KICKED %s", by.Name, victim.Name)}, 0)
	log.Printf("- %s kicked by %s (%d bots)", victim.Name, by.Name, g.botCount())
}

// ---------------------------------------------------------------- messaging

func mustJSON(v any) []byte {
	b, err := json.Marshal(v)
	if err != nil {
		panic(err)
	}
	return b
}

func (g *Game) send(p *Player, msg any) {
	if p.Conn != nil {
		p.Conn.trySend(mustJSON(msg))
	}
}

func (g *Game) broadcast(msg any, exceptID int) {
	b := mustJSON(msg)
	for _, p := range g.players {
		if p.Bot || p.ID == exceptID || p.Conn == nil {
			continue
		}
		p.Conn.trySend(b)
	}
}

func publicInfo(p *Player) map[string]any {
	return map[string]any{
		"id": p.ID, "name": p.Name, "color": p.Color, "bot": p.Bot, "model": p.Model,
		"frags": p.Frags, "deaths": p.Deaths, "dead": p.Dead,
	}
}

// ---------------------------------------------------------------- spawning

func (g *Game) pickSpawn(forPlayer *Player) Spawn {
	pool := g.arena.Spawns
	if forPlayer.Bot {
		pool = nil
		for _, s := range g.arena.Spawns {
			if s.P[1] < 1 { // bots only navigate the main floor
				pool = append(pool, s)
			}
		}
	}
	best, bestScore := pool[0], -1.0
	for _, s := range pool {
		score := math.Inf(1)
		for _, p := range g.players {
			if p.ID == forPlayer.ID || p.Dead {
				continue
			}
			d := dist3(p.Pos, s.P)
			score = math.Min(score, d*d)
		}
		if math.IsInf(score, 1) {
			score = rand.Float64() * 1000
		}
		if score > bestScore {
			bestScore, best = score, s
		}
	}
	return best
}

func (g *Game) respawn(p *Player) {
	s := g.pickSpawn(p)
	p.Pos = s.P
	p.NodeI, p.PrevI = -1, -1
	p.Vel = Vec3{}
	p.Grounded = false
	p.LastAttacker = 0
	p.Yaw = s.Yaw
	p.Pitch = 0
	p.HP = g.arena.MaxHP
	p.Armor = 0
	p.Ammo = copyAmmo(g.arena.StartAmmo)
	p.QuadUntil = 0
	p.MultiN = 0
	if p.Bot {
		p.Weapon = 0
	}
	p.Dead = false
	g.broadcast(map[string]any{"t": "spawn", "id": p.ID, "p": p.Pos, "yaw": p.Yaw}, 0)
}

// ---------------------------------------------------------------- combat

func eyePos(p *Player) Vec3 { return Vec3{p.Pos[0], p.Pos[1] + eyeHeight, p.Pos[2]} }

func (g *Game) applyDamage(target *Player, dmg int, attacker *Player, weaponID int, knock *Vec3) {
	if target.Dead || nowSec() < g.matchLockedUntil {
		return
	}
	// quad multiplies damage dealt to others (not self-splash) and hits harder
	if attacker != nil && attacker.ID != target.ID && nowSec() < attacker.QuadUntil {
		dmg = int(math.Round(float64(dmg) * g.arena.QuadMultiplier))
		if knock != nil {
			knock[0] *= 1.4
			knock[1] *= 1.4
			knock[2] *= 1.4
		}
	}
	remaining := dmg
	if target.Armor > 0 {
		absorbed := int(math.Round(float64(dmg) * g.arena.ArmorAbsorb))
		if absorbed > target.Armor {
			absorbed = target.Armor
		}
		target.Armor -= absorbed
		remaining = dmg - absorbed
	}
	target.HP -= remaining
	if debugCombat {
		log.Printf("dmg %d -> #%d %s (hp %d) knock=%v", dmg, target.ID, target.Name, target.HP, knock != nil)
	}
	if knock != nil {
		target.LastKnock = *knock
		target.LastKnockAt = nowSec()
		if target.Bot {
			// toy bots are light: 1.5x shove, and any real hit pops them airborne
			target.Vel[0] += knock[0] * 1.5
			target.Vel[1] += knock[1] * 1.5
			target.Vel[2] += knock[2] * 1.5
			kmag := math.Hypot(math.Hypot(knock[0], knock[1]), knock[2])
			if kmag > 3.5 && target.Vel[1] < 3 {
				target.Vel[1] = 3
			}
			target.Grounded = false
		} else {
			g.send(target, map[string]any{"t": "push", "v": *knock})
		}
	}
	if attacker != nil && attacker.ID != target.ID {
		target.LastAttacker = attacker.ID
		target.LastHitAt = nowSec()
	}
	if attacker != nil && attacker.ID != target.ID && !attacker.Bot {
		g.send(attacker, map[string]any{"t": "hit", "target": target.ID, "dmg": dmg})
	}
	if !target.Bot && attacker != nil {
		g.send(target, map[string]any{"t": "dmg", "from": attacker.ID, "amount": dmg, "p": attacker.Pos})
	}
	if target.HP <= 0 {
		g.kill(target, attacker, weaponID)
	}
}

func multiLabel(n int) string {
	switch {
	case n == 2:
		return "DOUBLE KILL"
	case n == 3:
		return "TRIPLE KILL"
	case n == 4:
		return "MULTI KILL"
	case n >= 5:
		return "MONSTER KILL"
	}
	return ""
}

func spreeLabel(n int) string {
	switch n {
	case 5:
		return "KILLING SPREE"
	case 8:
		return "RAMPAGE"
	case 12:
		return "GODLIKE"
	}
	return ""
}

func (g *Game) kill(victim, attacker *Player, weaponID int) {
	if victim.Dead {
		return
	}
	t := nowSec()
	victim.Dead = true
	victim.Deaths++
	victim.Streak = 0
	victim.MultiN = 0
	victim.QuadUntil = 0 // quad dies with you
	victim.RespawnAt = t + g.arena.RespawnSeconds
	suicide := attacker == nil || attacker.ID == victim.ID
	killerID := victim.ID
	if suicide {
		if victim.Frags > 0 {
			victim.Frags--
		}
	} else {
		attacker.Frags++
		killerID = attacker.ID
		attacker.Streak++
		if t-attacker.LastFragAt <= 3 {
			attacker.MultiN++
		} else {
			attacker.MultiN = 1
		}
		attacker.LastFragAt = t
	}
	kv := Vec3{}
	if t-victim.LastKnockAt < 0.5 {
		kv = victim.LastKnock // fresh impulse — let the client blast the corpse along it
	}
	g.broadcast(map[string]any{"t": "die", "victim": victim.ID, "killer": killerID, "w": weaponID, "kv": kv}, 0)
	if !suicide {
		if lbl := multiLabel(attacker.MultiN); lbl != "" {
			g.broadcast(map[string]any{"t": "streak", "id": attacker.ID, "name": attacker.Name, "n": attacker.MultiN, "label": lbl}, 0)
		}
		if lbl := spreeLabel(attacker.Streak); lbl != "" {
			g.broadcast(map[string]any{"t": "streak", "id": attacker.ID, "name": attacker.Name, "n": attacker.Streak, "label": lbl, "spree": true}, 0)
		}
	}
	if !suicide && attacker.Frags >= g.arena.FragLimit && nowSec() >= g.matchLockedUntil {
		g.broadcast(map[string]any{"t": "win", "id": attacker.ID, "name": attacker.Name, "frags": attacker.Frags}, 0)
		g.matchLockedUntil = nowSec() + 6
		g.resetAt = g.matchLockedUntil
	}
}

func (g *Game) resetMatch() {
	g.matchEndsAt = nowSec() + g.matchSeconds
	for _, p := range g.players {
		p.Frags, p.Deaths = 0, 0
		p.Streak, p.MultiN, p.QuadUntil = 0, 0, 0
		p.Dead = true
		p.RespawnAt = nowSec() + 0.5
	}
	for _, pk := range g.pickups {
		pk.Active = true
		pk.RespawnAt = 0
	}
	g.broadcast(map[string]any{"t": "reset"}, 0)
}

// segment vs sphere around player chest; returns t in [0,1]
func segmentVsPlayer(a, d Vec3, p *Player) (float64, bool) {
	c := Vec3{p.Pos[0], p.Pos[1] + 0.9, p.Pos[2]}
	m := Vec3{a[0] - c[0], a[1] - c[1], a[2] - c[2]}
	dd := d[0]*d[0] + d[1]*d[1] + d[2]*d[2]
	if dd < 1e-9 {
		return 0, false
	}
	b := (m[0]*d[0] + m[1]*d[1] + m[2]*d[2]) / dd
	cc := (m[0]*m[0] + m[1]*m[1] + m[2]*m[2] - playerRadius*playerRadius) / dd
	if cc < 0 {
		return 0, true // segment starts inside the body — point-blank hit
	}
	disc := b*b - cc
	if disc < 0 {
		return 0, false
	}
	t := -b - math.Sqrt(disc)
	if t < 0 || t > 1 {
		return 0, false
	}
	return t, true
}

func (g *Game) fireHitscan(shooter *Player, w *Weapon, origin, dir Vec3) {
	delta := Vec3{dir[0] * w.Range, dir[1] * w.Range, dir[2] * w.Range}
	tWall := 1.0
	if t, ok := g.raycastWorld(origin, delta); ok {
		tWall = t
	}
	type hit struct {
		p *Player
		t float64
	}
	var hits []hit
	for _, p := range g.players {
		if p.ID == shooter.ID || p.Dead {
			continue
		}
		if t, ok := segmentVsPlayer(origin, delta, p); ok && t < tWall {
			hits = append(hits, hit{p, t})
		}
	}
	// nearest first; machinegun stops at the first body, rail penetrates
	for i := 1; i < len(hits); i++ {
		for j := i; j > 0 && hits[j].t < hits[j-1].t; j-- {
			hits[j], hits[j-1] = hits[j-1], hits[j]
		}
	}
	victims := hits
	if w.Key != "rg" && len(hits) > 1 {
		victims = hits[:1]
	}
	for _, h := range victims {
		knock := Vec3{dir[0] * w.Knock, math.Abs(dir[1])*w.Knock*0.3 + 0.5, dir[2] * w.Knock}
		g.applyDamage(h.p, int(w.Dmg), shooter, w.ID, &knock)
	}
	end := Vec3{origin[0] + delta[0]*tWall, origin[1] + delta[1]*tWall, origin[2] + delta[2]*tWall}
	exceptID := 0
	if !shooter.Bot {
		exceptID = shooter.ID
	}
	g.broadcast(map[string]any{"t": "shot", "id": shooter.ID, "w": w.ID, "o": origin, "e": end}, exceptID)
}

func (g *Game) spawnRocket(shooter *Player, origin, dir Vec3) {
	id := g.nextRocketID
	g.nextRocketID++
	g.rockets[id] = &Rocket{ID: id, Owner: shooter.ID, Pos: origin, Dir: dir, Born: nowSec()}
}

func (g *Game) explodeRocket(r *Rocket, at Vec3, directVictimID int) {
	delete(g.rockets, r.ID)
	w := &g.arena.Weapons[1]
	owner := g.players[r.Owner]
	if debugCombat {
		near := math.Inf(1)
		for _, p := range g.players {
			if p.ID != r.Owner && !p.Dead {
				near = math.Min(near, dist3(Vec3{p.Pos[0], p.Pos[1] + 0.9, p.Pos[2]}, at))
			}
		}
		log.Printf("boom at %.1f,%.1f,%.1f direct=%d nearest-enemy=%.2fm", at[0], at[1], at[2], directVictimID, near)
	}
	g.broadcast(map[string]any{"t": "boom", "p": at, "owner": r.Owner}, 0)
	for _, p := range g.players {
		if p.Dead || p.ID == directVictimID { // direct hit already paid full damage
			continue
		}
		c := Vec3{p.Pos[0], p.Pos[1] + 0.9, p.Pos[2]}
		d := dist3(c, at)
		if d > w.SplashRadius {
			continue
		}
		falloff := 1 - d/w.SplashRadius
		dmg := int(math.Round(w.SplashDmg * falloff))
		isSelf := owner != nil && p.ID == owner.ID
		if isSelf {
			dmg = int(math.Round(float64(dmg) * g.arena.SelfSplashScale))
		}
		kn := norm(Vec3{c[0] - at[0], c[1] - at[1] + 0.6, c[2] - at[2]})
		kv := Vec3{kn[0] * w.Knock * falloff, kn[1] * w.Knock * falloff, kn[2] * w.Knock * falloff}
		attacker := owner
		if attacker == nil {
			attacker = p
		}
		if isSelf {
			// self knockback is applied client-side for crisp rocket jumps
			g.applyDamage(p, dmg, attacker, w.ID, nil)
		} else {
			g.applyDamage(p, dmg, attacker, w.ID, &kv)
		}
	}
}

func (g *Game) stepRockets(dt float64) {
	w := &g.arena.Weapons[1]
	ids := make([]int, 0, len(g.rockets))
	for id := range g.rockets {
		ids = append(ids, id)
	}
	for _, id := range ids {
		r, ok := g.rockets[id]
		if !ok {
			continue
		}
		if nowSec()-r.Born > 6 {
			g.explodeRocket(r, r.Pos, 0)
			continue
		}
		delta := Vec3{r.Dir[0] * w.Speed * dt, r.Dir[1] * w.Speed * dt, r.Dir[2] * w.Speed * dt}
		tHit := 2.0
		if t, ok := g.raycastWorld(r.Pos, delta); ok {
			tHit = t
		}
		var directVictim *Player
		for _, p := range g.players {
			if p.ID == r.Owner || p.Dead {
				continue
			}
			if t, ok := segmentVsPlayer(r.Pos, delta, p); ok && t < tHit {
				tHit = t
				directVictim = p
			}
		}
		if tHit <= 1 {
			at := Vec3{r.Pos[0] + delta[0]*tHit, r.Pos[1] + delta[1]*tHit, r.Pos[2] + delta[2]*tHit}
			victimID := 0
			if directVictim != nil {
				owner := g.players[r.Owner]
				if owner == nil {
					owner = directVictim
				}
				// direct hits shove hardest — along the rocket's flight, with lift
				kn := norm(Vec3{r.Dir[0], r.Dir[1] + 0.5, r.Dir[2]})
				kv := Vec3{kn[0] * w.Knock, kn[1] * w.Knock, kn[2] * w.Knock}
				g.applyDamage(directVictim, int(w.Dmg), owner, w.ID, &kv)
				victimID = directVictim.ID
			}
			g.explodeRocket(r, at, victimID)
			continue
		}
		r.Pos = Vec3{r.Pos[0] + delta[0], r.Pos[1] + delta[1], r.Pos[2] + delta[2]}
		if r.Pos[1] < g.arena.KillY {
			delete(g.rockets, id)
		}
	}
}

func finite3(v []float64) bool {
	if len(v) != 3 {
		return false
	}
	for _, x := range v {
		if math.IsNaN(x) || math.IsInf(x, 0) {
			return false
		}
	}
	return true
}

func (g *Game) handleFire(p *Player, weaponID int, o, d []float64) {
	if p.Dead || nowSec() < g.matchLockedUntil {
		return
	}
	if weaponID < 0 || weaponID >= len(g.arena.Weapons) {
		return
	}
	w := &g.arena.Weapons[weaponID]
	t := nowSec()
	if t-p.LastFire[w.ID] < w.Rate*0.9 {
		return
	}
	if p.Ammo[w.AmmoType] <= 0 {
		return
	}
	if !finite3(o) || !finite3(d) {
		return
	}
	origin := Vec3{o[0], o[1], o[2]}
	if dist3(origin, eyePos(p)) > 3 { // origin must be near the player the server knows about
		return
	}
	dir := norm(Vec3{d[0], d[1], d[2]})
	p.LastFire[w.ID] = t
	p.Ammo[w.AmmoType]--
	if w.Hitscan {
		// nudge off any surface the shooter is flush against (t=0 self-eat)
		no := Vec3{origin[0] + dir[0]*0.05, origin[1] + dir[1]*0.05, origin[2] + dir[2]*0.05}
		g.fireHitscan(p, w, no, dir)
	} else {
		// matches the client's local rocket spawn offset
		no := Vec3{origin[0] + dir[0]*0.6, origin[1] + dir[1]*0.6 - 0.15, origin[2] + dir[2]*0.6}
		g.spawnRocket(p, no, dir)
	}
}

// ---------------------------------------------------------------- pickups

func (g *Game) stepPickups() {
	t := nowSec()
	for _, id := range g.pickupOrder() {
		pk := g.pickups[id]
		if !pk.Active {
			if t >= pk.RespawnAt {
				pk.Active = true
				g.broadcast(map[string]any{"t": "pickup", "id": pk.Spec.ID, "active": true}, 0)
			}
			continue
		}
		for _, p := range g.players {
			if p.Dead {
				continue
			}
			c := Vec3{p.Pos[0], p.Pos[1] + 0.9, p.Pos[2]}
			if dist3(c, pk.Spec.P) > pickupRadius {
				continue
			}
			def := g.arena.PickupDefs[pk.Spec.Type]
			used := false
			if def.Buff == "quad" {
				p.QuadUntil = t + def.Duration
				used = true
				g.broadcast(map[string]any{"t": "note", "msg": p.Name + " HAS QUAD DAMAGE"}, p.ID)
			}
			if def.HP > 0 {
				cap := g.arena.MaxHP
				if def.Overheal {
					cap = g.arena.MaxOverheal
				}
				if p.HP < cap {
					p.HP = min(cap, p.HP+def.HP)
					used = true
				}
			}
			if def.Armor > 0 && p.Armor < g.arena.MaxArmor {
				p.Armor = min(g.arena.MaxArmor, p.Armor+def.Armor)
				used = true
			}
			if def.Ammo != "" && p.Ammo[def.Ammo] < g.arena.MaxAmmo[def.Ammo] {
				p.Ammo[def.Ammo] = min(g.arena.MaxAmmo[def.Ammo], p.Ammo[def.Ammo]+def.Amount)
				used = true
			}
			if !used {
				continue
			}
			pk.Active = false
			pk.RespawnAt = t + pk.Spec.Respawn
			g.broadcast(map[string]any{"t": "pickup", "id": pk.Spec.ID, "active": false, "by": p.ID, "label": def.Label}, 0)
			break
		}
	}
}

func (g *Game) pickupOrder() []string {
	ids := make([]string, 0, len(g.arena.Pickups))
	for _, spec := range g.arena.Pickups {
		ids = append(ids, spec.ID)
	}
	return ids
}

// ---------------------------------------------------------------- tick + snapshots

func (g *Game) tick(dt float64) {
	t := nowSec()
	for _, p := range g.players {
		if p.Dead && t >= p.RespawnAt && (p.Bot || p.Conn != nil) {
			g.respawn(p)
		}
		if !p.Dead && p.Pos[1] < g.arena.KillY {
			var att *Player
			if p.LastAttacker != 0 && t-p.LastHitAt < 4 {
				att = g.players[p.LastAttacker] // knocked into the void — their frag
			}
			g.kill(p, att, -1)
		}
		if !p.Bot && p.Conn != nil && t-p.LastSeen > 15 {
			p.Conn.ws.Close()
		}
	}
	g.stepBots(dt)
	g.stepRockets(dt)
	g.stepPickups()
	if g.resetAt == 0 && t >= g.matchEndsAt && t >= g.matchLockedUntil {
		var leader *Player
		for _, p := range g.players {
			if leader == nil || p.Frags > leader.Frags {
				leader = p
			}
		}
		if leader != nil {
			g.broadcast(map[string]any{"t": "win", "id": leader.ID, "name": leader.Name, "frags": leader.Frags, "timeup": true}, 0)
		}
		g.matchLockedUntil = t + 6
		g.resetAt = g.matchLockedUntil
	}
	if g.resetAt > 0 && t >= g.resetAt {
		g.resetAt = 0
		g.resetMatch()
	}
}

type snapPlayer struct {
	I  int     `json:"i"`
	P  Vec3    `json:"p"`
	Yw float64 `json:"yw"`
	Pt float64 `json:"pt"`
	W  int     `json:"w"`
	D  int     `json:"d"`
	F  int     `json:"f"`
	Dt int     `json:"dt"`
	Q  int     `json:"q,omitempty"` // 1 while quad damage is active
}

type snapRocket struct {
	I int  `json:"i"`
	O int  `json:"o"`
	P Vec3 `json:"p"`
	D Vec3 `json:"d"`
}

func (g *Game) sendSnapshots() {
	t := nowSec()
	players := make([]snapPlayer, 0, len(g.players))
	for _, p := range g.players {
		d := 0
		if p.Dead {
			d = 1
		}
		q := 0
		if t < p.QuadUntil {
			q = 1
		}
		players = append(players, snapPlayer{
			I:  p.ID,
			P:  Vec3{round2(p.Pos[0]), round2(p.Pos[1]), round2(p.Pos[2])},
			Yw: round3(p.Yaw), Pt: round3(p.Pitch),
			W: p.Weapon, D: d, F: p.Frags, Dt: p.Deaths, Q: q,
		})
	}
	rockets := make([]snapRocket, 0, len(g.rockets))
	for _, r := range g.rockets {
		rockets = append(rockets, snapRocket{
			I: r.ID, O: r.Owner,
			P: Vec3{round2(r.Pos[0]), round2(r.Pos[1]), round2(r.Pos[2])},
			D: Vec3{round2(r.Dir[0]), round2(r.Dir[1]), round2(r.Dir[2])},
		})
	}
	ts := time.Now().UnixMilli()
	for _, p := range g.players {
		if p.Bot || p.Conn == nil {
			continue
		}
		g.send(p, map[string]any{
			"t": "snap", "ts": ts, "tl": int(math.Ceil(math.Max(0, g.matchEndsAt-t))),
			"players": players,
			"rockets": rockets,
			"you":     map[string]any{"hp": p.HP, "ar": p.Armor, "ammo": p.Ammo, "quad": round2(math.Max(0, p.QuadUntil-t))},
		})
	}
}

// ---------------------------------------------------------------- inbound

type inMsg struct {
	T     string          `json:"t"`
	Name  string          `json:"name"`
	Model string          `json:"model"`
	P     []float64       `json:"p"`
	Yw    *float64        `json:"yw"`
	Pt    *float64        `json:"pt"`
	W     *int            `json:"w"`
	O     []float64       `json:"o"`
	D     []float64       `json:"d"`
	Ts    json.RawMessage `json:"ts"`
}

func (g *Game) handleMessage(c *Conn, data []byte) {
	var msg inMsg
	if err := json.Unmarshal(data, &msg); err != nil {
		return
	}

	if c.player == nil {
		if msg.T != "join" {
			return
		}
		name := nameRe.ReplaceAllString(msg.Name, "")
		if len(name) > 14 {
			name = name[:14]
		}
		if name == "" {
			name = "PLAYER"
		}
		taken := map[string]bool{}
		for _, p := range g.players {
			taken[p.Name] = true
		}
		candidate, n := name, 2
		for taken[candidate] {
			candidate = fmt.Sprintf("%s.%d", name, n)
			n++
		}
		me := g.makePlayer(candidate, false, c)
		if validModel(msg.Model) {
			me.Model = msg.Model
		}
		c.player = me
		infos := make([]map[string]any, 0, len(g.players))
		for _, p := range g.players {
			infos = append(infos, publicInfo(p))
		}
		pks := make([]map[string]any, 0, len(g.pickups))
		for _, id := range g.pickupOrder() {
			pks = append(pks, map[string]any{"id": id, "active": g.pickups[id].Active})
		}
		g.send(me, map[string]any{
			"t": "welcome", "id": me.ID, "color": me.Color, "name": me.Name, "map": g.mapName,
			"players": infos, "pickups": pks, "fragLimit": g.arena.FragLimit,
		})
		g.broadcast(map[string]any{"t": "pjoin", "player": publicInfo(me)}, me.ID)
		g.humans.Store(int64(g.humanCount()))
		log.Printf("+ %s joined (%d humans online)", me.Name, g.humanCount())
		return
	}

	me := c.player
	me.LastSeen = nowSec()
	switch msg.T {
	case "state":
		if me.Dead {
			return
		}
		if finite3(msg.P) && math.Abs(msg.P[0]) < 500 && math.Abs(msg.P[1]) < 500 && math.Abs(msg.P[2]) < 500 {
			me.Pos = Vec3{msg.P[0], msg.P[1], msg.P[2]}
		}
		if msg.Yw != nil && !math.IsNaN(*msg.Yw) && !math.IsInf(*msg.Yw, 0) {
			me.Yaw = *msg.Yw
		}
		if msg.Pt != nil && !math.IsNaN(*msg.Pt) && !math.IsInf(*msg.Pt, 0) {
			me.Pitch = *msg.Pt
		}
		if msg.W != nil && *msg.W >= 0 && *msg.W < len(g.arena.Weapons) {
			me.Weapon = *msg.W
		}
	case "fire":
		if msg.W != nil {
			g.handleFire(me, *msg.W, msg.O, msg.D)
		}
	case "addbot":
		g.addBot(me)
	case "kickbot":
		g.kickBot(me)
	case "ping":
		g.send(me, map[string]any{"t": "pong", "ts": msg.Ts})
	}
}

func (g *Game) dropConn(c *Conn) {
	if c.player == nil {
		return
	}
	delete(g.players, c.player.ID)
	g.broadcast(map[string]any{"t": "pleave", "id": c.player.ID}, 0)
	g.humans.Store(int64(g.humanCount()))
	log.Printf("- %s left", c.player.Name)
	c.player = nil
}
