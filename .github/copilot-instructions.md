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
npm run lint         # ESLint (flat config)
node --test test/api.test.js   # run a single test file
```

- Run `npm test && npm run lint` before committing
- Test runner: Node.js built-in `node:test` + `assert/strict`
- Linter: ESLint 9 with flat config (`eslint.config.js`)

## Architecture

Browser-based remote terminal for GitHub Copilot CLI via xterm.js + Dev Tunnels.

```
Browser ── HTTPS ── Dev Tunnels ── Node.js server (Express + WS)
                                    ├── node-pty → copilot CLI
                                    ├── SessionManager
                                    ├── PreviewManager
                                    ├── WindowCapture
                                    └── tunnel.js (persistent tunnel)
```

### Key files

| File | Role |
|------|------|
| `server/index.js` | Express app factory, REST API, WebSocket handler, self-update |
| `server/session-manager.js` | Session lifecycle (Map-based, 4-char hex IDs) |
| `server/copilot-runner.js` | PTY spawn + I/O relay |
| `server/preview-manager.js` | Ephemeral devtunnel per port |
| `server/tunnel.js` | Dev Tunnel auto-start + QR code display |
| `server/copilot-session-scanner.js` | Scan Copilot CLI session history |
| `server/yaml-lite.js` | Minimal YAML parser for workspace.yaml |
| `server/window-capture.js` | Cross-platform window capture (node-screenshots) |
| `server/load-env.js` | .env loading (cwd priority) |
| `bin/jet-copilot.js` | Restart wrapper (exit code 100 → re-fork) |
| `public/app.js` | Terminal page (xterm.js + WebSocket) |
| `public/dashboard.js` | Dashboard page (sessions, previews, capture, update) |
| `public/app-utils.js` | Shared utils (IIFE, browser/CommonJS dual) |

### REST API

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/status` | Server status |
| GET | `/api/version` | Version + updatable flag |
| POST | `/api/update` | Self-update (git pull → restart) |
| GET/POST/DELETE | `/api/sessions[/:id]` | Session CRUD |
| GET | `/api/browse` | File browser |
| POST | `/api/upload` | Image upload |
| GET/POST/DELETE | `/api/preview[/:port]` | Preview tunnel management |
| GET | `/api/windows` | List server windows |
| POST | `/api/capture` | Capture window screenshot |
| GET | `/api/captures/:filename` | Serve captured PNG |
| GET | `/api/copilot-sessions` | List Copilot CLI sessions for cwd |

## Core Conventions

- **CommonJS** (`require` / `module.exports`)
- **DI for testability** — all classes accept optional deps (see `server-patterns.instructions.md`)
- **No class inheritance** — all classes are independent
- **Early return** for validation/error in route handlers
- **Error responses** always use `{ error: string }`
- **Naming**: files `kebab-case.js`, classes `PascalCase`, vars `camelCase`, private `_camelCase`, constants `SCREAMING_SNAKE`
- **Logging**: `console.log` with emoji, `console.error` with `[tag]` prefix
- **Comments**: minimal, only explain "why"
- **Frontend**: vanilla JS, no framework, `innerHTML` with `escapeHtml()` for user data

See `.github/instructions/` for detailed patterns.
