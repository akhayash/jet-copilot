(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.AppUtils = api;
  }
}(typeof globalThis !== 'undefined' ? globalThis : this, () => {
  function getShortcutContent(key) {
    const ESC = '\x1b';
    const keys = {
      esc: ESC,
      mode: ESC + '[Z',
      up: ESC + '[A',
      down: ESC + '[B',
      enter: '\r',
      enqueue: '\x11',
    };

    return keys[key] || key;
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  async function stopPreviewByPort(port, onSuccess) {
    try {
      await fetch(`/api/preview/${port}`, { method: 'DELETE' });
      if (onSuccess) onSuccess();
    } catch (err) {
      alert('Failed to stop preview: ' + err.message);
    }
  }

  async function loadWindowOptions(selectId) {
    const select = document.getElementById(selectId);
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
        return `<option value="${w.id}">${escapeHtml(truncated)}</option>`;
      }).join('');
    } catch {
      select.innerHTML = '<option value="">Failed to load windows</option>';
    }
  }

  return { getShortcutContent, escapeHtml, stopPreviewByPort, loadWindowOptions };
}));
