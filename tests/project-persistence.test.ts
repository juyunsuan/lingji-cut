import { describe, it, expect } from 'vitest';
import {
  type ProjectData,
  createDefaultProjectData,
  extractTimelineSection,
  extractAIAnalysisSection,
  extractScriptSection,
  mergeProjectSection,
} from '../src/lib/project-persistence';

describe('project-persistence', () => {
  it('createDefaultProjectData 返回 version 1 的默认结构', () => {
    const data = createDefaultProjectData();
    expect(data.version).toBe(1);
    expect(data.timeline).toBeNull();
    expect(data.aiAnalysis).toEqual({
      analysisResult: null,
      coverCandidates: [],
    });
    expect(data.script).toEqual({
      templateId: 'news-broadcast',
      annotations: [],
      reviewState: 'idle',
      lastReviewedDocVersion: 0,
    });
    expect(data.createdAt).toBeDefined();
    expect(data.updatedAt).toBeDefined();
  });

  it('extractTimelineSection 提取 timeline 段', () => {
    const data = createDefaultProjectData();
    data.timeline = { podcast: { audioPath: '/a.mp3', srtPath: '/a.srt', durationMs: 1000 } } as any;
    expect(extractTimelineSection(data)).toEqual(data.timeline);
  });

  it('mergeProjectSection 合并 timeline 段并更新 updatedAt', () => {
    const data = createDefaultProjectData();
    const before = data.updatedAt;
    const newTimeline = { podcast: { audioPath: '/b.mp3' } } as any;
    const merged = mergeProjectSection(data, 'timeline', newTimeline);
    expect(merged.timeline).toEqual(newTimeline);
    expect(merged.updatedAt).not.toBe(before);
    // 不改变其他段
    expect(merged.aiAnalysis).toEqual(data.aiAnalysis);
    expect(merged.script).toEqual(data.script);
  });

  it('mergeProjectSection 合并 aiAnalysis 段', () => {
    const data = createDefaultProjectData();
    const aiData = {
      analysisResult: { cards: [], coverPrompts: [], summary: 'test', keywords: [] },
      coverCandidates: [],
    };
    const merged = mergeProjectSection(data, 'aiAnalysis', aiData);
    expect(merged.aiAnalysis).toEqual(aiData);
  });

  it('mergeProjectSection 合并 script 段', () => {
    const data = createDefaultProjectData();
    const scriptData = { templateId: 'custom', annotations: [], reviewState: 'issues' as const, lastReviewedDocVersion: 3 };
    const merged = mergeProjectSection(data, 'script', scriptData);
    expect(merged.script).toEqual(scriptData);
  });
});
