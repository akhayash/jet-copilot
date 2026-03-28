const _openGroups = new Set();
let _sortOrder = 'time';
let _cachedSessions = [];

function setSortOrder(order) {
  _sortOrder = order;
  document.querySelectorAll('.sort-btn').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.sort === order);
  });
  renderCopilotSessions(_cachedSessions);
}

function toggleGroup(header) {
  const groupName = header.getAttribute('data-group');
  const body = header.nextElementSibling;
  const isOpen = header.classList.contains('open');

  if (isOpen) {
    header.classList.remove('open');
    body.classList.remove('open');
    _openGroups.delete(groupName);
  } else {
    header.classList.add('open');
    body.classList.add('open');
    _openGroups.add(groupName);
  }
}

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
    updateFilterBarVisibility();
  } catch {
    // Ignore
  }
}

function renderSessionNameLabels(session) {
  const repoLabel = session.repoName
    ? `<span class="session-display-name">${AppUtils.escapeHtml(session.repoName)}</span>`
    : '';
  const folderLabel = session.folderName && session.folderName !== session.repoName
    ? `<span class="session-folder-name">${AppUtils.escapeHtml(session.folderName)}</span>`
    : '';
  const dirLabel = !session.repoName && session.folderName
    ? `<span class="session-display-name">${AppUtils.escapeHtml(session.folderName)}</span>`
    : '';

  return `${repoLabel}${folderLabel}${dirLabel}`;
}

function renderSessionCwd(session) {
  return session.cwd ? `<div class="session-cwd"><i data-lucide="folder" class="icon-inline"></i> ${AppUtils.escapeHtml(session.cwd)}</div>` : '';
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
    const time = formatRelativeTime(s.startedAt);
    const endTime = s.endedAt ? ` – ${formatRelativeTime(s.endedAt)}` : '';
    const statusIcon = s.status === 'active' ? '<i data-lucide="circle" class="icon-status icon-active"></i>' : '<i data-lucide="circle" class="icon-status icon-ended"></i>';
    const connectBtn = showConnect
      ? `<div class="session-actions">
           <button class="connect-btn" onclick="connectSession('${s.id}')">Connect <i data-lucide="arrow-right" class="icon-inline"></i></button>
           <button class="end-btn" onclick="endSession('${s.id}')">End</button>
         </div>`
      : '';
    const clients = s.clientCount > 0 ? `<span class="client-badge">${s.clientCount} connected</span>` : '';
    const nameLabels = renderSessionNameLabels(s);
    const cwdLabel = renderSessionCwd(s);
    const msgCount = s.messageCount > 0 ? `<span class="session-msg-count">${s.messageCount} turns</span>` : '';
    const filterText = [s.id, s.repoName, s.folderName, s.cwd].filter(Boolean).join(' ').toLowerCase();

    return `
      <div class="session-card" data-filter-text="${AppUtils.escapeHtml(filterText)}">
        <div class="session-info">
          <span class="session-id">${statusIcon} #${s.id}</span>
          ${nameLabels}
          ${clients}
          ${msgCount}
          <span class="session-time-inline">${time}${endTime}</span>
        </div>
        ${cwdLabel}
        ${connectBtn}
      </div>
    `;
  }).join('');
  if (typeof lucide !== 'undefined') lucide.createIcons();
  applyFilter();
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
  if (!confirm(`End session #${id}?`)) return;
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
    loadCopilotSessions();

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
    <button class="folder-action-btn" onclick="createFolder('${escapeJsString(data.current)}', '${escapeJsString(sep)}')">+ New Folder</button>
  </div>`;

  let html = actionsHtml;

  // Parent directory (always visible)
  if (data.parent !== data.current && !filter) {
    html += `<div class="folder-item" onclick="browseTo('${escapeJsString(data.parent)}')"><i data-lucide="folder-up" class="icon-inline"></i> ..</div>`;
  }

  const lowerFilter = filter.toLowerCase();
  const dirs = filter
    ? data.directories.filter((d) => d.toLowerCase().includes(lowerFilter))
    : data.directories;

  for (const dir of dirs) {
    const full = data.current + sep + dir;
    html += `<div class="folder-item" onclick="browseTo('${escapeJsString(full)}')"><i data-lucide="folder" class="icon-inline"></i> ${dir}</div>`;
  }

  if (filter && dirs.length === 0) {
    html += `<div class="folder-item" style="color:var(--text-muted);cursor:default">No matching folders</div>`;
  }

  listEl.innerHTML = html;
  if (typeof lucide !== 'undefined') lucide.createIcons();
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

function escapeJsString(str) {
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

function formatRelativeTime(iso) {
  if (!iso) return '';
  const now = Date.now();
  const then = new Date(iso).getTime();
  const diffSec = Math.floor((now - then) / 1000);
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour}h ago`;
  const diffDay = Math.floor(diffHour / 24);
  if (diffDay < 7) return `${diffDay}d ago`;
  const diffWeek = Math.floor(diffDay / 7);
  if (diffWeek < 5) return `${diffWeek}w ago`;
  const diffMonth = Math.floor(diffDay / 30);
  if (diffMonth < 12) return `${diffMonth}mo ago`;
  const diffYear = Math.floor(diffDay / 365);
  return `${diffYear}y ago`;
}

async function loadCopilotSessions() {
  try {
    const res = await fetch('/api/copilot-sessions');
    _cachedSessions = await res.json();
    renderCopilotSessions(_cachedSessions);
  } catch {
    // Ignore
  }
}

function renderCopilotSessions(sessions) {
  const section = document.getElementById('copilot-sessions-section');
  const container = document.getElementById('copilot-sessions');

  if (!sessions.length) {
    section.classList.add('hidden');
    return;
  }

  section.classList.remove('hidden');

  // Sort sessions based on current sort order
  const sorted = [...sessions].sort((a, b) => {
    if (_sortOrder === 'messages') {
      return (b.messageCount || 0) - (a.messageCount || 0);
    }
    const da = a.updatedAt || a.createdAt || '';
    const db = b.updatedAt || b.createdAt || '';
    return db.localeCompare(da);
  });

  // Group sessions by repository/folder name
  const groups = new Map();
  for (const s of sorted) {
    const groupKey = s.displayName || s.folderName || 'Other';
    if (!groups.has(groupKey)) groups.set(groupKey, []);
    groups.get(groupKey).push(s);
  }

  // Limit each group to 10 sessions
  const MAX_PER_GROUP = 10;
  for (const [key, list] of groups) {
    if (list.length > MAX_PER_GROUP) groups.set(key, list.slice(0, MAX_PER_GROUP));
  }

  let html = '';
  for (const [groupName, groupSessions] of groups) {
    const groupId = `copilot-group-${groupName.replace(/[^a-zA-Z0-9-]/g, '_')}`;
    const isOpen = _openGroups.has(groupName);
    html += `<div class="session-group-header ${isOpen ? 'open' : ''}" data-group="${AppUtils.escapeHtml(groupName)}" onclick="toggleGroup(this)">
      <i data-lucide="chevron-right" class="session-group-chevron"></i>
      <i data-lucide="folder-git-2" class="icon-inline"></i>
      <span class="session-group-name">${AppUtils.escapeHtml(groupName)}</span>
      <span class="session-group-count">${groupSessions.length}</span>
    </div>`;
    html += `<div class="session-group-body ${isOpen ? 'open' : ''}" id="${groupId}">`;
    html += groupSessions.map((s) => {
      const time = formatRelativeTime(s.updatedAt || s.createdAt);
      const summary = s.summary
        ? `<div class="session-summary">${AppUtils.escapeHtml(s.summary)}</div>`
        : '';
      const branch = s.branch
        ? `<span class="branch-badge">${AppUtils.escapeHtml(s.branch)}</span>`
        : '';
      const cwdLabel = renderSessionCwd(s);
      const filterText = [s.copilotSessionId.substring(0, 8), groupName, s.folderName, s.branch, s.summary, s.cwd].filter(Boolean).join(' ').toLowerCase();

      return `
        <div class="session-card" data-filter-text="${AppUtils.escapeHtml(filterText)}">
          <div class="session-info">
            <span class="session-id"><i data-lucide="message-square" class="icon-inline"></i> ${AppUtils.escapeHtml(s.copilotSessionId.substring(0, 8))}</span>
            ${branch}
            <span class="session-msg-count">${s.messageCount || 0} turns</span>
            <span class="session-time-inline">${time}</span>
          </div>
          ${cwdLabel}
          ${summary}
          <div class="session-actions">
            <button class="connect-btn" onclick="resumeCopilotSession('${AppUtils.escapeHtml(s.copilotSessionId)}', '${escapeJsString(s.cwd || '')}')">Resume <i data-lucide="arrow-right" class="icon-inline"></i></button>
          </div>
        </div>
      `;
    }).join('');
    html += '</div>';
  }
  container.innerHTML = html;
  if (typeof lucide !== 'undefined') lucide.createIcons();
  applyFilter();
  updateFilterBarVisibility();
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

// Session filter
function applyFilter() {
  const input = document.getElementById('session-filter');
  const query = (input?.value || '').toLowerCase().trim();
  const sections = [
    { sectionId: 'active-section', containerId: 'active-sessions' },
    { sectionId: 'past-section', containerId: 'past-sessions' },
    { sectionId: 'copilot-sessions-section', containerId: 'copilot-sessions' },
  ];

  sections.forEach(({ sectionId, containerId }) => {
    const container = document.getElementById(containerId);
    const section = document.getElementById(sectionId);
    if (!container || !section) return;

    const cards = container.querySelectorAll('.session-card');
    let visibleCount = 0;
    cards.forEach((card) => {
      const text = card.getAttribute('data-filter-text') || '';
      const match = !query || text.includes(query);
      card.classList.toggle('hidden', !match);
      if (match) visibleCount++;
    });

    // Auto-open groups with matching cards when filtering
    if (query) {
      container.querySelectorAll('.session-group-body').forEach((body) => {
        const header = body.previousElementSibling;
        const groupCards = body.querySelectorAll('.session-card');
        const hasMatch = Array.from(groupCards).some((c) => !c.classList.contains('hidden'));
        body.classList.toggle('open', hasMatch);
        if (header) header.classList.toggle('open', hasMatch);
        if (header) header.classList.toggle('hidden', !hasMatch);
      });
    } else {
      // Restore user's open/close state
      container.querySelectorAll('.session-group-header').forEach((header) => {
        const groupName = header.getAttribute('data-group');
        const body = header.nextElementSibling;
        const isOpen = _openGroups.has(groupName);
        header.classList.toggle('open', isOpen);
        header.classList.remove('hidden');
        if (body) body.classList.toggle('open', isOpen);
      });
    }

    if (cards.length > 0) {
      section.classList.toggle('hidden', visibleCount === 0);
    }
  });
}

function updateFilterBarVisibility() {
  const bar = document.getElementById('session-filter-bar');
  if (!bar) return;
  const hasCards = document.querySelectorAll('.session-card').length > 0;
  bar.classList.toggle('hidden', !hasCards);
}

// Load on start and refresh periodically
loadStatus();
loadSessions();
loadPreviews();
loadCopilotSessions();
const _refreshInterval = setInterval(() => { loadStatus(); loadSessions(); loadPreviews(); loadCopilotSessions(); }, 5000);
window.addEventListener('beforeunload', () => clearInterval(_refreshInterval));

document.addEventListener('DOMContentLoaded', () => {
  const filterInput = document.getElementById('session-filter');
  if (filterInput) {
    filterInput.addEventListener('input', applyFilter);
  }
});

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
    alert('Failed to copy URL');
  }
}

// Update
async function updateServer() {
  if (!confirm('Update and restart jet-copilot?\nActive sessions will be terminated.')) return;
  const btn = document.getElementById('update-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'Updating...'; }
  try {
    const res = await fetch('/api/update', { method: 'POST' });
    const data = await res.json();
    if (!res.ok) {
      alert('Update failed: ' + (data.error || 'Unknown error'));
      if (btn) { btn.disabled = false; btn.textContent = 'Update'; }
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
        ? `<a href="${AppUtils.escapeHtml(p.url)}" target="_blank" class="preview-url">${AppUtils.escapeHtml(p.url)}</a>`
        : '<span class="preview-url">Starting...</span>';
      return `
        <div class="preview-item preview-item-compact">
          <div class="preview-meta">
            <span class="preview-port-badge">Port ${p.port}</span>
            ${urlLink}
          </div>
          <div class="preview-actions">
            ${p.url ? `<a href="${AppUtils.escapeHtml(p.url)}" target="_blank" class="preview-action-btn">Open <i data-lucide="external-link" class="icon-inline"></i></a>` : ''}
            <button class="preview-stop-btn" onclick="stopPreview(${p.port})">Stop</button>
          </div>
        </div>
      `;
    }).join('');
    if (typeof lucide !== 'undefined') lucide.createIcons();
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
  await AppUtils.stopPreviewByPort(port, loadPreviews);
}

// Window capture
async function loadDashboardWindows() {
  AppUtils.loadWindowOptions('dashboard-capture-select');
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
