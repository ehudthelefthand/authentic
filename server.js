const express = require('express');
const { WebSocketServer } = require('ws');
const http = require('http');
const fs = require('fs');
const path = require('path');

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const DATA_FILE = path.join(__dirname, 'data.json');

// --- Persistence ---
function loadParticipants() {
  if (!fs.existsSync(DATA_FILE)) return [];
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  } catch {
    return [];
  }
}

function saveParticipants(participants) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(participants, null, 2));
}

let participants = loadParticipants();

// --- WebSocket broadcast ---
function broadcast(data) {
  const msg = JSON.stringify(data);
  wss.clients.forEach(client => {
    if (client.readyState === 1) client.send(msg);
  });
}

wss.on('connection', ws => {
  ws.on('error', err => console.error('WS error:', err));
});

// --- Simple ID + seed generation ---
function hashStr(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(31, h) + str.charCodeAt(i) | 0;
  }
  return Math.abs(h);
}

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

// --- Routes ---
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.get('/participants', (req, res) => {
  res.json(participants);
});

app.post('/join', (req, res) => {
  const name = (req.body.name || '').trim();
  if (!name) return res.status(400).json({ error: 'name required' });

  const seed = hashStr(name + Date.now());
  const paletteIndex = hashStr(name) % 8;

  const participant = {
    id: uid(),
    name,
    seed,
    paletteIndex,
    joinedAt: new Date().toISOString(),
  };

  participants.push(participant);
  saveParticipants(participants);

  broadcast({ type: 'new_participant', data: participant });

  res.json(participant);
});

// --- Start ---
const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Authentic server running on http://0.0.0.0:${PORT}`);
  console.log(`Display: http://localhost:${PORT}/display.html`);
  console.log(`Mobile:  http://<your-ip>:${PORT}/mobile.html`);
});
