import { ipcMain, app } from 'electron';
import { join } from 'node:path';
import { AccountStore } from './accounts';
import { getPlatform } from './platforms';
import { parseAccountId } from './account-id';
import { runPublishJob } from './runner';
import type { PublishJob, PublishPlatform } from './types';

let store: AccountStore | null = null;
function getStore(): AccountStore {
  if (!store) store = new AccountStore(join(app.getPath('userData'), 'publish'));
  return store;
}

// ─── Cancel flag (module-level, simple single-job semantics) ──────────────────
let cancelled = false;

export function registerPublishIpc(): void {
  ipcMain.handle('publish:list-accounts', () => getStore().list());
  ipcMain.handle('publish:delete-account', (_e, id: string) => {
    getStore().remove(id);
  });
  ipcMain.handle('publish:login', async (e, platform: PublishPlatform, accountName: string) => {
    const s = getStore();
    const sp = s.storageStatePath(platform, accountName);
    const res = await getPlatform(platform).login({
      storageStatePath: sp,
      onQrcode: (png) => e.sender.send('publish:qrcode', { platform, accountName, png }),
    });
    if (res.success) s.upsert({ platform, accountName, status: 'valid' });
    return res;
  });
  ipcMain.handle('publish:check', async (_e, id: string) => {
    const s = getStore();
    const { platform } = parseAccountId(id);
    const acc = s.list().find((a) => a.id === id);
    if (!acc) return false;
    const ok = await getPlatform(platform).checkCookie(acc.storageStatePath);
    s.setStatus(id, ok ? 'valid' : 'expired', Date.now());
    return ok;
  });

  // ─── publish:run ────────────────────────────────────────────────────────────
  ipcMain.handle('publish:run', async (e, job: PublishJob, headless = true) => {
    cancelled = false;
    try {
      await runPublishJob(job, getStore(), e.sender, () => cancelled, headless);
    } catch (err) {
      throw err;
    }
  });

  // ─── publish:cancel ─────────────────────────────────────────────────────────
  ipcMain.handle('publish:cancel', () => {
    cancelled = true;
  });
}
