import type { RuntimeAgentDef } from '../types';

// TODO: Verify actual Codex CLI flags for JSON event output mode against real binary
// TODO: Verify Codex resume flag/shape against real binary. `codex exec` takes the
//       prompt as a trailing positional arg; resume is not wired here yet (codex
//       resume CLI form unconfirmed). Multi-turn memory for codex remains a follow-up.
// TODO: Verify Codex model IDs against OpenAI's current model roster.
export const codexAgentDef = {
  id: 'codex',
  name: 'Codex',
  bin: 'codex',
  versionArgs: ['--version'],
  streamFormat: 'codex-json-event',
  defaultModel: 'codex-mini-latest',
  models: [
    { id: 'codex-mini-latest', label: 'Codex Mini (Latest)' },
    { id: 'gpt-4.1', label: 'GPT-4.1' },
    { id: 'gpt-4.1-mini', label: 'GPT-4.1 Mini' },
    // TODO: Confirm model IDs against OpenAI's live model list
  ],
  // `codex exec --json [--model <m>] <prompt>` — prompt is a trailing positional arg.
  // codex is NOT promptViaStdin, so the prompt must live in argv or the child gets no input.
  buildArgs: (ctx) => [
    'exec',
    '--json',
    ...(ctx.model ? ['--model', ctx.model] : []),
    ctx.prompt,
  ],
} satisfies RuntimeAgentDef;
