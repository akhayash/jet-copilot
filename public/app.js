let ws = null;
let term = null;
let fitAddon = null;

function connect() {
  const params = new URLSearchParams(window.location.search);
  const sessionId = params.get('session');
  if (!sessionId) {
    window.location.href = '/';
    return;
  }

  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  const url = `${proto}//${location.host}?session=${encodeURIComponent(sessionId)}`;

  ws = new WebSocket(url);

  ws.onopen = () => {
    document.getElementById('status-dot').classList.add('online');
    document.getElementById('status-dot').classList.remove('offline');

    // Show session ID in header
    const label = document.getElementById('session-label');
    if (label) label.textContent = `#${sessionId}`;

    // Initialize xterm.js
    if (!term) {
      term = new Terminal({
        cursorBlink: true,
        fontSize: 14,
        fontFamily: "'SF Mono', 'Fira Code', 'Cascadia Code', 'Menlo', monospace",
        theme: {
          background: '#0d1117',
          foreground: '#e6edf3',
          cursor: '#58a6ff',
          selectionBackground: '#264f78',
          black: '#484f58',
          red: '#ff7b72',
          green: '#3fb950',
          yellow: '#d29922',
          blue: '#58a6ff',
          magenta: '#bc8cff',
          cyan: '#39c5cf',
          white: '#b1bac4',
        },
        allowProposedApi: true,
      });

      fitAddon = new FitAddon.FitAddon();
      term.loadAddon(fitAddon);
      term.loadAddon(new WebLinksAddon.WebLinksAddon());

      term.open(document.getElementById('terminal-container'));
      fitAddon.fit();
      sendResize();

      // Workaround: xterm.js v6.0.0 touch scroll regression (xtermjs/xterm.js#5489)
      const screen = document.querySelector('.xterm-screen');
      if (screen) {
        let touchStartY = null;
        let accumulatedDelta = 0;
        const LINE_HEIGHT = 20;

        screen.addEventListener('touchstart', (e) => {
          if (e.touches.length === 1) {
            touchStartY = e.touches[0].clientY;
            accumulatedDelta = 0;
          }
        }, { passive: true });

        screen.addEventListener('touchmove', (e) => {
          if (touchStartY === null || e.touches.length !== 1) return;
          const deltaY = touchStartY - e.touches[0].clientY;
          touchStartY = e.touches[0].clientY;
          accumulatedDelta += deltaY;

          const lines = Math.trunc(accumulatedDelta / LINE_HEIGHT);
          if (lines !== 0) {
            term.scrollLines(lines);
            accumulatedDelta -= lines * LINE_HEIGHT;
          }
        }, { passive: true });

        screen.addEventListener('touchend', () => {
          touchStartY = null;
          accumulatedDelta = 0;
        }, { passive: true });
      }

      term.onData((data) => {
        if (ws && ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'input', content: data }));
        }
      });

      window.addEventListener('resize', () => {
        if (fitAddon) { fitAddon.fit(); sendResize(); }
      });

      window.addEventListener('orientationchange', () => {
        setTimeout(() => {
          if (fitAddon) { fitAddon.fit(); sendResize(); }
        }, 200);
      });
    }

    term.focus();
  };

  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    if (msg.type === 'output' && term) {
      term.write(msg.content);
    } else if (msg.type === 'error' && term) {
      term.write('\r\n⚠️ ' + msg.content + '\r\n');
    }
  };

  ws.onclose = () => {
    document.getElementById('status-dot').classList.remove('online');
    document.getElementById('status-dot').classList.add('offline');
    if (term) term.write('\r\n[Disconnected. Reconnecting...]\r\n');
    setTimeout(() => connect(), 3000);
  };

  ws.onerror = () => {
    if (term) term.write('\r\n[Connection error]\r\n');
  };
}

function sendResize() {
  if (ws && ws.readyState === WebSocket.OPEN && term) {
    ws.send(JSON.stringify({ type: 'resize', cols: term.cols, rows: term.rows }));
  }
}

function sendKey(key) {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  if (key === 'reset') return; // handled by long-press logic
  const ESC = '\x1b';
  const keys = {
    'esc': ESC,
    'mode': ESC + '[Z',
    'up': ESC + '[A',
    'down': ESC + '[B',
    'enter': '\r',
  };
  const content = keys[key] || key;
  ws.send(JSON.stringify({ type: 'input', content }));
}

// Attach shortcut buttons via JS to avoid focus issues
document.addEventListener('DOMContentLoaded', () => {
  const container = document.getElementById('shortcuts');
  if (!container) return;

  container.addEventListener('touchstart', (e) => {
    const btn = e.target.closest('[data-key]');
    if (btn) {
      e.preventDefault();
      if (btn.dataset.key === 'reset') {
        startResetHold(btn);
      } else {
        sendKey(btn.dataset.key);
      }
    }
  }, { passive: false });

  container.addEventListener('touchend', (e) => {
    const btn = e.target.closest('[data-key]');
    if (btn && btn.dataset.key === 'reset') {
      e.preventDefault();
      endResetHold();
    }
  }, { passive: false });

  container.addEventListener('touchcancel', (e) => {
    endResetHold();
  });

  container.addEventListener('mousedown', (e) => {
    const btn = e.target.closest('[data-key]');
    if (btn) {
      e.preventDefault();
      if (btn.dataset.key === 'reset') {
        startResetHold(btn);
      } else {
        sendKey(btn.dataset.key);
      }
    }
  });

  container.addEventListener('mouseup', (e) => {
    const btn = e.target.closest('[data-key]');
    if (btn && btn.dataset.key === 'reset') {
      e.preventDefault();
      endResetHold();
    }
  });

  container.addEventListener('mouseleave', () => {
    endResetHold();
  });
});

function toggleVoiceInput() {
  const bar = document.getElementById('voice-bar');
  const btn = document.getElementById('voice-toggle');
  const input = document.getElementById('voice-input');

  if (bar.classList.contains('hidden')) {
    bar.classList.remove('hidden');
    btn.classList.add('hidden');
    input.focus();
  } else {
    bar.classList.add('hidden');
    btn.classList.remove('hidden');
    if (term) term.focus();
  }
}

function sendVoiceInput() {
  const input = document.getElementById('voice-input');
  const text = input.value;
  if (text.length === 0) return;
  if (!ws || ws.readyState !== WebSocket.OPEN) {
    alert('Not connected');
    return;
  }

  // Send text, then Enter as separate write to ensure PTY processes it
  ws.send(JSON.stringify({ type: 'input', content: text }));
  setTimeout(() => {
    ws.send(JSON.stringify({ type: 'input', content: '\r' }));
  }, 50);
  input.value = '';
  toggleVoiceInput();
}

// Allow Enter to send from voice input
document.addEventListener('DOMContentLoaded', () => {
  const input = document.getElementById('voice-input');
  if (input) {
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        sendVoiceInput();
      }
    });
  }

  const portInput = document.getElementById('preview-port-input');
  if (portInput) {
    portInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        openPreview();
      }
    });
  }
});

// Preview from terminal
function togglePreviewInput() {
  const bar = document.getElementById('preview-bar');
  const btn = document.getElementById('preview-toggle');
  const input = document.getElementById('preview-port-input');

  if (bar.classList.contains('hidden')) {
    bar.classList.remove('hidden');
    btn.classList.add('hidden');
    input.focus();
  } else {
    bar.classList.add('hidden');
    btn.classList.remove('hidden');
    if (term) term.focus();
  }
}

async function openPreview() {
  const input = document.getElementById('preview-port-input');
  const port = parseInt(input.value, 10);
  if (!port) return;

  input.disabled = true;
  try {
    const res = await fetch('/api/preview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ port }),
    });
    const data = await res.json();
    input.value = '';
    togglePreviewInput();

    if (data.url) {
      const link = document.getElementById('preview-url-link');
      link.href = data.url;
      link.textContent = data.url;
      document.getElementById('preview-result').classList.remove('hidden');
    }
  } catch (err) {
    alert('Preview failed: ' + err.message);
  }
  input.disabled = false;
}

function closePreviewResult() {
  document.getElementById('preview-result').classList.add('hidden');
}

// Terminal reset (tap = soft, long-press = hard restart)
let resetTimer = null;
let resetTriggered = false;

function startResetHold(btn) {
  resetTriggered = false;
  resetTimer = setTimeout(() => {
    resetTriggered = true;
    hardReset();
  }, 1000);
}

function endResetHold() {
  if (resetTimer) {
    clearTimeout(resetTimer);
    resetTimer = null;
  }
  if (!resetTriggered) {
    softReset();
  }
}

function softReset() {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  // Send terminal reset escape sequence (RIS) to restore PTY state
  ws.send(JSON.stringify({ type: 'input', content: '\x1bc' }));
  if (term) {
    term.reset();
  }
}

function hardReset() {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  if (!confirm('Copilot CLIを再起動しますか？')) return;
  ws.send(JSON.stringify({ type: 'restart' }));
  if (term) {
    term.reset();
    term.write('Restarting Copilot CLI...\r\n');
  }
}

window.addEventListener('load', () => connect());
