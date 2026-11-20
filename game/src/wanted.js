// The wanted level: crimes add heat, stars follow, and the heat cools off
// when no cop can see the player for a while.
import { WANTED } from './config.js';
import { dist2 } from './random.js';

export function createWanted() {
  return {
    stars: 0,
    heat: 0,
    unseen: 0,
    decayTimer: 0,
    lastCrime: 0,
  };
}

// Add heat and recompute stars (1 star per 2 heat, up to the max).
export function addHeat(wanted, amount, now) {
  wanted.heat = Math.min(wanted.heat + amount, WANTED.max * 2);
  wanted.stars = Math.min(WANTED.max, Math.floor(wanted.heat / 2) + (wanted.heat > 0 ? 1 : 0));
  wanted.stars = Math.max(wanted.stars, wanted.heat > 0 ? 1 : 0);
  wanted.lastCrime = now;
  wanted.unseen = 0;
  wanted.decayTimer = 0;
  return wanted.stars;
}

export function clearWanted(wanted) {
  wanted.stars = 0;
  wanted.heat = 0;
  wanted.unseen = 0;
  wanted.decayTimer = 0;
}

// One step: if any cop sees the player the clock resets, else heat decays.
export function updateWanted(wanted, dt, seenByCop) {
  if (wanted.stars === 0) return;
  if (seenByCop) {
    wanted.unseen = 0;
    wanted.decayTimer = 0;
    return;
  }
  wanted.unseen += dt;
  if (wanted.unseen < WANTED.decayDelay) return;
  wanted.decayTimer += dt;
  if (wanted.decayTimer >= WANTED.decayStep) {
    wanted.decayTimer = 0;
    wanted.heat = Math.max(0, wanted.heat - 2);
    wanted.stars = wanted.heat > 0 ? Math.min(WANTED.max, Math.floor(wanted.heat / 2) + 1) : 0;
  }
}

// Can this cop see the player? Line of sight is a distance check; buildings
// block it only roughly (a cop around the corner does not count).
export function copSeesPlayer(cop, player, city) {
  const d = dist2(cop.x, cop.y, player.x, player.y);
  const range = cop.onFoot ? 420 : 700;
  if (d > range * range) return false;
  // Rough block check: sample the midpoint for a building.
  const mx = (cop.x + player.x) / 2;
  const my = (cop.y + player.y) / 2;
  for (const b of city.buildings) {
    if (mx > b.x && mx < b.x + b.w && my > b.y && my < b.y + b.h) return false;
  }
  return true;
}
