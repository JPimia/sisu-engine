import type { FastifyPluginAsync } from 'fastify';

const healthRoutes: FastifyPluginAsync = async (app) => {
  app.get('/health', async (_request, _reply) => {
    return { status: 'ok', timestamp: new Date().toISOString() };
  });

  app.get('/ready', async (_request, reply) => {
    try {
      await app.storage.listWorkItems();
      return { status: 'ready' };
    } catch {
      return reply.code(503).send({ status: 'not ready' });
    }
  });
};

export default healthRoutes;
