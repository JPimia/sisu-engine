import { EventEmitter } from 'node:events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ClaudeCodeRuntime } from './claude-code.js';
import type { SpawnConfig } from './types.js';

// Mock node:child_process
vi.mock('node:child_process', () => {
  const mockSpawn = vi.fn();
  const mockSpawnSync = vi.fn();
  return { spawn: mockSpawn, spawnSync: mockSpawnSync };
});

const { spawn: mockSpawn, spawnSync: mockSpawnSync } = await import('node:child_process');

type MockProcess = EventEmitter & {
  stdin: { write: ReturnType<typeof vi.fn>; end: ReturnType<typeof vi.fn> } | null;
  pid: number;
  kill: ReturnType<typeof vi.fn>;
};

function makeConfig(overrides: Partial<SpawnConfig> = {}): SpawnConfig {
  return {
    runId: 'run_test001',
    role: 'builder',
    planId: 'plan_test001',
    model: 'claude-sonnet-4-6',
    workItemId: 'wrk_test001',
    taskDescription: 'Do the thing',
    workingDirectory: '/tmp',
    systemPrompt: 'You are a builder.',
    ...overrides,
  };
}

function makeMockProcess(): MockProcess {
  const proc = new EventEmitter();
  const mockProc = proc as unknown as MockProcess;
  mockProc.stdin = { write: vi.fn(), end: vi.fn() };
  mockProc.pid = 12345;
  mockProc.kill = vi.fn();
  return mockProc;
}

describe('ClaudeCodeRuntime', () => {
  let runtime: ClaudeCodeRuntime;
  let mockProcess: MockProcess;

  beforeEach(() => {
    runtime = new ClaudeCodeRuntime();
    mockProcess = makeMockProcess();
    vi.mocked(mockSpawn).mockReturnValue(mockProcess as never);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('name', () => {
    it('is claude-code', () => {
      expect(runtime.name).toBe('claude-code');
    });
  });

  describe('spawn', () => {
    it('spawns claude with correct args', async () => {
      const config = makeConfig();
      await runtime.spawn(config);

      expect(mockSpawn).toHaveBeenCalledWith(
        'claude',
        ['--model', 'claude-sonnet-4-6', '--permission-mode', 'bypassPermissions', 'Do the thing'],
        { cwd: '/tmp', stdio: ['pipe', 'pipe', 'pipe'] },
      );
    });

    it('closes stdin immediately', async () => {
      const config = makeConfig();
      await runtime.spawn(config);

      expect(mockProcess.stdin?.end).toHaveBeenCalled();
    });

    it('returns handle with runId, pid and spawning status', async () => {
      const config = makeConfig({ runId: 'run_abc' });
      const handle = await runtime.spawn(config);

      expect(handle.runId).toBe('run_abc');
      expect(handle.pid).toBe(12345);
      expect(handle.status).toBe('spawning');
    });

    it('transitions to active on spawn event', async () => {
      const config = makeConfig({ runId: 'run_spawn' });
      await runtime.spawn(config);
      mockProcess.emit('spawn');

      const status = await runtime.heartbeat('run_spawn');
      expect(status.status).toBe('active');
    });

    it('transitions to failed on error event', async () => {
      const config = makeConfig({ runId: 'run_err' });
      await runtime.spawn(config);
      mockProcess.emit('error', new Error('ENOENT'));

      const status = await runtime.heartbeat('run_err');
      expect(status.status).toBe('failed');
    });

    it('transitions to failed on non-zero exit', async () => {
      const config = makeConfig({ runId: 'run_exit_bad' });
      await runtime.spawn(config);
      mockProcess.emit('spawn');
      mockProcess.emit('exit', 1);

      const status = await runtime.heartbeat('run_exit_bad');
      expect(status.status).toBe('failed');
    });

    it('transitions to completed on zero exit', async () => {
      const config = makeConfig({ runId: 'run_exit_ok' });
      await runtime.spawn(config);
      mockProcess.emit('spawn');
      mockProcess.emit('exit', 0);

      const status = await runtime.heartbeat('run_exit_ok');
      expect(status.status).toBe('completed');
    });
  });

  describe('stop', () => {
    it('kills the process and removes from map', async () => {
      const config = makeConfig({ runId: 'run_stop' });
      await runtime.spawn(config);
      await runtime.stop('run_stop');

      expect(mockProcess.kill).toHaveBeenCalledWith('SIGTERM');

      // After stop, heartbeat shows failed
      const status = await runtime.heartbeat('run_stop');
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

    it('returns timestamps as ISO strings', async () => {
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
    it('returns true when which claude succeeds', async () => {
      vi.mocked(mockSpawnSync).mockReturnValue({ status: 0 } as never);
      expect(await runtime.isAvailable()).toBe(true);
    });

    it('returns false when which claude fails', async () => {
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
