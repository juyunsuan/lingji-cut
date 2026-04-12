import { useState, useCallback } from 'react';
import { Pencil, Plus, Trash2, Eye } from 'lucide-react';
import { SCRIPT_TEMPLATES } from '../../lib/script-templates';
import {
  loadCustomTemplates,
  addCustomTemplate,
  updateCustomTemplate,
  deleteCustomTemplate,
  type CustomScriptTemplate,
} from '../../lib/settings-storage';
import { Badge, Button, EmptyState, Field, Input, SettingsPageHeader, Textarea } from '../../ui';
import commonStyles from './SettingsCommon.module.css';
import styles from './TemplateManagerTab.module.css';

export function TemplateManagerTab() {
  const [customs, setCustoms] = useState(() => loadCustomTemplates());
  const [editing, setEditing] = useState<CustomScriptTemplate | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [viewingBuiltin, setViewingBuiltin] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [systemPrompt, setSystemPrompt] = useState('');

  const startNew = () => {
    setIsNew(true);
    setEditing(null);
    setName('');
    setDescription('');
    setSystemPrompt('');
  };

  const startEdit = (template: CustomScriptTemplate) => {
    setIsNew(false);
    setEditing(template);
    setName(template.name);
    setDescription(template.description);
    setSystemPrompt(template.systemPrompt);
  };

  const handleSave = useCallback(() => {
    if (!name.trim() || !systemPrompt.trim()) return;

    if (isNew) {
      addCustomTemplate({ name, description, systemPrompt });
    } else if (editing) {
      updateCustomTemplate(editing.id, { name, description, systemPrompt });
    }

    setCustoms(loadCustomTemplates());
    setEditing(null);
    setIsNew(false);
  }, [description, editing, isNew, name, systemPrompt]);

  const handleDelete = useCallback((id: string) => {
    deleteCustomTemplate(id);
    setCustoms(loadCustomTemplates());
  }, []);

  const isEditorOpen = isNew || editing !== null;

  return (
    <>
      <SettingsPageHeader
        title="口播模板管理"
        description="管理口播稿生成的风格模板，内置模板不可修改"
      />

      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <h3 className={styles.sectionTitle}>内置模板</h3>
          <Badge variant="secondary">{SCRIPT_TEMPLATES.length}</Badge>
        </div>

        {SCRIPT_TEMPLATES.map((template) => (
          <div key={template.id} className={styles.card}>
            <div className={styles.cardHeader}>
              <span className={styles.cardName}>{template.name}</span>
              <Badge variant="outline">内置</Badge>
              <span className={styles.cardDescription}>{template.description}</span>
              <div className={styles.spacer} />
              <Button.Icon
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setViewingBuiltin(viewingBuiltin === template.id ? null : template.id)}
                aria-label={viewingBuiltin === template.id ? '隐藏内置模板内容' : '查看内置模板内容'}
              >
                <Eye size={14} />
              </Button.Icon>
            </div>

            {viewingBuiltin === template.id ? (
              <pre className={styles.promptPreview}>{template.systemPrompt}</pre>
            ) : null}
          </div>
        ))}
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <h3 className={styles.sectionTitle}>自定义模板</h3>
          <Badge variant="info">{customs.length}</Badge>
          <div className={styles.spacer} />
          <Button type="button" size="sm" variant="primary" leftIcon={<Plus size={12} />} onClick={startNew}>
            新增
          </Button>
        </div>

        {customs.length === 0 && !isEditorOpen ? (
          <EmptyState title="暂无自定义模板" description='点击“新增”创建一个模板' />
        ) : null}

        {customs.map((template) => (
          <div key={template.id} className={styles.card}>
            <div className={styles.cardHeader}>
              <span className={styles.cardName}>{template.name}</span>
              {template.description ? (
                <span className={styles.cardDescription}>{template.description}</span>
              ) : null}
              <div className={styles.cardActions}>
                <Button.Icon
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => startEdit(template)}
                  aria-label="编辑模板"
                >
                  <Pencil size={14} />
                </Button.Icon>
                <Button.Icon
                  type="button"
                  variant="destructive"
                  size="sm"
                  onClick={() => handleDelete(template.id)}
                  aria-label="删除模板"
                >
                  <Trash2 size={14} />
                </Button.Icon>
              </div>
            </div>
          </div>
        ))}
      </section>

      {isEditorOpen ? (
        <section className={styles.editorPanel}>
          <span className={styles.editorTitle}>{isNew ? '新增模板' : '编辑模板'}</span>

          <div className={commonStyles.formStack}>
            <Field label="模板名称">
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="如：财经解读" />
            </Field>
            <Field label="描述">
              <Input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="一句话描述风格特点"
              />
            </Field>
            <Field label="System Prompt">
              <Textarea
                value={systemPrompt}
                onChange={(e) => setSystemPrompt(e.target.value)}
                placeholder="输入完整的 System Prompt..."
                rows={10}
                size="sm"
                resize="vertical"
              />
            </Field>
          </div>

          <div className={styles.editorActions}>
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setEditing(null);
                setIsNew(false);
              }}
            >
              取消
            </Button>
            <Button
              type="button"
              variant="primary"
              onClick={handleSave}
              disabled={!name.trim() || !systemPrompt.trim()}
            >
              保存
            </Button>
          </div>
        </section>
      ) : null}
    </>
  );
}
