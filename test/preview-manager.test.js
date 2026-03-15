const test = require('node:test');
const assert = require('node:assert/strict');

const { PreviewManager } = require('../server/preview-manager');

test('PreviewManager.start adds port to tunnel and builds URL', async () => {
  const addedPorts = [];
  const manager = new PreviewManager({
    execFileSyncFn: () => '',
    getTunnelUrlFn: () => 'https://abc-4117.jpe1.devtunnels.ms',
    getTunnelIdFn: () => 'my-tunnel',
    addPortFn: (_id, port) => { addedPorts.push(port); },
    removePortFn: () => {},
  });

  const preview = await manager.start(3001);

  assert.equal(preview.port, 3001);
  assert.equal(preview.url, 'https://abc-3001.jpe1.devtunnels.ms');
  assert.deepEqual(addedPorts, [3001]);
  assert.deepEqual(manager.list(), [{ port: 3001, url: 'https://abc-3001.jpe1.devtunnels.ms' }]);
});

test('PreviewManager.start reuses existing preview', async () => {
  let addCount = 0;
  const manager = new PreviewManager({
    execFileSyncFn: () => '',
    getTunnelUrlFn: () => 'https://abc-4117.jpe1.devtunnels.ms',
    getTunnelIdFn: () => 'my-tunnel',
    addPortFn: () => { addCount++; },
    removePortFn: () => {},
  });

  const a = await manager.start(3001);
  const b = await manager.start(3001);

  assert.equal(a, b);
  assert.equal(addCount, 1);
});

test('PreviewManager.stop removes port from tunnel', async () => {
  const removedPorts = [];
  const manager = new PreviewManager({
    execFileSyncFn: () => '',
    getTunnelUrlFn: () => 'https://abc-4117.jpe1.devtunnels.ms',
    getTunnelIdFn: () => 'my-tunnel',
    addPortFn: () => {},
    removePortFn: (_id, port) => { removedPorts.push(port); },
  });

  await manager.start(3002);
  manager.stop(3002);

  assert.deepEqual(removedPorts, [3002]);
  assert.deepEqual(manager.list(), []);
});

test('PreviewManager.start throws when no tunnel is active', async () => {
  const manager = new PreviewManager({
    execFileSyncFn: () => '',
    getTunnelUrlFn: () => null,
    getTunnelIdFn: () => null,
    addPortFn: () => {},
    removePortFn: () => {},
  });

  await assert.rejects(
    () => manager.start(3001),
    { message: 'No active tunnel. Set DEVTUNNEL_ID to enable previews.' }
  );
});
