import type { ContentBlock } from '../../store/agent';
import { TextBlock } from './TextBlock';
import { ThinkingBlock } from './ThinkingBlock';
import { ToolCallBlock } from './ToolCallBlock';
import { PermissionBlock } from './PermissionBlock';
import { ErrorBlock } from './ErrorBlock';

export function AssistantMessage({ blocks }: { blocks: ContentBlock[] }) {
  return (
    <div className="flex flex-col gap-2 max-w-[95%]">
      {blocks.map((block, i) => {
        switch (block.type) {
          case 'text':
            return <TextBlock key={i} text={block.text} />;
          case 'thinking':
            return <ThinkingBlock key={i} text={block.text} />;
          case 'tool_call':
            return <ToolCallBlock key={i} block={block} />;
          case 'permission_request':
            return <PermissionBlock key={i} block={block} />;
          case 'error':
            return <ErrorBlock key={i} message={block.message} />;
          case 'file_changed':
          case 'turn_complete':
            return null;
          default:
            return null;
        }
      })}
    </div>
  );
}
