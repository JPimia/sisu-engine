import { rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { RoleDefinition, WorkflowTemplate } from '@sisu/protocol';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SqliteStorage } from '../storage/sqlite.js';
import { assembleBriefing } from './briefing.js';

function tempDb(): string {
  return join(
    tmpdir(),
    `sisu-briefing-test-${Date.now()}-${Math.random().toString(36).slice(2)}.db`,
  );
}

const TEST_ROLE: RoleDefinition = {
  id: 'builder',
  name: 'Builder',
  description: 'Builder agent',
  modelTier: 'execution',
  canSpawn: [],
  access: {},
  maxConcurrency: -1,
};

const TEST_WORKFLOW: WorkflowTemplate = {
  id: 'wf_simple-task',
  name: 'Simple Task',
  version: '1.0.0',
  steps: [],
  appliesTo: ['ready'],
  requiredCapabilities: [],
};

describe('assembleBriefing', () => {
  let db: string;
  let storage: SqliteStorage;

  beforeEach(() => {
    db = tempDb();
    storage = new SqliteStorage(db, { roles: [TEST_ROLE], workflows: [TEST_WORKFLOW] });
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
    await expect(assembleBriefing('dispatch', 'wrk_MISSING', storage)).rejects.toThrow(
      'Work item not found',
    );
  });

  it('assembles briefing with subject, roles, workflows', async () => {
    const item = await storage.createWorkItem({ title: 'My task', status: 'ready' });
    const briefing = await assembleBriefing('dispatch', item.id, storage);

    expect(briefing.decision).toBe('dispatch');
    expect(briefing.subject.id).toBe(item.id);
    expect(briefing.availableRoles).toHaveLength(1);
    expect(briefing.availableWorkflows).toHaveLength(1);
    expect(briefing.activeItems).toHaveLength(0);
    expect(briefing.recentMail).toHaveLength(0);
  });

  it('excludes subject from active items list', async () => {
    const subject = await storage.createWorkItem({ title: 'Subject', status: 'planning' });
    const other = await storage.createWorkItem({ title: 'Other', status: 'in_progress' });

    const briefing = await assembleBriefing('dispatch', subject.id, storage);

    expect(briefing.activeItems.map((i) => i.id)).not.toContain(subject.id);
    expect(briefing.activeItems.map((i) => i.id)).toContain(other.id);
  });

  it('includes compact summaries of active items (title + status only)', async () => {
    const subject = await storage.createWorkItem({ title: 'Subject', status: 'ready' });
    await storage.createWorkItem({ title: 'Active Task', status: 'in_progress' });

    const briefing = await assembleBriefing('dispatch', subject.id, storage);

    expect(briefing.activeItems[0]).toEqual(
      expect.objectContaining({ title: 'Active Task', status: 'in_progress' }),
    );
    // Should NOT include description or full detail fields
    expect(briefing.activeItems[0]).not.toHaveProperty('description');
    expect(briefing.activeItems[0]).not.toHaveProperty('metadata');
  });

  it('includes recent mail for the subject work item', async () => {
    const subject = await storage.createWorkItem({ title: 'Subject', status: 'ready' });
    await storage.sendMail({
      type: 'status',
      from: 'agent-a',
      to: 'agent-b',
      subject: 'Progress',
      body: 'Working on it',
      workItemId: subject.id,
    });

    const briefing = await assembleBriefing('dispatch', subject.id, storage);
    expect(briefing.recentMail).toHaveLength(1);
    expect(briefing.recentMail[0]?.subject).toBe('Progress');
  });

  it('caps mail at 10 messages (most recent first)', async () => {
    const subject = await storage.createWorkItem({ title: 'Subject', status: 'ready' });
    for (let i = 0; i < 15; i++) {
      await storage.sendMail({
        type: 'status',
        from: 'a',
        to: 'b',
        subject: `Mail ${i}`,
        body: 'body',
        workItemId: subject.id,
      });
    }

    const briefing = await assembleBriefing('dispatch', subject.id, storage);
    expect(briefing.recentMail).toHaveLength(10);
  });
});
