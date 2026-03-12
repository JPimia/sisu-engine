import type { ExecutionPlan } from '@sisu/protocol';
import type { SisuStorage } from '../storage/interface.js';
import { assembleBriefing } from './briefing.js';
import { selectWorkflow } from './workflow-selector.js';

/**
 * Dispatch a work item: assemble briefing, select workflow template,
 * instantiate an ExecutionPlan, and transition the work item through
 * planning → in_progress.
 *
 * This is a stateless coordinator turn: Read → Decide → Write.
 */
export async function dispatch(workItemId: string, storage: SisuStorage): Promise<ExecutionPlan> {
  const briefing = await assembleBriefing('dispatch', workItemId, storage);
  const { subject, availableWorkflows } = briefing;

  // Transition to planning
  await storage.updateWorkItem(workItemId, { status: 'planning' });

  // Select the workflow template
  const workflow = selectWorkflow(subject, availableWorkflows);

  // Instantiate an execution plan from the workflow
  const plan = await storage.createPlan({
    workItemId,
    workflowTemplateId: workflow.id,
    steps: workflow.steps.map((step) => ({
      workflowStepId: step.id,
      role: step.role,
    })),
  });

  // Transition to in_progress
  await storage.updateWorkItem(workItemId, { status: 'in_progress' });

  return plan;
}
