const crypto = require('crypto');
const { getSessionContext } = require('./session-context');

const OUTPUT_BUFFER_MAX = 300 * 1024; // 300 KB

// Strip alternate screen buffer content from replay data so xterm.js
// stays in normal buffer mode where scrollback works.
function stripAltScreen(buf) {
  const ENTER = '\x1b[?1049h';
  const EXIT = '\x1b[?1049l';

  let result = '';
  let depth = 0;
  let pos = 0;

  // Handle orphaned content before first exit (buffer truncation case)
  const firstEnter = buf.indexOf(ENTER);
  const firstExit = buf.indexOf(EXIT);
  if (firstExit !== -1 && (firstEnter === -1 || firstExit < firstEnter)) {
    pos = firstExit + EXIT.length;
  }

  while (pos < buf.length) {
    const nextEnter = buf.indexOf(ENTER, pos);
    const nextExit = buf.indexOf(EXIT, pos);

    if (depth === 0) {
      if (nextEnter === -1) {
        result += buf.slice(pos);
        break;
      }
      result += buf.slice(pos, nextEnter);
      depth++;
      pos = nextEnter + ENTER.length;
    } else {
      if (nextExit === -1) {
        break; // trailing alt screen, discard rest
      }
      if (nextEnter !== -1 && nextEnter < nextExit) {
        depth++;
        pos = nextEnter + ENTER.length;
      } else {
        depth--;
        pos = nextExit + EXIT.length;
      }
    }
  }

  return result;
}

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
      messageCount: 0,
      clients: new Set(),
      runner: null,
      outputBuffer: '',
      replayCount: 0,
      lastReplayAt: null,
      lastReplaySize: 0,
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
      messageCount: session.messageCount,
      clientCount: session.clients.size,
      outputBufferSize: session.outputBuffer.length,
      hasRunner: !!session.runner,
      hasPty: !!(session.runner && session.runner._pty),
      replayCount: session.replayCount,
      lastReplayAt: session.lastReplayAt,
      lastReplaySize: session.lastReplaySize,
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

  appendOutput(id, data) {
    const session = this._sessions.get(id);
    if (!session) return;
    session.outputBuffer += data;
    if (session.outputBuffer.length > OUTPUT_BUFFER_MAX) {
      session.outputBuffer = session.outputBuffer.slice(-OUTPUT_BUFFER_MAX);
    }
  }

  getOutputBuffer(id) {
    const session = this._sessions.get(id);
    if (!session) return '';
    return stripAltScreen(session.outputBuffer);
  }

  recordReplay(id, size) {
    const session = this._sessions.get(id);
    if (!session) return;
    session.replayCount++;
    session.lastReplayAt = new Date().toISOString();
    session.lastReplaySize = size;
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
