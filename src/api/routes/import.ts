// FAZ 8.2: CSV/Excel import + dedup preview/commit. Commit reuses the FAZ 7.2 records-bridge
// (recordsCreate/recordsUpdate) — already registry-safe column resolution, no need to
// duplicate that logic a third time.
import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { db } from '../../lib/db.js'
import { queryEntitySchema } from '../../lib/entity-provisioner.js'
import { dedupContacts, parseImportRows, parseImportRowsXlsx, type ImportRow } from '../../engine/import/dedup.js'
import { recordsCreate, recordsUpdate } from '../../engine/functions/records-bridge.js'

const isUUID = (s: string | null | undefined): boolean =>
  !!s && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)

async function resolveEntity(tenantId: string | null): Promise<{ id: string; schema: string } | null> {
  if (!isUUID(tenantId)) return null
  const entity = await db.query.kibiEntities.findFirst({
    where: (t, { eq }) => eq(t.entityId, tenantId!),
    columns: { id: true, isProvisioned: true, entityDbSchema: true },
  })
  if (!entity?.isProvisioned || !entity.entityDbSchema) return null
  return { id: entity.id, schema: entity.entityDbSchema }
}

export const importRoutes: FastifyPluginAsync = async (app) => {
  app.post('/contacts/preview', { onRequest: [app.authenticate] }, async (req, reply) => {
    const entity = await resolveEntity((req.user as any).tenantId)
    if (!entity) return reply.status(404).send({ error: 'Entity şeması hazır değil' })
    if (!req.isMultipart()) return reply.status(400).send({ error: 'CSV/XLSX dosyası gerekli' })

    const data = await req.file()
    if (!data) return reply.status(400).send({ error: 'Dosya alınamadı' })
    const buffer = await data.toBuffer()

    let rows: ImportRow[]
    try {
      rows = data.filename.toLowerCase().endsWith('.csv')
        ? parseImportRows(buffer, data.filename)
        : await parseImportRowsXlsx(buffer)
    } catch (err) {
      return reply.status(400).send({ error: `Dosya okunamadı: ${(err as Error).message}` })
    }
    if (rows.length === 0) return reply.status(400).send({ error: 'Dosyada satır bulunamadı' })

    const existing = await queryEntitySchema(
      entity.schema,
      `SELECT id, email, full_name AS "fullName", company_name AS "companyName" FROM crm_contacts WHERE deleted_at IS NULL`,
    )
    const results = dedupContacts(rows, existing)
    return {
      summary: {
        total: results.length,
        exact: results.filter((r) => r.match === 'exact').length,
        fuzzy: results.filter((r) => r.match === 'fuzzy').length,
        new: results.filter((r) => r.match === 'new').length,
      },
      results,
    }
  })

  const decisionSchema = z.object({
    decisions: z.array(z.object({
      row: z.record(z.unknown()),
      action: z.enum(['create', 'merge', 'skip']),
      existingId: z.string().uuid().optional(),
    })),
  })

  app.post('/contacts/commit', { onRequest: [app.authenticate] }, async (req, reply) => {
    const entity = await resolveEntity((req.user as any).tenantId)
    if (!entity) return reply.status(404).send({ error: 'Entity şeması hazır değil' })
    const body = decisionSchema.safeParse(req.body)
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() })

    let created = 0
    let merged = 0
    let skipped = 0
    for (const d of body.data.decisions) {
      if (d.action === 'skip') { skipped++; continue }
      const data = d.row as ImportRow
      if (d.action === 'create') {
        await recordsCreate(entity.id, entity.schema, 'crm_contacts', data)
        created++
      } else if (d.action === 'merge' && d.existingId) {
        await recordsUpdate(entity.id, entity.schema, 'crm_contacts', d.existingId, data)
        merged++
      }
    }
    return { ok: true, created, merged, skipped }
  })
}
