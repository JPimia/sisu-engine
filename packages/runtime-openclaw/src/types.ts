export interface SpawnConfig {
  runId: string;
  role: string;
  planId: string;
  model: string;
  workItemId: string;
  taskDescription: string;
  workingDirectory: string;
  systemPrompt: string;
  files?: string[];
}

export type AgentStatus = 'spawning' | 'active' | 'completed' | 'failed';

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
