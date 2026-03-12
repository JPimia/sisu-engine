import { randomUUID } from 'node:crypto';
import Database from 'better-sqlite3';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type JobType = 'dispatch' | 'spawn' | 'review' | 'retry';
export type JobStatus = 'pending' | 'claimed' | 'complete' | 'failed';

export interface Job {
  id: string;
  type: JobType;
  payload: Record<string, unknown>;
  status: JobStatus;
  result?: Record<string, unknown> | undefined;
  error?: string | undefined;
  createdAt: string;
  updatedAt: string;
  claimedAt?: string | undefined;
}

export interface EnqueueInput {
  type: JobType;
  payload: Record<string, unknown>;
}

export interface JobResult {
  output?: Record<string, unknown> | undefined;
}

// ---------------------------------------------------------------------------
// Row type
// ---------------------------------------------------------------------------

interface JobRow {
  id: string;
  type: string;
  payload: string;
  status: string;
  result: string | null;
  error: string | null;
  created_at: string;
  updated_at: string;
  claimed_at: string | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function now(): string {
  return new Date().toISOString();
}

function newJobId(): string {
  return `job_${randomUUID().replace(/-/g, '')}`;
}

function rowToJob(row: JobRow): Job {
  return {
    id: row.id,
    type: row.type as JobType,
    payload: JSON.parse(row.payload) as Record<string, unknown>,
    status: row.status as JobStatus,
    result: row.result ? (JSON.parse(row.result) as Record<string, unknown>) : undefined,
    error: row.error ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    claimedAt: row.claimed_at ?? undefined,
  };
}

// ---------------------------------------------------------------------------
// Queue
// ---------------------------------------------------------------------------

/**
 * SQLite-backed job queue.
 *
 * Supports enqueue, claim (atomic, no double-claim), complete, and fail.
 * Job types: dispatch, spawn, review, retry.
 */
export class Queue {
  private readonly db: Database.Database;

  constructor(dbPath: string) {
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
    this.migrate();
  }

  private migrate(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS jobs (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        payload TEXT NOT NULL DEFAULT '{}',
        status TEXT NOT NULL DEFAULT 'pending',
        result TEXT,
        error TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        claimed_at TEXT
      );

      CREATE INDEX IF NOT EXISTS jobs_status_created ON jobs(status, created_at);
    `);
  }

  /**
   * Add a new job to the queue.
   */
  enqueue(input: EnqueueInput): Promise<Job> {
    const id = newJobId();
    const ts = now();

    const job: Job = {
      id,
      type: input.type,
      payload: input.payload,
      status: 'pending',
      createdAt: ts,
      updatedAt: ts,
    };

    this.db
      .prepare(
        `INSERT INTO jobs (id, type, payload, status, created_at, updated_at)
         VALUES (?, ?, ?, 'pending', ?, ?)`,
      )
      .run(id, job.type, JSON.stringify(job.payload), ts, ts);

    return Promise.resolve(job);
  }

  /**
   * Claim the next available pending job atomically.
   * Returns null if no jobs are available.
   */
  claim(): Promise<Job | null> {
    const claimJob = this.db.transaction(() => {
      const row = this.db
        .prepare(`SELECT * FROM jobs WHERE status = 'pending' ORDER BY created_at ASC LIMIT 1`)
        .get() as JobRow | undefined;

      if (!row) return null;

      const ts = now();
      this.db
        .prepare(
          `UPDATE jobs SET status = 'claimed', claimed_at = ?, updated_at = ? WHERE id = ? AND status = 'pending'`,
        )
        .run(ts, ts, row.id);

      // Re-fetch to confirm claim succeeded (guards against race in concurrent processes)
      const updated = this.db
        .prepare(`SELECT * FROM jobs WHERE id = ? AND status = 'claimed'`)
        .get(row.id) as JobRow | undefined;

      return updated ? rowToJob(updated) : null;
    });

    return Promise.resolve(claimJob());
  }

  /**
   * Mark a claimed job as complete with an optional result.
   */
  complete(jobId: string, result: JobResult): Promise<Job> {
    const row = this.db.prepare('SELECT * FROM jobs WHERE id = ?').get(jobId) as JobRow | undefined;
    if (!row) {
      return Promise.reject(new Error(`Job not found: ${jobId}`));
    }
    if (row.status !== 'claimed') {
      return Promise.reject(
        new Error(`Cannot complete job in status '${row.status}': must be 'claimed'`),
      );
    }

    const ts = now();
    this.db
      .prepare(`UPDATE jobs SET status = 'complete', result = ?, updated_at = ? WHERE id = ?`)
      .run(result.output ? JSON.stringify(result.output) : null, ts, jobId);

    const updated = this.db.prepare('SELECT * FROM jobs WHERE id = ?').get(jobId) as JobRow;
    return Promise.resolve(rowToJob(updated));
  }

  /**
   * Mark a claimed job as failed with an error message.
   */
  fail(jobId: string, error: string): Promise<Job> {
    const row = this.db.prepare('SELECT * FROM jobs WHERE id = ?').get(jobId) as JobRow | undefined;
    if (!row) {
      return Promise.reject(new Error(`Job not found: ${jobId}`));
    }
    if (row.status !== 'claimed') {
      return Promise.reject(
        new Error(`Cannot fail job in status '${row.status}': must be 'claimed'`),
      );
    }

    const ts = now();
    this.db
      .prepare(`UPDATE jobs SET status = 'failed', error = ?, updated_at = ? WHERE id = ?`)
      .run(error, ts, jobId);

    const updated = this.db.prepare('SELECT * FROM jobs WHERE id = ?').get(jobId) as JobRow;
    return Promise.resolve(rowToJob(updated));
  }

  /**
   * Get a job by ID.
   */
  getJob(jobId: string): Promise<Job | null> {
    const row = this.db.prepare('SELECT * FROM jobs WHERE id = ?').get(jobId) as JobRow | undefined;
    return Promise.resolve(row ? rowToJob(row) : null);
  }

  /**
   * List jobs by status.
   */
  listJobs(status?: JobStatus): Promise<Job[]> {
    let query = 'SELECT * FROM jobs';
    const params: unknown[] = [];

    if (status !== undefined) {
      query += ' WHERE status = ?';
      params.push(status);
    }

    query += ' ORDER BY created_at ASC';

    const rows = this.db.prepare(query).all(...params) as JobRow[];
    return Promise.resolve(rows.map(rowToJob));
  }

  close(): void {
    this.db.close();
  }
}
