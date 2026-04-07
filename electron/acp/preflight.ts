import type { PreflightCheck } from './types';
import { BinaryManager } from './binary-manager';
import type { AgentConfig } from './config';

export async function runPreflight(
  binaryManager: BinaryManager,
  config: AgentConfig,
  agentId: string,
): Promise<PreflightCheck[]> {
  const checks: PreflightCheck[] = [];

  // 1. Node.js
  const nodeVersion = await binaryManager.getNodeVersion();
  if (nodeVersion) {
    checks.push({ label: 'Node.js', status: 'pass', message: nodeVersion });
  } else {
    checks.push({
      label: 'Node.js',
      status: 'fail',
      message: '未安装 Node.js',
      fixAction: 'install',
    });
  }

  // 2. npx
  const npxPath = await binaryManager.findNpxPath();
  if (npxPath) {
    checks.push({ label: 'npx', status: 'pass', message: npxPath });
  } else {
    checks.push({
      label: 'npx',
      status: 'fail',
      message: '未找到 npx',
      fixAction: 'install',
    });
  }

  // 3. Agent 安装状态
  const installedVersion = await binaryManager.getInstalledVersion();
  const latestVersion = await binaryManager.getLatestVersion();

  if (installedVersion) {
    if (latestVersion && installedVersion !== latestVersion) {
      checks.push({
        label: 'claude-agent-acp',
        status: 'warn',
        message: `已安装 ${installedVersion}，最新 ${latestVersion}`,
        fixAction: 'upgrade',
      });
    } else {
      checks.push({
        label: 'claude-agent-acp',
        status: 'pass',
        message: `v${installedVersion}`,
      });
    }
  } else {
    checks.push({
      label: 'claude-agent-acp',
      status: 'fail',
      message: '未安装',
      fixAction: 'install',
    });
  }

  // 4. API Key
  const configData = await config.load();
  const agentEntry = configData.agents[agentId];
  if (agentEntry?.authMode === 'subscription') {
    checks.push({ label: 'API Key', status: 'pass', message: '使用官方订阅' });
  } else {
    const apiKey = await config.getApiKey(agentId);
    if (apiKey) {
      checks.push({ label: 'API Key', status: 'pass', message: '已配置' });
    } else {
      checks.push({
        label: 'API Key',
        status: 'warn',
        message: '未设置 API Key',
      });
    }
  }

  return checks;
}
