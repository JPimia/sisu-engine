import type {
  AgentMail,
  ExecutionPlan,
  ExecutionPlanStep,
  RoleDefinition,
  RuntimeLease,
  WorkflowTemplate,
  WorkItem,
  WorkItemStatus,
} from '@sisu/protocol';

// ---------------------------------------------------------------------------
// Input types
// ---------------------------------------------------------------------------

export interface CreateWorkItemInput {
  title: string;
  description?: string;
  status?: WorkItemStatus;
  externalRef?: WorkItem['externalRef'];
  requiredCapabilities?: string[];
  metadata?: Record<string, unknown>;
  context?: Record<string, unknown>;
  assignedRole?: string;
}

export interface UpdateWorkItemInput {
  title?: string;
  description?: string;
  status?: WorkItemStatus;
  externalRef?: WorkItem['externalRef'];
  requiredCapabilities?: string[];
  metadata?: Record<string, unknown>;
  context?: Record<string, unknown>;
  assignedRole?: string;
  assignedRun?: string;
}

export interface WorkItemFilter {
  status?: WorkItemStatus | WorkItemStatus[];
  assignedRole?: string;
  externalSystem?: string;
}

export interface CreatePlanInput {
  workItemId: string;
  workflowTemplateId: string;
  steps: Array<{
    workflowStepId: string;
    role: string;
  }>;
}

export interface StepUpdate {
  status?: ExecutionPlanStep['status'];
  runId?: string;
  startedAt?: string;
  completedAt?: string;
  error?: string;
  output?: Record<string, unknown>;
}

export interface CreateMailInput {
  type: AgentMail['type'];
  from: string;
  to: string;
  subject: string;
  body: string;
  payload?: Record<string, unknown>;
  workItemId?: string;
  planId?: string;
  priority?: AgentMail['priority'];
}

export interface MailFilter {
  to?: string;
  from?: string;
  read?: boolean;
  workItemId?: string;
  type?: AgentMail['type'];
}

export interface CreateLeaseInput {
  runId: string;
  role: string;
  workItemId?: string;
  planId?: string;
  model: string;
  ttlSeconds?: number;
}

export interface LeaseUpdate {
  lastHeartbeat?: string;
  active?: boolean;
  tokenUsage?: RuntimeLease['tokenUsage'];
  expiresAt?: string;
}

export interface LeaseFilter {
  role?: string;
  workItemId?: string;
  active?: boolean;
}

// ---------------------------------------------------------------------------
// Storage interface
// ---------------------------------------------------------------------------

/**
 * Persistence abstraction for SISU domain objects.
 * Designed to support SQLite (MVP) and PostgreSQL (production).
 */
export interface SisuStorage {
  // Work Items
  createWorkItem(input: CreateWorkItemInput): Promise<WorkItem>;
  getWorkItem(id: string): Promise<WorkItem | null>;
  listWorkItems(filter?: WorkItemFilter): Promise<WorkItem[]>;
  /**
   * Update a work item. If `expectedVersion` is provided, throws if the stored
   * version doesn't match (optimistic concurrency control).
   */
  updateWorkItem(
    id: string,
    update: UpdateWorkItemInput,
    expectedVersion?: number,
  ): Promise<WorkItem>;

  // Execution Plans
  createPlan(input: CreatePlanInput): Promise<ExecutionPlan>;
  getPlan(id: string): Promise<ExecutionPlan | null>;
  getPlanByWorkItem(workItemId: string): Promise<ExecutionPlan | null>;
  updatePlanStep(planId: string, stepId: string, update: StepUpdate): Promise<ExecutionPlan>;

  // Mail
  sendMail(input: CreateMailInput): Promise<AgentMail>;
  listMail(filter: MailFilter): Promise<AgentMail[]>;
  markRead(mailId: string): Promise<void>;

  // Leases
  createLease(input: CreateLeaseInput): Promise<RuntimeLease>;
  getLease(id: string): Promise<RuntimeLease | null>;
  updateLease(id: string, update: LeaseUpdate): Promise<RuntimeLease>;
  listLeases(filter?: LeaseFilter): Promise<RuntimeLease[]>;

  // Roles (read-only — populated from built-in registry)
  listRoles(): Promise<RoleDefinition[]>;
  getRole(id: string): Promise<RoleDefinition | null>;

  // Workflows (read-only — populated from templates)
  listWorkflows(): Promise<WorkflowTemplate[]>;
  getWorkflow(id: string): Promise<WorkflowTemplate | null>;
}
