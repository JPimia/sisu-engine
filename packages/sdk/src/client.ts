import type {
  AdapterRegistration,
  AgentMail,
  ExecutionPlan,
  ExternalRef,
  MailType,
  RuntimeLease,
  WorkItem,
  WorkItemStatus,
} from '@sisu/protocol';
import { SisuApiError } from './errors.js';

// ---------------------------------------------------------------------------
// Request input types
// ---------------------------------------------------------------------------

export interface CreateWorkItemInput {
  title: string;
  description?: string | undefined;
  status?: WorkItemStatus | undefined;
  externalRef?: ExternalRef | undefined;
  requiredCapabilities?: string[] | undefined;
  metadata?: Record<string, unknown> | undefined;
  context?: Record<string, unknown> | undefined;
  assignedRole?: string | undefined;
}

export interface UpdateWorkItemInput {
  title?: string | undefined;
  description?: string | undefined;
  status?: WorkItemStatus | undefined;
  externalRef?: ExternalRef | undefined;
  requiredCapabilities?: string[] | undefined;
  metadata?: Record<string, unknown> | undefined;
  context?: Record<string, unknown> | undefined;
  assignedRole?: string | undefined;
  assignedRun?: string | undefined;
  version?: number | undefined;
}

export interface ListWorkItemsQuery {
  status?: WorkItemStatus | undefined;
  assignedRole?: string | undefined;
  externalSystem?: string | undefined;
}

export interface ListRunsQuery {
  role?: string | undefined;
  workItemId?: string | undefined;
  active?: boolean | undefined;
}

export interface ListMailQuery {
  to?: string | undefined;
  from?: string | undefined;
  read?: boolean | undefined;
  workItemId?: string | undefined;
  type?: MailType | undefined;
}

export interface SendMailInput {
  type: MailType;
  from: string;
  to: string;
  subject: string;
  body: string;
  payload?: Record<string, unknown> | undefined;
  workItemId?: string | undefined;
  planId?: string | undefined;
  priority?: 'low' | 'normal' | 'high' | 'urgent' | undefined;
}

export interface RegisterAdapterInput {
  name: string;
  system: string;
  webhookUrl?: string | undefined;
  subscribedEvents?: string[] | undefined;
  capabilities?: string[] | undefined;
}

export interface HealthResponse {
  status: string;
  timestamp: string;
}

// ---------------------------------------------------------------------------
// SisuClientOptions
// ---------------------------------------------------------------------------

export interface SisuClientOptions {
  /** Base URL of the SISU server, e.g. http://localhost:3000 */
  baseUrl: string;
  /** Additional headers to include on every request */
  headers?: Record<string, string> | undefined;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function buildQueryString(params: Record<string, string | boolean | undefined>): string {
  const entries = Object.entries(params).filter(
    (entry): entry is [string, string | boolean] => entry[1] !== undefined,
  );
  if (entries.length === 0) return '';
  const qs = entries
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join('&');
  return `?${qs}`;
}

// ---------------------------------------------------------------------------
// SisuClient
// ---------------------------------------------------------------------------

export class SisuClient {
  private readonly baseUrl: string;
  private readonly headers: Record<string, string>;

  constructor(options: SisuClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, '');
    this.headers = {
      'Content-Type': 'application/json',
      ...options.headers,
    };
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const init: RequestInit = { method, headers: this.headers };
    if (body !== undefined) {
      init.body = JSON.stringify(body);
    }
    const res = await fetch(url, init);
    const data: unknown = await res.json();
    if (!res.ok) {
      throw new SisuApiError(res.status, res.statusText, data);
    }
    return data as T;
  }

  // ---------------------------------------------------------------------------
  // Health
  // ---------------------------------------------------------------------------

  health(): Promise<HealthResponse> {
    return this.request<HealthResponse>('GET', '/v1/health');
  }

  // ---------------------------------------------------------------------------
  // Work Items
  // ---------------------------------------------------------------------------

  createWorkItem(data: CreateWorkItemInput): Promise<WorkItem> {
    return this.request<WorkItem>('POST', '/v1/work-items', data);
  }

  listWorkItems(query?: ListWorkItemsQuery): Promise<WorkItem[]> {
    const qs = query ? buildQueryString(query as Record<string, string | boolean | undefined>) : '';
    return this.request<WorkItem[]>('GET', `/v1/work-items${qs}`);
  }

  getWorkItem(id: string): Promise<WorkItem> {
    return this.request<WorkItem>('GET', `/v1/work-items/${id}`);
  }

  updateWorkItem(id: string, data: UpdateWorkItemInput): Promise<WorkItem> {
    return this.request<WorkItem>('PUT', `/v1/work-items/${id}`, data);
  }

  /** Dispatch a work item — creates an ExecutionPlan from the matching workflow template. */
  dispatch(id: string): Promise<ExecutionPlan> {
    return this.request<ExecutionPlan>('POST', `/v1/work-items/${id}/dispatch`);
  }

  /** Trigger execution of a dispatched work item. */
  run(id: string): Promise<ExecutionPlan> {
    return this.request<ExecutionPlan>('POST', `/v1/work-items/${id}/run`);
  }

  // ---------------------------------------------------------------------------
  // Plans
  // ---------------------------------------------------------------------------

  getPlan(id: string): Promise<ExecutionPlan> {
    return this.request<ExecutionPlan>('GET', `/v1/plans/${id}`);
  }

  // ---------------------------------------------------------------------------
  // Runtime Runs
  // ---------------------------------------------------------------------------

  listRuns(query?: ListRunsQuery): Promise<RuntimeLease[]> {
    const qs = query ? buildQueryString(query as Record<string, string | boolean | undefined>) : '';
    return this.request<RuntimeLease[]>('GET', `/v1/runtime/runs${qs}`);
  }

  stopRun(id: string): Promise<RuntimeLease> {
    return this.request<RuntimeLease>('POST', `/v1/runtime/runs/${id}/stop`);
  }

  // ---------------------------------------------------------------------------
  // Mail
  // ---------------------------------------------------------------------------

  listMail(query?: ListMailQuery): Promise<AgentMail[]> {
    const qs = query ? buildQueryString(query as Record<string, string | boolean | undefined>) : '';
    return this.request<AgentMail[]>('GET', `/v1/mail${qs}`);
  }

  sendMail(data: SendMailInput): Promise<AgentMail> {
    return this.request<AgentMail>('POST', '/v1/mail', data);
  }

  // ---------------------------------------------------------------------------
  // Adapters
  // ---------------------------------------------------------------------------

  registerAdapter(data: RegisterAdapterInput): Promise<AdapterRegistration> {
    return this.request<AdapterRegistration>('POST', '/v1/adapters/register', data);
  }
}
