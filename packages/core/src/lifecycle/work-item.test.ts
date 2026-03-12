import { describe, expect, it } from 'vitest';
import { isTerminal, isValidTransition, transition, validNextStatuses } from './work-item.js';

describe('isValidTransition', () => {
  it('allows queued → ready', () => {
    expect(isValidTransition('queued', 'ready')).toBe(true);
  });

  it('allows queued → cancelled', () => {
    expect(isValidTransition('queued', 'cancelled')).toBe(true);
  });

  it('allows queued → failed', () => {
    expect(isValidTransition('queued', 'failed')).toBe(true);
  });

  it('rejects queued → done (invalid)', () => {
    expect(isValidTransition('queued', 'done')).toBe(false);
  });

  it('allows ready → planning', () => {
    expect(isValidTransition('ready', 'planning')).toBe(true);
  });

  it('allows planning → in_progress', () => {
    expect(isValidTransition('planning', 'in_progress')).toBe(true);
  });

  it('allows in_progress → in_review', () => {
    expect(isValidTransition('in_progress', 'in_review')).toBe(true);
  });

  it('allows in_progress → blocked', () => {
    expect(isValidTransition('in_progress', 'blocked')).toBe(true);
  });

  it('allows in_review → done', () => {
    expect(isValidTransition('in_review', 'done')).toBe(true);
  });

  it('allows in_review → in_progress (rework)', () => {
    expect(isValidTransition('in_review', 'in_progress')).toBe(true);
  });

  it('allows blocked → in_progress (retry)', () => {
    expect(isValidTransition('blocked', 'in_progress')).toBe(true);
  });

  it('allows blocked → ready', () => {
    expect(isValidTransition('blocked', 'ready')).toBe(true);
  });

  it('rejects done → anything', () => {
    expect(isValidTransition('done', 'queued')).toBe(false);
    expect(isValidTransition('done', 'in_progress')).toBe(false);
    expect(isValidTransition('done', 'cancelled')).toBe(false);
  });

  it('rejects failed → anything', () => {
    expect(isValidTransition('failed', 'queued')).toBe(false);
    expect(isValidTransition('failed', 'in_progress')).toBe(false);
  });

  it('rejects cancelled → anything', () => {
    expect(isValidTransition('cancelled', 'queued')).toBe(false);
    expect(isValidTransition('cancelled', 'done')).toBe(false);
  });

  it('rejects in_progress → queued', () => {
    expect(isValidTransition('in_progress', 'queued')).toBe(false);
  });
});

describe('transition', () => {
  it('returns target status on valid transition', () => {
    expect(transition('queued', 'ready')).toBe('ready');
    expect(transition('in_progress', 'in_review')).toBe('in_review');
  });

  it('throws on invalid transition', () => {
    expect(() => transition('done', 'queued')).toThrow('Invalid work item transition');
    expect(() => transition('done', 'queued')).toThrow('done → queued');
  });

  it('includes allowed statuses in error message', () => {
    expect(() => transition('queued', 'done')).toThrow(/Allowed from 'queued'/);
  });
});

describe('validNextStatuses', () => {
  it('returns correct next statuses for queued', () => {
    const nexts = validNextStatuses('queued');
    expect(nexts).toContain('ready');
    expect(nexts).toContain('cancelled');
    expect(nexts).toContain('failed');
    expect(nexts).not.toContain('done');
  });

  it('returns empty array for terminal statuses', () => {
    expect(validNextStatuses('done')).toHaveLength(0);
    expect(validNextStatuses('failed')).toHaveLength(0);
    expect(validNextStatuses('cancelled')).toHaveLength(0);
  });
});

describe('isTerminal', () => {
  it('returns true for done, failed, cancelled', () => {
    expect(isTerminal('done')).toBe(true);
    expect(isTerminal('failed')).toBe(true);
    expect(isTerminal('cancelled')).toBe(true);
  });

  it('returns false for non-terminal statuses', () => {
    expect(isTerminal('queued')).toBe(false);
    expect(isTerminal('ready')).toBe(false);
    expect(isTerminal('planning')).toBe(false);
    expect(isTerminal('in_progress')).toBe(false);
    expect(isTerminal('in_review')).toBe(false);
    expect(isTerminal('blocked')).toBe(false);
  });
});
