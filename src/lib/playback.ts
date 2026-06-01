export const PLAYBACK_UI_UPDATE_MS = 250;

export function shouldUpdatePlaybackTime(
  previousMs: number,
  nextMs: number,
  thresholdMs = PLAYBACK_UI_UPDATE_MS,
): boolean {
  if (nextMs <= previousMs) {
    return true;
  }

  return nextMs - previousMs >= thresholdMs;
}

/**
 * 拖动播放头时的播放状态机。
 *
 * 背景：`@hyperframes/player` 的 `seek()` 会把内部时钟停掉并置 `_paused = true`，
 * 但不会派发 `pause` 事件。因此「播放中拖动时间轴」会出现两个问题：
 * 1. 播放被静默打断（实际暂停）；
 * 2. Renderer 的 `isPlaying` 仍是 `true`（只有 `pause` 事件才会翻转），按钮显示在播放中。
 *
 * 这里用一个纯状态机描述标准非线性编辑器的「拖动时暂停、松手后续播」行为：
 * - 拖动开始：若在播放则记下并暂停，拖动期间播放头只跟随光标，不会自行前进；
 * - 拖动结束：若开始时在播放则续播，从拖到的位置继续；
 * - 一次性 seek（点击轨道、字幕/AI 跳转，不带 start/end）：若在播放则 seek 后立即续播，
 *   避免停在「实际暂停但 isPlaying=true」的错位状态。
 */
export interface ScrubPlaybackState {
  /** 是否正处于一次连续拖动会话中。 */
  scrubbing: boolean;
  /** 拖动开始时播放器是否在播放（决定松手后是否续播）。 */
  wasPlaying: boolean;
}

export type PlayerAction = 'play' | 'pause' | 'none';

export const IDLE_SCRUB_STATE: ScrubPlaybackState = { scrubbing: false, wasPlaying: false };

export function beginScrub(isPlaying: boolean): {
  state: ScrubPlaybackState;
  action: PlayerAction;
} {
  return {
    state: { scrubbing: true, wasPlaying: isPlaying },
    action: isPlaying ? 'pause' : 'none',
  };
}

export function endScrub(state: ScrubPlaybackState): {
  state: ScrubPlaybackState;
  action: PlayerAction;
} {
  return {
    state: IDLE_SCRUB_STATE,
    action: state.wasPlaying ? 'play' : 'none',
  };
}

export function resolveSeekResume(
  isPlaying: boolean,
  state: ScrubPlaybackState,
): PlayerAction {
  // 拖动会话中由 begin/endScrub 统一管理播放，这里不再插手，保证播放头只跟随光标。
  if (state.scrubbing) {
    return 'none';
  }
  return isPlaying ? 'play' : 'none';
}
