import { rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BUILT_IN_ROLES, SqliteStorage } from '@sisu/core';
import { BUILT_IN_WORKFLOWS } from '@sisu/templates-default';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RunAgentRuntime } from './run.js';
import { makeRunCommand } from './run.js';

function tempDb(): string {
  return join(tmpdir(), `sisu-run-test-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);
}

function makeRuntime(pollStatus: 'completed' | 'failed' = 'completed'): RunAgentRuntime {
  return {
    spawn: vi.fn().mockResolvedValue({ runId: 'run_MOCKRUN', pid: 99999 }),
    poll: vi.fn().mockResolvedValue(pollStatus),
    stop: vi.fn().mockResolvedValue(undefined),
    isAvailable: vi.fn().mockResolvedValue(true),
  };
}

describe('sisu run command', () => {
  let db: string;

  beforeEach(() => {
    db = tempDb();
  });

  afterEach(() => {
    try {
      rmSync(db);
    } catch {
      /* ignore */
    }
    vi.restoreAllMocks();
  });

  it('creates work item, dispatches, and calls spawn + poll', async () => {
    const runtime = makeRuntime('completed');
    const cmd = makeRunCommand(runtime);

    await cmd.parseAsync(['--title', 'Test task', '--db', db, '--poll', '50', '--timeout', '10'], {
      from: 'user',
    });

    expect(runtime.spawn).toHaveBeenCalledOnce();
    expect(runtime.poll).toHaveBeenCalled();
  });

  it('sets work item to done when agent reports completed', async () => {
    const runtime = makeRuntime('completed');
    const cmd = makeRunCommand(runtime);

    await cmd.parseAsync(
      [
        '--title',
        'Write hello.txt',
        '--kind',
        'task',
        '--db',
        db,
        '--poll',
        '50',
        '--timeout',
        '10',
      ],
      { from: 'user' },
    );

    const storage = new SqliteStorage(db, {
      roles: [...BUILT_IN_ROLES],
      workflows: [...BUILT_IN_WORKFLOWS],
    });
    try {
      const items = await storage.listWorkItems({ status: 'done' });
      expect(items).toHaveLength(1);
      expect(items[0]?.title).toBe('Write hello.txt');
      expect(items[0]?.assignedRun).toBe('run_MOCKRUN');
    } finally {
      storage.close();
    }
  });

  it('creates an execution plan and records it via getPlanByWorkItem', async () => {
    const runtime = makeRuntime('completed');
    const cmd = makeRunCommand(runtime);

    await cmd.parseAsync(
      ['--title', 'Build feature', '--db', db, '--poll', '50', '--timeout', '10'],
      { from: 'user' },
    );

    const storage = new SqliteStorage(db, {
      roles: [...BUILT_IN_ROLES],
      workflows: [...BUILT_IN_WORKFLOWS],
    });
    try {
      const items = await storage.listWorkItems();
      expect(items).toHaveLength(1);
      const plan = await storage.getPlanByWorkItem(items[0]?.id ?? '');
      expect(plan).not.toBeNull();
      expect(plan?.steps.length).toBeGreaterThan(0);
    } finally {
      storage.close();
    }
  });

  it('respects --kind option in work item metadata', async () => {
    const runtime = makeRuntime('completed');
    const cmd = makeRunCommand(runtime);

    await cmd.parseAsync(
      ['--title', 'Fix bug', '--kind', 'bug', '--db', db, '--poll', '50', '--timeout', '10'],
      { from: 'user' },
    );

    const storage = new SqliteStorage(db, {
      roles: [...BUILT_IN_ROLES],
      workflows: [...BUILT_IN_WORKFLOWS],
    });
    try {
      const items = await storage.listWorkItems();
      expect(items[0]?.metadata.kind).toBe('bug');
    } finally {
      storage.close();
    }
  });

  it('sets work item to failed when agent reports failed', async () => {
    const runtime = makeRuntime('failed');
    const cmd = makeRunCommand(runtime);

    await cmd.parseAsync(
      ['--title', 'Failing task', '--db', db, '--poll', '50', '--timeout', '10'],
      { from: 'user' },
    );

    const storage = new SqliteStorage(db, {
      roles: [...BUILT_IN_ROLES],
      workflows: [...BUILT_IN_WORKFLOWS],
    });
    try {
      const items = await storage.listWorkItems({ status: 'failed' });
      expect(items).toHaveLength(1);
    } finally {
      storage.close();
    }
  });
});
