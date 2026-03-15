const { execFileSync } = require('child_process');
const { getTunnelUrl, getTunnelId, addPort, removePort } = require('./tunnel');

class PreviewManager {
  constructor({
    execFileSyncFn = execFileSync,
    getTunnelUrlFn = getTunnelUrl,
    getTunnelIdFn = getTunnelId,
    addPortFn = addPort,
    removePortFn = removePort,
  } = {}) {
    this._previews = new Map(); // port -> { url, port }
    this._execFileSync = execFileSyncFn;
    this._getTunnelUrl = getTunnelUrlFn;
    this._getTunnelId = getTunnelIdFn;
    this._addPort = addPortFn;
    this._removePort = removePortFn;
  }

  async start(port) {
    if (this._previews.has(port)) {
      return this._previews.get(port);
    }

    const id = this._getTunnelId();
    const mainUrl = this._getTunnelUrl();

    if (!id || !mainUrl) {
      throw new Error('No active tunnel. Set DEVTUNNEL_ID to enable previews.');
    }

    this._addPort(id, port, { execFileSyncFn: this._execFileSync });

    // Build URL from main tunnel URL pattern: https://<sub>-<mainPort>.<cluster>.devtunnels.ms
    // Replace the main port with the preview port in the subdomain
    const url = mainUrl.replace(/-\d+\./, `-${port}.`);

    const preview = { port, url };
    this._previews.set(port, preview);
    return preview;
  }

  stop(port) {
    const id = this._getTunnelId();
    if (id) {
      this._removePort(id, port, { execFileSyncFn: this._execFileSync });
    }
    this._previews.delete(port);
  }

  list() {
    return Array.from(this._previews.values()).map((p) => ({
      port: p.port,
      url: p.url,
    }));
  }
}

module.exports = { PreviewManager };
