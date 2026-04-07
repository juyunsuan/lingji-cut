import { describe, expect, it } from 'vitest';
import { MENU_ACTIONS, isProjectRequiredCommand } from '../src/lib/electron-api';

describe('electron menu actions', () => {
  it('defines the shared command list used by toolbar and native menu', () => {
    expect(MENU_ACTIONS).toEqual([
      'new-project',
      'open-project',
      'open-settings',
      'close-project',
      'show-project-in-folder',
      'undo',
      'redo',
      'replace-audio',
      'replace-srt',
      'add-asset',
      'export',
    ]);
  });

  it('marks commands that require an active project', () => {
    expect(isProjectRequiredCommand('new-project')).toBe(false);
    expect(isProjectRequiredCommand('open-project')).toBe(false);
    expect(isProjectRequiredCommand('open-settings')).toBe(false);
    expect(isProjectRequiredCommand('undo')).toBe(true);
    expect(isProjectRequiredCommand('replace-srt')).toBe(true);
    expect(isProjectRequiredCommand('export')).toBe(true);
  });
});
