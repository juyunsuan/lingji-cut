// src/ui/components/script-editor.tsx
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { EditorState, Compartment, StateEffect, StateField } from '@codemirror/state';
import {
  Decoration,
  type DecorationSet,
  EditorView,
  keymap,
  placeholder as cmPlaceholder,
} from '@codemirror/view';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { languages } from '@codemirror/language-data';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { search, searchKeymap, highlightSelectionMatches } from '@codemirror/search';
import { createSearchPanel } from './script-editor-search';
import type { Annotation, AnnotationSeverity } from '../../store/script';
import { scriptEditorTheme } from './script-editor-theme';
import {
  annotationField,
  annotationHoverTooltip,
  createAnnotationClickHandler,
  setAnnotationsEffect,
  type AnnotationClickInfo,
} from './script-editor-annotations';
import { virtualCursorExtension } from '../../lib/virtual-cursor';
import { createReadOnlyGuard } from '../../lib/editor-readonly-guard';

// --- Severity display config ---

const SEVERITY_LABEL: Record<AnnotationSeverity, { color: string; text: string }> = {
  error: { color: '#FF453A', text: '错误' },
  warning: { color: '#FF9F0A', text: '警告' },
  info: { color: '#0A84FF', text: '建议' },
};

// --- AnnotationPopover ---

function AnnotationPopover({
  info,
  onAccept,
  onDismiss,
  onClose,
}: {
  info: AnnotationClickInfo;
  onAccept: () => void;
  onDismiss: () => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const { annotation } = info;
  const severity = SEVERITY_LABEL[annotation.severity] ?? SEVERITY_LABEL.info;

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [onClose]);

  return createPortal(
    <div
      ref={ref}
      style={{
        position: 'fixed',
        top: info.y + 6,
        left: info.x,
        zIndex: 9999,
        width: 320,
        padding: 14,
        borderRadius: 10,
        backgroundColor: '#2C2C2E',
        border: `1px solid ${severity.color}40`,
        boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        fontSize: 12,
      }}
    >
      {/* header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span
          style={{
            width: 8,
            height: 8,
            borderRadius: '50%',
            backgroundColor: severity.color,
          }}
        />
        <span style={{ color: severity.color, fontWeight: 600 }}>
          {severity.text}
        </span>
      </div>

      {/* issue */}
      <div style={{ color: '#EBEBF599', lineHeight: 1.5 }}>
        {annotation.issue}
      </div>

      {/* suggestion diff */}
      {annotation.suggestion && annotation.suggestion !== annotation.originalText && (
        <div
          style={{
            padding: '8px 10px',
            borderRadius: 6,
            backgroundColor: `${severity.color}08`,
            border: `1px solid ${severity.color}20`,
            lineHeight: 1.5,
          }}
        >
          <div style={{ color: '#EBEBF54D', marginBottom: 4 }}>
            <span style={{ textDecoration: 'line-through' }}>
              {annotation.originalText}
            </span>
          </div>
          <div style={{ color: '#EBEBF5CC' }}>{annotation.suggestion}</div>
        </div>
      )}

      {/* actions */}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button
          type="button"
          onClick={onDismiss}
          style={{
            padding: '6px 14px',
            borderRadius: 6,
            border: '1px solid #48484A',
            background: 'transparent',
            color: '#EBEBF599',
            fontSize: 12,
            cursor: 'pointer',
          }}
        >
          忽略
        </button>
        {annotation.suggestion && annotation.suggestion !== annotation.originalText ? (
          <button
            type="button"
            onClick={onAccept}
            style={{
              padding: '6px 14px',
              borderRadius: 6,
              border: 'none',
              background: severity.color,
              color: '#fff',
              fontSize: 12,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            采纳修改
          </button>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}

// --- MCP 变更行高亮 ---

const setHighlightLinesEffect = StateEffect.define<number[]>();

const highlightLineField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(value, tr) {
    for (const effect of tr.effects) {
      if (effect.is(setHighlightLinesEffect)) {
        const lines = effect.value;
        const decos: any[] = [];
        for (const lineNum of lines) {
          if (lineNum >= 1 && lineNum <= tr.state.doc.lines) {
            const line = tr.state.doc.line(lineNum);
            decos.push(Decoration.line({ class: 'cm-mcp-change-highlight' }).range(line.from));
          }
        }
        return Decoration.set(decos, true);
      }
    }
    return value;
  },
  provide: (f) => EditorView.decorations.from(f),
});

// --- ScriptEditor ---

interface ScriptEditorProps {
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
  annotations?: Annotation[];
  onAcceptAnnotation?: (id: string) => void;
  onDismissAnnotation?: (id: string) => void;
  readOnly?: boolean;
  /** 流式写入进行中时为 true，跳过 React → CM6 的 value 同步以避免覆盖动画 */
  streamingActive?: boolean;
  editorViewRef?: React.MutableRefObject<EditorView | null>;
  mcpChangeHighlightLines?: number[];
}

export function ScriptEditor({
  value,
  onChange,
  placeholder,
  annotations = [],
  onAcceptAnnotation,
  onDismissAnnotation,
  readOnly,
  streamingActive,
  editorViewRef,
  mcpChangeHighlightLines,
}: ScriptEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const placeholderCompartment = useRef(new Compartment());
  const readOnlyGuard = useRef(createReadOnlyGuard());

  const [clickInfo, setClickInfo] = useState<AnnotationClickInfo | null>(null);

  // Initialize CM6 EditorView
  useEffect(() => {
    if (!containerRef.current) return;

    const view = new EditorView({
      state: EditorState.create({
        doc: value,
        extensions: [
          scriptEditorTheme,
          markdown({ base: markdownLanguage, codeLanguages: languages }),
          history(),
          keymap.of([...searchKeymap, ...defaultKeymap, ...historyKeymap]),
          search({ top: true, createPanel: createSearchPanel }),
          highlightSelectionMatches(),
          placeholderCompartment.current.of(cmPlaceholder(placeholder ?? '')),
          annotationField,
          annotationHoverTooltip,
          createAnnotationClickHandler(setClickInfo),
          highlightLineField,
          ...virtualCursorExtension,
          readOnlyGuard.current.extension,
          EditorView.updateListener.of((update) => {
            if (update.docChanged) {
              onChangeRef.current(update.state.doc.toString());
            }
          }),
          EditorView.lineWrapping,
          EditorView.domEventHandlers({
            contextmenu: (event) => {
              event.preventDefault();
              window.electronAPI?.showEditorContextMenu();
            },
          }),
        ],
      }),
      parent: containerRef.current,
    });

    viewRef.current = view;
    if (editorViewRef) {
      editorViewRef.current = view;
    }
    return () => {
      view.destroy();
      if (editorViewRef) {
        editorViewRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // React → CM6: sync external value changes
  // 流式写入期间跳过，避免覆盖 StreamingEditor 的动画帧
  useEffect(() => {
    if (streamingActive) return;
    const view = viewRef.current;
    if (!view) return;
    const currentDoc = view.state.doc.toString();
    if (value !== currentDoc) {
      view.dispatch({
        changes: { from: 0, to: currentDoc.length, insert: value },
      });
    }
  }, [value, streamingActive]);

  // React → CM6: sync annotations
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({ effects: setAnnotationsEffect.of(annotations) });
  }, [annotations]);

  // React → CM6: sync placeholder text
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({
      effects: placeholderCompartment.current.reconfigure(
        cmPlaceholder(placeholder ?? ''),
      ),
    });
  }, [placeholder]);

  // React → CM6: sync readOnly state
  useEffect(() => {
    if (viewRef.current) {
      viewRef.current.dispatch({
        effects: readOnlyGuard.current.reconfigure(readOnly ?? false),
      });
    }
  }, [readOnly]);

  // React → CM6: 同步 MCP 变更行高亮
  useEffect(() => {
    const view = viewRef.current;
    if (view && mcpChangeHighlightLines?.length) {
      view.dispatch({ effects: setHighlightLinesEffect.of(mcpChangeHighlightLines) });
    } else if (view) {
      view.dispatch({ effects: setHighlightLinesEffect.of([]) });
    }
  }, [mcpChangeHighlightLines]);

  // Close popover when the active annotation is no longer pending
  useEffect(() => {
    if (!clickInfo) return;
    const ann = annotations.find((a) => a.id === clickInfo.id);
    if (!ann || ann.status !== 'pending') {
      setClickInfo(null);
    }
  }, [annotations, clickInfo]);

  const handleClosePopover = useCallback(() => setClickInfo(null), []);

  return (
    <div
      ref={containerRef}
      style={{
        height: '100%',
        overflow: 'hidden',
        borderRadius: 6,
        border: '1px solid var(--color-mac-separator, #38383A)',
      }}
    >
      {clickInfo && (
        <AnnotationPopover
          info={clickInfo}
          onAccept={() => { onAcceptAnnotation?.(clickInfo.id); handleClosePopover(); }}
          onDismiss={() => { onDismissAnnotation?.(clickInfo.id); handleClosePopover(); }}
          onClose={handleClosePopover}
        />
      )}
    </div>
  );
}
