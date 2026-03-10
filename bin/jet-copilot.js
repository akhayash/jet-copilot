#!/usr/bin/env node
const { fork } = require('child_process');
const path = require('path');

const EXIT_RESTART = 100;
const serverScript = path.join(__dirname, '..', 'server', 'index.js');

function run(forkFn = fork) {
  const child = forkFn(serverScript, [], { stdio: 'inherit' });
  child.on('exit', (code) => {
    if (code === EXIT_RESTART) {
      console.log('\n  🔄 Restarting jet-copilot...\n');
      run(forkFn);
    } else {
      process.exitCode = code || 0;
    }
  });
  return child;
}

if (require.main === module) {
  run();
}

module.exports = { run, EXIT_RESTART };
