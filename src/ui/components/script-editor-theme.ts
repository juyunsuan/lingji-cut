import { EditorView } from '@codemirror/view';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { tags } from '@lezer/highlight';

const theme = EditorView.theme(
  {
    '&': {
      backgroundColor: '#1C1C1E',
      color: '#E5E5E7',
      height: '100%',
    },
    '.cm-content': {
      fontFamily: '"SF Mono", Menlo, monospace',
      fontSize: '13px',
      lineHeight: '1.6',
      padding: '12px 16px',
      caretColor: '#0A84FF',
    },
    '.cm-cursor': { borderLeftColor: '#0A84FF' },
    '.cm-gutters': {
      backgroundColor: '#1C1C1E',
      color: '#48484A',
      border: 'none',
    },
    '.cm-activeLine': { backgroundColor: '#2C2C2E50' },
    '.cm-selectionBackground': { backgroundColor: '#0A84FF30 !important' },
    '&.cm-focused .cm-selectionBackground': {
      backgroundColor: '#0A84FF40 !important',
    },
    '.cm-placeholder': { color: '#48484A' },
    // annotation decoration styles
    '.cm-annotation-error': {
      backgroundColor: '#FF453A30',
      borderBottom: '2px wavy #FF453A',
      borderRadius: '2px',
      cursor: 'pointer',
    },
    '.cm-annotation-warning': {
      backgroundColor: '#FF9F0A30',
      borderBottom: '2px wavy #FF9F0A',
      borderRadius: '2px',
      cursor: 'pointer',
    },
    '.cm-annotation-info': {
      backgroundColor: '#0A84FF30',
      borderBottom: '2px wavy #0A84FF',
      borderRadius: '2px',
      cursor: 'pointer',
    },
    // hover tooltip
    '.cm-tooltip': {
      background: 'transparent',
      border: 'none',
      padding: '0',
    },
    // MCP 变更行高亮
    '.cm-mcp-change-highlight': {
      backgroundColor: 'rgba(50, 215, 75, 0.15)',
      transition: 'background-color 0.5s ease-out',
    },
    '.cm-annotation-tooltip': {
      backgroundColor: '#2C2C2E',
      border: '1px solid #48484A',
      borderRadius: '8px',
      padding: '8px 12px',
      fontSize: '12px',
      color: '#EBEBF599',
      maxWidth: '300px',
      lineHeight: '1.4',
      boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
    },

    // --- 浮动搜索面板（macOS 暗色风格） ---

    // 面板容器：透明化，不占据编辑器空间
    '& .cm-panels': {
      backgroundColor: 'transparent',
      border: 'none',
    },
    '& .cm-panels.cm-panels-top': {
      borderBottom: 'none',
    },

    // 浮动搜索面板主体
    '.cm-search-float': {
      position: 'absolute',
      top: '6px',
      right: '20px',
      zIndex: '20',
      width: '380px',
      maxWidth: 'calc(100% - 40px)',
      backgroundColor: '#2C2C2E',
      border: '1px solid #48484A',
      borderRadius: '8px',
      boxShadow: '0 6px 20px rgba(0, 0, 0, 0.45)',
      padding: '6px 6px 6px 4px',
      display: 'flex',
      flexDirection: 'column',
      gap: '4px',
      fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "PingFang SC", sans-serif',
      fontSize: '12px',
      pointerEvents: 'auto',
    },

    // 行布局
    '.cm-sf-row': {
      display: 'flex',
      alignItems: 'center',
      gap: '3px',
    },

    // 展开/收起替换按钮
    '.cm-sf-toggle': {
      width: '20px',
      height: '22px',
      flexShrink: '0',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'transparent',
      border: 'none',
      color: '#EBEBF560',
      cursor: 'pointer',
      borderRadius: '4px',
      padding: '0',
    },
    '.cm-sf-toggle:hover': {
      color: '#EBEBF5CC',
      backgroundColor: '#48484A',
    },

    // 输入框外壳
    '.cm-sf-field-wrap': {
      display: 'flex',
      alignItems: 'center',
      flex: '1',
      minWidth: '0',
      backgroundColor: '#1C1C1E',
      border: '1px solid #48484A',
      borderRadius: '5px',
      overflow: 'hidden',
    },
    '.cm-sf-field-wrap:focus-within': {
      borderColor: '#0A84FF',
    },

    // 搜索/替换输入框
    '.cm-sf-input': {
      flex: '1',
      minWidth: '0',
      background: 'transparent',
      border: 'none',
      color: '#E5E5E7',
      padding: '4px 6px',
      fontSize: '12px',
      fontFamily: '"SF Mono", Menlo, monospace',
      outline: 'none',
    },
    '.cm-sf-input::placeholder': {
      color: '#636366',
    },

    // 选项切换按钮（Aa）
    '.cm-sf-opt': {
      width: '24px',
      height: '22px',
      flexShrink: '0',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'transparent',
      border: 'none',
      color: '#EBEBF540',
      cursor: 'pointer',
      borderRadius: '3px',
      padding: '0',
      fontSize: '11px',
      fontWeight: '600',
      fontFamily: '"SF Mono", Menlo, monospace',
      marginRight: '2px',
    },
    '.cm-sf-opt:hover': {
      color: '#EBEBF5CC',
      backgroundColor: '#48484A40',
    },
    '.cm-sf-opt.active': {
      color: '#fff',
      backgroundColor: '#0A84FF',
      borderRadius: '3px',
    },

    // 匹配计数
    '.cm-sf-count': {
      color: '#EBEBF580',
      fontSize: '11px',
      whiteSpace: 'nowrap',
      padding: '0 4px',
      minWidth: '32px',
      textAlign: 'center',
      flexShrink: '0',
    },
    '.cm-sf-no-match': {
      color: '#FF453A',
    },

    // 导航按钮（上/下/关闭）
    '.cm-sf-nav': {
      width: '22px',
      height: '22px',
      flexShrink: '0',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'transparent',
      border: 'none',
      color: '#EBEBF580',
      cursor: 'pointer',
      borderRadius: '4px',
      padding: '0',
    },
    '.cm-sf-nav:hover': {
      color: '#EBEBF5',
      backgroundColor: '#48484A',
    },
    '.cm-sf-close:hover': {
      color: '#FF453A',
    },

    // 替换行占位
    '.cm-sf-spacer': {
      width: '20px',
      flexShrink: '0',
    },

    // 替换操作按钮
    '.cm-sf-action': {
      height: '22px',
      padding: '0 8px',
      background: 'transparent',
      border: '1px solid #48484A',
      color: '#EBEBF599',
      cursor: 'pointer',
      borderRadius: '4px',
      fontSize: '11px',
      whiteSpace: 'nowrap',
      flexShrink: '0',
    },
    '.cm-sf-action:hover': {
      color: '#EBEBF5',
      backgroundColor: '#48484A',
      borderColor: '#636366',
    },

    // 搜索匹配高亮
    '.cm-searchMatch': {
      backgroundColor: 'rgba(234, 92, 0, 0.33)',
      borderRadius: '2px',
    },
    '.cm-searchMatch.cm-searchMatch-selected': {
      backgroundColor: 'rgba(10, 132, 255, 0.4)',
      outline: '1px solid #0A84FF',
      borderRadius: '2px',
    },
    // 选中文本高亮匹配
    '.cm-selectionMatch': {
      backgroundColor: 'rgba(173, 214, 255, 0.15)',
      borderRadius: '2px',
    },
  },
  { dark: true },
);

const highlighting = HighlightStyle.define([
  { tag: tags.heading1, color: '#E5E5E7', fontWeight: 'bold', fontSize: '1.4em' },
  { tag: tags.heading2, color: '#E5E5E7', fontWeight: 'bold', fontSize: '1.2em' },
  { tag: tags.heading3, color: '#E5E5E7', fontWeight: 'bold', fontSize: '1.1em' },
  { tag: tags.emphasis, color: '#FF9F0A', fontStyle: 'italic' },
  { tag: tags.strong, color: '#FF9F0A', fontWeight: 'bold' },
  { tag: tags.link, color: '#0A84FF', textDecoration: 'underline' },
  { tag: tags.url, color: '#0A84FF80' },
  { tag: tags.monospace, color: '#32D74B' },
  { tag: tags.quote, color: '#EBEBF580', fontStyle: 'italic' },
  { tag: tags.processingInstruction, color: '#48484A' },
]);

export const scriptEditorTheme = [theme, syntaxHighlighting(highlighting)];
