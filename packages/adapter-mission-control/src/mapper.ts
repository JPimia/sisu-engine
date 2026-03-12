import type { WorkItemStatus } from '@sisu/protocol';
import type { CreateWorkItemInput } from '@sisu/sdk';
import type { McTask, McTaskStatus } from './types.js';

// ---------------------------------------------------------------------------
// Status maps
// ---------------------------------------------------------------------------

const MC_TO_SISU_STATUS: Record<McTaskStatus, WorkItemStatus> = {
  open: 'queued',
  assigned: 'ready',
  working: 'in_progress',
  review: 'in_review',
  completed: 'done',
  archived: 'cancelled',
  failed: 'failed',
};

const SISU_TO_MC_STATUS: Record<WorkItemStatus, McTaskStatus> = {
  queued: 'open',
  ready: 'assigned',
  planning: 'working',
  in_progress: 'working',
  in_review: 'review',
  blocked: 'assigned',
  done: 'completed',
  failed: 'failed',
  cancelled: 'archived',
};

// ---------------------------------------------------------------------------
// Mapping functions
// ---------------------------------------------------------------------------

/**
 * Convert an MC task to a SISU CreateWorkItemInput.
 * MC-specific fields are preserved in the metadata bag.
 */
export function mcTaskToWorkItem(task: McTask): CreateWorkItemInput {
  const metadata: Record<string, unknown> = {
    ...(task.metadata ?? {}),
  };
  if (task.projectId !== undefined) metadata.projectId = task.projectId;
  if (task.assignee !== undefined) metadata.assignee = task.assignee;
  if (task.labels !== undefined) metadata.labels = task.labels;
  if (task.priority !== undefined) metadata.priority = task.priority;

  return {
    title: task.title,
    description: task.description,
    status: mcStatusToWorkItemStatus(task.status),
    externalRef: {
      system: 'mission-control',
      id: task.id,
    },
    requiredCapabilities: task.capabilities ?? [],
    metadata,
    context: {},
  };
}

/**
 * Convert a SISU WorkItemStatus to the corresponding MC task status.
 */
export function workItemStatusToMcStatus(status: WorkItemStatus): McTaskStatus {
  return SISU_TO_MC_STATUS[status];
}

/**
 * Convert an MC task status to the corresponding SISU WorkItemStatus.
 */
export function mcStatusToWorkItemStatus(status: McTaskStatus): WorkItemStatus {
  return MC_TO_SISU_STATUS[status];
}
