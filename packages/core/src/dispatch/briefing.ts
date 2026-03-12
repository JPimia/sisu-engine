import type { AgentMail, RoleDefinition, WorkflowTemplate, WorkItem } from '@sisu/protocol';
import type { SisuStorage } from '../storage/interface.js';

export type DecisionType = 'dispatch' | 'review' | 'escalate' | 'retry';

export interface CoordinatorBriefing {
  decision: DecisionType;
  subject: WorkItem;
  /** Compact summaries of other active/blocked items */
  activeItems: Array<{ id: string; title: string; status: string }>;
  /** Recent relevant mail messages */
  recentMail: AgentMail[];
  availableRoles: RoleDefinition[];
  availableWorkflows: WorkflowTemplate[];
}

/** Maximum active items to include in briefing (token budget). */
const MAX_ACTIVE_ITEMS = 20;
/** Maximum mail messages to include in briefing. */
const MAX_RECENT_MAIL = 10;

/**
 * Assembles a coordinator briefing for a given decision.
 *
 * Queries storage for the subject work item, compact summaries of
 * other active items, recent relevant mail, and available roles/workflows.
 */
export async function assembleBriefing(
  decision: DecisionType,
  subjectId: string,
  storage: SisuStorage,
): Promise<CoordinatorBriefing> {
  const subject = await storage.getWorkItem(subjectId);
  if (!subject) {
    throw new Error(`Work item not found: ${subjectId}`);
  }

  const [allActive, allMail, roles, workflows] = await Promise.all([
    storage.listWorkItems({ status: ['in_progress', 'blocked', 'planning'] }),
    storage.listMail({ workItemId: subjectId }),
    storage.listRoles(),
    storage.listWorkflows(),
  ]);

  // Exclude subject from active list; take compact summaries only
  const activeItems = allActive
    .filter((item) => item.id !== subjectId)
    .slice(0, MAX_ACTIVE_ITEMS)
    .map((item) => ({ id: item.id, title: item.title, status: item.status }));

  // Most recent mail first, capped at MAX_RECENT_MAIL
  const recentMail = [...allMail]
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
    .slice(0, MAX_RECENT_MAIL);

  return {
    decision,
    subject,
    activeItems,
    recentMail,
    availableRoles: roles,
    availableWorkflows: workflows,
  };
}
