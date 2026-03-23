const test = require('node:test');
const assert = require('node:assert/strict');

const { getShortcutContent, escapeHtml, stopPreviewByPort } = require('../public/app-utils');

test('getShortcutContent maps special shortcut keys', () => {
  assert.equal(getShortcutContent('esc'), '\x1b');
  assert.equal(getShortcutContent('mode'), '\x1b[Z');
  assert.equal(getShortcutContent('up'), '\x1b[A');
  assert.equal(getShortcutContent('down'), '\x1b[B');
  assert.equal(getShortcutContent('enter'), '\r');
  assert.equal(getShortcutContent('enqueue'), '\x11');
});

test('getShortcutContent returns plain text keys unchanged', () => {
  assert.equal(getShortcutContent('hello'), 'hello');
});

test('escapeHtml escapes dangerous characters', () => {
  assert.equal(escapeHtml('<script>alert("xss")</script>'), '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;');
  assert.equal(escapeHtml('a&b'), 'a&amp;b');
  assert.equal(escapeHtml('normal text'), 'normal text');
});

test('stopPreviewByPort is exported as a function', () => {
  assert.equal(typeof stopPreviewByPort, 'function');
});
