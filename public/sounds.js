// Themed Web Audio synth shared by display + admin pages.
// Three themes per moment: scifi (default), organic, retro.
// Loops (scan, error alarm) are scheduled on the Web Audio clock.
(function () {
  let audioCtx = null;
  function ensureAudio() {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    return audioCtx;
  }

  // ---------- Submit (one-shot, ~80ms) ----------
  const submitVariants = {
    scifi(ctx) {
      const o = ctx.createOscillator(); const g = ctx.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(880, ctx.currentTime);
      o.frequency.exponentialRampToValueAtTime(1320, ctx.currentTime + 0.06);
      g.gain.setValueAtTime(0.0001, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.45, ctx.currentTime + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.1);
      o.connect(g).connect(ctx.destination);
      o.start(); o.stop(ctx.currentTime + 0.1);
    },
    organic(ctx) {
      // Wooden pluck: triangle pair with quick exp decay.
      const freqs = [880, 1318.51]; // A5 + E6
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.22, ctx.currentTime + 0.005);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.25);
      g.connect(ctx.destination);
      for (const f of freqs) {
        const o = ctx.createOscillator();
        o.type = 'triangle'; o.frequency.value = f;
        o.connect(g); o.start();
        o.stop(ctx.currentTime + 0.28);
      }
    },
    retro(ctx) {
      // 8-bit blip: square chirp up.
      const o = ctx.createOscillator(); const g = ctx.createGain();
      o.type = 'square';
      o.frequency.setValueAtTime(660, ctx.currentTime);
      o.frequency.setValueAtTime(990, ctx.currentTime + 0.04);
      o.frequency.setValueAtTime(1320, ctx.currentTime + 0.08);
      g.gain.setValueAtTime(0.0001, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.15, ctx.currentTime + 0.005);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.13);
      o.connect(g).connect(ctx.destination);
      o.start(); o.stop(ctx.currentTime + 0.14);
    },
  };

  function playSubmit(theme) {
    if (!audioCtx) return;
    (submitVariants[theme] || submitVariants.scifi)(audioCtx);
  }

  // ---------- Scan loop (continuous until stop) ----------
  let scanNode = null;
  const scanVariants = {
    scifi(ctx) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(220, ctx.currentTime);
      o.frequency.linearRampToValueAtTime(440, ctx.currentTime + 4.0);
      const n = ctx.createBufferSource();
      const buf = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate);
      const ch = buf.getChannelData(0);
      for (let i = 0; i < ch.length; i++) ch[i] = (Math.random() * 2 - 1) * 0.3;
      n.buffer = buf; n.loop = true;
      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(800, ctx.currentTime);
      filter.frequency.linearRampToValueAtTime(2200, ctx.currentTime + 4.0);
      filter.Q.value = 6;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, ctx.currentTime);
      g.gain.linearRampToValueAtTime(0.12, ctx.currentTime + 0.25);
      o.connect(filter); n.connect(filter);
      filter.connect(g).connect(ctx.destination);
      o.start(); n.start();
      return { stop() {
        try {
          g.gain.cancelScheduledValues(ctx.currentTime);
          g.gain.setValueAtTime(g.gain.value, ctx.currentTime);
          g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.2);
          o.stop(ctx.currentTime + 0.25); n.stop(ctx.currentTime + 0.25);
        } catch (e) {}
      }};
    },
    organic(ctx) {
      // Wind-like: filtered pink-ish noise with slow sine wobble.
      const n = ctx.createBufferSource();
      const buf = ctx.createBuffer(1, ctx.sampleRate * 1.0, ctx.sampleRate);
      const ch = buf.getChannelData(0);
      let last = 0;
      for (let i = 0; i < ch.length; i++) {
        const white = Math.random() * 2 - 1;
        last = (last + white * 0.06) * 0.985;
        ch[i] = last;
      }
      n.buffer = buf; n.loop = true;
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass'; filter.Q.value = 2;
      filter.frequency.setValueAtTime(600, ctx.currentTime);
      filter.frequency.linearRampToValueAtTime(1800, ctx.currentTime + 4.0);
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.setValueAtTime(180, ctx.currentTime);
      o.frequency.linearRampToValueAtTime(360, ctx.currentTime + 4.0);
      const og = ctx.createGain(); og.gain.value = 0.04;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, ctx.currentTime);
      g.gain.linearRampToValueAtTime(0.22, ctx.currentTime + 0.3);
      o.connect(og).connect(g);
      n.connect(filter).connect(g);
      g.connect(ctx.destination);
      o.start(); n.start();
      return { stop() {
        try {
          g.gain.cancelScheduledValues(ctx.currentTime);
          g.gain.setValueAtTime(g.gain.value, ctx.currentTime);
          g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.25);
          o.stop(ctx.currentTime + 0.3); n.stop(ctx.currentTime + 0.3);
        } catch (e) {}
      }};
    },
    retro(ctx) {
      // Chiptune arp: square wave stepping through 4 notes per second.
      const o = ctx.createOscillator();
      o.type = 'square';
      const notes = [220, 277.18, 329.63, 440]; // A3 C#4 E4 A4
      const step = 0.18;
      let t = ctx.currentTime;
      for (let i = 0; i < 60; i++) {
        o.frequency.setValueAtTime(notes[i % notes.length], t);
        t += step;
      }
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, ctx.currentTime);
      g.gain.linearRampToValueAtTime(0.1, ctx.currentTime + 0.2);
      o.connect(g).connect(ctx.destination);
      o.start();
      return { stop() {
        try {
          g.gain.cancelScheduledValues(ctx.currentTime);
          g.gain.setValueAtTime(g.gain.value, ctx.currentTime);
          g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.2);
          o.stop(ctx.currentTime + 0.25);
        } catch (e) {}
      }};
    },
  };

  function startScanLoop(theme) {
    stopScanLoop();
    if (!audioCtx) return;
    scanNode = (scanVariants[theme] || scanVariants.scifi)(audioCtx);
  }
  function stopScanLoop() {
    if (!scanNode) return;
    scanNode.stop();
    scanNode = null;
  }

  // ---------- Error alarm (1s on / 1s off loop, scheduled upfront) ----------
  let alarmNode = null;
  const ALARM_PERIOD = 2.0;
  const ALARM_ON     = 1.0;
  const alarmVariants = {
    scifi(ctx, schedulePulse) {
      const o1 = ctx.createOscillator();
      const o2 = ctx.createOscillator();
      o1.type = 'square'; o2.type = 'square';
      o1.frequency.value = 110; o2.frequency.value = 113;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, ctx.currentTime);
      o1.connect(g); o2.connect(g);
      g.connect(ctx.destination);
      o1.start(); o2.start();
      schedulePulse(g, 0.28);
      return { stop() {
        try {
          const now = ctx.currentTime;
          const v = Math.max(0.0001, g.gain.value);
          g.gain.cancelScheduledValues(now);
          g.gain.setValueAtTime(v, now);
          g.gain.exponentialRampToValueAtTime(0.0001, now + 0.8);
          o1.stop(now + 0.85); o2.stop(now + 0.85);
        } catch (e) {}
      }};
    },
    organic(ctx, schedulePulse) {
      // Low warm throb — sine sub + soft saw.
      const o1 = ctx.createOscillator();
      const o2 = ctx.createOscillator();
      o1.type = 'sine'; o2.type = 'sawtooth';
      o1.frequency.value = 82;  // E2
      o2.frequency.value = 164; // E3
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass'; filter.frequency.value = 600; filter.Q.value = 1;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, ctx.currentTime);
      o1.connect(filter); o2.connect(filter);
      filter.connect(g).connect(ctx.destination);
      o1.start(); o2.start();
      schedulePulse(g, 0.34);
      return { stop() {
        try {
          const now = ctx.currentTime;
          const v = Math.max(0.0001, g.gain.value);
          g.gain.cancelScheduledValues(now);
          g.gain.setValueAtTime(v, now);
          g.gain.exponentialRampToValueAtTime(0.0001, now + 0.8);
          o1.stop(now + 0.85); o2.stop(now + 0.85);
        } catch (e) {}
      }};
    },
    retro(ctx, schedulePulse) {
      // NES-style two-note buzz alternating per pulse.
      const o = ctx.createOscillator();
      o.type = 'square';
      o.frequency.value = 138;
      // Alternate frequency per pulse over scheduling window.
      let t = ctx.currentTime + 0.005;
      const pulses = Math.ceil((10 * 60) / ALARM_PERIOD);
      for (let i = 0; i < pulses; i++) {
        o.frequency.setValueAtTime(i % 2 === 0 ? 110 : 138, t);
        t += ALARM_PERIOD;
      }
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, ctx.currentTime);
      o.connect(g).connect(ctx.destination);
      o.start();
      schedulePulse(g, 0.26);
      return { stop() {
        try {
          const now = ctx.currentTime;
          const v = Math.max(0.0001, g.gain.value);
          g.gain.cancelScheduledValues(now);
          g.gain.setValueAtTime(v, now);
          g.gain.exponentialRampToValueAtTime(0.0001, now + 0.8);
          o.stop(now + 0.85);
        } catch (e) {}
      }};
    },
  };

  function startErrorAlarm(theme) {
    if (alarmNode || !audioCtx) return;
    const ctx = audioCtx;
    function schedulePulse(g, peak) {
      const pulses = Math.ceil((10 * 60) / ALARM_PERIOD);
      let t = ctx.currentTime + 0.01;
      for (let i = 0; i < pulses; i++) {
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(peak, t + 0.008);
        g.gain.setValueAtTime(peak, t + ALARM_ON - 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, t + ALARM_ON);
        t += ALARM_PERIOD;
      }
    }
    alarmNode = (alarmVariants[theme] || alarmVariants.scifi)(ctx, schedulePulse);
  }
  function stopErrorAlarm() {
    if (!alarmNode) return;
    alarmNode.stop();
    alarmNode = null;
  }

  // ---------- Success chime (one-shot 3s tail) ----------
  const successVariants = {
    scifi(ctx) {
      const freqs = [523.25, 659.25, 783.99]; // C5 E5 G5
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.16, ctx.currentTime + 0.05);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 3.0);
      g.connect(ctx.destination);
      for (const f of freqs) {
        const o = ctx.createOscillator();
        o.type = 'sine'; o.frequency.value = f;
        o.connect(g); o.start();
        o.stop(ctx.currentTime + 3.05);
      }
    },
    organic(ctx) {
      // Triangle bell — open fifth + octave shimmer.
      const base = [261.63, 392.00, 523.25]; // C4 G4 C5
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.18, ctx.currentTime + 0.08);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 3.0);
      g.connect(ctx.destination);
      for (const f of base) {
        const o = ctx.createOscillator();
        o.type = 'triangle'; o.frequency.value = f;
        o.connect(g); o.start();
        o.stop(ctx.currentTime + 3.05);
      }
      // shimmer 2 octaves up, softer
      const sg = ctx.createGain();
      sg.gain.setValueAtTime(0.0001, ctx.currentTime);
      sg.gain.exponentialRampToValueAtTime(0.05, ctx.currentTime + 0.2);
      sg.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 3.0);
      sg.connect(ctx.destination);
      const sh = ctx.createOscillator();
      sh.type = 'sine'; sh.frequency.value = 1046.50; // C6
      sh.connect(sg); sh.start();
      sh.stop(ctx.currentTime + 3.05);
    },
    retro(ctx) {
      // Chiptune arpeggio C5 E5 G5 C6 then sustained square C5+G5 tail.
      const arp = [523.25, 659.25, 783.99, 1046.50];
      const ag = ctx.createGain();
      ag.gain.setValueAtTime(0.14, ctx.currentTime);
      ag.connect(ctx.destination);
      const ao = ctx.createOscillator();
      ao.type = 'square';
      let t = ctx.currentTime;
      for (let i = 0; i < arp.length; i++) {
        ao.frequency.setValueAtTime(arp[i], t);
        t += 0.09;
      }
      ao.connect(ag); ao.start();
      ao.stop(ctx.currentTime + arp.length * 0.09 + 0.02);
      // Sustain pair
      const sg = ctx.createGain();
      sg.gain.setValueAtTime(0.0001, ctx.currentTime + 0.3);
      sg.gain.exponentialRampToValueAtTime(0.1, ctx.currentTime + 0.35);
      sg.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 3.0);
      sg.connect(ctx.destination);
      for (const f of [523.25, 783.99]) {
        const o = ctx.createOscillator();
        o.type = 'square'; o.frequency.value = f;
        o.connect(sg); o.start(ctx.currentTime + 0.3);
        o.stop(ctx.currentTime + 3.05);
      }
    },
  };

  function playSuccess(theme) {
    if (!audioCtx) return;
    (successVariants[theme] || successVariants.scifi)(audioCtx);
  }

  // ---------- Resolver ----------
  // themeConfig = { global, submit, scan, errorAlarm, success } from server.
  function resolve(themeConfig, moment) {
    if (!themeConfig) return 'scifi';
    return themeConfig[moment] || themeConfig.global || 'scifi';
  }

  window.Sounds = {
    ensureAudio,
    playSubmit, startScanLoop, stopScanLoop,
    startErrorAlarm, stopErrorAlarm, playSuccess,
    resolve,
  };
})();
