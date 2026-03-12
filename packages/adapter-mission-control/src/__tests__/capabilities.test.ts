import { describe, expect, it } from 'vitest';
import { getCapabilityIds, getMcCapabilities, MC_CAPABILITIES } from '../capabilities.js';

describe('MC_CAPABILITIES', () => {
  it('has exactly 5 capabilities', () => {
    expect(MC_CAPABILITIES).toHaveLength(5);
  });

  it('includes board.tasks', () => {
    expect(MC_CAPABILITIES.find((c) => c.id === 'board.tasks')).toBeDefined();
  });

  it('includes docs.read', () => {
    expect(MC_CAPABILITIES.find((c) => c.id === 'docs.read')).toBeDefined();
  });

  it('includes docs.write', () => {
    expect(MC_CAPABILITIES.find((c) => c.id === 'docs.write')).toBeDefined();
  });

  it('includes calendar.plan', () => {
    expect(MC_CAPABILITIES.find((c) => c.id === 'calendar.plan')).toBeDefined();
  });

  it('includes office.observe', () => {
    expect(MC_CAPABILITIES.find((c) => c.id === 'office.observe')).toBeDefined();
  });

  it('all entries have required fields', () => {
    for (const cap of MC_CAPABILITIES) {
      expect(cap.id).toBeTruthy();
      expect(cap.name).toBeTruthy();
      expect(cap.description).toBeTruthy();
      expect(cap.version).toBe('1.0.0');
    }
  });
});

describe('getMcCapabilities', () => {
  it('returns the full list', () => {
    const caps = getMcCapabilities();
    expect(caps).toHaveLength(5);
    expect(caps).toEqual(MC_CAPABILITIES);
  });
});

describe('getCapabilityIds', () => {
  it('returns only IDs', () => {
    const ids = getCapabilityIds();
    expect(ids).toEqual([
      'board.tasks',
      'docs.read',
      'docs.write',
      'calendar.plan',
      'office.observe',
    ]);
  });

  it('returns exactly 5 IDs', () => {
    expect(getCapabilityIds()).toHaveLength(5);
  });
});
