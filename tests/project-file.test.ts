import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {
  loadProjectFile,
  saveProjectSection,
} from '../electron/project-file';

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'proj-test-'));
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe('loadProjectFile', () => {
  it('空目录返回默认 ProjectData', async () => {
    const data = await loadProjectFile(tmpDir);
    expect(data.version).toBe(1);
    expect(data.timeline).toBeNull();
  });

  it('已有 project.json 则读取', async () => {
    const existing = {
      version: 1,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      timeline: { podcast: { audioPath: '/test.mp3', srtPath: '', durationMs: 0 }, overlays: [], subtitleConfig: {}, globalBackground: '' },
      aiAnalysis: { analysisResult: null, coverCandidates: [] },
      script: { templateId: 't', annotations: [], reviewState: 'idle', lastReviewedDocVersion: 0 },
    };
    await fs.writeFile(path.join(tmpDir, 'project.json'), JSON.stringify(existing));
    const data = await loadProjectFile(tmpDir);
    expect(data.timeline?.podcast?.audioPath).toBe('/test.mp3');
  });

  it('从旧文件迁移：timeline.json + ai-analysis.json + script-state.json', async () => {
    const timeline = { podcast: { audioPath: '/old.mp3', srtPath: '/old.srt', durationMs: 5000 }, overlays: [], subtitleConfig: {}, globalBackground: '' };
    const aiState = { version: 1, analysisResult: null, coverCandidates: [] };
    const scriptState = { version: 2, templateId: 'news', annotations: [], reviewState: 'clean', lastReviewedDocVersion: 1, createdAt: '2026-01-01', updatedAt: '2026-01-01' };

    await fs.writeFile(path.join(tmpDir, 'timeline.json'), JSON.stringify(timeline));
    await fs.writeFile(path.join(tmpDir, 'ai-analysis.json'), JSON.stringify(aiState));
    await fs.writeFile(path.join(tmpDir, 'script-state.json'), JSON.stringify(scriptState));

    const data = await loadProjectFile(tmpDir);
    expect(data.timeline?.podcast?.audioPath).toBe('/old.mp3');
    expect(data.aiAnalysis.analysisResult).toBeNull();
    expect(data.script.templateId).toBe('news');

    // 旧文件应被删除
    const files = await fs.readdir(tmpDir);
    expect(files).toContain('project.json');
    expect(files).not.toContain('timeline.json');
    expect(files).not.toContain('ai-analysis.json');
    expect(files).not.toContain('script-state.json');
  });
});

describe('saveProjectSection', () => {
  it('写入 timeline 段并保留其他段', async () => {
    await loadProjectFile(tmpDir);
    const newTimeline = { podcast: { audioPath: '/new.mp3', srtPath: '', durationMs: 0 }, overlays: [], subtitleConfig: {}, globalBackground: '' };
    await saveProjectSection(tmpDir, 'timeline', newTimeline);
    const raw = JSON.parse(await fs.readFile(path.join(tmpDir, 'project.json'), 'utf-8'));
    expect(raw.timeline.podcast.audioPath).toBe('/new.mp3');
    expect(raw.aiAnalysis).toBeDefined();
    expect(raw.script).toBeDefined();
  });

  it('并发写入不损坏文件', async () => {
    await loadProjectFile(tmpDir);
    await Promise.all([
      saveProjectSection(tmpDir, 'timeline', { podcast: { audioPath: '/a.mp3', srtPath: '', durationMs: 0 }, overlays: [], subtitleConfig: {}, globalBackground: '' }),
      saveProjectSection(tmpDir, 'aiAnalysis', { analysisResult: null, coverCandidates: [{ id: '1', prompt: 'p', imageUrl: '/img.png', selected: true }] }),
      saveProjectSection(tmpDir, 'script', { templateId: 'custom', annotations: [], reviewState: 'idle', lastReviewedDocVersion: 0 }),
    ]);
    const raw = JSON.parse(await fs.readFile(path.join(tmpDir, 'project.json'), 'utf-8'));
    expect(raw.timeline.podcast.audioPath).toBe('/a.mp3');
    expect(raw.aiAnalysis.coverCandidates).toHaveLength(1);
    expect(raw.script.templateId).toBe('custom');
  });
});
