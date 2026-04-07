import fs from 'node:fs/promises';
import path from 'node:path';

const MAX_READ_SIZE = 1024 * 1024; // 1MB
const MAX_WRITE_SIZE = 5 * 1024 * 1024; // 5MB

export interface WriteResult {
  success: boolean;
  before: string | null;
  after: string;
  filePath: string;
}

export class FileSystemRuntime {
  constructor(private projectDir: string) {}

  async readTextFile(params: { path: string }): Promise<{ content: string }> {
    const resolved = this.validatePath(params.path);
    const stat = await fs.stat(resolved);

    if (stat.size > MAX_READ_SIZE) {
      const content = await this.readPartial(resolved, MAX_READ_SIZE);
      return { content: content + '\n\n[文件已截断，超出 1MB 上限]' };
    }

    const content = await fs.readFile(resolved, 'utf-8');
    return { content };
  }

  async writeTextFile(params: { path: string; content: string }): Promise<WriteResult> {
    const resolved = this.validatePath(params.path);

    if (Buffer.byteLength(params.content, 'utf-8') > MAX_WRITE_SIZE) {
      throw new Error('Write content exceeds 5MB limit');
    }

    let before: string | null = null;
    try {
      before = await fs.readFile(resolved, 'utf-8');
    } catch {
      // 文件不存在
    }

    await fs.mkdir(path.dirname(resolved), { recursive: true });
    await fs.writeFile(resolved, params.content, 'utf-8');

    return {
      success: true,
      before,
      after: params.content,
      filePath: resolved,
    };
  }

  private validatePath(filePath: string): string {
    const resolved = path.resolve(this.projectDir, filePath);

    if (!resolved.startsWith(this.projectDir + path.sep) && resolved !== this.projectDir) {
      throw new Error(`Path outside project directory: ${filePath}`);
    }

    const relative = path.relative(this.projectDir, resolved);
    const segments = relative.split(path.sep);
    if (segments[0] === '.git') {
      throw new Error('Access to .git directory is forbidden');
    }

    return resolved;
  }

  private async readPartial(filePath: string, maxBytes: number): Promise<string> {
    const fh = await fs.open(filePath, 'r');
    try {
      const buffer = Buffer.alloc(maxBytes);
      const { bytesRead } = await fh.read(buffer, 0, maxBytes, 0);
      return buffer.subarray(0, bytesRead).toString('utf-8');
    } finally {
      await fh.close();
    }
  }
}
