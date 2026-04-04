# Server Patterns

## Dependency Injection

All classes accept a **single options object** with named dependencies defaulting to real implementations.

**Naming:**
- Modules: `{name}Module` (e.g., `fsModule`, `pathModule`)
- Functions: `{name}Fn` (e.g., `execSyncFn`, `spawnFn`)
- Manager instances: plain name (e.g., `sessions`, `previews`)
- Private state: `_` prefix (e.g., `this._pty`, `this._sessions`)

## Route Handler Pattern

1. Validate input → `return res.status(400).json({ error })` (early return)
2. Check resource → `return res.status(404).json({ error })` (early return)
3. Try-catch → `res.json(result)` / `res.status(500).json({ error })`
4. Log errors → `log.error('tag', 'message', { error: err.message })`

See `add-api-endpoint` skill for full template.

## API Response Shapes

- Success — data directly: `res.json({ id, status })`
- Error — always `{ error }`: `res.status(400).json({ error: 'message' })`

## WebSocket Protocol

JSON messages with `type` field:

| Direction | Type | Payload |
|-----------|------|---------|
| Client → Server | `input` | `{ content }` |
| Client → Server | `resize` | `{ cols, rows }` |
| Client → Server | `restart` | _(none)_ |
| Server → Client | `output` | `{ content }` |
| Server → Client | `replay` | `{ content }` |
| Server → Client | `error` | `{ content }` |
| Server → Client | `exit` | `{ exitCode, signal }` |

## Logging

Use `server/logger.js` for structured JSON logs:

```js
const log = require('./logger');

log.info('tag', 'message', { key: 'value' });   // stdout
log.error('tag', 'failed', { error: err.message }); // stderr
log.debug('tag', 'detail');  // only when LOG_LEVEL=debug
```

- `LOG_LEVEL` env var: `debug` | `info` (default) | `warn` | `error`
- User-facing output (tunnel QR, startup banner): use `console.log` with emoji
- Debug/error paths: use `log.info()` / `log.error()`
