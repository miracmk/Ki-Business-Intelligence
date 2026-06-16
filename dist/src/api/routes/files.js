import { db } from '../../lib/db.js';
import { fileStorage, tenants } from '../../../db/schema.js';
import { eq } from 'drizzle-orm';
import { createWriteStream, mkdirSync, existsSync, unlinkSync, createReadStream } from 'fs';
import { join } from 'path';
import { pipeline } from 'stream/promises';
export const fileRoutes = async (app) => {
    app.get('/storage-info', { onRequest: [app.authenticate] }, async (req) => {
        const user = req.user;
        const tenant = await db.query.tenants.findFirst({ where: (t, { eq }) => eq(t.id, user.tenantId) });
        return { usedBytes: tenant?.storageUsedBytes ?? 0, limitBytes: tenant?.storageLimitBytes ?? 1073741824 };
    });
    app.get('/', { onRequest: [app.authenticate] }, async (req) => {
        const user = req.user;
        const files = await db.query.fileStorage.findMany({
            where: (t, { eq }) => eq(t.tenantId, user.tenantId),
            orderBy: (t, { desc }) => [desc(t.createdAt)],
        });
        return { files };
    });
    app.post('/upload', { onRequest: [app.authenticate] }, async (req, reply) => {
        const user = req.user;
        const data = await req.file();
        if (!data)
            return reply.status(400).send({ error: 'Dosya bulunamadı' });
        const tenant = await db.query.tenants.findFirst({ where: (t, { eq }) => eq(t.id, user.tenantId) });
        const usedBytes = tenant?.storageUsedBytes ?? 0;
        const limitBytes = tenant?.storageLimitBytes ?? 1073741824;
        const uploadDir = join(process.cwd(), 'storage', user.tenantId);
        if (!existsSync(uploadDir))
            mkdirSync(uploadDir, { recursive: true });
        const filename = `${Date.now()}-${data.filename}`;
        const filepath = join(uploadDir, filename);
        await pipeline(data.file, createWriteStream(filepath));
        const { size } = require('fs').statSync(filepath);
        const [file] = await db.insert(fileStorage).values({
            tenantId: user.tenantId,
            filename,
            originalName: data.filename,
            mimeType: data.mimetype,
            sizeBytes: size,
            storageType: 'local',
            storagePath: filepath,
        }).returning();
        await db.update(tenants).set({ storageUsedBytes: usedBytes + size }).where(eq(tenants.id, user.tenantId));
        return reply.status(201).send({ file });
    });
    app.get('/:id/download', { onRequest: [app.authenticate] }, async (req, reply) => {
        const { id } = req.params;
        const file = await db.query.fileStorage.findFirst({ where: (t, { eq }) => eq(t.id, id) });
        if (!file)
            return reply.status(404).send({ error: 'Dosya bulunamadı' });
        if (!file.storagePath || !existsSync(file.storagePath))
            return reply.status(404).send({ error: 'Dosya diskde bulunamadı' });
        reply.header('Content-Disposition', `attachment; filename="${encodeURIComponent(file.originalName)}"`);
        reply.header('Content-Type', file.mimeType ?? 'application/octet-stream');
        return reply.send(createReadStream(file.storagePath));
    });
    app.delete('/:id', { onRequest: [app.authenticate] }, async (req, reply) => {
        const { id } = req.params;
        const file = await db.query.fileStorage.findFirst({ where: (t, { eq }) => eq(t.id, id) });
        if (!file)
            return reply.status(404).send({ error: 'Dosya bulunamadı' });
        if (file.storagePath && existsSync(file.storagePath))
            unlinkSync(file.storagePath);
        await db.delete(fileStorage).where(eq(fileStorage.id, id));
        const tenant = await db.query.tenants.findFirst({ where: (t, { eq }) => eq(t.id, file.tenantId) });
        await db.update(tenants).set({ storageUsedBytes: Math.max(0, (tenant?.storageUsedBytes ?? 0) - file.sizeBytes) }).where(eq(tenants.id, file.tenantId));
        return reply.send({ ok: true });
    });
    app.get('/gdrive/connect', { onRequest: [app.authenticate] }, async (_req, reply) => {
        return reply.send({ url: '#', message: 'Google Drive entegrasyonu yakında' });
    });
};
//# sourceMappingURL=files.js.map