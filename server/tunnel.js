const { spawn, execSync } = require('child_process');
const qrcode = require('qrcode-terminal');

let tunnelUrl = null;
let tunnelId = null;

function getTunnelUrl() {
  return tunnelUrl;
}

function getTunnelId() {
  return tunnelId;
}

function addPort(id, port, { execSyncFn = execSync } = {}) {
  try {
    execSyncFn(`devtunnel port show ${id} -p ${port} 2>&1`, {
      encoding: 'utf-8',
      shell: true,
    });
  } catch {
    execSyncFn(`devtunnel port create ${id} -p ${port}`, {
      stdio: 'ignore',
      shell: true,
    });
    console.log(`  ✅ Port ${port} added to tunnel "${id}"`);
  }
}

function removePort(id, port, { execSyncFn = execSync } = {}) {
  try {
    execSyncFn(`devtunnel port delete ${id} -p ${port}`, {
      stdio: 'ignore',
      shell: true,
    });
  } catch {
    // Port may already be removed
  }
}

function ensurePersistentTunnel(id, port, { execSyncFn = execSync } = {}) {
  let needsCreate = false;
  try {
    execSyncFn(`devtunnel show ${id}`, { stdio: 'ignore', shell: true });
    console.log(`  ✅ Persistent tunnel "${id}" found`);
  } catch {
    needsCreate = true;
  }

  if (needsCreate) {
    console.log(`  ⚠️ Tunnel "${id}" not found or expired, creating...`);
    execSyncFn(`devtunnel create ${id}`, {
      stdio: 'ignore',
      shell: true,
    });
    console.log(`  ✅ Tunnel "${id}" created`);
  }

  addPort(id, port, { execSyncFn });
}

async function startTunnel(port, { execSyncFn = execSync, spawnFn = spawn } = {}) {
  console.log('  🔗 Starting Dev Tunnel...');

  try {
    execSyncFn('devtunnel --version', { stdio: 'ignore' });
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
    const loginStatus = execSyncFn('devtunnel user show 2>&1', { encoding: 'utf-8', shell: true });
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
      ensurePersistentTunnel(configuredId, port, { execSyncFn });
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
      shell: true,
    });

    let url = null;

    const handleOutput = (data) => {
      const text = data.toString();
      // devtunnel outputs two URLs - prefer the one with port in subdomain (no :port suffix)
      // e.g. "https://abc-3000.jpe1.devtunnels.ms" over "https://abc.jpe1.devtunnels.ms:3000"
      const allUrls = text.match(/https:\/\/[^\s,]+\.devtunnels\.ms[^\s,]*/g);
      if (allUrls && !url) {
        // Pick the URL without a port suffix (port is in subdomain instead)
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

    // Give time for tunnel to start
    await new Promise((resolve) => setTimeout(resolve, 5000));

    if (!url) {
      console.log('  ⏳ Tunnel is starting... URL will appear shortly.');
    }
  } catch (err) {
    console.error('  ❌ Failed to start tunnel:', err.message);
    console.error(`\n  📱 Manual access: http://localhost:${port}\n`);
  }
}

module.exports = { startTunnel, getTunnelUrl, getTunnelId, ensurePersistentTunnel, addPort, removePort };
