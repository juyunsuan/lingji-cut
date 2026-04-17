import { useCallback, useEffect, useMemo, useState } from 'react';
import { RotateCcw, Save, Trash2 } from 'lucide-react';
import {
  Alert,
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  CodeEditor,
  ConfirmDialog,
  SettingsPageHeader,
  Tabs,
  TabsList,
  TabsTrigger,
  useToast,
} from '../../ui';
import {
  PROMPT_KINDS,
  PROMPT_KIND_META,
  type PromptKind,
  type PromptKindMeta,
  type PromptScope,
} from '../../lib/prompts';
import { getProjectDir } from '../../store/timeline';
import styles from './PromptsConfigTab.module.css';

type EditableScope = 'global' | 'project';

interface OverviewItem {
  kind: PromptKind;
  effectiveScope: PromptScope;
  hasGlobal: boolean;
  hasProject: boolean;
  meta: PromptKindMeta;
}

const GROUP_LABEL: Record<PromptKindMeta['group'], string> = {
  'ai-analysis': '内容分析与卡片',
  motion: 'Motion 动效',
};

const SCOPE_LABEL: Record<PromptScope, string> = {
  builtin: '内置',
  global: '全局',
  project: '项目',
};

const SCOPE_BADGE_VARIANT: Record<PromptScope, React.ComponentProps<typeof Badge>['variant']> = {
  builtin: 'outline',
  global: 'info',
  project: 'success',
};

export function PromptsConfigTab() {
  const { showToast } = useToast();
  const [projectDir] = useState<string>(() => getProjectDir());
  const hasProject = Boolean(projectDir);

  const [overview, setOverview] = useState<OverviewItem[]>([]);
  const [activeKind, setActiveKind] = useState<PromptKind>(PROMPT_KINDS[0]);
  const [scope, setScope] = useState<EditableScope>('global');
  const [content, setContent] = useState<string>('');
  const [originalContent, setOriginalContent] = useState<string>('');
  const [isOverride, setIsOverride] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState<EditableScope | null>(null);

  const projectDirArg = hasProject ? projectDir : undefined;

  const refreshOverview = useCallback(async () => {
    const items = await window.electronAPI.listPrompts({ projectDir: projectDirArg });
    setOverview(items);
  }, [projectDirArg]);

  useEffect(() => {
    void refreshOverview();
  }, [refreshOverview]);

  useEffect(() => {
    if (!hasProject && scope === 'project') setScope('global');
  }, [hasProject, scope]);

  const loadKind = useCallback(
    async (kind: PromptKind, targetScope: EditableScope) => {
      setLoading(true);
      setError(null);
      try {
        const res = await window.electronAPI.readPrompt({
          kind,
          scope: targetScope,
          projectDir: projectDirArg,
        });
        if (res.content && res.content.trim()) {
          setContent(res.content);
          setOriginalContent(res.content);
          setIsOverride(true);
        } else {
          const def = await window.electronAPI.getDefaultPrompt({ kind });
          setContent(def.content);
          setOriginalContent(def.content);
          setIsOverride(false);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setLoading(false);
      }
    },
    [projectDirArg],
  );

  useEffect(() => {
    void loadKind(activeKind, scope);
  }, [activeKind, scope, loadKind]);

  const dirty = content !== originalContent;

  const groupedKinds = useMemo(() => {
    const groups: Record<PromptKindMeta['group'], OverviewItem[]> = {
      'ai-analysis': [],
      motion: [],
    };
    for (const item of overview) groups[item.meta.group].push(item);
    return groups;
  }, [overview]);

  const activeMeta = PROMPT_KIND_META[activeKind];

  const handleSave = useCallback(async () => {
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      await window.electronAPI.writePrompt({
        kind: activeKind,
        scope,
        content,
        projectDir: projectDirArg,
      });
      setOriginalContent(content);
      setIsOverride(true);
      await refreshOverview();
      showToast(`已保存 ${activeMeta.label}（${SCOPE_LABEL[scope]}）`, {
        type: 'success',
        duration: 2500,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      showToast(message, { title: '保存失败', type: 'error', duration: 4000 });
    } finally {
      setSaving(false);
    }
  }, [
    activeKind,
    activeMeta.label,
    content,
    projectDirArg,
    refreshOverview,
    saving,
    scope,
    showToast,
  ]);

  const handleResetToDefault = useCallback(async () => {
    setError(null);
    try {
      const def = await window.electronAPI.getDefaultPrompt({ kind: activeKind });
      setContent(def.content);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [activeKind]);

  const handleConfirmDeleteOverride = useCallback(async () => {
    if (!confirmReset) return;
    try {
      await window.electronAPI.deletePrompt({
        kind: activeKind,
        scope: confirmReset,
        projectDir: projectDirArg,
      });
      await refreshOverview();
      await loadKind(activeKind, confirmReset);
      showToast(`已删除 ${activeMeta.label} 的${SCOPE_LABEL[confirmReset]}覆盖`, {
        type: 'success',
        duration: 2500,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      showToast(message, { title: '删除失败', type: 'error', duration: 4000 });
    } finally {
      setConfirmReset(null);
    }
  }, [
    activeKind,
    activeMeta.label,
    confirmReset,
    loadKind,
    projectDirArg,
    refreshOverview,
    showToast,
  ]);

  return (
    <div className={styles.root}>
      <SettingsPageHeader
        title="提示词配置"
        description="编辑 AI 内容卡片、封面图与 Motion 动效的提示词模板，支持全局或项目级覆盖。"
      />

      {!hasProject && (
        <Alert
          variant="info"
          description="未打开项目，仅能编辑全局提示词。打开项目后可单独覆盖项目级提示词。"
        />
      )}

      <div className={styles.layout}>
        <Card className={styles.sidebarCard}>
          <CardHeader className={styles.sidebarHeader}>
            <CardTitle>提示词列表</CardTitle>
            <CardDescription>按优先级：项目 &gt; 全局 &gt; 内置默认</CardDescription>
          </CardHeader>
          <CardContent className={styles.sidebarList}>
            {(['ai-analysis', 'motion'] as const).map((group) => (
              <div className={styles.group} key={group}>
                <div className={styles.groupTitle}>{GROUP_LABEL[group]}</div>
                {groupedKinds[group].map((item) => {
                  const isActive = item.kind === activeKind;
                  return (
                    <div className={styles.kindRow} key={item.kind}>
                      <Button
                        type="button"
                        variant={isActive ? 'secondary' : 'ghost'}
                        size="sm"
                        className={styles.kindButton}
                        onClick={() => setActiveKind(item.kind)}
                      >
                        <span>{item.meta.label}</span>
                        <Badge
                          variant={SCOPE_BADGE_VARIANT[item.effectiveScope]}
                          size="xs"
                        >
                          {SCOPE_LABEL[item.effectiveScope]}
                        </Badge>
                      </Button>
                    </div>
                  );
                })}
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className={styles.editorCard}>
          <CardHeader className={styles.editorHeader}>
            <div className={styles.editorHeaderText}>
              <CardTitle>{activeMeta.label}</CardTitle>
              <CardDescription>{activeMeta.description}</CardDescription>
            </div>
            <Tabs
              value={scope}
              onValueChange={(next) => setScope(next as EditableScope)}
            >
              <TabsList>
                <TabsTrigger value="global">全局</TabsTrigger>
                <TabsTrigger value="project" disabled={!hasProject}>
                  当前项目
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </CardHeader>

          <CardContent className={styles.editorBody}>
            {activeMeta.variables.length > 0 && (
              <div className={styles.varHint}>
                <div className={styles.varHintTitle}>
                  可用变量（在 user 字段中以 {'{{name}}'} 形式插入）
                </div>
                <div className={styles.varHintGrid}>
                  {activeMeta.variables.map((v) => (
                    <div key={v.name} className={styles.varHintItem}>
                      <code>{`{{${v.name}}}`}</code>
                      <span>— {v.description}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {error && <Alert variant="error" description={error} />}

            <div className={styles.editorWrap}>
              <CodeEditor
                value={content}
                onChange={setContent}
                language="yaml"
                minHeight="100%"
                ariaLabel={`${activeMeta.label} 提示词 YAML 编辑器`}
                variables={activeMeta.variables}
              />
            </div>

            <div className={styles.statusBar}>
              <Badge variant={isOverride ? SCOPE_BADGE_VARIANT[scope] : 'outline'} size="xs">
                当前编辑：{SCOPE_LABEL[scope]}
              </Badge>
              <span>{isOverride ? '已存在覆盖文件' : '使用内置默认（保存后才会创建覆盖文件）'}</span>
              {dirty && <Badge variant="warning" size="xs">未保存</Badge>}
            </div>
          </CardContent>

          <CardFooter className={styles.editorFooter}>
            <Button
              variant="primary"
              onClick={handleSave}
              disabled={saving || loading || !dirty}
            >
              <Save size={14} />
              保存到 {SCOPE_LABEL[scope]}
            </Button>
            <Button variant="secondary" onClick={handleResetToDefault} disabled={loading}>
              <RotateCcw size={14} />
              重置为内置默认
            </Button>
            <Button
              variant="ghost"
              onClick={() => setConfirmReset(scope)}
              disabled={loading || !isOverride}
            >
              <Trash2 size={14} />
              删除当前 {SCOPE_LABEL[scope]} 覆盖
            </Button>
          </CardFooter>
        </Card>
      </div>

      <ConfirmDialog
        open={confirmReset !== null}
        onOpenChange={(open) => {
          if (!open) setConfirmReset(null);
        }}
        title={`删除${confirmReset ? SCOPE_LABEL[confirmReset] : ''}覆盖`}
        description={
          <p>
            将删除当前 prompt 在 <strong>{confirmReset ? SCOPE_LABEL[confirmReset] : ''}</strong> 范围内的覆盖文件，回退到上层（项目 → 全局 → 内置默认）。此操作不可撤销。
          </p>
        }
        confirmText="确认删除"
        cancelText="取消"
        confirmVariant="destructive"
        onConfirm={handleConfirmDeleteOverride}
      />
    </div>
  );
}
