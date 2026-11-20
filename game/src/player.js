// Rae Vega on foot: walking, running, punching, shooting, and getting in and
// out of cars. Driving itself lives in vehicles.js; this is the person.
import { PLAYER, WANTED } from './config.js';
import { angleTo, clamp, dist2 } from './random.js';
import { moveWithCollision } from './city.js';
import { carHitsPoint } from './vehicles.js';
import { addHeat } from './wanted.js';
import { scarePeds } from './peds.js';

export function createPlayer(x, y) {
  return {
    x, y,
    angle: 0,
    health: PLAYER.health,
    cash: 0,
    ammo: PLAYER.pistolAmmoStart,
    weapon: 'fists',
    car: null,
    arrest: 0,
    invuln: 0,
    punchTimer: 0,
    shootTimer: 0,
    muzzle: 0,
    moving: false,
    runAnim: 0,
  };
}

// One on-foot step. Returns 'shoot' when the player fires (main spawns the bullet).
export function updatePlayerOnFoot(state, input, dt, now) {
  const p = state.player;
  const move = input.move();
  const len = Math.hypot(move.x, move.y);
  const speed = input.run() ? PLAYER.run : PLAYER.walk;
  p.moving = len > 0;
  if (len > 0) {
    const nx = move.x / len;
    const ny = move.y / len;
    moveWithCollision(state.city, p, nx * speed * dt, ny * speed * dt, PLAYER.radius);
    // Face the mouse when aiming, otherwise the direction of travel.
    const aim = screenToWorldAim(state, input);
    if (aim) p.angle = angleTo(p.x, p.y, aim.x, aim.y);
    else p.angle = Math.atan2(ny, nx);
    p.runAnim += dt * (input.run() ? 14 : 9);
  } else if (input.mouse.down) {
    const aim = screenToWorldAim(state, input);
    if (aim) p.angle = angleTo(p.x, p.y, aim.x, aim.y);
  }
  if (p.invuln > 0) p.invuln -= dt;
  if (p.punchTimer > 0) p.punchTimer -= dt;
  if (p.shootTimer > 0) p.shootTimer -= dt;
  if (p.muzzle > 0) p.muzzle -= dt;

  // Fire the pistol at the mouse; punches happen on click with fists out.
  if (input.takeClick()) {
    if (p.weapon === 'pistol' && p.ammo > 0 && p.shootTimer <= 0) {
      p.ammo -= 1;
      p.shootTimer = 0.28;
      p.muzzle = 0.06;
      state.audio.shot();
      scarePeds(state.peds, p.x, p.y, 500);
      addHeat(state.wanted, WANTED.shoot, now);
      return 'shoot';
    }
    if (p.weapon === 'fists' && p.punchTimer <= 0) {
      p.punchTimer = 0.4;
      state.audio.punch();
      // A punch lands on anything right in front of the player.
      const hx = p.x + Math.cos(p.angle) * 26;
      const hy = p.y + Math.sin(p.angle) * 26;
      for (const ped of state.peds) {
        if (!ped.dead && dist2(hx, hy, ped.x, ped.y) < 26 * 26) {
          ped.hp -= PLAYER.punchDamage;
          if (ped.hp <= 0) killPed(state, ped, now);
          state.events.push({ type: 'hit', x: ped.x, y: ped.y });
        }
      }
      for (const cop of state.police.foot) {
        if (dist2(hx, hy, cop.x, cop.y) < 26 * 26) {
          cop.hp -= PLAYER.punchDamage;
          if (cop.hp <= 0) addHeat(state.wanted, WANTED.killCop, now);
        }
      }
    }
  }
  return null;
}

export function screenToWorldAim(state, input) {
  const cam = state.camera;
  if (!cam) return null;
  return {
    x: cam.x + (input.mouse.x - cam.w / 2) / cam.zoom,
    y: cam.y + (input.mouse.y - cam.h / 2) / cam.zoom,
  };
}

// The nearest car the player can steal, within reach.
export function nearestStealableCar(state) {
  const p = state.player;
  let best = null;
  let bestD = PLAYER.interactRange * PLAYER.interactRange;
  for (const car of state.cars) {
    if (car.cop) continue;
    const d = dist2(p.x, p.y, car.x, car.y);
    if (d < bestD) {
      bestD = d;
      best = car;
    }
  }
  return best;
}

export function enterCar(state, car, now) {
  const p = state.player;
  p.car = car;
  car.driver = 'player';
  car.parked = false;
  // Stealing a car someone drives is a crime; an empty parked car is fair game.
  if (car.driver === 'npc') {
    addHeat(state.wanted, WANTED.stealCar, now);
    state.events.push({ type: 'stolen', x: car.x, y: car.y });
  }
  state.audio.pickup();
}

export function exitCar(state) {
  const p = state.player;
  if (!p.car) return;
  const car = p.car;
  car.driver = 'npc';
  // Step out beside the car, on the driver's side.
  const sx = car.x + Math.cos(car.angle + Math.PI / 2) * 34;
  const sy = car.y + Math.sin(car.angle + Math.PI / 2) * 34;
  p.x = sx;
  p.y = sy;
  p.car = null;
  p.angle = car.angle;
}

export function killPed(state, ped, now) {
  ped.dead = true;
  ped.deadTimer = 3;
  if (ped.role === 'guard') {
    addHeat(state.wanted, WANTED.killCop, now);
    state.missions.guardsLeft -= 1;
  } else addHeat(state.wanted, WANTED.hitPed, now);
  state.events.push({ type: 'hit', x: ped.x, y: ped.y });
  if (ped.role === 'guard' && state.rng.chance(0.6)) {
    state.pickups.push({ x: ped.x, y: ped.y, kind: 'ammo', amount: 12, t: 0 });
  }
}

export function damagePlayer(state, amount, now) {
  const p = state.player;
  if (p.invuln > 0) return;
  p.health -= amount;
  p.invuln = 0.4;
  if (p.health <= 0) {
    p.health = 0;
    state.events.push({ type: 'wasted', x: p.x, y: p.y });
  }
}

// A car running the player over (traffic or a cop ram).
export function carRunOverCheck(state, now) {
  const p = state.player;
  if (p.car || p.invuln > 0) return;
  for (const car of state.cars) {
    if (Math.abs(car.speed) < 60) continue;
    if (carHitsPoint(car, p.x, p.y, PLAYER.radius)) {
      damagePlayer(state, 22, now);
      state.events.push({ type: 'crash', x: p.x, y: p.y });
      state.audio.crash();
      break;
    }
  }
  for (const car of state.police.cars) {
    if (Math.abs(car.speed) < 60) continue;
    if (carHitsPoint(car, p.x, p.y, PLAYER.radius)) {
      damagePlayer(state, 18, now);
      state.events.push({ type: 'crash', x: p.x, y: p.y });
      break;
    }
  }
}
