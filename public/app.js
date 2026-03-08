let ws = null;
let term = null;
let fitAddon = null;
let fitTimer = null;
let activeSessionHeaderId = null;
let previewPanelVisible = false;

function scheduleFit(delay = 0) {
  if (fitTimer) clearTimeout(fitTimer);
  fitTimer = setTimeout(() => {
    if (!fitAddon || !term) return;
    requestAnimationFrame(() => {
      fitAddon.fit();
      sendResize();
    });
  }, delay);
}

function updateSessionHeader(_sessionId, session) {
  const context = document.getElementById('session-context');
  const label = document.getElementById('session-label');
  if (!context || !label) return;

  context.textContent = session?.displayName || '';
  label.textContent = session?.cwd || '';
}

async function loadSessionHeader(sessionId) {
  activeSessionHeaderId = sessionId;
  try {
    const res = await fetch(`/api/sessions/${encodeURIComponent(sessionId)}`);
    if (!res.ok || activeSessionHeaderId !== sessionId) {
      updateSessionHeader(sessionId);
      return;
    }

    const session = await res.json();
    if (activeSessionHeaderId !== sessionId) return;
    updateSessionHeader(sessionId, session);
  } catch {
    if (activeSessionHeaderId !== sessionId) return;
    updateSessionHeader(sessionId);
  }
}

function renderSessionPreviewList(list) {
  const container = document.getElementById('session-preview-list');
  const summary = document.getElementById('session-preview-summary');
  if (!container || !summary) return;

  if (list.length === 0) {
    summary.classList.add('hidden');
    container.innerHTML = '<div class="preview-empty">No previews for this session yet. Open a local port to view it on your device.</div>';
    return;
  }

  summary.classList.remove('hidden');
  summary.textContent = `${list.length} preview${list.length === 1 ? '' : 's'} active`;
  container.innerHTML = list.map((preview) => {
    const url = preview.url
      ? `<a href="${preview.url}" target="_blank" class="preview-url">${preview.url}</a>`
      : '<span class="preview-url">Starting...</span>';
    const open = preview.url
      ? `<a href="${preview.url}" target="_blank" class="preview-action-btn">Open ↗</a>`
      : '';
    return `
      <div class="preview-item">
        <div class="preview-meta">
          <span class="preview-port-badge">Port ${preview.port}</span>
          ${url}
        </div>
        <div class="preview-actions">
          ${open}
          <button class="preview-stop-btn" onclick="stopPreview(${preview.port})">Stop</button>
        </div>
      </div>
    `;
  }).join('');
}

async function loadSessionPreviews() {
  try {
    const res = await fetch('/api/preview');
    const list = await res.json();
    renderSessionPreviewList(list);
  } catch {
    renderSessionPreviewList([]);
  }
}

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

    loadSessionHeader(sessionId);
    loadSessionPreviews();

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

      const container = document.getElementById('terminal-container');
      term.open(container);
      scheduleFit();
      scheduleFit(150);
      if (document.fonts?.ready) {
        document.fonts.ready.then(() => scheduleFit(50)).catch(() => {});
      }

      // Workaround: xterm.js v6.0.0 touch scrolling is broken (#5489)
      const xtermScreen = container.querySelector('.xterm-screen');
      if (xtermScreen) {
        let touchStartY = 0;
        let touchActive = false;
        let accumulated = 0;

        xtermScreen.addEventListener('touchstart', (e) => {
          if (e.touches.length === 1) {
            touchStartY = e.touches[0].clientY;
            touchActive = true;
            accumulated = 0;
          }
        }, { passive: true });

        xtermScreen.addEventListener('touchmove', (e) => {
          if (!touchActive || e.touches.length !== 1) return;
          e.preventDefault();
          const currentY = e.touches[0].clientY;
          const delta = touchStartY - currentY;
          accumulated += delta;
          const lineH = Math.ceil(14 * 1.2);
          const lines = Math.trunc(accumulated / lineH);
          if (lines !== 0) {
            term.scrollLines(lines);
            accumulated -= lines * lineH;
          }
          touchStartY = currentY;
        }, { passive: false });

        xtermScreen.addEventListener('touchend', () => {
          touchActive = false;
        }, { passive: true });
      }

      // Debounce duplicate composition events (iOS dictation fires compositionend + input)
      let lastInputData = '';
      let lastInputTime = 0;

      term.onData((data) => {
        const now = Date.now();
        if (data.length > 1 && data === lastInputData && now - lastInputTime < 100) {
          return;
        }
        lastInputData = data;
        lastInputTime = now;

        if (ws && ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'input', content: data }));
        }
      });

      const resizeObserver = new ResizeObserver(() => scheduleFit(50));
      resizeObserver.observe(container);

      if (window.visualViewport) {
        window.visualViewport.addEventListener('resize', () => scheduleFit(50));
        window.visualViewport.addEventListener('scroll', () => scheduleFit(50));
      }

      window.addEventListener('orientationchange', () => {
        scheduleFit(300);
      });

      window.addEventListener('resize', () => scheduleFit(50));
    }

    term.focus();
  };

  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    if (msg.type === 'output' && term) {
      term.write(msg.content);
    } else if (msg.type === 'error') {
      console.warn('[server]', msg.content);
    }
  };

  ws.onclose = () => {
    document.getElementById('status-dot').classList.remove('online');
    document.getElementById('status-dot').classList.add('offline');
    setTimeout(() => connect(), 3000);
  };

  ws.onerror = () => {};
}

function sendResize() {
  if (ws && ws.readyState === WebSocket.OPEN && term) {
    ws.send(JSON.stringify({ type: 'resize', cols: term.cols, rows: term.rows }));
  }
}

function sendKey(key) {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  if (key === 'reset') return; // handled by long-press logic
  const content = window.AppUtils.getShortcutContent(key);
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

// Clipboard paste button (for mobile where context menu paste is unavailable)
async function pasteFromClipboard() {
  if (!ws || ws.readyState !== WebSocket.OPEN) {
    alert('Not connected');
    return;
  }

  try {
    if (navigator.clipboard?.read) {
      const items = await navigator.clipboard.read();
      for (const item of items) {
        const imageType = item.types.find(t => t.startsWith('image/'));
        if (imageType) {
          const blob = await item.getType(imageType);
          uploadImage(new File([blob], 'clipboard.png', { type: imageType }));
          return;
        }
      }
    }

    if (navigator.clipboard?.readText) {
      const text = await navigator.clipboard.readText();
      if (text.length > 0) {
        ws.send(JSON.stringify({ type: 'input', content: text }));
        if (term) term.focus();
        return;
      }
    }

    // Fallback: open voice input bar for manual paste
    toggleVoiceInput();
  } catch {
    // Permission denied or API unavailable — fall back to text input bar
    toggleVoiceInput();
  }
}

// Preview from terminal
function togglePreviewInput() {
  const panel = document.getElementById('preview-panel');
  const button = document.getElementById('preview-toggle');
  if (!panel || !button) return;

  previewPanelVisible = !previewPanelVisible;
  panel.classList.toggle('hidden', !previewPanelVisible);
  button.classList.toggle('hidden', previewPanelVisible);

  if (previewPanelVisible) {
    loadSessionPreviews();
    const input = document.getElementById('preview-port-input');
    if (input) input.focus();
  } else if (term) {
    term.focus();
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
    loadSessionPreviews();
    if (data.url && term) {
      term.writeln(`\r\n[Preview ready] ${data.url}\r\n`);
    }
  } catch (err) {
    alert('Preview failed: ' + err.message);
  }
  input.disabled = false;
}

async function stopPreview(port) {
  try {
    await fetch(`/api/preview/${port}`, { method: 'DELETE' });
    loadSessionPreviews();
  } catch (err) {
    alert('Failed to stop preview: ' + err.message);
  }
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
  scheduleFit();
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
window.setInterval(() => {
  if (previewPanelVisible) {
    loadSessionPreviews();
  }
}, 5000);
