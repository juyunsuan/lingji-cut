import { describe, expect, it } from 'vitest';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const {
  buildReleaseManifest,
  shouldStageProjectPath,
  shouldStageNodeModulePath,
} = require('../scripts/package-mac-helpers.cjs');

describe('package mac staging helpers', () => {
  it('builds a slim runtime manifest for the staged app', () => {
    const manifest = buildReleaseManifest({
      name: 'lingjijianying',
      productName: '灵机剪影',
      version: '1.0.0',
      main: 'dist-electron/main.js',
      scripts: {
        dev: 'electron-vite dev --watch',
        build: 'electron-vite build',
      },
      dependencies: {
        react: '^19.2.4',
      },
      devDependencies: {
        vitest: '^2.1.9',
      },
    });

    expect(manifest).toEqual({
      name: 'lingjijianying',
      productName: '灵机剪影',
      version: '1.0.0',
      main: 'dist-electron/main.js',
    });
  });

  it('stages only runtime project files from the repository root', () => {
    expect(shouldStageProjectPath('dist/index.html')).toBe(true);
    expect(shouldStageProjectPath('dist-electron/main.js')).toBe(true);
    expect(shouldStageProjectPath('src/remotion/index.ts')).toBe(true);

    expect(shouldStageProjectPath('.tmp/design-review/result.png')).toBe(false);
    expect(shouldStageProjectPath('docs/readme.md')).toBe(false);
    expect(shouldStageProjectPath('images/generated-1.png')).toBe(false);
    expect(shouldStageProjectPath('AGENT.md')).toBe(false);
    expect(shouldStageProjectPath('package-lock.json')).toBe(false);
  });

  it('drops caches and renderer-only packages from staged node_modules', () => {
    expect(shouldStageNodeModulePath('@remotion/renderer/index.js')).toBe(true);
    expect(shouldStageNodeModulePath('@langchain/core/messages.js')).toBe(true);
    expect(shouldStageNodeModulePath('react/index.js')).toBe(true);

    expect(shouldStageNodeModulePath('.cache/webpack/index.pack')).toBe(false);
    expect(shouldStageNodeModulePath('.remotion/chrome-headless-shell')).toBe(false);
    expect(shouldStageNodeModulePath('lucide-react/dist/lucide-react.js')).toBe(false);
    expect(shouldStageNodeModulePath('react-day-picker/dist/index.js')).toBe(false);
  });
});
