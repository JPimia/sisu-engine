import { rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SqliteStorage } from './sqlite.js';

function tempDb(): string {
  return join(tmpdir(), `sisu-test-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);
}

describe('SqliteStorage — WorkItems', () => {
  let db: string;
  let storage: SqliteStorage;

  beforeEach(() => {
    db = tempDb();
    storage = new SqliteStorage(db);
  });

  afterEach(() => {
    storage.close();
    try {
      rmSync(db);
    } catch {
      /* ignore */
    }
  });

  it('creates a work item with defaults', async () => {
    const item = await storage.createWorkItem({ title: 'Test task' });
    expect(item.id).toMatch(/^wrk_/);
    expect(item.title).toBe('Test task');
    expect(item.status).toBe('queued');
    expect(item.version).toBe(0);
    expect(item.requiredCapabilities).toEqual([]);
    expect(item.metadata).toEqual({});
    expect(item.context).toEqual({});
    expect(item.createdAt).toBeTruthy();
    expect(item.updatedAt).toBeTruthy();
  });

  it('creates a work item with all fields', async () => {
    const item = await storage.createWorkItem({
      title: 'Full task',
      description: 'Description here',
      status: 'ready',
      externalRef: { system: 'github', id: '42', url: 'https://github.com/org/repo/issues/42' },
      requiredCapabilities: ['typescript', 'react'],
      metadata: { priority: 'high' },
      context: { branch: 'feat/123' },
      assignedRole: 'builder',
    });
    expect(item.description).toBe('Description here');
    expect(item.status).toBe('ready');
    expect(item.externalRef?.system).toBe('github');
    expect(item.requiredCapabilities).toEqual(['typescript', 'react']);
    expect(item.metadata).toEqual({ priority: 'high' });
    expect(item.context).toEqual({ branch: 'feat/123' });
    expect(item.assignedRole).toBe('builder');
  });

  it('getWorkItem returns null for unknown id', async () => {
    expect(await storage.getWorkItem('wrk_NOTEXIST')).toBeNull();
  });

  it('getWorkItem returns created item', async () => {
    const created = await storage.createWorkItem({ title: 'Fetch me' });
    const fetched = await storage.getWorkItem(created.id);
    expect(fetched?.title).toBe('Fetch me');
  });

  it('listWorkItems returns all items', async () => {
    await storage.createWorkItem({ title: 'A' });
    await storage.createWorkItem({ title: 'B' });
    const items = await storage.listWorkItems();
    expect(items).toHaveLength(2);
  });

  it('listWorkItems filters by single status', async () => {
    await storage.createWorkItem({ title: 'Queued', status: 'queued' });
    await storage.createWorkItem({ title: 'Ready', status: 'ready' });
    const queued = await storage.listWorkItems({ status: 'queued' });
    expect(queued).toHaveLength(1);
    expect(queued[0]?.title).toBe('Queued');
  });

  it('listWorkItems filters by multiple statuses', async () => {
    await storage.createWorkItem({ title: 'A', status: 'queued' });
    await storage.createWorkItem({ title: 'B', status: 'ready' });
    await storage.createWorkItem({ title: 'C', status: 'done' });
    const items = await storage.listWorkItems({ status: ['queued', 'ready'] });
    expect(items).toHaveLength(2);
  });

  it('listWorkItems filters by assignedRole', async () => {
    await storage.createWorkItem({ title: 'Builder task', assignedRole: 'builder' });
    await storage.createWorkItem({ title: 'Reviewer task', assignedRole: 'reviewer' });
    const builderTasks = await storage.listWorkItems({ assignedRole: 'builder' });
    expect(builderTasks).toHaveLength(1);
    expect(builderTasks[0]?.assignedRole).toBe('builder');
  });

  it('updateWorkItem updates fields and increments version', async () => {
    const created = await storage.createWorkItem({ title: 'Original' });
    const updated = await storage.updateWorkItem(created.id, { title: 'Updated', status: 'ready' });
    expect(updated.title).toBe('Updated');
    expect(updated.status).toBe('ready');
    expect(updated.version).toBe(1);
  });

  it('updateWorkItem with correct expectedVersion succeeds', async () => {
    const created = await storage.createWorkItem({ title: 'Versioned' });
    const updated = await storage.updateWorkItem(created.id, { status: 'ready' }, 0);
    expect(updated.version).toBe(1);
  });

  it('updateWorkItem with wrong expectedVersion throws', async () => {
    const created = await storage.createWorkItem({ title: 'Conflict' });
    await expect(storage.updateWorkItem(created.id, { status: 'ready' }, 99)).rejects.toThrow(
      'Version conflict',
    );
  });

  it('updateWorkItem with unknown id throws', async () => {
    await expect(storage.updateWorkItem('wrk_GHOST', { title: 'Ghost' })).rejects.toThrow(
      'WorkItem not found',
    );
  });

  it('sequential updates accumulate versions', async () => {
    const item = await storage.createWorkItem({ title: 'Task' });
    const v1 = await storage.updateWorkItem(item.id, { status: 'ready' }, 0);
    expect(v1.version).toBe(1);
    const v2 = await storage.updateWorkItem(item.id, { status: 'in_progress' }, 1);
    expect(v2.version).toBe(2);
  });
});

describe('SqliteStorage — ExecutionPlans', () => {
  let db: string;
  let storage: SqliteStorage;

  beforeEach(() => {
    db = tempDb();
    storage = new SqliteStorage(db);
  });

  afterEach(() => {
    storage.close();
    try {
      rmSync(db);
    } catch {
      /* ignore */
    }
  });

  it('creates a plan with steps', async () => {
    const plan = await storage.createPlan({
      workItemId: 'wrk_TEST',
      workflowTemplateId: 'wf_simple-task',
      steps: [
        { workflowStepId: 'step-1', role: 'builder' },
        { workflowStepId: 'step-2', role: 'reviewer' },
      ],
    });
    expect(plan.id).toMatch(/^plan_/);
    expect(plan.workItemId).toBe('wrk_TEST');
    expect(plan.status).toBe('pending');
    expect(plan.steps).toHaveLength(2);
    expect(plan.steps[0]?.role).toBe('builder');
    expect(plan.steps[1]?.role).toBe('reviewer');
  });

  it('getPlan returns null for unknown id', async () => {
    expect(await storage.getPlan('plan_GHOST')).toBeNull();
  });

  it('getPlan returns created plan', async () => {
    const created = await storage.createPlan({
      workItemId: 'wrk_X',
      workflowTemplateId: 'wf_test',
      steps: [{ workflowStepId: 's1', role: 'builder' }],
    });
    const fetched = await storage.getPlan(created.id);
    expect(fetched?.id).toBe(created.id);
    expect(fetched?.steps).toHaveLength(1);
  });

  it('updatePlanStep updates step status', async () => {
    const plan = await storage.createPlan({
      workItemId: 'wrk_X',
      workflowTemplateId: 'wf_test',
      steps: [{ workflowStepId: 's1', role: 'builder' }],
    });
    const stepId = plan.steps[0]?.id ?? '';
    const updated = await storage.updatePlanStep(plan.id, stepId, {
      status: 'running',
      runId: 'run_ABC',
      startedAt: new Date().toISOString(),
    });
    const step = updated.steps.find((s) => s.id === stepId);
    expect(step?.status).toBe('running');
    expect(step?.runId).toBe('run_ABC');
  });

  it('plan status becomes done when all steps done', async () => {
    const plan = await storage.createPlan({
      workItemId: 'wrk_X',
      workflowTemplateId: 'wf_test',
      steps: [{ workflowStepId: 's1', role: 'builder' }],
    });
    const stepId = plan.steps[0]?.id ?? '';
    const updated = await storage.updatePlanStep(plan.id, stepId, { status: 'done' });
    expect(updated.status).toBe('done');
  });

  it('plan status becomes failed when any step failed', async () => {
    const plan = await storage.createPlan({
      workItemId: 'wrk_X',
      workflowTemplateId: 'wf_test',
      steps: [
        { workflowStepId: 's1', role: 'builder' },
        { workflowStepId: 's2', role: 'reviewer' },
      ],
    });
    const stepId = plan.steps[0]?.id ?? '';
    const updated = await storage.updatePlanStep(plan.id, stepId, {
      status: 'failed',
      error: 'Build error',
    });
    expect(updated.status).toBe('failed');
    const step = updated.steps.find((s) => s.id === stepId);
    expect(step?.error).toBe('Build error');
  });

  it('updatePlanStep throws for unknown plan', async () => {
    await expect(
      storage.updatePlanStep('plan_GHOST', 'step_X', { status: 'done' }),
    ).rejects.toThrow('ExecutionPlan not found');
  });

  it('getPlanByWorkItem returns null when no plan exists', async () => {
    expect(await storage.getPlanByWorkItem('wrk_GHOST')).toBeNull();
  });

  it('getPlanByWorkItem returns the plan for a work item', async () => {
    const plan = await storage.createPlan({
      workItemId: 'wrk_FINDME',
      workflowTemplateId: 'wf_test',
      steps: [{ workflowStepId: 's1', role: 'builder' }],
    });
    const found = await storage.getPlanByWorkItem('wrk_FINDME');
    expect(found?.id).toBe(plan.id);
    expect(found?.workItemId).toBe('wrk_FINDME');
    expect(found?.steps).toHaveLength(1);
  });

  it('getPlanByWorkItem returns the most recent plan when multiple exist', async () => {
    await storage.createPlan({
      workItemId: 'wrk_MULTI',
      workflowTemplateId: 'wf_first',
      steps: [{ workflowStepId: 's1', role: 'builder' }],
    });
    const second = await storage.createPlan({
      workItemId: 'wrk_MULTI',
      workflowTemplateId: 'wf_second',
      steps: [{ workflowStepId: 's1', role: 'reviewer' }],
    });
    const found = await storage.getPlanByWorkItem('wrk_MULTI');
    expect(found?.id).toBe(second.id);
    expect(found?.workflowTemplateId).toBe('wf_second');
  });
});

describe('SqliteStorage — Mail', () => {
  let db: string;
  let storage: SqliteStorage;

  beforeEach(() => {
    db = tempDb();
    storage = new SqliteStorage(db);
  });

  afterEach(() => {
    storage.close();
    try {
      rmSync(db);
    } catch {
      /* ignore */
    }
  });

  it('sends mail and returns it', async () => {
    const mail = await storage.sendMail({
      type: 'dispatch',
      from: 'coordinator',
      to: 'builder',
      subject: 'New task',
      body: 'Please build feature X',
    });
    expect(mail.id).toMatch(/^mail_/);
    expect(mail.type).toBe('dispatch');
    expect(mail.from).toBe('coordinator');
    expect(mail.to).toBe('builder');
    expect(mail.read).toBe(false);
    expect(mail.priority).toBe('normal');
  });

  it('listMail filters by recipient', async () => {
    await storage.sendMail({ type: 'status', from: 'a', to: 'builder', subject: 'S', body: 'B' });
    await storage.sendMail({ type: 'status', from: 'a', to: 'reviewer', subject: 'S', body: 'B' });
    const builderMail = await storage.listMail({ to: 'builder' });
    expect(builderMail).toHaveLength(1);
  });

  it('listMail filters by read status', async () => {
    const mail = await storage.sendMail({
      type: 'result',
      from: 'a',
      to: 'b',
      subject: 'S',
      body: 'B',
    });
    await storage.markRead(mail.id);
    const unread = await storage.listMail({ to: 'b', read: false });
    expect(unread).toHaveLength(0);
    const read = await storage.listMail({ to: 'b', read: true });
    expect(read).toHaveLength(1);
  });

  it('listMail filters by type', async () => {
    await storage.sendMail({ type: 'dispatch', from: 'a', to: 'b', subject: 'S', body: 'B' });
    await storage.sendMail({ type: 'error', from: 'a', to: 'b', subject: 'S', body: 'B' });
    const errors = await storage.listMail({ type: 'error' });
    expect(errors).toHaveLength(1);
  });

  it('markRead marks mail as read', async () => {
    const mail = await storage.sendMail({
      type: 'status',
      from: 'a',
      to: 'b',
      subject: 'S',
      body: 'B',
    });
    await storage.markRead(mail.id);
    const [fetched] = await storage.listMail({ to: 'b', read: true });
    expect(fetched?.read).toBe(true);
  });

  it('stores payload and workItemId', async () => {
    const mail = await storage.sendMail({
      type: 'dispatch',
      from: 'coord',
      to: 'builder',
      subject: 'Task',
      body: 'Go',
      payload: { taskId: 'abc' },
      workItemId: 'wrk_123',
    });
    const [fetched] = await storage.listMail({ workItemId: 'wrk_123' });
    expect(fetched?.payload).toEqual({ taskId: 'abc' });
    expect(fetched?.workItemId).toBe('wrk_123');
    expect(mail.workItemId).toBe('wrk_123');
  });
});

describe('SqliteStorage — Leases', () => {
  let db: string;
  let storage: SqliteStorage;

  beforeEach(() => {
    db = tempDb();
    storage = new SqliteStorage(db);
  });

  afterEach(() => {
    storage.close();
    try {
      rmSync(db);
    } catch {
      /* ignore */
    }
  });

  it('creates a lease with defaults', async () => {
    const lease = await storage.createLease({
      runId: 'run_ABC',
      role: 'builder',
      model: 'claude-sonnet-4-6',
    });
    expect(lease.id).toMatch(/^lease_/);
    expect(lease.runId).toBe('run_ABC');
    expect(lease.role).toBe('builder');
    expect(lease.active).toBe(true);
    expect(lease.tokenUsage.inputTokens).toBe(0);
    expect(lease.expiresAt).toBeTruthy();
  });

  it('getLease returns null for unknown id', async () => {
    expect(await storage.getLease('lease_GHOST')).toBeNull();
  });

  it('getLease returns created lease', async () => {
    const created = await storage.createLease({
      runId: 'r1',
      role: 'reviewer',
      model: 'claude-haiku-4-5-20251001',
    });
    const fetched = await storage.getLease(created.id);
    expect(fetched?.id).toBe(created.id);
    expect(fetched?.role).toBe('reviewer');
  });

  it('updateLease updates heartbeat and tokenUsage', async () => {
    const lease = await storage.createLease({
      runId: 'r1',
      role: 'builder',
      model: 'claude-sonnet-4-6',
    });
    const ts = new Date().toISOString();
    const updated = await storage.updateLease(lease.id, {
      lastHeartbeat: ts,
      tokenUsage: {
        inputTokens: 100,
        outputTokens: 50,
        cacheCreationTokens: 10,
        cacheReadTokens: 5,
      },
    });
    expect(updated.lastHeartbeat).toBe(ts);
    expect(updated.tokenUsage.inputTokens).toBe(100);
  });

  it('updateLease deactivates lease', async () => {
    const lease = await storage.createLease({
      runId: 'r1',
      role: 'builder',
      model: 'claude-sonnet-4-6',
    });
    const updated = await storage.updateLease(lease.id, { active: false });
    expect(updated.active).toBe(false);
  });

  it('updateLease throws for unknown id', async () => {
    await expect(storage.updateLease('lease_GHOST', { active: false })).rejects.toThrow(
      'Lease not found',
    );
  });

  it('listLeases filters by role', async () => {
    await storage.createLease({ runId: 'r1', role: 'builder', model: 'm1' });
    await storage.createLease({ runId: 'r2', role: 'reviewer', model: 'm1' });
    const builders = await storage.listLeases({ role: 'builder' });
    expect(builders).toHaveLength(1);
  });

  it('listLeases filters by active', async () => {
    const lease = await storage.createLease({ runId: 'r1', role: 'builder', model: 'm1' });
    await storage.updateLease(lease.id, { active: false });
    const active = await storage.listLeases({ active: true });
    expect(active).toHaveLength(0);
    const inactive = await storage.listLeases({ active: false });
    expect(inactive).toHaveLength(1);
  });

  it('listLeases filters by workItemId', async () => {
    await storage.createLease({ runId: 'r1', role: 'builder', model: 'm1', workItemId: 'wrk_A' });
    await storage.createLease({ runId: 'r2', role: 'builder', model: 'm1', workItemId: 'wrk_B' });
    const leases = await storage.listLeases({ workItemId: 'wrk_A' });
    expect(leases).toHaveLength(1);
  });
});

describe('SqliteStorage — Roles and Workflows (in-memory)', () => {
  const mockRoles = [
    {
      id: 'test-role',
      name: 'Test Role',
      description: 'desc',
      modelTier: 'execution' as const,
      canSpawn: [],
      access: {},
      maxConcurrency: -1,
    },
  ];

  const mockWorkflows = [
    {
      id: 'wf_test',
      name: 'Test Workflow',
      version: '1.0.0',
      steps: [],
      appliesTo: ['queued' as const],
      requiredCapabilities: [],
    },
  ];

  let db: string;
  let storage: SqliteStorage;

  beforeEach(() => {
    db = tempDb();
    storage = new SqliteStorage(db, { roles: mockRoles, workflows: mockWorkflows });
  });

  afterEach(() => {
    storage.close();
    try {
      rmSync(db);
    } catch {
      /* ignore */
    }
  });

  it('listRoles returns injected roles', async () => {
    const roles = await storage.listRoles();
    expect(roles).toHaveLength(1);
    expect(roles[0]?.id).toBe('test-role');
  });

  it('getRole returns role by id', async () => {
    const role = await storage.getRole('test-role');
    expect(role?.name).toBe('Test Role');
  });

  it('getRole returns null for unknown id', async () => {
    expect(await storage.getRole('ghost')).toBeNull();
  });

  it('listWorkflows returns injected workflows', async () => {
    const workflows = await storage.listWorkflows();
    expect(workflows).toHaveLength(1);
    expect(workflows[0]?.id).toBe('wf_test');
  });

  it('getWorkflow returns workflow by id', async () => {
    const wf = await storage.getWorkflow('wf_test');
    expect(wf?.name).toBe('Test Workflow');
  });

  it('getWorkflow returns null for unknown id', async () => {
    expect(await storage.getWorkflow('wf_ghost')).toBeNull();
  });
});
