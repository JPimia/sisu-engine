import type { AgentRuntime } from './interface.js';
import type { AgentHandle, LeaseStatus, SpawnConfig } from './types.js';

export class RuntimeManager {
  private readonly runtimes = new Map<string, AgentRuntime>();

  registerRuntime(name: string, runtime: AgentRuntime): void {
    this.runtimes.set(name, runtime);
  }

  getRuntime(name: string): AgentRuntime | undefined {
    return this.runtimes.get(name);
  }

  listRuntimes(): string[] {
    return Array.from(this.runtimes.keys());
  }

  async spawn(runtimeName: string, config: SpawnConfig): Promise<AgentHandle> {
    const runtime = this.runtimes.get(runtimeName);
    if (!runtime) {
      throw new Error(`Runtime not found: ${runtimeName}`);
    }
    return runtime.spawn(config);
  }

  async stop(runtimeName: string, runId: string): Promise<void> {
    const runtime = this.runtimes.get(runtimeName);
    if (!runtime) {
      throw new Error(`Runtime not found: ${runtimeName}`);
    }
    return runtime.stop(runId);
  }

  async heartbeat(runtimeName: string, runId: string): Promise<LeaseStatus> {
    const runtime = this.runtimes.get(runtimeName);
    if (!runtime) {
      throw new Error(`Runtime not found: ${runtimeName}`);
    }
    return runtime.heartbeat(runId);
  }
}
