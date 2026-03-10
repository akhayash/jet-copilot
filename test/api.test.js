const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const request = require('supertest');

const { createApp } = require('../server/index');
const { SessionManager } = require('../server/session-manager');

function createTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'jet-copilot-test-'));
}

test('session APIs create, list, and end sessions', async () => {
  const sessions = new SessionManager();
  const { app } = createApp({
    sessions,
    previews: { list: () => [], start: async () => ({}), stop: () => {} },
  });

  const createResponse = await request(app)
    .post('/api/sessions')
    .send({ cwd: 'C:\\repo' })
    .expect(200);

  assert.match(createResponse.body.id, /^[0-9a-f]{4}$/);

  const listResponse = await request(app).get('/api/sessions').expect(200);
  assert.equal(listResponse.body.length, 1);
  assert.equal(listResponse.body[0].cwd, 'C:\\repo');
  assert.equal(listResponse.body[0].status, 'active');
  assert.equal(listResponse.body[0].displayName, 'repo');

  const getResponse = await request(app)
    .get(`/api/sessions/${createResponse.body.id}`)
    .expect(200);
  assert.equal(getResponse.body.id, createResponse.body.id);
  assert.equal(getResponse.body.displayName, 'repo');

  await request(app).delete(`/api/sessions/${createResponse.body.id}`).expect(200);

  const ended = sessions.get(createResponse.body.id);
  assert.equal(ended.status, 'ended');
});

test('browse API filters hidden directories and node_modules', async () => {
  const root = createTempDir();
  fs.mkdirSync(path.join(root, 'visible'));
  fs.mkdirSync(path.join(root, '.hidden'));
  fs.mkdirSync(path.join(root, 'node_modules'));

  const { app } = createApp({
    sessions: new SessionManager(),
    previews: { list: () => [], start: async () => ({}), stop: () => {} },
  });

  try {
    const response = await request(app)
      .get('/api/browse')
      .query({ path: root })
      .expect(200);

    assert.deepEqual(response.body.directories, ['visible']);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('browse and mkdir reject system-critical paths', async () => {
  const { app } = createApp({
    sessions: new SessionManager(),
    previews: { list: () => [], start: async () => ({}), stop: () => {} },
  });

  // browse rejects system paths
  await request(app)
    .get('/api/browse')
    .query({ path: 'C:\\Windows\\System32' })
    .expect(403);

  // mkdir rejects system paths
  await request(app)
    .post('/api/mkdir')
    .send({ path: 'C:\\Windows\\System32\\evil' })
    .expect(403);
});

test('mkdir API creates a directory', async () => {
  const root = createTempDir();
  const target = path.join(root, 'nested', 'child');
  const { app } = createApp({
    sessions: new SessionManager(),
    previews: { list: () => [], start: async () => ({}), stop: () => {} },
  });

  try {
    const response = await request(app)
      .post('/api/mkdir')
      .send({ path: target })
      .expect(200);

    assert.equal(response.body.created, target);
    assert.equal(fs.existsSync(target), true);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('upload API stores image in session cwd', async () => {
  const root = createTempDir();
  const sessions = new SessionManager();
  const session = sessions.create(root);
  const { app } = createApp({
    sessions,
    previews: { list: () => [], start: async () => ({}), stop: () => {} },
  });

  try {
    const response = await request(app)
      .post('/api/upload')
      .field('session', session.id)
      .attach('image', Buffer.from('pngdata'), 'sample.png')
      .expect(200);

    assert.match(response.body.path, /\.png$/);
    assert.equal(fs.existsSync(response.body.path), true);
    assert.equal(
      fs.readFileSync(response.body.path, 'utf8'),
      'pngdata',
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('preview API validates port and returns preview URL', async () => {
  const previewCalls = [];
  const { app } = createApp({
    sessions: new SessionManager(),
    previews: {
      list: () => [],
      async start(port) {
        previewCalls.push(port);
        return { port, url: `https://preview-${port}.devtunnels.ms` };
      },
      stop: () => {},
    },
  });

  await request(app).post('/api/preview').send({ port: 0 }).expect(400);

  const response = await request(app)
    .post('/api/preview')
    .send({ port: 3001 })
    .expect(200);

  assert.deepEqual(previewCalls, [3001]);
  assert.equal(response.body.url, 'https://preview-3001.devtunnels.ms');
});

test('windows API returns window list from capture module', async () => {
  const mockWindows = [
    { id: 1, pid: 100, appName: 'chrome', title: 'Google Chrome', x: 0, y: 0, width: 1920, height: 1080, isMinimized: false, isFocused: true },
  ];
  const { app } = createApp({
    sessions: new SessionManager(),
    previews: { list: () => [], start: async () => ({}), stop: () => {} },
    capture: { listWindows: () => mockWindows, capture: async () => ({}), getCaptureDir: () => '' },
  });

  const response = await request(app).get('/api/windows').expect(200);
  assert.equal(response.body.length, 1);
  assert.equal(response.body[0].title, 'Google Chrome');
});

test('capture API returns capture result with url and path', async () => {
  const root = createTempDir();
  const captureFile = path.join(root, '1234567890.png');
  fs.writeFileSync(captureFile, 'png-data');

  const { app } = createApp({
    sessions: new SessionManager(),
    previews: { list: () => [], start: async () => ({}), stop: () => {} },
    capture: {
      listWindows: () => [],
      async capture(_windowId) {
        return { filename: '1234567890.png', path: captureFile, width: 800, height: 600 };
      },
      getCaptureDir: () => root,
    },
  });

  try {
    await request(app).post('/api/capture').send({}).expect(400);

    const response = await request(app)
      .post('/api/capture')
      .send({ windowId: 42 })
      .expect(200);

    assert.equal(response.body.filename, '1234567890.png');
    assert.equal(response.body.url, '/api/captures/1234567890.png');
    assert.equal(response.body.width, 800);
    assert.equal(response.body.height, 600);
    assert.ok(response.body.path);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('captures file endpoint serves PNG and rejects invalid filenames', async () => {
  const root = createTempDir();
  const pngData = Buffer.from('fake-png');
  fs.writeFileSync(path.join(root, '9999.png'), pngData);

  const { app } = createApp({
    sessions: new SessionManager(),
    previews: { list: () => [], start: async () => ({}), stop: () => {} },
    capture: {
      listWindows: () => [],
      capture: async () => ({}),
      getCaptureDir: () => root,
    },
  });

  try {
    // Non-numeric filenames are rejected
    await request(app).get('/api/captures/malicious.png').expect(400);
    // Numeric but non-existent file returns 404
    await request(app).get('/api/captures/99999.png').expect(404);
    // Valid file returns PNG
    const response = await request(app).get('/api/captures/9999.png').expect(200);
    assert.equal(response.headers['content-type'], 'image/png');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('version API returns version and updatable status', async () => {
  const root = createTempDir();
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ version: '1.2.3' }));
  fs.mkdirSync(path.join(root, '.git'));

  const { app } = createApp({
    sessions: new SessionManager(),
    previews: { list: () => [], start: async () => ({}), stop: () => {} },
    capture: { listWindows: () => [], capture: async () => ({}), getCaptureDir: () => '' },
    pkgRoot: root,
  });

  try {
    const response = await request(app).get('/api/version').expect(200);
    assert.equal(response.body.version, '1.2.3');
    assert.equal(response.body.updatable, true);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('update API rejects non-git installations', async () => {
  const root = createTempDir();
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ version: '1.0.0' }));

  const { app } = createApp({
    sessions: new SessionManager(),
    previews: { list: () => [], start: async () => ({}), stop: () => {} },
    capture: { listWindows: () => [], capture: async () => ({}), getCaptureDir: () => '' },
    pkgRoot: root,
  });

  try {
    const response = await request(app)
      .post('/api/update')
      .expect(400);
    assert.match(response.body.error, /git/i);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
