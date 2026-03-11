const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { scanCopilotSessions } = require('../server/copilot-session-scanner');

function createTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'jet-copilot-scan-'));
}

function writeWorkspaceYaml(sessionDir, id, data) {
  const dir = path.join(sessionDir, id);
  fs.mkdirSync(dir, { recursive: true });
  const lines = Object.entries(data)
    .map(([k, v]) => `${k}: ${v === null ? '' : v}`)
    .join('\n');
  fs.writeFileSync(path.join(dir, 'workspace.yaml'), lines);
}

test('scanCopilotSessions finds sessions matching cwd', () => {
  const sessionDir = createTempDir();
  const cwd = 'C:\\Repos\\my-project';

  writeWorkspaceYaml(sessionDir, 'aaa-111', {
    id: 'aaa-111',
    cwd: cwd,
    branch: 'main',
    summary: 'Fix bug',
    created_at: '2026-03-10T10:00:00Z',
    updated_at: '2026-03-10T11:00:00Z',
  });

  writeWorkspaceYaml(sessionDir, 'bbb-222', {
    id: 'bbb-222',
    cwd: 'C:\\Repos\\other-project',
    branch: 'dev',
    summary: 'Other work',
    created_at: '2026-03-10T12:00:00Z',
  });

  try {
    const results = scanCopilotSessions(cwd, { sessionDir });

    assert.equal(results.length, 1);
    assert.equal(results[0].copilotSessionId, 'aaa-111');
    assert.equal(results[0].branch, 'main');
    assert.equal(results[0].summary, 'Fix bug');
  } finally {
    fs.rmSync(sessionDir, { recursive: true, force: true });
  }
});

test('scanCopilotSessions matches on git_root', () => {
  const sessionDir = createTempDir();
  const cwd = 'C:\\Repos\\my-project';

  writeWorkspaceYaml(sessionDir, 'ccc-333', {
    id: 'ccc-333',
    cwd: 'C:\\Repos\\my-project\\packages\\app',
    git_root: cwd,
    branch: 'feature',
    summary: 'Nested cwd',
    created_at: '2026-03-10T10:00:00Z',
  });

  try {
    const results = scanCopilotSessions(cwd, { sessionDir });

    assert.equal(results.length, 1);
    assert.equal(results[0].copilotSessionId, 'ccc-333');
  } finally {
    fs.rmSync(sessionDir, { recursive: true, force: true });
  }
});

test('scanCopilotSessions returns empty for non-existent dir', () => {
  const results = scanCopilotSessions('C:\\Repos\\project', {
    sessionDir: path.join(os.tmpdir(), 'non-existent-dir-xyz'),
  });

  assert.deepEqual(results, []);
});

test('scanCopilotSessions sorts by most recent first', () => {
  const sessionDir = createTempDir();
  const cwd = 'C:\\Repos\\project';

  writeWorkspaceYaml(sessionDir, 'old-one', {
    id: 'old-one',
    cwd: cwd,
    summary: 'Old',
    created_at: '2026-03-01T10:00:00Z',
    updated_at: '2026-03-01T10:00:00Z',
  });

  writeWorkspaceYaml(sessionDir, 'new-one', {
    id: 'new-one',
    cwd: cwd,
    summary: 'New',
    created_at: '2026-03-10T10:00:00Z',
    updated_at: '2026-03-10T10:00:00Z',
  });

  try {
    const results = scanCopilotSessions(cwd, { sessionDir });

    assert.equal(results.length, 2);
    assert.equal(results[0].copilotSessionId, 'new-one');
    assert.equal(results[1].copilotSessionId, 'old-one');
  } finally {
    fs.rmSync(sessionDir, { recursive: true, force: true });
  }
});

test('scanCopilotSessions skips sessions without workspace.yaml', () => {
  const sessionDir = createTempDir();
  const cwd = 'C:\\Repos\\project';

  // Session with workspace.yaml
  writeWorkspaceYaml(sessionDir, 'good-one', {
    id: 'good-one',
    cwd: cwd,
    summary: 'Good',
    created_at: '2026-03-10T10:00:00Z',
  });

  // Session without workspace.yaml
  fs.mkdirSync(path.join(sessionDir, 'bad-one'));

  try {
    const results = scanCopilotSessions(cwd, { sessionDir });

    assert.equal(results.length, 1);
    assert.equal(results[0].copilotSessionId, 'good-one');
  } finally {
    fs.rmSync(sessionDir, { recursive: true, force: true });
  }
});
