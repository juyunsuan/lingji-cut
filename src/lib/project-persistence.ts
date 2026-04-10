import type { TimelineData } from '../types';
import type { AIAnalysisResult, CoverCandidate } from '../types/ai';

export interface ProjectScriptState {
  templateId: string;
  annotations: unknown[];
  reviewState: 'idle' | 'issues' | 'clean';
  lastReviewedDocVersion: number;
}

export interface ProjectAIAnalysis {
  analysisResult: AIAnalysisResult | null;
  coverCandidates: CoverCandidate[];
}

export interface ProjectData {
  version: 1;
  createdAt: string;
  updatedAt: string;
  timeline: TimelineData | null;
  aiAnalysis: ProjectAIAnalysis;
  script: ProjectScriptState;
}

export type ProjectSection = 'timeline' | 'aiAnalysis' | 'script';

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
    aiAnalysis: { analysisResult: null, coverCandidates: [] },
    script: {
      templateId: 'news-broadcast',
      annotations: [],
      reviewState: 'idle',
      lastReviewedDocVersion: 0,
    },
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
