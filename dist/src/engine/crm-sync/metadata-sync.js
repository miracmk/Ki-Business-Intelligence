/**
 * Metadata Sync Engine
 * Translates: "Zoho CRM Metadata Sync" n8n workflow
 *
 * n8n flow:
 *   Get All Modules → Filter → Upsert Module → Loop →
 *   Get Fields → Map Fields → Upsert Fields →
 *   Get Related Lists → Map → Upsert → Wait → Loop
 *
 * Here: same logic, plain TypeScript, rate-limit delays preserved.
 */
import { db } from '../../lib/db.js';
import { crmModules, crmFields, crmRelatedLists, crmSyncLog } from '../../../db/schema.js';
import { createAdapter } from '../../adapters/index.js';
import { decryptJson } from '../../lib/crypto.js';
import { eq } from 'drizzle-orm';
const RATE_LIMIT_DELAY_MS = 1_400; // same as n8n Wait node (1.4s)
export async function runMetadataSync(connectionId) {
    const result = { modulesUpserted: 0, fieldsUpserted: 0, relatedUpserted: 0, errors: [] };
    // Load connection
    const [conn] = await db.query.crmConnections.findMany({
        where: (t, { eq }) => eq(t.id, connectionId),
        limit: 1,
    });
    if (!conn)
        throw new Error(`Connection not found: ${connectionId}`);
    const creds = decryptJson(conn.credentials);
    const adapter = createAdapter(creds);
    // Log start
    const [logRow] = await db.insert(crmSyncLog).values({
        connectionId,
        syncType: 'metadata',
        status: 'running',
        startedAt: new Date(),
    }).returning();
    try {
        // ── Step 1: Get all modules ───────────────────────────────────────────
        const modules = await adapter.getModules();
        for (const mod of modules) {
            try {
                // ── Step 2: Upsert module ───────────────────────────────────────
                await db.insert(crmModules).values({
                    connectionId,
                    tenantId: conn.tenantId,
                    apiName: mod.apiName,
                    moduleName: mod.apiName,
                    singularLabel: mod.singular,
                    pluralLabel: mod.label,
                    apiSupported: true,
                    isActive: true,
                    lastSyncedAt: new Date(),
                }).onConflictDoUpdate({
                    target: [crmModules.connectionId, crmModules.apiName],
                    set: { singularLabel: mod.singular, pluralLabel: mod.label, lastSyncedAt: new Date() },
                });
                result.modulesUpserted++;
                // ── Step 3: Get and upsert fields ──────────────────────────────
                await delay(RATE_LIMIT_DELAY_MS);
                const fields = await adapter.getModuleFields(mod.apiName);
                for (const field of fields) {
                    await db.insert(crmFields).values({
                        connectionId,
                        moduleApiName: mod.apiName,
                        apiName: field.apiName,
                        fieldLabel: field.label,
                        dataType: field.dataType,
                        fieldType: field.fieldType,
                        isMandatory: field.isMandatory,
                        isReadOnly: field.isReadOnly,
                        isCustomField: field.isCustomField,
                        maxLength: field.maxLength,
                        pickListValues: field.pickListValues ? JSON.stringify(field.pickListValues) : null,
                        lookupDetails: field.lookup ? JSON.stringify(field.lookup) : null,
                        lastSyncedAt: new Date(),
                    }).onConflictDoUpdate({
                        target: [crmFields.connectionId, crmFields.moduleApiName, crmFields.apiName],
                        set: { fieldLabel: field.label, dataType: field.dataType, lastSyncedAt: new Date() },
                    });
                    result.fieldsUpserted++;
                }
                // ── Step 4: Get and upsert related lists ───────────────────────
                const related = await adapter.getRelatedLists(mod.apiName);
                for (const rel of related) {
                    await db.insert(crmRelatedLists).values({
                        connectionId,
                        moduleApiName: mod.apiName,
                        apiName: rel.apiName,
                        displayLabel: rel.displayLabel,
                        relatedModule: rel.module,
                        type: rel.type,
                        lastSyncedAt: new Date(),
                    }).onConflictDoUpdate({
                        target: [crmRelatedLists.connectionId, crmRelatedLists.moduleApiName, crmRelatedLists.apiName],
                        set: { displayLabel: rel.displayLabel, lastSyncedAt: new Date() },
                    });
                    result.relatedUpserted++;
                }
                await delay(RATE_LIMIT_DELAY_MS);
            }
            catch (err) {
                result.errors.push(`Module ${mod.apiName}: ${String(err)}`);
            }
        }
        // Log success
        if (logRow) {
            await db.update(crmSyncLog)
                .set({ status: 'done', finishedAt: new Date(), recordsProcessed: result.modulesUpserted })
                .where(eq(crmSyncLog.id, logRow.id));
        }
    }
    catch (err) {
        if (logRow) {
            await db.update(crmSyncLog)
                .set({ status: 'error', errorMessage: String(err), finishedAt: new Date() })
                .where(eq(crmSyncLog.id, logRow.id));
        }
        throw err;
    }
    return result;
}
function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
//# sourceMappingURL=metadata-sync.js.map