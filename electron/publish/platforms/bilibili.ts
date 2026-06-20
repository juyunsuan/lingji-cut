/**
 * B站平台模块
 *
 * 使用内置 biliup 二进制完成登录（扫码）、Cookie 校验、视频上传。
 * 完全不依赖 Playwright / engine — 仅 biliup-runtime。
 *
 * 参考源：social-auto-upload/sau_cli.py
 *   login_bilibili_account   → login
 *   check_bilibili_account   → checkCookie
 *   upload_bilibili_video    → uploadVideo / buildBiliupUploadArgs
 */

import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { runBiliup } from '../biliup-runtime';
import type { LoginOptions, PlatformModule, UploadVideoOptions } from '../types';

// ─── Pure argv builder (unit-tested) ─────────────────────────────────────────

/**
 * 构建 biliup upload 命令参数，与 sau_cli.py upload_bilibili_video 保持一致。
 *
 * 源码顺序：
 *   -u <account_file> upload <video_file>
 *   --title <title>
 *   --desc <description>
 *   --tid <tid>
 *   [--tag <tag1,tag2>]
 *   [--dtime <unix_seconds>]
 */
export function buildBiliupUploadArgs(
  accountFile: string,
  opts: UploadVideoOptions,
): string[] {
  const args: string[] = [
    '-u', accountFile,
    'upload', opts.filePath,
    '--title', opts.title,
    '--desc', opts.desc,
    '--tid', String(opts.tid),
  ];

  if (opts.tags && opts.tags.length > 0) {
    args.push('--tag', opts.tags.join(','));
  }

  if (opts.scheduleAt) {
    args.push('--dtime', String(Math.floor(opts.scheduleAt / 1000)));
  }

  return args;
}

// ─── Platform module ──────────────────────────────────────────────────────────

export const bilibili: PlatformModule = {
  platform: 'bilibili',

  /**
   * checkCookie — port of check_bilibili_account
   * biliup renew 返回 0 表示 cookie 有效。
   */
  async checkCookie(storageStatePath: string): Promise<boolean> {
    const { code } = await runBiliup(['-u', storageStatePath, 'renew']);
    return code === 0;
  },

  /**
   * login — port of login_bilibili_account
   *
   * biliup 会把 qrcode.png 写到 CWD；我们用临时目录控制落盘位置，
   * 轮询出现后通过 opts.onQrcode 通知 UI，然后等待 biliup 退出。
   */
  async login(opts: LoginOptions): Promise<{ success: boolean; message: string }> {
    // 用临时目录让 biliup 把 qrcode.png 写到可控位置
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'lingji-bili-'));
    const qrPath = path.join(tmpDir, 'qrcode.png');

    let pollTimer: ReturnType<typeof setInterval> | null = null;
    let qrSurfaced = false;

    if (opts.onQrcode) {
      // 每 500ms 轮询 qrcode.png 是否出现，出现后立刻回调
      pollTimer = setInterval(() => {
        if (qrSurfaced) return;
        fs.access(qrPath)
          .then(() => {
            if (!qrSurfaced) {
              qrSurfaced = true;
              opts.onQrcode!(qrPath);
            }
          })
          .catch(() => {
            // 还没出现，继续等
          });
      }, 500);
    }

    try {
      const { code, stdout, stderr } = await runBiliup(
        ['-u', opts.storageStatePath, 'login'],
        { cwd: tmpDir },
      );

      // biliup 已退出，停止轮询
      if (pollTimer) {
        clearInterval(pollTimer);
        pollTimer = null;
      }

      // 最后再查一次（轮询间隔内可能刚好错过）
      if (opts.onQrcode && !qrSurfaced) {
        try {
          await fs.access(qrPath);
          opts.onQrcode(qrPath);
        } catch {
          // 没有就算了
        }
      }

      if (code === 0) {
        return { success: true, message: '登录完成' };
      }
      return {
        success: false,
        message: (stderr || stdout || '').trim() || 'B站登录失败',
      };
    } finally {
      if (pollTimer) clearInterval(pollTimer);
      // 异步清理临时目录（不阻塞返回；qrcode 已被扫描，UI 已经处理完毕）
      fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
    }
  },

  /**
   * uploadVideo — port of upload_bilibili_video
   * tid 必填；缺失时直接抛错，调用方看到明确提示。
   */
  async uploadVideo(opts: UploadVideoOptions): Promise<void> {
    if (opts.tid == null) {
      throw new Error('B站上传必须指定分区 id (tid)，请在发布面板中填写');
    }
    const { code, stdout, stderr } = await runBiliup(
      buildBiliupUploadArgs(opts.storageStatePath, opts),
    );
    if (code !== 0) {
      throw new Error((stderr || stdout || '').trim() || 'B站上传失败');
    }
  },
};
