---
name: add-manager-class
description: Add a new server-side manager class to jet-copilot. Use when asked to create a new module or service class.
---

## Steps

1. **Create the module** at `server/new-feature.js`:

```js
const fs = require('fs');
const path = require('path');
const log = require('./logger');

class NewFeature {
  constructor({
    fsModule = fs,
    pathModule = path,
  } = {}) {
    this._fs = fsModule;
    this._path = pathModule;
    this._data = new Map();
  }

  list() {
    return Array.from(this._data.values());
  }

  get(id) {
    return this._data.get(id);
  }

  create(params) {
    const item = { id: generateId(), ...params };
    this._data.set(item.id, item);
    return item;
  }
}

module.exports = { NewFeature };
```

2. **Create the test** at `test/new-feature.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const { NewFeature } = require('../server/new-feature');

test('NewFeature.create stores and returns items', () => {
  const feature = new NewFeature();
  const item = feature.create({ name: 'test' });
  assert.ok(item.id);
  assert.equal(feature.list().length, 1);
});
```

3. **Inject into createApp()** in `server/index.js`:

```js
const { NewFeature } = require('./new-feature');

function createApp({
  newFeature = new NewFeature(),
  ...
} = {}) {
```

4. Run `npm test && npm run lint`.

## DI Naming Rules

- Modules: `{name}Module` (e.g., `fsModule`)
- Functions: `{name}Fn` (e.g., `spawnFn`)
- Private state: `this._{name}` (e.g., `this._data`)
- Collection storage: `new Map()` keyed by ID

## Mock Pattern for Tests

```js
const feature = new NewFeature({
  fsModule: { readFileSync: () => 'mock', writeFileSync: () => {} },
});
```
