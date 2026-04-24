import type { WorkbenchStage } from './script-workbench-stage';
import type { TimelineData } from '../types';
import type { AIAnalysisResult, CoverCandidate } from '../types/ai';
import type { AutoWorkflowParams } from '../store/ai';

export interface ProjectScriptState {
  templateId: string;
  annotations: unknown[];
  reviewState: 'idle' | 'issues' | 'clean';
  lastReviewedDocVersion: number;
  manualStageOverride?: WorkbenchStage | null;
}

export interface ProjectAIAnalysis {
  analysisResult: AIAnalysisResult | null;
  coverCandidates: CoverCandidate[];
}

/**
 * AI 一键全量剪辑运行元数据。
 * 仅用于 Editor 顶部的"恢复横幅"：记住上次 autoMode 使用的 template/role/voice，
 * 以便用户关闭/重启应用后依然能从中断点继续。
 * 实际"走到哪一步"靠磁盘产物推断，不依赖此字段。
 */
export interface ProjectWorkflowMeta {
  lastAutoParams: AutoWorkflowParams | null;
  lastAutoRunAt: string | null;
  /**
   * 上次 TTS 成功时使用的口播文稿内容哈希。
   * 用于 Editor 顶部的"文稿已修改"提示：若当前 script.md 哈希与此值不一致，
   * 说明用户在写稿工作台改过文稿但还没重新生成口播音频与字幕。
   * null 代表当前项目的口播音频不是由本应用 TTS 生成（或尚未跑过），此时不显示提示。
   */
  lastPodcastScriptHash: string | null;
}

export interface ProjectData {
  version: 1;
  createdAt: string;
  updatedAt: string;
  timeline: TimelineData | null;
  aiAnalysis: ProjectAIAnalysis;
  script: ProjectScriptState;
  workflowMeta?: ProjectWorkflowMeta;
}

export type ProjectSection = 'timeline' | 'aiAnalysis' | 'script' | 'workflowMeta';

export const DEFAULT_WORKFLOW_META: ProjectWorkflowMeta = {
  lastAutoParams: null,
  lastAutoRunAt: null,
  lastPodcastScriptHash: null,
};

/** 单调递增时间戳，保证在同一毫秒内多次调用也不重复 */
let _lastTimestamp = '';
function nowIso(): string {
  let ts = new Date().toISOString();
  if (ts <= _lastTimestamp) {
    // 在同毫秒内追加微秒偏移，保证不重复
    const base = _lastTimestamp.replace(/\.(\d+)Z$/, (_, ms) => `.${String(Number(ms) + 1).padStart(ms.length, '0')}Z`);
    ts = base;
  }
  _lastTimestamp = ts;
  return ts;
}

export function createDefaultProjectData(): ProjectData {
  const now = nowIso();
  return {
    version: 1,
    createdAt: now,
    updatedAt: now,
    timeline: null,
    aiAnalysis: {
      analysisResult: null,
      coverCandidates: [],
    },
    script: {
      templateId: 'news-broadcast',
      annotations: [],
      reviewState: 'idle',
      lastReviewedDocVersion: 0,
    },
    workflowMeta: { ...DEFAULT_WORKFLOW_META },
  };
}

export function extractTimelineSection(data: ProjectData): TimelineData | null {
  return data.timeline;
}

export function extractAIAnalysisSection(data: ProjectData): ProjectAIAnalysis {
  return data.aiAnalysis;
}

export function extractScriptSection(data: ProjectData): ProjectScriptState {
  return data.script;
}

export function extractWorkflowMetaSection(data: ProjectData): ProjectWorkflowMeta {
  return data.workflowMeta ?? { ...DEFAULT_WORKFLOW_META };
}

export function mergeProjectSection<S extends ProjectSection>(
  data: ProjectData,
  section: S,
  value: ProjectData[S],
): ProjectData {
  return {
    ...data,
    [section]: value,
    updatedAt: nowIso(),
  };
}
