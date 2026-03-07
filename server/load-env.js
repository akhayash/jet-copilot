const dotenv = require('dotenv');
const path = require('path');

function getEnvPaths({
  cwd = process.cwd(),
  packageRoot = path.join(__dirname, '..'),
  pathModule = path,
} = {}) {
  return [...new Set([
    pathModule.join(cwd, '.env'),
    pathModule.join(packageRoot, '.env'),
  ])];
}

function loadEnv({
  cwd = process.cwd(),
  packageRoot = path.join(__dirname, '..'),
  dotenvModule = dotenv,
  pathModule = path,
  processEnv = process.env,
} = {}) {
  const envPaths = getEnvPaths({ cwd, packageRoot, pathModule });
  return dotenvModule.config({ path: envPaths, processEnv });
}

module.exports = { getEnvPaths, loadEnv };
