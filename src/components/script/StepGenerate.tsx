// src/components/script/StepGenerate.tsx
import { ArrowRight, RefreshCw, Sparkles } from 'lucide-react';
import { useCallback, useMemo } from 'react';
import { useScriptStore } from '../../store/script';
import { getAllTemplates, getAnyTemplateById } from '../../lib/script-templates';
import { callLLMText } from '../../lib/llm-client';
import { loadAISettings } from '../../store/ai';
import { debouncedSaveFile } from '../../lib/script-persistence';

export function StepGenerate() {
  const {
    originalText,
    scriptText,
    selectedTemplate,
    generating,
    projectDir,
    setScriptText,
    setSelectedTemplate,
    setGenerating,
    setCurrentStep,
  } = useScriptStore();

  const stats = useMemo(() => {
    const charCount = scriptText.length;
    const readMinutes = Math.ceil(charCount / 300);
    return { charCount, readMinutes };
  }, [scriptText]);

  const handleGenerate = useCallback(async () => {
    const template = getAnyTemplateById(selectedTemplate);
    if (!template || !originalText) return;

    const settings = loadAISettings();
    if (!settings?.llmApiKey) {
      alert('请先在 AI 设置中配置 LLM API Key');
      return;
    }

    setGenerating(true);
    try {
      const result = await callLLMText(settings, template.systemPrompt, originalText);
      setScriptText(result);
      if (projectDir) {
        debouncedSaveFile(projectDir, 'script.md', result);
      }
    } catch (error) {
      console.error('生成口播稿失败:', error);
      alert(`生成失败: ${error instanceof Error ? error.message : '未知错误'}`);
    } finally {
      setGenerating(false);
    }
  }, [originalText, selectedTemplate, projectDir, setScriptText, setGenerating]);

  const templates = getAllTemplates();
  const hasScript = scriptText.length > 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, height: '100%' }}>
      {/* 标题 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <Sparkles size={16} color="#0A84FF" />
        <span style={{ fontSize: 14, fontWeight: 600 }}>生成口播稿</span>
      </div>

      <div style={{ borderTop: '1px solid #38383A' }} />

      {/* 模板选择 */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: '#EBEBF599' }}>
          选择写稿风格
        </span>
        {templates.map((tmpl) => {
          const isSelected = tmpl.id === selectedTemplate;
          return (
            <button
              key={tmpl.id}
              type="button"
              onClick={() => setSelectedTemplate(tmpl.id)}
              style={{
                display: 'flex',
                gap: 10,
                alignItems: 'flex-start',
                padding: '12px 14px',
                borderRadius: 10,
                border: `1px solid ${isSelected ? '#0A84FF' : '#48484A'}`,
                background: isSelected ? '#0A84FF15' : '#2C2C2E',
                cursor: 'pointer',
                textAlign: 'left',
              }}
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <span
                  style={{
                    fontSize: 13,
                    fontWeight: isSelected ? 600 : 500,
                    color: isSelected ? '#fff' : '#EBEBF599',
                  }}
                >
                  {tmpl.name}
                  {!tmpl.isBuiltin && (
                    <span style={{ fontSize: 10, color: '#FF9F0A', marginLeft: 4 }}>自定义</span>
                  )}
                </span>
                <span
                  style={{
                    fontSize: 11,
                    color: isSelected ? '#EBEBF580' : '#EBEBF54D',
                  }}
                >
                  {tmpl.description}
                </span>
              </div>
            </button>
          );
        })}
      </div>

      <div style={{ borderTop: '1px solid #38383A' }} />

      {/* 统计信息 */}
      {hasScript && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: '#EBEBF599' }}>
            生成信息
          </span>
          {[
            ['原稿字数', originalText.length.toLocaleString()],
            ['口播稿字数', stats.charCount.toLocaleString()],
            ['预估时长', `~${stats.readMinutes} 分钟`],
          ].map(([label, value]) => (
            <div
              key={label}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                fontSize: 12,
              }}
            >
              <span style={{ color: '#EBEBF580' }}>{label}</span>
              <span style={{ fontWeight: 600 }}>{value}</span>
            </div>
          ))}
        </div>
      )}

      <div style={{ flex: 1 }} />

      {/* 操作按钮 */}
      <div style={{ display: 'flex', gap: 10 }}>
        <button
          type="button"
          disabled={generating}
          onClick={() => {
            void handleGenerate();
          }}
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
            padding: '10px 0',
            borderRadius: 8,
            border: 'none',
            background: hasScript ? '#3A3A3C' : '#0A84FF',
            color: hasScript ? '#EBEBF599' : '#fff',
            fontSize: 13,
            fontWeight: hasScript ? 500 : 600,
            cursor: generating ? 'wait' : 'pointer',
          }}
        >
          <RefreshCw size={14} className={generating ? 'animate-spin' : ''} />
          {generating ? '生成中…' : hasScript ? '重新生成' : '生成口播稿'}
        </button>
        {hasScript && (
          <button
            type="button"
            onClick={() => setCurrentStep(4)}
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
              padding: '10px 0',
              borderRadius: 8,
              border: 'none',
              background: '#0A84FF',
              color: '#fff',
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            下一步
            <ArrowRight size={14} />
          </button>
        )}
      </div>
    </div>
  );
}
