import { EventEmitter } from 'node:events';
import type { RoleDefinition } from '@sisu/protocol';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CodexRuntime } from './codex.js';
import type { SpawnConfig } from './types.js';

// Mock node:child_process
vi.mock('node:child_process', () => {
  const mockSpawn = vi.fn();
  const mockSpawnSync = vi.fn();
  return { spawn: mockSpawn, spawnSync: mockSpawnSync };
});

const { spawn: mockSpawn, spawnSync: mockSpawnSync } = await import('node:child_process');

function makeRole(): RoleDefinition {
  return {
    id: 'builder',
    name: 'Builder',
    description: 'Builds things',
    modelTier: 'execution',
    canSpawn: [],
    access: {},
    maxConcurrency: -1,
  };
}

function makeConfig(overrides: Partial<SpawnConfig> = {}): SpawnConfig {
  return {
    runId: 'run_test001',
    role: makeRole(),
    model: 'gpt-4o',
    workItemId: 'wrk_test001',
    taskDescription: 'Do the codex thing',
    workingDirectory: '/tmp',
    systemPrompt: 'You are a codex agent.',
    ...overrides,
  };
}

function makeMockProcess() {
  const proc = new EventEmitter() as ReturnType<typeof mockSpawn>;
  const stdinMock = { write: vi.fn(), end: vi.fn() };
  // @ts-expect-error - mock partial ChildProcess
  proc.stdin = stdinMock;
  // @ts-expect-error - mock partial ChildProcess
  proc.pid = 99999;
  proc.kill = vi.fn();
  return proc;
}

describe('CodexRuntime', () => {
  let runtime: CodexRuntime;
  let mockProcess: ReturnType<typeof makeMockProcess>;

  beforeEach(() => {
    runtime = new CodexRuntime();
    mockProcess = makeMockProcess();
    vi.mocked(mockSpawn).mockReturnValue(mockProcess as never);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('name', () => {
    it('is codex', () => {
      expect(runtime.name).toBe('codex');
    });
  });

  describe('spawn', () => {
    it('spawns codex with correct args including task description', async () => {
      const config = makeConfig({ taskDescription: 'Build the feature' });
      await runtime.spawn(config);

      expect(mockSpawn).toHaveBeenCalledWith(
        'codex',
        ['exec', '--full-auto', '--json', 'Build the feature'],
        { cwd: '/tmp', stdio: ['pipe', 'pipe', 'pipe'] },
      );
    });

    it('closes stdin immediately', async () => {
      const config = makeConfig();
      await runtime.spawn(config);

      expect(mockProcess.stdin?.end).toHaveBeenCalled();
    });

    it('returns handle with runId, pid and spawning status', async () => {
      const config = makeConfig({ runId: 'run_codex_abc' });
      const handle = await runtime.spawn(config);

      expect(handle.runId).toBe('run_codex_abc');
      expect(handle.pid).toBe(99999);
      expect(handle.status).toBe('spawning');
    });

    it('transitions to active on spawn event', async () => {
      const config = makeConfig({ runId: 'run_codex_spawn' });
      await runtime.spawn(config);
      mockProcess.emit('spawn');

      const status = await runtime.heartbeat('run_codex_spawn');
      expect(status.status).toBe('active');
    });

    it('transitions to failed on error event', async () => {
      const config = makeConfig({ runId: 'run_codex_err' });
      await runtime.spawn(config);
      mockProcess.emit('error', new Error('ENOENT'));

      const status = await runtime.heartbeat('run_codex_err');
      expect(status.status).toBe('failed');
    });

    it('transitions to failed on non-zero exit', async () => {
      const config = makeConfig({ runId: 'run_codex_exit_bad' });
      await runtime.spawn(config);
      mockProcess.emit('spawn');
      mockProcess.emit('exit', 1);

      const status = await runtime.heartbeat('run_codex_exit_bad');
      expect(status.status).toBe('failed');
    });

    it('keeps active status on zero exit', async () => {
      const config = makeConfig({ runId: 'run_codex_exit_ok' });
      await runtime.spawn(config);
      mockProcess.emit('spawn');
      mockProcess.emit('exit', 0);

      const status = await runtime.heartbeat('run_codex_exit_ok');
      expect(status.status).toBe('active');
    });
  });

  describe('stop', () => {
    it('kills the process and removes from map', async () => {
      const config = makeConfig({ runId: 'run_codex_stop' });
      await runtime.spawn(config);
      await runtime.stop('run_codex_stop');

      expect(mockProcess.kill).toHaveBeenCalledWith('SIGTERM');

      const status = await runtime.heartbeat('run_codex_stop');
      expect(status.status).toBe('failed');
    });

    it('does nothing for unknown runId', async () => {
      await expect(runtime.stop('run_unknown')).resolves.toBeUndefined();
    });
  });

  describe('heartbeat', () => {
    it('returns failed for unknown runId', async () => {
      const status = await runtime.heartbeat('run_none');
      expect(status.runId).toBe('run_none');
      expect(status.status).toBe('failed');
      expect(status.heartbeatAt).toBeTruthy();
      expect(status.expiresAt).toBeTruthy();
    });

    it('returns ISO timestamps', async () => {
      const status = await runtime.heartbeat('run_ts');
      expect(() => new Date(status.heartbeatAt)).not.toThrow();
      expect(() => new Date(status.expiresAt)).not.toThrow();
    });

    it('expiresAt is 60s after now', async () => {
      const before = Date.now();
      const status = await runtime.heartbeat('run_ttl');
      const after = Date.now();

      const expiresMs = new Date(status.expiresAt).getTime();
      expect(expiresMs).toBeGreaterThanOrEqual(before + 60_000);
      expect(expiresMs).toBeLessThanOrEqual(after + 60_000);
    });
  });

  describe('isAvailable', () => {
    it('returns true when which codex succeeds', async () => {
      vi.mocked(mockSpawnSync).mockReturnValue({ status: 0 } as never);
      expect(await runtime.isAvailable()).toBe(true);
    });

    it('returns false when which codex fails', async () => {
      vi.mocked(mockSpawnSync).mockReturnValue({ status: 1 } as never);
      expect(await runtime.isAvailable()).toBe(false);
    });

    it('returns false on exception', async () => {
      vi.mocked(mockSpawnSync).mockImplementation(() => {
        throw new Error('not found');
      });
      expect(await runtime.isAvailable()).toBe(false);
    });
  });
});
