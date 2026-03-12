const { spawn, execSync } = require('child_process');
const qrcode = require('qrcode-terminal');

let tunnelUrl = null;

function getTunnelUrl() {
  return tunnelUrl;
}

async function startTunnel(port) {
  console.log('  🔗 Starting Dev Tunnel...');

  try {
    // Check if devtunnel is available
    execSync('devtunnel --version', { stdio: 'ignore' });
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
    // Check if user is logged in
    const loginStatus = execSync('devtunnel user show 2>&1', { encoding: 'utf-8', shell: true });
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

  try {
    const proc = spawn('devtunnel', [
      'host',
      '--port-numbers', String(port),
    ], {
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

module.exports = { startTunnel, getTunnelUrl };
