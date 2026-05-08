// ================================================================
// Fingerprint particle generator
//
// Places particles along actual ridge curves (concentric ellipses
// or open arches) so the result looks like a real fingerprint.
// Each particle stores a tangent direction for elongated rendering.
// ================================================================

function mulberry32(seed) {
  return function () {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

const PALETTES = [
  ['#f59e0b', '#fde68a'],  // Gold
  ['#06b6d4', '#a5f3fc'],  // Cyan
  ['#8b5cf6', '#ddd6fe'],  // Purple
  ['#f43f5e', '#fecdd3'],  // Rose
  ['#10b981', '#a7f3d0'],  // Emerald
  ['#3b82f6', '#bfdbfe'],  // Blue
  ['#f97316', '#fed7aa'],  // Orange
  ['#e2e8f0', '#f8fafc'],  // White
];

function getPalette(idx) { return PALETTES[idx % PALETTES.length]; }

/**
 * Generate fingerprint particles along actual ridge lines.
 *
 * @param {number} seed - deterministic seed
 * @param {number} count - total particles (~300)
 * @returns {{ particles, patternType }}
 *
 * Each particle: { x, y, size, opacity, tangentAngle, ring }
 *   x, y          — normalized position in [-1, 1]
 *   tangentAngle  — angle of the ridge at this point (radians)
 *   ring          — ridge index (0 = innermost)
 */
function generateFingerprintParticles(seed, count = 300) {
  const rng = mulberry32(seed);
  const particles = [];

  const NUM_RIDGES   = 16;
  const isWhorl      = rng() > 0.45;        // ~55% whorl, 45% loop
  const globalTilt   = (rng() - 0.5) * 0.5; // overall rotation
  const coreX        = (rng() - 0.5) * 0.08;
  const coreY        = (rng() - 0.5) * 0.06;

  // --- Compute approximate arc length per ridge for proportional distribution ---
  const ridgeData = [];
  let totalArc = 0;

  for (let r = 0; r < NUM_RIDGES; r++) {
    const t    = (r + 0.5) / NUM_RIDGES;          // 0..1 (inner → outer)
    const sA   = 0.10 + t * 0.80;                  // semi-axis vertical
    const sB   = sA * (0.58 + t * 0.13);           // semi-axis horizontal

    // Arc length: full ellipse or partial for loops
    let arcFraction = 1.0;
    if (!isWhorl) {
      const gap = 0.18 + t * 0.06;                 // gap at bottom, 0..1 of full circle
      arcFraction = 1.0 - gap;
    }
    // Ellipse perimeter approximation (Ramanujan)
    const fullPerim = Math.PI * (3 * (sA + sB) - Math.sqrt((3 * sA + sB) * (sA + 3 * sB)));
    const arc = fullPerim * arcFraction;

    ridgeData.push({ t, sA, sB, arc, arcFraction });
    totalArc += arc;
  }

  // --- Place particles on each ridge ---
  for (let r = 0; r < NUM_RIDGES; r++) {
    const { t, sA, sB, arc, arcFraction } = ridgeData[r];

    // Particles proportional to arc length (minimum 4 per ridge)
    const n = Math.max(4, Math.round((arc / totalArc) * count));

    // Whorl: slight per-ridge tilt creates spiral/concentric feel
    const ridgeTilt = isWhorl ? globalTilt + r * 0.055 : globalTilt;
    const cosR = Math.cos(ridgeTilt);
    const sinR = Math.sin(ridgeTilt);

    // For loop: gap is at angle = Math.PI/2 (bottom of screen, since y+ is down)
    const gapHalf  = !isWhorl ? (1.0 - arcFraction) * Math.PI : 0;
    const startAng = isWhorl ? 0 : Math.PI / 2 + gapHalf;
    const totalAng = isWhorl ? Math.PI * 2 : Math.PI * 2 * arcFraction;

    for (let j = 0; j < n; j++) {
      // Evenly space by arc angle (slightly irregular for organic feel)
      const jitter = (rng() - 0.5) * (totalAng / n) * 0.25;
      const a = startAng + (j / n) * totalAng + jitter;

      // Point on ellipse (local frame, before rotation)
      const ex = Math.cos(a) * sB + coreX;
      const ey = Math.sin(a) * sA + coreY;

      // Rotate to global frame
      const px = ex * cosR - ey * sinR;
      const py = ex * sinR + ey * cosR;

      // Tangent vector on ellipse at angle a (derivative of parametric ellipse)
      // d/da [cos(a)*sB, sin(a)*sA] = [-sin(a)*sB, cos(a)*sA]
      const tx = -Math.sin(a) * sB;
      const ty =  Math.cos(a) * sA;
      // Rotate tangent by ridge tilt
      const rtx = tx * cosR - ty * sinR;
      const rty = tx * sinR + ty * cosR;
      const tangentAngle = Math.atan2(rty, rtx);

      // Tiny position noise (keep ridges clean)
      const noise = 0.009;

      particles.push({
        x:            px + (rng() - 0.5) * noise,
        y:            py + (rng() - 0.5) * noise,
        size:         1.6 + rng() * 0.9,
        opacity:      0.65 + rng() * 0.35,
        tangentAngle,
        ring:         r,
        angle:        a,   // kept for drift animation
      });
    }
  }

  return { particles: particles.slice(0, count), patternType: isWhorl ? 'whorl' : 'loop' };
}

/**
 * Generate a fingerprint that matches the camp's iconic logo:
 * - Loop pattern, ~8 ridges, tilted ~16° CCW
 * - Gap opens on the upper-right
 * - Inner ridges are tight loops, outer ridges are open arcs
 * - Thick strokes with rounded ends
 * Total particles ≈ count (300)
 */
function generateIconFingerprint(count = 300) {
  const rng = mulberry32(7777);

  // 8 ridges: inner → outer
  // sA = vertical semi-axis, sB = horizontal, gapHalf = half-angle of opening
  // n = particles on this ridge  (sum = 300)
  const ridges = [
    { sA: 0.100, sB: 0.076, gapHalf: 0, n: 16 },
    { sA: 0.185, sB: 0.140, gapHalf: 0, n: 24 },
    { sA: 0.275, sB: 0.207, gapHalf: 0, n: 32 },
    { sA: 0.370, sB: 0.277, gapHalf: 0, n: 38 },
    { sA: 0.470, sB: 0.349, gapHalf: 0, n: 42 },
    { sA: 0.578, sB: 0.425, gapHalf: 0, n: 46 },
    { sA: 0.695, sB: 0.505, gapHalf: 0, n: 50 },
    { sA: 0.820, sB: 0.590, gapHalf: 0, n: 52 },
  ]; // 16+24+32+38+42+46+50+52 = 300  — complete ellipses, no gap

  const TILT       = -0.30;  // ~17° CCW — top leans left like the icon
  const CORE_X     =  0.06;  // core slightly right of center
  const CORE_Y     =  0.02;
  const GAP_CENTER =  0.15;  // gap faces upper-right (≈ 9° from right)

  const cosT = Math.cos(TILT);
  const sinT = Math.sin(TILT);

  const particles = [];

  for (let r = 0; r < ridges.length; r++) {
    const { sA, sB, gapHalf, n } = ridges[r];

    const startA = GAP_CENTER + gapHalf;
    const endA   = GAP_CENTER - gapHalf + 2 * Math.PI;
    const span   = endA - startA;

    for (let j = 0; j < n; j++) {
      // Even spacing along arc angle
      const a = startA + (j / Math.max(n - 1, 1)) * span;

      // Point on ellipse (pre-rotation)
      const ex = Math.cos(a) * sB + CORE_X;
      const ey = Math.sin(a) * sA + CORE_Y;

      // Apply global tilt
      const px = ex * cosT - ey * sinT;
      const py = ex * sinT + ey * cosT;

      // Tangent vector, rotated
      const tx  = -Math.sin(a) * sB;
      const ty  =  Math.cos(a) * sA;
      const len = Math.sqrt(tx * tx + ty * ty);
      const rtx = (tx * cosT - ty * sinT) / len;
      const rty = (tx * sinT + ty * cosT) / len;

      particles.push({
        x:            px + (rng() - 0.5) * 0.005,
        y:            py + (rng() - 0.5) * 0.005,
        size:         2.2 + rng() * 0.5,
        opacity:      0.85 + rng() * 0.15,
        tangentAngle: Math.atan2(rty, rtx),
        ring:         r,
        angle:        a,
      });
    }
  }

  return { particles: particles.slice(0, count), patternType: 'loop' };
}

/**
 * Draw a fingerprint on a p5.js canvas (used by mobile preview).
 * Renders each particle as a short elongated dash in the ridge direction.
 */
function drawFingerprint(p, cx, cy, diameter, paletteIndex, particleData, t, alphaMultiplier = 1) {
  const palette  = getPalette(paletteIndex);
  const particles = particleData.particles || particleData; // handle both shapes
  const radius   = diameter / 2;
  const baseScale = diameter / 360;

  p.push();
  p.translate(cx, cy);
  p.noStroke();

  for (let i = 0; i < particles.length; i++) {
    const pt = particles[i];

    // Gentle ambient drift along the ridge
    const drift  = 0.009;
    const driftX = Math.sin(t * 0.55 + pt.angle * 2.1 + pt.ring * 0.7) * drift;
    const driftY = Math.cos(t * 0.48 + pt.angle * 1.8 + pt.ring * 0.4) * drift;

    const px = (pt.x + driftX) * radius;
    const py = (pt.y + driftY) * radius;

    // Color: blend primary → secondary by radial distance
    const dist  = Math.sqrt(pt.x * pt.x + pt.y * pt.y);
    const blend = Math.min(1, dist * 1.15);
    const c1    = p.color(palette[0]);
    const c2    = p.color(palette[1]);
    const col   = p.lerpColor(c1, c2, blend);
    col.setAlpha(pt.opacity * alphaMultiplier * 255);
    p.fill(col);

    // Elongated dash in ridge tangent direction
    const dw = pt.size * baseScale * 4.0; // along ridge
    const dh = pt.size * baseScale * 1.0; // across ridge

    p.push();
    p.translate(px, py);
    p.rotate(pt.tangentAngle);
    p.ellipse(0, 0, dw, dh);
    p.pop();
  }

  p.pop();
}
