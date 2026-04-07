// src/pages/ScriptWorkbench.tsx
import { useCallback, useEffect, useState } from 'react';
import type { ScriptStep } from '../store/script';
import { useScriptStore } from '../store/script';
import { StepIndicator } from '../components/script/StepIndicator';
import { StepInitialize } from '../components/script/StepInitialize';
import { StepReviewOriginal } from '../components/script/StepReviewOriginal';
import { StepGenerate } from '../components/script/StepGenerate';
import { StepAIReview } from '../components/script/StepAIReview';
import { StepConfirm } from '../components/script/StepConfirm';
import { ScriptEditor } from '../ui/components/script-editor';
import { AlertProvider } from '../ui/components/alert';
import {
  debouncedSaveFile,
  loadFullScriptState,
  loadPersistedScriptProjectDir,
} from '../lib/script-persistence';
import styles from './ScriptWorkbench.module.css';

interface ScriptWorkbenchProps {
  onBack: () => void;
}

export function ScriptWorkbench({ onBack }: ScriptWorkbenchProps) {
  const {
    currentStep,
    originalText,
    scriptText,
    projectDir,
    annotations,
    setCurrentStep,
    setOriginalText,
    setScriptText,
    restoreState,
    acceptAnnotation,
    dismissAnnotation,
  } = useScriptStore();

  const handleStepClick = useCallback(
    (step: ScriptStep) => setCurrentStep(step),
    [setCurrentStep],
  );

  const [restoring, setRestoring] = useState(false);

  // 挂载时尝试从磁盘恢复上次的工作状态
  useEffect(() => {
    const restore = async () => {
      // store 中已有 projectDir，说明状态已存在（如导航返回后重进），不覆盖
      if (useScriptStore.getState().projectDir) return;

      const savedDir = loadPersistedScriptProjectDir();
      if (!savedDir) return;

      setRestoring(true);
      try {
        const fullState = await loadFullScriptState(savedDir);
        if (fullState) {
          restoreState({
            projectDir: savedDir,
            currentStep: fullState.persisted.currentStep,
            originalText: fullState.originalText,
            scriptText: fullState.scriptText,
            selectedTemplate: fullState.persisted.templateId,
            annotations: fullState.persisted.annotations,
          });
        }
      } catch (error) {
        console.error('恢复口播稿状态失败:', error);
      } finally {
        setRestoring(false);
      }
    };

    void restore();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isEditingOriginal = currentStep <= 2;
  const editorValue = isEditingOriginal ? originalText : scriptText;

  const handleEditorChange = useCallback(
    (value: string) => {
      if (isEditingOriginal) {
        setOriginalText(value);
        if (projectDir) debouncedSaveFile(projectDir, 'original.md', value);
      } else {
        setScriptText(value);
        if (projectDir) debouncedSaveFile(projectDir, 'script.md', value);
      }
    },
    [isEditingOriginal, projectDir, setOriginalText, setScriptText],
  );

  const renderSidePanel = () => {
    switch (currentStep) {
      case 1: return <StepInitialize />;
      case 2: return <StepReviewOriginal />;
      case 3: return <StepGenerate />;
      case 4: return <StepAIReview />;
      case 5: return <StepConfirm />;
    }
  };

  if (restoring) {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100%',
          color: '#EBEBF599',
          fontSize: 14,
        }}
      >
        正在恢复上次工作状态…
      </div>
    );
  }

  return (
    <AlertProvider>
    <div className={styles.page}>
      <StepIndicator currentStep={currentStep} onStepClick={handleStepClick} />

      <div className={styles.mainContent}>
        <div className={styles.editorPanel}>
          <div className={styles.editorHeader}>
            <button
              type="button"
              onClick={onBack}
              style={{
                background: 'none',
                border: 'none',
                color: '#EBEBF599',
                cursor: 'pointer',
                fontSize: 13,
                padding: '4px 8px',
                borderRadius: 6,
              }}
            >
              ← 返回
            </button>
            <span className={styles.editorTitle}>
              {isEditingOriginal ? '原稿编辑器' : '口播稿编辑器'}
            </span>
            <div className={styles.editorSpacer} />
          </div>

          <div className={styles.editorContainer}>
            {currentStep === 1 && !originalText ? (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  height: '100%',
                  color: '#EBEBF54D',
                  fontSize: 14,
                }}
              >
                在右侧面板选择工作目录并上传报告文件
              </div>
            ) : (
              <ScriptEditor
                value={editorValue}
                onChange={handleEditorChange}
                placeholder={isEditingOriginal ? '报告原文内容...' : '口播稿内容...'}
                annotations={isEditingOriginal ? undefined : annotations}
                onAcceptAnnotation={isEditingOriginal ? undefined : acceptAnnotation}
                onDismissAnnotation={isEditingOriginal ? undefined : dismissAnnotation}
              />
            )}
          </div>
        </div>

        <div className={styles.panelDivider} />

        <div className={styles.sidePanel}>{renderSidePanel()}</div>
      </div>
    </div>
    </AlertProvider>
  );
}
