import { useEffect, useState } from 'react';
import { Upload, Film, Image as ImageIcon, Tag, Clock, Check, X, Loader2 } from 'lucide-react';
import { Button, Field, Input } from '../../ui';
import { Spinner } from '../../ui/primitives/Spinner';
import { usePublishStore } from '../../store/publish';
import type { PublishAccount } from '../../lib/electron-api';

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
  const [selectedAccountId, setSelectedAccountId] = useState('');
  const [isPublishing, setIsPublishing] = useState(false);

  useEffect(() => {
    void loadAccounts();
  }, [loadAccounts]);

  // Auto-select the first valid account
  useEffect(() => {
    if (!selectedAccountId && accounts.length > 0) {
      const first = accounts.find((a) => a.status === 'valid') ?? accounts[0];
      setSelectedAccountId(first.id);
    }
  }, [accounts, selectedAccountId]);

  // Track job running state
  useEffect(() => {
    if (job) {
      setIsPublishing(true);
    } else {
      setIsPublishing(false);
    }
  }, [job]);

  const handlePickFile = async () => {
    const path = await window.electronAPI.selectMediaFile('video');
    if (path) setFilePath(path);
  };

  const handlePickThumbnail = async () => {
    const path = await window.electronAPI.selectMediaFile('video');
    // Reuse media file picker; user may select an image if filter allows
    // (for now uses video filter but accepts any path typed in)
    if (path) setThumbnail(path);
  };

  const handlePublish = async () => {
    if (!filePath) return;
    if (!selectedAccountId) return;

    const tags = tagsInput
      .split(/[,，]/)
      .map((t) => t.trim())
      .filter(Boolean);

    const shared = {
      title,
      desc,
      tags,
      thumbnail: thumbnail || undefined,
      scheduleAt:
        scheduleType === 'scheduled' && scheduleAt
          ? new Date(scheduleAt).getTime()
          : undefined,
    };

    setIsPublishing(true);
    try {
      await startPublish(filePath, shared, [{ accountId: selectedAccountId }], true);
    } finally {
      setIsPublishing(false);
    }
  };

  const jobResults = job ? results : {};
  const hasResults = Object.keys(jobResults).length > 0;

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
        <Field label="标题" required>
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="视频标题"
          />
        </Field>

        {/* Description */}
        <Field label="描述">
          <textarea
            value={desc}
            onChange={(e) => setDesc(e.target.value)}
            placeholder="视频描述（可选）"
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
        <Field label="标签" hint="用逗号分隔多个标签">
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

        {/* Account selection */}
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
              {accounts.map((acc) => (
                <label
                  key={acc.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '10px 14px',
                    cursor: acc.status === 'valid' ? 'pointer' : 'not-allowed',
                    background:
                      selectedAccountId === acc.id
                        ? 'color-mix(in srgb, var(--color-system-blue) 8%, transparent)'
                        : 'transparent',
                    borderBottom: '1px solid var(--color-border-subtle, rgba(0,0,0,0.06))',
                    opacity: acc.status !== 'valid' ? 0.5 : 1,
                  }}
                >
                  <input
                    type="radio"
                    name="account"
                    value={acc.id}
                    checked={selectedAccountId === acc.id}
                    disabled={acc.status !== 'valid'}
                    onChange={() => setSelectedAccountId(acc.id)}
                    style={{ accentColor: 'var(--color-system-blue)' }}
                  />
                  <span style={{ flex: 1, fontSize: 13 }}>
                    <span style={{ fontWeight: 500 }}>
                      {PLATFORM_LABEL[acc.platform] ?? acc.platform}
                    </span>
                    {' '}
                    <span style={{ color: 'var(--color-text-secondary)' }}>{acc.accountName}</span>
                  </span>
                  <AccountStatusBadge status={acc.status} />
                  {acc.status !== 'valid' && (
                    <span
                      style={{ fontSize: 11, color: 'var(--color-system-blue)', cursor: 'pointer' }}
                      title="前往设置重新登录"
                    >
                      去设置
                    </span>
                  )}
                </label>
              ))}
            </div>
          )}
        </Field>

        {/* Publish button */}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <Button
            variant="primary"
            onClick={handlePublish}
            disabled={isPublishing || !filePath || !selectedAccountId}
            style={{ minWidth: 120 }}
          >
            {isPublishing ? (
              <>
                <Spinner size={14} />
                <span style={{ marginLeft: 6 }}>发布中…</span>
              </>
            ) : (
              <>
                <Upload size={14} style={{ marginRight: 6 }} />
                一键发布
              </>
            )}
          </Button>
          {isPublishing && (
            <Button variant="ghost" onClick={cancelPublish}>
              取消
            </Button>
          )}
        </div>

        {/* Progress rows */}
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
