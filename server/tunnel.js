const { spawn, execSync } = require('child_process');
const qrcode = require('qrcode-terminal');

const TUNNEL_LABEL = 'jet-copilot';

async function startTunnel(port, {
  execSyncFn = execSync,
  spawnFn = spawn,
} = {}) {
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
    if (loginStatus.includes('not logged in') || loginStatus.includes('No current user')) {
      console.error('  ❌ devtunnel is not logged in.');
      console.error('     Run one of:');
      console.error('       devtunnel user login -g   (GitHub)');
      console.error('       devtunnel user login -m   (Microsoft)');
      console.error(`\n  📱 Manual access: http://localhost:${port}\n`);
      return;
    }
    console.log(`  ✅ devtunnel logged in`);
  } catch {
    // If command fails, try to proceed anyway
  }

  try {
    const tunnelId = findOrCreateTunnel(port, execSyncFn);
    if (!tunnelId) {
      console.error('  ❌ Failed to set up persistent tunnel');
      console.error(`\n  📱 Manual access: http://localhost:${port}\n`);
      return;
    }

    const info = JSON.parse(execSyncFn(`devtunnel show ${tunnelId} --json 2>&1`, { encoding: 'utf-8', shell: true }));
    const tunnel = info.tunnel || info;

    // Extract URL from ports info
    let url = null;
    if (tunnel.ports) {
      for (const p of tunnel.ports) {
        if (p.portUri) url = p.portUri;
      }
    }

    if (tunnel.hostConnections > 0) {
      console.log(`  ✅ Tunnel already running: ${url || tunnelId}`);
      if (url) showQrCode(url);
      return;
    }

    // Start hosting as a detached process
    const proc = spawnFn('devtunnel', ['host', tunnelId], {
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: true,
      detached: true,
    });

    proc.unref();

    // Wait for URL from stdout if we don't have it yet
    if (!url) {
      url = await waitForUrl(proc);
    }

    if (url) {
      console.log(`  ✅ Tunnel ready: ${url}`);
      showQrCode(url);
    } else {
      // Re-check show for URL after tunnel has started
      await new Promise((resolve) => setTimeout(resolve, 3000));
      try {
        const refreshed = JSON.parse(execSyncFn(`devtunnel show ${tunnelId} --json 2>&1`, { encoding: 'utf-8', shell: true }));
        const t = refreshed.tunnel || refreshed;
        if (t.ports) {
          for (const p of t.ports) {
            if (p.portUri) url = p.portUri;
          }
        }
        if (url) {
          console.log(`  ✅ Tunnel ready: ${url}`);
          showQrCode(url);
        } else {
          console.log(`  ⏳ Tunnel starting... ID: ${tunnelId}`);
        }
      } catch {
        console.log(`  ⏳ Tunnel starting... ID: ${tunnelId}`);
      }
    }
  } catch (err) {
    console.error('  ❌ Failed to start tunnel:', err.message);
    console.error(`\n  📱 Manual access: http://localhost:${port}\n`);
  }
}

function findOrCreateTunnel(port, execSyncFn) {
  // Search for existing tunnel by label
  try {
    const listOutput = execSyncFn(`devtunnel list --labels ${TUNNEL_LABEL} --json 2>&1`, { encoding: 'utf-8', shell: true });
    const parsed = JSON.parse(listOutput);
    const tunnels = parsed.tunnels || parsed;
    if (Array.isArray(tunnels) && tunnels.length > 0) {
      const tunnelId = tunnels[0].tunnelId;
      console.log(`  ♻️  Reusing tunnel: ${tunnelId}`);
      ensurePort(tunnelId, port, execSyncFn);
      return tunnelId;
    }
  } catch {
    // No existing tunnel found
  }

  // Create new tunnel
  try {
    const createOutput = execSyncFn(`devtunnel create --labels ${TUNNEL_LABEL} -e 30d --json 2>&1`, { encoding: 'utf-8', shell: true });
    const parsed = JSON.parse(createOutput);
    const tunnelId = (parsed.tunnel || parsed).tunnelId;
    console.log(`  🆕 Created tunnel: ${tunnelId}`);
    ensurePort(tunnelId, port, execSyncFn);
    return tunnelId;
  } catch (err) {
    console.error('  ❌ Failed to create tunnel:', err.message);
    return null;
  }
}

function ensurePort(tunnelId, port, execSyncFn) {
  try {
    execSyncFn(`devtunnel port create ${tunnelId} -p ${port} 2>&1`, { encoding: 'utf-8', shell: true });
  } catch {
    // Port may already exist — ignore error
  }
}

function waitForUrl(proc) {
  return new Promise((resolve) => {
    let url = null;
    const handleOutput = (data) => {
      const text = data.toString();
      const allUrls = text.match(/https:\/\/[^\s,]+\.devtunnels\.ms[^\s,]*/g);
      if (allUrls && !url) {
        url = allUrls.find((u) => !u.match(/:\d+$/)) || allUrls[0].replace(/[,;]+$/, '');
        resolve(url);
      }
    };

    if (proc.stdout) proc.stdout.on('data', handleOutput);
    if (proc.stderr) proc.stderr.on('data', handleOutput);

    setTimeout(() => { if (!url) resolve(null); }, 5000);
  });
}

function showQrCode(url) {
  console.log('\n  📱 Scan this QR code with your phone:\n');
  qrcode.generate(url, { small: true }, (code) => {
    console.log(code);
    console.log(`\n  URL: ${url}\n`);
  });
}

module.exports = { startTunnel, findOrCreateTunnel, TUNNEL_LABEL };
