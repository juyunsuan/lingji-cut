const fs = require('node:fs');
const path = require('node:path');

const STAGED_PROJECT_ROOTS = new Set(['dist', 'dist-cli', 'dist-electron', 'resources', 'src']);
// dist-cli 必须 asar-unpack：lingji CLI（注入给 agent 的 LINGJI_CLI）由真实 node 进程
// 直接执行，无法读 asar 内文件，须落在 app.asar.unpacked。
// pi（@earendil-works/*）以进程内 SDK 运行；整棵子树需 asar-unpack——其中含
// 原生 .node（@mariozechner/clipboard-*，嵌套与顶层皆有）与按需读取的包内资源，
// 这些无法从 asar 内 require/读取，须落在 app.asar.unpacked。
// playwright（发布视频 4 平台自动化）同理须 asar-unpack，运行时从 app.asar.unpacked 定位。
// Chromium 已改为运行时按需下载到 <userData>/publish/chromium，不再随包，故清单不含 playwright-browsers。
// node-pty（B 站扫码登录用伪终端）含 .node 预编译产物 + spawn-helper，无法从 asar 内加载/exec，
// 须 asar-unpack。（biliup 二进制已改为运行时下载到 userData，不再随包，故从清单移除。）
const RENDER_RUNTIME_ASAR_UNPACK_DIRS = '{dist-cli,vendor/ffmpeg,node_modules/@earendil-works,node_modules/@mariozechner,node_modules/@remotion,node_modules/esbuild,node_modules/@esbuild,node_modules/@puppeteer,node_modules/puppeteer-core,node_modules/sharp,node_modules/onnxruntime-node,node_modules/ffmpeg-static,node_modules/ffprobe-static,node_modules/playwright,node_modules/playwright-core,node_modules/node-pty}';

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
