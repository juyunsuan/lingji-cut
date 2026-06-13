import type { RuntimeAgentDef } from '../types';

export const claudeAgentDef = {
  id: 'claude',
  name: 'Claude Code',
  bin: 'claude',
  versionArgs: ['--version'],
  streamFormat: 'claude-stream-json',
  promptViaStdin: true,
  buildArgs: (ctx) => [
    '--print',
    '--output-format',
    'stream-json',
    '--verbose',
    ...(ctx.model ? ['--model', ctx.model] : []),
    ...(ctx.cwd ? ['--add-dir', ctx.cwd] : []),
  ],
} satisfies RuntimeAgentDef;
