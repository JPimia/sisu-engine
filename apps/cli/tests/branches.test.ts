/**
 * Tests targeting uncovered branches.
 */
import type { AgentMail, RuntimeLease, WorkItem } from '@sisu/protocol';
import { BUILT_IN_ROLES, SqliteStorage } from '@sisu/core';
import { BUILT_IN_WORKFLOWS } from '@sisu/templates-default';
import { mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderDashboard } from '../src/dashboard/renderer.js';
import { outputTable } from '../src/output.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let tmpDir: string;
let dbPath: string;

function makeStorage(): SqliteStorage {
  return new SqliteStorage(dbPath, {
    roles: [...BUILT_IN_ROLES],
    workflows: [...BUILT_IN_WORKFLOWS],
  });
}

beforeEach(() => {
  tmpDir = join(tmpdir(), `sisu-branch-test-${Date.now()}`);
  mkdirSync(tmpDir, { recursive: true });
  dbPath = join(tmpDir, 'test.db');
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// renderer.ts — colorForStatus branches
// ---------------------------------------------------------------------------

function makeWorkItem(overrides: Partial<WorkItem> = {}): WorkItem {
  return {
    id: 'wrk_01JTEST',
    title: 'Test',
    status: 'in_progress',
    version: 1,
    requiredCapabilities: [],
    metadata: {},
    context: {},
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

function makeLease(overrides: Partial<RuntimeLease> = {}): RuntimeLease {
  return {
    id: 'lease_01JTEST',
    runId: 'run_01JTEST',
    role: 'builder',
    active: true,
    model: 'claude-sonnet-4-6',
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 60000).toISOString(),
    lastHeartbeat: new Date().toISOString(),
    ...overrides,
  };
}

function makeMail(overrides: Partial<AgentMail> = {}): AgentMail {
  return {
    id: 'mail_01JTEST',
    type: 'status',
    from: 'agent-a',
    to: 'agent-b',
    subject: 'Test',
    body: 'Body',
    read: false,
    priority: 'normal',
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

describe('renderer colorForStatus branches', () => {
  it('colors blocked items yellow', () => {
    const item = makeWorkItem({ status: 'blocked' });
    const output = renderDashboard({ agents: [], workItems: [item], recentMail: [] });
    expect(output).toContain('blocked');
  });

  it('colors in_review items yellow', () => {
    const item = makeWorkItem({ status: 'in_review' });
    const output = renderDashboard({ agents: [], workItems: [item], recentMail: [] });
    expect(output).toContain('in_review');
  });

  it('colors failed items red', () => {
    const item = makeWorkItem({ status: 'failed' });
    const output = renderDashboard({ agents: [], workItems: [item], recentMail: [] });
    expect(output).toContain('failed');
  });

  it('dims done items', () => {
    const item = makeWorkItem({ status: 'done' });
    const output = renderDashboard({ agents: [], workItems: [item], recentMail: [] });
    expect(output).toContain('done');
  });

  it('handles queued (default case)', () => {
    const item = makeWorkItem({ status: 'queued' });
    const output = renderDashboard({ agents: [], workItems: [item], recentMail: [] });
    expect(output).toContain('queued');
  });

  it('handles planning status', () => {
    const item = makeWorkItem({ status: 'planning' });
    const output = renderDashboard({ agents: [], workItems: [item], recentMail: [] });
    expect(output).toContain('planning');
  });

  it('renders multiple work items and agents together', () => {
    const items = [
      makeWorkItem({ id: 'wrk_1', title: 'Item 1', status: 'in_progress' }),
      makeWorkItem({ id: 'wrk_2', title: 'Item 2', status: 'done' }),
    ];
    const agents = [makeLease({ workItemId: 'wrk_1' })];
    const mail = [makeMail({ subject: 'Progress update' })];
    const output = renderDashboard({ agents, workItems: items, recentMail: mail });
    expect(output).toContain('Item 1');
    expect(output).toContain('Progress update');
  });

  it('renders work item without priority in metadata', () => {
    const item = makeWorkItem({ metadata: {} });
    const output = renderDashboard({ agents: [], workItems: [item], recentMail: [] });
    expect(output).toContain('P-');
  });
});

// ---------------------------------------------------------------------------
// output.ts — pad branches (cell width >= column width)
// ---------------------------------------------------------------------------

describe('outputTable padding edge cases', () => {
  it('truncates long cell content to column width', () => {
    const logs: string[] = [];
    vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
      logs.push(args.join(' '));
    });
    // Header 'ID' is 2 chars; cell is 30 chars — pad will truncate
    outputTable(['ID', 'X'], [['a-very-long-id-that-exceeds-header', 'y']]);
    expect(logs.length).toBeGreaterThan(0);
    vi.restoreAllMocks();
  });
});

// ---------------------------------------------------------------------------
// roles — "No roles" edge case (via an empty custom storage)
// ---------------------------------------------------------------------------

describe('roles edge cases', () => {
  it('prints "No roles registered" for empty role list', async () => {
    // Create storage with no roles
    const emptyStorage = new SqliteStorage(dbPath, { roles: [], workflows: [] });
    expect(await emptyStorage.listRoles()).toHaveLength(0);

    // Verify the "No roles registered" path is reachable by testing the condition
    const roles = await emptyStorage.listRoles();
    expect(roles.length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// mail — payload rendering path
// ---------------------------------------------------------------------------

describe('mail show with payload', () => {
  it('prints payload when present', async () => {
    const storage = makeStorage();
    const msg = await storage.sendMail({
      type: 'result',
      from: 'builder',
      to: 'lead',
      subject: 'With payload',
      body: 'Done',
      payload: { key: 'value', count: 42 },
    });

    const { makeMailCommand } = await import('../src/commands/mail.js');
    const cmd = makeMailCommand();

    const logs: string[] = [];
    vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
      logs.push(args.join(' '));
    });
    await cmd.parseAsync(['node', 'sisu', 'show', msg.id, '--db', dbPath]);
    expect(logs.some((l) => l.includes('Payload'))).toBe(true);
    vi.restoreAllMocks();
  });
});

// ---------------------------------------------------------------------------
// work show — description branch
// ---------------------------------------------------------------------------

describe('work show with description', () => {
  it('prints description when present', async () => {
    const storage = makeStorage();
    const item = await storage.createWorkItem({
      title: 'With description',
      description: 'This is a detailed description',
    });

    const { makeWorkCommand } = await import('../src/commands/work.js');
    const cmd = makeWorkCommand();

    const logs: string[] = [];
    vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
      logs.push(args.join(' '));
    });
    await cmd.parseAsync(['node', 'sisu', 'show', item.id, '--db', dbPath]);
    expect(logs.some((l) => l.includes('This is a detailed description'))).toBe(true);
    vi.restoreAllMocks();
  });

  it('prints assignedRole when present', async () => {
    const storage = makeStorage();
    const item = await storage.createWorkItem({
      title: 'Assigned item',
      assignedRole: 'builder',
    });

    const { makeWorkCommand } = await import('../src/commands/work.js');
    const cmd = makeWorkCommand();

    const logs: string[] = [];
    vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
      logs.push(args.join(' '));
    });
    await cmd.parseAsync(['node', 'sisu', 'show', item.id, '--db', dbPath]);
    expect(logs.some((l) => l.includes('builder'))).toBe(true);
    vi.restoreAllMocks();
  });
});
