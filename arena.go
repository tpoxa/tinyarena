package main

import (
	"embed"
	"encoding/json"
	"math"
)

//go:embed public shared
var assets embed.FS

type Vec3 = [3]float64

type Box struct {
	P Vec3 `json:"p"`
	S Vec3 `json:"s"`
}

type JumpPad struct {
	P Vec3    `json:"p"`
	R float64 `json:"r"`
	V Vec3    `json:"v"`
}

type Teleporter struct {
	P    Vec3    `json:"p"`
	R    float64 `json:"r"`
	Dest Vec3    `json:"dest"`
	Yaw  float64 `json:"yaw"`
}

type Spawn struct {
	P   Vec3    `json:"p"`
	Yaw float64 `json:"yaw"`
}

type PickupSpec struct {
	ID      string  `json:"id"`
	Type    string  `json:"type"`
	P       Vec3    `json:"p"`
	Respawn float64 `json:"respawn"`
}

type PickupDef struct {
	HP       int    `json:"hp"`
	Overheal bool   `json:"overheal"`
	Armor    int    `json:"armor"`
	Ammo     string `json:"ammo"`
	Amount   int    `json:"amount"`
	Label    string `json:"label"`
}

type Weapon struct {
	ID           int     `json:"id"`
	Key          string  `json:"key"`
	Name         string  `json:"name"`
	Hitscan      bool    `json:"hitscan"`
	Dmg          float64 `json:"dmg"`
	Rate         float64 `json:"rate"`
	Spread       float64 `json:"spread"`
	Range        float64 `json:"range"`
	Speed        float64 `json:"speed"`
	SplashRadius float64 `json:"splashRadius"`
	SplashDmg    float64 `json:"splashDmg"`
	AmmoType     string  `json:"ammoType"`
	Knock        float64 `json:"knock"`
}

type Arena struct {
	KillY           float64              `json:"killY"`
	Boxes           []Box                `json:"boxes"`
	JumpPads        []JumpPad            `json:"jumpPads"`
	Teleporters     []Teleporter         `json:"teleporters"`
	Spawns          []Spawn              `json:"spawns"`
	Pickups         []PickupSpec         `json:"pickups"`
	PickupDefs      map[string]PickupDef `json:"pickupDefs"`
	NavNodes        []Vec3               `json:"navNodes"`
	Weapons         []Weapon             `json:"weapons"`
	StartAmmo       map[string]int       `json:"startAmmo"`
	MaxAmmo         map[string]int       `json:"maxAmmo"`
	SelfSplashScale float64              `json:"selfSplashScale"`
	MaxHP           int                  `json:"maxHp"`
	MaxOverheal     int                  `json:"maxOverheal"`
	MaxArmor        int                  `json:"maxArmor"`
	ArmorAbsorb     float64              `json:"armorAbsorb"`
	FragLimit       int                  `json:"fragLimit"`
	RespawnSeconds  float64              `json:"respawnSeconds"`
}

func loadArena() *Arena {
	raw, err := assets.ReadFile("shared/arena.json")
	if err != nil {
		panic(err)
	}
	var a Arena
	if err := json.Unmarshal(raw, &a); err != nil {
		panic(err)
	}
	return &a
}

// ---------------------------------------------------------------- geometry

func boxMin(b Box) Vec3 {
	return Vec3{b.P[0] - b.S[0]/2, b.P[1] - b.S[1]/2, b.P[2] - b.S[2]/2}
}

func boxMax(b Box) Vec3 {
	return Vec3{b.P[0] + b.S[0]/2, b.P[1] + b.S[1]/2, b.P[2] + b.S[2]/2}
}

// segment vs AABB (slab method); returns entry t in [0,1]
func segmentVsBox(a, d Vec3, b Box) (float64, bool) {
	mn, mx := boxMin(b), boxMax(b)
	t0, t1 := 0.0, 1.0
	for i := 0; i < 3; i++ {
		if math.Abs(d[i]) < 1e-9 {
			if a[i] < mn[i] || a[i] > mx[i] {
				return 0, false
			}
		} else {
			ta := (mn[i] - a[i]) / d[i]
			tb := (mx[i] - a[i]) / d[i]
			if ta > tb {
				ta, tb = tb, ta
			}
			t0 = math.Max(t0, ta)
			t1 = math.Min(t1, tb)
			if t0 > t1 {
				return 0, false
			}
		}
	}
	return t0, true
}

// first world-geometry hit along segment; returns (t, true) or (_, false)
func (g *Game) raycastWorld(a, d Vec3) (float64, bool) {
	best, found := 0.0, false
	for _, b := range g.arena.Boxes {
		if t, ok := segmentVsBox(a, d, b); ok && (!found || t < best) {
			best, found = t, true
		}
	}
	return best, found
}

func norm(v Vec3) Vec3 {
	l := math.Hypot(math.Hypot(v[0], v[1]), v[2])
	if l == 0 {
		return Vec3{0, 0, 0}
	}
	return Vec3{v[0] / l, v[1] / l, v[2] / l}
}

func dist3(a, b Vec3) float64 {
	return math.Hypot(math.Hypot(a[0]-b[0], a[1]-b[1]), a[2]-b[2])
}

func round2(v float64) float64 { return math.Round(v*100) / 100 }
func round3(v float64) float64 { return math.Round(v*1000) / 1000 }
