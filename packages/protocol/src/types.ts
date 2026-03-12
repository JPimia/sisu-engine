/**
 * Core type definitions for @sisu/protocol.
 * These are the canonical contracts used across all packages.
 */

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------

export type WorkItemStatus =
  | 'queued'
  | 'ready'
  | 'planning'
  | 'in_progress'
  | 'in_review'
  | 'blocked'
  | 'done'
  | 'failed'
  | 'cancelled';

export type ModelTier = 'strategic' | 'execution' | 'review' | 'observation';

export type MailType =
  | 'dispatch'
  | 'status'
  | 'result'
  | 'question'
  | 'error'
  | 'worker_done'
  | 'merge_ready'
  | 'review_pass'
  | 'review_fail'
  | 'escalation';

export type AccessLevel = 'read' | 'write' | 'admin';

// ---------------------------------------------------------------------------
// ExternalRef
// ---------------------------------------------------------------------------

/**
 * Reference to an entity in an external system (e.g. Mission Control, GitHub).
 */
export interface ExternalRef {
  system: string;
  id: string;
  url?: string | undefined;
  metadata?: Record<string, unknown> | undefined;
}

// ---------------------------------------------------------------------------
// WorkItem
// ---------------------------------------------------------------------------

/**
 * The unit of work in SISU. Represents a task moving through a lifecycle.
 */
export interface WorkItem {
  id: string;
  title: string;
  description?: string | undefined;
  status: WorkItemStatus;
  version: number;
  externalRef?: ExternalRef | undefined;
  /** Required capabilities for this work item */
  requiredCapabilities: string[];
  /** Flexible metadata bag for arbitrary key-value data */
  metadata: Record<string, unknown>;
  /** Context bag for runtime state (e.g. current branch, PR URL) */
  context: Record<string, unknown>;
  assignedRole?: string | undefined;
  assignedRun?: string | undefined;
  createdAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// RoleDefinition
// ---------------------------------------------------------------------------

/**
 * Registry entry describing a role that agents can fill.
 */
export interface RoleDefinition {
  id: string;
  name: string;
  description: string;
  modelPreference?: string | undefined;
  modelTier: ModelTier;
  /** Which roles this role is allowed to spawn */
  canSpawn: string[];
  /** Access levels granted to this role */
  access: Record<string, AccessLevel>;
  /** Maximum number of concurrent instances (-1 = unlimited) */
  maxConcurrency: number;
}

// ---------------------------------------------------------------------------
// CapabilityDefinition
// ---------------------------------------------------------------------------

/**
 * Extensible capability descriptor with versioned JSON Schema.
 */
export interface CapabilityDefinition {
  id: string;
  name: string;
  description: string;
  version: string;
  /** JSON Schema for capability configuration */
  configSchema?: Record<string, unknown> | undefined;
}

// ---------------------------------------------------------------------------
// WorkflowTemplate
// ---------------------------------------------------------------------------

/**
 * A single step in a workflow.
 */
export interface WorkflowStep {
  id: string;
  role: string;
  description?: string | undefined;
  /** Step IDs that must complete before this step starts */
  dependencies: string[];
  /** Override the model for this specific step */
  modelOverride?: string | undefined;
  /** Override the model tier for this specific step */
  modelTierOverride?: ModelTier | undefined;
  /** Arbitrary step configuration */
  config: Record<string, unknown>;
}

/**
 * Reusable orchestration template.
 */
export interface WorkflowTemplate {
  id: string;
  name: string;
  description?: string | undefined;
  version: string;
  steps: WorkflowStep[];
  /** Work item status values this workflow applies to */
  appliesTo: WorkItemStatus[];
  /** Capability IDs required for this workflow */
  requiredCapabilities: string[];
}

// ---------------------------------------------------------------------------
// ExecutionPlan
// ---------------------------------------------------------------------------

export type ExecutionPlanStepStatus = 'pending' | 'running' | 'done' | 'failed' | 'skipped';

/**
 * An instantiated step in an execution plan.
 */
export interface ExecutionPlanStep {
  id: string;
  workflowStepId: string;
  role: string;
  status: ExecutionPlanStepStatus;
  runId?: string | undefined;
  startedAt?: string | undefined;
  completedAt?: string | undefined;
  error?: string | undefined;
  output?: Record<string, unknown> | undefined;
}

/**
 * An instantiated workflow for a specific work item.
 */
export interface ExecutionPlan {
  id: string;
  workItemId: string;
  workflowTemplateId: string;
  status: ExecutionPlanStepStatus;
  steps: ExecutionPlanStep[];
  createdAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// AgentMail
// ---------------------------------------------------------------------------

/**
 * Typed inter-agent message.
 */
export interface AgentMail {
  id: string;
  type: MailType;
  from: string;
  to: string;
  subject: string;
  body: string;
  /** Structured payload for machine-readable content */
  payload?: Record<string, unknown> | undefined;
  workItemId?: string | undefined;
  planId?: string | undefined;
  read: boolean;
  priority: 'low' | 'normal' | 'high' | 'urgent';
  createdAt: string;
}

// ---------------------------------------------------------------------------
// RuntimeLease
// ---------------------------------------------------------------------------

/**
 * Tracks agent liveness. Renewed via heartbeat every 15s, stale after 60s.
 */
export interface RuntimeLease {
  id: string;
  runId: string;
  role: string;
  workItemId?: string | undefined;
  planId?: string | undefined;
  model: string;
  /** Cumulative token usage */
  tokenUsage: TokenUsage;
  /** Last heartbeat timestamp (ISO 8601) */
  lastHeartbeat: string;
  /** Whether the lease is still active */
  active: boolean;
  createdAt: string;
  expiresAt: string;
}

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
}

// ---------------------------------------------------------------------------
// AdapterRegistration
// ---------------------------------------------------------------------------

/**
 * Describes how an external system registers with SISU.
 */
export interface AdapterRegistration {
  id: string;
  name: string;
  system: string;
  /** Webhook URL for SISU to call back */
  webhookUrl?: string | undefined;
  /** Supported event types */
  subscribedEvents: string[];
  /** Adapter capabilities */
  capabilities: string[];
  active: boolean;
  registeredAt: string;
}
