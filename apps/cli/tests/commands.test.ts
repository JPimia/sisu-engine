import { BUILT_IN_ROLES, SqliteStorage } from '@sisu/core';
import { BUILT_IN_WORKFLOWS } from '@sisu/templates-default';
import { mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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
  tmpDir = join(tmpdir(), `sisu-cli-test-${Date.now()}`);
  mkdirSync(tmpDir, { recursive: true });
  dbPath = join(tmpDir, 'test.db');
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// Storage factory
// ---------------------------------------------------------------------------

describe('storage', () => {
  it('opens and runs migrations on a fresh DB', () => {
    const storage = makeStorage();
    expect(storage).toBeDefined();
  });

  it('storageExists returns false for non-existent path', async () => {
    const { storageExists } = await import('../src/storage.js');
    expect(storageExists('/tmp/nonexistent-sisu-xyz.db')).toBe(false);
  });

  it('storageExists returns true after init', async () => {
    makeStorage(); // triggers migrate and creates the file
    const { storageExists } = await import('../src/storage.js');
    expect(storageExists(dbPath)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Output helpers
// ---------------------------------------------------------------------------

describe('output', () => {
  it('outputJson writes valid JSON to stdout', async () => {
    const writes: string[] = [];
    vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
      writes.push(String(chunk));
      return true;
    });

    const { outputJson } = await import('../src/output.js');
    outputJson({ hello: 'world' });

    expect(writes.join('')).toContain('"hello": "world"');
    vi.restoreAllMocks();
  });

  it('outputTable prints headers and rows', async () => {
    const logs: string[] = [];
    vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
      logs.push(args.join(' '));
    });

    const { outputTable } = await import('../src/output.js');
    outputTable(['Name', 'Role'], [['alice', 'builder'], ['bob', 'reviewer']]);

    expect(logs.some((l) => l.includes('Name'))).toBe(true);
    expect(logs.some((l) => l.includes('alice'))).toBe(true);
    vi.restoreAllMocks();
  });
});

// ---------------------------------------------------------------------------
// init command
// ---------------------------------------------------------------------------

describe('init command', () => {
  it('creates storage on first run', async () => {
    const { makeInitCommand } = await import('../src/commands/init.js');
    const cmd = makeInitCommand();

    const logs: string[] = [];
    vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
      logs.push(args.join(' '));
    });

    await cmd.parseAsync(['node', 'sisu', '--db', dbPath]);
    expect(logs.some((l) => l.includes('initialized'))).toBe(true);
    vi.restoreAllMocks();
  });

  it('reports already_initialized on second run', async () => {
    makeStorage(); // pre-create DB
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

  it('--json outputs JSON status', async () => {
    const { makeInitCommand } = await import('../src/commands/init.js');
    const cmd = makeInitCommand();

    const writes: string[] = [];
    vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
      writes.push(String(chunk));
      return true;
    });

    await cmd.parseAsync(['node', 'sisu', '--db', dbPath, '--json']);
    const output = JSON.parse(writes.join(''));
    expect(output.status).toBe('initialized');
    expect(output.path).toBe(dbPath);
    vi.restoreAllMocks();
  });
});

// ---------------------------------------------------------------------------
// health command
// ---------------------------------------------------------------------------

describe('health command', () => {
  it('reports error when DB not found', async () => {
    const { makeHealthCommand } = await import('../src/commands/health.js');
    const cmd = makeHealthCommand();

    const writes: string[] = [];
    vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
      writes.push(String(chunk));
      return true;
    });

    const missing = join(tmpDir, 'missing.db');
    await cmd.parseAsync(['node', 'sisu', '--db', missing, '--json']);
    const output = JSON.parse(writes.join(''));
    expect(output.status).toBe('degraded');
    vi.restoreAllMocks();
  });

  it('reports healthy when DB exists', async () => {
    makeStorage();
    const { makeHealthCommand } = await import('../src/commands/health.js');
    const cmd = makeHealthCommand();

    const writes: string[] = [];
    vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
      writes.push(String(chunk));
      return true;
    });

    await cmd.parseAsync(['node', 'sisu', '--db', dbPath, '--json']);
    const output = JSON.parse(writes.join(''));
    expect(output.status).toBe('healthy');
    vi.restoreAllMocks();
  });
});

// ---------------------------------------------------------------------------
// doctor command
// ---------------------------------------------------------------------------

describe('doctor command', () => {
  it('reports issues when DB missing', async () => {
    const { makeDoctorCommand } = await import('../src/commands/doctor.js');
    const cmd = makeDoctorCommand();

    const writes: string[] = [];
    vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
      writes.push(String(chunk));
      return true;
    });

    const missing = join(tmpDir, 'missing.db');
    await cmd.parseAsync(['node', 'sisu', '--db', missing, '--json']);
    const output = JSON.parse(writes.join(''));
    expect(output.status).toBe('issues_found');
    vi.restoreAllMocks();
  });

  it('reports ok when DB initialized with roles and workflows', async () => {
    makeStorage();
    const { makeDoctorCommand } = await import('../src/commands/doctor.js');
    const cmd = makeDoctorCommand();

    const writes: string[] = [];
    vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
      writes.push(String(chunk));
      return true;
    });

    await cmd.parseAsync(['node', 'sisu', '--db', dbPath, '--json']);
    const output = JSON.parse(writes.join(''));
    expect(output.status).toBe('ok');
    const rolesCheck = output.diagnostics.find((d: { name: string }) => d.name === 'roles');
    expect(rolesCheck.status).toBe('ok');
    vi.restoreAllMocks();
  });
});

// ---------------------------------------------------------------------------
// work commands
// ---------------------------------------------------------------------------

describe('work commands', () => {
  it('work create creates a work item', async () => {
    makeStorage();
    const { makeWorkCommand } = await import('../src/commands/work.js');
    const cmd = makeWorkCommand();

    const writes: string[] = [];
    vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
      writes.push(String(chunk));
      return true;
    });

    await cmd.parseAsync([
      'node',
      'sisu',
      'create',
      '--title',
      'Test task',
      '--db',
      dbPath,
      '--json',
    ]);
    const output = JSON.parse(writes.join(''));
    expect(output.title).toBe('Test task');
    expect(output.id).toMatch(/^wrk_/);
    vi.restoreAllMocks();
  });

  it('work list returns created items', async () => {
    const storage = makeStorage();
    await storage.createWorkItem({ title: 'List test' });

    const { makeWorkCommand } = await import('../src/commands/work.js');
    const cmd = makeWorkCommand();

    const writes: string[] = [];
    vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
      writes.push(String(chunk));
      return true;
    });

    await cmd.parseAsync(['node', 'sisu', 'list', '--db', dbPath, '--json']);
    const items = JSON.parse(writes.join(''));
    expect(Array.isArray(items)).toBe(true);
    expect(items.length).toBeGreaterThan(0);
    expect(items[0].title).toBe('List test');
    vi.restoreAllMocks();
  });

  it('work show returns specific item', async () => {
    const storage = makeStorage();
    const item = await storage.createWorkItem({ title: 'Show test' });

    const { makeWorkCommand } = await import('../src/commands/work.js');
    const cmd = makeWorkCommand();

    const writes: string[] = [];
    vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
      writes.push(String(chunk));
      return true;
    });

    await cmd.parseAsync(['node', 'sisu', 'show', item.id, '--db', dbPath, '--json']);
    const output = JSON.parse(writes.join(''));
    expect(output.id).toBe(item.id);
    expect(output.title).toBe('Show test');
    vi.restoreAllMocks();
  });

  it('work show prints error for missing item', async () => {
    makeStorage();
    const { makeWorkCommand } = await import('../src/commands/work.js');
    const cmd = makeWorkCommand();

    const errors: string[] = [];
    vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
      errors.push(args.join(' '));
    });

    await cmd.parseAsync(['node', 'sisu', 'show', 'wrk_nonexistent', '--db', dbPath]);
    expect(errors.some((e) => e.includes('not found'))).toBe(true);
    vi.restoreAllMocks();
  });

  it('work list filters by status', async () => {
    const storage = makeStorage();
    await storage.createWorkItem({ title: 'Queued', status: 'queued' });
    await storage.createWorkItem({ title: 'Done', status: 'done' });

    const { makeWorkCommand } = await import('../src/commands/work.js');
    const cmd = makeWorkCommand();

    const writes: string[] = [];
    vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
      writes.push(String(chunk));
      return true;
    });

    await cmd.parseAsync(['node', 'sisu', 'list', '--status', 'queued', '--db', dbPath, '--json']);
    const items = JSON.parse(writes.join(''));
    expect(items.every((i: { status: string }) => i.status === 'queued')).toBe(true);
    vi.restoreAllMocks();
  });

  it('work dispatch creates execution plan', async () => {
    const storage = makeStorage();
    const item = await storage.createWorkItem({ title: 'Dispatch test', status: 'ready' });

    const { makeWorkCommand } = await import('../src/commands/work.js');
    const cmd = makeWorkCommand();

    const writes: string[] = [];
    vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
      writes.push(String(chunk));
      return true;
    });

    await cmd.parseAsync(['node', 'sisu', 'dispatch', item.id, '--db', dbPath, '--json']);
    const plan = JSON.parse(writes.join(''));
    expect(plan.id).toMatch(/^plan_/);
    expect(plan.workItemId).toBe(item.id);
    vi.restoreAllMocks();
  });

  it('work cancel sets status to cancelled', async () => {
    const storage = makeStorage();
    const item = await storage.createWorkItem({ title: 'Cancel test' });

    const { makeWorkCommand } = await import('../src/commands/work.js');
    const cmd = makeWorkCommand();

    const writes: string[] = [];
    vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
      writes.push(String(chunk));
      return true;
    });

    await cmd.parseAsync(['node', 'sisu', 'cancel', item.id, '--db', dbPath, '--json']);
    const updated = JSON.parse(writes.join(''));
    expect(updated.status).toBe('cancelled');
    vi.restoreAllMocks();
  });

  it('work retry resets status to queued', async () => {
    const storage = makeStorage();
    const item = await storage.createWorkItem({ title: 'Retry test', status: 'failed' });

    const { makeWorkCommand } = await import('../src/commands/work.js');
    const cmd = makeWorkCommand();

    const writes: string[] = [];
    vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
      writes.push(String(chunk));
      return true;
    });

    await cmd.parseAsync(['node', 'sisu', 'retry', item.id, '--db', dbPath, '--json']);
    const updated = JSON.parse(writes.join(''));
    expect(updated.status).toBe('queued');
    vi.restoreAllMocks();
  });
});

// ---------------------------------------------------------------------------
// agents commands
// ---------------------------------------------------------------------------

describe('agents commands', () => {
  it('agents list shows empty when no active leases', async () => {
    makeStorage();
    const { makeAgentsCommand } = await import('../src/commands/agents.js');
    const cmd = makeAgentsCommand();

    const writes: string[] = [];
    vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
      writes.push(String(chunk));
      return true;
    });

    await cmd.parseAsync(['node', 'sisu', '--db', dbPath, '--json']);
    const output = JSON.parse(writes.join(''));
    expect(Array.isArray(output)).toBe(true);
    expect(output.length).toBe(0);
    vi.restoreAllMocks();
  });

  it('agents stop deactivates a lease', async () => {
    const storage = makeStorage();
    const item = await storage.createWorkItem({ title: 'Agent test' });
    const lease = await storage.createLease({
      runId: 'run_testrun',
      role: 'builder',
      workItemId: item.id,
      model: 'claude-sonnet-4-6',
    });

    const { makeAgentsCommand } = await import('../src/commands/agents.js');
    const cmd = makeAgentsCommand();

    const writes: string[] = [];
    vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
      writes.push(String(chunk));
      return true;
    });

    await cmd.parseAsync(['node', 'sisu', 'stop', lease.runId, '--db', dbPath, '--json']);
    const updated = JSON.parse(writes.join(''));
    expect(updated.active).toBe(false);
    vi.restoreAllMocks();
  });
});

// ---------------------------------------------------------------------------
// mail commands
// ---------------------------------------------------------------------------

describe('mail commands', () => {
  it('mail list shows empty when no messages', async () => {
    makeStorage();
    const { makeMailCommand } = await import('../src/commands/mail.js');
    const cmd = makeMailCommand();

    const writes: string[] = [];
    vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
      writes.push(String(chunk));
      return true;
    });

    await cmd.parseAsync(['node', 'sisu', 'list', '--db', dbPath, '--json']);
    const output = JSON.parse(writes.join(''));
    expect(Array.isArray(output)).toBe(true);
    vi.restoreAllMocks();
  });

  it('mail list returns messages', async () => {
    const storage = makeStorage();
    await storage.sendMail({
      type: 'status',
      from: 'agent-a',
      to: 'agent-b',
      subject: 'Test mail',
      body: 'Hello',
    });

    const { makeMailCommand } = await import('../src/commands/mail.js');
    const cmd = makeMailCommand();

    const writes: string[] = [];
    vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
      writes.push(String(chunk));
      return true;
    });

    await cmd.parseAsync(['node', 'sisu', 'list', '--db', dbPath, '--json']);
    const messages = JSON.parse(writes.join(''));
    expect(messages.length).toBe(1);
    expect(messages[0].subject).toBe('Test mail');
    vi.restoreAllMocks();
  });

  it('mail show displays a specific message', async () => {
    const storage = makeStorage();
    const msg = await storage.sendMail({
      type: 'result',
      from: 'builder',
      to: 'lead',
      subject: 'Done',
      body: 'Completed work',
    });

    const { makeMailCommand } = await import('../src/commands/mail.js');
    const cmd = makeMailCommand();

    const writes: string[] = [];
    vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
      writes.push(String(chunk));
      return true;
    });

    await cmd.parseAsync(['node', 'sisu', 'show', msg.id, '--db', dbPath, '--json']);
    const output = JSON.parse(writes.join(''));
    expect(output.id).toBe(msg.id);
    expect(output.body).toBe('Completed work');
    vi.restoreAllMocks();
  });
});

// ---------------------------------------------------------------------------
// roles and workflows commands
// ---------------------------------------------------------------------------

describe('roles command', () => {
  it('lists built-in roles', async () => {
    makeStorage();
    const { makeRolesCommand } = await import('../src/commands/roles.js');
    const cmd = makeRolesCommand();

    const writes: string[] = [];
    vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
      writes.push(String(chunk));
      return true;
    });

    await cmd.parseAsync(['node', 'sisu', '--db', dbPath, '--json']);
    const roles = JSON.parse(writes.join(''));
    expect(Array.isArray(roles)).toBe(true);
    expect(roles.length).toBeGreaterThan(0);
    expect(roles.some((r: { id: string }) => r.id === 'builder')).toBe(true);
    vi.restoreAllMocks();
  });
});

describe('workflows command', () => {
  it('lists built-in workflow templates', async () => {
    makeStorage();
    const { makeWorkflowsCommand } = await import('../src/commands/roles.js');
    const cmd = makeWorkflowsCommand();

    const writes: string[] = [];
    vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
      writes.push(String(chunk));
      return true;
    });

    await cmd.parseAsync(['node', 'sisu', '--db', dbPath, '--json']);
    const workflows = JSON.parse(writes.join(''));
    expect(Array.isArray(workflows)).toBe(true);
    expect(workflows.length).toBeGreaterThan(0);
    vi.restoreAllMocks();
  });
});
