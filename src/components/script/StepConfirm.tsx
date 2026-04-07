// src/components/script/StepConfirm.tsx
import { ArrowLeft, CheckCircle, Save } from 'lucide-react';
import { useCallback, useState } from 'react';
import { useScriptStore } from '../../store/script';
import {
  createPersistedScriptState,
  saveScriptState,
} from '../../lib/script-persistence';

export function StepConfirm() {
  const { projectDir, scriptText, selectedTemplate, annotations, currentStep, setCurrentStep } =
    useScriptStore();
  const [saved, setSaved] = useState(false);

  const handleSave = useCallback(async () => {
    if (!projectDir) return;

    await window.electronAPI.saveScriptFile(projectDir, 'script.md', scriptText);
    await saveScriptState(
      projectDir,
      createPersistedScriptState(currentStep, selectedTemplate, annotations),
    );
    setSaved(true);
  }, [projectDir, scriptText, selectedTemplate, annotations, currentStep]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, height: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <CheckCircle size={16} color="#32D74B" />
        <span style={{ fontSize: 14, fontWeight: 600 }}>确认保存</span>
      </div>

      <div style={{ borderTop: '1px solid #38383A' }} />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: '#EBEBF599' }}>
          保存路径
        </span>
        <div
          style={{
            padding: '10px 12px',
            borderRadius: 8,
            background: '#2C2C2E',
            border: '1px solid #48484A',
            fontSize: 12,
            color: '#EBEBF599',
            wordBreak: 'break-all',
          }}
        >
          {projectDir ? `${projectDir}/script.md` : '—'}
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: '#EBEBF599' }}>
          稿件字数
        </span>
        <span style={{ fontSize: 24, fontWeight: 700 }}>
          {scriptText.length.toLocaleString()}
        </span>
      </div>

      {saved && (
        <div
          style={{
            padding: 12,
            borderRadius: 8,
            background: '#32D74B15',
            border: '1px solid #32D74B40',
            fontSize: 12,
            color: '#32D74B',
          }}
        >
          口播稿已保存。第二期将支持 TTS 语音合成和视频模板生成。
        </div>
      )}

      <div style={{ flex: 1 }} />

      <button
        type="button"
        onClick={() => { void handleSave(); }}
        disabled={saved}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 6,
          padding: '10px 0',
          borderRadius: 8,
          border: 'none',
          background: saved ? '#3A3A3C' : '#0A84FF',
          color: saved ? '#EBEBF54D' : '#fff',
          fontSize: 13,
          fontWeight: 600,
          cursor: saved ? 'default' : 'pointer',
        }}
      >
        <Save size={14} />
        {saved ? '已保存' : '保存口播稿'}
      </button>

      <button
        type="button"
        onClick={() => setCurrentStep(4)}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 6,
          padding: '8px 0',
          borderRadius: 8,
          border: '1px solid #48484A',
          background: 'transparent',
          color: '#EBEBF599',
          fontSize: 12,
          fontWeight: 500,
          cursor: 'pointer',
        }}
      >
        <ArrowLeft size={14} />
        上一步
      </button>
    </div>
  );
}
