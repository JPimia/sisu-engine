import type { FastifyPluginAsync } from 'fastify';

const adapterRoutes: FastifyPluginAsync = async (app) => {
  app.post('/adapters/register', async (_request, reply) => {
    return reply.code(501).send({ error: 'Not implemented' });
  });
};

export default adapterRoutes;
