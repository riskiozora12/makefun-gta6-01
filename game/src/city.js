// Neon Bay itself: a road grid of avenues and streets, blocks of buildings,
// parks and lots, the sea and beach on the west edge, and the fixed places
// the story uses (Mara's garage, the hospital, the police station, the marina).
import { AVENUES, BEACH_X, COLORS, ROAD_W, SEA_X, SIDEWALK, STREETS, WORLD_H, WORLD_W } from './config.js';
import { clamp } from './random.js';

const BUILDING_PALETTE = ['#c9a37e', '#b7c4cc', '#d9b8a3', '#8fa8bf', '#c2b280', '#a8b8a0', '#d8c9c0', '#7f9fb5'];
const DOWNTOWN_PALETTE = ['#5d7386', '#6e8396', '#4a5f73', '#7d94a6', '#546b80'];
const ROOF_PALETTE = ['#8a7a6a', '#6f7d8a', '#9a8a7a', '#5f6f7d'];

// Blocks sit between the roads: block (col, row) spans the cell after avenue col / street row.
function blockRect(col, row) {
  const x0 = AVENUES[col] + ROAD_W / 2 + SIDEWALK;
  const y0 = STREETS[row] + ROAD_W / 2 + SIDEWALK;
  const x1 = (AVENUES[col + 1] ?? WORLD_W - 60) - ROAD_W / 2 - SIDEWALK;
  const y1 = (STREETS[row + 1] ?? WORLD_H - 60) - ROAD_W / 2 - SIDEWALK;
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

function districtOf(col, row) {
  if (col <= 2 && row <= 1) return 'Old Town';
  if (col >= 6 && row <= 1) return 'The Docks';
  if (col >= 3 && col <= 5 && row >= 2 && row <= 3) return 'Downtown';
  if (col <= 2 && row >= 4) return 'Marina Bay';
  return 'South Beach';
}

export function buildCity(rng) {
  const buildings = [];
  const trees = [];
  const lamps = [];
  const parks = [];
  const blocks = [];

  for (let col = 0; col < AVENUES.length; col += 1) {
    for (let row = 0; row < STREETS.length; row += 1) {
      const rect = blockRect(col, row);
      const district = districtOf(col, row);
      blocks.push({ ...rect, district });
      // The marina block is a park by the water; one downtown block is a plaza.
      const isPark = (col === 0 && row === 4) || (col === 4 && row === 1);
      if (isPark) {
        parks.push({ ...rect, district });
        for (let i = 0; i < 9; i += 1) {
          trees.push({ x: rng.range(rect.x + 20, rect.x + rect.w - 20), y: rng.range(rect.y + 20, rect.y + rect.h - 20), r: rng.range(9, 14) });
        }
        continue;
      }
      const downtown = district === 'Downtown';
      const count = downtown ? rng.int(2, 3) : rng.int(1, 3);
      const palette = downtown ? DOWNTOWN_PALETTE : BUILDING_PALETTE;
      for (let i = 0; i < count; i += 1) {
        const bw = rng.range(70, downtown ? 120 : 150);
        const bh = rng.range(60, downtown ? 110 : 130);
        const bx = rng.range(rect.x + 8, rect.x + rect.w - bw - 8);
        const by = rng.range(rect.y + 8, rect.y + rect.h - bh - 8);
        const b = {
          x: bx, y: by, w: bw, h: bh,
          color: rng.pick(palette),
          roof: rng.pick(ROOF_PALETTE),
          height: downtown ? rng.range(46, 120) : rng.range(16, 42),
          district,
          name: '',
        };
        // Keep buildings from overlapping each other in the same block.
        if (buildings.some((o) => o.x < b.x + b.w + 14 && o.x + o.w + 14 > b.x && o.y < b.y + b.h + 14 && o.y + o.h + 14 > b.y)) continue;
        buildings.push(b);
      }
      // A couple of trees on the block corners.
      for (let i = 0; i < 3; i += 1) {
        trees.push({ x: rng.range(rect.x + 12, rect.x + rect.w - 12), y: rng.range(rect.y + 12, rect.y + rect.h - 12), r: rng.range(7, 11) });
      }
    }
  }

  // Named landmarks the story and the HUD point at. Each sits inside a block,
  // never on a road, so cars can drive past them.
  const landmarks = [
    { x: 1620, y: 1200, w: 120, h: 80, color: '#b8452f', roof: '#7d2f20', height: 26, district: 'Downtown', name: "Mara's Garage" },
    { x: 800, y: 800, w: 140, h: 90, color: '#e8e4da', roof: '#c94f4f', height: 34, district: 'Old Town', name: 'Bay General' },
    { x: 2400, y: 800, w: 130, h: 84, color: '#3f5a7d', roof: '#2c4260', height: 30, district: 'The Docks', name: 'NBPD HQ' },
    { x: 430, y: 2030, w: 110, h: 70, color: '#d9a441', roof: '#8a6a2a', height: 20, district: 'Marina Bay', name: 'Marina Office' },
  ];
  // Keep the random buildings and park trees clear of the landmarks.
  const clearOf = (x, y, w, h) => !landmarks.some((lm) => x < lm.x + lm.w + 20 && x + w + 20 > lm.x && y < lm.y + lm.h + 20 && y + h + 20 > lm.y);
  for (let i = buildings.length - 1; i >= 0; i -= 1) {
    const b = buildings[i];
    if (!clearOf(b.x, b.y, b.w, b.h)) buildings.splice(i, 1);
  }
  for (let i = trees.length - 1; i >= 0; i -= 1) {
    const t = trees[i];
    if (!clearOf(t.x - 12, t.y - 12, 24, 24)) trees.splice(i, 1);
  }
  buildings.push(...landmarks);

  // Street lamps along every road, every 200 units.
  for (const x of AVENUES) {
    for (let y = 200; y < WORLD_H; y += 200) lamps.push({ x: x + ROAD_W / 2 + 6, y });
  }
  for (const y of STREETS) {
    for (let x = 300; x < WORLD_W; x += 200) lamps.push({ x, y: y + ROAD_W / 2 + 6 });
  }

  const city = {
    buildings, trees, lamps, parks, blocks,
    avenues: AVENUES,
    streets: STREETS,
    spots: {
      garage: { x: 1560, y: 1220 },
      hospital: { x: 770, y: 830 },
      policeHQ: { x: 2365, y: 830 },
      marina: { x: 375, y: 2090 },
      safehouse: { x: 3100, y: 2150 },
      docks: { x: 3100, y: 420 },
      playerStart: { x: 1560, y: 1300 },
    },
    colors: COLORS,
  };
  return city;
}

export function isWater(x, y) {
  return x < SEA_X || (x < BEACH_X && y > 2350);
}

export function onRoad(x, y) {
  const onAvenue = AVENUES.some((ax) => Math.abs(x - ax) <= ROAD_W / 2);
  const onStreet = STREETS.some((sy) => Math.abs(y - sy) <= ROAD_W / 2);
  return onAvenue || onStreet;
}

// True when a circle at (x, y) with radius r hits a building, the sea, or the map edge.
export function solidAt(city, x, y, r) {
  if (x < SEA_X + r || x > WORLD_W - r || y < r || y > WORLD_H - r) return true;
  if (x < BEACH_X + r && isWater(x, y)) return true;
  for (const b of city.buildings) {
    if (x + r > b.x && x - r < b.x + b.w && y + r > b.y && y - r < b.y + b.h) return true;
  }
  return false;
}

// Slide a moving circle out of whatever it hit, axis by axis.
export function moveWithCollision(city, pos, dx, dy, r) {
  const nx = pos.x + dx;
  if (!solidAt(city, nx, pos.y, r)) pos.x = nx;
  const ny = pos.y + dy;
  if (!solidAt(city, pos.x, ny, r)) pos.y = ny;
}

// The nearest point on a road centreline to (x, y).
export function nearestRoadPoint(x, y) {
  let best = null;
  let bestD = Infinity;
  for (const ax of AVENUES) {
    for (const sy of STREETS) {
      const d = (x - ax) * (x - ax) + (y - sy) * (y - sy);
      if (d < bestD) {
        bestD = d;
        best = { x: ax, y: sy };
      }
    }
  }
  return best;
}

// A random point on a road, at least `minDist` from (fx, fy).
export function randomRoadPoint(rng, fx, fy, minDist) {
  for (let tries = 0; tries < 40; tries += 1) {
    const vertical = rng.chance(0.5);
    const x = vertical ? rng.pick(AVENUES) + rng.range(-20, 20) : rng.range(300, WORLD_W - 100);
    const y = vertical ? rng.range(300, WORLD_H - 100) : rng.pick(STREETS) + rng.range(-20, 20);
    const dx = x - fx;
    const dy = y - fy;
    if (dx * dx + dy * dy >= minDist * minDist) return { x, y };
  }
  return { x: 300, y: 300 };
}

export function clampToWorld(x, y) {
  return { x: clamp(x, SEA_X + 20, WORLD_W - 20), y: clamp(y, 20, WORLD_H - 20) };
}
