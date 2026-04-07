// src/ui/components/script-editor.tsx
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { EditorState, Compartment } from '@codemirror/state';
import {
  EditorView,
  keymap,
  placeholder as cmPlaceholder,
} from '@codemirror/view';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { languages } from '@codemirror/language-data';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import type { Annotation, AnnotationSeverity } from '../../store/script';
import { scriptEditorTheme } from './script-editor-theme';
import {
  annotationField,
  annotationHoverTooltip,
  createAnnotationClickHandler,
  setAnnotationsEffect,
  type AnnotationClickInfo,
} from './script-editor-annotations';

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
  const severity = SEVERITY_LABEL[annotation.severity];

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
      {annotation.suggestion !== annotation.originalText && (
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
      </div>
    </div>,
    document.body,
  );
}

// --- ScriptEditor ---

interface ScriptEditorProps {
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
  annotations?: Annotation[];
  onAcceptAnnotation?: (id: string) => void;
  onDismissAnnotation?: (id: string) => void;
}

export function ScriptEditor({
  value,
  onChange,
  placeholder,
  annotations = [],
  onAcceptAnnotation,
  onDismissAnnotation,
}: ScriptEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const placeholderCompartment = useRef(new Compartment());

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
          keymap.of([...defaultKeymap, ...historyKeymap]),
          placeholderCompartment.current.of(cmPlaceholder(placeholder ?? '')),
          annotationField,
          annotationHoverTooltip,
          createAnnotationClickHandler(setClickInfo),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) {
              onChangeRef.current(update.state.doc.toString());
            }
          }),
          EditorView.lineWrapping,
        ],
      }),
      parent: containerRef.current,
    });

    viewRef.current = view;
    return () => view.destroy();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // React → CM6: sync external value changes
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const currentDoc = view.state.doc.toString();
    if (value !== currentDoc) {
      view.dispatch({
        changes: { from: 0, to: currentDoc.length, insert: value },
      });
    }
  }, [value]);

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
