import type { WorkflowTemplate, WorkItem } from '@sisu/protocol';
import { describe, expect, it } from 'vitest';
import { selectWorkflow } from './workflow-selector.js';

function makeWorkItem(overrides: Partial<WorkItem> = {}): WorkItem {
  return {
    id: 'wrk_TEST',
    title: 'Test',
    status: 'ready',
    version: 0,
    requiredCapabilities: [],
    metadata: {},
    context: {},
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

function makeWorkflow(id: string, appliesTo: WorkItem['status'][] = []): WorkflowTemplate {
  return {
    id,
    name: id,
    version: '1.0.0',
    steps: [],
    appliesTo,
    requiredCapabilities: [],
  };
}

describe('selectWorkflow', () => {
  it('returns explicit workflowTemplateId from context when present', () => {
    const wf1 = makeWorkflow('wf_custom');
    const wf2 = makeWorkflow('wf_other');
    const item = makeWorkItem({ context: { workflowTemplateId: 'wf_custom' } });
    expect(selectWorkflow(item, [wf1, wf2])).toBe(wf1);
  });

  it('ignores explicit id if it does not match any workflow', () => {
    const wf = makeWorkflow('wf_simple-task', ['ready']);
    const item = makeWorkItem({ status: 'ready', context: { workflowTemplateId: 'wf_missing' } });
    expect(selectWorkflow(item, [wf])).toBe(wf);
  });

  it('falls back to appliesTo match when no explicit id', () => {
    const wf = makeWorkflow('wf_review', ['in_review']);
    const item = makeWorkItem({ status: 'in_review' });
    expect(selectWorkflow(item, [wf])).toBe(wf);
  });

  it('returns default wf_simple-task when nothing matches', () => {
    const dflt = makeWorkflow('wf_simple-task', []);
    const other = makeWorkflow('wf_review', ['in_review']);
    const item = makeWorkItem({ status: 'ready' });
    expect(selectWorkflow(item, [other, dflt])).toBe(dflt);
  });

  it('returns first workflow when no match and no default', () => {
    const wf = makeWorkflow('wf_only', []);
    const item = makeWorkItem({ status: 'planning' });
    expect(selectWorkflow(item, [wf])).toBe(wf);
  });

  it('throws when workflow list is empty', () => {
    const item = makeWorkItem();
    expect(() => selectWorkflow(item, [])).toThrow(/No workflow template found/);
  });

  it('explicit id takes precedence over appliesTo match', () => {
    const explicit = makeWorkflow('wf_explicit', []);
    const byStatus = makeWorkflow('wf_by-status', ['ready']);
    const item = makeWorkItem({
      status: 'ready',
      context: { workflowTemplateId: 'wf_explicit' },
    });
    expect(selectWorkflow(item, [explicit, byStatus])).toBe(explicit);
  });
});
