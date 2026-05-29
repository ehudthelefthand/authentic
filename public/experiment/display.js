// ================================================================
// AUTHENTIC – Collective Fingerprint Display
//
// One large fingerprint (~300 particles) covers the screen.
// Particles start dark. Each new participant randomly lights up
// some particles one-by-one until the whole fingerprint is lit.
// ================================================================

const TOTAL_PARTICLES   = 300;   // total dots in the fingerprint
const STAGGER_MS        = 130;   // delay between each dot activating (ms)
const TRANSITION_MS     = 700;   // each dot's color-fade duration (ms)
const FP_SEED           = 42;    // fixed seed → same shape every load
const DARK_ALPHA        = 28;    // base opacity for unlit particles (0-255)

// ---- Particle state ----
// Each particle: { x, y, size } (from fingerprint.js, normalized)
// Paired state:  { litColor: null | [r,g,b], transitionFrom: [r,g,b], progress: 0..1 }
let fp = null;           // { particles } from generateFingerprintParticles
let states = [];         // parallel array of particle states
let totalLit = 0;

// Pending queue: { indices: number[], hexColor: string }[]
// Processed one dot at a time with STAGGER_MS interval
let pendingActivations = []; // flat list: { index, color: [r,g,b] }
let lastActivateMs = 0;

// Track joined participants (to avoid duplication on WS reconnect)
const joinedIds = new Set();

// ---- Parse hex to [r,g,b] ----
function hexToRgb(hex) {
  const n = parseInt(hex.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

// ---- Pick N random dark (unlit) particle indices ----
function pickDarkParticles(n) {
  const dark = [];
  for (let i = 0; i < states.length; i++) {
    if (!states[i].litColor && states[i].progress === 0) dark.push(i);
  }
  // Fisher-Yates shuffle then take n
  for (let i = dark.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [dark[i], dark[j]] = [dark[j], dark[i]];
  }
  return dark.slice(0, n);
}

// ---- Register a new participant → queue particle activations ----
function enqueueParticipant(participant) {
  const palette = getPalette(participant.paletteIndex);
  const color = hexToRgb(palette[0]);

  // How many particles this person activates:
  // Adaptive: more when many are dark, fewer when almost full
  const darkCount = states.filter(s => !s.litColor && s.progress === 0).length;
  const share = Math.max(5, Math.ceil(darkCount * 0.25));
  const indices = pickDarkParticles(share);

  indices.forEach(idx => pendingActivations.push({ index: idx, color }));
}

// ---- p5.js sketch ----
const sketch = (p) => {
  p.setup = () => {
    p.createCanvas(window.innerWidth, window.innerHeight);
    p.frameRate(40);

    // Generate the one shared fingerprint shape
    fp = generateFingerprintParticles(FP_SEED, TOTAL_PARTICLES);
    states = fp.particles.map(() => ({
      litColor: null,          // [r,g,b] when lit, null when dark
      transitionFrom: [15, 18, 30], // starting color (near-black)
      progress: 0,             // 0 = not transitioning, 0..1 = fading in
    }));

    // Load existing participants (no animation, instant)
    fetch('/participants')
      .then(r => r.json())
      .then(list => {
        list.forEach(p => {
          joinedIds.add(p.id);
          enqueueParticipant(p);
        });
        // Flash all pending instantly for pre-existing participants
        pendingActivations.forEach(({ index, color }) => {
          states[index].litColor = color;
          states[index].progress = 1;
          totalLit++;
        });
        pendingActivations = [];
      });

    connectWebSocket();
  };

  p.windowResized = () => {
    p.resizeCanvas(window.innerWidth, window.innerHeight);
  };

  p.draw = () => {
    p.background(7, 7, 15);

    const now = p.millis();
    const t = now / 1000;

    // --- Process activation queue ---
    if (pendingActivations.length > 0 && now - lastActivateMs >= STAGGER_MS) {
      const next = pendingActivations.shift();
      const st = states[next.index];
      // Capture current rendered color as transition start
      st.transitionFrom = st.litColor ? [...st.litColor] : [15, 18, 30];
      st.litColor = next.color;
      st.progress = 0;
      totalLit++;
      lastActivateMs = now;
    }

    // --- Advance transitions ---
    const step = p.deltaTime / TRANSITION_MS;
    for (let i = 0; i < states.length; i++) {
      if (states[i].litColor && states[i].progress < 1) {
        states[i].progress = Math.min(1, states[i].progress + step);
      }
    }

    // --- Draw fingerprint ---
    const diameter = Math.min(p.width, p.height) * 0.82;
    const cx = p.width / 2;
    const cy = p.height / 2 + 20; // slightly below center (room for title)
    const radius = diameter / 2;

    p.noStroke();

    const baseScale = diameter / 360;

    for (let i = 0; i < fp.particles.length; i++) {
      const pt = fp.particles[i];
      const st = states[i];

      // Gentle ambient drift along the ridge direction
      const drift = 0.009;
      const dx = Math.sin(t * 0.55 + pt.angle * 2.1 + pt.ring * 0.7) * drift;
      const dy = Math.cos(t * 0.48 + pt.angle * 1.8 + pt.ring * 0.4) * drift;

      const px = (pt.x + dx) * radius + cx;
      const py = (pt.y + dy) * radius + cy;

      let r, g, b, a;

      if (!st.litColor) {
        // Unlit / dark – very dim, just enough to see the ridge shape
        r = 22; g = 26; b = 44;
        a = DARK_ALPHA + Math.sin(t * 0.8 + i * 0.3) * 5;
      } else if (st.progress < 1) {
        // Transitioning: ease-out cubic lerp from dark → lit color
        const ease = 1 - Math.pow(1 - st.progress, 3);
        const [fr, fg, fb] = st.transitionFrom;
        const [lr, lg, lb] = st.litColor;
        r = fr + (lr - fr) * ease;
        g = fg + (lg - fg) * ease;
        b = fb + (lb - fb) * ease;
        a = DARK_ALPHA + (pt.opacity * 230 - DARK_ALPHA) * ease;
      } else {
        // Fully lit
        [r, g, b] = st.litColor;
        a = pt.opacity * 230 + Math.sin(t * 1.1 + i * 0.5) * 12;
      }

      p.fill(r, g, b, Math.max(0, Math.min(255, a)));

      // Elongated dash in the ridge tangent direction
      const dw = pt.size * baseScale * 4.2; // long axis (along ridge)
      const dh = pt.size * baseScale * 1.1; // short axis (across ridge)

      p.push();
      p.translate(px, py);
      p.rotate(pt.tangentAngle);
      p.ellipse(0, 0, dw, dh);
      p.pop();
    }

    // --- Header ---
    drawHeader(p, t);
  };

  function drawHeader(p, t) {
    p.textFont('Sarabun, sans-serif');
    p.textAlign(p.CENTER, p.TOP);
    p.noStroke();

    p.textSize(26);
    p.fill(225, 232, 240, 210);
    p.text('AUTHENTIC', p.width / 2, 22);

    p.textSize(13);
    p.fill(100, 116, 139, 180);
    p.text('สะท้อนพระคริสต์ด้วยชีวิตจริง', p.width / 2, 56);

    if (totalLit > 0) {
      p.textSize(10);
      p.fill(51, 65, 85, 160);
      p.text(`${joinedIds.size} คน · ${totalLit} / ${TOTAL_PARTICLES} จุด`, p.width / 2, 78);
    } else {
      const a = 80 + Math.sin(t * 1.3) * 30;
      p.textSize(13);
      p.fill(71, 85, 105, a);
      p.textAlign(p.CENTER, p.BOTTOM);
      p.text('รอผู้เข้าร่วมสแกน QR Code...', p.width / 2, p.height - 30);
    }
  }
};

// ---- WebSocket ----
function connectWebSocket() {
  const wsStatus = document.getElementById('ws-status');
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  const ws = new WebSocket(`${protocol}//${location.host}`);

  ws.onopen  = () => { wsStatus.style.color = '#166534'; };
  ws.onclose = () => {
    wsStatus.style.color = '#7f1d1d';
    setTimeout(connectWebSocket, 3000);
  };

  ws.onmessage = (event) => {
    try {
      const msg = JSON.parse(event.data);
      if (msg.type === 'new_participant' && !joinedIds.has(msg.data.id)) {
        joinedIds.add(msg.data.id);
        enqueueParticipant(msg.data);
      }
    } catch (e) {
      console.error('WS parse error', e);
    }
  };
}

// ---- Boot ----
new p5(sketch);
