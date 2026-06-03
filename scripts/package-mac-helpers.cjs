const fs = require('node:fs');
const path = require('node:path');

const STAGED_PROJECT_ROOTS = new Set(['dist', 'dist-electron', 'src']);
const RENDER_RUNTIME_ASAR_UNPACK_DIRS = '{vendor/ffmpeg,node_modules/@remotion,node_modules/esbuild,node_modules/@esbuild,node_modules/@puppeteer,node_modules/puppeteer-core,node_modules/sharp,node_modules/onnxruntime-node,node_modules/ffmpeg-static,node_modules/ffprobe-static}';

// 仅在 renderer（Vite bundle）中使用、主进程从不 require 的包可在此排除，
// 以减小 .app 体积。漏排不会导致启动崩溃，只会让 app 变大。
const RENDERER_ONLY_PACKAGES = new Set([
  'lucide-react',
  'react-day-picker',
]);

// 额外强制纳入的包（例如 peer/optional deps 未出现在 dependencies 中但主进程确有 require）。
const EXTRA_RUNTIME_PACKAGES = new Set([]);

const rootPackageJsonPath = path.resolve(__dirname, '..', 'package.json');

function readRootDependencies() {
  try {
    const raw = fs.readFileSync(rootPackageJsonPath, 'utf8');
    const parsed = JSON.parse(raw);
    return Object.keys(parsed.dependencies || {});
  } catch {
    return [];
  }
}

function buildRuntimeRootPackages() {
  const names = new Set(EXTRA_RUNTIME_PACKAGES);
  for (const name of readRootDependencies()) {
    if (!RENDERER_ONLY_PACKAGES.has(name)) {
      names.add(name);
    }
  }
  return names;
}

const RUNTIME_ROOT_PACKAGES = buildRuntimeRootPackages();

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
    normalizedPath === '.package-lock.json'
  ) {
    return false;
  }

  const packageName = getNodeModuleRootPackage(normalizedPath);
  return packageName ? RUNTIME_ROOT_PACKAGES.has(packageName) : false;
}

module.exports = {
  RENDER_RUNTIME_ASAR_UNPACK_DIRS,
  RUNTIME_ROOT_PACKAGES,
  buildReleaseManifest,
  getNodeModuleRootPackage,
  normalizeRelativePath,
  shouldStageNodeModulePath,
  shouldStageProjectPath,
};
