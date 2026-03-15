/**
 * Contract injector — prepares the environment variables and system prompt
 * that wire a spawned agent into the SISU execution contract.
 *
 * This is the bridge between:
 * - Assignment overlays (what to do)
 * - Execution contract (how to communicate)
 * - Runtime adapter (how to spawn)
 */
import type { Assignment } from '@sisu/protocol';

// ---------------------------------------------------------------------------
// Environment injection
// ---------------------------------------------------------------------------

export interface SisuAgentEnv {
  SISU_API_URL: string;
  SISU_RUN_ID: string;
  SISU_TASK_ID: string;
  SISU_PLAN_ID: string;
  SISU_PARENT_AGENT: string;
  SISU_ROLE: string;
  SISU_REPO_PATH: string;
  SISU_WORKTREE_PATH: string;
  SISU_BRANCH: string;
  SISU_BASE_BRANCH: string;
}

export interface ContractInjectionInput {
  apiUrl: string;
  runId: string;
  planId: string;
  assignment: Assignment;
}

/**
 * Build the environment variables that every SISU agent receives at spawn.
 */
export function buildAgentEnv(input: ContractInjectionInput): SisuAgentEnv {
  const fm = input.assignment.frontmatter;
  return {
    SISU_API_URL: input.apiUrl,
    SISU_RUN_ID: input.runId,
    SISU_TASK_ID: fm.taskId,
    SISU_PLAN_ID: input.planId,
    SISU_PARENT_AGENT: fm.parentAgent,
    SISU_ROLE: fm.role,
    SISU_REPO_PATH: fm.repoPath,
    SISU_WORKTREE_PATH: fm.worktreePath,
    SISU_BRANCH: fm.branch,
    SISU_BASE_BRANCH: fm.baseBranch,
  };
}

// ---------------------------------------------------------------------------
// System prompt assembly
// ---------------------------------------------------------------------------

/**
 * Assemble the full system prompt for a spawned agent:
 * 1. Role prompt (from templates-default/roles/{role}.md)
 * 2. Execution contract (from templates-default/execution-contract.md)
 * 3. Assignment reference
 *
 * The role prompt and execution contract are provided as strings —
 * loading them from disk is the caller's responsibility (keeps this pure).
 */
export function assembleSystemPrompt(opts: {
  rolePrompt: string;
  executionContract: string;
  assignment: Assignment;
}): string {
  const fm = opts.assignment.frontmatter;
  const sections: string[] = [];

  // Role identity
  sections.push(opts.rolePrompt);

  // Execution contract
  sections.push(opts.executionContract);

  // Assignment pointer
  sections.push(
    [
      '# Your Assignment',
      '',
      `Your assignment file is at: \`.sisu/assignments/${fm.taskId}.md\``,
      'Read it now. It contains your objective, success criteria, file scope,',
      'validation commands, authority boundaries, and handoff targets.',
      '',
      `- **Task:** ${fm.title}`,
      `- **Role:** ${fm.role}`,
      `- **Branch:** ${fm.branch} (base: ${fm.baseBranch})`,
      `- **Priority:** ${fm.priority}`,
      `- **Risk:** ${fm.riskLevel}`,
    ].join('\n'),
  );

  return sections.join('\n\n---\n\n');
}
