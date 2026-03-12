import type { ExecutionPlan, ExecutionPlanStep } from '@sisu/protocol';
import { newRunId } from '@sisu/protocol';
import type { SisuStorage } from '../storage/interface.js';

// ---------------------------------------------------------------------------
// AgentRuntime interface (local definition — runtime-openclaw owns the impl)
// ---------------------------------------------------------------------------

export interface SpawnConfig {
  runId: string;
  role: string;
  model: string;
  workItemId: string;
  planId: string;
  taskDescription: string;
  workingDirectory: string;
  systemPrompt: string;
  files?: string[];
}

export interface AgentHandle {
  runId: string;
  pid?: number | undefined;
  status: 'spawning' | 'active' | 'completed' | 'failed';
}

export interface AgentRuntime {
  spawn(config: SpawnConfig): Promise<AgentHandle>;
  stop(runId: string): Promise<void>;
  heartbeat(runId: string): Promise<'active' | 'stale' | 'dead'>;
  isAvailable(): Promise<boolean>;
}

// ---------------------------------------------------------------------------
// Step resolution
// ---------------------------------------------------------------------------

/**
 * Returns the first step whose dependencies are all done and whose own
 * status is 'pending'. Returns null if none is ready.
 */
export function findReadyStep(plan: ExecutionPlan): ExecutionPlanStep | null {
  const doneIds = new Set(
    plan.steps.filter((s) => s.status === 'done').map((s) => s.workflowStepId),
  );

  for (const step of plan.steps) {
    if (step.status !== 'pending') continue;

    const template = plan.steps.find((s) => s.id === step.id);
    if (!template) continue;

    // Rely on workflowStepId mapping: dependencies use workflowStepId references
    // The workflow template step.dependencies are workflowStepIds, but in the plan
    // we only have the instantiated steps. We check by workflowStepId matches.
    // Since we don't have the original template here, we check all 'pending' steps
    // with no known dependency that isn't done yet.
    // For plan-level checks, we treat each step's workflowStepId as the node key.
    const deps = getDepsForStep(step.workflowStepId, plan);
    const allDepsDone = deps.every((depId) => doneIds.has(depId));

    if (allDepsDone) return step;
  }

  return null;
}

/**
 * Extracts dependency workflowStepIds for a given step from the plan.
 * Since ExecutionPlanStep doesn't carry dependency list, we encode them
 * as a convention: steps are ordered by dependency (earlier = depended-upon)
 * for simple linear workflows. For DAG workflows, caller should supply a
 * dependency map via the runtime config.
 *
 * For now this returns an empty array (all steps are independently ready
 * when their predecessors are done via ordering). A richer version would
 * accept the workflow template.
 */
function getDepsForStep(_workflowStepId: string, _plan: ExecutionPlan): string[] {
  // Dependencies are resolved at the WorkflowTemplate level before dispatch.
  // The ExecutionPlan step does not currently carry dependency metadata.
  // This will be extended when plan steps include dependencies.
  return [];
}

// ---------------------------------------------------------------------------
// executeNextStep
// ---------------------------------------------------------------------------

/**
 * Find the next ready step in the plan, spawn an agent via the runtime,
 * create a lease, and update step status to running.
 *
 * Returns the updated plan. If no step is ready, returns the plan unchanged.
 */
export async function executeNextStep(
  plan: ExecutionPlan,
  storage: SisuStorage,
  runtime: AgentRuntime,
): Promise<ExecutionPlan> {
  const step = findReadyStep(plan);
  if (!step) return plan;

  const role = await storage.getRole(step.role);
  const model = role?.modelPreference ?? 'claude-sonnet-4-6';

  const runId = newRunId();

  const handle = await runtime.spawn({
    runId,
    role: step.role,
    model,
    workItemId: plan.workItemId,
    planId: plan.id,
    taskDescription: `Execute step ${step.workflowStepId} as ${step.role}`,
    workingDirectory: process.cwd(),
    systemPrompt: `You are a ${step.role} agent. Complete the assigned task.`,
  });

  await storage.createLease({
    runId: handle.runId,
    role: step.role,
    workItemId: plan.workItemId,
    planId: plan.id,
    model,
  });

  const updatedPlan = await storage.updatePlanStep(plan.id, step.id, {
    status: 'running',
    runId: handle.runId,
    startedAt: new Date().toISOString(),
  });

  return updatedPlan;
}
