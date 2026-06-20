import type { BrowserContext } from 'playwright';
import { join } from 'node:path';
import { applyStealth } from './stealth';

interface ContextOpts {
  storageStatePath?: string;
  headless: boolean;
}

/**
 * 在打包 Electron 环境下，将 PLAYWRIGHT_BROWSERS_PATH 指向 app.asar.unpacked 内的随包 Chromium。
 * - 仅在真实 launch 路径调用（测试注入 playwrightModule 时整个函数不会被调用）。
 * - 开发模式（app.isPackaged === false）不设置，使用开发机已安装的浏览器。
 * - 纯 Node/Vitest 环境：process.resourcesPath 未定义，提前 return，无副作用。
 */
async function ensurePlaywrightBrowsersPath(): Promise<void> {
  if (process.env.PLAYWRIGHT_BROWSERS_PATH) return;
  const resourcesPath = (process as NodeJS.Process & { resourcesPath?: string }).resourcesPath;
  if (!resourcesPath) return; // 非 Electron 环境（Vitest/pure Node），跳过
  try {
    const { app } = await import('electron');
    if (!app.isPackaged) return; // 开发模式，playwright 用系统已安装浏览器
    process.env.PLAYWRIGHT_BROWSERS_PATH = join(
      resourcesPath,
      'app.asar.unpacked',
      'playwright-browsers',
    );
  } catch {
    // 非 Electron 运行时（理论上不会到这里），忽略
  }
}

// playwrightModule 仅供测试注入；生产用 dynamic import('playwright')
export async function withContext<T>(
  opts: ContextOpts,
  run: (ctx: BrowserContext) => Promise<T>,
  playwrightModule?: any,
): Promise<T> {
  if (!playwrightModule) {
    await ensurePlaywrightBrowsersPath();
  }
  const pw = playwrightModule ?? (await import('playwright'));
  const browser = await pw.chromium.launch({ headless: opts.headless });
  try {
    const context = await browser.newContext(
      opts.storageStatePath ? { storageState: opts.storageStatePath } : {},
    );
    await applyStealth(context);
    try {
      return await run(context);
    } finally {
      await context.close();
    }
  } finally {
    await browser.close();
  }
}
