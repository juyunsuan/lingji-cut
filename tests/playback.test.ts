import { describe, expect, it } from 'vitest';
import {
  IDLE_SCRUB_STATE,
  beginScrub,
  endScrub,
  resolveSeekResume,
  shouldUpdatePlaybackTime,
} from '../src/lib/playback';

describe('shouldUpdatePlaybackTime', () => {
  it('skips tiny forward frame updates to avoid thrashing the preview', () => {
    expect(shouldUpdatePlaybackTime(1000, 1033)).toBe(false);
    expect(shouldUpdatePlaybackTime(1000, 1199)).toBe(false);
  });

  it('publishes meaningful forward progress updates', () => {
    expect(shouldUpdatePlaybackTime(1000, 1250)).toBe(true);
    expect(shouldUpdatePlaybackTime(1000, 1350)).toBe(true);
  });

  it('always updates when playback jumps backwards', () => {
    expect(shouldUpdatePlaybackTime(1000, 950)).toBe(true);
    expect(shouldUpdatePlaybackTime(1000, 0)).toBe(true);
  });
});

describe('scrub playback state machine', () => {
  it('pauses an active scrub when playback was running, remembering to resume', () => {
    const { state, action } = beginScrub(true);
    expect(action).toBe('pause');
    expect(state).toEqual({ scrubbing: true, wasPlaying: true });
  });

  it('does nothing on scrub start when already paused', () => {
    const { state, action } = beginScrub(false);
    expect(action).toBe('none');
    expect(state).toEqual({ scrubbing: true, wasPlaying: false });
  });

  it('resumes playback at the end of a scrub that interrupted playback', () => {
    const begun = beginScrub(true).state;
    const { state, action } = endScrub(begun);
    expect(action).toBe('play');
    expect(state).toEqual(IDLE_SCRUB_STATE);
  });

  it('stays paused at the end of a scrub that started paused', () => {
    const begun = beginScrub(false).state;
    const { state, action } = endScrub(begun);
    expect(action).toBe('none');
    expect(state).toEqual(IDLE_SCRUB_STATE);
  });

  it('resumes a one-shot seek (no active scrub) when playback was running', () => {
    // Regression: player.seek() silently pauses without firing a pause event,
    // so a click-to-seek while playing must explicitly resume.
    expect(resolveSeekResume(true, IDLE_SCRUB_STATE)).toBe('play');
  });

  it('leaves a one-shot seek paused when playback was not running', () => {
    expect(resolveSeekResume(false, IDLE_SCRUB_STATE)).toBe('none');
  });

  it('never resumes mid-scrub, so the playhead only follows the cursor', () => {
    const scrubbing = beginScrub(true).state;
    expect(resolveSeekResume(false, scrubbing)).toBe('none');
    expect(resolveSeekResume(true, scrubbing)).toBe('none');
  });
});
