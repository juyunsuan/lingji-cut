import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { ensureBundledAgentSkills } from '../electron/agent-skills/bundled';

let seedRoot = '';
let targetRoot = '';

async function makeSeed(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'seed-'));
  const skill = path.join(dir, 'lingji-video-workflow');
  await fs.mkdir(path.join(skill, 'references'), { recursive: true });
  await fs.writeFile(path.join(skill, 'SKILL.md'), '---\nname: lingji-video-workflow\n---\nbody', 'utf-8');
  await fs.writeFile(path.join(skill, 'references', 'a.md'), 'ref-a', 'utf-8');
  return dir;
}

beforeEach(async () => {
  seedRoot = await makeSeed();
  targetRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'target-'));
});
afterEach(async () => {
  await fs.rm(seedRoot, { recursive: true, force: true });
  await fs.rm(targetRoot, { recursive: true, force: true });
});

describe('ensureBundledAgentSkills', () => {
  it('目标缺失时递归复制种子（含子目录）', async () => {
    await ensureBundledAgentSkills({ seedRoot, targetRoot });
    const skillMd = await fs.readFile(
      path.join(targetRoot, 'lingji-video-workflow', 'SKILL.md'), 'utf-8');
    expect(skillMd).toContain('name: lingji-video-workflow');
    const refA = await fs.readFile(
      path.join(targetRoot, 'lingji-video-workflow', 'references', 'a.md'), 'utf-8');
    expect(refA).toBe('ref-a');
  });

  it('目标已存在 SKILL.md 时不覆盖用户文件', async () => {
    const skillDir = path.join(targetRoot, 'lingji-video-workflow');
    await fs.mkdir(skillDir, { recursive: true });
    await fs.writeFile(path.join(skillDir, 'SKILL.md'), 'USER EDITED', 'utf-8');
    await ensureBundledAgentSkills({ seedRoot, targetRoot });
    const content = await fs.readFile(path.join(skillDir, 'SKILL.md'), 'utf-8');
    expect(content).toBe('USER EDITED');
  });

  it('种子缺失时安静返回 false（不抛错）', async () => {
    const ok = await ensureBundledAgentSkills({
      seedRoot: path.join(seedRoot, 'does-not-exist'),
      targetRoot,
    });
    expect(ok).toBe(false);
  });
});
