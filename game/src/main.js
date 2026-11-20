// Neon Bay: boot and the one loop. The world advances in fixed 1/60 s steps;
// input is read every frame; the renderer paints what is there. Screens:
// title, play, paused, wasted, busted.
//
// ?seed=N fixes the city. ?shot=chase|downtown|marina|coast (with &seed=N)
// stages that scene instead of running the loop, paints it twice and sets
// window.__shotReady for a screenshot.
import { ECONOMY, PARKED_CARS, PEDS, PLAYER, STEP, TRAFFIC_CARS, WORLD_H, WORLD_W } from './config.js';
import { createRandom, dist2, lerp } from './random.js';
import { buildCity, solidAt } from './city.js';
import { createAudio } from './audio.js';
import { ACTION_CONFIRM, ACTION_INTERACT, ACTION_MUTE, ACTION_PAUSE, ACTION_WEAPON, createInput } from './input.js';
import { driveCar, spawnParked, spawnTraffic, updateTraffic } from './vehicles.js';
import { spawnPeds, updatePeds } from './peds.js';
import { createPlayer, carRunOverCheck, damagePlayer, enterCar, exitCar, killPed, nearestStealableCar, updatePlayerOnFoot } from './player.js';
import { createWanted, clearWanted, updateWanted } from './wanted.js';
import { anyCopSees, createPolice, updatePolice } from './police.js';
import { createMissions, currentMission, currentObjective, startMission, updateMissions } from './missions.js';
import { createRenderer } from './render.js';
import { drawHUD } from './hud.js';
import { loadSave, writeSave } from './save.js';
import { stageShot } from './shots.js';

const MAX_FRAME = 0.25;
const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : 1337;

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const menuEl = document.getElementById('menu');
const pauseEl = document.getElementById('pause');
const overEl = document.getElementById('over');
const overTitle = document.getElementById('over-title');
const overText = document.getElementById('over-text');
const startBtn = document.getElementById('start-btn');
const continueBtn = document.getElementById('continue-btn');
const helpBtn = document.getElementById('help-btn');
const helpEl = document.getElementById('help');
const resumeBtn = document.getElementById('resume-btn');
const retryBtn = document.getElementById('retry-btn');
const menuBtn = document.getElementById('menu-btn');

const rng = createRandom(seed);
const audio = createAudio();
const input = createInput(canvas);
const renderer = createRenderer(canvas);
const hudCtx = canvas.getContext('2d');

// The whole game in one object, so every module reads and writes the same world.
const state = {
  rng, audio, now: 0, playTime: 0, clock: '16:40', clockMinutes: 16 * 60 + 40,
  city: null, player: null, cars: [], peds: [], police: null, wanted: null,
  missions: null, bullets: [], particles: [], pickups: [], events: [],
  camera: { x: 1500, y: 1300, zoom: 1, w: 1280, h: 720 },
  canvasW: 1280, canvasH: 720,
  objective: null, bestCash: 0, saveTimer: 0,
  resetWorld, step, save,
};

function resetWorld() {
  const city = buildCity(rng);
  const player = createPlayer(city.spots.playerStart.x, city.spots.playerStart.y);
  const saved = loadSave();
  if (saved) {
    player.cash = saved.cash;
    state.bestCash = saved.bestCash;
    if (saved.muted) audio.setMuted(true);
  } else {
    player.cash = ECONOMY.startCash;
  }
  state.city = city;
  state.player = player;
  state.cars = [...spawnTraffic(city, rng, TRAFFIC_CARS), ...spawnParked(city, rng, PARKED_CARS)];
  state.peds = spawnPeds(city, rng, PEDS);
  state.police = createPolice();
  state.wanted = createWanted();
  state.missions = createMissions();
  if (saved) state.missions.index = Math.min(saved.missionIndex, 5);
  state.bullets = [];
  state.particles = [];
  state.pickups = [];
  state.events = [];
  state.now = 0;
  state.playTime = 0;
  // Cash bundles scattered around the city.
  const spots = [
    { x: 700, y: 1900 }, { x: 2300, y: 300 }, { x: 3100, y: 1500 },
    { x: 1100, y: 700 }, { x: 1900, y: 2300 }, { x: 350, y: 900 },
  ];
  for (const s of spots) state.pickups.push({ x: s.x, y: s.y, kind: 'cash', amount: ECONOMY.cashPickup, t: 0 });
  state.objective = currentObjective(state.missions);
}

function save() {
  writeSave(state);
}

// One fixed step of the whole simulation.
function step(dt, driveControl) {
  state.now += dt;
  state.playTime += dt;
  state.clockMinutes += dt * 0.5;
  const hh = Math.floor(state.clockMinutes / 60) % 24;
  const mm = Math.floor(state.clockMinutes % 60);
  state.clock = `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
  const p = state.player;

  // The player: driving, or on foot.
  if (p.car) {
    const move = driveControl ? { x: 0, y: 0 } : input.move();
    const control = driveControl || {
      throttle: move.y < 0 ? 1 : move.y > 0 ? -0.8 : 0,
      steer: move.x,
      brake: move.y > 0,
      handbrake: input.handbrake(),
      maxSpeed: undefined,
    };
    driveCar(p.car, control, dt, state.city);
    p.x = p.car.x;
    p.y = p.car.y;
    p.angle = p.car.angle;
    audio.engine(Math.abs(p.car.speed) / 430, true);
    if (p.car.hp <= 0) {
      // The car is wrecked: the player climbs out, hurt.
      state.events.push({ type: 'crash', x: p.car.x, y: p.car.y });
      state.cars = state.cars.filter((c) => c !== p.car);
      exitCar(state);
      damagePlayer(state, 25, state.now);
      audio.crash();
    }
  } else {
    audio.engine(0, false);
    const shotFired = updatePlayerOnFoot(state, input, dt, state.now);
    if (shotFired === 'shoot') {
      state.bullets.push({
        x: p.x + Math.cos(p.angle) * 20, y: p.y + Math.sin(p.angle) * 20,
        angle: p.angle, speed: 900, life: 0.6, fromPlayer: true,
      });
    }
    // Foot-move override used by the screenshot staging.
    if (state._footMove) {
      const fm = state._footMove;
      p.x += fm.x * PLAYER.walk * dt;
      p.y += fm.y * PLAYER.walk * dt;
    }
  }

  // Guards shoot back when the player is close.
  for (const ped of state.peds) {
    if (ped.role !== 'guard' || ped.dead) continue;
    ped.shootTimer = (ped.shootTimer || 0) - dt;
    const d = Math.hypot(p.x - ped.x, p.y - ped.y);
    if (d < 340 && ped.shootTimer <= 0 && !p.car) {
      ped.shootTimer = 1.4;
      const a = Math.atan2(p.y - ped.y, p.x - ped.x) + (rng.next() - 0.5) * 0.35;
      state.bullets.push({ x: ped.x, y: ped.y, angle: a, speed: 700, life: 0.7, fromPlayer: false });
      audio.shot();
    }
  }

  // Bullets fly, hit people, cars and walls.
  for (const b of state.bullets) {
    b.x += Math.cos(b.angle) * b.speed * dt;
    b.y += Math.sin(b.angle) * b.speed * dt;
    b.life -= dt;
    let dead = b.life <= 0;
    if (!dead) {
      if (solidAt(state.city, b.x, b.y, 2) || b.x < 0 || b.x > WORLD_W || b.y < 0 || b.y > WORLD_H) dead = true;
    }
    if (!dead && b.fromPlayer) {
      for (const ped of state.peds) {
        if (ped.dead) continue;
        if (dist2(b.x, b.y, ped.x, ped.y) < 14 * 14) {
          ped.hp -= 34;
          state.events.push({ type: 'hit', x: ped.x, y: ped.y });
          if (ped.hp <= 0) killPed(state, ped, state.now);
          dead = true;
          break;
        }
      }
      if (!dead) {
        for (const cop of state.police.foot) {
          if (dist2(b.x, b.y, cop.x, cop.y) < 14 * 14) {
            cop.hp -= 34;
            state.events.push({ type: 'hit', x: cop.x, y: cop.y });
            dead = true;
            break;
          }
        }
      }
      if (!dead) {
        for (const car of [...state.cars, ...state.police.cars]) {
          if (dist2(b.x, b.y, car.x, car.y) < 26 * 26) {
            car.hp -= 12;
            state.events.push({ type: 'hit', x: b.x, y: b.y });
            dead = true;
            break;
          }
        }
      }
    }
    if (!dead && !b.fromPlayer) {
      if (!p.car && dist2(b.x, b.y, p.x, p.y) < 14 * 14) {
        damagePlayer(state, 9, state.now);
        dead = true;
      } else if (p.car && dist2(b.x, b.y, p.car.x, p.car.y) < 26 * 26) {
        p.car.hp -= 4;
        dead = true;
      }
    }
    if (dead) {
      state.particles.push({ x: b.x, y: b.y, life: 0.3, max: 0.3, size: 4, color: '#ffe08a' });
    }
  }
  state.bullets = state.bullets.filter((b) => b.life > 0);

  // Traffic, crowds, police, wanted, missions.
  updateTraffic(state.cars.filter((c) => c.driver === 'npc'), state.city, rng, dt, state.cars);
  updatePeds(state.peds, state.city, rng, dt, [{ x: p.x, y: p.y }]);
  updatePolice(state, rng, dt);
  updateWanted(state.wanted, dt, anyCopSees(state));
  updateMissions(state, dt);
  carRunOverCheck(state, state.now);

  // The player's car bumping into traffic and cop cars.
  if (p.car) {
    for (const other of state.cars) {
      if (other === p.car || other.driver === 'player') continue;
      const d = Math.hypot(other.x - p.car.x, other.y - p.car.y);
      if (d < 42 && d > 0.01) {
        const push = (42 - d) / 2;
        const nx = (other.x - p.car.x) / d;
        const ny = (other.y - p.car.y) / d;
        other.x += nx * push;
        other.y += ny * push;
        p.car.x -= nx * push;
        p.car.y -= ny * push;
        const impact = Math.abs(p.car.speed - other.speed);
        if (impact > 160 && (p.car.hitCooldown || 0) <= 0) {
          p.car.hp -= 5;
          other.hp -= 5;
          p.car.hitCooldown = 0.5;
          state.events.push({ type: 'crash', x: p.car.x, y: p.car.y });
          audio.crash();
        }
      }
    }
  }

  // Foot cops landing punches on the player.
  if (!p.car) {
    for (const cop of state.police.foot) {
      cop.punchTimer = (cop.punchTimer || 0) - dt;
      if (dist2(cop.x, cop.y, p.x, p.y) < 26 * 26 && cop.punchTimer <= 0) {
        cop.punchTimer = 0.9;
        damagePlayer(state, 8, state.now);
      }
    }
  }

  // Pickups: cash, ammo, the case.
  for (const pk of state.pickups) {
    pk.t += dt;
    const px = p.car ? p.car.x : p.x;
    const py = p.car ? p.car.y : p.y;
    if (dist2(px, py, pk.x, pk.y) < 34 * 34) {
      if (pk.kind === 'cash') {
        p.cash += pk.amount;
        audio.cash();
        state.events.push({ type: 'cash', x: pk.x, y: pk.y });
      } else if (pk.kind === 'ammo') {
        p.ammo += pk.amount;
        audio.pickup();
      } else {
        audio.pickup();
      }
      pk.taken = true;
    }
  }
  state.pickups = state.pickups.filter((pk) => !pk.taken);

  // Particles.
  for (const pt of state.particles) {
    pt.life -= dt;
    pt.x += (pt.vx || 0) * dt;
    pt.y += (pt.vy || 0) * dt;
  }
  state.particles = state.particles.filter((pt) => pt.life > 0);

  // Events: sounds, particles, messages.
  for (const ev of state.events) {
    if (ev.type === 'crash') {
      for (let i = 0; i < 6; i += 1) {
        state.particles.push({ x: ev.x, y: ev.y, vx: (rng.next() - 0.5) * 120, vy: (rng.next() - 0.5) * 120, life: 0.5, max: 0.5, size: 4, color: '#888888' });
      }
    } else if (ev.type === 'hit') {
      for (let i = 0; i < 5; i += 1) {
        state.particles.push({ x: ev.x, y: ev.y, vx: (rng.next() - 0.5) * 160, vy: (rng.next() - 0.5) * 160, life: 0.35, max: 0.35, size: 3, color: '#ffd23c' });
      }
    } else if (ev.type === 'cash') {
      state.missions.message = `+$${ECONOMY.cashPickup} cash found.`;
      state.missions.messageTimer = 2;
    }
  }
  state.events.length = 0;

  // Siren when cops are near; the camera follows the player.
  audio.siren(state.police.siren);
  const tx = p.car ? p.car.x : p.x;
  const ty = p.car ? p.car.y : p.y;
  const cam = state.camera;
  cam.x = lerp(cam.x, tx, 1 - Math.pow(0.001, dt));
  cam.y = lerp(cam.y, ty, 1 - Math.pow(0.001, dt));
  const wantZoom = p.car ? 0.82 : 1.0;
  cam.zoom = lerp(cam.zoom, wantZoom, 1 - Math.pow(0.01, dt));
  state.objective = currentObjective(state.missions);

  // Autosave now and then.
  state.saveTimer += dt;
  if (state.saveTimer > 20) {
    state.saveTimer = 0;
    save();
  }
}

// The garage: repair, respray, or start the next job.
function garageAction() {
  const p = state.player;
  const g = state.city.spots.garage;
  const px = p.car ? p.car.x : p.x;
  const py = p.car ? p.car.y : p.y;
  return dist2(px, py, g.x, g.y) < 130 * 130;
}

function handleInteract() {
  const p = state.player;
  const ms = state.missions;
  if (!p.car) {
    // Start the next job at the garage.
    if (garageAction() && !ms.started && currentMission(ms)) {
      startMission(state);
      return;
    }
    const car = nearestStealableCar(state);
    if (car) {
      enterCar(state, car, state.now);
      return;
    }
    return;
  }
  // In a car at the garage: repair or respray.
  if (garageAction()) {
    if (p.car.hp < p.car.maxHp && p.cash >= ECONOMY.repairCost) {
      p.cash -= ECONOMY.repairCost;
      p.car.hp = p.car.maxHp;
      ms.message = `Repaired — $${ECONOMY.repairCost}. Good as new.`;
      ms.messageTimer = 3;
      audio.pickup();
      return;
    }
    if (state.wanted.stars > 0 && p.cash >= ECONOMY.resprayCost) {
      p.cash -= ECONOMY.resprayCost;
      clearWanted(state.wanted);
      ms.message = `Resprayed — the heat is off. — $${ECONOMY.resprayCost}`;
      ms.messageTimer = 3;
      audio.pickup();
      return;
    }
    ms.message = "Mara's Garage: nothing to fix right now.";
    ms.messageTimer = 2;
    return;
  }
  exitCar(state);
}

function show(el, on) {
  el.classList.toggle('hidden', !on);
}

function announce(message) {
  status.textContent = message;
}

let screen = 'title';

function startGame(fresh) {
  if (fresh) {
    resetWorld();
    state.player.cash = ECONOMY.startCash;
    state.missions.index = 0;
  }
  screen = 'play';
  show(menuEl, false);
  show(overEl, false);
  show(pauseEl, false);
  audio.unlock();
  audio.startMusic();
  announce('Playing. WASD to move, E to enter a car.');
}

function endGame(kind) {
  screen = 'over';
  audio.stopMusic();
  audio.engine(0, false);
  audio.siren(false);
  const p = state.player;
  const lost = Math.floor(p.cash * (kind === 'busted' ? 0.1 : 0.2));
  p.cash -= lost;
  state.bestCash = Math.max(state.bestCash, p.cash);
  save();
  overTitle.textContent = kind === 'busted' ? 'BUSTED' : 'WASTED';
  overText.textContent = kind === 'busted'
    ? `The NBPD caught up with you. You lost $${lost} in fines. Missions: ${state.missions.index} of 5 done.`
    : `You went down in Neon Bay. The hospital patched you up for $${lost}. Missions: ${state.missions.index} of 5 done.`;
  show(overEl, true);
  announce(`${overTitle.textContent}. ${overText.textContent}`);
}

function runShot(name) {
  show(menuEl, false);
  show(pauseEl, false);
  show(overEl, false);
  resetWorld();
  stageShot(name, state);
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  renderer.draw(state);
  drawHUD(hudCtx, state, canvas.clientWidth, canvas.clientHeight, dpr);
  let painted = 0;
  function paint() {
    renderer.draw(state);
    drawHUD(hudCtx, state, canvas.clientWidth, canvas.clientHeight, dpr);
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  resetWorld();
  const saved = loadSave();
  show(continueBtn, !!saved && saved.missionIndex > 0);
  let accumulator = 0;
  let last = performance.now();

  startBtn.addEventListener('click', () => startGame(true));
  continueBtn.addEventListener('click', () => startGame(false));
  helpBtn.addEventListener('click', () => show(helpEl, !helpEl.classList.contains('hidden')));
  resumeBtn.addEventListener('click', () => {
    screen = 'play';
    show(pauseEl, false);
  });
  retryBtn.addEventListener('click', () => {
    resetWorld();
    state.player.x = state.city.spots.hospital.x;
    state.player.y = state.city.spots.hospital.y;
    state.player.health = PLAYER.health;
    state.player.arrest = 0;
    screen = 'play';
    show(overEl, false);
    audio.startMusic();
  });
  menuBtn.addEventListener('click', () => {
    screen = 'title';
    show(overEl, false);
    show(menuEl, true);
  });
  window.addEventListener('keydown', (event) => {
    if (event.code === 'Enter' && (screen === 'title' || screen === 'over')) {
      if (screen === 'title') startGame(true);
      else retryBtn.click();
    }
  });

  function frame(now) {
    requestAnimationFrame(frame);
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    state.canvasW = w;
    state.canvasH = h;
    state.camera.w = w;
    state.camera.h = h;
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;

    const actions = input.takeActions();
    if (actions & ACTION_MUTE) {
      audio.setMuted(!audio.isMuted());
      state.missions.message = audio.isMuted() ? 'Sound off.' : 'Sound on.';
      state.missions.messageTimer = 1.5;
    }
    if (actions & ACTION_WEAPON && screen === 'play' && !state.player.car) {
      const p = state.player;
      p.weapon = p.weapon === 'pistol' ? 'fists' : 'pistol';
      state.missions.message = p.weapon === 'pistol' ? 'Pistol out.' : 'Fists out.';
      state.missions.messageTimer = 1.5;
    }
    if (actions & ACTION_PAUSE) {
      if (screen === 'play') {
        screen = 'paused';
        show(pauseEl, true);
        announce('Paused.');
      } else if (screen === 'paused') {
        screen = 'play';
        show(pauseEl, false);
        announce('Playing.');
      }
    }
    if (actions & ACTION_INTERACT && screen === 'play') handleInteract();
    if (actions & ACTION_CONFIRM && screen === 'title') startGame(true);

    if (screen === 'play') {
      while (accumulator >= STEP) {
        step(STEP);
        accumulator -= STEP;
        if (state.player.health <= 0) {
          endGame('wasted');
          break;
        }
        if (state.player.arrest >= 1.2) {
          state.player.arrest = 0;
          clearWanted(state.wanted);
          endGame('busted');
          break;
        }
      }
    } else if (screen === 'title') {
      // Attract mode: the city lives behind the menu.
      while (accumulator >= STEP) {
        step(STEP);
        accumulator -= STEP;
      }
      state.camera.x = 1900 + Math.sin(state.now * 0.05) * 500;
      state.camera.y = 1300 + Math.cos(state.now * 0.04) * 300;
      state.camera.zoom = 0.7;
    } else {
      accumulator = 0;
    }

    renderer.draw(state);
    if (screen === 'play' || screen === 'paused') {
      drawHUD(hudCtx, state, w, h, Math.min(window.devicePixelRatio || 1, 2));
    }
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === 'play') {
      screen = 'paused';
      show(pauseEl, true);
      announce('Paused.');
    }
  });

  announce('Neon Bay. Press Enter or click Start to play.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
