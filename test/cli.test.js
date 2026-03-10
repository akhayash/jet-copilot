const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { getEnvPaths, loadEnv } = require('../server/load-env');

function createTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'jet-copilot-test-'));
}

test('getEnvPaths prefers the launch directory before the package root', () => {
  const cwd = 'C:\\workspace\\app';
  const packageRoot = 'C:\\Users\\user\\AppData\\Local\\npm-cache\\_npx\\jet-copilot';

  assert.deepEqual(getEnvPaths({ cwd, packageRoot }), [
    'C:\\workspace\\app\\.env',
    'C:\\Users\\user\\AppData\\Local\\npm-cache\\_npx\\jet-copilot\\.env',
  ]);
});

test('loadEnv reads .env from the launch directory before the package root', () => {
  const cwd = createTempDir();
  const packageRoot = createTempDir();
  const processEnv = {};

  fs.writeFileSync(path.join(cwd, '.env'), 'PORT=4321\nSOURCE=launch\n');
  fs.writeFileSync(path.join(packageRoot, '.env'), 'PORT=3000\nFALLBACK=package\n');

  try {
    loadEnv({ cwd, packageRoot, processEnv });

    assert.equal(processEnv.PORT, '4321');
    assert.equal(processEnv.SOURCE, 'launch');
    assert.equal(processEnv.FALLBACK, 'package');
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
    fs.rmSync(packageRoot, { recursive: true, force: true });
  }
});

test('bin entrypoint launches the CLI runner', async () => {
  const { EventEmitter } = require('node:events');
  const { run, EXIT_RESTART } = require('../bin/jet-copilot.js');

  let forkCount = 0;
  const fakeChild = new EventEmitter();
  const forkFn = () => { forkCount++; return fakeChild; };

  run(forkFn);
  assert.equal(forkCount, 1);

  // Simulate normal exit — should not restart
  fakeChild.emit('exit', 0);
  assert.equal(forkCount, 1);
});

test('bin restarts on EXIT_RESTART code', async () => {
  const { EventEmitter } = require('node:events');
  const { run, EXIT_RESTART } = require('../bin/jet-copilot.js');

  let forkCount = 0;
  const children = [];
  const forkFn = () => {
    forkCount++;
    const child = new EventEmitter();
    children.push(child);
    return child;
  };

  run(forkFn);
  assert.equal(forkCount, 1);

  // Simulate restart exit code — should fork again
  children[0].emit('exit', EXIT_RESTART);
  assert.equal(forkCount, 2);
});
