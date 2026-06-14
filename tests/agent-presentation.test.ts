import { describe, expect, it } from 'vitest';
import { getAgentPresentation, listAgentPresentations } from '../src/lib/agent-presentation';

describe('agent-presentation', () => {
  describe('listAgentPresentations', () => {
    it('claude presentation has non-empty models list', () => {
      const all = listAgentPresentations();
      const claude = all.find((p) => p.id === 'claude')!;
      expect(claude).toBeDefined();
      expect(claude.models).toBeDefined();
      expect(claude.models!.length).toBeGreaterThan(0);
    });

    it('codex presentation has non-empty models list', () => {
      const all = listAgentPresentations();
      const codex = all.find((p) => p.id === 'codex')!;
      expect(codex).toBeDefined();
      expect(codex.models).toBeDefined();
      expect(codex.models!.length).toBeGreaterThan(0);
    });

    it('pi presentation has non-empty models list', () => {
      const all = listAgentPresentations();
      const pi = all.find((p) => p.id === 'pi')!;
      expect(pi).toBeDefined();
      expect(pi.models).toBeDefined();
      expect(pi.models!.length).toBeGreaterThan(0);
    });
  });

  describe('getAgentPresentation', () => {
    it('claude presentation exposes models from runtime def', () => {
      const p = getAgentPresentation('claude');
      expect(p.models).toBeDefined();
      expect(p.models!.length).toBeGreaterThan(0);
      for (const m of p.models!) {
        expect(typeof m.id).toBe('string');
        expect(m.id.length).toBeGreaterThan(0);
        expect(typeof m.label).toBe('string');
        expect(m.label.length).toBeGreaterThan(0);
      }
    });

    it('claude presentation exposes defaultModel', () => {
      const p = getAgentPresentation('claude');
      expect(p.defaultModel).toBeDefined();
      const ids = p.models!.map((m) => m.id);
      expect(ids).toContain(p.defaultModel);
    });

    it('codex presentation exposes models', () => {
      const p = getAgentPresentation('codex');
      expect(p.models).toBeDefined();
      expect(p.models!.length).toBeGreaterThan(0);
    });

    it('pi presentation exposes models', () => {
      const p = getAgentPresentation('pi');
      expect(p.models).toBeDefined();
      expect(p.models!.length).toBeGreaterThan(0);
    });
  });
});
