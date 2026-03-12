import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';

const RunQuerySchema = z.object({
  role: z.string().optional(),
  workItemId: z.string().optional(),
  active: z
    .string()
    .optional()
    .transform((v: string | undefined) => (v !== undefined ? v === 'true' : undefined)),
});

const runtimeRoutes: FastifyPluginAsync = async (app) => {
  app.get('/runtime/runs', async (request, reply) => {
    const parsed = RunQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Validation error', details: parsed.error.issues });
    }
    return app.storage.listLeases(parsed.data);
  });

  app.post<{ Params: { id: string } }>('/runtime/runs/:id/stop', async (request, _reply) => {
    return app.storage.updateLease(request.params.id, { active: false });
  });
};

export default runtimeRoutes;
