# Changelog

本项目所有显著变更将记录在此文件。格式遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，版本号遵循 [Semantic Versioning](https://semver.org/lang/zh-CN/)。

## [Unreleased]

### Changed
- **渲染引擎从 HyperFrames 切换为 Remotion**：预览改用 `@remotion/player`，导出改用 `@remotion/bundler` + `@remotion/renderer`（自带 Chrome Headless Shell + ffmpeg）。`TimelineData` 仍是唯一数据源，经 `buildRenderPlan` 编译为 Remotion 组件树（`src/remotion/`、`electron/remotion/`）。
- **AI Motion Card 改为自由 Remotion TSX**：LLM 产出 `motionCard.tsx`（default export 函数组件），主进程用 esbuild 编译为 CJS，经 `inputProps.compiledCards` 注入，由 `CardHost` 在 Remotion 上下文内求值；预览与导出共用同一份编译产物。`motion.*` 提示词同步改版为帧驱动（useCurrentFrame/interpolate/spring）。

### Removed
- 移除 `hyperframes` / `@hyperframes/player` 依赖与相关代码（`src/hyperframes/composition.ts`、`HyperframesPreviewPlayer`、`electron/hyperframes-cli.ts`、`electron/hyperframes-runtime-preflight.ts`、`hyperframes-runtime-preflight` IPC）。

### Migration
- 旧工程的 `motionCard.html`（HTML+GSAP）加载时降级为占位并标记 `needsRegeneration`，不崩溃；Inspector 提示重新生成为 Remotion 卡片。

## [1.0.1] - 2026-05-27

### Added
- **Motion Card 字幕注入**：Motion Card 运行时新增 `MotionSubtitleCue` / `props.subtitles`，LLM 生成的动画按讲述节奏分步触发；`AICardOverlay` / `MotionCardOverlay` / `PodcastComposition` 物化 Motion Card 字幕窗。
- **一键流水线 telemetry**：新增 `src/lib/telemetry/auto-run.ts` 与 `electron/telemetry/auto-run-logger.ts`，把阶段耗时与单卡耗时写入 jsonl，用户报"慢"时可直接查日志定位瓶颈。
- **COVER_REGENERATION 接入一键流水线**：单条封面可在一键工作流内重生，无需手动重跑整个流程。
- **AGENTS.md**：新增本地协作指南。
- **Promo assets**：补充推广素材。

### Changed
- **封面 / 卡片提示词全面改版**：引入新视觉系统，`cards.segment` 提示词升级到 v7（motion-only，image 段直接走 `card.image` 链路），与新一代图像 Provider 配合更稳。
- **AIStore / AISegmentAnalysis 字段扩展**：配合 Motion Card 字幕窗与 telemetry 落地。
- **subtitle-highlight-runner / llm/index**：围绕 telemetry 做配套增强。

### Removed
- 移除 `electron-installer-dmg` 依赖，DMG 改用 `hdiutil` 生成，减少打包链路上的脆弱点。

### Build / Packaging
- macOS 多架构（arm64 + x64）DMG，Windows x64 zip 通过 GitHub Actions 自动构建并发布。

[1.0.1]: https://github.com/yoqu/lingji-cut/compare/v1.0.0...v1.0.1
[1.0.0]: https://github.com/yoqu/lingji-cut/releases/tag/v1.0.0
