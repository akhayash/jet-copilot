const { spawn, execSync } = require('child_process');
const qrcode = require('qrcode-terminal');

async function startTunnel(port) {
  console.log('  🔗 Starting Dev Tunnel...');

  try {
    // Check if devtunnel is available
    execSync('devtunnel --version', { stdio: 'ignore' });
  } catch {
    console.error('  ❌ devtunnel CLI not found.');
    console.error('     Install: winget install Microsoft.devtunnel');
    console.error('     Login:   devtunnel user login -g');
    console.error(`\n  📱 Manual access: http://localhost:${port}\n`);
    return;
  }

  try {
    // Require GitHub/Microsoft login at the tunnel level (remove --allow-anonymous for security)
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
        console.log(`  ✅ Tunnel ready: ${url}`);
        console.log('\n  📱 Scan this QR code with your iPhone:\n');
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

module.exports = { startTunnel };
