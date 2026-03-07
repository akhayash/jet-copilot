const test = require('node:test');
const assert = require('node:assert/strict');

const { SessionManager } = require('../server/session-manager');

test('SessionManager.create sets id, cwd, and active status', () => {
  const manager = new SessionManager();
  const session = manager.create('C:\\work\\repo');

  assert.match(session.id, /^[0-9a-f]{4}$/);
  assert.equal(session.cwd, 'C:\\work\\repo');
  assert.equal(session.status, 'active');
  assert.equal(session.endedAt, null);
  assert.ok(session.startedAt);
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
