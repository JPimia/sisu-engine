import { dispatch } from '@sisu/core';
import { ExternalRefSchema, WorkItemStatusSchema } from '@sisu/protocol';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';

const CreateBodySchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  status: WorkItemStatusSchema.optional(),
  externalRef: ExternalRefSchema.optional(),
  requiredCapabilities: z.array(z.string()).optional(),
  metadata: z.record(z.unknown()).optional(),
  context: z.record(z.unknown()).optional(),
  assignedRole: z.string().optional(),
});

const UpdateBodySchema = z.object({
  title: z.string().optional(),
  description: z.string().optional(),
  status: WorkItemStatusSchema.optional(),
  externalRef: ExternalRefSchema.optional(),
  requiredCapabilities: z.array(z.string()).optional(),
  metadata: z.record(z.unknown()).optional(),
  context: z.record(z.unknown()).optional(),
  assignedRole: z.string().optional(),
  assignedRun: z.string().optional(),
  version: z.number().int().optional(),
});

const QuerySchema = z.object({
  status: WorkItemStatusSchema.optional(),
  assignedRole: z.string().optional(),
  externalSystem: z.string().optional(),
});

const workItemRoutes: FastifyPluginAsync = async (app) => {
  app.post('/work-items', async (request, reply) => {
    const parsed = CreateBodySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Validation error', details: parsed.error.issues });
    }
    const item = await app.storage.createWorkItem(parsed.data);
    return reply.code(201).send(item);
  });

  app.get('/work-items', async (request, reply) => {
    const parsed = QuerySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Validation error', details: parsed.error.issues });
    }
    return app.storage.listWorkItems(parsed.data);
  });

  app.get<{ Params: { id: string } }>('/work-items/:id', async (request, reply) => {
    const item = await app.storage.getWorkItem(request.params.id);
    if (!item) return reply.code(404).send({ error: 'Not found' });
    return item;
  });

  app.put<{ Params: { id: string } }>('/work-items/:id', async (request, reply) => {
    const parsed = UpdateBodySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Validation error', details: parsed.error.issues });
    }
    const { version, ...update } = parsed.data;
    return app.storage.updateWorkItem(request.params.id, update, version);
  });

  app.delete<{ Params: { id: string } }>('/work-items/:id', async (request, _reply) => {
    return app.storage.updateWorkItem(request.params.id, { status: 'cancelled' });
  });

  app.post<{ Params: { id: string } }>('/work-items/:id/dispatch', async (request, reply) => {
    const { id } = request.params;
    const exists = await app.storage.getWorkItem(id);
    if (!exists) return reply.code(404).send({ error: 'Not found' });
    return dispatch(id, app.storage);
  });
};

export default workItemRoutes;
