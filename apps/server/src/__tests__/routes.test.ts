import { BUILT_IN_ROLES, SqliteStorage } from '@sisu/core';
import { BUILT_IN_WORKFLOWS } from '@sisu/templates-default';
import type { FastifyInstance } from 'fastify';
import { beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../app.js';

async function makeApp(): Promise<FastifyInstance> {
  const storage = new SqliteStorage(':memory:', {
    roles: [...BUILT_IN_ROLES],
    workflows: [...BUILT_IN_WORKFLOWS],
  });
  return buildApp({ storage, logger: false });
}

describe('GET /v1/health', () => {
  it('returns 200 with ok status', async () => {
    const app = await makeApp();
    const res = await app.inject({ method: 'GET', url: '/v1/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ status: 'ok' });
  });
});

describe('GET /v1/ready', () => {
  it('returns 200 when storage is healthy', async () => {
    const app = await makeApp();
    const res = await app.inject({ method: 'GET', url: '/v1/ready' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ status: 'ready' });
  });
});

describe('Work Items', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = await makeApp();
  });

  it('POST /v1/work-items creates a work item (201)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/work-items',
      payload: { title: 'Test task' },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json<{ id: string; title: string; status: string }>();
    expect(body.title).toBe('Test task');
    expect(body.status).toBe('queued');
    expect(body.id).toMatch(/^wrk_/);
  });

  it('POST /v1/work-items returns 400 on missing title', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/work-items',
      payload: { description: 'no title here' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('GET /v1/work-items lists work items', async () => {
    await app.inject({
      method: 'POST',
      url: '/v1/work-items',
      payload: { title: 'Item A' },
    });
    const res = await app.inject({ method: 'GET', url: '/v1/work-items' });
    expect(res.statusCode).toBe(200);
    expect(res.json<unknown[]>()).toHaveLength(1);
  });

  it('GET /v1/work-items filters by status', async () => {
    await app.inject({
      method: 'POST',
      url: '/v1/work-items',
      payload: { title: 'Queued item' },
    });
    const res = await app.inject({ method: 'GET', url: '/v1/work-items?status=queued' });
    expect(res.statusCode).toBe(200);
    expect(res.json<unknown[]>()).toHaveLength(1);

    const resNone = await app.inject({ method: 'GET', url: '/v1/work-items?status=done' });
    expect(resNone.statusCode).toBe(200);
    expect(resNone.json<unknown[]>()).toHaveLength(0);
  });

  it('GET /v1/work-items/:id returns 404 for unknown id', async () => {
    const res = await app.inject({ method: 'GET', url: '/v1/work-items/wrk_NOTEXIST' });
    expect(res.statusCode).toBe(404);
  });

  it('GET /v1/work-items/:id returns the work item', async () => {
    const created = await app.inject({
      method: 'POST',
      url: '/v1/work-items',
      payload: { title: 'Fetch me' },
    });
    const { id } = created.json<{ id: string }>();
    const res = await app.inject({ method: 'GET', url: `/v1/work-items/${id}` });
    expect(res.statusCode).toBe(200);
    expect(res.json<{ id: string }>().id).toBe(id);
  });

  it('PUT /v1/work-items/:id updates title', async () => {
    const created = await app.inject({
      method: 'POST',
      url: '/v1/work-items',
      payload: { title: 'Original' },
    });
    const { id } = created.json<{ id: string }>();
    const res = await app.inject({
      method: 'PUT',
      url: `/v1/work-items/${id}`,
      payload: { title: 'Updated' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json<{ title: string }>().title).toBe('Updated');
  });

  it('PUT /v1/work-items/:id returns 409 on version conflict', async () => {
    const created = await app.inject({
      method: 'POST',
      url: '/v1/work-items',
      payload: { title: 'Versioned' },
    });
    const { id } = created.json<{ id: string }>();
    const res = await app.inject({
      method: 'PUT',
      url: `/v1/work-items/${id}`,
      payload: { title: 'Bad update', version: 99 },
    });
    expect(res.statusCode).toBe(409);
  });

  it('DELETE /v1/work-items/:id cancels the work item', async () => {
    const created = await app.inject({
      method: 'POST',
      url: '/v1/work-items',
      payload: { title: 'To cancel' },
    });
    const { id } = created.json<{ id: string }>();
    const res = await app.inject({ method: 'DELETE', url: `/v1/work-items/${id}` });
    expect(res.statusCode).toBe(200);
    expect(res.json<{ status: string }>().status).toBe('cancelled');
  });

  it('POST /v1/work-items/:id/dispatch creates an execution plan', async () => {
    const created = await app.inject({
      method: 'POST',
      url: '/v1/work-items',
      payload: { title: 'Dispatch me' },
    });
    const { id } = created.json<{ id: string }>();
    const res = await app.inject({
      method: 'POST',
      url: `/v1/work-items/${id}/dispatch`,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json<{ id: string; workItemId: string }>();
    expect(body.id).toMatch(/^plan_/);
    expect(body.workItemId).toBe(id);
  });

  it('POST /v1/work-items/:id/dispatch returns 404 for unknown id', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/work-items/wrk_NOTEXIST/dispatch',
    });
    expect(res.statusCode).toBe(404);
  });
});

describe('Plans', () => {
  it('GET /v1/plans/:id returns 404 for unknown plan', async () => {
    const app = await makeApp();
    const res = await app.inject({ method: 'GET', url: '/v1/plans/plan_NOTEXIST' });
    expect(res.statusCode).toBe(404);
  });

  it('GET /v1/plans/:id returns the plan after dispatch', async () => {
    const app = await makeApp();
    const created = await app.inject({
      method: 'POST',
      url: '/v1/work-items',
      payload: { title: 'Dispatch for plan' },
    });
    const { id: workItemId } = created.json<{ id: string }>();
    const dispatched = await app.inject({
      method: 'POST',
      url: `/v1/work-items/${workItemId}/dispatch`,
    });
    const { id: planId } = dispatched.json<{ id: string }>();
    const res = await app.inject({ method: 'GET', url: `/v1/plans/${planId}` });
    expect(res.statusCode).toBe(200);
    expect(res.json<{ id: string }>().id).toBe(planId);
  });
});

describe('Runtime', () => {
  it('GET /v1/runtime/runs returns empty list', async () => {
    const app = await makeApp();
    const res = await app.inject({ method: 'GET', url: '/v1/runtime/runs' });
    expect(res.statusCode).toBe(200);
    expect(res.json<unknown[]>()).toHaveLength(0);
  });

  it('POST /v1/runtime/runs/:id/stop returns 404 for unknown lease', async () => {
    const app = await makeApp();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/runtime/runs/lease_NOTEXIST/stop',
    });
    expect(res.statusCode).toBe(404);
  });
});

describe('Mail', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = await makeApp();
  });

  it('POST /v1/mail sends a message (201)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/mail',
      payload: {
        type: 'status',
        from: 'agent-a',
        to: 'agent-b',
        subject: 'Test',
        body: 'Hello',
      },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json<{ id: string; type: string }>();
    expect(body.id).toMatch(/^mail_/);
    expect(body.type).toBe('status');
  });

  it('POST /v1/mail returns 400 on missing required fields', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/mail',
      payload: { type: 'status', from: 'a' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('GET /v1/mail lists messages filtered by to', async () => {
    await app.inject({
      method: 'POST',
      url: '/v1/mail',
      payload: { type: 'status', from: 'a', to: 'b', subject: 'Hi', body: 'Hey' },
    });
    const res = await app.inject({ method: 'GET', url: '/v1/mail?to=b' });
    expect(res.statusCode).toBe(200);
    expect(res.json<unknown[]>()).toHaveLength(1);

    const resEmpty = await app.inject({ method: 'GET', url: '/v1/mail?to=nobody' });
    expect(resEmpty.json<unknown[]>()).toHaveLength(0);
  });
});

describe('Adapters', () => {
  it('POST /v1/adapters/register returns 501', async () => {
    const app = await makeApp();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/adapters/register',
      payload: {},
    });
    expect(res.statusCode).toBe(501);
  });
});
