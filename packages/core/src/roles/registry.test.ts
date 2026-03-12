import { describe, expect, it } from 'vitest';
import { BUILT_IN_ROLES } from './built-in.js';
import { RoleRegistry, SpawnViolationError } from './registry.js';

describe('BUILT_IN_ROLES', () => {
  it('has exactly 9 roles', () => {
    expect(BUILT_IN_ROLES).toHaveLength(9);
  });

  it('contains all expected role IDs', () => {
    const ids = BUILT_IN_ROLES.map((r) => r.id);
    expect(ids).toContain('orchestrator');
    expect(ids).toContain('coordinator');
    expect(ids).toContain('supervisor');
    expect(ids).toContain('lead');
    expect(ids).toContain('scout');
    expect(ids).toContain('builder');
    expect(ids).toContain('reviewer');
    expect(ids).toContain('merger');
    expect(ids).toContain('monitor');
  });

  it('each role has required fields', () => {
    for (const role of BUILT_IN_ROLES) {
      expect(role.id).toBeTruthy();
      expect(role.name).toBeTruthy();
      expect(role.description).toBeTruthy();
      expect(role.modelTier).toBeTruthy();
      expect(Array.isArray(role.canSpawn)).toBe(true);
      expect(typeof role.access).toBe('object');
      expect(typeof role.maxConcurrency).toBe('number');
    }
  });

  it('leaf roles have empty canSpawn', () => {
    const leafRoles = ['scout', 'builder', 'reviewer', 'merger', 'monitor'];
    for (const id of leafRoles) {
      const role = BUILT_IN_ROLES.find((r) => r.id === id);
      expect(role?.canSpawn).toHaveLength(0);
    }
  });

  it('orchestrator can spawn coordinator, supervisor, monitor', () => {
    const orchestrator = BUILT_IN_ROLES.find((r) => r.id === 'orchestrator');
    expect(orchestrator?.canSpawn).toContain('coordinator');
    expect(orchestrator?.canSpawn).toContain('supervisor');
    expect(orchestrator?.canSpawn).toContain('monitor');
  });

  it('coordinator can spawn builders, reviewers, leads, scouts', () => {
    const coordinator = BUILT_IN_ROLES.find((r) => r.id === 'coordinator');
    expect(coordinator?.canSpawn).toContain('builder');
    expect(coordinator?.canSpawn).toContain('reviewer');
    expect(coordinator?.canSpawn).toContain('lead');
    expect(coordinator?.canSpawn).toContain('scout');
  });
});

describe('RoleRegistry', () => {
  it('lists all 9 built-in roles', () => {
    const registry = new RoleRegistry();
    expect(registry.listRoles()).toHaveLength(9);
  });

  it('gets role by id', () => {
    const registry = new RoleRegistry();
    const role = registry.getRole('builder');
    expect(role).not.toBeNull();
    expect(role?.id).toBe('builder');
  });

  it('returns null for unknown role', () => {
    const registry = new RoleRegistry();
    expect(registry.getRole('unknown-role')).toBeNull();
  });

  it('accepts extra roles on construction', () => {
    const extra = {
      id: 'custom-agent',
      name: 'Custom Agent',
      description: 'test',
      modelTier: 'execution' as const,
      canSpawn: [],
      access: {},
      maxConcurrency: -1,
    };
    const registry = new RoleRegistry([extra]);
    expect(registry.listRoles()).toHaveLength(10);
    expect(registry.getRole('custom-agent')).not.toBeNull();
  });

  it('register() adds a new role', () => {
    const registry = new RoleRegistry();
    registry.register({
      id: 'dynamic-role',
      name: 'Dynamic Role',
      description: 'test',
      modelTier: 'observation' as const,
      canSpawn: [],
      access: {},
      maxConcurrency: 1,
    });
    expect(registry.getRole('dynamic-role')).not.toBeNull();
  });

  describe('assertSpawnAllowed', () => {
    it('does not throw when spawn is allowed', () => {
      const registry = new RoleRegistry();
      expect(() => registry.assertSpawnAllowed('orchestrator', 'coordinator')).not.toThrow();
      expect(() => registry.assertSpawnAllowed('coordinator', 'builder')).not.toThrow();
      expect(() => registry.assertSpawnAllowed('lead', 'builder')).not.toThrow();
    });

    it('throws SpawnViolationError when not allowed', () => {
      const registry = new RoleRegistry();
      expect(() => registry.assertSpawnAllowed('builder', 'reviewer')).toThrowError(
        SpawnViolationError,
      );
      expect(() => registry.assertSpawnAllowed('scout', 'builder')).toThrowError(
        SpawnViolationError,
      );
    });

    it('throws Error for unknown parent role', () => {
      const registry = new RoleRegistry();
      expect(() => registry.assertSpawnAllowed('ghost', 'builder')).toThrowError(
        'Unknown role: ghost',
      );
    });
  });

  describe('canSpawn', () => {
    it('returns true for valid spawn relationship', () => {
      const registry = new RoleRegistry();
      expect(registry.canSpawn('orchestrator', 'coordinator')).toBe(true);
      expect(registry.canSpawn('supervisor', 'builder')).toBe(true);
    });

    it('returns false for invalid spawn relationship', () => {
      const registry = new RoleRegistry();
      expect(registry.canSpawn('builder', 'reviewer')).toBe(false);
      expect(registry.canSpawn('reviewer', 'builder')).toBe(false);
      expect(registry.canSpawn('monitor', 'builder')).toBe(false);
    });

    it('returns false for unknown role', () => {
      const registry = new RoleRegistry();
      expect(registry.canSpawn('ghost', 'builder')).toBe(false);
    });
  });

  describe('spawn hierarchy matrix (selected pairs)', () => {
    const registry = new RoleRegistry();

    // orchestrator → can spawn these
    it.each([
      ['coordinator'],
      ['supervisor'],
      ['monitor'],
    ])('orchestrator can spawn %s', (child) => {
      expect(registry.canSpawn('orchestrator', child)).toBe(true);
    });

    // orchestrator → cannot spawn these
    it.each([
      ['builder'],
      ['reviewer'],
      ['scout'],
      ['lead'],
      ['merger'],
    ])('orchestrator cannot spawn %s', (child) => {
      expect(registry.canSpawn('orchestrator', child)).toBe(false);
    });

    // builder → cannot spawn anyone
    it.each([
      ['orchestrator'],
      ['coordinator'],
      ['supervisor'],
      ['lead'],
      ['scout'],
      ['builder'],
      ['reviewer'],
      ['merger'],
      ['monitor'],
    ])('builder cannot spawn %s', (child) => {
      expect(registry.canSpawn('builder', child)).toBe(false);
    });
  });
});
