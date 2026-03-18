#!/usr/bin/env node
const { fork } = require('child_process');
const path = require('path');

const EXIT_RESTART = 100;
const serverScript = path.join(__dirname, '..', 'server', 'index.js');

function parseArgs(argv = process.argv.slice(2)) {
  const env = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if ((arg === '--port' || arg === '-p') && argv[i + 1]) {
      env.PORT = argv[++i];
    } else if ((arg === '--tunnel-id' || arg === '-t') && argv[i + 1]) {
      env.DEVTUNNEL_ID = argv[++i];
    } else if (arg === '--help' || arg === '-h') {
      console.log(`
  Usage: jet-copilot [options]

  Options:
    -p, --port <port>        Server port (default: 4117)
    -t, --tunnel-id <id>     Persistent Dev Tunnel ID
    -h, --help               Show this help
`);
      process.exit(0);
    }
  }
  return env;
}

function run(forkFn = fork, envOverrides = {}) {
  const child = forkFn(serverScript, [], {
    stdio: 'inherit',
    env: { ...process.env, ...envOverrides },
  });
  child.on('exit', (code) => {
    if (code === EXIT_RESTART) {
      console.log('\n  🔄 Restarting jet-copilot...\n');
      run(forkFn, envOverrides);
    } else {
      process.exitCode = code || 0;
    }
  });
  return child;
}

if (require.main === module) {
  const envOverrides = parseArgs();
  run(undefined, envOverrides);
}

module.exports = { run, parseArgs, EXIT_RESTART };
