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
