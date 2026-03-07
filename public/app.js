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

function toggleBar(barId, btnId, focusId) {
  const bar = document.getElementById(barId);
  const btn = document.getElementById(btnId);

  if (bar.classList.contains('hidden')) {
    bar.classList.remove('hidden');
    btn.classList.add('hidden');
    const focusEl = focusId && document.getElementById(focusId);
    if (focusEl) focusEl.focus();
  } else {
    bar.classList.add('hidden');
    btn.classList.remove('hidden');
    if (term) term.focus();
  }
}

function toggleVoiceInput() {
  toggleBar('voice-bar', 'voice-toggle', 'voice-input');
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
  toggleBar('preview-bar', 'preview-toggle', 'preview-port-input');
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

// Image upload
function toggleImageUpload() {
  toggleBar('image-bar', 'image-toggle');
}

async function uploadImage(file) {
  if (!file) {
    const input = document.getElementById('image-file-input');
    file = input.files[0];
  }
  if (!file) return;
  if (!ws || ws.readyState !== WebSocket.OPEN) {
    alert('Not connected');
    return;
  }

  const params = new URLSearchParams(window.location.search);
  const sessionId = params.get('session');

  const formData = new FormData();
  formData.append('image', file);
  formData.append('session', sessionId);

  try {
    const res = await fetch('/api/upload', { method: 'POST', body: formData });
    let data;
    try {
      data = await res.json();
    } catch {
      alert('Upload failed: サーバーエラー (status ' + res.status + ')');
      return;
    }
    if (!res.ok) {
      alert('Upload failed: ' + (data.error || 'Unknown error'));
      return;
    }
    // Send @filepath to Copilot CLI (use forward slashes for compatibility)
    const fpath = data.path.replace(/\\/g, '/');
    ws.send(JSON.stringify({ type: 'input', content: `@${fpath} ` }));

    // Reset UI
    const input = document.getElementById('image-file-input');
    input.value = '';
    document.getElementById('image-file-name').textContent = '画像を選択';
    const bar = document.getElementById('image-bar');
    if (!bar.classList.contains('hidden')) toggleImageUpload();
  } catch (err) {
    alert('Upload failed: ' + err.message);
  }
}

// File input change handler & clipboard paste
document.addEventListener('DOMContentLoaded', () => {
  const fileInput = document.getElementById('image-file-input');
  if (fileInput) {
    fileInput.addEventListener('change', () => {
      const name = fileInput.files[0]?.name || '画像を選択';
      document.getElementById('image-file-name').textContent = name;
    });
  }

  // Clipboard paste: upload image if pasted on terminal screen
  document.addEventListener('paste', (e) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of items) {
      if (item.type.startsWith('image/')) {
        e.preventDefault();
        uploadImage(item.getAsFile());
        return;
      }
    }
  });
});

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
  if (!ws || ws.readyState !== WebSocket.OPEN || !term) return;
  term.reset();
  fitAddon.fit();
  term.focus();
  // Force TUI redraw by triggering a resize (SIGWINCH)
  const cols = term.cols;
  const rows = term.rows;
  ws.send(JSON.stringify({ type: 'resize', cols, rows: rows - 1 }));
  setTimeout(() => {
    ws.send(JSON.stringify({ type: 'resize', cols, rows }));
  }, 50);
}

function hardReset() {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  if (!confirm('Copilot CLIを再起動しますか？')) return;
  ws.send(JSON.stringify({ type: 'restart' }));
  if (term) {
    term.reset();
    term.write('Restarting Copilot CLI...\r\n');
    term.focus();
  }
}

window.addEventListener('load', () => connect());
