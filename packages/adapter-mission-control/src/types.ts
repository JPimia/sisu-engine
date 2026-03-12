/**
 * MC-specific type definitions.
 * These types must stay within this package — core never imports MC types.
 */

// ---------------------------------------------------------------------------
// MC Task
// ---------------------------------------------------------------------------

export type McTaskStatus =
  | 'open'
  | 'assigned'
  | 'working'
  | 'review'
  | 'completed'
  | 'archived'
  | 'failed';

export interface McTask {
  id: string;
  title: string;
  description?: string | undefined;
  status: McTaskStatus;
  projectId?: string | undefined;
  assignee?: string | undefined;
  labels?: string[] | undefined;
  priority?: number | undefined;
  capabilities?: string[] | undefined;
  metadata?: Record<string, unknown> | undefined;
  createdAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Webhook Events
// ---------------------------------------------------------------------------

export interface McWebhookEvent {
  eventId: string;
  eventType: string;
  timestamp: string;
  payload: Record<string, unknown>;
}

export interface SisuStatusEvent {
  workItemId: string;
  previousStatus: string;
  newStatus: string;
  timestamp: string;
  metadata?: Record<string, unknown> | undefined;
}

// ---------------------------------------------------------------------------
// Outbox
// ---------------------------------------------------------------------------

export interface OutboxEntry {
  id: string;
  eventType: string;
  payload: Record<string, unknown>;
  targetUrl: string;
  status: 'pending' | 'delivered' | 'failed';
  attempts: number;
  maxAttempts: number;
  lastAttemptAt?: string | undefined;
  nextAttemptAt?: string | undefined;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Adapter Config
// ---------------------------------------------------------------------------

export interface McAdapterConfig {
  sisuBaseUrl: string;
  mcApiBaseUrl: string;
  mcApiToken?: string | undefined;
  webhookSecret?: string | undefined;
  webhookUrl?: string | undefined;
  adapterName?: string | undefined;
  subscribedEvents?: string[] | undefined;
  capabilities?: string[] | undefined;
}
