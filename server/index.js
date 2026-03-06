require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const express = require('express');
const http = require('http');
const { WebSocketServer } = require('ws');
const path = require('path');
const { CopilotRunner } = require('./copilot-runner');
const { startTunnel } = require('./tunnel');

const PORT = process.env.PORT || 3000;

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

// Serve static files
app.use(express.static(path.join(__dirname, '..', 'public')));

// Health check
app.get('/health', (_req, res) => res.json({ status: 'ok' }));

// WebSocket connection
wss.on('connection', (ws, req) => {
  console.log('[ws] Client connected');

  // Stream PTY output to WebSocket
  const runner = new CopilotRunner((data) => {
    if (ws.readyState === 1) {
      ws.send(JSON.stringify({ type: 'output', content: data }));
    }
  });

  runner.start();

  ws.on('message', (data) => {
    try {
      const msg = JSON.parse(data.toString());
      if (msg.type === 'input') {
        runner.write(msg.content);
      } else if (msg.type === 'resize') {
        runner.resize(msg.cols, msg.rows);
      }
    } catch {
      // Raw text fallback
      runner.write(data.toString());
    }
  });

  ws.on('close', () => {
    console.log('[ws] Client disconnected');
    runner.cleanup();
  });
});

server.listen(PORT, async () => {
  console.log(`\n  🚀 jet-copilot server running on http://localhost:${PORT}\n`);
  await startTunnel(PORT);
});
