import { describe, expect, it } from 'vitest';
import {
  classifyRatio,
  groupCoverCandidatesByRatio,
} from '../src/components/publish/useCoverStudio';

describe('classifyRatio', () => {
  it('归类标准 16:9 / 4:3 / 3:4', () => {
    expect(classifyRatio(1920, 1080)).toBe('16:9');
    expect(classifyRatio(1280, 720)).toBe('16:9');
    expect(classifyRatio(1024, 768)).toBe('4:3');
    expect(classifyRatio(768, 1024)).toBe('3:4');
    expect(classifyRatio(900, 1200)).toBe('3:4');
  });

  it('容差内的近似比例仍归类', () => {
    // 1600x896 ≈ 1.786，接近 16:9
    expect(classifyRatio(1600, 896)).toBe('16:9');
  });

  it('非目标比例（1:1 / 9:16）返回 null', () => {
    expect(classifyRatio(1000, 1000)).toBeNull();
    expect(classifyRatio(1080, 1920)).toBeNull();
  });

  it('非法尺寸返回 null', () => {
    expect(classifyRatio(0, 720)).toBeNull();
    expect(classifyRatio(1920, 0)).toBeNull();
  });
});

describe('groupCoverCandidatesByRatio', () => {
  it('旧候选缺少比例时使用同路径磁盘图片的真实比例', () => {
    const groups = groupCoverCandidatesByRatio(
      [
        {
          id: 'cover-scan:covers/cover-3x4.png',
          prompt: '竖版封面',
          imageUrl: '/project/covers/cover-3x4.png',
          selected: true,
        },
        {
          id: 'cover-scan:covers/cover-4x3.png',
          prompt: '横版封面',
          imageUrl: '/project/covers/cover-4x3.png',
          selected: false,
        },
      ],
      [
        { path: '/project/covers/cover-3x4.png', ratio: '3:4', mtimeMs: 2 },
        { path: '/project/covers/cover-4x3.png', ratio: '4:3', mtimeMs: 1 },
      ],
      '默认提示词',
    );

    expect(groups['3:4'].map((candidate) => candidate.id)).toEqual([
      'cover-scan:covers/cover-3x4.png',
    ]);
    expect(groups['4:3'].map((candidate) => candidate.id)).toEqual([
      'cover-scan:covers/cover-4x3.png',
    ]);
    expect(groups['16:9']).toEqual([]);
  });
});
