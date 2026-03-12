import { ulid } from 'ulidx';

/**
 * Generate a new work item ID: wrk_{ulid}
 */
export function newWorkItemId(): string {
  return `wrk_${ulid()}`;
}

/**
 * Generate a new execution plan ID: plan_{ulid}
 */
export function newPlanId(): string {
  return `plan_${ulid()}`;
}

/**
 * Generate a new mail ID: mail_{ulid}
 */
export function newMailId(): string {
  return `mail_${ulid()}`;
}

/**
 * Generate a new agent run ID: run_{ulid}
 */
export function newRunId(): string {
  return `run_${ulid()}`;
}

/**
 * Generate a new runtime lease ID: lease_{ulid}
 */
export function newLeaseId(): string {
  return `lease_${ulid()}`;
}
