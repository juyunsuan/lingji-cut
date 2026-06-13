# Changelog

本项目所有显著变更将记录在此文件。格式遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，版本号遵循 [Semantic Versioning](https://semver.org/lang/zh-CN/)。

## [Unreleased]

### Added
- **内置 Pi agent（ACP 接入）**：在原有 Claude Code ACP 之外，新增内置 [Pi coding agent](https://pi.dev) 接入，通过 `npx -y pi-acp` 适配器零安装启动（内部 `pi --mode rpc`）。Agent 设置页可在 Claude Code / Pi 间切换并分别配置/预检；新建会话按"已启用 agent"选择连接目标。引入 `AgentProfile` 注册表把原硬编码 `claude-acp` 的连接/预检参数化（`electron/acp/agent-profiles.ts`）；Pi 走"预检提示、不代管"模式——应用只管 pi-acp 适配器，`pi` 本体与模型 provider 凭证由用户在 pi 侧配置（预检检测 `pi` 是否在 PATH）。
- **AI File-First 编辑 + 实时热重载**：外部 CLI agent（Claude Code / Codex / Gemini 等）现在可直接编辑项目文件来改视频与文稿，编辑器实时把改动热重载到预览，形成「AI 改文件 → 编辑器实时反映」闭环。
  - **Motion Card 源码外置**：卡片 TSX 源码从 `project.json` 内嵌字符串外置为独立文件 `ai-cards/<overlayId>/motionCard.tsx`，`project.json` 只存 `tsxPath` 引用；内存态始终带源码、仅落盘时剥离（编译/渲染管线零改动），老项目首次加载自动迁移（`src/lib/motion-card-externalize.ts`）。
  - **文件信号会话锁**：AI 编辑前写 `.lingji/edit-lock.json`（带 `heartbeat`/`ttlMs`），编辑器据此暂停自动保存、状态栏显示「AI 正在编辑」，避免内存态覆盖外部改动；忘记解锁时按 TTL 自动释放（`electron/ai-edit/`）。
  - **实时热重载钩子**：`project.json`、`ai-cards/**/motionCard.tsx`、`script.md`/`original.md` 的外部变更经 chokidar 灌回对应 store 并刷新预览；`script.md` 外部保存补建版本历史（`source: external`）（`src/lib/external-edit-sync.ts`）。
  - **校验守门 + 结果回传**：外部改 `project.json` 经基础约束校验（时间为正、动画枚举合法），结果写 `.lingji/edit-result.json` 供 agent 自查，校验失败的脏数据不灌回预览，无需调用 MCP 工具（`src/lib/external-edit-validate.ts`）。
  - **文件契约文档 + 两个 Skill**：`docs/ai-contract/`（视频/文稿/锁/结果协议）+ `lingji-video-edit` / `lingji-script-edit` 两个边界清晰的 file-first skill；ACP 连接时把契约要点同步进项目目录的 `CLAUDE.md` / `AGENTS.md` / `GEMINI.md`（`electron/acp/contract-sync.ts`）。

## [1.2.0] - 2026-06-13

本版本带来全新的命令行工具 `lingji` 与配套的 headless（无头）主进程执行框架：音频、字幕分析、卡片、封面、导出等流水线步骤现在都能在终端里驱动，无需点开界面逐步操作。全部能力向后兼容，桌面端原有交互不受影响。

### Added
- **全新命令行工具 `lingji`**：无头 CLI，通过 MCP 服务地址与运行中的灵机剪影桌面端通信，在终端里驱动完整创作流水线（`cli/src/`）。覆盖子命令：
  - `project current | list | open` — 查看活动项目 / 列最近项目 / 切换项目
  - `audio gen` — 生成口播音频（MiniMax TTS，写盘 + SRT）
  - `subtitle analyze` — 字幕分析 + 卡片生成
  - `cards list | show | update | regenerate | regen-media | convert | delete` — AI 卡片的查看与重生成 / 重生成媒体 / 图片卡转 Motion 卡 / 删除
  - `cover prompt | image | gen` — 封面提示词 / 出图 / 一次性生成
  - `export` — 导出 MP4
  - `task status | list | cancel | wait <id>` — 任务查询与控制（支持 `--wait` 轮询至完成）
  - 全局开关 `--json`（机器可读输出）、`--server <url>`（覆盖 MCP 服务地址）
  - `npm run install:cli` / `uninstall:cli` 一键全局安装 / 卸载 `lingji` 命令
- **Headless 主进程执行框架**：TTS / 字幕分析 / 卡片 / 封面 / 导出全部可在无 UI 交互下由主进程直接执行，并通过刷新信号让已打开的项目同步最新结果（`registerGenerationTool`、`renderVideoHeadless`、完整 `AISettings` 装配与迁移链）。
- **新增 pipeline MCP 工具**：`lingji_generate_audio`、`lingji_analyze_subtitles`、`lingji_export_video`、卡片操作系列（list / get / update / delete / regenerate / regen-media / convert）、`lingji_get_active_project`、`lingji_list_recent_projects`，供外部 AI（Claude Code / Codex / Gemini）远程编排。
- **MCP 端点发现文件**：服务启停时写入 / 删除端点文件，CLI 据此自动定位运行中的服务地址，无需手动传 `--server`。
- **应用级错误边界 `AppErrorBoundary`**：页面渲染期抛错时转为可见错误信息 + 恢复入口，避免整窗黑屏（典型触发：项目切换时的中间不一致渲染），并暴露真正抛错的组件便于定位（`src/components/AppErrorBoundary.tsx`）。

### Changed
- **`lingji_open_project` 切换运行中窗口**：校验通过后经 `menu-action` 通道复用「打开最近项目」流程，让运行中的窗口直接切到目标项目（此前仅校验目录合法性）。
- **渲染进程订阅 `pipeline:project-updated`**：headless 写盘后，已打开的项目在 Renderer 侧自动刷新（新增 IPC 通道，向后兼容）。
- **`App.setPage` 对相同目标页短路**：避免 `AnimatePresence mode="wait"` 退化为「同页退出再进入」而卡成空白。

### Fixed
- **图片卡转 Motion 卡字幕分支**：`convert→motion` 补齐 `cardTemplate` / `imageTemplate` / `stylePresetId`，转换后样式不再丢失。
- **`audio gen` UI 刷新失效**：音频生成结果写回 `timeline.podcast`，使已打开项目的 UI 刷新生效。

## [1.1.0] - 2026-06-06

本版本是 v1.0.1 以来的一次大版本更新：渲染引擎整体从 HyperFrames 迁移到 Remotion，并带来卡片风格模板库、多 Provider TTS 音色体系、AI 卡片增量流式呈现等多项新能力。

### Added
- **AI 卡片增量流式呈现与自动落轨**：一键分析从「批处理结尾一次性出现」改为增量呈现——规划完成即铺出每个分段的骨架占位卡，每张卡片生成完即就地填充为真实卡片并自动落轨（进入时间线），无需手动「上轨」；取消 / 报错时保留已生成并落轨的卡片，仅清理剩余 pending 骨架。配套 `analyze-progress-bridge` 把卡片生命周期经 IPC 增量回传渲染端（`src/store/ai.ts`、`src/store/timeline.ts`、`src/lib/analyze-progress-bridge.ts`、`src/remotion/ai-card-render-plan.ts`）。
- **卡片生成父子任务嵌套进度**：`task-progress` 支持父子任务模型，`TaskProgressPanel` / 一键流水线嵌套渲染单卡子任务，长流程中可逐张看到实时进度。
- **段落卡 / 图片卡「风格模板库」**：内置 10 个系统预设风格（swiss-grid、nyt-data、xhs-pastel、mono-bold、soft-apple、dark-graph、hand-sketch、film-leak、cyber-glitch 等），支持全局 / 项目 / 单卡三级选择，每个风格附带零 LLM、秒开的静态预览 demo（`src/lib/card-style-presets/`、`StyleLibraryPanel`、`StylePresetPreview`）。
- **多 Provider TTS 与克隆音色体系**：TTS 设置从单一 MiniMax 升级为可扩展的多 Provider + 音色库，支持 MiniMax T2A v2 与 Xiaomi MiMo（含 `mimo-v2.5-tts-voiceclone` 克隆音色：参考音频 Base64 上传），旧配置自动迁移为默认 Provider / 默认音色（`TTSProviderDialog`、`TTSVoiceDialog`、`tts-settings.ts`、`tts-provider-runner.ts`）。
- **MiMo TTS 表现力增强 + 长文本分块合成**：口播模板新增 TTS 字段，AI 句级打标驱动情绪/语气变化，长文本分块合成并按块生成字幕，缓解「声音太平」（`xiaomi-mimo-tts.ts`、`tts/mimo-annotate.ts`、`tts/mimo-style.ts`、`tts-chunking.ts`、`media-concat.ts`）。
- **预览音频预载**：`src/remotion/preview-audio-preload.ts` 在预览前预载音频，减少播放抖动。
- **MiniMax 关思考走 Anthropic 端点**：新增 `@langchain/anthropic`，MiniMax 关闭 thinking 时改走 Anthropic 端点（OpenAI 端点会忽略 `enable_thinking`）。

### Changed
- **渲染引擎从 HyperFrames 切换为 Remotion**：预览改用 `@remotion/player`，导出改用 `@remotion/bundler` + `@remotion/renderer`（自带 Chrome Headless Shell + ffmpeg）。`TimelineData` 仍是唯一数据源，经 `buildRenderPlan` 编译为 Remotion 组件树（`src/remotion/`、`electron/remotion/`）。
- **AI Motion Card 改为自由 Remotion TSX**：LLM 产出 `motionCard.tsx`（default export 函数组件），主进程用 esbuild 编译为 CJS，经 `inputProps.compiledCards` 注入，由 `CardHost` 在 Remotion 上下文内求值；预览与导出共用同一份编译产物。`motion.*` 提示词同步改版为帧驱动（useCurrentFrame/interpolate/spring）。
- **风格库并入「项目统一风格」**：移除自由文本 `project.style`，项目统一风格完全由所选风格预设承载，消除「自由文本 + 风格预设」两套重叠概念，配置入口收敛为「只选模板」。
- **时间线播放体验**：拖动播放头时暂停 / 松手续播，缩放与定位时把播放头居中，修复预览中字幕与卡片的显隐时机。

### Removed
- 移除 `hyperframes` / `@hyperframes/player` 依赖与相关代码（`src/hyperframes/composition.ts`、`HyperframesPreviewPlayer`、`electron/hyperframes-cli.ts`、`electron/hyperframes-runtime-preflight.ts`、`hyperframes-runtime-preflight` IPC）。
- 移除自由文本 `project.style` 及其 `{{projectStylePrompt}}` / `{{projectStylePromptBlock}}` 提示词注入路径。

### Fixed
- **分段时间漂移 / 溢出**：规划分段重锚定到字幕真实时间轴（单调匹配 + 丢弃越界段），杜绝卡片时间漂移与溢出。
- **时间线大量空白**：新卡片时长默认铺满所在 segment（此前固定 5s）。
- **重复触发内容卡片分析**：头部按钮禁用 + 重入锁，消除多条并发进度。
- **pipeline 适配**：`register.ts` 适配 Zod4 `z.record` 二参，`ToolResult` 结构兼容 `CallToolResult`。

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

[1.2.0]: https://github.com/yoqu/lingji-cut/compare/v1.1.0...v1.2.0
[1.1.0]: https://github.com/yoqu/lingji-cut/compare/v1.0.1...v1.1.0
[1.0.1]: https://github.com/yoqu/lingji-cut/compare/v1.0.0...v1.0.1
[1.0.0]: https://github.com/yoqu/lingji-cut/releases/tag/v1.0.0
