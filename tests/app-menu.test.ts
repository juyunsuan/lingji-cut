import { describe, expect, it, vi } from 'vitest';
import { createApplicationMenuTemplate } from '../electron/app-menu';

describe('createApplicationMenuTemplate', () => {
  function createTemplate(options: {
    activePage: 'welcome' | 'setup' | 'editor' | 'script-workbench' | 'settings';
    isDevelopment: boolean;
    hasProject: boolean;
    recentProjects: Array<{ path: string; name: string }>;
  }) {
    const createMenu = createApplicationMenuTemplate as unknown as (
      sendMenuAction: ReturnType<typeof vi.fn>,
      menuContext: typeof options,
    ) => ReturnType<typeof createApplicationMenuTemplate>;

    return createMenu(vi.fn(), options);
  }

  it('provides native clipboard actions and hides development menu in production', () => {
    const template = createTemplate({
      activePage: 'welcome',
      isDevelopment: false,
      hasProject: false,
      recentProjects: [],
    });
    const editMenu = template.find((item) => item.label === '编辑');
    const devMenu = template.find((item) => item.label === '开发');
    const mediaMenu = template.find((item) => item.label === '媒体');

    expect(editMenu).toBeDefined();
    expect(editMenu?.submenu).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ role: 'undo' }),
        expect.objectContaining({ role: 'redo' }),
        expect.objectContaining({ role: 'cut' }),
        expect.objectContaining({ role: 'copy' }),
        expect.objectContaining({ role: 'paste' }),
        expect.objectContaining({ role: 'selectAll' }),
      ]),
    );
    expect(devMenu).toBeUndefined();
    expect(mediaMenu).toBeUndefined();
  });

  it('shows media menu, global settings, and recent projects when context requires them', () => {
    const sendMenuAction = vi.fn();
    const createMenu = createApplicationMenuTemplate as unknown as (
      sendMenuAction: typeof sendMenuAction,
      menuContext: {
        activePage: 'welcome' | 'setup' | 'editor' | 'script-workbench' | 'settings';
        isDevelopment: boolean;
        hasProject: boolean;
        recentProjects: Array<{ path: string; name: string }>;
      },
    ) => ReturnType<typeof createApplicationMenuTemplate>;
    const template = createMenu(sendMenuAction, {
      activePage: 'editor',
      isDevelopment: true,
      hasProject: true,
      recentProjects: [{ path: '/tmp/demo-project', name: 'demo-project' }],
    });
    const projectMenu = template.find((item) => item.label === '项目');
    const mediaMenu = template.find((item) => item.label === '媒体');
    const devMenu = template.find((item) => item.label === '开发');
    const submenu = Array.isArray(projectMenu?.submenu) ? projectMenu.submenu : [];
    const settingsItem = submenu.find((item) => 'label' in item && item.label === '全局设置');
    const recentMenu = submenu.find((item) => 'label' in item && item.label === '最近项目');

    expect(mediaMenu).toBeDefined();
    expect(devMenu).toBeDefined();
    expect(settingsItem).toBeDefined();
    expect(recentMenu).toBeDefined();
    expect(Array.isArray(recentMenu?.submenu) ? recentMenu.submenu : []).toEqual(
      expect.arrayContaining([expect.objectContaining({ label: 'demo-project' })]),
    );
  });
});
