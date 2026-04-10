import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs/promises';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const execFileAsync = promisify(execFile);

const AGENT_NPM_PACKAGE = '@agentclientprotocol/claude-agent-acp';
const AGENT_BIN_NAME = 'claude-agent-acp';
const NPM_OFFICIAL_REGISTRY = 'https://registry.npmjs.org';

export class BinaryManager {
  private cachePath: string;
  private userNpmPrefix: string;

  constructor(cacheBase?: string) {
    this.cachePath = cacheBase ?? path.join(os.homedir(), '.lingji', 'acp-binaries', 'claude-acp');
    this.userNpmPrefix = path.join(os.homedir(), '.lingji', 'npm-global');
  }

  /**
   * 在应用启动时调用，确保 nvm/fnm/volta 管理的 node 在 PATH 中。
   * 同时将用户本地 npm prefix 的 bin 目录加入 PATH。
   */
  ensureNodeInPath(): void {
    // 如果 node 已在 PATH 中，跳过
    const nodePath = this.whichSync('node');
    if (!nodePath) {
      const binDir = this.findNodeBinDir();
      if (binDir) {
        this.prependToPath(binDir);
      }
    }

    // 确保用户本地 npm prefix bin 目录在 PATH 中
    const userBinDir = path.join(this.userNpmPrefix, 'bin');
    const currentPath = process.env.PATH ?? '';
    if (!currentPath.split(':').includes(userBinDir)) {
      this.prependToPath(userBinDir);
    }
  }

  /** 移除 npm_* 环境变量，避免 npm run dev 时继承的 npm 内部配置干扰子进程 */
  private getCleanEnv(): NodeJS.ProcessEnv {
    const env: NodeJS.ProcessEnv = {};
    for (const [key, value] of Object.entries(process.env)) {
      if (!key.startsWith('npm_')) {
        env[key] = value;
      }
    }
    return env;
  }

  async findNpxPath(): Promise<string | null> {
    return this.findBinaryPath('npx');
  }

  async findNodePath(): Promise<string | null> {
    return this.findBinaryPath('node');
  }

  async getNodeVersion(): Promise<string | null> {
    try {
      const { stdout } = await execFileAsync('node', ['--version'], {
        timeout: 10_000,
        env: this.getCleanEnv(),
      });
      return stdout.trim();
    } catch {
      return null;
    }
  }

  async getInstalledVersion(): Promise<string | null> {
    try {
      const versionFile = path.join(this.cachePath, 'version.txt');
      return (await fs.readFile(versionFile, 'utf-8')).trim();
    } catch {
      return null;
    }
  }

  async getLatestVersion(): Promise<string | null> {
    try {
      const { stdout } = await execFileAsync(
        'npm',
        ['view', AGENT_NPM_PACKAGE, 'version', `--registry=${NPM_OFFICIAL_REGISTRY}`],
        { timeout: 15_000, env: this.getCleanEnv() },
      );
      return stdout.trim();
    } catch {
      return null;
    }
  }

  /**
   * 通过 npm install -g 安装 agent 二进制。
   * 参考 codeg 实现：使用官方 registry、EACCES 回退到用户本地 prefix。
   */
  async install(version: string): Promise<void> {
    await fs.mkdir(this.cachePath, { recursive: true });

    const pkg = `${AGENT_NPM_PACKAGE}@${version}`;
    const registryArg = `--registry=${NPM_OFFICIAL_REGISTRY}`;
    const env = this.getCleanEnv();

    try {
      await this.npmInstallGlobal(pkg, registryArg, env);
    } catch (err) {
      const stderr = (err as { stderr?: string }).stderr ?? String(err);
      // EACCES: 权限不足 → 回退到用户本地 prefix
      if (stderr.includes('EACCES')) {
        await this.installToUserPrefix(pkg, registryArg, env);
      } else if (stderr.includes('EEXIST')) {
        // EEXIST: 文件冲突 → --force 重试
        try {
          await this.npmInstallGlobal(pkg, registryArg, env, true);
        } catch (retryErr) {
          const retryStderr = (retryErr as { stderr?: string }).stderr ?? String(retryErr);
          if (retryStderr.includes('EACCES')) {
            await this.installToUserPrefix(pkg, registryArg, env);
          } else {
            throw new Error(`npm install -g --force 失败: ${retryStderr}`);
          }
        }
      } else {
        throw new Error(`npm install -g 失败: ${stderr}`);
      }
    }

    await fs.writeFile(path.join(this.cachePath, 'version.txt'), version, 'utf-8');
  }

  async uninstall(): Promise<void> {
    try {
      await fs.rm(this.cachePath, { recursive: true, force: true });
    } catch {
      // 目录不存在
    }
  }

  /**
   * 返回 spawn 命令：直接使用全局安装的二进制名称，而非 npx 包装。
   * 调用方应在 spawn 时传入 getCleanEnv() 的环境变量。
   */
  getSpawnCommand(_version: string): { command: string; args: string[] } {
    // 尝试解析完整路径，找不到则回退到二进制名称（依赖 PATH）
    const resolved = this.whichSync(AGENT_BIN_NAME);
    return {
      command: resolved ?? AGENT_BIN_NAME,
      args: [],
    };
  }

  // ── 内部方法 ──────────────────────────────────────────────────────────

  private async npmInstallGlobal(
    pkg: string,
    registryArg: string,
    env: NodeJS.ProcessEnv,
    force = false,
  ): Promise<void> {
    const args = ['install', '-g', registryArg, pkg];
    if (force) args.splice(2, 0, '--force');

    const { stderr } = await execFileAsync('npm', args, {
      timeout: 120_000,
      env,
    });
    // execFileAsync 在非零退出码时自动 throw，这里处理 stderr 中有警告但退出码为 0 的情况
    if (stderr && (stderr.includes('ERR!') || stderr.includes('EACCES') || stderr.includes('EEXIST'))) {
      const err = new Error(`npm install failed: ${stderr}`);
      (err as Error & { stderr?: string }).stderr = stderr;
      throw err;
    }
  }

  /** 回退：安装到用户本地 prefix (~/.lingji/npm-global/) */
  private async installToUserPrefix(
    pkg: string,
    registryArg: string,
    env: NodeJS.ProcessEnv,
  ): Promise<void> {
    await fs.mkdir(this.userNpmPrefix, { recursive: true });
    const prefixArg = `--prefix=${this.userNpmPrefix}`;

    const { stderr } = await execFileAsync(
      'npm',
      ['install', '-g', prefixArg, registryArg, pkg],
      { timeout: 120_000, env },
    );
    if (stderr && stderr.includes('ERR!')) {
      // EEXIST in user prefix: --force 重试
      if (stderr.includes('EEXIST')) {
        await execFileAsync(
          'npm',
          ['install', '-g', '--force', prefixArg, registryArg, pkg],
          { timeout: 120_000, env },
        );
        return;
      }
      throw new Error(`npm install to user prefix 失败: ${stderr}`);
    }
  }

  private async findBinaryPath(name: string): Promise<string | null> {
    try {
      const { stdout } = await execFileAsync('which', [name], { env: this.getCleanEnv() });
      return stdout.trim() || null;
    } catch {
      return null;
    }
  }

  private whichSync(name: string): string | null {
    try {
      const { execFileSync } = require('node:child_process');
      const result = execFileSync('which', [name], {
        encoding: 'utf-8',
        env: this.getCleanEnv(),
      });
      return result.trim() || null;
    } catch {
      return null;
    }
  }

  /** 检测 nvm/fnm/volta 管理的 node 的 bin 目录 */
  private findNodeBinDir(): string | null {
    const home = os.homedir();

    // nvm
    const nvmDir = process.env.NVM_DIR ?? path.join(home, '.nvm');
    const nvmVersionsDir = path.join(nvmDir, 'versions', 'node');
    if (existsSync(nvmVersionsDir)) {
      // 优先使用 default alias 指向的版本
      const defaultAlias = path.join(nvmDir, 'alias', 'default');
      if (existsSync(defaultAlias)) {
        try {
          const alias = readFileSync(defaultAlias, 'utf-8').trim();
          const entries = readdirSync(nvmVersionsDir);
          for (const entry of entries) {
            const stripped = entry.replace(/^v/, '');
            if (stripped.startsWith(alias) || entry.startsWith(alias)) {
              const binDir = path.join(nvmVersionsDir, entry, 'bin');
              if (existsSync(path.join(binDir, 'node'))) return binDir;
            }
          }
        } catch {
          // ignore
        }
      }
      // 回退：使用最新版本
      try {
        const entries = readdirSync(nvmVersionsDir).sort().reverse();
        for (const entry of entries) {
          const binDir = path.join(nvmVersionsDir, entry, 'bin');
          if (existsSync(path.join(binDir, 'node'))) return binDir;
        }
      } catch {
        // ignore
      }
    }

    // fnm
    const fnmDir = process.env.FNM_DIR ?? path.join(home, '.local', 'share', 'fnm');
    const fnmVersions = path.join(fnmDir, 'node-versions');
    if (existsSync(fnmVersions)) {
      try {
        const entries = readdirSync(fnmVersions).sort().reverse();
        for (const entry of entries) {
          const binDir = path.join(fnmVersions, entry, 'installation', 'bin');
          if (existsSync(path.join(binDir, 'node'))) return binDir;
        }
      } catch {
        // ignore
      }
    }

    // volta
    const voltaHome = process.env.VOLTA_HOME ?? path.join(home, '.volta');
    const voltaBin = path.join(voltaHome, 'bin');
    if (existsSync(path.join(voltaBin, 'node'))) return voltaBin;

    return null;
  }

  private prependToPath(dir: string): void {
    const current = process.env.PATH ?? '';
    process.env.PATH = `${dir}:${current}`;
  }
}
