const fs = require('node:fs');
const path = require('node:path');
const { packager } = require('@electron/packager');

const rootDir = path.resolve(__dirname, '..');
const packageJsonPath = path.join(rootDir, 'package.json');
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));

const appName = packageJson.productName || packageJson.name;
const releaseDir = path.join(rootDir, 'release');
const iconPath = path.join(rootDir, 'build', 'icon.icns');
const buildOutputs = [
  path.join(rootDir, 'dist', 'index.html'),
  path.join(rootDir, 'dist-electron', 'main.js'),
  path.join(rootDir, 'dist-electron', 'preload.js'),
];

const supportedArch = new Set(['arm64', 'x64']);
const arch = process.env.ARCH || process.arch;

if (!supportedArch.has(arch)) {
  console.error(`不支持的 macOS 打包架构：${arch}`);
  console.error('请使用 ARCH=arm64 npm run package:mac 或 ARCH=x64 npm run package:mac');
  process.exit(1);
}

const missingOutputs = buildOutputs.filter((filePath) => !fs.existsSync(filePath));

if (missingOutputs.length > 0) {
  console.error('缺少构建产物，无法继续打包。');
  missingOutputs.forEach((filePath) => {
    console.error(`- ${path.relative(rootDir, filePath)}`);
  });
  console.error('请先运行 npm run build，或直接运行 npm run dist:mac');
  process.exit(1);
}

// 注意：当前导出链路依赖 src/remotion/index.ts 在包内可访问，
// 所以这里不能忽略 src/、dist/、dist-electron/。
const ignore = [
  /^\/(?:release|tests|work|docs|coverage)(?:\/|$)/,
  /^\/(?:\.git|\.github|\.claude|\.superpowers)(?:\/|$)/,
  /^\/\.DS_Store$/,
  /\/\.DS_Store$/,
  /^\/design\.pen$/,
];

async function main() {
  console.log(`开始打包 macOS 应用：${appName} (${arch})`);

  const appPaths = await packager({
    appBundleId: process.env.APP_BUNDLE_ID || 'com.local.lingjijianying',
    arch,
    dir: rootDir,
    icon: fs.existsSync(iconPath) ? iconPath : undefined,
    ignore,
    junk: true,
    name: appName,
    out: releaseDir,
    overwrite: true,
    platform: 'darwin',
    prune: true,
  });

  console.log('打包完成，产物如下：');
  appPaths.forEach((appPath) => {
    console.log(`- ${path.relative(rootDir, appPath)}`);
  });
}

main().catch((error) => {
  console.error('macOS 打包失败');
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exit(1);
});
