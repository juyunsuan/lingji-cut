// tests/cover-editor-modal.test.tsx
//
// 说明：项目 vitest 环境为 node + 静态 SSR（renderToStaticMarkup），
// 未引入 jsdom / @testing-library/react。本测试因此使用 SSR 做结构
// 断言（与 tests/script-resource-view.test.tsx 保持同一惯例）。
// 由于 Fabric 画布初始化发生在 useEffect 中，SSR 不会触发，因此无需
// 在 vi.mock 中伪造 fabric 的完整运行时；只要保证 import 时不报错即可。
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { CoverEditorModal } from '../src/components/CoverEditorModal';

vi.mock('fabric', () => ({
  Canvas: vi.fn(),
  FabricImage: {
    fromURL: () => Promise.resolve({}),
  },
  Textbox: vi.fn(),
  Rect: vi.fn(),
  filters: {
    Brightness: vi.fn(),
    Contrast: vi.fn(),
    Saturation: vi.fn(),
  },
}));

// darwin-ui Button 使用 framer-motion 的 m.button，需 window.matchMedia
function stubWindow() {
  (globalThis as unknown as { window: unknown }).window = {
    matchMedia: () => ({
      matches: false,
      media: '',
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }),
  };
}

describe('CoverEditorModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    stubWindow();
  });

  it('open=false 时不渲染任何内容', () => {
    const html = renderToStaticMarkup(
      <CoverEditorModal
        open={false}
        candidateId="a"
        imageUrl="/x.png"
        prompt="x"
        timelineSize={{ width: 1920, height: 1080 }}
        onClose={() => {}}
        onSaveRequested={() => {}}
      />,
    );
    expect(html).toBe('');
  });

  it('open=true 时渲染标题、比例选项与时间线尺寸', () => {
    const html = renderToStaticMarkup(
      <CoverEditorModal
        open
        candidateId="a"
        imageUrl="/x.png"
        prompt="测试封面"
        timelineSize={{ width: 1920, height: 1080 }}
        onClose={() => {}}
        onSaveRequested={() => {}}
      />,
    );
    expect(html).toContain('编辑封面');
    expect(html).toContain('测试封面');
    // 时间线比例选项包含实际尺寸
    expect(html).toContain('时间线 1920×1080');
    // 其他常见比例预设
    expect(html).toContain('16:9 横版');
    expect(html).toContain('9:16 竖版');
  });

  it('渲染保存分裂按钮与取消按钮', () => {
    const html = renderToStaticMarkup(
      <CoverEditorModal
        open
        candidateId="a"
        imageUrl="/x.png"
        prompt="x"
        timelineSize={{ width: 1920, height: 1080 }}
        onClose={() => {}}
        onSaveRequested={() => {}}
      />,
    );
    // 默认 append 模式按钮文案
    expect(html).toContain('另存为新候选');
    // 取消按钮
    expect(html).toContain('取消');
    // 保存模式切换按钮可访问性标签
    expect(html).toContain('切换保存模式');
    // Modal dialog 语义
    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-modal="true"');
  });
});
