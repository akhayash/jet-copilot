const test = require('node:test');
const assert = require('node:assert/strict');

const { CopilotRunner } = require('../server/copilot-runner');

function createFakePty() {
  let dataHandler = null;
  let exitHandler = null;

  return {
    writes: [],
    resizes: [],
    killed: false,
    onData(handler) {
      dataHandler = handler;
    },
    onExit(handler) {
      exitHandler = handler;
    },
    write(input) {
      this.writes.push(input);
    },
    resize(cols, rows) {
      this.resizes.push([cols, rows]);
    },
    kill() {
      this.killed = true;
    },
    emitData(data) {
      dataHandler(data);
    },
    emitExit(payload) {
      exitHandler(payload);
    },
  };
}

test('CopilotRunner.start spawns PTY and forwards output', () => {
  const fakePty = createFakePty();
  const calls = [];
  const outputs = [];
  const ptyModule = {
    spawn(file, args, options) {
      calls.push({ file, args, options });
      return fakePty;
    },
  };

  const runner = new CopilotRunner((data) => outputs.push(data), ptyModule);
  runner.start('C:\\repo');
  fakePty.emitData('hello');

  assert.equal(calls.length, 1);
  assert.equal(calls[0].file, 'cmd.exe');
  assert.deepEqual(calls[0].args, ['/c', 'copilot']);
  assert.equal(calls[0].options.cwd, 'C:\\repo');
  assert.deepEqual(outputs, ['hello']);
});

test('CopilotRunner delegates write, resize, restart, and cleanup', () => {
  const fakePtyA = createFakePty();
  const fakePtyB = createFakePty();
  const spawned = [fakePtyA, fakePtyB];
  const ptyModule = {
    spawn() {
      return spawned.shift();
    },
  };

  const runner = new CopilotRunner(() => {}, ptyModule);
  runner.start('C:\\repo');
  runner.write('abc');
  runner.resize(120, 40);
  runner.restart('C:\\repo2');
  runner.cleanup();

  assert.deepEqual(fakePtyA.writes, ['abc']);
  assert.deepEqual(fakePtyA.resizes, [[120, 40]]);
  assert.equal(fakePtyA.killed, true);
  assert.equal(fakePtyB.killed, true);
});

test('CopilotRunner emits exit message and clears PTY on exit', () => {
  const fakePty = createFakePty();
  const outputs = [];
  const runner = new CopilotRunner((data) => outputs.push(data), {
    spawn() {
      return fakePty;
    },
  });

  runner.start('C:\\repo');
  fakePty.emitExit({ exitCode: 7 });
  runner.write('ignored');

  assert.equal(outputs.at(-1), '\r\n[Copilot exited with code 7]\r\n');
  assert.deepEqual(fakePty.writes, []);
});
