import { describe, it, expect } from 'vitest';
import { registerPipelineMcpTools } from '../electron/pipeline/tools/register';

class FakeMcpServer {
  tools = new Map<string, { def: unknown; handler: (args: unknown) => unknown }>();
  registerTool(name: string, def: unknown, handler: (args: unknown) => unknown): void {
    this.tools.set(name, { def, handler });
  }
}

describe('registerPipelineMcpTools', () => {
  it('registers the 7 pipeline tools by name', () => {
    const server = new FakeMcpServer();
    registerPipelineMcpTools(
      server as unknown as Parameters<typeof registerPipelineMcpTools>[0],
      () => null,
      () => '/tmp/fake-user-data',
    );
    const expected = [
      'lingji_create_project',
      'lingji_open_project',
      'lingji_get_project_state',
      'lingji_get_settings',
      'lingji_get_task_status',
      'lingji_cancel_task',
      'lingji_list_tasks',
      'lingji_get_active_project',
      'lingji_list_recent_projects',
    ];
    for (const name of expected) {
      expect(server.tools.has(name)).toBe(true);
    }
    expect(server.tools.size).toBeGreaterThanOrEqual(9);
  });

  it('lingji_create_project handler returns success result for fresh dir', async () => {
    const server = new FakeMcpServer();
    registerPipelineMcpTools(
      server as unknown as Parameters<typeof registerPipelineMcpTools>[0],
      () => null,
      () => '/tmp/fake-user-data',
    );
    const handler = server.tools.get('lingji_create_project')!.handler;
    const { mkdtempSync, rmSync } = await import('node:fs');
    const path = await import('node:path');
    const os = await import('node:os');
    const root = mkdtempSync(path.join(os.tmpdir(), 'lingji-mcp-reg-'));
    try {
      const target = path.join(root, 'p');
      const result = (await handler({ path: target })) as { content: { text: string }[] };
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.projectPath).toBe(target);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('returns structured error with code when create_project rejects', async () => {
    const server = new FakeMcpServer();
    registerPipelineMcpTools(
      server as unknown as Parameters<typeof registerPipelineMcpTools>[0],
      () => null,
      () => '/tmp/fake-user-data',
    );
    const handler = server.tools.get('lingji_create_project')!.handler;
    const result = (await handler({ path: 'relative/path' })) as { content: { text: string }[]; isError?: boolean };
    expect(result.isError).toBe(true);
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.code).toBe('invalid_project');
    expect(typeof parsed.error).toBe('string');
  });
});
