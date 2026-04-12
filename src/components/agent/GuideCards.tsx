import { useState } from 'react';
import { FileText, Sparkles, Search, ChevronDown, FileUp } from 'lucide-react';
import { useScriptStore } from '../../store/script';
import { useAgentStore } from '../../store/agent';
import type { FileEntry } from '../../lib/electron-api';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '../../ui';
import styles from './GuideCards.module.css';

// ─── 工具函数 ────────────────────────────────────────────

const BINARY_EXT = /\.(png|jpe?g|gif|bmp|ico|webp|svg|mp[34]|wav|ogg|avi|mov|mkv|webm|zip|tar|gz|rar|7z|pdf|doc[x]?|xls[x]?|ppt[x]?|exe|dll|so|dylib|woff2?|ttf|eot)$/i;

function flattenFiles(entries: FileEntry[], prefix = ''): string[] {
  const result: string[] = [];
  for (const entry of entries) {
    const path = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.type === 'directory' && entry.children) {
      result.push(...flattenFiles(entry.children, path));
    } else if (entry.type === 'file' && !BINARY_EXT.test(entry.name)) {
      result.push(path);
    }
  }
  return result;
}

/** 通过 store + agentAPI 直接发送 prompt */
function submitAgentPrompt(text: string) {
  const store = useAgentStore.getState();
  store.addUserMessage(text);
  store.startAssistantMessage();
  window.agentAPI?.sendPrompt([{ type: 'text', text }]);
}

// ─── 提示词模板 ─────────────────────────────────────────

const GENERATE_PROMPT = `请使用 MCP 工具完成写稿：

1. 先调用 lingji_get_project_context 获取可用模板列表和当前角色设定
2. 再调用 lingji_read_script 读取 original.md 原稿内容
3. 最后调用 lingji_write_script，传入合适的 templateCode 和原稿内容作为 rawText

注意：必须通过 lingji_write_script 工具生成，不要自己直接写内容或使用 Write 工具。
重要：请注意 lingji_get_project_context 返回的角色设定（selectedRole），写稿时请遵循该角色的播报风格。`;

const REVIEW_PROMPT = `请使用 MCP 工具完成审稿：

1. 先调用 lingji_read_script 读取当前脚本全文
2. 仔细分析脚本内容，找出以下问题：
   - 信息准确性与逻辑一致性
   - 语言流畅度与口播适配性
   - 用词准确性与错别字
   - 结构衔接与节奏
3. 必须调用 lingji_review_script 提交审阅批注，每个问题包含 line（行号）、text（问题描述）、severity（info/suggestion/warning/error）

注意：必须通过 lingji_review_script 工具提交批注，不要仅用文字回复审阅结果。`;

// ─── 单个卡片 ───────────────────────────────────────────

interface CardProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  disabled?: boolean;
  disabledHint?: string;
  onClick?: () => void;
  compact?: boolean;
  children?: React.ReactNode;
  renderButton?: (button: React.ReactElement) => React.ReactNode;
}

function ActionCard({
  icon,
  title,
  description,
  disabled,
  disabledHint,
  onClick,
  compact,
  children,
  renderButton,
}: CardProps) {
  if (compact) {
    const compactButton = (
      <button
        className={`${styles.compactCard} ${disabled ? styles.compactCardDisabled : ''}`}
        disabled={disabled}
        onClick={onClick}
        title={disabled ? disabledHint : description}
      >
        {icon}
        <span>{title}</span>
      </button>
    );

    return (
      <div className={styles.compactCardWrapper}>
        {renderButton ? renderButton(compactButton) : compactButton}
        {children}
      </div>
    );
  }

  const fullButton = (
    <button
      className={`${styles.card} ${disabled ? styles.cardDisabled : ''}`}
      disabled={disabled}
      onClick={onClick}
    >
      <div className={styles.cardIcon}>{icon}</div>
      <div className={styles.cardBody}>
        <div className={styles.cardTitle}>{title}</div>
        <div className={styles.cardDesc}>
          {disabled && disabledHint ? disabledHint : description}
        </div>
      </div>
      {!disabled && <ChevronDown size={14} className={styles.cardArrow} />}
    </button>
  );

  return (
    <div className={styles.cardWrapper}>
      {renderButton ? renderButton(fullButton) : fullButton}
      {children}
    </div>
  );
}

// ─── 主组件 ─────────────────────────────────────────────

export function GuideCards({ compact = false }: { compact?: boolean }) {
  const {
    workspaceFiles,
    fileEntries,
    projectDir,
    agentOperation,
    workbenchCallbacks,
    startAgentOperation,
    setReviewState,
  } = useScriptStore();
  const status = useAgentStore((s) => s.status);

  const [showFilePicker, setShowFilePicker] = useState(false);

  const agentConnected = status === 'connected';
  const isOperating = agentOperation.isOperating;
  const hasOriginal = workspaceFiles.hasOriginalFile;
  const hasScript = workspaceFiles.hasScriptFile;
  const hasProjectDir = Boolean(projectDir);

  const textFiles = flattenFiles(fileEntries).filter(
    (f) => f !== 'original.md' && f !== 'script.md' && f !== 'script-state.json',
  );

  const handleImportOriginal = (relativePath: string) => {
    workbenchCallbacks.importFileAsOriginal?.(relativePath);
  };

  const handleGenerate = () => {
    if (!agentConnected || isOperating) return;
    startAgentOperation('generate');
    submitAgentPrompt(GENERATE_PROMPT);
  };

  const handleReview = () => {
    if (!agentConnected || isOperating) return;
    setReviewState('pending');
    startAgentOperation('review');
    submitAgentPrompt(REVIEW_PROMPT);
  };

  // 生成口播稿 disabled 条件
  const generateDisabled = !hasOriginal || !agentConnected || isOperating;
  const generateHint = !hasProjectDir
    ? '请先选择工作目录'
    : !hasOriginal
      ? '请先导入原稿'
      : !agentConnected
        ? 'AI 助手连接中...'
        : isOperating
          ? 'AI 正在处理中...'
          : '';

  // 审稿 disabled 条件
  const reviewDisabled = !hasScript || !agentConnected || isOperating;
  const reviewHint = !hasProjectDir
    ? '请先选择工作目录'
    : !hasScript
      ? '请先生成口播稿'
      : !agentConnected
        ? 'AI 助手连接中...'
        : isOperating
          ? 'AI 正在处理中...'
          : '';

  // 导入原稿 disabled 条件
  const importDisabled = !hasProjectDir || isOperating;
  const importHint = !hasProjectDir ? '请先选择工作目录' : '';

  return (
    <div className={compact ? styles.compactContainer : styles.container}>
      {!compact && (
        <div className={styles.header}>
          <div className={styles.headerTitle}>脚本工作台 AI 助手</div>
          <div className={styles.headerDesc}>选择操作快速开始</div>
        </div>
      )}

      <div className={compact ? styles.compactCards : styles.cards}>
        {/* 导入原稿 */}
        <DropdownMenu
          open={showFilePicker}
          onOpenChange={(open) => {
            if (importDisabled) {
              setShowFilePicker(false);
              return;
            }
            setShowFilePicker(open);
          }}
        >
          <ActionCard
            icon={<FileUp size={compact ? 13 : 18} />}
            title="导入原稿"
            description="选择工作目录中的文件作为原稿"
            disabled={importDisabled}
            disabledHint={importHint}
            compact={compact}
            renderButton={(button) => (
              <DropdownMenuTrigger asChild>{button}</DropdownMenuTrigger>
            )}
          >
            <DropdownMenuContent
              align="start"
              side="bottom"
              sideOffset={6}
              className={`w-[320px] p-0 ${styles.dropdown}`}
            >
              {textFiles.length === 0 ? (
                <div className={styles.dropdownEmpty}>工作目录下暂无文本文件</div>
              ) : (
                <>
                  <DropdownMenuLabel className={styles.dropdownTitle}>选择文件作为原稿</DropdownMenuLabel>
                  {textFiles.map((file) => (
                    <DropdownMenuItem
                      key={file}
                      className={styles.dropdownItem}
                      onSelect={() => {
                        handleImportOriginal(file);
                      }}
                    >
                      <FileText size={13} />
                      <span>{file}</span>
                    </DropdownMenuItem>
                  ))}
                </>
              )}
            </DropdownMenuContent>
          </ActionCard>
        </DropdownMenu>

        {/* 生成口播稿 */}
        <ActionCard
          icon={<Sparkles size={compact ? 13 : 18} />}
          title="生成口播稿"
          description="AI 根据原稿自动生成口播稿"
          disabled={generateDisabled}
          disabledHint={generateHint}
          onClick={handleGenerate}
          compact={compact}
        />

        {/* AI 审稿 */}
        <ActionCard
          icon={<Search size={compact ? 13 : 18} />}
          title="AI 审稿"
          description="审查口播稿质量并给出修改建议"
          disabled={reviewDisabled}
          disabledHint={reviewHint}
          onClick={handleReview}
          compact={compact}
        />
      </div>
    </div>
  );
}
