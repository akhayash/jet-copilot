let ws = null;
let term = null;
let fitAddon = null;
let fitTimer = null;
let activeSessionHeaderId = null;
let keyboardLocked = false;
let xtermTextarea = null;
let _keyboardTransition = false;
let _kbTransitionTimer = null;
let _pendingReplay = null;
const isTouchDevice = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;

function debounce(fn, ms) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}

function shouldShowKeyboard(clientY) {
  if (!isTouchDevice) return true;
  if (keyboardLocked) return false;
  const rect = document.getElementById('terminal-container')?.getBoundingClientRect();
  if (!rect) return true;
  // Only show keyboard when touching the bottom 20% of the terminal
  return (clientY - rect.top) > rect.height * 0.8;
}

// Mark keyboard transition in progress to suppress resize thrashing
function beginKeyboardTransition() {
  _keyboardTransition = true;
  clearTimeout(_kbTransitionTimer);
  _kbTransitionTimer = setTimeout(() => {
    _keyboardTransition = false;
    adjustScreenHeight();
    scheduleFit(0);
  }, 400);
}

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

// Adjust screen height to match visual viewport (mobile keyboard workaround)
function adjustScreenHeight() {
  const screen = document.getElementById('terminal-screen');
  if (!screen) return;
  if (window.visualViewport) {
    screen.style.height = `${window.visualViewport.height}px`;
  }
}

// Focus terminal for keyboard input, guarding against transition thrash
function focusTerminal() {
  if (!term || keyboardLocked) return;
  beginKeyboardTransition();
  term.focus();
}

// Workaround: xterm.js v6.0.0 touch scrolling is broken (#5489)
// Also handles keyboard-zone suppression on touch.
function setupTouchScroll(container) {
  const xtermScreen = container.querySelector('.xterm-screen');
  if (!xtermScreen) return;

  let touchStartY = 0;
  let touchActive = false;
  let accumulated = 0;

  xtermScreen.addEventListener('touchstart', (e) => {
    if (e.touches.length === 1) {
      touchStartY = e.touches[0].clientY;
      touchActive = true;
      accumulated = 0;
      if (xtermTextarea) {
        if (shouldShowKeyboard(e.touches[0].clientY)) {
          xtermTextarea.removeAttribute('inputmode');
        } else {
          xtermTextarea.setAttribute('inputmode', 'none');
        }
      }
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

function updateSessionHeader(session) {
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
      updateSessionHeader();
      return;
    }

    const session = await res.json();
    if (activeSessionHeaderId !== sessionId) return;
    updateSessionHeader(session);
  } catch {
    if (activeSessionHeaderId !== sessionId) return;
    updateSessionHeader();
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
      ? `<a href="${AppUtils.escapeHtml(preview.url)}" target="_blank" class="preview-url">${AppUtils.escapeHtml(preview.url)}</a>`
      : '<span class="preview-url">Starting...</span>';
    const open = preview.url
      ? `<a href="${AppUtils.escapeHtml(preview.url)}" target="_blank" class="preview-action-btn">Open <i data-lucide="external-link" class="icon-inline"></i></a>`
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
  if (typeof lucide !== 'undefined') lucide.createIcons();
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
      xtermTextarea = container.querySelector('.xterm-helper-textarea');
      scheduleFit();
      scheduleFit(150);
      if (document.fonts?.ready) {
        document.fonts.ready.then(() => scheduleFit(50)).catch(() => {});
      }

      // Workaround: xterm.js v6.0.0 touch scrolling is broken (#5489)
      setupTouchScroll(container);

      term.onData((data) => {
        if (!ws || ws.readyState !== WebSocket.OPEN) return;
        ws.send(JSON.stringify({ type: 'input', content: data }));
      });

      const resizeObserver = new ResizeObserver(() => {
        if (!_keyboardTransition) scheduleFit(50);
      });
      resizeObserver.observe(container);

      if (window.visualViewport) {
        const debouncedViewportResize = debounce(() => {
          adjustScreenHeight();
          scheduleFit(50);
        }, 150);
        window.visualViewport.addEventListener('resize', () => {
          if (_keyboardTransition) return;
          debouncedViewportResize();
        });
        window.visualViewport.addEventListener('scroll', () => {
          if (!_keyboardTransition) scheduleFit(100);
        });
        adjustScreenHeight();
      }

      window.addEventListener('orientationchange', () => {
        scheduleFit(300);
      });

      window.addEventListener('resize', () => scheduleFit(50));

      // Play queued replay that arrived before terminal was ready
      if (_pendingReplay) {
        term.reset();
        term.write(_pendingReplay);
        _pendingReplay = null;
      }
    }

    if (!keyboardLocked) {
      term.focus();
    }
  };

  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    if (msg.type === 'output' && term) {
      term.write(msg.content);
    } else if (msg.type === 'replay' && term) {
      console.log(`[replay] Received ${msg.content.length} bytes`);
      term.reset();
      term.write(msg.content);
      if (!keyboardLocked) term.focus();
    } else if (msg.type === 'replay' && !term) {
      console.log('[replay] Terminal not ready, queueing replay');
      _pendingReplay = msg.content;
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

function closeAllPanels() {
  const ids = [
    { bar: 'voice-bar', btn: 'voice-toggle' },
    { bar: 'image-bar', btn: 'image-toggle' },
    { bar: 'preview-panel', btn: 'preview-toggle' },
    { bar: 'capture-panel', btn: 'capture-toggle' },
  ];
  ids.forEach(({ bar, btn }) => {
    const barEl = document.getElementById(bar);
    const btnEl = document.getElementById(btn);
    if (barEl) barEl.classList.remove('panel-open');
    if (btnEl) btnEl.classList.remove('active');
  });
}

function toggleBar(barId, btnId, focusId) {
  const bar = document.getElementById(barId);
  const btn = document.getElementById(btnId);
  const opening = !bar.classList.contains('panel-open');

  closeAllPanels();

  if (opening) {
    bar.classList.add('panel-open');
    btn.classList.add('active');
    const focusEl = focusId && document.getElementById(focusId);
    if (focusEl) focusEl.focus();
  } else if (term) {
    term.focus();
  }
}

function toggleVoiceInput() {
  toggleBar('voice-bar', 'voice-toggle', 'voice-input');
}

function toggleKeyboard() {
  keyboardLocked = !keyboardLocked;
  const btn = document.getElementById('kb-toggle');
  if (btn) btn.classList.toggle('active', keyboardLocked);
  if (keyboardLocked && xtermTextarea) {
    xtermTextarea.setAttribute('inputmode', 'none');
    xtermTextarea.blur();
  } else if (xtermTextarea) {
    xtermTextarea.removeAttribute('inputmode');
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

  // Send full text (may contain newlines), then Enter to execute
  ws.send(JSON.stringify({ type: 'input', content: text }));
  setTimeout(() => {
    ws.send(JSON.stringify({ type: 'input', content: '\r' }));
  }, 50);
  input.value = '';
  input.style.height = '';
  toggleVoiceInput();
}

// Ctrl+Enter to send from voice input; Enter inserts newline
document.addEventListener('DOMContentLoaded', () => {
  const input = document.getElementById('voice-input');
  if (input) {
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        sendVoiceInput();
      }
    });
    // Auto-expand textarea height up to max
    input.addEventListener('input', () => {
      input.style.height = '';
      input.style.height = input.scrollHeight + 'px';
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
  const wasHidden = !document.getElementById('preview-panel')?.classList.contains('panel-open');
  toggleBar('preview-panel', 'preview-toggle', 'preview-port-input');
  if (wasHidden) loadSessionPreviews();
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
  await AppUtils.stopPreviewByPort(port, loadSessionPreviews);
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
      alert('Upload failed: server error (status ' + res.status + ')');
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
    document.getElementById('image-file-name').textContent = 'Select image';
    const bar = document.getElementById('image-bar');
    if (bar.classList.contains('panel-open')) toggleImageUpload();
  } catch (err) {
    alert('Upload failed: ' + err.message);
  }
}

// File input change handler & clipboard paste
document.addEventListener('DOMContentLoaded', () => {
  const fileInput = document.getElementById('image-file-input');
  if (fileInput) {
    fileInput.addEventListener('change', () => {
      const name = fileInput.files[0]?.name || 'Select image';
      document.getElementById('image-file-name').textContent = name;
    });
  }

  // Tap outside panels to dismiss and re-focus terminal
  const container = document.getElementById('terminal-container');
  if (container) {
    container.addEventListener('pointerdown', (e) => {
      closeAllPanels();
      // On touch devices, defer focus to touchend to avoid double-focus thrash
      if (isTouchDevice) return;
      if (term && shouldShowKeyboard(e.clientY)) term.focus();
    });
  }

  // Re-focus terminal when page becomes visible (tab switch, screen unlock)
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && term && !keyboardLocked) {
      setTimeout(() => term.focus(), 100);
    }
  });

  // Re-focus terminal on any touch in the terminal screen area
  const screen = document.getElementById('terminal-screen');
  if (screen) {
    screen.addEventListener('touchend', (e) => {
      // Don't steal focus from buttons, panels, or inputs
      const tag = e.target.tagName;
      if (tag === 'BUTTON' || tag === 'SELECT' || tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'A') return;
      if (e.target.closest('.toolbar, .voice-bar, .preview-panel, .capture-panel, .capture-modal')) return;
      const touch = e.changedTouches?.[0];
      if (term && touch && shouldShowKeyboard(touch.clientY)) focusTerminal();
    }, { passive: true });
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
  if (!keyboardLocked) term.focus();
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
  if (!confirm('Restart Copilot CLI?')) return;
  ws.send(JSON.stringify({ type: 'restart' }));
  if (term) {
    term.reset();
    term.write('Restarting Copilot CLI...\r\n');
    if (!keyboardLocked) term.focus();
  }
}

// Window capture
let lastCaptureResult = null;
let lastCaptureWindowId = null;

function toggleCapturePanel() {
  const wasHidden = !document.getElementById('capture-panel')?.classList.contains('panel-open');
  toggleBar('capture-panel', 'capture-toggle');
  if (wasHidden) loadCaptureWindows();
}

async function loadCaptureWindows() {
  AppUtils.loadWindowOptions('capture-window-select');
}

async function captureWindow() {
  const select = document.getElementById('capture-window-select');
  const windowId = parseInt(select?.value, 10);
  if (!windowId) return;

  lastCaptureWindowId = windowId;

  try {
    const res = await fetch('/api/capture', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ windowId }),
    });
    const data = await res.json();
    if (!res.ok) {
      alert('Capture failed: ' + (data.error || 'Unknown error'));
      return;
    }
    lastCaptureResult = data;
    showCaptureModal(data);
  } catch (err) {
    alert('Capture failed: ' + err.message);
  }
}

function showCaptureModal(data) {
  const modal = document.getElementById('capture-modal');
  const img = document.getElementById('capture-modal-img');
  const info = document.getElementById('capture-modal-info');
  if (!modal || !img) return;

  img.src = data.url + '?t=' + Date.now();
  info.textContent = `${data.width}×${data.height}`;
  modal.classList.remove('hidden');
}

function closeCaptureModal(event) {
  if (event && event.target !== document.getElementById('capture-modal')) return;
  document.getElementById('capture-modal')?.classList.add('hidden');
  if (term) term.focus();
}

async function recaptureWindow() {
  if (lastCaptureWindowId) {
    const select = document.getElementById('capture-window-select');
    if (select) select.value = String(lastCaptureWindowId);
    await captureWindow();
  }
}

function copyCapturedPath() {
  if (!lastCaptureResult?.path) return;
  const fpath = lastCaptureResult.path.replace(/\\/g, '/');
  navigator.clipboard?.writeText(fpath).then(() => {
    const info = document.getElementById('capture-modal-info');
    if (info) {
      const orig = info.textContent;
      info.textContent = 'Copied!';
      setTimeout(() => { info.textContent = orig; }, 1500);
    }
  });
}

function sendCapturedPath() {
  if (!lastCaptureResult?.path || !ws || ws.readyState !== WebSocket.OPEN) return;
  const fpath = lastCaptureResult.path.replace(/\\/g, '/');
  ws.send(JSON.stringify({ type: 'input', content: `@${fpath} ` }));
  closeCaptureModal();
}

// ESC closes capture modal
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    const modal = document.getElementById('capture-modal');
    if (modal && !modal.classList.contains('hidden')) {
      e.preventDefault();
      closeCaptureModal();
    }
  }
});

window.addEventListener('load', () => connect());
window.setInterval(() => {
  const panel = document.getElementById('preview-panel');
  if (panel && panel.classList.contains('panel-open')) {
    loadSessionPreviews();
  }
}, 5000);
