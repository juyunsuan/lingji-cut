// src/components/script/StepReviewOriginal.tsx
import { FileText, ArrowRight, ArrowLeft } from 'lucide-react';
import { useMemo } from 'react';
import { useScriptStore } from '../../store/script';

export function StepReviewOriginal() {
  const { originalText, setCurrentStep } = useScriptStore();

  const stats = useMemo(() => {
    const charCount = originalText.length;
    const paragraphs = originalText.split(/\n\s*\n/).filter((p) => p.trim().length > 0).length;
    const readMinutes = Math.ceil(charCount / 400);
    return { charCount, paragraphs, readMinutes };
  }, [originalText]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, height: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <FileText size={16} color="#0A84FF" />
        <span style={{ fontSize: 14, fontWeight: 600 }}>原稿审查</span>
      </div>

      <div style={{ borderTop: '1px solid #38383A' }} />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: '#EBEBF599' }}>
          原稿统计
        </span>
        {[
          ['总字数', stats.charCount.toLocaleString()],
          ['段落数', String(stats.paragraphs)],
          ['预估阅读', `~${stats.readMinutes} 分钟`],
        ].map(([label, value]) => (
          <div key={label} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
            <span style={{ color: '#EBEBF580' }}>{label}</span>
            <span style={{ fontWeight: 600 }}>{value}</span>
          </div>
        ))}
      </div>

      <div
        style={{
          padding: 12,
          borderRadius: 8,
          background: '#0A84FF15',
          border: '1px solid #0A84FF40',
          fontSize: 12,
          color: '#EBEBF599',
          lineHeight: 1.5,
        }}
      >
        在左侧编辑器中审查原稿内容，确认无误后点击"下一步"生成口播稿。
      </div>

      <div style={{ flex: 1 }} />

      <div style={{ display: 'flex', gap: 10 }}>
        <button
          type="button"
          onClick={() => setCurrentStep(1)}
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
            padding: '10px 0',
            borderRadius: 8,
            border: '1px solid #48484A',
            background: 'transparent',
            color: '#EBEBF599',
            fontSize: 13,
            fontWeight: 500,
            cursor: 'pointer',
          }}
        >
          <ArrowLeft size={14} />
          上一步
        </button>
        <button
          type="button"
          onClick={() => setCurrentStep(3)}
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
      </div>
    </div>
  );
}
