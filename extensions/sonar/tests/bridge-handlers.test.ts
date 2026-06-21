import { describe, it, expect, vi } from 'vitest';
import { createHandlers } from '@/background/handlers';
import { createInMemoryContext } from '@/background/context';
import { createMemoryBridgeSettingsStore } from '@/bridge/bridge-settings';
import type { PushResult } from '@/bridge/push-on-processed';

const pushStub = async (): Promise<PushResult> => ({ pushed: false, reason: 'disabled' });

describe('bridge 协议 handlers', () => {
  it('getBridgeSettings 返回遮罩视图', async () => {
    const ctx = createInMemoryContext({
      bridge: {
        settings: createMemoryBridgeSettingsStore({ enabled: true, endpoint: 'http://x', token: 'abcd1234' }),
        client: { async probe() { return { ok: false }; } },
        push: pushStub,
      },
    });
    const view = (await createHandlers(ctx).getBridgeSettings!({})) as {
      enabled: boolean;
      tokenMasked?: string;
      token?: string;
    };
    expect(view.enabled).toBe(true);
    expect(view.tokenMasked).toBe('••••1234');
    expect(view.token).toBeUndefined();
  });

  it('updateBridgeSettings 写入设置', async () => {
    const settings = createMemoryBridgeSettingsStore();
    const ctx = createInMemoryContext({
      bridge: { settings, client: { async probe() { return { ok: false }; } }, push: pushStub },
    });
    await createHandlers(ctx).updateBridgeSettings!({ enabled: true, endpoint: 'http://y', token: 'k' });
    expect(await settings.get()).toEqual({ enabled: true, endpoint: 'http://y', token: 'k' });
  });

  it('testBridge 用当前设置探活', async () => {
    const probe = vi.fn(async () => ({ ok: true, version: '1.0.0' }));
    const ctx = createInMemoryContext({
      bridge: {
        settings: createMemoryBridgeSettingsStore({ enabled: true, endpoint: 'http://z', token: 't' }),
        client: { probe },
        push: pushStub,
      },
    });
    const res = await createHandlers(ctx).testBridge!({});
    expect(res).toEqual({ ok: true, version: '1.0.0' });
    expect(probe).toHaveBeenCalledWith({ enabled: true, endpoint: 'http://z', token: 't' });
  });

  it('pushVideoToBridge 手动推送（force+refresh）', async () => {
    const push = vi.fn(async () => ({ pushed: true, outcome: { status: 'sent', duplicate: false } }) as PushResult);
    const ctx = createInMemoryContext({
      bridge: {
        settings: createMemoryBridgeSettingsStore({ enabled: false, endpoint: 'http://z', token: 't' }),
        client: { async probe() { return { ok: false }; } },
        push,
      },
    });
    const res = await createHandlers(ctx).pushVideoToBridge!({ videoId: 'v9' });
    expect(res).toEqual({ pushed: true, outcome: { status: 'sent', duplicate: false } });
    expect(push).toHaveBeenCalledWith('v9', { force: true, refresh: true });
  });
});
