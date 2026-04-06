# AI 写稿工作台 — 第一期设计规格

## 概述

在播客视频编辑器的欢迎页新增"AI 写稿创作"入口，提供一条完整的 AI 辅助写稿管线：用户上传报告文件 → 审查原稿 → AI 生成口播稿 → AI 审查批注 → 确认保存。

### 分期规划

- **第一期（本文档）**：欢迎页双入口 + ScriptWorkbench 五步写稿流程
- **第二期**：口播稿 → MiniMax TTS 生成 MP3 + SRT → 衔接现有编辑器
- **第三期**：AI 分析口播稿提取画面需求 → 素材混合编排 → 自动生成编辑器初始模板

### 设计原则

- 与现有 Setup/Editor 完全解耦，不修改已有模块
- 复用现有 LLM 客户端、Markdown 编辑器、Electron IPC 模式
- 独立页面 + 独立 Zustand store

---

## 1. Welcome 欢迎页改造

### 1.1 布局

将现有 Setup 页面重构为 Welcome 双入口页面：

- **标题栏**：沿用现有 macOS 风格标题栏
- **Hero 区域**：居中标题"选择你的创作方式"，描述两种创作模式
- **双入口卡片**：水平排列，左右等宽
  - 左侧：**AI 写稿创作**（蓝色主题，`#0A84FF`），含 3 步流程说明 + "开始创作" CTA
  - 右侧：**导入音频与字幕**（绿色主题，`#32D74B`），保留原有导入逻辑 + "导入文件" CTA
- **最近项目**：底部展示最近打开的项目快捷入口（复用 `localStorage: podcast-editor-recent-projects`）
- **Footer**：隐私提示文本

### 1.2 路由变更

`App.tsx` 页面状态从 `'setup' | 'editor'` 扩展为：

```typescript
type PageState = 'welcome' | 'setup' | 'editor' | 'script-workbench'
```

- `welcome`：新的默认首页
- `setup`：保留原有导入流程（从 welcome 右侧卡片进入）
- `script-workbench`：AI 写稿工作台（从 welcome 左侧卡片进入）
- `editor`：视频编辑器（从 setup 或未来从 script-workbench 衔接进入）

### 1.3 交互行为

- 点击"AI 写稿创作"卡片 → 进入 ScriptWorkbench
- 点击"导入音频与字幕"卡片 → 进入 Setup（保留现有逻辑）
- 点击最近项目 → 根据项目类型进入对应页面
- 左上角返回按钮 → 回到 Welcome

---

## 2. ScriptWorkbench 页面

### 2.1 整体结构

- **标题栏**：macOS 风格，标题"AI 写稿工作台"
- **步骤条**：水平排列 5 个步骤，含连接线，状态标记（completed/active/pending）
- **主体区域**：左右分栏
  - 左侧（flex: 1）：Markdown 编辑器主区域
  - 分隔线：1px `#38383A`
  - 右侧（fixed: 360px）：辅助面板，内容随步骤切换

### 2.2 步骤流程

#### 步骤① 项目初始化

| 区域 | 内容 |
|------|------|
| 左侧 | 空白欢迎提示 |
| 右侧 | 文件上传区（支持 `.txt` / `.md`，拖拽或点击选择）+ 工作目录选择（Electron 原生目录选择器） |

**行为**：
- 用户上传报告文件 → 文件内容读入 `originalText`
- 用户选择/创建工作目录 → 报告文件复制到 `{projectDir}/original.md`
- 两项都完成后自动进入步骤②

#### 步骤② 原稿审查

| 区域 | 内容 |
|------|------|
| 左侧 | Markdown 编辑器显示原稿内容，用户可自由编辑 |
| 右侧 | 原稿统计（字数、段落数、预估阅读时间）+ "下一步"按钮 |

**行为**：
- 编辑器内容变化 → debounce 1s 自动保存 `original.md`
- 点击"下一步" → 进入步骤③

#### 步骤③ 生成口播稿

| 区域 | 内容 |
|------|------|
| 左侧 | Markdown 编辑器切换为口播稿内容，AI 流式输出 |
| 右侧 | 提示词模板选择（全局模板库）+ 生成统计 + 进度指示 + "重新生成"/"下一步"按钮 |

**行为**：
- 用户选择模板 → 点击"生成口播稿"
- 调用 LLM（复用 `llm-client.ts`），System Prompt = 模板内容，User Prompt = 原稿内容
- 流式输出到编辑器
- 生成完成后用户可手动编辑
- 点击"下一步" → 进入步骤④

#### 步骤④ AI 审查批注

| 区域 | 内容 |
|------|------|
| 左侧 | 口播稿编辑器，有批注的文本段高亮标注（黄色 warning / 红色 error / 蓝色 info） |
| 右侧 | 批注列表，每条含：severity 图标、问题描述、修改建议、"采纳"/"忽略"按钮 |

**AI 审查 Prompt**：
```
System: 你是一个专业的口播稿审查编辑，请审查以下口播稿...
User:   {口播稿全文}
Response (JSON):
  annotations: [{
    id: string
    startOffset: number
    endOffset: number
    originalText: string
    issue: string
    suggestion: string
    severity: 'error' | 'warning' | 'info'
  }]
```

**交互行为**：
- 点击左侧高亮 → 右侧滚动到对应批注
- 点击右侧批注 → 左侧滚动到对应位置
- "采纳" → 用 `suggestion` 替换 `originalText`，编辑器自动更新，批注标记为 accepted
- "忽略" → 移除高亮，批注标记为 dismissed
- "全部采纳" → 批量处理所有待处理批注
- 所有批注处理完 → "完成审查"按钮激活

#### 步骤⑤ 确认保存

| 区域 | 内容 |
|------|------|
| 左侧 | 最终稿只读预览 |
| 右侧 | 保存路径确认 + 保存状态 + "进入下一步"按钮（第二期：TTS）|

**行为**：
- 自动保存口播稿到 `{projectDir}/script.md`
- 保存状态到 `{projectDir}/script-state.json`
- 第一期"进入下一步"显示为待开发提示

---

## 3. 提示词模板库

### 3.1 数据结构

```typescript
// src/lib/script-templates.ts
interface ScriptTemplate {
  id: string
  name: string           // 如 "新闻播报"
  description: string    // 一句话描述风格特点
  systemPrompt: string   // 完整 system prompt
}
```

### 3.2 预设模板

| ID | 名称 | 描述 |
|----|------|------|
| `news-broadcast` | 新闻播报 | 严谨客观，数据驱动，适合行业资讯 |
| `tech-review` | 科技评测 | 轻松专业，适合产品和技术解读 |
| `knowledge-popular` | 知识科普 | 通俗易懂，生动形象，适合大众传播 |

### 3.3 管理方式

- 全局模板库，存放在 `src/lib/script-templates.ts`
- 用户在步骤③右侧面板中选择
- 选中状态高亮，单选

---

## 4. 状态管理

### 4.1 Zustand Store

```typescript
// src/store/script.ts
interface ScriptStore {
  // 项目
  projectDir: string | null

  // 步骤
  currentStep: 1 | 2 | 3 | 4 | 5

  // 内容
  originalText: string
  scriptText: string

  // 模板
  selectedTemplate: string   // template ID

  // AI 审查
  annotations: Annotation[]

  // 状态
  generating: boolean
  reviewing: boolean

  // Actions
  setProjectDir: (dir: string) => void
  setCurrentStep: (step: 1 | 2 | 3 | 4 | 5) => void
  setOriginalText: (text: string) => void
  setScriptText: (text: string) => void
  setSelectedTemplate: (id: string) => void
  setAnnotations: (annotations: Annotation[]) => void
  acceptAnnotation: (id: string) => void
  dismissAnnotation: (id: string) => void
  acceptAllAnnotations: () => void
}
```

### 4.2 Annotation 类型

```typescript
interface Annotation {
  id: string
  startOffset: number
  endOffset: number
  originalText: string
  issue: string
  suggestion: string
  severity: 'error' | 'warning' | 'info'
  status: 'pending' | 'accepted' | 'dismissed'
}
```

---

## 5. 数据持久化

### 5.1 项目目录文件结构

```
project-dir/
├── original.md          # 原始报告
├── script.md            # 口播稿
└── script-state.json    # 工作台状态
```

### 5.2 script-state.json

```typescript
{
  version: 1,
  currentStep: number,
  templateId: string,
  annotations: Annotation[],
  createdAt: string,       // ISO 8601
  updatedAt: string
}
```

### 5.3 持久化时机

- 编辑器内容变化：debounce 1s 自动保存 `original.md` / `script.md`
- 步骤切换：更新 `script-state.json`
- 批注操作（采纳/忽略）：立即保存状态
- 关闭/返回：保存当前进度

### 5.4 Electron IPC 新增

```typescript
// electron-api.ts 新增
selectOrCreateProjectDir(): Promise<string | null>
saveScriptFile(dir: string, filename: string, content: string): Promise<void>
loadScriptFile(dir: string, filename: string): Promise<string | null>
saveScriptState(dir: string, state: string): Promise<void>
loadScriptState(dir: string): Promise<string | null>
```

---

## 6. 文件清单

### 6.1 修改文件

| 文件 | 变更 |
|------|------|
| `src/App.tsx` | 路由新增 `'welcome'` 和 `'script-workbench'` 状态 |
| `src/pages/Setup.tsx` | 重构为 Welcome 双入口布局 |
| `electron/main.ts` | 新增 IPC handlers |
| `src/lib/electron-api.ts` | 新增 IPC 类型定义 |
| `electron/preload.ts` | 暴露新 IPC 方法 |

### 6.2 新增文件

| 文件 | 用途 |
|------|------|
| `src/pages/ScriptWorkbench.tsx` | 写稿工作台主页面 |
| `src/components/script/StepInitialize.tsx` | 步骤①：上传报告 + 选择目录 |
| `src/components/script/StepReviewOriginal.tsx` | 步骤②：原稿审查编辑 |
| `src/components/script/StepGenerate.tsx` | 步骤③：模板选择 + AI 生成 |
| `src/components/script/StepAIReview.tsx` | 步骤④：AI 批注审查面板 |
| `src/components/script/StepConfirm.tsx` | 步骤⑤：确认保存 |
| `src/components/script/AnnotationList.tsx` | 批注列表组件 |
| `src/components/script/AnnotationHighlight.tsx` | 编辑器内高亮标记 |
| `src/store/script.ts` | Zustand 写稿状态 |
| `src/lib/script-templates.ts` | 提示词模板库 |
| `src/lib/script-review.ts` | AI 审查 prompt + 批注解析 |
| `src/lib/script-persistence.ts` | 文件读写封装 |

### 6.3 不修改的模块

- `pages/Editor.tsx`
- `store/timeline.ts`、`store/ai.ts`
- `remotion/`
- `lib/ai-analysis.ts`

---

## 7. 技术约束

- Markdown 编辑器复用 `@uiw/react-md-editor`
- 批注高亮通过编辑器内容包裹 HTML 标记或 overlay 层实现
- LLM 调用复用 `lib/llm-client.ts`
- AI 设置复用 `AISettingsModal`
- 文件操作走 Electron IPC，保持与现有项目管理一致
- 暗色主题沿用现有 macOS Dark 设计令牌

---

## 8. UI 设计参考

设计稿位于 `design.pen`，包含三个页面：

1. **Welcome Page — 双入口欢迎页**（节点 `P8RvC`）
2. **ScriptWorkbench — AI 写稿工作台（步骤③生成态）**（节点 `hNAKB`）
3. **ScriptWorkbench — AI 审查批注态（步骤④）**（节点 `jp4er`）
