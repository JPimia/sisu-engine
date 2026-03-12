import { describe, expect, it } from 'vitest';
import { BUILT_IN_ROLES, BUILT_IN_WORKFLOWS, getBuiltInRole, getBuiltInWorkflow } from './index.js';

// ---------------------------------------------------------------------------
// Role tests
// ---------------------------------------------------------------------------

describe('BUILT_IN_ROLES', () => {
  const EXPECTED_ROLE_IDS = [
    'orchestrator',
    'coordinator',
    'supervisor',
    'lead',
    'scout',
    'builder',
    'reviewer',
    'merger',
    'monitor',
  ] as const;

  it('exports exactly 9 built-in roles', () => {
    expect(BUILT_IN_ROLES).toHaveLength(9);
  });

  it('contains all expected role IDs', () => {
    const ids = BUILT_IN_ROLES.map((r) => r.id);
    for (const expected of EXPECTED_ROLE_IDS) {
      expect(ids).toContain(expected);
    }
  });

  it('every role has a non-empty name and description', () => {
    for (const role of BUILT_IN_ROLES) {
      expect(role.name.length).toBeGreaterThan(0);
      expect(role.description.length).toBeGreaterThan(0);
    }
  });

  it('every role has a valid modelTier', () => {
    const validTiers = ['strategic', 'execution', 'review', 'observation'];
    for (const role of BUILT_IN_ROLES) {
      expect(validTiers).toContain(role.modelTier);
    }
  });

  it('every role has a modelPreference string', () => {
    for (const role of BUILT_IN_ROLES) {
      expect(typeof role.modelPreference).toBe('string');
      expect((role.modelPreference ?? '').length).toBeGreaterThan(0);
    }
  });

  it('every role has an access object with at least one entry', () => {
    for (const role of BUILT_IN_ROLES) {
      expect(Object.keys(role.access).length).toBeGreaterThan(0);
    }
  });

  it('every access value is a valid AccessLevel', () => {
    const validLevels = ['read', 'write', 'admin'];
    for (const role of BUILT_IN_ROLES) {
      for (const [, level] of Object.entries(role.access)) {
        expect(validLevels).toContain(level);
      }
    }
  });

  it('every role has a maxConcurrency of -1 or a positive integer', () => {
    for (const role of BUILT_IN_ROLES) {
      expect(role.maxConcurrency === -1 || role.maxConcurrency > 0).toBe(true);
    }
  });

  it('canSpawn references only valid role IDs', () => {
    const allIds = BUILT_IN_ROLES.map((r) => r.id);
    for (const role of BUILT_IN_ROLES) {
      for (const spawnId of role.canSpawn) {
        expect(allIds).toContain(spawnId);
      }
    }
  });
});

describe('role model tier assignments', () => {
  it('orchestrator uses strategic tier', () => {
    expect(getBuiltInRole('orchestrator')?.modelTier).toBe('strategic');
  });

  it('coordinator uses strategic tier', () => {
    expect(getBuiltInRole('coordinator')?.modelTier).toBe('strategic');
  });

  it('supervisor uses strategic tier', () => {
    expect(getBuiltInRole('supervisor')?.modelTier).toBe('strategic');
  });

  it('lead uses strategic tier', () => {
    expect(getBuiltInRole('lead')?.modelTier).toBe('strategic');
  });

  it('scout uses review tier', () => {
    expect(getBuiltInRole('scout')?.modelTier).toBe('review');
  });

  it('builder uses execution tier', () => {
    expect(getBuiltInRole('builder')?.modelTier).toBe('execution');
  });

  it('reviewer uses review tier', () => {
    expect(getBuiltInRole('reviewer')?.modelTier).toBe('review');
  });

  it('merger uses execution tier', () => {
    expect(getBuiltInRole('merger')?.modelTier).toBe('execution');
  });

  it('monitor uses observation tier', () => {
    expect(getBuiltInRole('monitor')?.modelTier).toBe('observation');
  });
});

describe('spawn hierarchy', () => {
  it('orchestrator can spawn coordinator, supervisor, monitor', () => {
    const role = getBuiltInRole('orchestrator');
    expect(role?.canSpawn).toContain('coordinator');
    expect(role?.canSpawn).toContain('supervisor');
    expect(role?.canSpawn).toContain('monitor');
  });

  it('coordinator can spawn all execution roles', () => {
    const role = getBuiltInRole('coordinator');
    expect(role?.canSpawn).toContain('supervisor');
    expect(role?.canSpawn).toContain('lead');
    expect(role?.canSpawn).toContain('scout');
    expect(role?.canSpawn).toContain('builder');
    expect(role?.canSpawn).toContain('reviewer');
    expect(role?.canSpawn).toContain('merger');
    expect(role?.canSpawn).toContain('monitor');
  });

  it('lead can spawn scout, builder, reviewer, merger', () => {
    const role = getBuiltInRole('lead');
    expect(role?.canSpawn).toContain('scout');
    expect(role?.canSpawn).toContain('builder');
    expect(role?.canSpawn).toContain('reviewer');
    expect(role?.canSpawn).toContain('merger');
  });

  it('leaf roles (scout, builder, reviewer, merger, monitor) cannot spawn anything', () => {
    const leafRoles = ['scout', 'builder', 'reviewer', 'merger', 'monitor'];
    for (const id of leafRoles) {
      expect(getBuiltInRole(id)?.canSpawn).toHaveLength(0);
    }
  });

  it('orchestrator cannot spawn builder directly', () => {
    const role = getBuiltInRole('orchestrator');
    expect(role?.canSpawn).not.toContain('builder');
  });

  it('builder cannot spawn any role', () => {
    const role = getBuiltInRole('builder');
    expect(role?.canSpawn).toHaveLength(0);
  });
});

describe('role access levels', () => {
  it('builder has code write access', () => {
    const role = getBuiltInRole('builder');
    expect(role?.access.code).toBe('write');
  });

  it('merger has code write access', () => {
    const role = getBuiltInRole('merger');
    expect(role?.access.code).toBe('write');
  });

  it('scout has only code read access (no write)', () => {
    const role = getBuiltInRole('scout');
    expect(role?.access.code).toBe('read');
  });

  it('reviewer has only code read access', () => {
    const role = getBuiltInRole('reviewer');
    expect(role?.access.code).toBe('read');
  });

  it('orchestrator has admin task access', () => {
    const role = getBuiltInRole('orchestrator');
    expect(role?.access.tasks).toBe('admin');
  });
});

describe('role concurrency', () => {
  it('orchestrator has maxConcurrency 1 (singleton)', () => {
    expect(getBuiltInRole('orchestrator')?.maxConcurrency).toBe(1);
  });

  it('coordinator has maxConcurrency 1 (singleton)', () => {
    expect(getBuiltInRole('coordinator')?.maxConcurrency).toBe(1);
  });

  it('monitor has maxConcurrency 1 (singleton)', () => {
    expect(getBuiltInRole('monitor')?.maxConcurrency).toBe(1);
  });

  it('builder has unlimited concurrency', () => {
    expect(getBuiltInRole('builder')?.maxConcurrency).toBe(-1);
  });

  it('reviewer has unlimited concurrency', () => {
    expect(getBuiltInRole('reviewer')?.maxConcurrency).toBe(-1);
  });
});

// ---------------------------------------------------------------------------
// Workflow tests
// ---------------------------------------------------------------------------

describe('BUILT_IN_WORKFLOWS', () => {
  const EXPECTED_WORKFLOW_IDS = [
    'wf_simple_task',
    'wf_build_review',
    'wf_scout_build_review',
    'wf_multi_stream_feature',
    'wf_rework_loop',
  ] as const;

  it('exports exactly 5 built-in workflows', () => {
    expect(BUILT_IN_WORKFLOWS).toHaveLength(5);
  });

  it('contains all expected workflow IDs', () => {
    const ids = BUILT_IN_WORKFLOWS.map((w) => w.id);
    for (const expected of EXPECTED_WORKFLOW_IDS) {
      expect(ids).toContain(expected);
    }
  });

  it('every workflow has a non-empty name', () => {
    for (const wf of BUILT_IN_WORKFLOWS) {
      expect(wf.name.length).toBeGreaterThan(0);
    }
  });

  it('every workflow has a semver version string', () => {
    const semverPattern = /^\d+\.\d+\.\d+$/;
    for (const wf of BUILT_IN_WORKFLOWS) {
      expect(wf.version).toMatch(semverPattern);
    }
  });

  it('every workflow has at least one step', () => {
    for (const wf of BUILT_IN_WORKFLOWS) {
      expect(wf.steps.length).toBeGreaterThan(0);
    }
  });

  it('every step role references a valid built-in role', () => {
    const validRoles = BUILT_IN_ROLES.map((r) => r.id);
    for (const wf of BUILT_IN_WORKFLOWS) {
      for (const step of wf.steps) {
        expect(validRoles).toContain(step.role);
      }
    }
  });

  it('every step dependency references a step ID within the same workflow', () => {
    for (const wf of BUILT_IN_WORKFLOWS) {
      const stepIds = wf.steps.map((s) => s.id);
      for (const step of wf.steps) {
        for (const dep of step.dependencies) {
          expect(stepIds).toContain(dep);
        }
      }
    }
  });

  it('every workflow has an appliesTo array with at least one status', () => {
    for (const wf of BUILT_IN_WORKFLOWS) {
      expect(wf.appliesTo.length).toBeGreaterThan(0);
    }
  });
});

describe('workflow: wf_simple_task', () => {
  const wf = getBuiltInWorkflow('wf_simple_task');

  it('has exactly one step', () => {
    expect(wf?.steps).toHaveLength(1);
  });

  it('step role is builder', () => {
    expect(wf?.steps[0]?.role).toBe('builder');
  });

  it('first step has no dependencies', () => {
    expect(wf?.steps[0]?.dependencies).toHaveLength(0);
  });
});

describe('workflow: wf_build_review', () => {
  const wf = getBuiltInWorkflow('wf_build_review');

  it('has exactly two steps', () => {
    expect(wf?.steps).toHaveLength(2);
  });

  it('step 1 is builder, step 2 is reviewer', () => {
    expect(wf?.steps[0]?.role).toBe('builder');
    expect(wf?.steps[1]?.role).toBe('reviewer');
  });

  it('reviewer depends on build step', () => {
    const reviewStep = wf?.steps.find((s) => s.role === 'reviewer');
    expect(reviewStep?.dependencies).toContain('build');
  });
});

describe('workflow: wf_scout_build_review', () => {
  const wf = getBuiltInWorkflow('wf_scout_build_review');

  it('has exactly three steps', () => {
    expect(wf?.steps).toHaveLength(3);
  });

  it('contains scout, builder, reviewer roles in order', () => {
    const roles = wf?.steps.map((s) => s.role);
    expect(roles).toEqual(['scout', 'builder', 'reviewer']);
  });

  it('build depends on scout', () => {
    const buildStep = wf?.steps.find((s) => s.role === 'builder');
    expect(buildStep?.dependencies).toContain('scout');
  });

  it('review depends on build', () => {
    const reviewStep = wf?.steps.find((s) => s.role === 'reviewer');
    expect(reviewStep?.dependencies).toContain('build');
  });
});

describe('workflow: wf_multi_stream_feature', () => {
  const wf = getBuiltInWorkflow('wf_multi_stream_feature');

  it('has exactly six steps', () => {
    expect(wf?.steps).toHaveLength(6);
  });

  it('starts with a lead planning step', () => {
    expect(wf?.steps[0]?.role).toBe('lead');
  });

  it('ends with a merger step', () => {
    const lastStep = wf?.steps[wf.steps.length - 1];
    expect(lastStep?.role).toBe('merger');
  });

  it('contains two builder steps', () => {
    const builders = wf?.steps.filter((s) => s.role === 'builder');
    expect(builders).toHaveLength(2);
  });

  it('contains two reviewer steps', () => {
    const reviewers = wf?.steps.filter((s) => s.role === 'reviewer');
    expect(reviewers).toHaveLength(2);
  });

  it('merger depends on both review steps', () => {
    const mergeStep = wf?.steps.find((s) => s.role === 'merger');
    expect(mergeStep?.dependencies).toContain('review_a');
    expect(mergeStep?.dependencies).toContain('review_b');
  });

  it('both builder steps depend only on plan', () => {
    const builders = wf?.steps.filter((s) => s.role === 'builder') ?? [];
    for (const b of builders) {
      expect(b.dependencies).toContain('plan');
      expect(b.dependencies).toHaveLength(1);
    }
  });

  it('appliesTo includes planning', () => {
    expect(wf?.appliesTo).toContain('planning');
  });
});

describe('workflow: wf_rework_loop', () => {
  const wf = getBuiltInWorkflow('wf_rework_loop');

  it('has exactly three steps', () => {
    expect(wf?.steps).toHaveLength(3);
  });

  it('has build, review, rework steps', () => {
    const ids = wf?.steps.map((s) => s.id);
    expect(ids).toContain('build');
    expect(ids).toContain('review');
    expect(ids).toContain('rework');
  });

  it('review depends on build', () => {
    const reviewStep = wf?.steps.find((s) => s.id === 'review');
    expect(reviewStep?.dependencies).toContain('build');
  });

  it('rework depends on review', () => {
    const reworkStep = wf?.steps.find((s) => s.id === 'rework');
    expect(reworkStep?.dependencies).toContain('review');
  });

  it('rework step has conditional review_fail config', () => {
    const reworkStep = wf?.steps.find((s) => s.id === 'rework');
    expect(reworkStep?.config.conditional).toBe('review_fail');
  });

  it('appliesTo includes in_review for resuming mid-loop', () => {
    expect(wf?.appliesTo).toContain('in_review');
  });
});

// ---------------------------------------------------------------------------
// Lookup helpers
// ---------------------------------------------------------------------------

describe('getBuiltInRole', () => {
  it('returns role for valid ID', () => {
    const role = getBuiltInRole('builder');
    expect(role).toBeDefined();
    expect(role?.id).toBe('builder');
  });

  it('returns undefined for unknown ID', () => {
    expect(getBuiltInRole('nonexistent')).toBeUndefined();
  });

  it('returns undefined for empty string', () => {
    expect(getBuiltInRole('')).toBeUndefined();
  });
});

describe('getBuiltInWorkflow', () => {
  it('returns workflow for valid ID', () => {
    const wf = getBuiltInWorkflow('wf_build_review');
    expect(wf).toBeDefined();
    expect(wf?.id).toBe('wf_build_review');
  });

  it('returns undefined for unknown ID', () => {
    expect(getBuiltInWorkflow('wf_nonexistent')).toBeUndefined();
  });

  it('returns undefined for empty string', () => {
    expect(getBuiltInWorkflow('')).toBeUndefined();
  });
});
