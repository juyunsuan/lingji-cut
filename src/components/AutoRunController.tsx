import { useEffect, useRef } from 'react';
import { useAIStore } from '../store/ai';
import { useScriptStore } from '../store/script';
import { useAIVideoWorkflow } from '../hooks/useAIVideoWorkflow';
import { getProjectDir } from '../store/timeline';
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
 *   3. douyin 入口：等待 videoImportProgress.status === 'done' 再触发
 *      （Task 11 会进一步桥接抖音第 0 步进度到 overlay）。
 *   4. 监听 workflow.step：done → 跳 editor；任务取消 → 跳 script-workbench。
 *   5. 真实失败保持在 overlay 上，由用户点 "查看脚本工作台" / "进入编辑器" 跳转。
 */
export function AutoRunController({ setPage }: AutoRunControllerProps) {
  const workflow = useAIStore((s) => s.workflow);
  const pendingAutoParams = useAIStore((s) => s.pendingAutoParams);
  const setPendingAutoParams = useAIStore((s) => s.setPendingAutoParams);
  const pendingDouyinUrl = useScriptStore((s) => s.pendingDouyinUrl);
  // 抖音导入完成态：复用 script store 已有的 videoImportProgress.status
  // Task 11 会进一步把抖音过程进度同步到 overlay；这里只关心 done 信号。
  const douyinImportStatus = useScriptStore(
    (s) => s.videoImportProgress?.status ?? null,
  );
  const projectDir = getProjectDir();
  const { start, cancel } = useAIVideoWorkflow();
  const startedRef = useRef(false);

  // source = 'douyin' if pending URL exists, else 'text'
  const source: 'text' | 'douyin' = pendingDouyinUrl ? 'douyin' : 'text';

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

  // 监听完成 / 取消 → 跳页
  useEffect(() => {
    if (workflow.step === 'done') {
      setPendingAutoParams(null);
      startedRef.current = false;
      setPage('editor');
    } else if (workflow.step === 'error' && workflow.error === '任务已取消') {
      setPendingAutoParams(null);
      startedRef.current = false;
      setPage('script-workbench');
    }
    // 真实错误（非取消）保持在 overlay 上由用户点击跳转
  }, [workflow.step, workflow.error, setPage, setPendingAutoParams]);

  return (
    <AutoRunOverlay
      step={workflow.step}
      stepLabel={workflow.stepLabel}
      progress={workflow.progress}
      error={
        workflow.step === 'error' && workflow.error && workflow.error !== '任务已取消'
          ? { message: workflow.error, failedStep: workflow.failedStep ?? 'arranging' }
          : null
      }
      onCancel={() => {
        cancel();
        setPendingAutoParams(null);
        startedRef.current = false;
        setPage('script-workbench');
      }}
      onJumpToScriptWorkbench={() => {
        setPendingAutoParams(null);
        startedRef.current = false;
        setPage('script-workbench');
      }}
      onJumpToEditor={() => {
        setPendingAutoParams(null);
        startedRef.current = false;
        setPage('editor');
      }}
    />
  );
}
