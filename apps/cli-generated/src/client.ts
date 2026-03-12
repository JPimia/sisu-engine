/**
 * Auto-generated HTTP client for the SISU API v1.
 * Generated from: openapi/sisu-v1.yaml
 *
 * DO NOT EDIT MANUALLY — regenerate with: pnpm generate
 */

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export type WorkItemStatus =
  | 'queued'
  | 'ready'
  | 'planning'
  | 'in_progress'
  | 'in_review'
  | 'blocked'
  | 'done'
  | 'failed'
  | 'cancelled';

export type MailType =
  | 'dispatch'
  | 'status'
  | 'result'
  | 'question'
  | 'error'
  | 'worker_done'
  | 'merge_ready'
  | 'review_pass'
  | 'review_fail'
  | 'escalation';

export type MailPriority = 'low' | 'normal' | 'high' | 'urgent';

export interface ExternalRef {
  system: string;
  id: string;
  url?: string;
  metadata?: Record<string, unknown>;
}

export interface WorkItem {
  id: string;
  title: string;
  description?: string;
  status: WorkItemStatus;
  version: number;
  externalRef?: ExternalRef;
  requiredCapabilities: string[];
  metadata: Record<string, unknown>;
  context: Record<string, unknown>;
  assignedRole?: string;
  assignedRun?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateWorkItemBody {
  title: string;
  description?: string;
  status?: WorkItemStatus;
  externalRef?: ExternalRef;
  requiredCapabilities?: string[];
  metadata?: Record<string, unknown>;
  context?: Record<string, unknown>;
  assignedRole?: string;
}

export interface UpdateWorkItemBody {
  title?: string;
  description?: string;
  status?: WorkItemStatus;
  externalRef?: ExternalRef;
  requiredCapabilities?: string[];
  metadata?: Record<string, unknown>;
  context?: Record<string, unknown>;
  assignedRole?: string;
  assignedRun?: string;
  version?: number;
}

export interface ListWorkItemsQuery {
  status?: WorkItemStatus;
  assignedRole?: string;
  externalSystem?: string;
}

export type ExecutionPlanStepStatus = 'pending' | 'running' | 'done' | 'failed' | 'skipped';

export interface ExecutionPlanStep {
  id: string;
  workflowStepId: string;
  role: string;
  status: ExecutionPlanStepStatus;
  runId?: string;
  startedAt?: string;
  completedAt?: string;
  error?: string;
  output?: Record<string, unknown>;
}

export interface ExecutionPlan {
  id: string;
  workItemId: string;
  workflowTemplateId: string;
  status: ExecutionPlanStepStatus;
  steps: ExecutionPlanStep[];
  createdAt: string;
  updatedAt: string;
}

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
}

export interface RuntimeLease {
  id: string;
  runId: string;
  role: string;
  workItemId?: string;
  planId?: string;
  model: string;
  tokenUsage: TokenUsage;
  lastHeartbeat: string;
  active: boolean;
  createdAt: string;
  expiresAt: string;
}

export interface ListRunsQuery {
  role?: string;
  workItemId?: string;
  active?: boolean;
}

export interface AgentMail {
  id: string;
  type: MailType;
  from: string;
  to: string;
  subject: string;
  body: string;
  payload?: Record<string, unknown>;
  workItemId?: string;
  planId?: string;
  read: boolean;
  priority: MailPriority;
  createdAt: string;
}

export interface ListMailQuery {
  to?: string;
  from?: string;
  read?: boolean;
  workItemId?: string;
  type?: MailType;
}

export interface SendMailBody {
  type: MailType;
  from: string;
  to: string;
  subject: string;
  body: string;
  payload?: Record<string, unknown>;
  workItemId?: string;
  planId?: string;
  priority?: MailPriority;
}

/**
 * SISU API client. Auto-generated from openapi/sisu-v1.yaml.
 */
export class SisuApiClient {
  private readonly baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
  }

  private async request<T>(
    method: string,
    path: string,
    options: { body?: unknown; query?: Record<string, string | boolean | undefined> } = {},
  ): Promise<T> {
    let url = `${this.baseUrl}${path}`;

    if (options.query) {
      const params = new URLSearchParams();
      for (const [k, v] of Object.entries(options.query)) {
        if (v !== undefined) params.set(k, String(v));
      }
      const qs = params.toString();
      if (qs) url += `?${qs}`;
    }

    const res = await fetch(url, {
      method,
      headers: options.body !== undefined ? { 'Content-Type': 'application/json' } : {},
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    });

    if (!res.ok) {
      let message = `HTTP ${res.status}`;
      try {
        const err = (await res.json()) as { error?: string };
        if (err.error) message = err.error;
      } catch {
        // ignore parse error
      }
      throw new ApiError(res.status, message);
    }

    if (res.status === 204) return undefined as T;
    return res.json() as Promise<T>;
  }

  // --- Health ---

  getHealth(): Promise<{ status: string; timestamp: string }> {
    return this.request('GET', '/health');
  }

  getReady(): Promise<{ status: string }> {
    return this.request('GET', '/ready');
  }

  // --- Work Items ---

  createWorkItem(body: CreateWorkItemBody): Promise<WorkItem> {
    return this.request('POST', '/work-items', { body });
  }

  listWorkItems(query?: ListWorkItemsQuery): Promise<WorkItem[]> {
    return this.request('GET', '/work-items', {
      query: query as Record<string, string | boolean | undefined>,
    });
  }

  getWorkItem(id: string): Promise<WorkItem> {
    return this.request('GET', `/work-items/${encodeURIComponent(id)}`);
  }

  updateWorkItem(id: string, body: UpdateWorkItemBody): Promise<WorkItem> {
    return this.request('PUT', `/work-items/${encodeURIComponent(id)}`, { body });
  }

  cancelWorkItem(id: string): Promise<WorkItem> {
    return this.request('DELETE', `/work-items/${encodeURIComponent(id)}`);
  }

  dispatchWorkItem(id: string): Promise<ExecutionPlan> {
    return this.request('POST', `/work-items/${encodeURIComponent(id)}/dispatch`);
  }

  // --- Plans ---

  getPlan(id: string): Promise<ExecutionPlan> {
    return this.request('GET', `/plans/${encodeURIComponent(id)}`);
  }

  // --- Runtime ---

  listRuns(query?: ListRunsQuery): Promise<RuntimeLease[]> {
    return this.request('GET', '/runtime/runs', {
      query: query as Record<string, string | boolean | undefined>,
    });
  }

  stopRun(id: string): Promise<RuntimeLease> {
    return this.request('POST', `/runtime/runs/${encodeURIComponent(id)}/stop`);
  }

  // --- Mail ---

  listMail(query?: ListMailQuery): Promise<AgentMail[]> {
    return this.request('GET', '/mail', {
      query: query as Record<string, string | boolean | undefined>,
    });
  }

  sendMail(body: SendMailBody): Promise<AgentMail> {
    return this.request('POST', '/mail', { body });
  }

  // --- Adapters ---

  registerAdapter(): Promise<never> {
    return this.request('POST', '/adapters/register');
  }
}
