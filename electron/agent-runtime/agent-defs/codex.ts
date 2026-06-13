import type { RuntimeAgentDef } from '../types';

// TODO: Verify actual Codex CLI flags for JSON event output mode against real binary
export const codexAgentDef = {
  id: 'codex',
  name: 'Codex',
  bin: 'codex',
  versionArgs: ['--version'],
  streamFormat: 'codex-json-event',
  buildArgs: (ctx) => [
    'exec',
    '--json',
    ...(ctx.model ? ['--model', ctx.model] : []),
  ],
} satisfies RuntimeAgentDef;
