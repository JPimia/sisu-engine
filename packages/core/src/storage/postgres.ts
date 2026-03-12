import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
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
import type { Pool } from 'pg';
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
// Row types (raw DB rows — JSONB returns parsed objects, TIMESTAMPTZ returns Date)
// ---------------------------------------------------------------------------

interface WorkItemRow {
  id: string;
  title: string;
  description: string | null;
  status: string;
  version: number;
  external_ref: WorkItem['externalRef'] | null;
  required_capabilities: string[];
  metadata: Record<string, unknown>;
  context: Record<string, unknown>;
  assigned_role: string | null;
  assigned_run: string | null;
  created_at: Date;
  updated_at: Date;
}

interface PlanRow {
  id: string;
  work_item_id: string;
  workflow_template_id: string;
  status: string;
  created_at: Date;
  updated_at: Date;
}

interface PlanStepRow {
  id: string;
  plan_id: string;
  workflow_step_id: string;
  role: string;
  status: string;
  run_id: string | null;
  started_at: Date | null;
  completed_at: Date | null;
  error: string | null;
  output: Record<string, unknown> | null;
}

interface MailRow {
  id: string;
  type: string;
  from_agent: string;
  to_agent: string;
  subject: string;
  body: string;
  payload: Record<string, unknown> | null;
  work_item_id: string | null;
  plan_id: string | null;
  read: boolean;
  priority: string;
  created_at: Date;
}

interface LeaseRow {
  id: string;
  run_id: string;
  role: string;
  work_item_id: string | null;
  plan_id: string | null;
  model: string;
  token_usage: RuntimeLease['tokenUsage'];
  last_heartbeat: Date;
  active: boolean;
  created_at: Date;
  expires_at: Date;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function rowToWorkItem(row: WorkItemRow): WorkItem {
  return {
    id: row.id,
    title: row.title,
    description: row.description ?? undefined,
    status: row.status as WorkItem['status'],
    version: row.version,
    externalRef: row.external_ref ?? undefined,
    requiredCapabilities: row.required_capabilities,
    metadata: row.metadata,
    context: row.context,
    assignedRole: row.assigned_role ?? undefined,
    assignedRun: row.assigned_run ?? undefined,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

function rowToPlan(planRow: PlanRow, stepRows: PlanStepRow[]): ExecutionPlan {
  const steps: ExecutionPlanStep[] = stepRows.map((s) => ({
    id: s.id,
    workflowStepId: s.workflow_step_id,
    role: s.role,
    status: s.status as ExecutionPlanStep['status'],
    runId: s.run_id ?? undefined,
    startedAt: s.started_at?.toISOString(),
    completedAt: s.completed_at?.toISOString(),
    error: s.error ?? undefined,
    output: s.output ?? undefined,
  }));

  return {
    id: planRow.id,
    workItemId: planRow.work_item_id,
    workflowTemplateId: planRow.workflow_template_id,
    status: planRow.status as ExecutionPlan['status'],
    steps,
    createdAt: planRow.created_at.toISOString(),
    updatedAt: planRow.updated_at.toISOString(),
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
    payload: row.payload ?? undefined,
    workItemId: row.work_item_id ?? undefined,
    planId: row.plan_id ?? undefined,
    read: row.read,
    priority: row.priority as AgentMail['priority'],
    createdAt: row.created_at.toISOString(),
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
    tokenUsage: row.token_usage,
    lastHeartbeat: row.last_heartbeat.toISOString(),
    active: row.active,
    createdAt: row.created_at.toISOString(),
    expiresAt: row.expires_at.toISOString(),
  };
}

// ---------------------------------------------------------------------------
// PostgresStorage
// ---------------------------------------------------------------------------

export class PostgresStorage implements SisuStorage {
  private readonly pool: Pool;
  private roles: RoleDefinition[] = [];
  private workflows: WorkflowTemplate[] = [];

  constructor(pool: Pool, options?: { roles?: RoleDefinition[]; workflows?: WorkflowTemplate[] }) {
    this.pool = pool;
    this.roles = options?.roles ?? [];
    this.workflows = options?.workflows ?? [];
  }

  /**
   * Run numbered SQL migration files from migrations/ directory.
   * Tracks applied migrations in sisu_migrations table; skips already-applied.
   */
  static async runMigrations(pool: Pool): Promise<void> {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS sisu_migrations (
        name TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    const __filename = fileURLToPath(import.meta.url);
    const __dirname = dirname(__filename);
    const migrationsDir = join(__dirname, 'migrations');

    const files = readdirSync(migrationsDir)
      .filter((f) => f.endsWith('.sql'))
      .sort();

    for (const file of files) {
      const applied = await pool.query<{ name: string }>(
        'SELECT name FROM sisu_migrations WHERE name = $1',
        [file],
      );
      if ((applied.rowCount ?? 0) > 0) continue;

      const sql = readFileSync(join(migrationsDir, file), 'utf-8');
      await pool.query(sql);
      await pool.query('INSERT INTO sisu_migrations (name) VALUES ($1)', [file]);
    }
  }

  async close(): Promise<void> {
    await this.pool.end();
  }

  // -------------------------------------------------------------------------
  // Work Items
  // -------------------------------------------------------------------------

  async createWorkItem(input: CreateWorkItemInput): Promise<WorkItem> {
    const id = newWorkItemId();
    const ts = new Date().toISOString();
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

    await this.pool.query(
      `INSERT INTO work_items
        (id, title, description, status, version, external_ref, required_capabilities,
         metadata, context, assigned_role, assigned_run, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
      [
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
        ts,
        ts,
      ],
    );

    return item;
  }

  async getWorkItem(id: string): Promise<WorkItem | null> {
    const result = await this.pool.query<WorkItemRow>('SELECT * FROM work_items WHERE id = $1', [
      id,
    ]);
    const row = result.rows[0];
    return row ? rowToWorkItem(row) : null;
  }

  async listWorkItems(filter?: WorkItemFilter): Promise<WorkItem[]> {
    let query = 'SELECT * FROM work_items WHERE 1=1';
    const params: unknown[] = [];
    let idx = 1;

    if (filter?.status !== undefined) {
      if (Array.isArray(filter.status)) {
        const placeholders = filter.status.map(() => `$${idx++}`).join(',');
        query += ` AND status IN (${placeholders})`;
        params.push(...filter.status);
      } else {
        query += ` AND status = $${idx++}`;
        params.push(filter.status);
      }
    }

    if (filter?.assignedRole !== undefined) {
      query += ` AND assigned_role = $${idx++}`;
      params.push(filter.assignedRole);
    }

    if (filter?.externalSystem !== undefined) {
      query += ` AND external_ref->>'system' = $${idx++}`;
      params.push(filter.externalSystem);
    }

    const result = await this.pool.query<WorkItemRow>(query, params);
    return result.rows.map(rowToWorkItem);
  }

  async updateWorkItem(
    id: string,
    update: UpdateWorkItemInput,
    expectedVersion?: number,
  ): Promise<WorkItem> {
    const existing = await this.pool.query<WorkItemRow>('SELECT * FROM work_items WHERE id = $1', [
      id,
    ]);
    const row = existing.rows[0];
    if (!row) {
      throw new Error(`WorkItem not found: ${id}`);
    }

    if (expectedVersion !== undefined && row.version !== expectedVersion) {
      throw new Error(`Version conflict: expected ${expectedVersion}, got ${row.version}`);
    }

    const current = rowToWorkItem(row);
    const ts = new Date().toISOString();
    const newVersion = row.version + 1;

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

    const result = await this.pool.query(
      `UPDATE work_items SET
        title = $1, description = $2, status = $3, version = $4, external_ref = $5,
        required_capabilities = $6, metadata = $7, context = $8,
        assigned_role = $9, assigned_run = $10, updated_at = $11
       WHERE id = $12 AND version = $13`,
      [
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
        ts,
        id,
        row.version,
      ],
    );

    if ((result.rowCount ?? 0) === 0) {
      throw new Error(`Version conflict on concurrent update for WorkItem: ${id}`);
    }

    return merged;
  }

  // -------------------------------------------------------------------------
  // Execution Plans
  // -------------------------------------------------------------------------

  async createPlan(input: CreatePlanInput): Promise<ExecutionPlan> {
    const id = newPlanId();
    const ts = new Date().toISOString();
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');

      await client.query(
        `INSERT INTO execution_plans (id, work_item_id, workflow_template_id, status, created_at, updated_at)
         VALUES ($1, $2, $3, 'pending', $4, $5)`,
        [id, input.workItemId, input.workflowTemplateId, ts, ts],
      );

      const steps: ExecutionPlanStep[] = [];
      for (const s of input.steps) {
        const stepId = `step_${id}_${s.workflowStepId}`;
        await client.query(
          `INSERT INTO plan_steps (id, plan_id, workflow_step_id, role, status)
           VALUES ($1, $2, $3, $4, 'pending')`,
          [stepId, id, s.workflowStepId, s.role],
        );
        steps.push({
          id: stepId,
          workflowStepId: s.workflowStepId,
          role: s.role,
          status: 'pending' as const,
        });
      }

      await client.query('COMMIT');

      return {
        id,
        workItemId: input.workItemId,
        workflowTemplateId: input.workflowTemplateId,
        status: 'pending',
        steps,
        createdAt: ts,
        updatedAt: ts,
      };
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }

  async getPlan(id: string): Promise<ExecutionPlan | null> {
    const planResult = await this.pool.query<PlanRow>(
      'SELECT * FROM execution_plans WHERE id = $1',
      [id],
    );
    const planRow = planResult.rows[0];
    if (!planRow) return null;

    const stepsResult = await this.pool.query<PlanStepRow>(
      'SELECT * FROM plan_steps WHERE plan_id = $1',
      [id],
    );

    return rowToPlan(planRow, stepsResult.rows);
  }

  async getPlanByWorkItem(workItemId: string): Promise<ExecutionPlan | null> {
    const planResult = await this.pool.query<PlanRow>(
      'SELECT * FROM execution_plans WHERE work_item_id = $1 ORDER BY created_at DESC LIMIT 1',
      [workItemId],
    );
    const planRow = planResult.rows[0];
    if (!planRow) return null;

    const stepsResult = await this.pool.query<PlanStepRow>(
      'SELECT * FROM plan_steps WHERE plan_id = $1',
      [planRow.id],
    );

    return rowToPlan(planRow, stepsResult.rows);
  }

  async updatePlanStep(planId: string, stepId: string, update: StepUpdate): Promise<ExecutionPlan> {
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');

      const planResult = await client.query<PlanRow>(
        'SELECT * FROM execution_plans WHERE id = $1',
        [planId],
      );
      const planRow = planResult.rows[0];
      if (!planRow) {
        throw new Error(`ExecutionPlan not found: ${planId}`);
      }

      const stepResult = await client.query<PlanStepRow>(
        'SELECT * FROM plan_steps WHERE id = $1 AND plan_id = $2',
        [stepId, planId],
      );
      if (!stepResult.rows[0]) {
        throw new Error(`PlanStep not found: ${stepId}`);
      }

      await client.query(
        `UPDATE plan_steps SET
          status = COALESCE($1, status),
          run_id = COALESCE($2, run_id),
          started_at = COALESCE($3, started_at),
          completed_at = COALESCE($4, completed_at),
          error = COALESCE($5, error),
          output = COALESCE($6, output)
         WHERE id = $7 AND plan_id = $8`,
        [
          update.status ?? null,
          update.runId ?? null,
          update.startedAt ?? null,
          update.completedAt ?? null,
          update.error ?? null,
          update.output ? JSON.stringify(update.output) : null,
          stepId,
          planId,
        ],
      );

      const allStepsResult = await client.query<PlanStepRow>(
        'SELECT * FROM plan_steps WHERE plan_id = $1',
        [planId],
      );
      const allSteps = allStepsResult.rows;

      const statuses = allSteps.map((s) => s.status);
      let planStatus: ExecutionPlan['status'] = 'pending';
      if (statuses.some((s) => s === 'failed')) {
        planStatus = 'failed';
      } else if (statuses.every((s) => s === 'done' || s === 'skipped')) {
        planStatus = 'done';
      } else if (statuses.some((s) => s === 'running')) {
        planStatus = 'running';
      }

      const ts = new Date().toISOString();
      await client.query('UPDATE execution_plans SET status = $1, updated_at = $2 WHERE id = $3', [
        planStatus,
        ts,
        planId,
      ]);

      await client.query('COMMIT');

      const updatedPlanRow: PlanRow = { ...planRow, status: planStatus, updated_at: new Date(ts) };
      return rowToPlan(updatedPlanRow, allSteps);
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }

  // -------------------------------------------------------------------------
  // Mail
  // -------------------------------------------------------------------------

  async sendMail(input: CreateMailInput): Promise<AgentMail> {
    const id = newMailId();
    const ts = new Date().toISOString();

    await this.pool.query(
      `INSERT INTO mail
        (id, type, from_agent, to_agent, subject, body, payload, work_item_id, plan_id, read, priority, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, false, $10, $11)`,
      [
        id,
        input.type,
        input.from,
        input.to,
        input.subject,
        input.body,
        input.payload ? JSON.stringify(input.payload) : null,
        input.workItemId ?? null,
        input.planId ?? null,
        input.priority ?? 'normal',
        ts,
      ],
    );

    return {
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
  }

  async listMail(filter: MailFilter): Promise<AgentMail[]> {
    let query = 'SELECT * FROM mail WHERE 1=1';
    const params: unknown[] = [];
    let idx = 1;

    if (filter.to !== undefined) {
      query += ` AND to_agent = $${idx++}`;
      params.push(filter.to);
    }

    if (filter.from !== undefined) {
      query += ` AND from_agent = $${idx++}`;
      params.push(filter.from);
    }

    if (filter.read !== undefined) {
      query += ` AND read = $${idx++}`;
      params.push(filter.read);
    }

    if (filter.workItemId !== undefined) {
      query += ` AND work_item_id = $${idx++}`;
      params.push(filter.workItemId);
    }

    if (filter.type !== undefined) {
      query += ` AND type = $${idx++}`;
      params.push(filter.type);
    }

    query += ' ORDER BY created_at ASC';

    const result = await this.pool.query<MailRow>(query, params);
    return result.rows.map(rowToMail);
  }

  async markRead(mailId: string): Promise<void> {
    await this.pool.query('UPDATE mail SET read = true WHERE id = $1', [mailId]);
  }

  // -------------------------------------------------------------------------
  // Leases
  // -------------------------------------------------------------------------

  async createLease(input: CreateLeaseInput): Promise<RuntimeLease> {
    const id = newLeaseId();
    const ts = new Date().toISOString();
    const ttl = input.ttlSeconds ?? 60;
    const expiresAt = new Date(Date.now() + ttl * 1000).toISOString();

    const tokenUsage: RuntimeLease['tokenUsage'] = {
      inputTokens: 0,
      outputTokens: 0,
      cacheCreationTokens: 0,
      cacheReadTokens: 0,
    };

    await this.pool.query(
      `INSERT INTO leases
        (id, run_id, role, work_item_id, plan_id, model, token_usage, last_heartbeat, active, created_at, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, true, $9, $10)`,
      [
        id,
        input.runId,
        input.role,
        input.workItemId ?? null,
        input.planId ?? null,
        input.model,
        JSON.stringify(tokenUsage),
        ts,
        ts,
        expiresAt,
      ],
    );

    return {
      id,
      runId: input.runId,
      role: input.role,
      workItemId: input.workItemId,
      planId: input.planId,
      model: input.model,
      tokenUsage,
      lastHeartbeat: ts,
      active: true,
      createdAt: ts,
      expiresAt,
    };
  }

  async getLease(id: string): Promise<RuntimeLease | null> {
    const result = await this.pool.query<LeaseRow>('SELECT * FROM leases WHERE id = $1', [id]);
    const row = result.rows[0];
    return row ? rowToLease(row) : null;
  }

  async updateLease(id: string, update: LeaseUpdate): Promise<RuntimeLease> {
    const existing = await this.pool.query<LeaseRow>('SELECT * FROM leases WHERE id = $1', [id]);
    if (!existing.rows[0]) {
      throw new Error(`Lease not found: ${id}`);
    }

    await this.pool.query(
      `UPDATE leases SET
        last_heartbeat = COALESCE($1, last_heartbeat),
        active = COALESCE($2, active),
        token_usage = COALESCE($3, token_usage),
        expires_at = COALESCE($4, expires_at)
       WHERE id = $5`,
      [
        update.lastHeartbeat ?? null,
        update.active !== undefined ? update.active : null,
        update.tokenUsage ? JSON.stringify(update.tokenUsage) : null,
        update.expiresAt ?? null,
        id,
      ],
    );

    const updated = await this.pool.query<LeaseRow>('SELECT * FROM leases WHERE id = $1', [id]);
    const row = updated.rows[0];
    if (!row) throw new Error(`Lease disappeared after update: ${id}`);
    return rowToLease(row);
  }

  async listLeases(filter?: LeaseFilter): Promise<RuntimeLease[]> {
    let query = 'SELECT * FROM leases WHERE 1=1';
    const params: unknown[] = [];
    let idx = 1;

    if (filter?.role !== undefined) {
      query += ` AND role = $${idx++}`;
      params.push(filter.role);
    }

    if (filter?.workItemId !== undefined) {
      query += ` AND work_item_id = $${idx++}`;
      params.push(filter.workItemId);
    }

    if (filter?.active !== undefined) {
      query += ` AND active = $${idx++}`;
      params.push(filter.active);
    }

    const result = await this.pool.query<LeaseRow>(query, params);
    return result.rows.map(rowToLease);
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
}
