// All sound is synthesised in code with WebAudio: engine hum, sirens, gunshots,
// crashes, chimes and a small bass loop. No audio files, no network.
export function createAudio() {
  let ctx = null;
  let master = null;
  let muted = false;
  let engineOsc = null;
  let engineGain = null;
  let engineFilter = null;
  let sirenOsc = null;
  let sirenGain = null;
  let musicTimer = null;
  let musicStep = 0;

  function ensure() {
    if (ctx) return true;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.5;
      master.connect(ctx.destination);
    } catch {
      return false;
    }
    return true;
  }

  function noiseBuffer(seconds) {
    const buf = ctx.createBuffer(1, ctx.sampleRate * seconds, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
    return buf;
  }

  function blip(freq, dur, type, vol, slideTo) {
    if (!ensure() || muted) return;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g);
    g.connect(master);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  function noiseHit(dur, vol, freq) {
    if (!ensure() || muted) return;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer(dur);
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f);
    f.connect(g);
    g.connect(master);
    src.start(t);
  }

  // A two-note police siren that wails while any cop car is near.
  function setSiren(on) {
    if (!ensure()) return;
    if (on && !sirenOsc) {
      sirenOsc = ctx.createOscillator();
      sirenGain = ctx.createGain();
      sirenOsc.type = 'triangle';
      sirenOsc.frequency.value = 720;
      sirenGain.gain.value = 0.05;
      sirenOsc.connect(sirenGain);
      sirenGain.connect(master);
      sirenOsc.start();
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 0.6;
      const lfoGain = ctx.createGain();
      lfoGain.gain.value = 220;
      lfo.connect(lfoGain);
      lfoGain.connect(sirenOsc.frequency);
      lfo.start();
      sirenOsc._lfo = lfo;
    } else if (!on && sirenOsc) {
      try {
        sirenOsc._lfo.stop();
        sirenOsc.stop();
      } catch { /* already stopped */ }
      sirenOsc = null;
      sirenGain = null;
    }
  }

  function setEngine(speed01, on) {
    if (!ensure()) return;
    if (on && !engineOsc) {
      engineOsc = ctx.createOscillator();
      engineOsc.type = 'sawtooth';
      engineOsc.frequency.value = 70;
      engineFilter = ctx.createBiquadFilter();
      engineFilter.type = 'lowpass';
      engineFilter.frequency.value = 500;
      engineGain = ctx.createGain();
      engineGain.gain.value = 0.05;
      engineOsc.connect(engineFilter);
      engineFilter.connect(engineGain);
      engineGain.connect(master);
      engineOsc.start();
    }
    if (engineOsc) {
      engineOsc.frequency.value = 60 + speed01 * 140;
      engineFilter.frequency.value = 350 + speed01 * 900;
      engineGain.gain.value = on ? 0.04 + speed01 * 0.05 : 0;
    }
  }

  // A slow bass loop: root notes with a hat tick, synthwave at walking pace.
  const BASSLINE = [55, 0, 55, 65.4, 0, 55, 82.4, 73.4];
  function startMusic() {
    if (!ensure() || musicTimer) return;
    musicTimer = window.setInterval(() => {
      if (muted) return;
      const note = BASSLINE[musicStep % BASSLINE.length];
      musicStep += 1;
      if (note) blip(note, 0.34, 'sawtooth', 0.05);
      if (musicStep % 2 === 0) noiseHit(0.03, 0.02, 6000);
    }, 300);
  }

  function stopMusic() {
    if (musicTimer) {
      window.clearInterval(musicTimer);
      musicTimer = null;
    }
  }

  return {
    unlock() {
      if (ensure() && ctx.state === 'suspended') ctx.resume();
    },
    setMuted(m) {
      muted = m;
      if (master) master.gain.value = m ? 0 : 0.5;
      if (m) setSiren(false);
    },
    isMuted() {
      return muted;
    },
    engine: setEngine,
    siren: setSiren,
    shot() {
      noiseHit(0.12, 0.35, 1800);
      blip(160, 0.08, 'square', 0.12, 60);
    },
    punch() {
      noiseHit(0.08, 0.2, 900);
    },
    crash() {
      noiseHit(0.25, 0.4, 500);
    },
    pickup() {
      blip(660, 0.09, 'sine', 0.18);
      window.setTimeout(() => blip(880, 0.12, 'sine', 0.18), 80);
    },
    cash() {
      blip(990, 0.08, 'sine', 0.16);
      window.setTimeout(() => blip(1320, 0.14, 'sine', 0.16), 70);
    },
    jingle() {
      [523, 659, 784, 1046].forEach((f, i) => window.setTimeout(() => blip(f, 0.16, 'triangle', 0.18), i * 110));
    },
    fail() {
      blip(220, 0.3, 'sawtooth', 0.16, 110);
    },
    sirenBurst() {
      blip(880, 0.2, 'square', 0.1, 1200);
    },
    startMusic,
    stopMusic,
  };
}
