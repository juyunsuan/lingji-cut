import { describe, expect, it } from 'vitest';
import { PermissionHandler } from '../electron/acp/permission';

describe('PermissionHandler', () => {
  describe('auto_approve policy', () => {
    it('approves everything', async () => {
      const handler = new PermissionHandler('auto_approve');
      expect(await handler.check({ type: 'fs.read', path: '/a' })).toBe('allow');
      expect(await handler.check({ type: 'fs.write', path: '/a' })).toBe('allow');
      expect(await handler.check({ type: 'terminal.execute', command: 'rm -rf /' })).toBe('allow');
    });
  });

  describe('tiered policy', () => {
    it('auto-approves reads', async () => {
      const handler = new PermissionHandler('tiered');
      expect(await handler.check({ type: 'fs.read', path: '/a' })).toBe('allow');
    });

    it('prompts for writes', async () => {
      const handler = new PermissionHandler('tiered');
      expect(await handler.check({ type: 'fs.write', path: '/a' })).toBe('deny');
    });

    it('prompts for terminal', async () => {
      const handler = new PermissionHandler('tiered');
      expect(await handler.check({ type: 'terminal.execute', command: 'ls' })).toBe('deny');
    });

    it('uses promptUser callback when set', async () => {
      const handler = new PermissionHandler('tiered');
      handler.setPromptCallback(async () => 'allow');
      expect(await handler.check({ type: 'fs.write', path: '/a' })).toBe('allow');
    });
  });

  describe('always_ask policy', () => {
    it('prompts for everything including reads', async () => {
      const handler = new PermissionHandler('always_ask');
      expect(await handler.check({ type: 'fs.read', path: '/a' })).toBe('deny');
    });

    it('uses callback when set', async () => {
      const handler = new PermissionHandler('always_ask');
      handler.setPromptCallback(async () => 'allow');
      expect(await handler.check({ type: 'fs.read', path: '/a' })).toBe('allow');
    });
  });

  it('updates policy dynamically', async () => {
    const handler = new PermissionHandler('always_ask');
    expect(await handler.check({ type: 'fs.read', path: '/a' })).toBe('deny');
    handler.setPolicy('auto_approve');
    expect(await handler.check({ type: 'fs.read', path: '/a' })).toBe('allow');
  });
});
