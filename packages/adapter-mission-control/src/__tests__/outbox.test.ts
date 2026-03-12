import { describe, expect, it, vi } from 'vitest';
import { OutboxProcessor } from '../outbox.js';
import type { OutboxEntry } from '../types.js';

function makeEntry(
  overrides?: Partial<Omit<OutboxEntry, 'id' | 'status' | 'attempts' | 'createdAt'>>,
): Omit<OutboxEntry, 'id' | 'status' | 'attempts' | 'createdAt'> {
  return {
    eventType: 'work_item.status_changed',
    payload: { workItemId: 'wrk_01ABCDE', newStatus: 'done' },
    targetUrl: 'https://mc.example.com/webhook',
    maxAttempts: 3,
    ...overrides,
  };
}

describe('OutboxProcessor', () => {
  describe('enqueue', () => {
    it('creates entry with pending status and zero attempts', () => {
      const processor = new OutboxProcessor();
      const entry = processor.enqueue(makeEntry());

      expect(entry.id).toBeTruthy();
      expect(entry.status).toBe('pending');
      expect(entry.attempts).toBe(0);
      expect(entry.createdAt).toBeTruthy();
    });

    it('generates unique IDs', () => {
      const processor = new OutboxProcessor();
      const a = processor.enqueue(makeEntry());
      const b = processor.enqueue(makeEntry());
      expect(a.id).not.toBe(b.id);
    });
  });

  describe('getByStatus', () => {
    it('returns only entries with matching status', () => {
      const processor = new OutboxProcessor();
      const e1 = processor.enqueue(makeEntry());
      const e2 = processor.enqueue(makeEntry());
      processor.markDelivered(e1.id);

      expect(processor.getByStatus('pending').map((e) => e.id)).toContain(e2.id);
      expect(processor.getByStatus('delivered').map((e) => e.id)).toContain(e1.id);
    });
  });

  describe('markDelivered', () => {
    it('sets status to delivered and records lastAttemptAt', () => {
      const processor = new OutboxProcessor();
      const entry = processor.enqueue(makeEntry());
      processor.markDelivered(entry.id);

      const [delivered] = processor.getByStatus('delivered');
      expect(delivered?.status).toBe('delivered');
      expect(delivered?.lastAttemptAt).toBeTruthy();
    });

    it('does nothing for unknown id', () => {
      const processor = new OutboxProcessor();
      expect(() => processor.markDelivered('nope')).not.toThrow();
    });
  });

  describe('markFailed', () => {
    it('increments attempts and sets nextAttemptAt when under maxAttempts', () => {
      const processor = new OutboxProcessor();
      const entry = processor.enqueue(makeEntry({ maxAttempts: 3 }));
      processor.markFailed(entry.id);

      const [pending] = processor.getByStatus('pending');
      expect(pending?.attempts).toBe(1);
      expect(pending?.nextAttemptAt).toBeTruthy();
      expect(pending?.status).toBe('pending');
    });

    it('sets status to failed when maxAttempts reached', () => {
      const processor = new OutboxProcessor();
      const entry = processor.enqueue(makeEntry({ maxAttempts: 2 }));
      processor.markFailed(entry.id); // attempts=1
      processor.markFailed(entry.id); // attempts=2 >= maxAttempts

      const failed = processor.getByStatus('failed');
      expect(failed).toHaveLength(1);
      expect(failed[0]?.attempts).toBe(2);
    });

    it('does nothing for unknown id', () => {
      const processor = new OutboxProcessor();
      expect(() => processor.markFailed('nope')).not.toThrow();
    });
  });

  describe('processPending', () => {
    it('delivers entries and returns count', async () => {
      const processor = new OutboxProcessor();
      processor.enqueue(makeEntry());
      processor.enqueue(makeEntry());

      const result = await processor.processPending(async () => true);

      expect(result.delivered).toBe(2);
      expect(result.failed).toBe(0);
      expect(processor.getByStatus('delivered')).toHaveLength(2);
    });

    it('marks entries as failed when handler returns false', async () => {
      const processor = new OutboxProcessor();
      const entry = processor.enqueue(makeEntry({ maxAttempts: 1 }));

      const result = await processor.processPending(async () => false);

      expect(result.delivered).toBe(0);
      expect(result.failed).toBe(1);
      expect(processor.getByStatus('failed').map((e) => e.id)).toContain(entry.id);
    });

    it('handles handler throwing an exception', async () => {
      const processor = new OutboxProcessor();
      processor.enqueue(makeEntry({ maxAttempts: 1 }));

      const result = await processor.processPending(async () => {
        throw new Error('Network error');
      });

      expect(result.failed).toBe(1);
    });

    it('skips entries not yet due for retry', async () => {
      const processor = new OutboxProcessor();
      const entry = processor.enqueue(
        makeEntry({
          maxAttempts: 3,
          nextAttemptAt: new Date(Date.now() + 60_000).toISOString(),
        }),
      );

      const handler = vi.fn().mockResolvedValue(true);
      const result = await processor.processPending(handler);

      expect(result.delivered).toBe(0);
      expect(handler).not.toHaveBeenCalled();
      // Still pending
      expect(processor.getByStatus('pending').map((e) => e.id)).toContain(entry.id);
    });

    it('skips already delivered entries', async () => {
      const processor = new OutboxProcessor();
      const entry = processor.enqueue(makeEntry());
      processor.markDelivered(entry.id);

      const handler = vi.fn().mockResolvedValue(true);
      await processor.processPending(handler);

      expect(handler).not.toHaveBeenCalled();
    });

    it('applies exponential backoff on repeated failure', () => {
      const processor = new OutboxProcessor();
      const entry = processor.enqueue(makeEntry({ maxAttempts: 5 }));

      processor.markFailed(entry.id); // attempts=1, delay=2s
      const [afterFirst] = processor.getByStatus('pending');
      const firstDelay = new Date(afterFirst?.nextAttemptAt ?? '').getTime() - Date.now();
      expect(firstDelay).toBeGreaterThan(1500);
      expect(firstDelay).toBeLessThan(2500);
    });
  });
});
