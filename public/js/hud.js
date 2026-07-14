// DOM HUD: stats, kill feed, scoreboard, overlays, flashes.

import { WEAPONS } from '/shared/weapons.js';

const $ = (id) => document.getElementById(id);

const WEAPON_VERBS = { 0: 'machinegunned', 1: 'rocketed', 2: 'railed', '-1': 'voided' };

export class Hud {
  constructor() {
    this.hp = $('hud-hp');
    this.armor = $('hud-armor');
    this.ammoEl = $('hud-ammo');
    this.weaponEl = $('hud-weapon');
    this.killfeed = $('killfeed');
    this.centerMsg = $('center-msg');
    this.pickupMsg = $('pickup-msg');
    this.scoreboard = $('scoreboard');
    this.sbBody = $('sb-body');
    this.deathOverlay = $('death-overlay');
    this.deathMsg = $('death-msg');
    this.deathCount = $('death-count');
    this.winOverlay = $('win-overlay');
    this.winMsg = $('win-msg');
    this.vignette = $('dmg-vignette');
    this.hitmarker = $('hitmarker');
    this.pingEl = $('hud-ping');
    this.fpsEl = $('hud-fps');
    this.streakEl = $('streak-banner');
    this.quadHud = $('quad-hud');
    this.quadSecs = $('quad-secs');
    this.statHp = document.querySelector('.stat-hp');
    this.slots = [...document.querySelectorAll('.wslot')];
    this.respawnAt = 0;
    this.vignetteLevel = 0;
  }

  show() { $('hud').classList.remove('hidden'); $('join').classList.add('hidden'); }

  setStats(hp, armor, ammo, weapon) {
    this.hp.textContent = Math.max(0, Math.ceil(hp));
    this.armor.textContent = Math.max(0, Math.ceil(armor));
    this.statHp.classList.toggle('low', hp <= 30);
    const w = WEAPONS[weapon];
    this.ammoEl.textContent = ammo[w.ammoType] ?? 0;
    this.weaponEl.textContent = w.name;
    this.slots.forEach((s) => {
      const id = Number(s.dataset.w);
      s.classList.toggle('active', id === weapon);
      s.classList.toggle('empty', (ammo[WEAPONS[id].ammoType] ?? 0) <= 0);
    });
  }

  killRow(killerName, victimName, weaponId, involvesMe, selfKill = false) {
    const row = document.createElement('div');
    row.className = 'kf-row' + (involvesMe ? ' me' : '');
    const verb = WEAPON_VERBS[weaponId] ?? 'fragged';
    row.innerHTML = selfKill
      ? `<span class="v">${victimName}</span><span class="w">self-fragged</span>`
      : `<span class="k">${killerName}</span><span class="w">${verb}</span><span class="v">${victimName}</span>`;
    this.killfeed.appendChild(row);
    while (this.killfeed.children.length > 6) this.killfeed.firstChild.remove();
    setTimeout(() => row.remove(), 6000);
  }

  centerMessage(text) {
    this.centerMsg.textContent = text;
    this.centerMsg.classList.remove('show');
    void this.centerMsg.offsetWidth;
    this.centerMsg.classList.add('show');
  }

  streakBanner(label, tier) {
    this.streakEl.textContent = label;
    this.streakEl.dataset.tier = Math.min(5, tier);
    this.streakEl.classList.remove('show');
    void this.streakEl.offsetWidth;
    this.streakEl.classList.add('show');
  }

  setQuad(secs) {
    const on = secs > 0;
    this.quadHud.classList.toggle('hidden', !on);
    if (on) this.quadSecs.textContent = Math.ceil(secs);
  }

  pickupMessage(text) {
    this.pickupMsg.textContent = text;
    this.pickupMsg.classList.remove('show');
    void this.pickupMsg.offsetWidth;
    this.pickupMsg.classList.add('show');
  }

  damageFlash(strength = 0.6) {
    this.vignetteLevel = Math.min(1, this.vignetteLevel + strength);
    this.vignette.style.opacity = this.vignetteLevel;
  }

  hitmark() {
    this.hitmarker.classList.remove('pop');
    void this.hitmarker.offsetWidth;
    this.hitmarker.classList.add('pop');
  }

  showDeath(killerName, weaponId, voidDeath = false) {
    this.vignetteLevel = 0; // no blood-red wash over the death cam
    this.vignette.style.opacity = 0;
    let msg;
    if (!killerName) {
      msg = voidDeath ? 'YOU FELL INTO THE VOID' : 'YOU FRAGGED YOURSELF';
    } else if (weaponId === -1) {
      msg = `KNOCKED INTO THE VOID BY ${killerName.toUpperCase()}`;
    } else {
      const verb = (WEAPON_VERBS[weaponId] ?? 'fragged').toUpperCase();
      msg = `${verb} BY ${killerName.toUpperCase()}`;
    }
    this.deathMsg.textContent = msg;
    this.deathOverlay.classList.remove('hidden');
    this.respawnAt = performance.now() / 1000 + 3;
  }

  hideDeath() { this.deathOverlay.classList.add('hidden'); }

  showWin(name) {
    this.winMsg.textContent = `${name.toUpperCase()} WINS`;
    this.winOverlay.classList.remove('hidden');
  }

  hideWin() { this.winOverlay.classList.add('hidden'); }

  setScoreboardVisible(v) { this.scoreboard.classList.toggle('hidden', !v); }

  updateScoreboard(list, myId) {
    const sorted = [...list].sort((a, b) => b.frags - a.frags || a.deaths - b.deaths);
    this.sbBody.innerHTML = sorted.map((p) => `
      <tr class="${p.id === myId ? 'me' : ''}">
        <td><span class="dot" style="background:${p.color}"></span></td>
        <td>${p.name}${p.bot ? '<span class="bot-tag">BOT</span>' : ''}</td>
        <td class="num">${p.frags}</td>
        <td class="num">${p.deaths}</td>
      </tr>`).join('');
  }

  setMeta(ping, fps) {
    this.pingEl.textContent = ping >= 0 ? Math.round(ping) : '–';
    this.fpsEl.textContent = Math.round(fps);
  }

  update(dt) {
    if (this.vignetteLevel > 0) {
      this.vignetteLevel = Math.max(0, this.vignetteLevel - dt * 1.4);
      this.vignette.style.opacity = this.vignetteLevel;
    }
    if (!this.deathOverlay.classList.contains('hidden')) {
      const left = Math.max(0, this.respawnAt - performance.now() / 1000);
      this.deathCount.textContent = Math.ceil(left) || '…';
    }
  }
}
