import { ipcMain, type BrowserWindow } from 'electron';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { AgentConfig } from './config';
import { BinaryManager } from './binary-manager';
import { ConnectionRegistry } from './connection-registry';
import { runPreflight } from './preflight';
import { McpConfigManager } from '../mcp/config-manager';
import { getMcpServerStatus } from '../mcp/server';
import type { PermissionPolicy } from './types';
import { ensureProjectAgentContracts } from './contract-sync';

const CONFIG_PATH = path.join(os.homedir(), '.lingji', 'agent-config.json');

const config = new AgentConfig(CONFIG_PATH);
const binaryManager = new BinaryManager();
const connectionRegistry = new ConnectionRegistry();

interface RuntimeConnectPayload {
  conversationId: number;
  projectDir: string;
  sessionId?: string | null;
  agentType?: string;
}

export function registerAgentIpc(getMainWindow: () => BrowserWindow | null): void {
  // 启动时确保 nvm/fnm/volta 的 node 在 PATH 中
  binaryManager.ensureNodeInPath();

  const sendToRenderer = (channel: string, ...args: unknown[]) => {
    getMainWindow()?.webContents.send(channel, ...args);
  };

  async function connectRuntime(payload: RuntimeConnectPayload): Promise<void> {
    const configData = await config.load();
    const agentEntry = configData.agents['claude-acp'];
    const policy = configData.permissionPolicy ?? 'tiered';

    // 确保 Claude Code 配置了 MCP Server
    const mcpConfigMgr = new McpConfigManager();
    const mcpStatus = getMcpServerStatus();
    if (mcpStatus.running) {
      await mcpConfigMgr.registerToApp('claude_code', mcpStatus.port);
    }

    // 在项目目录写入 CLAUDE.md，引导 Claude Code 使用 MCP 工具
    await ensureProjectClaudeMd(payload.projectDir);

    // 同步 file-first 编辑契约要点到 CLAUDE/AGENTS/GEMINI.md（多 agent 通用，独立 marker）
    await ensureProjectAgentContracts(payload.projectDir);

    // 构建 env
    const env: Record<string, string> = {};
    if (agentEntry?.authMode === 'custom_api') {
      const apiKey = await config.getApiKey('claude-acp');
      if (apiKey) env.ANTHROPIC_API_KEY = apiKey;
      if (agentEntry.apiBaseUrl) env.ANTHROPIC_BASE_URL = agentEntry.apiBaseUrl;
    }
    // 解析 envText
    if (agentEntry?.envText) {
      for (const line of agentEntry.envText.split('\n')) {
        const eqIdx = line.indexOf('=');
        if (eqIdx > 0) {
          env[line.slice(0, eqIdx).trim()] = line.slice(eqIdx + 1).trim();
        }
      }
    }

    const version = agentEntry?.version || '0.25.0';
    const { command, args } = binaryManager.getSpawnCommand(version);

    await connectionRegistry.connect({
      conversationId: payload.conversationId,
      projectDir: payload.projectDir,
      sessionId: payload.sessionId ?? null,
      agentType: payload.agentType ?? 'claude-acp',
      permissionPolicy: policy,
      spawnCommand: command,
      spawnArgs: args,
      env,
    });
  }

  connectionRegistry.on('status', ({ conversationId, status }) => {
    sendToRenderer('agent:runtime-status', { conversationId, status });
  });
  connectionRegistry.on('event', ({ conversationId, event }) => {
    sendToRenderer('agent:runtime-event', { conversationId, event });
  });
  connectionRegistry.on('capabilities', ({ conversationId, capabilities }) => {
    sendToRenderer('agent:runtime-capabilities', { conversationId, capabilities });
  });
  connectionRegistry.on('file_changed', ({ conversationId, change }) => {
    const eventPayload = { type: 'file_changed', ...(change as object) };
    sendToRenderer('agent:runtime-event', { conversationId, event: eventPayload });
  });

  ipcMain.handle('agent:connect-runtime', async (_event, payload: RuntimeConnectPayload) => {
    await connectRuntime(payload);
  });

  ipcMain.handle('agent:disconnect-runtime', async (_event, conversationId: number) => {
    connectionRegistry.disconnect(conversationId);
  });

  ipcMain.handle('agent:send-prompt-runtime', async (_event, conversationId: number, contents: unknown[]) => {
    await connectionRegistry.sendPrompt(conversationId, contents);
  });

  ipcMain.handle('agent:cancel-turn-runtime', async (_event, conversationId: number) => {
    await connectionRegistry.cancelTurn(conversationId);
  });

  ipcMain.handle('agent:set-mode-runtime', async (_event, conversationId: number, modeId: string) => {
    await connectionRegistry.setMode(conversationId, modeId);
  });

  ipcMain.handle('agent:set-config-option-runtime', async (_event, conversationId: number, configId: string, valueId: string) => {
    await connectionRegistry.setConfigOption(conversationId, configId, valueId);
  });

  ipcMain.handle('agent:respond-permission-runtime', async (_event, conversationId: number, requestId: string, optionId: string) => {
    await connectionRegistry.respondPermission(conversationId, requestId, optionId);
  });

  // 配置管理
  ipcMain.handle('agent:get-config', () => config.load());
  ipcMain.handle('agent:save-config', async (_event, data) => config.save(data));
  ipcMain.handle('agent:get-api-key', async (_event, agentId: string) => config.getApiKey(agentId));
  ipcMain.handle('agent:set-api-key', async (_event, agentId: string, key: string) =>
    config.setApiKey(agentId, key),
  );
  ipcMain.handle('agent:get-permission-policy', async () => {
    const data = await config.load();
    return data.permissionPolicy;
  });
  ipcMain.handle('agent:set-permission-policy', async (_event, policy: PermissionPolicy) => {
    const data = await config.load();
    data.permissionPolicy = policy;
    await config.save(data);
    // 同步到所有已连接的运行时，使策略即时生效
    connectionRegistry.setPermissionPolicy(policy);
  });

  // 预检与安装
  ipcMain.handle('agent:run-preflight', () => runPreflight(binaryManager, config, 'claude-acp'));
  ipcMain.handle('agent:install', async (_event, version: string) => binaryManager.install(version));
  ipcMain.handle('agent:uninstall', () => binaryManager.uninstall());
  ipcMain.handle('agent:get-latest-version', () => binaryManager.getLatestVersion());
}

// ─── MCP 工具引导指令 ──────────────────────────────────────

const MCP_INSTRUCTIONS_MARKER = '<!-- lingji-mcp-instructions -->';

const MCP_INSTRUCTIONS = `
${MCP_INSTRUCTIONS_MARKER}
## 灵几编辑器 MCP 工具使用规范（强制）

你正在灵几视频脚本编辑器中工作。你**必须且只能使用 lingji_* MCP 工具**来操作脚本。

### ⛔ 禁止事项

- **禁止**使用内置 Read 工具读取 original.md、script.md 等脚本文件 → 改用 \`lingji_read_script\`
- **禁止**使用内置 Write/Edit 工具修改脚本文件 → 改用 \`lingji_update_script\`
- **禁止**自己直接输出脚本内容给用户 → 必须通过 MCP 工具写入编辑器

### 📋 用户说"写稿"时的完整步骤

1. 调用 \`lingji_get_project_context\` → 获取项目状态、当前选中模板及其写作指令（selectedTemplatePrompt）
2. 调用 \`lingji_read_script\` 读取 original.md（filePath 传 "original.md"）→ 获取原始素材
3. **你自己按照模板的 systemPrompt 写作指令来撰写口播稿**
4. 调用 \`lingji_update_script\` → 将你写好的稿件写入 script.md（filePath 传 "script.md"）
5. 编辑器会即时显示并高亮变更

> 备选方案：如果用户明确要求使用"内置模板生成"，可调用 \`lingji_write_script\`（需要编辑器内部 AI 已配置）。

### 📋 用户说"审稿"/"审阅"/"检查"时的完整步骤

1. 调用 \`lingji_read_script\` → 获取当前脚本全文
2. 分析脚本，找出问题（事实错误、表述不清、口语化不足、逻辑跳跃等）
3. **必须**调用 \`lingji_review_script\` 提交批注，编辑器会在对应位置显示批注卡片
4. 完成。不要仅用文字回复，**必须调用工具**。

**批注格式要求（重要）：**
- 使用 \`quotedText\` 精确定位：传入脚本中能精确匹配的原文子串
- 提供 \`suggestion\`：替换 quotedText 的完整文本，用户可一键采纳
- \`severity\` 仅支持三个值：\`error\`（事实错误）、\`warning\`（表达问题）、\`info\`（优化建议）

示例：
\`\`\`json
{
  "annotations": [
    {
      "quotedText": "据统计有100万人参与",
      "text": "数据缺少来源，需要补充出处",
      "suggestion": "据工信部统计，约有100万人参与",
      "severity": "warning"
    },
    {
      "quotedText": "这个技术非常的先进和领先",
      "text": "表述冗余，'先进'和'领先'语义重复",
      "suggestion": "这项技术处于行业领先水平",
      "severity": "info"
    }
  ]
}
\`\`\`

### 📋 用户说"修改"/"润色"/"改一下"时的完整步骤

1. 调用 \`lingji_read_script\` → 获取当前内容
2. 修改内容
3. 调用 \`lingji_update_script\` → 写入修改后的完整内容
4. 编辑器会即时更新并高亮变更行

### 可用 MCP 工具速查

| 场景 | 工具 | 关键参数 |
|------|------|----------|
| 写稿（推荐） | 读 context → 自己写 → \`lingji_update_script\` | content, filePath |
| 写稿（内置AI） | \`lingji_write_script\` | templateCode, rawText |
| 审稿 | \`lingji_review_script\` | annotations[{quotedText, text, suggestion, severity}] |
| 修改 / 润色 | \`lingji_update_script\` | content, filePath? |
| 读取 | \`lingji_read_script\` | filePath? |
| 查项目/模板 | \`lingji_get_project_context\` | — |
| 查编辑器状态 | \`lingji_get_editor_state\` | — |
| 查文件列表 | \`lingji_list_project_files\` | directory? |
`;

/**
 * 确保脚本项目目录有 CLAUDE.md 且包含 MCP 工具引导指令
 */
async function ensureProjectClaudeMd(projectDir: string): Promise<void> {
  const filePath = path.join(projectDir, 'CLAUDE.md');
  try {
    let content = '';
    try {
      content = await fs.readFile(filePath, 'utf-8');
    } catch {
      // 文件不存在，创建新文件
    }

    if (content.includes(MCP_INSTRUCTIONS_MARKER)) {
      // 已有 MCP 指令 → 替换为最新版本
      const markerIdx = content.indexOf(MCP_INSTRUCTIONS_MARKER);
      const before = content.slice(0, markerIdx).trimEnd();
      const newContent = before ? before + '\n' + MCP_INSTRUCTIONS : MCP_INSTRUCTIONS.trimStart();
      await fs.writeFile(filePath, newContent, 'utf-8');
    } else {
      // 首次添加 MCP 指令
      const newContent = content ? content.trimEnd() + '\n' + MCP_INSTRUCTIONS : MCP_INSTRUCTIONS.trimStart();
      await fs.writeFile(filePath, newContent, 'utf-8');
    }
  } catch (err) {
    console.warn('[ACP] 写入 CLAUDE.md 失败:', err);
  }
}
