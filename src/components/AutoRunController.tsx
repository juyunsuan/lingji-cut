import { useEffect, useRef } from 'react';
import { useAIStore, type WorkflowStep } from '../store/ai';
import { useScriptStore } from '../store/script';
import { useAIVideoWorkflow } from '../hooks/useAIVideoWorkflow';
import { getProjectDir } from '../store/timeline';
import { useTaskProgressStore } from '../store/task-progress';
import { AutoRunOverlay } from './AutoRunOverlay';
import type { AppPage } from '../lib/electron-api';

export interface AutoRunControllerProps {
  setPage: (next: AppPage) => void;
}

/**
 * AutoRunController：把 AutoRunOverlay 与 useAIVideoWorkflow 串起来的胶水。
 *
 * 职责：
 *   1. 挂载时根据 pendingDouyinUrl 区分 source（text vs douyin）。
 *   2. text 入口：立即从磁盘读 original.md → 触发 workflow.start。
 *   3. douyin 入口：AutoRunController 自行触发 importVideoSource，
 *      订阅 onDouyinImportProgress 写入统一进度条，并把抖音过程当做
 *      "第 0 步"（虚拟 effectiveStep='douyin_importing'）展示给 overlay；
 *      抖音 status==='done' 后再从 script_generating 起跑 useAIVideoWorkflow。
 *   4. 监听 workflow.step：done → 跳 editor；任务取消 → 跳 script-workbench。
 *   5. 真实失败保持在 overlay 上，由用户点 "查看脚本工作台" / "进入编辑器" 跳转。
 *   6. 所有离开路径（done / 取消 / 点击跳转）都必须清掉 pendingDouyinUrl，
 *      避免 ScriptWorkbench 二次消费。
 */
export function AutoRunController({ setPage }: AutoRunControllerProps) {
  const workflow = useAIStore((s) => s.workflow);
  const pendingAutoParams = useAIStore((s) => s.pendingAutoParams);
  const setPendingAutoParams = useAIStore((s) => s.setPendingAutoParams);
  const pendingDouyinUrl = useScriptStore((s) => s.pendingDouyinUrl);
  // 抖音导入完成态：复用 script store 已有的 videoImportProgress.status
  // AutoRunController 的抖音分支订阅 onDouyinImportProgress 直接维护
  // 自己的 douyin 任务进度（见下方 effect），script store 的 status 仅作
  // 起跑 useAIVideoWorkflow 的 done 信号兜底。
  const douyinImportStatus = useScriptStore(
    (s) => s.videoImportProgress?.status ?? null,
  );
  const projectDir = getProjectDir();
  const { start, cancel } = useAIVideoWorkflow();
  const startedRef = useRef(false);
  const douyinKickedRef = useRef(false);
  const douyinTaskIdRef = useRef<string | null>(null);
  // 订阅 task store 的 douyin 任务快照，供 overlay 展示"第 0 步"进度
  const douyinTask = useTaskProgressStore((s) =>
    douyinTaskIdRef.current ? s.tasks.get(douyinTaskIdRef.current) ?? null : null,
  );

  // source = 'douyin' if pending URL exists when mounted OR we have already kicked douyin flow
  const source: 'text' | 'douyin' =
    pendingDouyinUrl || douyinKickedRef.current ? 'douyin' : 'text';

  /**
   * 抖音分支：AutoRunController 自行触发 importVideoSource。
   * 这是 Task 11 的核心修复——之前 ScriptWorkbench 并未在 auto-run 页
   * 挂载，抖音下载从来没被真正启动。
   */
  useEffect(() => {
    if (source !== 'douyin') return;
    if (!pendingDouyinUrl || !projectDir) return;
    if (douyinKickedRef.current) return;
    douyinKickedRef.current = true;
    const url = pendingDouyinUrl;
    // 立即清掉 pendingDouyinUrl，防止 ScriptWorkbench 后续二次消费
    useScriptStore.getState().setPendingDouyinUrl(null);

    void window.electronAPI
      .importVideoSource({
        sourceType: 'douyin',
        url,
        projectDir,
        syncToOriginal: true,
      })
      .catch((err: unknown) => {
        // 进度错误通常会通过 onDouyinImportProgress 的 error snapshot 反映；
        // 这里兜底：若 IPC Promise 在任何 progress 事件前先 reject，
        // 直接把 workflow 设为 error 以便 overlay 展示错误 UI。
        useAIStore.getState().setWorkflow({
          step: 'error',
          error: err instanceof Error ? err.message : '抖音导入失败',
          failedStep: 'douyin_importing',
          canCancel: false,
        });
      });
  }, [source, pendingDouyinUrl, projectDir]);

  /**
   * 抖音分支：订阅 onDouyinImportProgress 把进度 push 到统一任务条。
   * 这样底部 AppStatusBar 也能看到抖音第 0 步的进度（符合 PROGRESS-SPEC）。
   */
  useEffect(() => {
    if (source !== 'douyin' || !pendingAutoParams) return;
    if (!window.electronAPI.onDouyinImportProgress) return;

    if (!douyinTaskIdRef.current) {
      douyinTaskIdRef.current = `douyin-import-${Date.now()}`;
      useTaskProgressStore.getState().startTask({
        id: douyinTaskIdRef.current,
        category: 'import',
        label: '步骤 1/6 · 导入抖音视频',
        mode: 'determinate',
        progress: 0,
        phase: '准备',
        level: 2,
        canCancel: false,
      });
    }

    const off = window.electronAPI.onDouyinImportProgress((snapshot) => {
      const id = douyinTaskIdRef.current;
      if (!id) return;
      if (snapshot.status === 'error') {
        useTaskProgressStore.getState().failTask(id, snapshot.error ?? '抖音导入失败');
        return;
      }
      if (snapshot.status === 'done') {
        useTaskProgressStore.getState().updateTask(id, { progress: 100, phase: '完成' });
        useTaskProgressStore.getState().completeTask(id);
        return;
      }
      useTaskProgressStore.getState().updateTask(id, {
        progress: Math.min(99, Math.max(0, snapshot.progress)),
        phase: snapshot.stepLabel,
      });
    });
    return off;
  }, [source, pendingAutoParams]);

  // 起跑 useAIVideoWorkflow：
  // - text 分支立即起跑
  // - douyin 分支等待 videoImportProgress.status === 'done'
  useEffect(() => {
    if (startedRef.current) return;
    if (!pendingAutoParams || !projectDir) return;

    if (source === 'text') {
      startedRef.current = true;
      void (async () => {
        const original =
          (await window.electronAPI.loadScriptFile(projectDir, 'original.md')) ?? '';
        await start('', {
          autoMode: true,
          autoParams: pendingAutoParams,
          originalText: original,
          startFromStep: 'script_generating',
        });
      })();
    } else if (source === 'douyin' && douyinImportStatus === 'done') {
      startedRef.current = true;
      void (async () => {
        const original =
          (await window.electronAPI.loadScriptFile(projectDir, 'original.md')) ?? '';
        await start('', {
          autoMode: true,
          autoParams: pendingAutoParams,
          originalText: original,
          startFromStep: 'script_generating',
        });
      })();
    }
  }, [pendingAutoParams, projectDir, source, douyinImportStatus, start]);

  // 监听完成 / 取消 → 跳页，同时清掉 pendingDouyinUrl（I-1）
  useEffect(() => {
    if (workflow.step === 'done') {
      setPendingAutoParams(null);
      useScriptStore.getState().setPendingDouyinUrl(null);
      startedRef.current = false;
      setPage('editor');
    } else if (workflow.step === 'error' && workflow.error === '任务已取消') {
      setPendingAutoParams(null);
      useScriptStore.getState().setPendingDouyinUrl(null);
      startedRef.current = false;
      setPage('script-workbench');
    }
    // 真实错误（非取消）保持在 overlay 上由用户点击跳转
  }, [workflow.step, workflow.error, setPage, setPendingAutoParams]);

  // ── overlay 展示用：抖音下载期间把 workflow.step 虚拟成 'douyin_importing' ──
  // 此时 useAIVideoWorkflow 还没 start（或刚 start 尚未推进到 tts），
  // workflow.step 是 'idle' 或 'script_generating'；我们用 douyinTask 的进度
  // 覆盖展示，并把总进度压缩到整体 1/6 桶内（6 个可视阶段）。
  const douyinPhase =
    source === 'douyin' &&
    (workflow.step === 'idle' || workflow.step === 'script_generating') &&
    douyinTask?.status === 'active';
  const effectiveStep: WorkflowStep = douyinPhase ? 'douyin_importing' : workflow.step;
  const effectiveProgress = douyinPhase && douyinTask
    ? Math.round((douyinTask.progress ?? 0) / 6)
    : (workflow.progress ?? 0);
  const effectiveLabel = douyinPhase && douyinTask
    ? `步骤 1/6 · 导入抖音视频${douyinTask.phase ? ` · ${douyinTask.phase}` : ''}`
    : workflow.stepLabel;

  return (
    <AutoRunOverlay
      step={effectiveStep}
      stepLabel={effectiveLabel}
      progress={effectiveProgress}
      error={
        workflow.step === 'error' && workflow.error && workflow.error !== '任务已取消'
          ? { message: workflow.error, failedStep: workflow.failedStep ?? 'arranging' }
          : null
      }
      onCancel={() => {
        cancel();
        setPendingAutoParams(null);
        useScriptStore.getState().setPendingDouyinUrl(null);
        startedRef.current = false;
        setPage('script-workbench');
      }}
      onJumpToScriptWorkbench={() => {
        setPendingAutoParams(null);
        useScriptStore.getState().setPendingDouyinUrl(null);
        startedRef.current = false;
        setPage('script-workbench');
      }}
      onJumpToEditor={() => {
        setPendingAutoParams(null);
        useScriptStore.getState().setPendingDouyinUrl(null);
        startedRef.current = false;
        setPage('editor');
      }}
    />
  );
}
