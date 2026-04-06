import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const TEST_DIR = dirname(fileURLToPath(import.meta.url));

function readSource(relativePath: string): string {
  return readFileSync(resolve(TEST_DIR, '..', relativePath), 'utf8');
}

describe('AI assistant business components use the shared UI library', () => {
  it('keeps AI card inspector typography aligned with design.pen', () => {
    const css = readSource('src/components/AICardInspector.module.css');

    expect(css).toMatch(/\.textInput\s*{[^}]*font-size:\s*12px;/s);
    expect(css).toMatch(/\.textArea\s*{[^}]*font-size:\s*11px;/s);
    expect(css).toMatch(/\.promptArea\s*{[^}]*font-size:\s*11px;/s);
    expect(css).toMatch(/\.dangerButton\s*{[^}]*font-size:\s*12px;/s);
  });

  it('keeps the asset library shell aligned with design.pen', () => {
    const editorCss = readSource('src/pages/Editor.module.css');
    const editorSource = readSource('src/pages/Editor.tsx');
    const assetCardCss = readSource('src/components/AssetCard.module.css');
    const assetPanelCss = readSource('src/components/AssetPanel.module.css');

    expect(editorCss).toMatch(/\.topTabButton\s*{[^}]*font-size:\s*12px;/s);
    expect(editorSource).toContain('<FolderOpen size={13}');
    expect(editorSource).toContain('<Sparkles size={13}');
    expect(assetCardCss).toMatch(
      /\.root\s*{[^}]*width:\s*64px;[^}]*height:\s*64px;[^}]*border-radius:\s*6px;/s,
    );
    expect(assetPanelCss).toMatch(/\.filterPill\s*{[^}]*min-height:\s*22px\s*!important;/s);
  });

  it('keeps SubtitleInspector free of local compact field shells and raw select controls', () => {
    const source = readSource('src/components/SubtitleInspector.tsx');

    expect(source).not.toContain('function CompactColorField');
    expect(source).not.toContain('function CompactNumberField');
    expect(source).not.toContain('function CompactSwitch');
    expect(source).not.toContain('<select');
  });

  it('keeps AICardInspector free of raw button elements', () => {
    const source = readSource('src/components/AICardInspector.tsx');

    expect(source).not.toContain('<button');
  });

  it('keeps AIPanel free of raw button and textarea elements', () => {
    const source = readSource('src/components/AIPanel.tsx');

    expect(source).not.toContain('<button');
    expect(source).not.toContain('<textarea');
  });

  it('keeps AICoverPanel free of raw button and textarea elements', () => {
    const source = readSource('src/components/AICoverPanel.tsx');

    expect(source).not.toContain('<button');
    expect(source).not.toContain('<textarea');
  });

  it('keeps AICardList free of raw checkbox inputs', () => {
    const source = readSource('src/components/AICardList.tsx');

    expect(source).not.toContain('type="checkbox"');
  });

  it('keeps the Editor sidebar panel switch free of raw top-tab buttons', () => {
    const source = readSource('src/pages/Editor.tsx');

    expect(source).not.toContain('<button');
  });
});
