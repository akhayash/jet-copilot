const express = require('express');
const http = require('http');
const fs = require('fs');
const { WebSocketServer } = require('ws');
const path = require('path');
const multer = require('multer');
const { CopilotRunner } = require('./copilot-runner');
const { loadEnv } = require('./load-env');
const { SessionManager } = require('./session-manager');
const { PreviewManager } = require('./preview-manager');
const { startTunnel } = require('./tunnel');

loadEnv();

const PORT = process.env.PORT || 3000;

function createApp({
  sessions = new SessionManager(),
  previews = new PreviewManager(),
  fsModule = fs,
  pathModule = path,
  multerModule = multer,
} = {}) {
  const app = express();
  const upload = multerModule({
    storage: multerModule.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 },
  });

  app.use(express.json());

  app.use(express.static(pathModule.join(__dirname, '..', 'public')));

  app.get('/terminal', (_req, res) => {
    res.sendFile(pathModule.join(__dirname, '..', 'public', 'terminal.html'));
  });

  app.get('/api/status', (_req, res) => {
    res.json(sessions.getStatus());
  });

  app.get('/api/sessions', (_req, res) => {
    res.json(sessions.list());
  });

  app.get('/api/sessions/:id', (req, res) => {
    const session = sessions.get(req.params.id);
    if (!session) return res.status(404).json({ error: 'Session not found' });
    res.json(sessions.serialize(session));
  });

  app.post('/api/sessions', (req, res) => {
    const cwd = req.body.cwd || undefined;
    const session = sessions.create(cwd);
    res.json({ id: session.id });
  });

  app.get('/api/browse', (req, res) => {
    const target = req.query.path || process.cwd();
    const resolved = pathModule.resolve(target);

    try {
      const entries = fsModule.readdirSync(resolved, { withFileTypes: true });
      const dirs = entries
        .filter((e) => e.isDirectory() && !e.name.startsWith('.') && e.name !== 'node_modules')
        .map((e) => e.name)
        .sort();

      res.json({
        current: resolved,
        parent: pathModule.dirname(resolved),
        sep: pathModule.sep,
        directories: dirs,
      });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  app.post('/api/mkdir', (req, res) => {
    const dirPath = req.body.path;
    if (!dirPath) return res.status(400).json({ error: 'Path is required' });

    const resolved = pathModule.resolve(dirPath);
    try {
      fsModule.mkdirSync(resolved, { recursive: true });
      res.json({ created: resolved });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  app.delete('/api/sessions/:id', (req, res) => {
    const session = sessions.get(req.params.id);
    if (!session) return res.status(404).json({ error: 'Session not found' });
    sessions.end(req.params.id);
    res.json({ ok: true });
  });

  app.post('/api/upload', (req, res) => {
    upload.single('image')(req, res, (err) => {
      if (err) {
        console.error('[upload] multer error:', err.message, err.code);
        return res.status(400).json({ error: err.message });
      }

      const sessionId = req.body.session;
      const session = sessions.get(sessionId);
      if (!session || session.status !== 'active') {
        return res.status(404).json({ error: 'Invalid or ended session' });
      }
      if (!req.file) {
        return res.status(400).json({ error: 'No image file provided' });
      }

      try {
        const uploadDir = pathModule.join(session.cwd || process.cwd(), '.copilot-uploads');
        fsModule.mkdirSync(uploadDir, { recursive: true });

        const ext = pathModule.extname(req.file.originalname) || '.png';
        const filename = `${Date.now()}${ext}`;
        const filePath = pathModule.join(uploadDir, filename);

        fsModule.writeFileSync(filePath, req.file.buffer);
        res.json({ path: filePath });
      } catch (e) {
        console.error('[upload] file write error:', e.message);
        res.status(500).json({ error: e.message });
      }
    });
  });

  app.get('/health', (_req, res) => res.json({ status: 'ok' }));

  app.get('/api/preview', (_req, res) => {
    res.json(previews.list());
  });

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

  app.delete('/api/preview/:port', (req, res) => {
    const port = parseInt(req.params.port, 10);
    previews.stop(port);
    res.json({ ok: true });
  });

  return { app, sessions, previews };
}

function attachWebSocketServer(wss, {
  sessions,
  port = PORT,
  runnerFactory = (onData) => new CopilotRunner(onData),
} = {}) {
  wss.on('connection', (ws, req) => {
    const url = new URL(req.url, `http://localhost:${port}`);
    const sessionId = url.searchParams.get('session');

    const session = sessions.get(sessionId);
    if (!session || session.status !== 'active') {
      ws.send(JSON.stringify({ type: 'error', content: 'Invalid or ended session' }));
      ws.close(4002, 'Invalid session');
      return;
    }

    sessions.addClient(sessionId, ws);

    if (!session.runner) {
      session.runner = runnerFactory((data) => {
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
        } else if (msg.type === 'restart' && session.runner) {
          console.log(`[ws] Restarting Copilot for session ${sessionId}`);
          session.runner.restart(session.cwd);
        }
      } catch {
        if (session.runner) session.runner.write(data.toString());
      }
    });

    ws.on('close', () => {
      sessions.removeClient(sessionId, ws);
    });
  });
}

async function startServer({
  port = PORT,
  sessions = new SessionManager(),
  previews = new PreviewManager(),
  startTunnelFn = startTunnel,
  runnerFactory,
} = {}) {
  const { app } = createApp({ sessions, previews });
  const server = http.createServer(app);
  const wss = new WebSocketServer({ server });

  attachWebSocketServer(wss, { sessions, port, runnerFactory });

  await new Promise((resolve) => {
    server.listen(port, resolve);
  });

  console.log(`\n  🚀 jet-copilot server running on http://localhost:${port}\n`);
  await startTunnelFn(port);

  return { app, server, wss, sessions, previews };
}

async function runCli() {
  try {
    await startServer();
  } catch (err) {
    console.error(err);
    process.exitCode = 1;
  }
}

if (require.main === module) {
  runCli();
}

module.exports = { createApp, attachWebSocketServer, startServer, runCli };
