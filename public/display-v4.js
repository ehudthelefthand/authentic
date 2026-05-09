// ================================================================
// AUTHENTIC – Neon Soul v4
//
// Based on display-v2 (classic fingerprint shape) with:
//   - 2-pass render: dark arcs (BLEND) then lit arcs (ADD)
//   - 2-layer additive neon glow: outer halo + core
//   - Water-surface interference breathing (3 plane waves)
//   - White-hot flare on first activation
// ================================================================

const TOTAL_PARTICLES = 300;
const STAGGER_MS      = 130;
const TRANSITION_MS   = 700;
const FLARE_MS        = 1400;
const FP_SEED         = 42;
const DARK_ALPHA      = 28;
const BREATHE_MIN     = 0.10;

let fp = null;
let states = [];
let totalLit = 0;
let pendingActivations = [];
let lastActivateMs = 0;
const joinedIds = new Set();

let glowRevealed    = false; // flips to true the moment totalLit reaches TOTAL_PARTICLES
let glowTransition  = 0;    // 0 = v2 style, 1 = full neon glow (animates over GLOW_FADE_MS)
const GLOW_FADE_MS  = 2500;
const glowLayers = { 1: true, 2: true, 3: true, 4: true }; // toggled by UI buttons

function hexToRgb(hex) {
  const n = parseInt(hex.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function pickDarkParticles(n) {
  const dark = [];
  for (let i = 0; i < states.length; i++) {
    if (!states[i].litColor && states[i].progress === 0) dark.push(i);
  }
  for (let i = dark.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [dark[i], dark[j]] = [dark[j], dark[i]];
  }
  return dark.slice(0, n);
}

function enqueueParticipant(participant) {
  const palette   = getPalette(participant.paletteIndex);
  const color     = hexToRgb(palette[0]);
  const darkCount = states.filter(s => !s.litColor && s.progress === 0).length;
  const share     = Math.max(5, Math.ceil(darkCount * 0.25));
  pickDarkParticles(share).forEach(idx =>
    pendingActivations.push({ index: idx, color })
  );
}

// ---- arc geometry helper ----
function arcGeom(pt, px, py, halfLen) {
  const cosT  = Math.cos(pt.tangentAngle);
  const sinT  = Math.sin(pt.tangentAngle);
  const x1    = px - cosT * halfLen;
  const y1    = py - sinT * halfLen;
  const x2    = px + cosT * halfLen;
  const y2    = py + sinT * halfLen;

  const inX   = -pt.x, inY = -pt.y;
  const dot   = (-sinT) * inX + cosT * inY;
  const perpX = dot >= 0 ? -sinT :  sinT;
  const perpY = dot >= 0 ?  cosT : -cosT;

  const t_ring = (pt.ring + 0.5) / 16;
  const cf     = halfLen * (0.55 - t_ring * 0.3);
  return { x1, y1, x2, y2, ctrlX: px - perpX * cf, ctrlY: py - perpY * cf };
}

function drawBezier(p, g) {
  p.beginShape();
  p.vertex(g.x1, g.y1);
  p.quadraticVertex(g.ctrlX, g.ctrlY, g.x2, g.y2);
  p.endShape();
}

// ---- p5.js sketch ----
const sketch = (p) => {

  p.setup = () => {
    p.createCanvas(window.innerWidth, window.innerHeight);
    p.frameRate(40);

    fp     = generateFingerprintParticles(FP_SEED, TOTAL_PARTICLES);
    states = fp.particles.map(() => ({
      litColor:      null,
      transitionFrom:[15, 18, 30],
      progress:      0,
      flareT:        1,   // 0 = just activated (white-hot), 1 = settled
    }));

    fetch('/participants')
      .then(r => r.json())
      .then(list => {
        list.forEach(participant => {
          joinedIds.add(participant.id);
          enqueueParticipant(participant);
        });
        pendingActivations.forEach(({ index, color }) => {
          states[index].litColor = color;
          states[index].progress = 1;
          states[index].flareT   = 1;
          totalLit++;
        });
        pendingActivations = [];
      });

    connectWebSocket();
  };

  p.windowResized = () => p.resizeCanvas(window.innerWidth, window.innerHeight);

  p.draw = () => {
    p.background(7, 7, 15);

    const now = p.millis();
    const t   = now / 1000;

    // ---- queue processing ----
    if (pendingActivations.length > 0 && now - lastActivateMs >= STAGGER_MS) {
      const next = pendingActivations.shift();
      const st   = states[next.index];
      st.transitionFrom = st.litColor ? [...st.litColor] : [15, 18, 30];
      st.litColor = next.color;
      st.progress = 0;
      st.flareT   = 0;   // trigger white-hot flare
      totalLit++;
      lastActivateMs = now;
    }

    // ---- advance animations ----
    const transStep = p.deltaTime / TRANSITION_MS;
    const flareStep = p.deltaTime / FLARE_MS;
    for (let i = 0; i < states.length; i++) {
      const st = states[i];
      if (st.litColor && st.progress < 1) st.progress = Math.min(1, st.progress + transStep);
      if (st.flareT   < 1)               st.flareT   = Math.min(1, st.flareT   + flareStep);
    }

    // ---- layout ----
    const diameter  = Math.min(p.width, p.height) * 0.82;
    const cx        = p.width  / 2;
    const cy        = p.height / 2 + 20;
    const radius    = diameter / 2;
    const baseScale = diameter / 360;

    // ---- water-surface interference breathe ----
    // 3 plane waves at different directions + speeds → unpredictable shimmer
    const intensityCap = t < 3 ? 1.0 : 0.7;
    const breatheOf = (pt) => {
      const w1 = Math.sin(t * 1.10 + pt.x *  8.0 + pt.y *  4.2);
      const w2 = Math.sin(t * 0.83 - pt.x *  5.5 + pt.y *  9.1);
      const w3 = Math.sin(t * 1.47 + pt.x *  3.8 - pt.y *  7.3);
      const raw = (w1 + w2 + w3) / 3 * 0.5 + 0.5;
      return Math.max(BREATHE_MIN, Math.min(raw, intensityCap));
    };

    // ---- PASS 1: dark arcs (BLEND, very dim) ----
    p.blendMode(p.BLEND);
    p.noFill();
    p.strokeCap(p.ROUND);
    p.strokeJoin(p.ROUND);

    for (let i = 0; i < fp.particles.length; i++) {
      if (states[i].litColor) continue;

      const pt    = fp.particles[i];
      const phase = i * 2.399;
      const drift = 0.009;
      const dx    = Math.sin(t * 0.55 + pt.angle * 2.1 + pt.ring * 0.7) * drift;
      const dy    = Math.cos(t * 0.48 + pt.angle * 1.8 + pt.ring * 0.4) * drift;
      const px    = (pt.x + dx) * radius + cx;
      const py    = (pt.y + dy) * radius + cy;

      const shimmerSlow = Math.sin(t * 0.9 + phase);
      const shimmerFast = Math.sin(t * 3.1 + phase * 1.3);
      const a = Math.max(0, DARK_ALPHA + shimmerSlow * 6 + shimmerFast * 2);

      const halfLen = pt.size * baseScale * 4.2;
      p.stroke(22, 26, 44, a);
      p.strokeWeight(pt.size * baseScale * 1.6);
      drawBezier(p, arcGeom(pt, px, py, halfLen));
    }

    // ---- PASS 2: lit arcs ----
    if (totalLit >= TOTAL_PARTICLES && !glowRevealed) {
      glowRevealed = true;
      if (typeof setLayerButtonsEnabled === 'function') setLayerButtonsEnabled(true);
    }
    if (glowRevealed && glowTransition < 1) {
      glowTransition = Math.min(1, glowTransition + p.deltaTime / GLOW_FADE_MS);
    }

    // ease curve: slow start, accelerate mid, ease out
    const glowEase = glowTransition < 1
      ? glowTransition * glowTransition * (3 - 2 * glowTransition)  // smoothstep
      : 1;

    // v2-style BLEND pass — fades OUT during transition, skipped once complete
    if (glowEase < 1) {
      const v2Alpha = 1 - glowEase;
      p.blendMode(p.BLEND);

      for (let i = 0; i < fp.particles.length; i++) {
        const st = states[i];
        if (!st.litColor) continue;

        const pt    = fp.particles[i];
        const phase = i * 2.399;
        const drift = 0.009;
        const dx    = Math.sin(t * 0.55 + pt.angle * 2.1 + pt.ring * 0.7) * drift;
        const dy    = Math.cos(t * 0.48 + pt.angle * 1.8 + pt.ring * 0.4) * drift;
        const px    = (pt.x + dx) * radius + cx;
        const py    = (pt.y + dy) * radius + cy;

        let r, g, b, a;
        if (st.progress < 1) {
          const ease       = 1 - Math.pow(1 - st.progress, 3);
          const [fr,fg,fb] = st.transitionFrom;
          const [lr,lg,lb] = st.litColor;
          r = fr + (lr - fr) * ease;
          g = fg + (lg - fg) * ease;
          b = fb + (lb - fb) * ease;
          a = DARK_ALPHA + (pt.opacity * 230 - DARK_ALPHA) * ease;
        } else {
          [r, g, b] = st.litColor;
          const shimmerSlow = Math.sin(t * 0.9 + phase);
          const shimmerMid  = Math.sin(t * 1.7 + phase * 0.7);
          const shimmerFast = Math.sin(t * 3.1 + phase * 1.3);
          a = pt.opacity * 130 + shimmerSlow * 110 + shimmerMid * 50 + shimmerFast * 25;
          const boost = Math.max(0, shimmerSlow * 1.2);
          r = Math.min(255, r + (255 - r) * boost * 0.7);
          g = Math.min(255, g + (255 - g) * boost * 0.7);
          b = Math.min(255, b + (255 - b) * boost * 0.7);
        }

        const halfLen = pt.size * baseScale * 4.2 * (1 + Math.sin(t * 0.9 + phase) * 0.5);
        p.stroke(r, g, b, Math.max(0, Math.min(255, a * v2Alpha)));
        p.strokeWeight(pt.size * baseScale * 1.6);
        drawBezier(p, arcGeom(pt, px, py, halfLen));
      }
    }

    // neon glow ADD pass — fades IN during transition
    if (glowEase > 0) {
      // Neon glow ADD pass — alpha scaled by glowEase during crossfade
      p.blendMode(p.ADD);

      for (let i = 0; i < fp.particles.length; i++) {
        const st = states[i];
        if (!st.litColor) continue;

        const pt    = fp.particles[i];
        const drift = 0.009;
        const dx    = Math.sin(t * 0.55 + pt.angle * 2.1 + pt.ring * 0.7) * drift;
        const dy    = Math.cos(t * 0.48 + pt.angle * 1.8 + pt.ring * 0.4) * drift;
        const px    = (pt.x + dx) * radius + cx;
        const py    = (pt.y + dy) * radius + cy;

        // Color lerp during transition
        let r, g, b;
        if (st.progress < 1) {
          const ease       = 1 - Math.pow(1 - st.progress, 3);
          const [fr,fg,fb] = st.transitionFrom;
          const [lr,lg,lb] = st.litColor;
          r = fr + (lr - fr) * ease;
          g = fg + (lg - fg) * ease;
          b = fb + (lb - fb) * ease;
        } else {
          [r, g, b] = st.litColor;
        }

        // Flare: white-hot on first activation
        const flare     = 1 - st.flareT;
        const flarePeak = Math.pow(flare, 0.5);
        r = Math.min(255, r + (255 - r) * flarePeak * 0.9);
        g = Math.min(255, g + (255 - g) * flarePeak * 0.9);
        b = Math.min(255, b + (255 - b) * flarePeak * 0.9);

        // Per-particle shimmer (keeps length pulse + color flare from v2)
        const phase       = i * 2.399;
        const shimmerSlow = Math.sin(t * 0.9 + phase);
        const boost       = Math.max(0, shimmerSlow * 1.2);
        r = Math.min(255, r + (255 - r) * boost * 0.5);
        g = Math.min(255, g + (255 - g) * boost * 0.5);
        b = Math.min(255, b + (255 - b) * boost * 0.5);

        const breathe    = breatheOf(pt);
        const breatheAmt = pt.opacity * breathe;
        const sw         = pt.size * baseScale * 1.6;
        // Length pulse: interference breathe (global) + shimmer (per-particle)
        const halfLen    = pt.size * baseScale * 4.2 * (1 + shimmerSlow * 0.5);
        const geom       = arcGeom(pt, px, py, halfLen);

        // Layer 1: outer halo
        if (glowLayers[1]) {
          p.strokeWeight(sw * 9);
          p.stroke(r, g, b, Math.round((breatheAmt * 10 + flarePeak * 18) * glowEase));
          drawBezier(p, geom);
        }

        // Layer 2: mid glow
        if (glowLayers[2]) {
          p.strokeWeight(sw * 4.5);
          p.stroke(r, g, b, Math.round((breatheAmt * 28 + flarePeak * 50) * glowEase));
          drawBezier(p, geom);
        }

        // Layer 3: inner glow
        if (glowLayers[3]) {
          p.strokeWeight(sw * 2.2);
          p.stroke(r, g, b, Math.round((breatheAmt * 70 + flarePeak * 120) * glowEase));
          drawBezier(p, geom);
        }

        // Layer 4: core
        if (glowLayers[4]) {
          p.strokeWeight(sw);
          p.stroke(r, g, b, Math.round((breatheAmt * 190 + flarePeak * 65) * glowEase));
          drawBezier(p, geom);
        }
      }
    }

    // ---- PASS 3: header (back to BLEND) ----
    p.blendMode(p.BLEND);
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
  const protocol  = location.protocol === 'https:' ? 'wss:' : 'ws:';
  const ws        = new WebSocket(`${protocol}//${location.host}`);

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
    } catch (e) { console.error('WS parse error', e); }
  };
}

// ---- Boot ----
new p5(sketch);
