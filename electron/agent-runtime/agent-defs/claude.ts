import type { RuntimeAgentDef } from '../types';

// TODO: Verify exact Claude model IDs against Anthropic's current model roster.
//       Current IDs aligned with claude-sonnet-4-20250514 used in AgentSettingsTab.
export const claudeAgentDef = {
  id: 'claude',
  name: 'Claude Code',
  bin: 'claude',
  versionArgs: ['--version'],
  streamFormat: 'claude-stream-json',
  promptViaStdin: true,
  defaultModel: 'claude-sonnet-4-5',
  models: [
    { id: 'claude-sonnet-4-5', label: 'Claude Sonnet 4.5' },
    { id: 'claude-opus-4-5', label: 'Claude Opus 4.5' },
    { id: 'claude-haiku-4-5', label: 'Claude Haiku 4.5' },
    // TODO: Confirm these model IDs against Anthropic's live model list
  ],
  // TODO: Confirm the exact Claude CLI resume flag against the real binary.
  //       Implemented here as `--resume <sessionId>` so multi-turn sessions
  //       persist their externalId; literal flag pending manual verification.
  buildArgs: (ctx) => [
    '--print',
    '--output-format',
    'stream-json',
    '--verbose',
    ...(ctx.model ? ['--model', ctx.model] : []),
    ...(ctx.cwd ? ['--add-dir', ctx.cwd] : []),
    ...(ctx.resumeSessionId ? ['--resume', ctx.resumeSessionId] : []),
  ],
} satisfies RuntimeAgentDef;
