import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { ExportSettingsModal } from '../src/components/ExportSettingsModal';

describe('ExportSettingsModal', () => {
  it('renders resolution and speed presets for quick export tuning', () => {
    const html = renderToStaticMarkup(
      <ExportSettingsModal
        visible
        timelineWidth={1920}
        timelineHeight={1080}
        onClose={() => undefined}
        onConfirm={async () => undefined}
      />,
    );

    expect(html).toContain('导出设置');
    expect(html).toContain('720p');
    expect(html).toContain('平衡');
    expect(html).toContain('当前导出速度说明');
    expect(html).toContain('开始导出');
  });
});
