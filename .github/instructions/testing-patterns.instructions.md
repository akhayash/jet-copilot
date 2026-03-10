# Testing Patterns

## Framework

- `node:test` + `node:assert/strict` (strict mode always)
- HTTP tests use `supertest` (no live server)
- No Jest, Mocha, or other test frameworks

## Rules

- No global hooks — use `try/finally` per test for cleanup
- Temp dirs: `fs.mkdtempSync()` + `fs.rmSync()` in finally
- Unused params: prefix with `_` (e.g., `_req`, `_opts`)
- Mock via DI, never monkey-patch

## Assertions

- `assert.equal` — primitives
- `assert.deepEqual` — objects/arrays
- `assert.match` — regex
- `assert.ok` — truthy
- `assert.rejects` — async errors
