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
import { Field, Input } from '../../ui';

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

  const startEdit = (t: CustomScriptTemplate) => {
    setIsNew(false);
    setEditing(t);
    setName(t.name);
    setDescription(t.description);
    setSystemPrompt(t.systemPrompt);
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
  }, [name, description, systemPrompt, isNew, editing]);

  const handleDelete = useCallback((id: string) => {
    deleteCustomTemplate(id);
    setCustoms(loadCustomTemplates());
  }, []);

  const isEditorOpen = isNew || editing !== null;

  return (
    <>
      <div>
        <h2 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>口播模板管理</h2>
        <p style={{ fontSize: 13, color: '#EBEBF599', margin: '8px 0 0' }}>
          管理口播稿生成的风格模板，内置模板不可修改
        </p>
      </div>

      {/* 内置模板 */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: '#EBEBF54D', letterSpacing: 1 }}>
          内置模板
        </span>
        {SCRIPT_TEMPLATES.map((t) => (
          <div
            key={t.id}
            style={{
              padding: '14px 16px',
              borderRadius: 10,
              border: '1px solid #48484A',
              background: '#2C2C2E',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 13, fontWeight: 600 }}>{t.name}</span>
              <span style={{ fontSize: 11, color: '#EBEBF54D' }}>{t.description}</span>
              <div style={{ flex: 1 }} />
              <button
                type="button"
                onClick={() => setViewingBuiltin(viewingBuiltin === t.id ? null : t.id)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#EBEBF54D' }}
              >
                <Eye size={14} />
              </button>
            </div>
            {viewingBuiltin === t.id && (
              <pre style={{ fontSize: 11, color: '#EBEBF599', whiteSpace: 'pre-wrap', marginTop: 10, lineHeight: 1.5 }}>
                {t.systemPrompt}
              </pre>
            )}
          </div>
        ))}
      </div>

      {/* 自定义模板 */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: '#EBEBF54D', letterSpacing: 1 }}>
            自定义模板
          </span>
          <div style={{ flex: 1 }} />
          <button
            type="button"
            onClick={startNew}
            style={{
              display: 'flex', alignItems: 'center', gap: 4,
              padding: '4px 10px', borderRadius: 6, border: 'none',
              background: '#0A84FF', color: '#fff',
              fontSize: 12, fontWeight: 600, cursor: 'pointer',
            }}
          >
            <Plus size={12} /> 新增
          </button>
        </div>

        {customs.length === 0 && !isEditorOpen && (
          <div style={{ padding: 20, textAlign: 'center', color: '#EBEBF54D', fontSize: 13 }}>
            暂无自定义模板，点击"新增"创建
          </div>
        )}

        {customs.map((t) => (
          <div
            key={t.id}
            style={{
              padding: '14px 16px',
              borderRadius: 10,
              border: '1px solid #48484A',
              background: '#2C2C2E',
              display: 'flex', alignItems: 'center', gap: 8,
            }}
          >
            <div>
              <span style={{ fontSize: 13, fontWeight: 600 }}>{t.name}</span>
              <span style={{ fontSize: 11, color: '#EBEBF54D', marginLeft: 8 }}>{t.description}</span>
            </div>
            <div style={{ flex: 1 }} />
            <button type="button" onClick={() => startEdit(t)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#EBEBF54D' }}>
              <Pencil size={14} />
            </button>
            <button type="button" onClick={() => handleDelete(t.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#FF453A' }}>
              <Trash2 size={14} />
            </button>
          </div>
        ))}
      </div>

      {/* 编辑面板 */}
      {isEditorOpen && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: 20, borderRadius: 12, border: '1px solid #0A84FF', background: '#0A84FF0D' }}>
          <span style={{ fontSize: 14, fontWeight: 600 }}>{isNew ? '新增模板' : '编辑模板'}</span>
          <Field label="模板名称"><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="如：财经解读" /></Field>
          <Field label="描述"><Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="一句话描述风格特点" /></Field>
          <Field label="System Prompt">
            <textarea
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
              placeholder="输入完整的 System Prompt..."
              rows={10}
              style={{ width: '100%', padding: 12, borderRadius: 8, border: '1px solid #48484A', background: '#2C2C2E', color: 'inherit', fontSize: 13, lineHeight: 1.6, resize: 'vertical', fontFamily: 'inherit' }}
            />
          </Field>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <button type="button" onClick={() => { setEditing(null); setIsNew(false); }} style={{ padding: '8px 16px', borderRadius: 6, border: '1px solid #48484A', background: 'transparent', color: '#EBEBF599', fontSize: 12, cursor: 'pointer' }}>
              取消
            </button>
            <button type="button" onClick={handleSave} disabled={!name.trim() || !systemPrompt.trim()} style={{ padding: '8px 16px', borderRadius: 6, border: 'none', background: '#0A84FF', color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
              保存
            </button>
          </div>
        </div>
      )}
    </>
  );
}
