/**
 * Chromium 运行时按需安装（对标 biliup-install.ts）。
 *
 * Chromium 不再随安装包内置，改为运行时用捆绑的 playwright `cli.js install chromium`
 * 下载到用户可写目录 `<userData>/publish/chromium`（= PLAYWRIGHT_BROWSERS_PATH），
 * 走 npmmirror 镜像加速；与发布账号同处 userData，不触碰签名包。
 */
import { app } from 'electron';
import { join } from 'node:path';
import * as fs from 'node:fs';
import { spawn } from 'node:child_process';

const MIRROR = 'https://cdn.npmmirror.com/binaries/playwright';

export type ChromiumDownloadPhase = 'resolve' | 'download' | 'install';

export interface ChromiumDownloadProgress {
  phase: ChromiumDownloadPhase;
  percent?: number;
  received?: number;
  total?: number;
}

export interface ChromiumStatus {
  installed: boolean;
  path: string;
  executablePath?: string;
}

export interface DownloadChromiumResult {
  success: boolean;
  error?: string;
}

/** chromium 根目录（= PLAYWRIGHT_BROWSERS_PATH）。 */
export function getChromiumRoot(): string {
  return join(app.getPath('userData'), 'publish', 'chromium');
}

/** 各平台 chromium-<rev> 目录内的可执行相对路径。 */
function execRelPath(platform: NodeJS.Platform): string {
  if (platform === 'win32') return join('chrome-win', 'chrome.exe');
  if (platform === 'darwin') return join('chrome-mac', 'Chromium.app', 'Contents', 'MacOS', 'Chromium');
  return join('chrome-linux', 'chrome');
}

/**
 * 在 root 下定位已安装的完整 Chromium 可执行文件（排除 headless_shell）。
 * 多版本取最高 revision；未命中返回 null（纯函数，便于单测）。
 */
export function findChromiumExecutable(
  root: string,
  platform: NodeJS.Platform = process.platform,
): string | null {
  let entries: string[];
  try {
    entries = fs.readdirSync(root);
  } catch {
    return null;
  }
  const dirs = entries
    .map((name) => /^chromium-(\d+)$/.exec(name))
    .filter((m): m is RegExpExecArray => m !== null)
    .sort((a, b) => Number(b[1]) - Number(a[1]));
  const rel = execRelPath(platform);
  for (const m of dirs) {
    const exe = join(root, m[0], rel);
    if (fs.existsSync(exe)) return exe;
  }
  return null;
}

/** 定位捆绑的 playwright cli.js：packaged 用 app.asar.unpacked，否则 require.resolve。 */
export function resolvePlaywrightCli(
  resourcesPath: string | undefined = (process as NodeJS.Process & { resourcesPath?: string }).resourcesPath,
): string {
  if (resourcesPath) {
    const packaged = join(resourcesPath, 'app.asar.unpacked', 'node_modules', 'playwright', 'cli.js');
    if (fs.existsSync(packaged)) return packaged;
  }
  // dev 回退：playwright 的 exports 未暴露 './cli.js'，无法直接 require.resolve('playwright/cli.js')，
  // 经 package.json（已暴露）定位包根目录后拼出 cli.js。
  const pkgDir = join(require.resolve('playwright/package.json'), '..');
  return join(pkgDir, 'cli.js');
}

/** 解析 `playwright install` 单行输出 → 进度（容错：无法识别返回 null）。 */
export function parseInstallProgress(line: string): ChromiumDownloadProgress | null {
  const pct = /(\d{1,3})%/.exec(line);
  if (pct) {
    const percent = Math.min(100, Number(pct[1]));
    const tot = /of\s+([\d.]+)\s*MiB/i.exec(line);
    const total = tot ? Math.round(parseFloat(tot[1]) * 1024 * 1024) : undefined;
    return total != null ? { phase: 'download', percent, total } : { phase: 'download', percent };
  }
  if (/downloading chromium/i.test(line)) return { phase: 'resolve' };
  if (/install|extract/i.test(line)) return { phase: 'install' };
  return null;
}

/** 查询 Chromium 是否已安装到用户目录。 */
export function getChromiumStatus(): ChromiumStatus {
  const root = getChromiumRoot();
  const executablePath = findChromiumExecutable(root) ?? undefined;
  return { installed: executablePath != null, path: root, executablePath };
}

/**
 * 下载并安装 Chromium 到用户目录。始终 resolve（不 reject），失败经 result.error 返回。
 * spawn 捆绑 playwright cli.js（ELECTRON_RUN_AS_NODE），镜像走 npmmirror。
 */
export function downloadChromium(
  onProgress?: (p: ChromiumDownloadProgress) => void,
  signal?: AbortSignal,
): Promise<DownloadChromiumResult> {
  return new Promise((resolve) => {
    const root = getChromiumRoot();
    try {
      fs.mkdirSync(root, { recursive: true });
    } catch {
      /* 目录创建失败下游会报错 */
    }
    let cli: string;
    try {
      cli = resolvePlaywrightCli();
    } catch (err) {
      resolve({ success: false, error: `未找到 playwright cli.js：${err instanceof Error ? err.message : String(err)}` });
      return;
    }

    onProgress?.({ phase: 'resolve' });
    const child = spawn(process.execPath, [cli, 'install', 'chromium'], {
      env: {
        ...process.env,
        ELECTRON_RUN_AS_NODE: '1',
        PLAYWRIGHT_BROWSERS_PATH: root,
        PLAYWRIGHT_DOWNLOAD_HOST: MIRROR,
        PLAYWRIGHT_DOWNLOAD_BASE_URL: MIRROR,
      },
    });

    const onLine = (buf: Buffer) => {
      for (const line of buf.toString('utf-8').split(/\r?\n|\r/)) {
        if (!line.trim()) continue;
        const p = parseInstallProgress(line);
        if (p) onProgress?.(p);
      }
    };
    child.stdout?.on('data', onLine);
    child.stderr?.on('data', onLine);

    const onAbort = () => {
      child.kill();
    };
    if (signal) {
      if (signal.aborted) onAbort();
      else signal.addEventListener('abort', onAbort, { once: true });
    }

    child.on('error', (err) => {
      resolve({ success: false, error: err.message });
    });
    child.on('close', (code) => {
      signal?.removeEventListener('abort', onAbort);
      if (signal?.aborted) {
        // 取消：清理半成品，保证可重试
        try {
          fs.rmSync(root, { recursive: true, force: true });
        } catch {
          /* ignore */
        }
        resolve({ success: false, error: '已取消' });
        return;
      }
      if (code === 0 && findChromiumExecutable(root)) {
        onProgress?.({ phase: 'install', percent: 100 });
        resolve({ success: true });
      } else {
        resolve({ success: false, error: `安装失败（退出码 ${code}）` });
      }
    });
  });
}
