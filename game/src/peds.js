// Pedestrians: they walk the sidewalks, cross at corners, and run from
// gunfire and speeding cars. A few are mission characters (guards, passengers).
import { AVENUES, ROAD_W, STREETS, WORLD_H, WORLD_W } from './config.js';
import { angleTo, dist2 } from './random.js';
import { moveWithCollision } from './city.js';

const SHIRTS = ['#e8e8e8', '#3f6fb5', '#c2a13a', '#7a3fc2', '#3f9e4d', '#d97b29', '#e8492f', '#5a6b7d'];

let nextPedId = 1;

export function createPed(x, y, opts) {
  const o = opts || {};
  return {
    id: nextPedId,
    x, y,
    angle: o.angle || 0,
    speed: o.speed || 55,
    color: o.color || SHIRTS[Math.floor(Math.random() * SHIRTS.length)],
    role: o.role || 'walker',
    hp: o.hp || 30,
    target: o.target || null,
    panic: 0,
    dead: false,
    wait: 0,
  };
}

function pickSidewalkTarget(ped, rng) {
  // Walk along a road's sidewalk to a nearby intersection, then maybe turn.
  const vertical = rng.chance(0.5);
  if (vertical) {
    const ax = rng.pick(AVENUES);
    return { x: ax + (rng.chance(0.5) ? -1 : 1) * (ROAD_W / 2 + 12), y: rng.range(260, WORLD_H - 60) };
  }
  const sy = rng.pick(STREETS);
  return { x: rng.range(260, WORLD_W - 60), y: sy + (rng.chance(0.5) ? -1 : 1) * (ROAD_W / 2 + 12) };
}

export function spawnPeds(city, rng, count) {
  const peds = [];
  for (let i = 0; i < count; i += 1) {
    const t = pickSidewalkTarget({ x: 0, y: 0 }, rng);
    const ped = createPed(t.x, t.y);
    ped.target = pickSidewalkTarget(ped, rng);
    peds.push(ped);
  }
  return peds;
}

// One step for every pedestrian: walk, panic, or hold a mission post.
export function updatePeds(peds, city, rng, dt, threats) {
  for (const ped of peds) {
    if (ped.dead) {
      ped.deadTimer -= dt;
      continue;
    }
    if (ped.role === 'guard' || ped.role === 'passenger') {
      // Mission characters hold their post (guards patrol a small square).
      if (ped.role === 'guard') {
        if (!ped.patrol) ped.patrol = { cx: ped.x, cy: ped.y, t: rng.next() * 6 };
        ped.patrol.t += dt;
        const a = ped.patrol.t * 0.5;
        ped.x = ped.patrol.cx + Math.cos(a) * 26;
        ped.y = ped.patrol.cy + Math.sin(a) * 26;
        ped.angle = a + Math.PI / 2;
      }
      continue;
    }
    if (ped.panic > 0) {
      ped.panic -= dt;
      // Run away from the nearest threat.
      let tx = 0;
      let ty = 0;
      let best = Infinity;
      for (const th of threats) {
        const d = dist2(ped.x, ped.y, th.x, th.y);
        if (d < best) {
          best = d;
          tx = th.x;
          ty = th.y;
        }
      }
      const away = angleTo(tx, ty, ped.x, ped.y);
      ped.angle = away;
      moveWithCollision(city, ped, Math.cos(away) * 210 * dt, Math.sin(away) * 210 * dt, 10);
      continue;
    }
    if (ped.wait > 0) {
      ped.wait -= dt;
      continue;
    }
    if (!ped.target || dist2(ped.x, ped.y, ped.target.x, ped.target.y) < 30 * 30) {
      ped.target = pickSidewalkTarget(ped, rng);
      ped.wait = rng.range(0, 2.5);
      continue;
    }
    const a = angleTo(ped.x, ped.y, ped.target.x, ped.target.y);
    ped.angle = a;
    moveWithCollision(city, ped, Math.cos(a) * ped.speed * dt, Math.sin(a) * ped.speed * dt, 10);
  }
  // Drop the dead from the list the renderer walks (they stay as a marker briefly).
  return peds.filter((p) => !p.dead || p.deadTimer > 0);
}

export function scarePeds(peds, x, y, radius) {
  for (const ped of peds) {
    if (ped.role !== 'walker') continue;
    if (dist2(ped.x, ped.y, x, y) < radius * radius) ped.panic = 2.5;
  }
}
