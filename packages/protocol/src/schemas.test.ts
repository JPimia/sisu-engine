import { describe, expect, it } from 'vitest';
import { newLeaseId, newMailId, newPlanId, newRunId, newWorkItemId } from './ids.js';
import {
  AdapterRegistrationSchema,
  AgentMailSchema,
  CapabilityDefinitionSchema,
  ExecutionPlanSchema,
  ExecutionPlanStepSchema,
  ExternalRefSchema,
  RoleDefinitionSchema,
  RuntimeLeaseSchema,
  TokenUsageSchema,
  WorkflowStepSchema,
  WorkflowTemplateSchema,
  WorkItemSchema,
} from './schemas.js';

const now = new Date().toISOString();

// ---------------------------------------------------------------------------
// ExternalRef
// ---------------------------------------------------------------------------

describe('ExternalRefSchema', () => {
  it('accepts valid external ref', () => {
    const result = ExternalRefSchema.safeParse({
      system: 'mission-control',
      id: 'task-123',
      url: 'https://mc.example.com/task/123',
      metadata: { priority: 1 },
    });
    expect(result.success).toBe(true);
  });

  it('accepts minimal external ref', () => {
    const result = ExternalRefSchema.safeParse({ system: 'github', id: 'issue-42' });
    expect(result.success).toBe(true);
  });

  it('rejects missing system', () => {
    const result = ExternalRefSchema.safeParse({ id: 'task-123' });
    expect(result.success).toBe(false);
  });

  it('rejects invalid url', () => {
    const result = ExternalRefSchema.safeParse({ system: 'mc', id: '1', url: 'not-a-url' });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// WorkItem
// ---------------------------------------------------------------------------

describe('WorkItemSchema', () => {
  const valid = {
    id: newWorkItemId(),
    title: 'Fix the bug',
    status: 'queued' as const,
    version: 0,
    requiredCapabilities: [],
    metadata: {},
    context: {},
    createdAt: now,
    updatedAt: now,
  };

  it('accepts valid work item', () => {
    expect(WorkItemSchema.safeParse(valid).success).toBe(true);
  });

  it('accepts all valid statuses', () => {
    const statuses = [
      'queued',
      'ready',
      'planning',
      'in_progress',
      'in_review',
      'blocked',
      'done',
      'failed',
      'cancelled',
    ] as const;
    for (const status of statuses) {
      expect(WorkItemSchema.safeParse({ ...valid, status }).success).toBe(true);
    }
  });

  it('rejects invalid status', () => {
    expect(WorkItemSchema.safeParse({ ...valid, status: 'unknown' }).success).toBe(false);
  });

  it('rejects invalid ID format', () => {
    expect(WorkItemSchema.safeParse({ ...valid, id: 'bad-id' }).success).toBe(false);
  });

  it('rejects negative version', () => {
    expect(WorkItemSchema.safeParse({ ...valid, version: -1 }).success).toBe(false);
  });

  it('rejects missing title', () => {
    const { title: _title, ...rest } = valid;
    expect(WorkItemSchema.safeParse(rest).success).toBe(false);
  });

  it('accepts optional fields', () => {
    const result = WorkItemSchema.safeParse({
      ...valid,
      description: 'Some description',
      externalRef: { system: 'mc', id: '1' },
      assignedRole: 'builder',
      assignedRun: newRunId(),
    });
    expect(result.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// RoleDefinition
// ---------------------------------------------------------------------------

describe('RoleDefinitionSchema', () => {
  const valid = {
    id: 'builder',
    name: 'Builder',
    description: 'Implements changes',
    modelTier: 'execution' as const,
    canSpawn: [],
    access: { 'work-items': 'write' as const },
    maxConcurrency: -1,
  };

  it('accepts valid role definition', () => {
    expect(RoleDefinitionSchema.safeParse(valid).success).toBe(true);
  });

  it('accepts all model tiers', () => {
    const tiers = ['strategic', 'execution', 'review', 'observation'] as const;
    for (const modelTier of tiers) {
      expect(RoleDefinitionSchema.safeParse({ ...valid, modelTier }).success).toBe(true);
    }
  });

  it('rejects invalid model tier', () => {
    expect(RoleDefinitionSchema.safeParse({ ...valid, modelTier: 'god' }).success).toBe(false);
  });

  it('rejects maxConcurrency below -1', () => {
    expect(RoleDefinitionSchema.safeParse({ ...valid, maxConcurrency: -2 }).success).toBe(false);
  });

  it('accepts modelPreference', () => {
    expect(
      RoleDefinitionSchema.safeParse({ ...valid, modelPreference: 'claude-opus-4-6' }).success,
    ).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// CapabilityDefinition
// ---------------------------------------------------------------------------

describe('CapabilityDefinitionSchema', () => {
  it('accepts valid capability', () => {
    const result = CapabilityDefinitionSchema.safeParse({
      id: 'code-write',
      name: 'Code Write',
      description: 'Can write code',
      version: '1.0.0',
    });
    expect(result.success).toBe(true);
  });

  it('accepts configSchema', () => {
    const result = CapabilityDefinitionSchema.safeParse({
      id: 'code-write',
      name: 'Code Write',
      description: 'Can write code',
      version: '1.0.0',
      configSchema: { type: 'object', properties: {} },
    });
    expect(result.success).toBe(true);
  });

  it('rejects empty id', () => {
    const result = CapabilityDefinitionSchema.safeParse({
      id: '',
      name: 'x',
      description: 'x',
      version: '1',
    });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// WorkflowStep + WorkflowTemplate
// ---------------------------------------------------------------------------

describe('WorkflowStepSchema', () => {
  const valid = {
    id: 'build',
    role: 'builder',
    dependencies: [],
    config: {},
  };

  it('accepts valid workflow step', () => {
    expect(WorkflowStepSchema.safeParse(valid).success).toBe(true);
  });

  it('accepts optional overrides', () => {
    expect(
      WorkflowStepSchema.safeParse({
        ...valid,
        description: 'Build it',
        modelOverride: 'claude-sonnet-4-6',
        modelTierOverride: 'execution',
      }).success,
    ).toBe(true);
  });
});

describe('WorkflowTemplateSchema', () => {
  const validStep = { id: 'build', role: 'builder', dependencies: [], config: {} };
  const valid = {
    id: 'wf_simple-task',
    name: 'Simple Task',
    version: '1.0.0',
    steps: [validStep],
    appliesTo: ['ready' as const],
    requiredCapabilities: [],
  };

  it('accepts valid template', () => {
    expect(WorkflowTemplateSchema.safeParse(valid).success).toBe(true);
  });

  it('accepts empty steps', () => {
    expect(WorkflowTemplateSchema.safeParse({ ...valid, steps: [] }).success).toBe(true);
  });

  it('rejects invalid appliesTo status', () => {
    expect(WorkflowTemplateSchema.safeParse({ ...valid, appliesTo: ['bad'] }).success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// ExecutionPlan
// ---------------------------------------------------------------------------

describe('ExecutionPlanStepSchema', () => {
  const valid = {
    id: 'step-1',
    workflowStepId: 'build',
    role: 'builder',
    status: 'pending' as const,
  };

  it('accepts valid step', () => {
    expect(ExecutionPlanStepSchema.safeParse(valid).success).toBe(true);
  });

  it('accepts all statuses', () => {
    for (const status of ['pending', 'running', 'done', 'failed', 'skipped'] as const) {
      expect(ExecutionPlanStepSchema.safeParse({ ...valid, status }).success).toBe(true);
    }
  });

  it('accepts optional fields', () => {
    expect(
      ExecutionPlanStepSchema.safeParse({
        ...valid,
        runId: newRunId(),
        startedAt: now,
        completedAt: now,
        error: 'something broke',
        output: { result: 'ok' },
      }).success,
    ).toBe(true);
  });
});

describe('ExecutionPlanSchema', () => {
  const step = { id: 'step-1', workflowStepId: 'build', role: 'builder', status: 'pending' };
  const valid = {
    id: newPlanId(),
    workItemId: newWorkItemId(),
    workflowTemplateId: 'wf_simple-task',
    status: 'pending' as const,
    steps: [step],
    createdAt: now,
    updatedAt: now,
  };

  it('accepts valid plan', () => {
    expect(ExecutionPlanSchema.safeParse(valid).success).toBe(true);
  });

  it('rejects invalid plan ID', () => {
    expect(ExecutionPlanSchema.safeParse({ ...valid, id: 'bad' }).success).toBe(false);
  });

  it('rejects invalid workItemId', () => {
    expect(ExecutionPlanSchema.safeParse({ ...valid, workItemId: 'bad' }).success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// AgentMail
// ---------------------------------------------------------------------------

describe('AgentMailSchema', () => {
  const valid = {
    id: newMailId(),
    type: 'dispatch' as const,
    from: 'coordinator',
    to: 'builder',
    subject: 'New task',
    body: 'Please implement feature X',
    read: false,
    priority: 'normal' as const,
    createdAt: now,
  };

  it('accepts valid mail', () => {
    expect(AgentMailSchema.safeParse(valid).success).toBe(true);
  });

  it('accepts all mail types', () => {
    const types = [
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
    ] as const;
    for (const type of types) {
      expect(AgentMailSchema.safeParse({ ...valid, type }).success).toBe(true);
    }
  });

  it('accepts all priorities', () => {
    for (const priority of ['low', 'normal', 'high', 'urgent'] as const) {
      expect(AgentMailSchema.safeParse({ ...valid, priority }).success).toBe(true);
    }
  });

  it('rejects invalid mail ID', () => {
    expect(AgentMailSchema.safeParse({ ...valid, id: 'not-a-mail' }).success).toBe(false);
  });

  it('accepts optional payload and references', () => {
    expect(
      AgentMailSchema.safeParse({
        ...valid,
        payload: { taskId: '123' },
        workItemId: newWorkItemId(),
        planId: newPlanId(),
      }).success,
    ).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// TokenUsage + RuntimeLease
// ---------------------------------------------------------------------------

describe('TokenUsageSchema', () => {
  it('accepts valid token usage', () => {
    expect(
      TokenUsageSchema.safeParse({
        inputTokens: 100,
        outputTokens: 200,
        cacheCreationTokens: 0,
        cacheReadTokens: 50,
      }).success,
    ).toBe(true);
  });

  it('rejects negative tokens', () => {
    expect(
      TokenUsageSchema.safeParse({
        inputTokens: -1,
        outputTokens: 0,
        cacheCreationTokens: 0,
        cacheReadTokens: 0,
      }).success,
    ).toBe(false);
  });
});

describe('RuntimeLeaseSchema', () => {
  const valid = {
    id: newLeaseId(),
    runId: newRunId(),
    role: 'builder',
    model: 'claude-sonnet-4-6',
    tokenUsage: { inputTokens: 0, outputTokens: 0, cacheCreationTokens: 0, cacheReadTokens: 0 },
    lastHeartbeat: now,
    active: true,
    createdAt: now,
    expiresAt: now,
  };

  it('accepts valid lease', () => {
    expect(RuntimeLeaseSchema.safeParse(valid).success).toBe(true);
  });

  it('rejects invalid lease ID', () => {
    expect(RuntimeLeaseSchema.safeParse({ ...valid, id: 'bad' }).success).toBe(false);
  });

  it('rejects invalid run ID', () => {
    expect(RuntimeLeaseSchema.safeParse({ ...valid, runId: 'bad' }).success).toBe(false);
  });

  it('accepts optional work item and plan refs', () => {
    expect(
      RuntimeLeaseSchema.safeParse({
        ...valid,
        workItemId: newWorkItemId(),
        planId: newPlanId(),
      }).success,
    ).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// AdapterRegistration
// ---------------------------------------------------------------------------

describe('AdapterRegistrationSchema', () => {
  const valid = {
    id: 'mc-adapter',
    name: 'Mission Control Adapter',
    system: 'mission-control',
    subscribedEvents: ['task.created', 'task.updated'],
    capabilities: ['webhook'],
    active: true,
    registeredAt: now,
  };

  it('accepts valid registration', () => {
    expect(AdapterRegistrationSchema.safeParse(valid).success).toBe(true);
  });

  it('accepts webhookUrl', () => {
    expect(
      AdapterRegistrationSchema.safeParse({
        ...valid,
        webhookUrl: 'https://mc.example.com/webhooks/sisu',
      }).success,
    ).toBe(true);
  });

  it('rejects invalid webhookUrl', () => {
    expect(AdapterRegistrationSchema.safeParse({ ...valid, webhookUrl: 'not-a-url' }).success).toBe(
      false,
    );
  });

  it('rejects missing system', () => {
    const { system: _system, ...rest } = valid;
    expect(AdapterRegistrationSchema.safeParse(rest).success).toBe(false);
  });
});
