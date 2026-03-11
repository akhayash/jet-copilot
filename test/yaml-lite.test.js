const test = require('node:test');
const assert = require('node:assert/strict');

const { parse } = require('../server/yaml-lite');

test('yaml-lite parses simple key-value pairs', () => {
  const input = `id: abc-123
cwd: C:\\Repos\\project
branch: main
summary: Fix the bug`;

  const result = parse(input);

  assert.equal(result.id, 'abc-123');
  assert.equal(result.cwd, 'C:\\Repos\\project');
  assert.equal(result.branch, 'main');
  assert.equal(result.summary, 'Fix the bug');
});

test('yaml-lite handles null, boolean, and integer values', () => {
  const input = `empty:
nullable: null
tilde: ~
flag_true: true
flag_false: false
count: 42
negative: -1`;

  const result = parse(input);

  assert.equal(result.empty, null);
  assert.equal(result.nullable, null);
  assert.equal(result.tilde, null);
  assert.equal(result.flag_true, true);
  assert.equal(result.flag_false, false);
  assert.equal(result.count, 42);
  assert.equal(result.negative, -1);
});

test('yaml-lite skips comments and blank lines', () => {
  const input = `# comment
key: value

# another comment
key2: value2`;

  const result = parse(input);

  assert.equal(Object.keys(result).length, 2);
  assert.equal(result.key, 'value');
  assert.equal(result.key2, 'value2');
});

test('yaml-lite handles colons in values', () => {
  const input = `url: https://example.com:3000/path
time: 2026-03-10T22:23:48.157Z`;

  const result = parse(input);

  assert.equal(result.url, 'https://example.com:3000/path');
  assert.equal(result.time, '2026-03-10T22:23:48.157Z');
});
