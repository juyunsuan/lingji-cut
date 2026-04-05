import { useEffect, useState } from 'react';
import type { CoverCandidate } from '../types/ai';
import { toFileSrc } from '../lib/utils';
import { Button, Card, EmptyState, Field, Textarea } from '../ui';
import { AppIcon } from './AppIcon';
import styles from './AICoverPanel.module.css';

interface AICoverPanelProps {
  coverPrompts: string[];
  candidates: CoverCandidate[];
  isGenerating: boolean;
  isRegeneratingPrompt: boolean;
  selectedCandidateId?: string;
  onGenerateCovers: (prompts: string[]) => void;
  onRegeneratePrompt: () => void;
  onSelectCover: (candidateId: string) => void;
  onAddToTimeline: (candidateId: string) => void;
}

export function AICoverPanel({
  coverPrompts,
  candidates,
  isGenerating,
  isRegeneratingPrompt,
  selectedCandidateId,
  onGenerateCovers,
  onRegeneratePrompt,
  onSelectCover,
  onAddToTimeline,
}: AICoverPanelProps) {
  const [editablePrompt, setEditablePrompt] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const selectedCandidate =
    candidates.find((candidate) => candidate.id === selectedCandidateId) ??
    candidates.find((candidate) => candidate.selected) ??
    null;

  useEffect(() => {
    if (!isEditing) {
      setEditablePrompt(coverPrompts[0] ?? '');
    }
  }, [coverPrompts, isEditing]);

  if (coverPrompts.length === 0 && candidates.length === 0) {
    return (
      <EmptyState
        title="还没有封面提示词"
        description="先在「内容卡片」tab 中分析 SRT，AI 会自动生成封面提示词。"
      />
    );
  }

  const prompt = isEditing ? editablePrompt : (coverPrompts[0] ?? '');
  const prompts = prompt.trim() ? [prompt.trim()] : [];

  return (
    <div className={styles.root}>
      <div className={styles.sectionHeader}>
        <div className={styles.sectionTitleRow}>
          <div className={styles.sectionTitle}>提示词</div>
          {!isEditing ? (
            <Button
              onClick={() => setIsEditing(true)}
              variant="ghost"
              iconOnly
              title="编辑提示词"
              aria-label="编辑提示词"
            >
              <AppIcon name="pencil-line" size={14} />
            </Button>
          ) : null}
        </div>
      </div>

      <div className={styles.promptCard}>
        {isEditing ? (
          <Field label="封面提示词">
            <Textarea
              value={editablePrompt}
              onChange={(event) => setEditablePrompt(event.target.value)}
              rows={3}
            />
          </Field>
        ) : (
          <>
            <div className={styles.promptText}>{prompt}</div>
            <Button
              onClick={onRegeneratePrompt}
              disabled={isRegeneratingPrompt || isGenerating}
              loading={isRegeneratingPrompt}
              variant="accent"
              iconOnly
              className={styles.promptRegenerateButton}
              title="AI 重新生成提示词"
              aria-label="AI 重新生成提示词"
            >
              <AppIcon name="sparkles" size={14} />
            </Button>
          </>
        )}
      </div>

      <div className={styles.actions}>
        <Button
          onClick={() => {
            onGenerateCovers(prompts);
            setIsEditing(false);
          }}
          disabled={isGenerating}
          loading={isGenerating}
          variant="primary"
          size="sm"
          fullWidth
          leftIcon={isGenerating ? undefined : <AppIcon name="image" size={14} />}
        >
          {isGenerating ? '生成中...' : candidates.length > 0 ? '重新生成' : '生成封面'}
        </Button>
      </div>

      {candidates.length > 0 ? (
        <>
          <div className={styles.candidateHeader}>
            <div className={styles.sectionTitle}>候选封面</div>
            <div className={styles.hint}>可直接拖到时间轴，也可以一键设为整期背景。</div>
          </div>

          <div className={styles.grid}>
            {candidates.map((candidate) => {
              const isSelected = candidate.id === selectedCandidate?.id;

              return (
                <Card
                  key={candidate.id}
                  draggable={Boolean(candidate.imageUrl)}
                  onClick={() => onSelectCover(candidate.id)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      onSelectCover(candidate.id);
                    }
                  }}
                  onDragStart={(event) => {
                    if (!candidate.imageUrl) {
                      event.preventDefault();
                      return;
                    }

                    event.dataTransfer.effectAllowed = 'copy';
                    event.dataTransfer.setData(
                      'application/json',
                      JSON.stringify({
                        path: candidate.imageUrl,
                        type: 'image',
                        durationMs: 0,
                        overlayRole: 'default-background',
                      }),
                    );
                  }}
                  role="button"
                  tabIndex={0}
                  aria-pressed={isSelected}
                  data-draggable={Boolean(candidate.imageUrl)}
                  className={joinClassNames(
                    styles.candidateCard,
                    isSelected ? styles.candidateSelected : '',
                  )}
                >
                  {candidate.imageUrl ? (
                    <img
                      src={toFileSrc(candidate.imageUrl)}
                      alt=""
                      className={styles.candidateImage}
                    />
                  ) : (
                    <div className={styles.candidateFallback}>{candidate.error ?? '生成失败'}</div>
                  )}
                </Card>
              );
            })}
          </div>

          {selectedCandidate?.imageUrl ? (
            <Button
              onClick={() => onAddToTimeline(selectedCandidate.id)}
              variant="accent"
              size="sm"
              fullWidth
              leftIcon={<AppIcon name="send-horizontal" size={14} />}
            >
              设为整期背景
            </Button>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

function joinClassNames(...values: Array<string | undefined>): string {
  return values.filter(Boolean).join(' ');
}
