# 🚀 Jet Copilot

**English** | [日本語](README.ja.md)

A web app to remotely operate GitHub Copilot CLI from any mobile or desktop browser.

Launches an interactive `copilot` session on your local PC and streams it to your device via [xterm.js](https://xtermjs.org/) full terminal emulation. Securely exposed to the internet through [Microsoft Dev Tunnels](https://learn.microsoft.com/azure/developer/dev-tunnels/) with instant QR code access.

## Architecture

```
Browser (any device)  ── HTTPS ──  Dev Tunnels (Microsoft Cloud)  ── tunnel ──  Local PC
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
  - Windows: `winget install Microsoft.devtunnel`
  - macOS: `brew install --cask devtunnel`
  - Linux: `curl -sL https://aka.ms/DevTunnelCliInstall | bash`
  - Auth: `devtunnel user login -g` (GitHub account)
    or `devtunnel user login -e` (Microsoft / Entra ID account)
- **Windows / macOS / Linux**
- **Build tools** (required by node-pty for native compilation during `npm install`):
  - Windows: [Visual Studio Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/) with C++ workload
  - macOS: `xcode-select --install`
  - Linux: `sudo apt install build-essential`

## Setup

```bash
# 1. Clone
git clone https://github.com/akhayash/jet-copilot.git
cd jet-copilot

# 2. Install dependencies
npm install

# 3. Login to Dev Tunnels (first time only)
devtunnel user login -g    # GitHub account
# or: devtunnel user login -e  (Microsoft / Entra ID account)
```

### `.env` Configuration (Optional)

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Server port number | `3000` |

## Usage

### 1. Start the Server

```bash
node server/index.js
# or
npm start
```

The terminal will display:
- 🚀 Server URL (localhost)
- 🔗 Dev Tunnel public URL
- 📱 **QR code** (scan with your phone camera)

### 2. Connect from Your Device

1. Scan the QR code with your phone camera, or open the URL in any browser
2. Authenticate via Dev Tunnel (GitHub or Microsoft account login)
3. The **dashboard** is displayed

### 3. Session Management (Dashboard)

- **New Session**: Select a working directory and start a new Copilot CLI session
- **Connect**: Connect to an existing active session
- **End**: Terminate a session
- Folder picker for tap-to-select directory navigation (no manual typing)
  - **Search / Filter**: Type to filter folders in real time (case-insensitive)
- **New Folder**: Create a new directory directly from the folder picker
- Run multiple sessions across different repositories simultaneously
- **Status indicators**: 🟢 active / ⚫ ended, with connected-client count badge
- **Uptime display**: Shows server uptime in the status bar
- **Version & Update**: Footer shows current version; tap the 🔄 Update button to pull the latest code and restart

### 4. Terminal Features

Full interactive terminal via [xterm.js](https://xtermjs.org/) v6 with clickable URLs.

#### Shortcut Buttons (header)

| Button | Action |
|--------|--------|
| **ESC** | Cancel Copilot operations |
| **Mode** | Switch Copilot CLI modes (sends Shift+Tab) |
| **↑ ↓** | Navigate menus and selection lists |
| **Enter** | Confirm selection |
| **Reset** | **Short press** — soft reset (clear screen, redraw TUI). **Long press (1 s+)** — hard restart the Copilot CLI process (confirmation dialog) |

#### Floating Toolbar

Five action buttons are always accessible at the bottom of the terminal:

| Button | Feature | Details |
|--------|---------|---------|
| 🔗 **Preview** | Manage local-service previews | Open a preview by port number; list / stop active previews (same as Dashboard preview) |
| 📎 **Upload** | Upload an image to the session | Select an image from your device (max 10 MB). The file is saved under `.copilot-uploads` in the session directory and the path is sent to Copilot CLI as `@filepath` |
| 📋 **Paste** | Paste from clipboard | Reads text or image from the clipboard. Text is sent directly to the terminal; images are automatically uploaded. Falls back to the text-input panel if clipboard access is denied |
| ⌨️ **Voice / Text** | Multiline text input | Opens a text area with speech-to-text support. Press **Enter** to add a new line; press **Ctrl+Enter** (Cmd+Enter on Mac) to send. The text area auto-expands as you type |
| 📸 **Capture** | Window screenshot | Capture any window on the server machine (see [Window Capture](#window-capture) below) |

#### Window Capture

1. Tap 📸 → select a window from the dropdown → **Capture**
2. The screenshot is displayed in a modal with its dimensions
3. Actions in the modal:
   - **Re-capture** — capture the same window again
   - **Copy Path** — copy the image file path to the clipboard
   - **Send to CLI** — send the path as `@filepath` to Copilot CLI
4. Close the modal by tapping outside it or pressing **ESC**

Window capture is also available on the Dashboard under the Capture section.

### 5. Local Service Preview

Preview web services you're developing with Copilot CLI directly on your device.

1. Enter a port number in the Dashboard's Quick Preview section **or** from the 🔗 Preview button inside a terminal session
2. Tap "Open" / "▶ Open" → An additional Dev Tunnel starts
3. Open the displayed URL on your device
4. Active previews refresh every 5 seconds; tap **Stop** to tear down the tunnel

## File Structure

```
jet-copilot/
├── .env                      # Port config (optional)
├── package.json
├── eslint.config.js          # ESLint 9 flat config
├── bin/
│   └── jet-copilot.js        # Restart wrapper (exit 100 → re-fork)
├── server/
│   ├── index.js              # Express + WebSocket + API server
│   ├── copilot-runner.js     # Spawns copilot via node-pty, relays I/O
│   ├── session-manager.js    # Session management
│   ├── session-context.js    # Repo root detection for session context
│   ├── preview-manager.js    # Preview tunnel management
│   ├── window-capture.js     # Cross-platform window screenshot
│   ├── tunnel.js             # Dev Tunnel auto-start + QR code display
│   └── load-env.js           # .env loader with cwd priority
├── public/
│   ├── index.html            # Dashboard
│   ├── terminal.html         # Terminal screen
│   ├── dashboard.js          # Dashboard logic
│   ├── app.js                # xterm.js + WebSocket communication
│   ├── app-utils.js          # Shared utilities (browser/CommonJS)
│   └── style.css             # Dark mode UI
└── test/                     # Tests (node:test + supertest)
    ├── api.test.js
    ├── app-utils.test.js
    └── ...
```

## Security

- **Dev Tunnels**: Automatic HTTPS, GitHub/Microsoft account authentication for access control
- **`.env`**: Included in `.gitignore` and never committed to the repository

## License

Private
