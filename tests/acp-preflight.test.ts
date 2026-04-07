import { describe, expect, it, vi } from 'vitest';
import { runPreflight } from '../electron/acp/preflight';

vi.mock('electron', () => ({
  safeStorage: {
    isEncryptionAvailable: () => true,
    encryptString: (text: string) => Buffer.from(`enc:${text}`),
    decryptString: (buffer: Buffer) => buffer.toString().replace('enc:', ''),
  },
}));

describe('Preflight', () => {
  it('returns checks array with expected labels', async () => {
    const { BinaryManager } = await import('../electron/acp/binary-manager');
    const { AgentConfig } = await import('../electron/acp/config');
    const bm = new BinaryManager('/tmp/test-cache');
    const config = new AgentConfig('/tmp/test-agent-config.json');

    const checks = await runPreflight(bm, config, 'claude-acp');

    const labels = checks.map((c) => c.label);
    expect(labels).toContain('Node.js');
    expect(labels).toContain('npx');
    expect(labels).toContain('claude-agent-acp');
    expect(labels).toContain('API Key');

    // 本机应该有 node 和 npx
    const nodeCheck = checks.find((c) => c.label === 'Node.js');
    expect(nodeCheck?.status).toBe('pass');
  });
});
