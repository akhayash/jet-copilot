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
        updatedAt: data.updated_at || null,
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

module.exports = { scanCopilotSessions, DEFAULT_SESSION_DIR };
