# Copilot Instructions — jet-copilot

## Workflow

- **すべての変更は PR 経由** — main への直接プッシュ禁止。必ず feature branch → PR を作成する
- **マージはユーザーの承認後** — PR を作成したら、ユーザーに承認を求める。勝手にマージしない
- **プッシュは OK** — feature branch へのプッシュは自由に行ってよい
- **リリース時は origin と ms 両方にプッシュ** — `git push origin main --tags && git push ms main --tags`

## Build & Test

```bash
npm install          # requires native build tools for node-pty
npm start            # or: node server/index.js
npm test             # runs all tests via node --test
node --test test/api.test.js   # run a single test file
```

- Test runner: Node.js built-in `node:test` + `assert/strict`
- HTTP tests use `supertest` against the Express app (no live server needed)
- No linter or formatter is configured

## Architecture

Browser-based remote terminal for GitHub Copilot CLI. The server spawns a `copilot` process via node-pty and streams I/O to the browser over WebSocket through xterm.js.

```
Browser ── HTTPS ── Dev Tunnels (cloud) ── tunnel ── Node.js server (Express + WS)
                                                      ├── node-pty → copilot CLI
                                                      ├── SessionManager (session lifecycle)
                                                      ├── PreviewManager (preview tunnels)
                                                      └── tunnel.js (main tunnel + QR)
```

### Server (`server/`)

- **index.js** — Express app factory (`createApp`), WebSocket handler, REST API routes, CLI entrypoint (`runCli`)
- **session-manager.js** — `SessionManager` class. Map-based storage, 4-char hex session IDs, tracks WebSocket clients per session, lazy runner instantiation
- **copilot-runner.js** — `CopilotRunner` class. Spawns PTY (`cmd.exe /c copilot` on Windows, `copilot` elsewhere), relays I/O via callback
- **preview-manager.js** — `PreviewManager` class. Spawns `devtunnel host` per port with `--allow-anonymous`, extracts URL from stdout via regex
- **tunnel.js** — `startTunnel` function. Validates devtunnel CLI, starts main tunnel (authenticated, no anonymous), outputs QR code
- **session-context.js** — `getSessionContext` / `findRepoRoot`. Walks up directories looking for `.git/` to determine repo context
- **load-env.js** — Loads `.env` with cwd priority over package root

### Frontend (`public/`)

- Two-page vanilla JS app: dashboard (`index.html`) and terminal (`terminal.html?session={id}`)
- No framework — plain DOM manipulation, fetch API, CSS custom properties for theming
- Dashboard polls server every 5s for status/sessions/previews
- Terminal page uses xterm.js v6 + WebSocket for full PTY emulation
- Mobile-first: touch-friendly buttons, floating action bar, voice input panel, iOS/Android workarounds

### WebSocket protocol

Messages are JSON with a `type` field:

| Direction | Type | Payload |
|-----------|------|---------|
| Client → Server | `input` | `{ content: string }` |
| Client → Server | `resize` | `{ cols, rows }` |
| Client → Server | `restart` | _(none)_ |
| Server → Client | `output` | `{ content: string }` |
| Server → Client | `error` | `{ content: string }` |

## Conventions

### Module style

- **CommonJS** (`require` / `module.exports`), `"type": "commonjs"` in package.json
- One class or function group per file, kebab-case filenames
- Frontend utilities use IIFE for browser/CommonJS dual compatibility

### Dependency injection for testability

All major classes accept optional dependencies so tests can substitute mocks:

```js
new CopilotRunner(onData, ptyModule);
new PreviewManager({ spawnFn, setIntervalFn, ... });
createApp({ sessions, previews, fsModule, ... });
```

### Testing patterns

- Mock PTY, spawn, and filesystem via dependency injection — no monkey-patching
- Use `os.tmpdir()` for filesystem tests with real temp directories
- API tests: create app with mocked managers, exercise routes via `supertest`

### Error handling

- Express routes: try/catch → `console.error('[tag]', err.message)` → HTTP status + JSON error
- WebSocket: silent on error, auto-reconnect with 3s delay on close
- PTY exit: send graceful exit message to connected clients, don't crash

### Naming

| Scope | Convention |
|-------|-----------|
| Files | `kebab-case.js` |
| Classes | `PascalCase` |
| Functions / variables | `camelCase` |
| Private properties | `_camelCase` |
| CSS classes | `kebab-case` |
| CSS variables | `--kebab-case` |

### Logging

- `console.log` with emoji prefixes (✈️🚀🔗✅) for informational messages
- `console.error` with `[tag]` prefix (e.g., `[upload]`, `[ws]`) for errors
- No structured logging library

### Comments

- Minimal — only explain "why", not "what"
- Document browser/platform workarounds (e.g., xterm.js touch scroll bug)
