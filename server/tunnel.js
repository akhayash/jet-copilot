const { spawn, execFileSync } = require('child_process');
const qrcode = require('qrcode-terminal');
const log = require('./logger');

const TUNNEL_ID_PATTERN = /^[a-zA-Z0-9-]+$/;

let tunnelUrl = null;
let tunnelId = null;

function getTunnelUrl() {
  return tunnelUrl;
}

function getTunnelId() {
  return tunnelId;
}

function validateTunnelId(id) {
  if (!TUNNEL_ID_PATTERN.test(id)) {
    throw new Error(`Invalid tunnel ID "${id}". Only alphanumeric characters and hyphens are allowed.`);
  }
}

function addPort(id, port, { execFileSyncFn = execFileSync } = {}) {
  validateTunnelId(id);
  try {
    execFileSyncFn('devtunnel', ['port', 'show', id, '-p', String(port)], {
      encoding: 'utf-8',
      stdio: 'pipe',
    });
  } catch {
    try {
      execFileSyncFn('devtunnel', ['port', 'create', id, '-p', String(port)], {
        stdio: 'ignore',
      });
      console.log(`  ✅ Port ${port} added to tunnel "${id}"`);
    } catch (createErr) {
      log.error('tunnel', 'failed to add port', { id, port, error: createErr.message });
    }
  }
}

function removePort(id, port, { execFileSyncFn = execFileSync } = {}) {
  validateTunnelId(id);
  try {
    execFileSyncFn('devtunnel', ['port', 'delete', id, '-p', String(port)], {
      stdio: 'ignore',
    });
  } catch (err) {
    log.debug('tunnel', 'port delete skipped', { id, port, error: err.message });
  }
}

function listPorts(id, { execFileSyncFn = execFileSync } = {}) {
  try {
    const output = execFileSyncFn('devtunnel', ['port', 'list', id], {
      encoding: 'utf-8',
      stdio: 'pipe',
    });
    const ports = [];
    for (const line of output.split('\n')) {
      const match = line.match(/^\s*(\d+)\s/);
      if (match) ports.push(Number(match[1]));
    }
    return ports;
  } catch {
    return [];
  }
}

function ensurePersistentTunnel(id, port, { execFileSyncFn = execFileSync } = {}) {
  validateTunnelId(id);
  let needsCreate = false;
  try {
    execFileSyncFn('devtunnel', ['show', id], { stdio: 'ignore' });
    console.log(`  ✅ Persistent tunnel "${id}" found`);
  } catch {
    needsCreate = true;
  }

  if (needsCreate) {
    console.log(`  ⚠️ Tunnel "${id}" not found or expired, creating...`);
    execFileSyncFn('devtunnel', ['create', id], { stdio: 'ignore' });
    console.log(`  ✅ Tunnel "${id}" created`);
  }

  const existingPorts = listPorts(id, { execFileSyncFn });
  for (const p of existingPorts) {
    if (p !== port) {
      console.log(`  🧹 Removing stale port ${p} from tunnel "${id}"`);
      removePort(id, p, { execFileSyncFn });
    }
  }

  addPort(id, port, { execFileSyncFn });
}

async function startTunnel(port, { execFileSyncFn = execFileSync, spawnFn = spawn } = {}) {
  console.log('  🔗 Starting Dev Tunnel...');

  try {
    execFileSyncFn('devtunnel', ['--version'], { stdio: 'ignore' });
  } catch {
    console.error('  ❌ devtunnel CLI not found.');
    console.error('     Install:');
    console.error('       Windows: winget install Microsoft.devtunnel');
    console.error('       macOS:   brew install --cask devtunnel');
    console.error('       Linux:   curl -sL https://aka.ms/DevTunnelCliInstall | bash');
    console.error(`\n  📱 Manual access: http://localhost:${port}\n`);
    return;
  }

  try {
    const loginStatus = execFileSyncFn('devtunnel', ['user', 'show'], {
      encoding: 'utf-8',
      stdio: 'pipe',
    });
    if (loginStatus.toLowerCase().includes('not logged in') || loginStatus.includes('No current user')) {
      console.error('  ❌ devtunnel is not logged in.');
      console.error('     Run one of:');
      console.error('       devtunnel user login -g   (GitHub)');
      console.error('       devtunnel user login -e   (Microsoft / Entra ID)');
      console.error(`\n  📱 Manual access: http://localhost:${port}\n`);
      return;
    }
    console.log(`  ✅ devtunnel logged in`);
  } catch {
    // If command fails, try to proceed anyway
  }

  const configuredId = process.env.DEVTUNNEL_ID;

  if (configuredId) {
    try {
      ensurePersistentTunnel(configuredId, port, { execFileSyncFn });
      tunnelId = configuredId;
    } catch (err) {
      console.error(`  ❌ Failed to set up persistent tunnel "${configuredId}":`, err.message);
      console.error(`\n  📱 Manual access: http://localhost:${port}\n`);
      return;
    }
  }

  try {
    const args = configuredId
      ? ['host', configuredId]
      : ['host', '--port-numbers', String(port)];

    const proc = spawnFn('devtunnel', args, {
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let url = null;

    const handleOutput = (data) => {
      const text = data.toString();
      const allUrls = text.match(/https:\/\/[^\s,]+\.devtunnels\.ms[^\s,]*/g);
      if (allUrls && !url) {
        url = allUrls.find(u => !u.match(/:\d+$/)) || allUrls[0].replace(/[,;]+$/, '');
        tunnelUrl = url;
        console.log(`  ✅ Tunnel ready: ${url}`);
        console.log('\n  📱 Scan this QR code with your phone:\n');
        qrcode.generate(url, { small: true }, (code) => {
          console.log(code);
          console.log(`\n  URL: ${url}\n`);
        });
      }
    };

    proc.stdout.on('data', handleOutput);
    proc.stderr.on('data', handleOutput);

    proc.on('close', (code) => {
      if (code !== 0) {
        console.error(`  ❌ Tunnel exited with code ${code}`);
      }
    });

    await new Promise((resolve) => setTimeout(resolve, 5000));

    if (!url) {
      console.log('  ⏳ Tunnel is starting... URL will appear shortly.');
    }
  } catch (err) {
    console.error('  ❌ Failed to start tunnel:', err.message);
    console.error(`\n  📱 Manual access: http://localhost:${port}\n`);
  }
}

module.exports = { startTunnel, getTunnelUrl, getTunnelId, ensurePersistentTunnel, addPort, removePort, listPorts, validateTunnelId };
