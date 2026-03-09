const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { WindowCapture } = require('../server/window-capture');

function createMockWindow({ id = 1, pid = 100, appName = 'test', title = 'Test Window', width = 800, height = 600, isMinimized = false, isFocused = false } = {}) {
  return {
    id: () => id,
    pid: () => pid,
    appName: () => appName,
    title: () => title,
    x: () => 0,
    y: () => 0,
    width: () => width,
    height: () => height,
    isMinimized: () => isMinimized,
    isFocused: () => isFocused,
    captureImage: async () => ({
      width,
      height,
      toPng: async () => Buffer.from('fake-png-data'),
    }),
  };
}

function createMockScreenshots(windows = []) {
  return {
    Window: {
      all: () => windows,
    },
  };
}

test('WindowCapture.listWindows returns windows with titles', () => {
  const windows = [
    createMockWindow({ id: 1, title: 'Chrome' }),
    createMockWindow({ id: 2, title: '' }),
    createMockWindow({ id: 3, title: 'VS Code' }),
  ];

  const capture = new WindowCapture({
    screenshotsModule: createMockScreenshots(windows),
  });

  const result = capture.listWindows();
  assert.equal(result.length, 2);
  assert.equal(result[0].id, 1);
  assert.equal(result[0].title, 'Chrome');
  assert.equal(result[1].id, 3);
  assert.equal(result[1].title, 'VS Code');
});

test('WindowCapture.listWindows returns correct shape', () => {
  const windows = [
    createMockWindow({ id: 42, pid: 1234, appName: 'chrome', title: 'Google', width: 1920, height: 1080, isMinimized: false, isFocused: true }),
  ];

  const capture = new WindowCapture({
    screenshotsModule: createMockScreenshots(windows),
  });

  const result = capture.listWindows();
  assert.deepEqual(result[0], {
    id: 42,
    pid: 1234,
    appName: 'chrome',
    title: 'Google',
    x: 0,
    y: 0,
    width: 1920,
    height: 1080,
    isMinimized: false,
    isFocused: true,
  });
});

test('WindowCapture.capture saves PNG and returns metadata', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'jet-capture-test-'));

  const windows = [
    createMockWindow({ id: 10, width: 640, height: 480 }),
  ];

  const capture = new WindowCapture({
    screenshotsModule: createMockScreenshots(windows),
    osModule: { tmpdir: () => tmpDir },
  });

  try {
    const result = await capture.capture(10);
    assert.match(result.filename, /^\d+\.png$/);
    assert.equal(result.width, 640);
    assert.equal(result.height, 480);
    assert.equal(fs.existsSync(result.path), true);
    assert.equal(fs.readFileSync(result.path, 'utf8'), 'fake-png-data');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('WindowCapture.capture throws for unknown window ID', async () => {
  const capture = new WindowCapture({
    screenshotsModule: createMockScreenshots([]),
  });

  await assert.rejects(
    () => capture.capture(999),
    { message: 'Window not found: 999' },
  );
});
