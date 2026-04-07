import * as pty from 'node-pty';
import os from 'node:os';
import { randomUUID } from 'node:crypto';

interface ManagedTerminal {
  pty: pty.IPty;
  outputBuffer: string;
  bufferSize: number;
}

export class TerminalRuntime {
  private terminals = new Map<string, ManagedTerminal>();
  private maxTerminals: number;
  private maxBufferSize: number;

  constructor(maxTerminals = 5, maxBufferSize = 1024 * 1024) {
    this.maxTerminals = maxTerminals;
    this.maxBufferSize = maxBufferSize;
  }

  async createTerminal(params: { cwd?: string }): Promise<{ terminalId: string }> {
    if (this.terminals.size >= this.maxTerminals) {
      throw new Error(`Terminal limit reached (max ${this.maxTerminals})`);
    }

    const shell = os.platform() === 'win32' ? 'powershell.exe' : process.env.SHELL || '/bin/zsh';
    const terminalId = randomUUID();

    const terminal = pty.spawn(shell, [], {
      name: 'xterm-256color',
      cols: 120,
      rows: 30,
      cwd: params.cwd || process.cwd(),
      env: process.env as Record<string, string>,
    });

    const managed: ManagedTerminal = {
      pty: terminal,
      outputBuffer: '',
      bufferSize: 0,
    };

    terminal.onData((data) => {
      managed.outputBuffer += data;
      managed.bufferSize += data.length;

      if (managed.bufferSize > this.maxBufferSize) {
        const half = Math.floor(this.maxBufferSize / 2);
        managed.outputBuffer = managed.outputBuffer.slice(-half);
        managed.bufferSize = managed.outputBuffer.length;
      }
    });

    terminal.onExit(() => {
      this.terminals.delete(terminalId);
    });

    this.terminals.set(terminalId, managed);
    return { terminalId };
  }

  async executeCommand(params: {
    terminalId: string;
    command: string;
    timeout?: number;
  }): Promise<{ output: string }> {
    const managed = this.terminals.get(params.terminalId);
    if (!managed) {
      throw new Error(`Terminal not found: ${params.terminalId}`);
    }

    const startLen = managed.outputBuffer.length;
    managed.pty.write(params.command + '\n');

    const timeout = params.timeout ?? 120_000;
    const output = await this.waitForOutput(managed, startLen, timeout);

    return { output };
  }

  getOutput(params: { terminalId: string }): { output: string } {
    const managed = this.terminals.get(params.terminalId);
    if (!managed) {
      throw new Error(`Terminal not found: ${params.terminalId}`);
    }
    return { output: managed.outputBuffer };
  }

  killTerminal(params: { terminalId: string }): void {
    const managed = this.terminals.get(params.terminalId);
    if (!managed) return;

    try {
      managed.pty.kill();
    } catch {
      // 已经退出
    }
    this.terminals.delete(params.terminalId);
  }

  killAll(): void {
    for (const [id] of this.terminals) {
      this.killTerminal({ terminalId: id });
    }
  }

  private waitForOutput(
    managed: ManagedTerminal,
    startLen: number,
    timeout: number,
  ): Promise<string> {
    return new Promise((resolve) => {
      const deadline = Date.now() + timeout;
      let lastLen = startLen;
      let stableCount = 0;

      const check = () => {
        if (Date.now() > deadline) {
          resolve(managed.outputBuffer.slice(startLen) + '\n[命令超时]');
          return;
        }

        const currentLen = managed.outputBuffer.length;
        if (currentLen > lastLen) {
          lastLen = currentLen;
          stableCount = 0;
        } else {
          stableCount++;
        }

        if (stableCount >= 5 && currentLen > startLen) {
          resolve(managed.outputBuffer.slice(startLen));
          return;
        }

        setTimeout(check, 100);
      };

      setTimeout(check, 100);
    });
  }
}
