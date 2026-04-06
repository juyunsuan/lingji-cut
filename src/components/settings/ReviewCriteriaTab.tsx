import { useState, useEffect } from 'react';
import { loadReviewCriteria, saveReviewCriteria } from '../../lib/settings-storage';

export function ReviewCriteriaTab() {
  const [criteria, setCriteria] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setCriteria(loadReviewCriteria());
  }, []);

  const handleSave = () => {
    saveReviewCriteria(criteria);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <>
      <div>
        <h2 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>审查规范配置</h2>
        <p style={{ fontSize: 13, color: '#EBEBF599', margin: '8px 0 0' }}>
          自定义 AI 审查口播稿时的关注要点，将叠加到系统内置审查规则之上
        </p>
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
        系统已内置基础审查规则（事实准确性、表达流畅性、逻辑连贯性等），以下内容将作为补充要求追加到审查 Prompt 中。
      </div>

      <textarea
        value={criteria}
        onChange={(e) => setCriteria(e.target.value)}
        rows={12}
        placeholder="输入你希望 AI 额外关注的审查维度..."
        style={{
          width: '100%',
          padding: 16,
          borderRadius: 10,
          border: '1px solid #48484A',
          background: '#2C2C2E',
          color: 'inherit',
          fontSize: 14,
          lineHeight: 1.7,
          resize: 'vertical',
          fontFamily: 'inherit',
        }}
      />

      <button
        type="button"
        onClick={handleSave}
        style={{
          alignSelf: 'flex-start',
          padding: '10px 24px',
          borderRadius: 8,
          border: 'none',
          background: saved ? '#32D74B' : '#0A84FF',
          color: '#fff',
          fontSize: 13,
          fontWeight: 600,
          cursor: 'pointer',
        }}
      >
        {saved ? '已保存 ✓' : '保存审查规范'}
      </button>
    </>
  );
}
