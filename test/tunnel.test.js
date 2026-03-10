const test = require('node:test');
const assert = require('node:assert/strict');

const { findOrCreateTunnel, TUNNEL_LABEL } = require('../server/tunnel');

test('findOrCreateTunnel reuses existing tunnel with matching label', () => {
  const commands = [];
  const execSyncFn = (cmd, _opts) => {
    commands.push(cmd);
    if (cmd.includes('devtunnel list')) {
      return JSON.stringify({ tunnels: [{ tunnelId: 'existing-tunnel.jpe1' }] });
    }
    if (cmd.includes('devtunnel port create')) {
      return '';
    }
    return '';
  };

  const id = findOrCreateTunnel(3000, execSyncFn);
  assert.equal(id, 'existing-tunnel.jpe1');
  assert.ok(commands.some((c) => c.includes(`--labels ${TUNNEL_LABEL}`)));
  assert.ok(commands.some((c) => c.includes('port create existing-tunnel.jpe1 -p 3000')));
});

test('findOrCreateTunnel creates new tunnel when none exists', () => {
  const commands = [];
  const execSyncFn = (cmd, _opts) => {
    commands.push(cmd);
    if (cmd.includes('devtunnel list')) {
      return JSON.stringify({ warning: 'No tunnels found.' });
    }
    if (cmd.includes('devtunnel create')) {
      return JSON.stringify({ tunnel: { tunnelId: 'new-tunnel.jpe1' } });
    }
    if (cmd.includes('devtunnel port create')) {
      return '';
    }
    return '';
  };

  const id = findOrCreateTunnel(3000, execSyncFn);
  assert.equal(id, 'new-tunnel.jpe1');
  assert.ok(commands.some((c) => c.includes('devtunnel create')));
  assert.ok(commands.some((c) => c.includes(`--labels ${TUNNEL_LABEL}`)));
});

test('findOrCreateTunnel returns null when create fails', () => {
  const execSyncFn = (cmd) => {
    if (cmd.includes('devtunnel list')) {
      throw new Error('no tunnels');
    }
    if (cmd.includes('devtunnel create')) {
      throw new Error('create failed');
    }
    return '';
  };

  const id = findOrCreateTunnel(3000, execSyncFn);
  assert.equal(id, null);
});

test('findOrCreateTunnel tolerates port already existing', () => {
  const execSyncFn = (cmd) => {
    if (cmd.includes('devtunnel list')) {
      return JSON.stringify({ tunnels: [{ tunnelId: 'test.jpe1' }] });
    }
    if (cmd.includes('devtunnel port create')) {
      throw new Error('Port already exists');
    }
    return '';
  };

  const id = findOrCreateTunnel(3000, execSyncFn);
  assert.equal(id, 'test.jpe1');
});
