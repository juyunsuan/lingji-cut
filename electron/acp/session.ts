import { EventEmitter } from 'node:events';
import type { AcpClient } from './client';
import type { AgentConfig, SessionData } from './config';
import type { FileSystemRuntime } from './fs-runtime';
import type { TerminalRuntime } from './terminal-runtime';
import { PermissionHandler } from './permission';
import type {
  AcpEvent,
  ConnectionStatus,
  InitializeResult,
  NewSessionResult,
  PermissionPolicy,
  PromptInputBlock,
} from './types';

interface PendingPermission {
  resolve: (response: { outcome: { outcome: string; optionId?: string } }) => void;
}

export class SessionManager extends EventEmitter {
  private client: AcpClient;
  private config: AgentConfig;
  private fsRuntime: FileSystemRuntime | null = null;
  private terminalRuntime: TerminalRuntime;
  private permissionHandler: PermissionHandler;
  private pendingPermissions = new Map<number, PendingPermission>();
  private permissionSeq = 0;

  private status: ConnectionStatus = 'disconnected';
  private sessionId: string | null = null;
  private projectDir: string | null = null;
  private initializeResult: InitializeResult | null = null;

  constructor(
    client: AcpClient,
    config: AgentConfig,
    terminalRuntime: TerminalRuntime,
    permissionPolicy: PermissionPolicy,
  ) {
    super();
    this.client = client;
    this.config = config;
    this.terminalRuntime = terminalRuntime;
    this.permissionHandler = new PermissionHandler(permissionPolicy);

    // 监听 client 通知 — ACP 协议中所有事件均通过 session/update 通知传递
    this.client.on('notification', (method: string, params: unknown) => {
      if (method === 'session/update') {
        this.handleSessionUpdate(params);
      }
    });

    this.client.on('disconnected', () => {
      this.setStatus('disconnected');
      // 拒绝所有待处理的权限请求
      for (const [, pending] of this.pendingPermissions) {
        pending.resolve({ outcome: { outcome: 'cancelled' } });
      }
      this.pendingPermissions.clear();
      this.terminalRuntime.killAll();
    });
  }

  getStatus(): ConnectionStatus {
    return this.status;
  }

  getSessionId(): string | null {
    return this.sessionId;
  }

  getCapabilities(): InitializeResult | null {
    return this.initializeResult;
  }

  setPermissionPolicy(policy: PermissionPolicy): void {
    this.permissionHandler.setPolicy(policy);
  }

  setPermissionPromptCallback(
    cb: (action: { type: string; path?: string; command?: string }) => Promise<'allow' | 'deny'>,
  ): void {
    this.permissionHandler.setPromptCallback(cb);
  }

  async connect(
    projectDir: string,
    spawnCommand: string,
    spawnArgs: string[],
    env?: Record<string, string>,
  ): Promise<void> {
    this.projectDir = projectDir;
    this.setStatus('connecting');

    const { FileSystemRuntime } = await import('./fs-runtime');
    this.fsRuntime = new FileSystemRuntime(projectDir);

    // 注册 runtime handlers
    this.registerRuntimeHandlers();

    // spawn agent 进程
    await this.client.spawn(spawnCommand, spawnArgs, projectDir, env);

    // initialize（protocolVersion 必须为数字）
    this.initializeResult = (await this.client.sendRequest('initialize', {
      protocolVersion: 1,
      clientCapabilities: {
        terminal: true,
        fs: { readTextFile: true, writeTextFile: true },
      },
    })) as InitializeResult;

    // 尝试恢复会话
    const savedSession = await this.config.loadSession(projectDir);
    let sessionResult: NewSessionResult;

    if (savedSession?.sessionId) {
      try {
        sessionResult = (await this.client.sendRequest('session/load', {
          sessionId: savedSession.sessionId,
          cwd: projectDir,
          mcpServers: [],
        })) as NewSessionResult;
      } catch {
        // 恢复失败，创建新会话
        sessionResult = (await this.client.sendRequest('session/new', {
          cwd: projectDir,
          mcpServers: [],
        })) as NewSessionResult;
      }
    } else {
      sessionResult = (await this.client.sendRequest('session/new', {
        cwd: projectDir,
        mcpServers: [],
      })) as NewSessionResult;
    }

    this.sessionId = sessionResult.sessionId;

    // 保存会话 ID
    if (this.sessionId) {
      await this.config.saveSession(projectDir, {
        sessionId: this.sessionId,
        lastConnected: new Date().toISOString(),
      });
    }

    this.setStatus('connected');

    // 从 session 结果和 initialize 结果中提取 capabilities
    const capabilities = {
      modes: sessionResult.modes?.availableModes?.map((m: { id: string; name: string; description?: string; decription?: string }) => ({
        modeId: m.id,
        name: m.name,
        description: m.description || m.decription || '',
      })) ?? [],
      configOptions: sessionResult.configOptions ?? [],
      currentModeId: sessionResult.modes?.currentModeId,
      models: sessionResult.models,
      agentInfo: this.initializeResult?.agentInfo,
    };
    this.emit('capabilities', capabilities);
  }

  async sendPrompt(contents: PromptInputBlock[] | unknown[]): Promise<void> {
    if (!this.sessionId) throw new Error('No active session');
    this.setStatus('prompting');
    const result = await this.client.sendRequest('session/prompt', {
      sessionId: this.sessionId,
      prompt: contents,
    });
    // session/prompt 返回 { stopReason, usage? } — 表示 turn 结束
    const res = result as { stopReason?: string; usage?: { used: number; size: number } } | undefined;
    this.handleEvent({
      type: 'turn_complete',
      sessionId: this.sessionId!,
      stopReason: res?.stopReason ?? 'end_turn',
      agentType: 'claude-acp',
      usage: res?.usage,
    });
  }

  async cancelTurn(): Promise<void> {
    if (!this.sessionId) return;
    this.client.sendNotification('session/cancel', { sessionId: this.sessionId });
    // 取消所有待处理的权限请求
    for (const [, pending] of this.pendingPermissions) {
      pending.resolve({ outcome: { outcome: 'cancelled' } });
    }
    this.pendingPermissions.clear();
  }

  async setMode(modeId: string): Promise<void> {
    if (!this.sessionId) return;
    await this.client.sendRequest('session/set_mode', {
      sessionId: this.sessionId,
      modeId,
    });
  }

  async setConfigOption(configId: string, valueId: string): Promise<void> {
    if (!this.sessionId) return;
    await this.client.sendRequest('session/set_config_option', {
      sessionId: this.sessionId,
      configId,
      valueId,
    });
  }

  async respondPermission(requestId: string, optionId: string): Promise<void> {
    const seq = parseInt(requestId, 10);
    const pending = this.pendingPermissions.get(seq);
    if (!pending) return;
    this.pendingPermissions.delete(seq);
    pending.resolve({ outcome: { outcome: 'selected', optionId } });
  }

  disconnect(): void {
    this.client.disconnect();
    this.terminalRuntime.killAll();
    this.sessionId = null;
    this.fsRuntime = null;
    this.setStatus('disconnected');
  }

  private registerRuntimeHandlers(): void {
    // 文件操作 — ACP 方法: fs/read_text_file, fs/write_text_file
    this.client.onRequest('fs/read_text_file', async (params) => {
      const { path: filePath } = params as { path: string };
      const allowed = await this.permissionHandler.check({ type: 'fs.read', path: filePath });
      if (allowed === 'deny') throw new Error('Permission denied: fs/read_text_file');
      return this.fsRuntime!.readTextFile({ path: filePath });
    });

    this.client.onRequest('fs/write_text_file', async (params) => {
      const { path: filePath, content } = params as { path: string; content: string };
      const allowed = await this.permissionHandler.check({ type: 'fs.write', path: filePath });
      if (allowed === 'deny') throw new Error('Permission denied: fs/write_text_file');
      const result = await this.fsRuntime!.writeTextFile({ path: filePath, content });
      // 通知前端文件变更（用于 diff 展示）
      this.emit('file_changed', { path: filePath, before: result.before, after: result.after });
      return {};
    });

    // 终端操作 — ACP 方法: terminal/create, terminal/output, terminal/kill, terminal/wait_for_exit, terminal/release
    this.client.onRequest('terminal/create', async (params) => {
      const { command, args, cwd } = params as { command: string; args?: string[]; cwd?: string; sessionId?: string };
      const allowed = await this.permissionHandler.check({ type: 'terminal.create', cwd });
      if (allowed === 'deny') throw new Error('Permission denied: terminal/create');
      const result = await this.terminalRuntime.createTerminal({
        cwd: cwd || this.projectDir || undefined,
      });
      // ACP 中 terminal/create 自带命令执行
      if (command) {
        const fullCmd = args?.length ? `${command} ${args.join(' ')}` : command;
        await this.terminalRuntime.executeCommand({ terminalId: result.terminalId, command: fullCmd });
      }
      return { terminalId: result.terminalId };
    });

    this.client.onRequest('terminal/output', async (params) => {
      const { terminalId } = params as { terminalId: string };
      const result = this.terminalRuntime.getOutput({ terminalId });
      return { output: result.output, truncated: false };
    });

    this.client.onRequest('terminal/kill', async (params) => {
      const { terminalId } = params as { terminalId: string };
      this.terminalRuntime.killTerminal({ terminalId });
      return {};
    });

    this.client.onRequest('terminal/wait_for_exit', async (params) => {
      const { terminalId } = params as { terminalId: string };
      // 等待终端命令完成（轮询输出稳定）
      const result = await this.terminalRuntime.executeCommand({ terminalId, command: '' });
      return { exitCode: 0 };
    });

    this.client.onRequest('terminal/release', async (params) => {
      const { terminalId } = params as { terminalId: string };
      this.terminalRuntime.killTerminal({ terminalId });
      return {};
    });

    // 权限请求 — Agent 发送 session/request_permission 请求，Client 异步返回用户决定
    this.client.onRequest('session/request_permission', async (params) => {
      const { toolCall, options, sessionId } = params as {
        toolCall: unknown;
        options: { optionId: string; name: string; kind: string }[];
        sessionId: string;
      };

      const seq = this.permissionSeq++;

      // 通知前端显示权限请求 UI
      this.emit('event', {
        type: 'permission_request',
        requestId: String(seq),
        toolCall,
        options,
      });

      // 等待用户响应（通过 respondPermission 方法 resolve）
      return new Promise<{ outcome: { outcome: string; optionId?: string } }>((resolve) => {
        this.pendingPermissions.set(seq, { resolve });
      });
    });

    // session/elicitation — Agent 询问用户输入
    this.client.onRequest('session/elicitation', async (params) => {
      // 暂不支持 elicitation，直接返回取消
      return { action: 'dismiss' };
    });
  }

  private handleEvent(event: AcpEvent): void {
    if (event.type === 'turn_complete') {
      this.setStatus('connected');
    }
    this.emit('event', event);
  }

  /**
   * 处理 ACP session/update 通知 — 将协议格式转换为前端 AcpEvent
   * 通知结构: { sessionId, update: { sessionUpdate: "...", ...data } }
   */
  private handleSessionUpdate(params: unknown): void {
    const data = params as {
      sessionId?: string;
      update?: { sessionUpdate?: string; [key: string]: unknown };
    };
    if (!data?.update) return;

    const { sessionUpdate } = data.update;

    switch (sessionUpdate) {
      case 'agent_message_chunk': {
        const content = data.update.content as { type: string; text?: string } | undefined;
        if (content?.text) {
          this.handleEvent({ type: 'content_delta', text: content.text });
        }
        break;
      }
      case 'agent_thought_chunk': {
        const content = data.update.content as { type: string; text?: string } | undefined;
        if (content?.text) {
          this.handleEvent({ type: 'thinking', text: content.text });
        }
        break;
      }
      case 'tool_call': {
        const tc = data.update as {
          toolCallId: string;
          title: string;
          kind?: string;
          status?: string;
          content?: unknown[];
          rawInput?: unknown;
          rawOutput?: unknown;
        };
        this.handleEvent({
          type: 'tool_call',
          toolCallId: tc.toolCallId,
          title: tc.title,
          kind: tc.kind ?? 'unknown',
          status: tc.status ?? 'running',
          content: typeof tc.content === 'string' ? tc.content : undefined,
          rawInput: tc.rawInput != null ? JSON.stringify(tc.rawInput) : undefined,
          rawOutput: tc.rawOutput != null ? JSON.stringify(tc.rawOutput) : undefined,
        });
        break;
      }
      case 'tool_call_update': {
        const tcu = data.update as {
          toolCallId: string;
          title?: string;
          status?: string;
          content?: unknown[];
          rawInput?: unknown;
          rawOutput?: unknown;
        };
        this.handleEvent({
          type: 'tool_call_update',
          toolCallId: tcu.toolCallId,
          title: tcu.title,
          status: tcu.status,
          content: typeof tcu.content === 'string' ? tcu.content : undefined,
          rawInput: tcu.rawInput != null ? JSON.stringify(tcu.rawInput) : undefined,
          rawOutput: tcu.rawOutput != null ? JSON.stringify(tcu.rawOutput) : undefined,
        });
        break;
      }
      case 'usage_update': {
        const usage = data.update as { used: number; size: number };
        this.handleEvent({ type: 'usage', used: usage.used, size: usage.size });
        break;
      }
      case 'current_mode_update': {
        this.emit('event', {
          type: 'mode_update',
          currentModeId: data.update.currentModeId,
        });
        break;
      }
      case 'available_commands_update': {
        this.emit('event', {
          type: 'available_commands',
          commands: data.update.availableCommands,
        });
        break;
      }
      case 'config_option_update': {
        this.emit('event', {
          type: 'config_update',
          configOptions: data.update.configOptions,
        });
        break;
      }
      case 'plan': {
        this.emit('event', {
          type: 'plan_update',
          entries: data.update.entries,
        });
        break;
      }
      case 'user_message_chunk':
        // 用户消息回显，通常忽略
        break;
      default:
        // 未知 sessionUpdate 类型，静默忽略
        break;
    }
  }

  private setStatus(status: ConnectionStatus): void {
    this.status = status;
    this.emit('status', status);
  }
}
