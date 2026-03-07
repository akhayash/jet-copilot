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
  const serverPath = require.resolve('../server/index.js');
  const binPath = require.resolve('../bin/jet-copilot.js');
  const originalServerModule = require.cache[serverPath];
  const originalBinModule = require.cache[binPath];
  let launched = false;

  require.cache[serverPath] = {
    id: serverPath,
    filename: serverPath,
    loaded: true,
    exports: {
      runCli: async () => {
        launched = true;
      },
    },
  };

  delete require.cache[binPath];

  try {
    require(binPath);
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(launched, true);
  } finally {
    delete require.cache[binPath];
    if (originalBinModule) {
      require.cache[binPath] = originalBinModule;
    }

    if (originalServerModule) {
      require.cache[serverPath] = originalServerModule;
    } else {
      delete require.cache[serverPath];
    }
  }
});
