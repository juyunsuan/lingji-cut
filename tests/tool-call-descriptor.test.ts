import { describe, expect, it } from 'vitest';
import { describeToolCallBlock } from '../src/components/agent/tool-call-descriptor';

describe('describeToolCallBlock', () => {
  it('把 PI bash 工具调用描述为命令执行', () => {
    const descriptor = describeToolCallBlock({
      type: 'tool_call',
      title: 'bash',
      kind: 'execute',
      status: 'completed',
      rawInput: '{"command":"npm test -- --run tests/tool-call-block.test.tsx","timeout":120}',
      rawOutput: '12 tests passed\nexit code: 0',
    });

    expect(descriptor.label).toBe('执行命令');
    expect(descriptor.subject).toBe('npm test -- --run tests/tool-call-block.test.tsx');
    expect(descriptor.meta).toContain('timeout 120s');
    expect(descriptor.previewLabel).toBe('命令');
    expect(descriptor.sections).toEqual([{
      label: 'Shell',
      content: '$ npm test -- --run tests/tool-call-block.test.tsx\n12 tests passed\nexit code: 0',
      kind: 'shell',
    }]);
  });

  it('兼容 PI/ACP command 字段藏在嵌套 input 时的命令展示', () => {
    const descriptor = describeToolCallBlock({
      type: 'tool_call',
      title: 'bash',
      kind: 'execute',
      status: 'completed',
      rawInput: '{"input":{"command":"npm run lint"},"timeoutMs":30000}',
      rawOutput: 'lint ok',
    });

    expect(descriptor.label).toBe('执行命令');
    expect(descriptor.subject).toBe('npm run lint');
    expect(descriptor.sections).toEqual([{
      label: 'Shell',
      content: '$ npm run lint\nlint ok',
      kind: 'shell',
    }]);
  });

  it('即使工具名泛化，只要 rawInput 有 command 也展示完整命令', () => {
    const descriptor = describeToolCallBlock({
      type: 'tool_call',
      title: '工具调用',
      kind: '',
      status: 'completed',
      rawInput: '{"command":"wc -l original.md"}',
      rawOutput: '110 original.md',
    });

    expect(descriptor.label).toBe('执行命令');
    expect(descriptor.subject).toBe('wc -l original.md');
    expect(descriptor.sections).toEqual([{
      label: 'Shell',
      content: '$ wc -l original.md\n110 original.md',
      kind: 'shell',
    }]);
  });

  it('把 PI read 工具调用描述为读取目标文件和行号范围', () => {
    const descriptor = describeToolCallBlock({
      type: 'tool_call',
      title: 'read',
      kind: 'read',
      status: 'completed',
      rawInput: '{"path":"src/App.tsx","offset":10,"limit":20}',
      rawOutput: 'line 10\nline 11',
    });

    expect(descriptor.label).toBe('读取文件');
    expect(descriptor.subject).toBe('src/App.tsx:10-29');
    expect(descriptor.previewLabel).toBe('目标');
    expect(descriptor.sections[0]).toEqual({
      label: 'Target',
      content: 'src/App.tsx:10-29',
      kind: 'text',
    });
  });

  it('把 PI edit 工具调用描述为编辑文件并提取 diff 统计', () => {
    const descriptor = describeToolCallBlock({
      type: 'tool_call',
      title: 'edit',
      kind: 'edit',
      status: 'completed',
      rawInput: '{"path":"src/foo.ts","oldString":"old","newString":"new"}',
      rawOutput: 'Successfully replaced 1 block(s) in src/foo.ts.',
    });

    expect(descriptor.label).toBe('编辑文件');
    expect(descriptor.subject).toBe('src/foo.ts');
    expect(descriptor.meta).toContain('+1 / -1');
    expect(descriptor.sections).toContainEqual({
      label: 'Diff',
      content: '--- a/src/foo.ts\n+++ b/src/foo.ts\n@@ -1,1 +1,1 @@\n-old\n+new',
      kind: 'diff',
    });
    expect(descriptor.sections.some((section) => section.label === 'Target')).toBe(false);
  });

  it('兼容 PI edit 使用 target/old_text/new_text 字段，不把成功提示当 diff', () => {
    const descriptor = describeToolCallBlock({
      type: 'tool_call',
      title: 'edit',
      kind: 'edit',
      status: 'completed',
      rawInput: '{"target":"original.md","old_text":"原稿","new_text":"你好，原稿"}',
      rawOutput: 'Successfully replaced 1 block(s) in original.md.',
    });

    expect(descriptor.label).toBe('编辑文件');
    expect(descriptor.subject).toBe('original.md');
    expect(descriptor.sections).toEqual([{
      label: 'Diff',
      content: '--- a/original.md\n+++ b/original.md\n@@ -1,1 +1,1 @@\n-原稿\n+你好，原稿',
      kind: 'diff',
    }]);
    expect(descriptor.sections.some((section) => section.content.includes('Successfully replaced'))).toBe(false);
  });

  it('把 PI write 工具调用描述为写入文件并显示写入行数', () => {
    const descriptor = describeToolCallBlock({
      type: 'tool_call',
      title: 'write',
      kind: 'edit',
      status: 'completed',
      rawInput: '{"path":"README.md","content":"one\\ntwo\\nthree"}',
      rawOutput: 'Wrote README.md',
    });

    expect(descriptor.label).toBe('写入文件');
    expect(descriptor.subject).toBe('README.md');
    expect(descriptor.meta).toContain('3 lines');
    expect(descriptor.sections).toContainEqual({
      label: 'Content',
      content: 'one\ntwo\nthree',
      kind: 'code',
    });
  });

  it('即使工具名泛化，只要 rawInput 有 path/content 也展示写入内容', () => {
    const descriptor = describeToolCallBlock({
      type: 'tool_call',
      title: '工具调用',
      kind: '',
      status: 'completed',
      rawInput: '{"path":"original.md","content":"你好\\n原文"}',
      rawOutput: 'Successfully wrote 116 bytes to original.md',
    });

    expect(descriptor.label).toBe('写入文件');
    expect(descriptor.subject).toBe('original.md');
    expect(descriptor.sections).toContainEqual({
      label: 'Content',
      content: '你好\n原文',
      kind: 'code',
    });
  });

  it('把 PI grep 工具调用描述为搜索范围', () => {
    const descriptor = describeToolCallBlock({
      type: 'tool_call',
      title: 'grep',
      kind: 'read',
      status: 'completed',
      rawInput: '{"pattern":"tool_execution_start","path":"electron"}',
      rawOutput: 'electron/agent-runtime/parsers/pi-rpc.ts:129',
    });

    expect(descriptor.label).toBe('搜索');
    expect(descriptor.subject).toBe('/tool_execution_start/ in electron');
    expect(descriptor.previewLabel).toBe('目标');
  });
});
