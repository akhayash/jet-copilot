const crypto = require('crypto');

class SessionManager {
  constructor() {
    this._sessions = new Map();
    this._startTime = Date.now();
  }

  create(cwd) {
    const id = crypto.randomBytes(2).toString('hex');
    const session = {
      id,
      status: 'active',
      cwd: cwd || process.cwd(),
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

  list() {
    return Array.from(this._sessions.values()).map((s) => ({
      id: s.id,
      status: s.status,
      cwd: s.cwd,
      startedAt: s.startedAt,
      endedAt: s.endedAt,
      clientCount: s.clients.size,
    }));
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
      // End session if no clients and runner has exited
      if (session.clients.size === 0 && session.status === 'active') {
        // Keep session alive for reconnection
      }
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
