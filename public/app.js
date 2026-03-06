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
        scrollback: 5000,
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
      fitAddon.fit();
      sendResize();

      // Custom scroll indicator (iOS Safari ignores CSS scrollbar styling)
      const scrollTrack = document.createElement('div');
      scrollTrack.className = 'scroll-track';
      const scrollThumb = document.createElement('div');
      scrollThumb.className = 'scroll-thumb';
      scrollTrack.appendChild(scrollThumb);
      container.appendChild(scrollTrack);

      function updateScrollIndicator() {
        try {
          const buf = term.buffer.active;
          const totalLines = buf.length;
          const visibleRows = term.rows;
          if (totalLines <= visibleRows) {
            scrollTrack.style.display = 'none';
            return;
          }
          scrollTrack.style.display = 'block';
          const trackH = container.clientHeight - 8;
          const thumbH = Math.max(20, (visibleRows / totalLines) * trackH);
          const maxScroll = totalLines - visibleRows;
          const scrollPos = buf.viewportY;
          const thumbTop = maxScroll > 0 ? (scrollPos / maxScroll) * (trackH - thumbH) : 0;
          scrollThumb.style.height = thumbH + 'px';
          scrollThumb.style.transform = 'translateY(' + thumbTop + 'px)';
        } catch (e) { /* ignore */ }
      }

      term.onScroll(() => updateScrollIndicator());
      // Poll to catch new output (onRender/onWriteParsed may not fire in CDN build)
      setInterval(updateScrollIndicator, 500);

      // Workaround: xterm.js v6.0.0 touch scrolling is broken (#5489)
      // Manually handle touch events on the terminal screen
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
          // Scroll by lines based on accumulated pixel movement
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

      // Re-fit after layout settles (fixes initial sizing on mobile)
      requestAnimationFrame(() => {
        fitAddon.fit();
        sendResize();
      });

      term.onData((data) => {
        if (ws && ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'input', content: data }));
        }
      });

      // Debounced fit helper
      let fitTimer = null;
      function debouncedFit() {
        if (fitTimer) clearTimeout(fitTimer);
        fitTimer = setTimeout(() => {
          if (fitAddon) { fitAddon.fit(); sendResize(); }
        }, 100);
      }

      // ResizeObserver: reliably tracks container size changes
      const resizeObserver = new ResizeObserver(() => debouncedFit());
      resizeObserver.observe(container);

      // visualViewport: tracks mobile keyboard show/hide and browser chrome changes
      if (window.visualViewport) {
        window.visualViewport.addEventListener('resize', () => debouncedFit());
      }

      window.addEventListener('orientationchange', () => {
        setTimeout(() => debouncedFit(), 200);
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
      sendKey(btn.dataset.key);
    }
  }, { passive: false });

  container.addEventListener('mousedown', (e) => {
    const btn = e.target.closest('[data-key]');
    if (btn) {
      e.preventDefault();
      sendKey(btn.dataset.key);
    }
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

window.addEventListener('load', () => connect());

// iOS Safari: prevent page-level scroll while allowing xterm internal scroll
document.addEventListener('touchmove', (e) => {
  if (e.target.closest('.xterm-viewport') || e.target.closest('.xterm-screen')) {
    return;
  }
  // Allow scroll in voice/preview bars and dashboard content
  if (e.target.closest('.voice-bar') || e.target.closest('.dashboard-content') || e.target.closest('.folder-browser')) {
    return;
  }
  e.preventDefault();
}, { passive: false });
