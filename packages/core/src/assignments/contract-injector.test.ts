/**
 * Tests for the contract injector — env var building and system prompt assembly.
 */
import { describe, expect, it } from 'vitest';
import type { Assignment } from '@sisu/protocol';
import { buildAgentEnv, assembleSystemPrompt } from './contract-injector.js';
import type { ContractInjectionInput } from './contract-injector.js';
import { createBuilderAssignment } from './generators.js';
import type { BuilderAssignmentInput } from './types.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeAssignment(): Assignment {
  const input: BuilderAssignmentInput = {
    taskId: 'wrk_01TEST000000000000001',
    title: 'Implement auth middleware',
    parentAgent: 'coordinator-1',
    rootTaskId: 'wrk_01TEST000000000000000',
    repoId: 'mission-control',
    repoPath: '/home/jarip/Projects/mc',
    worktreePath: '/home/jarip/Projects/mc/.wt/auth',
    branch: 'feature/auth',
    baseBranch: 'develop',
    objective: 'Build JWT auth middleware',
    successCriteria: ['Tests pass', 'Types clean'],
    fileScope: { allowed: ['src/auth/**'] },
    priority: 'high',
    riskLevel: 'medium',
  };
  return createBuilderAssignment(input);
}

function makeInput(overrides?: Partial<ContractInjectionInput>): ContractInjectionInput {
  return {
    apiUrl: 'http://localhost:4000/v1',
    runId: 'run_01TEST000000000000001',
    planId: 'plan_01TEST000000000000001',
    assignment: makeAssignment(),
    ...overrides,
  };
}

const MOCK_ROLE_PROMPT = '# Builder\n\nYou are a builder agent.';
const MOCK_CONTRACT = '# SISU Execution Contract\n\nThis is the contract.';

// ============================================================================
// buildAgentEnv
// ============================================================================

describe('buildAgentEnv', () => {
  it('returns all required environment variables', () => {
    const env = buildAgentEnv(makeInput());

    expect(env.SISU_API_URL).toBe('http://localhost:4000/v1');
    expect(env.SISU_RUN_ID).toBe('run_01TEST000000000000001');
    expect(env.SISU_TASK_ID).toBe('wrk_01TEST000000000000001');
    expect(env.SISU_PLAN_ID).toBe('plan_01TEST000000000000001');
    expect(env.SISU_PARENT_AGENT).toBe('coordinator-1');
    expect(env.SISU_ROLE).toBe('builder');
    expect(env.SISU_REPO_PATH).toBe('/home/jarip/Projects/mc');
    expect(env.SISU_WORKTREE_PATH).toBe('/home/jarip/Projects/mc/.wt/auth');
    expect(env.SISU_BRANCH).toBe('feature/auth');
    expect(env.SISU_BASE_BRANCH).toBe('develop');
  });

  it('all values are strings', () => {
    const env = buildAgentEnv(makeInput());
    for (const [, val] of Object.entries(env)) {
      expect(typeof val).toBe('string');
    }
  });

  it('uses assignment frontmatter values', () => {
    const input = makeInput();
    // Verify it reads from the assignment, not hardcoded
    input.assignment.frontmatter.branch = 'hotfix/urgent';
    const env = buildAgentEnv(input);
    expect(env.SISU_BRANCH).toBe('hotfix/urgent');
  });
});

// ============================================================================
// assembleSystemPrompt
// ============================================================================

describe('assembleSystemPrompt', () => {
  it('includes the role prompt', () => {
    const prompt = assembleSystemPrompt({
      rolePrompt: MOCK_ROLE_PROMPT,
      executionContract: MOCK_CONTRACT,
      assignment: makeAssignment(),
    });
    expect(prompt).toContain('# Builder');
    expect(prompt).toContain('You are a builder agent.');
  });

  it('includes the execution contract', () => {
    const prompt = assembleSystemPrompt({
      rolePrompt: MOCK_ROLE_PROMPT,
      executionContract: MOCK_CONTRACT,
      assignment: makeAssignment(),
    });
    expect(prompt).toContain('# SISU Execution Contract');
    expect(prompt).toContain('This is the contract.');
  });

  it('includes assignment pointer with task details', () => {
    const prompt = assembleSystemPrompt({
      rolePrompt: MOCK_ROLE_PROMPT,
      executionContract: MOCK_CONTRACT,
      assignment: makeAssignment(),
    });
    expect(prompt).toContain('.sisu/assignments/wrk_01TEST000000000000001.md');
    expect(prompt).toContain('Implement auth middleware');
    expect(prompt).toContain('feature/auth');
    expect(prompt).toContain('develop');
    expect(prompt).toContain('high');
    expect(prompt).toContain('medium');
  });

  it('separates sections with horizontal rules', () => {
    const prompt = assembleSystemPrompt({
      rolePrompt: MOCK_ROLE_PROMPT,
      executionContract: MOCK_CONTRACT,
      assignment: makeAssignment(),
    });
    // Three sections = two separators
    const separators = prompt.split('---').length - 1;
    expect(separators).toBeGreaterThanOrEqual(2);
  });

  it('role prompt comes first', () => {
    const prompt = assembleSystemPrompt({
      rolePrompt: MOCK_ROLE_PROMPT,
      executionContract: MOCK_CONTRACT,
      assignment: makeAssignment(),
    });
    const roleIdx = prompt.indexOf('# Builder');
    const contractIdx = prompt.indexOf('# SISU Execution Contract');
    const assignmentIdx = prompt.indexOf('# Your Assignment');
    expect(roleIdx).toBeLessThan(contractIdx);
    expect(contractIdx).toBeLessThan(assignmentIdx);
  });
});
