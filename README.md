# Podcast Video Editor

一个本地优先的桌面播客视频编辑器。它把 `MP3 + SRT` 转成可编辑的视频时间轴，支持预览、素材叠加、AI 信息卡生成、封面候选图生成，以及最终导出 `MP4`。

## 适用场景

- 给口播播客、知识分享、解说音频快速搭建视频版
- 基于字幕生成章节卡、总结卡、数据卡、观点卡等 AI 视觉内容
- 在本地项目目录中持续迭代一个视频工程，而不是每次从头开始

## 当前能力

- 导入 `MP3` 音频与 `SRT` 字幕
- 自动创建时间轴并在 Remotion Player 中预览
- 添加图片 / 视频素材到视觉轨道
- 支持 AI 分析字幕，生成信息卡和封面提示词
- 支持用即梦接口生成封面候选图并落到项目目录
- 支持导出 `H.264 MP4`
- 支持最近工程、自动保存状态、撤销 / 重做

## 技术栈

- Electron
- React 19
- TypeScript
- Remotion
- Zustand
- Vitest
- electron-vite

## 快速开始

### 1. 安装依赖

```bash
npm install
```

### 2. 启动开发环境

```bash
npm run dev
```

### 3. 构建桌面产物

```bash
npm run build
```

### 4. 打包 macOS 应用

```bash
npm run package:mac
```

如果你想一步完成构建和打包：

```bash
npm run dist:mac
```

默认会在 `release/` 目录下生成：

- `release/灵机剪影-darwin-arm64/灵机剪影.app`
- 或 `release/灵机剪影-darwin-x64/灵机剪影.app`

补充说明：

- 当前产物是本地可运行的 `.app`
- 还没有接入正式签名、notarization、DMG/PKG 分发
- 当前导出链路依赖 `src/remotion/index.ts` 在包内可访问，打包时不要排除 `src/`

### 5. 运行测试

```bash
npm test
```

## 使用流程

1. 启动应用后，先选择或新建一个项目目录。
2. 在 Setup 页导入 `MP3` 和 `SRT`。
3. 进入 Editor 页后，在预览区、时间轴和素材区完成编辑。
4. 如需 AI 信息卡，先在 AI 面板填写模型配置，再发起字幕分析。
5. 如需封面图，可使用即梦接口生成候选图，图片会保存在项目目录下的 `covers/`。
6. 点击“导出 MP4”，选择输出路径并开始渲染。

## AI 配置说明

应用当前通过界面录入 AI 配置，不依赖仓库内 `.env` 文件。现有配置项包括：

- `llmBaseUrl`
- `llmApiKey`
- `llmModel`
- `jimengApiUrl`
- `jimengSessionId`

说明：

- LLM 接口按 OpenAI 兼容的 `/chat/completions` 结构调用
- 即梦封面生成通过 `/v1/images/generations` 调用
- 不要把真实密钥硬编码到源码里

## 项目目录产物

应用运行时会把工程数据保存在你选定的“项目目录”，而不是保存在仓库根目录。当前默认产物包括：

- `timeline.json`：时间轴与素材编排数据
- `ai-analysis.json`：AI 分析结果与卡片信息
- `covers/`：封面候选图

仓库里的 `work/` 目录只是示例 / 调试产物，不应当被当作唯一真实数据源。

## 目录结构

```text
electron/                Electron 主进程、菜单、preload
src/
  components/            UI 组件
  hooks/                 自定义 hooks
  lib/                   核心工具、AI、导出、预览与平台桥接逻辑
  pages/                 Setup / Editor 页面
  remotion/              Remotion 组合与渲染组件
  store/                 Zustand 状态
  types.ts               时间轴核心类型
  types/ai.ts            AI 卡片与设置类型
tests/                   Vitest 测试
work/                    示例工程输出
```

## 关键架构约束

- Renderer 只能通过 `window.electronAPI` 访问主进程能力
- `electron/main.ts`、`electron/preload.ts`、`src/lib/electron-api.ts` 必须保持同步
- Remotion 导出入口依赖 `src/remotion/index.ts`，组合 ID 固定为 `PodcastComposition`
- Setup 阶段当前只接受 `MP3` 和 `SRT`
- 导出格式当前固定为 `MP4 (H.264)`

## 常用开发命令

```bash
npm run dev
npm run build
npm run package:mac
npm run dist:mac
npm test
```

如需跑单测，推荐直接使用 Vitest 指定文件：

```bash
npx vitest run tests/editor.test.tsx
```

## 开发建议

- 修改时间轴结构前，先看 `src/types.ts`、`src/store/timeline.ts`
- 修改 AI 卡片结构前，先看 `src/types/ai.ts`、`src/lib/ai-analysis.ts`
- 修改导出链路前，先看 `electron/main.ts`、`src/remotion/`
- 修改 Electron IPC 前，必须同步更新 `main / preload / electron-api / tests`

## 已知边界

- 当前导入音频格式仅支持 `mp3`
- 当前导入字幕格式仅支持 `srt`
- 当前素材导入以本地图片 / 视频文件为主
- 当前 AI 与封面生成能力依赖外部接口可用性

## License

当前仓库 `package.json` 标记为 `ISC`。
