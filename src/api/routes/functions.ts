// FAZ 7.3/7.1: custom function management — CRUD over function_definitions, manual test-run,
// and execution history. The actual sandboxing lives entirely in src/engine/functions/
// (isolated-vm); this route is just persistence + a way to trigger executeFunction on demand.
import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { eq, and, desc } from 'drizzle-orm'
import { db } from '../../lib/db.js'
import { functionDefinitions, functionExecutions } from '../../../db/schema.js'
import { enqueueAndWait } from '../../lib/queue/index.js'
import { validateFunctionCode } from '../../engine/functions/ast-guard.js'
import type { FunctionExecutionResult } from '../../engine/functions/executor.js'

const isUUID = (s: string | null | undefined): boolean =>
  !!s && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)

const functionSchema = z.object({
  name: z.string().min(1),
  code: z.string().min(1),
  isActive: z.boolean().optional(),
})

async function resolveEntity(tenantId: string | null): Promise<{ id: string; schema: string } | null> {
  if (!isUUID(tenantId)) return null
  const entity = await db.query.kibiEntities.findFirst({
    where: (t, { eq }) => eq(t.entityId, tenantId!),
    columns: { id: true, isProvisioned: true, entityDbSchema: true },
  })
  if (!entity?.isProvisioned || !entity.entityDbSchema) return null
  return { id: entity.id, schema: entity.entityDbSchema }
}

export const functionRoutes: FastifyPluginAsync = async (app) => {
  app.get('/', { onRequest: [app.authenticate] }, async (req, reply) => {
    const entity = await resolveEntity((req.user as any).tenantId)
    if (!entity) return reply.status(404).send({ error: 'Entity şeması hazır değil' })
    const rows = await db.query.functionDefinitions.findMany({
      where: (t, { eq }) => eq(t.entityId, entity.id),
      orderBy: (t, { desc }) => desc(t.createdAt),
    })
    return { functions: rows }
  })

  app.post('/', { onRequest: [app.authenticate] }, async (req, reply) => {
    const entity = await resolveEntity((req.user as any).tenantId)
    if (!entity) return reply.status(404).send({ error: 'Entity şeması hazır değil' })
    const body = functionSchema.safeParse(req.body)
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() })

    const guard = validateFunctionCode(body.data.code)
    if (!guard.ok) return reply.status(400).send({ error: guard.error })

    const [row] = await db.insert(functionDefinitions).values({
      entityId: entity.id,
      name: body.data.name,
      code: body.data.code,
      isActive: body.data.isActive ?? true,
    }).returning()
    return reply.status(201).send({ function: row })
  })

  app.put('/:id', { onRequest: [app.authenticate] }, async (req, reply) => {
    const entity = await resolveEntity((req.user as any).tenantId)
    if (!entity) return reply.status(404).send({ error: 'Entity şeması hazır değil' })
    const { id } = req.params as { id: string }
    const body = functionSchema.partial().safeParse(req.body)
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() })

    if (body.data.code) {
      const guard = validateFunctionCode(body.data.code)
      if (!guard.ok) return reply.status(400).send({ error: guard.error })
    }

    const [row] = await db.update(functionDefinitions).set({
      ...(body.data.name !== undefined ? { name: body.data.name } : {}),
      ...(body.data.code !== undefined ? { code: body.data.code } : {}),
      ...(body.data.isActive !== undefined ? { isActive: body.data.isActive } : {}),
      updatedAt: new Date(),
    }).where(and(eq(functionDefinitions.id, id), eq(functionDefinitions.entityId, entity.id))).returning()
    if (!row) return reply.status(404).send({ error: 'Fonksiyon bulunamadı' })
    return { function: row }
  })

  app.delete('/:id', { onRequest: [app.authenticate] }, async (req, reply) => {
    const entity = await resolveEntity((req.user as any).tenantId)
    if (!entity) return reply.status(404).send({ error: 'Entity şeması hazır değil' })
    const { id } = req.params as { id: string }
    await db.delete(functionDefinitions).where(and(eq(functionDefinitions.id, id), eq(functionDefinitions.entityId, entity.id)))
    return { ok: true }
  })

  // Manual test run — NEVER executes user code in the API process. Enqueues a `test_function`
  // job and awaits it (enqueueAndWait); only the worker process calls executeFunction.
  app.post('/:id/test', { onRequest: [app.authenticate] }, async (req, reply) => {
    const entity = await resolveEntity((req.user as any).tenantId)
    if (!entity) return reply.status(404).send({ error: 'Entity şeması hazır değil' })
    const { id } = req.params as { id: string }
    const fn = await db.query.functionDefinitions.findFirst({
      where: (t, { eq, and }) => and(eq(t.id, id), eq(t.entityId, entity.id)),
    })
    if (!fn) return reply.status(404).send({ error: 'Fonksiyon bulunamadı' })

    const body = z.object({ input: z.record(z.unknown()).optional() }).safeParse(req.body)
    const input = body.success ? (body.data.input ?? {}) : {}

    const result = await enqueueAndWait('test_function', { code: fn.code, entityId: entity.id, schema: entity.schema, input }) as FunctionExecutionResult

    await db.insert(functionExecutions).values({
      functionId: fn.id,
      entityId: entity.id,
      triggeredBy: { type: 'manual' },
      status: result.ok ? 'success' : 'error',
      result: result.result ?? null,
      error: result.error ?? null,
      logs: result.logs,
      durationMs: result.durationMs,
    })

    return result
  })

  app.get('/:id/executions', { onRequest: [app.authenticate] }, async (req, reply) => {
    const entity = await resolveEntity((req.user as any).tenantId)
    if (!entity) return reply.status(404).send({ error: 'Entity şeması hazır değil' })
    const { id } = req.params as { id: string }
    const rows = await db.query.functionExecutions.findMany({
      where: (t, { eq, and }) => and(eq(t.functionId, id), eq(t.entityId, entity.id)),
      orderBy: (t, { desc }) => desc(t.createdAt),
      limit: 50,
    })
    return { executions: rows }
  })
}
