import { rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { RoleDefinition, WorkflowTemplate } from '@sisu/protocol';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SqliteStorage } from '../storage/sqlite.js';
import { dispatch } from './dispatcher.js';

function tempDb(): string {
  return join(
    tmpdir(),
    `sisu-dispatch-test-${Date.now()}-${Math.random().toString(36).slice(2)}.db`,
  );
}

const BUILDER_ROLE: RoleDefinition = {
  id: 'builder',
  name: 'Builder',
  description: 'Builder',
  modelTier: 'execution',
  canSpawn: [],
  access: {},
  maxConcurrency: -1,
};

const SIMPLE_WORKFLOW: WorkflowTemplate = {
  id: 'wf_simple-task',
  name: 'Simple Task',
  version: '1.0.0',
  steps: [
    {
      id: 'step-build',
      role: 'builder',
      dependencies: [],
      config: {},
    },
  ],
  appliesTo: ['ready'],
  requiredCapabilities: [],
};

describe('dispatch', () => {
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

  it('throws when work item does not exist', async () => {
    await expect(dispatch('wrk_MISSING', storage)).rejects.toThrow('Work item not found');
  });

  it('creates an execution plan from work item', async () => {
    const item = await storage.createWorkItem({ title: 'Build feature', status: 'ready' });
    const plan = await dispatch(item.id, storage);

    expect(plan.id).toMatch(/^plan_/);
    expect(plan.workItemId).toBe(item.id);
    expect(plan.workflowTemplateId).toBe('wf_simple-task');
    expect(plan.steps).toHaveLength(1);
    expect(plan.steps[0]?.role).toBe('builder');
    expect(plan.steps[0]?.status).toBe('pending');
  });

  it('transitions work item through planning → in_progress', async () => {
    const item = await storage.createWorkItem({ title: 'Build feature', status: 'ready' });
    await dispatch(item.id, storage);

    const updated = await storage.getWorkItem(item.id);
    expect(updated?.status).toBe('in_progress');
  });

  it('uses explicit workflowTemplateId from context', async () => {
    const customWorkflow: WorkflowTemplate = {
      id: 'wf_custom',
      name: 'Custom',
      version: '1.0.0',
      steps: [{ id: 'step-review', role: 'builder', dependencies: [], config: {} }],
      appliesTo: [],
      requiredCapabilities: [],
    };
    storage = new SqliteStorage(db, {
      roles: [BUILDER_ROLE],
      workflows: [SIMPLE_WORKFLOW, customWorkflow],
    });

    const item = await storage.createWorkItem({
      title: 'Custom flow',
      status: 'ready',
      context: { workflowTemplateId: 'wf_custom' },
    });
    const plan = await dispatch(item.id, storage);

    expect(plan.workflowTemplateId).toBe('wf_custom');
  });

  it('creates steps matching workflow template', async () => {
    const multiStepWorkflow: WorkflowTemplate = {
      id: 'wf_multi',
      name: 'Multi Step',
      version: '1.0.0',
      steps: [
        { id: 'step-a', role: 'builder', dependencies: [], config: {} },
        { id: 'step-b', role: 'builder', dependencies: ['step-a'], config: {} },
      ],
      appliesTo: ['ready'],
      requiredCapabilities: [],
    };
    const db2 = tempDb();
    const s2 = new SqliteStorage(db2, {
      roles: [BUILDER_ROLE],
      workflows: [multiStepWorkflow],
    });

    try {
      const item = await s2.createWorkItem({ title: 'Multi-step', status: 'ready' });
      const plan = await dispatch(item.id, s2);

      expect(plan.steps).toHaveLength(2);
      const roles = plan.steps.map((s) => s.role);
      expect(roles).toEqual(['builder', 'builder']);
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
