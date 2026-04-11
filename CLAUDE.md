# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# Video Web Master - 项目级 Agent 规则

## 项目概述

**灵机剪影** — 本地优先的桌面端播客视频编辑器（Electron + React）。核心流程：导入 MP3 + SRT 字幕 → 时间线编辑 → AI 生成信息卡片/封面 → 导出 MP4（H.264）。

## 常用命令

```bash
npm run dev          # 启动 electron-vite 开发服务
npm run build        # 编译 Electron main + preload + React renderer
npm test             # 运行 Vitest（单次）
npm run test:watch   # Vitest watch 模式
npx vitest run tests/editor.test.tsx  # 运行单个测试文件
npm run dist:mac     # 构建并打包 macOS 安装包
```

TypeScript 严格模式，无独立 lint 命令（tsc 兼任类型检查）。

## 架构概览

**技术栈**：Electron 41 / React 19 / TypeScript 6 / Zustand / TailwindCSS 4 / Remotion 4 / CodeMirror 6 / Vitest

**页面路由**（基于状态，无 react-router，`App.tsx` 中 `page` 状态切换）：
- `welcome` → `setup`（导入 MP3/SRT）→ `editor`（时间线编辑）
- `script-workbench`（脚本编辑 + AI 辅助）→ `settings`

**Zustand Store 分层**：
- `timeline.ts` — 轨道/叠层/字幕配置，含 40 步 undo/redo
- `ai.ts` — AI 分析结果与封面候选
- `agent.ts` — Agent 执行状态与进度
- `script.ts` — 脚本文档编辑状态

**Electron IPC 架构**：
- `electron/main.ts` — 文件 I/O、Remotion 渲染、菜单
- `electron/preload.ts` — 沙箱 API 暴露（`contextBridge`）
- `src/lib/electron-api.ts` — Renderer 侧类型安全接口（`window.electronAPI`）
- **约束**：三者必须同步修改，不可单独改一处

**视频导出**：Remotion 渲染固定使用 `PodcastComposition`（`src/remotion/index.ts`），通过 FFmpeg 输出 H.264 MP4。

**项目数据**：持久化在用户选择的目录中（`timeline.json`、`ai-analysis.json`、`covers/`），不在仓库根目录。

**AI/LLM 流水线**：`src/lib/ai-analysis.ts` + `src/lib/llm/` → LangChain + OpenAI 兼容端点 → 结构化 AI 卡片（Chapter/Summary/Data/Opinion）。

**测试**：`tests/` 目录，Vitest node 环境，93+ 测试文件。

## UI 设计规范（macOS 专业工具风格，详见 DESIGN.md）

### ⚠️ 重要说明

**本章节旧的 Apple 官网风格规范已废弃**。所有新实现必须遵循 [DESIGN.md](./DESIGN.md) 中的 macOS 专业创作工具规范。

以下仅保留与当前实现一致的关键信息，完整规范请参考 DESIGN.md。

### 色彩系统（当前有效）

| 用途 | CSS 变量 | 色值 |
|------|---------|------|
| 主 CTA / 焦点环 | `--color-system-blue` | `#0A84FF`（唯一彩色 accent） |
| 窗口背景 | `--color-window-bg` | `#1C1C1E` |
| 面板背景 | `--color-panel-bg` | `#1E1E20` |
| 上浮面板 | `--color-panel-elevated` | `#2C2C2E` |
| 主文字 | `--color-text-primary` | `#FFFFFF` |
| 次文字 | `--color-text-secondary` | `#EBEBF599` |
| 分隔线 | `--color-separator` | `#38383A` |
| 危险 | `--color-danger` | `#FF453A` |
| 成功 | `--color-success` | `#32D74B` |
| 警告 | `--color-warning` | `#FFD60A` |

**禁止**：
- 引入第二种彩色 accent
- 使用旧版 Apple 官网配色（`#f5f5f7`、`#000000`、`#0071e3` 等）
- 紫色/青色用于常规交互（仅可用于 AI 操作光标）

### 字体规范（当前有效）

| 用途 | CSS 变量 | 字号 | 字重 |
|------|---------|------|------|
| 极小型元标签 | `--font-size-xs` | 10px | 400-500 |
| 小型辅助文本 | `--font-size-sm` | 11px | 400-500 |
| 控件标签 | `--font-size-md` | 12px | 400-600 |
| 主要正文 | `--font-size-lg` | 13px | 400-600 |
| 较大正文 | `--font-size-xl` | 14px | 400-600 |

**字体族**：`SF Pro Text` / `SF Pro Display` / `PingFang SC` / `-apple-system`

**禁止**：
- 使用旧版 Apple 官网字阶（28px+）
- 使用负字间距
- 直接写 `font-size: 12px`（必须用 CSS 变量）

### 组件规范（当前有效）

**按钮**
- Primary：系统蓝填充，白字，圆角 `--radius-lg` (8px)
- Secondary：深色控制面板底，白字
- Ghost：透明背景，hover 轻微提亮
- Pill 标签：圆角 `--radius-pill` (999px)，仅用于标签/徽章

**卡片/面板**
- 圆角 `--radius-md` ~ `--radius-xl` (6-12px)
- 边框弱或无边框，仅用分隔线
- 阴影仅用于浮层（modal/dropdown/toast）

**导航**
- 靠背景层次 + 分隔线 + 内边距建立层级
- 不使用玻璃效果

### 布局原则（当前有效）

- 基础单元：8px（`--space-4`）
- 常用间距：`4 / 6 / 8 / 10 / 12 / 16px`
- 面板内优先紧凑间距（4-12px）
- 区域级间距 16-32px
- 桌面优先，设计区间 1024px+

### 完整规范参考

**所有新实现必须遵循 [DESIGN.md](./DESIGN.md)**，包括：
- 完整的色彩系统与 CSS 变量使用规范
- 字体与排版规范
- 圆角、阴影、动画规范
- AI 操作界面视觉反馈体系（铁律）
- 验证清单与设计-实现工作流

---

## AI 操作界面视觉反馈体系（铁律）

所有涉及 AI 操作界面的功能（文稿生成、视频剪辑、审稿、AI 辅助编辑等）**必须**复用以下统一的视觉反馈架构。不允许各模块自行发明独立的 AI 操作指示方案。

### 架构总览

```
┌─────────────────────────────────────────────────────────────┐
│                    页面协调层（Workbench）                    │
│  负责流程编排、状态切换、回调注册                              │
└────┬────────────────────────────────────────────────────────┘
     │
     ├─► LiveStreamingEditor — 实时流式打字机（生成模式）
     │    ├─► 文档内虚拟光标（紫色 #a78bfa，generate 模式）
     │    ├─► 动态分块 + 缓冲区自适应速率
     │    └─► 智能自动滚动跟随
     │
     ├─► ReviewCursorAnimator — 审阅扫描动画（审稿模式）
     │    ├─► 文档内虚拟光标（绿色 #34d399，review 模式）
     │    ├─► 呼吸光效（CSS 动画，等待阶段）
     │    ├─► 浮动鼠标指针（fixed 定位，屏幕坐标）
     │    └─► 行高亮 + 批注逐个揭示
     │
     ├─► StreamingEditor — 预计算帧回放（重放/倒回场景）
     │
     ├─► 状态管理层（Zustand Store）
     │    ├─► virtualCursorPos: number | null
     │    ├─► reviewCursorPos: { x, y } | null
     │    ├─► reviewBreathing: boolean
     │    ├─► streamingActive: boolean
     │    ├─► editorAgent: { readOnly, virtualCursorPos, streamingActive }
     │    └─► agentOperation: { isOperating, operationType, progress, ... }
     │
     └─► 编辑器组件
          ├─► virtualCursorExtension（CM6 StateField + 装饰 + 主题）
          └─► streamingActive 守卫（防止 React 重渲染覆盖 CM6 动画）
```

### 铁律 1：双光标系统

任何 AI 操作界面必须实现两层光标：

1. **文档内虚拟光标**（CodeMirror 6 Widget 装饰）
   - 使用 `src/lib/virtual-cursor.ts` 中的 `virtualCursorExtension`
   - 通过 `setVirtualCursor` / `clearVirtualCursor` Effect 控制位置
   - 通过 `setVirtualCursorMode` 切换模式（`'generate'` 紫色 / `'review'` 绿色）
   - Widget 包含闪烁竖线 + emoji 标签（🤖 生成 / 🔍 审阅）
   - 位置随文档变更自动映射（`tr.changes.mapPos`）

2. **浮动鼠标指针**（仅审阅/扫描场景）
   - `position: fixed` + `z-index: 99999`
   - SVG 箭头 + "AI" 标签徽章
   - 通过 `coordsAtPos()` 获取屏幕坐标
   - `transition: 0.15s ease-out` 平滑移动
   - `drop-shadow` 发光效果

### 铁律 2：三阶段动画模型

所有 AI 操作必须遵循三阶段视觉反馈：

| 阶段 | 视觉表现 | 实现方式 |
|------|---------|---------|
| **等待/准备** | 呼吸光效 + 扫描线 | CSS 动画（`reviewBreathing` 类名），不涉及 CM6 |
| **执行中** | 虚拟光标移动 + 打字机/扫描 | CM6 Effect dispatch + 定时器调度 |
| **完成** | 清除所有光标状态 | `clearVirtualCursor` + 重置 store |

### 铁律 3：流式打字机引擎规范

使用 `LiveStreamingEditor` 处理实时 LLM 流：

- **队列缓冲**：文本 chunk 入队，动画帧按节奏消费
- **动态分块**：基础 chunkSize=3，根据缓冲深度动态调整（3~24 字符）
- **智能停顿**：换行后 +26ms，标点后 +14ms（中英文标点均覆盖）
- **自然断句**：在标点、空格、换行处优先断开，避免硬切
- **速率自适应**：缓冲积压时自动加速（减少延迟 + 增大 chunk），空闲时恢复节奏
- **进度回调**：`committedChars` / `receivedChars` / `processedSteps` / `totalSteps`

### 铁律 4：滚动跟随策略

- **底部检测**：`scrollHeight - scrollTop - clientHeight < 50px` 视为"在底部"
- **自动跟随**：在底部时 `scrollIntoView: true`，不在底部时不强制滚动
- **用户滚动尊重**：一旦用户手动滚动，停止自动跟随（程序滚动 100ms 窗口内忽略）
- **用户回底恢复**：用户滚回底部后恢复自动跟随

### 铁律 5：状态安全守卫

- `streamingActive` 标志位在动画期间**必须**为 `true`，阻止 React 状态同步覆盖 CM6 内容
- `editorAgent.readOnly` 在 AI 操作期间**必须**为 `true`
- 任何异常/中断路径都必须清理光标状态（`clearVirtualCursor` + `setReviewHighlightLine(null)` + 重置 store）
- 多个 `StateEffect` 应在单次 `dispatch` 中批量发送

### 铁律 6：视觉主题一致性

| 操作类型 | 主色 | 光标闪烁 | 指示器样式 |
|---------|------|---------|-----------|
| 生成/写入 | `#a78bfa` 紫色 | 1s step-end | `agentTypingIndicator`（紫色药丸 + 三点脉冲） |
| 审阅/扫描 | `#34d399` 绿色 | 0.8s step-end | `agentReviewIndicator`（绿色药丸 + 三点脉冲） |
| 等待/呼吸 | `#34d399` + `#00d2ff` 渐变 | — | `reviewBreathing`（辉光 + 扫描线） |

### 铁律 7：文件职责与复用方式

| 文件 | 职责 | 复用方式 |
|------|------|---------|
| `src/lib/virtual-cursor.ts` | CM6 虚拟光标扩展（Effect/Field/Widget/Theme） | 直接引入 `virtualCursorExtension` |
| `src/lib/live-streaming-editor.ts` | 实时流式打字机引擎 | `new LiveStreamingEditor(view, options)` |
| `src/lib/review-cursor-animator.ts` | 审阅扫描动画控制器 | `new ReviewCursorAnimator(view, options)` |
| `src/lib/streaming-editor.ts` | 预计算帧回放引擎 | `new StreamingEditor(view, options)` |
| `src/lib/diff-to-frames.ts` | 文本 diff → 动画帧转换 | `diffToFrames(before, after, options)` |

新模块（如视频 AI 剪辑）接入时：
1. 编辑器扩展中加入 `virtualCursorExtension`
2. 根据场景选择合适的引擎（`LiveStreamingEditor` / `StreamingEditor` / `ReviewCursorAnimator`）
3. 在 store 中维护 `editorAgent` / `agentOperation` / `activeStream` 等状态
4. CSS 层复用 `agentTypingIndicator` / `agentReviewIndicator` / `reviewBreathing` / `aiReviewCursor` 样式
5. 遵循三阶段动画模型和滚动跟随策略

### 禁止事项

- **禁止**在新模块中自行实现 blinking cursor、typing indicator、breathing 效果
- **禁止**绕过 `streamingActive` 守卫直接操作编辑器内容
- **禁止**在动画期间允许用户编辑（必须 `readOnly: true`）
- **禁止**使用 `setInterval` 轮询光标位置，必须通过 CM6 Effect 系统驱动
- **禁止**在清理路径中遗漏任何光标/高亮状态的重置
