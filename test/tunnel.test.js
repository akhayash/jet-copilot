const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');

const { ensurePersistentTunnel, startTunnel, addPort, removePort, listPorts, validateTunnelId } = require('../server/tunnel');

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

// --- validateTunnelId ---

test('validateTunnelId accepts valid IDs', () => {
  validateTunnelId('my-tunnel');
  validateTunnelId('jet-copilot-123');
  validateTunnelId('abc');
});

test('validateTunnelId rejects IDs with shell metacharacters', () => {
  assert.throws(() => validateTunnelId('id; rm -rf /'), /Invalid tunnel ID/);
  assert.throws(() => validateTunnelId('id && echo'), /Invalid tunnel ID/);
  assert.throws(() => validateTunnelId('id$(cmd)'), /Invalid tunnel ID/);
  assert.throws(() => validateTunnelId('id | cat'), /Invalid tunnel ID/);
});

// --- ensurePersistentTunnel ---

test('ensurePersistentTunnel creates tunnel when show fails', () => {
  const calls = [];
  const execFileSyncFn = (file, args, _opts) => {
    const cmd = `${file} ${args.join(' ')}`;
    calls.push(cmd);
    if (args.includes('show') && !args.includes('port')) throw new Error('not found');
    if (args[0] === 'port' && args[1] === 'list') return '';
    if (args[0] === 'port' && args[1] === 'show') throw new Error('no port');
    return '';
  };

  ensurePersistentTunnel('my-tunnel', 3000, { execFileSyncFn });

  assert.ok(calls.some(c => c.includes('devtunnel show my-tunnel')));
  assert.ok(calls.some(c => c.includes('devtunnel create my-tunnel')));
  assert.ok(!calls.some(c => c.includes('--allow-anonymous')));
  assert.ok(calls.some(c => c.includes('port create my-tunnel -p 3000')));
});

test('ensurePersistentTunnel reuses existing tunnel', () => {
  const calls = [];
  const execFileSyncFn = (file, args, _opts) => {
    const cmd = `${file} ${args.join(' ')}`;
    calls.push(cmd);
    if (args[0] === 'port' && args[1] === 'list') return 'Port Number\n3000  auto';
    return 'Port 3000';
  };

  ensurePersistentTunnel('my-tunnel', 3000, { execFileSyncFn });

  assert.ok(calls.some(c => c.includes('devtunnel show my-tunnel')));
  assert.ok(!calls.some(c => c.includes('create my-tunnel')));
});

test('ensurePersistentTunnel adds port when missing', () => {
  const calls = [];
  const execFileSyncFn = (file, args, _opts) => {
    const cmd = `${file} ${args.join(' ')}`;
    calls.push(cmd);
    if (args[0] === 'port' && args[1] === 'list') return '';
    if (args[0] === 'port' && args[1] === 'show') throw new Error('no port');
    return '';
  };

  ensurePersistentTunnel('my-tunnel', 4000, { execFileSyncFn });

  assert.ok(!calls.some(c => c === 'devtunnel create my-tunnel'));
  assert.ok(calls.some(c => c.includes('port create my-tunnel -p 4000')));
});

// --- startTunnel with DEVTUNNEL_ID ---

test('startTunnel uses persistent tunnel when DEVTUNNEL_ID is set', async () => {
  const originalEnv = process.env.DEVTUNNEL_ID;
  const spawnArgs = [];
  const execCalls = [];

  try {
    process.env.DEVTUNNEL_ID = 'test-tunnel';

    const execFileSyncFn = (file, args, _opts) => {
      const cmd = `${file} ${args.join(' ')}`;
      execCalls.push(cmd);
      return 'Logged in as user';
    };
    const spawnFn = (_cmd, args, _opts) => {
      spawnArgs.push({ cmd: _cmd, args });
      return createFakeSpawn(null)(_cmd, args, _opts);
    };

    await startTunnel(3000, { execFileSyncFn, spawnFn });

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

    const execFileSyncFn = () => 'Logged in as user';
    const spawnFn = (_cmd, args, _opts) => {
      spawnArgs.push({ cmd: _cmd, args });
      return createFakeSpawn(null)(_cmd, args, _opts);
    };

    await startTunnel(3000, { execFileSyncFn, spawnFn });

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

    const execFileSyncFn = (file, args, _opts) => {
      if (args.includes('--version')) return '';
      if (args.includes('user')) return 'Logged in';
      if (args.includes('show') && !args.includes('port')) throw new Error('not found');
      if (args.includes('create')) throw new Error('create failed');
      return '';
    };
    const spawnFn = (_cmd, args, _opts) => {
      spawnCalls.push({ cmd: _cmd, args });
      return createFakeSpawn(null)(_cmd, args, _opts);
    };

    await startTunnel(3000, { execFileSyncFn, spawnFn });

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

  const execFileSyncFn = () => { throw new Error('not found'); };
  const spawnFn = (_cmd, args, _opts) => {
    spawnCalls.push({ cmd: _cmd, args });
    return createFakeSpawn(null)(_cmd, args, _opts);
  };

  await startTunnel(3000, { execFileSyncFn, spawnFn });

  assert.equal(spawnCalls.length, 0);
});

test('startTunnel returns early when not logged in', async () => {
  const spawnCalls = [];
  let callCount = 0;

  const execFileSyncFn = () => {
    callCount++;
    if (callCount === 1) return '';
    return 'not logged in';
  };
  const spawnFn = (_cmd, args, _opts) => {
    spawnCalls.push({ cmd: _cmd, args });
    return createFakeSpawn(null)(_cmd, args, _opts);
  };

  await startTunnel(3000, { execFileSyncFn, spawnFn });

  assert.equal(spawnCalls.length, 0);
});

// --- expired tunnel recreation ---

test('ensurePersistentTunnel recreates expired tunnel', () => {
  const calls = [];
  const execFileSyncFn = (file, args, _opts) => {
    const cmd = `${file} ${args.join(' ')}`;
    calls.push(cmd);
    if (args.includes('show') && !args.includes('port')) throw new Error('not found');
    if (args[0] === 'port' && args[1] === 'list') return '';
    if (args[0] === 'port' && args[1] === 'show') throw new Error('no port');
    return '';
  };

  ensurePersistentTunnel('expired-tunnel', 3000, { execFileSyncFn });

  assert.ok(calls.some(c => c.includes('devtunnel create expired-tunnel')));
  assert.ok(!calls.some(c => c.includes('--allow-anonymous')));
  assert.ok(calls.some(c => c.includes('port create expired-tunnel -p 3000')));
});

// --- stale port cleanup ---

test('ensurePersistentTunnel removes stale ports when port changes', () => {
  const calls = [];
  const portListOutput = [
    'Found 2 tunnel ports.',
    'Port Number   Protocol      Current Connections',
    '3000          auto          0',
    '5000          auto          0',
  ].join('\n');

  const execFileSyncFn = (file, args, _opts) => {
    const cmd = `${file} ${args.join(' ')}`;
    calls.push(cmd);
    if (args[0] === 'port' && args[1] === 'list') return portListOutput;
    if (args[0] === 'port' && args[1] === 'show') return 'Port 4117';
    return '';
  };

  ensurePersistentTunnel('my-tunnel', 4117, { execFileSyncFn });

  assert.ok(calls.some(c => c.includes('port delete my-tunnel -p 3000')));
  assert.ok(calls.some(c => c.includes('port delete my-tunnel -p 5000')));
  assert.ok(!calls.some(c => c.includes('port delete my-tunnel -p 4117')));
});

test('ensurePersistentTunnel does not remove current port', () => {
  const calls = [];
  const portListOutput = [
    'Found 1 tunnel port.',
    'Port Number   Protocol',
    '3000          auto',
  ].join('\n');

  const execFileSyncFn = (file, args, _opts) => {
    const cmd = `${file} ${args.join(' ')}`;
    calls.push(cmd);
    if (args[0] === 'port' && args[1] === 'list') return portListOutput;
    return 'Port 3000';
  };

  ensurePersistentTunnel('my-tunnel', 3000, { execFileSyncFn });

  assert.ok(!calls.some(c => c.includes('port delete')));
});

// --- listPorts ---

test('listPorts parses port numbers from devtunnel output', () => {
  const output = [
    'Found 2 tunnel ports.',
    'Port Number   Protocol      Current Connections',
    '3000          auto          0',
    '4117          auto',
  ].join('\n');

  const execFileSyncFn = () => output;
  const ports = listPorts('my-tunnel', { execFileSyncFn });

  assert.deepEqual(ports, [3000, 4117]);
});

test('listPorts returns empty array on error', () => {
  const execFileSyncFn = () => { throw new Error('fail'); };
  const ports = listPorts('my-tunnel', { execFileSyncFn });

  assert.deepEqual(ports, []);
});

// --- addPort / removePort ---

test('addPort creates port when not found', () => {
  const calls = [];
  const execFileSyncFn = (file, args, _opts) => {
    const cmd = `${file} ${args.join(' ')}`;
    calls.push(cmd);
    if (args[0] === 'port' && args[1] === 'show') throw new Error('not found');
    return '';
  };

  addPort('my-tunnel', 5000, { execFileSyncFn });

  assert.ok(calls.some(c => c.includes('port create my-tunnel -p 5000')));
});

test('addPort skips when port already exists', () => {
  const calls = [];
  const execFileSyncFn = (file, args, _opts) => {
    const cmd = `${file} ${args.join(' ')}`;
    calls.push(cmd);
    return 'Port 5000';
  };

  addPort('my-tunnel', 5000, { execFileSyncFn });

  assert.ok(!calls.some(c => c.includes('port create')));
});

test('removePort calls devtunnel port delete', () => {
  const calls = [];
  const execFileSyncFn = (file, args, _opts) => {
    const cmd = `${file} ${args.join(' ')}`;
    calls.push(cmd);
    return '';
  };

  removePort('my-tunnel', 5000, { execFileSyncFn });

  assert.ok(calls.some(c => c.includes('port delete my-tunnel -p 5000')));
});
