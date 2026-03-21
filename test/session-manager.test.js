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

test('SessionManager.appendOutput stores output and getOutputBuffer retrieves it', () => {
  const manager = new SessionManager();
  const session = manager.create();

  manager.appendOutput(session.id, 'hello ');
  manager.appendOutput(session.id, 'world');

  assert.equal(manager.getOutputBuffer(session.id), 'hello world');
});

test('SessionManager.appendOutput truncates buffer exceeding 300KB', () => {
  const manager = new SessionManager();
  const session = manager.create();

  const chunk = 'x'.repeat(200 * 1024);
  manager.appendOutput(session.id, chunk);
  manager.appendOutput(session.id, chunk);

  const buf = manager.getOutputBuffer(session.id);
  assert.equal(buf.length, 300 * 1024);
  assert.equal(buf, (chunk + chunk).slice(-(300 * 1024)));
});

test('SessionManager.getOutputBuffer returns empty string for unknown session', () => {
  const manager = new SessionManager();
  assert.equal(manager.getOutputBuffer('nonexistent'), '');
});

test('SessionManager.appendOutput is no-op for unknown session', () => {
  const manager = new SessionManager();
  manager.appendOutput('nonexistent', 'data');
  assert.equal(manager.getOutputBuffer('nonexistent'), '');
});

test('SessionManager.getOutputBuffer strips alt screen regions', () => {
  const manager = new SessionManager();
  const session = manager.create();

  manager.appendOutput(session.id, 'before\x1b[?1049hTUI content\x1b[?1049lafter');

  assert.equal(manager.getOutputBuffer(session.id), 'beforeafter');
});

test('SessionManager.getOutputBuffer strips trailing alt screen content', () => {
  const manager = new SessionManager();
  const session = manager.create();

  manager.appendOutput(session.id, 'normal output\x1b[?1049hstill in alt screen');

  assert.equal(manager.getOutputBuffer(session.id), 'normal output');
});

test('SessionManager.getOutputBuffer strips orphaned exit at buffer start', () => {
  const manager = new SessionManager();
  const session = manager.create();

  // Simulates truncation cutting off the ENTER sequence
  manager.appendOutput(session.id, 'alt garbage\x1b[?1049lnormal content');

  assert.equal(manager.getOutputBuffer(session.id), 'normal content');
});

test('SessionManager.getOutputBuffer strips multiple alt screen regions', () => {
  const manager = new SessionManager();
  const session = manager.create();

  manager.appendOutput(session.id, 'A\x1b[?1049hB\x1b[?1049lC\x1b[?1049hD\x1b[?1049lE');

  assert.equal(manager.getOutputBuffer(session.id), 'ACE');
});
