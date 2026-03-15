/**
 * Assignment generators for builder, reviewer, and lead roles.
 *
 * Each generator:
 * 1. Validates role-specific constraints (e.g. builder requires fileScope)
 * 2. Builds a typed Assignment object
 * 3. Validates via Zod schema
 *
 * The supervisor role is a deprecated alias for lead — handled via resolveRole().
 */
import {
  type Assignment,
  type AssignmentBody,
  type AssignmentFrontmatter,
  type AssignmentRole,
  parseAssignment,
} from '@sisu/protocol';
import type {
  BuilderAssignmentInput,
  LeadAssignmentInput,
  ReviewerAssignmentInput,
} from './types.js';

// ---------------------------------------------------------------------------
// Role alias resolution
// ---------------------------------------------------------------------------

/**
 * Resolves deprecated role aliases to their canonical role.
 * supervisor → lead (deprecated alias, maintained for compatibility).
 */
export function resolveRole(role: string): AssignmentRole {
  if (role === 'supervisor') return 'lead';
  return role as AssignmentRole;
}

/**
 * Returns true if the given string is a known role alias (not a canonical role).
 */
export function isRoleAlias(role: string): boolean {
  return role === 'supervisor';
}

// ---------------------------------------------------------------------------
// Profile classification
// ---------------------------------------------------------------------------

/** Known profiles — co-creation is a profile/mode, not a role. */
const KNOWN_PROFILES = ['standard', 'co-creation'] as const;

/**
 * Returns true if the given string is a known profile name.
 * co-creation (a.k.a. ov-co-creation) is a profile, not a role.
 */
export function isProfile(name: string): boolean {
  const normalized = name.replace(/^ov-/, '').replace(/_/g, '-');
  return (KNOWN_PROFILES as readonly string[]).includes(normalized);
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function buildFrontmatter(
  role: AssignmentRole,
  input: {
    taskId: string;
    title: string;
    parentAgent: string;
    rootTaskId: string;
    repoId: string;
    repoPath: string;
    worktreePath: string;
    branch: string;
    baseBranch: string;
    priority?: string;
    riskLevel?: string;
    instructionMode?: string;
    runtime?: { profile?: string };
  },
): AssignmentFrontmatter {
  return {
    schema: 'sisu.assignment.v1',
    role,
    taskId: input.taskId,
    title: input.title,
    parentAgent: input.parentAgent,
    rootTaskId: input.rootTaskId,
    repoId: input.repoId,
    repoPath: input.repoPath,
    worktreePath: input.worktreePath,
    branch: input.branch,
    baseBranch: input.baseBranch,
    instructionMode: (input.instructionMode ?? 'inline') as 'spec' | 'inline' | 'external',
    priority: (input.priority ?? 'normal') as 'low' | 'normal' | 'high' | 'urgent',
    riskLevel: (input.riskLevel ?? 'medium') as 'low' | 'medium' | 'high' | 'critical',
    status: 'assigned',
    createdAt: new Date().toISOString(),
    ...(input.runtime?.profile ? { profile: input.runtime.profile as 'standard' | 'co-creation' } : {}),
  };
}

function buildBody(input: {
  objective: string;
  successCriteria: string[];
  fileScope?: { allowed: string[]; forbidden?: string[] };
  references?: Array<{ label: string; path: string }>;
  validation?: Array<{ name: string; command: string; required: boolean }>;
  authority?: { canDo: string[]; cannotDo: string[] };
  architecture?: string;
  ui?: string;
  handoff?: { onComplete: string; onBlock: string; onFailure: string };
  runtime?: {
    model?: string;
    modelTier?: 'strategic' | 'execution' | 'review' | 'observation';
    timeout?: number;
    maxTokens?: number;
    profile?: string;
  };
}): AssignmentBody {
  const body: AssignmentBody = {
    objective: input.objective,
    successCriteria: input.successCriteria,
  };
  if (input.fileScope) body.fileScope = input.fileScope;
  if (input.references?.length) body.references = input.references;
  if (input.validation?.length) body.validation = input.validation;
  if (input.authority) body.authority = input.authority;
  if (input.architecture) body.architecture = input.architecture;
  if (input.ui) body.ui = input.ui;
  if (input.handoff) body.handoff = input.handoff;
  if (input.runtime) {
    const { profile, ...rest } = input.runtime;
    const hasRuntime = Object.values(rest).some((v) => v !== undefined);
    if (hasRuntime) {
      body.runtime = {
        ...(rest.model ? { model: rest.model } : {}),
        ...(rest.modelTier ? { modelTier: rest.modelTier } : {}),
        ...(rest.timeout ? { timeout: rest.timeout } : {}),
        ...(rest.maxTokens ? { maxTokens: rest.maxTokens } : {}),
        ...(profile ? { profile: profile as 'standard' | 'co-creation' } : {}),
      };
    }
  }
  return body;
}

// ---------------------------------------------------------------------------
// Builder assignment
// ---------------------------------------------------------------------------

/**
 * Create a validated assignment for a builder agent.
 *
 * Builders MUST have an explicit fileScope allowlist.
 * Throws if fileScope.allowed is empty.
 */
export function createBuilderAssignment(input: BuilderAssignmentInput): Assignment {
  if (!input.fileScope || input.fileScope.allowed.length === 0) {
    throw new Error('Builder assignments require a non-empty fileScope.allowed allowlist');
  }

  const assignment: Assignment = {
    frontmatter: buildFrontmatter('builder', input),
    body: buildBody(input),
  };

  // Validate through Zod — throws on invalid data
  return parseAssignment(assignment);
}

// ---------------------------------------------------------------------------
// Reviewer assignment
// ---------------------------------------------------------------------------

/**
 * Create a validated assignment for a reviewer agent.
 *
 * Reviewers are runtime-enforced read-only (no fileScope.allowed write paths).
 * reviewTarget is required.
 */
export function createReviewerAssignment(input: ReviewerAssignmentInput): Assignment {
  if (!input.reviewTarget) {
    throw new Error('Reviewer assignments require a reviewTarget');
  }

  const assignment: Assignment = {
    frontmatter: buildFrontmatter('reviewer', input),
    body: buildBody({
      ...input,
      // Reviewers never get write file scope
      fileScope: undefined,
    }),
    reviewTarget: input.reviewTarget,
  };

  return parseAssignment(assignment);
}

// ---------------------------------------------------------------------------
// Lead assignment
// ---------------------------------------------------------------------------

/**
 * Create a validated assignment for a lead agent.
 *
 * Leads coordinate sub-tasks. coordination is required.
 * supervisor is a deprecated alias → automatically resolved to lead.
 */
export function createLeadAssignment(input: LeadAssignmentInput): Assignment {
  if (!input.coordination) {
    throw new Error('Lead assignments require a coordination block');
  }

  const assignment: Assignment = {
    frontmatter: buildFrontmatter('lead', input),
    body: buildBody(input),
    coordination: input.coordination,
  };

  return parseAssignment(assignment);
}
