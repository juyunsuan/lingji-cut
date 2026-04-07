// src/components/script/StepInitialize.tsx
import { Upload, FolderOpen, RotateCcw } from 'lucide-react';
import { useState } from 'react';
import { useScriptStore } from '../../store/script';
import { loadFullScriptState } from '../../lib/script-persistence';

export function StepInitialize() {
  const {
    projectDir,
    originalText,
    setProjectDir,
    setOriginalText,
    setCurrentStep,
    restoreState,
  } = useScriptStore();

  const [restoredHint, setRestoredHint] = useState<string | null>(null);

  const handleSelectDir = async () => {
    const dir = await window.electronAPI.selectProjectDirectory();
    if (!dir) return;

    setProjectDir(dir);
    setRestoredHint(null);

    // 尝试从工作目录恢复已有状态
    try {
      const fullState = await loadFullScriptState(dir);
      if (fullState) {
        restoreState({
          projectDir: dir,
          currentStep: fullState.persisted.currentStep,
          originalText: fullState.originalText,
          scriptText: fullState.scriptText,
          selectedTemplate: fullState.persisted.templateId,
          annotations: fullState.persisted.annotations,
        });
        setRestoredHint('已从工作目录恢复上次的工作状态');
      }
    } catch (error) {
      console.error('恢复状态失败:', error);
    }
  };

  const handleSelectFile = async () => {
    const result = await window.electronAPI.selectTextFile();
    if (!result) return;
    setOriginalText(result.content);
    setRestoredHint(null);
  };

  const handleNext = async () => {
    if (!projectDir || !originalText) return;
    await window.electronAPI.saveScriptFile(projectDir, 'original.md', originalText);
    setCurrentStep(2);
  };

  const hasFile = originalText.length > 0;
  const hasDir = Boolean(projectDir);
  const canProceed = hasFile && hasDir;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, height: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <Upload size={16} color="#0A84FF" />
        <span style={{ fontSize: 14, fontWeight: 600 }}>项目初始化</span>
      </div>

      <div style={{ borderTop: '1px solid #38383A' }} />

      {/* 工作目录（前置） */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: '#EBEBF599' }}>
          选择工作目录
        </span>
        <button
          type="button"
          onClick={() => { void handleSelectDir(); }}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '12px 14px',
            borderRadius: 10,
            border: `1px solid ${hasDir ? '#32D74B' : '#48484A'}`,
            background: hasDir ? '#32D74B15' : '#2C2C2E',
            color: hasDir ? '#32D74B' : '#EBEBF599',
            cursor: 'pointer',
            fontSize: 13,
            textAlign: 'left',
          }}
        >
          <FolderOpen size={16} />
          {projectDir ?? '选择或创建工作目录'}
        </button>
      </div>

      {restoredHint && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '10px 12px',
            borderRadius: 8,
            background: '#32D74B15',
            border: '1px solid #32D74B40',
            fontSize: 12,
            color: '#32D74B',
          }}
        >
          <RotateCcw size={13} />
          {restoredHint}
        </div>
      )}

      {/* 上传报告文件 */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: '#EBEBF599' }}>
          上传报告文件
        </span>
        <button
          type="button"
          onClick={() => { void handleSelectFile(); }}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            padding: '20px 16px',
            borderRadius: 10,
            border: `1.5px dashed ${hasFile ? '#32D74B' : '#48484A'}`,
            background: hasFile ? '#32D74B15' : '#1E1E20',
            color: hasFile ? '#32D74B' : '#EBEBF599',
            cursor: 'pointer',
            fontSize: 13,
          }}
        >
          <Upload size={16} />
          {hasFile ? `已加载 ${originalText.length} 字` : '选择 .txt 或 .md 文件'}
        </button>
      </div>

      <div style={{ flex: 1 }} />

      <button
        type="button"
        disabled={!canProceed}
        onClick={() => { void handleNext(); }}
        style={{
          padding: '10px 0',
          borderRadius: 8,
          border: 'none',
          background: canProceed ? '#0A84FF' : '#3A3A3C',
          color: canProceed ? '#fff' : '#EBEBF54D',
          fontSize: 13,
          fontWeight: 600,
          cursor: canProceed ? 'pointer' : 'default',
        }}
      >
        下一步
      </button>
    </div>
  );
}
