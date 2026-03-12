import { describe, expect, it } from 'vitest';
import { newLeaseId, newMailId, newPlanId, newRunId, newWorkItemId } from './ids.js';

describe('ID generators', () => {
  describe('newWorkItemId', () => {
    it('generates IDs with wrk_ prefix', () => {
      const id = newWorkItemId();
      expect(id).toMatch(/^wrk_[0-9A-Z]{26}$/);
    });

    it('generates unique IDs', () => {
      const ids = new Set(Array.from({ length: 100 }, () => newWorkItemId()));
      expect(ids.size).toBe(100);
    });
  });

  describe('newPlanId', () => {
    it('generates IDs with plan_ prefix', () => {
      const id = newPlanId();
      expect(id).toMatch(/^plan_[0-9A-Z]{26}$/);
    });

    it('generates unique IDs', () => {
      const ids = new Set(Array.from({ length: 100 }, () => newPlanId()));
      expect(ids.size).toBe(100);
    });
  });

  describe('newMailId', () => {
    it('generates IDs with mail_ prefix', () => {
      const id = newMailId();
      expect(id).toMatch(/^mail_[0-9A-Z]{26}$/);
    });

    it('generates unique IDs', () => {
      const ids = new Set(Array.from({ length: 100 }, () => newMailId()));
      expect(ids.size).toBe(100);
    });
  });

  describe('newRunId', () => {
    it('generates IDs with run_ prefix', () => {
      const id = newRunId();
      expect(id).toMatch(/^run_[0-9A-Z]{26}$/);
    });

    it('generates unique IDs', () => {
      const ids = new Set(Array.from({ length: 100 }, () => newRunId()));
      expect(ids.size).toBe(100);
    });
  });

  describe('newLeaseId', () => {
    it('generates IDs with lease_ prefix', () => {
      const id = newLeaseId();
      expect(id).toMatch(/^lease_[0-9A-Z]{26}$/);
    });

    it('generates unique IDs', () => {
      const ids = new Set(Array.from({ length: 100 }, () => newLeaseId()));
      expect(ids.size).toBe(100);
    });
  });

  it('all generators produce string IDs', () => {
    expect(typeof newWorkItemId()).toBe('string');
    expect(typeof newPlanId()).toBe('string');
    expect(typeof newMailId()).toBe('string');
    expect(typeof newRunId()).toBe('string');
    expect(typeof newLeaseId()).toBe('string');
  });
});
