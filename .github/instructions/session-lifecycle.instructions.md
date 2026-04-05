# Session Lifecycle

## Session Types

| Type | `copilotSessionId` | `--resume` | Description |
|------|--------------------|-----------|-------------|
| New | Auto-generated UUID | No | Fresh copilot process |
| Resume | From Copilot History | Yes | Restores CLI state from `~/.copilot/session-state/{id}/` |
| Adopt | From Copilot History | Yes (after adopt) | Non-resumable → resumable conversion |

## Resume Flow

```
Dashboard "Resume" click
  → POST /api/sessions { copilotSessionId, cwd }
    → cleanStaleLocks(id, { force: true })  // kill orphaned processes
    → sessions.create(cwd, { copilotSessionId })
  → redirect to /terminal?session={id}
  → WebSocket connects
    → runner.start(cwd, { args: ['--resume', copilotSessionId] })
    → copilot --resume {uuid}  // Copilot CLI restores state
```

## Adopt Flow

```
Dashboard "Adopt" click
  → POST /api/copilot-sessions/{id}/adopt
    → adoptSession(id)
      → read events.jsonl
      → prepend synthetic session.start event
      → generate workspace.yaml
      → backup original to .bak
  → then resume as normal
```

## Copilot CLI Session Directory

```
~/.copilot/session-state/{uuid}/
├── events.jsonl          # Event log (one JSON per line)
├── workspace.yaml        # Session metadata (presence = resumable by CLI)
├── session.db            # SQLite (Copilot internal state)
├── inuse.{pid}.lock      # Lock file (PID of process using session)
├── plan.md               # Session plan (if any)
├── checkpoints/          # Checkpoint history
├── files/                # Session artifacts
└── research/             # Research outputs
```

### events.jsonl Key Events

| Event | Fields | Use |
|-------|--------|-----|
| `session.start` | `sessionId, startTime, context{cwd, gitRoot, branch, repository}` | Session creation |
| `session.resume` | `resumeTime, context{...}` | Session resumed |
| `session.context_changed` | `cwd, gitRoot, branch, repository` | Directory change |
| `session.task_complete` | `summary` | Task done |
| `user.message` | `content` | User turn |
| `assistant.message` | `content` | Assistant turn |
| `hook.start` | `input{cwd}` | Hook invocation (fallback for cwd) |

### Resumability Rules

```js
resumable = hasSessionEvent  // events.jsonl has session.start or session.resume
hookOnly  = !hasSessionEvent && !hasWorkspace
```

- `resumable: true` → Resume button
- `resumable: false, hookOnly: false` → Adopt button
- `hookOnly: true` → "Hook only" label

### Hook-Only Sessions

Git hook 経由で Copilot CLI が実行された場合、`session.start` が発行されず `hook.start` のみ記録される。
workspace.yaml も生成されない。

特徴:
- events.jsonl の先頭が `hook.start` または `user.message`（`session.start` なし）
- cwd は `hook.start` の `input.cwd` から取得（フォールバック）
- resume 不可（Copilot CLI が `"First event must be session.start"` で拒否）
- 会話内容がある場合は Adopt で resumable に変換可能

## Lock Management: cleanStaleLocks()

Removes orphaned `inuse.{pid}.lock` files.

```js
cleanStaleLocks(sessionId);                    // remove dead locks only
cleanStaleLocks(sessionId, { force: true });   // kill + remove all locks
```

With `force: true` (session takeover):
1. Sends SIGTERM to PID
2. Polls up to 3s for termination
3. Removes lock file

## Terminal Buffer: stripAltScreen()

Copilot CLI uses alternate screen buffer (`\x1b[?1049h`/`l`).
When replaying output to new clients, alt screen breaks xterm.js scrollback.
`stripAltScreen()` removes these regions from replay data.

## PTY Exit Handling

```
copilot exits → CopilotRunner.onExit({ exitCode, signal })
  → log.info('pty', 'exit', { exitCode, signal })
  → broadcast { type: 'exit', exitCode, signal } to all WS clients
  → frontend: if exitCode != 0, show restart overlay
  → user clicks Restart → { type: 'restart' } → runner.restart()
```
