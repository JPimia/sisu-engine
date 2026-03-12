import type { WorkItemStatus } from '@sisu/protocol';

/**
 * Valid state transitions for a WorkItem.
 *
 * Diagram:
 *   queued → ready → planning → in_progress → in_review → done
 *                                           ↘ blocked → in_progress (retry)
 *   any non-terminal → failed
 *   any non-terminal → cancelled
 *   in_review → in_progress (rework loop)
 */
const VALID_TRANSITIONS: Record<WorkItemStatus, WorkItemStatus[]> = {
  queued: ['ready', 'cancelled', 'failed'],
  ready: ['planning', 'in_progress', 'cancelled', 'failed'],
  planning: ['in_progress', 'blocked', 'cancelled', 'failed'],
  in_progress: ['in_review', 'blocked', 'done', 'cancelled', 'failed'],
  in_review: ['done', 'in_progress', 'blocked', 'cancelled', 'failed'],
  blocked: ['ready', 'in_progress', 'cancelled', 'failed'],
  done: [],
  failed: [],
  cancelled: [],
};

/**
 * Returns true if transitioning from `current` to `target` is valid.
 */
export function isValidTransition(current: WorkItemStatus, target: WorkItemStatus): boolean {
  const allowed = VALID_TRANSITIONS[current];
  return allowed.includes(target);
}

/**
 * Validates and returns the target status if valid.
 * Throws if the transition is not allowed.
 */
export function transition(current: WorkItemStatus, target: WorkItemStatus): WorkItemStatus {
  if (!isValidTransition(current, target)) {
    throw new Error(
      `Invalid work item transition: ${current} → ${target}. Allowed from '${current}': [${VALID_TRANSITIONS[current].join(', ')}]`,
    );
  }
  return target;
}

/**
 * Returns all valid next statuses from the given status.
 */
export function validNextStatuses(current: WorkItemStatus): WorkItemStatus[] {
  return [...VALID_TRANSITIONS[current]];
}

/**
 * Returns true if the status is terminal (no outgoing transitions).
 */
export function isTerminal(status: WorkItemStatus): boolean {
  return VALID_TRANSITIONS[status].length === 0;
}
