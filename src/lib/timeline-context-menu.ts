import type { AppIconName } from '../components/AppIcon';

export type TimelineContextMenuTarget = 'overlay' | 'track';
export type TimelineContextMenuActionKey = 'copy' | 'cut' | 'paste' | 'delete';

export interface TimelineContextMenuItem {
  key: TimelineContextMenuActionKey;
  label: string;
  icon: AppIconName;
  shortcut: string;
  disabled: boolean;
  destructive?: boolean;
  separatorBefore?: boolean;
}

interface TimelineContextMenuOptions {
  target: TimelineContextMenuTarget;
  canPaste: boolean;
}

export function getTimelineContextMenuItems(
  options: TimelineContextMenuOptions,
): TimelineContextMenuItem[] {
  const disableSourceActions = options.target === 'track';

  return [
    {
      key: 'copy',
      label: '复制',
      icon: 'copy',
      shortcut: '⌘C',
      disabled: disableSourceActions,
    },
    {
      key: 'cut',
      label: '剪切',
      icon: 'scissors',
      shortcut: '⌘X',
      disabled: disableSourceActions,
    },
    {
      key: 'paste',
      label: '粘贴',
      icon: 'clipboard',
      shortcut: '⌘V',
      disabled: !options.canPaste,
    },
    {
      key: 'delete',
      label: '删除',
      icon: 'trash-2',
      shortcut: '⌫',
      destructive: true,
      separatorBefore: true,
      disabled: disableSourceActions,
    },
  ];
}
