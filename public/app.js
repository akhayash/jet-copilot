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
});

window.addEventListener('load', () => connect());
