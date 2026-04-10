# macOS Professional Creation Tool Design System

## 1. Product Positioning

本产品不是 Apple 官网式产品展示页面，而是一个 **macOS 深色专业创作工具**。

它服务的核心用户是：
- 播客视频创作者
- 需要快速生成口播稿、整理素材、叠加字幕和导出视频的内容生产者
- 默认在桌面端长时间使用，需要稳定、可信、低打扰的工作环境

设计目标不是“惊艳首屏”，而是：
- **安静**：界面不要频繁喊叫，内容比装饰更重要
- **专业**：像创作软件，而不是营销页或 AI 玩具
- **可信**：所有状态反馈都真实，不出现“看起来能做但其实没做”的控件
- **高效**：用户能快速理解当前阶段、下一步动作、风险和结果

一句话总结：

> 这是一个面向创作者的本地桌面工作台，设计语言应接近 macOS 专业工具，而不是 Apple 官网叙事页面。

---

## 2. Visual Theme & Atmosphere

整体视觉应以 **Darwin / macOS 深色桌面容器** 为基底：
- 深色窗口背景
- 分区明确的面板结构
- 轻量分隔线替代大面积边框
- 克制的系统蓝作为主交互色
- 尽量避免装饰性炫技

界面气质应表现为：
- 稳定
- 冷静
- 精密
- 有秩序

不应表现为：
- 营销式“产品舞台感”
- AI 工作台式“高亮、发光、流光”
- 过度娱乐化的 emoji 与彩色标签堆叠

### Key Characteristics
- 深色桌面背景与嵌套面板结构
- 顶部窗口栏 + 中央工作区 + 辅助侧栏 / 底栏的专业工具布局
- 文本、分隔线和按钮层级明确，靠密度和对比组织信息
- 主要交互只使用系统蓝高亮
- 状态反馈以细粒度文本、进度、局部提示为主，不依赖夸张动画
- 局部可有柔和模糊或阴影，但只能服务层级，不可成为视觉主角

---

## 3. Design Principles

### 3.1 Single Primary Task
- 每个页面只允许一个主要任务中心
- 次级操作必须退后
- 页面不能出现多个同等重量的“主入口”

### 3.2 Progressive Disclosure
- 默认只显示当前阶段必需的信息
- 高级配置、解释性文案、诊断信息，按需展开
- 避免一上来把所有状态层全部摊开

### 3.3 Honest Feedback
- 所有按钮都必须对应真实行为
- “取消”必须真的中止任务，否则只能写“关闭”或“后台继续”
- 不允许“上一段 / 下一段 / 倍速”这类仅有外观、没有实际逻辑的控件长期存在

### 3.4 Calm by Default
- AI 状态提示应克制
- 避免扫描线、辉光、品牌紫色进度条、悬浮发光标签等“抢焦点”设计
- 当系统繁忙时，也应优先通过固定区域提示，而不是让多个动态层同时争抢注意力

### 3.5 Tool First, Marketing Never
- 首页、设置页、工作区都应体现“工具”而不是“宣传”
- 不要使用双主卡片营销式入口、夸张卖点文案、情绪化插画式包装

---

## 4. Color System

### Core Surfaces
- **Window Background**: `#1C1C1E`
- **Panel Background**: `#1E1E20`
- **Elevated Panel**: `#2C2C2E`
- **Titlebar Background**: `#252527`
- **Preview Background**: `#141416`
- **Timeline Background**: `#1A1A1C`
- **Control Background**: `#3A3A3C`

### Text
- **Primary Text**: `#FFFFFF`
- **Secondary Text**: `#EBEBF599`
- **Muted Text**: `#EBEBF54D`
- **Disabled Text**: `#EBEBF533`

### Borders & Separators
- **Separator**: `#38383A`
- **Border Strong**: `#48484A`
- **Soft Outline**: `rgba(255, 255, 255, 0.16)`

### Primary Accent
- **System Blue**: `#0A84FF`
- **System Blue Hover**: `#409CFF`
- **System Blue Active**: `#0071E3`

### Status Colors
这些颜色只允许用于 **反馈 / 诊断 / 告警**，不应成为页面主体语言：
- **Danger**: `#FF453A`
- **Success**: `#32D74B`
- **Warning**: `#FFD60A`

### Rules
- 常态界面只允许一个主强调色：**System Blue**
- 绿色、橙色、黄色、红色只用于状态，不用于入口包装或品牌分区
- 不使用紫色作为系统级强调色
- 不允许大面积渐变作为界面背景

---

## 5. Typography

### Font Family
- **Primary UI Font**: `SF Pro Text`
- **Large Heading / Window Hero**: `SF Pro Display`
- 中文 fallback：`PingFang SC`
- 系统 fallback：`-apple-system`, `BlinkMacSystemFont`, `sans-serif`

### Typography Roles

| Role | Font | Size | Weight | Line Height | Notes |
|------|------|------|--------|-------------|-------|
| Window Title | SF Pro Text | 13px | 600 | 1.2 | 顶栏与小型面板标题 |
| Section Title | SF Pro Text | 15px | 600 | 1.3 | 面板标题、设置大项 |
| Large Heading | SF Pro Display | 24px | 600 | 1.15 | Setup 首屏标题、局部主标题 |
| Primary Body | SF Pro Text | 13px | 400 | 1.45 | 常规说明、列表内容 |
| Secondary Body | SF Pro Text | 12px | 400 | 1.4 | 辅助说明、元信息 |
| Control Label | SF Pro Text | 12px | 500 | 1.2 | tabs、segmented control、按钮标签 |
| Mono Meta | SF Mono / Menlo | 12px | 400 | 1.35 | 路径、环境变量、技术字段 |

### Rules
- 大多数正文不超过 `13px`
- 顶栏 / tabs / 工具条文字优先使用 `12px-13px`
- 真正的大标题只在 Setup、空态、关键确认区少量使用
- 避免使用 `700` 以上的粗体
- 避免在普通工具界面中使用过度压缩的营销标题风格

---

## 6. Layout Patterns

### Application Shell
标准布局应优先遵守以下结构：

```text
┌─────────────────────────────────────────────┐
│ Window Titlebar / Toolbar                   │
├─────────────────────────────────────────────┤
│ Workspace Tabs / Secondary Nav              │
├──────────────┬────────────────┬─────────────┤
│ Side Panel   │ Main Work Area │ Inspector   │
│ / Session    │ / Preview      │ / Details   │
├──────────────┴────────────────┴─────────────┤
│ Bottom Utility Area / Timeline / Status     │
└─────────────────────────────────────────────┘
```

### Spacing
- Base spacing: `8px`
- 常用节奏：`4 / 6 / 8 / 10 / 12 / 16 / 20 / 24 / 32`
- 面板内优先使用紧凑间距
- 页面级区域之间用更大留白建立层级

### Panel Philosophy
- 靠 **背景层次 + 分隔线 + 内边距** 建立层级
- 避免“每个区域都做成一张独立厚卡片”
- 不要卡片套卡片

### Responsive Strategy
这是桌面优先产品：
- 以 `1024px+` 为主设计区间
- 小宽度时优先压缩辅助栏，而不是压缩主工作区逻辑
- 不追求营销页式移动端体验，重点保证可用性和层级不崩

---

## 7. Components

### Buttons

允许的主变体：
- **Primary**：系统蓝填充，白字
- **Secondary**：深色控制面板底，白字
- **Ghost**：透明背景，hover 轻微提亮
- **Destructive**：只用于危险动作
- **Link / Text Action**：不作为主 CTA，只用于弱操作

规则：
- 常规按钮高度约 `28-36px`
- 不要出现五颜六色的按钮族
- 首页与工作区里不要同时出现多个同权 primary CTA

### Inputs / Select / Textarea
- 深色控件底，轻边框
- focus 使用系统蓝 ring 或边框
- 不要使用夸张的 glow
- 技术型字段可使用等宽字体

### Cards / Panels
- 常规面板背景使用 `Panel Background` 或 `Elevated Panel`
- 边框尽量弱
- 圆角克制，通常 `6-12px`
- 阴影只用于浮层，不用于普通工作区卡片

### Dialog / Modal
- 只在真正需要阻断流程时使用
- 阴影柔和但不厚重
- 头部、正文、底部动作清晰分区
- 如果任务支持后台继续，优先使用非阻断反馈

### Tabs / Segmented Control
- 更像桌面工具切换器，而不是营销标签
- active 状态轻量清晰，不要过度发光

### Status Feedback
优先顺序：
1. 固定状态栏 / 面板内说明
2. 局部 inline hint
3. 非阻断 toast
4. 阻断式 modal

禁止：
- 进度条用紫色品牌化包装
- 漂浮光效或扫描线作为默认 AI 状态

---

## 8. Page-Level Guidance

### Setup
- 应只有一个主入口
- “导入已有素材”作为次路径存在
- 最近项目与设置入口应退后，不与主流程竞争
- 不使用 emoji 作为主要视觉锚点

### ScriptWorkbench
- 以编辑器内容为绝对主角
- 只保留一个主要 AI 状态反馈区
- 文件树、批注、抽屉、状态横幅必须控制并发显示密度
- AI 审查反馈优先是结构化列表和状态栏，不是特效

### Editor
- 预览、时间轴、检查器的层级要稳定
- 播放控件必须真实可用
- 导出流程反馈必须与后台状态一致

### Settings
- 先按用户心智分组，再展开技术配置
- 建议至少分成：
  - 创作：AI、模板、审查、TTS
  - 系统：Agent、MCP
- 预检、认证、环境变量、权限策略不要一股脑平铺

### Agent Sidebar
- 用户语言优先，不暴露太多底层运行机制术语
- 会话、连接、恢复历史这些概念要弱化
- 重点表达“当前能做什么”和“下一步做什么”

---

## 9. Motion

### Allowed
- 轻量淡入淡出
- 面板展开 / 折叠
- hover / active 的细微反馈
- 进度条或小型 spinner

### Forbidden
- 扫描线
- 紫色辉光呼吸灯
- 多层 radial / linear 发光背景
- 为了表现“AI 正在工作”而制造大面积动态噪音

---

## 10. Do / Don't

### Do
- 把它设计成创作工具，不是宣传页
- 用结构、分区和密度表达层级
- 保持主流程清晰
- 使用系统蓝统一交互反馈
- 让状态反馈真实、明确、低噪音
- 用文字和布局建立信任感

### Don't
- 不要再使用 Apple 官网式模块语言指导桌面工具页面
- 不要使用紫色、荧光、渐变、扫描线来包装 AI 状态
- 不要在首页放两个同权主入口
- 不要让多个横幅、抽屉、提示同时争抢焦点
- 不要放没有真实行为的按钮
- 不要把底层实现细节直接讲给普通用户
- 不要依赖 emoji 承担主要视觉设计职责

---

## 11. Validation Checklist

每次调整 `design.pen` 或实现页面时，至少检查以下问题：

1. 当前页面是否只有一个主任务中心？
2. 用户是否能在 2 秒内知道下一步？
3. 有没有两个以上同权高亮入口？
4. 是否出现了不必要的多色强调？
5. AI 状态是否过于抢眼？
6. 是否存在“看起来能做，其实没实现”的控件？
7. 是否把运行机制解释暴露给了普通用户？
8. 是否更像专业工具，而不是营销页或 AI 玩具？

---

## 12. Design-to-Implementation Workflow

新的执行顺序必须是：

1. 先维护本文件
2. 再用 Pencil MCP 调整 `design.pen`
3. 导出关键页面截图给用户人工验稿
4. 用户明确满意后，才开始代码实现
5. 若用户不满意，优先继续迭代 `design.pen`

这个顺序是强约束，不可跳过。
