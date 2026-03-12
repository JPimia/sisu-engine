import type { FastifyPluginAsync } from 'fastify';

const planRoutes: FastifyPluginAsync = async (app) => {
  app.get<{ Params: { id: string } }>('/plans/:id', async (request, reply) => {
    const plan = await app.storage.getPlan(request.params.id);
    if (!plan) return reply.code(404).send({ error: 'Not found' });
    return plan;
  });
};

export default planRoutes;
