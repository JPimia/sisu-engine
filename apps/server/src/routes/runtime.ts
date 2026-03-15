import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { AssignmentSchema } from '@sisu/protocol';

const RunQuerySchema = z.object({
  role: z.string().optional(),
  workItemId: z.string().optional(),
  active: z
    .string()
    .optional()
    .transform((v: string | undefined) => (v !== undefined ? v === 'true' : undefined)),
});

const SpawnBodySchema = z.object({
  role: z.string().min(1),
  workItemId: z.string().min(1),
  planId: z.string().min(1),
  model: z.string().min(1),
  taskDescription: z.string().min(1),
  workingDirectory: z.string().min(1),
  assignment: AssignmentSchema.optional(),
  runtime: z.enum(['claude-code', 'codex']),
  apiUrl: z.string().url().optional(),
  systemPrompt: z.string().optional(),
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

  app.post('/runtime/spawn', async (request, reply) => {
    const parsed = SpawnBodySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Validation error', details: parsed.error.issues });
    }

    const body = parsed.data;
    const runtimeManager = app.runtimeManager;

    const runId = `run_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

    const handle = await runtimeManager.spawn(body.runtime, {
      runId,
      role: body.role,
      planId: body.planId,
      model: body.model,
      workItemId: body.workItemId,
      taskDescription: body.taskDescription,
      workingDirectory: body.workingDirectory,
      systemPrompt: body.systemPrompt ?? '',
      assignment: body.assignment,
      apiUrl: body.apiUrl,
    });

    return reply.code(201).send(handle);
  });
};

export default runtimeRoutes;
