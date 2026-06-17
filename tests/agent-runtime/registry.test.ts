import { describe, expect, it } from 'vitest';
import { getAgentDef, listAgentDefs } from '../../electron/agent-runtime/registry';

describe('agent-runtime registry', () => {
  describe('listAgentDefs', () => {
    it('contains exactly three defs', () => {
      expect(listAgentDefs()).toHaveLength(3);
    });

    it('contains claude, codex, and pi', () => {
      const ids = listAgentDefs().map((d) => d.id);
      expect(ids).toContain('claude');
      expect(ids).toContain('codex');
      expect(ids).toContain('pi');
    });
  });

  describe('getAgentDef', () => {
    it('returns claude def with correct shape', () => {
      const def = getAgentDef('claude');
      expect(def).not.toBeNull();
      expect(def!.id).toBe('claude');
      expect(def!.name).toBe('Claude Code');
      expect(def!.bin).toBe('claude');
      expect(def!.streamFormat).toBe('claude-stream-json');
    });

    it('returns codex def with correct shape', () => {
      const def = getAgentDef('codex');
      expect(def).not.toBeNull();
      expect(def!.id).toBe('codex');
      expect(def!.name).toBe('Codex');
      expect(def!.bin).toBe('codex');
      expect(def!.streamFormat).toBe('codex-json-event');
    });

    it('returns pi def with correct shape', () => {
      const def = getAgentDef('pi');
      expect(def).not.toBeNull();
      expect(def!.id).toBe('pi');
      expect(def!.name).toBe('Pi');
      expect(def!.bin).toBe('pi');
      expect(def!.streamFormat).toBe('pi-rpc');
    });

    it('returns null for unknown id', () => {
      expect(getAgentDef('unknown')).toBeNull();
      expect(getAgentDef('')).toBeNull();
    });
  });

  describe('claude buildArgs', () => {
    it('includes stream-json output format flag', () => {
      const def = getAgentDef('claude')!;
      const args = def.buildArgs({ prompt: 'hello' });
      expect(args).toContain('stream-json');
      expect(args).toContain('--output-format');
    });

    it('includes --model flag when model provided', () => {
      const def = getAgentDef('claude')!;
      const args = def.buildArgs({ prompt: 'hello', model: 'claude-opus-4-5' });
      expect(args).toContain('--model');
      expect(args).toContain('claude-opus-4-5');
    });

    it('omits --model flag when no model provided', () => {
      const def = getAgentDef('claude')!;
      const args = def.buildArgs({ prompt: 'hello' });
      expect(args).not.toContain('--model');
    });

    it('includes --add-dir flag when cwd provided', () => {
      const def = getAgentDef('claude')!;
      const args = def.buildArgs({ prompt: 'hello', cwd: '/some/dir' });
      expect(args).toContain('--add-dir');
      expect(args).toContain('/some/dir');
    });

    it('includes --print and --verbose flags', () => {
      const def = getAgentDef('claude')!;
      const args = def.buildArgs({ prompt: 'hello' });
      expect(args).toContain('--print');
      expect(args).toContain('--verbose');
    });

    it('includes --resume <sessionId> when resumeSessionId provided', () => {
      const def = getAgentDef('claude')!;
      const args = def.buildArgs({ prompt: 'hello', resumeSessionId: 'sess-abc' });
      expect(args).toContain('--resume');
      expect(args).toContain('sess-abc');
      // --resume must be immediately followed by the sessionId
      const idx = args.indexOf('--resume');
      expect(args[idx + 1]).toBe('sess-abc');
    });

    it('omits --resume when resumeSessionId absent', () => {
      const def = getAgentDef('claude')!;
      const args = def.buildArgs({ prompt: 'hello' });
      expect(args).not.toContain('--resume');
    });
  });

  describe('codex buildArgs', () => {
    it('includes exec and --json flags', () => {
      const def = getAgentDef('codex')!;
      const args = def.buildArgs({ prompt: 'hello' });
      expect(args).toContain('exec');
      expect(args).toContain('--json');
    });

    it('includes --model flag when model provided', () => {
      const def = getAgentDef('codex')!;
      const args = def.buildArgs({ prompt: 'hello', model: 'gpt-4o' });
      expect(args).toContain('--model');
      expect(args).toContain('gpt-4o');
    });

    it('passes the prompt as the trailing positional argument', () => {
      const def = getAgentDef('codex')!;
      const args = def.buildArgs({ prompt: 'do the thing' });
      expect(args).toContain('do the thing');
      // prompt must be the last positional arg so `codex exec --json <prompt>` works
      expect(args[args.length - 1]).toBe('do the thing');
    });

    it('keeps prompt last even when model is provided', () => {
      const def = getAgentDef('codex')!;
      const args = def.buildArgs({ prompt: 'analyze repo', model: 'gpt-4o' });
      expect(args[args.length - 1]).toBe('analyze repo');
    });
  });

  describe('pi buildArgs', () => {
    it('includes --mode rpc flags', () => {
      const def = getAgentDef('pi')!;
      const args = def.buildArgs({ prompt: 'hello' });
      expect(args).toContain('--mode');
      expect(args).toContain('rpc');
    });

    it('includes --session <sessionId> when resumeSessionId provided', () => {
      const def = getAgentDef('pi')!;
      const args = def.buildArgs({ prompt: 'hello', resumeSessionId: 'pi-session-abc' });
      expect(args).toContain('--session');
      const idx = args.indexOf('--session');
      expect(args[idx + 1]).toBe('pi-session-abc');
    });

    it('reasoning 非 default → 透传 --thinking', () => {
      const def = getAgentDef('pi')!;
      const args = def.buildArgs({ prompt: 'hi', reasoning: 'high' });
      expect(args).toContain('--thinking');
      expect(args[args.indexOf('--thinking') + 1]).toBe('high');
    });

    it("reasoning='default' → 不透传 --thinking", () => {
      const def = getAgentDef('pi')!;
      const args = def.buildArgs({ prompt: 'hi', reasoning: 'default' });
      expect(args).not.toContain('--thinking');
    });
  });

  describe('codex/pi reasoningOptions', () => {
    it('pi 暴露非空 reasoningOptions 且默认 default', () => {
      const def = getAgentDef('pi')!;
      expect(def.reasoningOptions && def.reasoningOptions.length).toBeGreaterThan(0);
      expect(def.defaultReasoning).toBe('default');
    });

    it('codex reasoning 非 default → -c model_reasoning_effort，且 prompt 仍在末尾', () => {
      const def = getAgentDef('codex')!;
      const args = def.buildArgs({ prompt: 'analyze', model: 'gpt-5', reasoning: 'high' });
      expect(args).toContain('-c');
      expect(args.some((a) => a.includes('model_reasoning_effort'))).toBe(true);
      expect(args[args.length - 1]).toBe('analyze');
    });
  });

  describe('registry id uniqueness', () => {
    it('all def ids are unique (no duplicates)', () => {
      const ids = listAgentDefs().map((d) => d.id);
      const unique = new Set(ids);
      expect(unique.size).toBe(ids.length);
    });
  });

  describe('models list', () => {
    it('claude def has non-empty models list', () => {
      const def = getAgentDef('claude')!;
      expect(def.models).toBeDefined();
      expect(def.models!.length).toBeGreaterThan(0);
    });

    it('claude models have id and label strings', () => {
      const def = getAgentDef('claude')!;
      for (const m of def.models!) {
        expect(typeof m.id).toBe('string');
        expect(m.id.length).toBeGreaterThan(0);
        expect(typeof m.label).toBe('string');
        expect(m.label.length).toBeGreaterThan(0);
      }
    });

    it('claude defaultModel is present in models list', () => {
      const def = getAgentDef('claude')!;
      expect(def.defaultModel).toBeDefined();
      const ids = def.models!.map((m) => m.id);
      expect(ids).toContain(def.defaultModel);
    });

    it('codex def has non-empty models list', () => {
      const def = getAgentDef('codex')!;
      expect(def.models).toBeDefined();
      expect(def.models!.length).toBeGreaterThan(0);
    });

    it('codex models have id and label strings', () => {
      const def = getAgentDef('codex')!;
      for (const m of def.models!) {
        expect(typeof m.id).toBe('string');
        expect(m.id.length).toBeGreaterThan(0);
        expect(typeof m.label).toBe('string');
        expect(m.label.length).toBeGreaterThan(0);
      }
    });

    it('pi def has non-empty models list', () => {
      const def = getAgentDef('pi')!;
      expect(def.models).toBeDefined();
      expect(def.models!.length).toBeGreaterThan(0);
    });

    it('pi models have id and label strings', () => {
      const def = getAgentDef('pi')!;
      for (const m of def.models!) {
        expect(typeof m.id).toBe('string');
        expect(m.id.length).toBeGreaterThan(0);
        expect(typeof m.label).toBe('string');
        expect(m.label.length).toBeGreaterThan(0);
      }
    });
  });
});
