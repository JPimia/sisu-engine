import { z } from 'zod';

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------

export const WorkItemStatusSchema = z.enum([
  'queued',
  'ready',
  'planning',
  'in_progress',
  'in_review',
  'blocked',
  'done',
  'failed',
  'cancelled',
]);

export const ModelTierSchema = z.enum(['strategic', 'execution', 'review', 'observation']);

export const MailTypeSchema = z.enum([
  'dispatch',
  'status',
  'result',
  'question',
  'error',
  'worker_done',
  'merge_ready',
  'review_pass',
  'review_fail',
  'escalation',
]);

export const AccessLevelSchema = z.enum(['read', 'write', 'admin']);

export const MailPrioritySchema = z.enum(['low', 'normal', 'high', 'urgent']);

// ---------------------------------------------------------------------------
// ExternalRef
// ---------------------------------------------------------------------------

export const ExternalRefSchema = z.object({
  system: z.string().min(1),
  id: z.string().min(1),
  url: z.string().url().optional(),
  metadata: z.record(z.unknown()).optional(),
});

// ---------------------------------------------------------------------------
// WorkItem
// ---------------------------------------------------------------------------

export const WorkItemSchema = z.object({
  id: z.string().regex(/^wrk_[0-9A-Z]{26}$/, 'Invalid work item ID format'),
  title: z.string().min(1),
  description: z.string().optional(),
  status: WorkItemStatusSchema,
  version: z.number().int().nonnegative(),
  externalRef: ExternalRefSchema.optional(),
  requiredCapabilities: z.array(z.string()),
  metadata: z.record(z.unknown()),
  context: z.record(z.unknown()),
  assignedRole: z.string().optional(),
  assignedRun: z.string().optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

// ---------------------------------------------------------------------------
// RoleDefinition
// ---------------------------------------------------------------------------

export const RoleDefinitionSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string(),
  modelPreference: z.string().optional(),
  modelTier: ModelTierSchema,
  canSpawn: z.array(z.string()),
  access: z.record(AccessLevelSchema),
  maxConcurrency: z.number().int().min(-1),
});

// ---------------------------------------------------------------------------
// CapabilityDefinition
// ---------------------------------------------------------------------------

export const CapabilityDefinitionSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string(),
  version: z.string(),
  configSchema: z.record(z.unknown()).optional(),
});

// ---------------------------------------------------------------------------
// WorkflowStep + WorkflowTemplate
// ---------------------------------------------------------------------------

export const WorkflowStepSchema = z.object({
  id: z.string().min(1),
  role: z.string().min(1),
  description: z.string().optional(),
  dependencies: z.array(z.string()),
  modelOverride: z.string().optional(),
  modelTierOverride: ModelTierSchema.optional(),
  config: z.record(z.unknown()),
});

export const WorkflowTemplateSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional(),
  version: z.string(),
  steps: z.array(WorkflowStepSchema),
  appliesTo: z.array(WorkItemStatusSchema),
  requiredCapabilities: z.array(z.string()),
});

// ---------------------------------------------------------------------------
// ExecutionPlan
// ---------------------------------------------------------------------------

export const ExecutionPlanStepStatusSchema = z.enum([
  'pending',
  'running',
  'done',
  'failed',
  'skipped',
]);

export const ExecutionPlanStepSchema = z.object({
  id: z.string().min(1),
  workflowStepId: z.string().min(1),
  role: z.string().min(1),
  status: ExecutionPlanStepStatusSchema,
  runId: z.string().optional(),
  startedAt: z.string().datetime().optional(),
  completedAt: z.string().datetime().optional(),
  error: z.string().optional(),
  output: z.record(z.unknown()).optional(),
});

export const ExecutionPlanSchema = z.object({
  id: z.string().regex(/^plan_[0-9A-Z]{26}$/, 'Invalid plan ID format'),
  workItemId: z.string().regex(/^wrk_[0-9A-Z]{26}$/, 'Invalid work item ID format'),
  workflowTemplateId: z.string().min(1),
  status: ExecutionPlanStepStatusSchema,
  steps: z.array(ExecutionPlanStepSchema),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

// ---------------------------------------------------------------------------
// AgentMail
// ---------------------------------------------------------------------------

export const AgentMailSchema = z.object({
  id: z.string().regex(/^mail_[0-9A-Z]{26}$/, 'Invalid mail ID format'),
  type: MailTypeSchema,
  from: z.string().min(1),
  to: z.string().min(1),
  subject: z.string().min(1),
  body: z.string(),
  payload: z.record(z.unknown()).optional(),
  workItemId: z.string().optional(),
  planId: z.string().optional(),
  read: z.boolean(),
  priority: MailPrioritySchema,
  createdAt: z.string().datetime(),
});

// ---------------------------------------------------------------------------
// RuntimeLease
// ---------------------------------------------------------------------------

export const TokenUsageSchema = z.object({
  inputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
  cacheCreationTokens: z.number().int().nonnegative(),
  cacheReadTokens: z.number().int().nonnegative(),
});

export const RuntimeLeaseSchema = z.object({
  id: z.string().regex(/^lease_[0-9A-Z]{26}$/, 'Invalid lease ID format'),
  runId: z.string().regex(/^run_[0-9A-Z]{26}$/, 'Invalid run ID format'),
  role: z.string().min(1),
  workItemId: z.string().optional(),
  planId: z.string().optional(),
  model: z.string().min(1),
  tokenUsage: TokenUsageSchema,
  lastHeartbeat: z.string().datetime(),
  active: z.boolean(),
  createdAt: z.string().datetime(),
  expiresAt: z.string().datetime(),
});

// ---------------------------------------------------------------------------
// AdapterRegistration
// ---------------------------------------------------------------------------

export const AdapterRegistrationSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  system: z.string().min(1),
  webhookUrl: z.string().url().optional(),
  subscribedEvents: z.array(z.string()),
  capabilities: z.array(z.string()),
  active: z.boolean(),
  registeredAt: z.string().datetime(),
});
