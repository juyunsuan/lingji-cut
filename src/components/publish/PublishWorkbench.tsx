import { useEffect, useState } from 'react';
import { Upload, Film, Image as ImageIcon, Tag, Clock, Check, X, Loader2, ChevronDown, ChevronRight } from 'lucide-react';
import { Button, Field, Input } from '../../ui';
import { Spinner } from '../../ui/primitives/Spinner';
import { usePublishStore } from '../../store/publish';
import type { PublishAccount, PublishTarget } from '../../lib/electron-api';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const PLATFORM_LABEL: Record<string, string> = {
  douyin: '抖音',
  tencent: '视频号',
  xiaohongshu: '小红书',
  kuaishou: '快手',
  bilibili: 'B站',
};

function AccountStatusBadge({ status }: { status: PublishAccount['status'] }) {
  const config = {
    valid: { label: '已登录', color: 'var(--color-success, #22c55e)' },
    expired: { label: '已过期', color: 'var(--color-warning, #f59e0b)' },
    unknown: { label: '未知', color: 'var(--color-text-tertiary, #888)' },
  }[status];
  return (
    <span
      style={{
        fontSize: 11,
        padding: '2px 6px',
        borderRadius: 4,
        background: `color-mix(in srgb, ${config.color} 15%, transparent)`,
        color: config.color,
        fontWeight: 500,
      }}
    >
      {config.label}
    </span>
  );
}

function ResultRow({
  accountId,
  state,
  percent,
  message,
}: {
  accountId: string;
  state: string;
  percent?: number;
  message?: string;
}) {
  const icon =
    state === 'success' ? (
      <Check size={14} style={{ color: 'var(--color-success, #22c55e)' }} />
    ) : state === 'failed' ? (
      <X size={14} style={{ color: 'var(--color-error, #ef4444)' }} />
    ) : state === 'running' ? (
      <Loader2 size={14} style={{ animation: 'spin 1s linear infinite', color: 'var(--color-system-blue)' }} />
    ) : null;

  const pctStr = percent != null ? ` ${percent}%` : '';
  const barWidth = percent != null ? `${Math.max(0, Math.min(100, percent))}%` : '0%';

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '6px 0',
        fontSize: 13,
        borderBottom: '1px solid var(--color-border-subtle, rgba(0,0,0,0.06))',
      }}
    >
      <span style={{ minWidth: 16 }}>{icon}</span>
      <span style={{ flex: 1, color: 'var(--color-text-primary)' }}>
        {PLATFORM_LABEL[accountId.split('_')[0]] ?? accountId.split('_')[0]}{' '}
        <span style={{ color: 'var(--color-text-secondary)' }}>
          {accountId.split('_').slice(1).join('_')}
        </span>
      </span>
      {state === 'running' && percent != null && (
        <div
          style={{
            width: 80,
            height: 4,
            background: 'var(--color-border-subtle, rgba(0,0,0,0.1))',
            borderRadius: 2,
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              width: barWidth,
              height: '100%',
              background: 'var(--color-system-blue)',
              borderRadius: 2,
              transition: 'width 0.3s ease',
            }}
          />
        </div>
      )}
      <span
        style={{
          fontSize: 12,
          color:
            state === 'success'
              ? 'var(--color-success, #22c55e)'
              : state === 'failed'
                ? 'var(--color-error, #ef4444)'
                : 'var(--color-text-secondary)',
          minWidth: 60,
          textAlign: 'right',
        }}
      >
        {state === 'success'
          ? '成功'
          : state === 'failed'
            ? message ?? '失败'
            : state === 'running'
              ? `上传中${pctStr}`
              : '等待中'}
      </span>
    </div>
  );
}

// ─── Per-account override panel ────────────────────────────────────────────────

interface AccountOverride {
  title: string;
  desc: string;
  tagsInput: string;
  bilibiliTid: string; // B站分区 ID（字符串形式，提交时转 number）
}

function AccountOverridePanel({
  accountId,
  platform,
  override,
  expanded,
  onToggle,
  onChange,
}: {
  accountId: string;
  platform: string;
  override: AccountOverride;
  expanded: boolean;
  onToggle: () => void;
  onChange: (next: AccountOverride) => void;
}) {
  return (
    <div
      style={{
        marginTop: 6,
        borderRadius: 6,
        border: '1px solid var(--color-border-subtle, rgba(0,0,0,0.08))',
        overflow: 'hidden',
        background: 'var(--color-bg-elevated)',
      }}
    >
      {/* Toggle header */}
      <button
        type="button"
        onClick={onToggle}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          width: '100%',
          padding: '6px 10px',
          fontSize: 12,
          color: 'var(--color-text-secondary)',
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
          textAlign: 'left',
        }}
      >
        {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        文案覆盖
        {(override.title || override.desc || override.tagsInput || override.bilibiliTid) && (
          <span
            style={{
              fontSize: 10,
              padding: '1px 5px',
              borderRadius: 3,
              background: 'color-mix(in srgb, var(--color-system-blue) 15%, transparent)',
              color: 'var(--color-system-blue)',
              fontWeight: 500,
            }}
          >
            已设置
          </span>
        )}
      </button>

      {/* Override fields */}
      {expanded && (
        <div
          style={{
            padding: '8px 10px 10px',
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
            borderTop: '1px solid var(--color-border-subtle, rgba(0,0,0,0.06))',
          }}
        >
          <div>
            <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginBottom: 3 }}>
              标题（留空则用共享标题）
            </div>
            <Input
              value={override.title}
              onChange={(e) => onChange({ ...override, title: e.target.value })}
              placeholder="覆盖标题…"
              style={{ fontSize: 12 }}
            />
          </div>
          <div>
            <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginBottom: 3 }}>
              描述（留空则用共享描述）
            </div>
            <textarea
              value={override.desc}
              onChange={(e) => onChange({ ...override, desc: e.target.value })}
              placeholder="覆盖描述…"
              rows={2}
              style={{
                width: '100%',
                resize: 'vertical',
                padding: '6px 8px',
                fontSize: 12,
                border: '1px solid var(--color-border, rgba(0,0,0,0.15))',
                borderRadius: 6,
                background: 'var(--color-input-bg, var(--color-bg-elevated))',
                color: 'var(--color-text-primary)',
                fontFamily: 'inherit',
                outline: 'none',
                boxSizing: 'border-box',
              }}
            />
          </div>
          <div>
            <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginBottom: 3 }}>
              标签（留空则用共享标签）
            </div>
            <Input
              value={override.tagsInput}
              onChange={(e) => onChange({ ...override, tagsInput: e.target.value })}
              placeholder="标签1, 标签2…"
              leftIcon={<Tag size={12} />}
              style={{ fontSize: 12 }}
            />
          </div>
          {/* B站专属：分区 ID（必填） */}
          {platform === 'bilibili' && (
            <div>
              <div
                style={{
                  fontSize: 11,
                  color: 'var(--color-text-tertiary)',
                  marginBottom: 3,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                }}
              >
                分区 ID（tid，B站必填）
                <span
                  style={{
                    fontSize: 10,
                    padding: '1px 4px',
                    borderRadius: 3,
                    background: 'color-mix(in srgb, var(--color-error, #ef4444) 15%, transparent)',
                    color: 'var(--color-error, #ef4444)',
                    fontWeight: 500,
                  }}
                >
                  必填
                </span>
              </div>
              <Input
                type="number"
                value={override.bilibiliTid}
                onChange={(e) => onChange({ ...override, bilibiliTid: e.target.value })}
                placeholder="例如：21（游戏综合），17（单机联机）"
                style={{ fontSize: 12 }}
              />
              <div
                style={{
                  fontSize: 10,
                  color: 'var(--color-text-tertiary)',
                  marginTop: 3,
                }}
              >
                常用分区：17 单机联机 / 21 游戏综合 / 124 娱乐 / 182 影视 / 236 知识
              </div>
            </div>
          )}
          <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', fontStyle: 'italic' }}>
            账号 ID：{accountId}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function PublishWorkbench({ projectDir }: { projectDir: string | null }) {
  const { accounts, job, results, loadAccounts, startPublish, cancelPublish } = usePublishStore();

  // Form state
  const [filePath, setFilePath] = useState('');
  const [thumbnail, setThumbnail] = useState('');
  const [title, setTitle] = useState('');
  const [desc, setDesc] = useState('');
  const [tagsInput, setTagsInput] = useState('');
  const [scheduleType, setScheduleType] = useState<'immediate' | 'scheduled'>('immediate');
  const [scheduleAt, setScheduleAt] = useState('');

  // Multi-select: set of checked account IDs
  const [selectedAccountIds, setSelectedAccountIds] = useState<string[]>([]);

  // Per-account override state
  const [accountOverrides, setAccountOverrides] = useState<Record<string, AccountOverride>>({});
  const [expandedOverrides, setExpandedOverrides] = useState<Record<string, boolean>>({});
  const [validationError, setValidationError] = useState<string | null>(null);

  // Derive publishing state from store job — no local state needed
  const isPublishing = !!job;

  useEffect(() => {
    void loadAccounts();
  }, [loadAccounts]);

  const toggleAccount = (accId: string) => {
    setSelectedAccountIds((prev) => {
      const next = prev.includes(accId) ? prev.filter((id) => id !== accId) : [...prev, accId];
      // B站账号首次选中时自动展开 override 面板（tid 必填提示）
      if (!prev.includes(accId)) {
        const acc = accounts.find((a) => a.id === accId);
        if (acc?.platform === 'bilibili') {
          setExpandedOverrides((exPrev) => ({ ...exPrev, [accId]: true }));
        }
      }
      return next;
    });
    setValidationError(null);
  };

  const toggleOverrideExpanded = (accId: string) => {
    setExpandedOverrides((prev) => ({ ...prev, [accId]: !prev[accId] }));
  };

  const updateOverride = (accId: string, next: AccountOverride) => {
    setAccountOverrides((prev) => ({ ...prev, [accId]: next }));
  };

  const getOverride = (accId: string): AccountOverride =>
    accountOverrides[accId] ?? { title: '', desc: '', tagsInput: '', bilibiliTid: '' };

  const handlePickFile = async () => {
    const path = await window.electronAPI.selectMediaFile('video');
    if (path) setFilePath(path);
  };

  const handlePickThumbnail = async () => {
    const path = await window.electronAPI.selectMediaFile('image');
    if (path) setThumbnail(path);
  };

  const handlePublish = async () => {
    if (!filePath) return;
    if (selectedAccountIds.length === 0) return;

    setValidationError(null);

    const sharedTags = tagsInput
      .split(/[,，]/)
      .map((t) => t.trim())
      .filter(Boolean);

    // ── B站专项校验 ──────────────────────────────────────────────────────────
    for (const accountId of selectedAccountIds) {
      const acc = accounts.find((a) => a.id === accountId);
      if (!acc || acc.platform !== 'bilibili') continue;
      const ov = getOverride(accountId);

      // tid 必填
      const tid = parseInt(ov.bilibiliTid.trim(), 10);
      if (!ov.bilibiliTid.trim() || isNaN(tid) || tid <= 0) {
        const label = acc.accountName || accountId;
        setValidationError(`B站账号「${label}」必须填写分区 ID (tid)，请展开"文案覆盖"面板填写`);
        // 自动展开对应的 override 面板
        setExpandedOverrides((prev) => ({ ...prev, [accountId]: true }));
        return;
      }

      // desc 必填（共享或覆盖二者有其一即可）
      const effectiveDesc = ov.desc.trim() || desc.trim();
      if (!effectiveDesc) {
        const label = acc.accountName || accountId;
        setValidationError(`B站账号「${label}」必须填写描述（共享描述或该账号的覆盖描述）`);
        return;
      }
    }

    const shared = {
      title,
      desc,
      tags: sharedTags,
      thumbnail: thumbnail || undefined,
      scheduleAt:
        scheduleType === 'scheduled' && scheduleAt
          ? new Date(scheduleAt).getTime()
          : undefined,
    };

    // Build targets — only include overrides for filled fields
    const targets: PublishTarget[] = selectedAccountIds.map((accountId) => {
      const ov = getOverride(accountId);
      const acc = accounts.find((a) => a.id === accountId);
      const overrideTags = ov.tagsInput
        .split(/[,，]/)
        .map((t) => t.trim())
        .filter(Boolean);

      const overrides: PublishTarget['overrides'] = {};
      if (ov.title.trim()) overrides.title = ov.title.trim();
      if (ov.desc.trim()) overrides.desc = ov.desc.trim();
      if (overrideTags.length > 0) overrides.tags = overrideTags;

      const hasOverrides = Object.keys(overrides).length > 0;

      // B站：附加 bilibili.tid（校验已保证有效）
      const tid = acc?.platform === 'bilibili' ? parseInt(ov.bilibiliTid.trim(), 10) : NaN;
      const bilibiliExtra: PublishTarget['bilibili'] =
        acc?.platform === 'bilibili' && !isNaN(tid) ? { tid } : undefined;

      return {
        accountId,
        ...(hasOverrides ? { overrides } : {}),
        ...(bilibiliExtra ? { bilibili: bilibiliExtra } : {}),
      };
    });

    try {
      await startPublish(filePath, shared, targets, true);
    } catch {
      // errors are handled in the store (failTask)
    }
  };

  // Show results from last run (store clears job on completion but keeps results)
  const jobResults = results;
  const hasResults = Object.keys(jobResults).length > 0;
  const targetCount = selectedAccountIds.length;

  return (
    <div
      style={{
        height: '100%',
        overflow: 'auto',
        display: 'flex',
        flexDirection: 'column',
        gap: 0,
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: '20px 24px 16px',
          borderBottom: '1px solid var(--color-border-subtle, rgba(0,0,0,0.08))',
        }}
      >
        <h2
          style={{
            margin: 0,
            fontSize: 16,
            fontWeight: 600,
            color: 'var(--color-text-primary)',
          }}
        >
          发布视频
        </h2>
        {projectDir && (
          <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--color-text-tertiary)' }}>
            {projectDir}
          </p>
        )}
      </div>

      {/* Form */}
      <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>

        {/* Video file */}
        <Field label="视频文件" required>
          <div style={{ display: 'flex', gap: 8 }}>
            <Input
              value={filePath}
              onChange={(e) => setFilePath(e.target.value)}
              placeholder="选择 MP4 文件或直接输入路径…"
              leftIcon={<Film size={14} />}
              style={{ flex: 1 }}
            />
            <Button variant="outline" onClick={handlePickFile} style={{ flexShrink: 0 }}>
              选择…
            </Button>
          </div>
        </Field>

        {/* Thumbnail (optional) */}
        <Field label="缩略图（可选）">
          <div style={{ display: 'flex', gap: 8 }}>
            <Input
              value={thumbnail}
              onChange={(e) => setThumbnail(e.target.value)}
              placeholder="封面图路径（可选）"
              leftIcon={<ImageIcon size={14} />}
              style={{ flex: 1 }}
            />
            <Button variant="outline" onClick={handlePickThumbnail} style={{ flexShrink: 0 }}>
              选择…
            </Button>
          </div>
        </Field>

        {/* Title */}
        <Field label="共享标题" required>
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="视频标题（各账号共用，可在下方单独覆盖）"
          />
        </Field>

        {/* Description */}
        <Field label="共享描述">
          <textarea
            value={desc}
            onChange={(e) => setDesc(e.target.value)}
            placeholder="视频描述（可选，可在下方单独覆盖）"
            rows={3}
            style={{
              width: '100%',
              resize: 'vertical',
              padding: '8px 10px',
              fontSize: 13,
              border: '1px solid var(--color-border, rgba(0,0,0,0.15))',
              borderRadius: 6,
              background: 'var(--color-input-bg, var(--color-bg-elevated))',
              color: 'var(--color-text-primary)',
              fontFamily: 'inherit',
              outline: 'none',
              boxSizing: 'border-box',
            }}
          />
        </Field>

        {/* Tags */}
        <Field label="共享标签" hint="用逗号分隔多个标签，可在下方单独覆盖">
          <Input
            value={tagsInput}
            onChange={(e) => setTagsInput(e.target.value)}
            placeholder="标签1, 标签2, 标签3"
            leftIcon={<Tag size={14} />}
          />
        </Field>

        {/* Schedule */}
        <Field label="发布时间">
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 13 }}>
              <input
                type="radio"
                name="scheduleType"
                value="immediate"
                checked={scheduleType === 'immediate'}
                onChange={() => setScheduleType('immediate')}
              />
              立即发布
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 13 }}>
              <input
                type="radio"
                name="scheduleType"
                value="scheduled"
                checked={scheduleType === 'scheduled'}
                onChange={() => setScheduleType('scheduled')}
              />
              定时发布
            </label>
            {scheduleType === 'scheduled' && (
              <Input
                type="datetime-local"
                value={scheduleAt}
                onChange={(e) => setScheduleAt(e.target.value)}
                leftIcon={<Clock size={14} />}
                style={{ flex: 1 }}
              />
            )}
          </div>
        </Field>

        {/* Account multi-select */}
        <Field label="发布到" required>
          {accounts.length === 0 ? (
            <div
              style={{
                padding: '12px 14px',
                borderRadius: 6,
                background: 'var(--color-bg-elevated)',
                border: '1px solid var(--color-border, rgba(0,0,0,0.1))',
                fontSize: 13,
                color: 'var(--color-text-secondary)',
              }}
            >
              暂无账号，请前往「设置 → 发布账号」添加账号
            </div>
          ) : (
            <div
              style={{
                borderRadius: 6,
                border: '1px solid var(--color-border, rgba(0,0,0,0.1))',
                overflow: 'hidden',
              }}
            >
              {accounts.map((acc, idx) => {
                const isChecked = selectedAccountIds.includes(acc.id);
                const isValid = acc.status === 'valid';
                const isLast = idx === accounts.length - 1;
                return (
                  <div
                    key={acc.id}
                    style={{
                      borderBottom: isLast ? 'none' : '1px solid var(--color-border-subtle, rgba(0,0,0,0.06))',
                      background: isChecked
                        ? 'color-mix(in srgb, var(--color-system-blue) 6%, transparent)'
                        : 'transparent',
                      opacity: !isValid ? 0.55 : 1,
                    }}
                  >
                    {/* Account row */}
                    <label
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 10,
                        padding: '10px 14px',
                        cursor: isValid ? 'pointer' : 'not-allowed',
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        disabled={!isValid}
                        onChange={() => toggleAccount(acc.id)}
                        style={{ accentColor: 'var(--color-system-blue)', width: 14, height: 14 }}
                      />
                      <span style={{ flex: 1, fontSize: 13 }}>
                        <span style={{ fontWeight: 500 }}>
                          {PLATFORM_LABEL[acc.platform] ?? acc.platform}
                        </span>
                        {' '}
                        <span style={{ color: 'var(--color-text-secondary)' }}>{acc.accountName}</span>
                      </span>
                      <AccountStatusBadge status={acc.status} />
                      {!isValid && (
                        <span
                          style={{ fontSize: 11, color: 'var(--color-system-blue)', cursor: 'pointer' }}
                          title="前往设置重新登录"
                        >
                          去设置
                        </span>
                      )}
                    </label>

                    {/* Per-account override panel — only visible when checked */}
                    {isChecked && (
                      <div style={{ padding: '0 14px 10px' }}>
                        <AccountOverridePanel
                          accountId={acc.id}
                          platform={acc.platform}
                          override={getOverride(acc.id)}
                          expanded={!!expandedOverrides[acc.id]}
                          onToggle={() => toggleOverrideExpanded(acc.id)}
                          onChange={(next) => updateOverride(acc.id, next)}
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </Field>

        {/* Publish button */}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <Button
            variant="primary"
            onClick={handlePublish}
            disabled={isPublishing || !filePath || targetCount === 0}
            style={{ minWidth: 140 }}
          >
            {isPublishing ? (
              <>
                <Spinner size={14} />
                <span style={{ marginLeft: 6 }}>发布中…</span>
              </>
            ) : (
              <>
                <Upload size={14} style={{ marginRight: 6 }} />
                一键发布{targetCount > 0 ? ` (${targetCount} 个目标)` : ''}
              </>
            )}
          </Button>
          {isPublishing && (
            <Button variant="ghost" onClick={cancelPublish}>
              取消
            </Button>
          )}
          {targetCount === 0 && !isPublishing && (
            <span style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>
              请勾选至少一个账号
            </span>
          )}
          {validationError && !isPublishing && (
            <span
              style={{
                fontSize: 12,
                color: 'var(--color-error, #ef4444)',
                display: 'flex',
                alignItems: 'center',
                gap: 4,
              }}
            >
              <X size={12} />
              {validationError}
            </span>
          )}
        </div>

        {/* Per-target progress rows */}
        {hasResults && (
          <div
            style={{
              borderRadius: 8,
              border: '1px solid var(--color-border, rgba(0,0,0,0.1))',
              padding: '8px 14px',
              background: 'var(--color-bg-elevated)',
            }}
          >
            <div
              style={{
                fontSize: 12,
                fontWeight: 600,
                color: 'var(--color-text-secondary)',
                marginBottom: 4,
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
              }}
            >
              发布进度
            </div>
            {Object.entries(jobResults).map(([accountId, result]) => (
              <ResultRow
                key={accountId}
                accountId={accountId}
                state={result.state}
                percent={result.percent}
                message={result.message}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
