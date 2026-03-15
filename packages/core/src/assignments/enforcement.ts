/**
 * Runtime enforcement rules for SISU assignments.
 *
 * Key invariants:
 * - Builders MUST have a non-empty fileScope.allowed allowlist
 * - Reviewers MUST be read-only (no write file scope)
 * - All repo/worktree/spec/instruction paths must be absolute
 * - Required frontmatter fields must be present
 */
import type { Assignment } from '@sisu/protocol';

// ---------------------------------------------------------------------------
// Error types
// ---------------------------------------------------------------------------

export class AssignmentEnforcementError extends Error {
  public readonly violations: string[];

  constructor(violations: string[]) {
    super(`Assignment enforcement failed:\n${violations.map((v) => `  - ${v}`).join('\n')}`);
    this.name = 'AssignmentEnforcementError';
    this.violations = violations;
  }
}

// ---------------------------------------------------------------------------
// Path validation
// ---------------------------------------------------------------------------

function isAbsolutePath(p: string): boolean {
  return p.startsWith('/') || /^[A-Z]:\\/i.test(p);
}

// ---------------------------------------------------------------------------
// Per-role enforcement
// ---------------------------------------------------------------------------

function enforceBuilder(assignment: Assignment): string[] {
  const violations: string[] = [];

  if (!assignment.body.fileScope) {
    violations.push('Builder: fileScope is required');
  } else if (assignment.body.fileScope.allowed.length === 0) {
    violations.push('Builder: fileScope.allowed must have at least one entry');
  }

  return violations;
}

function enforceReviewer(assignment: Assignment): string[] {
  const violations: string[] = [];

  // Reviewers must NOT have write file scope
  if (assignment.body.fileScope) {
    violations.push('Reviewer: must not have fileScope (read-only enforced)');
  }

  // Reviewers must have a reviewTarget
  if (!assignment.reviewTarget) {
    violations.push('Reviewer: reviewTarget is required');
  }

  return violations;
}

function enforceLead(assignment: Assignment): string[] {
  const violations: string[] = [];

  if (!assignment.coordination) {
    violations.push('Lead: coordination block is required');
  }

  return violations;
}

// ---------------------------------------------------------------------------
// Shared enforcement
// ---------------------------------------------------------------------------

function enforceCommon(assignment: Assignment): string[] {
  const violations: string[] = [];
  const fm = assignment.frontmatter;

  // Schema version
  if (fm.schema !== 'sisu.assignment.v1') {
    violations.push(`Invalid schema: expected "sisu.assignment.v1", got "${fm.schema}"`);
  }

  // Absolute path checks
  if (!isAbsolutePath(fm.repoPath)) {
    violations.push(`repoPath must be absolute: "${fm.repoPath}"`);
  }
  if (!isAbsolutePath(fm.worktreePath)) {
    violations.push(`worktreePath must be absolute: "${fm.worktreePath}"`);
  }

  // Required string fields
  const requiredStrings = [
    'taskId',
    'title',
    'parentAgent',
    'rootTaskId',
    'repoId',
    'branch',
    'baseBranch',
  ] as const;
  for (const field of requiredStrings) {
    const val = fm[field];
    if (typeof val !== 'string' || val.length === 0) {
      violations.push(`frontmatter.${String(field)} is required and must be non-empty`);
    }
  }

  // Body required fields
  if (!assignment.body.objective || assignment.body.objective.length === 0) {
    violations.push('body.objective is required');
  }
  if (!assignment.body.successCriteria || assignment.body.successCriteria.length === 0) {
    violations.push('body.successCriteria must have at least one entry');
  }

  return violations;
}

// ---------------------------------------------------------------------------
// Role-specific enforcement dispatch
// ---------------------------------------------------------------------------

const ROLE_ENFORCERS: Record<string, (a: Assignment) => string[]> = {
  builder: enforceBuilder,
  reviewer: enforceReviewer,
  lead: enforceLead,
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Enforce all runtime constraints on a validated assignment.
 *
 * Throws AssignmentEnforcementError if any violations are found.
 * Returns the assignment unchanged if all constraints pass.
 */
export function enforceAssignment(assignment: Assignment): Assignment {
  const violations: string[] = [];

  violations.push(...enforceCommon(assignment));

  const roleEnforcer = ROLE_ENFORCERS[assignment.frontmatter.role];
  if (roleEnforcer) {
    violations.push(...roleEnforcer(assignment));
  }

  if (violations.length > 0) {
    throw new AssignmentEnforcementError(violations);
  }

  return assignment;
}

/**
 * Check enforcement without throwing. Returns violations array (empty = valid).
 */
export function checkAssignment(assignment: Assignment): string[] {
  const violations: string[] = [];
  violations.push(...enforceCommon(assignment));

  const roleEnforcer = ROLE_ENFORCERS[assignment.frontmatter.role];
  if (roleEnforcer) {
    violations.push(...roleEnforcer(assignment));
  }

  return violations;
}
