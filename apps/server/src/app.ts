import type { SisuStorage } from '@sisu/core';
import Fastify from 'fastify';
import adapterRoutes from './routes/adapters.js';
import healthRoutes from './routes/health.js';
import mailRoutes from './routes/mail.js';
import planRoutes from './routes/plans.js';
import runtimeRoutes from './routes/runtime.js';
import workItemRoutes from './routes/work-items.js';

declare module 'fastify' {
  interface FastifyInstance {
    storage: SisuStorage;
  }
}

export async function buildApp(options: { storage: SisuStorage; logger?: boolean }) {
  const app = Fastify({ logger: options.logger ?? true });

  app.decorate('storage', options.storage);

  app.setErrorHandler((error, _request, reply) => {
    const msg = error instanceof Error ? error.message : '';
    const lower = msg.toLowerCase();
    if (lower.includes('not found')) {
      return reply.code(404).send({ error: 'Not found' });
    }
    if (msg.includes('Version conflict')) {
      return reply.code(409).send({ error: 'Version conflict' });
    }
    return reply.code(500).send({ error: 'Internal server error' });
  });

  await app.register(workItemRoutes, { prefix: '/v1' });
  await app.register(planRoutes, { prefix: '/v1' });
  await app.register(runtimeRoutes, { prefix: '/v1' });
  await app.register(mailRoutes, { prefix: '/v1' });
  await app.register(adapterRoutes, { prefix: '/v1' });
  await app.register(healthRoutes, { prefix: '/v1' });

  await app.ready();
  return app;
}
