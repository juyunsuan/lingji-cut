import { useEffect, useState } from 'react';
import type { CoverCandidate } from '../types/ai';
import { toFileSrc } from '../lib/utils';
import { AppIcon } from './AppIcon';

interface AICoverPanelProps {
  coverPrompts: string[];
  candidates: CoverCandidate[];
  isGenerating: boolean;
  selectedCandidateId?: string;
  onGenerateCovers: (prompts: string[]) => void;
  onSelectCover: (candidateId: string) => void;
  onAddToTimeline: (candidateId: string) => void;
}

export function AICoverPanel({
  coverPrompts,
  candidates,
  isGenerating,
  selectedCandidateId,
  onGenerateCovers,
  onSelectCover,
  onAddToTimeline,
}: AICoverPanelProps) {
  const [editablePrompts, setEditablePrompts] = useState<string[]>([]);
  const [isEditing, setIsEditing] = useState(false);
  const selectedCandidate =
    candidates.find((candidate) => candidate.id === selectedCandidateId) ??
    candidates.find((candidate) => candidate.selected) ??
    null;

  useEffect(() => {
    if (!isEditing) {
      setEditablePrompts(coverPrompts);
    }
  }, [coverPrompts, isEditing]);

  if (coverPrompts.length === 0 && candidates.length === 0) {
    return (
      <div style={emptyStateStyle}>
        先在「内容卡片」tab 中分析 SRT，AI 会自动生成封面提示词。
      </div>
    );
  }

  const prompts = isEditing ? editablePrompts : coverPrompts;

  return (
    <div style={containerStyle}>
      <div style={sectionHeaderStyle}>
        <div style={sectionTitleRowStyle}>
          <div style={sectionTitleStyle}>提示词</div>
          {!isEditing ? (
            <button
              type="button"
              onClick={() => setIsEditing(true)}
              style={iconButtonStyle}
              title="编辑提示词"
              aria-label="编辑提示词"
            >
              <AppIcon name="pencil-line" size={14} />
            </button>
          ) : null}
        </div>
      </div>
      {prompts.map((prompt, index) => (
        <div key={`${index}-${prompt.slice(0, 12)}`} style={promptItemStyle}>
          {isEditing ? (
            <textarea
              value={editablePrompts[index] ?? ''}
              onChange={(event) =>
                setEditablePrompts((current) =>
                  current.map((item, itemIndex) =>
                    itemIndex === index ? event.target.value : item,
                  ),
                )
              }
              rows={3}
              style={textareaStyle}
            />
          ) : (
            <div style={promptTextStyle}>{prompt}</div>
          )}
        </div>
      ))}

      <div style={buttonRowStyle}>
        <button
          type="button"
          onClick={() => {
            onGenerateCovers(prompts);
            setIsEditing(false);
          }}
          disabled={isGenerating}
          style={{
            ...primaryButtonStyle,
            opacity: isGenerating ? 0.6 : 1,
            cursor: isGenerating ? 'wait' : 'pointer',
          }}
        >
          <span style={buttonContentStyle}>
            <AppIcon name="image" size={14} />
            {isGenerating ? '生成中...' : candidates.length > 0 ? '重新生成' : '生成封面'}
          </span>
        </button>
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
            <button
              type="button"
              onClick={() => onAddToTimeline(selectedCandidate.id)}
              style={secondaryButtonStyle}
            >
              <span style={buttonContentStyle}>
                <AppIcon name="send-horizontal" size={14} />
                设为整期背景
              </span>
            </button>
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

const emptyStateStyle = {
  padding: 16,
  color: '#64748b',
  fontSize: 12,
  textAlign: 'center' as const,
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
  padding: 8,
  borderRadius: 8,
  background: 'rgba(255,255,255,0.03)',
  color: '#94a3b8',
  fontSize: 11,
  lineHeight: 1.5,
};

const textareaStyle = {
  width: '100%',
  padding: 8,
  borderRadius: 8,
  border: '1px solid rgba(255,255,255,0.08)',
  background: 'rgba(255,255,255,0.04)',
  color: '#e2e8f0',
  fontSize: 11,
  boxSizing: 'border-box' as const,
  outline: 'none',
  resize: 'none' as const,
  lineHeight: 1.5,
};

const buttonRowStyle = {
  display: 'flex',
  gap: 8,
};

const iconButtonStyle = {
  width: 28,
  height: 28,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  borderRadius: 8,
  border: '1px solid rgba(255,255,255,0.08)',
  background: 'transparent',
  color: '#94a3b8',
  cursor: 'pointer',
};

const primaryButtonStyle = {
  width: '100%',
  height: 32,
  borderRadius: 8,
  border: 'none',
  background: 'linear-gradient(90deg, #f59e0b, #f97316)',
  color: '#241200',
  fontSize: 11,
  fontWeight: 700,
};

const secondaryButtonStyle = {
  width: '100%',
  height: 32,
  borderRadius: 8,
  border: '1px solid rgba(99,102,241,0.36)',
  background: 'rgba(99,102,241,0.12)',
  color: '#e8edff',
  fontSize: 11,
  fontWeight: 700,
  cursor: 'pointer',
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
