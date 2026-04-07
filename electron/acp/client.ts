import { EventEmitter } from 'node:events';
import { spawn, type ChildProcess } from 'node:child_process';
import { createInterface, type Interface as ReadlineInterface } from 'node:readline';
import type { JsonRpcMessage, JsonRpcRequest, JsonRpcResponse } from './types';
import { isJsonRpcNotification, isJsonRpcRequest, isJsonRpcResponse } from './types';

interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (reason: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

interface AcpClientOptions {
  requestTimeout?: number;
}

export class AcpClient extends EventEmitter {
  private process: ChildProcess | null = null;
  private readline: ReadlineInterface | null = null;
  private pendingRequests = new Map<number, PendingRequest>();
  private requestHandlers = new Map<string, (params: unknown) => Promise<unknown>>();
  private nextId = 1;
  private requestTimeout: number;

  constructor(options: AcpClientOptions = {}) {
    super();
    this.requestTimeout = options.requestTimeout ?? 30_000;
  }

  async spawn(command: string, args: string[], cwd: string, env?: NodeJS.ProcessEnv): Promise<void> {
    // 移除 npm_* 环境变量，避免 npm run dev 上下文干扰子进程
    const cleanEnv: NodeJS.ProcessEnv = {};
    for (const [key, value] of Object.entries(process.env)) {
      if (!key.startsWith('npm_')) {
        cleanEnv[key] = value;
      }
    }

    return new Promise<void>((resolve, reject) => {
      const child = spawn(command, args, {
        cwd,
        env: { ...cleanEnv, ...env },
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      this.process = child;

      child.on('error', (err) => {
        this.emit('disconnected', err);
        reject(err);
      });

      child.on('exit', (code, signal) => {
        this.rejectAllPending(new Error(`Agent process exited (code=${code}, signal=${signal})`));
        this.emit('disconnected', { code, signal });
      });

      if (!child.stdout || !child.stdin) {
        reject(new Error('Failed to create stdio pipes'));
        return;
      }

      this.readline = createInterface({ input: child.stdout });
      this.readline.on('line', (line) => this.handleLine(line));

      child.stderr?.on('data', (data: Buffer) => {
        this.emit('stderr', data.toString());
      });

      const onSpawn = () => {
        child.removeListener('error', onError);
        resolve();
      };
      const onError = (err: Error) => {
        child.removeListener('spawn', onSpawn);
        reject(err);
      };

      child.once('spawn', onSpawn);
      child.once('error', onError);
    });
  }

  disconnect(): void {
    if (this.process) {
      this.process.kill();
      this.process = null;
    }
    if (this.readline) {
      this.readline.close();
      this.readline = null;
    }
    this.rejectAllPending(new Error('Client disconnected'));
  }

  async sendRequest(method: string, params: unknown): Promise<unknown> {
    return new Promise((resolve, reject) => {
      if (!this.process?.stdin?.writable) {
        reject(new Error('Not connected'));
        return;
      }

      const id = this.nextId++;
      const message: JsonRpcRequest = { jsonrpc: '2.0', id, method, params };

      const timer = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error(`Request timeout: ${method} (id=${id})`));
      }, this.requestTimeout);

      this.pendingRequests.set(id, { resolve, reject, timer });
      this.process.stdin.write(JSON.stringify(message) + '\n');
    });
  }

  sendNotification(method: string, params: unknown): void {
    if (!this.process?.stdin?.writable) return;
    const message = { jsonrpc: '2.0', method, params };
    this.process.stdin.write(JSON.stringify(message) + '\n');
  }

  onRequest(method: string, handler: (params: unknown) => Promise<unknown>): void {
    this.requestHandlers.set(method, handler);
  }

  private handleLine(line: string): void {
    if (!line.trim()) return;

    let msg: JsonRpcMessage;
    try {
      msg = JSON.parse(line) as JsonRpcMessage;
    } catch {
      this.emit('parse_error', line);
      return;
    }

    if (isJsonRpcResponse(msg)) {
      this.handleResponse(msg);
    } else if (isJsonRpcRequest(msg)) {
      void this.handleIncomingRequest(msg);
    } else if (isJsonRpcNotification(msg)) {
      this.emit('notification', msg.method, msg.params);
    }
  }

  private handleResponse(msg: JsonRpcResponse): void {
    const pending = this.pendingRequests.get(msg.id);
    if (!pending) return;

    this.pendingRequests.delete(msg.id);
    clearTimeout(pending.timer);

    if (msg.error) {
      pending.reject(new Error(`JSON-RPC error: ${msg.error.message} (code=${msg.error.code})`));
    } else {
      pending.resolve(msg.result);
    }
  }

  private async handleIncomingRequest(msg: JsonRpcRequest): Promise<void> {
    const handler = this.requestHandlers.get(msg.method);

    if (!handler) {
      this.sendResponse(msg.id, undefined, {
        code: -32601,
        message: `Method not found: ${msg.method}`,
      });
      return;
    }

    try {
      const result = await handler(msg.params);
      this.sendResponse(msg.id, result);
    } catch (err) {
      this.sendResponse(msg.id, undefined, {
        code: -32603,
        message: err instanceof Error ? err.message : 'Internal error',
      });
    }
  }

  private sendResponse(id: number, result?: unknown, error?: { code: number; message: string }): void {
    if (!this.process?.stdin?.writable) return;
    const response: JsonRpcResponse = { jsonrpc: '2.0', id, ...(error ? { error } : { result }) };
    this.process.stdin.write(JSON.stringify(response) + '\n');
  }

  private rejectAllPending(error: Error): void {
    for (const [id, pending] of this.pendingRequests) {
      clearTimeout(pending.timer);
      pending.reject(error);
    }
    this.pendingRequests.clear();
  }
}
