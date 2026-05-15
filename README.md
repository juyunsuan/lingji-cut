# Lingji Cut / 灵剪

![Lingji Cut hero](docs/assets/lingji-cut-hero.png)

🌐 **[访问官网](https://yoqu.github.io/lingji-cut-homepage/)** — 在线了解灵剪的功能特性、使用演示和快速上手指南。

**Lingji Cut（灵剪）** 是一个本地优先的开源 AI 视频创作工作台。它把内容创作中分散的环节串在一起：写稿、素材管理、AI 审稿、语音合成、字幕处理、时间线剪辑、视觉卡片、封面生成和视频导出。

它不是单一的视频播放器或字幕工具，而是面向内容创作者的桌面端创作环境。你可以从一份原始素材开始，逐步生成口播稿、音频、字幕、信息卡和最终视频，也可以直接导入已有音频 / 字幕进入编辑器。

## Highlights

- **AI 写稿工作台**：管理 `original.md` / `script.md`，支持多文件标签、稿件资源、搜索替换、版本历史、AI 生成、AI 审稿和批注采纳。
- **一站式视频工作台**：在同一个界面里管理素材、预览、Inspector、时间线和导出配置。
- **自动口播流程**：支持从文稿触发 TTS、字幕解析、内容分析、封面候选和视觉卡片生成。
- **专业时间线编辑**：支持音频、字幕、图片、视频、文字、AI 卡片、多视觉轨、多音频轨、拖拽、吸附、拆分、裁剪、复制 / 剪切 / 粘贴和轨道锁定。
- **多 Provider AI 配置**：支持 OpenAI 兼容模型、Gemini、LM Studio、图片生成 Provider、MiniMax TTS 等配置。
- **Agent / MCP 集成**：应用内可连接 Claude ACP Runtime，并提供 `lingji_*` MCP 工具给 Claude Code / Codex / Gemini 等客户端操作脚本工作台。
- **Remotion 导出**：通过 Remotion 渲染 `PodcastComposition`，支持 H.264 MP4、分辨率与质量配置、导出进度展示。
- **本地优先**：项目文件保存在用户选择的本地目录，仓库不需要保存任何真实 API Key。

## Screenshots

更多界面截图在 [`宣传制作/`](宣传制作/) 和 [`pics/`](pics/) 目录中。仓库首页宣传图位于 [`docs/assets/lingji-cut-hero.png`](docs/assets/lingji-cut-hero.png)。

## Tech Stack

- Electron 41 + electron-vite
- React 19 + TypeScript 6
- Remotion 4
- Zustand
- CodeMirror 6
- Framer Motion
- TailwindCSS 4 + 自研 macOS 专业工具 UI 组件
- MCP SDK + Claude ACP 集成
- Vitest

## Quick Start

### 1. Install

```bash
npm install
```

仓库包含项目级 `.npmrc`，默认使用 npmmirror 的 npm / Electron / Node 原生模块镜像，适合国内网络环境。npm 11 可能提示 `Unknown project config "electron_mirror"` 等 warning，这通常不代表安装失败。

如果 Electron 下载被本机 npm 配置忽略，可以手动设置：

```bash
export ELECTRON_MIRROR="https://npmmirror.com/mirrors/electron/"
export npm_config_disturl="https://npmmirror.com/mirrors/node/"
npm install
```

Windows PowerShell：

```powershell
$env:ELECTRON_MIRROR="https://npmmirror.com/mirrors/electron/"
$env:npm_config_disturl="https://npmmirror.com/mirrors/node/"
npm install
```

### 2. Development

```bash
npm run dev
```

### 3. Build

```bash
npm run build
```

### 4. Package

macOS：

```bash
npm run dist:mac
```

Windows：

```bash
npm run dist:win
```

### 5. Test

```bash
npm test
```

运行单个测试：

```bash
npx vitest run tests/editor.test.tsx
```

## Common Commands

```bash
npm run dev          # Start Electron + Vite dev server
npm run build        # Build main, preload and renderer
npm run package:win  # Package Windows app directory
npm run dist:win     # Build + package Windows app directory
npm run package:mac  # Package macOS .app
npm run dist:mac     # Build + package macOS .app
npm test             # Run Vitest
npm run test:watch   # Run Vitest in watch mode
```

## Typical Workflow

### 从素材到视频

1. 在欢迎页新建或打开一个本地项目目录。
2. 导入原始文稿，或通过链接导入视频并生成转录文本。
3. 在写稿工作台生成 / 编辑 `script.md`。
4. 使用 AI 审稿批注优化文稿。
5. 触发 AI 视频流水线：TTS、字幕解析、内容分析、封面生成、信息卡排布。
6. 进入视频工作台调整时间线、素材、字幕、卡片和动画。
7. 导出 MP4。

### 从已有音频和字幕开始

1. 新建或打开项目目录。
2. 导入音频和 SRT。
3. 在视频工作台编辑时间线。
4. 可选：运行 AI 分析、生成卡片或封面。
5. 导出 MP4。

## AI Configuration

Lingji Cut 主要通过应用内“设置”页面保存 AI 配置，不依赖仓库内 `.env` 存放密钥。

主要配置区域：

- **AI 基础配置**：管理 OpenAI 兼容、Gemini、LM Studio 等 LLM Provider。
- **图片生成**：管理即梦、OpenAI Image、MiniMax、豆包、Imagen、通义万相和自定义图像 Provider。
- **TTS 语音合成**：配置 MiniMax API Key、音色、语速、音量、音调、情绪和模型。
- **提示词配置**：管理内置 / 全局 / 项目级提示词，并为不同 Prompt Kind 绑定不同 Provider。
- **AI Agent**：配置 Claude ACP Runtime、权限策略和 Agent API Key。
- **MCP 服务**：启动本地 MCP Server，并注册到 Claude Code / Codex / Gemini。
- **配置备份**：导出、预览、导入全局设置与 Agent 配置备份。

> 请不要把真实 API Key、Session ID、Cookie 或访问令牌提交到源码、测试、文档或截图中。

## Project Files

应用运行时会把创作数据保存在用户选择的项目目录中。常见项目文件包括：

- `project.json`：统一工程文件，包含 `timeline`、`aiAnalysis`、`script` 等段落。
- `original.md`：原始素材 / 转录文本。
- `script.md`：口播成稿。
- `podcast-audio.mp3`：TTS 生成的口播音频。
- `podcast-subtitles.srt`：口播字幕。
- `podcast-subtitles.original.srt`：TTS 初始字幕备份。
- `covers/`：封面候选图。
- `ai-cards/`：AI 视觉卡片资源。
- `imports/`：外部视频 / 音频导入产物。
- `configs/prompts/`：项目级提示词覆盖。

历史版本中的 `timeline.json`、`ai-analysis.json`、`script-state.json` 会在加载旧工程时迁移到 `project.json`。

## Repository Structure

```text
electron/
  acp/                  Claude ACP Runtime、权限策略、Agent 配置
  conversations/         Agent 会话数据库与 IPC
  mcp/                   Lingji MCP Server、工具注册、客户端注册配置
  script-history/        脚本文稿版本历史
  video-import/          视频导入、抽音频、ASR、转录落盘
  main.ts                Electron 主进程、IPC、Remotion 渲染
  preload.ts             Renderer 安全桥接
  project-file.ts        project.json 读写与旧工程迁移

src/
  components/            编辑器、时间线、Inspector、AI 面板、Agent UI
  components/script/     脚本工作台文件树、批注、导入预览、版本 UI
  components/settings/   AI、TTS、Agent、MCP、提示词、备份配置页
  hooks/                 AI 视频流水线、连接状态、缩略图等 hooks
  lib/                   AI、提示词、Motion、字幕、导出、持久化、IPC 客户端
  pages/                 Setup、Editor、ScriptWorkbench、Settings
  remotion/              Remotion Composition 与 overlay 渲染
  store/                 timeline、ai、script、agent、task-progress
  ui/                    macOS 风格基础组件、patterns、tokens、motion
  types.ts               时间线核心类型
  types/ai.ts            AI 卡片、Provider、提示词绑定类型

tests/                   Vitest 单元与组件测试
docs/assets/             README 与宣传素材
docs/superpowers/        设计规格与实施计划沉淀
```

## Architecture Notes

- Renderer 不直接使用 Node API。主进程能力通过 `electron/preload.ts` 暴露，并在 `src/lib/electron-api.ts` 声明类型。
- 新增或修改 IPC 时，通常需要同步 `electron/main.ts`、`electron/preload.ts`、`src/lib/electron-api.ts` 和对应测试。
- 工程主存储是 `project.json`。新增工程段落前需要评估迁移、并发写锁和旧数据兼容。
- Remotion 导出入口固定为 `src/remotion/index.ts`，Composition ID 固定为 `PodcastComposition`。
- 导出前会把绝对路径素材映射到临时 public 目录，避免 Remotion 打包时无法访问本地文件。
- 所有耗时操作应接入 `src/store/task-progress.ts` 和底部 `AppStatusBar` 统一进度系统。
- UI 新实现应遵循 `DESIGN.md` 的 macOS 专业创作工具规范。
- Agent / MCP 操作脚本文稿时，应优先通过 `lingji_*` MCP 工具进入编辑器状态。

## Security

- `.env`、`.tmp/`、`work/`、`.agents/`、`.claude/`、构建产物和本地运行产物已加入 `.gitignore`。
- 仓库不应包含真实 API Key、Session ID、Cookie、私钥、配置备份或用户项目数据。
- 如果你曾经在旧仓库或本地历史中提交过真实密钥，请立即在对应服务侧轮换密钥。

## Status

Lingji Cut 目前是桌面优先的创作工具，最小窗口约束约为 `1100 × 760`，暂不以移动端为主要目标。

当前 macOS 打包产物是本地 `.app`，尚未接入正式签名、notarization、DMG / PKG 分发；外部 AI、TTS、ASR、图片生成服务的可用性取决于用户自己的配置。

## Contributing

欢迎提交 issue、建议和 PR。建议在较大改动前先说明你想修改的模块和目标，尤其是时间线、工程存储、IPC、Remotion 导出和 AI Provider 相关改动。

## 友情链接

- [LINUX DO](https://linux.do) — 新一代开源社区

## License

Apache License 2.0. See [LICENSE](LICENSE).
