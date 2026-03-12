import type { WorkflowTemplate, WorkItem } from '@sisu/protocol';

const DEFAULT_WORKFLOW_ID = 'wf_simple-task';

/**
 * Select a workflow template for a work item.
 *
 * Priority:
 * 1. Explicit workflowTemplateId in work item context
 * 2. First workflow whose appliesTo includes the work item status
 * 3. Default 'wf_simple-task' if nothing matches
 */
export function selectWorkflow(
  workItem: WorkItem,
  workflows: WorkflowTemplate[],
): WorkflowTemplate {
  // 1. Explicit template requested via context
  const explicitId = workItem.context.workflowTemplateId;
  if (typeof explicitId === 'string') {
    const explicit = workflows.find((w) => w.id === explicitId);
    if (explicit) return explicit;
  }

  // 2. Match by appliesTo status
  const byStatus = workflows.find((w) => w.appliesTo.includes(workItem.status));
  if (byStatus) return byStatus;

  // 3. Default
  const defaultWorkflow = workflows.find((w) => w.id === DEFAULT_WORKFLOW_ID);
  if (defaultWorkflow) return defaultWorkflow;

  // Last resort: use first available or throw
  if (workflows.length > 0) return workflows[0] as WorkflowTemplate;

  throw new Error(
    `No workflow template found for work item ${workItem.id} (status: ${workItem.status})`,
  );
}
