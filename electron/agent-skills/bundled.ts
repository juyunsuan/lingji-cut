import fs from 'node:fs/promises';
import path from 'node:path';
import { BUILTIN_SKILL_ID } from './constants';

export interface EnsureBundledOptions {
  /** 内置种子根目录（含 <skillId>/ 子目录）。 */
  seedRoot: string;
  /** 用户配置目录 ~/.lingji/agent-skills。 */
  targetRoot: string;
}

/** 递归复制（用 readdir+readFile+writeFile，兼容 asar 只读源）。 */
async function copyDir(src: string, dest: string): Promise<void> {
  await fs.mkdir(dest, { recursive: true });
  const entries = await fs.readdir(src, { withFileTypes: true });
  for (const entry of entries) {
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      await copyDir(s, d);
    } else if (entry.isFile()) {
      const buf = await fs.readFile(s);
      await fs.writeFile(d, buf);
    }
  }
}

async function exists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

/**
 * 确保内置 skill 已复制到用户配置目录。
 * - 目标已存在 <skillId>/SKILL.md → 不覆盖（首期保护用户本地调整）。
 * - 种子缺失 → 返回 false，不抛错（由上层记录日志 / 设置页展示）。
 * - 成功复制或目标已存在 → 返回 true。
 */
export async function ensureBundledAgentSkills(
  opts: EnsureBundledOptions,
): Promise<boolean> {
  const seedSkill = path.join(opts.seedRoot, BUILTIN_SKILL_ID);
  const seedMd = path.join(seedSkill, 'SKILL.md');
  if (!(await exists(seedMd))) {
    return false;
  }
  const targetSkill = path.join(opts.targetRoot, BUILTIN_SKILL_ID);
  const targetMd = path.join(targetSkill, 'SKILL.md');
  if (await exists(targetMd)) {
    return true; // 已存在，不覆盖
  }
  await copyDir(seedSkill, targetSkill);
  return true;
}
