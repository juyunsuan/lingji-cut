import type { MenuItemConstructorOptions } from 'electron';
import type { MenuContext, MenuEvent } from '../src/lib/electron-api';

interface ApplicationMenuContext extends MenuContext {
  isDevelopment: boolean;
}

function createRecentProjectsSubmenu(
  recentProjects: MenuContext['recentProjects'],
  sendMenuEvent: (event: MenuEvent) => void,
): MenuItemConstructorOptions[] {
  if (recentProjects.length === 0) {
    return [
      {
        label: '暂无最近项目',
        enabled: false,
      },
    ];
  }

  return recentProjects.map((project) => ({
    label: project.name,
    toolTip: project.path,
    click: () =>
      sendMenuEvent({
        type: 'open-recent-project',
        projectDir: project.path,
      }),
  }));
}

export function createApplicationMenuTemplate(
  sendMenuEvent: (event: MenuEvent) => void,
  context: ApplicationMenuContext,
): MenuItemConstructorOptions[] {
  const template: MenuItemConstructorOptions[] = [
    {
      label: '项目',
      submenu: [
        {
          label: '新建项目',
          accelerator: 'CmdOrCtrl+N',
          click: () =>
            sendMenuEvent({
              type: 'command',
              action: 'new-project',
            }),
        },
        {
          label: '打开项目',
          accelerator: 'CmdOrCtrl+O',
          click: () =>
            sendMenuEvent({
              type: 'command',
              action: 'open-project',
            }),
        },
        {
          label: '最近项目',
          submenu: createRecentProjectsSubmenu(context.recentProjects, sendMenuEvent),
        },
        { type: 'separator' },
        {
          label: '全局设置',
          accelerator: 'CmdOrCtrl+,',
          click: () =>
            sendMenuEvent({
              type: 'command',
              action: 'open-settings',
            }),
        },
        { type: 'separator' },
        {
          label: '关闭项目',
          enabled: context.hasProject,
          click: () =>
            sendMenuEvent({
              type: 'command',
              action: 'close-project',
            }),
        },
        {
          label: '在 Finder 中显示',
          enabled: context.hasProject,
          click: () =>
            sendMenuEvent({
              type: 'command',
              action: 'show-project-in-folder',
            }),
        },
      ],
    },
    {
      label: '编辑',
      submenu: [
        { label: '撤销', role: 'undo' },
        { label: '重做', role: 'redo' },
        { type: 'separator' },
        { label: '剪切', role: 'cut' },
        { label: '复制', role: 'copy' },
        { label: '粘贴', role: 'paste' },
        { label: '全选', role: 'selectAll' },
      ],
    },
    {
      label: '媒体',
      submenu: [
        {
          label: '替换音频',
          click: () =>
            sendMenuEvent({
              type: 'command',
              action: 'replace-audio',
            }),
        },
        {
          label: '替换字幕',
          click: () =>
            sendMenuEvent({
              type: 'command',
              action: 'replace-srt',
            }),
        },
        {
          label: '添加素材',
          click: () =>
            sendMenuEvent({
              type: 'command',
              action: 'add-asset',
            }),
        },
        {
          label: '导出 MP4',
          accelerator: 'CmdOrCtrl+E',
          click: () =>
            sendMenuEvent({
              type: 'command',
              action: 'export',
            }),
        },
      ],
    },
  ];

  if (context.activePage !== 'editor') {
    const mediaMenuIndex = template.findIndex((item) => item.label === '媒体');
    if (mediaMenuIndex >= 0) {
      template.splice(mediaMenuIndex, 1);
    }
  }

  if (context.isDevelopment) {
    template.push({
      label: '开发',
      submenu: [
        { label: '切换开发者工具', role: 'toggleDevTools' },
        { label: '重新加载', role: 'reload' },
        { label: '强制重新加载', role: 'forceReload' },
      ],
    });
  }

  return template;
}
