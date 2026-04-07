import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { FileSystemRuntime } from '../electron/acp/fs-runtime';

let tmpDir: string;
let runtime: FileSystemRuntime;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'fs-runtime-test-'));
  runtime = new FileSystemRuntime(tmpDir);
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe('FileSystemRuntime', () => {
  describe('readTextFile', () => {
    it('reads a file within project dir', async () => {
      await fs.writeFile(path.join(tmpDir, 'test.txt'), 'hello world', 'utf-8');
      const result = await runtime.readTextFile({ path: path.join(tmpDir, 'test.txt') });
      expect(result.content).toBe('hello world');
    });

    it('rejects paths outside project dir', async () => {
      await expect(runtime.readTextFile({ path: '/etc/passwd' })).rejects.toThrow(/outside project/i);
    });

    it('rejects paths with traversal', async () => {
      await expect(
        runtime.readTextFile({ path: path.join(tmpDir, '..', '..', 'etc', 'passwd') }),
      ).rejects.toThrow(/outside project/i);
    });

    it('rejects .git internal files', async () => {
      await fs.mkdir(path.join(tmpDir, '.git'), { recursive: true });
      await fs.writeFile(path.join(tmpDir, '.git', 'config'), 'secret', 'utf-8');
      await expect(
        runtime.readTextFile({ path: path.join(tmpDir, '.git', 'config') }),
      ).rejects.toThrow(/\.git/);
    });
  });

  describe('writeTextFile', () => {
    it('writes a file within project dir', async () => {
      const result = await runtime.writeTextFile({
        path: path.join(tmpDir, 'output.txt'),
        content: 'new content',
      });
      expect(result.success).toBe(true);
      const written = await fs.readFile(path.join(tmpDir, 'output.txt'), 'utf-8');
      expect(written).toBe('new content');
    });

    it('captures before snapshot for diff', async () => {
      await fs.writeFile(path.join(tmpDir, 'existing.txt'), 'old content', 'utf-8');
      const result = await runtime.writeTextFile({
        path: path.join(tmpDir, 'existing.txt'),
        content: 'new content',
      });
      expect(result.success).toBe(true);
      expect(result.before).toBe('old content');
      expect(result.after).toBe('new content');
    });

    it('returns null before for new files', async () => {
      const result = await runtime.writeTextFile({
        path: path.join(tmpDir, 'brand-new.txt'),
        content: 'fresh',
      });
      expect(result.before).toBeNull();
    });

    it('rejects paths outside project dir', async () => {
      await expect(
        runtime.writeTextFile({ path: '/tmp/evil.txt', content: 'hack' }),
      ).rejects.toThrow(/outside project/i);
    });

    it('creates parent directories', async () => {
      const filePath = path.join(tmpDir, 'sub', 'dir', 'file.txt');
      await runtime.writeTextFile({ path: filePath, content: 'nested' });
      const content = await fs.readFile(filePath, 'utf-8');
      expect(content).toBe('nested');
    });
  });
});
