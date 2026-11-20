// The story: five jobs for Mara Quinn, from a first stolen car to the top of
// Neon Bay, plus taxi fares on the side. Each mission is steps; each step is
// a place to reach, a thing to take, someone to deal with, or a chase to lose.
import { ECONOMY } from './config.js';
import { dist2 } from './random.js';
import { addHeat } from './wanted.js';
import { createCar, driveCar } from './vehicles.js';
import { createPed } from './peds.js';

export const MISSION_DEFS = [
  {
    id: 'm1', title: 'First Wheels', reward: 150,
    briefing: "Mara Quinn needs a driver. Steal a car — any car — and bring it to her garage.",
    steps: [
      { type: 'steal', text: 'Steal a car (walk up to one and press E)' },
      { type: 'deliver', x: 1560, y: 1220, radius: 90, text: "Drive it to Mara's Garage" },
    ],
  },
  {
    id: 'm2', title: 'The Pickup', reward: 300,
    briefing: 'A package is waiting at the docks. Pick it up on foot, then bring it to the garage. The harbour crew will not like it.',
    steps: [
      { type: 'goto', x: 3100, y: 420, radius: 70, text: 'Go to the docks' },
      { type: 'pickup', x: 3100, y: 420, radius: 46, text: 'Pick up the package on foot' },
      { type: 'deliver', x: 1560, y: 1220, radius: 90, text: "Deliver it to Mara's Garage" },
    ],
  },
  {
    id: 'm3', title: 'Getaway', reward: 450,
    briefing: 'The NBPD is onto you. Lose them, then get to the safehouse on South Beach. You have 75 seconds before the net closes.',
    steps: [
      { type: 'escape', seconds: 75, text: 'Lose the cops — stay out of sight' },
      { type: 'goto', x: 3100, y: 2150, radius: 80, text: 'Reach the South Beach safehouse' },
    ],
  },
  {
    id: 'm4', title: 'The Exchange', reward: 700,
    briefing: "Dario Kestrel's crew is moving the ledger through the marina. Take it from them — all four guards — then bring the case home.",
    steps: [
      { type: 'goto', x: 375, y: 2090, radius: 90, text: 'Go to the Marina Office' },
      { type: 'eliminate', count: 4, x: 375, y: 2090, radius: 260, text: 'Deal with the four Kestrel guards' },
      { type: 'pickup', x: 375, y: 2090, radius: 46, text: 'Grab the case' },
      { type: 'deliver', x: 1560, y: 1220, radius: 90, text: "Bring the case to Mara's Garage" },
    ],
  },
  {
    id: 'm5', title: 'Top of the Bay', reward: 1500,
    briefing: "Dario himself is running. Ram his car until it stops, take the ledger, and finish this. Mara is counting on you.",
    steps: [
      { type: 'ram', text: "Ram Dario's car until it stops" },
      { type: 'pickup', x: 0, y: 0, radius: 46, text: 'Take the ledger' },
      { type: 'deliver', x: 1560, y: 1220, radius: 90, text: "Bring the ledger to Mara's Garage" },
    ],
  },
];

export function createMissions() {
  return {
    index: 0,
    step: 0,
    started: false,
    timer: 0,
    guardsLeft: 0,
    dario: null,
    failed: false,
    complete: false,
    taxi: null,
    taxiTimer: 20,
    message: '',
    messageTimer: 0,
  };
}

export function currentMission(missions) {
  return MISSION_DEFS[missions.index] || null;
}

export function currentStep(missions) {
  const m = currentMission(missions);
  return m ? m.steps[missions.step] : null;
}

export function currentObjective(missions) {
  const m = currentMission(missions);
  if (!m) return { text: 'Free roam — take fares, find cash, stay out of trouble.', x: null, y: null };
  const s = m.steps[missions.step];
  if (!s) return { text: m.title, x: null, y: null };
  return { text: `${m.title}: ${s.text}`, x: s.x ?? null, y: s.y ?? null };
}

function say(missions, text) {
  missions.message = text;
  missions.messageTimer = 4;
}

export function startMission(state) {
  const m = currentMission(state.missions);
  if (!m) return;
  state.missions.started = true;
  state.missions.step = 0;
  state.missions.failed = false;
  say(state.missions, `${m.title} — ${m.briefing}`);
  state.audio.jingle();
  setupStep(state);
}

function setupStep(state) {
  const ms = state.missions;
  const step = currentStep(ms);
  if (!step) return;
  if (step.type === 'escape') {
    addHeat(state.wanted, 4, state.now);
    ms.timer = step.seconds;
  }
  if (step.type === 'eliminate') {
    ms.guardsLeft = step.count;
    for (let i = 0; i < step.count; i += 1) {
      const gx = step.x + (i % 2 === 0 ? -70 : 70) + (i < 2 ? 0 : 40);
      const gy = step.y + (i % 2 === 0 ? -40 : 60);
      const guard = createPed(gx, gy, { role: 'guard', hp: 60, color: '#3a3a3a' });
      state.peds.push(guard);
    }
    say(ms, 'Kestrel guards at the marina. Deal with them.');
  }
  if (step.type === 'ram') {
    const dario = createCar(1900, 1500, Math.PI, { kind: 'sports', color: '#ff2e63', driver: 'dario', hp: 160 });
    dario.flee = true;
    state.cars.push(dario);
    ms.dario = dario;
    say(ms, "That's Dario's car — the pink one. Ram it until it stops.");
  }
  if (step.type === 'pickup' && ms.index === 4) {
    // The ledger drops where Dario's car stopped.
    const d = ms.dario;
    if (d) {
      state.pickups.push({ x: d.x, y: d.y, kind: 'case', amount: 0, t: 0 });
      step.x = d.x;
      step.y = d.y;
    }
  }
}

function advanceStep(state) {
  const ms = state.missions;
  const m = currentMission(ms);
  ms.step += 1;
  if (ms.step >= m.steps.length) {
    // Mission complete: pay up and move on.
    state.player.cash += m.reward;
    state.missions.index += 1;
    state.missions.started = false;
    state.missions.step = 0;
    state.audio.jingle();
    if (state.missions.index >= MISSION_DEFS.length) {
      state.missions.complete = true;
      say(ms, `Story complete! You are the top driver in Neon Bay. +$${m.reward}`);
    } else {
      say(ms, `${m.title} complete! +$${m.reward} — press E to start the next job.`);
    }
    state.save();
    return;
  }
  state.audio.pickup();
  setupStep(state);
}

// Fail the current mission (only the timed escape can fail) and restart it.
export function failMission(state) {
  const ms = state.missions;
  ms.failed = true;
  ms.started = false;
  ms.step = 0;
  ms.dario = null;
  state.cars = state.cars.filter((c) => c.driver !== 'dario');
  say(ms, 'Mission failed — press E to try again.');
  state.audio.fail();
}

// One step of the mission logic; also runs the taxi side job.
export function updateMissions(state, dt) {
  const ms = state.missions;
  const p = state.player;
  if (ms.messageTimer > 0) ms.messageTimer -= dt;
  const m = currentMission(ms);
  const step = m && ms.started ? currentStep(ms) : null;

  if (step) {
    const px = p.car ? p.car.x : p.x;
    const py = p.car ? p.car.y : p.y;
    if (step.type === 'steal' && p.car) advanceStep(state);
    else if (step.type === 'goto' && dist2(px, py, step.x, step.y) < step.radius * step.radius) advanceStep(state);
    else if (step.type === 'deliver' && p.car && dist2(px, py, step.x, step.y) < step.radius * step.radius) advanceStep(state);
    else if (step.type === 'pickup' && !p.car && dist2(p.x, p.y, step.x, step.y) < step.radius * step.radius) {
      if (ms.index === 1) addHeat(state.wanted, 2, state.now);
      advanceStep(state);
    } else if (step.type === 'escape') {
      ms.timer -= dt;
      if (state.wanted.stars === 0) {
        say(ms, 'Clean — now get to the safehouse.');
        advanceStep(state);
      } else if (ms.timer <= 0) {
        failMission(state);
      }
    } else if (step.type === 'eliminate' && ms.guardsLeft <= 0) {
      state.pickups.push({ x: step.x, y: step.y, kind: 'case', amount: 0, t: 0 });
      advanceStep(state);
    } else if (step.type === 'ram' && ms.dario) {
      if (ms.dario.hp <= 0) {
        ms.dario.flee = false;
        ms.dario.speed = 0;
        say(ms, "Dario's car is stopped. Take the ledger.");
        advanceStep(state);
      }
    }
  }

  // Dario flees: steer his car along the roads, away from the player.
  if (ms.dario && ms.dario.flee && ms.dario.hp > 0) {
    const d = ms.dario;
    const away = { x: d.x + (d.x - p.x), y: d.y + (d.y - p.y) };
    const want = Math.atan2(away.y - d.y, away.x - d.x);
    const diff = ((want - d.angle + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
    const steer = diff > 0.15 ? 1 : diff < -0.15 ? -1 : 0;
    driveCar(d, { throttle: 1, steer, brake: false, handbrake: false, maxSpeed: 400 }, dt, state.city);
  }

  // Taxi fares: offered while driving, roughly every 40 seconds.
  if (!ms.taxi) {
    ms.taxiTimer -= dt;
    if (p.car && ms.taxiTimer <= 0) {
      ms.taxiTimer = 45;
      const spot = state.city.spots;
      const px = p.car.x;
      const py = p.car.y;
      const cand = [
        { x: 700, y: 300 }, { x: 2300, y: 1100 }, { x: 1100, y: 1900 },
        { x: 3100, y: 700 }, { x: 375, y: 2090 }, { x: 1500, y: 300 },
      ].filter((c) => dist2(px, py, c.x, c.y) > 400 * 400);
      if (cand.length) {
        const pick = cand[Math.floor(state.rng.next() * cand.length)];
        const ped = createPed(pick.x, pick.y, { role: 'passenger', color: '#f2c200' });
        state.peds.push(ped);
        ms.taxi = { phase: 'pickup', passenger: ped, fare: 0, dest: null };
        say(ms, 'Taxi fare: pick up the passenger in yellow.');
      }
    }
  } else if (ms.taxi.phase === 'pickup') {
    const t = ms.taxi;
    if (p.car && dist2(p.car.x, p.car.y, t.passenger.x, t.passenger.y) < 60 * 60) {
      const dests = [
        { x: 700, y: 1900 }, { x: 2700, y: 300 }, { x: 1500, y: 2300 },
        { x: 3400, y: 1500 }, { x: 1100, y: 700 },
      ];
      t.dest = dests[Math.floor(state.rng.next() * dests.length)];
      t.fare = ECONOMY.taxiFareMin + Math.floor(state.rng.next() * (ECONOMY.taxiFareMax - ECONOMY.taxiFareMin));
      t.phase = 'dropoff';
      t.passenger.dead = true;
      t.passenger.deadTimer = 0.1;
      say(ms, `Passenger aboard — take them to the marker. Fare $${t.fare}.`);
    }
  } else if (ms.taxi.phase === 'dropoff' && p.car) {
    if (dist2(p.car.x, p.car.y, ms.taxi.dest.x, ms.taxi.dest.y) < 80 * 80) {
      p.cash += ms.taxi.fare;
      state.audio.cash();
      say(ms, `Fare complete! +$${ms.taxi.fare}`);
      ms.taxi = null;
      ms.taxiTimer = 40;
    }
  }
}
