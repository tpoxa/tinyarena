// WebSocket client: join, state upload (30Hz), ping, message dispatch.

export class Net {
  constructor() {
    this.ws = null;
    this.handlers = {};
    this.myId = null;
    this.ping = -1;
    this.connected = false;
  }

  on(type, fn) { this.handlers[type] = fn; }

  connect(name, model) {
    return new Promise((resolve, reject) => {
      const proto = location.protocol === 'https:' ? 'wss' : 'ws';
      this.ws = new WebSocket(`${proto}://${location.host}`);
      this.ws.onopen = () => this.send({ t: 'join', name, model });
      this.ws.onerror = () => reject(new Error('connection failed'));
      this.ws.onclose = () => {
        this.connected = false;
        this.handlers.disconnect?.();
      };
      this.ws.onmessage = (ev) => {
        let msg;
        try { msg = JSON.parse(ev.data); } catch { return; }
        if (msg.t === 'welcome') {
          this.myId = msg.id;
          this.connected = true;
          resolve(msg);
        }
        if (msg.t === 'pong') this.ping = Date.now() - msg.ts;
        this.handlers[msg.t]?.(msg);
      };
      setTimeout(() => { if (!this.connected) reject(new Error('timeout')); }, 6000);
    });
  }

  send(msg) {
    if (this.ws && this.ws.readyState === 1) this.ws.send(JSON.stringify(msg));
  }

  startLoops(player) {
    this.stateTimer = setInterval(() => {
      if (!this.connected || !player.alive) return;
      this.send({
        t: 'state',
        p: [player.pos.x, player.pos.y, player.pos.z],
        yw: player.yaw,
        pt: player.pitch,
        w: player.weapon,
      });
    }, 33);
    this.pingTimer = setInterval(() => {
      if (this.connected) this.send({ t: 'ping', ts: Date.now() });
    }, 2000);
  }
}
