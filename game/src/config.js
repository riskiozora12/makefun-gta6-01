// Neon Bay: every number the game tunes by, in one place.
// The city is a road grid; the player walks and drives through it on foot and by car.
export const WORLD_W = 3600;
export const WORLD_H = 2600;
export const ROAD_W = 96;
export const SIDEWALK = 26;
export const STEP = 1 / 60;
export const BEST_KEY = 'neonbay-best-v1';
export const SAVE_KEY = 'neonbay-save-v1';

// Road centrelines: vertical avenues and horizontal streets, 400 apart.
export const AVENUES = [300, 700, 1100, 1500, 1900, 2300, 2700, 3100, 3400];
export const STREETS = [300, 700, 1100, 1500, 1900, 2300];
// The sea hugs the west edge; the beach runs along it.
export const SEA_X = 150;
export const BEACH_X = 230;

export const COLORS = {
  grass: '#7fae5a',
  grassDry: '#93b96a',
  sand: '#e2cb8f',
  water: '#2e7fa8',
  waterDeep: '#256b90',
  road: '#3b4048',
  roadEdge: '#2f333a',
  sidewalk: '#a7adb6',
  marking: '#e8d44d',
  park: '#5d9b4a',
  player: '#e8492f',
  playerDark: '#20242a',
  cop: '#2b5fd9',
  copLight: '#ff3b30',
  taxi: '#f2c200',
};

export const CAR_COLORS = ['#c22f2f', '#2f6fc2', '#e8e8e8', '#22262c', '#3f9e4d', '#7a3fc2', '#d97b29', '#c2a13a'];
export const SPORTS_COLORS = ['#ff2e63', '#08d9d6', '#f9ed69', '#ff7a00'];

// On-foot tuning.
export const PLAYER = {
  radius: 13,
  walk: 175,
  run: 265,
  health: 100,
  punchDamage: 12,
  pistolDamage: 34,
  pistolRange: 520,
  pistolAmmoStart: 24,
  interactRange: 64,
};

// Driving tuning (arcade: grippy, a little slide).
export const DRIVE = {
  accel: 420,
  brake: 700,
  reverse: 260,
  maxSpeed: 430,
  maxReverse: 160,
  steer: 2.5,
  grip: 5.2,
  drift: 0.86,
  handbrakeGrip: 1.6,
  carRadius: 15,
  carLength: 46,
  carWidth: 22,
  damageSpeed: 240,
};

// Wanted: stars 0..5, heat points feed them.
export const WANTED = {
  max: 5,
  stealCar: 1,
  shoot: 1,
  killCop: 2,
  hitPed: 1,
  ramCop: 1,
  decayDelay: 7,
  decayStep: 9,
  copCarsPerStar: 1,
  maxCopCars: 5,
};

// Traffic and crowds.
export const TRAFFIC_CARS = 16;
export const PARKED_CARS = 26;
export const PEDS = 26;

// Money.
export const ECONOMY = {
  startCash: 120,
  repairCost: 60,
  resprayCost: 120,
  ammoCost: 40,
  ammoPack: 24,
  taxiFareMin: 30,
  taxiFareMax: 90,
  cashPickup: 50,
};

// Districts, by block column/row, for names on the HUD and the minimap.
export const DISTRICTS = [
  { name: 'Old Town', cols: [0, 1, 2], rows: [0, 1] },
  { name: 'The Docks', cols: [6, 7, 8], rows: [0, 1] },
  { name: 'Downtown', cols: [3, 4, 5], rows: [2, 3] },
  { name: 'Marina Bay', cols: [0, 1, 2], rows: [4, 5] },
  { name: 'South Beach', cols: [3, 4, 5, 6, 7, 8], rows: [4, 5] },
];

export function districtAt(x, y) {
  const col = Math.floor((x - 200) / 400);
  const row = Math.floor((y - 200) / 400);
  for (const d of DISTRICTS) {
    if (d.cols.includes(col) && d.rows.includes(row)) return d.name;
  }
  return 'Neon Bay';
}

// Keys: WASD/arrows move, E interact, Space handbrake/confirm, mouse aim + click shoot.
export const KEYS = {
  up: ['KeyW', 'ArrowUp'],
  down: ['KeyS', 'ArrowDown'],
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
  run: ['ShiftLeft', 'ShiftRight'],
  interact: ['KeyE'],
  handbrake: ['Space'],
  pause: ['KeyP', 'Escape'],
  mute: ['KeyM'],
  weapon: ['KeyQ'],
};
