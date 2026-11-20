// The police response: patrol cars that chase and ram, foot cops that run the
// player down, and the busted/wasted outcomes.
import { WANTED } from './config.js';
import { angleTo, dist2 } from './random.js';
import { moveWithCollision, randomRoadPoint } from './city.js';
import { createCar, driveCar } from './vehicles.js';

export function createPolice() {
  return { cars: [], foot: [], spawnTimer: 0, siren: false };
}

function spawnCopCar(state, rng) {
  const p = state.player;
  const spot = randomRoadPoint(rng, p.x, p.y, 520);
  const car = createCar(spot.x, spot.y, angleTo(spot.x, spot.y, p.x, p.y), {
    kind: 'sedan', color: '#2b5fd9', cop: true, driver: 'cop', hp: 140,
  });
  car.road = null;
  state.police.cars.push(car);
  return car;
}

function spawnFootCop(state, rng) {
  const p = state.player;
  const spot = randomRoadPoint(rng, p.x, p.y, 320);
  const cop = {
    x: spot.x, y: spot.y, angle: 0, hp: 60, onFoot: true,
    arrest: 0, speed: 235, color: '#2b5fd9', role: 'cop',
  };
  state.police.foot.push(cop);
  return cop;
}

// Keep the right number of units on the street for the current stars.
export function updatePolice(state, rng, dt) {
  const wanted = state.wanted.stars;
  const pol = state.police;
  pol.spawnTimer -= dt;
  const wantCars = Math.min(WANTED.maxCopCars, wanted * WANTED.copCarsPerStar);
  if (wanted > 0 && pol.cars.length < wantCars && pol.spawnTimer <= 0) {
    spawnCopCar(state, rng);
    pol.spawnTimer = 1.2;
  }
  if (wanted >= 3 && pol.foot.length < 2 && pol.spawnTimer <= 0) {
    spawnFootCop(state, rng);
    pol.spawnTimer = 2;
  }
  if (wanted === 0) {
    pol.cars.length = 0;
    pol.foot.length = 0;
    pol.siren = false;
    return;
  }

  const p = state.player;
  const playerCar = p.car;
  const px = playerCar ? playerCar.x : p.x;
  const py = playerCar ? playerCar.y : p.y;

  // Cop cars steer at the player and ram; a stalled one reverses out.
  for (const car of pol.cars) {
    const want = angleTo(car.x, car.y, px, py);
    const diff = ((want - car.angle + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
    const steer = diff > 0.15 ? 1 : diff < -0.15 ? -1 : 0;
    const d = Math.hypot(px - car.x, py - car.y);
    const control = {
      throttle: d > 60 ? 1 : 0.3,
      steer,
      brake: false,
      handbrake: false,
      maxSpeed: 380 + wanted * 18,
    };
    const before = { x: car.x, y: car.y };
    driveCar(car, control, dt, state.city);
    if (Math.hypot(car.x - before.x, car.y - before.y) < 2 && Math.abs(car.speed) < 30) {
      car.stuck = (car.stuck || 0) + dt;
      if (car.stuck > 1.2) {
        car.angle += Math.PI * 0.7;
        car.speed = -120;
        car.stuck = 0;
      }
    }
    // Ramming the player's car damages it.
    if (playerCar && dist2(car.x, car.y, playerCar.x, playerCar.y) < 42 * 42) {
      if (Math.abs(car.speed) > 120 || Math.abs(playerCar.speed) > 120) {
        playerCar.hp -= 5 * dt;
        car.hp -= 2 * dt;
        state.events.push({ type: 'crash', x: car.x, y: car.y });
      }
    }
    // A cop car close on foot pins the player down.
    if (!playerCar && dist2(car.x, car.y, p.x, p.y) < 30 * 30) {
      p.arrest = (p.arrest || 0) + dt;
    }
  }

  // Foot cops run the player down; staying on the player arrests them.
  for (const cop of pol.foot) {
    const a = angleTo(cop.x, cop.y, p.x, p.y);
    cop.angle = a;
    const d = Math.hypot(p.x - cop.x, p.y - cop.y);
    if (!playerCar && d < 240) {
      moveWithCollision(state.city, cop, Math.cos(a) * cop.speed * dt, Math.sin(a) * cop.speed * dt, 12);
      if (d < 30) {
        p.arrest = (p.arrest || 0) + dt;
        cop.arrest = (cop.arrest || 0) + dt;
      }
    } else if (!playerCar) {
      // Walk the last stretch toward the player.
      moveWithCollision(state.city, cop, Math.cos(a) * 120 * dt, Math.sin(a) * 120 * dt, 12);
    } else {
      // Player drove off: the foot cop gives up after a while.
      cop.giveUp = (cop.giveUp || 0) + dt;
    }
  }
  pol.foot = pol.foot.filter((c) => (c.giveUp || 0) < 6 && c.hp > 0);
  pol.cars = pol.cars.filter((c) => c.hp > 0);
  pol.siren = pol.cars.length > 0 || pol.foot.length > 0;
}

// Is any cop close enough to see the player right now?
export function anyCopSees(state) {
  const p = state.player;
  const px = p.car ? p.car.x : p.x;
  const py = p.car ? p.car.y : p.y;
  for (const car of state.police.cars) {
    if (dist2(car.x, car.y, px, py) < 600 * 600) return true;
  }
  for (const cop of state.police.foot) {
    if (dist2(cop.x, cop.y, px, py) < 420 * 420) return true;
  }
  return false;
}
