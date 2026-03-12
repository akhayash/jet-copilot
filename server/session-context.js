const fs = require('fs');
const path = require('path');

function resolveFolderName(cwd, pathModule = path) {
  const normalized = pathModule.resolve(cwd);
  return pathModule.basename(normalized) || normalized;
}

function findRepoRoot(cwd, {
  fsModule = fs,
  pathModule = path,
} = {}) {
  let current = pathModule.resolve(cwd);

  while (true) {
    if (fsModule.existsSync(pathModule.join(current, '.git'))) {
      return current;
    }

    const parent = pathModule.dirname(current);
    if (parent === current) {
      return null;
    }

    current = parent;
  }
}

function getSessionContext(cwd, {
  fsModule = fs,
  pathModule = path,
} = {}) {
  const normalizedCwd = pathModule.resolve(cwd);
  const folderName = resolveFolderName(normalizedCwd, pathModule);
  const repoRoot = findRepoRoot(normalizedCwd, { fsModule, pathModule });
  const repoName = repoRoot ? resolveFolderName(repoRoot, pathModule) : null;

  return {
    cwd: normalizedCwd,
    folderName,
    repoName,
    repoRoot,
    inRepo: Boolean(repoRoot),
    displayName: repoName || folderName,
  };
}

module.exports = { findRepoRoot, getSessionContext, resolveFolderName };
