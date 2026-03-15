/**
 * Tests for the SISU assignment overlay system.
 *
 * Covers:
 * - Schema validation (Zod)
 * - Builder/reviewer/lead assignment generation
 * - Builder allowlist enforcement
 * - Reviewer read-only enforcement
 * - Supervisor → lead alias
 * - Co-creation profile classification
 * - Markdown + YAML frontmatter serialization
 * - Absolute path enforcement
 * - Assignment file path generation
 */
import { describe, expect, it } from 'vitest';
import {
  safeParseAssignment,
  AssignmentFrontmatterSchema,
  FileScopeSchema,
  AssignmentRoleSchema,
} from '@sisu/protocol';
import {
  createBuilderAssignment,
  createReviewerAssignment,
  createLeadAssignment,
  resolveRole,
  isRoleAlias,
  isProfile,
} from './generators.js';
import {
  enforceAssignment,
  checkAssignment,
  AssignmentEnforcementError,
} from './enforcement.js';
import {
  assignmentToMarkdown,
  assignmentFilePath,
  assignmentAbsolutePath,
} from './writer.js';
import type {
  BuilderAssignmentInput,
  ReviewerAssignmentInput,
  LeadAssignmentInput,
} from './types.js';

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

function builderInput(overrides?: Partial<BuilderAssignmentInput>): BuilderAssignmentInput {
  return {
    taskId: 'wrk_01ARZZ3MFEXAMPLE00001',
    title: 'Implement user auth',
    parentAgent: 'coordinator-1',
    rootTaskId: 'wrk_01ARZZ3MFEXAMPLE00000',
    repoId: 'mission-control',
    repoPath: '/home/jarip/Projects/mission-control',
    worktreePath: '/home/jarip/Projects/mission-control/.worktrees/auth-feature',
    branch: 'feature/auth',
    baseBranch: 'develop',
    objective: 'Implement JWT-based authentication with refresh tokens',
    successCriteria: [
      'Login endpoint returns JWT + refresh token',
      'Protected routes reject invalid tokens',
      'Tests cover all auth flows',
    ],
    fileScope: {
      allowed: ['src/auth/**', 'src/middleware/auth.ts', 'tests/auth/**'],
      forbidden: ['src/db/migrations/**'],
    },
    validation: [
      { name: 'typecheck', command: 'npx tsc --noEmit', required: true },
      { name: 'test', command: 'npx vitest run src/auth', required: true },
      { name: 'lint', command: 'npx eslint src/auth', required: false },
    ],
    authority: {
      canDo: ['Create new files in src/auth/', 'Add dependencies for JWT handling'],
      cannotDo: ['Modify database schema', 'Change existing API contracts'],
    },
    handoff: {
      onComplete: 'reviewer-1',
      onBlock: 'lead-1',
      onFailure: 'coordinator-1',
    },
    ...overrides,
  };
}

function reviewerInput(overrides?: Partial<ReviewerAssignmentInput>): ReviewerAssignmentInput {
  return {
    taskId: 'wrk_01ARZZ3MFEXAMPLE00002',
    title: 'Review auth implementation',
    parentAgent: 'lead-1',
    rootTaskId: 'wrk_01ARZZ3MFEXAMPLE00000',
    repoId: 'mission-control',
    repoPath: '/home/jarip/Projects/mission-control',
    worktreePath: '/home/jarip/Projects/mission-control/.worktrees/auth-review',
    branch: 'feature/auth',
    baseBranch: 'develop',
    objective: 'Review auth implementation for correctness and security',
    successCriteria: [
      'No security vulnerabilities in token handling',
      'Test coverage ≥ 90%',
      'Code follows project conventions',
    ],
    reviewTarget: {
      branch: 'feature/auth',
      baseBranch: 'develop',
      prUrl: 'https://github.com/JPimia/mission-control/pull/42',
      diffScope: ['src/auth/**'],
    },
    validation: [
      { name: 'typecheck', command: 'npx tsc --noEmit', required: true },
    ],
    authority: {
      canDo: ['Issue pass/fail verdict', 'Request rework'],
      cannotDo: ['Modify code directly', 'Merge branches'],
    },
    handoff: {
      onComplete: 'merger-1',
      onBlock: 'lead-1',
      onFailure: 'coordinator-1',
    },
    ...overrides,
  };
}

function leadInput(overrides?: Partial<LeadAssignmentInput>): LeadAssignmentInput {
  return {
    taskId: 'wrk_01ARZZ3MFEXAMPLE00003',
    title: 'Coordinate auth feature',
    parentAgent: 'coordinator-1',
    rootTaskId: 'wrk_01ARZZ3MFEXAMPLE00000',
    repoId: 'mission-control',
    repoPath: '/home/jarip/Projects/mission-control',
    worktreePath: '/home/jarip/Projects/mission-control',
    branch: 'feature/auth',
    baseBranch: 'develop',
    objective: 'Decompose auth feature into parallel builder tasks',
    successCriteria: [
      'All sub-tasks completed and merged',
      'Integration tests pass',
    ],
    coordination: {
      teamSize: 3,
      subTasks: [
        'JWT token generation',
        'Middleware authentication guard',
        'Refresh token rotation',
      ],
      decompositionStrategy: 'Parallel streams with shared interface contract',
    },
    authority: {
      canDo: ['Spawn builders and reviewers', 'Decompose tasks'],
      cannotDo: ['Deploy to production', 'Modify infrastructure'],
    },
    handoff: {
      onComplete: 'coordinator-1',
      onBlock: 'coordinator-1',
      onFailure: 'coordinator-1',
    },
    ...overrides,
  };
}

// ============================================================================
// Schema validation tests
// ============================================================================

describe('Assignment schema validation', () => {
  it('validates a complete builder assignment', () => {
    const assignment = createBuilderAssignment(builderInput());
    const result = safeParseAssignment(assignment);
    expect(result.success).toBe(true);
  });

  it('validates a complete reviewer assignment', () => {
    const assignment = createReviewerAssignment(reviewerInput());
    const result = safeParseAssignment(assignment);
    expect(result.success).toBe(true);
  });

  it('validates a complete lead assignment', () => {
    const assignment = createLeadAssignment(leadInput());
    const result = safeParseAssignment(assignment);
    expect(result.success).toBe(true);
  });

  it('rejects invalid schema version', () => {
    const result = AssignmentFrontmatterSchema.safeParse({
      schema: 'sisu.assignment.v99',
      role: 'builder',
      taskId: 'x',
      title: 'x',
      parentAgent: 'x',
      rootTaskId: 'x',
      repoId: 'x',
      repoPath: '/tmp',
      worktreePath: '/tmp',
      branch: 'main',
      baseBranch: 'main',
      instructionMode: 'inline',
      priority: 'normal',
      riskLevel: 'low',
      status: 'assigned',
      createdAt: new Date().toISOString(),
    });
    expect(result.success).toBe(false);
  });

  it('rejects non-absolute repoPath', () => {
    const result = AssignmentFrontmatterSchema.safeParse({
      schema: 'sisu.assignment.v1',
      role: 'builder',
      taskId: 'x',
      title: 'x',
      parentAgent: 'x',
      rootTaskId: 'x',
      repoId: 'x',
      repoPath: 'relative/path',
      worktreePath: '/tmp',
      branch: 'main',
      baseBranch: 'main',
      instructionMode: 'inline',
      priority: 'normal',
      riskLevel: 'low',
      status: 'assigned',
      createdAt: new Date().toISOString(),
    });
    expect(result.success).toBe(false);
  });

  it('rejects non-absolute worktreePath', () => {
    const result = AssignmentFrontmatterSchema.safeParse({
      schema: 'sisu.assignment.v1',
      role: 'builder',
      taskId: 'x',
      title: 'x',
      parentAgent: 'x',
      rootTaskId: 'x',
      repoId: 'x',
      repoPath: '/tmp',
      worktreePath: 'not/absolute',
      branch: 'main',
      baseBranch: 'main',
      instructionMode: 'inline',
      priority: 'normal',
      riskLevel: 'low',
      status: 'assigned',
      createdAt: new Date().toISOString(),
    });
    expect(result.success).toBe(false);
  });

  it('accepts Windows absolute paths', () => {
    const result = AssignmentFrontmatterSchema.safeParse({
      schema: 'sisu.assignment.v1',
      role: 'builder',
      taskId: 'x',
      title: 'x',
      parentAgent: 'x',
      rootTaskId: 'x',
      repoId: 'x',
      repoPath: 'C:\\Users\\jarip\\Projects\\mc',
      worktreePath: 'D:\\worktrees\\auth',
      branch: 'main',
      baseBranch: 'main',
      instructionMode: 'inline',
      priority: 'normal',
      riskLevel: 'low',
      status: 'assigned',
      createdAt: new Date().toISOString(),
    });
    expect(result.success).toBe(true);
  });

  it('rejects invalid role', () => {
    const result = AssignmentRoleSchema.safeParse('supervisor');
    expect(result.success).toBe(false);
  });

  it('accepts all canonical roles', () => {
    const roles = [
      'orchestrator',
      'coordinator',
      'lead',
      'builder',
      'reviewer',
      'scout',
      'monitor',
      'merger',
    ];
    for (const role of roles) {
      expect(AssignmentRoleSchema.safeParse(role).success).toBe(true);
    }
  });

  it('validates fileScope with allowed list', () => {
    const result = FileScopeSchema.safeParse({
      allowed: ['src/**'],
    });
    expect(result.success).toBe(true);
  });

  it('rejects fileScope with empty allowed list', () => {
    const result = FileScopeSchema.safeParse({
      allowed: [],
    });
    expect(result.success).toBe(false);
  });
});

// ============================================================================
// Builder assignment tests
// ============================================================================

describe('createBuilderAssignment', () => {
  it('creates a valid builder assignment', () => {
    const assignment = createBuilderAssignment(builderInput());
    expect(assignment.frontmatter.schema).toBe('sisu.assignment.v1');
    expect(assignment.frontmatter.role).toBe('builder');
    expect(assignment.frontmatter.status).toBe('assigned');
    expect(assignment.body.fileScope).toBeDefined();
    expect(assignment.body.fileScope!.allowed).toContain('src/auth/**');
  });

  it('throws if fileScope is missing', () => {
    expect(() =>
      createBuilderAssignment(
        builderInput({ fileScope: undefined as unknown as BuilderAssignmentInput['fileScope'] }),
      ),
    ).toThrow('fileScope.allowed allowlist');
  });

  it('throws if fileScope.allowed is empty', () => {
    expect(() =>
      createBuilderAssignment(builderInput({ fileScope: { allowed: [] } })),
    ).toThrow('fileScope.allowed allowlist');
  });

  it('includes optional fields when provided', () => {
    const assignment = createBuilderAssignment(
      builderInput({
        architecture: 'Event-driven with TanStack Query',
        ui: 'Follow DESIGN-SYSTEM.md',
      }),
    );
    expect(assignment.body.architecture).toBe('Event-driven with TanStack Query');
    expect(assignment.body.ui).toBe('Follow DESIGN-SYSTEM.md');
  });

  it('applies default priority and riskLevel', () => {
    const assignment = createBuilderAssignment(
      builderInput({ priority: undefined, riskLevel: undefined }),
    );
    expect(assignment.frontmatter.priority).toBe('normal');
    expect(assignment.frontmatter.riskLevel).toBe('medium');
  });

  it('respects explicit priority and riskLevel', () => {
    const assignment = createBuilderAssignment(
      builderInput({ priority: 'urgent', riskLevel: 'critical' }),
    );
    expect(assignment.frontmatter.priority).toBe('urgent');
    expect(assignment.frontmatter.riskLevel).toBe('critical');
  });

  it('sets createdAt as ISO datetime', () => {
    const assignment = createBuilderAssignment(builderInput());
    expect(() => new Date(assignment.frontmatter.createdAt)).not.toThrow();
    expect(assignment.frontmatter.createdAt).toMatch(/\d{4}-\d{2}-\d{2}T/);
  });
});

// ============================================================================
// Reviewer assignment tests
// ============================================================================

describe('createReviewerAssignment', () => {
  it('creates a valid reviewer assignment', () => {
    const assignment = createReviewerAssignment(reviewerInput());
    expect(assignment.frontmatter.role).toBe('reviewer');
    expect(assignment.reviewTarget).toBeDefined();
    expect(assignment.reviewTarget!.branch).toBe('feature/auth');
  });

  it('does not include fileScope (read-only)', () => {
    const assignment = createReviewerAssignment(reviewerInput());
    expect(assignment.body.fileScope).toBeUndefined();
  });

  it('throws if reviewTarget is missing', () => {
    expect(() =>
      createReviewerAssignment(
        reviewerInput({
          reviewTarget: undefined as unknown as ReviewerAssignmentInput['reviewTarget'],
        }),
      ),
    ).toThrow('reviewTarget');
  });

  it('includes prUrl when provided', () => {
    const assignment = createReviewerAssignment(reviewerInput());
    expect(assignment.reviewTarget!.prUrl).toBe(
      'https://github.com/JPimia/mission-control/pull/42',
    );
  });
});

// ============================================================================
// Lead assignment tests
// ============================================================================

describe('createLeadAssignment', () => {
  it('creates a valid lead assignment', () => {
    const assignment = createLeadAssignment(leadInput());
    expect(assignment.frontmatter.role).toBe('lead');
    expect(assignment.coordination).toBeDefined();
    expect(assignment.coordination!.teamSize).toBe(3);
  });

  it('throws if coordination is missing', () => {
    expect(() =>
      createLeadAssignment(
        leadInput({
          coordination: undefined as unknown as LeadAssignmentInput['coordination'],
        }),
      ),
    ).toThrow('coordination');
  });

  it('includes decompositionStrategy when provided', () => {
    const assignment = createLeadAssignment(leadInput());
    expect(assignment.coordination!.decompositionStrategy).toBe(
      'Parallel streams with shared interface contract',
    );
  });
});

// ============================================================================
// Enforcement tests
// ============================================================================

describe('enforceAssignment', () => {
  it('passes a valid builder assignment', () => {
    const assignment = createBuilderAssignment(builderInput());
    expect(() => enforceAssignment(assignment)).not.toThrow();
  });

  it('passes a valid reviewer assignment', () => {
    const assignment = createReviewerAssignment(reviewerInput());
    expect(() => enforceAssignment(assignment)).not.toThrow();
  });

  it('passes a valid lead assignment', () => {
    const assignment = createLeadAssignment(leadInput());
    expect(() => enforceAssignment(assignment)).not.toThrow();
  });

  it('rejects builder without fileScope', () => {
    const assignment = createBuilderAssignment(builderInput());
    // Manually strip fileScope to test enforcement
    (assignment.body as Record<string, unknown>).fileScope = undefined;
    expect(() => enforceAssignment(assignment)).toThrow(AssignmentEnforcementError);
  });

  it('rejects builder with empty fileScope.allowed', () => {
    const assignment = createBuilderAssignment(builderInput());
    assignment.body.fileScope = { allowed: [] };
    expect(() => enforceAssignment(assignment)).toThrow(AssignmentEnforcementError);
  });

  it('rejects reviewer with fileScope (must be read-only)', () => {
    const assignment = createReviewerAssignment(reviewerInput());
    // Manually inject fileScope to test enforcement
    (assignment.body as Record<string, unknown>).fileScope = {
      allowed: ['src/**'],
    };
    expect(() => enforceAssignment(assignment)).toThrow(AssignmentEnforcementError);
    const violations = checkAssignment(assignment);
    expect(violations.some((v) => v.includes('read-only'))).toBe(true);
  });

  it('rejects reviewer without reviewTarget', () => {
    const assignment = createReviewerAssignment(reviewerInput());
    (assignment as Record<string, unknown>).reviewTarget = undefined;
    expect(() => enforceAssignment(assignment)).toThrow(AssignmentEnforcementError);
  });

  it('rejects lead without coordination', () => {
    const assignment = createLeadAssignment(leadInput());
    (assignment as Record<string, unknown>).coordination = undefined;
    expect(() => enforceAssignment(assignment)).toThrow(AssignmentEnforcementError);
  });

  it('rejects relative repoPath at enforcement level', () => {
    const assignment = createBuilderAssignment(builderInput());
    // Force a relative path past Zod (test enforcement separately)
    (assignment.frontmatter as Record<string, unknown>).repoPath = 'relative/path';
    expect(() => enforceAssignment(assignment)).toThrow(AssignmentEnforcementError);
  });

  it('checkAssignment returns violations without throwing', () => {
    const assignment = createBuilderAssignment(builderInput());
    (assignment.body as Record<string, unknown>).fileScope = undefined;
    const violations = checkAssignment(assignment);
    expect(violations.length).toBeGreaterThan(0);
    expect(violations[0]).toContain('fileScope');
  });
});

// ============================================================================
// Supervisor alias tests
// ============================================================================

describe('resolveRole', () => {
  it('resolves supervisor to lead', () => {
    expect(resolveRole('supervisor')).toBe('lead');
  });

  it('returns canonical roles unchanged', () => {
    expect(resolveRole('builder')).toBe('builder');
    expect(resolveRole('reviewer')).toBe('reviewer');
    expect(resolveRole('lead')).toBe('lead');
    expect(resolveRole('coordinator')).toBe('coordinator');
    expect(resolveRole('orchestrator')).toBe('orchestrator');
    expect(resolveRole('scout')).toBe('scout');
    expect(resolveRole('monitor')).toBe('monitor');
    expect(resolveRole('merger')).toBe('merger');
  });

  it('isRoleAlias returns true for supervisor', () => {
    expect(isRoleAlias('supervisor')).toBe(true);
  });

  it('isRoleAlias returns false for canonical roles', () => {
    expect(isRoleAlias('builder')).toBe(false);
    expect(isRoleAlias('lead')).toBe(false);
  });
});

// ============================================================================
// Co-creation profile tests
// ============================================================================

describe('isProfile', () => {
  it('recognizes co-creation as a profile', () => {
    expect(isProfile('co-creation')).toBe(true);
  });

  it('recognizes ov-co-creation as a profile (strips ov- prefix)', () => {
    expect(isProfile('ov-co-creation')).toBe(true);
  });

  it('recognizes standard as a profile', () => {
    expect(isProfile('standard')).toBe(true);
  });

  it('does not recognize roles as profiles', () => {
    expect(isProfile('builder')).toBe(false);
    expect(isProfile('coordinator')).toBe(false);
    expect(isProfile('orchestrator')).toBe(false);
  });

  it('does not recognize ov-co-creation as a role', () => {
    const result = AssignmentRoleSchema.safeParse('ov-co-creation');
    expect(result.success).toBe(false);
  });
});

// ============================================================================
// Writer / Markdown serialization tests
// ============================================================================

describe('assignmentToMarkdown', () => {
  it('produces valid YAML frontmatter delimiters', () => {
    const md = assignmentToMarkdown(createBuilderAssignment(builderInput()));
    expect(md.startsWith('---\n')).toBe(true);
    const secondDash = md.indexOf('---', 4);
    expect(secondDash).toBeGreaterThan(0);
  });

  it('includes schema version in frontmatter', () => {
    const md = assignmentToMarkdown(createBuilderAssignment(builderInput()));
    expect(md).toContain('schema: sisu.assignment.v1');
  });

  it('includes role in frontmatter', () => {
    const md = assignmentToMarkdown(createBuilderAssignment(builderInput()));
    expect(md).toContain('role: builder');
  });

  it('includes title as H1', () => {
    const md = assignmentToMarkdown(createBuilderAssignment(builderInput()));
    expect(md).toContain('# Implement user auth');
  });

  it('includes objective section', () => {
    const md = assignmentToMarkdown(createBuilderAssignment(builderInput()));
    expect(md).toContain('## Objective');
    expect(md).toContain('JWT-based authentication');
  });

  it('includes success criteria as list', () => {
    const md = assignmentToMarkdown(createBuilderAssignment(builderInput()));
    expect(md).toContain('## Success Criteria');
    expect(md).toContain('- Login endpoint returns JWT + refresh token');
  });

  it('includes file scope section for builder', () => {
    const md = assignmentToMarkdown(createBuilderAssignment(builderInput()));
    expect(md).toContain('## File Scope');
    expect(md).toContain('**Allowed:**');
    expect(md).toContain('- src/auth/**');
    expect(md).toContain('**Forbidden:**');
    expect(md).toContain('- src/db/migrations/**');
  });

  it('does not include file scope for reviewer', () => {
    const md = assignmentToMarkdown(createReviewerAssignment(reviewerInput()));
    expect(md).not.toContain('## File Scope');
  });

  it('includes review target section for reviewer', () => {
    const md = assignmentToMarkdown(createReviewerAssignment(reviewerInput()));
    expect(md).toContain('## Review Target');
    expect(md).toContain('**Branch:** feature/auth');
    expect(md).toContain('**PR:** https://github.com/JPimia/mission-control/pull/42');
  });

  it('includes coordination section for lead', () => {
    const md = assignmentToMarkdown(createLeadAssignment(leadInput()));
    expect(md).toContain('## Coordination');
    expect(md).toContain('**Team size:** 3');
    expect(md).toContain('- JWT token generation');
  });

  it('includes validation section', () => {
    const md = assignmentToMarkdown(createBuilderAssignment(builderInput()));
    expect(md).toContain('## Validation');
    expect(md).toContain('**typecheck** (required): `npx tsc --noEmit`');
  });

  it('includes authority section', () => {
    const md = assignmentToMarkdown(createBuilderAssignment(builderInput()));
    expect(md).toContain('## Authority');
    expect(md).toContain('**Can do:**');
    expect(md).toContain('**Cannot do:**');
  });

  it('includes handoff section', () => {
    const md = assignmentToMarkdown(createBuilderAssignment(builderInput()));
    expect(md).toContain('## Handoff');
    expect(md).toContain('**On complete:** reviewer-1');
    expect(md).toContain('**On block:** lead-1');
  });

  it('ends with newline', () => {
    const md = assignmentToMarkdown(createBuilderAssignment(builderInput()));
    expect(md.endsWith('\n')).toBe(true);
  });
});

// ============================================================================
// File path tests
// ============================================================================

describe('assignmentFilePath', () => {
  it('returns .sisu/assignments/{taskId}.md', () => {
    expect(assignmentFilePath('wrk_01ABC')).toBe('.sisu/assignments/wrk_01ABC.md');
  });
});

describe('assignmentAbsolutePath', () => {
  it('joins repo root with assignment path', () => {
    expect(assignmentAbsolutePath('/home/jarip/Projects/mc', 'wrk_01ABC')).toBe(
      '/home/jarip/Projects/mc/.sisu/assignments/wrk_01ABC.md',
    );
  });

  it('handles trailing slash on repo root', () => {
    expect(assignmentAbsolutePath('/home/jarip/Projects/mc/', 'wrk_01ABC')).toBe(
      '/home/jarip/Projects/mc/.sisu/assignments/wrk_01ABC.md',
    );
  });
});

// ============================================================================
// Edge cases and integration
// ============================================================================

describe('full roundtrip', () => {
  it('builder: generate → enforce → serialize → contains all sections', () => {
    const input = builderInput();
    const assignment = createBuilderAssignment(input);
    enforceAssignment(assignment);
    const md = assignmentToMarkdown(assignment);

    expect(md).toContain('schema: sisu.assignment.v1');
    expect(md).toContain('role: builder');
    expect(md).toContain('## Objective');
    expect(md).toContain('## Success Criteria');
    expect(md).toContain('## File Scope');
    expect(md).toContain('## Validation');
    expect(md).toContain('## Authority');
    expect(md).toContain('## Handoff');
  });

  it('reviewer: generate → enforce → serialize → has review target, no file scope', () => {
    const assignment = createReviewerAssignment(reviewerInput());
    enforceAssignment(assignment);
    const md = assignmentToMarkdown(assignment);

    expect(md).toContain('role: reviewer');
    expect(md).toContain('## Review Target');
    expect(md).not.toContain('## File Scope');
  });

  it('lead: generate → enforce → serialize → has coordination', () => {
    const assignment = createLeadAssignment(leadInput());
    enforceAssignment(assignment);
    const md = assignmentToMarkdown(assignment);

    expect(md).toContain('role: lead');
    expect(md).toContain('## Coordination');
    expect(md).toContain('**Team size:** 3');
  });
});
