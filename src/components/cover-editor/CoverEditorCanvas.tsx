import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import { Canvas, FabricImage, Textbox, filters as fabricFilters } from 'fabric';
import styles from './CoverEditorCanvas.module.css';
import {
  createHistoryStack,
  type CoverEditorCanvasHandle,
} from '../../lib/cover-editor/fabric-bridge';
import {
  createEmptyEditState,
  normalizeEditState,
} from '../../lib/cover-editor/cover-edit-state';
import { getPresetAdjustments } from '../../lib/cover-editor/filters';
import { computeClipSize } from '../../lib/cover-editor/aspect-ratios';
import type { CoverEditState, FilterPreset } from '../../lib/cover-editor/contracts';

interface CoverEditorCanvasProps {
  imageUrl: string;
  initialEdits?: CoverEditState;
  initialAspectRatio: number | null;
  onChange?: (state: CoverEditState) => void;
}

const CANVAS_WIDTH = 960;
const CANVAS_HEIGHT = 540;

export const CoverEditorCanvas = forwardRef<CoverEditorCanvasHandle, CoverEditorCanvasProps>(
  function CoverEditorCanvas({ imageUrl, initialEdits, initialAspectRatio, onChange }, ref) {
    const containerRef = useRef<HTMLCanvasElement>(null);
    const fabricRef = useRef<Canvas | null>(null);
    const bgImageRef = useRef<FabricImage | null>(null);
    const history = useRef(createHistoryStack<string>(50));
    const ratioRef = useRef<number | null>(initialAspectRatio);
    const filterPresetRef = useRef<FilterPreset>(
      initialEdits?.filters?.preset ?? 'none',
    );

    useEffect(() => {
      if (!containerRef.current) return;
      const canvas = new Canvas(containerRef.current, {
        width: CANVAS_WIDTH,
        height: CANVAS_HEIGHT,
        backgroundColor: '#111',
        preserveObjectStacking: true,
      });
      fabricRef.current = canvas;

      FabricImage.fromURL(imageUrl, { crossOrigin: 'anonymous' }).then((img) => {
        if (!fabricRef.current) return;
        bgImageRef.current = img;
        img.set({ selectable: false, evented: false });
        const scale = Math.min(
          CANVAS_WIDTH / (img.width ?? CANVAS_WIDTH),
          CANVAS_HEIGHT / (img.height ?? CANVAS_HEIGHT),
        );
        img.scale(scale);
        img.set({
          left: (CANVAS_WIDTH - (img.width ?? 0) * scale) / 2,
          top: (CANVAS_HEIGHT - (img.height ?? 0) * scale) / 2,
        });
        canvas.add(img);
        canvas.sendObjectToBack(img);
        applyClipPath(ratioRef.current);
        pushSnapshot();
        if (initialEdits) applyEditState(normalizeEditState(initialEdits));
        emitChange();
      });

      canvas.on('object:modified', () => {
        pushSnapshot();
        emitChange();
      });

      return () => {
        canvas.dispose();
        fabricRef.current = null;
      };
    }, [imageUrl]);

    function pushSnapshot() {
      if (!fabricRef.current) return;
      history.current.push(JSON.stringify(fabricRef.current.toJSON()));
    }

    function emitChange() {
      onChange?.(buildEditState());
    }

    function buildEditState(): CoverEditState {
      const canvas = fabricRef.current;
      if (!canvas) return createEmptyEditState();
      const textOverlays = canvas
        .getObjects()
        .filter((o): o is Textbox => o.type === 'textbox')
        .map((t) => ({
          id: (t as unknown as { id?: string }).id ?? String(t.left ?? 0) + String(t.top ?? 0),
          text: t.text ?? '',
          x: t.left ?? 0,
          y: t.top ?? 0,
          fontSize: t.fontSize ?? 48,
          fontFamily: t.fontFamily ?? 'Arial',
          color: (t.fill as string) ?? '#ffffff',
          strokeColor: (t.stroke as string) ?? undefined,
          strokeWidth: t.strokeWidth,
          align: (t.textAlign as 'left' | 'center' | 'right') ?? 'left',
          rotation: t.angle ?? 0,
        }));
      return {
        version: 1,
        aspectRatio: undefined,
        textOverlays,
        filters: { preset: filterPresetRef.current },
        transform: {},
      };
    }

    function applyClipPath(ratio: number | null) {
      const canvas = fabricRef.current;
      if (!canvas) return;
      if (!ratio) {
        canvas.clipPath = undefined;
        canvas.requestRenderAll();
        return;
      }
      const size = computeClipSize(ratio, CANVAS_WIDTH, CANVAS_HEIGHT);
      // 使用矩形 clipPath
      import('fabric').then(({ Rect }) => {
        const clip = new Rect({
          left: (CANVAS_WIDTH - size.width) / 2,
          top: (CANVAS_HEIGHT - size.height) / 2,
          width: size.width,
          height: size.height,
          absolutePositioned: true,
        });
        canvas.clipPath = clip;
        canvas.requestRenderAll();
      });
    }

    function applyEditState(state: CoverEditState) {
      const canvas = fabricRef.current;
      if (!canvas) return;
      for (const t of state.textOverlays ?? []) {
        const tb = new Textbox(t.text, {
          left: t.x,
          top: t.y,
          fontSize: t.fontSize,
          fontFamily: t.fontFamily,
          fill: t.color,
          stroke: t.strokeColor,
          strokeWidth: t.strokeWidth ?? 0,
          textAlign: t.align ?? 'left',
          angle: t.rotation ?? 0,
        });
        canvas.add(tb);
      }
      canvas.requestRenderAll();
    }

    function applyFilters() {
      const img = bgImageRef.current;
      if (!img) return;
      const adj = getPresetAdjustments(filterPresetRef.current);
      img.filters = [
        new fabricFilters.Brightness({ brightness: adj.brightness / 100 }),
        new fabricFilters.Contrast({ contrast: adj.contrast / 100 }),
        new fabricFilters.Saturation({ saturation: adj.saturation / 100 }),
      ];
      img.applyFilters();
      fabricRef.current?.requestRenderAll();
    }

    useImperativeHandle(ref, (): CoverEditorCanvasHandle => ({
      setAspectRatio(ratio) {
        ratioRef.current = ratio;
        applyClipPath(ratio);
        pushSnapshot();
        emitChange();
      },
      addText({ text, fontFamily, color }) {
        const canvas = fabricRef.current;
        if (!canvas) return;
        const tb = new Textbox(text, {
          left: CANVAS_WIDTH / 2 - 120,
          top: CANVAS_HEIGHT / 2 - 24,
          width: 240,
          fontSize: 48,
          fontFamily,
          fill: color,
          textAlign: 'center',
        });
        canvas.add(tb);
        canvas.setActiveObject(tb);
        pushSnapshot();
        emitChange();
      },
      removeSelected() {
        const canvas = fabricRef.current;
        if (!canvas) return;
        const active = canvas.getActiveObjects();
        active.forEach((obj) => {
          if (obj !== bgImageRef.current) canvas.remove(obj);
        });
        canvas.discardActiveObject();
        pushSnapshot();
        emitChange();
      },
      flipHorizontal() {
        const img = bgImageRef.current;
        if (!img) return;
        img.set('flipX', !img.flipX);
        pushSnapshot();
        emitChange();
      },
      flipVertical() {
        const img = bgImageRef.current;
        if (!img) return;
        img.set('flipY', !img.flipY);
        pushSnapshot();
        emitChange();
      },
      rotate(deg) {
        const img = bgImageRef.current;
        if (!img) return;
        img.rotate((img.angle ?? 0) + deg);
        pushSnapshot();
        emitChange();
      },
      setFilterPreset(preset) {
        filterPresetRef.current = preset;
        applyFilters();
        pushSnapshot();
        emitChange();
      },
      setFilterAdjustment() {
        // Task 6 Inspector 会接线到这里；本 Task 只暴露占位实现
        applyFilters();
        pushSnapshot();
        emitChange();
      },
      undo() {
        const snap = history.current.undo();
        const canvas = fabricRef.current;
        if (snap && canvas) canvas.loadFromJSON(snap, () => canvas.requestRenderAll());
        emitChange();
      },
      redo() {
        const snap = history.current.redo();
        const canvas = fabricRef.current;
        if (snap && canvas) canvas.loadFromJSON(snap, () => canvas.requestRenderAll());
        emitChange();
      },
      exportDataUrl() {
        const canvas = fabricRef.current;
        if (!canvas) return '';
        return canvas.toDataURL({ format: 'png', multiplier: 2 });
      },
      getEditState() {
        return buildEditState();
      },
      loadEditState(state) {
        applyEditState(state);
      },
    }));

    return (
      <div className={styles.canvasWrap}>
        <canvas ref={containerRef} />
      </div>
    );
  },
);
