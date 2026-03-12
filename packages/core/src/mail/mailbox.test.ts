import { rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AgentMail } from '@sisu/protocol';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SqliteStorage } from '../storage/sqlite.js';
import { check, checkByWorkItem, listMail, markRead, send } from './mailbox.js';

function tempDb(): string {
  return join(tmpdir(), `sisu-mail-test-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);
}

describe('mailbox', () => {
  let dbPath: string;
  let storage: SqliteStorage;

  beforeEach(() => {
    dbPath = tempDb();
    storage = new SqliteStorage(dbPath);
  });

  afterEach(() => {
    storage.close();
    try {
      rmSync(dbPath);
    } catch {
      /* ignore */
    }
  });

  describe('send', () => {
    it('persists a mail message and returns it', async () => {
      const mail = await send(
        {
          type: 'dispatch',
          from: 'coordinator',
          to: 'builder-1',
          subject: 'New task',
          body: 'Please implement feature X',
          priority: 'normal',
        },
        storage,
      );

      expect(mail.id).toMatch(/^mail_/);
      expect(mail.type).toBe('dispatch');
      expect(mail.from).toBe('coordinator');
      expect(mail.to).toBe('builder-1');
      expect(mail.subject).toBe('New task');
      expect(mail.body).toBe('Please implement feature X');
      expect(mail.read).toBe(false);
      expect(mail.priority).toBe('normal');
      expect(mail.createdAt).toBeTruthy();
    });

    it('sends mail with payload and workItemId', async () => {
      const mail = await send(
        {
          type: 'worker_done',
          from: 'builder-1',
          to: 'lead-engine',
          subject: 'Done',
          body: 'Task complete',
          payload: { branch: 'feat/123', tests: 'passing' },
          workItemId: 'wrk_abc123',
          priority: 'high',
        },
        storage,
      );

      expect(mail.payload).toEqual({ branch: 'feat/123', tests: 'passing' });
      expect(mail.workItemId).toBe('wrk_abc123');
      expect(mail.priority).toBe('high');
    });

    it('sends mail with all MailType values', async () => {
      const types = [
        'dispatch',
        'status',
        'result',
        'question',
        'error',
        'worker_done',
        'merge_ready',
        'review_pass',
        'review_fail',
        'escalation',
      ] as const;

      for (const type of types) {
        const mail = await send({ type, from: 'a', to: 'b', subject: type, body: 'body' }, storage);
        expect(mail.type).toBe(type);
      }
    });
  });

  describe('check', () => {
    it('returns unread mail for agent', async () => {
      await send(
        { type: 'dispatch', from: 'coord', to: 'agent-a', subject: 's1', body: 'b1' },
        storage,
      );
      await send(
        { type: 'status', from: 'coord', to: 'agent-a', subject: 's2', body: 'b2' },
        storage,
      );
      await send(
        { type: 'dispatch', from: 'coord', to: 'agent-b', subject: 's3', body: 'b3' },
        storage,
      );

      const mail = await check('agent-a', storage);
      expect(mail).toHaveLength(2);
      expect(mail.every((m) => m.to === 'agent-a')).toBe(true);
      expect(mail.every((m) => m.read === false)).toBe(true);
    });

    it('excludes read mail', async () => {
      const m1 = await send(
        { type: 'dispatch', from: 'coord', to: 'agent-a', subject: 's1', body: 'b1' },
        storage,
      );
      await send(
        { type: 'status', from: 'coord', to: 'agent-a', subject: 's2', body: 'b2' },
        storage,
      );

      await markRead(m1.id, storage);

      const unread = await check('agent-a', storage);
      expect(unread).toHaveLength(1);
      expect((unread[0] as AgentMail).subject).toBe('s2');
    });

    it('returns empty array when no unread mail', async () => {
      const mail = await check('nobody', storage);
      expect(mail).toEqual([]);
    });
  });

  describe('checkByWorkItem', () => {
    it('returns all mail for a work item regardless of read status', async () => {
      const m1 = await send(
        { type: 'dispatch', from: 'c', to: 'a', subject: 's1', body: 'b1', workItemId: 'wrk_1' },
        storage,
      );
      await send(
        { type: 'status', from: 'a', to: 'c', subject: 's2', body: 'b2', workItemId: 'wrk_1' },
        storage,
      );
      await send(
        { type: 'dispatch', from: 'c', to: 'b', subject: 's3', body: 'b3', workItemId: 'wrk_2' },
        storage,
      );

      await markRead(m1.id, storage);

      const mail = await checkByWorkItem('wrk_1', storage);
      expect(mail).toHaveLength(2);
      expect(mail.every((m) => m.workItemId === 'wrk_1')).toBe(true);
    });

    it('returns empty array for unknown work item', async () => {
      const mail = await checkByWorkItem('wrk_unknown', storage);
      expect(mail).toEqual([]);
    });
  });

  describe('markRead', () => {
    it('marks a mail message as read', async () => {
      const m = await send(
        { type: 'dispatch', from: 'a', to: 'b', subject: 's', body: 'b' },
        storage,
      );
      expect(m.read).toBe(false);

      await markRead(m.id, storage);

      const readMail = await listMail({ to: 'b', read: true }, storage);
      const updated = readMail[0] as AgentMail;
      expect(updated.id).toBe(m.id);
      expect(updated.read).toBe(true);
    });

    it('does not affect other messages', async () => {
      const m1 = await send(
        { type: 'dispatch', from: 'a', to: 'b', subject: 's1', body: 'b1' },
        storage,
      );
      await send({ type: 'status', from: 'a', to: 'b', subject: 's2', body: 'b2' }, storage);

      await markRead(m1.id, storage);

      const unread = await check('b', storage);
      expect(unread).toHaveLength(1);
      expect((unread[0] as AgentMail).subject).toBe('s2');
    });
  });

  describe('listMail', () => {
    it('filters by from', async () => {
      await send(
        { type: 'dispatch', from: 'sender-a', to: 'r', subject: 's1', body: 'b1' },
        storage,
      );
      await send(
        { type: 'dispatch', from: 'sender-b', to: 'r', subject: 's2', body: 'b2' },
        storage,
      );

      const mail = await listMail({ from: 'sender-a' }, storage);
      expect(mail).toHaveLength(1);
      expect((mail[0] as AgentMail).from).toBe('sender-a');
    });

    it('filters by type', async () => {
      await send({ type: 'dispatch', from: 'a', to: 'b', subject: 's1', body: 'b1' }, storage);
      await send({ type: 'error', from: 'a', to: 'b', subject: 's2', body: 'b2' }, storage);

      const errors = await listMail({ type: 'error' }, storage);
      expect(errors).toHaveLength(1);
      expect((errors[0] as AgentMail).type).toBe('error');
    });

    it('returns all mail with empty filter', async () => {
      await send({ type: 'dispatch', from: 'a', to: 'b', subject: 's1', body: 'b1' }, storage);
      await send({ type: 'status', from: 'b', to: 'a', subject: 's2', body: 'b2' }, storage);

      const all = await listMail({}, storage);
      expect(all).toHaveLength(2);
    });

    it('orders by createdAt ascending', async () => {
      await send({ type: 'dispatch', from: 'a', to: 'b', subject: 'first', body: 'b1' }, storage);
      await send({ type: 'status', from: 'a', to: 'b', subject: 'second', body: 'b2' }, storage);

      const mail = await listMail({ to: 'b' }, storage);
      expect((mail[0] as AgentMail).subject).toBe('first');
      expect((mail[1] as AgentMail).subject).toBe('second');
    });
  });
});
