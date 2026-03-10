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

  return { getShortcutContent, escapeHtml };
}));
