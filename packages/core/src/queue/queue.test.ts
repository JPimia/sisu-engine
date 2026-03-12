import { rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Job } from './queue.js';
import { Queue } from './queue.js';

function tempDb(): string {
  return join(tmpdir(), `sisu-queue-test-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);
}

describe('Queue', () => {
  let dbPath: string;
  let queue: Queue;

  beforeEach(() => {
    dbPath = tempDb();
    queue = new Queue(dbPath);
  });

  afterEach(() => {
    queue.close();
    try {
      rmSync(dbPath);
    } catch {
      /* ignore */
    }
  });

  describe('enqueue', () => {
    it('adds a job with pending status', async () => {
      const job = await queue.enqueue({ type: 'dispatch', payload: { workItemId: 'wrk_1' } });

      expect(job.id).toMatch(/^job_/);
      expect(job.type).toBe('dispatch');
      expect(job.payload).toEqual({ workItemId: 'wrk_1' });
      expect(job.status).toBe('pending');
      expect(job.createdAt).toBeTruthy();
      expect(job.updatedAt).toBeTruthy();
      expect(job.claimedAt).toBeUndefined();
      expect(job.result).toBeUndefined();
      expect(job.error).toBeUndefined();
    });

    it('supports all job types', async () => {
      const types = ['dispatch', 'spawn', 'review', 'retry'] as const;
      for (const type of types) {
        const job = await queue.enqueue({ type, payload: {} });
        expect(job.type).toBe(type);
        expect(job.status).toBe('pending');
      }
    });

    it('enqueues multiple jobs independently', async () => {
      const j1 = await queue.enqueue({ type: 'dispatch', payload: { n: 1 } });
      const j2 = await queue.enqueue({ type: 'spawn', payload: { n: 2 } });

      expect(j1.id).not.toBe(j2.id);

      const jobs = await queue.listJobs('pending');
      expect(jobs).toHaveLength(2);
    });
  });

  describe('claim', () => {
    it('claims the oldest pending job', async () => {
      await queue.enqueue({ type: 'dispatch', payload: { n: 1 } });
      await queue.enqueue({ type: 'spawn', payload: { n: 2 } });

      const job = await queue.claim();
      expect(job).not.toBeNull();
      expect(job?.status).toBe('claimed');
      expect(job?.claimedAt).toBeTruthy();
      expect(job?.payload).toEqual({ n: 1 }); // oldest first
    });

    it('returns null when no jobs available', async () => {
      const job = await queue.claim();
      expect(job).toBeNull();
    });

    it('does not double-claim the same job', async () => {
      await queue.enqueue({ type: 'dispatch', payload: {} });

      const j1 = await queue.claim();
      const j2 = await queue.claim();

      expect(j1).not.toBeNull();
      expect(j2).toBeNull(); // only one job, already claimed
    });

    it('allows claiming after first is exhausted', async () => {
      await queue.enqueue({ type: 'dispatch', payload: { n: 1 } });
      await queue.enqueue({ type: 'spawn', payload: { n: 2 } });

      const j1 = await queue.claim();
      const j2 = await queue.claim();
      const j3 = await queue.claim();

      expect(j1).not.toBeNull();
      expect(j2).not.toBeNull();
      expect(j3).toBeNull();
      expect(j1?.id).not.toBe(j2?.id);
    });

    it('skips already-claimed jobs', async () => {
      const enqueued = await queue.enqueue({ type: 'dispatch', payload: { n: 1 } });
      await queue.claim(); // claim it

      const job = await queue.getJob(enqueued.id);
      expect(job?.status).toBe('claimed');

      const next = await queue.claim();
      expect(next).toBeNull(); // no more pending
    });
  });

  describe('complete', () => {
    it('marks a claimed job as complete with result', async () => {
      await queue.enqueue({ type: 'review', payload: {} });
      const claimed = await queue.claim();

      const done = await queue.complete((claimed as Job).id, { output: { passed: true } });

      expect(done.status).toBe('complete');
      expect(done.result).toEqual({ passed: true });
      expect(done.error).toBeUndefined();
    });

    it('marks a claimed job as complete without result', async () => {
      await queue.enqueue({ type: 'dispatch', payload: {} });
      const claimed = await queue.claim();

      const done = await queue.complete((claimed as Job).id, {});

      expect(done.status).toBe('complete');
      expect(done.result).toBeUndefined();
    });

    it('rejects completing a non-existent job', async () => {
      await expect(queue.complete('job_nonexistent', {})).rejects.toThrow('Job not found');
    });

    it('rejects completing a pending job (must be claimed first)', async () => {
      const job = await queue.enqueue({ type: 'dispatch', payload: {} });
      await expect(queue.complete(job.id, {})).rejects.toThrow("status 'pending'");
    });

    it('rejects completing an already-complete job', async () => {
      await queue.enqueue({ type: 'dispatch', payload: {} });
      const claimed = await queue.claim();
      await queue.complete((claimed as Job).id, {});

      await expect(queue.complete((claimed as Job).id, {})).rejects.toThrow("status 'complete'");
    });
  });

  describe('fail', () => {
    it('marks a claimed job as failed with error message', async () => {
      await queue.enqueue({ type: 'spawn', payload: {} });
      const claimed = await queue.claim();

      const failed = await queue.fail((claimed as Job).id, 'Agent crashed');

      expect(failed.status).toBe('failed');
      expect(failed.error).toBe('Agent crashed');
    });

    it('rejects failing a non-existent job', async () => {
      await expect(queue.fail('job_nonexistent', 'err')).rejects.toThrow('Job not found');
    });

    it('rejects failing a pending job (must be claimed first)', async () => {
      const job = await queue.enqueue({ type: 'retry', payload: {} });
      await expect(queue.fail(job.id, 'err')).rejects.toThrow("status 'pending'");
    });
  });

  describe('getJob', () => {
    it('retrieves a job by ID', async () => {
      const enqueued = await queue.enqueue({ type: 'dispatch', payload: { x: 1 } });
      const fetched = await queue.getJob(enqueued.id);

      expect(fetched).not.toBeNull();
      expect(fetched?.id).toBe(enqueued.id);
      expect(fetched?.payload).toEqual({ x: 1 });
    });

    it('returns null for unknown ID', async () => {
      const job = await queue.getJob('job_unknown');
      expect(job).toBeNull();
    });
  });

  describe('listJobs', () => {
    it('lists all jobs without filter', async () => {
      await queue.enqueue({ type: 'dispatch', payload: {} });
      await queue.enqueue({ type: 'spawn', payload: {} });

      const jobs = await queue.listJobs();
      expect(jobs).toHaveLength(2);
    });

    it('filters by status', async () => {
      await queue.enqueue({ type: 'dispatch', payload: {} });
      const j2 = await queue.enqueue({ type: 'spawn', payload: {} });
      await queue.claim(); // claims the first

      const pending = await queue.listJobs('pending');
      expect(pending).toHaveLength(1);
      expect((pending[0] as Job).id).toBe(j2.id);

      const claimed = await queue.listJobs('claimed');
      expect(claimed).toHaveLength(1);
    });

    it('orders by createdAt ascending', async () => {
      const j1 = await queue.enqueue({ type: 'dispatch', payload: { n: 1 } });
      const j2 = await queue.enqueue({ type: 'spawn', payload: { n: 2 } });

      const jobs = await queue.listJobs();
      expect((jobs[0] as Job).id).toBe(j1.id);
      expect((jobs[1] as Job).id).toBe(j2.id);
    });

    it('returns empty array when no jobs match', async () => {
      const jobs = await queue.listJobs('failed');
      expect(jobs).toEqual([]);
    });
  });
});
