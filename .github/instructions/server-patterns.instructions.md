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
4. Log errors → `console.error('[tag]', err.message)`

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
| Server → Client | `error` | `{ content }` |
