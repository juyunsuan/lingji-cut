import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import {
  DEFAULT_WORKFLOW_META,
  createDefaultProjectData,
  mergeProjectSection,
  type ProjectData,
  type ProjectSection,
} from '../src/lib/project-persistence';
import { parsePersistedScriptState } from '../src/lib/script-persistence';
import type { TimelineData } from '../src/types';

const PROJECT_FILE = 'project.json';

// per-projectDir 写锁：Promise 链序列化
const writeLocks = new Map<string, Promise<void>>();

function withWriteLock(projectDir: string, fn: () => Promise<void>): Promise<void> {
  const prev = writeLocks.get(projectDir) ?? Promise.resolve();
  const next = prev.then(fn, fn);
  writeLocks.set(projectDir, next);
  void next.then(() => {
    if (writeLocks.get(projectDir) === next) {
      writeLocks.delete(projectDir);
    }
  });
  return next;
}

async function readProjectJson(projectDir: string): Promise<ProjectData | null> {
  const filePath = path.join(projectDir, PROJECT_FILE);
  try {
    const raw = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(raw) as ProjectData;
  } catch {
    return null;
  }
}

async function writeProjectJson(projectDir: string, data: ProjectData): Promise<void> {
  await fs.mkdir(projectDir, { recursive: true });
  await fs.writeFile(path.join(projectDir, PROJECT_FILE), JSON.stringify(data, null, 2), 'utf-8');
}

async function tryReadLegacyFile<T>(filePath: string): Promise<T | null> {
  try {
    return JSON.parse(await fs.readFile(filePath, 'utf-8')) as T;
  } catch {
    return null;
  }
}

async function removeLegacyFile(filePath: string): Promise<void> {
  try {
    await fs.unlink(filePath);
  } catch {
    // 忽略删除失败（文件不存在等情况）
  }
}

async function migrateFromLegacyFiles(projectDir: string): Promise<ProjectData> {
  const data = createDefaultProjectData();

  // 迁移 timeline.json
  const legacyTimeline = await tryReadLegacyFile<TimelineData>(
    path.join(projectDir, 'timeline.json'),
  );
  if (legacyTimeline) {
    data.timeline = legacyTimeline;
  }

  // 迁移 script-state.json
  const legacyScript = await tryReadLegacyFile<unknown>(
    path.join(projectDir, 'script-state.json'),
  );
  if (legacyScript) {
    const parsed = parsePersistedScriptState(legacyScript);
    if (parsed) {
      // ReviewState 在 store/script.ts 可能含 'pending'/'stale'，
      // ProjectScriptState 只接受 'idle' | 'issues' | 'clean'，做安全降级
      const safeReviewState = (
        ['idle', 'issues', 'clean'] as const
      ).includes(parsed.reviewState as 'idle' | 'issues' | 'clean')
        ? (parsed.reviewState as 'idle' | 'issues' | 'clean')
        : 'idle';
      data.script = {
        templateId: parsed.templateId,
        annotations: parsed.annotations,
        reviewState: safeReviewState,
        lastReviewedDocVersion: parsed.lastReviewedDocVersion,
        manualStageOverride: parsed.manualStageOverride ?? null,
      };
    }
  }

  // 写入 project.json，再删除旧文件
  await writeProjectJson(projectDir, data);
  await Promise.all([
    removeLegacyFile(path.join(projectDir, 'timeline.json')),
    removeLegacyFile(path.join(projectDir, 'ai-analysis.json')),
    removeLegacyFile(path.join(projectDir, 'script-state.json')),
  ]);

  return data;
}

async function hydrateExistingProjectData(projectDir: string, data: ProjectData): Promise<ProjectData> {
  const currentAI = data.aiAnalysis ?? {
    analysisResult: null,
    coverCandidates: [],
  };
  const hasWorkflowMeta = data.workflowMeta !== undefined;
  // 视觉编排下线后 aiAnalysis 只保留 analysisResult + coverCandidates。
  // 若旧工程含 motionCards / storyboardPlan，这里一次性剥离并回写。
  const legacyExtras =
    'motionCards' in currentAI ||
    'storyboardPlan' in currentAI ||
    currentAI.analysisResult === undefined ||
    currentAI.coverCandidates === undefined;
  if (!legacyExtras && hasWorkflowMeta) {
    return data;
  }
  const nextData: ProjectData = {
    ...data,
    aiAnalysis: {
      analysisResult: currentAI.analysisResult ?? null,
      coverCandidates: currentAI.coverCandidates ?? [],
    },
    workflowMeta: hasWorkflowMeta ? data.workflowMeta : { ...DEFAULT_WORKFLOW_META },
  };

  await writeProjectJson(projectDir, nextData);
  return nextData;
}

/**
 * 加载项目文件：
 * 1. 若 project.json 存在，直接读取
 * 2. 若有旧文件（timeline.json / ai-analysis.json / script-state.json），迁移后返回
 * 3. 否则创建默认 ProjectData 并写入
 */
export async function loadProjectFile(projectDir: string): Promise<ProjectData> {
  const existing = await readProjectJson(projectDir);
  if (existing) return hydrateExistingProjectData(projectDir, existing);

  const hasLegacy =
    existsSync(path.join(projectDir, 'timeline.json')) ||
    existsSync(path.join(projectDir, 'ai-analysis.json')) ||
    existsSync(path.join(projectDir, 'script-state.json'));

  if (hasLegacy) return migrateFromLegacyFiles(projectDir);

  const data = createDefaultProjectData();
  await writeProjectJson(projectDir, data);
  return data;
}

/**
 * 保存项目某一段数据，通过写锁保证并发安全。
 * Web Card 路径已下线，所有卡片走 Motion Card（JSX → Babel 编译 → 运行时沙箱），
 * 源码直接内嵌在 project.json，不再需要把 srcDoc 写到磁盘。
 */
export async function saveProjectSection(
  projectDir: string,
  section: ProjectSection,
  value: unknown,
): Promise<void> {
  return withWriteLock(projectDir, async () => {
    const current = (await readProjectJson(projectDir)) ?? createDefaultProjectData();
    const merged = mergeProjectSection(
      current,
      section,
      value as ProjectData[typeof section],
    );
    await writeProjectJson(projectDir, merged);
  });
}
