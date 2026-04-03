import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { Toolbar } from '../src/components/Toolbar';

describe('Toolbar', () => {
  it('renders a desktop titlebar shell for setup', () => {
    const html = renderToStaticMarkup(
      <Toolbar
        compact={false}
        page="setup"
        projectName=""
        saveStatus="idle"
        onCommand={() => undefined}
      />,
    );

    expect(html).toContain('VIDEO WEB MASTER');
    expect(html).toContain('播客视频编辑器');
    expect(html).toContain('导入 MP3 与 SRT');
  });

  it('renders editor guidance inside the custom titlebar', () => {
    const html = renderToStaticMarkup(
      <Toolbar
        compact
        page="editor"
        projectName=""
        saveStatus="idle"
        onCommand={() => undefined}
      />,
    );

    expect(html).toContain('拖入素材');
    expect(html).toContain('Remotion');
  });

  it('renders editor status and export action without custom menus', () => {
    const html = renderToStaticMarkup(
      <Toolbar
        compact={false}
        page="editor"
        projectName="demo-project"
        saveStatus="saved"
        onCommand={() => undefined}
      />,
    );

    expect(html).toContain('demo-project');
    expect(html).toContain('已保存');
    expect(html).toContain('编辑中');
    expect(html).toContain('导出 MP4');
    expect(html).not.toContain('>项目<');
    expect(html).not.toContain('>编辑<');
    expect(html).not.toContain('>媒体<');
  });
});
