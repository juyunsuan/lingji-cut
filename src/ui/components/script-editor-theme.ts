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
      backgroundColor: '#FF453A15',
      borderBottom: '2px wavy #FF453A',
      borderRadius: '2px',
      cursor: 'pointer',
    },
    '.cm-annotation-warning': {
      backgroundColor: '#FF9F0A15',
      borderBottom: '2px wavy #FF9F0A',
      borderRadius: '2px',
      cursor: 'pointer',
    },
    '.cm-annotation-info': {
      backgroundColor: '#0A84FF15',
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
