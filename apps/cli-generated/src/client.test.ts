import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, SisuApiClient } from './client.js';

// Minimal fake WorkItem for assertions
const fakeWorkItem = {
  id: 'wrk_01HQZXVB3K5DFGHJKLMNPQRSTU',
  title: 'Test',
  status: 'queued',
  version: 0,
  requiredCapabilities: [],
  metadata: {},
  context: {},
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const fakemail = {
  id: 'mail_01HQZXVB3K5DFGHJKLMNPQRSTU',
  type: 'status',
  from: 'agent-a',
  to: 'agent-b',
  subject: 'hello',
  body: 'world',
  read: false,
  priority: 'normal',
  createdAt: '2026-01-01T00:00:00.000Z',
};

function mockFetch(body: unknown, status = 200) {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: status >= 200 && status < 300,
      status,
      json: () => Promise.resolve(body),
    }),
  );
}

describe('SisuApiClient', () => {
  let client: SisuApiClient;

  beforeEach(() => {
    client = new SisuApiClient('http://localhost:3000/v1');
  });

  it('getHealth calls GET /health', async () => {
    const resp = { status: 'ok', timestamp: '2026-01-01T00:00:00.000Z' };
    mockFetch(resp);
    const result = await client.getHealth();
    expect(result).toEqual(resp);
    const call = vi.mocked(fetch).mock.calls[0];
    expect(call?.[0]).toBe('http://localhost:3000/v1/health');
    expect(call?.[1]?.method).toBe('GET');
  });

  it('getReady calls GET /ready', async () => {
    mockFetch({ status: 'ready' });
    const result = await client.getReady();
    expect(result.status).toBe('ready');
  });

  it('listWorkItems calls GET /work-items', async () => {
    mockFetch([fakeWorkItem]);
    const items = await client.listWorkItems({ status: 'queued' });
    expect(items).toHaveLength(1);
    const call = vi.mocked(fetch).mock.calls[0];
    expect(String(call?.[0])).toContain('/work-items?status=queued');
  });

  it('createWorkItem calls POST /work-items', async () => {
    mockFetch(fakeWorkItem, 201);
    const item = await client.createWorkItem({ title: 'Test' });
    expect(item.id).toBe(fakeWorkItem.id);
    const call = vi.mocked(fetch).mock.calls[0];
    expect(call?.[1]?.method).toBe('POST');
    expect(String(call?.[0])).toContain('/work-items');
  });

  it('getWorkItem calls GET /work-items/:id', async () => {
    mockFetch(fakeWorkItem);
    const item = await client.getWorkItem('wrk_abc');
    expect(item.title).toBe('Test');
    expect(String(vi.mocked(fetch).mock.calls[0]?.[0])).toContain('/work-items/wrk_abc');
  });

  it('updateWorkItem calls PUT /work-items/:id', async () => {
    mockFetch(fakeWorkItem);
    await client.updateWorkItem('wrk_abc', { status: 'ready' });
    const call = vi.mocked(fetch).mock.calls[0];
    expect(call?.[1]?.method).toBe('PUT');
  });

  it('cancelWorkItem calls DELETE /work-items/:id', async () => {
    mockFetch(fakeWorkItem);
    await client.cancelWorkItem('wrk_abc');
    const call = vi.mocked(fetch).mock.calls[0];
    expect(call?.[1]?.method).toBe('DELETE');
  });

  it('dispatchWorkItem calls POST /work-items/:id/dispatch', async () => {
    const fakePlan = {
      id: 'plan_01HQZXVB3K5DFGHJKLMNPQRSTU',
      workItemId: fakeWorkItem.id,
      workflowTemplateId: 'wf_test',
      status: 'pending',
      steps: [],
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    };
    mockFetch(fakePlan);
    const plan = await client.dispatchWorkItem('wrk_abc');
    expect(plan.workflowTemplateId).toBe('wf_test');
    expect(String(vi.mocked(fetch).mock.calls[0]?.[0])).toContain('/work-items/wrk_abc/dispatch');
  });

  it('getPlan calls GET /plans/:id', async () => {
    const fakePlan = {
      id: 'plan_01HQZXVB3K5DFGHJKLMNPQRSTU',
      workItemId: fakeWorkItem.id,
      workflowTemplateId: 'wf_test',
      status: 'pending',
      steps: [],
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    };
    mockFetch(fakePlan);
    const plan = await client.getPlan('plan_abc');
    expect(plan.id).toBe(fakePlan.id);
    expect(String(vi.mocked(fetch).mock.calls[0]?.[0])).toContain('/plans/plan_abc');
  });

  it('listRuns calls GET /runtime/runs', async () => {
    mockFetch([]);
    await client.listRuns({ active: true });
    expect(String(vi.mocked(fetch).mock.calls[0]?.[0])).toContain('/runtime/runs?active=true');
  });

  it('stopRun calls POST /runtime/runs/:id/stop', async () => {
    const fakeLease = {
      id: 'lease_01HQZXVB3K5DFGHJKLMNPQRSTU',
      runId: 'run_01HQZXVB3K5DFGHJKLMNPQRSTU',
      role: 'builder',
      model: 'claude-opus-4-6',
      tokenUsage: { inputTokens: 0, outputTokens: 0, cacheCreationTokens: 0, cacheReadTokens: 0 },
      lastHeartbeat: '2026-01-01T00:00:00.000Z',
      active: false,
      createdAt: '2026-01-01T00:00:00.000Z',
      expiresAt: '2026-01-01T00:01:00.000Z',
    };
    mockFetch(fakeLease);
    const lease = await client.stopRun('lease_abc');
    expect(lease.active).toBe(false);
    expect(String(vi.mocked(fetch).mock.calls[0]?.[0])).toContain('/runtime/runs/lease_abc/stop');
  });

  it('listMail calls GET /mail', async () => {
    mockFetch([fakemail]);
    const msgs = await client.listMail({ to: 'agent-b', read: false });
    expect(msgs).toHaveLength(1);
    const url = String(vi.mocked(fetch).mock.calls[0]?.[0]);
    expect(url).toContain('/mail?to=agent-b&read=false');
  });

  it('sendMail calls POST /mail', async () => {
    mockFetch(fakemail, 201);
    const msg = await client.sendMail({
      type: 'status',
      from: 'agent-a',
      to: 'agent-b',
      subject: 'hello',
      body: 'world',
    });
    expect(msg.id).toBe(fakemail.id);
    expect(vi.mocked(fetch).mock.calls[0]?.[1]?.method).toBe('POST');
  });

  it('throws ApiError on non-ok response', async () => {
    mockFetch({ error: 'Not found' }, 404);
    await expect(client.getWorkItem('nonexistent')).rejects.toThrow(ApiError);
    await expect(client.getWorkItem('nonexistent')).rejects.toMatchObject({ status: 404 });
  });
});
