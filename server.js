const express = require('express');
const { WebSocketServer } = require('ws');
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

// ---- constants ----
const TOTAL_PARTICLES = 300;
const PALETTE_COUNT   = 8;
const PING_COOLDOWN_MS = 3000;
const FILL_DURATION_MS = 8000;
const STAGGER_MS       = 130;
const SCANNING_DURATION_MS = 6000; // neon-reveal intro (~2s) + 2 sweep passes (~4s)
const VALID_CEREMONY_MODES = ['opening', 'closing'];

// Radial bands mirror the ring structure in public/fingerprint.js
// generateIconFingerprint(): particles are pushed ring 0 (innermost) → ring 7
// (outermost). Cumulative end-index per ring:
const RING_END = [16, 40, 72, 110, 152, 198, 248, 300];
const RING_COUNT = RING_END.length;

// Palette[0] colors mirroring public/fingerprint.js PALETTES (primary hex only).
const PALETTE_HEX = [
  '#f59e0b', '#06b6d4', '#8b5cf6', '#f43f5e',
  '#10b981', '#3b82f6', '#f97316', '#e2e8f0',
];

function hexToRgb(hex) {
  const n = parseInt(hex.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

// ---- admin token ----
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || crypto.randomBytes(8).toString('hex');

// ---- paths ----
const SNAPSHOTS_DIR = path.join(__dirname, 'snapshots');
if (!fs.existsSync(SNAPSHOTS_DIR)) fs.mkdirSync(SNAPSHOTS_DIR);

// ---- session state ----
function newSessionId() {
  return Date.now().toString(36) + crypto.randomBytes(3).toString('hex');
}

// ceremonyMode is preserved across reset (ADR 0003). Initialised from env so
// a deployment can boot into a known mode; admin can change it later while idle.
let ceremonyMode = VALID_CEREMONY_MODES.includes(process.env.CEREMONY_MODE)
  ? process.env.CEREMONY_MODE
  : 'opening';

let session = {
  sessionId: newSessionId(),
  state: 'idle', // idle | open | closed | scanning | verdict
  ceremonyMode,
  openedAt: null,
  closedAt: null,
  scanningAt: null,
  verdictAt: null,
  participants: [],         // { id, name, particleIndex, paletteIndex, color, joinedAt }
  usedIndices: new Set(),   // particleIndex assignments
  fillSequence: [],         // { particleIndex, paletteIndex, color, filledAt }
  snapshotPath: null,       // path to the snapshot file for the current closed/scanning/verdict session
  lastPingAt: new Map(),    // participantId -> ms
  fillTimer: null,
  scanTimer: null,
};

// ---- WebSocket ----
// Track standby: mobile clients that have the page open but have not yet
// submitted. role is one of: 'mobile' | 'admin' | 'display' | undefined.
// participantId is set on the ws once the client knows it has joined.
function broadcast(data) {
  const msg = JSON.stringify(data);
  wss.clients.forEach(c => { if (c.readyState === 1) c.send(msg); });
}

function countStandby() {
  let n = 0;
  for (const c of wss.clients) {
    if (c.readyState !== 1) continue;
    if (c._role === 'mobile' && !c._participantId) n++;
  }
  return n;
}

function publicSessionInfo() {
  return {
    sessionId: session.sessionId,
    state: session.state,
    ceremonyMode: session.ceremonyMode,
    participantCount: session.participants.length,
    standbyCount: countStandby(),
    capacity: TOTAL_PARTICLES,
    openedAt: session.openedAt,
    closedAt: session.closedAt,
    scanningAt: session.scanningAt,
    verdictAt: session.verdictAt,
  };
}

function broadcastSessionState() {
  broadcast({ type: 'session_state', data: publicSessionInfo() });
}

wss.on('connection', ws => {
  ws._role = undefined;
  ws._participantId = null;
  ws.on('error', err => console.error('WS error:', err));
  ws.on('message', raw => {
    let msg;
    try { msg = JSON.parse(raw.toString()); } catch { return; }
    if (msg.type === 'hello') {
      ws._role = msg.role;
      ws._participantId = msg.participantId || null;
      broadcastSessionState();
    } else if (msg.type === 'joined') {
      ws._participantId = msg.participantId || null;
      broadcastSessionState();
    }
  });
  ws.on('close', () => {
    if (ws._role === 'mobile') broadcastSessionState();
  });
  ws.send(JSON.stringify({ type: 'session_state', data: publicSessionInfo() }));
});

// ---- helpers ----
function uid() { return crypto.randomBytes(5).toString('hex'); }

// Radial-band assignment: pick the innermost ring with any unused particle,
// then pick a random unused particle within that ring. See ADR 0002.
function pickUnusedParticleIndex() {
  if (session.usedIndices.size >= TOTAL_PARTICLES) return null;
  let ringStart = 0;
  for (let r = 0; r < RING_COUNT; r++) {
    const ringEnd = RING_END[r];
    const available = [];
    for (let i = ringStart; i < ringEnd; i++) {
      if (!session.usedIndices.has(i)) available.push(i);
    }
    if (available.length > 0) {
      return available[Math.floor(Math.random() * available.length)];
    }
    ringStart = ringEnd;
  }
  return null;
}

function pickRandomPalette() {
  return Math.floor(Math.random() * PALETTE_COUNT);
}

function snapshotPayload() {
  return {
    sessionId: session.sessionId,
    ceremonyMode: session.ceremonyMode,
    openedAt: session.openedAt,
    closedAt: session.closedAt,
    scanningAt: session.scanningAt,
    verdictAt: session.verdictAt,
    capacity: TOTAL_PARTICLES,
    participants: session.participants,
    fillSequence: session.fillSequence,
  };
}

function writeSnapshot() {
  if (!session.snapshotPath) {
    const stamp = (session.closedAt || new Date().toISOString()).replace(/[:.]/g, '-');
    session.snapshotPath = path.join(SNAPSHOTS_DIR, `${stamp}.json`);
  }
  fs.writeFileSync(session.snapshotPath, JSON.stringify(snapshotPayload(), null, 2));
}

// ---- middleware ----
app.use(express.json());

function requireAdmin(req, res, next) {
  if (req.params.token !== ADMIN_TOKEN) return res.status(404).end();
  next();
}

// ---- public routes ----
app.get('/session', (req, res) => res.json(publicSessionInfo()));

app.get('/participants', (req, res) => res.json(session.participants));

app.get('/state', (req, res) => res.json({
  session: publicSessionInfo(),
  participants: session.participants,
  fillSequence: session.fillSequence,
}));

app.post('/join', (req, res) => {
  if (session.state !== 'open') {
    return res.status(409).json({ error: 'session_not_open', state: session.state });
  }
  if (session.participants.length >= TOTAL_PARTICLES) {
    return res.status(409).json({ error: 'session_full' });
  }

  const particleIndex = pickUnusedParticleIndex();
  if (particleIndex === null) return res.status(409).json({ error: 'session_full' });

  const paletteIndex = pickRandomPalette();
  const color        = hexToRgb(PALETTE_HEX[paletteIndex]);

  const participant = {
    id: uid(),
    particleIndex,
    paletteIndex,
    color,
    joinedAt: new Date().toISOString(),
    sessionId: session.sessionId,
  };

  session.usedIndices.add(particleIndex);
  session.participants.push(participant);

  broadcast({ type: 'new_participant', data: participant });
  broadcastSessionState();
  res.json(participant);
});

app.post('/ping', (req, res) => {
  if (!['open', 'closed', 'scanning', 'verdict'].includes(session.state)) {
    return res.status(409).json({ error: 'session_inactive' });
  }
  const { participantId } = req.body;
  const p = session.participants.find(x => x.id === participantId);
  if (!p) return res.status(404).json({ error: 'unknown_participant' });

  const now  = Date.now();
  const last = session.lastPingAt.get(participantId) || 0;
  if (now - last < PING_COOLDOWN_MS) {
    return res.status(429).json({ error: 'cooldown', retryMs: PING_COOLDOWN_MS - (now - last) });
  }
  session.lastPingAt.set(participantId, now);

  broadcast({
    type: 'ping',
    data: { participantId, particleIndex: p.particleIndex, color: p.color },
  });
  res.json({ ok: true });
});

// ---- admin routes ----
app.post('/admin/:token/mode', requireAdmin, (req, res) => {
  if (session.state !== 'idle') {
    return res.status(409).json({ error: 'mode_locked', state: session.state });
  }
  const mode = req.body && req.body.mode;
  if (!VALID_CEREMONY_MODES.includes(mode)) {
    return res.status(400).json({ error: 'invalid_mode' });
  }
  session.ceremonyMode = mode;
  ceremonyMode = mode;
  broadcastSessionState();
  res.json(publicSessionInfo());
});

app.post('/admin/:token/open', requireAdmin, (req, res) => {
  if (session.fillTimer) { clearTimeout(session.fillTimer); session.fillTimer = null; }
  if (session.scanTimer) { clearTimeout(session.scanTimer); session.scanTimer = null; }
  session.state         = 'open';
  session.openedAt      = new Date().toISOString();
  session.closedAt      = null;
  session.scanningAt    = null;
  session.verdictAt     = null;
  session.participants  = [];
  session.usedIndices   = new Set();
  session.fillSequence  = [];
  session.snapshotPath  = null;
  session.lastPingAt    = new Map();
  broadcastSessionState();
  res.json(publicSessionInfo());
});

app.post('/admin/:token/close', requireAdmin, (req, res) => {
  if (session.state !== 'open') return res.status(409).json({ error: 'not_open' });
  session.state    = 'closed';
  session.closedAt = new Date().toISOString();
  writeSnapshot();
  broadcastSessionState();
  res.json(publicSessionInfo());
});

app.post('/admin/:token/fill', requireAdmin, (req, res) => {
  if (session.state !== 'closed') return res.status(409).json({ error: 'not_closed' });

  const remaining = [];
  for (let i = 0; i < TOTAL_PARTICLES; i++) {
    if (!session.usedIndices.has(i)) remaining.push(i);
  }
  for (let i = remaining.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [remaining[i], remaining[j]] = [remaining[j], remaining[i]];
  }

  const totalFill = remaining.length;
  if (totalFill === 0) {
    enterScanning();
    return res.json(publicSessionInfo());
  }

  // Aim for FILL_DURATION_MS total, but always feel like a wave (clamp 30..180ms).
  const interval = Math.max(30, Math.min(180, Math.floor(FILL_DURATION_MS / totalFill)));

  let i = 0;
  const tick = () => {
    if (i >= remaining.length) {
      session.fillTimer = null;
      enterScanning();
      return;
    }
    const idx          = remaining[i++];
    const paletteIndex = pickRandomPalette();
    const color        = hexToRgb(PALETTE_HEX[paletteIndex]);
    const entry        = { particleIndex: idx, paletteIndex, color, filledAt: new Date().toISOString() };
    session.usedIndices.add(idx);
    session.fillSequence.push(entry);
    broadcast({ type: 'fill_progress', data: entry });
    session.fillTimer = setTimeout(tick, interval);
  };
  tick();

  res.json({ ok: true, total: totalFill, interval });
});

function enterScanning() {
  session.state = 'scanning';
  session.scanningAt = new Date().toISOString();
  writeSnapshot();
  broadcastSessionState();
  if (session.scanTimer) clearTimeout(session.scanTimer);
  session.scanTimer = setTimeout(enterVerdict, SCANNING_DURATION_MS);
}

function enterVerdict() {
  session.scanTimer = null;
  session.state = 'verdict';
  session.verdictAt = new Date().toISOString();
  writeSnapshot();
  broadcastSessionState();
}

app.post('/admin/:token/reset', requireAdmin, (req, res) => {
  if (session.fillTimer) { clearTimeout(session.fillTimer); session.fillTimer = null; }
  if (session.scanTimer) { clearTimeout(session.scanTimer); session.scanTimer = null; }
  const oldId = session.sessionId;
  session = {
    sessionId: newSessionId(),
    state: 'idle',
    ceremonyMode,  // preserved across reset
    openedAt: null,
    closedAt: null,
    scanningAt: null,
    verdictAt: null,
    participants: [],
    usedIndices: new Set(),
    fillSequence: [],
    snapshotPath: null,
    lastPingAt: new Map(),
    fillTimer: null,
    scanTimer: null,
  };
  broadcast({ type: 'reset', data: { previousSessionId: oldId, sessionId: session.sessionId } });
  broadcastSessionState();
  res.json(publicSessionInfo());
});

app.get('/admin/:token/snapshots', requireAdmin, (req, res) => {
  const files = fs.readdirSync(SNAPSHOTS_DIR).filter(f => f.endsWith('.json'));
  const list = files.map(name => {
    try {
      const data = JSON.parse(fs.readFileSync(path.join(SNAPSHOTS_DIR, name), 'utf8'));
      return {
        name,
        sessionId: data.sessionId,
        ceremonyMode: data.ceremonyMode || null,
        closedAt: data.closedAt,
        verdictAt: data.verdictAt || data.endedAt || null,
        participantCount: (data.participants || []).length,
        fillCount: (data.fillSequence || []).length,
      };
    } catch { return { name, error: 'unreadable' }; }
  }).sort((a, b) => (b.closedAt || '').localeCompare(a.closedAt || ''));
  res.json(list);
});

app.get('/admin/:token/snapshots/:name', requireAdmin, (req, res) => {
  const filePath = path.join(SNAPSHOTS_DIR, path.basename(req.params.name));
  if (!fs.existsSync(filePath)) return res.status(404).end();
  res.sendFile(filePath);
});

app.delete('/admin/:token/snapshots/:name', requireAdmin, (req, res) => {
  const filePath = path.join(SNAPSHOTS_DIR, path.basename(req.params.name));
  if (!fs.existsSync(filePath)) return res.status(404).end();
  fs.unlinkSync(filePath);
  res.json({ ok: true });
});

// ---- Replay ----
let replayState = null;

function stopReplay() {
  if (!replayState) return;
  replayState.timers.forEach(clearTimeout);
  replayState = null;
  broadcast({ type: 'replay_end' });
}

app.post('/admin/:token/snapshots/:name/replay', requireAdmin, (req, res) => {
  const speed = Math.max(1, Math.min(10, Number(req.body.speed) || 4));
  const filePath = path.join(SNAPSHOTS_DIR, path.basename(req.params.name));
  if (!fs.existsSync(filePath)) return res.status(404).end();
  const snap = JSON.parse(fs.readFileSync(filePath, 'utf8'));

  stopReplay();

  const events = [];
  for (const p of snap.participants || []) {
    events.push({ kind: 'participant', at: p.joinedAt, data: p });
  }
  for (const f of snap.fillSequence || []) {
    events.push({ kind: 'fill', at: f.filledAt, data: f });
  }
  events.sort((a, b) => (a.at || '').localeCompare(b.at || ''));
  if (!events.length) return res.json({ ok: true, total: 0 });

  const t0 = new Date(events[0].at).getTime();
  replayState = { timers: [], snapshotName: req.params.name, speed };

  broadcast({ type: 'replay_start', data: { snapshotName: req.params.name, speed, total: events.length } });

  events.forEach(ev => {
    const delay = (new Date(ev.at).getTime() - t0) / speed;
    const timer = setTimeout(() => {
      if (ev.kind === 'participant') {
        broadcast({ type: 'replay_event', data: { kind: 'participant', participant: ev.data } });
      } else {
        broadcast({ type: 'replay_event', data: { kind: 'fill', fill: ev.data } });
      }
    }, delay);
    replayState.timers.push(timer);
  });

  const lastEventDelay = (new Date(events[events.length - 1].at).getTime() - t0) / speed;

  // Synthetic scan + verdict — only for snapshots that recorded a ceremonyMode.
  // Legacy snapshots (no mode) end at the last fill event (ADR 0003).
  let finalDelay = lastEventDelay + 1500;
  if (snap.ceremonyMode) {
    const scanDelay = lastEventDelay + 400 / speed;
    const verdictDelay = scanDelay + SCANNING_DURATION_MS / speed;
    replayState.timers.push(setTimeout(() => {
      broadcast({ type: 'replay_event', data: { kind: 'scan_start' } });
    }, scanDelay));
    replayState.timers.push(setTimeout(() => {
      broadcast({ type: 'replay_event', data: { kind: 'verdict', ceremonyMode: snap.ceremonyMode } });
    }, verdictDelay));
    finalDelay = verdictDelay + 4000;
  }
  replayState.timers.push(setTimeout(() => { stopReplay(); }, finalDelay));

  res.json({ ok: true, total: events.length, durationMs: finalDelay });
});

app.post('/admin/:token/replay/stop', requireAdmin, (req, res) => {
  stopReplay();
  res.json({ ok: true });
});

// ---- admin html ----
app.get('/admin/:token', requireAdmin, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// ---- root → display ----
app.get('/', (req, res) => res.redirect('/display-v4.html'));

// ---- static (kept after admin so /admin doesn't slip through) ----
app.use(express.static(path.join(__dirname, 'public')));

// ---- start ----
function detectLanIps() {
  const out = [];
  const ifaces = os.networkInterfaces();
  for (const name of Object.keys(ifaces)) {
    for (const ni of ifaces[name] || []) {
      if (ni.family === 'IPv4' && !ni.internal) out.push(ni.address);
    }
  }
  return out;
}

let shuttingDown = false;
function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`\n[${signal}] shutting down...`);

  if (session.fillTimer) clearTimeout(session.fillTimer);
  if (session.scanTimer) clearTimeout(session.scanTimer);
  if (replayState) { replayState.timers.forEach(clearTimeout); replayState = null; }

  wss.clients.forEach(c => { try { c.terminate(); } catch {} });
  wss.close(() => {
    server.close(() => {
      console.log('bye');
      process.exit(0);
    });
  });

  // Force-exit if something hangs.
  setTimeout(() => process.exit(1), 3000).unref();
}

process.on('SIGINT',  () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
  const override = process.env.HOST_IP;
  const ips = override ? [override] : detectLanIps();
  const primary = ips[0] || 'localhost';
  const others  = ips.slice(1);

  console.log('');
  console.log(`Authentic server running on port ${PORT}`);
  console.log(`  Display: http://${primary}:${PORT}/`);
  console.log(`  Mobile:  http://${primary}:${PORT}/mobile.html`);
  console.log(`  Admin:   http://${primary}:${PORT}/admin/${ADMIN_TOKEN}`);
  if (others.length) {
    console.log(`  (also reachable at: ${others.join(', ')})`);
  }
  console.log('');
});
