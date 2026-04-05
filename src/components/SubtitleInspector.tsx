import { useCallback, useMemo, useState } from "react";
import { Sparkles, Palette, SlidersHorizontal } from "lucide-react";
import { getAISettingsIssue } from "../lib/ai-settings";
import { generateSubtitleHighlights } from "../lib/subtitle-highlight-runner";
import { filterValidSubtitleHighlights } from "../lib/subtitle-highlights";
import { getFileNameFromPath } from "../lib/utils";
import type { SubtitleStyle } from "../types";
import { loadAISettings } from "../store/ai";
import { useTimelineStore } from "../store/timeline";
import { Button, Switch, NumberField, Select, ColorField } from "../ui";
import styles from "./SubtitleInspector.module.css";

export function SubtitleInspector() {
  const [isGeneratingHighlights, setIsGeneratingHighlights] = useState(false);
  const [subtitleHighlightError, setSubtitleHighlightError] = useState<
    string | null
  >(null);
  const { srtEntries, setSubtitleHighlights, timeline, updateSubtitleStyle } =
    useTimelineStore();
  const validSubtitleHighlights = useMemo(
    () =>
      filterValidSubtitleHighlights(
        srtEntries,
        timeline.subtitleHighlights ?? [],
      ),
    [srtEntries, timeline.subtitleHighlights],
  );
  const storedSubtitleHighlightCount = timeline.subtitleHighlights?.length ?? 0;
  const expiredSubtitleHighlightCount = Math.max(
    0,
    storedSubtitleHighlightCount - validSubtitleHighlights.length,
  );
  const summaryText = useMemo(() => {
    if (!timeline.podcast.srtPath) {
      return "还没有导入 SRT 字幕文件，导入后就可以生成关键词高亮并在这里调整样式。";
    }

    if (subtitleHighlightError) {
      return subtitleHighlightError;
    }

    if (isGeneratingHighlights) {
      return "AI 正在分析字幕关键词，生成完成后会自动更新底部字幕轨和右侧预览。";
    }

    if (storedSubtitleHighlightCount === 0) {
      return "当前还没有生成关键词高亮，建议先生成一版，再细调颜色、圆角与动画。";
    }

    if (expiredSubtitleHighlightCount > 0) {
      return validSubtitleHighlights.length > 0
        ? `当前有 ${validSubtitleHighlights.length} 处有效高亮，另有 ${expiredSubtitleHighlightCount} 处因字幕变化已过期。`
        : "已有高亮结果全部过期，建议重新生成。";
    }

    return `当前已有 ${validSubtitleHighlights.length} 处关键词高亮，可继续微调样式。`;
  }, [
    expiredSubtitleHighlightCount,
    isGeneratingHighlights,
    storedSubtitleHighlightCount,
    subtitleHighlightError,
    timeline.podcast.srtPath,
    validSubtitleHighlights.length,
  ]);

  const handleGenerateSubtitleHighlights = useCallback(async () => {
    const settings = loadAISettings();
    const settingsIssue = getAISettingsIssue(settings);
    if (settingsIssue) {
      setSubtitleHighlightError(settingsIssue);
      return;
    }

    if (srtEntries.length === 0) {
      setSubtitleHighlightError("请先导入 SRT 字幕文件");
      return;
    }

    setIsGeneratingHighlights(true);
    setSubtitleHighlightError(null);

    try {
      const highlights = await generateSubtitleHighlights(srtEntries, settings);
      setSubtitleHighlights(highlights);
      updateSubtitleStyle({ highlightEnabled: true });
    } catch (error) {
      setSubtitleHighlightError(
        error instanceof Error ? error.message : "字幕关键词高亮生成失败",
      );
    } finally {
      setIsGeneratingHighlights(false);
    }
  }, [setSubtitleHighlights, srtEntries, updateSubtitleStyle]);

  const handleSubtitleStyleUpdate = useCallback(
    (updates: Partial<SubtitleStyle>) => {
      setSubtitleHighlightError(null);
      updateSubtitleStyle(updates);
    },
    [updateSubtitleStyle],
  );

  const srtFileName = timeline.podcast.srtPath
    ? getFileNameFromPath(timeline.podcast.srtPath)
    : "等待导入字幕";

  return (
    <div className={styles.root}>
      {/* Section 1 — 关键词高亮 */}
      <div className={styles.section}>
        <div className={styles.sectionHeader}>
          <Sparkles size={12} className={styles.sectionIcon} />
          <span className={styles.sectionTitle}>关键词高亮</span>
        </div>

        {/* 状态卡片 */}
        <div className={styles.statusCard}>
          <span className={styles.statusCardMeta}>{srtFileName}</span>
          <span className={styles.statusCardText}>{summaryText}</span>
        </div>

        {subtitleHighlightError && (
          <span className={styles.errorText}>{subtitleHighlightError}</span>
        )}

        <div className={styles.actionRow}>
          <Button
            onClick={() => void handleGenerateSubtitleHighlights()}
            loading={isGeneratingHighlights}
            disabled={!timeline.podcast.srtPath}
            variant="primary"
          >
            {storedSubtitleHighlightCount > 0 ? "重新生成高亮" : "生成高亮"}
          </Button>
        </div>

        <div className={styles.switchRow}>
          <span className={styles.switchLabel}>启用关键词高亮</span>
          <Switch
            label=""
            checked={timeline.subtitle.highlightEnabled}
            onChange={(checked) =>
              handleSubtitleStyleUpdate({ highlightEnabled: checked })
            }
          />
        </div>
      </div>

      {/* Section 2 — 颜色与圆角 */}
      <div className={styles.section}>
        <div className={styles.sectionHeader}>
          <Palette size={12} className={styles.sectionIcon} />
          <span className={styles.sectionTitle}>颜色与圆角</span>
        </div>

        {/* 颜色行 */}
        <div className={styles.colorRow}>
          <ColorField
            label="底色"
            value={timeline.subtitle.highlightBackgroundColor}
            onChange={(value) =>
              handleSubtitleStyleUpdate({ highlightBackgroundColor: value })
            }
          />
          <ColorField
            label="文字"
            value={timeline.subtitle.highlightTextColor}
            onChange={(value) =>
              handleSubtitleStyleUpdate({ highlightTextColor: value })
            }
          />
        </div>

        {/* 圆角与留白行 */}
        <div className={styles.numberRow}>
          <NumberField
            label="圆角 (px)"
            value={timeline.subtitle.highlightRadius}
            min={0}
            max={24}
            onChange={(value) =>
              handleSubtitleStyleUpdate({ highlightRadius: value })
            }
          />
          <NumberField
            label="横留白 (px)"
            value={timeline.subtitle.highlightPaddingX}
            min={0}
            max={24}
            onChange={(value) =>
              handleSubtitleStyleUpdate({ highlightPaddingX: value })
            }
          />
        </div>

        <NumberField
          label="纵留白 (px)"
          value={timeline.subtitle.highlightPaddingY}
          min={0}
          max={16}
          onChange={(value) =>
            handleSubtitleStyleUpdate({ highlightPaddingY: value })
          }
        />
      </div>

      {/* Section 3 — 动画与预览 */}
      <div className={styles.section}>
        <div className={styles.sectionHeader}>
          <SlidersHorizontal size={12} className={styles.sectionIcon} />
          <span className={styles.sectionTitle}>动画与预览</span>
        </div>

        {/* 动画选择 */}
        <div className={styles.fieldRow}>
          <span className={styles.fieldLabel}>动画</span>
          <div className={styles.fieldControl}>
            <Select
              value={timeline.subtitle.highlightAnimation}
              options={[
                { value: "pop", label: "弹入" },
                { value: "wipe", label: "擦入" },
                { value: "none", label: "无动画" },
              ]}
              onChange={(event) =>
                handleSubtitleStyleUpdate({
                  highlightAnimation: event.target.value as SubtitleStyle["highlightAnimation"],
                })
              }
            />
          </div>
        </div>

        {/* 效果预览 */}
        <div className={styles.preview}>
          <span className={styles.previewPrefix}>这一句真正的重点是</span>
          <span
            className={styles.previewChip}
            style={{
              background: timeline.subtitle.highlightBackgroundColor,
              color: timeline.subtitle.highlightTextColor,
              borderRadius: timeline.subtitle.highlightRadius,
              padding: `${timeline.subtitle.highlightPaddingY}px ${timeline.subtitle.highlightPaddingX}px`,
            }}
          >
            世界冠军
          </span>
        </div>
      </div>
    </div>
  );
}
