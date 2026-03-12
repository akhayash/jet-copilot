async function loadStatus() {
  try {
    const [statusRes, versionRes] = await Promise.all([
      fetch('/api/status'),
      fetch('/api/version'),
    ]);
    const status = await statusRes.json();
    const version = await versionRes.json();

    const dot = document.getElementById('status-indicator');
    const text = document.getElementById('status-text');
    const cwdInput = document.getElementById('cwd-input');

    dot.classList.remove('offline');
    dot.classList.add('online');
    text.textContent = `Online · up ${formatUptime(status.uptime)}`;

    if (status.defaultCwd && !cwdInput.dataset.loaded) {
      cwdInput.placeholder = status.defaultCwd;
      cwdInput.dataset.loaded = 'true';
    }

    // Show version in footer
    const versionText = document.getElementById('version-text');
    if (versionText) versionText.textContent = `v${version.version}`;

    const updateBtn = document.getElementById('update-btn');
    if (updateBtn) {
      updateBtn.style.display = version.updatable ? '' : 'none';
    }

    // Hide capture section if not available (e.g. headless Linux)
    const captureSection = document.querySelector('.capture-section');
    if (captureSection) {
      captureSection.style.display = status.captureAvailable ? '' : 'none';
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
      ? `<div class="session-actions">
           <button class="connect-btn" onclick="connectSession('${s.id}')">Connect →</button>
           <button class="end-btn" onclick="endSession('${s.id}')">End</button>
         </div>`
      : '';
    const clients = s.clientCount > 0 ? `<span class="client-badge">${s.clientCount} connected</span>` : '';
    const repoLabel = s.repoName
      ? `<span class="session-display-name">${AppUtils.escapeHtml(s.repoName)}</span>`
      : '';
    const folderLabel = s.folderName && s.folderName !== s.repoName
      ? `<span class="session-folder-name">${AppUtils.escapeHtml(s.folderName)}</span>`
      : '';
    const dirLabel = !s.repoName && s.folderName
      ? `<span class="session-display-name">${AppUtils.escapeHtml(s.folderName)}</span>`
      : '';
    const cwdLabel = s.cwd ? `<div class="session-cwd">📁 ${AppUtils.escapeHtml(s.cwd)}</div>` : '';

    return `
      <div class="session-card">
        <div class="session-info">
          <span class="session-id">${statusIcon} #${s.id}</span>
          ${repoLabel}${folderLabel}${dirLabel}
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

async function endSession(id) {
  if (!confirm(`Session #${id} を終了しますか？`)) return;
  try {
    await fetch(`/api/sessions/${id}`, { method: 'DELETE' });
    loadSessions();
  } catch (err) {
    alert('Failed to end session: ' + err.message);
  }
}

// Folder browser
let currentBrowseData = null;

async function openBrowser() {
  const browser = document.getElementById('folder-browser');
  const cwdInput = document.getElementById('cwd-input');
  const startPath = cwdInput.value || undefined;

  browser.classList.remove('hidden');
  document.getElementById('folder-filter').value = '';
  await browseTo(startPath);
}

async function browseTo(dirPath) {
  try {
    const query = dirPath ? `?path=${encodeURIComponent(dirPath)}` : '';
    const res = await fetch(`/api/browse${query}`);
    const data = await res.json();

    if (data.error) {
      alert(data.error);
      return;
    }

    document.getElementById('cwd-input').value = data.current;

    const currentEl = document.getElementById('folder-current');
    currentEl.textContent = data.current;

    currentBrowseData = data;
    document.getElementById('folder-filter').value = '';
    renderFolderList(data, '');
  } catch (err) {
    alert('Browse error: ' + err.message);
  }
}

function selectFolder() {
  document.getElementById('folder-browser').classList.add('hidden');
}

function renderFolderList(data, filter) {
  const sep = data.sep || '\\';
  const listEl = document.getElementById('folder-list');

  const actionsHtml = `<div class="folder-actions">
    <button class="folder-action-btn" onclick="selectFolder()">Select</button>
    <button class="folder-action-btn" onclick="createFolder('${escapeAttr(data.current)}', '${escapeAttr(sep)}')">+ New Folder</button>
  </div>`;

  let html = actionsHtml;

  // Parent directory (always visible)
  if (data.parent !== data.current && !filter) {
    html += `<div class="folder-item" onclick="browseTo('${escapeAttr(data.parent)}')">📂 ..</div>`;
  }

  const lowerFilter = filter.toLowerCase();
  const dirs = filter
    ? data.directories.filter((d) => d.toLowerCase().includes(lowerFilter))
    : data.directories;

  for (const dir of dirs) {
    const full = data.current + sep + dir;
    html += `<div class="folder-item" onclick="browseTo('${escapeAttr(full)}')">📁 ${dir}</div>`;
  }

  if (filter && dirs.length === 0) {
    html += `<div class="folder-item" style="color:var(--text-muted);cursor:default">一致するフォルダがありません</div>`;
  }

  listEl.innerHTML = html;
}

async function createFolder(parentPath, sep) {
  const name = prompt('Folder name:');
  if (!name) return;

  const fullPath = parentPath + sep + name;
  try {
    const res = await fetch('/api/mkdir', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: fullPath }),
    });
    const data = await res.json();
    if (data.error) {
      alert(data.error);
      return;
    }
    // Navigate into the new folder and select it
    await browseTo(data.created);
  } catch (err) {
    alert('Failed to create folder: ' + err.message);
  }
}

function escapeAttr(str) {
  return str.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
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

function formatDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const today = new Date();
  if (d.toDateString() === today.toDateString()) return formatTime(iso);
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ' ' + formatTime(iso);
}

async function loadCopilotSessions() {
  try {
    const cwdInput = document.getElementById('cwd-input');
    const cwd = cwdInput.value.trim() || undefined;
    const query = cwd ? `?cwd=${encodeURIComponent(cwd)}` : '';
    const res = await fetch(`/api/copilot-sessions${query}`);
    const sessions = await res.json();

    const section = document.getElementById('copilot-sessions-section');
    const container = document.getElementById('copilot-sessions');

    if (!sessions.length) {
      section.classList.add('hidden');
      return;
    }

    section.classList.remove('hidden');
    container.innerHTML = sessions.slice(0, 20).map((s) => {
      const time = formatDate(s.updatedAt || s.createdAt);
      const summary = s.summary
        ? `<div class="session-summary">${AppUtils.escapeHtml(s.summary)}</div>`
        : '';
      const branch = s.branch
        ? `<span class="branch-badge">${AppUtils.escapeHtml(s.branch)}</span>`
        : '';

      return `
        <div class="session-card">
          <div class="session-info">
            <span class="session-id">💬 ${AppUtils.escapeHtml(s.copilotSessionId.substring(0, 8))}</span>
            ${branch}
          </div>
          ${summary}
          <div class="session-time">${time}</div>
          <div class="session-actions">
            <button class="connect-btn" onclick="resumeCopilotSession('${AppUtils.escapeHtml(s.copilotSessionId)}', '${escapeAttr(s.cwd || '')}')">Resume →</button>
          </div>
        </div>
      `;
    }).join('');
  } catch {
    // Ignore
  }
}

async function resumeCopilotSession(copilotSessionId, cwd) {
  try {
    const body = { copilotSessionId };
    if (cwd) body.cwd = cwd;
    const res = await fetch('/api/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const { id } = await res.json();
    window.location.href = `/terminal?session=${id}`;
  } catch (err) {
    alert('Failed to resume session: ' + err.message);
  }
}

// Load on start and refresh periodically
loadStatus();
loadSessions();
loadPreviews();
loadCopilotSessions();
setInterval(() => { loadStatus(); loadSessions(); loadPreviews(); }, 5000);

// QR code modal
let qrCurrentUrl = null;

async function showQrModal() {
  const modal = document.getElementById('qr-modal');
  const imageEl = document.getElementById('qr-image');
  const urlEl = document.getElementById('qr-url');

  imageEl.innerHTML = '<span style="color:var(--text-muted)">Loading...</span>';
  urlEl.textContent = '';
  modal.classList.remove('hidden');

  try {
    const tunnelRes = await fetch('/api/tunnel');
    const { url: tunnelUrl } = await tunnelRes.json();
    qrCurrentUrl = tunnelUrl || window.location.href;
    urlEl.textContent = qrCurrentUrl;
    imageEl.innerHTML = `<img src="/api/qrcode?url=${encodeURIComponent(qrCurrentUrl)}" alt="QR Code">`;
  } catch {
    qrCurrentUrl = window.location.href;
    urlEl.textContent = qrCurrentUrl;
    imageEl.innerHTML = `<img src="/api/qrcode?url=${encodeURIComponent(qrCurrentUrl)}" alt="QR Code">`;
  }
}

function hideQrModal(event) {
  if (event && event.target !== event.currentTarget) return;
  document.getElementById('qr-modal').classList.add('hidden');
}

async function copyQrUrl() {
  if (!qrCurrentUrl) return;
  try {
    await navigator.clipboard.writeText(qrCurrentUrl);
    const btn = document.querySelector('.qr-copy-btn');
    const original = btn.textContent;
    btn.textContent = '✅ Copied!';
    setTimeout(() => { btn.textContent = original; }, 1500);
  } catch {
    // Fallback for non-HTTPS contexts
    const textarea = document.createElement('textarea');
    textarea.value = qrCurrentUrl;
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    document.body.removeChild(textarea);
    const btn = document.querySelector('.qr-copy-btn');
    const original = btn.textContent;
    btn.textContent = '✅ Copied!';
    setTimeout(() => { btn.textContent = original; }, 1500);
  }
}

// Update
async function updateServer() {
  if (!confirm('jet-copilot を更新して再起動しますか？\nアクティブなセッションは終了されます。')) return;
  const btn = document.getElementById('update-btn');
  if (btn) { btn.disabled = true; btn.textContent = '🔄 Updating...'; }
  try {
    const res = await fetch('/api/update', { method: 'POST' });
    const data = await res.json();
    if (!res.ok) {
      alert('Update failed: ' + (data.error || 'Unknown error'));
      if (btn) { btn.disabled = false; btn.textContent = '🔄 Update'; }
      return;
    }
    if (btn) btn.textContent = '✅ Restarting...';
  } catch {
    // Server may have already restarted — wait for reconnect
    if (btn) btn.textContent = '⏳ Reconnecting...';
  }
}

// Folder filter
document.getElementById('folder-filter').addEventListener('input', (e) => {
  if (currentBrowseData) {
    renderFolderList(currentBrowseData, e.target.value);
  }
});

// Preview management
async function loadPreviews() {
  try {
    const res = await fetch('/api/preview');
    const list = await res.json();
    const container = document.getElementById('preview-list');
    const summary = document.getElementById('preview-summary');

    if (summary) {
      if (list.length === 0) {
        summary.classList.add('hidden');
      } else {
        summary.classList.remove('hidden');
        summary.textContent = `${list.length} preview${list.length === 1 ? '' : 's'} active`;
      }
    }

    if (list.length === 0) {
      container.innerHTML = '<div class="preview-empty">No active previews yet. Open one from here, or manage them from a session.</div>';
      return;
    }

    container.innerHTML = list.map((p) => {
      const urlLink = p.url
        ? `<a href="${p.url}" target="_blank" class="preview-url">${p.url}</a>`
        : '<span class="preview-url">Starting...</span>';
      return `
        <div class="preview-item preview-item-compact">
          <div class="preview-meta">
            <span class="preview-port-badge">Port ${p.port}</span>
            ${urlLink}
          </div>
          <div class="preview-actions">
            ${p.url ? `<a href="${p.url}" target="_blank" class="preview-action-btn">Open ↗</a>` : ''}
            <button class="preview-stop-btn" onclick="stopPreview(${p.port})">Stop</button>
          </div>
        </div>
      `;
    }).join('');
  } catch {
    // Ignore
  }
}

async function startPreview() {
  const input = document.getElementById('preview-port');
  const port = parseInt(input.value, 10);
  if (!port) return;

  input.disabled = true;
  try {
    await fetch('/api/preview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ port }),
    });
    input.value = '';
    loadPreviews();
  } catch (err) {
    alert('Failed to start preview: ' + err.message);
  }
  input.disabled = false;
}

const previewInput = document.getElementById('preview-port');
if (previewInput) {
  previewInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      startPreview();
    }
  });
}

async function stopPreview(port) {
  try {
    await fetch(`/api/preview/${port}`, { method: 'DELETE' });
    loadPreviews();
  } catch (err) {
    alert('Failed to stop preview: ' + err.message);
  }
}

// Window capture
async function loadDashboardWindows() {
  const select = document.getElementById('dashboard-capture-select');
  if (!select) return;
  select.innerHTML = '<option value="">Loading...</option>';

  try {
    const res = await fetch('/api/windows');
    const windows = await res.json();
    if (windows.length === 0) {
      select.innerHTML = '<option value="">No windows found</option>';
      return;
    }
    select.innerHTML = windows.map((w) => {
      const raw = w.title ? `${w.appName} – ${w.title}` : w.appName;
      const truncated = raw.length > 60 ? raw.substring(0, 57) + '...' : raw;
      return `<option value="${w.id}">${AppUtils.escapeHtml(truncated)}</option>`;
    }).join('');
  } catch {
    select.innerHTML = '<option value="">Failed to load windows</option>';
  }
}

async function dashboardCapture() {
  const select = document.getElementById('dashboard-capture-select');
  const windowId = parseInt(select?.value, 10);
  if (!windowId) return;

  const area = document.getElementById('dashboard-capture-area');
  if (area) area.innerHTML = '<div class="capture-preview-meta">Capturing...</div>';

  try {
    const res = await fetch('/api/capture', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ windowId }),
    });
    const data = await res.json();
    if (!res.ok) {
      if (area) area.innerHTML = `<div class="capture-preview-meta" style="color:var(--danger)">Error: ${AppUtils.escapeHtml(data.error)}</div>`;
      return;
    }
    if (area) {
      area.innerHTML = `
        <img class="capture-preview-img" src="${data.url}?t=${Date.now()}" alt="Captured window">
        <div class="capture-preview-meta">${data.width}×${data.height} · ${AppUtils.escapeHtml(data.filename)}</div>
      `;
    }
  } catch (err) {
    if (area) area.innerHTML = `<div class="capture-preview-meta" style="color:var(--danger)">Capture failed: ${AppUtils.escapeHtml(err.message)}</div>`;
  }
}
