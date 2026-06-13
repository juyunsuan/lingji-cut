import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { AgentIcon } from '../src/components/agent/AgentIcon';

describe('AgentIcon', () => {
  it('claude — 渲染不崩，含 aria-label "Claude"', () => {
    const html = renderToStaticMarkup(<AgentIcon agentId="claude" />);
    expect(html).toContain('aria-label="Claude"');
    expect(html).toContain('title="Claude"');
  });

  it('codex — 渲染不崩，含 aria-label "Codex"', () => {
    const html = renderToStaticMarkup(<AgentIcon agentId="codex" />);
    expect(html).toContain('aria-label="Codex"');
    expect(html).toContain('title="Codex"');
  });

  it('pi — 渲染不崩，含 aria-label "Pi"', () => {
    const html = renderToStaticMarkup(<AgentIcon agentId="pi" />);
    expect(html).toContain('aria-label="Pi"');
    expect(html).toContain('title="Pi"');
  });

  it('三个已知 id 各渲染不同 HTML', () => {
    const claudeHtml = renderToStaticMarkup(<AgentIcon agentId="claude" />);
    const codexHtml = renderToStaticMarkup(<AgentIcon agentId="codex" />);
    const piHtml = renderToStaticMarkup(<AgentIcon agentId="pi" />);

    expect(claudeHtml).not.toBe(codexHtml);
    expect(claudeHtml).not.toBe(piHtml);
    expect(codexHtml).not.toBe(piHtml);
  });

  it('claude-acp 后缀 — 自动去除 -acp 后缀，识别为 Claude', () => {
    const html = renderToStaticMarkup(<AgentIcon agentId="claude-acp" />);
    expect(html).toContain('aria-label="Claude"');
  });

  it('pi-acp 后缀 — 识别为 Pi', () => {
    const html = renderToStaticMarkup(<AgentIcon agentId="pi-acp" />);
    expect(html).toContain('aria-label="Pi"');
  });

  it('未知 id — 回退默认，不崩，aria-label 为 "Agent"', () => {
    const html = renderToStaticMarkup(<AgentIcon agentId="unknown-agent-xyz" />);
    expect(html).toContain('aria-label="Agent"');
    expect(html).toContain('title="Agent"');
  });

  it('空字符串 id — 回退默认，不崩', () => {
    expect(() => renderToStaticMarkup(<AgentIcon agentId="" />)).not.toThrow();
    const html = renderToStaticMarkup(<AgentIcon agentId="" />);
    expect(html).toContain('aria-label="Agent"');
  });

  it('size prop 影响渲染宽高', () => {
    const html24 = renderToStaticMarkup(<AgentIcon agentId="claude" size={24} />);
    const html16 = renderToStaticMarkup(<AgentIcon agentId="claude" size={16} />);
    expect(html24).toContain('width:24px');
    expect(html16).toContain('width:16px');
  });

  it('默认 size 为 16', () => {
    const html = renderToStaticMarkup(<AgentIcon agentId="claude" />);
    expect(html).toContain('width:16px');
  });
});
