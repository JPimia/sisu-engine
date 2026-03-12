import { createServer } from 'node:http';
import type {
  CreateMailInput,
  CreateWorkItemInput,
  LeaseFilter,
  MailFilter,
  UpdateWorkItemInput,
  WorkItemFilter,
} from '@sisu/core';
import { dispatch } from '@sisu/core';
import { Command } from 'commander';
import { DEFAULT_DB_PATH, openStorage } from '../storage.js';

// ---------------------------------------------------------------------------
// HTTP helpers
// ---------------------------------------------------------------------------

type RouteHandler = (
  params: Record<string, string>,
  body: unknown,
  query: URLSearchParams,
) => Promise<{ status: number; body: unknown }>;

interface Route {
  method: string;
  pattern: RegExp;
  paramNames: string[];
  handler: RouteHandler;
}

function buildRouter(routes: Route[]) {
  return async function route(
    method: string,
    pathname: string,
    query: URLSearchParams,
    body: unknown,
  ): Promise<{ status: number; body: unknown }> {
    for (const r of routes) {
      if (r.method !== method) continue;
      const m = r.pattern.exec(pathname);
      if (!m) continue;
      const params: Record<string, string> = {};
      r.paramNames.forEach((name, i) => {
        params[name] = m[i + 1] ?? '';
      });
      return r.handler(params, body, query);
    }
    return { status: 404, body: { error: 'Not found' } };
  };
}

// Convert path like /v1/work-items/:id to a regex + param list
function compilePath(path: string): { pattern: RegExp; paramNames: string[] } {
  const paramNames: string[] = [];
  const regexStr = path.replace(/:([^/]+)/g, (_match, name: string) => {
    paramNames.push(name);
    return '([^/]+)';
  });
  return { pattern: new RegExp(`^${regexStr}$`), paramNames };
}

function makeRoute(method: string, path: string, handler: RouteHandler): Route {
  const { pattern, paramNames } = compilePath(path);
  return { method, pattern, paramNames, handler };
}

// ---------------------------------------------------------------------------
// makeServeCommand
// ---------------------------------------------------------------------------

export function makeServeCommand(): Command {
  const cmd = new Command('serve');

  cmd
    .description('Start the SISU HTTP API server')
    .option('--port <number>', 'Port to listen on', '4000')
    .option('--host <host>', 'Host to bind to', '127.0.0.1')
    .option('--db <path>', 'Path to SQLite database file', DEFAULT_DB_PATH)
    .action(async (opts: { port: string; host: string; db: string }) => {
      const port = Number(opts.port);
      const host = opts.host;
      const storage = openStorage(opts.db);

      // In-memory adapter registry (no persistence layer for adapters yet)
      const adapters: unknown[] = [];

      const routes: Route[] = [
        // --- Health / Ready ---
        makeRoute('GET', '/v1/health', async () => ({
          status: 200,
          body: { status: 'healthy', timestamp: new Date().toISOString() },
        })),

        makeRoute('GET', '/v1/ready', async () => {
          try {
            await storage.listWorkItems();
            return { status: 200, body: { ready: true } };
          } catch (err) {
            return {
              status: 503,
              body: { ready: false, error: err instanceof Error ? err.message : String(err) },
            };
          }
        }),

        // --- Work Items ---
        makeRoute('POST', '/v1/work-items', async (_params, body) => {
          const input = body as CreateWorkItemInput;
          const item = await storage.createWorkItem(input);
          return { status: 201, body: item };
        }),

        makeRoute('GET', '/v1/work-items', async (_params, _body, query) => {
          const filter: WorkItemFilter = {};
          const status = query.get('status');
          if (status) {
            filter.status = status as WorkItemFilter['status'];
          }
          const role = query.get('assignedRole');
          if (role) filter.assignedRole = role;
          const items = await storage.listWorkItems(filter);
          return { status: 200, body: items };
        }),

        makeRoute('GET', '/v1/work-items/:id', async (params) => {
          const item = await storage.getWorkItem(params.id ?? '');
          if (!item) return { status: 404, body: { error: 'Work item not found' } };
          return { status: 200, body: item };
        }),

        makeRoute('PUT', '/v1/work-items/:id', async (params, body) => {
          const update = body as UpdateWorkItemInput;
          try {
            const item = await storage.updateWorkItem(params.id ?? '', update);
            return { status: 200, body: item };
          } catch (err) {
            return {
              status: 409,
              body: { error: err instanceof Error ? err.message : String(err) },
            };
          }
        }),

        makeRoute('DELETE', '/v1/work-items/:id', async () => ({
          status: 501,
          body: { error: 'Delete not supported' },
        })),

        // --- Dispatch ---
        makeRoute('POST', '/v1/work-items/:id/dispatch', async (params) => {
          const workItemId = params.id ?? '';
          const item = await storage.getWorkItem(workItemId);
          if (!item) return { status: 404, body: { error: 'Work item not found' } };
          const plan = await dispatch(workItemId, storage);
          return { status: 200, body: plan };
        }),

        // --- Run (create lease for a work item) ---
        makeRoute('POST', '/v1/work-items/:id/run', async (params, body) => {
          const workItemId = params.id ?? '';
          const item = await storage.getWorkItem(workItemId);
          if (!item) return { status: 404, body: { error: 'Work item not found' } };
          const input = (body ?? {}) as {
            role?: string;
            model?: string;
            runId?: string;
            planId?: string;
          };
          const role = input.role ?? item.assignedRole ?? 'builder';
          const model = input.model ?? 'claude-sonnet-4-6';
          const runId = input.runId ?? `run_${Date.now()}`;
          const plan = await storage.getPlanByWorkItem(workItemId);
          const lease = await storage.createLease({
            runId,
            role,
            model,
            workItemId,
            planId: plan?.id ?? input.planId,
          });
          return { status: 201, body: lease };
        }),

        // --- Execution Plans ---
        makeRoute('GET', '/v1/plans/:id', async (params) => {
          const plan = await storage.getPlan(params.id ?? '');
          if (!plan) return { status: 404, body: { error: 'Plan not found' } };
          return { status: 200, body: plan };
        }),

        // --- Runtime Runs (leases) ---
        makeRoute('GET', '/v1/runtime/runs', async (_params, _body, query) => {
          const filter: LeaseFilter = {};
          const role = query.get('role');
          if (role) filter.role = role;
          const active = query.get('active');
          if (active !== null) filter.active = active === 'true';
          const leases = await storage.listLeases(filter);
          return { status: 200, body: leases };
        }),

        makeRoute('POST', '/v1/runtime/runs/:id/stop', async (params) => {
          const lease = await storage.getLease(params.id ?? '');
          if (!lease) return { status: 404, body: { error: 'Run not found' } };
          const updated = await storage.updateLease(lease.id, { active: false });
          return { status: 200, body: updated };
        }),

        // --- Mail ---
        makeRoute('GET', '/v1/mail', async (_params, _body, query) => {
          const filter: MailFilter = {};
          const to = query.get('to');
          if (to) filter.to = to;
          const from = query.get('from');
          if (from) filter.from = from;
          const read = query.get('read');
          if (read !== null) filter.read = read === 'true';
          const workItemId = query.get('workItemId');
          if (workItemId) filter.workItemId = workItemId;
          const mail = await storage.listMail(filter);
          return { status: 200, body: mail };
        }),

        makeRoute('POST', '/v1/mail', async (_params, body) => {
          const input = body as CreateMailInput;
          const mail = await storage.sendMail(input);
          return { status: 201, body: mail };
        }),

        // --- Adapters ---
        makeRoute('POST', '/v1/adapters/register', async (_params, body) => {
          adapters.push(body);
          return { status: 200, body: { registered: true } };
        }),
      ];

      const router = buildRouter(routes);

      const server = createServer((req, res) => {
        const chunks: Buffer[] = [];

        req.on('data', (chunk: Buffer) => chunks.push(chunk));
        req.on('end', () => {
          const rawBody = Buffer.concat(chunks).toString('utf-8');
          let body: unknown;
          if (rawBody) {
            try {
              body = JSON.parse(rawBody);
            } catch {
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: 'Invalid JSON body' }));
              return;
            }
          }

          const url = new URL(req.url ?? '/', `http://${host}:${port}`);

          router(req.method ?? 'GET', url.pathname, url.searchParams, body)
            .then(({ status, body: responseBody }) => {
              res.writeHead(status, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify(responseBody));
            })
            .catch((err: unknown) => {
              res.writeHead(500, { 'Content-Type': 'application/json' });
              res.end(
                JSON.stringify({
                  error: err instanceof Error ? err.message : String(err),
                }),
              );
            });
        });

        req.on('error', (err) => {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: err.message }));
        });
      });

      await new Promise<void>((resolve, reject) => {
        server.listen(port, host, () => resolve());
        server.once('error', reject);
      });

      console.log(`SISU API server listening on http://${host}:${port}`);
      console.log('Routes:');
      console.log('  GET    /v1/health');
      console.log('  GET    /v1/ready');
      console.log('  GET    /v1/work-items');
      console.log('  POST   /v1/work-items');
      console.log('  GET    /v1/work-items/:id');
      console.log('  PUT    /v1/work-items/:id');
      console.log('  DELETE /v1/work-items/:id');
      console.log('  POST   /v1/work-items/:id/dispatch');
      console.log('  POST   /v1/work-items/:id/run');
      console.log('  GET    /v1/plans/:id');
      console.log('  GET    /v1/runtime/runs');
      console.log('  POST   /v1/runtime/runs/:id/stop');
      console.log('  GET    /v1/mail');
      console.log('  POST   /v1/mail');
      console.log('  POST   /v1/adapters/register');

      // Keep process alive; handle graceful shutdown
      const shutdown = () => {
        console.log('\nShutting down...');
        server.close(() => process.exit(0));
      };

      process.on('SIGINT', shutdown);
      process.on('SIGTERM', shutdown);

      // Block until server closes
      await new Promise<void>((resolve) => server.once('close', resolve));
    });

  return cmd;
}
