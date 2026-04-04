---
name: add-api-endpoint
description: Add a new REST API endpoint to jet-copilot. Use when asked to create a new API route or endpoint.
---

## Steps

1. **Add the route** in `server/index.js` before `return { app, sessions, previews, capture }`:

```js
app.post('/api/newfeature', (req, res) => {
  const value = req.body.param;
  if (!value) return res.status(400).json({ error: 'Param is required' });

  try {
    const result = doSomething(value);
    res.json(result);
  } catch (err) {
    log.error('newfeature', 'failed', { error: err.message });
    res.status(500).json({ error: err.message });
  }
});
```

2. **If the endpoint needs a new module**, create it in `server/` and inject it into `createApp()` as a DI parameter:

```js
function createApp({
  sessions = new SessionManager(),
  newFeature = new NewFeature(),  // ← add here with default
  ...
} = {}) {
```

3. **Add tests** in `test/api.test.js` using supertest with mocked dependencies:

```js
test('newfeature API description', async () => {
  const { app } = createApp({
    sessions: new SessionManager(),
    previews: { list: () => [], start: async () => ({}), stop: () => {} },
    capture: { listWindows: () => [], capture: async () => ({}), getCaptureDir: () => '' },
    newFeature: { /* mock methods */ },
  });

  await request(app).post('/api/newfeature').send({}).expect(400);
  const res = await request(app).post('/api/newfeature').send({ param: 'value' }).expect(200);
  assert.ok(res.body.result);
});
```

4. **Update REST API table** in `.github/copilot-instructions.md`.

5. Run `npm test && npm run lint` to verify.

## Rules

- Validate input first → 400
- Check resource existence → 404
- Wrap logic in try/catch → 500
- Log errors with `log.error('tag', 'message', { error: err.message })`
- Success: return data directly (`res.json({...})`)
- Error: always `{ error: string }`
