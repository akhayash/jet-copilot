const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');

const { ensurePersistentTunnel, startTunnel, addPort, removePort } = require('../server/tunnel');

function createFakeSpawn(stdoutData) {
  return (_cmd, _args, _opts) => {
    const proc = new EventEmitter();
    proc.stdout = new EventEmitter();
    proc.stderr = new EventEmitter();
    if (stdoutData) {
      setImmediate(() => proc.stdout.emit('data', Buffer.from(stdoutData)));
    }
    return proc;
  };
}

// --- ensurePersistentTunnel ---

test('ensurePersistentTunnel creates tunnel when show fails', () => {
  const calls = [];
  const execSyncFn = (cmd, _opts) => {
    calls.push(cmd);
    if (cmd.includes('devtunnel show')) {
      throw new Error('not found');
    }
    if (cmd.includes('devtunnel port show')) {
      throw new Error('no port');
    }
    return '';
  };

  ensurePersistentTunnel('my-tunnel', 3000, { execSyncFn });

  assert.ok(calls.some(c => c.includes('devtunnel show my-tunnel')));
  assert.ok(calls.some(c => c.includes('devtunnel create my-tunnel')));
  assert.ok(!calls.some(c => c.includes('--allow-anonymous')));
  assert.ok(calls.some(c => c.includes('devtunnel port create my-tunnel -p 3000')));
});

test('ensurePersistentTunnel reuses existing tunnel', () => {
  const calls = [];
  const execSyncFn = (cmd, _opts) => {
    calls.push(cmd);
    if (cmd.includes('devtunnel port show')) {
      return `Port 3000`;
    }
    return '';
  };

  ensurePersistentTunnel('my-tunnel', 3000, { execSyncFn });

  assert.ok(calls.some(c => c.includes('devtunnel show my-tunnel')));
  assert.ok(!calls.some(c => c.includes('devtunnel create')));
  assert.ok(!calls.some(c => c.includes('devtunnel port create')));
});

test('ensurePersistentTunnel adds port when missing', () => {
  const calls = [];
  const execSyncFn = (cmd, _opts) => {
    calls.push(cmd);
    if (cmd.includes('devtunnel port show')) {
      throw new Error('no port');
    }
    return '';
  };

  ensurePersistentTunnel('my-tunnel', 4000, { execSyncFn });

  assert.ok(!calls.some(c => c.includes('devtunnel create')));
  assert.ok(calls.some(c => c.includes('devtunnel port create my-tunnel -p 4000')));
});

// --- startTunnel with DEVTUNNEL_ID ---

test('startTunnel uses persistent tunnel when DEVTUNNEL_ID is set', async () => {
  const originalEnv = process.env.DEVTUNNEL_ID;
  const spawnArgs = [];
  const execCalls = [];

  try {
    process.env.DEVTUNNEL_ID = 'test-tunnel';

    const execSyncFn = (cmd, _opts) => {
      execCalls.push(cmd);
      if (cmd.includes('devtunnel port show')) {
        return 'Port 3000';
      }
      return 'Logged in as user';
    };
    const spawnFn = (_cmd, args, _opts) => {
      spawnArgs.push({ cmd: _cmd, args });
      return createFakeSpawn(null)(_cmd, args, _opts);
    };

    await startTunnel(3000, { execSyncFn, spawnFn });

    assert.deepEqual(spawnArgs[0].args, ['host', 'test-tunnel']);
    assert.ok(execCalls.some(c => c.includes('devtunnel show test-tunnel')));
  } finally {
    if (originalEnv === undefined) {
      delete process.env.DEVTUNNEL_ID;
    } else {
      process.env.DEVTUNNEL_ID = originalEnv;
    }
  }
});

test('startTunnel uses temporary tunnel when DEVTUNNEL_ID is not set', async () => {
  const originalEnv = process.env.DEVTUNNEL_ID;
  const spawnArgs = [];

  try {
    delete process.env.DEVTUNNEL_ID;

    const execSyncFn = (_cmd, _opts) => 'Logged in as user';
    const spawnFn = (_cmd, args, _opts) => {
      spawnArgs.push({ cmd: _cmd, args });
      return createFakeSpawn(null)(_cmd, args, _opts);
    };

    await startTunnel(3000, { execSyncFn, spawnFn });

    assert.deepEqual(spawnArgs[0].args, ['host', '--port-numbers', '3000']);
  } finally {
    if (originalEnv === undefined) {
      delete process.env.DEVTUNNEL_ID;
    } else {
      process.env.DEVTUNNEL_ID = originalEnv;
    }
  }
});

test('startTunnel stops if persistent tunnel setup fails', async () => {
  const originalEnv = process.env.DEVTUNNEL_ID;
  const spawnCalls = [];

  try {
    process.env.DEVTUNNEL_ID = 'bad-tunnel';

    const execSyncFn = (cmd, _opts) => {
      if (cmd === 'devtunnel --version') return '';
      if (cmd.includes('devtunnel user show')) return 'Logged in';
      // ensurePersistentTunnel: show fails, then create also fails
      if (cmd.includes('devtunnel show')) throw new Error('not found');
      if (cmd.includes('devtunnel create')) throw new Error('create failed');
      return '';
    };
    const spawnFn = (_cmd, args, _opts) => {
      spawnCalls.push({ cmd: _cmd, args });
      return createFakeSpawn(null)(_cmd, args, _opts);
    };

    await startTunnel(3000, { execSyncFn, spawnFn });

    // spawn should NOT be called since setup failed
    assert.equal(spawnCalls.length, 0);
  } finally {
    if (originalEnv === undefined) {
      delete process.env.DEVTUNNEL_ID;
    } else {
      process.env.DEVTUNNEL_ID = originalEnv;
    }
  }
});

test('startTunnel returns early when devtunnel CLI not found', async () => {
  const spawnCalls = [];

  const execSyncFn = (_cmd, _opts) => {
    throw new Error('not found');
  };
  const spawnFn = (_cmd, args, _opts) => {
    spawnCalls.push({ cmd: _cmd, args });
    return createFakeSpawn(null)(_cmd, args, _opts);
  };

  await startTunnel(3000, { execSyncFn, spawnFn });

  assert.equal(spawnCalls.length, 0);
});

test('startTunnel returns early when not logged in', async () => {
  const spawnCalls = [];
  let callCount = 0;

  const execSyncFn = (_cmd, _opts) => {
    callCount++;
    if (callCount === 1) return ''; // devtunnel --version
    return 'not logged in'; // devtunnel user show
  };
  const spawnFn = (_cmd, args, _opts) => {
    spawnCalls.push({ cmd: _cmd, args });
    return createFakeSpawn(null)(_cmd, args, _opts);
  };

  await startTunnel(3000, { execSyncFn, spawnFn });

  assert.equal(spawnCalls.length, 0);
});

// --- expired tunnel recreation ---

test('ensurePersistentTunnel recreates expired tunnel', () => {
  const calls = [];
  const execSyncFn = (cmd, _opts) => {
    calls.push(cmd);
    if (cmd.includes('devtunnel show')) {
      throw new Error('tunnel not found');
    }
    if (cmd.includes('devtunnel port show')) {
      throw new Error('no port');
    }
    return '';
  };

  ensurePersistentTunnel('expired-tunnel', 3000, { execSyncFn });

  assert.ok(calls.some(c => c.includes('devtunnel create expired-tunnel')));
  assert.ok(!calls.some(c => c.includes('--allow-anonymous')));
  assert.ok(calls.some(c => c.includes('devtunnel port create expired-tunnel -p 3000')));
});

// --- addPort / removePort ---

test('addPort creates port when not found', () => {
  const calls = [];
  const execSyncFn = (cmd, _opts) => {
    calls.push(cmd);
    if (cmd.includes('devtunnel port show')) throw new Error('not found');
    return '';
  };

  addPort('my-tunnel', 5000, { execSyncFn });

  assert.ok(calls.some(c => c.includes('devtunnel port create my-tunnel -p 5000')));
});

test('addPort skips when port already exists', () => {
  const calls = [];
  const execSyncFn = (cmd, _opts) => {
    calls.push(cmd);
    return 'Port 5000';
  };

  addPort('my-tunnel', 5000, { execSyncFn });

  assert.ok(!calls.some(c => c.includes('devtunnel port create')));
});

test('removePort calls devtunnel port delete', () => {
  const calls = [];
  const execSyncFn = (cmd, _opts) => {
    calls.push(cmd);
    return '';
  };

  removePort('my-tunnel', 5000, { execSyncFn });

  assert.ok(calls.some(c => c.includes('devtunnel port delete my-tunnel -p 5000')));
});
