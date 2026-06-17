/**
 * session.ts
 *
 * AgentSession — 多协议 Agent Runtime 的会话执行核心。
 *
 * 职责：
 *   1. 按 def 探测 binPath（detection + BinaryManager.resolveBinary）。
 *   2. 调 def.buildArgs 组装参数，spawn 子进程。
 *   3. 按 streamFormat 接对应 parser，归一化为 AgentStreamEvent → onEvent。
 *   4. 管理生命周期（cancel / error / exit / stderr 收集）。
 *
 * spawn 可注入（AgentSessionDeps.spawnFn），便于单测不依赖真实 CLI。
 * 默认使用 node:child_process.spawn。
 */

import { spawn as nodeSpawn } from 'node:child_process';
import { detectAgent, createDetectionDeps } from './detection';
import type { RuntimeAgentDef } from './types';
import type { AgentStreamEvent } from './event-model';
import type { ResolvedAgentSkill } from '../acp/types';
import { createClaudeStreamParser } from './parsers/claude-stream';
import { createCodexParser } from './parsers/codex-json-event';
import { createPiRpcSession } from './parsers/pi-rpc';

// ─── 子进程抽象 ────────────────────────────────────────────────────────────────

/** spawn 返回的子进程子集（便于注入 fake child） */
export interface ChildProcessLike {
  stdout: NodeJS.ReadableStream | null;
  stderr: NodeJS.ReadableStream | null;
  stdin: NodeJS.WritableStream | null;
  kill(signal?: NodeJS.Signals | number): boolean;
  on(event: string, listener: (...args: unknown[]) => void): unknown;
}

export type SpawnFn = (
  command: string,
  args: string[],
  opts: Record<string, unknown>,
) => ChildProcessLike;

/** detection 所需的 BinaryManager 子集 + ensureNodeInPath */
export interface SessionBinaryManager {
  resolveBinary: (name: string) => Promise<string | null>;
  ensureNodeInPath?: () => void;
}

// ─── 公开接口 ────────────────────────────────────────────────────────────────

export interface AgentSessionDeps {
  /** 可注入的 spawn；默认 node child_process.spawn */
  spawnFn?: SpawnFn;
  /** 用于 detection / ensureNodeInPath */
  binaryManager?: SessionBinaryManager;
}

export interface AgentSessionStartInput {
  def: RuntimeAgentDef;
  prompt: string;
  cwd?: string;
  model?: string;
  /** 思考程度（reasoning effort）；透传给 buildArgs。 */
  reasoning?: string;
  /** 额外环境变量（覆盖 def.env） */
  env?: Record<string, string>;
  /** pi resume：parentSession id */
  parentSession?: string | null;
  /** resume 已存在会话（透传给 buildArgs） */
  resumeSessionId?: string | null;
  isResuming?: boolean;
  /** 连接期解析出的启用 skills（透传给 buildArgs）。 */
  skills?: ResolvedAgentSkill[];
  onEvent: (ev: AgentStreamEvent) => void;
}

// ─── 工具：clean env（去掉 npm_*） ───────────────────────────────────────────

function getCleanEnv(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (!key.startsWith('npm_')) {
      env[key] = value;
    }
  }
  return env;
}

// ─── AgentSession ──────────────────────────────────────────────────────────

export class AgentSession {
  private readonly spawnFn: SpawnFn;
  private readonly binaryManager?: SessionBinaryManager;

  private child: ChildProcessLike | null = null;
  private stderrBuf = '';
  private terminalEmitted = false;
  private cancelled = false;
  /** pi-rpc session（cancel/dispose 时需要） */
  private piSession: { dispose(): void; abort(): void } | null = null;

  constructor(deps?: AgentSessionDeps) {
    this.spawnFn = deps?.spawnFn ?? (nodeSpawn as unknown as SpawnFn);
    this.binaryManager = deps?.binaryManager;
  }

  async start(input: AgentSessionStartInput): Promise<void> {
    const { def, prompt, cwd, model, parentSession } = input;

    // 包裹 onEvent：任何经 parser 发出的 turn_end / error 都标记 terminalEmitted，
    // 使 close 兜底（emit turn_end）不会与正常终态重复。
    const onEvent = (ev: AgentStreamEvent) => {
      if (ev.type === 'turn_end' || ev.type === 'error') {
        this.terminalEmitted = true;
      }
      input.onEvent(ev);
    };

    // 1) 探测 binPath
    if (!this.binaryManager) {
      onEvent({ type: 'error', message: 'AgentSession: missing binaryManager' });
      return;
    }

    const detectionDeps = createDetectionDeps(this.binaryManager);
    const detection = await detectAgent(def, detectionDeps);
    if (!detection.installed || !detection.binPath) {
      onEvent({
        type: 'error',
        message: `Agent "${def.id}" 未安装或不可用（bin: ${def.bin}）`,
      });
      return;
    }
    const binPath = detection.binPath;

    // ensureNodeInPath：确保 npx/node 在 PATH（agent CLI 内部解析）
    try {
      this.binaryManager.ensureNodeInPath?.();
    } catch {
      // 容错：ensureNodeInPath 失败不阻断
    }

    // 2) buildArgs
    const args = def.buildArgs({
      prompt,
      cwd,
      model: model ?? def.defaultModel,
      reasoning: input.reasoning ?? def.defaultReasoning,
      resumeSessionId: input.resumeSessionId ?? null,
      isResuming: input.isResuming ?? false,
      skills: input.skills,
    });

    // 3) spawn
    const needsStdin = def.promptViaStdin === true || def.streamFormat === 'pi-rpc';
    const stdio: Array<'pipe' | 'ignore'> = [
      needsStdin ? 'pipe' : 'ignore',
      'pipe',
      'pipe',
    ];

    const env: NodeJS.ProcessEnv = {
      ...getCleanEnv(),
      ...(def.env ?? {}),
      ...(input.env ?? {}),
    };

    let child: ChildProcessLike;
    try {
      child = this.spawnFn(binPath, args, { cwd, env, stdio });
    } catch (err) {
      onEvent({
        type: 'error',
        message: `spawn 失败: ${err instanceof Error ? err.message : String(err)}`,
      });
      return;
    }
    this.child = child;

    // 5) stderr 收集
    child.stderr?.on('data', (chunk: unknown) => {
      this.stderrBuf += chunkToString(chunk);
    });

    // 6) 生命周期：error / close
    child.on('error', (err: unknown) => {
      this.emitTerminalError(onEvent, err instanceof Error ? err.message : String(err));
    });

    child.on('close', (...closeArgs: unknown[]) => {
      const code = typeof closeArgs[0] === 'number' ? (closeArgs[0] as number) : null;
      // 非 pi 路径：flush parser（可能补 emit 末尾的 turn_end）
      this.flushParser?.();
      if (this.cancelled) return;
      if (code != null && code !== 0) {
        this.emitTerminalError(
          onEvent,
          `Agent "${def.id}" 退出码 ${code}`,
          this.stderrBuf.trim() || undefined,
        );
        return;
      }
      // 进程已干净退出：若 parser 未发出任何终态事件（无 turn_end / error），
      // 兜底 emit turn_end，让上层（RuntimeRegistry）能从 prompting 回落 connected，
      // 而不是卡在 prompting。flush 后才判断，避免与正常 turn_end 重复。
      if (!this.terminalEmitted) {
        this.terminalEmitted = true;
        onEvent({ type: 'turn_end' });
      }
    });

    // 4) 按 streamFormat 接 parser
    switch (def.streamFormat) {
      case 'claude-stream-json': {
        const parser = createClaudeStreamParser(onEvent);
        this.flushParser = () => parser.flush();
        child.stdout?.on('data', (chunk: unknown) => parser.feed(chunkToString(chunk)));
        // claude 经 stdin 收 prompt（单轮：写后 end）
        if (def.promptViaStdin && child.stdin) {
          child.stdin.write(prompt);
          child.stdin.end();
        }
        break;
      }

      case 'codex-json-event': {
        const parser = createCodexParser(onEvent);
        this.flushParser = () => parser.flush();
        child.stdout?.on('data', (chunk: unknown) => parser.feed(chunkToString(chunk)));
        // prompt 经 stdin（按 def.promptViaStdin）或 args
        if (def.promptViaStdin && child.stdin) {
          child.stdin.write(prompt);
          child.stdin.end();
        }
        break;
      }

      case 'pi-rpc': {
        if (!child.stdout || !child.stdin) {
          this.emitTerminalError(onEvent, 'pi-rpc: child stdio 不可用');
          return;
        }
        // pi-rpc session 内部处理 stdin 命令 + stdout 解析
        this.piSession = createPiRpcSession({
          child: {
            stdout: child.stdout,
            stdin: child.stdin,
          },
          prompt,
          cwd,
          model: model ?? def.defaultModel,
          parentSession,
          onEvent,
        });
        break;
      }

      default: {
        const _exhaustive: never = def.streamFormat;
        void _exhaustive;
        this.emitTerminalError(onEvent, `未知 streamFormat: ${String(def.streamFormat)}`);
        return;
      }
    }
  }

  /** 可选：多轮写入（claude stdinOpen 等场景；首版单轮一般不用） */
  write(text: string): void {
    this.child?.stdin?.write(text);
  }

  /** 取消会话：先发 pi RPC abort（优雅停止当前轮），再移除监听并 SIGTERM 兜底。 */
  cancel(): void {
    this.cancelled = true;
    // pi-rpc：先 abort 让 pi 解除阻塞 / 收尾；再 dispose 移除监听。
    try {
      this.piSession?.abort();
    } catch {
      // 容错
    }
    this.piSession?.dispose();
    this.piSession = null;
    try {
      this.child?.kill('SIGTERM');
    } catch {
      // 容错
    }
  }

  // ── 内部 ──────────────────────────────────────────────────────────────────

  /** parser flush 回调（pi-rpc 由其 session 自行管理，故可能为空） */
  private flushParser: (() => void) | null = null;

  private emitTerminalError(
    onEvent: (ev: AgentStreamEvent) => void,
    message: string,
    raw?: string,
  ): void {
    if (this.terminalEmitted) return;
    this.terminalEmitted = true;
    onEvent({ type: 'error', message, raw });
  }
}

function chunkToString(chunk: unknown): string {
  if (typeof chunk === 'string') return chunk;
  if (chunk instanceof Buffer) return chunk.toString('utf-8');
  if (chunk == null) return '';
  return String(chunk);
}
