package main

import (
	"log"
	"math"
	"math/rand"
)

var botHalf = Vec3{0.4, 0.9, 0.4}

// visibility graph over the waypoints: same-layer edges need clear line of
// sight AND solid ground the whole way (maps with void pits). One-way navLinks
// (jump-pad flights, platform drop-offs) are appended verbatim.
func (g *Game) buildNavEdges() {
	nodes := g.arena.NavNodes
	g.navEdges = make([][]int, len(nodes))
	for i, a := range nodes {
		for j, b := range nodes {
			if i == j || math.Abs(a[1]-b[1]) > 1.2 {
				continue
			}
			d := Vec3{b[0] - a[0], 0, b[2] - a[2]}
			if math.Hypot(d[0], d[2]) > 26 {
				continue
			}
			if t, hit := g.raycastWorld(Vec3{a[0], a[1] + 1.1, a[2]}, d); hit && t < 1 {
				continue
			}
			if !g.edgeWalkable(a, b) {
				continue
			}
			g.navEdges[i] = append(g.navEdges[i], j)
		}
	}
	for _, l := range g.arena.NavLinks {
		i, j := g.nearestNode(l.From), g.nearestNode(l.To)
		if i != j {
			g.navEdges[i] = append(g.navEdges[i], j)
		}
	}
}

// every ~1m along the edge there must be ground within a short drop
func (g *Game) edgeWalkable(a, b Vec3) bool {
	dist := math.Hypot(b[0]-a[0], b[2]-a[2])
	steps := int(math.Ceil(dist))
	for s := 0; s <= steps; s++ {
		k := float64(s) / math.Max(1, float64(steps))
		p := Vec3{a[0] + (b[0]-a[0])*k, a[1] + (b[1]-a[1])*k, a[2] + (b[2]-a[2])*k}
		if _, hit := g.raycastWorld(Vec3{p[0], p[1] + 0.6, p[2]}, Vec3{0, -2.2, 0}); !hit {
			return false
		}
	}
	return true
}

func (g *Game) nearestNode(pos Vec3) int {
	best, bestD := 0, math.Inf(1)
	for i, n := range g.arena.NavNodes {
		dy := pos[1] - n[1]
		d := (pos[0]-n[0])*(pos[0]-n[0]) + (pos[2]-n[2])*(pos[2]-n[2]) + dy*dy*6 // stay on your own layer
		if d < bestD {
			bestD, best = d, i
		}
	}
	return best
}

// moves the bot along one axis unless world geometry blocks it; reports blockage
func (g *Game) botMoveAxis(bot *Player, axis int, delta float64) bool {
	if delta == 0 {
		return false
	}
	p := bot.Pos
	p[axis] += delta
	c := Vec3{p[0], p[1] + botHalf[1], p[2]}
	for _, b := range g.arena.Boxes {
		mn, mx := boxMin(b), boxMax(b)
		if c[0]+botHalf[0] > mn[0] && c[0]-botHalf[0] < mx[0] &&
			c[1]+botHalf[1] > mn[1] && c[1]-botHalf[1] < mx[1] &&
			c[2]+botHalf[2] > mn[2] && c[2]-botHalf[2] < mx[2] {
			return true // blocked on this axis; slide along the others
		}
	}
	bot.Pos = p
	return false
}

// returns distance if the bot has line of sight to the target, else -1
func (g *Game) botCanSee(bot, target *Player) float64 {
	a, b := eyePos(bot), eyePos(target)
	d := Vec3{b[0] - a[0], b[1] - a[1], b[2] - a[2]}
	dist := math.Hypot(math.Hypot(d[0], d[1]), d[2])
	if dist > 55 {
		return -1
	}
	if t, hit := g.raycastWorld(a, d); hit && t < 0.98 {
		return -1
	}
	return dist
}

func (g *Game) stepBots(dt float64) {
	t := nowSec()
	for _, bot := range g.players {
		if !bot.Bot || bot.Dead {
			continue
		}

		// gravity + vertical collision: bots can be blasted into the air and off the map
		bot.Vel[1] -= 22 * dt
		if g.botMoveAxis(bot, 1, bot.Vel[1]*dt) {
			if bot.Vel[1] < 0 {
				bot.Grounded = true
			}
			bot.Vel[1] = 0
		} else if bot.Vel[1] < -1 || bot.Vel[1] > 0.5 {
			bot.Grounded = false
		}

		hSpeed := math.Hypot(bot.Vel[0], bot.Vel[2])
		if bot.Grounded && hSpeed > 0 {
			// skid friction after a knock
			f := math.Max(0, 1-8*dt)
			bot.Vel[0] *= f
			bot.Vel[2] *= f
			if math.Hypot(bot.Vel[0], bot.Vel[2]) < 1 {
				bot.Vel[0], bot.Vel[2] = 0, 0
			}
		}

		// jump pads launch bots exactly like humans
		if bot.Grounded {
			for _, pad := range g.arena.JumpPads {
				dx, dz := bot.Pos[0]-pad.P[0], bot.Pos[2]-pad.P[2]
				if dx*dx+dz*dz < pad.R*pad.R && math.Abs(bot.Pos[1]-pad.P[1]) < 0.6 {
					// launch from the pad's near edge: the arc only clears the
					// platform lip from there (far-edge launches clip its side,
					// drop the bot next to the pad, and loop forever)
					if vh := math.Hypot(pad.V[0], pad.V[2]); vh > 0 {
						bot.Pos[0] = pad.P[0] - pad.V[0]/vh*0.9
						bot.Pos[2] = pad.P[2] - pad.V[2]/vh*0.9
					}
					bot.Vel = pad.V
					bot.Grounded = false
					bot.NodeI = -1 // re-pick a waypoint up top
					break
				}
			}
		}

		if !bot.Grounded || hSpeed >= 1 {
			// airborne or skidding: pure ballistics, no steering
			if g.botMoveAxis(bot, 0, bot.Vel[0]*dt) {
				bot.Vel[0] = 0
			}
			if g.botMoveAxis(bot, 2, bot.Vel[2]*dt) {
				bot.Vel[2] = 0
			}
			bot.NodeI = -1 // re-pick a waypoint after landing
			continue
		}

		// pick a target first — movement and aim both want to know
		var target *Player
		targetDist := math.Inf(1)
		for _, p := range g.players {
			if p.ID == bot.ID || p.Dead || p.Team == bot.Team {
				continue
			}
			if d := g.botCanSee(bot, p); d >= 0 && d < targetDist {
				target, targetDist = p, d
			}
		}

		// walk the waypoint graph edge by edge — every edge is wall-free by construction
		if bot.NodeI < 0 {
			bot.NodeI = g.nearestNode(bot.Pos)
			bot.PrevI = -1
		}
		wp := g.arena.NavNodes[bot.NodeI]
		if math.Hypot(bot.Pos[0]-wp[0], bot.Pos[2]-wp[2]) < 1.2 {
			var nbrs []int
			for _, j := range g.navEdges[bot.NodeI] {
				if j != bot.PrevI {
					nbrs = append(nbrs, j)
				}
			}
			if len(nbrs) == 0 {
				nbrs = g.navEdges[bot.NodeI]
			}
			bot.PrevI = bot.NodeI
			switch {
			case len(nbrs) == 0:
				bot.NodeI = g.nearestNode(bot.Pos)
			case bot.HP < 40:
				// hurt: head for whichever neighbor is closest to live health
				if hp := g.nearestHealthPickup(bot.Pos); hp != nil {
					best, bestD := nbrs[0], math.Inf(1)
					for _, j := range nbrs {
						if d := dist3(g.arena.NavNodes[j], *hp); d < bestD {
							bestD, best = d, j
						}
					}
					bot.NodeI = best
				} else {
					bot.NodeI = nbrs[rand.Intn(len(nbrs))]
				}
			default:
				bot.NodeI = nbrs[rand.Intn(len(nbrs))]
			}
			wp = g.arena.NavNodes[bot.NodeI]
		}
		mv := norm(Vec3{wp[0] - bot.Pos[0], 0, wp[2] - bot.Pos[2]})

		// in a firefight, weave sideways across the firing line — but never off a ledge
		if target != nil {
			td := norm(Vec3{target.Pos[0] - bot.Pos[0], 0, target.Pos[2] - bot.Pos[2]})
			weave := math.Sin(t*3.1 + float64(bot.ID)*1.7)
			wv := norm(Vec3{mv[0]*0.55 - td[2]*weave*0.85, 0, mv[2]*0.55 + td[0]*weave*0.85})
			probe := Vec3{bot.Pos[0] + wv[0]*1.2, bot.Pos[1] + 0.4, bot.Pos[2] + wv[2]*1.2}
			if _, hit := g.raycastWorld(probe, Vec3{0, -2.4, 0}); hit {
				mv = wv
			}
		}
		const speed = 6.5
		g.botMoveAxis(bot, 0, mv[0]*speed*dt)
		g.botMoveAxis(bot, 2, mv[2]*speed*dt)

		// don't stand inside other bodies
		for _, o := range g.players {
			if o.ID == bot.ID || o.Dead {
				continue
			}
			dx, dz := bot.Pos[0]-o.Pos[0], bot.Pos[2]-o.Pos[2]
			d2 := dx*dx + dz*dz
			if d2 < 0.81 && d2 > 1e-6 {
				d := math.Sqrt(d2)
				push := (0.9 - d) * 0.5
				g.botMoveAxis(bot, 0, dx/d*push)
				g.botMoveAxis(bot, 2, dz/d*push)
			}
		}

		// combat
		if target != nil {
			a, b := eyePos(bot), eyePos(target)
			dir := norm(Vec3{b[0] - a[0], b[1] - a[1], b[2] - a[2]})
			bot.Yaw = math.Atan2(-dir[0], -dir[2])
			bot.Pitch = math.Asin(math.Max(-1, math.Min(1, dir[1])))
			if t >= bot.BotFireAt {
				w := &g.arena.Weapons[0]
				aimErr := 0.13
				switch {
				case targetDist > 18 && bot.Ammo["slugs"] > 0 && rand.Float64() < 0.5:
					w = &g.arena.Weapons[2] // long lines get railed
					aimErr = 0.07
				case targetDist > 9 && bot.Ammo["rockets"] > 0 && rand.Float64() < 0.35:
					w = &g.arena.Weapons[1]
				}
				bot.Weapon = w.ID // everyone sees what it actually holds
				shotDir := norm(Vec3{
					dir[0] + (rand.Float64()-0.5)*aimErr,
					dir[1] + (rand.Float64()-0.5)*aimErr,
					dir[2] + (rand.Float64()-0.5)*aimErr,
				})
				e := eyePos(bot)
				g.handleFire(bot, w.ID, e[:], shotDir[:])
				bot.BotFireAt = t + w.Rate + 0.35 + rand.Float64()*0.4
			}
		} else {
			bot.Yaw = math.Atan2(-mv[0], -mv[2])
			bot.Pitch = 0
		}

		// stuck watchdog: barely moved for 4s → new route; 8s → relocate
		if t >= bot.StuckAt {
			if bot.Grounded && dist3(bot.Pos, bot.StuckRef) < 0.7 {
				bot.StuckN++
				if bot.StuckN >= 2 {
					log.Printf("~ %s was stuck at %.0f,%.0f,%.0f — relocated", bot.Name, bot.Pos[0], bot.Pos[1], bot.Pos[2])
					g.respawn(bot)
					bot.StuckN = 0
				} else {
					bot.NodeI = rand.Intn(len(g.arena.NavNodes))
					bot.PrevI = -1
				}
			} else {
				bot.StuckN = 0
			}
			bot.StuckRef = bot.Pos
			bot.StuckAt = t + 4
		}
	}
}

// nearest live health pickup (hp25 or mega), or nil if all are on cooldown
func (g *Game) nearestHealthPickup(pos Vec3) *Vec3 {
	var best *Vec3
	bestD := math.Inf(1)
	for _, pk := range g.pickups {
		if !pk.Active || g.arena.PickupDefs[pk.Spec.Type].HP <= 0 {
			continue
		}
		if d := dist3(pos, pk.Spec.P); d < bestD {
			p := pk.Spec.P
			bestD, best = d, &p
		}
	}
	return best
}
