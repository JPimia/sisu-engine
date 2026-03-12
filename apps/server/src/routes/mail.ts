import { MailPrioritySchema, MailTypeSchema } from '@sisu/protocol';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';

const MailQuerySchema = z.object({
  to: z.string().optional(),
  from: z.string().optional(),
  read: z
    .string()
    .optional()
    .transform((v: string | undefined) => (v !== undefined ? v === 'true' : undefined)),
  workItemId: z.string().optional(),
  type: MailTypeSchema.optional(),
});

const SendMailBodySchema = z.object({
  type: MailTypeSchema,
  from: z.string().min(1),
  to: z.string().min(1),
  subject: z.string().min(1),
  body: z.string(),
  payload: z.record(z.unknown()).optional(),
  workItemId: z.string().optional(),
  planId: z.string().optional(),
  priority: MailPrioritySchema.optional(),
});

const mailRoutes: FastifyPluginAsync = async (app) => {
  app.get('/mail', async (request, reply) => {
    const parsed = MailQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Validation error', details: parsed.error.issues });
    }
    return app.storage.listMail(parsed.data);
  });

  app.post('/mail', async (request, reply) => {
    const parsed = SendMailBodySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Validation error', details: parsed.error.issues });
    }
    const mail = await app.storage.sendMail(parsed.data);
    return reply.code(201).send(mail);
  });
};

export default mailRoutes;
