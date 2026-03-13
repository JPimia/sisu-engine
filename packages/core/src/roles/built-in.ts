import type { RoleDefinition } from '@sisu/protocol';

/**
 * The 9 built-in SISU roles with their tiers, spawn hierarchies, and access levels.
 */
export const BUILT_IN_ROLES: RoleDefinition[] = [
  {
    id: 'orchestrator',
    name: 'Orchestrator',
    description:
      'Top-level strategic coordinator. Owns the overall mission, decomposes goals, and delegates to coordinators.',
    modelTier: 'strategic',
    modelPreference: 'openai/gpt-5.4',
    canSpawn: ['coordinator', 'supervisor', 'monitor'],
    access: { workItems: 'admin', plans: 'admin', mail: 'admin', leases: 'read' },
    maxConcurrency: 1,
  },
  {
    id: 'coordinator',
    name: 'Coordinator',
    description:
      'Tactical planner. Receives objectives from orchestrator, selects workflow templates, and dispatches work.',
    modelTier: 'strategic',
    modelPreference: 'anthropic/claude-opus-4-6',
    canSpawn: ['supervisor', 'lead', 'scout', 'builder', 'reviewer', 'merger'],
    access: { workItems: 'write', plans: 'write', mail: 'write', leases: 'read' },
    maxConcurrency: -1,
  },
  {
    id: 'supervisor',
    name: 'Supervisor',
    description:
      'Manages a team of builders/reviewers for a single feature or stream. Monitors progress, handles escalations.',
    modelTier: 'execution',
    modelPreference: 'openai/gpt-5.4',
    canSpawn: ['lead', 'builder', 'reviewer', 'merger'],
    access: { workItems: 'write', plans: 'write', mail: 'write', leases: 'read' },
    maxConcurrency: -1,
  },
  {
    id: 'lead',
    name: 'Lead',
    description:
      'Senior builder with spawn rights. Coordinates small groups of builders and owns integration.',
    modelTier: 'execution',
    modelPreference: 'openai/gpt-5.4',
    canSpawn: ['builder', 'reviewer'],
    access: { workItems: 'write', plans: 'read', mail: 'write', leases: 'read' },
    maxConcurrency: -1,
  },
  {
    id: 'scout',
    name: 'Scout',
    description:
      'Explores the codebase, gathers context, produces research reports. Read-only access. Cannot spawn.',
    modelTier: 'observation',
    modelPreference: 'openai/gpt-5.4',
    canSpawn: [],
    access: { workItems: 'read', plans: 'read', mail: 'write', leases: 'read' },
    maxConcurrency: -1,
  },
  {
    id: 'builder',
    name: 'Builder',
    description:
      'Implementation specialist. Writes code, runs tests, commits changes. The primary leaf-node worker.',
    modelTier: 'execution',
    modelPreference: 'openai/gpt-5.4',
    canSpawn: [],
    access: { workItems: 'read', plans: 'read', mail: 'write', leases: 'read' },
    maxConcurrency: -1,
  },
  {
    id: 'reviewer',
    name: 'Reviewer',
    description:
      'Reviews code, checks quality, provides pass/fail verdicts. Cannot modify code directly.',
    modelTier: 'review',
    modelPreference: 'openai/gpt-5.4',
    canSpawn: [],
    access: { workItems: 'read', plans: 'read', mail: 'write', leases: 'read' },
    maxConcurrency: -1,
  },
  {
    id: 'merger',
    name: 'Merger',
    description:
      'Handles branch integration — merges worktrees, resolves conflicts, validates builds post-merge.',
    modelTier: 'execution',
    modelPreference: 'openai/gpt-5.4',
    canSpawn: [],
    access: { workItems: 'write', plans: 'read', mail: 'write', leases: 'read' },
    maxConcurrency: -1,
  },
  {
    id: 'monitor',
    name: 'Monitor',
    description:
      'Observes system health, token usage, lease staleness. Escalates anomalies. Read-only observer.',
    modelTier: 'observation',
    modelPreference: 'openai/gpt-5.4',
    canSpawn: [],
    access: { workItems: 'read', plans: 'read', mail: 'write', leases: 'admin' },
    maxConcurrency: 1,
  },
];
