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
  });

  describe('pi buildArgs', () => {
    it('includes --mode rpc flags', () => {
      const def = getAgentDef('pi')!;
      const args = def.buildArgs({ prompt: 'hello' });
      expect(args).toContain('--mode');
      expect(args).toContain('rpc');
    });
  });

  describe('registry id uniqueness', () => {
    it('all def ids are unique (no duplicates)', () => {
      const ids = listAgentDefs().map((d) => d.id);
      const unique = new Set(ids);
      expect(unique.size).toBe(ids.length);
    });
  });
});
