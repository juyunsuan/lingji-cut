import { useEffect, useState } from 'react';
import type { CoverCandidate } from '../types/ai';
import { toFileSrc } from '../lib/utils';
import { AppIcon } from './AppIcon';
import { Button, EmptyState, Field, IconButton, Textarea } from '../ui/primitives';

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
    <div style={containerStyle}>
      <div style={sectionHeaderStyle}>
        <div style={sectionTitleRowStyle}>
          <div style={sectionTitleStyle}>提示词</div>
          {!isEditing ? (
            <IconButton
              onClick={() => setIsEditing(true)}
              variant="ghost"
              size="sm"
              title="编辑提示词"
              aria-label="编辑提示词"
            >
              <AppIcon name="pencil-line" size={14} />
            </IconButton>
          ) : null}
        </div>
      </div>
      <div style={promptItemStyle}>
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
            <div style={promptTextStyle}>{prompt}</div>
            <IconButton
              onClick={onRegeneratePrompt}
              disabled={isRegeneratingPrompt || isGenerating}
              loading={isRegeneratingPrompt}
              variant="brand"
              size="sm"
              style={promptRegenerateButtonStyle}
              title="AI 重新生成提示词"
              aria-label="AI 重新生成提示词"
            >
              <AppIcon name="sparkles" size={14} />
            </IconButton>
          </>
        )}
      </div>

      <div style={buttonRowStyle}>
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
        >
          <span style={buttonContentStyle}>
            <AppIcon name="image" size={14} />
            {isGenerating ? '生成中...' : candidates.length > 0 ? '重新生成' : '生成封面'}
          </span>
        </Button>
      </div>

      {candidates.length > 0 ? (
        <>
          <div style={{ ...sectionTitleStyle, marginTop: 8 }}>候选封面</div>
          <div style={hintTextStyle}>可直接拖到时间轴，也可以一键设为整期背景。</div>
          <div style={gridStyle}>
            {candidates.map((candidate) => (
              <div
                key={candidate.id}
                draggable={Boolean(candidate.imageUrl)}
                onClick={() => onSelectCover(candidate.id)}
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
                style={{
                  ...candidateStyle,
                  border: candidate.selected
                    ? '2px solid #6366f1'
                    : '1px solid rgba(255,255,255,0.08)',
                  cursor: candidate.imageUrl ? 'grab' : 'pointer',
                }}
              >
                {candidate.imageUrl ? (
                  <img
                    src={toFileSrc(candidate.imageUrl)}
                    alt=""
                    style={candidateImageStyle}
                  />
                ) : (
                  <div style={candidateFallbackStyle}>{candidate.error ?? '生成失败'}</div>
                )}
              </div>
            ))}
          </div>
          {selectedCandidate?.imageUrl ? (
            <Button
              onClick={() => onAddToTimeline(selectedCandidate.id)}
              variant="tint"
              size="sm"
              fullWidth
            >
              <span style={buttonContentStyle}>
                <AppIcon name="send-horizontal" size={14} />
                设为整期背景
              </span>
            </Button>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

const containerStyle = {
  display: 'flex',
  flexDirection: 'column' as const,
  gap: 10,
};

const sectionHeaderStyle = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
};

const sectionTitleRowStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
};

const sectionTitleStyle = {
  fontSize: 11,
  color: '#91a2bc',
  letterSpacing: '0.1em',
};

const hintTextStyle = {
  marginTop: -2,
  color: '#71839a',
  fontSize: 11,
  lineHeight: 1.5,
};

const promptItemStyle = {
  position: 'relative' as const,
};

const promptTextStyle = {
  padding: '8px 40px 8px 8px',
  borderRadius: 8,
  background: 'rgba(255,255,255,0.03)',
  color: '#94a3b8',
  fontSize: 11,
  lineHeight: 1.5,
};

const promptRegenerateButtonStyle = {
  position: 'absolute' as const,
  right: 8,
  bottom: 8,
  width: 24,
  height: 24,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  borderRadius: 7,
  border: '1px solid rgba(255,255,255,0.1)',
  background: 'rgba(99,102,241,0.16)',
  color: '#eef2ff',
};

const buttonRowStyle = {
  display: 'flex',
  gap: 8,
};

const buttonContentStyle = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
};

const gridStyle = {
  display: 'grid',
  gridTemplateColumns: '1fr 1fr',
  gap: 8,
};

const candidateStyle = {
  aspectRatio: '16 / 9',
  borderRadius: 8,
  overflow: 'hidden',
  cursor: 'pointer',
  background: '#1e293b',
};

const candidateImageStyle = {
  width: '100%',
  height: '100%',
  objectFit: 'cover' as const,
};

const candidateFallbackStyle = {
  width: '100%',
  height: '100%',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  color: '#64748b',
  fontSize: 10,
  textAlign: 'center' as const,
  padding: 8,
  boxSizing: 'border-box' as const,
};
