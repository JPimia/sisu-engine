import type { RoleDefinition } from '@sisu/protocol';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AgentRuntime } from './interface.js';
import { RuntimeManager } from './manager.js';
import type { AgentHandle, LeaseStatus, SpawnConfig } from './types.js';

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
    runId: 'run_mgr001',
    role: makeRole(),
    model: 'claude-sonnet-4-6',
    workItemId: 'wrk_mgr001',
    taskDescription: 'Do the thing',
    workingDirectory: '/tmp',
    systemPrompt: 'You are a builder.',
    ...overrides,
  };
}

function makeMockRuntime(name: string): AgentRuntime {
  return {
    name,
    spawn: vi.fn(),
    stop: vi.fn(),
    heartbeat: vi.fn(),
    isAvailable: vi.fn(),
  };
}

describe('RuntimeManager', () => {
  let manager: RuntimeManager;

  beforeEach(() => {
    manager = new RuntimeManager();
  });

  describe('registerRuntime / getRuntime / listRuntimes', () => {
    it('registers and retrieves a runtime by name', () => {
      const rt = makeMockRuntime('claude-code');
      manager.registerRuntime('claude-code', rt);
      expect(manager.getRuntime('claude-code')).toBe(rt);
    });

    it('returns undefined for unregistered runtime', () => {
      expect(manager.getRuntime('unknown')).toBeUndefined();
    });

    it('lists registered runtime names', () => {
      manager.registerRuntime('claude-code', makeMockRuntime('claude-code'));
      manager.registerRuntime('codex', makeMockRuntime('codex'));
      expect(manager.listRuntimes()).toEqual(['claude-code', 'codex']);
    });

    it('returns empty array when no runtimes registered', () => {
      expect(manager.listRuntimes()).toEqual([]);
    });

    it('overwrites existing runtime on re-register', () => {
      const rt1 = makeMockRuntime('claude-code');
      const rt2 = makeMockRuntime('claude-code');
      manager.registerRuntime('claude-code', rt1);
      manager.registerRuntime('claude-code', rt2);
      expect(manager.getRuntime('claude-code')).toBe(rt2);
      expect(manager.listRuntimes()).toHaveLength(1);
    });
  });

  describe('spawn', () => {
    it('delegates to the correct runtime', async () => {
      const rt = makeMockRuntime('claude-code');
      const expectedHandle: AgentHandle = { runId: 'run_mgr001', pid: 100, status: 'active' };
      vi.mocked(rt.spawn).mockResolvedValue(expectedHandle);

      manager.registerRuntime('claude-code', rt);
      const config = makeConfig();
      const handle = await manager.spawn('claude-code', config);

      expect(rt.spawn).toHaveBeenCalledWith(config);
      expect(handle).toBe(expectedHandle);
    });

    it('throws when runtime not found', async () => {
      const config = makeConfig();
      await expect(manager.spawn('nonexistent', config)).rejects.toThrow(
        'Runtime not found: nonexistent',
      );
    });

    it('routes to the right runtime among multiple', async () => {
      const cc = makeMockRuntime('claude-code');
      const cx = makeMockRuntime('codex');
      const ccHandle: AgentHandle = { runId: 'run_cc', status: 'active' };
      const cxHandle: AgentHandle = { runId: 'run_cx', status: 'active' };
      vi.mocked(cc.spawn).mockResolvedValue(ccHandle);
      vi.mocked(cx.spawn).mockResolvedValue(cxHandle);

      manager.registerRuntime('claude-code', cc);
      manager.registerRuntime('codex', cx);

      const result = await manager.spawn('codex', makeConfig({ runId: 'run_cx' }));
      expect(result).toBe(cxHandle);
      expect(cc.spawn).not.toHaveBeenCalled();
    });
  });

  describe('stop', () => {
    it('delegates stop to the correct runtime', async () => {
      const rt = makeMockRuntime('claude-code');
      vi.mocked(rt.stop).mockResolvedValue(undefined);
      manager.registerRuntime('claude-code', rt);

      await manager.stop('claude-code', 'run_stop');
      expect(rt.stop).toHaveBeenCalledWith('run_stop');
    });

    it('throws when runtime not found', async () => {
      await expect(manager.stop('nonexistent', 'run_x')).rejects.toThrow(
        'Runtime not found: nonexistent',
      );
    });
  });

  describe('heartbeat', () => {
    it('delegates heartbeat to the correct runtime', async () => {
      const rt = makeMockRuntime('claude-code');
      const leaseStatus: LeaseStatus = {
        runId: 'run_hb',
        status: 'active',
        heartbeatAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
      };
      vi.mocked(rt.heartbeat).mockResolvedValue(leaseStatus);
      manager.registerRuntime('claude-code', rt);

      const result = await manager.heartbeat('claude-code', 'run_hb');
      expect(rt.heartbeat).toHaveBeenCalledWith('run_hb');
      expect(result).toBe(leaseStatus);
    });

    it('throws when runtime not found', async () => {
      await expect(manager.heartbeat('nonexistent', 'run_x')).rejects.toThrow(
        'Runtime not found: nonexistent',
      );
    });
  });
});
