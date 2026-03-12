import type { AgentHandle, LeaseStatus, SpawnConfig } from './types.js';

export interface AgentRuntime {
  readonly name: string;
  spawn(config: SpawnConfig): Promise<AgentHandle>;
  stop(runId: string): Promise<void>;
  heartbeat(runId: string): Promise<LeaseStatus>;
  isAvailable(): Promise<boolean>;
}
