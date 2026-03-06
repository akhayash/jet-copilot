async function loadStatus() {
  try {
    const res = await fetch('/api/status');
    const status = await res.json();

    const dot = document.getElementById('status-indicator');
    const text = document.getElementById('status-text');
    const cwdInput = document.getElementById('cwd-input');

    dot.classList.remove('offline');
    dot.classList.add('online');
    text.textContent = `Online · up ${formatUptime(status.uptime)}`;

    // Set default cwd as placeholder
    if (status.defaultCwd && !cwdInput.dataset.loaded) {
      cwdInput.placeholder = status.defaultCwd;
      cwdInput.dataset.loaded = 'true';
    }
  } catch {
    document.getElementById('status-text').textContent = 'Offline';
  }
}

async function loadSessions() {
  try {
    const res = await fetch('/api/sessions');
    const sessions = await res.json();

    const active = sessions.filter((s) => s.status === 'active');
    const past = sessions.filter((s) => s.status === 'ended');

    renderSessions('active-section', 'active-sessions', active, true);
    renderSessions('past-section', 'past-sessions', past, false);
  } catch {
    // Ignore
  }
}

function renderSessions(sectionId, containerId, sessions, showConnect) {
  const section = document.getElementById(sectionId);
  const container = document.getElementById(containerId);

  if (sessions.length === 0) {
    section.classList.add('hidden');
    return;
  }

  section.classList.remove('hidden');
  container.innerHTML = sessions.map((s) => {
    const time = formatTime(s.startedAt);
    const endTime = s.endedAt ? ` – ${formatTime(s.endedAt)}` : '';
    const statusIcon = s.status === 'active' ? '🟢' : '⚫';
    const connectBtn = showConnect
      ? `<button class="connect-btn" onclick="connectSession('${s.id}')">Connect →</button>`
      : '';
    const clients = s.clientCount > 0 ? `<span class="client-badge">${s.clientCount} connected</span>` : '';
    const cwdLabel = s.cwd ? `<div class="session-cwd">📁 ${s.cwd}</div>` : '';

    return `
      <div class="session-card">
        <div class="session-info">
          <span class="session-id">${statusIcon} Session #${s.id}</span>
          ${clients}
        </div>
        ${cwdLabel}
        <div class="session-time">${time}${endTime}</div>
        ${connectBtn}
      </div>
    `;
  }).join('');
}

async function createSession() {
  try {
    const cwdInput = document.getElementById('cwd-input');
    const cwd = cwdInput.value.trim() || undefined;
    const body = cwd ? JSON.stringify({ cwd }) : '{}';
    const res = await fetch('/api/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    });
    const { id } = await res.json();
    window.location.href = `/terminal?session=${id}`;
  } catch (err) {
    alert('Failed to create session: ' + err.message);
  }
}

function connectSession(id) {
  window.location.href = `/terminal?session=${id}`;
}

function formatUptime(ms) {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  if (h > 0) return `${h}h ${m % 60}m`;
  if (m > 0) return `${m}m`;
  return `${s}s`;
}

function formatTime(iso) {
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

// Load on start and refresh periodically
loadStatus();
loadSessions();
setInterval(() => { loadStatus(); loadSessions(); }, 5000);
