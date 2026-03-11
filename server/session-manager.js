const crypto = require('crypto');
const { getSessionContext } = require('./session-context');

class SessionManager {
  constructor() {
    this._sessions = new Map();
    this._startTime = Date.now();
  }

  create(cwd, { copilotSessionId } = {}) {
    const context = getSessionContext(cwd || process.cwd());
    const id = crypto.randomBytes(2).toString('hex');
    const session = {
      id,
      status: 'active',
      cwd: context.cwd,
      folderName: context.folderName,
      repoName: context.repoName,
      repoRoot: context.repoRoot,
      inRepo: context.inRepo,
      displayName: context.displayName,
      copilotSessionId: copilotSessionId || crypto.randomUUID(),
      startedAt: new Date().toISOString(),
      endedAt: null,
      clients: new Set(),
      runner: null,
    };
    this._sessions.set(id, session);
    return session;
  }

  get(id) {
    return this._sessions.get(id);
  }

  serialize(session) {
    return {
      id: session.id,
      status: session.status,
      cwd: session.cwd,
      folderName: session.folderName,
      repoName: session.repoName,
      repoRoot: session.repoRoot,
      inRepo: session.inRepo,
      displayName: session.displayName,
      copilotSessionId: session.copilotSessionId,
      startedAt: session.startedAt,
      endedAt: session.endedAt,
      clientCount: session.clients.size,
    };
  }

  list() {
    return Array.from(this._sessions.values()).map((s) => this.serialize(s));
  }

  end(id) {
    const session = this._sessions.get(id);
    if (session) {
      session.status = 'ended';
      session.endedAt = new Date().toISOString();
      if (session.runner) {
        session.runner.cleanup();
        session.runner = null;
      }
    }
  }

  addClient(id, ws) {
    const session = this._sessions.get(id);
    if (session) session.clients.add(ws);
  }

  removeClient(id, ws) {
    const session = this._sessions.get(id);
    if (session) {
      session.clients.delete(ws);
    }
  }

  getStatus() {
    const sessions = this.list();
    return {
      online: true,
      uptime: Date.now() - this._startTime,
      defaultCwd: process.cwd(),
      activeSessions: sessions.filter((s) => s.status === 'active').length,
      totalSessions: sessions.length,
    };
  }
}

module.exports = { SessionManager };
