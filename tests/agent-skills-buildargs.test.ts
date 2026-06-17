import { describe, it, expect } from 'vitest';
import { piAgentDef } from '../electron/agent-runtime/agent-defs/pi';
import { codexAgentDef } from '../electron/agent-runtime/agent-defs/codex';
import type { ResolvedAgentSkill } from '../electron/acp/types';

const skill = (enabled: boolean): ResolvedAgentSkill => ({
  id: 'lingji-video-workflow',
  displayName: 'x', description: 'y', source: 'builtin',
  rootPath: '/home/u/.lingji/agent-skills/lingji-video-workflow',
  skillFilePath: '/home/u/.lingji/agent-skills/lingji-video-workflow/SKILL.md',
  defaultEnabled: true, loadModesByAgent: {}, enabled, status: 'available',
});

describe('pi buildArgs --skill', () => {
  it('enabled skill 追加 --skill <rootPath>', () => {
    const args = piAgentDef.buildArgs({ prompt: 'hi', skills: [skill(true)] });
    const i = args.indexOf('--skill');
    expect(i).toBeGreaterThanOrEqual(0);
    expect(args[i + 1]).toBe('/home/u/.lingji/agent-skills/lingji-video-workflow');
  });
  it('disabled skill 不追加', () => {
    const args = piAgentDef.buildArgs({ prompt: 'hi', skills: [skill(false)] });
    expect(args).not.toContain('--skill');
  });
});

describe('codex buildArgs --add-dir', () => {
  it('enabled skill 追加 --add-dir <rootPath>', () => {
    const args = codexAgentDef.buildArgs({ prompt: 'hi', skills: [skill(true)] });
    const i = args.indexOf('--add-dir');
    expect(i).toBeGreaterThanOrEqual(0);
    expect(args[i + 1]).toBe('/home/u/.lingji/agent-skills/lingji-video-workflow');
  });
  it('prompt 仍是末尾位置参数', () => {
    const args = codexAgentDef.buildArgs({ prompt: 'HELLO', skills: [skill(true)] });
    expect(args[args.length - 1]).toBe('HELLO');
  });
});
