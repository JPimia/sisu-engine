/**
 * @sisu/templates-default
 *
 * Built-in role definitions and workflow templates shipped with SISU.
 * These are the canonical defaults. Custom roles and workflows can be
 * registered at runtime via the role/workflow registry.
 */

// ---------------------------------------------------------------------------
// Local type mirrors — kept in sync with @sisu/protocol RoleDefinition
// and WorkflowTemplate. Not imported from protocol to keep this package
// a leaf with zero runtime dependencies.
// ---------------------------------------------------------------------------

export type ModelTier = 'strategic' | 'execution' | 'review' | 'observation';
export type AccessLevel = 'read' | 'write' | 'admin';

export interface RoleDefinition {
  id: string;
  name: string;
  description: string;
  modelPreference?: string | undefined;
  modelTier: ModelTier;
  /** Role IDs that this role is allowed to spawn */
  canSpawn: string[];
  /** Named access grants (e.g. { code: 'write', tasks: 'read' }) */
  access: Record<string, AccessLevel>;
  /** Maximum concurrent instances. -1 = unlimited. */
  maxConcurrency: number;
}

export type WorkItemStatus =
  | 'queued'
  | 'ready'
  | 'planning'
  | 'in_progress'
  | 'in_review'
  | 'blocked'
  | 'done'
  | 'failed'
  | 'cancelled';

export interface WorkflowStep {
  id: string;
  role: string;
  description?: string | undefined;
  /** Step IDs that must complete before this step starts */
  dependencies: string[];
  modelOverride?: string | undefined;
  modelTierOverride?: ModelTier | undefined;
  config: Record<string, unknown>;
}

export interface WorkflowTemplate {
  id: string;
  name: string;
  description?: string | undefined;
  version: string;
  steps: WorkflowStep[];
  /** Work item statuses this workflow applies to */
  appliesTo: WorkItemStatus[];
  requiredCapabilities: string[];
}

// ---------------------------------------------------------------------------
// Built-in role definitions
// ---------------------------------------------------------------------------

export const BUILT_IN_ROLES: readonly RoleDefinition[] = [
  {
    id: 'orchestrator',
    name: 'Orchestrator',
    description:
      'Always-on strategic overseer. Monitors the entire swarm, escalates blockers, ' +
      'ensures liveness and coherence across all active work items. ' +
      'The orchestrator is the top-level brain — it does not execute work directly ' +
      'but maintains awareness and intervenes when the system is unhealthy.',
    modelPreference: 'openai/gpt-5.4',
    modelTier: 'strategic',
    canSpawn: ['coordinator', 'supervisor', 'monitor'],
    access: {
      tasks: 'admin',
      code: 'read',
      mail: 'admin',
      leases: 'admin',
    },
    maxConcurrency: 1,
  },
  {
    id: 'coordinator',
    name: 'Coordinator',
    description:
      'Dispatch brain. Receives work items, reasons about the right workflow template, ' +
      'decomposes complex tasks, assigns leads or direct builders, and manages priority. ' +
      'The coordinator makes dispatch decisions — not code-based routing, ' +
      'but genuine LLM reasoning about the best path forward.',
    modelPreference: 'anthropic/claude-opus-4-6',
    modelTier: 'strategic',
    canSpawn: ['supervisor', 'lead', 'scout', 'builder', 'reviewer', 'merger', 'monitor'],
    access: {
      tasks: 'write',
      code: 'read',
      mail: 'write',
      leases: 'read',
    },
    maxConcurrency: 1,
  },
  {
    id: 'supervisor',
    name: 'Supervisor',
    description:
      'Oversight layer between coordinator and execution roles. Monitors progress of a ' +
      'stream of related tasks, handles escalations from leads, validates intermediate ' +
      'results, and intervenes when execution stalls. ' +
      'Uses Sonnet for routine oversight, Opus when escalation demands deep reasoning.',
    modelPreference: 'openai/gpt-5.4',
    modelTier: 'strategic',
    canSpawn: ['lead', 'scout', 'builder', 'reviewer', 'merger', 'monitor'],
    access: {
      tasks: 'write',
      code: 'read',
      mail: 'write',
      leases: 'read',
    },
    maxConcurrency: -1,
  },
  {
    id: 'lead',
    name: 'Lead',
    description:
      'Task decomposition specialist. Receives a feature or complex task, reasons about ' +
      'sub-task breakdown, assigns builders and reviewers, tracks progress, and consolidates ' +
      'results. The lead thinks about HOW to do the work — decomposition, dependencies, ' +
      'sequencing — not the execution itself.',
    modelPreference: 'openai/gpt-5.4',
    modelTier: 'strategic',
    canSpawn: ['scout', 'builder', 'reviewer', 'merger'],
    access: {
      tasks: 'write',
      code: 'read',
      mail: 'write',
    },
    maxConcurrency: -1,
  },
  {
    id: 'scout',
    name: 'Scout',
    description:
      'Research and analysis specialist. Reads code, docs, and context. ' +
      'Produces structured findings: current state, risks, recommendations, ' +
      'relevant file paths, open questions. ' +
      'The scout provides the builder and lead with the context they need to act effectively. ' +
      'Cannot write code or modify files.',
    modelPreference: 'openai/gpt-5.4',
    modelTier: 'review',
    canSpawn: [],
    access: {
      code: 'read',
      mail: 'write',
    },
    maxConcurrency: -1,
  },
  {
    id: 'builder',
    name: 'Builder',
    description:
      'Code implementation specialist. Executes through a real coding agent session ' +
      '(Claude Code, Codex, or equivalent). Writes code, runs tests, fixes failures, ' +
      'and commits working software. ' +
      'The builder does not plan — it executes against a scoped spec with clear file ownership. ' +
      'Every builder is a real LLM-powered coding session, not a script.',
    modelPreference: 'openai/gpt-5.4',
    modelTier: 'execution',
    canSpawn: [],
    access: {
      code: 'write',
      mail: 'write',
    },
    maxConcurrency: -1,
  },
  {
    id: 'reviewer',
    name: 'Reviewer',
    description:
      'Quality and correctness evaluator. Reviews code, spec adherence, test coverage, ' +
      'and architectural soundness. Issues structured verdicts: pass, fail with blockers, ' +
      'or pass with warnings. ' +
      'The reviewer exercises genuine judgment — it can reject work, demand rework, ' +
      'and escalate unresolvable issues. Not a rubber stamp.',
    modelPreference: 'openai/gpt-5.4',
    modelTier: 'review',
    canSpawn: [],
    access: {
      code: 'read',
      mail: 'write',
    },
    maxConcurrency: -1,
  },
  {
    id: 'merger',
    name: 'Merger',
    description:
      'Merge conflict specialist. Resolves conflicts between parallel builder branches ' +
      'with full understanding of code semantics and intent. ' +
      'The merger reads both branches, understands the changes, and produces ' +
      'a coherent merged result — not a mechanical three-way merge, ' +
      'but a reasoned integration of parallel work.',
    modelPreference: 'openai/gpt-5.4',
    modelTier: 'execution',
    canSpawn: [],
    access: {
      code: 'write',
      mail: 'write',
    },
    maxConcurrency: -1,
  },
  {
    id: 'monitor',
    name: 'Monitor',
    description:
      'Always-on observer. Watches lease heartbeats, detects stalled agents, ' +
      'identifies anomalous patterns (repeated failures, cost spikes, timeout clusters), ' +
      'and sends escalation mail when thresholds are breached. ' +
      'Uses cheap models for continuous observation. Escalates to supervisor or orchestrator.',
    modelPreference: 'openai/gpt-5.4',
    modelTier: 'observation',
    canSpawn: [],
    access: {
      code: 'read',
      mail: 'write',
      leases: 'read',
    },
    maxConcurrency: 1,
  },
] as const;

// ---------------------------------------------------------------------------
// Built-in workflow templates
// ---------------------------------------------------------------------------

export const BUILT_IN_WORKFLOWS: readonly WorkflowTemplate[] = [
  {
    id: 'wf_simple_task',
    name: 'Simple Task',
    description: 'Single builder executes a scoped task directly. No review required.',
    version: '1.0.0',
    appliesTo: ['ready'],
    requiredCapabilities: [],
    steps: [
      {
        id: 'build',
        role: 'builder',
        description: 'Implement the task',
        dependencies: [],
        config: {},
      },
    ],
  },
  {
    id: 'wf_build_review',
    name: 'Build + Review',
    description: 'Builder implements, reviewer validates. Standard quality gate.',
    version: '1.0.0',
    appliesTo: ['ready', 'planning'],
    requiredCapabilities: [],
    steps: [
      {
        id: 'build',
        role: 'builder',
        description: 'Implement the task',
        dependencies: [],
        config: {},
      },
      {
        id: 'review',
        role: 'reviewer',
        description: 'Review the implementation for correctness, coverage, and spec adherence',
        dependencies: ['build'],
        config: {},
      },
    ],
  },
  {
    id: 'wf_scout_build_review',
    name: 'Scout + Build + Review',
    description:
      'Scout researches context first, then builder implements with full situational awareness, ' +
      'then reviewer validates.',
    version: '1.0.0',
    appliesTo: ['ready', 'planning'],
    requiredCapabilities: [],
    steps: [
      {
        id: 'scout',
        role: 'scout',
        description: 'Research the codebase: current state, relevant files, risks, open questions',
        dependencies: [],
        config: {},
      },
      {
        id: 'build',
        role: 'builder',
        description: 'Implement the task using scout findings as context',
        dependencies: ['scout'],
        config: {},
      },
      {
        id: 'review',
        role: 'reviewer',
        description: 'Review implementation against spec and scout findings',
        dependencies: ['build'],
        config: {},
      },
    ],
  },
  {
    id: 'wf_multi_stream_feature',
    name: 'Multi-Stream Feature',
    description:
      'Lead decomposes a feature into parallel builder streams. ' +
      'Each stream has its own reviewer. Merger integrates the results.',
    version: '1.0.0',
    appliesTo: ['planning'],
    requiredCapabilities: [],
    steps: [
      {
        id: 'plan',
        role: 'lead',
        description: 'Decompose feature into parallel work streams and assign file scopes',
        dependencies: [],
        config: {},
      },
      {
        id: 'build_a',
        role: 'builder',
        description: 'Implement stream A',
        dependencies: ['plan'],
        config: { stream: 'a' },
      },
      {
        id: 'build_b',
        role: 'builder',
        description: 'Implement stream B',
        dependencies: ['plan'],
        config: { stream: 'b' },
      },
      {
        id: 'review_a',
        role: 'reviewer',
        description: 'Review stream A implementation',
        dependencies: ['build_a'],
        config: { stream: 'a' },
      },
      {
        id: 'review_b',
        role: 'reviewer',
        description: 'Review stream B implementation',
        dependencies: ['build_b'],
        config: { stream: 'b' },
      },
      {
        id: 'merge',
        role: 'merger',
        description: 'Integrate reviewed streams into a coherent whole',
        dependencies: ['review_a', 'review_b'],
        config: {},
      },
    ],
  },
  {
    id: 'wf_rework_loop',
    name: 'Rework Loop',
    description:
      'Builder implements, reviewer evaluates. On review failure, builder reworks. ' +
      'Loop continues until review passes or escalation threshold is reached.',
    version: '1.0.0',
    appliesTo: ['ready', 'planning', 'in_review'],
    requiredCapabilities: [],
    steps: [
      {
        id: 'build',
        role: 'builder',
        description: 'Implement the task',
        dependencies: [],
        config: {},
      },
      {
        id: 'review',
        role: 'reviewer',
        description: 'Review the implementation. Issue review_pass or review_fail.',
        dependencies: ['build'],
        config: {},
      },
      {
        id: 'rework',
        role: 'builder',
        description:
          'Address all reviewer feedback and re-submit. ' +
          'Only triggered when review step issues review_fail.',
        dependencies: ['review'],
        config: { conditional: 'review_fail' },
      },
    ],
  },
] as const;

// ---------------------------------------------------------------------------
// Lookup helpers
// ---------------------------------------------------------------------------

/**
 * Look up a built-in role by ID.
 * Returns undefined if the role is not found.
 */
export function getBuiltInRole(id: string): RoleDefinition | undefined {
  return BUILT_IN_ROLES.find((r) => r.id === id);
}

/**
 * Look up a built-in workflow template by ID.
 * Returns undefined if the template is not found.
 */
export function getBuiltInWorkflow(id: string): WorkflowTemplate | undefined {
  return BUILT_IN_WORKFLOWS.find((w) => w.id === id);
}
