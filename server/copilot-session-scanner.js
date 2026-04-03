const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');
const { getSessionContext, resolveFolderName } = require('./session-context');

const DEFAULT_SESSION_DIR = path.join(os.homedir(), '.copilot', 'session-state');

let _cachedCopilotVersion = null;

function detectCopilotVersion({ execSyncFn = execSync } = {}) {
  if (_cachedCopilotVersion) return _cachedCopilotVersion;
  try {
    const output = execSyncFn('copilot --version', { encoding: 'utf-8', timeout: 5000 });
    const match = output.match(/(\d+\.\d+\.\d+)/);
    if (match) {
      _cachedCopilotVersion = match[1];
      return _cachedCopilotVersion;
    }
  } catch {
    // Fall through
  }
  return 'unknown';
}

function resetCachedVersion() {
  _cachedCopilotVersion = null;
}

// Extract session metadata from events.jsonl (the sole data source)
function extractSessionMeta(eventsContent) {
  let cwd = null;
  let gitRoot = null;
  let repository = null;
  let branch = null;
  let summary = null;
  let createdAt = null;
  let contextFound = false;
  let hasSessionEvent = false;

  // Fast message count via string matching (avoids JSON.parse per line)
  const messageCount = (eventsContent.match(/"user\.message"/g) || []).length;

  // Only parse lines that contain relevant event types
  let hookCwd = null;

  for (const line of eventsContent.split('\n')) {
    if (!line.trim()) continue;

    // Skip lines that can't contain metadata events
    if (!line.includes('"session.start"') &&
        !line.includes('"session.resume"') &&
        !line.includes('"session.context_changed"') &&
        !line.includes('"session.task_complete"') &&
        !line.includes('"hook.start"')) continue;

    try {
      const event = JSON.parse(line);
      const d = event.data;

      if (event.type === 'session.start' || event.type === 'session.resume') {
        hasSessionEvent = true;
        createdAt = createdAt || d?.startTime || d?.resumeTime;
        const ctx = d?.context;
        if (ctx) {
          cwd = cwd || ctx.cwd || null;
          gitRoot = gitRoot || ctx.gitRoot || null;
          repository = repository || ctx.repository || null;
          branch = branch || ctx.branch || null;
          contextFound = true;
        }
      } else if (event.type === 'session.context_changed' && !contextFound) {
        cwd = d?.cwd || cwd;
        gitRoot = d?.gitRoot || gitRoot;
        repository = d?.repository || repository;
        branch = d?.branch || branch;
        if (cwd) contextFound = true;
      } else if (event.type === 'session.task_complete' && !summary) {
        summary = d?.summary || null;
      } else if (event.type === 'hook.start' && !hookCwd) {
        hookCwd = d?.input?.cwd || null;
      }
    } catch {
      // Skip malformed lines
    }

    // Stop early if we have everything
    if (contextFound && summary) break;
  }

  if (!cwd) cwd = hookCwd;

  return { cwd, gitRoot, repository, branch, summary, createdAt, messageCount, hasSessionEvent };
}

function scanCopilotSessions(cwd, {
  sessionDir = DEFAULT_SESSION_DIR,
  fsModule = fs,
  pathModule = path,
} = {}) {
  if (!fsModule.existsSync(sessionDir)) return [];

  const normalizedCwd = cwd ? pathModule.resolve(cwd).toLowerCase() : null;
  const results = [];

  let entries;
  try {
    entries = fsModule.readdirSync(sessionDir, { withFileTypes: true });
  } catch {
    return [];
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;

    const eventsPath = pathModule.join(sessionDir, entry.name, 'events.jsonl');
    if (!fsModule.existsSync(eventsPath)) continue;

    let eventsContent;
    try {
      eventsContent = fsModule.readFileSync(eventsPath, 'utf-8');
    } catch {
      continue;
    }

    const meta = extractSessionMeta(eventsContent);
    if (meta.messageCount < 1) continue;

    const sessionCwd = (meta.cwd || '').toLowerCase();
    const sessionGitRoot = (meta.gitRoot || '').toLowerCase();
    if (normalizedCwd && sessionCwd !== normalizedCwd && sessionGitRoot !== normalizedCwd) continue;

    let eventsMtime = null;
    try {
      eventsMtime = fsModule.statSync(eventsPath).mtime.toISOString();
    } catch {
      // Use createdAt as fallback
    }

    const contextPath = meta.cwd || meta.gitRoot || null;
    const context = contextPath
      ? getSessionContext(contextPath, { fsModule, pathModule })
      : null;
    const repoRoot = context?.repoRoot || (meta.gitRoot ? pathModule.resolve(meta.gitRoot) : null);
    const folderName = contextPath ? resolveFolderName(contextPath, pathModule) : null;
    const repoName = repoRoot ? resolveFolderName(repoRoot, pathModule) : null;

    const workspacePath = pathModule.join(sessionDir, entry.name, 'workspace.yaml');
    const resumable = fsModule.existsSync(workspacePath);

    results.push({
      copilotSessionId: entry.name,
      cwd: meta.cwd,
      gitRoot: meta.gitRoot,
      repository: meta.repository,
      branch: meta.branch,
      summary: meta.summary,
      createdAt: meta.createdAt,
      updatedAt: eventsMtime || meta.createdAt,
      messageCount: meta.messageCount,
      resumable,
      hookOnly: !meta.hasSessionEvent && !resumable,
      folderName,
      repoName,
      repoRoot,
      inRepo: Boolean(repoRoot),
      displayName: repoName || folderName,
    });
  }

  results.sort((a, b) => {
    const da = a.updatedAt || a.createdAt || '';
    const db = b.updatedAt || b.createdAt || '';
    return db.localeCompare(da);
  });

  return results;
}

const DEFAULT_MAX_TURNS = 10;

function getSessionHistory(copilotSessionId, {
  sessionDir = DEFAULT_SESSION_DIR,
  fsModule = fs,
  pathModule = path,
  maxTurns = DEFAULT_MAX_TURNS,
} = {}) {
  const eventsPath = pathModule.join(sessionDir, copilotSessionId, 'events.jsonl');
  if (!fsModule.existsSync(eventsPath)) return [];

  const content = fsModule.readFileSync(eventsPath, 'utf-8');
  const turns = [];

  for (const line of content.split('\n')) {
    if (!line.trim()) continue;
    try {
      const event = JSON.parse(line);
      if (event.type === 'user.message' && event.data?.content) {
        turns.push({ role: 'user', content: event.data.content });
      } else if (event.type === 'assistant.message' && event.data?.content) {
        turns.push({ role: 'assistant', content: event.data.content });
      }
    } catch {
      // Skip malformed lines
    }
  }

  return turns.slice(-maxTurns);
}

function getSessionMessageCount(copilotSessionId, {
  sessionDir = DEFAULT_SESSION_DIR,
  fsModule = fs,
  pathModule = path,
} = {}) {
  const eventsPath = pathModule.join(sessionDir, copilotSessionId, 'events.jsonl');
  try {
    const content = fsModule.readFileSync(eventsPath, 'utf-8');
    return (content.match(/"user\.message"/g) || []).length;
  } catch {
    return 0;
  }
}

function cleanStaleLocks(copilotSessionId, {
  sessionDir = DEFAULT_SESSION_DIR,
  fsModule = fs,
  pathModule = path,
  force = false,
} = {}) {
  const sessionPath = pathModule.join(sessionDir, copilotSessionId);
  let files;
  try {
    files = fsModule.readdirSync(sessionPath);
  } catch {
    return 0;
  }

  let removed = 0;
  for (const file of files) {
    const match = file.match(/^inuse\.(\d+)\.lock$/);
    if (!match) continue;

    const lockPid = parseInt(match[1], 10);
    if (lockPid <= 0) continue;

    let alive = false;
    try {
      process.kill(lockPid, 0);
      alive = true;
    } catch {
      // Process not found — stale lock
    }

    if (alive && force) {
      try {
        process.kill(lockPid);
        // Wait for process to exit (max 3 seconds)
        for (let i = 0; i < 30; i++) {
          try {
            process.kill(lockPid, 0);
          } catch {
            break;
          }
          Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 100);
        }
      } catch {
        // Ignore kill errors
      }
    }

    if (!alive || force) {
      try {
        fsModule.unlinkSync(pathModule.join(sessionPath, file));
        removed++;
      } catch {
        // Ignore cleanup errors
      }
    }
  }
  return removed;
}

function adoptSession(copilotSessionId, {
  sessionDir = DEFAULT_SESSION_DIR,
  fsModule = fs,
  pathModule = path,
  copilotVersion,
  execSyncFn = execSync,
} = {}) {
  const sessionPath = pathModule.join(sessionDir, copilotSessionId);
  const eventsPath = pathModule.join(sessionPath, 'events.jsonl');

  if (!fsModule.existsSync(eventsPath)) {
    throw new Error('Session not found');
  }

  const content = fsModule.readFileSync(eventsPath, 'utf-8');
  const lines = content.split('\n').filter((l) => l.trim());
  if (lines.length === 0) {
    throw new Error('Session has no events');
  }

  // Check if already has session.start
  const first = JSON.parse(lines[0]);
  if (first.type === 'session.start') {
    return { alreadyAdopted: true };
  }

  const resolvedVersion = copilotVersion || detectCopilotVersion({ execSyncFn });

  // Extract context from events
  const meta = extractSessionMeta(content);
  const context = {};
  if (meta.cwd) context.cwd = meta.cwd;
  if (meta.gitRoot) context.gitRoot = meta.gitRoot;
  if (meta.branch) context.branch = meta.branch;
  if (meta.repository) context.repository = meta.repository;

  const startTime = meta.createdAt || first.timestamp || new Date().toISOString();

  const startEvent = {
    type: 'session.start',
    data: {
      sessionId: copilotSessionId,
      version: 1,
      producer: 'copilot-agent',
      copilotVersion: resolvedVersion,
      startTime,
      selectedModel: 'claude-sonnet-4.6',
      context: Object.keys(context).length > 0 ? context : undefined,
    },
    id: `adopted-${copilotSessionId.substring(0, 8)}`,
    timestamp: startTime,
    parentId: null,
  };

  // Backup original
  const backupPath = eventsPath + '.bak';
  fsModule.copyFileSync(eventsPath, backupPath);

  // Prepend session.start
  const newContent = JSON.stringify(startEvent) + '\n' + content;
  fsModule.writeFileSync(eventsPath, newContent);

  // Generate workspace.yaml so the session becomes resumable
  const workspacePath = pathModule.join(sessionPath, 'workspace.yaml');
  if (!fsModule.existsSync(workspacePath)) {
    const now = new Date().toISOString();
    const wsLines = [
      `id: ${copilotSessionId}`,
    ];
    if (meta.cwd) wsLines.push(`cwd: ${meta.cwd}`);
    if (meta.gitRoot) wsLines.push(`git_root: ${meta.gitRoot}`);
    if (meta.repository) wsLines.push(`repository: ${meta.repository}`);
    if (meta.branch) wsLines.push(`branch: ${meta.branch}`);
    if (meta.summary) wsLines.push(`summary: ${meta.summary}`);
    wsLines.push(`summary_count: 0`);
    wsLines.push(`created_at: ${startTime}`);
    wsLines.push(`updated_at: ${now}`);
    fsModule.writeFileSync(workspacePath, wsLines.join('\n') + '\n');
  }

  return { adopted: true, backupPath };
}

module.exports = { scanCopilotSessions, getSessionHistory, getSessionMessageCount, cleanStaleLocks, adoptSession, detectCopilotVersion, resetCachedVersion, DEFAULT_SESSION_DIR };
