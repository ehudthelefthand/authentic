// ================================================================
// AUTHENTIC – Neon Soul v4
//
// Session-aware display:
//   - Per-participant single-particle activation (by particleIndex)
//   - Session states: idle | open | closed | ended  (+ replay overlay)
//   - Clear-out on Open, fill animation on Fill, neon reveal on Ended
//   - Ping: white flare + expanding color ring
// ================================================================

const TOTAL_PARTICLES = 300;
const TRANSITION_MS   = 700;
const FLARE_MS        = 1400;
const FP_SEED         = 42;
const DARK_ALPHA      = 28;
const BREATHE_MIN     = 0.10;
const CLEAR_MS        = 1500;
const PING_RING_MS    = 1100;
const MAX_PING_RINGS  = 30;

let fp = null;
let states = [];
let totalLit = 0;
const joinedIds = new Set();
const participantByIndex = new Map(); // particleIndex -> participant

let sessionInfo = null;
let replayInfo = null;

let clearingStart = 0; // ms; if > 0, we're animating a clear-out
let pingRings = [];    // { particleIndex, color: [r,g,b], startMs }

let glowRevealed    = false;
let glowTransition  = 0;
const GLOW_FADE_MS  = 2500;
const glowLayers = { 1: true, 2: true, 3: true, 4: true };

// ---- helpers ----
function hexToRgb(hex) {
  const n = parseInt(hex.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function activateParticle(particleIndex, color, opts = {}) {
  if (particleIndex < 0 || particleIndex >= states.length) return;
  const st = states[particleIndex];
  if (st.litColor && !opts.force) return;
  st.transitionFrom = st.litColor ? [...st.litColor] : [15, 18, 30];
  st.litColor       = color;
  st.progress       = 0;
  st.flareT         = 0;
  totalLit++;
}

function clearAllStates() {
  for (const st of states) {
    st.litColor       = null;
    st.transitionFrom = [15, 18, 30];
    st.progress       = 0;
    st.flareT         = 1;
  }
  totalLit       = 0;
  glowRevealed   = false;
  glowTransition = 0;
  pingRings      = [];
  joinedIds.clear();
  participantByIndex.clear();
}

function applyParticipant(participant) {
  joinedIds.add(participant.id);
  participantByIndex.set(participant.particleIndex, participant);
  activateParticle(participant.particleIndex, participant.color);
}

function applyFillEntry(entry) {
  activateParticle(entry.particleIndex, entry.color);
}

function triggerPing(particleIndex, color) {
  const st = states[particleIndex];
  if (st && st.litColor) st.flareT = 0; // reuse white-hot flare
  pingRings.push({ particleIndex, color, startMs: performance.now() });
  if (pingRings.length > MAX_PING_RINGS) {
    pingRings.splice(0, pingRings.length - MAX_PING_RINGS);
  }
}

function startClearOut() {
  if (totalLit === 0) {
    clearAllStates();
    return;
  }
  clearingStart = performance.now();
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
      flareT:        1,
    }));

    // Rehydrate from server.
    fetch('/state').then(r => r.json()).then(data => {
      sessionInfo = data.session;
      // Only rebuild lit state if session is past 'open' OR has participants.
      if (sessionInfo.state !== 'idle') {
        data.participants.forEach(participant => {
          joinedIds.add(participant.id);
          participantByIndex.set(participant.particleIndex, participant);
          // Apply immediately (no animation on rehydrate)
          const st = states[participant.particleIndex];
          if (st && !st.litColor) {
            st.litColor = participant.color; st.progress = 1; st.flareT = 1;
            totalLit++;
          }
        });
        data.fillSequence.forEach(entry => {
          const st = states[entry.particleIndex];
          if (st && !st.litColor) {
            st.litColor = entry.color; st.progress = 1; st.flareT = 1;
            totalLit++;
          }
        });
      }
    });

    connectWebSocket();
  };

  p.windowResized = () => p.resizeCanvas(window.innerWidth, window.innerHeight);

  p.draw = () => {
    p.background(7, 7, 15);

    const now = p.millis();
    const t   = now / 1000;

    // ---- clear-out animation finalize ----
    let clearAlpha = 1;
    if (clearingStart > 0) {
      const elapsed = performance.now() - clearingStart;
      if (elapsed >= CLEAR_MS) {
        clearAllStates();
        clearingStart = 0;
      } else {
        clearAlpha = 1 - elapsed / CLEAR_MS;
      }
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
    const intensityCap = t < 3 ? 1.0 : 0.7;
    const breatheOf = (pt) => {
      const w1 = Math.sin(t * 1.10 + pt.x *  8.0 + pt.y *  4.2);
      const w2 = Math.sin(t * 0.83 - pt.x *  5.5 + pt.y *  9.1);
      const w3 = Math.sin(t * 1.47 + pt.x *  3.8 - pt.y *  7.3);
      const raw = (w1 + w2 + w3) / 3 * 0.5 + 0.5;
      return Math.max(BREATHE_MIN, Math.min(raw, intensityCap));
    };

    // ---- PASS 1: dark arcs ----
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
    }
    if (glowRevealed && glowTransition < 1) {
      glowTransition = Math.min(1, glowTransition + p.deltaTime / GLOW_FADE_MS);
    }

    const glowEase = glowTransition < 1
      ? glowTransition * glowTransition * (3 - 2 * glowTransition)
      : 1;

    // v2-style BLEND pass — fades OUT during glow transition
    if (glowEase < 1) {
      const v2Alpha = (1 - glowEase) * clearAlpha;
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

    // Neon glow ADD pass
    if (glowEase > 0) {
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

        const flare     = 1 - st.flareT;
        const flarePeak = Math.pow(flare, 0.5);
        r = Math.min(255, r + (255 - r) * flarePeak * 0.9);
        g = Math.min(255, g + (255 - g) * flarePeak * 0.9);
        b = Math.min(255, b + (255 - b) * flarePeak * 0.9);

        const phase       = i * 2.399;
        const shimmerSlow = Math.sin(t * 0.9 + phase);
        const boost       = Math.max(0, shimmerSlow * 1.2);
        r = Math.min(255, r + (255 - r) * boost * 0.5);
        g = Math.min(255, g + (255 - g) * boost * 0.5);
        b = Math.min(255, b + (255 - b) * boost * 0.5);

        const breathe    = breatheOf(pt);
        const breatheAmt = pt.opacity * breathe;
        const sw         = pt.size * baseScale * 1.6;
        const halfLen    = pt.size * baseScale * 4.2 * (1 + shimmerSlow * 0.5);
        const geom       = arcGeom(pt, px, py, halfLen);
        const ca         = clearAlpha;

        if (glowLayers[1]) {
          p.strokeWeight(sw * 9);
          p.stroke(r, g, b, Math.round((breatheAmt * 10 + flarePeak * 18) * glowEase * ca));
          drawBezier(p, geom);
        }
        if (glowLayers[2]) {
          p.strokeWeight(sw * 4.5);
          p.stroke(r, g, b, Math.round((breatheAmt * 28 + flarePeak * 50) * glowEase * ca));
          drawBezier(p, geom);
        }
        if (glowLayers[3]) {
          p.strokeWeight(sw * 2.2);
          p.stroke(r, g, b, Math.round((breatheAmt * 70 + flarePeak * 120) * glowEase * ca));
          drawBezier(p, geom);
        }
        if (glowLayers[4]) {
          p.strokeWeight(sw);
          p.stroke(r, g, b, Math.round((breatheAmt * 190 + flarePeak * 65) * glowEase * ca));
          drawBezier(p, geom);
        }
      }
    }

    // ---- PASS 2.5: ping rings (ADD) ----
    if (pingRings.length > 0) {
      p.blendMode(p.ADD);
      p.noFill();
      const nowMs = performance.now();
      const stillActive = [];
      for (const ring of pingRings) {
        const age = nowMs - ring.startMs;
        if (age >= PING_RING_MS) continue;
        const ratio = age / PING_RING_MS;
        const pt = fp.particles[ring.particleIndex];
        if (!pt) continue;
        const drift = 0.009;
        const dx = Math.sin(t * 0.55 + pt.angle * 2.1 + pt.ring * 0.7) * drift;
        const dy = Math.cos(t * 0.48 + pt.angle * 1.8 + pt.ring * 0.4) * drift;
        const px = (pt.x + dx) * radius + cx;
        const py = (pt.y + dy) * radius + cy;
        const startR = pt.size * baseScale * 5;
        const endR   = pt.size * baseScale * 28;
        const rad    = startR + (endR - startR) * ratio;
        const alpha  = (1 - ratio) * 200;
        const [r, g, b] = ring.color;
        p.strokeWeight(3 * (1 - ratio * 0.6));
        p.stroke(r, g, b, alpha);
        p.circle(px, py, rad * 2);
        stillActive.push(ring);
      }
      pingRings = stillActive;
    }

    // ---- PASS 3: header (BLEND) ----
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
    } else if (sessionInfo && sessionInfo.state === 'open') {
      const a = 80 + Math.sin(t * 1.3) * 30;
      p.textSize(13);
      p.fill(71, 85, 105, a);
      p.textAlign(p.CENTER, p.BOTTOM);
      p.text('รอผู้เข้าร่วมสแกน QR Code...', p.width / 2, p.height - 30);
    } else if (sessionInfo && sessionInfo.state === 'idle') {
      const a = 60 + Math.sin(t * 0.9) * 20;
      p.textSize(12);
      p.fill(71, 85, 105, a);
      p.textAlign(p.CENTER, p.BOTTOM);
      p.text('รอเริ่มเซสชัน', p.width / 2, p.height - 30);
    }

    // Replay badge
    if (replayInfo) {
      p.textAlign(p.LEFT, p.TOP);
      p.textSize(11);
      p.fill(244, 63, 94, 230);
      p.text(`● REPLAY · ${replayInfo.speed}x`, 24, 24);
    }
  }
};

// ---- WebSocket ----
function connectWebSocket() {
  const wsStatus = document.getElementById('ws-status');
  const setStatus = (color) => { if (wsStatus) wsStatus.style.color = color; };

  const protocol  = location.protocol === 'https:' ? 'wss:' : 'ws:';
  const ws        = new WebSocket(`${protocol}//${location.host}`);

  ws.onopen  = () => setStatus('#166534');
  ws.onclose = () => {
    setStatus('#7f1d1d');
    setTimeout(connectWebSocket, 3000);
  };

  ws.onmessage = (event) => {
    try {
      const msg = JSON.parse(event.data);
      handleMessage(msg);
    } catch (e) { console.error('WS parse error', e); }
  };
}

function handleMessage(msg) {
  switch (msg.type) {
    case 'session_state': {
      const prev = sessionInfo ? sessionInfo.state : null;
      sessionInfo = msg.data;
      // Transition to 'open' from anything else → clear-out animation.
      if (sessionInfo.state === 'open' && prev !== 'open') {
        startClearOut();
      }
      break;
    }
    case 'new_participant':
      if (!joinedIds.has(msg.data.id)) applyParticipant(msg.data);
      break;
    case 'fill_progress':
      applyFillEntry(msg.data);
      break;
    case 'ping':
      triggerPing(msg.data.particleIndex, msg.data.color);
      break;
    case 'reset':
      clearAllStates();
      break;
    case 'replay_start':
      replayInfo = msg.data;
      clearAllStates();
      break;
    case 'replay_event':
      if (msg.data.kind === 'participant') {
        applyParticipant(msg.data.participant);
      } else if (msg.data.kind === 'fill') {
        applyFillEntry(msg.data.fill);
      }
      break;
    case 'replay_end':
      replayInfo = null;
      break;
  }
}

// ---- Boot ----
new p5(sketch);
