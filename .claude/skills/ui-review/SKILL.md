---
name: ui-review
description: 前端 UI 交付审查工作流。完成前端界面开发后强制执行，检查设计规范合规、组件库复用率、组件抽象评估，输出审查报告并驱动二次迭代。触发条件：新增页面/功能模块 UI 完成、较大范围 UI 改动、多组件联动交互完成。
version: 1.0.0
user-invocable: true
argument-hint: "[scope: 页面/模块/组件范围]"
---

# 前端 UI 交付审查工作流

每次完成前端界面开发后，**必须**执行本审查流程，确认设计规范遵循度与组件库复用率，未通过审查的界面需进行二次迭代优化。

## 审查触发条件

以下场景**必须**触发本审查：
- 新增页面或完整功能模块的 UI 开发完成时
- 对现有页面进行较大范围的 UI 改动时
- 涉及多个组件联动的交互功能完成时

## 审查步骤

### 第 1 步：确定审查范围

根据传入的 scope 参数或当前会话上下文，确定本次审查涉及的文件范围：
- 如果指定了具体页面/模块，聚焦该范围
- 如果未指定，检查当前会话中新增或修改的前端文件
- 列出待审查的文件清单

### 第 2 步：设计规范合规检查

逐项对照 DESIGN.md 和 CLAUDE.md「UI 设计规范」章节，确认：

| 检查项 | 合规要求 |
|--------|---------|
| **色彩** | 所有颜色使用 CSS 变量（`--color-*`），无硬编码色值；accent 仅用系统蓝 `#0A84FF` |
| **字体** | 字号通过 `--font-size-*` 变量引用，无直接 `font-size: Npx` 写法 |
| **间距** | 基于 8px 网格（`--space-*`），面板内 4-12px，区域间 16-32px |
| **圆角** | 使用 `--radius-*` 变量，不硬编码 `border-radius` 值 |
| **阴影** | 仅浮层（modal/dropdown/toast）使用阴影，面板/卡片不加阴影 |
| **层级** | 通过背景色层次 + 分隔线建立视觉层级，不使用玻璃效果 |

**检查方法**：
- 在待审查文件中 grep 硬编码色值（`#[0-9a-fA-F]{3,8}`、`rgb(`、`rgba(`）
- grep 硬编码字号（`font-size:\s*\d+px`）
- grep 硬编码圆角（`border-radius:\s*\d+px`）
- 对比是否使用了 CSS 变量替代

### 第 3 步：组件库复用检查

对照 `src/ui/` 三层组件库，检查是否存在**应使用组件库但未使用**的情况：

**基础组件层**（`src/ui/components/`）：

| 场景 | 必须使用的组件 |
|------|--------------|
| 按钮交互 | `Button`（Primary/Secondary/Ghost 变体） |
| 表单输入 | `Input` / `Textarea` / `SearchInput` |
| 选择控件 | `Select` / `MultiSelect` / `Checkbox` / `Switch` |
| 弹窗/对话框 | `Dialog` / `Modal` |
| 下拉菜单 | `DropdownMenu` |
| 右键菜单 | `ContextMenu` |
| 标签页切换 | `Tabs` / `TabsList` / `TabsTrigger` / `TabsContent` |
| 折叠面板 | `Accordion` |
| 进度指示 | `Progress` / `CircularProgress` |
| 数值滑块 | `Slider` |
| 提示/气泡 | `Tooltip` / `Popover` / `Floating` |
| 通知反馈 | `Alert` / `useToast` |
| 卡片容器 | `Card` / `CardHeader` / `CardContent` / `CardFooter` |
| 表格数据 | `Table` 系列组件 |
| 头像展示 | `Avatar` / `AvatarGroup` |
| 标记/徽章 | `Badge` |
| 骨架屏 | `Skeleton` |

**模式组件层**（`src/ui/patterns/`）：

| 场景 | 必须使用的组件 |
|------|--------------|
| 面板标题栏 | `PanelHeader` |
| 操作工具栏 | `ActionBar` |
| 文件拖放区 | `FileDropCard` |
| 表单字段网格 | `FieldGrid` |
| 弹窗底部操作 | `ModalFooter` |
| 药丸标签组 | `PillGroup` |
| 步骤指示器 | `StepIndicator` |
| 信息摘要卡 | `SummaryCard` |

**原子组件层**（`src/ui/primitives/`）：

| 场景 | 必须使用的组件 |
|------|--------------|
| 分隔线 | `Divider` |
| 空状态占位 | `EmptyState` |
| 眉标/小标签 | `Eyebrow` |
| 表单字段容器 | `Field` |
| 加载遮罩 | `LoadingOverlay` |
| 媒体占位 | `MediaPlaceholder` |
| 颜色选择字段 | `ColorField` |
| 数值输入字段 | `NumberField` |
| 加载旋转器 | `Spinner` |

**检查方法**：
- 在待审查文件中搜索原生 HTML 元素（`<button`、`<input`、`<select`、`<dialog`）是否应替换为组件库组件
- 检查是否存在自定义实现的 tooltip、loading、modal 等

### 第 4 步：组件抽象评估

检查新代码中是否存在**应抽象为组件但未抽象**的通用模式：

- **重复出现 2 次以上**的 UI 结构，应考虑抽象为 `src/ui/patterns/` 或 `src/ui/primitives/` 组件
- **可独立测试、独立复用**的交互单元，应提取为组件
- **抽象判定标准**：
  - 该模式在当前或可预见的未来模块中会复用 → 抽象
  - 仅当前模块内局部使用且无复用可能 → 不强制抽象
- **抽象层级归属**：
  - 无业务语义的 UI 原子 → `src/ui/primitives/`
  - 由多个原子组合、有布局/交互模式但无业务逻辑 → `src/ui/patterns/`
  - 有完整交互逻辑的通用组件 → `src/ui/components/`

### 第 5 步：输出审查报告

审查完成后，**必须**输出以下格式的报告：

```
## UI 审查报告

### 审查范围
- 本次审查涉及的文件列表

### 设计规范合规
- ✅ 通过项 / ⚠️ 违规项（列出具体文件:行号 + 违规内容 + 修复方案）

### 组件库复用
- ✅ 已正确使用组件库的场景
- ⚠️ 应使用组件库但使用了自定义实现（列出文件:行号 + 应替换为哪个组件）

### 组件抽象建议
- 🔧 建议抽象的通用模式（描述模式 + 建议组件名 + 归属层级）

### 二次迭代清单
- [ ] 需修复的规范违规项
- [ ] 需替换为组件库的自定义实现
- [ ] 需新增的抽象组件
```

### 第 6 步：执行二次迭代

- 审查报告中标记为 ⚠️ 的项**必须**在当次开发周期内修复
- 组件抽象建议（🔧）中复用次数 ≥ 2 的模式**必须**当次抽象
- 新抽象的组件必须：
  - 放入正确的层级目录（`primitives` / `patterns` / `components`）
  - 在对应的 `index.ts` 中导出
  - 遵循现有组件库的 API 风格（props 命名、变体模式、className 透传）
  - 使用 CSS 变量而非硬编码样式值

## 禁止事项

- **禁止**跳过 UI 审查直接声称开发完成
- **禁止**在业务组件中重新实现组件库已有的 UI 元素（如自定义按钮、自定义弹窗）
- **禁止**硬编码颜色、字号、圆角、间距等已有 CSS 变量覆盖的值
- **禁止**在组件库外散落通用 UI 逻辑（如 tooltip、loading、empty state）
