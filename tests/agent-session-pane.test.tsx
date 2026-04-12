import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { SessionListPane } from '../src/components/agent/SessionListPane';

vi.mock('../src/hooks/use-conversation-list', () => ({
  useConversationList: () => ({
    conversations: [
      {
        id: 101,
        title: '会话 A',
        status: 'active',
        externalId: null,
      },
      {
        id: 102,
        title: '会话 B',
        status: 'draft_local',
        externalId: 'resume-102',
      },
    ],
    activeConversationId: 101,
    loading: false,
    error: null,
  }),
}));

describe('SessionListPane collapse mode', () => {
  it('renders a collapse toggle and full conversation rows when expanded', () => {
    const html = renderToStaticMarkup(
      <SessionListPane
        collapsed={false}
        onToggleCollapse={() => undefined}
        explicitConversationId={null}
        onSelectConversation={() => undefined}
        onCreateConversation={() => undefined}
        onDeleteConversation={() => undefined}
      />,
    );

    expect(html).toContain('data-collapsed="false"');
    expect(html).toContain('会话 A');
    expect(html).toContain('删除会话');
  });

  it('renders a compact rail when collapsed', () => {
    const html = renderToStaticMarkup(
      <SessionListPane
        collapsed
        explicitConversationId={null}
        onSelectConversation={() => undefined}
        onCreateConversation={() => undefined}
        onDeleteConversation={() => undefined}
      />,
    );

    expect(html).toContain('data-collapsed="true"');
    expect(html).toContain('aria-label="打开会话 A"');
    expect(html).not.toContain('删除会话');
  });
});
