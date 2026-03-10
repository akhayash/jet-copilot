---
name: release
description: Release a new version of jet-copilot. Use when asked to release, version bump, or publish.
---

## Steps

1. **Ensure all tests and lint pass:**
   ```bash
   npm test && npm run lint
   ```

2. **Bump version** (choose one):
   ```bash
   npm version patch --no-git-tag-version   # 0.1.0 → 0.1.1 (bug fixes)
   npm version minor --no-git-tag-version   # 0.1.0 → 0.2.0 (new features)
   npm version major --no-git-tag-version   # 0.1.0 → 1.0.0 (breaking changes)
   ```

3. **Commit the version bump:**
   ```bash
   git add package.json package-lock.json
   git commit -m "chore: bump version to vX.Y.Z"
   ```

4. **Tag the release:**
   ```bash
   git tag vX.Y.Z
   ```

5. **Push to both remotes with tags:**
   ```bash
   git push origin main --tags
   git push ms main --tags
   ```

6. **Create GitHub Release:**
   ```bash
   gh release create vX.Y.Z --title "vX.Y.Z — Title" --notes "## Changes
   - Feature 1
   - Feature 2"
   ```

## Remotes

- `origin` → `akhayash/jet-copilot`
- `ms` → `mcaps-microsoft/jet-copilot`

Both must be pushed on every release.

## Version Scheme

- `patch`: bug fixes, small improvements
- `minor`: new features (window capture, self-update, etc.)
- `major`: breaking API changes
