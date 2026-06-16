import { z } from 'zod';
import { db } from '../../lib/db.js';
import { redis } from '../../lib/redis.js';
import { crmConnections, crmBulkJobs, crmModules, crmFields, kibiEntityUsers, entityDataCatalog } from '../../../db/schema.js';
import { encryptJson, decryptJson } from '../../lib/crypto.js';
import { createAdapter } from '../../adapters/index.js';
import { runMetadataSync } from '../../engine/crm-sync/metadata-sync.js';
import { startBulkSync } from '../../engine/crm-sync/bulk-sync.js';
import { setupNotifications } from '../../engine/crm-sync/notification.js';
import { runEntityEtl } from '../../engine/crm-sync/entity-etl.js';
import { runConnectorAnalysis } from '../../engine/connector/connector-ai.js';
import { eq, and } from 'drizzle-orm';
import { env } from '../../../config/env.js';
import { nanoid } from 'nanoid';
const ALL_CRM_TYPES = [
    // CRM
    'zoho', 'salesforce', 'hubspot', 'dynamics365', 'pipedrive', 'freshsales',
    'monday', 'odoo', 'bitrix24', 'sugarcrm',
    // ERP
    'sap', 'oracle_netsuite', 'dynamics_bc', 'oracle_fusion', 'odoo_erp',
    'erpnext', 'epicor', 'infor', 'sage_intacct', 'acumatica',
    // Direct DB
    'postgresql', 'mysql',
    'custom',
];
const connectSchema = z.object({
    name: z.string().min(1),
    crmType: z.enum(ALL_CRM_TYPES),
    credentials: z.record(z.unknown()),
});
const testSchema = z.object({
    crmType: z.string().min(1),
    credentials: z.record(z.unknown()),
});
function getWebhookInstructions(type) {
    const map = {
        zoho: 'Zoho CRM → Kurulum → Otomasyon → Webhook → "Yeni Webhook" oluşturun',
        salesforce: 'Salesforce → Setup → Process Builder veya Outbound Messages ile kayıt yapın',
        hubspot: 'HubSpot → Ayarlar → Integrations → Private Apps → Webhooks sekmesi',
        dynamics365: 'Power Automate → Dataverse connector → Row added/modified/deleted trigger',
        pipedrive: 'Pipedrive → Tools & Integrations → Developer Hub → Webhooks → Add Webhook',
        freshsales: 'Freshsales → Admin → Automations → Webhooks bölümünden yeni webhook ekleyin',
        monday: 'Monday.com → Admin Center → API → Webhooks',
        odoo: 'Odoo → Teknik → Otomasyon → Automated Actions → HTTP Action türünü seçin',
        bitrix24: 'Bitrix24 → Developer Resources → Outbound Webhooks',
        sugarcrm: 'SugarCRM → Admin → Sugar Logic Hooks → Yeni HTTP Hook ekleyin',
        sap: 'SAP Event Mesh → Namespace → HTTP Subscriptions bölümünden kayıt yapın',
        oracle_netsuite: 'NetSuite → Setup → Company → SuiteScript → User Event Scripts',
        dynamics_bc: 'Business Central → Administration → API/Webhook Subscriptions',
        oracle_fusion: 'Oracle Integration Cloud → Integrations → Webhook endpoint',
        odoo_erp: 'Odoo → Teknik → Otomasyon → Automated Actions → HTTP Action türünü seçin',
        erpnext: 'ERPNext → Ayarlar → Webhook → Yeni Webhook (HMAC-SHA256 imzalı)',
        epicor: 'Epicor → System Setup → BAQ + REST Method bağlayın',
        infor: 'Infor ION API → Document Flows → Webhook endpoint tanımlayın',
        sage_intacct: 'Sage Intacct → Company → Platform Services → Webhook konfigürasyonu',
        acumatica: 'Acumatica → System → Integration → Push Notifications → Add Destination',
    };
    return map[type] ?? `${type} admin panelinden webhook URL'nizi kaydedin`;
}
export const crmRoutes = async (app) => {
    // ── GET /api/v1/crm/connections ───────────────────────────────────────────
    app.get('/connections', { onRequest: [app.authenticate] }, async (req) => {
        const user = req.user;
        const conns = await db.query.crmConnections.findMany({
            where: (t, { eq }) => eq(t.tenantId, user.tenantId),
            columns: {
                id: true, name: true, crmType: true, isActive: true,
                lastSyncAt: true, syncStatus: true, syncError: true, createdAt: true,
                credentials: false, // never expose
            },
        });
        return { connections: conns };
    });
    // ── POST /api/v1/crm/connections — add new CRM ────────────────────────────
    app.post('/connections', { onRequest: [app.authenticate] }, async (req, reply) => {
        const user = req.user;
        const body = connectSchema.safeParse(req.body);
        if (!body.success)
            return reply.status(400).send({ error: body.error.flatten() });
        const { name, crmType, credentials } = body.data;
        // Validate credentials actually work
        const adapter = createAdapter({ type: crmType, ...credentials });
        const check = await adapter.validateConnection();
        if (!check.ok)
            return reply.status(422).send({ error: `Connection failed: ${check.error}` });
        const [conn] = await db.insert(crmConnections).values({
            tenantId: user.tenantId,
            name,
            crmType: crmType,
            credentials: encryptJson({ type: crmType, ...credentials }),
            syncStatus: 'idle',
        }).returning();
        const webhookSetupUrl = `${env.WEBHOOK_BASE_URL}/webhooks/crm/notification?connectionId=${conn.id}`;
        return reply.status(201).send({
            connection: { id: conn.id, name, crmType },
            webhookSetupUrl,
            webhookInstructions: getWebhookInstructions(crmType),
        });
    });
    // ── POST /api/v1/crm/connections/test — validate without saving ──────────
    app.post('/connections/test', { onRequest: [app.authenticate] }, async (req, reply) => {
        const body = testSchema.safeParse(req.body);
        if (!body.success)
            return reply.status(400).send({ error: body.error.flatten() });
        const { crmType, credentials } = body.data;
        try {
            const adapter = createAdapter({ type: crmType, ...credentials });
            const result = await adapter.validateConnection();
            return reply.send(result);
        }
        catch (e) {
            return reply.send({ ok: false, error: e.message });
        }
    });
    // ── DELETE /api/v1/crm/connections/:id ───────────────────────────────────
    app.delete('/connections/:id', { onRequest: [app.authenticate] }, async (req, reply) => {
        const user = req.user;
        const { id } = req.params;
        await db.delete(crmConnections).where(and(eq(crmConnections.id, id), eq(crmConnections.tenantId, user.tenantId)));
        return reply.send({ ok: true });
    });
    // ── POST /api/v1/crm/connections/:id/sync/metadata ───────────────────────
    // Triggers metadata sync (modules, fields, related lists)
    app.post('/connections/:id/sync/metadata', { onRequest: [app.authenticate] }, async (req, reply) => {
        const { id } = req.params;
        // Run in background — don't await
        runMetadataSync(id).then((r) => {
            console.log(`[MetadataSync] Done: ${r.modulesUpserted} modules, ${r.fieldsUpserted} fields`);
        }).catch(console.error);
        return reply.status(202).send({ message: 'Metadata sync started', connectionId: id });
    });
    // ── POST /api/v1/crm/connections/:id/sync/full ────────────────────────────
    // Triggers full data sync via Bulk Read
    app.post('/connections/:id/sync/full', { onRequest: [app.authenticate] }, async (req, reply) => {
        const { id } = req.params;
        const { modules } = (req.body ?? {});
        const callbackUrl = `${env.WEBHOOK_BASE_URL}/webhooks/crm/bulk-callback?connectionId=${id}`;
        startBulkSync(id, { modules, callbackUrl }).then((r) => {
            console.log(`[BulkSync] Started ${r.started} jobs. Failed: ${r.failed.join(', ')}`);
        }).catch(console.error);
        return reply.status(202).send({ message: 'Full sync started', connectionId: id });
    });
    // ── POST /api/v1/crm/connections/:id/sync/subscribe ──────────────────────
    // Subscribe to real-time CRM push notifications
    app.post('/connections/:id/sync/subscribe', { onRequest: [app.authenticate] }, async (req, reply) => {
        const { id } = req.params;
        const { modules } = (req.body ?? {});
        const callbackUrl = `${env.WEBHOOK_BASE_URL}/webhooks/crm/notification?connectionId=${id}`;
        const sub = await setupNotifications(id, callbackUrl, modules ?? []);
        return reply.send({ channelId: sub.channelId, expiresAt: sub.expiresAt });
    });
    // ── GET /api/v1/crm/connections/:id/records ───────────────────────────────
    // Query mirrored records
    app.get('/connections/:id/records', { onRequest: [app.authenticate] }, async (req, reply) => {
        const { id } = req.params;
        const { module, limit = '100', page = '1' } = req.query;
        if (!module)
            return reply.status(400).send({ error: 'module is required' });
        const records = await db.query.crmRecords.findMany({
            where: (t, { eq, and }) => and(eq(t.connectionId, id), eq(t.moduleApiName, module)),
            limit: Math.min(Number(limit), 500),
            offset: (Number(page) - 1) * Number(limit),
            orderBy: (t, { desc }) => [desc(t.lastSyncedAt)],
        });
        return { records: records.map((r) => ({ id: r.crmId, ...r.data })), count: records.length };
    });
    // ── GET /api/v1/crm/connections/:id/sync-status ───────────────────────────
    app.get('/connections/:id/sync-status', { onRequest: [app.authenticate] }, async (req) => {
        const { id } = req.params;
        const states = await db.query.crmSyncState.findMany({
            where: (t, { eq }) => eq(t.connectionId, id),
        });
        const jobs = await db.query.crmBulkJobs.findMany({
            where: (t, { eq }) => eq(t.connectionId, id),
            orderBy: (t, { desc }) => [desc(t.createdAt)],
            limit: 20,
        });
        return { syncState: states, recentJobs: jobs };
    });
    // GET /api/v1/crm/connections/:id/modules
    app.get('/connections/:id/modules', { onRequest: [app.authenticate] }, async (req) => {
        const { id } = req.params;
        const modules = await db.query.crmModules.findMany({
            where: (t, { eq }) => eq(t.connectionId, id),
            orderBy: (t, { asc }) => [asc(t.apiName)],
        });
        return { modules };
    });
    // ── POST /api/v1/crm/connections/:id/sync/entity ─────────────────────────
    // Trigger ETL: mirror all source data → AI normalize → entity schema tables
    app.post('/connections/:id/sync/entity', { onRequest: [app.authenticate] }, async (req, reply) => {
        const { id } = req.params;
        const user = req.user;
        // Verify ownership
        const conn = await db.query.crmConnections.findFirst({
            where: (t, { and, eq }) => and(eq(t.id, id), eq(t.tenantId, user.tenantId)),
        });
        if (!conn)
            return reply.status(404).send({ error: 'Bağlantı bulunamadı' });
        // Fire-and-forget ETL
        runEntityEtl(id).then(r => {
            console.log(`[ETL] Done for ${id}: ${r.mirrored} mirrored, ${r.rows} normalized, tables=[${r.tables.join(',')}]`);
        }).catch(err => console.error(`[ETL] Failed for ${id}:`, err));
        return reply.status(202).send({
            message: 'ETL başlatıldı — tüm veriler aynalalanıyor ve AI ile normalize ediliyor',
            connectionId: id,
        });
    });
    // ── POST /api/v1/crm/connections/:id/sync/pg-direct ──────────────────────
    // For PostgreSQL sources: read tables + sync directly to entity schema
    // (also triggered automatically via sync/entity for crmType=postgresql)
    app.post('/connections/:id/sync/pg-direct', { onRequest: [app.authenticate] }, async (req, reply) => {
        const { id } = req.params;
        const user = req.user;
        const conn = await db.query.crmConnections.findFirst({
            where: (t, { and, eq }) => and(eq(t.id, id), eq(t.tenantId, user.tenantId)),
        });
        if (!conn)
            return reply.status(404).send({ error: 'Bağlantı bulunamadı' });
        if (conn.crmType !== 'postgresql')
            return reply.status(400).send({ error: 'Bu endpoint sadece PostgreSQL bağlantıları için' });
        // Metadata sync first: discover tables + columns
        runMetadataSync(id).then(() => runEntityEtl(id))
            .then(r => console.log(`[PG-ETL] Done for ${id}: ${r?.mirrored} rows mirrored`))
            .catch(err => console.error(`[PG-ETL] Failed for ${id}:`, err));
        return reply.status(202).send({ message: 'PostgreSQL tablo tarama ve ETL başlatıldı', connectionId: id });
    });
    // ── GET /api/v1/crm/connections/:id/entity-data ───────────────────────────
    // Preview data in entity schema after ETL
    app.get('/connections/:id/entity-data', { onRequest: [app.authenticate] }, async (req, reply) => {
        const { id } = req.params;
        const { table = 'crm_contacts', limit = '20' } = req.query;
        const user = req.user;
        const entity = await db.query.kibiEntities.findFirst({
            where: (t, { eq }) => eq(t.entityId, user.tenantId),
        });
        if (!entity?.entityDbSchema)
            return reply.status(400).send({ error: 'Entity schema oluşturulmamış' });
        const { Pool } = await import('pg');
        const pool = new Pool({ connectionString: env.DATABASE_URL, max: 1 });
        try {
            const { rows } = await pool.query(`SELECT * FROM "${entity.entityDbSchema}"."${table}" ORDER BY created_at DESC LIMIT $1`, [Math.min(Number(limit), 200)]);
            const { rows: countRows } = await pool.query(`SELECT COUNT(*) AS n FROM "${entity.entityDbSchema}"."${table}"`);
            const mirrored = await pool.query(`SELECT COUNT(*) AS n FROM "${entity.entityDbSchema}".crm_raw_mirror WHERE connection_id = $1`, [id]).catch(() => ({ rows: [{ n: 0 }] }));
            return { table, total: parseInt(countRows[0].n), mirrored: parseInt(mirrored.rows[0].n), rows };
        }
        finally {
            await pool.end();
        }
    });
    // GET /api/v1/crm/connections/:id/modules/:module/fields
    app.get('/connections/:id/modules/:module/fields', { onRequest: [app.authenticate] }, async (req) => {
        const { id, module } = req.params;
        const fields = await db.query.crmFields.findMany({
            where: (t, { and, eq }) => and(eq(t.connectionId, id), eq(t.moduleApiName, module)),
        });
        return { fields };
    });
    // ── POST /api/v1/crm/oauth/start — start OAuth authorization flow ─────────
    app.post('/oauth/start', { onRequest: [app.authenticate] }, async (req, reply) => {
        const user = req.user;
        const { provider, name, clientId, clientSecret, region } = req.body;
        if (!provider || !name || !clientId || !clientSecret) {
            return reply.status(400).send({ error: 'provider, name, clientId, clientSecret zorunlu' });
        }
        const state = nanoid(32);
        const callbackBase = `${env.APP_URL}/webhooks/crm/${provider}/callback`;
        // Store OAuth state in Redis (10 min)
        await redis.setex(`ki:oauth:state:${state}`, 600, JSON.stringify({
            tenantId: user.tenantId, userId: user.sub,
            provider, name, clientId, clientSecret, region: region ?? 'com',
        }));
        let authUrl = '';
        if (provider === 'zoho') {
            const reg = region ?? 'com';
            const scopes = 'ZohoCRM.modules.all,ZohoCRM.settings.all,ZohoCRM.bulk.all,ZohoCRM.notifications.all';
            authUrl = `https://accounts.zoho.${reg}/oauth/v2/auth?response_type=code&client_id=${encodeURIComponent(clientId)}&scope=${encodeURIComponent(scopes)}&redirect_uri=${encodeURIComponent(callbackBase)}&access_type=offline&state=${state}`;
        }
        else if (provider === 'hubspot') {
            const scopes = 'crm.objects.contacts.read crm.objects.companies.read crm.objects.deals.read crm.objects.custom.read';
            authUrl = `https://app.hubspot.com/oauth/authorize?client_id=${encodeURIComponent(clientId)}&redirect_uri=${encodeURIComponent(callbackBase)}&scope=${encodeURIComponent(scopes)}&state=${state}`;
        }
        else if (provider === 'salesforce') {
            authUrl = `https://login.salesforce.com/services/oauth2/authorize?response_type=code&client_id=${encodeURIComponent(clientId)}&redirect_uri=${encodeURIComponent(callbackBase)}&scope=api+refresh_token&state=${state}`;
        }
        else {
            return reply.status(400).send({ error: 'Desteklenmeyen provider' });
        }
        return reply.send({ authUrl, state });
    });
    // ── POST /api/v1/crm/db-test — test external PostgreSQL/MySQL connection ──
    app.post('/db-test', { onRequest: [app.authenticate] }, async (req, reply) => {
        const { dbType = 'postgresql', host, port = 5432, database, username, password, ssl = false } = req.body;
        if (!host || !database || !username) {
            return reply.status(400).send({ error: 'host, database, username zorunlu' });
        }
        try {
            const { Client } = await import('pg');
            const client = new Client({
                host, port: Number(port), database, user: username, password,
                ssl: ssl ? { rejectUnauthorized: false } : false,
                connectionTimeoutMillis: 5000,
            });
            await client.connect();
            // Verify read-only: check for SELECT privilege, reject if has INSERT/UPDATE/DELETE
            const roCheck = await client.query(`SELECT has_table_privilege($1, 'information_schema.tables', 'INSERT') AS has_insert`, [username]);
            const isReadOnly = !roCheck.rows[0]?.has_insert;
            // Get list of tables
            const tables = await client.query(`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name LIMIT 50`);
            await client.end();
            return reply.send({ ok: true, isReadOnly, tables: tables.rows.map(r => r.table_name) });
        }
        catch (e) {
            return reply.status(400).send({ ok: false, error: e.message });
        }
    });
    // ── POST /api/v1/crm/db-connect — save a read-only DB connection ──────────
    app.post('/db-connect', { onRequest: [app.authenticate] }, async (req, reply) => {
        const user = req.user;
        if (!user.tenantId)
            return reply.status(400).send({ error: 'Entity bağlantısı gerekli' });
        const { name, dbType = 'postgresql', host, port = 5432, database, username, password, ssl = false, modulesTable, fieldsTable, dataTable } = req.body;
        if (!name || !host || !database || !username) {
            return reply.status(400).send({ error: 'name, host, database, username zorunlu' });
        }
        // Quick connectivity test before saving
        try {
            const { Client } = await import('pg');
            const client = new Client({
                host, port: Number(port), database, user: username, password,
                ssl: ssl ? { rejectUnauthorized: false } : false,
                connectionTimeoutMillis: 5000,
            });
            await client.connect();
            await client.end();
        }
        catch (e) {
            return reply.status(422).send({ error: `Bağlantı başarısız: ${e.message}` });
        }
        const crmType = dbType === 'mysql' ? 'mysql' : 'postgresql';
        const [conn] = await db.insert(crmConnections).values({
            tenantId: user.tenantId,
            name,
            crmType: crmType,
            credentials: encryptJson({ dbType, host, port, database, username, password, ssl, modulesTable, fieldsTable, dataTable }),
            syncStatus: 'idle',
        }).returning();
        return reply.status(201).send({ connection: { id: conn.id, name, crmType } });
    });
    // PUT /api/v1/crm/connections/:id — update connection
    app.put('/connections/:id', { onRequest: [app.authenticate] }, async (req, reply) => {
        const { id } = req.params;
        const { name, isActive } = req.body;
        await db.update(crmConnections).set({ ...(name && { name }), ...(isActive !== undefined && { isActive }), updatedAt: new Date() }).where(eq(crmConnections.id, id));
        return reply.send({ ok: true });
    });
    // ── Structure scan ──────────────────────────────────────────────────────────
    // POST /api/v1/crm/connections/:id/scan-structure
    app.post('/connections/:id/scan-structure', { onRequest: [app.authenticate] }, async (req, reply) => {
        const { id } = req.params;
        const cacheKey = `ki:crm:structure:${id}`;
        const cached = await redis.get(cacheKey);
        if (cached)
            return reply.send({ modules: JSON.parse(cached), cached: true });
        const conn = await db.query.crmConnections.findFirst({ where: eq(crmConnections.id, id) });
        if (!conn)
            return reply.status(404).send({ error: 'Bağlantı bulunamadı' });
        const creds = decryptJson(conn.credentials);
        const adapter = createAdapter({ ...creds, type: conn.crmType });
        const rawModules = await adapter.getModules();
        const modules = [];
        for (const mod of rawModules.slice(0, 50)) {
            const fields = await adapter.getModuleFields(mod.apiName).catch(() => []);
            let sampleRows = [];
            try {
                const sr = await adapter.search({ module: mod.apiName, page: 1, perPage: 5 });
                sampleRows = sr.records ?? [];
            }
            catch { /* ignore */ }
            const enrichedFields = fields.map((f) => {
                const sampleValues = sampleRows
                    .map(r => r[f.apiName] ?? r[f.name])
                    .filter(v => v != null && String(v).length > 0)
                    .slice(0, 3)
                    .map(v => String(v));
                return { name: f.apiName ?? f.name, label: f.label ?? f.name, type: f.dataType ?? f.type, sampleValues };
            });
            let recordCount = 0;
            try {
                if (adapter.getTableCount) {
                    recordCount = await adapter.getTableCount(mod.apiName);
                }
            }
            catch { /* ignore */ }
            modules.push({
                name: mod.apiName,
                label: mod.pluralLabel ?? mod.apiName,
                recordCount,
                fields: enrichedFields,
                relations: [],
            });
        }
        await redis.set(cacheKey, JSON.stringify(modules), 'EX', 1800);
        return reply.send({ modules, scannedAt: new Date().toISOString() });
    });
    // GET /api/v1/crm/connections/:id/scan-structure/stream  (SSE)
    // SSE endpoint — EventSource cannot send headers, so we accept token via query param
    app.get('/connections/:id/scan-structure/stream', async (req, reply) => {
        const { id } = req.params;
        const { token } = req.query;
        // Auth: try header first, then query param
        try {
            if (token) {
                // manually verify token from query param
                const decoded = app.jwt.verify(token);
                req.user = decoded;
            }
            else {
                await req.jwtVerify();
            }
        }
        catch {
            reply.raw.writeHead(401);
            reply.raw.end('Unauthorized');
            return;
        }
        const conn = await db.query.crmConnections.findFirst({ where: eq(crmConnections.id, id) });
        if (!conn) {
            reply.raw.writeHead(404);
            reply.raw.end();
            return;
        }
        reply.raw.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
            'X-Accel-Buffering': 'no',
        });
        const send = (type, message, percent) => {
            reply.raw.write(`data: ${JSON.stringify({ type, message, percent })}\n\n`);
        };
        const heartbeat = setInterval(() => { reply.raw.write(': ping\n\n'); }, 15000);
        reply.raw.on('close', () => clearInterval(heartbeat));
        try {
            send('progress', 'Bağlantı kontrol ediliyor...', 2);
            const creds = decryptJson(conn.credentials);
            const adapter = createAdapter({ ...creds, type: conn.crmType });
            send('progress', 'Modüller taranıyor...', 5);
            const rawModules = await adapter.getModules();
            send('progress', `${rawModules.length} modül bulundu`, 15);
            const modules = [];
            const total = Math.min(rawModules.length, 50);
            for (let i = 0; i < total; i++) {
                const mod = rawModules[i];
                send('progress', `"${mod.pluralLabel ?? mod.apiName}" taranıyor...`, 15 + Math.round((i / total) * 70));
                const fields = await adapter.getModuleFields(mod.apiName).catch(() => []);
                let sampleRows = [];
                try {
                    const sr = await adapter.search({ module: mod.apiName, page: 1, perPage: 5 });
                    sampleRows = sr.records ?? [];
                }
                catch { /* ignore */ }
                const enrichedFields = fields.map((f) => {
                    const sampleValues = sampleRows
                        .map(r => r[f.apiName] ?? r[f.name])
                        .filter(v => v != null && String(v).length > 0)
                        .slice(0, 3)
                        .map(v => String(v));
                    return { name: f.apiName ?? f.name, label: f.label ?? f.name, type: f.dataType ?? f.type, sampleValues };
                });
                let recordCount = 0;
                try {
                    if (adapter.getTableCount)
                        recordCount = await adapter.getTableCount(mod.apiName);
                }
                catch { /* ignore */ }
                modules.push({ name: mod.apiName, label: mod.pluralLabel ?? mod.apiName, recordCount, fields: enrichedFields, relations: [], sampleRows: sampleRows.slice(0, 5) });
                send('structure', JSON.stringify({ name: mod.apiName, label: mod.pluralLabel ?? mod.apiName, recordCount, fields: enrichedFields, sampleRows: sampleRows.slice(0, 5) }), 15 + Math.round(((i + 1) / total) * 70));
            }
            const cacheKey = `ki:crm:structure:${id}`;
            await redis.set(cacheKey, JSON.stringify(modules), 'EX', 1800);
            send('done', `Tarama tamamlandı — ${modules.length} modül, önbelleğe alındı`, 100);
        }
        catch (err) {
            send('error', err.message ?? 'Bilinmeyen hata', 0);
        }
        finally {
            clearInterval(heartbeat);
            reply.raw.end();
        }
    });
    // GET /api/v1/crm/connections/:id/generate-connector/stream (SSE)
    // userMappings passed as URL-encoded JSON in ?m= query param
    app.get('/connections/:id/generate-connector/stream', async (req, reply) => {
        const { id } = req.params;
        const { token, m } = req.query;
        try {
            if (token) {
                const decoded = app.jwt.verify(token);
                req.user = decoded;
            }
            else {
                await req.jwtVerify();
            }
        }
        catch {
            reply.raw.writeHead(401);
            reply.raw.end('Unauthorized');
            return;
        }
        let userMappings = {};
        try {
            if (m)
                userMappings = JSON.parse(decodeURIComponent(m));
        }
        catch { /* ignore */ }
        const conn = await db.query.crmConnections.findFirst({ where: eq(crmConnections.id, id) });
        if (!conn) {
            reply.raw.writeHead(404);
            reply.raw.end();
            return;
        }
        reply.raw.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
            'X-Accel-Buffering': 'no',
        });
        const sendSSE = (type, message, percent, extra) => {
            reply.raw.write(`data: ${JSON.stringify({ type, message, percent, ...extra })}\n\n`);
        };
        const heartbeat = setInterval(() => { reply.raw.write(': ping\n\n'); }, 15000);
        reply.raw.on('close', () => clearInterval(heartbeat));
        try {
            const cacheKey = `ki:crm:structure:${id}`;
            const cached = await redis.get(cacheKey);
            const allModules = cached ? JSON.parse(cached) : [];
            const mappedModules = allModules.filter(mod => userMappings[mod.name]);
            sendSSE('progress', `${mappedModules.length} modül analiz edilecek`, 5);
            const promptModules = [];
            for (let i = 0; i < mappedModules.length; i++) {
                const mod = mappedModules[i];
                sendSSE('progress', `"${mod.label ?? mod.name}" hazırlanıyor — ${mod.fields?.length ?? 0} alan`, 5 + Math.round((i / Math.max(mappedModules.length, 1)) * 25));
                promptModules.push({
                    sourceModule: mod.name,
                    targetTable: userMappings[mod.name],
                    fields: (mod.fields ?? []).slice(0, 50),
                    sampleRows: (mod.sampleRows ?? []).slice(0, 5),
                });
            }
            sendSSE('progress', 'AI prompt hazırlandı, OpenRouter\'a gönderiliyor...', 30);
            const TARGET_SCHEMA_DETAIL = `
crm_contacts: first_name, last_name, full_name, email, phone, mobile, company_name, job_title, department, website, address_line1, city, state, country(2-char ISO), postal_code, contact_type, lead_source, lead_status
crm_companies: name, legal_name, industry, website, email, phone, city, country(2-char ISO), tax_number, tax_office
crm_deals: title, deal_value(numeric), currency(3-char), stage, probability(0-100), expected_close_date
erp_products: name, sku, barcode, category, description, cost_price(numeric), sale_price(numeric), currency, stock_quantity(numeric), unit`;
            const openrouterKey = env.OPENROUTER_API_KEY;
            let connectorConfig = null;
            if (openrouterKey && promptModules.length > 0) {
                try {
                    const prompt = `You are a data integration expert. The user has already decided which source module maps to which target table. Your ONLY job is field-level mapping — do NOT change targetTable values.

USER MODULE MAPPINGS (fixed):
${promptModules.map(m => `- "${m.sourceModule}" → ${m.targetTable}`).join('\n')}

TARGET SCHEMA:
${TARGET_SCHEMA_DETAIL}

SOURCE MODULES WITH SAMPLE DATA:
${JSON.stringify(promptModules, null, 2)}

Rules:
1. targetTable is fixed — copy it exactly as given.
2. For each source field, find the best targetField using sample data values (not just field name).
3. Choose transform: direct, phone_e164(for phone numbers), country_iso(2-char country), name_case(proper case), email_lower(emails), currency_strip(monetary amounts), custom(no match).
4. Unmatched fields: targetField="custom_fields", transform="custom", customFieldKey=sourceFieldName.
5. Output ONLY valid JSON, no markdown:
{"mappings":[{"sourceModule":"str","targetTable":"str","fields":[{"sourceField":"str","targetField":"str","transform":"direct","customFieldKey":null}]}],"unmappedFields":[]}`;
                    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
                        method: 'POST',
                        headers: { Authorization: `Bearer ${openrouterKey}`, 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            model: 'nvidia/llama-3.1-nemotron-70b-instruct:free',
                            messages: [{ role: 'user', content: prompt }],
                            temperature: 0.1, max_tokens: 4000,
                        }),
                        signal: AbortSignal.timeout(45000),
                    });
                    sendSSE('progress', 'AI yanıtı işleniyor...', 80);
                    const aiData = await res.json();
                    const raw = aiData.choices?.[0]?.message?.content ?? '';
                    const jsonMatch = raw.match(/\{[\s\S]*\}/);
                    if (jsonMatch) {
                        const parsed = JSON.parse(jsonMatch[0]);
                        connectorConfig = {
                            version: 2, generatedAt: new Date().toISOString(), sourceType: conn.crmType,
                            userMappings, mappings: parsed.mappings ?? [], unmappedFields: parsed.unmappedFields ?? [], aiGenerated: true,
                        };
                    }
                }
                catch (err) {
                    sendSSE('progress', `AI hatası — fallback kullanılıyor`, 80);
                    console.error('[generate-connector/stream] AI error:', err);
                }
            }
            if (!connectorConfig) {
                sendSSE('progress', 'Regex tabanlı konnektör oluşturuluyor...', 80);
                connectorConfig = {
                    version: 2, generatedAt: new Date().toISOString(), sourceType: conn.crmType,
                    userMappings, mappings: buildFallbackMappingsFromUserMap(promptModules), unmappedFields: [], aiGenerated: false,
                };
            }
            sendSSE('progress', 'Konnektör kaydediliyor...', 90);
            await db.update(crmConnections).set({ connectorConfig, updatedAt: new Date() }).where(eq(crmConnections.id, id));
            sendSSE('done', 'Konnektör hazır', 100, { connector: connectorConfig });
        }
        catch (err) {
            sendSSE('error', err.message ?? 'Bilinmeyen hata', 0);
        }
        finally {
            clearInterval(heartbeat);
            reply.raw.end();
        }
    });
    // POST /api/v1/crm/connections/:id/generate-connector
    app.post('/connections/:id/generate-connector', { onRequest: [app.authenticate] }, async (req, reply) => {
        const { id } = req.params;
        const conn = await db.query.crmConnections.findFirst({ where: eq(crmConnections.id, id) });
        if (!conn)
            return reply.status(404).send({ error: 'Bağlantı bulunamadı' });
        const { userMappings = {} } = req.body ?? {};
        const cacheKey = `ki:crm:structure:${id}`;
        const cached = await redis.get(cacheKey);
        const allModules = cached ? JSON.parse(cached) : (req.body?.modules ?? []);
        if (!allModules.length)
            return reply.status(400).send({ error: 'Önce yapı taraması yapın' });
        const hasUserMappings = Object.keys(userMappings).length > 0;
        const promptModules = hasUserMappings
            ? allModules.filter(m => userMappings[m.name]).map(m => ({ sourceModule: m.name, targetTable: userMappings[m.name], fields: (m.fields ?? []).slice(0, 50), sampleRows: (m.sampleRows ?? []).slice(0, 5) }))
            : allModules.slice(0, 15).map(m => ({ sourceModule: m.name, targetTable: null, fields: (m.fields ?? []).slice(0, 30), sampleRows: (m.sampleRows ?? []).slice(0, 3) }));
        const openrouterKey = env.OPENROUTER_API_KEY;
        let connectorConfig = null;
        if (openrouterKey && promptModules.length > 0) {
            try {
                const prompt = hasUserMappings
                    ? `You are a data integration expert. Module-to-table mapping is fixed by the user. Do field-level mapping only.
MAPPINGS (fixed): ${promptModules.map(m => `"${m.sourceModule}"→${m.targetTable}`).join(', ')}
TARGET COLUMNS: crm_contacts(first_name,last_name,email,phone,mobile,company_name,job_title,city,country,contact_type,lead_source,custom_fields), crm_companies(name,industry,website,email,phone,city,country,tax_number,custom_fields), crm_deals(title,deal_value,currency,stage,probability,expected_close_date,custom_fields), erp_products(name,sku,category,cost_price,sale_price,currency,stock_quantity,unit,custom_fields)
SOURCE DATA: ${JSON.stringify(promptModules, null, 2)}
Rules: use sample data to pick transforms(phone_e164,email_lower,name_case,currency_strip,country_iso,direct,custom). Unmatched→custom_fields. Output ONLY JSON: {"mappings":[{"sourceModule":"str","targetTable":"str","fields":[{"sourceField":"str","targetField":"str","transform":"direct","customFieldKey":null}]}],"unmappedFields":[]}`
                    : `Map source CRM modules to target tables. SOURCE: ${JSON.stringify(promptModules, null, 2)}
Decide targetTable (crm_contacts|crm_companies|crm_deals|erp_products|null) and field mappings.
Output ONLY JSON: {"mappings":[{"sourceModule":"str","targetTable":"str","fields":[{"sourceField":"str","targetField":"str","transform":"direct","customFieldKey":null}]}],"unmappedFields":[]}`;
                const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
                    method: 'POST',
                    headers: { Authorization: `Bearer ${openrouterKey}`, 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        model: 'nvidia/llama-3.1-nemotron-70b-instruct:free',
                        messages: [{ role: 'user', content: prompt }],
                        temperature: 0.1, max_tokens: 4000,
                    }),
                    signal: AbortSignal.timeout(45000),
                });
                const aiData = await res.json();
                const raw = aiData.choices?.[0]?.message?.content ?? '';
                const jsonMatch = raw.match(/\{[\s\S]*\}/);
                if (jsonMatch) {
                    const parsed = JSON.parse(jsonMatch[0]);
                    connectorConfig = {
                        version: 2, generatedAt: new Date().toISOString(), sourceType: conn.crmType,
                        userMappings, mappings: parsed.mappings ?? [], unmappedFields: parsed.unmappedFields ?? [], aiGenerated: true,
                    };
                }
            }
            catch (err) {
                console.error('[generate-connector] AI error:', err);
            }
        }
        if (!connectorConfig) {
            const fallbackMappings = hasUserMappings
                ? buildFallbackMappingsFromUserMap(promptModules)
                : buildFallbackMappings(allModules, conn.crmType);
            connectorConfig = {
                version: 2, generatedAt: new Date().toISOString(), sourceType: conn.crmType,
                userMappings, mappings: fallbackMappings, unmappedFields: [], aiGenerated: false,
            };
        }
        await db.update(crmConnections)
            .set({ connectorConfig, updatedAt: new Date() })
            .where(eq(crmConnections.id, id));
        return reply.send({ connector: connectorConfig, aiGenerated: connectorConfig.aiGenerated !== false });
    });
    // PUT /api/v1/crm/connections/:id/connector — save edited connector
    app.put('/connections/:id/connector', { onRequest: [app.authenticate] }, async (req, reply) => {
        const { id } = req.params;
        const { connector } = req.body;
        if (!connector)
            return reply.status(400).send({ error: 'connector gerekli' });
        await db.update(crmConnections).set({ connectorConfig: connector, updatedAt: new Date() }).where(eq(crmConnections.id, id));
        return reply.send({ ok: true });
    });
    // GET /api/v1/crm/connections/:id/sync-history
    app.get('/connections/:id/sync-history', { onRequest: [app.authenticate] }, async (req, reply) => {
        const { id } = req.params;
        const jobs = await db.query.crmBulkJobs.findMany({
            where: eq(crmBulkJobs.connectionId, id),
            orderBy: (t, { desc }) => [desc(t.createdAt)],
            limit: 20,
        });
        return reply.send({ jobs });
    });
    // ── POST /crm/connections/:id/import-direct ────────────────────────────────
    // Eşleştirmesiz import: modülleri ve field'ları doğrudan DB'den çekip crm_modules + crm_fields'e yazar
    app.post('/connections/:id/import-direct', { onRequest: [app.authenticate] }, async (req, reply) => {
        const user = req.user;
        const { id } = req.params;
        const isUUID = (s) => !!s && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
        if (!isUUID(user.tenantId))
            return reply.status(403).send({ error: 'Entity bağlantısı gerekli' });
        const conn = await db.query.crmConnections.findFirst({
            where: (t, { and, eq }) => and(eq(t.id, id), eq(t.tenantId, user.tenantId)),
        });
        if (!conn)
            return reply.status(404).send({ error: 'Bağlantı bulunamadı' });
        const creds = decryptJson(conn.credentials);
        const adapter = createAdapter({ ...creds, type: conn.crmType });
        const rawModules = await adapter.getModules();
        let importedModules = 0;
        let importedFields = 0;
        for (const mod of rawModules.slice(0, 100)) {
            await db.insert(crmModules).values({
                tenantId: user.tenantId,
                connectionId: id,
                apiName: mod.apiName,
                moduleName: mod.label ?? mod.apiName,
                singularLabel: mod.singular ?? mod.apiName,
                pluralLabel: mod.label ?? mod.apiName,
                generatedType: 'custom',
                apiSupported: true,
                creatable: false,
                editable: false,
                deletable: false,
                viewable: true,
                isActive: true,
                lastSyncedAt: new Date(),
            }).onConflictDoUpdate({
                target: [crmModules.connectionId, crmModules.apiName],
                set: {
                    moduleName: mod.label ?? mod.apiName,
                    pluralLabel: mod.label ?? mod.apiName,
                    isActive: true,
                    lastSyncedAt: new Date(),
                },
            });
            importedModules++;
            const fields = await adapter.getModuleFields(mod.apiName).catch(() => []);
            for (const f of fields.slice(0, 200)) {
                await db.insert(crmFields).values({
                    connectionId: id,
                    moduleApiName: mod.apiName,
                    apiName: String(f.apiName ?? f.name ?? ''),
                    fieldLabel: String(f.label ?? f.apiName ?? ''),
                    dataType: String(f.dataType ?? f.type ?? 'text'),
                    fieldType: String(f.fieldType ?? f.type ?? 'text'),
                    isMandatory: Boolean(f.isMandatory ?? false),
                    isReadOnly: Boolean(f.isReadOnly ?? false),
                    isCustomField: Boolean(f.isCustomField ?? false),
                    lastSyncedAt: new Date(),
                }).onConflictDoUpdate({
                    target: [crmFields.connectionId, crmFields.moduleApiName, crmFields.apiName],
                    set: {
                        fieldLabel: String(f.label ?? f.apiName ?? ''),
                        dataType: String(f.dataType ?? f.type ?? 'text'),
                        lastSyncedAt: new Date(),
                    },
                });
                importedFields++;
            }
        }
        return reply.send({ ok: true, importedModules, importedFields });
    });
    // ── GET /crm/structure ─────────────────────────────────────────────────────
    // Dashboard için CRM yapısını döner (modüller + field'lar).
    // entity_main / entity_supervisor: hep görür
    // entity_sub: permissions.viewCrmStructure === true ise görür
    app.get('/structure', { onRequest: [app.authenticate] }, async (req, reply) => {
        const user = req.user;
        const isUUID = (s) => !!s && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
        if (!isUUID(user.tenantId))
            return reply.send({ modules: [], canView: false });
        const role = user.role ?? 'entity_sub';
        const elevated = ['admin', 'supervisor', 'entity_main', 'entity_supervisor'].includes(role);
        if (!elevated) {
            // entity_sub: check viewCrmStructure permission
            const entity = await db.query.kibiEntities.findFirst({
                where: (t, { eq }) => eq(t.entityId, user.tenantId),
                columns: { id: true },
            });
            if (!entity)
                return reply.send({ modules: [], canView: false });
            const entityUser = await db.query.kibiEntityUsers.findFirst({
                where: (t, { and, eq }) => and(eq(t.entityId, entity.id), eq(t.userId, user.sub))
            });
            const perms = (entityUser?.permissions ?? {});
            if (!perms.viewCrmStructure)
                return reply.send({ modules: [], canView: false });
        }
        // Get first active connection for this tenant
        const conn = await db.query.crmConnections.findFirst({
            where: (t, { and, eq }) => and(eq(t.tenantId, user.tenantId), eq(t.isActive, true)),
            columns: { id: true, name: true, crmType: true },
        });
        if (!conn)
            return reply.send({ modules: [], canView: true });
        const modules = await db.query.crmModules.findMany({
            where: (t, { and, eq }) => and(eq(t.connectionId, conn.id), eq(t.isActive, true)),
            orderBy: (t, { asc }) => [asc(t.apiName)],
            columns: { id: true, apiName: true, moduleName: true, pluralLabel: true, singularLabel: true, lastSyncedAt: true },
        });
        const fields = await db.query.crmFields.findMany({
            where: (t, { eq }) => eq(t.connectionId, conn.id),
            orderBy: (t, { asc }) => [asc(t.moduleApiName), asc(t.apiName)],
            columns: { id: true, moduleApiName: true, apiName: true, fieldLabel: true, dataType: true, isMandatory: true, isCustomField: true },
        });
        return reply.send({ modules, fields, connection: conn, canView: true });
    });
    // ── PUT /crm/users/:userId/structure-permission ───────────────────────────
    // entity_main veya admin: entity_sub kullanıcıya CRM yapısı görüntüleme yetkisi ver/al
    app.put('/users/:userId/structure-permission', { onRequest: [app.authenticate] }, async (req, reply) => {
        const user = req.user;
        const { userId } = req.params;
        const { allow } = req.body;
        const isUUID = (s) => !!s && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
        if (!['entity_main', 'admin', 'supervisor'].includes(user.role ?? '')) {
            return reply.status(403).send({ error: 'Bu işlem için yetkiniz yok' });
        }
        if (!isUUID(user.tenantId))
            return reply.status(403).send({ error: 'Entity bağlantısı gerekli' });
        const entity = await db.query.kibiEntities.findFirst({
            where: (t, { eq }) => eq(t.entityId, user.tenantId),
            columns: { id: true },
        });
        if (!entity)
            return reply.status(404).send({ error: 'Entity bulunamadı' });
        const entityUser = await db.query.kibiEntityUsers.findFirst({
            where: (t, { and, eq }) => and(eq(t.entityId, entity.id), eq(t.userId, userId))
        });
        if (entityUser) {
            const current = (entityUser.permissions ?? {});
            await db.update(kibiEntityUsers)
                .set({ permissions: { ...current, viewCrmStructure: allow } })
                .where(and(eq(kibiEntityUsers.entityId, entity.id), eq(kibiEntityUsers.userId, userId)));
        }
        else {
            await db.insert(kibiEntityUsers).values({
                entityId: entity.id,
                userId,
                role: 'entity_sub',
                permissions: { viewCrmStructure: allow },
            });
        }
        return reply.send({ ok: true, userId, viewCrmStructure: allow });
    });
    // ── YFZ 19-21 / FAZ B — Connector AI Catalog + Analysis + Pipeline Logging ──
    // GET /crm/connections/:id/catalog — entity_data_catalog'dan kayıtları döndür
    app.get('/connections/:id/catalog', { onRequest: [app.authenticate] }, async (req, reply) => {
        const { id } = req.params;
        const user = req.user;
        const conn = await db.query.crmConnections.findFirst({ where: (t, { eq }) => eq(t.id, id) });
        if (!conn)
            return reply.status(404).send({ error: 'Connection not found' });
        if (conn.tenantId !== user.tenantId)
            return reply.status(403).send({ error: 'Forbidden' });
        const entity = await db.query.kibiEntities.findFirst({ where: (t, { eq }) => eq(t.entityId, conn.tenantId) });
        if (!entity)
            return reply.status(404).send({ error: 'Entity not found' });
        const entries = await db.query.entityDataCatalog.findMany({
            where: (t, { eq }) => eq(t.entityId, entity.id),
        });
        return reply.send({
            catalog: entries.map(e => ({
                ...e,
                isApproved: e.isUserApproved,
                columnCount: e.columns?.length ?? 0,
            })),
        });
    });
    // PUT /crm/connections/:id/catalog/:tableId/approve — tabloyu onayla
    app.put('/connections/:id/catalog/:tableId/approve', { onRequest: [app.authenticate] }, async (req, reply) => {
        const { id, tableId } = req.params;
        const user = req.user;
        const conn = await db.query.crmConnections.findFirst({ where: (t, { eq }) => eq(t.id, id) });
        if (!conn || conn.tenantId !== user.tenantId)
            return reply.status(403).send({ error: 'Forbidden' });
        await db
            .update(entityDataCatalog)
            .set({ isUserApproved: true, updatedAt: new Date() })
            .where(eq(entityDataCatalog.id, tableId));
        return reply.send({ ok: true });
    });
    // POST /crm/connections/:id/catalog/bulk-approve — birden fazla tabloyu onayla
    app.post('/connections/:id/catalog/bulk-approve', { onRequest: [app.authenticate] }, async (req, reply) => {
        const { id } = req.params;
        const { tableIds } = req.body;
        const user = req.user;
        const conn = await db.query.crmConnections.findFirst({ where: (t, { eq }) => eq(t.id, id) });
        if (!conn || conn.tenantId !== user.tenantId)
            return reply.status(403).send({ error: 'Forbidden' });
        if (tableIds && tableIds.length > 0) {
            for (const tableId of tableIds) {
                await db
                    .update(entityDataCatalog)
                    .set({ isUserApproved: true, updatedAt: new Date() })
                    .where(eq(entityDataCatalog.id, tableId));
            }
        }
        return reply.send({ ok: true });
    });
    // GET /crm/connections/:id/analyze/stream — Connector AI SSE akışı
    app.get('/connections/:id/analyze/stream', async (req, reply) => {
        const { id } = req.params;
        const { token } = req.query;
        if (!token)
            return reply.status(400).send({ error: 'token required' });
        const conn = await db.query.crmConnections.findFirst({ where: (t, { eq }) => eq(t.id, id) });
        if (!conn)
            return reply.status(404).send({ error: 'Connection not found' });
        const entity = await db.query.kibiEntities.findFirst({ where: (t, { eq }) => eq(t.entityId, conn.tenantId) });
        if (!entity)
            return reply.status(404).send({ error: 'Entity not found' });
        // Scanned tablolar Redis'ten al (scan-structure'tan)
        const scanKey = `crm:scan:${id}`;
        const scanJson = await redis.get(scanKey);
        if (!scanJson)
            return reply.status(400).send({ error: 'Scan not found, run scan-structure first' });
        const scannedTables = JSON.parse(scanJson);
        reply.header('Content-Type', 'text/event-stream');
        reply.header('Cache-Control', 'no-cache');
        reply.header('Connection', 'keep-alive');
        const send = (data) => {
            reply.raw.write(`data: ${JSON.stringify(data)}\n\n`);
        };
        // Connector AI analiz
        try {
            await runConnectorAnalysis(id, entity.id, entity.id, conn.crmType ?? 'unknown', scannedTables, send);
            send({ type: 'complete', ok: true });
            reply.raw.end();
        }
        catch (err) {
            console.error('[ANALYZE-STREAM]', err);
            send({ type: 'error', message: err.message });
            reply.raw.end();
        }
    });
    // POST /crm/connections/:id/test-query — katalog sorgu şablonunu test et
    app.post('/connections/:id/test-query', { onRequest: [app.authenticate] }, async (req, reply) => {
        const { id } = req.params;
        const { templateKey, tableName, params } = req.body;
        const user = req.user;
        const conn = await db.query.crmConnections.findFirst({ where: (t, { eq }) => eq(t.id, id) });
        if (!conn || conn.crmType !== 'postgresql')
            return reply.status(400).send({ error: 'Only PostgreSQL' });
        if (conn.tenantId !== user.tenantId)
            return reply.status(403).send({ error: 'Forbidden' });
        // Katalog entry'den şablonu al
        const entity = await db.query.kibiEntities.findFirst({ where: (t, { eq }) => eq(t.entityId, conn.tenantId) });
        if (!entity)
            return reply.status(404).send({ error: 'Entity not found' });
        const catalog = await db.query.entityDataCatalog.findFirst({
            where: (t, { and, eq }) => and(eq(t.entityId, entity.id), eq(t.tableName, tableName)),
        });
        if (!catalog)
            return reply.status(404).send({ error: 'Table not in catalog' });
        const templates = catalog.queryTemplates ?? {};
        let query = templates[templateKey];
        if (!query)
            return reply.status(400).send({ error: 'Template not found' });
        // Parametreleri doldur
        for (const [key, val] of Object.entries(params)) {
            query = query.replace(`{${key}}`, String(val).substring(0, 100));
        }
        // SELECT kontrolü
        if (!query.trim().toUpperCase().startsWith('SELECT')) {
            return reply.status(403).send({ error: 'Only SELECT allowed' });
        }
        try {
            const adapter = createAdapter(conn.crmType, decryptJson(conn.credentials));
            if (!adapter)
                return reply.status(400).send({ error: 'Invalid adapter' });
            const rows = await adapter.queryRaw?.(query);
            return reply.send({ rows: (rows ?? []).slice(0, 20) });
        }
        catch (err) {
            return reply.status(500).send({ error: err.message });
        }
    });
};
const FIELD_MAP_PATTERNS = {
    email: { target: 'email', transform: 'email_lower' },
    mail: { target: 'email', transform: 'email_lower' },
    phone: { target: 'phone', transform: 'phone_e164' },
    mobile: { target: 'mobile', transform: 'phone_e164' },
    first_name: { target: 'first_name', transform: 'name_case' },
    last_name: { target: 'last_name', transform: 'name_case' },
    name: { target: 'name', transform: 'name_case' },
    full_name: { target: 'full_name', transform: 'name_case' },
    website: { target: 'website', transform: 'direct' },
    industry: { target: 'industry', transform: 'direct' },
    amount: { target: 'deal_value', transform: 'currency_strip' },
    deal_name: { target: 'title', transform: 'direct' },
    stage: { target: 'stage', transform: 'direct' },
    price: { target: 'sale_price', transform: 'currency_strip' },
    unit_price: { target: 'sale_price', transform: 'currency_strip' },
    cost_price: { target: 'cost_price', transform: 'currency_strip' },
    sku: { target: 'sku', transform: 'direct' },
    quantity: { target: 'stock_quantity', transform: 'direct' },
    stock: { target: 'stock_quantity', transform: 'direct' },
    country: { target: 'country', transform: 'country_iso' },
    city: { target: 'city', transform: 'direct' },
    address: { target: 'address_line1', transform: 'direct' },
    job_title: { target: 'job_title', transform: 'direct' },
    title: { target: 'job_title', transform: 'direct' },
    company: { target: 'company_name', transform: 'name_case' },
    tax_number: { target: 'tax_number', transform: 'direct' },
    category: { target: 'category', transform: 'direct' },
    description: { target: 'description', transform: 'direct' },
};
function buildFallbackMappingsFromUserMap(promptModules) {
    return promptModules.map(mod => ({
        sourceModule: mod.sourceModule,
        targetTable: mod.targetTable,
        fields: (mod.fields ?? []).map((f) => {
            const key = (f.name ?? '').toLowerCase();
            const mapped = FIELD_MAP_PATTERNS[key];
            if (mapped)
                return { sourceField: f.name, targetField: mapped.target, transform: mapped.transform, customFieldKey: null };
            return { sourceField: f.name, targetField: 'custom_fields', transform: 'custom', customFieldKey: f.name };
        }),
    }));
}
function buildFallbackMappings(modules, _sourceType) {
    const contactPatterns = /contact|lead|person|müşteri|kişi/i;
    const companyPatterns = /account|company|firma|şirket|organization/i;
    const dealPatterns = /deal|opportunity|fırsat|satış|pipeline/i;
    const productPatterns = /product|item|ürün|inventory/i;
    return modules.map((mod) => {
        let targetTable = null;
        if (contactPatterns.test(mod.name))
            targetTable = 'crm_contacts';
        else if (companyPatterns.test(mod.name))
            targetTable = 'crm_companies';
        else if (dealPatterns.test(mod.name))
            targetTable = 'crm_deals';
        else if (productPatterns.test(mod.name))
            targetTable = 'erp_products';
        const fields = (mod.fields ?? []).map((f) => {
            const key = (f.name ?? '').toLowerCase();
            const mapped = FIELD_MAP_PATTERNS[key];
            if (mapped && targetTable)
                return { sourceField: f.name, targetField: mapped.target, transform: mapped.transform, customFieldKey: null };
            return { sourceField: f.name, targetField: 'custom_fields', transform: 'custom', customFieldKey: f.name };
        });
        return { sourceModule: mod.name, targetTable, fields };
    });
}
//# sourceMappingURL=crm.js.map