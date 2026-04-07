import { useCallback, useRef, useState, useEffect } from 'react';
import { Send, Square, Paperclip, Slash, X } from 'lucide-react';
import { useAgentStore } from '../../store/agent';
import { SlashCommandMenu, extractSlashPrefix } from './SlashCommandMenu';
import { Button, Badge, Select } from '../../ui';
import type { AvailableCommand, PromptInputBlock } from '../../../electron/acp/types';

// ─── 附件类型 ─────────────────────────────────────────────

interface Attachment {
  id: string;
  name: string;
  type: 'text' | 'image';
  block: PromptInputBlock;
}

// ─── 附件预览 ─────────────────────────────────────────────

function AttachmentPill({
  attachment,
  onRemove,
}: {
  attachment: Attachment;
  onRemove: (id: string) => void;
}) {
  return (
    <Badge variant="default" size="sm" className="inline-flex items-center gap-1 max-w-[180px]">
      <span className="overflow-hidden text-ellipsis whitespace-nowrap">
        {attachment.name}
      </span>
      <button
        type="button"
        onClick={() => onRemove(attachment.id)}
        className="bg-transparent border-none cursor-pointer text-mac-text-muted/40 p-0 flex shrink-0"
      >
        <X size={10} />
      </button>
    </Badge>
  );
}

// ─── 主组件 ────────────────────────────────────────────────

export function InputBar() {
  const [text, setText] = useState('');
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [commandMenuIndex, setCommandMenuIndex] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const status = useAgentStore((s) => s.status);
  const configOptions = useAgentStore((s) => s.configOptions);
  const availableCommands = useAgentStore((s) => s.availableCommands);

  const isPrompting = status === 'prompting';
  const isConnected = status === 'connected' || status === 'prompting';

  // 斜杠命令状态
  const slashPrefix = extractSlashPrefix(text);
  const showCommandMenu = slashPrefix !== null && availableCommands.length > 0;
  const filteredCommands = showCommandMenu
    ? availableCommands.filter((c) => c.name.toLowerCase().includes(slashPrefix.toLowerCase()))
    : [];

  // 找到模型和模式配置
  const modelConfig = configOptions.find((c) => c.id === 'model' || c.category === 'model');
  const modeConfig = configOptions.find((c) => c.id === 'mode' || c.category === 'mode');

  // 自动调整 textarea 高度
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 150) + 'px';
  }, [text]);

  const handleSend = useCallback(() => {
    const trimmed = text.trim();
    if (!trimmed && attachments.length === 0) return;
    if (!isConnected) return;

    const contents: PromptInputBlock[] = [];
    if (trimmed) contents.push({ type: 'text', text: trimmed });
    for (const a of attachments) contents.push(a.block);

    useAgentStore.getState().addUserMessage(trimmed || '(附件)', contents.length > 1 ? contents : undefined);
    useAgentStore.getState().startAssistantMessage();
    window.agentAPI?.sendPrompt(contents);
    setText('');
    setAttachments([]);
  }, [text, attachments, isConnected]);

  const handleCancel = useCallback(() => {
    window.agentAPI?.cancelTurn();
  }, []);

  const handleCommandSelect = useCallback((cmd: AvailableCommand) => {
    setText(`/${cmd.name} `);
    setCommandMenuIndex(0);
    textareaRef.current?.focus();
  }, []);

  const handleConfigChange = useCallback((configId: string, value: string) => {
    useAgentStore.getState().updateConfigValue(configId, value);
    window.agentAPI?.setConfigOption(configId, value);
  }, []);

  const handleFileSelect = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileInput = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files?.length) return;

    for (const file of Array.from(files)) {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

      if (file.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onload = () => {
          const data = (reader.result as string).split(',')[1];
          setAttachments((prev) => [
            ...prev,
            { id, name: file.name, type: 'image', block: { type: 'image', data, mimeType: file.type } },
          ]);
        };
        reader.readAsDataURL(file);
      } else {
        const content = await file.text();
        setAttachments((prev) => [
          ...prev,
          { id, name: file.name, type: 'text', block: { type: 'resource', uri: `file://${file.name}`, mimeType: file.type, text: content } },
        ]);
      }
    }
    e.target.value = '';
  }, []);

  const removeAttachment = useCallback((id: string) => {
    setAttachments((prev) => prev.filter((a) => a.id !== id));
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (showCommandMenu && filteredCommands.length > 0) {
        if (e.key === 'ArrowUp') {
          e.preventDefault();
          setCommandMenuIndex((i) => (i <= 0 ? filteredCommands.length - 1 : i - 1));
          return;
        }
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          setCommandMenuIndex((i) => (i >= filteredCommands.length - 1 ? 0 : i + 1));
          return;
        }
        if (e.key === 'Enter' || e.key === 'Tab') {
          e.preventDefault();
          handleCommandSelect(filteredCommands[commandMenuIndex]);
          return;
        }
        if (e.key === 'Escape') {
          e.preventDefault();
          setText('');
          return;
        }
      }

      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [showCommandMenu, filteredCommands, commandMenuIndex, handleCommandSelect, handleSend],
  );

  useEffect(() => {
    setCommandMenuIndex(0);
  }, [text]);

  return (
    <div className="px-3 pt-2 pb-3 border-t border-mac-separator shrink-0 flex flex-col gap-1.5">
      {/* 附件预览 */}
      {attachments.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {attachments.map((a) => (
            <AttachmentPill key={a.id} attachment={a} onRemove={removeAttachment} />
          ))}
        </div>
      )}

      {/* 输入区 */}
      <div className="relative">
        {showCommandMenu && filteredCommands.length > 0 && (
          <SlashCommandMenu
            commands={availableCommands}
            filter={slashPrefix}
            selectedIndex={commandMenuIndex}
            onSelect={handleCommandSelect}
          />
        )}

        <textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={isConnected ? '输入消息… (/ 查看命令)' : '未连接'}
          disabled={!isConnected}
          rows={1}
          className="w-full resize-none bg-mac-elevated text-foreground border border-mac-border rounded-[10px] px-3 py-2.5 text-[13px] leading-normal max-h-[150px] overflow-auto outline-none focus:border-mac-blue/50 transition-colors"
        />
      </div>

      {/* 底部工具栏 */}
      <div className="flex items-center justify-between gap-1.5">
        {/* 左侧：附件 + 命令 + 配置选择器 */}
        <div className="flex items-center gap-1.5 overflow-hidden">
          <Button
            variant="ghost"
            size="sm"
            iconOnly
            onClick={handleFileSelect}
            disabled={!isConnected}
            title="添加附件"
          >
            <Paperclip size={14} />
          </Button>

          {availableCommands.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              iconOnly
              onClick={() => {
                setText('/');
                textareaRef.current?.focus();
              }}
              disabled={!isConnected}
              title="命令"
            >
              <Slash size={14} />
            </Button>
          )}

          {/* 模式选择器 */}
          {modeConfig && modeConfig.options.length > 1 && (
            <Select
              value={modeConfig.currentValue}
              onChange={(e) => handleConfigChange(modeConfig.id, e.target.value)}
              options={modeConfig.options.map((o) => ({ value: o.value, label: o.name }))}
              className="max-w-[140px]"
              controlClassName="!h-[22px] !text-[11px] !rounded-md !px-2"
            />
          )}

          {/* 模型选择器 */}
          {modelConfig && modelConfig.options.length > 1 && (
            <Select
              value={modelConfig.currentValue}
              onChange={(e) => handleConfigChange(modelConfig.id, e.target.value)}
              options={modelConfig.options.map((o) => ({ value: o.value, label: o.name }))}
              className="max-w-[140px]"
              controlClassName="!h-[22px] !text-[11px] !rounded-md !px-2"
            />
          )}
        </div>

        {/* 右侧：发送/取消 */}
        <div className="flex items-center gap-1.5 shrink-0">
          {isPrompting ? (
            <Button variant="destructive" onClick={handleCancel} leftIcon={<Square size={12} />}>
              取消
            </Button>
          ) : (
            <Button
              variant="primary"
              onClick={handleSend}
              disabled={(!text.trim() && attachments.length === 0) || !isConnected}
              leftIcon={<Send size={12} />}
            >
              发送
            </Button>
          )}
        </div>
      </div>

      {/* 隐藏的文件选择器 */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={handleFileInput}
      />
    </div>
  );
}
