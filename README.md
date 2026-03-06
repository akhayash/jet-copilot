# ✈️ Jet Copilot

**English** | [日本語](README.ja.md)

A web app to remotely operate GitHub Copilot CLI from your iPhone browser.

Launches an interactive `copilot` session on your local PC and streams it to your iPhone via [xterm.js](https://xtermjs.org/) full terminal emulation. Securely exposed to the internet through [Microsoft Dev Tunnels](https://learn.microsoft.com/azure/developer/dev-tunnels/) with instant QR code access.

## Architecture

```
iPhone (Safari)  ── HTTPS ──  Dev Tunnels (Microsoft Cloud)  ── tunnel ──  Local PC
                                                                           ├── Node.js (Express + WebSocket)
                                                                           ├── node-pty (PTY)
                                                                           └── copilot (interactive session)
```

## Prerequisites

- **Node.js** v18+
- **GitHub Copilot CLI** (`copilot` command)
  - Install: `npm install -g @github/copilot`
  - Auth: `copilot login`
- **Microsoft Dev Tunnels CLI** (`devtunnel` command)
  - Install: `winget install Microsoft.devtunnel`
  - Auth: `devtunnel user login -g` (GitHub account)
- **Windows** (node-pty uses Windows PTY)

## Setup

```bash
# 1. Clone
git clone <your-repo-url>
cd jet-copilot

# 2. Install dependencies
npm install
```

### `.env` Configuration (Optional)

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Server port number | `3000` |

## Usage

### 1. Start the Server

```bash
node server/index.js
```

The terminal will display:
- 🚀 Server URL (localhost)
- 🔗 Dev Tunnel public URL
- 📱 **QR code** (scan with iPhone camera)

### 2. Connect from iPhone

1. Scan the QR code with your iPhone camera
2. Safari opens the page
3. Authenticate via Dev Tunnel (GitHub or Microsoft account login)
4. The **dashboard** is displayed

### 3. Session Management (Dashboard)

- **New Session**: Select a working directory and start a new Copilot CLI session
- **Connect**: Connect to an existing active session
- **End**: Terminate a session
- Folder picker for tap-to-select directory navigation (no manual typing)
- Run multiple sessions across different repositories simultaneously

### 4. Local Service Preview

Preview web services you're developing with Copilot CLI directly on your iPhone.

1. Enter a port number in the Dashboard's Preview section (e.g., `3001`)
2. Tap "▶ Open" → An additional Dev Tunnel starts
3. Tap the displayed URL → Preview on iPhone

## File Structure

```
jet-copilot/
├── .env                      # Port config (optional)
├── .gitignore
├── package.json
├── server/
│   ├── index.js              # Express + WebSocket + API server
│   ├── auth.js               # Auth utilities
│   ├── copilot-runner.js     # Spawns copilot via node-pty, relays I/O
│   ├── session-manager.js    # Session management
│   ├── preview-manager.js    # Preview tunnel management
│   └── tunnel.js             # Dev Tunnel auto-start + QR code display
└── public/
    ├── index.html            # Dashboard
    ├── terminal.html         # Terminal screen
    ├── dashboard.js          # Dashboard logic
    ├── app.js                # xterm.js + WebSocket communication
    └── style.css             # Dark mode UI
```

## Security

- **Dev Tunnels**: Automatic HTTPS, GitHub/Microsoft account authentication for access control
- **`.env`**: Included in `.gitignore` and never committed to the repository

## License

Private
