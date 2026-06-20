import { create } from 'zustand';
import type { PublishAccount, PublishPlatform } from '../lib/electron-api';
import type { PublishShared, PublishTarget, PublishProgressPayload } from '../lib/electron-api';
import { useTaskProgressStore } from './task-progress';

export interface PublishResult {
  state: 'pending' | 'running' | 'success' | 'failed';
  percent?: number;
  message?: string;
  startedAt?: number;
  finishedAt?: number;
}

export interface ActivePublishJob {
  id: string;
  filePath: string;
  shared: PublishShared;
  targets: PublishTarget[];
}

interface PublishState {
  accounts: PublishAccount[];
  job: ActivePublishJob | null;
  results: Record<string, PublishResult>;

  loadAccounts: () => Promise<void>;
  addAccount: (
    platform: PublishPlatform,
    accountName: string,
  ) => Promise<{ success: boolean; message: string }>;
  checkAccount: (id: string) => Promise<boolean>;
  removeAccount: (id: string) => Promise<void>;

  startPublish: (
    filePath: string,
    shared: PublishShared,
    targets: PublishTarget[],
    headless?: boolean,
  ) => Promise<void>;
  cancelPublish: () => void;
}

export const usePublishStore = create<PublishState>((set, get) => ({
  accounts: [],
  job: null,
  results: {},

  loadAccounts: async () => {
    const accounts = await window.publishAPI.listAccounts();
    set({ accounts });
  },

  addAccount: async (platform, accountName) => {
    const res = await window.publishAPI.login(platform, accountName);
    await get().loadAccounts();
    return res;
  },

  checkAccount: async (id) => {
    const ok = await window.publishAPI.check(id);
    await get().loadAccounts();
    return ok;
  },

  removeAccount: async (id) => {
    await window.publishAPI.deleteAccount(id);
    await get().loadAccounts();
  },

  startPublish: async (filePath, shared, targets, headless = true) => {
    const jobId = crypto.randomUUID();
    const job: ActivePublishJob = { id: jobId, filePath, shared, targets };

    // Initialise results to pending for each target
    const initResults: Record<string, PublishResult> = {};
    for (const t of targets) {
      initResults[t.accountId] = { state: 'pending', startedAt: Date.now() };
    }
    set({ job, results: initResults });

    // ── Unified bottom progress bar ──
    const taskId = `publish-job-${jobId}`;
    const taskStore = useTaskProgressStore.getState();
    taskStore.startTask({
      id: taskId,
      category: 'publish',
      label: `发布视频 (${targets.length} 个账号)`,
      mode: 'indeterminate',
      progress: 0,
      phase: '准备发布…',
      level: 0,
      canCancel: true,
      onCancel: () => get().cancelPublish(),
    });

    // ── Subscribe to per-target progress events ──
    const unsubscribe = window.publishAPI.onProgress((payload: PublishProgressPayload) => {
      if (payload.jobId !== jobId) return;
      const now = Date.now();
      set((s) => {
        const prev = s.results[payload.accountId] ?? { state: 'pending' };
        const next: PublishResult = {
          ...prev,
          state:
            payload.state === 'success'
              ? 'success'
              : payload.state === 'failed'
                ? 'failed'
                : payload.state === 'running'
                  ? 'running'
                  : prev.state,
          percent: payload.percent,
          message: payload.message,
          finishedAt:
            payload.state === 'success' || payload.state === 'failed' ? now : prev.finishedAt,
        };
        return { results: { ...s.results, [payload.accountId]: next } };
      });

      // Update unified progress bar phase
      const currentResults = { ...get().results, [payload.accountId]: { state: payload.state } };
      const total = targets.length;
      const done = Object.values(currentResults).filter(
        (r) => r.state === 'success' || r.state === 'failed',
      ).length;
      const pct = total > 0 ? Math.round((done / total) * 100) : 0;
      useTaskProgressStore.getState().updateTask(taskId, {
        progress: pct,
        phase: `发布中 ${done}/${total}`,
        mode: 'determinate',
      });
    });

    // ── Run publish job ──
    try {
      await window.publishAPI.run(
        {
          id: jobId,
          filePath,
          shared,
          targets,
        },
        headless,
      );
      // Complete the parent task
      useTaskProgressStore.getState().completeTask(taskId);
    } catch (err) {
      useTaskProgressStore
        .getState()
        .failTask(taskId, err instanceof Error ? err.message : String(err));
    } finally {
      unsubscribe();
      set({ job: null });
    }
  },

  cancelPublish: () => {
    window.publishAPI.cancel().catch(() => {});
  },
}));
