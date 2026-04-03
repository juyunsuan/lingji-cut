# AGENT.md

本文件描述在 `video-web-master` 仓库内工作的自动化代理默认约束。若上层目录、会话或用户有更高优先级指令，以更高优先级为准。

## 1. 仓库定位

这是一个 `Electron + React + Remotion` 的本地桌面视频编辑器，核心目标是把播客音频和字幕组织成可编辑时间轴，并导出视频。

主要工作流：

1. 选择项目目录
2. 导入 `MP3 + SRT`
3. 编辑时间轴与素材
4. 可选地生成 AI 卡片与封面
5. 导出 `MP4`

## 2. 先读哪里

接手任务时，优先阅读与改动直接相关的入口文件：

- 应用入口：`src/App.tsx`
- Setup 页：`src/pages/Setup.tsx`
- Editor 页：`src/pages/Editor.tsx`
- 时间轴状态：`src/store/timeline.ts`
- Electron 能力声明：`src/lib/electron-api.ts`
- 主进程 IPC：`electron/main.ts`
- preload 桥接：`electron/preload.ts`
- 时间轴类型：`src/types.ts`
- AI 类型：`src/types/ai.ts`
- Remotion 组合：`src/remotion/PodcastComposition.tsx`

## 3. 关键契约

以下内容默认视为强契约，改动前需要先确认影响范围：

### 3.1 时间轴与工程数据

- `timeline.json` 是项目目录里的核心数据文件
- `ai-analysis.json` 保存 AI 分析结果
- `src/types.ts` 和 `src/types/ai.ts` 里的结构变化，通常会联动到 store、渲染、持久化和测试

### 3.2 Electron IPC

以下三处必须同步：

- `electron/main.ts`
- `electron/preload.ts`
- `src/lib/electron-api.ts`

如果只改了其中一处，通常就是不完整改动。

### 3.3 Remotion 导出链路

- 导出入口依赖 `src/remotion/index.ts`
- `selectComposition` 使用的 ID 固定为 `PodcastComposition`
- 导出前会把素材映射到临时 `publicDir`

### 3.4 平台边界

- Renderer 不要直接使用 Node API，优先通过 preload 暴露能力
- 不要手改 `dist/` 和 `dist-electron/`，它们属于构建产物
- `work/` 目录默认视为示例 / 调试数据，不要无意覆盖

## 4. 本仓库的高风险改动

出现以下情况时，默认提升谨慎级别：

- 修改 `TimelineData`、`OverlayItem`、`AICard` 等共享类型
- 修改项目目录落盘格式
- 修改 IPC 名称、参数结构或返回值
- 修改导出逻辑、composition ID 或 Remotion 输入结构
- 引入新的外部 API、密钥来源或持久化方式
- 修改根级构建配置、依赖或 Electron 安全边界

## 5. 推荐改动策略

### 5.1 小改动

适用于文档、文案、小 bug、样式微调、局部测试补充：

- 直接实现
- 做定向验证
- 不要顺手扩散重构

### 5.2 行为改动

适用于时间轴、AI 卡片、导出、IPC、素材流程：

1. 先确认改动入口与数据流
2. 明确受影响的类型、store、页面和测试
3. 保持最小充分修改
4. 补或改对应测试

## 6. UI / 交互约束

- 当前产品是桌面优先，不要默认改成移动端优先交互
- 现有界面文案以简体中文为主，保持一致
- 标识符继续使用英文
- 样式大多是内联 style，新增 UI 时优先延续现有模式，除非任务明确要求重构

## 7. AI 相关约束

- 不要把 API Key、Session ID 写进源码
- AI 配置当前来自应用侧设置，不要私自改成仓库内明文配置
- 改 AI 卡片结构时，至少同步检查：
  - `src/types/ai.ts`
  - `src/lib/ai-analysis.ts`
  - `src/store/ai.ts`
  - `src/components/AIPanel.tsx`
  - `src/remotion/cards/`
  - 相关 tests

## 8. 验证建议

根据改动范围选择最小但真实的验证：

- 文档改动：自检 Markdown 内容与路径准确性
- 纯函数 / lib 改动：跑相关 `vitest`
- 页面 / 组件改动：跑对应组件测试
- IPC / Electron 桥接改动：至少覆盖相关单测，并检查接口三处同步
- 导出链路改动：除测试外，优先补一次构建级验证

常用命令：

```bash
npm run dev
npm run build
npm test
npx vitest run tests/editor.test.tsx
```

## 9. 提交前检查清单

- 改动是否只覆盖任务相关范围
- 共享类型变更是否同步到调用方
- IPC 三件套是否同步
- 是否误改构建产物或示例数据
- 是否运行了与改动匹配的验证
- 最终说明里是否如实写明“跑了什么、没跑什么”

## 10. 文档维护约定

若仓库结构、命令、AI 配置方式或工程产物发生变化，请同步更新：

- `README.md`
- 本文件 `AGENT.md`

如果未来仓库引入项目级 `AGENTS.md`，可以把本文件内容迁移或拆分过去，但在迁移完成前，默认继续以本文件为仓库内代理说明。
