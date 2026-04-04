const LEVELS = { debug: 0, info: 1, warn: 2, error: 3 };

const _level = LEVELS[process.env.LOG_LEVEL || 'info'] ?? LEVELS.info;

function _write(lvl, tag, msg, meta) {
  if (LEVELS[lvl] < _level) return;
  const entry = { time: new Date().toISOString(), level: lvl, tag, msg };
  if (meta !== undefined) entry.meta = meta;
  let line;
  try {
    line = JSON.stringify(entry) + '\n';
  } catch {
    line = JSON.stringify({ ...entry, meta: '[unserializable]' }) + '\n';
  }
  if (lvl === 'error' || lvl === 'warn') {
    process.stderr.write(line);
  } else {
    process.stdout.write(line);
  }
}

module.exports = {
  debug: (tag, msg, meta) => _write('debug', tag, msg, meta),
  info: (tag, msg, meta) => _write('info', tag, msg, meta),
  warn: (tag, msg, meta) => _write('warn', tag, msg, meta),
  error: (tag, msg, meta) => _write('error', tag, msg, meta),
};
