import { describe, expect, it } from 'vitest';
import packageJson from '../package.json';

describe('package runtime dependencies', () => {
  it('keeps Remotion runtime dependencies in dependencies for Electron packaging', () => {
    expect(packageJson.dependencies?.react).toBeTruthy();
    expect(packageJson.dependencies?.['react-dom']).toBeTruthy();
  });
});
