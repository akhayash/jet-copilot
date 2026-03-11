const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { SessionManager } = require('../server/session-manager');
const { getSessionContext } = require('../server/session-context');

function createTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'jet-copilot-test-'));
}

test('SessionManager.create sets id, cwd, and active status', () => {
  const manager = new SessionManager();
  const session = manager.create('C:\\work\\repo');

  assert.match(session.id, /^[0-9a-f]{4}$/);
  assert.equal(session.cwd, 'C:\\work\\repo');
  assert.equal(session.status, 'active');
  assert.equal(session.endedAt, null);
  assert.ok(session.startedAt);
  assert.equal(session.displayName, 'repo');
  assert.ok(session.copilotSessionId);
  assert.match(session.copilotSessionId, /^[0-9a-f-]{36}$/);
});

test('SessionManager.create accepts custom copilotSessionId', () => {
  const manager = new SessionManager();
  const session = manager.create('C:\\work\\repo', { copilotSessionId: 'custom-uuid' });

  assert.equal(session.copilotSessionId, 'custom-uuid');
});

test('SessionManager.list includes connected client count', () => {
  const manager = new SessionManager();
  const session = manager.create();
  const client = {};

  manager.addClient(session.id, client);

  const listed = manager.list();
  assert.equal(listed.length, 1);
  assert.equal(listed[0].clientCount, 1);
});

test('SessionManager.end marks ended and cleans up runner', () => {
  const manager = new SessionManager();
  const session = manager.create();
  let cleanedUp = false;

  session.runner = {
    cleanup() {
      cleanedUp = true;
    },
  };

  manager.end(session.id);

  assert.equal(cleanedUp, true);
  assert.equal(session.status, 'ended');
  assert.ok(session.endedAt);
  assert.equal(session.runner, null);
});

test('SessionManager.create uses repo root name when cwd is inside a git repo', () => {
  const root = createTempDir();
  const nested = path.join(root, 'packages', 'app');
  fs.mkdirSync(path.join(root, '.git'));
  fs.mkdirSync(nested, { recursive: true });

  try {
    const manager = new SessionManager();
    const session = manager.create(nested);

    assert.equal(session.inRepo, true);
    assert.equal(session.repoRoot, root);
    assert.equal(session.repoName, path.basename(root));
    assert.equal(session.displayName, path.basename(root));
    assert.equal(session.folderName, 'app');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('getSessionContext falls back to the folder name outside a git repo', () => {
  const context = getSessionContext('C:\\workspace\\plain-folder', {
    fsModule: {
      existsSync: () => false,
    },
    pathModule: path.win32,
  });

  assert.equal(context.inRepo, false);
  assert.equal(context.repoRoot, null);
  assert.equal(context.repoName, null);
  assert.equal(context.displayName, 'plain-folder');
  assert.equal(context.folderName, 'plain-folder');
});
