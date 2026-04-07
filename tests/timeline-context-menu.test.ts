import { describe, expect, it } from 'vitest';
import { getTimelineContextMenuItems } from '../src/lib/timeline-context-menu';

describe('getTimelineContextMenuItems', () => {
  it('returns the overlay menu in design order and enables source actions', () => {
    expect(
      getTimelineContextMenuItems({
        target: 'overlay',
        canPaste: true,
      }),
    ).toEqual([
      {
        key: 'copy',
        label: '复制',
        icon: 'copy',
        shortcut: '⌘C',
        disabled: false,
      },
      {
        key: 'cut',
        label: '剪切',
        icon: 'scissors',
        shortcut: '⌘X',
        disabled: false,
      },
      {
        key: 'paste',
        label: '粘贴',
        icon: 'clipboard',
        shortcut: '⌘V',
        disabled: false,
      },
      {
        key: 'delete',
        label: '删除',
        icon: 'trash-2',
        shortcut: '⌫',
        destructive: true,
        separatorBefore: true,
        disabled: false,
      },
    ]);
  });

  it('disables source-only actions on empty track lanes when there is nothing selected', () => {
    expect(
      getTimelineContextMenuItems({
        target: 'track',
        canPaste: false,
      }),
    ).toEqual([
      {
        key: 'copy',
        label: '复制',
        icon: 'copy',
        shortcut: '⌘C',
        disabled: true,
      },
      {
        key: 'cut',
        label: '剪切',
        icon: 'scissors',
        shortcut: '⌘X',
        disabled: true,
      },
      {
        key: 'paste',
        label: '粘贴',
        icon: 'clipboard',
        shortcut: '⌘V',
        disabled: true,
      },
      {
        key: 'delete',
        label: '删除',
        icon: 'trash-2',
        shortcut: '⌫',
        destructive: true,
        separatorBefore: true,
        disabled: true,
      },
    ]);
  });
});
