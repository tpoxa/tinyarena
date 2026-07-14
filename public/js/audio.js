// Procedural WebAudio SFX — zero asset files.

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
  }

  ensure() {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.35;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  env(node, t0, attack, decay, peak = 1) {
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(peak, t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + attack + decay);
    node.connect(g);
    g.connect(this.master);
    return g;
  }

  osc(type, f0, f1, dur, peak = 1) {
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    this.env(o, t, 0.005, dur, peak);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  noise(dur, filterFreq, peak = 1, sweepTo = null) {
    const t = this.ctx.currentTime;
    const len = Math.max(1, Math.floor(this.ctx.sampleRate * dur));
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(filterFreq, t);
    if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t + dur);
    src.connect(f);
    this.env(f, t, 0.004, dur, peak);
    src.start(t);
  }

  play(name, gain = 1) {
    try {
      this.ensure();
      switch (name) {
        case 'mg':
          this.noise(0.07, 3200, 0.5 * gain, 900);
          this.osc('square', 190, 90, 0.05, 0.25 * gain);
          break;
        case 'rl':
          this.noise(0.4, 1200, 0.5 * gain, 300);
          this.osc('sawtooth', 140, 60, 0.35, 0.3 * gain);
          break;
        case 'boom':
          this.noise(0.7, 900, 0.9 * gain, 90);
          this.osc('sine', 110, 32, 0.55, 0.8 * gain);
          break;
        case 'rail':
          this.osc('sawtooth', 1600, 180, 0.35, 0.4 * gain);
          this.osc('sine', 2400, 2400, 0.09, 0.25 * gain);
          this.noise(0.16, 5000, 0.2 * gain);
          break;
        case 'jump':
          this.osc('square', 240, 380, 0.09, 0.16 * gain);
          break;
        case 'land':
          this.noise(0.1, 500, 0.3 * gain);
          break;
        case 'pad':
          this.osc('sine', 220, 820, 0.28, 0.4 * gain);
          this.osc('square', 110, 410, 0.24, 0.14 * gain);
          break;
        case 'teleport':
          this.osc('sawtooth', 300, 1800, 0.3, 0.3 * gain);
          this.osc('sine', 1200, 200, 0.35, 0.25 * gain);
          break;
        case 'hurt':
          this.noise(0.12, 1800, 0.5 * gain);
          this.osc('square', 300, 120, 0.13, 0.3 * gain);
          break;
        case 'hit':
          this.osc('square', 1150, 900, 0.05, 0.28 * gain);
          break;
        case 'frag':
          this.osc('square', 520, 520, 0.09, 0.3 * gain);
          setTimeout(() => this.osc('square', 780, 780, 0.14, 0.3 * gain), 90);
          break;
        case 'die':
          this.osc('sawtooth', 400, 60, 0.6, 0.4 * gain);
          this.noise(0.5, 700, 0.4 * gain, 100);
          break;
        case 'pickup':
          this.osc('sine', 660, 990, 0.1, 0.3 * gain);
          break;
        case 'mega':
          this.osc('sine', 440, 880, 0.12, 0.35 * gain);
          setTimeout(() => this.osc('sine', 660, 1320, 0.16, 0.35 * gain), 100);
          break;
        case 'switch':
          this.osc('square', 480, 620, 0.05, 0.16 * gain);
          break;
        case 'empty':
          this.osc('square', 220, 160, 0.06, 0.18 * gain);
          break;
        case 'win':
          [440, 550, 660, 880].forEach((f, i) =>
            setTimeout(() => this.osc('square', f, f, 0.18, 0.3 * gain), i * 130));
          break;
        case 'quad':
          this.osc('sawtooth', 70, 280, 0.55, 0.5 * gain);
          this.osc('sine', 440, 1760, 0.4, 0.22 * gain);
          setTimeout(() => this.noise(0.3, 6000, 0.12 * gain, 2000), 150);
          break;
      }
    } catch { /* audio must never break the game */ }
  }

  // escalating announcer stab — higher tier, higher and longer arpeggio
  streak(tier = 2, mine = true) {
    try {
      this.ensure();
      const base = 260 * Math.pow(1.14, Math.min(6, tier));
      const peak = mine ? 0.38 : 0.16;
      [1, 1.335, 1.5, 2].slice(0, Math.min(4, tier + 1)).forEach((m, i) =>
        setTimeout(() => this.osc('square', base * m, base * m, 0.14, peak), i * 85));
      this.noise(0.2, 3200, 0.14 * (mine ? 1 : 0.4));
    } catch { /* audio must never break the game */ }
  }

  // low electric double-oscillator drone while quad damage is active
  setQuadHum(on) {
    try {
      this.ensure();
      if (on && !this.hum) {
        const o1 = this.ctx.createOscillator();
        o1.type = 'sawtooth'; o1.frequency.value = 54;
        const o2 = this.ctx.createOscillator();
        o2.type = 'sine'; o2.frequency.value = 108.7; // detuned octave: slow beat
        const g = this.ctx.createGain();
        g.gain.value = 0.045;
        o1.connect(g); o2.connect(g); g.connect(this.master);
        o1.start(); o2.start();
        this.hum = { o1, o2, g };
      } else if (!on && this.hum) {
        const { o1, o2, g } = this.hum;
        this.hum = null;
        g.gain.linearRampToValueAtTime(0.0001, this.ctx.currentTime + 0.25);
        setTimeout(() => { o1.stop(); o2.stop(); g.disconnect(); }, 350);
      }
    } catch { /* audio must never break the game */ }
  }

  // distance-attenuated remote sound
  playAt(name, p, myPos, maxDist = 45) {
    const dx = p[0] - myPos.x, dy = p[1] - myPos.y, dz = p[2] - myPos.z;
    const dist = Math.hypot(dx, dy, dz);
    if (dist > maxDist) return;
    this.play(name, Math.max(0.08, 1 - dist / maxDist));
  }
}
