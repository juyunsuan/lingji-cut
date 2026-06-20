/**
 * fetch-biliup.cjs
 *
 * 构建期脚本：从 GitHub 下载 biliup 二进制到指定目录。
 *
 * 用法（作为模块导出）：
 *   const { fetchBiliup } = require('./fetch-biliup.cjs');
 *   await fetchBiliup('/path/to/dest', { platform: 'darwin', arch: 'arm64' });
 *
 * 直接 CLI 调用：
 *   node scripts/fetch-biliup.cjs [destRoot] [--platform=<platform>] [--arch=<arch>]
 *
 * 二进制落盘位置：<destRoot>/biliup/<platform-key>/<binary>
 * platform-key 与 biliup-runtime.ts 的 buildPlatformKey() 完全一致：
 *   darwin/arm64  → macos-aarch64
 *   darwin/x64    → macos-x86_64
 *   win32/x64     → windows-x86_64
 *   linux/x64     → linux-x86_64
 *   linux/arm64   → linux-aarch64
 */

'use strict';

const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const https = require('node:https');
const { execFileSync } = require('node:child_process');
const os = require('node:os');

const GITHUB_RELEASE_API = 'https://api.github.com/repos/biliup/biliup/releases/latest';

// ---------------------------------------------------------------------------
// 平台 key 归一化（与 biliup-runtime.ts buildPlatformKey 保持完全一致）
// ---------------------------------------------------------------------------

function normalizeSystem(platform) {
  const p = platform.trim().toLowerCase();
  if (p === 'darwin') return 'macos';
  if (p === 'win32') return 'windows';
  return p;
}

function normalizeMachine(arch) {
  const a = arch.trim().toLowerCase();
  const aliases = { amd64: 'x86_64', x64: 'x86_64', arm64: 'aarch64' };
  return aliases[a] !== undefined ? aliases[a] : a;
}

function buildPlatformKey(platform, arch) {
  return `${normalizeSystem(platform)}-${normalizeMachine(arch)}`;
}

function biliupBinaryName(platform) {
  return normalizeSystem(platform) === 'windows' ? 'biliup.exe' : 'biliup';
}

// ---------------------------------------------------------------------------
// 资产匹配（与 Python _select_release_asset 保持一致）
// ---------------------------------------------------------------------------

// key = buildPlatformKey() 输出，value = 资产文件名中必须包含的子串
const ASSET_PATTERNS = {
  'windows-x86_64': 'x86_64-windows.zip',
  'linux-x86_64': 'x86_64-linux.tar.xz',
  'linux-aarch64': 'aarch64-linux.tar.xz',
  'linux-arm': 'arm-linux.tar.xz',
  'macos-x86_64': 'x86_64-macos.tar.xz',
  'macos-aarch64': 'aarch64-macos.tar.xz',
};

function selectAsset(assets, platformKey) {
  const pattern = ASSET_PATTERNS[platformKey];
  if (!pattern) {
    throw new Error(
      `[fetch-biliup] 不支持的 biliup 平台: ${platformKey}。` +
        `支持的平台: ${Object.keys(ASSET_PATTERNS).join(', ')}`,
    );
  }
  const asset = assets.find((a) => (a.name || '').includes(pattern));
  if (!asset) {
    throw new Error(
      `[fetch-biliup] 未找到匹配的 biliup release 资产` +
        `（平台: ${platformKey}，pattern: ${pattern}）。` +
        `可用资产: ${assets.map((a) => a.name).join(', ')}`,
    );
  }
  return { assetName: asset.name, downloadUrl: asset.browser_download_url };
}

// ---------------------------------------------------------------------------
// HTTP 工具（使用 Node 内置 https，支持重定向）
// ---------------------------------------------------------------------------

function httpsGetBuffer(url, redirectCount = 0) {
  if (redirectCount > 5) {
    return Promise.reject(new Error(`[fetch-biliup] 重定向次数超过上限: ${url}`));
  }
  return new Promise((resolve, reject) => {
    const req = https.get(
      url,
      {
        headers: {
          'User-Agent': 'fetch-biliup-build-script',
          Accept: 'application/vnd.github+json',
        },
      },
      (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          resolve(httpsGetBuffer(res.headers.location, redirectCount + 1));
          return;
        }
        if (res.statusCode !== 200) {
          reject(new Error(`[fetch-biliup] HTTP ${res.statusCode} from ${url}`));
          return;
        }
        const chunks = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => resolve(Buffer.concat(chunks)));
        res.on('error', reject);
      },
    );
    req.on('error', reject);
  });
}

function httpsDownloadToFile(url, destPath, redirectCount = 0) {
  if (redirectCount > 5) {
    return Promise.reject(new Error(`[fetch-biliup] 重定向次数超过上限: ${url}`));
  }
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { 'User-Agent': 'fetch-biliup-build-script' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        resolve(httpsDownloadToFile(res.headers.location, destPath, redirectCount + 1));
        return;
      }
      if (res.statusCode !== 200) {
        reject(new Error(`[fetch-biliup] HTTP ${res.statusCode} 下载 ${url}`));
        return;
      }
      const out = fs.createWriteStream(destPath);
      res.pipe(out);
      out.on('finish', () => resolve());
      out.on('error', reject);
      res.on('error', reject);
    });
    req.on('error', reject);
  });
}

// ---------------------------------------------------------------------------
// 解压工具
// ---------------------------------------------------------------------------

/**
 * 解压 .tar.xz — shell out 到系统 tar（macOS / Linux 均可用）。
 */
function extractTarXz(archivePath, extractDir) {
  execFileSync('tar', ['-xJf', archivePath, '-C', extractDir], { stdio: 'inherit' });
}

/**
 * 解压 .zip — 使用 yauzl（本 repo 的传递依赖，node_modules/yauzl 已存在）。
 */
function extractZip(archivePath, extractDir) {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const yauzl = require('yauzl');
  return new Promise((resolve, reject) => {
    yauzl.open(archivePath, { lazyEntries: true }, (err, zipfile) => {
      if (err) return reject(err);
      zipfile.readEntry();
      zipfile.on('entry', (entry) => {
        const entryPath = path.join(extractDir, entry.fileName);
        if (/\/$/.test(entry.fileName)) {
          // directory
          fs.mkdirSync(entryPath, { recursive: true });
          zipfile.readEntry();
        } else {
          fs.mkdirSync(path.dirname(entryPath), { recursive: true });
          zipfile.openReadStream(entry, (streamErr, readStream) => {
            if (streamErr) return reject(streamErr);
            const out = fs.createWriteStream(entryPath);
            readStream.pipe(out);
            out.on('finish', () => zipfile.readEntry());
            out.on('error', reject);
          });
        }
      });
      zipfile.on('end', resolve);
      zipfile.on('error', reject);
    });
  });
}

// ---------------------------------------------------------------------------
// 在解压目录中寻找 biliup 可执行文件（与 Python _pick_executable 逻辑一致）
// ---------------------------------------------------------------------------

function findBiliupExecutable(extractDir) {
  const targets = new Set(['biliup', 'biliup.exe', 'biliupr', 'biliupr.exe']);
  const results = [];

  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (targets.has(entry.name.toLowerCase())) {
        results.push(fullPath);
      }
    }
  }

  walk(extractDir);

  if (results.length === 0) {
    throw new Error('[fetch-biliup] 解压目录中未找到 biliup 可执行文件');
  }

  // 优先取路径最短的（与 Python _pick_executable 逻辑一致）
  results.sort((a, b) => a.length - b.length);
  return results[0];
}

// ---------------------------------------------------------------------------
// 主流程
// ---------------------------------------------------------------------------

/**
 * 下载并安装 biliup 二进制。
 *
 * 落盘路径：`<destRoot>/biliup/<platform-key>/<binary-name>`
 *
 * @param {string} destRoot 目标根目录（e.g. stageDir 或 resources/）
 * @param {{ platform?: string, arch?: string }} opts
 *   - platform: Node.js process.platform 值（默认 process.platform）
 *   - arch:     Node.js process.arch 值（默认 process.arch）
 * @returns {Promise<string>} 安装后二进制的绝对路径
 */
async function fetchBiliup(destRoot, opts = {}) {
  const platform = opts.platform !== undefined ? opts.platform : process.platform;
  const arch = opts.arch !== undefined ? opts.arch : process.arch;
  const platformKey = buildPlatformKey(platform, arch);
  const binaryName = biliupBinaryName(platform);
  const binaryDestDir = path.join(destRoot, 'biliup', platformKey);
  const binaryDest = path.join(binaryDestDir, binaryName);

  console.log(`[fetch-biliup] 平台: ${platformKey}`);
  console.log(`[fetch-biliup] 目标路径: ${binaryDest}`);

  // 1. 获取最新 release 元数据
  console.log('[fetch-biliup] 获取 GitHub 最新 release 信息...');
  const releaseBuffer = await httpsGetBuffer(GITHUB_RELEASE_API);
  const release = JSON.parse(releaseBuffer.toString('utf-8'));
  const assets = release.assets || [];
  if (assets.length === 0) {
    throw new Error('[fetch-biliup] GitHub release 返回的 assets 列表为空');
  }

  const { assetName, downloadUrl } = selectAsset(assets, platformKey);
  console.log(`[fetch-biliup] 选中资产: ${assetName} (${release.tag_name})`);
  console.log(`[fetch-biliup] 下载地址: ${downloadUrl}`);

  // 2. 下载到临时目录
  const tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'biliup-download-'));
  try {
    const archivePath = path.join(tmpDir, assetName);
    console.log('[fetch-biliup] 下载中，请稍候...');
    await httpsDownloadToFile(downloadUrl, archivePath);
    console.log(`[fetch-biliup] 下载完成: ${assetName}`);

    // 3. 解压
    const extractDir = path.join(tmpDir, 'extract');
    await fsp.mkdir(extractDir, { recursive: true });

    if (assetName.endsWith('.zip')) {
      console.log('[fetch-biliup] 解压 ZIP...');
      await extractZip(archivePath, extractDir);
    } else {
      // .tar.xz
      console.log('[fetch-biliup] 解压 tar.xz...');
      extractTarXz(archivePath, extractDir);
    }

    // 4. 定位二进制并复制到目标
    const extractedBinary = findBiliupExecutable(extractDir);
    console.log(`[fetch-biliup] 找到二进制: ${path.relative(extractDir, extractedBinary)}`);

    await fsp.mkdir(binaryDestDir, { recursive: true });
    await fsp.copyFile(extractedBinary, binaryDest);

    // 5. chmod +x（非 Windows）
    if (normalizeSystem(platform) !== 'windows') {
      await fsp.chmod(binaryDest, 0o755);
    }

    console.log(`[fetch-biliup] 安装完成: ${binaryDest}`);
    return binaryDest;
  } finally {
    await fsp.rm(tmpDir, { recursive: true, force: true });
  }
}

module.exports = { fetchBiliup, buildPlatformKey, biliupBinaryName };

// ---------------------------------------------------------------------------
// CLI 入口（直接 node scripts/fetch-biliup.cjs 时执行）
// ---------------------------------------------------------------------------

if (require.main === module) {
  const args = process.argv.slice(2);
  const destRoot =
    args.find((a) => !a.startsWith('--')) ||
    path.resolve(__dirname, '..', 'resources');
  const platformArg = (args.find((a) => a.startsWith('--platform=')) || '').split('=')[1];
  const archArg = (args.find((a) => a.startsWith('--arch=')) || '').split('=')[1];

  fetchBiliup(destRoot, {
    platform: platformArg || undefined,
    arch: archArg || undefined,
  }).catch((err) => {
    console.error('[fetch-biliup] 失败:', err.message);
    process.exit(1);
  });
}
