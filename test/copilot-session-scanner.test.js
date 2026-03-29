const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { scanCopilotSessions, getSessionHistory, cleanStaleLocks, adoptSession } = require('../server/copilot-session-scanner');

function createTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'jet-copilot-scan-'));
}

function writeSession(sessionDir, id, { cwd, gitRoot, branch, summary, repository } = {}, { eventsMtime, extraEvents = [] } = {}) {
  const dir = path.join(sessionDir, id);
  fs.mkdirSync(dir, { recursive: true });

  const context = {};
  if (cwd) context.cwd = cwd;
  if (gitRoot) context.gitRoot = gitRoot;
  if (branch) context.branch = branch;
  if (repository) context.repository = repository;

  const events = [
    JSON.stringify({ type: 'session.start', data: { sessionId: id, startTime: new Date().toISOString(), context } }),
    JSON.stringify({ type: 'session.context_changed', data: { cwd, gitRoot, branch, repository } }),
    JSON.stringify({ type: 'user.message', data: { content: 'hello' } }),
    JSON.stringify({ type: 'assistant.message', data: { content: 'hi' } }),
    ...extraEvents,
  ];
  if (summary) {
    events.push(JSON.stringify({ type: 'session.task_complete', data: { summary } }));
  }

  const eventsPath = path.join(dir, 'events.jsonl');
  fs.writeFileSync(eventsPath, events.join('\n'));
  if (eventsMtime) {
    fs.utimesSync(eventsPath, eventsMtime, eventsMtime);
  }
}

test('scanCopilotSessions finds sessions matching cwd', () => {
  const sessionDir = createTempDir();
  const cwd = 'C:\\Repos\\my-project';

  writeSession(sessionDir, 'aaa-111', {
    cwd, branch: 'main', summary: 'Fix bug',
  });

  writeSession(sessionDir, 'bbb-222', {
    cwd: 'C:\\Repos\\other-project', branch: 'dev', summary: 'Other work',
  });

  try {
    const results = scanCopilotSessions(cwd, { sessionDir });

    assert.equal(results.length, 1);
    assert.equal(results[0].copilotSessionId, 'aaa-111');
    assert.equal(results[0].branch, 'main');
    assert.equal(results[0].summary, 'Fix bug');
    assert.equal(results[0].folderName, 'my-project');
  } finally {
    fs.rmSync(sessionDir, { recursive: true, force: true });
  }
});

test('scanCopilotSessions matches on git_root', () => {
  const sessionDir = createTempDir();
  const cwd = 'C:\\Repos\\my-project';

  writeSession(sessionDir, 'ccc-333', {
    cwd: 'C:\\Repos\\my-project\\packages\\app',
    gitRoot: cwd,
    branch: 'feature',
    summary: 'Nested cwd',
  });

  try {
    const results = scanCopilotSessions(cwd, { sessionDir });

    assert.equal(results.length, 1);
    assert.equal(results[0].copilotSessionId, 'ccc-333');
    assert.equal(results[0].folderName, 'app');
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

  writeSession(sessionDir, 'old-one', {
    cwd, summary: 'Old',
  }, { eventsMtime: new Date('2026-03-01T10:00:00Z') });

  writeSession(sessionDir, 'new-one', {
    cwd, summary: 'New',
  }, { eventsMtime: new Date('2026-03-10T10:00:00Z') });

  try {
    const results = scanCopilotSessions(cwd, { sessionDir });

    assert.equal(results.length, 2);
    assert.equal(results[0].copilotSessionId, 'new-one');
    assert.equal(results[1].copilotSessionId, 'old-one');
  } finally {
    fs.rmSync(sessionDir, { recursive: true, force: true });
  }
});

test('scanCopilotSessions skips sessions without events.jsonl', () => {
  const sessionDir = createTempDir();
  const cwd = 'C:\\Repos\\project';

  writeSession(sessionDir, 'good-one', { cwd, summary: 'Good' });

  // Empty dir without events.jsonl
  fs.mkdirSync(path.join(sessionDir, 'bad-one'));

  try {
    const results = scanCopilotSessions(cwd, { sessionDir });

    assert.equal(results.length, 1);
    assert.equal(results[0].copilotSessionId, 'good-one');
  } finally {
    fs.rmSync(sessionDir, { recursive: true, force: true });
  }
});

test('scanCopilotSessions returns all sessions when cwd is omitted', () => {
  const sessionDir = createTempDir();

  writeSession(sessionDir, 'video-odd', {
    cwd: 'C:\\Repos\\video-odd', summary: 'Video odd session',
  }, { eventsMtime: new Date('2026-03-12T20:44:45Z') });

  writeSession(sessionDir, 'jet-copilot', {
    cwd: 'C:\\Repos\\jet-copilot', summary: 'Jet session',
  }, { eventsMtime: new Date('2026-03-12T20:00:00Z') });

  try {
    const results = scanCopilotSessions(undefined, { sessionDir });

    assert.equal(results.length, 2);
    assert.equal(results[0].copilotSessionId, 'video-odd');
    assert.equal(results[1].copilotSessionId, 'jet-copilot');
  } finally {
    fs.rmSync(sessionDir, { recursive: true, force: true });
  }
});

test('scanCopilotSessions skips ghost sessions without events.jsonl', () => {
  const sessionDir = createTempDir();
  const cwd = 'C:\\Repos\\project';

  writeSession(sessionDir, 'real-session', { cwd, summary: 'Real work' });

  // Ghost session: dir exists but no events.jsonl
  const ghostDir = path.join(sessionDir, 'ghost-session');
  fs.mkdirSync(ghostDir, { recursive: true });

  try {
    const results = scanCopilotSessions(cwd, { sessionDir });

    assert.equal(results.length, 1);
    assert.equal(results[0].copilotSessionId, 'real-session');
  } finally {
    fs.rmSync(sessionDir, { recursive: true, force: true });
  }
});

test('scanCopilotSessions extracts metadata from session.resume events', () => {
  const sessionDir = createTempDir();
  const id = 'resumed-session';
  const dir = path.join(sessionDir, id);
  fs.mkdirSync(dir, { recursive: true });

  const events = [
    JSON.stringify({ type: 'session.resume', data: { resumeTime: '2026-03-27T10:00:00Z', context: { cwd: 'C:\\Repos\\my-project', gitRoot: 'C:\\Repos\\my-project', branch: 'main', repository: 'user/my-project' } } }),
    JSON.stringify({ type: 'user.message', data: { content: 'hello' } }),
    JSON.stringify({ type: 'assistant.message', data: { content: 'hi' } }),
  ];
  fs.writeFileSync(path.join(dir, 'events.jsonl'), events.join('\n'));

  try {
    const results = scanCopilotSessions('C:\\Repos\\my-project', { sessionDir });

    assert.equal(results.length, 1);
    assert.equal(results[0].copilotSessionId, id);
    assert.equal(results[0].cwd, 'C:\\Repos\\my-project');
    assert.equal(results[0].branch, 'main');
    assert.equal(results[0].createdAt, '2026-03-27T10:00:00Z');
  } finally {
    fs.rmSync(sessionDir, { recursive: true, force: true });
  }
});

test('scanCopilotSessions extracts cwd from hook.start as fallback', () => {
  const sessionDir = createTempDir();
  const id = 'hook-only-session';
  const dir = path.join(sessionDir, id);
  fs.mkdirSync(dir, { recursive: true });

  const events = [
    JSON.stringify({ type: 'hook.start', data: { hookInvocationId: 'abc', hookType: 'postToolUse', input: { sessionId: id, cwd: 'C:\\Repos\\video-odd' } } }),
    JSON.stringify({ type: 'user.message', data: { content: 'hello' } }),
    JSON.stringify({ type: 'assistant.message', data: { content: 'hi' } }),
    JSON.stringify({ type: 'session.task_complete', data: { summary: 'Done' } }),
  ];
  fs.writeFileSync(path.join(dir, 'events.jsonl'), events.join('\n'));

  try {
    const results = scanCopilotSessions('C:\\Repos\\video-odd', { sessionDir });

    assert.equal(results.length, 1);
    assert.equal(results[0].cwd, 'C:\\Repos\\video-odd');
    assert.equal(results[0].summary, 'Done');
    assert.equal(results[0].folderName, 'video-odd');
  } finally {
    fs.rmSync(sessionDir, { recursive: true, force: true });
  }
});

test('scanCopilotSessions includes messageCount', () => {
  const sessionDir = createTempDir();

  writeSession(sessionDir, 'multi-msg', {
    cwd: 'C:\\Repos\\test',
  }, {
    extraEvents: [
      JSON.stringify({ type: 'user.message', data: { content: 'q2' } }),
      JSON.stringify({ type: 'user.message', data: { content: 'q3' } }),
    ],
  });

  try {
    const results = scanCopilotSessions(undefined, { sessionDir });

    assert.equal(results.length, 1);
    assert.equal(results[0].messageCount, 3);
  } finally {
    fs.rmSync(sessionDir, { recursive: true, force: true });
  }
});

// --- getSessionHistory ---

test('getSessionHistory returns user and assistant messages', () => {
  const sessionDir = createTempDir();
  const id = 'history-test';
  const dir = path.join(sessionDir, id);
  fs.mkdirSync(dir, { recursive: true });

  const events = [
    JSON.stringify({ type: 'session.start', data: { sessionId: id } }),
    JSON.stringify({ type: 'user.message', data: { content: 'Hello' } }),
    JSON.stringify({ type: 'tool.execution_start', data: { tool: 'grep' } }),
    JSON.stringify({ type: 'assistant.message', data: { content: 'Hi there!' } }),
    JSON.stringify({ type: 'user.message', data: { content: 'What is 2+2?' } }),
    JSON.stringify({ type: 'assistant.message', data: { content: '4' } }),
  ].join('\n');
  fs.writeFileSync(path.join(dir, 'events.jsonl'), events);

  try {
    const history = getSessionHistory(id, { sessionDir });

    assert.equal(history.length, 4);
    assert.deepEqual(history[0], { role: 'user', content: 'Hello' });
    assert.deepEqual(history[1], { role: 'assistant', content: 'Hi there!' });
    assert.deepEqual(history[2], { role: 'user', content: 'What is 2+2?' });
    assert.deepEqual(history[3], { role: 'assistant', content: '4' });
  } finally {
    fs.rmSync(sessionDir, { recursive: true, force: true });
  }
});

test('getSessionHistory respects maxTurns limit', () => {
  const sessionDir = createTempDir();
  const id = 'limit-test';
  const dir = path.join(sessionDir, id);
  fs.mkdirSync(dir, { recursive: true });

  const events = [];
  for (let i = 0; i < 20; i++) {
    events.push(JSON.stringify({ type: 'user.message', data: { content: `Q${i}` } }));
    events.push(JSON.stringify({ type: 'assistant.message', data: { content: `A${i}` } }));
  }
  fs.writeFileSync(path.join(dir, 'events.jsonl'), events.join('\n'));

  try {
    const history = getSessionHistory(id, { sessionDir, maxTurns: 4 });

    assert.equal(history.length, 4);
    assert.equal(history[0].content, 'Q18');
    assert.equal(history[3].content, 'A19');
  } finally {
    fs.rmSync(sessionDir, { recursive: true, force: true });
  }
});

test('getSessionHistory returns empty array for missing session', () => {
  const sessionDir = createTempDir();
  try {
    const history = getSessionHistory('nonexistent', { sessionDir });
    assert.deepEqual(history, []);
  } finally {
    fs.rmSync(sessionDir, { recursive: true, force: true });
  }
});

// --- cleanStaleLocks ---

test('cleanStaleLocks removes lock files for dead PIDs', () => {
  const sessionDir = createTempDir();
  const id = 'lock-test';
  const dir = path.join(sessionDir, id);
  fs.mkdirSync(dir, { recursive: true });

  // Create a lock file with a PID that doesn't exist
  fs.writeFileSync(path.join(dir, 'inuse.999999.lock'), '999999');
  fs.writeFileSync(path.join(dir, 'events.jsonl'), '{}');

  try {
    const removed = cleanStaleLocks(id, { sessionDir });

    assert.equal(removed, 1);
    assert.equal(fs.existsSync(path.join(dir, 'inuse.999999.lock')), false);
    assert.equal(fs.existsSync(path.join(dir, 'events.jsonl')), true);
  } finally {
    fs.rmSync(sessionDir, { recursive: true, force: true });
  }
});

test('cleanStaleLocks keeps lock files for live PIDs', () => {
  const sessionDir = createTempDir();
  const id = 'live-lock-test';
  const dir = path.join(sessionDir, id);
  fs.mkdirSync(dir, { recursive: true });

  const livePid = process.pid;
  fs.writeFileSync(path.join(dir, `inuse.${livePid}.lock`), String(livePid));

  try {
    const removed = cleanStaleLocks(id, { sessionDir });

    assert.equal(removed, 0);
    assert.equal(fs.existsSync(path.join(dir, `inuse.${livePid}.lock`)), true);
  } finally {
    fs.rmSync(sessionDir, { recursive: true, force: true });
  }
});

test('cleanStaleLocks returns 0 for non-existent session', () => {
  const sessionDir = createTempDir();
  try {
    const removed = cleanStaleLocks('nonexistent', { sessionDir });
    assert.equal(removed, 0);
  } finally {
    fs.rmSync(sessionDir, { recursive: true, force: true });
  }
});

// --- adoptSession ---

test('adoptSession prepends session.start to events.jsonl', () => {
  const sessionDir = createTempDir();
  const id = 'adopt-test-1111-2222-3333-444444444444';
  const dir = path.join(sessionDir, id);
  fs.mkdirSync(dir, { recursive: true });

  const events = [
    JSON.stringify({ type: 'hook.start', data: { input: { cwd: 'C:\\Repos\\test' } }, id: 'evt-1', timestamp: '2026-03-27T10:00:00Z' }),
    JSON.stringify({ type: 'user.message', data: { content: 'hello' }, id: 'evt-2', timestamp: '2026-03-27T10:01:00Z' }),
    JSON.stringify({ type: 'session.context_changed', data: { cwd: 'C:\\Repos\\test', gitRoot: 'C:\\Repos\\test', branch: 'main', repository: 'user/test' }, id: 'evt-3', timestamp: '2026-03-27T10:02:00Z' }),
  ];
  fs.writeFileSync(path.join(dir, 'events.jsonl'), events.join('\n'));

  try {
    const result = adoptSession(id, { sessionDir });

    assert.equal(result.adopted, true);
    assert.ok(fs.existsSync(path.join(dir, 'events.jsonl.bak')));

    const newContent = fs.readFileSync(path.join(dir, 'events.jsonl'), 'utf-8');
    const firstLine = JSON.parse(newContent.split('\n')[0]);
    assert.equal(firstLine.type, 'session.start');
    assert.equal(firstLine.data.sessionId, id);
    assert.equal(firstLine.data.version, 1);
    assert.equal(firstLine.data.producer, 'copilot-agent');
    assert.equal(firstLine.data.context.cwd, 'C:\\Repos\\test');
    assert.equal(firstLine.data.context.branch, 'main');
  } finally {
    fs.rmSync(sessionDir, { recursive: true, force: true });
  }
});

test('adoptSession returns alreadyAdopted for sessions with session.start', () => {
  const sessionDir = createTempDir();
  const id = 'already-ok-1111-2222-3333-444444444444';
  const dir = path.join(sessionDir, id);
  fs.mkdirSync(dir, { recursive: true });

  const events = [
    JSON.stringify({ type: 'session.start', data: { sessionId: id, version: 1, producer: 'copilot-agent', copilotVersion: '1.0.11', startTime: '2026-03-27T10:00:00Z' } }),
    JSON.stringify({ type: 'user.message', data: { content: 'hello' } }),
  ];
  fs.writeFileSync(path.join(dir, 'events.jsonl'), events.join('\n'));

  try {
    const result = adoptSession(id, { sessionDir });

    assert.equal(result.alreadyAdopted, true);
    assert.equal(fs.existsSync(path.join(dir, 'events.jsonl.bak')), false);
  } finally {
    fs.rmSync(sessionDir, { recursive: true, force: true });
  }
});

test('adoptSession throws for non-existent session', () => {
  const sessionDir = createTempDir();
  try {
    assert.throws(() => adoptSession('nonexistent', { sessionDir }), { message: 'Session not found' });
  } finally {
    fs.rmSync(sessionDir, { recursive: true, force: true });
  }
});
