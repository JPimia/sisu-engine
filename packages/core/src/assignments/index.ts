/**
 * @sisu/core — Assignment overlay system.
 *
 * Provides generation, validation, enforcement, and serialization
 * of sisu.assignment.v1 overlay files.
 */
export {
  createBuilderAssignment,
  createReviewerAssignment,
  createLeadAssignment,
  resolveRole,
  isRoleAlias,
  isProfile,
} from './generators.js';

export {
  enforceAssignment,
  checkAssignment,
  AssignmentEnforcementError,
} from './enforcement.js';

export {
  assignmentToMarkdown,
  assignmentFilePath,
  assignmentAbsolutePath,
} from './writer.js';

export {
  buildAgentEnv,
  assembleSystemPrompt,
} from './contract-injector.js';
export type {
  SisuAgentEnv,
  ContractInjectionInput,
} from './contract-injector.js';

export type {
  BuilderAssignmentInput,
  ReviewerAssignmentInput,
  LeadAssignmentInput,
  AssignmentInput,
} from './types.js';
