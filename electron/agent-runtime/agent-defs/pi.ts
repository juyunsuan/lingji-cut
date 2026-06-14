import type { RuntimeAgentDef } from '../types';

// TODO: Verify Pi CLI flags and rpc mode invocation against real binary
// TODO: Pi model selection is configured on the Pi provider side; this list is a placeholder.
export const piAgentDef = {
  id: 'pi',
  name: 'Pi',
  bin: 'pi',
  versionArgs: ['--version'],
  streamFormat: 'pi-rpc',
  resumesSessionViaCli: true,
  defaultModel: 'default',
  models: [
    { id: 'default', label: 'Default' },
    // TODO: Confirm actual Pi model IDs once Pi CLI model list is available
  ],
  buildArgs: (_ctx) => ['--mode', 'rpc'],
} satisfies RuntimeAgentDef;
