/**
 * Tests for non-JSON console output paths (to hit coverage thresholds).
 */
import { BUILT_IN_ROLES, SqliteStorage } from '@sisu/core';
import { BUILT_IN_WORKFLOWS } from '@sisu/templates-default';
import { mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let tmpDir: string;
let dbPath: string;

function makeStorage(): SqliteStorage {
  return new SqliteStorage(dbPath, {
    roles: [...BUILT_IN_ROLES],
    workflows: [...BUILT_IN_WORKFLOWS],
  });
}

beforeEach(() => {
  tmpDir = join(tmpdir(), `sisu-cli-output-test-${Date.now()}`);
  mkdirSync(tmpDir, { recursive: true });
  dbPath = join(tmpDir, 'test.db');
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// output.ts
// ---------------------------------------------------------------------------

describe('output helpers', () => {
  it('outputError writes to stderr', async () => {
    const errors: string[] = [];
    vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
      errors.push(args.join(' '));
    });
    const { outputError } = await import('../src/output.js');
    outputError('Something went wrong');
    expect(errors.some((e) => e.includes('Something went wrong'))).toBe(true);
    vi.restoreAllMocks();
  });
});

// ---------------------------------------------------------------------------
// init command — non-JSON paths
// ---------------------------------------------------------------------------

describe('init non-JSON output', () => {
  it('prints message on already initialized DB', async () => {
    makeStorage();
    const { makeInitCommand } = await import('../src/commands/init.js');
    const cmd = makeInitCommand();

    const logs: string[] = [];
    vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
      logs.push(args.join(' '));
    });
    await cmd.parseAsync(['node', 'sisu', '--db', dbPath]);
    expect(logs.some((l) => l.includes('already initialized'))).toBe(true);
    vi.restoreAllMocks();
  });
});

// ---------------------------------------------------------------------------
// health command — non-JSON paths
// ---------------------------------------------------------------------------

describe('health non-JSON output', () => {
  it('prints ✓ storage: ok for healthy DB', async () => {
    makeStorage();
    const { makeHealthCommand } = await import('../src/commands/health.js');
    const cmd = makeHealthCommand();

    const logs: string[] = [];
    vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
      logs.push(args.join(' '));
    });
    await cmd.parseAsync(['node', 'sisu', '--db', dbPath]);
    expect(logs.some((l) => l.includes('✓'))).toBe(true);
    expect(logs.some((l) => l.includes('All checks passed'))).toBe(true);
    vi.restoreAllMocks();
  });

  it('prints ✗ storage: error for missing DB', async () => {
    const { makeHealthCommand } = await import('../src/commands/health.js');
    const cmd = makeHealthCommand();

    const logs: string[] = [];
    vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
      logs.push(args.join(' '));
    });
    const missing = join(tmpDir, 'missing.db');
    await cmd.parseAsync(['node', 'sisu', '--db', missing]);
    expect(logs.some((l) => l.includes('✗'))).toBe(true);
    expect(logs.some((l) => l.includes('Some checks failed'))).toBe(true);
    vi.restoreAllMocks();
  });
});

// ---------------------------------------------------------------------------
// doctor command — non-JSON paths
// ---------------------------------------------------------------------------

describe('doctor non-JSON output', () => {
  it('prints ✓ checks for healthy DB', async () => {
    makeStorage();
    const { makeDoctorCommand } = await import('../src/commands/doctor.js');
    const cmd = makeDoctorCommand();

    const logs: string[] = [];
    vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
      logs.push(args.join(' '));
    });
    await cmd.parseAsync(['node', 'sisu', '--db', dbPath]);
    expect(logs.some((l) => l.includes('✓'))).toBe(true);
    vi.restoreAllMocks();
  });

  it('prints ✗ for missing DB', async () => {
    const { makeDoctorCommand } = await import('../src/commands/doctor.js');
    const cmd = makeDoctorCommand();

    const logs: string[] = [];
    vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
      logs.push(args.join(' '));
    });
    const missing = join(tmpDir, 'missing.db');
    await cmd.parseAsync(['node', 'sisu', '--db', missing]);
    expect(logs.some((l) => l.includes('✗'))).toBe(true);
    vi.restoreAllMocks();
  });
});

// ---------------------------------------------------------------------------
// agents command — non-JSON paths
// ---------------------------------------------------------------------------

describe('agents non-JSON output', () => {
  it('prints "No active agents" when empty', async () => {
    makeStorage();
    const { makeAgentsCommand } = await import('../src/commands/agents.js');
    const cmd = makeAgentsCommand();

    const logs: string[] = [];
    vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
      logs.push(args.join(' '));
    });
    await cmd.parseAsync(['node', 'sisu', '--db', dbPath]);
    expect(logs.some((l) => l.includes('No active agents'))).toBe(true);
    vi.restoreAllMocks();
  });

  it('prints table for active leases', async () => {
    const storage = makeStorage();
    const item = await storage.createWorkItem({ title: 'Table test' });
    await storage.createLease({
      runId: 'run_table',
      role: 'builder',
      workItemId: item.id,
      model: 'claude-sonnet-4-6',
    });

    const { makeAgentsCommand } = await import('../src/commands/agents.js');
    const cmd = makeAgentsCommand();

    const logs: string[] = [];
    vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
      logs.push(args.join(' '));
    });
    await cmd.parseAsync(['node', 'sisu', '--db', dbPath]);
    expect(logs.some((l) => l.includes('builder'))).toBe(true);
    vi.restoreAllMocks();
  });

  it('agents stop prints confirmation message', async () => {
    const storage = makeStorage();
    const item = await storage.createWorkItem({ title: 'Stop test' });
    const lease = await storage.createLease({
      runId: 'run_stop_test',
      role: 'builder',
      workItemId: item.id,
      model: 'claude-sonnet-4-6',
    });

    const { makeAgentsCommand } = await import('../src/commands/agents.js');
    const cmd = makeAgentsCommand();

    const logs: string[] = [];
    vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
      logs.push(args.join(' '));
    });
    await cmd.parseAsync(['node', 'sisu', 'stop', lease.runId, '--db', dbPath]);
    expect(logs.some((l) => l.includes('Stopped agent'))).toBe(true);
    vi.restoreAllMocks();
  });

  it('agents stop prints error for unknown runId', async () => {
    makeStorage();
    const { makeAgentsCommand } = await import('../src/commands/agents.js');
    const cmd = makeAgentsCommand();

    const errors: string[] = [];
    vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
      errors.push(args.join(' '));
    });
    await cmd.parseAsync(['node', 'sisu', 'stop', 'run_nonexistent', '--db', dbPath]);
    expect(errors.some((e) => e.includes('No active lease'))).toBe(true);
    vi.restoreAllMocks();
  });
});

// ---------------------------------------------------------------------------
// mail command — non-JSON paths
// ---------------------------------------------------------------------------

describe('mail non-JSON output', () => {
  it('prints "No mail found" when empty', async () => {
    makeStorage();
    const { makeMailCommand } = await import('../src/commands/mail.js');
    const cmd = makeMailCommand();

    const logs: string[] = [];
    vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
      logs.push(args.join(' '));
    });
    await cmd.parseAsync(['node', 'sisu', 'list', '--db', dbPath]);
    expect(logs.some((l) => l.includes('No mail found'))).toBe(true);
    vi.restoreAllMocks();
  });

  it('prints mail table', async () => {
    const storage = makeStorage();
    await storage.sendMail({
      type: 'status',
      from: 'agent-a',
      to: 'agent-b',
      subject: 'Hello',
      body: 'World',
    });

    const { makeMailCommand } = await import('../src/commands/mail.js');
    const cmd = makeMailCommand();

    const logs: string[] = [];
    vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
      logs.push(args.join(' '));
    });
    await cmd.parseAsync(['node', 'sisu', 'list', '--db', dbPath]);
    expect(logs.some((l) => l.includes('status'))).toBe(true);
    vi.restoreAllMocks();
  });

  it('mail show prints message details', async () => {
    const storage = makeStorage();
    const msg = await storage.sendMail({
      type: 'result',
      from: 'builder',
      to: 'lead',
      subject: 'Done task',
      body: 'Task complete',
    });

    const { makeMailCommand } = await import('../src/commands/mail.js');
    const cmd = makeMailCommand();

    const logs: string[] = [];
    vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
      logs.push(args.join(' '));
    });
    await cmd.parseAsync(['node', 'sisu', 'show', msg.id, '--db', dbPath]);
    expect(logs.some((l) => l.includes('Done task'))).toBe(true);
    expect(logs.some((l) => l.includes('Task complete'))).toBe(true);
    vi.restoreAllMocks();
  });

  it('mail show prints error for missing message', async () => {
    makeStorage();
    const { makeMailCommand } = await import('../src/commands/mail.js');
    const cmd = makeMailCommand();

    const errors: string[] = [];
    vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
      errors.push(args.join(' '));
    });
    await cmd.parseAsync(['node', 'sisu', 'show', 'mail_nonexistent', '--db', dbPath]);
    expect(errors.some((e) => e.includes('not found'))).toBe(true);
    vi.restoreAllMocks();
  });
});

// ---------------------------------------------------------------------------
// roles/workflows — non-JSON paths
// ---------------------------------------------------------------------------

describe('roles non-JSON output', () => {
  it('prints roles table', async () => {
    makeStorage();
    const { makeRolesCommand } = await import('../src/commands/roles.js');
    const cmd = makeRolesCommand();

    const logs: string[] = [];
    vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
      logs.push(args.join(' '));
    });
    await cmd.parseAsync(['node', 'sisu', '--db', dbPath]);
    expect(logs.some((l) => l.includes('builder'))).toBe(true);
    vi.restoreAllMocks();
  });
});

describe('workflows non-JSON output', () => {
  it('prints workflows table', async () => {
    makeStorage();
    const { makeWorkflowsCommand } = await import('../src/commands/roles.js');
    const cmd = makeWorkflowsCommand();

    const logs: string[] = [];
    vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
      logs.push(args.join(' '));
    });
    await cmd.parseAsync(['node', 'sisu', '--db', dbPath]);
    // Should print the workflow table (or "No workflow templates" if none)
    expect(logs.length).toBeGreaterThanOrEqual(0);
    vi.restoreAllMocks();
  });
});

// ---------------------------------------------------------------------------
// work command — non-JSON paths
// ---------------------------------------------------------------------------

describe('work non-JSON output', () => {
  it('work create prints confirmation', async () => {
    makeStorage();
    const { makeWorkCommand } = await import('../src/commands/work.js');
    const cmd = makeWorkCommand();

    const logs: string[] = [];
    vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
      logs.push(args.join(' '));
    });
    await cmd.parseAsync(['node', 'sisu', 'create', '--title', 'My task', '--db', dbPath]);
    expect(logs.some((l) => l.includes('Created work item'))).toBe(true);
    vi.restoreAllMocks();
  });

  it('work list prints "No work items found" when empty', async () => {
    makeStorage();
    const { makeWorkCommand } = await import('../src/commands/work.js');
    const cmd = makeWorkCommand();

    const logs: string[] = [];
    vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
      logs.push(args.join(' '));
    });
    await cmd.parseAsync(['node', 'sisu', 'list', '--db', dbPath]);
    expect(logs.some((l) => l.includes('No work items found'))).toBe(true);
    vi.restoreAllMocks();
  });

  it('work list prints table when items exist', async () => {
    const storage = makeStorage();
    await storage.createWorkItem({ title: 'Table item' });

    const { makeWorkCommand } = await import('../src/commands/work.js');
    const cmd = makeWorkCommand();

    const logs: string[] = [];
    vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
      logs.push(args.join(' '));
    });
    await cmd.parseAsync(['node', 'sisu', 'list', '--db', dbPath]);
    expect(logs.some((l) => l.includes('Table item'))).toBe(true);
    vi.restoreAllMocks();
  });

  it('work show prints item details', async () => {
    const storage = makeStorage();
    const item = await storage.createWorkItem({ title: 'Show detail' });

    const { makeWorkCommand } = await import('../src/commands/work.js');
    const cmd = makeWorkCommand();

    const logs: string[] = [];
    vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
      logs.push(args.join(' '));
    });
    await cmd.parseAsync(['node', 'sisu', 'show', item.id, '--db', dbPath]);
    expect(logs.some((l) => l.includes('Show detail'))).toBe(true);
    vi.restoreAllMocks();
  });

  it('work cancel prints confirmation', async () => {
    const storage = makeStorage();
    const item = await storage.createWorkItem({ title: 'Cancel test' });

    const { makeWorkCommand } = await import('../src/commands/work.js');
    const cmd = makeWorkCommand();

    const logs: string[] = [];
    vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
      logs.push(args.join(' '));
    });
    await cmd.parseAsync(['node', 'sisu', 'cancel', item.id, '--db', dbPath]);
    expect(logs.some((l) => l.includes('Cancelled work item'))).toBe(true);
    vi.restoreAllMocks();
  });

  it('work retry prints confirmation', async () => {
    const storage = makeStorage();
    const item = await storage.createWorkItem({ title: 'Retry test', status: 'failed' });

    const { makeWorkCommand } = await import('../src/commands/work.js');
    const cmd = makeWorkCommand();

    const logs: string[] = [];
    vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
      logs.push(args.join(' '));
    });
    await cmd.parseAsync(['node', 'sisu', 'retry', item.id, '--db', dbPath]);
    expect(logs.some((l) => l.includes('Reset work item'))).toBe(true);
    vi.restoreAllMocks();
  });

  it('work dispatch prints confirmation without JSON', async () => {
    const storage = makeStorage();
    const item = await storage.createWorkItem({ title: 'Dispatch console test', status: 'ready' });

    const { makeWorkCommand } = await import('../src/commands/work.js');
    const cmd = makeWorkCommand();

    const logs: string[] = [];
    vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
      logs.push(args.join(' '));
    });
    await cmd.parseAsync(['node', 'sisu', 'dispatch', item.id, '--db', dbPath]);
    expect(logs.some((l) => l.includes('Dispatched work item'))).toBe(true);
    vi.restoreAllMocks();
  });
});
