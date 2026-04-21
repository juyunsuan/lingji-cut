import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import {
  Canvas,
  FabricImage,
  Rect,
  Textbox,
  filters as fabricFilters,
} from 'fabric';
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
import { toFileSrc } from '../../lib/utils';
import type {
  CoverEditState,
  CoverTextOverlay,
  FilterPreset,
} from '../../lib/cover-editor/contracts';

interface CoverEditorCanvasProps {
  imageUrl: string;
  initialEdits?: CoverEditState;
  initialAspectRatio: number | null;
  onChange?: (state: CoverEditState) => void;
  onTextSelectionChange?: (text: CoverTextOverlay | null) => void;
}

const CANVAS_WIDTH = 960;
const CANVAS_HEIGHT = 540;

export const CoverEditorCanvas = forwardRef<CoverEditorCanvasHandle, CoverEditorCanvasProps>(
  function CoverEditorCanvas(
    { imageUrl, initialEdits, initialAspectRatio, onChange, onTextSelectionChange },
    ref,
  ) {
    const containerRef = useRef<HTMLCanvasElement>(null);
    const fabricRef = useRef<Canvas | null>(null);
    const bgImageRef = useRef<FabricImage | null>(null);
    const history = useRef(createHistoryStack<string>(50));
    const ratioRef = useRef<number | null>(initialAspectRatio);
    const filterPresetRef = useRef<FilterPreset>(
      initialEdits?.filters?.preset ?? 'none',
    );
    const cropRectRef = useRef<Rect | null>(null);
    const onTextSelectionChangeRef = useRef(onTextSelectionChange);
    onTextSelectionChangeRef.current = onTextSelectionChange;

    useEffect(() => {
      if (!containerRef.current) return;
      const canvas = new Canvas(containerRef.current, {
        width: CANVAS_WIDTH,
        height: CANVAS_HEIGHT,
        backgroundColor: '#111',
        preserveObjectStacking: true,
      });
      fabricRef.current = canvas;

      const cleanPath = imageUrl.split('?')[0];
      FabricImage.fromURL(toFileSrc(cleanPath), { crossOrigin: 'anonymous' }).then((img) => {
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

      function reportSelection() {
        const active = canvas.getActiveObject();
        if (active && active.type === 'textbox') {
          onTextSelectionChangeRef.current?.(textboxToOverlay(active as Textbox));
        } else {
          onTextSelectionChangeRef.current?.(null);
        }
      }

      canvas.on('selection:created', reportSelection);
      canvas.on('selection:updated', reportSelection);
      canvas.on('selection:cleared', () => onTextSelectionChangeRef.current?.(null));

      return () => {
        canvas.dispose();
        fabricRef.current = null;
      };
    }, [imageUrl]);

    function textboxToOverlay(t: Textbox): CoverTextOverlay {
      return {
        id:
          (t as unknown as { id?: string }).id ??
          String(t.left ?? 0) + String(t.top ?? 0),
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
      };
    }

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
        .map((t) => textboxToOverlay(t));
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
      const clip = new Rect({
        left: (CANVAS_WIDTH - size.width) / 2,
        top: (CANVAS_HEIGHT - size.height) / 2,
        width: size.width,
        height: size.height,
        absolutePositioned: true,
      });
      canvas.clipPath = clip;
      canvas.requestRenderAll();
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

    function clearCropRect() {
      const canvas = fabricRef.current;
      if (!canvas || !cropRectRef.current) return;
      canvas.remove(cropRectRef.current);
      cropRectRef.current = null;
      canvas.requestRenderAll();
    }

    useImperativeHandle(ref, (): CoverEditorCanvasHandle => ({
      setAspectRatio(ratio) {
        ratioRef.current = ratio;
        // 切换比例时退出裁剪交互
        clearCropRect();
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
        // 立即进入编辑模式并全选占位文案，便于直接覆盖输入
        try {
          tb.enterEditing();
          tb.selectAll();
        } catch {
          // 某些极端情况下 enterEditing 可能因焦点切换失败，忽略
        }
        canvas.requestRenderAll();
        onTextSelectionChangeRef.current?.(textboxToOverlay(tb));
        pushSnapshot();
        emitChange();
      },
      updateSelectedText(patch) {
        const canvas = fabricRef.current;
        if (!canvas) return;
        const active = canvas.getActiveObject();
        if (!active || active.type !== 'textbox') return;
        const t = active as Textbox;
        if (patch.text !== undefined) t.set('text', patch.text);
        if (patch.fontSize !== undefined) t.set('fontSize', patch.fontSize);
        if (patch.fontFamily !== undefined) t.set('fontFamily', patch.fontFamily);
        if (patch.color !== undefined) t.set('fill', patch.color);
        if (patch.strokeColor !== undefined) t.set('stroke', patch.strokeColor);
        if (patch.strokeWidth !== undefined) t.set('strokeWidth', patch.strokeWidth);
        if (patch.align !== undefined) t.set('textAlign', patch.align);
        canvas.requestRenderAll();
        onTextSelectionChangeRef.current?.(textboxToOverlay(t));
        pushSnapshot();
        emitChange();
      },
      removeSelected() {
        const canvas = fabricRef.current;
        if (!canvas) return;
        const active = canvas.getActiveObjects();
        active.forEach((obj) => {
          if (obj !== bgImageRef.current && obj !== cropRectRef.current)
            canvas.remove(obj);
        });
        canvas.discardActiveObject();
        onTextSelectionChangeRef.current?.(null);
        pushSnapshot();
        emitChange();
      },
      flipHorizontal() {
        const img = bgImageRef.current;
        if (!img) return;
        img.set('flipX', !img.flipX);
        fabricRef.current?.requestRenderAll();
        pushSnapshot();
        emitChange();
      },
      flipVertical() {
        const img = bgImageRef.current;
        if (!img) return;
        img.set('flipY', !img.flipY);
        fabricRef.current?.requestRenderAll();
        pushSnapshot();
        emitChange();
      },
      rotate(deg) {
        const img = bgImageRef.current;
        if (!img) return;
        img.rotate((img.angle ?? 0) + deg);
        fabricRef.current?.requestRenderAll();
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
        applyFilters();
        pushSnapshot();
        emitChange();
      },
      enterCropMode() {
        const canvas = fabricRef.current;
        if (!canvas) return;
        // 以当前 clipPath 为初始裁剪框；若无则用 80% 画布
        const current = canvas.clipPath as Rect | undefined;
        const defaultW = current?.width ?? CANVAS_WIDTH * 0.8;
        const defaultH = current?.height ?? CANVAS_HEIGHT * 0.8;
        const defaultL = current?.left ?? (CANVAS_WIDTH - defaultW) / 2;
        const defaultT = current?.top ?? (CANVAS_HEIGHT - defaultH) / 2;
        clearCropRect();
        // 裁剪时先移除 clipPath 以便用户看到完整图预览
        canvas.clipPath = undefined;
        const rect = new Rect({
          left: defaultL,
          top: defaultT,
          width: defaultW,
          height: defaultH,
          fill: 'rgba(0, 122, 255, 0.12)',
          stroke: '#0A84FF',
          strokeWidth: 2,
          strokeDashArray: [6, 4],
          cornerColor: '#0A84FF',
          cornerStyle: 'circle',
          transparentCorners: false,
          hasRotatingPoint: false,
        });
        cropRectRef.current = rect;
        canvas.add(rect);
        canvas.setActiveObject(rect);
        canvas.requestRenderAll();
      },
      exitCropMode() {
        clearCropRect();
        applyClipPath(ratioRef.current);
      },
      commitCrop() {
        const canvas = fabricRef.current;
        const rect = cropRectRef.current;
        if (!canvas || !rect) return;
        const finalClip = new Rect({
          left: rect.left ?? 0,
          top: rect.top ?? 0,
          width: (rect.width ?? 0) * (rect.scaleX ?? 1),
          height: (rect.height ?? 0) * (rect.scaleY ?? 1),
          absolutePositioned: true,
        });
        canvas.clipPath = finalClip;
        clearCropRect();
        ratioRef.current = null; // 自定义裁剪后脱离预设比例
        canvas.requestRenderAll();
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
