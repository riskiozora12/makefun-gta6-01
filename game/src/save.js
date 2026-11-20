// Saving: progress lives in this browser's localStorage — cash, missions
// done, best haul — and loads again on the next visit. Nothing leaves the machine.
import { SAVE_KEY } from './config.js';

export function loadSave() {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (typeof data !== 'object' || data === null) return null;
    return {
      cash: typeof data.cash === 'number' ? data.cash : 0,
      missionIndex: typeof data.missionIndex === 'number' ? data.missionIndex : 0,
      storyComplete: !!data.storyComplete,
      bestCash: typeof data.bestCash === 'number' ? data.bestCash : 0,
      muted: !!data.muted,
    };
  } catch {
    return null;
  }
}

export function writeSave(state) {
  try {
    const p = state.player;
    const data = {
      cash: p.cash,
      missionIndex: state.missions.index,
      storyComplete: state.missions.complete,
      bestCash: Math.max(state.bestCash || 0, p.cash),
      muted: state.audio.isMuted(),
    };
    window.localStorage.setItem(SAVE_KEY, JSON.stringify(data));
  } catch {
    // Storage can be off (private windows): progress then lasts this visit only.
  }
}

export function clearSave() {
  try {
    window.localStorage.removeItem(SAVE_KEY);
  } catch {
    // Nothing to clear.
  }
}
