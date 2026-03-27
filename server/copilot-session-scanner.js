const fs = require('fs');
const path = require('path');
const os = require('os');
const yaml = require('./yaml-lite');
const { getSessionContext, resolveFolderName } = require('./session-context');

const DEFAULT_SESSION_DIR = path.join(os.homedir(), '.copilot', 'session-state');

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

    const workspacePath = pathModule.join(sessionDir, entry.name, 'workspace.yaml');
    if (!fsModule.existsSync(workspacePath)) continue;

    // Skip sessions without transcript data (ghost sessions from aborted startups)
    const eventsPath = pathModule.join(sessionDir, entry.name, 'events.jsonl');
    if (!fsModule.existsSync(eventsPath)) continue;

    // Skip short-lived sessions (fewer than 2 user messages)
    let eventsMtime = null;
    try {
      const eventsContent = fsModule.readFileSync(eventsPath, 'utf-8');
      let userMessageCount = 0;
      for (const line of eventsContent.split('\n')) {
        if (line.includes('"user.message"')) userMessageCount++;
        if (userMessageCount >= 2) break;
      }
      if (userMessageCount < 2) continue;
    } catch {
      continue;
    }
    try {
      eventsMtime = fsModule.statSync(eventsPath).mtime.toISOString();
    } catch {
      // Fall back to workspace.yaml updated_at
    }

    try {
      const content = fsModule.readFileSync(workspacePath, 'utf-8');
      const data = yaml.parse(content);

      const sessionCwd = (data.cwd || '').toLowerCase();
      const gitRoot = (data.git_root || '').toLowerCase();

      if (normalizedCwd && sessionCwd !== normalizedCwd && gitRoot !== normalizedCwd) continue;

      const contextPath = data.cwd || data.git_root || null;
      const context = contextPath
        ? getSessionContext(contextPath, { fsModule, pathModule })
        : null;
      const repoRoot = context?.repoRoot || (data.git_root ? pathModule.resolve(data.git_root) : null);
      const folderName = contextPath ? resolveFolderName(contextPath, pathModule) : null;
      const repoName = repoRoot ? resolveFolderName(repoRoot, pathModule) : null;

      results.push({
        copilotSessionId: data.id || entry.name,
        cwd: data.cwd || null,
        gitRoot: data.git_root || null,
        repository: data.repository || null,
        branch: data.branch || null,
        summary: data.summary || null,
        createdAt: data.created_at || null,
        updatedAt: eventsMtime || data.updated_at || null,
        folderName,
        repoName,
        repoRoot,
        inRepo: Boolean(repoRoot),
        displayName: repoName || folderName,
      });
    } catch {
      // Skip unreadable sessions
    }
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
