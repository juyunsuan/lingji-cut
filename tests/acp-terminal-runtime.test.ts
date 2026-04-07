import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';
import { EventEmitter } from 'node:events';

// Mock node-pty with a fake IPty
class FakePty extends EventEmitter {
  pid = 12345;
  cols = 120;
  rows = 30;
  process = '/bin/zsh';
  handleFlowControl = false;

  private _onDataHandlers: ((data: string) => void)[] = [];
  private _onExitHandlers: (() => void)[] = [];
  private _killed = false;

  onData(handler: (data: string) => void) {
    this._onDataHandlers.push(handler);
    return { dispose: () => {} };
  }

  onExit(handler: () => void) {
    this._onExitHandlers.push(handler);
    return { dispose: () => {} };
  }

  write(data: string) {
    // 模拟输出
    setTimeout(() => {
      if (!this._killed) {
        for (const h of this._onDataHandlers) {
          h(`output: ${data}`);
        }
      }
    }, 10);
  }

  resize() {}
  pause() {}
  resume() {}
  clear() {}

  kill() {
    this._killed = true;
    for (const h of this._onExitHandlers) h();
  }
}

vi.mock('node-pty', () => ({
  spawn: () => new FakePty(),
}));

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'terminal-runtime-test-'));
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe('TerminalRuntime', () => {
  it('creates a terminal and returns an id', async () => {
    const { TerminalRuntime } = await import('../electron/acp/terminal-runtime');
    const runtime = new TerminalRuntime(5, 1024 * 1024);
    const result = await runtime.createTerminal({ cwd: tmpDir });
    expect(result.terminalId).toBeTruthy();
    expect(typeof result.terminalId).toBe('string');
    runtime.killAll();
  });

  it('enforces max terminal limit', async () => {
    const { TerminalRuntime } = await import('../electron/acp/terminal-runtime');
    const runtime = new TerminalRuntime(5, 1024 * 1024);
    for (let i = 0; i < 5; i++) {
      await runtime.createTerminal({ cwd: tmpDir });
    }
    await expect(runtime.createTerminal({ cwd: tmpDir })).rejects.toThrow(/limit/i);
    runtime.killAll();
  });

  it('kills a terminal', async () => {
    const { TerminalRuntime } = await import('../electron/acp/terminal-runtime');
    const runtime = new TerminalRuntime(5, 1024 * 1024);
    const { terminalId } = await runtime.createTerminal({ cwd: tmpDir });
    runtime.killTerminal({ terminalId });
    // 再次 kill 不应抛异常
    runtime.killTerminal({ terminalId });
  });

  it('kills all terminals', async () => {
    const { TerminalRuntime } = await import('../electron/acp/terminal-runtime');
    const runtime = new TerminalRuntime(5, 1024 * 1024);
    await runtime.createTerminal({ cwd: tmpDir });
    await runtime.createTerminal({ cwd: tmpDir });
    runtime.killAll();
    // 之后应能重新创建
    const { terminalId } = await runtime.createTerminal({ cwd: tmpDir });
    expect(terminalId).toBeTruthy();
    runtime.killAll();
  });
});
