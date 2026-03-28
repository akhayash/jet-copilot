const fs = require('fs');
const path = require('path');
const os = require('os');
const { getSessionContext, resolveFolderName } = require('./session-context');

const DEFAULT_SESSION_DIR = path.join(os.homedir(), '.copilot', 'session-state');

// Extract session metadata from events.jsonl (the sole data source)
function extractSessionMeta(eventsContent) {
  let cwd = null;
  let gitRoot = null;
  let repository = null;
  let branch = null;
  let summary = null;
  let createdAt = null;
  let contextFound = false;

  // Fast message count via string matching (avoids JSON.parse per line)
  const messageCount = (eventsContent.match(/"user\.message"/g) || []).length;

  // Only parse lines that contain relevant event types
  for (const line of eventsContent.split('\n')) {
    if (!line.trim()) continue;

    // Skip lines that can't contain metadata events
    if (!line.includes('"session.start"') &&
        !line.includes('"session.context_changed"') &&
        !line.includes('"session.task_complete"')) continue;

    try {
      const event = JSON.parse(line);
      const d = event.data;

      if (event.type === 'session.start') {
        createdAt = d?.startTime || createdAt;
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
      }
    } catch {
      // Skip malformed lines
    }

    // Stop early if we have everything
    if (contextFound && summary) break;
  }

  return { cwd, gitRoot, repository, branch, summary, createdAt, messageCount };
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

module.exports = { scanCopilotSessions, getSessionHistory, DEFAULT_SESSION_DIR };
