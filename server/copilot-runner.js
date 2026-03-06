const pty = require('node-pty');

class CopilotRunner {
  constructor(onData) {
    this._pty = null;
    this._onData = onData;
  }

  start(cwd) {
    // node-pty on Windows needs cmd.exe to resolve PATH
    this._pty = pty.spawn('cmd.exe', ['/c', 'copilot'], {
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

  cleanup() {
    if (this._pty) {
      this._pty.kill();
      this._pty = null;
    }
  }
}

module.exports = { CopilotRunner };
