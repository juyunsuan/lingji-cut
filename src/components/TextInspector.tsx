import { useCallback } from 'react';
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  Italic,
  Trash2,
  Underline,
} from 'lucide-react';
import type { TextOverlayData } from '../types';
import { useTimelineStore } from '../store/timeline';
import { Button } from '../ui';
import styles from './TextInspector.module.css';

interface TextInspectorProps {
  overlayId: string;
  onDelete: () => void;
}

export function TextInspector({ overlayId, onDelete }: TextInspectorProps) {
  const { timeline, updateOverlay } = useTimelineStore();
  const overlay = timeline.overlays.find((o) => o.id === overlayId);
  const textData = overlay?.textData;

  const updateTextData = useCallback(
    (updates: Partial<TextOverlayData>) => {
      if (!textData) return;
      updateOverlay(overlayId, { textData: { ...textData, ...updates } });
    },
    [overlayId, textData, updateOverlay],
  );

  if (!textData) {
    return <div className={styles.empty}>文字不存在</div>;
  }

  return (
    <div className={styles.root}>
      {/* 内容区 */}
      <section className={styles.section}>
        <label className={styles.label}>内容</label>
        <textarea
          className={styles.textarea}
          value={textData.content}
          onChange={(e) => updateTextData({ content: e.target.value })}
          rows={3}
        />
      </section>

      {/* 字体区 */}
      <section className={styles.section}>
        <label className={styles.label}>字体</label>
        <select
          className={styles.select}
          value={textData.fontFamily}
          onChange={(e) => updateTextData({ fontFamily: e.target.value })}
        >
          <option value="PingFang SC">PingFang SC</option>
          <option value="Noto Sans SC">Noto Sans SC</option>
          <option value="Helvetica Neue">Helvetica Neue</option>
          <option value="Arial">Arial</option>
          <option value="STHeiti">STHeiti</option>
          <option value="SimHei">SimHei</option>
        </select>
        <div className={styles.row}>
          <input type="number" className={styles.numberInput} value={textData.fontSize} min={12} max={200} onChange={(e) => updateTextData({ fontSize: Number(e.target.value) })} />
          <input type="color" className={styles.colorInput} value={textData.fontColor} onChange={(e) => updateTextData({ fontColor: e.target.value })} title="字体颜色" />
        </div>
        <div className={styles.row}>
          <div className={styles.toggleGroup}>
            <button className={[styles.toggleBtn, textData.bold ? styles.active : ''].filter(Boolean).join(' ')} onClick={() => updateTextData({ bold: !textData.bold })} title="加粗"><Bold size={14} /></button>
            <button className={[styles.toggleBtn, textData.italic ? styles.active : ''].filter(Boolean).join(' ')} onClick={() => updateTextData({ italic: !textData.italic })} title="斜体"><Italic size={14} /></button>
            <button className={[styles.toggleBtn, textData.underline ? styles.active : ''].filter(Boolean).join(' ')} onClick={() => updateTextData({ underline: !textData.underline })} title="下划线"><Underline size={14} /></button>
          </div>
          <div className={styles.toggleGroup}>
            <button className={[styles.toggleBtn, textData.textAlign === 'left' ? styles.active : ''].filter(Boolean).join(' ')} onClick={() => updateTextData({ textAlign: 'left' })} title="左对齐"><AlignLeft size={14} /></button>
            <button className={[styles.toggleBtn, textData.textAlign === 'center' ? styles.active : ''].filter(Boolean).join(' ')} onClick={() => updateTextData({ textAlign: 'center' })} title="居中"><AlignCenter size={14} /></button>
            <button className={[styles.toggleBtn, textData.textAlign === 'right' ? styles.active : ''].filter(Boolean).join(' ')} onClick={() => updateTextData({ textAlign: 'right' })} title="右对齐"><AlignRight size={14} /></button>
          </div>
        </div>
      </section>

      {/* 背景区 */}
      <section className={styles.section}>
        <label className={styles.label}>背景</label>
        <div className={styles.row}>
          <input type="color" className={styles.colorInput} value={textData.backgroundColor === 'transparent' ? '#000000' : textData.backgroundColor} onChange={(e) => updateTextData({ backgroundColor: e.target.value })} title="背景颜色" />
          <button className={[styles.toggleBtn, textData.backgroundColor === 'transparent' ? styles.active : ''].filter(Boolean).join(' ')} onClick={() => updateTextData({ backgroundColor: textData.backgroundColor === 'transparent' ? 'rgba(0,0,0,0.5)' : 'transparent' })}>{textData.backgroundColor === 'transparent' ? '透明' : '有色'}</button>
        </div>
      </section>

      {/* 描边与阴影 */}
      <section className={styles.section}>
        <label className={styles.label}>描边</label>
        <div className={styles.row}>
          <input type="color" className={styles.colorInput} value={textData.strokeColor} onChange={(e) => updateTextData({ strokeColor: e.target.value })} title="描边颜色" />
          <input type="number" className={styles.numberInput} value={textData.strokeWidth} min={0} max={10} onChange={(e) => updateTextData({ strokeWidth: Number(e.target.value) })} />
        </div>
        <label className={styles.label}>阴影</label>
        <div className={styles.row}>
          <input type="color" className={styles.colorInput} value={textData.shadowColor} onChange={(e) => updateTextData({ shadowColor: e.target.value })} title="阴影颜色" />
          <input type="number" className={styles.numberInput} value={textData.shadowBlur} min={0} max={50} placeholder="模糊" onChange={(e) => updateTextData({ shadowBlur: Number(e.target.value) })} />
        </div>
        <div className={styles.row}>
          <input type="number" className={styles.numberInput} value={textData.shadowOffsetX} min={-50} max={50} placeholder="X偏移" onChange={(e) => updateTextData({ shadowOffsetX: Number(e.target.value) })} />
          <input type="number" className={styles.numberInput} value={textData.shadowOffsetY} min={-50} max={50} placeholder="Y偏移" onChange={(e) => updateTextData({ shadowOffsetY: Number(e.target.value) })} />
        </div>
      </section>

      {/* 间距 */}
      <section className={styles.section}>
        <label className={styles.label}>间距</label>
        <div className={styles.sliderRow}>
          <span className={styles.sliderLabel}>字间距</span>
          <input type="range" min={-5} max={20} step={0.5} value={textData.letterSpacing} onChange={(e) => updateTextData({ letterSpacing: Number(e.target.value) })} />
          <span className={styles.sliderValue}>{textData.letterSpacing}px</span>
        </div>
        <div className={styles.sliderRow}>
          <span className={styles.sliderLabel}>行间距</span>
          <input type="range" min={1} max={3} step={0.1} value={textData.lineHeight} onChange={(e) => updateTextData({ lineHeight: Number(e.target.value) })} />
          <span className={styles.sliderValue}>{textData.lineHeight}</span>
        </div>
      </section>

      {/* 变换 */}
      <section className={styles.section}>
        <label className={styles.label}>变换</label>
        <div className={styles.sliderRow}>
          <span className={styles.sliderLabel}>透明度</span>
          <input type="range" min={0} max={1} step={0.05} value={textData.opacity} onChange={(e) => updateTextData({ opacity: Number(e.target.value) })} />
          <span className={styles.sliderValue}>{Math.round(textData.opacity * 100)}%</span>
        </div>
        <div className={styles.sliderRow}>
          <span className={styles.sliderLabel}>旋转</span>
          <input type="range" min={0} max={360} step={1} value={textData.rotation} onChange={(e) => updateTextData({ rotation: Number(e.target.value) })} />
          <span className={styles.sliderValue}>{textData.rotation}°</span>
        </div>
      </section>

      {/* 动画 */}
      <section className={styles.section}>
        <label className={styles.label}>动画</label>
        <div className={styles.animRow}>
          <span className={styles.sliderLabel}>入场</span>
          <select className={styles.select} value={textData.animation.enter} onChange={(e) => updateTextData({ animation: { ...textData.animation, enter: e.target.value as TextOverlayData['animation']['enter'] } })}>
            <option value="none">无</option>
            <option value="fadeIn">淡入</option>
            <option value="slideInLeft">左滑入</option>
            <option value="slideInRight">右滑入</option>
            <option value="slideInUp">上滑入</option>
            <option value="slideInDown">下滑入</option>
            <option value="scaleIn">缩放入</option>
            <option value="bounceIn">弹入</option>
          </select>
          <input type="number" className={styles.numberInput} value={textData.animation.enterDurationMs} min={100} max={3000} step={100} onChange={(e) => updateTextData({ animation: { ...textData.animation, enterDurationMs: Number(e.target.value) } })} />
        </div>
        <div className={styles.animRow}>
          <span className={styles.sliderLabel}>循环</span>
          <select className={styles.select} value={textData.animation.loop} onChange={(e) => updateTextData({ animation: { ...textData.animation, loop: e.target.value as TextOverlayData['animation']['loop'] } })}>
            <option value="none">无</option>
            <option value="pulse">呼吸</option>
            <option value="float">浮动</option>
            <option value="flicker">闪烁</option>
            <option value="typewriter">打字机</option>
          </select>
        </div>
        <div className={styles.animRow}>
          <span className={styles.sliderLabel}>出场</span>
          <select className={styles.select} value={textData.animation.exit} onChange={(e) => updateTextData({ animation: { ...textData.animation, exit: e.target.value as TextOverlayData['animation']['exit'] } })}>
            <option value="none">无</option>
            <option value="fadeOut">淡出</option>
            <option value="slideOutLeft">左滑出</option>
            <option value="slideOutRight">右滑出</option>
            <option value="slideOutUp">上滑出</option>
            <option value="slideOutDown">下滑出</option>
            <option value="scaleOut">缩放出</option>
            <option value="bounceOut">弹出</option>
          </select>
          <input type="number" className={styles.numberInput} value={textData.animation.exitDurationMs} min={100} max={3000} step={100} onChange={(e) => updateTextData({ animation: { ...textData.animation, exitDurationMs: Number(e.target.value) } })} />
        </div>
      </section>

      {/* 删除 */}
      <section className={styles.section}>
        <Button variant="destructive" className={styles.deleteButton} onClick={onDelete}>
          <Trash2 size={14} />
          删除文字
        </Button>
      </section>
    </div>
  );
}
