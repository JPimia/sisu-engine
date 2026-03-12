import {
  type AgentMail,
  type ExecutionPlan,
  type ExecutionPlanStep,
  newLeaseId,
  newMailId,
  newPlanId,
  newWorkItemId,
  type RoleDefinition,
  type RuntimeLease,
  type WorkflowTemplate,
  type WorkItem,
} from '@sisu/protocol';
import Database from 'better-sqlite3';
import type {
  CreateLeaseInput,
  CreateMailInput,
  CreatePlanInput,
  CreateWorkItemInput,
  LeaseFilter,
  LeaseUpdate,
  MailFilter,
  SisuStorage,
  StepUpdate,
  UpdateWorkItemInput,
  WorkItemFilter,
} from './interface.js';

// ---------------------------------------------------------------------------
// Row types (raw DB rows before JSON parse)
// ---------------------------------------------------------------------------

interface WorkItemRow {
  id: string;
  title: string;
  description: string | null;
  status: string;
  version: number;
  external_ref: string | null;
  required_capabilities: string;
  metadata: string;
  context: string;
  assigned_role: string | null;
  assigned_run: string | null;
  created_at: string;
  updated_at: string;
}

interface PlanRow {
  id: string;
  work_item_id: string;
  workflow_template_id: string;
  status: string;
  created_at: string;
  updated_at: string;
}

interface PlanStepRow {
  id: string;
  plan_id: string;
  workflow_step_id: string;
  role: string;
  status: string;
  run_id: string | null;
  started_at: string | null;
  completed_at: string | null;
  error: string | null;
  output: string | null;
}

interface MailRow {
  id: string;
  type: string;
  from_agent: string;
  to_agent: string;
  subject: string;
  body: string;
  payload: string | null;
  work_item_id: string | null;
  plan_id: string | null;
  read: number;
  priority: string;
  created_at: string;
}

interface LeaseRow {
  id: string;
  run_id: string;
  role: string;
  work_item_id: string | null;
  plan_id: string | null;
  model: string;
  token_usage: string;
  last_heartbeat: string;
  active: number;
  created_at: string;
  expires_at: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function now(): string {
  return new Date().toISOString();
}

function rowToWorkItem(row: WorkItemRow): WorkItem {
  return {
    id: row.id,
    title: row.title,
    description: row.description ?? undefined,
    status: row.status as WorkItem['status'],
    version: row.version,
    externalRef: row.external_ref
      ? (JSON.parse(row.external_ref) as WorkItem['externalRef'])
      : undefined,
    requiredCapabilities: JSON.parse(row.required_capabilities) as string[],
    metadata: JSON.parse(row.metadata) as Record<string, unknown>,
    context: JSON.parse(row.context) as Record<string, unknown>,
    assignedRole: row.assigned_role ?? undefined,
    assignedRun: row.assigned_run ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function rowToPlan(planRow: PlanRow, stepRows: PlanStepRow[]): ExecutionPlan {
  const steps: ExecutionPlanStep[] = stepRows.map((s) => ({
    id: s.id,
    workflowStepId: s.workflow_step_id,
    role: s.role,
    status: s.status as ExecutionPlanStep['status'],
    runId: s.run_id ?? undefined,
    startedAt: s.started_at ?? undefined,
    completedAt: s.completed_at ?? undefined,
    error: s.error ?? undefined,
    output: s.output ? (JSON.parse(s.output) as Record<string, unknown>) : undefined,
  }));

  return {
    id: planRow.id,
    workItemId: planRow.work_item_id,
    workflowTemplateId: planRow.workflow_template_id,
    status: planRow.status as ExecutionPlan['status'],
    steps,
    createdAt: planRow.created_at,
    updatedAt: planRow.updated_at,
  };
}

function rowToMail(row: MailRow): AgentMail {
  return {
    id: row.id,
    type: row.type as AgentMail['type'],
    from: row.from_agent,
    to: row.to_agent,
    subject: row.subject,
    body: row.body,
    payload: row.payload ? (JSON.parse(row.payload) as Record<string, unknown>) : undefined,
    workItemId: row.work_item_id ?? undefined,
    planId: row.plan_id ?? undefined,
    read: row.read === 1,
    priority: row.priority as AgentMail['priority'],
    createdAt: row.created_at,
  };
}

function rowToLease(row: LeaseRow): RuntimeLease {
  return {
    id: row.id,
    runId: row.run_id,
    role: row.role,
    workItemId: row.work_item_id ?? undefined,
    planId: row.plan_id ?? undefined,
    model: row.model,
    tokenUsage: JSON.parse(row.token_usage) as RuntimeLease['tokenUsage'],
    lastHeartbeat: row.last_heartbeat,
    active: row.active === 1,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
  };
}

// ---------------------------------------------------------------------------
// SqliteStorage
// ---------------------------------------------------------------------------

export class SqliteStorage implements SisuStorage {
  private readonly db: Database.Database;
  private roles: RoleDefinition[] = [];
  private workflows: WorkflowTemplate[] = [];

  constructor(
    dbPath: string,
    options?: { roles?: RoleDefinition[]; workflows?: WorkflowTemplate[] },
  ) {
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
    this.roles = options?.roles ?? [];
    this.workflows = options?.workflows ?? [];
    this.migrate();
  }

  private migrate(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS work_items (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        description TEXT,
        status TEXT NOT NULL DEFAULT 'queued',
        version INTEGER NOT NULL DEFAULT 0,
        external_ref TEXT,
        required_capabilities TEXT NOT NULL DEFAULT '[]',
        metadata TEXT NOT NULL DEFAULT '{}',
        context TEXT NOT NULL DEFAULT '{}',
        assigned_role TEXT,
        assigned_run TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS execution_plans (
        id TEXT PRIMARY KEY,
        work_item_id TEXT NOT NULL,
        workflow_template_id TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS plan_steps (
        id TEXT PRIMARY KEY,
        plan_id TEXT NOT NULL REFERENCES execution_plans(id),
        workflow_step_id TEXT NOT NULL,
        role TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        run_id TEXT,
        started_at TEXT,
        completed_at TEXT,
        error TEXT,
        output TEXT
      );

      CREATE TABLE IF NOT EXISTS mail (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        from_agent TEXT NOT NULL,
        to_agent TEXT NOT NULL,
        subject TEXT NOT NULL,
        body TEXT NOT NULL,
        payload TEXT,
        work_item_id TEXT,
        plan_id TEXT,
        read INTEGER NOT NULL DEFAULT 0,
        priority TEXT NOT NULL DEFAULT 'normal',
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS leases (
        id TEXT PRIMARY KEY,
        run_id TEXT NOT NULL,
        role TEXT NOT NULL,
        work_item_id TEXT,
        plan_id TEXT,
        model TEXT NOT NULL,
        token_usage TEXT NOT NULL DEFAULT '{"inputTokens":0,"outputTokens":0,"cacheCreationTokens":0,"cacheReadTokens":0}',
        last_heartbeat TEXT NOT NULL,
        active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL,
        expires_at TEXT NOT NULL
      );
    `);
  }

  // -------------------------------------------------------------------------
  // Work Items
  // -------------------------------------------------------------------------

  createWorkItem(input: CreateWorkItemInput): Promise<WorkItem> {
    const id = newWorkItemId();
    const ts = now();
    const item: WorkItem = {
      id,
      title: input.title,
      description: input.description,
      status: input.status ?? 'queued',
      version: 0,
      externalRef: input.externalRef,
      requiredCapabilities: input.requiredCapabilities ?? [],
      metadata: input.metadata ?? {},
      context: input.context ?? {},
      assignedRole: input.assignedRole,
      assignedRun: undefined,
      createdAt: ts,
      updatedAt: ts,
    };

    this.db
      .prepare(
        `INSERT INTO work_items
          (id, title, description, status, version, external_ref, required_capabilities,
           metadata, context, assigned_role, assigned_run, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        item.id,
        item.title,
        item.description ?? null,
        item.status,
        item.version,
        item.externalRef ? JSON.stringify(item.externalRef) : null,
        JSON.stringify(item.requiredCapabilities),
        JSON.stringify(item.metadata),
        JSON.stringify(item.context),
        item.assignedRole ?? null,
        null,
        item.createdAt,
        item.updatedAt,
      );

    return Promise.resolve(item);
  }

  getWorkItem(id: string): Promise<WorkItem | null> {
    const row = this.db.prepare('SELECT * FROM work_items WHERE id = ?').get(id) as
      | WorkItemRow
      | undefined;
    return Promise.resolve(row ? rowToWorkItem(row) : null);
  }

  listWorkItems(filter?: WorkItemFilter): Promise<WorkItem[]> {
    let query = 'SELECT * FROM work_items WHERE 1=1';
    const params: unknown[] = [];

    if (filter?.status !== undefined) {
      if (Array.isArray(filter.status)) {
        query += ` AND status IN (${filter.status.map(() => '?').join(',')})`;
        params.push(...filter.status);
      } else {
        query += ' AND status = ?';
        params.push(filter.status);
      }
    }

    if (filter?.assignedRole !== undefined) {
      query += ' AND assigned_role = ?';
      params.push(filter.assignedRole);
    }

    if (filter?.externalSystem !== undefined) {
      query += ' AND json_extract(external_ref, "$.system") = ?';
      params.push(filter.externalSystem);
    }

    const rows = this.db.prepare(query).all(...params) as WorkItemRow[];
    return Promise.resolve(rows.map(rowToWorkItem));
  }

  updateWorkItem(
    id: string,
    update: UpdateWorkItemInput,
    expectedVersion?: number,
  ): Promise<WorkItem> {
    const existing = this.db.prepare('SELECT * FROM work_items WHERE id = ?').get(id) as
      | WorkItemRow
      | undefined;
    if (!existing) {
      return Promise.reject(new Error(`WorkItem not found: ${id}`));
    }

    if (expectedVersion !== undefined && existing.version !== expectedVersion) {
      return Promise.reject(
        new Error(`Version conflict: expected ${expectedVersion}, got ${existing.version}`),
      );
    }

    const current = rowToWorkItem(existing);
    const ts = now();
    const newVersion = existing.version + 1;

    const merged: WorkItem = {
      ...current,
      title: update.title ?? current.title,
      description: update.description !== undefined ? update.description : current.description,
      status: update.status ?? current.status,
      externalRef: update.externalRef !== undefined ? update.externalRef : current.externalRef,
      requiredCapabilities: update.requiredCapabilities ?? current.requiredCapabilities,
      metadata: update.metadata ?? current.metadata,
      context: update.context ?? current.context,
      assignedRole: update.assignedRole !== undefined ? update.assignedRole : current.assignedRole,
      assignedRun: update.assignedRun !== undefined ? update.assignedRun : current.assignedRun,
      version: newVersion,
      updatedAt: ts,
    };

    this.db
      .prepare(
        `UPDATE work_items SET
          title = ?, description = ?, status = ?, version = ?, external_ref = ?,
          required_capabilities = ?, metadata = ?, context = ?,
          assigned_role = ?, assigned_run = ?, updated_at = ?
         WHERE id = ? AND version = ?`,
      )
      .run(
        merged.title,
        merged.description ?? null,
        merged.status,
        merged.version,
        merged.externalRef ? JSON.stringify(merged.externalRef) : null,
        JSON.stringify(merged.requiredCapabilities),
        JSON.stringify(merged.metadata),
        JSON.stringify(merged.context),
        merged.assignedRole ?? null,
        merged.assignedRun ?? null,
        merged.updatedAt,
        id,
        existing.version,
      );

    return Promise.resolve(merged);
  }

  // -------------------------------------------------------------------------
  // Execution Plans
  // -------------------------------------------------------------------------

  createPlan(input: CreatePlanInput): Promise<ExecutionPlan> {
    const id = newPlanId();
    const ts = now();

    this.db
      .prepare(
        `INSERT INTO execution_plans (id, work_item_id, workflow_template_id, status, created_at, updated_at)
         VALUES (?, ?, ?, 'pending', ?, ?)`,
      )
      .run(id, input.workItemId, input.workflowTemplateId, ts, ts);

    const steps: ExecutionPlanStep[] = input.steps.map((s) => {
      const stepId = `step_${id}_${s.workflowStepId}`;
      this.db
        .prepare(
          `INSERT INTO plan_steps (id, plan_id, workflow_step_id, role, status)
           VALUES (?, ?, ?, ?, 'pending')`,
        )
        .run(stepId, id, s.workflowStepId, s.role);

      return {
        id: stepId,
        workflowStepId: s.workflowStepId,
        role: s.role,
        status: 'pending' as const,
      };
    });

    const plan: ExecutionPlan = {
      id,
      workItemId: input.workItemId,
      workflowTemplateId: input.workflowTemplateId,
      status: 'pending',
      steps,
      createdAt: ts,
      updatedAt: ts,
    };

    return Promise.resolve(plan);
  }

  getPlan(id: string): Promise<ExecutionPlan | null> {
    const planRow = this.db.prepare('SELECT * FROM execution_plans WHERE id = ?').get(id) as
      | PlanRow
      | undefined;
    if (!planRow) return Promise.resolve(null);

    const stepRows = this.db
      .prepare('SELECT * FROM plan_steps WHERE plan_id = ?')
      .all(id) as PlanStepRow[];

    return Promise.resolve(rowToPlan(planRow, stepRows));
  }

  getPlanByWorkItem(workItemId: string): Promise<ExecutionPlan | null> {
    const planRow = this.db
      .prepare(
        'SELECT * FROM execution_plans WHERE work_item_id = ? ORDER BY rowid DESC LIMIT 1',
      )
      .get(workItemId) as PlanRow | undefined;
    if (!planRow) return Promise.resolve(null);

    const stepRows = this.db
      .prepare('SELECT * FROM plan_steps WHERE plan_id = ?')
      .all(planRow.id) as PlanStepRow[];

    return Promise.resolve(rowToPlan(planRow, stepRows));
  }

  updatePlanStep(planId: string, stepId: string, update: StepUpdate): Promise<ExecutionPlan> {
    const planRow = this.db.prepare('SELECT * FROM execution_plans WHERE id = ?').get(planId) as
      | PlanRow
      | undefined;
    if (!planRow) {
      return Promise.reject(new Error(`ExecutionPlan not found: ${planId}`));
    }

    const stepRow = this.db
      .prepare('SELECT * FROM plan_steps WHERE id = ? AND plan_id = ?')
      .get(stepId, planId) as PlanStepRow | undefined;
    if (!stepRow) {
      return Promise.reject(new Error(`PlanStep not found: ${stepId}`));
    }

    this.db
      .prepare(
        `UPDATE plan_steps SET
          status = COALESCE(?, status),
          run_id = COALESCE(?, run_id),
          started_at = COALESCE(?, started_at),
          completed_at = COALESCE(?, completed_at),
          error = COALESCE(?, error),
          output = COALESCE(?, output)
         WHERE id = ? AND plan_id = ?`,
      )
      .run(
        update.status ?? null,
        update.runId ?? null,
        update.startedAt ?? null,
        update.completedAt ?? null,
        update.error ?? null,
        update.output ? JSON.stringify(update.output) : null,
        stepId,
        planId,
      );

    // Recompute plan status from steps
    const allSteps = this.db
      .prepare('SELECT * FROM plan_steps WHERE plan_id = ?')
      .all(planId) as PlanStepRow[];

    const statuses = allSteps.map((s) => s.status);
    let planStatus: ExecutionPlan['status'] = 'pending';
    if (statuses.some((s) => s === 'failed')) {
      planStatus = 'failed';
    } else if (statuses.every((s) => s === 'done' || s === 'skipped')) {
      planStatus = 'done';
    } else if (statuses.some((s) => s === 'running')) {
      planStatus = 'running';
    }

    const ts = now();
    this.db
      .prepare('UPDATE execution_plans SET status = ?, updated_at = ? WHERE id = ?')
      .run(planStatus, ts, planId);

    const updatedPlanRow: PlanRow = { ...planRow, status: planStatus, updated_at: ts };
    return Promise.resolve(rowToPlan(updatedPlanRow, allSteps));
  }

  // -------------------------------------------------------------------------
  // Mail
  // -------------------------------------------------------------------------

  sendMail(input: CreateMailInput): Promise<AgentMail> {
    const id = newMailId();
    const ts = now();
    const mail: AgentMail = {
      id,
      type: input.type,
      from: input.from,
      to: input.to,
      subject: input.subject,
      body: input.body,
      payload: input.payload,
      workItemId: input.workItemId,
      planId: input.planId,
      read: false,
      priority: input.priority ?? 'normal',
      createdAt: ts,
    };

    this.db
      .prepare(
        `INSERT INTO mail
          (id, type, from_agent, to_agent, subject, body, payload, work_item_id, plan_id, read, priority, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`,
      )
      .run(
        mail.id,
        mail.type,
        mail.from,
        mail.to,
        mail.subject,
        mail.body,
        mail.payload ? JSON.stringify(mail.payload) : null,
        mail.workItemId ?? null,
        mail.planId ?? null,
        mail.priority,
        mail.createdAt,
      );

    return Promise.resolve(mail);
  }

  listMail(filter: MailFilter): Promise<AgentMail[]> {
    let query = 'SELECT * FROM mail WHERE 1=1';
    const params: unknown[] = [];

    if (filter.to !== undefined) {
      query += ' AND to_agent = ?';
      params.push(filter.to);
    }

    if (filter.from !== undefined) {
      query += ' AND from_agent = ?';
      params.push(filter.from);
    }

    if (filter.read !== undefined) {
      query += ' AND read = ?';
      params.push(filter.read ? 1 : 0);
    }

    if (filter.workItemId !== undefined) {
      query += ' AND work_item_id = ?';
      params.push(filter.workItemId);
    }

    if (filter.type !== undefined) {
      query += ' AND type = ?';
      params.push(filter.type);
    }

    query += ' ORDER BY created_at ASC';

    const rows = this.db.prepare(query).all(...params) as MailRow[];
    return Promise.resolve(rows.map(rowToMail));
  }

  markRead(mailId: string): Promise<void> {
    this.db.prepare('UPDATE mail SET read = 1 WHERE id = ?').run(mailId);
    return Promise.resolve();
  }

  // -------------------------------------------------------------------------
  // Leases
  // -------------------------------------------------------------------------

  createLease(input: CreateLeaseInput): Promise<RuntimeLease> {
    const id = newLeaseId();
    const ts = now();
    const ttl = input.ttlSeconds ?? 60;
    const expiresAt = new Date(Date.now() + ttl * 1000).toISOString();

    const lease: RuntimeLease = {
      id,
      runId: input.runId,
      role: input.role,
      workItemId: input.workItemId,
      planId: input.planId,
      model: input.model,
      tokenUsage: { inputTokens: 0, outputTokens: 0, cacheCreationTokens: 0, cacheReadTokens: 0 },
      lastHeartbeat: ts,
      active: true,
      createdAt: ts,
      expiresAt,
    };

    this.db
      .prepare(
        `INSERT INTO leases
          (id, run_id, role, work_item_id, plan_id, model, token_usage, last_heartbeat, active, created_at, expires_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
      )
      .run(
        lease.id,
        lease.runId,
        lease.role,
        lease.workItemId ?? null,
        lease.planId ?? null,
        lease.model,
        JSON.stringify(lease.tokenUsage),
        lease.lastHeartbeat,
        lease.createdAt,
        lease.expiresAt,
      );

    return Promise.resolve(lease);
  }

  getLease(id: string): Promise<RuntimeLease | null> {
    const row = this.db.prepare('SELECT * FROM leases WHERE id = ?').get(id) as
      | LeaseRow
      | undefined;
    return Promise.resolve(row ? rowToLease(row) : null);
  }

  updateLease(id: string, update: LeaseUpdate): Promise<RuntimeLease> {
    const row = this.db.prepare('SELECT * FROM leases WHERE id = ?').get(id) as
      | LeaseRow
      | undefined;
    if (!row) {
      return Promise.reject(new Error(`Lease not found: ${id}`));
    }

    this.db
      .prepare(
        `UPDATE leases SET
          last_heartbeat = COALESCE(?, last_heartbeat),
          active = COALESCE(?, active),
          token_usage = COALESCE(?, token_usage),
          expires_at = COALESCE(?, expires_at)
         WHERE id = ?`,
      )
      .run(
        update.lastHeartbeat ?? null,
        update.active !== undefined ? (update.active ? 1 : 0) : null,
        update.tokenUsage ? JSON.stringify(update.tokenUsage) : null,
        update.expiresAt ?? null,
        id,
      );

    const updated = this.db.prepare('SELECT * FROM leases WHERE id = ?').get(id) as LeaseRow;
    return Promise.resolve(rowToLease(updated));
  }

  listLeases(filter?: LeaseFilter): Promise<RuntimeLease[]> {
    let query = 'SELECT * FROM leases WHERE 1=1';
    const params: unknown[] = [];

    if (filter?.role !== undefined) {
      query += ' AND role = ?';
      params.push(filter.role);
    }

    if (filter?.workItemId !== undefined) {
      query += ' AND work_item_id = ?';
      params.push(filter.workItemId);
    }

    if (filter?.active !== undefined) {
      query += ' AND active = ?';
      params.push(filter.active ? 1 : 0);
    }

    const rows = this.db.prepare(query).all(...params) as LeaseRow[];
    return Promise.resolve(rows.map(rowToLease));
  }

  // -------------------------------------------------------------------------
  // Roles (in-memory, populated from registry)
  // -------------------------------------------------------------------------

  listRoles(): Promise<RoleDefinition[]> {
    return Promise.resolve([...this.roles]);
  }

  getRole(id: string): Promise<RoleDefinition | null> {
    return Promise.resolve(this.roles.find((r) => r.id === id) ?? null);
  }

  // -------------------------------------------------------------------------
  // Workflows (in-memory, populated from templates)
  // -------------------------------------------------------------------------

  listWorkflows(): Promise<WorkflowTemplate[]> {
    return Promise.resolve([...this.workflows]);
  }

  getWorkflow(id: string): Promise<WorkflowTemplate | null> {
    return Promise.resolve(this.workflows.find((w) => w.id === id) ?? null);
  }

  // -------------------------------------------------------------------------
  // Lifecycle
  // -------------------------------------------------------------------------

  close(): void {
    this.db.close();
  }
}
