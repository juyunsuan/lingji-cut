import { ipcMain, type BrowserWindow } from 'electron';
import os from 'node:os';
import path from 'node:path';
import { AcpClient } from './client';
import { AgentConfig } from './config';
import { BinaryManager } from './binary-manager';
import { TerminalRuntime } from './terminal-runtime';
import { SessionManager } from './session';
import { runPreflight } from './preflight';
import type { PermissionPolicy } from './types';

const CONFIG_PATH = path.join(os.homedir(), '.lingji', 'agent-config.json');

let sessionManager: SessionManager | null = null;
const config = new AgentConfig(CONFIG_PATH);
const binaryManager = new BinaryManager();
const terminalRuntime = new TerminalRuntime();

export function registerAgentIpc(getMainWindow: () => BrowserWindow | null): void {
  // 启动时确保 nvm/fnm/volta 的 node 在 PATH 中
  binaryManager.ensureNodeInPath();

  const sendToRenderer = (channel: string, ...args: unknown[]) => {
    getMainWindow()?.webContents.send(channel, ...args);
  };

  ipcMain.handle('agent:get-status', () => {
    return sessionManager?.getStatus() ?? 'disconnected';
  });

  ipcMain.handle('agent:connect', async (_event, projectDir: string) => {
    // 防止重复连接：已有活跃会话时同步状态后返回
    if (sessionManager) {
      const currentStatus = sessionManager.getStatus();
      if (currentStatus === 'connected' || currentStatus === 'prompting') {
        // 组件可能重新挂载后丢失了状态，同步一次
        sendToRenderer('agent:status', currentStatus);
        return;
      }
      // 非活跃状态，先清理旧会话
      sessionManager.disconnect();
      sessionManager = null;
    }

    const configData = await config.load();
    const agentEntry = configData.agents['claude-acp'];
    const policy = configData.permissionPolicy ?? 'tiered';

    const client = new AcpClient();
    sessionManager = new SessionManager(client, config, terminalRuntime, policy);

    // 设置权限提示回调 → 转发到 Renderer
    sessionManager.setPermissionPromptCallback(async (action) => {
      sendToRenderer('agent:permission-prompt', action);
      return new Promise((resolve) => {
        const handler = (_e: unknown, result: 'allow' | 'deny') => {
          ipcMain.removeHandler('agent:permission-prompt-response');
          resolve(result);
        };
        ipcMain.handleOnce('agent:permission-prompt-response', handler);
      });
    });

    // 转发事件到 Renderer
    sessionManager.on('status', (status) => sendToRenderer('agent:status', status));
    sessionManager.on('event', (event) => sendToRenderer('agent:event', event));
    sessionManager.on('capabilities', (caps) => sendToRenderer('agent:capabilities', caps));
    sessionManager.on('file_changed', (change) =>
      sendToRenderer('agent:event', { type: 'file_changed', ...change }),
    );

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

    await sessionManager.connect(projectDir, command, args, env);
  });

  ipcMain.handle('agent:disconnect', async () => {
    sessionManager?.disconnect();
    sessionManager = null;
  });

  ipcMain.handle('agent:send-prompt', async (_event, contents: unknown[]) => {
    await sessionManager?.sendPrompt(contents);
  });

  ipcMain.handle('agent:cancel-turn', async () => {
    await sessionManager?.cancelTurn();
  });

  ipcMain.handle('agent:set-mode', async (_event, modeId: string) => {
    await sessionManager?.setMode(modeId);
  });

  ipcMain.handle('agent:set-config-option', async (_event, configId: string, valueId: string) => {
    await sessionManager?.setConfigOption(configId, valueId);
  });

  ipcMain.handle('agent:respond-permission', async (_event, requestId: string, optionId: string) => {
    await sessionManager?.respondPermission(requestId, optionId);
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
    sessionManager?.setPermissionPolicy(policy);
  });

  // 预检与安装
  ipcMain.handle('agent:run-preflight', () => runPreflight(binaryManager, config, 'claude-acp'));
  ipcMain.handle('agent:install', async (_event, version: string) => binaryManager.install(version));
  ipcMain.handle('agent:uninstall', () => binaryManager.uninstall());
  ipcMain.handle('agent:get-latest-version', () => binaryManager.getLatestVersion());
}
