const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');

const { PreviewManager } = require('../server/preview-manager');

function createFakeProc() {
  const proc = new EventEmitter();
  proc.stdout = new EventEmitter();
  proc.stderr = new EventEmitter();
  proc.killCalled = false;
  proc.kill = () => {
    proc.killCalled = true;
    proc.emit('close');
  };
  return proc;
}

test('PreviewManager.start extracts tunnel URL and reuses existing preview', async () => {
  let spawnCount = 0;
  const proc = createFakeProc();
  const manager = new PreviewManager({
    spawnFn() {
      spawnCount += 1;
      process.nextTick(() => {
        proc.stdout.emit('data', 'Tunnel: https://abc.devtunnels.ms');
      });
      return proc;
    },
    setIntervalFn: (cb) => setInterval(cb, 1),
    clearIntervalFn: clearInterval,
    setTimeoutFn: (cb, ms) => setTimeout(cb, Math.min(ms, 20)),
    clearTimeoutFn: clearTimeout,
  });

  const previewA = await manager.start(3001);
  const previewB = await manager.start(3001);

  assert.equal(spawnCount, 1);
  assert.equal(previewA, previewB);
  assert.equal(previewA.url, 'https://abc.devtunnels.ms');
  assert.deepEqual(manager.list(), [{ port: 3001, url: 'https://abc.devtunnels.ms' }]);
});

test('PreviewManager.stop kills process and removes preview', async () => {
  const proc = createFakeProc();
  const manager = new PreviewManager({
    spawnFn() {
      process.nextTick(() => {
        proc.stdout.emit('data', 'Tunnel: https://xyz.devtunnels.ms');
      });
      return proc;
    },
    setIntervalFn: (cb) => setInterval(cb, 1),
    clearIntervalFn: clearInterval,
    setTimeoutFn: (cb, ms) => setTimeout(cb, Math.min(ms, 20)),
    clearTimeoutFn: clearTimeout,
  });

  await manager.start(3002);
  manager.stop(3002);

  assert.equal(proc.killCalled, true);
  assert.deepEqual(manager.list(), []);
});
