const { spawn } = require('child_process');

class PreviewManager {
  constructor({
    spawnFn = spawn,
    setIntervalFn = setInterval,
    clearIntervalFn = clearInterval,
    setTimeoutFn = setTimeout,
    clearTimeoutFn = clearTimeout,
  } = {}) {
    this._previews = new Map(); // port -> { proc, url, port }
    this._spawn = spawnFn;
    this._setInterval = setIntervalFn;
    this._clearInterval = clearIntervalFn;
    this._setTimeout = setTimeoutFn;
    this._clearTimeout = clearTimeoutFn;
  }

  start(port) {
    return new Promise((resolve, reject) => {
      if (this._previews.has(port)) {
        const existing = this._previews.get(port);
        return resolve(existing);
      }

      const proc = this._spawn('devtunnel', [
        'host',
        '--port-numbers', String(port),
        '--allow-anonymous',
      ], {
        stdio: ['ignore', 'pipe', 'pipe'],
        shell: true,
      });

      let url = null;
      const preview = { proc, url: null, port };
      this._previews.set(port, preview);

      const handleOutput = (data) => {
        const text = data.toString();
        const allUrls = text.match(/https:\/\/[^\s,]+\.devtunnels\.ms[^\s,]*/g);
        if (allUrls && !url) {
          url = allUrls.find((u) => !u.match(/:\d+$/)) || allUrls[0].replace(/[,;]+$/, '');
          preview.url = url;
        }
      };

      proc.stdout.on('data', handleOutput);
      proc.stderr.on('data', handleOutput);

      proc.on('error', (err) => {
        this._previews.delete(port);
        reject(err);
      });

      proc.on('close', () => {
        this._previews.delete(port);
      });

      // Wait for URL to be ready
      const check = this._setInterval(() => {
        if (url) {
          this._clearInterval(check);
          this._clearTimeout(timeout);
          resolve(preview);
        }
      }, 500);

      const timeout = this._setTimeout(() => {
        this._clearInterval(check);
        if (!url) {
          resolve(preview); // Return anyway, URL may appear later
        }
      }, 10000);
    });
  }

  stop(port) {
    const preview = this._previews.get(port);
    if (preview && preview.proc) {
      preview.proc.kill();
      this._previews.delete(port);
    }
  }

  list() {
    return Array.from(this._previews.values()).map((p) => ({
      port: p.port,
      url: p.url,
    }));
  }
}

module.exports = { PreviewManager };
