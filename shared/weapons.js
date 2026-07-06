// Weapon table shared by client (fire logic, HUD) and server (validation, rockets).

export const WEAPONS = [
  {
    id: 0, key: 'mg', name: 'MACHINEGUN',
    hitscan: true, dmg: 8, rate: 0.1, spread: 0.018, range: 120,
    ammoType: 'bullets', knock: 0.6,
  },
  {
    id: 1, key: 'rl', name: 'ROCKETS',
    hitscan: false, dmg: 90, rate: 0.85, speed: 26, range: 120,
    splashRadius: 4, splashDmg: 80, ammoType: 'rockets', knock: 11,
  },
  {
    id: 2, key: 'rg', name: 'RAILGUN',
    hitscan: true, dmg: 90, rate: 1.5, spread: 0, range: 200,
    ammoType: 'slugs', knock: 4,
  },
];

export const START_AMMO = { bullets: 100, rockets: 10, slugs: 5 };
export const MAX_AMMO = { bullets: 200, rockets: 25, slugs: 15 };

export const SELF_SPLASH_SCALE = 0.35; // rocket jumps hurt, but not too much
export const MAX_HP = 100;
export const MAX_OVERHEAL = 200; // mega health ceiling
export const MAX_ARMOR = 150;
export const ARMOR_ABSORB = 0.66; // fraction of damage armor eats while it lasts

export const FRAG_LIMIT = 15;
export const RESPAWN_SECONDS = 3;
