import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { Setup } from '../src/pages/Setup';

describe('Setup', () => {
  it('renders import guidance and start action for the first-run flow', () => {
    const html = renderToStaticMarkup(
      <Setup
        busy={false}
        errorMessage={null}
        recentProjects={[]}
        onComplete={async () => undefined}
        onOpenRecentProject={async () => undefined}
        onStartScriptWorkbench={() => undefined}
        onOpenSettings={() => undefined}
      />,
    );

    expect(html).toContain('LOCAL PODCAST VIDEO EDITOR');
    expect(html).toContain('选择你的创作方式');
    expect(html).toContain('拖入 MP3 口播音频');
    expect(html).toContain('拖入对应 SRT 字幕');
    expect(html).toContain('导入文件');
  });

  it('renders recent projects as quick-open entries on the welcome page', () => {
    const html = renderToStaticMarkup(
      <Setup
        busy={false}
        errorMessage={null}
        recentProjects={[
          {
            path: '/tmp/demo-project',
            name: 'demo-project',
            lastOpenedAt: new Date('2026-04-06T20:30:00+08:00').getTime(),
          },
        ]}
        onComplete={async () => undefined}
        onOpenRecentProject={async () => undefined}
        onStartScriptWorkbench={() => undefined}
        onOpenSettings={() => undefined}
      />,
    );

    expect(html).toContain('最近项目');
    expect(html).toContain('demo-project');
  });
});
