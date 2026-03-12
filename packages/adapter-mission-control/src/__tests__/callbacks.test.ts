import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { McCallbackHandler } from '../callbacks.js';
import type { SisuStatusEvent } from '../types.js';

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

describe('McCallbackHandler', () => {
  beforeEach(() => {
    vi.spyOn(global, 'fetch');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const event: SisuStatusEvent = {
    workItemId: 'wrk_01ABCDE',
    previousStatus: 'queued',
    newStatus: 'in_progress',
    timestamp: '2026-01-01T00:00:00Z',
  };

  it('sends PATCH to MC API with mapped status', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({}), { status: 200 }) as unknown as Response,
    );

    const handler = new McCallbackHandler({ mcApiBaseUrl: 'https://mc.example.com' });
    await handler.handleStatusChange(event, 'mc-task-1');

    expect(fetch).toHaveBeenCalledOnce();
    expect(capturedUrl()).toBe('https://mc.example.com/tasks/mc-task-1');
    const init = capturedInit();
    expect(init.method).toBe('PATCH');
    expect(JSON.parse(init.body as string)).toEqual({ status: 'working' });
    const headers = init.headers as Record<string, string>;
    expect(headers['Content-Type']).toBe('application/json');
    expect(headers.Authorization).toBeUndefined();
  });

  it('includes Authorization header when token is set', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({}), { status: 200 }) as unknown as Response,
    );

    const handler = new McCallbackHandler({
      mcApiBaseUrl: 'https://mc.example.com/',
      mcApiToken: 'secret-token',
    });
    await handler.handleStatusChange(event, 'mc-task-2');

    const headers = capturedInit().headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer secret-token');
  });

  it('strips trailing slash from base URL', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({}), { status: 200 }) as unknown as Response,
    );

    const handler = new McCallbackHandler({ mcApiBaseUrl: 'https://mc.example.com/' });
    await handler.handleStatusChange(event, 'mc-task-3');

    expect(capturedUrl()).toBe('https://mc.example.com/tasks/mc-task-3');
  });

  it('throws on non-ok response', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({}), {
        status: 500,
        statusText: 'Internal Server Error',
      }) as unknown as Response,
    );

    const handler = new McCallbackHandler({ mcApiBaseUrl: 'https://mc.example.com' });
    await expect(handler.handleStatusChange(event, 'mc-task-4')).rejects.toThrow('MC API error');
  });

  it('maps all SISU statuses to MC statuses correctly', async () => {
    const statuses = [
      ['queued', 'open'],
      ['ready', 'assigned'],
      ['planning', 'working'],
      ['in_progress', 'working'],
      ['in_review', 'review'],
      ['done', 'completed'],
      ['cancelled', 'archived'],
      ['failed', 'failed'],
    ] as const;

    for (const [sisuStatus, expectedMcStatus] of statuses) {
      vi.mocked(fetch).mockResolvedValueOnce(
        new Response(JSON.stringify({}), { status: 200 }) as unknown as Response,
      );
      const handler = new McCallbackHandler({ mcApiBaseUrl: 'https://mc.example.com' });
      const evt: SisuStatusEvent = {
        workItemId: 'wrk_TEST',
        previousStatus: 'queued',
        newStatus: sisuStatus,
        timestamp: '2026-01-01T00:00:00Z',
      };
      await handler.handleStatusChange(evt, 'task-id');
      const init = capturedInit();
      expect(JSON.parse(init.body as string)).toEqual({ status: expectedMcStatus });
    }
  });
});
