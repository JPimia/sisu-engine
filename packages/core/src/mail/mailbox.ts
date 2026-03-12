import type { AgentMail } from '@sisu/protocol';
import type { CreateMailInput, MailFilter, SisuStorage } from '../storage/interface.js';

/**
 * Send a mail message via storage.
 */
export async function send(mail: CreateMailInput, storage: SisuStorage): Promise<AgentMail> {
  return storage.sendMail(mail);
}

/**
 * Check unread mail for an agent (by `to` address).
 */
export async function check(agentId: string, storage: SisuStorage): Promise<AgentMail[]> {
  return storage.listMail({ to: agentId, read: false });
}

/**
 * List all mail for a specific work item.
 */
export async function checkByWorkItem(
  workItemId: string,
  storage: SisuStorage,
): Promise<AgentMail[]> {
  return storage.listMail({ workItemId });
}

/**
 * Mark a mail message as read.
 */
export async function markRead(mailId: string, storage: SisuStorage): Promise<void> {
  return storage.markRead(mailId);
}

/**
 * List mail with an arbitrary filter.
 */
export async function listMail(filter: MailFilter, storage: SisuStorage): Promise<AgentMail[]> {
  return storage.listMail(filter);
}
