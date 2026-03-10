# Frontend Patterns

## Architecture

- Vanilla JS, no framework or bundler
- Two pages: dashboard (`index.html`) and terminal (`terminal.html`)
- Global functions called from HTML `onclick` attributes
- Module-level state: `let ws = null`, `let term = null`, etc.
- Shared utils in `app-utils.js` (IIFE, browser/CommonJS dual)

## DOM Manipulation

- Query by ID: `document.getElementById(id)`
- Visibility: `.classList.add('hidden')` / `.classList.remove('hidden')`
- Text: `element.textContent = value`
- HTML: `element.innerHTML = html` — **always escape user content** with `AppUtils.escapeHtml()`

## Panel Toggle Pattern

Mutually exclusive panels — close all first, then open target:

```js
function closeAllPanels() {
  const ids = [
    { bar: 'voice-bar', btn: 'voice-toggle' },
    { bar: 'capture-panel', btn: 'capture-toggle' },
    // ...add new panels here
  ];
  ids.forEach(({ bar, btn }) => {
    document.getElementById(bar)?.classList.add('hidden');
    document.getElementById(btn)?.classList.remove('active');
  });
}

function toggleBar(barId, btnId, focusId) {
  const opening = document.getElementById(barId).classList.contains('hidden');
  closeAllPanels();
  if (opening) {
    document.getElementById(barId).classList.remove('hidden');
    document.getElementById(btnId).classList.add('active');
  } else if (term) {
    term.focus();
  }
}
```

## Fetch Pattern

```js
async function doAction() {
  try {
    const res = await fetch('/api/endpoint', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: value }),
    });
    const data = await res.json();
    if (!res.ok) {
      alert('Failed: ' + (data.error || 'Unknown error'));
      return;
    }
    // Use data...
  } catch (err) {
    alert('Failed: ' + err.message);
  }
}
```

## Mobile Considerations

- Event listeners in `DOMContentLoaded` with `{ passive: true/false }`
- Re-focus terminal on tap, `visibilitychange`, and WebSocket reconnect
- Auto-reconnect WebSocket after 3s on close
- Touch scroll workaround for xterm.js v6 (#5489)

## Periodic Refresh

```js
loadStatus(); loadSessions(); loadPreviews();
setInterval(() => { loadStatus(); loadSessions(); loadPreviews(); }, 5000);
```

## CSS Variables

```css
:root {
  --bg: #0d1117;
  --surface: #161b22;
  --border: #30363d;
  --text: #e6edf3;
  --text-muted: #8b949e;
  --accent: #58a6ff;
  --danger: #f85149;
}
```
