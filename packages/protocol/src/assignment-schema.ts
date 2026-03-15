/**
 * Zod schemas for sisu.assignment.v1 — the structured overlay
 * that spawned agents receive as Markdown + YAML frontmatter.
 *
 * Schema name: sisu.assignment.v1
 */
import { z } from 'zod';

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------

/** Canonical SISU roles (supervisor is a deprecated alias → lead). */
export const AssignmentRoleSchema = z.enum([
  'orchestrator',
  'coordinator',
  'lead',
  'builder',
  'reviewer',
  'scout',
  'monitor',
  'merger',
]);
export type AssignmentRole = z.infer<typeof AssignmentRoleSchema>;

export const ASSIGNMENT_ROLES: readonly AssignmentRole[] = AssignmentRoleSchema.options;

export const InstructionModeSchema = z.enum(['spec', 'inline', 'external']);
export type InstructionMode = z.infer<typeof InstructionModeSchema>;

export const AssignmentPrioritySchema = z.enum(['low', 'normal', 'high', 'urgent']);
export type AssignmentPriority = z.infer<typeof AssignmentPrioritySchema>;

export const RiskLevelSchema = z.enum(['low', 'medium', 'high', 'critical']);
export type RiskLevel = z.infer<typeof RiskLevelSchema>;

export const AssignmentStatusSchema = z.enum(['assigned', 'active', 'completed', 'failed']);
export type AssignmentStatus = z.infer<typeof AssignmentStatusSchema>;

export const ProfileSchema = z.enum(['standard', 'co-creation']);
export type Profile = z.infer<typeof ProfileSchema>;

// ---------------------------------------------------------------------------
// Absolute-path refinement
// ---------------------------------------------------------------------------

const absolutePathString = z
  .string()
  .min(1)
  .refine((p) => p.startsWith('/') || /^[A-Z]:\\/i.test(p), {
    message: 'Path must be absolute (starts with / or drive letter)',
  });

// ---------------------------------------------------------------------------
// Sub-schemas
// ---------------------------------------------------------------------------

export const FileScopeSchema = z.object({
  allowed: z.array(z.string().min(1)).min(1),
  forbidden: z.array(z.string().min(1)).optional(),
});
export type FileScope = z.infer<typeof FileScopeSchema>;

export const ReferenceSchema = z.object({
  label: z.string().min(1),
  path: z.string().min(1),
});
export type Reference = z.infer<typeof ReferenceSchema>;

export const ValidationCommandSchema = z.object({
  name: z.string().min(1),
  command: z.string().min(1),
  required: z.boolean(),
});
export type ValidationCommand = z.infer<typeof ValidationCommandSchema>;

export const AuthoritySchema = z.object({
  canDo: z.array(z.string().min(1)),
  cannotDo: z.array(z.string().min(1)),
});
export type Authority = z.infer<typeof AuthoritySchema>;

export const HandoffSchema = z.object({
  onComplete: z.string().min(1),
  onBlock: z.string().min(1),
  onFailure: z.string().min(1),
});
export type Handoff = z.infer<typeof HandoffSchema>;

export const RuntimeConfigSchema = z.object({
  model: z.string().min(1).optional(),
  modelTier: z.enum(['strategic', 'execution', 'review', 'observation']).optional(),
  timeout: z.number().int().positive().optional(),
  maxTokens: z.number().int().positive().optional(),
  profile: ProfileSchema.optional(),
});
export type RuntimeConfig = z.infer<typeof RuntimeConfigSchema>;

// ---------------------------------------------------------------------------
// Role-specific extension schemas
// ---------------------------------------------------------------------------

export const ReviewTargetSchema = z.object({
  branch: z.string().min(1),
  baseBranch: z.string().min(1),
  prUrl: z.string().url().optional(),
  diffScope: z.array(z.string().min(1)).optional(),
});
export type ReviewTarget = z.infer<typeof ReviewTargetSchema>;

export const ExplorationSchema = z.object({
  questions: z.array(z.string().min(1)).min(1),
  scope: z.array(z.string().min(1)).min(1),
});
export type Exploration = z.infer<typeof ExplorationSchema>;

export const CoordinationSchema = z.object({
  teamSize: z.number().int().positive(),
  subTasks: z.array(z.string().min(1)),
  decompositionStrategy: z.string().min(1).optional(),
});
export type Coordination = z.infer<typeof CoordinationSchema>;

export const WorkstreamPlanningSchema = z.object({
  streams: z.array(z.string().min(1)).min(1),
  dependencies: z.array(z.string()),
});
export type WorkstreamPlanning = z.infer<typeof WorkstreamPlanningSchema>;

export const MergePlanSchema = z.object({
  branches: z.array(z.string().min(1)).min(2),
  strategy: z.string().min(1),
});
export type MergePlan = z.infer<typeof MergePlanSchema>;

export const MonitoringConfigSchema = z.object({
  metrics: z.array(z.string().min(1)).min(1),
  thresholds: z.record(z.number()),
});
export type MonitoringConfig = z.infer<typeof MonitoringConfigSchema>;

export const EcosystemSchema = z.object({
  activeWorkstreams: z.array(z.string().min(1)),
  healthChecks: z.array(z.string().min(1)),
});
export type Ecosystem = z.infer<typeof EcosystemSchema>;

// ---------------------------------------------------------------------------
// Frontmatter schema (YAML section)
// ---------------------------------------------------------------------------

export const AssignmentFrontmatterSchema = z.object({
  schema: z.literal('sisu.assignment.v1'),
  role: AssignmentRoleSchema,
  taskId: z.string().min(1),
  title: z.string().min(1),
  parentAgent: z.string().min(1),
  rootTaskId: z.string().min(1),
  repoId: z.string().min(1),
  repoPath: absolutePathString,
  worktreePath: absolutePathString,
  branch: z.string().min(1),
  baseBranch: z.string().min(1),
  instructionMode: InstructionModeSchema,
  priority: AssignmentPrioritySchema,
  riskLevel: RiskLevelSchema,
  status: AssignmentStatusSchema,
  createdAt: z.string().datetime(),
  profile: ProfileSchema.optional(),
});
export type AssignmentFrontmatter = z.infer<typeof AssignmentFrontmatterSchema>;

// ---------------------------------------------------------------------------
// Body schema (Markdown sections)
// ---------------------------------------------------------------------------

export const AssignmentBodySchema = z.object({
  objective: z.string().min(1),
  successCriteria: z.array(z.string().min(1)).min(1),
  fileScope: FileScopeSchema.optional(),
  references: z.array(ReferenceSchema).optional(),
  validation: z.array(ValidationCommandSchema).optional(),
  authority: AuthoritySchema.optional(),
  architecture: z.string().optional(),
  ui: z.string().optional(),
  handoff: HandoffSchema.optional(),
  runtime: RuntimeConfigSchema.optional(),
});
export type AssignmentBody = z.infer<typeof AssignmentBodySchema>;

// ---------------------------------------------------------------------------
// Full assignment schema
// ---------------------------------------------------------------------------

export const AssignmentSchema = z.object({
  frontmatter: AssignmentFrontmatterSchema,
  body: AssignmentBodySchema,
  // Role-specific extensions (optional, validated per-role in generators)
  reviewTarget: ReviewTargetSchema.optional(),
  exploration: ExplorationSchema.optional(),
  coordination: CoordinationSchema.optional(),
  workstreamPlanning: WorkstreamPlanningSchema.optional(),
  mergePlan: MergePlanSchema.optional(),
  monitoring: MonitoringConfigSchema.optional(),
  ecosystem: EcosystemSchema.optional(),
});
export type Assignment = z.infer<typeof AssignmentSchema>;

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

/**
 * Parse and validate an assignment, returning a typed result or throwing ZodError.
 */
export function parseAssignment(data: unknown): Assignment {
  return AssignmentSchema.parse(data);
}

/**
 * Safe parse that returns a discriminated result.
 */
export function safeParseAssignment(data: unknown): z.SafeParseReturnType<unknown, Assignment> {
  return AssignmentSchema.safeParse(data);
}
