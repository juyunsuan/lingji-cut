import { useState, useEffect } from 'react';
import { loadReviewCriteria, saveReviewCriteria } from '../../lib/settings-storage';
import { Alert, SaveButton, SettingsPageHeader, Textarea } from '../../ui';
import styles from './SettingsCommon.module.css';

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
      <SettingsPageHeader
        title="审查规范配置"
        description="自定义 AI 审查口播稿时的关注要点，将叠加到系统内置审查规则之上"
      />

      <Alert
        variant="info"
        description="系统已内置基础审查规则（事实准确性、表达流畅性、逻辑连贯性等），以下内容将作为补充要求追加到审查 Prompt 中。"
        className={styles.reviewNotice}
      />

      <Textarea
        value={criteria}
        onChange={(e) => setCriteria(e.target.value)}
        rows={12}
        placeholder="输入你希望 AI 额外关注的审查维度..."
        size="md"
        resize="vertical"
      />

      <SaveButton
        onClick={handleSave}
        saved={saved}
        defaultLabel="保存审查规范"
        className={styles.saveButton}
      />
    </>
  );
}
