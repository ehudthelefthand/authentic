// ================================================================
// AUTHENTIC – Neon Soul  (display-v3)
//
// The camp icon fingerprint, rendered with additive (neon) glow.
// Dark arcs barely show the shape. When a participant scans,
// their arc white-hot flares, then settles into glowing colour.
// All lit arcs breathe together in a slow coordinated pulse.
// ================================================================

const TOTAL_PARTICLES = 300;
const STAGGER_MS      = 110;   // ms between each arc activating
const TRANSITION_MS   = 600;   // colour fade-in duration
const FLARE_MS        = 1400;  // white-hot flare duration after activation
const DARK_ALPHA      = 18;

let fp = null;
let states = [];
let totalLit = 0;
let pendingActivations = [];
let lastActivateMs = 0;
const joinedIds = new Set();

// ---- helpers ----
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
  const palette = getPalette(participant.paletteIndex);
  const color   = hexToRgb(palette[0]);
  const darkCount = states.filter(s => !s.litColor && s.progress === 0).length;
  const share   = Math.max(5, Math.ceil(darkCount * 0.25));
  pickDarkParticles(share).forEach(idx =>
    pendingActivations.push({ index: idx, color })
  );
}

// ---- draw one bezier arc ----
function drawArc(p, pt, px, py, halfLen, curveFactor) {
  const cosT  = Math.cos(pt.tangentAngle);
  const sinT  = Math.sin(pt.tangentAngle);
  const x1    = px - cosT * halfLen;
  const y1    = py - sinT * halfLen;
  const x2    = px + cosT * halfLen;
  const y2    = py + sinT * halfLen;

  // Perpendicular outward (away from centre)
  const inX = -pt.x, inY = -pt.y;
  const dot  = (-sinT) * inX + cosT * inY;
  const perpX = dot >= 0 ? -sinT :  sinT;
  const perpY = dot >= 0 ?  cosT : -cosT;

  const ctrlX = px - perpX * curveFactor;
  const ctrlY = py - perpY * curveFactor;

  p.beginShape();
  p.vertex(x1, y1);
  p.quadraticVertex(ctrlX, ctrlY, x2, y2);
  p.endShape();
}

// ---- background warm glow ----
function drawBackgroundGlow(p, cx, cy, radius, lit, t) {
  const pulse  = 0.7 + 0.3 * Math.sin(t * 0.55);
  const layers = 24;
  p.noStroke();
  for (let i = layers; i > 0; i--) {
    const r    = radius * 1.25 * (i / layers);
    const frac = 1 - i / layers;              // 0 at edge → 1 at centre
    const a    = frac * frac * 28 * pulse * Math.min(1, lit / 30);
    p.fill(180, 110, 20, a);                  // warm amber
    p.ellipse(cx, cy, r * 2, r * 2);
  }
}

// ---- p5.js sketch ----
const sketch = (p) => {

  p.setup = () => {
    p.createCanvas(window.innerWidth, window.innerHeight);
    p.frameRate(40);

    fp     = generateIconFingerprint(TOTAL_PARTICLES);
    states = fp.particles.map(() => ({
      litColor:      null,
      transitionFrom:[15, 18, 30],
      progress:      0,
      flareT:        1,   // 0 = just activated (full flare), 1 = settled
    }));

    fetch('/participants')
      .then(r => r.json())
      .then(list => {
        list.forEach(participant => {
          joinedIds.add(participant.id);
          enqueueParticipant(participant);
        });
        // Pre-existing participants: instant, no flare
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
    p.background(5, 4, 8);

    const now  = p.millis();
    const t    = now / 1000;

    // ---- queue processing ----
    if (pendingActivations.length > 0 && now - lastActivateMs >= STAGGER_MS) {
      const next = pendingActivations.shift();
      const st   = states[next.index];
      st.transitionFrom = st.litColor ? [...st.litColor] : [15, 18, 30];
      st.litColor = next.color;
      st.progress = 0;
      st.flareT   = 0;   // trigger flare
      totalLit++;
      lastActivateMs = now;
    }

    // ---- advance animations ----
    const transStep  = p.deltaTime / TRANSITION_MS;
    const flareStep  = p.deltaTime / FLARE_MS;
    for (let i = 0; i < states.length; i++) {
      const st = states[i];
      if (st.litColor && st.progress < 1) st.progress = Math.min(1, st.progress + transStep);
      if (st.flareT   < 1)               st.flareT   = Math.min(1, st.flareT   + flareStep);
    }

    // ---- layout ----
    const diameter  = Math.min(p.width, p.height) * 0.80;
    const cx        = p.width  / 2;
    const cy        = p.height / 2 + 15;
    const radius    = diameter / 2;
    const baseScale = diameter / 360;
    const coreW     = radius * 0.042;   // core stroke width (scales with screen)

    // Slow coordinated breathe
    const rawBreathe = Math.sin(t * 0.28) * 0.5 + 0.5; // 0..1, ~22s cycle
    // First peak (~t=5.6s) allowed full brightness; after t=10s cap at 50% forever
    const intensityCap  = t < 10 ? 1.0 : 0.5;
    const globalBreathe = Math.min(rawBreathe, intensityCap);
    const globalFlicker = Math.sin(t * 0.75 + 0.8) * 0.5 + 0.5; // 0..1, slow ripple

    // ---- background ----
    drawBackgroundGlow(p, cx, cy, radius, totalLit, t);

    // ---- PASS 1: unlit arcs (default blend, very dark) ----
    p.blendMode(p.BLEND);
    p.noFill();
    p.strokeCap(p.ROUND);
    p.strokeJoin(p.ROUND);

    for (let i = 0; i < fp.particles.length; i++) {
      if (states[i].litColor) continue;   // skip lit

      const pt      = fp.particles[i];
      const phase   = i * 2.399;
      const drift   = 0.008;
      const dx      = Math.sin(t * 0.55 + pt.angle * 2.1 + pt.ring * 0.7) * drift;
      const dy      = Math.cos(t * 0.48 + pt.angle * 1.8 + pt.ring * 0.4) * drift;
      const px      = (pt.x + dx) * radius + cx;
      const py      = (pt.y + dy) * radius + cy;

      const shimmer = Math.sin(t * 0.9 + phase) * 4;
      const a       = Math.max(0, DARK_ALPHA + shimmer);
      const t_ring  = pt.ring / 7;
      const halfLen = pt.size * baseScale * 4.2;
      const cf      = halfLen * (0.55 - t_ring * 0.30);

      p.stroke(30, 35, 60, a);
      p.strokeWeight(coreW * (pt.size / 2.2) * 1.6);
      drawArc(p, pt, px, py, halfLen, cf);
    }

    // ---- PASS 2: lit arcs — additive glow (capped after first peak) ----
    p.blendMode(p.ADD);

    for (let i = 0; i < fp.particles.length; i++) {
      const st = states[i];
      if (!st.litColor) continue;

      const pt    = fp.particles[i];
      const drift = 0.008;
      const dx    = Math.sin(t * 0.55 + pt.angle * 2.1 + pt.ring * 0.7) * drift;
      const dy    = Math.cos(t * 0.48 + pt.angle * 1.8 + pt.ring * 0.4) * drift;
      const px    = (pt.x + dx) * radius + cx;
      const py    = (pt.y + dy) * radius + cy;

      // Colour (lerp during transition)
      let r, g, b;
      if (st.progress < 1) {
        const ease = 1 - Math.pow(1 - st.progress, 3);
        const [fr, fg, fb] = st.transitionFrom;
        const [lr, lg, lb] = st.litColor;
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

      const breatheAmt = pt.opacity * globalBreathe; // capped at 50% after first peak

      const t_ring  = pt.ring / 7;
      const halfLen = pt.size * baseScale * 4.2 * (1 + globalBreathe * 0.08);
      const cf      = halfLen * (0.55 - t_ring * 0.30);
      const sw      = coreW * (pt.size / 2.2) * 1.6;

      // Outer glow
      p.strokeWeight(sw * 9);
      p.stroke(r, g, b, Math.round(breatheAmt * 10 + flarePeak * 18));
      drawArc(p, pt, px, py, halfLen, cf);

      // Mid glow
      p.strokeWeight(sw * 4.5);
      p.stroke(r, g, b, Math.round(breatheAmt * 28 + flarePeak * 50));
      drawArc(p, pt, px, py, halfLen, cf);

      // Inner glow
      p.strokeWeight(sw * 2.2);
      p.stroke(r, g, b, Math.round(breatheAmt * 70 + flarePeak * 120));
      drawArc(p, pt, px, py, halfLen, cf);

      // Core
      p.strokeWeight(sw);
      p.stroke(r, g, b, Math.round(breatheAmt * 200 + flarePeak * 55));
      drawArc(p, pt, px, py, halfLen, cf);
    }

    // ---- PASS 3: header (back to normal blend) ----
    p.blendMode(p.BLEND);
    drawHeader(p, t);
  };

  function drawHeader(p, t) {
    p.textFont('Sarabun, sans-serif');
    p.noStroke();

    p.textAlign(p.CENTER, p.TOP);
    p.textSize(26);
    p.fill(225, 232, 240, 200);
    p.text('AUTHENTIC', p.width / 2, 22);

    p.textSize(13);
    p.fill(100, 116, 139, 170);
    p.text('สะท้อนพระคริสต์ด้วยชีวิตจริง', p.width / 2, 56);

    if (totalLit > 0) {
      p.textSize(10);
      p.fill(51, 65, 85, 150);
      p.text(`${joinedIds.size} คน · ${totalLit} / ${TOTAL_PARTICLES} จุด`, p.width / 2, 78);
    } else {
      const a = 70 + Math.sin(t * 1.3) * 25;
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
    } catch (e) { console.error('WS parse error', e); }
  };
}

// ---- Boot ----
new p5(sketch);
