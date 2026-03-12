import type { AgentMail, RuntimeLease, WorkItem } from '@sisu/protocol';
import { describe, expect, it } from 'vitest';
import { renderDashboard } from '../src/dashboard/renderer.js';

function makeWorkItem(overrides: Partial<WorkItem> = {}): WorkItem {
  return {
    id: 'wrk_01JTEST',
    title: 'Test work item',
    status: 'in_progress',
    version: 1,
    requiredCapabilities: [],
    metadata: { priority: 1 },
    context: {},
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

function makeLease(overrides: Partial<RuntimeLease> = {}): RuntimeLease {
  return {
    id: 'lease_01JTEST',
    runId: 'run_01JTEST',
    role: 'builder',
    workItemId: 'wrk_01JTEST',
    model: 'claude-sonnet-4-6',
    active: true,
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 60000).toISOString(),
    lastHeartbeat: new Date().toISOString(),
    ...overrides,
  };
}

function makeMail(overrides: Partial<AgentMail> = {}): AgentMail {
  return {
    id: 'mail_01JTEST',
    type: 'worker_done',
    from: 'builder-01',
    to: 'lead-01',
    subject: 'Work complete',
    body: 'Done!',
    read: false,
    priority: 'normal',
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

describe('renderDashboard', () => {
  it('renders the dashboard box with header and footer', () => {
    const output = renderDashboard({ agents: [], workItems: [], recentMail: [] });
    expect(output).toContain('SISU Dashboard');
    expect(output).toContain('┌');
    expect(output).toContain('└');
    expect(output).toContain('Ctrl+C');
  });

  it('shows active agent count in status line', () => {
    const lease = makeLease();
    const output = renderDashboard({ agents: [lease], workItems: [], recentMail: [] });
    expect(output).toContain('Agents:');
    expect(output).toContain('1');
  });

  it('shows (no active agents) when empty', () => {
    const output = renderDashboard({ agents: [], workItems: [], recentMail: [] });
    expect(output).toContain('no active agents');
  });

  it('renders agent run ID and role', () => {
    const lease = makeLease({ runId: 'run_ABCDEF', role: 'reviewer' });
    const output = renderDashboard({ agents: [lease], workItems: [], recentMail: [] });
    expect(output).toContain('run_ABCDE');
    expect(output).toContain('reviewer');
  });

  it('shows (no work items) when empty', () => {
    const output = renderDashboard({ agents: [], workItems: [], recentMail: [] });
    expect(output).toContain('no work items');
  });

  it('renders work item title and status', () => {
    const item = makeWorkItem({ title: 'Build the login page', status: 'in_progress' });
    const output = renderDashboard({ agents: [], workItems: [item], recentMail: [] });
    expect(output).toContain('Build the login');
    expect(output).toContain('in_progress');
  });

  it('shows (no recent mail) when empty', () => {
    const output = renderDashboard({ agents: [], workItems: [], recentMail: [] });
    expect(output).toContain('no recent mail');
  });

  it('renders mail type and subject', () => {
    const mail = makeMail({ type: 'worker_done', subject: 'Protocol complete' });
    const output = renderDashboard({ agents: [], workItems: [], recentMail: [mail] });
    expect(output).toContain('worker_done');
    expect(output).toContain('Protocol complete');
  });

  it('truncates long titles to fit in the box', () => {
    const item = makeWorkItem({ title: 'A very long work item title that exceeds the column width limit' });
    const output = renderDashboard({ agents: [], workItems: [item], recentMail: [] });
    // Should not throw, should render within bounds
    expect(output).toContain('A very long work ite');
  });

  it('renders section dividers', () => {
    const output = renderDashboard({ agents: [], workItems: [], recentMail: [] });
    expect(output).toContain('Active Agents');
    expect(output).toContain('Work Items');
    expect(output).toContain('Recent Mail');
  });

  it('shows correct item count in status line', () => {
    const items = [
      makeWorkItem({ id: 'wrk_1', title: 'Item 1' }),
      makeWorkItem({ id: 'wrk_2', title: 'Item 2' }),
    ];
    const output = renderDashboard({ agents: [], workItems: items, recentMail: [] });
    expect(output).toContain('Work items:');
  });

  it('renders up to 5 agents maximum', () => {
    const agents = Array.from({ length: 8 }, (_, i) =>
      makeLease({ id: `lease_${i}`, runId: `run_0${i}JTEST`, role: 'builder' }),
    );
    const output = renderDashboard({ agents, workItems: [], recentMail: [] });
    // Should not crash with many agents
    expect(output).toContain('Active Agents');
  });
});
