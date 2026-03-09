const fs = require('fs');
const os = require('os');
const path = require('path');

let _nodeScreenshots;
function loadScreenshots() {
  if (!_nodeScreenshots) {
    _nodeScreenshots = require('node-screenshots');
  }
  return _nodeScreenshots;
}

class WindowCapture {
  constructor({
    screenshotsModule,
    fsModule = fs,
    osModule = os,
    pathModule = path,
  } = {}) {
    this._screenshots = screenshotsModule || null;
    this._fsModule = fsModule;
    this._os = osModule;
    this._path = pathModule;
  }

  _getScreenshots() {
    if (!this._screenshots) {
      this._screenshots = loadScreenshots();
    }
    return this._screenshots;
  }

  listWindows() {
    const screenshots = this._getScreenshots();
    const windows = screenshots.Window.all();
    return windows
      .filter((w) => w.title())
      .map((w) => ({
        id: w.id(),
        pid: w.pid(),
        appName: w.appName(),
        title: w.title(),
        x: w.x(),
        y: w.y(),
        width: w.width(),
        height: w.height(),
        isMinimized: w.isMinimized(),
        isFocused: w.isFocused(),
      }));
  }

  async capture(windowId) {
    const screenshots = this._getScreenshots();
    const windows = screenshots.Window.all();
    const target = windows.find((w) => w.id() === windowId);
    if (!target) {
      throw new Error(`Window not found: ${windowId}`);
    }

    const image = await target.captureImage();
    const pngBuffer = await image.toPng();

    const captureDir = this._path.join(this._os.tmpdir(), 'jet-copilot-captures');
    this._fsModule.mkdirSync(captureDir, { recursive: true });

    const filename = `${Date.now()}.png`;
    const filePath = this._path.join(captureDir, filename);
    this._fsModule.writeFileSync(filePath, pngBuffer);

    return {
      filename,
      path: filePath,
      width: image.width,
      height: image.height,
    };
  }

  getCaptureDir() {
    return this._path.join(this._os.tmpdir(), 'jet-copilot-captures');
  }
}

module.exports = { WindowCapture };
