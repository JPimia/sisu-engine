import { describe, expect, it } from 'vitest';
import { mcStatusToWorkItemStatus, mcTaskToWorkItem, workItemStatusToMcStatus } from '../mapper.js';
import type { McTask } from '../types.js';

describe('mcStatusToWorkItemStatus', () => {
  it.each([
    ['open', 'queued'],
    ['assigned', 'ready'],
    ['working', 'in_progress'],
    ['review', 'in_review'],
    ['completed', 'done'],
    ['archived', 'cancelled'],
    ['failed', 'failed'],
  ] as const)('maps %s -> %s', (mc, sisu) => {
    expect(mcStatusToWorkItemStatus(mc)).toBe(sisu);
  });
});

describe('workItemStatusToMcStatus', () => {
  it.each([
    ['queued', 'open'],
    ['ready', 'assigned'],
    ['planning', 'working'],
    ['in_progress', 'working'],
    ['in_review', 'review'],
    ['blocked', 'assigned'],
    ['done', 'completed'],
    ['failed', 'failed'],
    ['cancelled', 'archived'],
  ] as const)('maps %s -> %s', (sisu, mc) => {
    expect(workItemStatusToMcStatus(sisu)).toBe(mc);
  });
});

describe('mcTaskToWorkItem', () => {
  it('maps basic fields correctly', () => {
    const task: McTask = {
      id: 'mc-123',
      title: 'My Task',
      status: 'open',
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    };

    const result = mcTaskToWorkItem(task);

    expect(result.title).toBe('My Task');
    expect(result.status).toBe('queued');
    expect(result.externalRef).toEqual({ system: 'mission-control', id: 'mc-123' });
    expect(result.requiredCapabilities).toEqual([]);
    expect(result.context).toEqual({});
  });

  it('maps description', () => {
    const task: McTask = {
      id: 'mc-456',
      title: 'Task with desc',
      description: 'Some description',
      status: 'working',
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    };

    const result = mcTaskToWorkItem(task);

    expect(result.description).toBe('Some description');
    expect(result.status).toBe('in_progress');
  });

  it('preserves MC metadata fields', () => {
    const task: McTask = {
      id: 'mc-789',
      title: 'Full Task',
      status: 'review',
      projectId: 'proj-1',
      assignee: 'alice',
      labels: ['bug', 'urgent'],
      priority: 1,
      capabilities: ['board.tasks'],
      metadata: { extra: 'value' },
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    };

    const result = mcTaskToWorkItem(task);

    expect(result.metadata?.projectId).toBe('proj-1');
    expect(result.metadata?.assignee).toBe('alice');
    expect(result.metadata?.labels).toEqual(['bug', 'urgent']);
    expect(result.metadata?.priority).toBe(1);
    expect(result.metadata?.extra).toBe('value');
    expect(result.requiredCapabilities).toEqual(['board.tasks']);
    expect(result.status).toBe('in_review');
  });

  it('handles tasks without optional fields', () => {
    const task: McTask = {
      id: 'mc-min',
      title: 'Minimal',
      status: 'completed',
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    };

    const result = mcTaskToWorkItem(task);

    expect(result.description).toBeUndefined();
    expect(result.metadata?.projectId).toBeUndefined();
    expect(result.status).toBe('done');
  });
});
