// Cars: arcade driving physics, traffic that follows the roads, parked cars,
// and the shared helpers for ramming and damage.
import { AVENUES, CAR_COLORS, DRIVE, ROAD_W, SPORTS_COLORS, STREETS, WORLD_H, WORLD_W } from './config.js';
import { angleLerp, angleTo, clamp, dist2 } from './random.js';
import { moveWithCollision, solidAt } from './city.js';

let nextCarId = 1;

export function createCar(x, y, angle, opts) {
  const o = opts || {};
  return {
    id: nextCarId,
    x, y, angle,
    speed: 0,
    color: o.color || CAR_COLORS[o.kind === 'sports' ? 0 : Math.floor(Math.random() * CAR_COLORS.length)],
    kind: o.kind || 'sedan',
    hp: o.hp || 100,
    maxHp: o.hp || 100,
    driver: o.driver || 'npc',
    taxi: !!o.taxi,
    cop: !!o.cop,
    parked: !!o.parked,
    honk: 0,
    // Traffic state: which road it follows and where it is headed.
    road: o.road || null,
    target: o.target || null,
    stuck: 0,
    smoke: 0,
    skid: [],
  };
}

export function carCorners(car) {
  const l = DRIVE.carLength / 2;
  const w = DRIVE.carWidth / 2;
  const c = Math.cos(car.angle);
  const s = Math.sin(car.angle);
  return [
    { x: car.x + c * l - s * w, y: car.y + s * l + c * w },
    { x: car.x + c * l + s * w, y: car.y + s * l - c * w },
    { x: car.x - c * l + s * w, y: car.y - s * l - c * w },
    { x: car.x - c * l - s * w, y: car.y - s * l + c * w },
  ];
}

// One physics step for a car driven by `control` {throttle -1..1, steer -1..1, brake, handbrake}.
export function driveCar(car, control, dt, city) {
  const forwardX = Math.cos(car.angle);
  const forwardY = Math.sin(car.angle);
  const forwardSpeed = car.speed;
  const topSpeed = control.maxSpeed || DRIVE.maxSpeed;
  if (control.throttle > 0) car.speed += DRIVE.accel * control.throttle * dt;
  else if (control.throttle < 0) {
    if (car.speed > 0) car.speed -= DRIVE.brake * -control.throttle * dt;
    else car.speed -= DRIVE.reverse * -control.throttle * dt;
  }
  if (control.brake) car.speed -= Math.sign(car.speed) * DRIVE.brake * dt;
  if (control.handbrake) car.speed -= Math.sign(car.speed) * DRIVE.brake * 0.6 * dt;
  // Rolling drag, then clamp.
  car.speed -= car.speed * 0.55 * dt;
  car.speed = clamp(car.speed, -DRIVE.maxReverse, topSpeed);
  if (Math.abs(car.speed) < 2 && !control.throttle && !control.brake) car.speed = 0;
  // Steering bites harder the faster the car goes, up to a point.
  const steerAuthority = clamp(Math.abs(car.speed) / 140, 0, 1) * DRIVE.steer;
  car.angle += control.steer * steerAuthority * Math.sign(car.speed || 1) * dt;
  // Grip: the car mostly goes where it points, with a little sideways slide.
  const grip = control.handbrake ? DRIVE.handbrakeGrip : DRIVE.grip;
  const vx = forwardX * forwardSpeed;
  const vy = forwardY * forwardSpeed;
  const nx = Math.cos(car.angle);
  const ny = Math.sin(car.angle);
  const along = vx * nx + vy * ny;
  const sideX = vx - nx * along;
  const sideY = vy - ny * along;
  const slide = Math.exp(-grip * dt) * DRIVE.drift;
  const moveX = (nx * along + sideX * slide) * dt;
  const moveY = (ny * along + sideY * slide) * dt;
  const before = { x: car.x, y: car.y };
  moveWithCollision(city, car, moveX, moveY, DRIVE.carRadius);
  const moved = Math.hypot(car.x - before.x, car.y - before.y);
  car.hitCooldown = Math.max(0, (car.hitCooldown || 0) - dt);
  // A hard hit costs health — but only once per half second, not every frame of a scrape.
  if (car.hitCooldown <= 0 && moved < Math.abs(moveX) + Math.abs(moveY) - 4 && Math.abs(car.speed) > DRIVE.damageSpeed) {
    car.hp -= 4;
    car.smoke = Math.max(car.smoke, 0.4);
    car.hitCooldown = 0.5;
  }
  if (control.handbrake && Math.abs(car.speed) > 120 && Math.random() < 0.5) {
    car.skid.push({ x: car.x, y: car.y, a: car.angle, t: 1 });
    if (car.skid.length > 40) car.skid.shift();
  }
  for (const s of car.skid) s.t -= dt * 0.25;
  car.skid = car.skid.filter((s) => s.t > 0);
  if (car.hp < 40) car.smoke = Math.max(car.smoke, 0.2);
}

// Traffic cars pick a road, drive along it, and turn at intersections.
function pickTarget(car, rng) {
  const vertical = car.road === 'v';
  const options = [];
  if (vertical) {
    for (const sy of STREETS) options.push({ x: car.roadValue, y: sy });
  } else {
    for (const ax of AVENUES) options.push({ x: ax, y: car.roadValue });
  }
  // Next intersection ahead in the direction of travel.
  const ahead = options.filter((p) => {
    if (vertical) return car.dir > 0 ? p.y > car.y + 30 : p.y < car.y - 30;
    return car.dir > 0 ? p.x > car.x + 30 : p.x < car.x - 30;
  });
  const next = ahead.length ? ahead[0] : options[options.length - 1];
  // At the intersection, sometimes turn onto the crossing road.
  if (rng.chance(0.35)) {
    const cross = vertical ? { x: rng.pick(AVENUES), y: next.y } : { x: next.x, y: rng.pick(STREETS) };
    car.target = cross;
    car.turnAt = { x: next.x, y: next.y };
  } else {
    car.target = next;
    car.turnAt = null;
  }
}

export function spawnTraffic(city, rng, count) {
  const cars = [];
  for (let i = 0; i < count; i += 1) {
    const vertical = rng.chance(0.5);
    const x = vertical ? rng.pick(AVENUES) + (rng.chance(0.5) ? -24 : 24) : rng.range(300, WORLD_W - 100);
    const y = vertical ? rng.range(300, WORLD_H - 100) : rng.pick(STREETS) + (rng.chance(0.5) ? -24 : 24);
    const angle = vertical ? (rng.chance(0.5) ? Math.PI / 2 : -Math.PI / 2) : (rng.chance(0.5) ? 0 : Math.PI);
    const car = createCar(x, y, angle, { kind: rng.chance(0.12) ? 'sports' : 'sedan', taxi: rng.chance(0.18) });
    if (car.taxi) car.color = '#f2c200';
    if (car.kind === 'sports') car.color = rng.pick(SPORTS_COLORS);
    car.road = vertical ? 'v' : 'h';
    car.roadValue = vertical ? x : y;
    car.dir = vertical ? (angle > 0 ? 1 : -1) : (angle === 0 ? 1 : -1);
    car.speed = rng.range(120, 200);
    pickTarget(car, rng);
    cars.push(car);
  }
  return cars;
}

export function spawnParked(city, rng, count) {
  const cars = [];
  for (let i = 0; i < count; i += 1) {
    const vertical = rng.chance(0.5);
    const road = vertical ? rng.pick(AVENUES) : rng.pick(STREETS);
    const along = rng.range(320, (vertical ? WORLD_H : WORLD_W) - 120);
    const side = rng.chance(0.5) ? 1 : -1;
    const x = vertical ? road + side * (ROAD_W / 2 - 14) : along;
    const y = vertical ? along : road + side * (ROAD_W / 2 - 14);
    const angle = vertical ? (side > 0 ? Math.PI / 2 : -Math.PI / 2) : (side > 0 ? 0 : Math.PI);
    if (solidAt(city, x, y, 20)) continue;
    const car = createCar(x, y, angle, { kind: rng.chance(0.1) ? 'sports' : 'sedan', parked: true, driver: 'none' });
    if (car.kind === 'sports') car.color = rng.pick(SPORTS_COLORS);
    cars.push(car);
  }
  return cars;
}

// Move every traffic car one step; brake when another car is right ahead.
export function updateTraffic(cars, city, rng, dt, allCars) {
  for (const car of cars) {
    if (car.driver !== 'npc' || car.cop) continue;
    const tx = car.target ? car.target.x : car.x;
    const ty = car.target ? car.target.y : car.y;
    const d = Math.hypot(tx - car.x, ty - car.y);
    if (d < 26) {
      if (car.turnAt) {
        car.road = car.road === 'v' ? 'h' : 'v';
        car.roadValue = car.road === 'v' ? car.turnAt.x : car.turnAt.y;
        car.dir = car.road === 'v' ? (ty > car.y ? 1 : -1) : (tx > car.x ? 1 : -1);
        car.turnAt = null;
      }
      pickTarget(car, rng);
    }
    const want = angleTo(car.x, car.y, tx, ty);
    let steer = angleLerp(car.angle, want, 1) > 0 ? 1 : -1;
    const diff = Math.abs(((want - car.angle + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
    if (diff < 0.08) steer = 0;
    // Brake for the car ahead.
    let blocked = false;
    for (const o of allCars) {
      if (o === car) continue;
      const dx = o.x - car.x;
      const dy = o.y - car.y;
      const ahead = dx * Math.cos(car.angle) + dy * Math.sin(car.angle);
      const side = Math.abs(-dx * Math.sin(car.angle) + dy * Math.cos(car.angle));
      if (ahead > 0 && ahead < 70 && side < 26) {
        blocked = true;
        break;
      }
    }
    const control = { throttle: blocked ? 0 : 0.55, steer, brake: blocked, handbrake: false, maxSpeed: 210 };
    driveCar(car, control, dt, city);
    if (Math.abs(car.speed) < 5) car.stuck += dt;
    else car.stuck = 0;
    if (car.stuck > 4) pickTarget(car, rng);
  }
}

// Simple circle-vs-car collision for peds and the player on foot.
export function carHitsPoint(car, x, y, r) {
  const c = Math.cos(-car.angle);
  const s = Math.sin(-car.angle);
  const dx = x - car.x;
  const dy = y - car.y;
  const lx = dx * c - dy * s;
  const ly = dx * s + dy * c;
  return Math.abs(lx) < DRIVE.carLength / 2 + r && Math.abs(ly) < DRIVE.carWidth / 2 + r;
}

export function carsOverlap(a, b) {
  return dist2(a.x, a.y, b.x, b.y) < (DRIVE.carLength / 2 + DRIVE.carLength / 2) * (DRIVE.carLength / 2 + DRIVE.carLength / 2) * 0.45;
}
