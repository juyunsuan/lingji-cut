import type { RuntimeAgentDef } from '../types';

// TODO: Verify Pi CLI flags and rpc mode invocation against real binary
export const piAgentDef = {
  id: 'pi',
  name: 'Pi',
  bin: 'pi',
  versionArgs: ['--version'],
  streamFormat: 'pi-rpc',
  resumesSessionViaCli: true,
  buildArgs: (_ctx) => ['--mode', 'rpc'],
} satisfies RuntimeAgentDef;
