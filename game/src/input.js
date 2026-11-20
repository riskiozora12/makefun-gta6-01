// Keyboard and pointer input. Held keys give a move direction; one-shot presses
// (confirm, pause, interact, mute, weapon) are queued as bit flags and taken once
// by the loop, so a press between two frames is never lost or counted twice.
import { KEYS } from './config.js';

export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;
export const ACTION_INTERACT = 4;
export const ACTION_MUTE = 8;
export const ACTION_WEAPON = 16;

function has(list, code) {
  return list.indexOf(code) !== -1;
}

export function createInput(canvas) {
  const held = new Set();
  let actions = 0;
  const mouse = { x: 0, y: 0, down: false, clicked: false };

  window.addEventListener('keydown', (event) => {
    if (has(KEYS.pause, event.code)) {
      if (!event.repeat) actions |= ACTION_PAUSE;
      event.preventDefault();
      return;
    }
    if (has(KEYS.interact, event.code)) {
      if (!event.repeat) actions |= ACTION_INTERACT;
      return;
    }
    if (has(KEYS.mute, event.code)) {
      if (!event.repeat) actions |= ACTION_MUTE;
      return;
    }
    if (has(KEYS.weapon, event.code)) {
      if (!event.repeat) actions |= ACTION_WEAPON;
      return;
    }
    if (has(KEYS.handbrake, event.code) && event.target === document.body) event.preventDefault();
    held.add(event.code);
  });
  window.addEventListener('keyup', (event) => {
    held.delete(event.code);
  });
  window.addEventListener('blur', () => {
    held.clear();
    mouse.down = false;
  });

  function trackPointer(event) {
    const rect = canvas.getBoundingClientRect();
    mouse.x = event.clientX - rect.left;
    mouse.y = event.clientY - rect.top;
  }
  canvas.addEventListener('pointermove', trackPointer);
  canvas.addEventListener('pointerdown', (event) => {
    trackPointer(event);
    mouse.down = true;
    mouse.clicked = true;
    actions |= ACTION_CONFIRM;
  });
  window.addEventListener('pointerup', () => {
    mouse.down = false;
  });

  function axis(neg, pos) {
    return (held.has(pos[0]) || held.has(pos[1]) ? 1 : 0) - (held.has(neg[0]) || held.has(neg[1]) ? 1 : 0);
  }

  return {
    mouse,
    /** {x, y} each -1, 0 or 1. */
    move() {
      return { x: axis(KEYS.left, KEYS.right), y: axis(KEYS.up, KEYS.down) };
    },
    run() {
      return held.has(KEYS.run[0]) || held.has(KEYS.run[1]);
    },
    handbrake() {
      return held.has(KEYS.handbrake[0]);
    },
    takeActions() {
      const taken = actions;
      actions = 0;
      return taken;
    },
    takeClick() {
      const c = mouse.clicked;
      mouse.clicked = false;
      return c;
    },
  };
}
