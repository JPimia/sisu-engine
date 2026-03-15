/**
 * Tests for the sisu.assignment.v1 Zod schemas in @sisu/protocol.
 */
import { describe, expect, it } from 'vitest';
import {
  AssignmentRoleSchema,
  AssignmentFrontmatterSchema,
  AssignmentSchema,
  FileScopeSchema,
  ValidationCommandSchema,
  AuthoritySchema,
  HandoffSchema,
  RuntimeConfigSchema,
  ReviewTargetSchema,
  ExplorationSchema,
  CoordinationSchema,
  WorkstreamPlanningSchema,
  MergePlanSchema,
  MonitoringConfigSchema,
  EcosystemSchema,
  ProfileSchema,
  parseAssignment,
  safeParseAssignment,
  ASSIGNMENT_ROLES,
} from './assignment-schema.js';

// ---------------------------------------------------------------------------
// Role schema
// ---------------------------------------------------------------------------

describe('AssignmentRoleSchema', () => {
  it.each([
    'orchestrator',
    'coordinator',
    'lead',
    'builder',
    'reviewer',
    'scout',
    'monitor',
    'merger',
  ])('accepts canonical role: %s', (role) => {
    expect(AssignmentRoleSchema.safeParse(role).success).toBe(true);
  });

  it('rejects supervisor (deprecated alias, not a schema role)', () => {
    expect(AssignmentRoleSchema.safeParse('supervisor').success).toBe(false);
  });

  it('rejects unknown role', () => {
    expect(AssignmentRoleSchema.safeParse('wizard').success).toBe(false);
  });

  it('ASSIGNMENT_ROLES contains all 8 canonical roles', () => {
    expect(ASSIGNMENT_ROLES).toHaveLength(8);
    expect(ASSIGNMENT_ROLES).toContain('builder');
    expect(ASSIGNMENT_ROLES).not.toContain('supervisor');
  });
});

// ---------------------------------------------------------------------------
// Profile schema
// ---------------------------------------------------------------------------

describe('ProfileSchema', () => {
  it('accepts standard', () => {
    expect(ProfileSchema.safeParse('standard').success).toBe(true);
  });

  it('accepts co-creation', () => {
    expect(ProfileSchema.safeParse('co-creation').success).toBe(true);
  });

  it('rejects ov-co-creation (raw alias, not a profile value)', () => {
    expect(ProfileSchema.safeParse('ov-co-creation').success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Sub-schemas
// ---------------------------------------------------------------------------

describe('FileScopeSchema', () => {
  it('accepts valid scope', () => {
    const result = FileScopeSchema.safeParse({ allowed: ['src/**'], forbidden: ['dist/**'] });
    expect(result.success).toBe(true);
  });

  it('rejects empty allowed', () => {
    expect(FileScopeSchema.safeParse({ allowed: [] }).success).toBe(false);
  });
});

describe('ValidationCommandSchema', () => {
  it('accepts valid command', () => {
    const result = ValidationCommandSchema.safeParse({
      name: 'lint',
      command: 'npx eslint .',
      required: true,
    });
    expect(result.success).toBe(true);
  });
});

describe('AuthoritySchema', () => {
  it('accepts valid authority', () => {
    const result = AuthoritySchema.safeParse({
      canDo: ['write files'],
      cannotDo: ['delete database'],
    });
    expect(result.success).toBe(true);
  });
});

describe('HandoffSchema', () => {
  it('accepts valid handoff', () => {
    const result = HandoffSchema.safeParse({
      onComplete: 'reviewer-1',
      onBlock: 'lead-1',
      onFailure: 'coordinator-1',
    });
    expect(result.success).toBe(true);
  });
});

describe('RuntimeConfigSchema', () => {
  it('accepts full config', () => {
    const result = RuntimeConfigSchema.safeParse({
      model: 'claude-opus-4-6',
      modelTier: 'strategic',
      timeout: 300,
      maxTokens: 100000,
      profile: 'co-creation',
    });
    expect(result.success).toBe(true);
  });

  it('accepts empty config', () => {
    expect(RuntimeConfigSchema.safeParse({}).success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Role-specific extensions
// ---------------------------------------------------------------------------

describe('ReviewTargetSchema', () => {
  it('accepts valid review target', () => {
    const result = ReviewTargetSchema.safeParse({
      branch: 'feature/auth',
      baseBranch: 'develop',
      prUrl: 'https://github.com/org/repo/pull/1',
    });
    expect(result.success).toBe(true);
  });

  it('rejects invalid prUrl', () => {
    const result = ReviewTargetSchema.safeParse({
      branch: 'x',
      baseBranch: 'y',
      prUrl: 'not-a-url',
    });
    expect(result.success).toBe(false);
  });
});

describe('ExplorationSchema', () => {
  it('accepts valid exploration', () => {
    const result = ExplorationSchema.safeParse({
      questions: ['What auth patterns exist?'],
      scope: ['src/auth/**'],
    });
    expect(result.success).toBe(true);
  });

  it('rejects empty questions', () => {
    expect(ExplorationSchema.safeParse({ questions: [], scope: ['x'] }).success).toBe(false);
  });
});

describe('CoordinationSchema', () => {
  it('accepts valid coordination', () => {
    const result = CoordinationSchema.safeParse({
      teamSize: 3,
      subTasks: ['task a', 'task b'],
    });
    expect(result.success).toBe(true);
  });
});

describe('WorkstreamPlanningSchema', () => {
  it('accepts valid planning', () => {
    const result = WorkstreamPlanningSchema.safeParse({
      streams: ['auth', 'dashboard'],
      dependencies: ['auth → dashboard'],
    });
    expect(result.success).toBe(true);
  });
});

describe('MergePlanSchema', () => {
  it('accepts valid merge plan', () => {
    const result = MergePlanSchema.safeParse({
      branches: ['feature/a', 'feature/b'],
      strategy: 'three-way merge with semantic resolution',
    });
    expect(result.success).toBe(true);
  });

  it('rejects single branch', () => {
    expect(
      MergePlanSchema.safeParse({ branches: ['only-one'], strategy: 'x' }).success,
    ).toBe(false);
  });
});

describe('MonitoringConfigSchema', () => {
  it('accepts valid monitoring', () => {
    const result = MonitoringConfigSchema.safeParse({
      metrics: ['token_usage', 'lease_staleness'],
      thresholds: { max_stale_seconds: 120 },
    });
    expect(result.success).toBe(true);
  });
});

describe('EcosystemSchema', () => {
  it('accepts valid ecosystem', () => {
    const result = EcosystemSchema.safeParse({
      activeWorkstreams: ['auth-feature', 'dashboard-redesign'],
      healthChecks: ['lease-liveness', 'token-budget'],
    });
    expect(result.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Frontmatter
// ---------------------------------------------------------------------------

describe('AssignmentFrontmatterSchema', () => {
  const validFm = {
    schema: 'sisu.assignment.v1' as const,
    role: 'builder' as const,
    taskId: 'wrk_01ABC',
    title: 'Do stuff',
    parentAgent: 'coord-1',
    rootTaskId: 'wrk_ROOT',
    repoId: 'mc',
    repoPath: '/home/jarip/mc',
    worktreePath: '/home/jarip/mc/.wt/x',
    branch: 'feature/x',
    baseBranch: 'develop',
    instructionMode: 'inline' as const,
    priority: 'normal' as const,
    riskLevel: 'medium' as const,
    status: 'assigned' as const,
    createdAt: new Date().toISOString(),
  };

  it('accepts valid frontmatter', () => {
    expect(AssignmentFrontmatterSchema.safeParse(validFm).success).toBe(true);
  });

  it('rejects relative repoPath', () => {
    expect(
      AssignmentFrontmatterSchema.safeParse({ ...validFm, repoPath: 'relative' }).success,
    ).toBe(false);
  });

  it('rejects relative worktreePath', () => {
    expect(
      AssignmentFrontmatterSchema.safeParse({ ...validFm, worktreePath: 'rel' }).success,
    ).toBe(false);
  });

  it('accepts Windows paths', () => {
    expect(
      AssignmentFrontmatterSchema.safeParse({
        ...validFm,
        repoPath: 'C:\\Users\\x',
        worktreePath: 'D:\\wt\\y',
      }).success,
    ).toBe(true);
  });

  it('accepts optional profile', () => {
    expect(
      AssignmentFrontmatterSchema.safeParse({ ...validFm, profile: 'co-creation' }).success,
    ).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Full assignment
// ---------------------------------------------------------------------------

describe('AssignmentSchema (full)', () => {
  const minimalAssignment = {
    frontmatter: {
      schema: 'sisu.assignment.v1' as const,
      role: 'builder' as const,
      taskId: 'wrk_01ABC',
      title: 'x',
      parentAgent: 'c',
      rootTaskId: 'wrk_R',
      repoId: 'mc',
      repoPath: '/tmp/mc',
      worktreePath: '/tmp/mc/wt',
      branch: 'f',
      baseBranch: 'd',
      instructionMode: 'inline' as const,
      priority: 'normal' as const,
      riskLevel: 'low' as const,
      status: 'assigned' as const,
      createdAt: new Date().toISOString(),
    },
    body: {
      objective: 'do the thing',
      successCriteria: ['it works'],
    },
  };

  it('accepts minimal assignment', () => {
    expect(AssignmentSchema.safeParse(minimalAssignment).success).toBe(true);
  });

  it('parseAssignment returns typed result', () => {
    const result = parseAssignment(minimalAssignment);
    expect(result.frontmatter.schema).toBe('sisu.assignment.v1');
  });

  it('safeParseAssignment returns success=false on bad data', () => {
    const result = safeParseAssignment({ frontmatter: {}, body: {} });
    expect(result.success).toBe(false);
  });

  it('accepts assignment with role-specific extensions', () => {
    const withReview = {
      ...minimalAssignment,
      frontmatter: { ...minimalAssignment.frontmatter, role: 'reviewer' as const },
      reviewTarget: {
        branch: 'f',
        baseBranch: 'd',
      },
    };
    expect(AssignmentSchema.safeParse(withReview).success).toBe(true);
  });
});
