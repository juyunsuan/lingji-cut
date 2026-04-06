import { useCallback, useState } from 'react';
import type {
  TextEnterAnimation,
  TextExitAnimation,
  TextLoopAnimation,
  TextOverlayData,
} from '../types';
import { useTimelineStore } from '../store/timeline';
import { TEXT_TEMPLATES } from '../lib/text-templates';
import { AppIcon } from './AppIcon';
import { Button } from '../ui';
import styles from './TextInspector.module.css';

// ── 动画预设 ──

interface AnimPreset<T extends string> {
  value: T;
  label: string;
}

const ENTER_PRESETS: AnimPreset<TextEnterAnimation>[] = [
  { value: 'none', label: '无' },
  { value: 'fadeIn', label: '淡入' },
  { value: 'slideInLeft', label: '左滑入' },
  { value: 'slideInRight', label: '右滑入' },
  { value: 'slideInUp', label: '上滑入' },
  { value: 'slideInDown', label: '下滑入' },
  { value: 'scaleIn', label: '缩放入' },
  { value: 'bounceIn', label: '弹入' },
];

const LOOP_PRESETS: AnimPreset<TextLoopAnimation>[] = [
  { value: 'none', label: '无' },
  { value: 'pulse', label: '呼吸' },
  { value: 'float', label: '浮动' },
  { value: 'flicker', label: '闪烁' },
  { value: 'typewriter', label: '打字机' },
];

const EXIT_PRESETS: AnimPreset<TextExitAnimation>[] = [
  { value: 'none', label: '无' },
  { value: 'fadeOut', label: '淡出' },
  { value: 'slideOutLeft', label: '左滑出' },
  { value: 'slideOutRight', label: '右滑出' },
  { value: 'slideOutUp', label: '上滑出' },
  { value: 'slideOutDown', label: '下滑出' },
  { value: 'scaleOut', label: '缩放出' },
  { value: 'bounceOut', label: '弹出' },
];

// ── 模板描述映射 ──

const TEMPLATE_DESCRIPTIONS: Record<string, string> = {
  'text-template:heading': '醒目的大号标题，适合封面',
  'text-template:subheading': '中号加粗标题，适合段落',
  'text-template:body': '左对齐正文，适合长段落',
  'text-template:caption': '半透明背景字幕条',
  'text-template:fancy': '红色描边花字效果',
};

// ── 组件 ──

type TabKey = 'basic' | 'animation' | 'template';

interface TextInspectorProps {
  overlayId: string;
  onDelete: () => void;
}

export function TextInspector({ overlayId, onDelete }: TextInspectorProps) {
  const { timeline, updateOverlay } = useTimelineStore();
  const overlay = timeline.overlays.find((o) => o.id === overlayId);
  const textData = overlay?.textData;

  const [activeTab, setActiveTab] = useState<TabKey>('basic');
  const [advancedOpen, setAdvancedOpen] = useState(false);

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

  // ── Tab 渲染 ──

  const tabs: { key: TabKey; label: string }[] = [
    { key: 'basic', label: '基础' },
    { key: 'animation', label: '动画' },
    { key: 'template', label: '模板' },
  ];

  return (
    <div className={styles.root}>
      {/* Tab 栏 */}
      <div className={styles.tabs}>
        {tabs.map((t) => (
          <button
            key={t.key}
            className={[styles.tab, activeTab === t.key ? styles.active : '']
              .filter(Boolean)
              .join(' ')}
            onClick={() => setActiveTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab 内容 */}
      <div className={styles.tabContent}>
        {activeTab === 'basic' && (
          <BasicTab
            textData={textData}
            updateTextData={updateTextData}
            onDelete={onDelete}
          />
        )}
        {activeTab === 'animation' && (
          <AnimationTab
            textData={textData}
            updateTextData={updateTextData}
            advancedOpen={advancedOpen}
            setAdvancedOpen={setAdvancedOpen}
          />
        )}
        {activeTab === 'template' && (
          <TemplateTab textData={textData} updateTextData={updateTextData} />
        )}
      </div>
    </div>
  );
}

// ── 基础 Tab ──

function BasicTab({
  textData,
  updateTextData,
  onDelete,
}: {
  textData: TextOverlayData;
  updateTextData: (u: Partial<TextOverlayData>) => void;
  onDelete: () => void;
}) {
  return (
    <>
      {/* 内容 */}
      <section className={styles.section}>
        <label className={styles.label}>内容</label>
        <textarea
          className={styles.textarea}
          value={textData.content}
          onChange={(e) => updateTextData({ content: e.target.value })}
          rows={3}
        />
      </section>

      {/* 字体 */}
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
          <input
            type="number"
            className={styles.numberInput}
            value={textData.fontSize}
            min={12}
            max={200}
            onChange={(e) => updateTextData({ fontSize: Number(e.target.value) })}
          />
          <input
            type="color"
            className={styles.colorInput}
            value={textData.fontColor}
            onChange={(e) => updateTextData({ fontColor: e.target.value })}
            title="字体颜色"
          />
        </div>
        <div className={styles.row}>
          <div className={styles.toggleGroup}>
            <button
              className={[styles.toggleBtn, textData.bold ? styles.active : '']
                .filter(Boolean)
                .join(' ')}
              onClick={() => updateTextData({ bold: !textData.bold })}
              title="加粗"
            >
              <AppIcon name="bold" size={14} />
            </button>
            <button
              className={[styles.toggleBtn, textData.italic ? styles.active : '']
                .filter(Boolean)
                .join(' ')}
              onClick={() => updateTextData({ italic: !textData.italic })}
              title="斜体"
            >
              <AppIcon name="italic" size={14} />
            </button>
            <button
              className={[styles.toggleBtn, textData.underline ? styles.active : '']
                .filter(Boolean)
                .join(' ')}
              onClick={() => updateTextData({ underline: !textData.underline })}
              title="下划线"
            >
              <AppIcon name="underline" size={14} />
            </button>
          </div>
          <div className={styles.toggleGroup}>
            <button
              className={[
                styles.toggleBtn,
                textData.textAlign === 'left' ? styles.active : '',
              ]
                .filter(Boolean)
                .join(' ')}
              onClick={() => updateTextData({ textAlign: 'left' })}
              title="左对齐"
            >
              <AppIcon name="align-left" size={14} />
            </button>
            <button
              className={[
                styles.toggleBtn,
                textData.textAlign === 'center' ? styles.active : '',
              ]
                .filter(Boolean)
                .join(' ')}
              onClick={() => updateTextData({ textAlign: 'center' })}
              title="居中"
            >
              <AppIcon name="align-center" size={14} />
            </button>
            <button
              className={[
                styles.toggleBtn,
                textData.textAlign === 'right' ? styles.active : '',
              ]
                .filter(Boolean)
                .join(' ')}
              onClick={() => updateTextData({ textAlign: 'right' })}
              title="右对齐"
            >
              <AppIcon name="align-right" size={14} />
            </button>
          </div>
        </div>
      </section>

      {/* 背景 */}
      <section className={styles.section}>
        <label className={styles.label}>背景</label>
        <div className={styles.row}>
          <input
            type="color"
            className={styles.colorInput}
            value={
              textData.backgroundColor === 'transparent'
                ? '#000000'
                : textData.backgroundColor
            }
            onChange={(e) => updateTextData({ backgroundColor: e.target.value })}
            title="背景颜色"
          />
          <button
            className={[
              styles.toggleBtn,
              textData.backgroundColor === 'transparent' ? styles.active : '',
            ]
              .filter(Boolean)
              .join(' ')}
            onClick={() =>
              updateTextData({
                backgroundColor:
                  textData.backgroundColor === 'transparent'
                    ? 'rgba(0,0,0,0.5)'
                    : 'transparent',
              })
            }
          >
            {textData.backgroundColor === 'transparent' ? '透明' : '有色'}
          </button>
        </div>
      </section>

      {/* 描边与阴影 */}
      <section className={styles.section}>
        <label className={styles.label}>描边</label>
        <div className={styles.row}>
          <input
            type="color"
            className={styles.colorInput}
            value={textData.strokeColor}
            onChange={(e) => updateTextData({ strokeColor: e.target.value })}
            title="描边颜色"
          />
          <input
            type="number"
            className={styles.numberInput}
            value={textData.strokeWidth}
            min={0}
            max={10}
            onChange={(e) =>
              updateTextData({ strokeWidth: Number(e.target.value) })
            }
          />
        </div>
        <label className={styles.label}>阴影</label>
        <div className={styles.row}>
          <input
            type="color"
            className={styles.colorInput}
            value={textData.shadowColor}
            onChange={(e) => updateTextData({ shadowColor: e.target.value })}
            title="阴影颜色"
          />
          <input
            type="number"
            className={styles.numberInput}
            value={textData.shadowBlur}
            min={0}
            max={50}
            placeholder="模糊"
            onChange={(e) =>
              updateTextData({ shadowBlur: Number(e.target.value) })
            }
          />
        </div>
        <div className={styles.row}>
          <input
            type="number"
            className={styles.numberInput}
            value={textData.shadowOffsetX}
            min={-50}
            max={50}
            placeholder="X偏移"
            onChange={(e) =>
              updateTextData({ shadowOffsetX: Number(e.target.value) })
            }
          />
          <input
            type="number"
            className={styles.numberInput}
            value={textData.shadowOffsetY}
            min={-50}
            max={50}
            placeholder="Y偏移"
            onChange={(e) =>
              updateTextData({ shadowOffsetY: Number(e.target.value) })
            }
          />
        </div>
      </section>

      {/* 间距 */}
      <section className={styles.section}>
        <label className={styles.label}>间距</label>
        <div className={styles.sliderRow}>
          <span className={styles.sliderLabel}>字间距</span>
          <input
            type="range"
            min={-5}
            max={20}
            step={0.5}
            value={textData.letterSpacing}
            onChange={(e) =>
              updateTextData({ letterSpacing: Number(e.target.value) })
            }
          />
          <span className={styles.sliderValue}>{textData.letterSpacing}px</span>
        </div>
        <div className={styles.sliderRow}>
          <span className={styles.sliderLabel}>行间距</span>
          <input
            type="range"
            min={1}
            max={3}
            step={0.1}
            value={textData.lineHeight}
            onChange={(e) =>
              updateTextData({ lineHeight: Number(e.target.value) })
            }
          />
          <span className={styles.sliderValue}>{textData.lineHeight}</span>
        </div>
      </section>

      {/* 变换 */}
      <section className={styles.section}>
        <label className={styles.label}>变换</label>
        <div className={styles.sliderRow}>
          <span className={styles.sliderLabel}>透明度</span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={textData.opacity}
            onChange={(e) =>
              updateTextData({ opacity: Number(e.target.value) })
            }
          />
          <span className={styles.sliderValue}>
            {Math.round(textData.opacity * 100)}%
          </span>
        </div>
        <div className={styles.sliderRow}>
          <span className={styles.sliderLabel}>旋转</span>
          <input
            type="range"
            min={0}
            max={360}
            step={1}
            value={textData.rotation}
            onChange={(e) =>
              updateTextData({ rotation: Number(e.target.value) })
            }
          />
          <span className={styles.sliderValue}>{textData.rotation}°</span>
        </div>
      </section>

      {/* 删除 */}
      <section className={styles.section}>
        <Button
          variant="destructive"
          className={styles.deleteButton}
          onClick={onDelete}
        >
          <AppIcon name="trash-2" size={14} />
          删除文字
        </Button>
      </section>
    </>
  );
}

// ── 动画 Tab ──

function AnimationTab({
  textData,
  updateTextData,
  advancedOpen,
  setAdvancedOpen,
}: {
  textData: TextOverlayData;
  updateTextData: (u: Partial<TextOverlayData>) => void;
  advancedOpen: boolean;
  setAdvancedOpen: (v: boolean) => void;
}) {
  const anim = textData.animation;

  return (
    <>
      {/* 入场动画 */}
      <section className={styles.section}>
        <label className={styles.label}>入场</label>
        <div className={styles.presetGrid}>
          {ENTER_PRESETS.map((p) => (
            <button
              key={p.value}
              className={[
                styles.presetCard,
                anim.enter === p.value ? styles.active : '',
              ]
                .filter(Boolean)
                .join(' ')}
              onClick={() =>
                updateTextData({
                  animation: { ...anim, enter: p.value },
                })
              }
            >
              {p.label}
            </button>
          ))}
        </div>
      </section>

      {/* 循环动画 */}
      <section className={styles.section}>
        <label className={styles.label}>循环</label>
        <div className={styles.presetGrid}>
          {LOOP_PRESETS.map((p) => (
            <button
              key={p.value}
              className={[
                styles.presetCard,
                anim.loop === p.value ? styles.active : '',
              ]
                .filter(Boolean)
                .join(' ')}
              onClick={() =>
                updateTextData({
                  animation: { ...anim, loop: p.value },
                })
              }
            >
              {p.label}
            </button>
          ))}
        </div>
      </section>

      {/* 出场动画 */}
      <section className={styles.section}>
        <label className={styles.label}>出场</label>
        <div className={styles.presetGrid}>
          {EXIT_PRESETS.map((p) => (
            <button
              key={p.value}
              className={[
                styles.presetCard,
                anim.exit === p.value ? styles.active : '',
              ]
                .filter(Boolean)
                .join(' ')}
              onClick={() =>
                updateTextData({
                  animation: { ...anim, exit: p.value },
                })
              }
            >
              {p.label}
            </button>
          ))}
        </div>
      </section>

      {/* 高级设置 */}
      <section className={styles.section}>
        <button
          className={styles.advancedToggle}
          onClick={() => setAdvancedOpen(!advancedOpen)}
        >
          {advancedOpen
            ? <AppIcon name="chevron-down" size={14} />
            : <AppIcon name="chevron-right" size={14} />
          }
          <span>高级设置</span>
        </button>
        {advancedOpen && (
          <div className={styles.advancedContent}>
            <div className={styles.row}>
              <span className={styles.sliderLabel}>入场时长</span>
              <input
                type="number"
                className={styles.numberInput}
                value={anim.enterDurationMs}
                min={100}
                max={3000}
                step={100}
                onChange={(e) =>
                  updateTextData({
                    animation: {
                      ...anim,
                      enterDurationMs: Number(e.target.value),
                    },
                  })
                }
              />
              <span className={styles.sliderValue}>ms</span>
            </div>
            <div className={styles.row}>
              <span className={styles.sliderLabel}>出场时长</span>
              <input
                type="number"
                className={styles.numberInput}
                value={anim.exitDurationMs}
                min={100}
                max={3000}
                step={100}
                onChange={(e) =>
                  updateTextData({
                    animation: {
                      ...anim,
                      exitDurationMs: Number(e.target.value),
                    },
                  })
                }
              />
              <span className={styles.sliderValue}>ms</span>
            </div>
          </div>
        )}
      </section>
    </>
  );
}

// ── 模板 Tab ──

function TemplateTab({
  textData,
  updateTextData,
}: {
  textData: TextOverlayData;
  updateTextData: (u: Partial<TextOverlayData>) => void;
}) {
  return (
    <section className={styles.section}>
      <label className={styles.label}>文字模板</label>
      <div className={styles.templateGrid}>
        {TEXT_TEMPLATES.map((tpl) => (
          <button
            key={tpl.id}
            className={styles.templateCard}
            onClick={() => {
              const currentContent = textData.content;
              updateTextData({ ...tpl.textData, content: currentContent });
            }}
          >
            <span className={styles.templateName}>{tpl.name}</span>
            <span className={styles.templateDesc}>
              {TEMPLATE_DESCRIPTIONS[tpl.id] ?? ''}
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}
