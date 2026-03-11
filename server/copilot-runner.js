const pty = require('node-pty');

class CopilotRunner {
  constructor(onData, ptyModule = pty) {
    this._pty = null;
    this._onData = onData;
    this._ptyModule = ptyModule;
  }

  start(cwd, { args = [] } = {}) {
    const isWindows = process.platform === 'win32';
    const file = isWindows ? 'cmd.exe' : 'copilot';
    const baseArgs = isWindows ? ['/c', 'copilot', ...args] : [...args];

    this._pty = this._ptyModule.spawn(file, baseArgs, {
      name: 'xterm-256color',
      cols: 80,
      rows: 24,
      cwd: cwd || process.cwd(),
      env: { ...process.env },
    });

    this._pty.onData((data) => {
      if (this._onData) {
        this._onData(data);
      }
    });

    this._pty.onExit(({ exitCode }) => {
      if (this._onData) {
        this._onData(`\r\n[Copilot exited with code ${exitCode}]\r\n`);
      }
      this._pty = null;
    });
  }

  write(input) {
    if (this._pty) {
      this._pty.write(input);
    }
  }

  resize(cols, rows) {
    if (this._pty) {
      this._pty.resize(cols, rows);
    }
  }

  restart(cwd, { args = [] } = {}) {
    if (this._pty) {
      this._pty.kill();
      this._pty = null;
    }
    this.start(cwd, { args });
  }

  cleanup() {
    if (this._pty) {
      this._pty.kill();
      this._pty = null;
    }
  }
}

module.exports = { CopilotRunner };
