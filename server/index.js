require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const express = require('express');
const http = require('http');
const { WebSocketServer } = require('ws');
const path = require('path');
const { CopilotRunner } = require('./copilot-runner');
const { SessionManager } = require('./session-manager');
const { PreviewManager } = require('./preview-manager');
const { startTunnel } = require('./tunnel');

const PORT = process.env.PORT || 3000;
const sessions = new SessionManager();
const previews = new PreviewManager();

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

app.use(express.json());

// Serve static files
app.use(express.static(path.join(__dirname, '..', 'public')));

// Serve terminal page
app.get('/terminal', (_req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'terminal.html'));
});

// API: server status
app.get('/api/status', (_req, res) => {
  res.json(sessions.getStatus());
});

// API: list sessions
app.get('/api/sessions', (_req, res) => {
  res.json(sessions.list());
});

// API: create new session
app.post('/api/sessions', (req, res) => {
  const cwd = req.body.cwd || undefined;
  const session = sessions.create(cwd);
  res.json({ id: session.id });
});

// API: browse directories
app.get('/api/browse', (req, res) => {
  const fs = require('fs');
  const target = req.query.path || process.cwd();
  const resolved = path.resolve(target);

  try {
    const entries = fs.readdirSync(resolved, { withFileTypes: true });
    const dirs = entries
      .filter((e) => e.isDirectory() && !e.name.startsWith('.') && e.name !== 'node_modules')
      .map((e) => e.name)
      .sort();

    res.json({
      current: resolved,
      parent: path.dirname(resolved),
      sep: path.sep,
      directories: dirs,
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// API: create directory
app.post('/api/mkdir', (req, res) => {
  const fs = require('fs');
  const dirPath = req.body.path;
  if (!dirPath) return res.status(400).json({ error: 'Path is required' });

  const resolved = path.resolve(dirPath);
  try {
    fs.mkdirSync(resolved, { recursive: true });
    res.json({ created: resolved });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// API: end session
app.delete('/api/sessions/:id', (req, res) => {
  const session = sessions.get(req.params.id);
  if (!session) return res.status(404).json({ error: 'Session not found' });
  sessions.end(req.params.id);
  res.json({ ok: true });
});

// Health check
app.get('/health', (_req, res) => res.json({ status: 'ok' }));

// API: list active previews
app.get('/api/preview', (_req, res) => {
  res.json(previews.list());
});

// API: start preview tunnel
app.post('/api/preview', async (req, res) => {
  const port = parseInt(req.body.port, 10);
  if (!port || port < 1 || port > 65535) {
    return res.status(400).json({ error: 'Invalid port number' });
  }
  try {
    const preview = await previews.start(port);
    res.json({ port: preview.port, url: preview.url });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// API: stop preview tunnel
app.delete('/api/preview/:port', (req, res) => {
  const port = parseInt(req.params.port, 10);
  previews.stop(port);
  res.json({ ok: true });
});

// WebSocket connection
wss.on('connection', (ws, req) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const sessionId = url.searchParams.get('session');

  const session = sessions.get(sessionId);
  if (!session || session.status !== 'active') {
    ws.send(JSON.stringify({ type: 'error', content: 'Invalid or ended session' }));
    ws.close(4002, 'Invalid session');
    return;
  }

  console.log(`[ws] Client connected to session ${sessionId}`);
  sessions.addClient(sessionId, ws);

  // Create runner if this session doesn't have one yet
  if (!session.runner) {
    session.runner = new CopilotRunner((data) => {
      // Broadcast to all clients connected to this session
      for (const client of session.clients) {
        if (client.readyState === 1) {
          client.send(JSON.stringify({ type: 'output', content: data }));
        }
      }
    });
    session.runner.start(session.cwd);
  }

  ws.on('message', (data) => {
    try {
      const msg = JSON.parse(data.toString());
      if (msg.type === 'input' && session.runner) {
        session.runner.write(msg.content);
      } else if (msg.type === 'resize' && session.runner) {
        session.runner.resize(msg.cols, msg.rows);
      }
    } catch {
      if (session.runner) session.runner.write(data.toString());
    }
  });

  ws.on('close', () => {
    console.log(`[ws] Client disconnected from session ${sessionId}`);
    sessions.removeClient(sessionId, ws);
  });
});

server.listen(PORT, async () => {
  console.log(`\n  🚀 jet-copilot server running on http://localhost:${PORT}\n`);
  await startTunnel(PORT);
});
