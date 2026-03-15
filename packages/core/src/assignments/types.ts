/**
 * Internal types for assignment generation and writing.
 */
import type { Profile } from '@sisu/protocol';

// ---------------------------------------------------------------------------
// Builder-specific
// ---------------------------------------------------------------------------

export interface BuilderAssignmentInput {
  taskId: string;
  title: string;
  parentAgent: string;
  rootTaskId: string;
  repoId: string;
  repoPath: string;
  worktreePath: string;
  branch: string;
  baseBranch: string;
  objective: string;
  successCriteria: string[];
  /** Required for builders — explicit allowlist of file paths/globs. */
  fileScope: {
    allowed: string[];
    forbidden?: string[];
  };
  validation?: Array<{ name: string; command: string; required: boolean }>;
  references?: Array<{ label: string; path: string }>;
  authority?: { canDo: string[]; cannotDo: string[] };
  handoff?: { onComplete: string; onBlock: string; onFailure: string };
  architecture?: string;
  ui?: string;
  runtime?: {
    model?: string;
    modelTier?: 'strategic' | 'execution' | 'review' | 'observation';
    timeout?: number;
    maxTokens?: number;
    profile?: Profile;
  };
  priority?: 'low' | 'normal' | 'high' | 'urgent';
  riskLevel?: 'low' | 'medium' | 'high' | 'critical';
  instructionMode?: 'spec' | 'inline' | 'external';
}

// ---------------------------------------------------------------------------
// Reviewer-specific
// ---------------------------------------------------------------------------

export interface ReviewerAssignmentInput {
  taskId: string;
  title: string;
  parentAgent: string;
  rootTaskId: string;
  repoId: string;
  repoPath: string;
  worktreePath: string;
  branch: string;
  baseBranch: string;
  objective: string;
  successCriteria: string[];
  /** Review target — what is being reviewed. */
  reviewTarget: {
    branch: string;
    baseBranch: string;
    prUrl?: string;
    diffScope?: string[];
  };
  validation?: Array<{ name: string; command: string; required: boolean }>;
  references?: Array<{ label: string; path: string }>;
  authority?: { canDo: string[]; cannotDo: string[] };
  handoff?: { onComplete: string; onBlock: string; onFailure: string };
  architecture?: string;
  runtime?: {
    model?: string;
    modelTier?: 'strategic' | 'execution' | 'review' | 'observation';
    timeout?: number;
    maxTokens?: number;
    profile?: Profile;
  };
  priority?: 'low' | 'normal' | 'high' | 'urgent';
  riskLevel?: 'low' | 'medium' | 'high' | 'critical';
  instructionMode?: 'spec' | 'inline' | 'external';
}

// ---------------------------------------------------------------------------
// Lead-specific
// ---------------------------------------------------------------------------

export interface LeadAssignmentInput {
  taskId: string;
  title: string;
  parentAgent: string;
  rootTaskId: string;
  repoId: string;
  repoPath: string;
  worktreePath: string;
  branch: string;
  baseBranch: string;
  objective: string;
  successCriteria: string[];
  /** Coordination details for the lead. */
  coordination: {
    teamSize: number;
    subTasks: string[];
    decompositionStrategy?: string;
  };
  fileScope?: {
    allowed: string[];
    forbidden?: string[];
  };
  validation?: Array<{ name: string; command: string; required: boolean }>;
  references?: Array<{ label: string; path: string }>;
  authority?: { canDo: string[]; cannotDo: string[] };
  handoff?: { onComplete: string; onBlock: string; onFailure: string };
  architecture?: string;
  ui?: string;
  runtime?: {
    model?: string;
    modelTier?: 'strategic' | 'execution' | 'review' | 'observation';
    timeout?: number;
    maxTokens?: number;
    profile?: Profile;
  };
  priority?: 'low' | 'normal' | 'high' | 'urgent';
  riskLevel?: 'low' | 'medium' | 'high' | 'critical';
  instructionMode?: 'spec' | 'inline' | 'external';
}

// ---------------------------------------------------------------------------
// Union of all input types
// ---------------------------------------------------------------------------

export type AssignmentInput =
  | ({ role: 'builder' } & BuilderAssignmentInput)
  | ({ role: 'reviewer' } & ReviewerAssignmentInput)
  | ({ role: 'lead' } & LeadAssignmentInput);
