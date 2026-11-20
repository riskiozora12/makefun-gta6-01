// The HUD: health, cash, wanted stars, objective, speed — and the minimap
// that shows the city, the player, the cops and the mission marker.
import { WORLD_H, WORLD_W, districtAt } from './config.js';
import { currentObjective } from './missions.js';

const MAP_W = 200;
const MAP_H = 146;

export function drawHUD(ctx, state, w, h, dpr) {
  const p = state.player;
  ctx.save();
  ctx.setTransform(dpr || 1, 0, 0, dpr || 1, 0, 0);
  ctx.textBaseline = 'alphabetic';

  // Top-left: health bar and cash.
  ctx.fillStyle = 'rgba(10, 12, 16, 0.55)';
  roundRect(ctx, 12, 12, 250, 64, 8);
  ctx.fill();
  ctx.fillStyle = '#e8e8e8';
  ctx.font = 'bold 15px system-ui, sans-serif';
  ctx.fillText(`$${p.cash}`, 26, 36);
  ctx.fillStyle = '#2c2f36';
  roundRect(ctx, 26, 46, 180, 12, 6);
  ctx.fill();
  ctx.fillStyle = p.health > 50 ? '#58c96b' : p.health > 25 ? '#e8c33c' : '#e8492f';
  roundRect(ctx, 26, 46, 180 * (p.health / 100), 12, 6);
  ctx.fill();
  ctx.fillStyle = '#e8e8e8';
  ctx.font = '12px system-ui, sans-serif';
  ctx.fillText(p.weapon === 'pistol' ? `Pistol  •  ${p.ammo} rounds` : 'Fists  •  press Q for pistol', 26, 72);
  if (p.car) {
    ctx.fillStyle = '#2c2f36';
    roundRect(ctx, 26, 80, 180, 12, 6);
    ctx.fill();
    ctx.fillStyle = p.car.hp > 50 ? '#58c96b' : '#e8492f';
    roundRect(ctx, 26, 80, 180 * Math.max(0, p.car.hp / p.car.maxHp), 12, 6);
    ctx.fill();
  }

  // Top-right: wanted stars.
  const stars = state.wanted.stars;
  ctx.font = 'bold 26px system-ui, sans-serif';
  for (let i = 0; i < 5; i += 1) {
    ctx.fillStyle = i < stars ? '#ffd23c' : 'rgba(255,255,255,0.25)';
    ctx.fillText('★', w - 40 - (4 - i) * 30, 40);
  }
  ctx.font = '12px system-ui, sans-serif';
  ctx.fillStyle = '#e8e8e8';
  ctx.textAlign = 'right';
  ctx.fillText(districtAt(p.car ? p.car.x : p.x, p.car ? p.car.y : p.y), w - 14, 62);
  ctx.fillText(state.clock, w - 14, 78);
  ctx.textAlign = 'left';

  // Minimap under the stars.
  drawMinimap(ctx, state, w - MAP_W - 14, 88);

  // Bottom-left: the current objective.
  const obj = currentObjective(state.missions);
  ctx.fillStyle = 'rgba(10, 12, 16, 0.55)';
  const ow = Math.min(520, ctx.measureText(obj.text).width + 64);
  roundRect(ctx, 12, h - 52, ow, 38, 8);
  ctx.fill();
  ctx.fillStyle = '#ffd23c';
  ctx.font = 'bold 14px system-ui, sans-serif';
  ctx.fillText('◆ ' + obj.text, 26, h - 28);

  // Bottom-right: speed when driving.
  if (p.car) {
    ctx.fillStyle = 'rgba(10, 12, 16, 0.55)';
    roundRect(ctx, w - 132, h - 52, 118, 38, 8);
    ctx.fill();
    ctx.fillStyle = '#e8e8e8';
    ctx.font = 'bold 20px system-ui, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(`${Math.round(Math.abs(p.car.speed) * 0.22)} mph`, w - 26, h - 26);
    ctx.textAlign = 'left';
  }

  // Centre message (mission updates).
  if (state.missions.messageTimer > 0) {
    ctx.font = 'bold 17px system-ui, sans-serif';
    const mw = ctx.measureText(state.missions.message).width;
    ctx.fillStyle = 'rgba(10, 12, 16, 0.65)';
    roundRect(ctx, (w - mw) / 2 - 16, 96, mw + 32, 34, 8);
    ctx.fill();
    ctx.fillStyle = '#ffd23c';
    ctx.textAlign = 'center';
    ctx.fillText(state.missions.message, w / 2, 119);
    ctx.textAlign = 'left';
  }

  // Controls hint, first seconds of play.
  if (state.playTime < 12) {
    ctx.font = '13px system-ui, sans-serif';
    ctx.fillStyle = 'rgba(232,232,232,0.85)';
    ctx.fillText('WASD move / drive  •  E enter car  •  Click shoot  •  Shift run  •  Space handbrake  •  P pause  •  M mute', 14, h - 62);
  }
  ctx.restore();
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

function drawMinimap(ctx, state, ox, oy) {
  const sx = MAP_W / WORLD_W;
  const sy = MAP_H / WORLD_H;
  ctx.save();
  ctx.fillStyle = 'rgba(10, 12, 16, 0.6)';
  roundRect(ctx, ox - 4, oy - 4, MAP_W + 8, MAP_H + 8, 8);
  ctx.fill();
  ctx.beginPath();
  ctx.rect(ox, oy, MAP_W, MAP_H);
  ctx.clip();
  // Water and ground.
  ctx.fillStyle = '#2e7fa8';
  ctx.fillRect(ox, oy, MAP_W, MAP_H);
  ctx.fillStyle = '#6f9e52';
  ctx.fillRect(ox + 150 * sx, oy, MAP_W - 150 * sx, MAP_H);
  // Roads.
  ctx.strokeStyle = '#3b4048';
  ctx.lineWidth = 4;
  for (const ax of state.city.avenues) {
    ctx.beginPath();
    ctx.moveTo(ox + ax * sx, oy);
    ctx.lineTo(ox + ax * sx, oy + MAP_H);
    ctx.stroke();
  }
  for (const sy2 of state.city.streets) {
    ctx.beginPath();
    ctx.moveTo(ox, oy + sy2 * sy);
    ctx.lineTo(ox + MAP_W, oy + sy2 * sy);
    ctx.stroke();
  }
  const dot = (x, y, color, r) => {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(ox + x * sx, oy + y * sy, r, 0, Math.PI * 2);
    ctx.fill();
  };
  // Garage, mission marker, taxi, cops, player.
  dot(state.city.spots.garage.x, state.city.spots.garage.y, '#b8452f', 4);
  const obj = currentObjective(state.missions);
  if (obj.x !== null && obj.y !== null) {
    dot(obj.x, obj.y, '#ffd23c', 5);
    ctx.strokeStyle = '#ffd23c';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(ox + obj.x * sx, oy + obj.y * sy, 8, 0, Math.PI * 2);
    ctx.stroke();
  }
  const taxi = state.missions.taxi;
  if (taxi) {
    if (taxi.phase === 'pickup') dot(taxi.passenger.x, taxi.passenger.y, '#f2c200', 4);
    else dot(taxi.dest.x, taxi.dest.y, '#f2c200', 4);
  }
  for (const car of state.police.cars) dot(car.x, car.y, '#5b8cff', 3);
  for (const cop of state.police.foot) dot(cop.x, cop.y, '#5b8cff', 2.5);
  const p = state.player;
  const px = p.car ? p.car.x : p.x;
  const py = p.car ? p.car.y : p.y;
  // Player arrow.
  ctx.save();
  ctx.translate(ox + px * sx, oy + py * sy);
  ctx.rotate(p.angle);
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.moveTo(7, 0);
  ctx.lineTo(-5, -4.5);
  ctx.lineTo(-5, 4.5);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  ctx.restore();
}
