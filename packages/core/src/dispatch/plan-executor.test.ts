import { rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ExecutionPlan, RoleDefinition, WorkflowTemplate } from '@sisu/protocol';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SqliteStorage } from '../storage/sqlite.js';
import { dispatch } from './dispatcher.js';
import type { AgentHandle, AgentRuntime, SpawnConfig } from './plan-executor.js';
import { executeNextStep, findReadyStep } from './plan-executor.js';

function tempDb(): string {
  return join(
    tmpdir(),
    `sisu-executor-test-${Date.now()}-${Math.random().toString(36).slice(2)}.db`,
  );
}

const BUILDER_ROLE: RoleDefinition = {
  id: 'builder',
  name: 'Builder',
  description: 'Builder',
  modelTier: 'execution',
  modelPreference: 'claude-haiku-4-5',
  canSpawn: [],
  access: {},
  maxConcurrency: -1,
};

const SIMPLE_WORKFLOW: WorkflowTemplate = {
  id: 'wf_simple-task',
  name: 'Simple Task',
  version: '1.0.0',
  steps: [{ id: 'step-1', role: 'builder', dependencies: [], config: {} }],
  appliesTo: ['ready'],
  requiredCapabilities: [],
};

function makeMockRuntime(overrides: Partial<AgentRuntime> = {}): AgentRuntime {
  return {
    spawn: vi.fn().mockResolvedValue({
      runId: 'run_MOCK',
      status: 'spawning',
    } satisfies AgentHandle),
    stop: vi.fn().mockResolvedValue(undefined),
    heartbeat: vi.fn().mockResolvedValue('active' as const),
    isAvailable: vi.fn().mockResolvedValue(true),
    ...overrides,
  };
}

describe('findReadyStep', () => {
  it('returns first pending step when no dependencies', () => {
    const plan: ExecutionPlan = {
      id: 'plan_1',
      workItemId: 'wrk_1',
      workflowTemplateId: 'wf_simple-task',
      status: 'pending',
      steps: [
        {
          id: 'step-a',
          workflowStepId: 'ws-a',
          role: 'builder',
          status: 'pending',
        },
      ],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const step = findReadyStep(plan);
    expect(step?.id).toBe('step-a');
  });

  it('returns null when all steps are running', () => {
    const plan: ExecutionPlan = {
      id: 'plan_1',
      workItemId: 'wrk_1',
      workflowTemplateId: 'wf_simple-task',
      status: 'running',
      steps: [{ id: 'step-a', workflowStepId: 'ws-a', role: 'builder', status: 'running' }],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    expect(findReadyStep(plan)).toBeNull();
  });

  it('returns null when all steps are done', () => {
    const plan: ExecutionPlan = {
      id: 'plan_1',
      workItemId: 'wrk_1',
      workflowTemplateId: 'wf_simple-task',
      status: 'done',
      steps: [{ id: 'step-a', workflowStepId: 'ws-a', role: 'builder', status: 'done' }],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    expect(findReadyStep(plan)).toBeNull();
  });

  it('returns second step when first is done', () => {
    const plan: ExecutionPlan = {
      id: 'plan_1',
      workItemId: 'wrk_1',
      workflowTemplateId: 'wf_simple-task',
      status: 'running',
      steps: [
        { id: 'step-a', workflowStepId: 'ws-a', role: 'builder', status: 'done' },
        { id: 'step-b', workflowStepId: 'ws-b', role: 'builder', status: 'pending' },
      ],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const step = findReadyStep(plan);
    expect(step?.id).toBe('step-b');
  });
});

describe('executeNextStep', () => {
  let db: string;
  let storage: SqliteStorage;

  beforeEach(() => {
    db = tempDb();
    storage = new SqliteStorage(db, { roles: [BUILDER_ROLE], workflows: [SIMPLE_WORKFLOW] });
  });

  afterEach(() => {
    storage.close();
    try {
      rmSync(db);
    } catch {
      /* ignore */
    }
  });

  it('returns plan unchanged when no ready step', async () => {
    const item = await storage.createWorkItem({ title: 'Task', status: 'ready' });
    const plan = await dispatch(item.id, storage);

    // Mark the step as running so none is ready
    const firstStepId = plan.steps[0]?.id ?? '';
    await storage.updatePlanStep(plan.id, firstStepId, { status: 'running' });
    const updatedPlan = await storage.getPlan(plan.id);

    const runtime = makeMockRuntime();
    if (!updatedPlan) throw new Error('Plan not found');
    const result = await executeNextStep(updatedPlan, storage, runtime);

    expect(runtime.spawn).not.toHaveBeenCalled();
    expect(result).toEqual(updatedPlan);
  });

  it('spawns agent and transitions step to running', async () => {
    const item = await storage.createWorkItem({ title: 'Task', status: 'ready' });
    const plan = await dispatch(item.id, storage);

    const runtime = makeMockRuntime();
    const updatedPlan = await executeNextStep(plan, storage, runtime);

    expect(runtime.spawn).toHaveBeenCalledOnce();
    const calls = (runtime.spawn as ReturnType<typeof vi.fn>).mock.calls;
    const spawnCall = calls[0]?.[0] as SpawnConfig;
    expect(spawnCall.role).toBe('builder');
    expect(spawnCall.workItemId).toBe(item.id);
    expect(spawnCall.planId).toBe(plan.id);
    expect(spawnCall.model).toBe('claude-haiku-4-5');

    const step = updatedPlan.steps[0];
    if (!step) throw new Error('No step in plan');
    expect(step.status).toBe('running');
    expect(step.runId).toBe('run_MOCK');
    expect(step.startedAt).toBeTruthy();
  });

  it('creates a lease after spawning', async () => {
    const item = await storage.createWorkItem({ title: 'Task', status: 'ready' });
    const plan = await dispatch(item.id, storage);

    const runtime = makeMockRuntime();
    await executeNextStep(plan, storage, runtime);

    const leases = await storage.listLeases({ workItemId: item.id });
    expect(leases).toHaveLength(1);
    expect(leases[0]?.runId).toBe('run_MOCK');
    expect(leases[0]?.role).toBe('builder');
    expect(leases[0]?.active).toBe(true);
  });

  it('falls back to default model when role has no modelPreference', async () => {
    const roleNoModel: RoleDefinition = {
      ...BUILDER_ROLE,
      id: 'reviewer',
      modelPreference: undefined,
    };
    const workflow: WorkflowTemplate = {
      ...SIMPLE_WORKFLOW,
      id: 'wf_review',
      steps: [{ id: 'step-rev', role: 'reviewer', dependencies: [], config: {} }],
      appliesTo: ['ready'],
    };
    const db2 = tempDb();
    const s2 = new SqliteStorage(db2, { roles: [roleNoModel], workflows: [workflow] });

    try {
      const item = await s2.createWorkItem({ title: 'Review task', status: 'ready' });
      const plan = await dispatch(item.id, s2);
      const runtime = makeMockRuntime();
      await executeNextStep(plan, s2, runtime);

      const spawnCall = (runtime.spawn as ReturnType<typeof vi.fn>).mock
        .calls[0]?.[0] as SpawnConfig;
      expect(spawnCall.model).toBe('claude-sonnet-4-6');
    } finally {
      s2.close();
      try {
        rmSync(db2);
      } catch {
        /* ignore */
      }
    }
  });
});
