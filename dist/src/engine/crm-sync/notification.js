/**
 * Real-time Notification Processor
 * Translates: "CRM Notification Processor" n8n workflow
 *
 * n8n flow:
 *   Webhook → Parse Notification → Is Delete? →
 *     Yes: Delete Record
 *     No:  Fetch Updated Record (try OAuth) →
 *          on error: refresh token → Fetch Updated Record →
 *          Map Record → Upsert Record
 */
import { db } from '../../lib/db.js';
import { crmRecords } from '../../../db/schema.js';
import { createAdapter } from '../../adapters/index.js';
import { decryptJson } from '../../lib/crypto.js';
import { and, eq } from 'drizzle-orm';
export async function processNotification(connectionId, payload) {
    const result = { processed: 0, deleted: 0, errors: [] };
    if (!payload.module || !payload.ids?.length)
        return result;
    const conn = await loadConnection(connectionId);
    const adapter = createAdapter(conn.creds);
    const now = new Date();
    for (const id of payload.ids) {
        try {
            // ── Is Delete? (n8n "Is Delete?" node) ─────────────────────────────
            if (payload.operation === 'delete') {
                await db.delete(crmRecords).where(and(eq(crmRecords.connectionId, connectionId), eq(crmRecords.moduleApiName, payload.module), eq(crmRecords.crmId, id)));
                result.deleted++;
                continue;
            }
            // ── Fetch updated record from CRM (n8n "Fetch Updated Record" node) ─
            const record = await adapter.getRecord(payload.module, id);
            if (!record) {
                result.errors.push(`Record not found: ${payload.module}/${id}`);
                continue;
            }
            // ── Map and upsert (n8n "Map Record" + "Upsert Record" nodes) ───────
            await db.insert(crmRecords).values({
                connectionId,
                tenantId: conn.tenantId,
                moduleApiName: payload.module,
                crmId: id,
                crmIdField: 'Id',
                data: record.data,
                createdTime: record.createdTime ? new Date(record.createdTime) : undefined,
                modifiedTime: record.modifiedTime ? new Date(record.modifiedTime) : undefined,
                lastSyncedAt: now,
            }).onConflictDoUpdate({
                target: [crmRecords.connectionId, crmRecords.moduleApiName, crmRecords.crmId],
                set: {
                    data: record.data,
                    modifiedTime: record.modifiedTime ? new Date(record.modifiedTime) : undefined,
                    lastSyncedAt: now,
                },
            });
            result.processed++;
        }
        catch (err) {
            result.errors.push(`${id}: ${String(err)}`);
        }
    }
    return result;
}
// ── Subscribe / renew notification channels ────────────────────────────────────
export async function setupNotifications(connectionId, callbackUrl, modules) {
    const conn = await loadConnection(connectionId);
    const adapter = createAdapter(conn.creds);
    const sub = await adapter.subscribeNotifications(modules, callbackUrl);
    // Save channel info to connection
    await db.update(db._.fullSchema.crmConnections)
        .set({
        notifChannelId: sub.channelId,
        notifChannelExpiry: new Date(sub.expiresAt),
        updatedAt: new Date(),
    })
        .where(eq(db._.fullSchema.crmConnections.id, connectionId));
    return sub;
}
// ── Helper ────────────────────────────────────────────────────────────────────
async function loadConnection(connectionId) {
    const conn = await db.query.crmConnections.findFirst({
        where: (t, { eq }) => eq(t.id, connectionId),
    });
    if (!conn)
        throw new Error(`Connection not found: ${connectionId}`);
    return { ...conn, creds: decryptJson(conn.credentials) };
}
//# sourceMappingURL=notification.js.map