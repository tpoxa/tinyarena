// TINY ARENA server — Go port of the original Node implementation.
// Same JSON protocol over WebSocket; the browser client is unchanged.
//
//	go run .            # port 3377, 3 bots
//	PORT=4000 BOTS=0 go run .
package main

import (
	"fmt"
	"io/fs"
	"log"
	"net/http"
	"os"
	"strconv"
	"time"

	"github.com/gorilla/websocket"
)

type inbound struct {
	c    *Conn
	data []byte
}

type Conn struct {
	ws     *websocket.Conn
	send   chan []byte
	player *Player
}

func (c *Conn) trySend(b []byte) {
	select {
	case c.send <- b:
	default: // slow consumer: drop the message rather than block the game loop
	}
}

func (c *Conn) writer() {
	for msg := range c.send {
		c.ws.SetWriteDeadline(time.Now().Add(5 * time.Second))
		if err := c.ws.WriteMessage(websocket.TextMessage, msg); err != nil {
			break
		}
	}
	c.ws.Close()
}

func envInt(key string, def int) int {
	if v := os.Getenv(key); v != "" {
		if n, err := strconv.Atoi(v); err == nil {
			return n
		}
	}
	return def
}

func main() {
	port := envInt("PORT", 3377)
	botCount := envInt("BOTS", 3)
	mapName := os.Getenv("MAP")
	if mapName == "" {
		mapName = "neon-yard"
	}

	arena, arenaRaw := loadArena(mapName)
	game := newGame(arena)
	game.mapName = mapName
	if s := envInt("MATCH_SECONDS", 0); s > 0 {
		game.matchSeconds = float64(s)
		game.matchEndsAt = nowSec() + game.matchSeconds
	}
	for i := 0; i < botCount; i++ {
		game.makePlayer(fmt.Sprintf("%s-BOT", botNames[i%len(botNames)]), true, nil)
	}

	msgCh := make(chan inbound, 256)
	leaveCh := make(chan *Conn, 32)

	// the game loop goroutine owns all game state; conns only talk via channels
	go func() {
		simT := time.NewTicker(time.Second / 30)
		snapT := time.NewTicker(time.Second / 20)
		last := nowSec()
		for {
			select {
			case <-simT.C:
				t := nowSec()
				dt := t - last
				if dt > 0.1 {
					dt = 0.1
				}
				last = t
				game.tick(dt)
			case <-snapT.C:
				game.sendSnapshots()
			case m := <-msgCh:
				game.handleMessage(m.c, m.data)
			case c := <-leaveCh:
				game.dropConn(c)
				close(c.send)
			}
		}
	}()

	upgrader := websocket.Upgrader{CheckOrigin: func(*http.Request) bool { return true }}

	var publicFS, sharedFS fs.FS
	if os.Getenv("DEV") == "1" { // serve from disk so client edits don't need a rebuild
		publicFS, sharedFS = os.DirFS("public"), os.DirFS("shared")
	} else {
		var err error
		if publicFS, err = fs.Sub(assets, "public"); err != nil {
			log.Fatal(err)
		}
		if sharedFS, err = fs.Sub(assets, "shared"); err != nil {
			log.Fatal(err)
		}
	}
	files := http.FileServer(http.FS(publicFS))

	mux := http.NewServeMux()
	// the active map is always served at the path the client fetches
	mux.HandleFunc("/shared/arena.json", func(w http.ResponseWriter, _ *http.Request) {
		raw := arenaRaw
		if os.Getenv("DEV") == "1" { // live map data on refresh, like the other shared files
			if b, err := os.ReadFile("shared/maps/" + mapName + ".json"); err == nil {
				raw = b
			}
		}
		w.Header().Set("Content-Type", "application/json")
		w.Write(raw)
	})
	mux.Handle("/shared/", http.StripPrefix("/shared/", http.FileServer(http.FS(sharedFS))))
	mux.HandleFunc("/healthz", func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		fmt.Fprintf(w, `{"ok":true,"humans":%d}`, game.humans.Load())
	})
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		if websocket.IsWebSocketUpgrade(r) {
			ws, err := upgrader.Upgrade(w, r, nil)
			if err != nil {
				return
			}
			c := &Conn{ws: ws, send: make(chan []byte, 64)}
			go c.writer()
			go func() {
				defer func() { leaveCh <- c }()
				for {
					_, data, err := ws.ReadMessage()
					if err != nil {
						return
					}
					msgCh <- inbound{c, data}
				}
			}()
			return
		}
		files.ServeHTTP(w, r)
	})

	log.Printf("TINY ARENA (go) up on http://localhost:%d  (map: %s, bots: %d)", port, mapName, botCount)
	log.Fatal(http.ListenAndServe(fmt.Sprintf(":%d", port), mux))
}
