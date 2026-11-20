// Paints the world: ground, sea and beach, roads with markings, buildings
// with height and shadows, cars, people, bullets, particles and the mission
// beacon — then the camera transform that follows the player.
import { COLORS, DRIVE, ROAD_W, SEA_X, WORLD_H, WORLD_W } from './config.js';
import { clamp } from './random.js';

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.floor(canvas.clientWidth * dpr);
    canvas.height = Math.floor(canvas.clientHeight * dpr);
  }
  window.addEventListener('resize', resize);
  resize();

  function draw(state) {
    const cam = state.camera;
    const w = canvas.width;
    const h = canvas.height;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#1b2b33';
    ctx.fillRect(0, 0, w, h);
    // Keep the camera inside the world so the frame never shows the void past the map edge.
    const viewHalfW = (w / 2) / cam.zoom;
    const viewHalfH = (h / 2) / cam.zoom;
    const cx = viewHalfW >= WORLD_W / 2 ? WORLD_W / 2 : clamp(cam.x, viewHalfW, WORLD_W - viewHalfW);
    const cy = viewHalfH >= WORLD_H / 2 ? WORLD_H / 2 : clamp(cam.y, viewHalfH, WORLD_H - viewHalfH);
    ctx.setTransform(cam.zoom, 0, 0, cam.zoom, w / 2 - cx * cam.zoom, h / 2 - cy * cam.zoom);

    // Ground.
    ctx.fillStyle = COLORS.grass;
    ctx.fillRect(SEA_X, 0, WORLD_W - SEA_X, WORLD_H);
    // Dry patches.
    ctx.fillStyle = COLORS.grassDry;
    for (let i = 0; i < 24; i += 1) {
      const gx = 300 + ((i * 733) % 3100);
      const gy = 200 + ((i * 419) % 2200);
      ctx.fillRect(gx, gy, 180, 120);
    }
    // Beach and sea.
    ctx.fillStyle = COLORS.sand;
    ctx.fillRect(SEA_X, 0, 80, WORLD_H);
    ctx.fillStyle = COLORS.water;
    ctx.fillRect(0, 0, SEA_X, WORLD_H);
    ctx.fillStyle = COLORS.waterDeep;
    for (let i = 0; i < 12; i += 1) {
      ctx.fillRect(20, 120 + i * 210, 110, 10);
    }
    // The marina pier.
    ctx.fillStyle = '#8a6a45';
    ctx.fillRect(60, 1950, 190, 16);
    ctx.fillRect(60, 2050, 190, 16);

    drawRoads(ctx, state);
    drawParks(ctx, state);
    drawBuildings(ctx, state);
    drawTrees(ctx, state);
    drawPickups(ctx, state);
    drawBeacon(ctx, state);
    for (const car of state.cars) drawCar(ctx, car, false);
    for (const car of state.police.cars) drawCar(ctx, car, true);
    for (const ped of state.peds) drawPed(ctx, ped);
    for (const cop of state.police.foot) drawCop(ctx, cop);
    drawBullets(ctx, state);
    drawPlayer(ctx, state);
    drawParticles(ctx, state);

    // Vignette of the late-afternoon sun.
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, 'rgba(255, 190, 90, 0.10)');
    grad.addColorStop(1, 'rgba(255, 120, 40, 0.05)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
  }

  function drawRoads(ctx, state) {
    // Sidewalk halo, then asphalt.
    for (const ax of state.city.avenues) {
      ctx.fillStyle = COLORS.sidewalk;
      ctx.fillRect(ax - ROAD_W / 2 - 26, 0, ROAD_W + 52, WORLD_H);
      ctx.fillStyle = COLORS.road;
      ctx.fillRect(ax - ROAD_W / 2, 0, ROAD_W, WORLD_H);
    }
    for (const sy of state.city.streets) {
      ctx.fillStyle = COLORS.sidewalk;
      ctx.fillRect(0, sy - ROAD_W / 2 - 26, WORLD_W, ROAD_W + 52);
      ctx.fillStyle = COLORS.road;
      ctx.fillRect(0, sy - ROAD_W / 2, WORLD_W, ROAD_W);
    }
    // Centre dashes.
    ctx.fillStyle = COLORS.marking;
    for (const ax of state.city.avenues) {
      for (let y = 60; y < WORLD_H; y += 120) ctx.fillRect(ax - 3, y, 6, 56);
    }
    for (const sy of state.city.streets) {
      for (let x = 260; x < WORLD_W; x += 120) ctx.fillRect(x, sy - 3, 56, 6);
    }
    // Lamps.
    ctx.fillStyle = '#2f333a';
    for (const lamp of state.city.lamps) {
      ctx.beginPath();
      ctx.arc(lamp.x, lamp.y, 4, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawParks(ctx, state) {
    for (const park of state.city.parks) {
      ctx.fillStyle = COLORS.park;
      ctx.fillRect(park.x, park.y, park.w, park.h);
      ctx.strokeStyle = '#4a7d3c';
      ctx.lineWidth = 3;
      ctx.strokeRect(park.x, park.y, park.w, park.h);
    }
  }

  function drawBuildings(ctx, state) {
    for (const b of state.city.buildings) {
      // Long afternoon shadow.
      ctx.fillStyle = 'rgba(0, 0, 0, 0.22)';
      ctx.fillRect(b.x + 14, b.y + b.height * 0.4, b.w, b.h);
      ctx.fillStyle = b.color;
      ctx.fillRect(b.x, b.y, b.w, b.h);
      ctx.fillStyle = b.roof;
      ctx.fillRect(b.x + 5, b.y + 5, b.w - 10, b.h - 10);
      // Windows on the roof face.
      ctx.fillStyle = 'rgba(255, 240, 200, 0.75)';
      const cols = Math.max(1, Math.floor(b.w / 26));
      const rows = Math.max(1, Math.floor(b.h / 26));
      for (let i = 0; i < cols; i += 1) {
        for (let j = 0; j < rows; j += 1) {
          if ((i + j) % 3 === 0) ctx.fillRect(b.x + 10 + i * 24, b.y + 10 + j * 24, 10, 8);
        }
      }
      if (b.name) {
        ctx.fillStyle = '#20242a';
        ctx.font = 'bold 13px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(b.name, b.x + b.w / 2, b.y + b.h + 16);
        ctx.textAlign = 'left';
      }
    }
  }

  function drawTrees(ctx, state) {
    for (const t of state.city.trees) {
      ctx.fillStyle = 'rgba(0,0,0,0.18)';
      ctx.beginPath();
      ctx.arc(t.x + 4, t.y + 5, t.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#3e7d32';
      ctx.beginPath();
      ctx.arc(t.x, t.y, t.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#5da244';
      ctx.beginPath();
      ctx.arc(t.x - 3, t.y - 3, t.r * 0.55, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawPickups(ctx, state) {
    for (const pk of state.pickups) {
      const bob = Math.sin(pk.t * 4) * 3;
      if (pk.kind === 'cash') {
        ctx.fillStyle = '#58c96b';
        ctx.fillRect(pk.x - 10, pk.y - 7 + bob, 20, 14);
        ctx.fillStyle = '#2c7a3a';
        ctx.font = 'bold 11px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('$', pk.x, pk.y + 4 + bob);
        ctx.textAlign = 'left';
      } else if (pk.kind === 'ammo') {
        ctx.fillStyle = '#e8c33c';
        ctx.fillRect(pk.x - 8, pk.y - 5 + bob, 16, 10);
      } else {
        // The case / ledger: a bright briefcase.
        ctx.fillStyle = '#ffd23c';
        ctx.fillRect(pk.x - 12, pk.y - 8 + bob, 24, 16);
        ctx.fillStyle = '#8a6a2a';
        ctx.fillRect(pk.x - 4, pk.y - 11 + bob, 8, 4);
      }
    }
  }

  function drawBeacon(ctx, state) {
    const obj = state.objective;
    if (!obj || obj.x === null || obj.y === null) return;
    const pulse = 0.5 + Math.sin(state.now * 3) * 0.2;
    ctx.fillStyle = `rgba(255, 210, 60, ${0.25 + pulse * 0.2})`;
    ctx.beginPath();
    ctx.arc(obj.x, obj.y, 46 + pulse * 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffd23c';
    ctx.beginPath();
    ctx.arc(obj.x, obj.y, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#ffd23c';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(obj.x, obj.y);
    ctx.lineTo(obj.x, obj.y - 64);
    ctx.stroke();
    // A floating diamond above the marker.
    ctx.save();
    ctx.translate(obj.x, obj.y - 72);
    ctx.rotate(Math.PI / 4);
    ctx.fillStyle = '#ffd23c';
    ctx.fillRect(-7, -7, 14, 14);
    ctx.restore();
  }

  function drawCar(ctx, car, isCop) {
    // Skid marks.
    ctx.strokeStyle = 'rgba(20,20,20,0.35)';
    ctx.lineWidth = 5;
    for (const s of car.skid || []) {
      ctx.globalAlpha = s.t;
      ctx.beginPath();
      ctx.moveTo(s.x - 8, s.y);
      ctx.lineTo(s.x + 8, s.y);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    ctx.save();
    ctx.translate(car.x, car.y);
    ctx.rotate(car.angle);
    // Shadow.
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fillRect(-DRIVE.carLength / 2 + 3, -DRIVE.carWidth / 2 + 4, DRIVE.carLength, DRIVE.carWidth);
    // Body.
    ctx.fillStyle = car.color;
    roundRect(ctx, -DRIVE.carLength / 2, -DRIVE.carWidth / 2, DRIVE.carLength, DRIVE.carWidth, 6);
    ctx.fill();
    // Cabin and windshield.
    ctx.fillStyle = 'rgba(20,30,40,0.85)';
    ctx.fillRect(-6, -DRIVE.carWidth / 2 + 3, 14, DRIVE.carWidth - 6);
    ctx.fillStyle = 'rgba(180,220,255,0.7)';
    ctx.fillRect(DRIVE.carLength / 2 - 10, -DRIVE.carWidth / 2 + 4, 5, DRIVE.carWidth - 8);
    // Wheels.
    ctx.fillStyle = '#14161a';
    ctx.fillRect(-DRIVE.carLength / 2 + 4, -DRIVE.carWidth / 2 - 3, 10, 5);
    ctx.fillRect(-DRIVE.carLength / 2 + 4, DRIVE.carWidth / 2 - 2, 10, 5);
    ctx.fillRect(DRIVE.carLength / 2 - 14, -DRIVE.carWidth / 2 - 3, 10, 5);
    ctx.fillRect(DRIVE.carLength / 2 - 14, DRIVE.carWidth / 2 - 2, 10, 5);
    if (isCop) {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(-2, -DRIVE.carWidth / 2 + 2, 4, DRIVE.carWidth - 4);
      // Flashing light bar.
      const phase = Math.floor(performance.now() / 180) % 2 === 0;
      ctx.fillStyle = phase ? '#ff3b30' : '#2b5fd9';
      ctx.fillRect(-4, -DRIVE.carWidth / 2 - 2, 8, 5);
      ctx.fillStyle = phase ? '#2b5fd9' : '#ff3b30';
      ctx.fillRect(-4, DRIVE.carWidth / 2 - 3, 8, 5);
    }
    if (car.taxi) {
      ctx.fillStyle = '#22262c';
      ctx.font = 'bold 8px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('TAXI', 0, 3);
      ctx.textAlign = 'left';
    }
    if (car.hp < 40) {
      ctx.fillStyle = 'rgba(60,60,60,0.7)';
      ctx.beginPath();
      ctx.arc(-DRIVE.carLength / 2 + 6, 0, 6 + Math.sin(performance.now() / 90) * 2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawPed(ctx, ped) {
    if (ped.dead) {
      ctx.save();
      ctx.translate(ped.x, ped.y);
      ctx.rotate(0.6);
      ctx.fillStyle = ped.color;
      ctx.fillRect(-11, -5, 22, 10);
      ctx.restore();
      return;
    }
    ctx.save();
    ctx.translate(ped.x, ped.y);
    ctx.rotate(ped.angle);
    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    ctx.beginPath();
    ctx.ellipse(2, 3, 10, 8, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = ped.role === 'guard' ? '#3a3a3a' : ped.color;
    ctx.beginPath();
    ctx.arc(0, 0, 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#e8c39a';
    ctx.beginPath();
    ctx.arc(3, 0, 4.5, 0, Math.PI * 2);
    ctx.fill();
    if (ped.role === 'guard') {
      ctx.fillStyle = '#1c1c1c';
      ctx.fillRect(6, -2, 10, 3);
    }
    if (ped.role === 'passenger') {
      ctx.fillStyle = '#ffd23c';
      ctx.font = 'bold 13px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('!', 0, -16);
      ctx.textAlign = 'left';
    }
    ctx.restore();
  }

  function drawCop(ctx, cop) {
    ctx.save();
    ctx.translate(cop.x, cop.y);
    ctx.rotate(cop.angle);
    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    ctx.beginPath();
    ctx.ellipse(2, 3, 10, 8, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#2b5fd9';
    ctx.beginPath();
    ctx.arc(0, 0, 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#16233d';
    ctx.beginPath();
    ctx.arc(3, 0, 4.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawBullets(ctx, state) {
    ctx.strokeStyle = '#ffe08a';
    ctx.lineWidth = 2.5;
    for (const b of state.bullets) {
      ctx.beginPath();
      ctx.moveTo(b.x - Math.cos(b.angle) * 14, b.y - Math.sin(b.angle) * 14);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
  }

  function drawPlayer(ctx, state) {
    const p = state.player;
    if (p.car) return;
    ctx.save();
    ctx.translate(p.x, p.y);
    const blink = p.invuln > 0 && Math.floor(p.invuln * 12) % 2 === 0;
    ctx.globalAlpha = blink ? 0.4 : 1;
    ctx.rotate(p.angle);
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    ctx.beginPath();
    ctx.ellipse(2, 3, 11, 9, 0, 0, Math.PI * 2);
    ctx.fill();
    // Body: red jacket, dark trousers, facing right.
    ctx.fillStyle = COLORS.player;
    ctx.beginPath();
    ctx.arc(0, 0, 11, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#e8c39a';
    ctx.beginPath();
    ctx.arc(5, 0, 5.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#20242a';
    ctx.fillRect(-9, -4, 6, 8);
    if (p.weapon === 'pistol') {
      ctx.fillStyle = '#1c1c1c';
      ctx.fillRect(8, -2, 12, 3.5);
      if (p.muzzle > 0) {
        ctx.fillStyle = '#ffd23c';
        ctx.beginPath();
        ctx.arc(22, 0, 7, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    if (p.punchTimer > 0.2) {
      ctx.fillStyle = '#e8c39a';
      ctx.beginPath();
      ctx.arc(14, 0, 5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  function drawParticles(ctx, state) {
    for (const pt of state.particles) {
      ctx.globalAlpha = clamp(pt.life / pt.max, 0, 1);
      ctx.fillStyle = pt.color;
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, pt.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  return { draw, resize };
}
