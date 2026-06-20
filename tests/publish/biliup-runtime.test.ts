import { describe, it, expect } from 'vitest';
import { buildPlatformKey, biliupBinaryName } from '../../electron/publish/biliup-runtime';

it('平台 key 归一化 darwin/arm64 → macos-aarch64', () => {
  expect(buildPlatformKey('darwin', 'arm64')).toBe('macos-aarch64');
  expect(buildPlatformKey('win32', 'x64')).toBe('windows-x86_64');
});
it('归一化 amd64/x64 → x86_64, linux 保持 linux', () => {
  expect(buildPlatformKey('linux', 'amd64')).toBe('linux-x86_64');
  expect(buildPlatformKey('linux', 'x64')).toBe('linux-x86_64');
});
it('windows 用 biliup.exe，其它用 biliup', () => {
  expect(biliupBinaryName('win32')).toBe('biliup.exe');
  expect(biliupBinaryName('darwin')).toBe('biliup');
  expect(biliupBinaryName('linux')).toBe('biliup');
});
