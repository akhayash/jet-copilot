const express = require('express');
const http = require('http');
const fs = require('fs');
const { execSync } = require('child_process');
const { WebSocketServer } = require('ws');
const path = require('path');
const multer = require('multer');
const { CopilotRunner } = require('./copilot-runner');
const { loadEnv } = require('./load-env');
const { SessionManager } = require('./session-manager');
const { PreviewManager } = require('./preview-manager');
const { WindowCapture } = require('./window-capture');
const { startTunnel, getTunnelUrl } = require('./tunnel');
const { scanCopilotSessions, getSessionHistory, getSessionMessageCount, cleanStaleLocks, adoptSession } = require('./copilot-session-scanner');
const QRCode = require('qrcode');
const log = require('./logger');

loadEnv();

const PORT = process.env.PORT || 4117;
const EXIT_RESTART = 100;
const PKG_ROOT = path.resolve(__dirname, '..');

function isPathSafe(resolved) {
  // Reject paths containing null bytes (injection)
  if (resolved.includes('\0')) return false;
  // Reject system-critical directories
  const blocked = ['/etc', '/proc', '/sys', '/dev', 'C:\\Windows\\System32'];
  return !blocked.some((b) => resolved.toLowerCase().startsWith(b.toLowerCase()));
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function createApp({
  sessions = new SessionManager(),
  previews = new PreviewManager(),
  capture = new WindowCapture(),
  fsModule = fs,
  pathModule = path,
  multerModule = multer,
  execSyncFn = execSync,
  pkgRoot = PKG_ROOT,
  getTunnelUrlFn = getTunnelUrl,
  qrcodeModule = QRCode,
  scanCopilotSessionsFn = scanCopilotSessions,
  getSessionHistoryFn = getSessionHistory,
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
    const status = sessions.getStatus();
    status.captureAvailable = capture.isAvailable();
    res.json(status);
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
    const copilotSessionId = req.body.copilotSessionId || undefined;
    if (copilotSessionId && !UUID_RE.test(copilotSessionId)) {
      return res.status(400).json({ error: 'Invalid copilotSessionId format' });
    }
    if (copilotSessionId) {
      const removed = cleanStaleLocks(copilotSessionId, { force: true });
      if (removed) log.info('session', 'took over', { copilotSessionId, killed: removed });
    }
    const session = sessions.create(cwd, { copilotSessionId });
    if (copilotSessionId) {
      session.messageCount = getSessionMessageCount(copilotSessionId);
    }
    log.info('session', 'created', { id: session.id, copilotSessionId: session.copilotSessionId, cwd: session.cwd });
    res.json({ id: session.id, copilotSessionId: session.copilotSessionId });
  });

  app.get('/api/browse', (req, res) => {
    const target = req.query.path || process.cwd();
    const resolved = pathModule.resolve(target);

    if (!isPathSafe(resolved)) {
      return res.status(403).json({ error: 'Access denied' });
    }

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
    if (!isPathSafe(resolved)) {
      return res.status(403).json({ error: 'Access denied' });
    }
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
    log.info('session', 'ended', { id: req.params.id });
    res.json({ ok: true });
  });

  app.get('/api/copilot-sessions', (req, res) => {
    const cwd = req.query.cwd || undefined;
    try {
      const copilotSessions = scanCopilotSessionsFn(cwd);
      res.json(copilotSessions);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/copilot-sessions/:id/history', (req, res) => {
    const { id } = req.params;
    if (!UUID_RE.test(id)) return res.status(400).json({ error: 'Invalid session ID format' });
    const maxTurns = parseInt(req.query.maxTurns, 10) || 10;
    try {
      const history = getSessionHistoryFn(id, { maxTurns });
      res.json(history);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/copilot-sessions/:id/adopt', (req, res) => {
    const { id } = req.params;
    if (!UUID_RE.test(id)) return res.status(400).json({ error: 'Invalid session ID format' });
    try {
      cleanStaleLocks(id, { force: true });
      const result = adoptSession(id);
      if (result.alreadyAdopted) {
        return res.json({ status: 'already_resumable' });
      }
      log.info('adopt', 'session adopted', { id });
      res.json({ status: 'adopted' });
    } catch (err) {
      log.error('adopt', 'failed', { id, error: err.message });
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/tunnel', (_req, res) => {
    res.json({ url: getTunnelUrlFn() });
  });

  app.get('/api/qrcode', async (req, res) => {
    const url = req.query.url;
    if (!url) return res.status(400).json({ error: 'url query parameter is required' });
    try {
      const svg = await qrcodeModule.toString(url, { type: 'svg', margin: 1 });
      res.type('image/svg+xml').send(svg);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
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

        const ALLOWED_EXT = ['.png', '.jpg', '.jpeg', '.gif', '.webp'];
        const ext = pathModule.extname(req.file.originalname).toLowerCase() || '.png';
        if (!ALLOWED_EXT.includes(ext)) {
          return res.status(400).json({ error: `File type not allowed. Accepted: ${ALLOWED_EXT.join(', ')}` });
        }
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

  // Window capture
  app.get('/api/windows', (_req, res) => {
    try {
      res.json(capture.listWindows());
    } catch (err) {
      console.error('[capture] list error:', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/capture', async (req, res) => {
    const windowId = req.body.windowId;
    if (windowId == null) {
      return res.status(400).json({ error: 'windowId is required' });
    }
    try {
      const result = await capture.capture(windowId);
      res.json({
        filename: result.filename,
        url: `/api/captures/${result.filename}`,
        path: result.path,
        width: result.width,
        height: result.height,
      });
    } catch (err) {
      console.error('[capture] error:', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/captures/:filename', (req, res) => {
    const filename = req.params.filename;
    if (!/^[0-9]+\.png$/.test(filename)) {
      return res.status(400).json({ error: 'Invalid filename' });
    }
    const filePath = pathModule.join(capture.getCaptureDir(), filename);
    if (!fsModule.existsSync(filePath)) {
      return res.status(404).json({ error: 'Capture not found' });
    }
    res.type('image/png').sendFile(filePath);
  });

  // Version & update
  app.get('/api/version', (_req, res) => {
    try {
      const pkg = JSON.parse(fsModule.readFileSync(pathModule.join(pkgRoot, 'package.json'), 'utf-8'));
      const hasGit = fsModule.existsSync(pathModule.join(pkgRoot, '.git'));
      res.json({ version: pkg.version, updatable: hasGit });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/update', (req, res) => {
    const gitDir = pathModule.join(pkgRoot, '.git');
    if (!fsModule.existsSync(gitDir)) {
      return res.status(400).json({ error: 'Not a git installation — cannot update' });
    }

    try {
      const pullOutput = execSyncFn('git pull origin main 2>&1', { encoding: 'utf-8', shell: true, cwd: pkgRoot });
      const installOutput = execSyncFn('npm install 2>&1', { encoding: 'utf-8', shell: true, cwd: pkgRoot });
      res.json({ status: 'updated', pullOutput: pullOutput.trim(), installOutput: installOutput.substring(0, 500) });

      // Broadcast restart notice and exit after response is sent
      setTimeout(() => {
        console.log('  🔄 Restarting after update...');
        process.exit(EXIT_RESTART);
      }, 500);
    } catch (err) {
      console.error('[update] error:', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  return { app, sessions, previews, capture };
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
    log.info('ws', 'client connected', { sessionId, clients: session.clients.size });

    // Replay buffered output to newly connected client
    const buffer = sessions.getOutputBuffer(sessionId);
    if (buffer) {
      console.log(`  📋 [replay] Sending ${buffer.length} bytes to session ${sessionId}`);
      ws.send(JSON.stringify({ type: 'replay', content: buffer }));
    } else {
      console.log(`  📋 [replay] No buffered output for session ${sessionId}`);
    }

    if (!session.runner) {
      const resumeArgs = session.copilotSessionId
        ? ['--resume', session.copilotSessionId]
        : [];
      session.runner = runnerFactory((data) => {
        sessions.appendOutput(sessionId, data);
        for (const client of session.clients) {
          if (client.readyState === 1) {
            client.send(JSON.stringify({ type: 'output', content: data }));
          }
        }
      });
      session.runner.onExit = ({ exitCode, signal }) => {
        for (const client of session.clients) {
          if (client.readyState === 1) {
            client.send(JSON.stringify({ type: 'exit', exitCode, signal }));
          }
        }
      };
      session.runner.start(session.cwd, { args: resumeArgs });
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
          const resumeArgs = session.copilotSessionId
            ? ['--resume', session.copilotSessionId]
            : [];
          session.runner.restart(session.cwd, { args: resumeArgs });
        }
      } catch {
        if (session.runner) session.runner.write(data.toString());
      }
    });

    ws.on('close', () => {
      sessions.removeClient(sessionId, ws);
      log.info('ws', 'client disconnected', { sessionId, clients: session.clients.size });
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

  // Graceful shutdown
  function shutdown() {
    console.log('\n  🛑 Shutting down...');
    for (const s of sessions.list()) {
      if (s.status === 'active') sessions.end(s.id);
    }
    wss.close();
    server.close(() => {
      console.log('  ✅ Server closed');
      process.exit(0);
    });
    // Force exit after 5s if close hangs
    setTimeout(() => process.exit(0), 5000).unref();
  }

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);

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
