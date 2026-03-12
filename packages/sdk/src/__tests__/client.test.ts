import type { AgentMail, ExecutionPlan, RuntimeLease, WorkItem } from '@sisu/protocol';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SisuClient } from '../client.js';
import { SisuApiError } from '../errors.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeClient(): SisuClient {
  return new SisuClient({ baseUrl: 'http://localhost:3000' });
}

function mockFetch(body: unknown, status = 200, statusText = 'OK'): void {
  vi.spyOn(global, 'fetch').mockResolvedValueOnce(
    new Response(JSON.stringify(body), {
      status,
      statusText,
      headers: { 'Content-Type': 'application/json' },
    }) as unknown as Response,
  );
}

function capturedUrl(): string {
  const calls = vi.mocked(fetch).mock.calls;
  const last = calls[calls.length - 1];
  if (!last) throw new Error('fetch was not called');
  return String(last[0]);
}

function capturedInit(): RequestInit {
  const calls = vi.mocked(fetch).mock.calls;
  const last = calls[calls.length - 1];
  if (!last) throw new Error('fetch was not called');
  return (last[1] ?? {}) as RequestInit;
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.spyOn(global, 'fetch');
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Constructor
// ---------------------------------------------------------------------------

describe('SisuClient constructor', () => {
  it('strips trailing slash from baseUrl', async () => {
    const client = new SisuClient({ baseUrl: 'http://localhost:3000/' });
    mockFetch({ status: 'ok', timestamp: '2024-01-01T00:00:00.000Z' });
    await client.health();
    expect(capturedUrl()).toBe('http://localhost:3000/v1/health');
  });

  it('merges custom headers onto every request', async () => {
    const client = new SisuClient({
      baseUrl: 'http://localhost:3000',
      headers: { Authorization: 'Bearer token' },
    });
    mockFetch({ status: 'ok', timestamp: '2024-01-01T00:00:00.000Z' });
    await client.health();
    const headers = capturedInit().headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer token');
    expect(headers['Content-Type']).toBe('application/json');
  });
});

// ---------------------------------------------------------------------------
// SisuApiError
// ---------------------------------------------------------------------------

describe('SisuApiError', () => {
  it('is thrown on non-2xx responses', async () => {
    const client = makeClient();
    mockFetch({ error: 'Not found' }, 404, 'Not Found');
    await expect(client.getWorkItem('wrk_NOTEXIST')).rejects.toBeInstanceOf(SisuApiError);
  });

  it('exposes status, statusText, and body', async () => {
    const client = makeClient();
    const errorBody = { error: 'Not found' };
    mockFetch(errorBody, 404, 'Not Found');
    let caught: SisuApiError | undefined;
    try {
      await client.getWorkItem('wrk_NOTEXIST');
    } catch (e) {
      caught = e as SisuApiError;
    }
    expect(caught).toBeDefined();
    expect(caught?.status).toBe(404);
    expect(caught?.statusText).toBe('Not Found');
    expect(caught?.body).toEqual(errorBody);
    expect(caught?.message).toBe('SISU API error 404: Not Found');
    expect(caught?.name).toBe('SisuApiError');
  });
});

// ---------------------------------------------------------------------------
// health
// ---------------------------------------------------------------------------

describe('health()', () => {
  it('GET /v1/health', async () => {
    const client = makeClient();
    const response = { status: 'ok', timestamp: '2024-01-01T00:00:00.000Z' };
    mockFetch(response);
    const result = await client.health();
    expect(capturedUrl()).toBe('http://localhost:3000/v1/health');
    expect(capturedInit().method).toBe('GET');
    expect(result).toEqual(response);
  });
});

// ---------------------------------------------------------------------------
// createWorkItem
// ---------------------------------------------------------------------------

describe('createWorkItem()', () => {
  it('POST /v1/work-items with body', async () => {
    const client = makeClient();
    const workItem: Partial<WorkItem> = { id: 'wrk_01', title: 'My task', status: 'queued' };
    mockFetch(workItem, 201);
    const result = await client.createWorkItem({ title: 'My task' });
    expect(capturedUrl()).toBe('http://localhost:3000/v1/work-items');
    expect(capturedInit().method).toBe('POST');
    expect(JSON.parse(capturedInit().body as string)).toEqual({ title: 'My task' });
    expect(result).toEqual(workItem);
  });
});

// ---------------------------------------------------------------------------
// listWorkItems
// ---------------------------------------------------------------------------

describe('listWorkItems()', () => {
  it('GET /v1/work-items without query', async () => {
    const client = makeClient();
    mockFetch([]);
    await client.listWorkItems();
    expect(capturedUrl()).toBe('http://localhost:3000/v1/work-items');
  });

  it('GET /v1/work-items with status filter', async () => {
    const client = makeClient();
    mockFetch([]);
    await client.listWorkItems({ status: 'queued' });
    expect(capturedUrl()).toBe('http://localhost:3000/v1/work-items?status=queued');
  });

  it('GET /v1/work-items omits undefined query params', async () => {
    const client = makeClient();
    mockFetch([]);
    await client.listWorkItems({ status: undefined, assignedRole: 'builder' });
    expect(capturedUrl()).toBe('http://localhost:3000/v1/work-items?assignedRole=builder');
  });
});

// ---------------------------------------------------------------------------
// getWorkItem
// ---------------------------------------------------------------------------

describe('getWorkItem()', () => {
  it('GET /v1/work-items/:id', async () => {
    const client = makeClient();
    const workItem: Partial<WorkItem> = { id: 'wrk_01', title: 'Test' };
    mockFetch(workItem);
    const result = await client.getWorkItem('wrk_01');
    expect(capturedUrl()).toBe('http://localhost:3000/v1/work-items/wrk_01');
    expect(capturedInit().method).toBe('GET');
    expect(result).toEqual(workItem);
  });
});

// ---------------------------------------------------------------------------
// updateWorkItem
// ---------------------------------------------------------------------------

describe('updateWorkItem()', () => {
  it('PUT /v1/work-items/:id with body', async () => {
    const client = makeClient();
    const updated: Partial<WorkItem> = { id: 'wrk_01', title: 'New title' };
    mockFetch(updated);
    await client.updateWorkItem('wrk_01', { title: 'New title' });
    expect(capturedUrl()).toBe('http://localhost:3000/v1/work-items/wrk_01');
    expect(capturedInit().method).toBe('PUT');
    expect(JSON.parse(capturedInit().body as string)).toEqual({ title: 'New title' });
  });
});

// ---------------------------------------------------------------------------
// dispatch
// ---------------------------------------------------------------------------

describe('dispatch()', () => {
  it('POST /v1/work-items/:id/dispatch', async () => {
    const client = makeClient();
    const plan: Partial<ExecutionPlan> = { id: 'plan_01', workItemId: 'wrk_01' };
    mockFetch(plan);
    const result = await client.dispatch('wrk_01');
    expect(capturedUrl()).toBe('http://localhost:3000/v1/work-items/wrk_01/dispatch');
    expect(capturedInit().method).toBe('POST');
    expect(result).toEqual(plan);
  });
});

// ---------------------------------------------------------------------------
// run
// ---------------------------------------------------------------------------

describe('run()', () => {
  it('POST /v1/work-items/:id/run', async () => {
    const client = makeClient();
    const plan: Partial<ExecutionPlan> = { id: 'plan_01', workItemId: 'wrk_01' };
    mockFetch(plan);
    const result = await client.run('wrk_01');
    expect(capturedUrl()).toBe('http://localhost:3000/v1/work-items/wrk_01/run');
    expect(capturedInit().method).toBe('POST');
    expect(result).toEqual(plan);
  });
});

// ---------------------------------------------------------------------------
// getPlan
// ---------------------------------------------------------------------------

describe('getPlan()', () => {
  it('GET /v1/plans/:id', async () => {
    const client = makeClient();
    const plan: Partial<ExecutionPlan> = { id: 'plan_01' };
    mockFetch(plan);
    const result = await client.getPlan('plan_01');
    expect(capturedUrl()).toBe('http://localhost:3000/v1/plans/plan_01');
    expect(capturedInit().method).toBe('GET');
    expect(result).toEqual(plan);
  });

  it('throws SisuApiError on 404', async () => {
    const client = makeClient();
    mockFetch({ error: 'Not found' }, 404, 'Not Found');
    await expect(client.getPlan('plan_NOTEXIST')).rejects.toThrow(SisuApiError);
  });
});

// ---------------------------------------------------------------------------
// listRuns
// ---------------------------------------------------------------------------

describe('listRuns()', () => {
  it('GET /v1/runtime/runs without query', async () => {
    const client = makeClient();
    mockFetch([]);
    await client.listRuns();
    expect(capturedUrl()).toBe('http://localhost:3000/v1/runtime/runs');
  });

  it('GET /v1/runtime/runs with active=true filter', async () => {
    const client = makeClient();
    mockFetch([]);
    await client.listRuns({ active: true });
    expect(capturedUrl()).toBe('http://localhost:3000/v1/runtime/runs?active=true');
  });

  it('GET /v1/runtime/runs with workItemId filter', async () => {
    const client = makeClient();
    mockFetch([]);
    await client.listRuns({ workItemId: 'wrk_01', role: 'builder' });
    const url = capturedUrl();
    expect(url).toContain('workItemId=wrk_01');
    expect(url).toContain('role=builder');
  });
});

// ---------------------------------------------------------------------------
// stopRun
// ---------------------------------------------------------------------------

describe('stopRun()', () => {
  it('POST /v1/runtime/runs/:id/stop', async () => {
    const client = makeClient();
    const lease: Partial<RuntimeLease> = { id: 'lease_01', active: false };
    mockFetch(lease);
    const result = await client.stopRun('lease_01');
    expect(capturedUrl()).toBe('http://localhost:3000/v1/runtime/runs/lease_01/stop');
    expect(capturedInit().method).toBe('POST');
    expect(result).toEqual(lease);
  });
});

// ---------------------------------------------------------------------------
// listMail
// ---------------------------------------------------------------------------

describe('listMail()', () => {
  it('GET /v1/mail without query', async () => {
    const client = makeClient();
    mockFetch([]);
    await client.listMail();
    expect(capturedUrl()).toBe('http://localhost:3000/v1/mail');
  });

  it('GET /v1/mail with to filter', async () => {
    const client = makeClient();
    mockFetch([]);
    await client.listMail({ to: 'agent-a' });
    expect(capturedUrl()).toBe('http://localhost:3000/v1/mail?to=agent-a');
  });

  it('GET /v1/mail with read=false filter', async () => {
    const client = makeClient();
    mockFetch([]);
    await client.listMail({ read: false });
    expect(capturedUrl()).toBe('http://localhost:3000/v1/mail?read=false');
  });
});

// ---------------------------------------------------------------------------
// sendMail
// ---------------------------------------------------------------------------

describe('sendMail()', () => {
  it('POST /v1/mail with body', async () => {
    const client = makeClient();
    const mail: Partial<AgentMail> = { id: 'mail_01', type: 'status' };
    mockFetch(mail, 201);
    const result = await client.sendMail({
      type: 'status',
      from: 'agent-a',
      to: 'agent-b',
      subject: 'Hello',
      body: 'Hi there',
    });
    expect(capturedUrl()).toBe('http://localhost:3000/v1/mail');
    expect(capturedInit().method).toBe('POST');
    expect(JSON.parse(capturedInit().body as string)).toMatchObject({
      type: 'status',
      from: 'agent-a',
      to: 'agent-b',
    });
    expect(result).toEqual(mail);
  });
});

// ---------------------------------------------------------------------------
// registerAdapter
// ---------------------------------------------------------------------------

describe('registerAdapter()', () => {
  it('POST /v1/adapters/register with body', async () => {
    const client = makeClient();
    mockFetch({ error: 'Not implemented' }, 501, 'Not Implemented');
    await expect(
      client.registerAdapter({ name: 'mc', system: 'mission-control' }),
    ).rejects.toBeInstanceOf(SisuApiError);
    expect(capturedUrl()).toBe('http://localhost:3000/v1/adapters/register');
    expect(capturedInit().method).toBe('POST');
  });

  it('returns adapter registration on success', async () => {
    const client = makeClient();
    const adapter = { id: 'adapter_01', name: 'mc', system: 'mission-control', active: true };
    mockFetch(adapter, 201);
    const result = await client.registerAdapter({ name: 'mc', system: 'mission-control' });
    expect(result).toEqual(adapter);
  });
});
