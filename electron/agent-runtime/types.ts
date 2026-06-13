export type StreamFormat = 'claude-stream-json' | 'codex-json-event' | 'pi-rpc';

export interface BuildArgsCtx {
  prompt: string;
  cwd?: string;
  model?: string;
  resumeSessionId?: string | null;
  isResuming?: boolean;
}

export interface RuntimeAgentDef {
  id: string; // 'claude' | 'codex' | 'pi'
  name: string;
  bin: string;
  fallbackBins?: string[];
  versionArgs: string[];
  buildArgs: (ctx: BuildArgsCtx) => string[];
  streamFormat: StreamFormat;
  promptViaStdin?: boolean;
  resumesSessionViaCli?: boolean;
  env?: Record<string, string>;
  defaultModel?: string;
}
