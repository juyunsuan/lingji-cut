import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventEmitter } from 'node:events';
import { AgentSession } from '../../electron/agent-runtime/session';
import type { RuntimeAgentDef } from '../../electron/agent-runtime/types';
import type { AgentStreamEvent } from '../../electron/agent-runtime/event-model';
import { claudeAgentDef } from '../../electron/agent-runtime/agent-defs/claude';
import { codexAgentDef } from '../../electron/agent-runtime/agent-defs/codex';
import { piAgentDef } from '../../electron/agent-runtime/agent-defs/pi';

// ─── Fake child process ────────────────────────────────────────────────────

class FakeStream extends EventEmitter {
  push(chunk: string): void {
    this.emit('data', chunk);
  }
  end(): void {
    this.emit('end');
  }
}

class FakeWritable extends EventEmitter {
  write = vi.fn((_chunk: string) => true);
  end = vi.fn();
}

class FakeChild extends EventEmitter {
  stdout = new FakeStream();
  stderr = new FakeStream();
  stdin = new FakeWritable();
  kill = vi.fn();
  killed = false;
  constructor() {
    super();
    this.kill.mockImplementation(() => {
      this.killed = true;
      return true;
    });
  }
}

// ─── Test helpers ────────────────────────────────────────────────────────────

function makeBinaryManager(resolved: string | null = '/fake/bin') {
  return {
    resolveBinary: vi.fn().mockResolvedValue(resolved),
    ensureNodeInPath: vi.fn(),
  };
}

function makeSession(
  child: FakeChild,
  bm: ReturnType<typeof makeBinaryManager>,
): { session: AgentSession; spawnFn: ReturnType<typeof vi.fn> } {
  const spawnFn = vi.fn(() => child as unknown as any);
  const session = new AgentSession({
    spawnFn: spawnFn as any,
    binaryManager: bm as any,
  });
  return { session, spawnFn };
}

describe('AgentSession', () => {
  let events: AgentStreamEvent[];
  let onEvent: (ev: AgentStreamEvent) => void;

  beforeEach(() => {
    events = [];
    onEvent = (ev) => events.push(ev);
  });

  it('claude: spawn + stream-json → 归一化事件，prompt 写入 stdin', async () => {
    const child = new FakeChild();
    const bm = makeBinaryManager('/usr/local/bin/claude');
    const { session, spawnFn } = makeSession(child, bm);

    await session.start({
      def: claudeAgentDef as RuntimeAgentDef,
      prompt: 'hello',
      cwd: '/tmp/proj',
      onEvent,
    });

    // spawn called with resolved binPath and built args
    expect(spawnFn).toHaveBeenCalledTimes(1);
    const [cmd, args, opts] = spawnFn.mock.calls[0];
    expect(cmd).toBe('/usr/local/bin/claude');
    expect(args).toContain('stream-json');
    expect(opts.cwd).toBe('/tmp/proj');

    // promptViaStdin → prompt written to stdin then end
    expect(child.stdin.write).toHaveBeenCalledWith('hello');
    expect(child.stdin.end).toHaveBeenCalled();

    // push stream-json lines
    child.stdout.push(
      JSON.stringify({
        type: 'content_block_delta',
        delta: { type: 'text_delta', text: 'Hi' },
      }) + '\n',
    );
    child.stdout.push(
      JSON.stringify({
        type: 'content_block_start',
        content_block: { type: 'tool_use', id: 't1', name: 'Read' },
      }) + '\n',
    );
    child.stdout.push(
      JSON.stringify({ type: 'content_block_stop' }) + '\n',
    );

    expect(events).toContainEqual({ type: 'text_delta', delta: 'Hi' });
    expect(events).toContainEqual({ type: 'tool_use', id: 't1', name: 'Read', input: {} });
  });

  it('codex: spawn + codex-json-event → 归一化事件', async () => {
    const child = new FakeChild();
    const bm = makeBinaryManager('/usr/local/bin/codex');
    const { session, spawnFn } = makeSession(child, bm);

    await session.start({
      def: codexAgentDef as RuntimeAgentDef,
      prompt: 'do it',
      onEvent,
    });

    const [cmd, args] = spawnFn.mock.calls[0];
    expect(cmd).toBe('/usr/local/bin/codex');
    expect(args).toContain('exec');

    child.stdout.push(JSON.stringify({ type: 'turn.started' }) + '\n');
    child.stdout.push(
      JSON.stringify({
        type: 'item.completed',
        item: { type: 'agent_message', text: 'done' },
      }) + '\n',
    );

    expect(events).toContainEqual({ type: 'status', label: 'running' });
    expect(events).toContainEqual({ type: 'text_delta', delta: 'done' });
  });

  it('pi: spawn + pi-rpc → stdin 收到命令，stdout 事件归一化', async () => {
    const child = new FakeChild();
    const bm = makeBinaryManager('/usr/local/bin/pi');
    const { session, spawnFn } = makeSession(child, bm);

    await session.start({
      def: piAgentDef as RuntimeAgentDef,
      prompt: 'pi prompt',
      cwd: '/tmp/p',
      onEvent,
    });

    const [cmd, args, opts] = spawnFn.mock.calls[0];
    expect(cmd).toBe('/usr/local/bin/pi');
    expect(args).toEqual(['--mode', 'rpc']);
    // pi-rpc needs piped stdin
    expect(opts.stdio[0]).toBe('pipe');

    // pi-rpc session writes prompt command to stdin
    expect(child.stdin.write).toHaveBeenCalled();
    const written = (child.stdin.write as any).mock.calls.map((c: any[]) => c[0]).join('');
    expect(written).toContain('pi prompt');

    // push pi events
    child.stdout.push(JSON.stringify({ type: 'agent_start' }) + '\n');
    child.stdout.push(
      JSON.stringify({
        type: 'message_update',
        event: { type: 'text_delta', delta: 'yo' },
      }) + '\n',
    );

    expect(events).toContainEqual({ type: 'status', label: 'working' });
    expect(events).toContainEqual({ type: 'text_delta', delta: 'yo' });
  });

  it('pi: parentSession 透传到 pi-rpc session', async () => {
    const child = new FakeChild();
    const bm = makeBinaryManager('/usr/local/bin/pi');
    const { session } = makeSession(child, bm);

    await session.start({
      def: piAgentDef as RuntimeAgentDef,
      prompt: 'resume me',
      parentSession: 'sess-123',
      onEvent,
    });

    const written = (child.stdin.write as any).mock.calls.map((c: any[]) => c[0]).join('');
    expect(written).toContain('sess-123');
  });

  it('cancel(): kill 子进程 (SIGTERM)', async () => {
    const child = new FakeChild();
    const bm = makeBinaryManager('/usr/local/bin/claude');
    const { session } = makeSession(child, bm);

    await session.start({
      def: claudeAgentDef as RuntimeAgentDef,
      prompt: 'hi',
      onEvent,
    });

    session.cancel();
    expect(child.kill).toHaveBeenCalledWith('SIGTERM');
  });

  it('未安装 (resolveBinary 返回 null) → onEvent error，不 spawn', async () => {
    const child = new FakeChild();
    const bm = makeBinaryManager(null);
    const { session, spawnFn } = makeSession(child, bm);

    await session.start({
      def: claudeAgentDef as RuntimeAgentDef,
      prompt: 'hi',
      onEvent,
    });

    expect(spawnFn).not.toHaveBeenCalled();
    expect(events.some((e) => e.type === 'error')).toBe(true);
  });

  it('ensureNodeInPath 在 spawn 前被调用', async () => {
    const child = new FakeChild();
    const bm = makeBinaryManager('/usr/local/bin/claude');
    const { session } = makeSession(child, bm);

    await session.start({
      def: claudeAgentDef as RuntimeAgentDef,
      prompt: 'hi',
      onEvent,
    });

    expect(bm.ensureNodeInPath).toHaveBeenCalled();
  });

  it('child error 事件 → onEvent error', async () => {
    const child = new FakeChild();
    const bm = makeBinaryManager('/usr/local/bin/claude');
    const { session } = makeSession(child, bm);

    await session.start({
      def: claudeAgentDef as RuntimeAgentDef,
      prompt: 'hi',
      onEvent,
    });

    child.emit('error', new Error('boom'));
    const errEv = events.find((e) => e.type === 'error') as { type: 'error'; message: string };
    expect(errEv).toBeDefined();
    expect(errEv.message).toContain('boom');
  });

  it('非零退出 + stderr → error 事件附带 stderr', async () => {
    const child = new FakeChild();
    const bm = makeBinaryManager('/usr/local/bin/codex');
    const { session } = makeSession(child, bm);

    await session.start({
      def: codexAgentDef as RuntimeAgentDef,
      prompt: 'hi',
      onEvent,
    });

    child.stderr.push('fatal: something broke');
    child.emit('close', 1);

    const errEv = events.find((e) => e.type === 'error') as
      | { type: 'error'; message: string; raw?: string }
      | undefined;
    expect(errEv).toBeDefined();
    expect((errEv?.raw ?? errEv?.message ?? '')).toContain('something broke');
  });

  it('env: 注入 def.env 与 input.env，过滤 npm_*', async () => {
    const child = new FakeChild();
    const bm = makeBinaryManager('/usr/local/bin/claude');
    const { session, spawnFn } = makeSession(child, bm);

    process.env.npm_config_foo = 'should-be-filtered';

    await session.start({
      def: { ...(claudeAgentDef as RuntimeAgentDef), env: { DEF_VAR: 'd' } },
      prompt: 'hi',
      env: { INPUT_VAR: 'i' },
      onEvent,
    });

    const opts = spawnFn.mock.calls[0][2];
    expect(opts.env.DEF_VAR).toBe('d');
    expect(opts.env.INPUT_VAR).toBe('i');
    expect(opts.env.npm_config_foo).toBeUndefined();

    delete process.env.npm_config_foo;
  });
});
