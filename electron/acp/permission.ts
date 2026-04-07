import type { PermissionPolicy } from './types';

export type PermissionAction =
  | { type: 'fs.read'; path: string }
  | { type: 'fs.write'; path: string }
  | { type: 'terminal.execute'; command: string }
  | { type: 'terminal.create'; cwd?: string };

export type PermissionResult = 'allow' | 'deny';

type PromptCallback = (action: PermissionAction) => Promise<PermissionResult>;

export class PermissionHandler {
  private policy: PermissionPolicy;
  private promptCallback: PromptCallback | null = null;

  constructor(policy: PermissionPolicy) {
    this.policy = policy;
  }

  setPolicy(policy: PermissionPolicy): void {
    this.policy = policy;
  }

  getPolicy(): PermissionPolicy {
    return this.policy;
  }

  setPromptCallback(cb: PromptCallback): void {
    this.promptCallback = cb;
  }

  async check(action: PermissionAction): Promise<PermissionResult> {
    if (this.policy === 'auto_approve') {
      return 'allow';
    }

    if (this.policy === 'tiered') {
      if (action.type === 'fs.read') {
        return 'allow';
      }
      return this.promptUser(action);
    }

    // always_ask
    return this.promptUser(action);
  }

  private async promptUser(action: PermissionAction): Promise<PermissionResult> {
    if (!this.promptCallback) {
      return 'deny';
    }
    return this.promptCallback(action);
  }
}
