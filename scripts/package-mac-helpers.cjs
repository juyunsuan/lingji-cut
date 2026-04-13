const path = require('node:path');

const STAGED_PROJECT_ROOTS = new Set(['dist', 'dist-electron', 'src']);
const RUNTIME_ROOT_PACKAGES = new Set([
  '@langchain/core',
  '@langchain/openai',
  '@modelcontextprotocol/sdk',
  '@remotion/bundler',
  '@remotion/media',
  '@remotion/media-utils',
  '@remotion/motion-blur',
  '@remotion/noise',
  '@remotion/paths',
  '@remotion/player',
  '@remotion/renderer',
  '@remotion/shapes',
  '@remotion/transitions',
  'chokidar',
  'react',
  'react-dom',
  'remotion',
  'uuid',
]);

function normalizeRelativePath(relativePath) {
  return relativePath.split(path.sep).join('/').replace(/^\/+/, '');
}

function getNodeModuleRootPackage(relativePath) {
  const normalizedPath = normalizeRelativePath(relativePath);
  const parts = normalizedPath.split('/').filter(Boolean);

  if (parts.length === 0) {
    return null;
  }

  if (parts[0].startsWith('@') && parts.length >= 2) {
    return `${parts[0]}/${parts[1]}`;
  }

  return parts[0];
}

function buildReleaseManifest(packageJson) {
  return {
    name: packageJson.name,
    productName: packageJson.productName,
    version: packageJson.version,
    main: packageJson.main,
  };
}

function shouldStageProjectPath(relativePath) {
  const normalizedPath = normalizeRelativePath(relativePath);

  if (!normalizedPath) {
    return false;
  }

  const [rootName] = normalizedPath.split('/');
  return STAGED_PROJECT_ROOTS.has(rootName);
}

function shouldStageNodeModulePath(relativePath) {
  const normalizedPath = normalizeRelativePath(relativePath);

  if (!normalizedPath) {
    return false;
  }

  if (
    normalizedPath === '.bin' ||
    normalizedPath.startsWith('.bin/') ||
    normalizedPath === '.cache' ||
    normalizedPath.startsWith('.cache/') ||
    normalizedPath === '.remotion' ||
    normalizedPath.startsWith('.remotion/') ||
    normalizedPath === '.package-lock.json'
  ) {
    return false;
  }

  const packageName = getNodeModuleRootPackage(normalizedPath);
  return packageName ? RUNTIME_ROOT_PACKAGES.has(packageName) : false;
}

module.exports = {
  RUNTIME_ROOT_PACKAGES,
  buildReleaseManifest,
  getNodeModuleRootPackage,
  normalizeRelativePath,
  shouldStageNodeModulePath,
  shouldStageProjectPath,
};
