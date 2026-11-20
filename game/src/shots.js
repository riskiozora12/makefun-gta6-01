// The screenshot scenes behind ?shot=chase|downtown|marina|coast. Each one
// sets the world up from a fresh state and plays the real rules forward for a
// fixed number of steps with a simple autopilot, so the frame is what a short
// game really looks like — and the same seed always gives the same frame.
// The autopilot drives toward the mission marker and brakes for traffic;
// the marina scene walks the player into the guards and fires the pistol.
import { STEP } from './config.js';
import { currentObjective, startMission } from './missions.js';
import { createCar } from './vehicles.js';
import { angleTo } from './random.js';

const SHOT_SECONDS = { chase: 14, downtown: 18, marina: 9, coast: 12 };

function driveToward(state, tx, ty) {
  const p = state.player;
  const car = p.car;
  if (!car) return;
  const want = angleTo(car.x, car.y, tx, ty);
  const diff = ((want - car.angle + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
  const steer = diff > 0.2 ? 1 : diff < -0.2 ? -1 : 0;
  const d = Math.hypot(tx - car.x, ty - car.y);
  const control = {
    throttle: d > 80 ? 1 : 0.4,
    steer,
    brake: d < 60,
    handbrake: false,
    maxSpeed: 400,
  };
  state._driveControl = control;
}

// Follow a list of road waypoints in order, so the car stays on the roads
// instead of cutting across blocks and buildings.
function driveRoute(state, waypoints) {
  if (!state._route) state._route = { points: waypoints, i: 0 };
  const r = state._route;
  const car = state.player.car;
  if (!car) return;
  let target = r.points[r.i];
  const d = Math.hypot(target.x - car.x, target.y - car.y);
  if (d < 70 && r.i < r.points.length - 1) {
    r.i += 1;
    target = r.points[r.i];
  }
  driveToward(state, target.x, target.y);
}

function fireAtNearestGuard(state) {
  const p = state.player;
  let best = null;
  let bestD = Infinity;
  for (const ped of state.peds) {
    if (ped.role !== 'guard' || ped.dead) continue;
    const d = (ped.x - p.x) * (ped.x - p.x) + (ped.y - p.y) * (ped.y - p.y);
    if (d < bestD) {
      bestD = d;
      best = ped;
    }
  }
  if (best && bestD < 480 * 480) {
    p.angle = angleTo(p.x, p.y, best.x, best.y);
    if (p.ammo > 0 && p.shootTimer <= 0) {
      p.ammo -= 1;
      p.shootTimer = 0.28;
      p.muzzle = 0.06;
      state.bullets.push({ x: p.x + Math.cos(p.angle) * 20, y: p.y + Math.sin(p.angle) * 20, angle: p.angle, speed: 900, life: 0.6, fromPlayer: true });
      best.hp -= 34;
      if (best.hp <= 0) {
        best.dead = true;
        best.deadTimer = 3;
        state.missions.guardsLeft -= 1;
      }
    }
  }
}

// Stage one named scene on a fresh world; returns nothing — main.js paints it.
export function stageShot(name, state) {
  state.resetWorld();
  state._route = null;
  const cam = state.camera;
  cam.zoom = 0.9;
  if (name === 'chase') {
    // Mission 3, mid-escape: 3 wanted stars, two cop cars closing in.
    // The route runs east along street 1500, then south to the safehouse.
    state.missions.index = 2;
    startMission(state);
    const car = createCar(1500, 1500, 0, { kind: 'sports', color: '#ff2e63', hp: 400 });
    state.cars.push(car);
    state.player.car = car;
    car.driver = 'player';
    state.player.x = car.x;
    state.player.y = car.y;
    // The escape step already raised 3 wanted stars; the cops close in from here.
    for (let i = 0; i < 8 / STEP; i += 1) {
      driveRoute(state, [{ x: 2700, y: 1500 }, { x: 2700, y: 2150 }, { x: 3100, y: 2150 }]);
      state.step(STEP, state._driveControl);
    }
  } else if (name === 'downtown') {
    // Cruising Downtown in traffic with a taxi fare on the meter.
    // South down avenue 1500, then east along street 1900 to the fare marker.
    state.missions.index = 5;
    const car = createCar(1500, 1300, Math.PI / 2, { kind: 'sedan', color: '#2f6fc2', taxi: true });
    state.cars.push(car);
    state.player.car = car;
    car.driver = 'player';
    state.player.x = car.x;
    state.player.y = car.y;
    state.player.cash = 1240;
    state.missions.taxi = {
      phase: 'dropoff',
      passenger: null,
      fare: 65,
      dest: { x: 3100, y: 1900 },
    };
    state.missions.message = 'Taxi fare — take them to the marker. Fare $65.';
    state.missions.messageTimer = 99;
    // Six seconds in, the car is still en route to the fare marker.
    for (let i = 0; i < 6 / STEP; i += 1) {
      driveRoute(state, [{ x: 1500, y: 1900 }, { x: 3100, y: 1900 }]);
      state.step(STEP, state._driveControl);
    }
  } else if (name === 'marina') {
    // Mission 4: on foot at the marina, pistol out, guards ahead.
    state.missions.index = 3;
    startMission(state);
    state.player.x = 500;
    state.player.y = 2090;
    state.player.weapon = 'pistol';
    state.player.ammo = 48;
    // Walk the player toward the guards, firing as they close.
    for (let i = 0; i < 9 / STEP; i += 1) {
      const p = state.player;
      const gx = 375;
      const gy = 2090;
      const d = Math.hypot(gx - p.x, gy - p.y);
      if (d > 60) {
        const a = angleTo(p.x, p.y, gx, gy);
        state._footMove = { x: Math.cos(a), y: Math.sin(a) };
      } else {
        state._footMove = { x: 0, y: 0 };
      }
      fireAtNearestGuard(state);
      state.step(STEP, null);
    }
    state._footMove = null;
  } else {
    // Coast: golden-hour drive west along South Beach, ending by the sea.
    state.missions.index = 5;
    const car = createCar(2700, 2300, Math.PI, { kind: 'sports', color: '#08d9d6' });
    state.cars.push(car);
    state.player.car = car;
    car.driver = 'player';
    state.player.x = car.x;
    state.player.y = car.y;
    state.player.cash = 2860;
    state.missions.message = 'Free roam — South Beach. Find cash, take fares, stay sharp.';
    state.missions.messageTimer = 99;
    for (let i = 0; i < 10 / STEP; i += 1) {
      driveToward(state, 350, 2300);
      state.step(STEP, state._driveControl);
    }
  }
  state.objective = currentObjective(state.missions);
  // Centre the camera on the player for the frame.
  const p = state.player;
  cam.x = p.car ? p.car.x : p.x;
  cam.y = p.car ? p.car.y : p.y;
  cam.w = state.canvasW;
  cam.h = state.canvasH;
}
