import type { OutboxEntry } from './types.js';

// ---------------------------------------------------------------------------
// OutboxProcessor
// ---------------------------------------------------------------------------

let _idCounter = 0;

function generateId(): string {
  _idCounter += 1;
  return `outbox_${Date.now()}_${_idCounter}`;
}

/**
 * In-memory outbox processor.
 *
 * Queues outgoing webhook events and delivers them with exponential backoff
 * retry logic. Entries that exceed maxAttempts are marked as 'failed'.
 */
export class OutboxProcessor {
  private readonly entries: OutboxEntry[] = [];

  /**
   * Add a new entry to the outbox queue.
   */
  enqueue(entry: Omit<OutboxEntry, 'id' | 'status' | 'attempts' | 'createdAt'>): OutboxEntry {
    const now = new Date().toISOString();
    const outboxEntry: OutboxEntry = {
      id: generateId(),
      eventType: entry.eventType,
      payload: entry.payload,
      targetUrl: entry.targetUrl,
      status: 'pending',
      attempts: 0,
      maxAttempts: entry.maxAttempts,
      nextAttemptAt: entry.nextAttemptAt,
      createdAt: now,
    };
    this.entries.push(outboxEntry);
    return outboxEntry;
  }

  /**
   * Process all pending entries.
   * Calls `handler` for each pending entry.
   * - On success (handler returns true): marks entry as delivered.
   * - On failure (handler returns false or throws): applies exponential backoff.
   */
  async processPending(
    handler: (entry: OutboxEntry) => Promise<boolean>,
  ): Promise<{ delivered: number; failed: number }> {
    const now = new Date();
    const pending = this.entries.filter((e) => {
      if (e.status !== 'pending') return false;
      if (e.nextAttemptAt !== undefined && new Date(e.nextAttemptAt) > now) return false;
      return true;
    });

    let delivered = 0;
    let failed = 0;

    for (const entry of pending) {
      try {
        const success = await handler(entry);
        if (success) {
          this.markDelivered(entry.id);
          delivered += 1;
        } else {
          this.markFailed(entry.id);
          if (entry.status === 'failed') {
            failed += 1;
          }
        }
      } catch {
        this.markFailed(entry.id);
        if (this._getEntry(entry.id)?.status === 'failed') {
          failed += 1;
        }
      }
    }

    return { delivered, failed };
  }

  /**
   * Get all entries with the given status.
   */
  getByStatus(status: OutboxEntry['status']): OutboxEntry[] {
    return this.entries.filter((e) => e.status === status);
  }

  /**
   * Mark an entry as delivered.
   */
  markDelivered(id: string): void {
    const entry = this._getEntry(id);
    if (entry) {
      entry.status = 'delivered';
      entry.lastAttemptAt = new Date().toISOString();
    }
  }

  /**
   * Increment attempts on an entry.
   * If attempts >= maxAttempts, marks as 'failed'.
   * Otherwise keeps 'pending' and sets nextAttemptAt with exponential backoff.
   */
  markFailed(id: string): void {
    const entry = this._getEntry(id);
    if (!entry) return;

    entry.attempts += 1;
    entry.lastAttemptAt = new Date().toISOString();

    if (entry.attempts >= entry.maxAttempts) {
      entry.status = 'failed';
    } else {
      // Exponential backoff: 1s * 2^attempts (in ms)
      const delayMs = 1000 * 2 ** entry.attempts;
      entry.nextAttemptAt = new Date(Date.now() + delayMs).toISOString();
    }
  }

  private _getEntry(id: string): OutboxEntry | undefined {
    return this.entries.find((e) => e.id === id);
  }
}
