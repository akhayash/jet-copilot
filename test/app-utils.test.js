const test = require('node:test');
const assert = require('node:assert/strict');

const { getShortcutContent } = require('../public/app-utils');

test('getShortcutContent maps special shortcut keys', () => {
  assert.equal(getShortcutContent('esc'), '\x1b');
  assert.equal(getShortcutContent('mode'), '\x1b[Z');
  assert.equal(getShortcutContent('up'), '\x1b[A');
  assert.equal(getShortcutContent('down'), '\x1b[B');
  assert.equal(getShortcutContent('enter'), '\r');
});

test('getShortcutContent returns plain text keys unchanged', () => {
  assert.equal(getShortcutContent('hello'), 'hello');
});
