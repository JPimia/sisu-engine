import type { RoleDefinition } from '@sisu/protocol';

export interface SpawnConfig {
  runId: string;
  role: RoleDefinition;
  model: string;
  workItemId: string;
  taskDescription: string;
  workingDirectory: string;
  systemPrompt: string;
  files?: string[];
}

export type AgentStatus = 'spawning' | 'active' | 'failed';

export interface AgentHandle {
  runId: string;
  pid?: number;
  status: AgentStatus;
}

export interface LeaseStatus {
  runId: string;
  status: AgentStatus;
  heartbeatAt: string;
  expiresAt: string;
}
