import { db } from '../../lib/db.js';
import { kibiModelConfigs } from '../../../db/schema.js';
import { eq } from 'drizzle-orm';
import { runKibiConversation } from '../../engine/kibi/conversation.js';
export const kibiRoutes = async (app) => {
    app.post('/chat', { onRequest: [app.authenticate] }, async (req, reply) => {
        const user = req.user;
        const { message, sessionId } = req.body;
        if (!message || !sessionId)
            return reply.status(400).send({ error: 'message and sessionId required' });
        const entity = await db.query.kibiEntities.findFirst({ where: (t, { eq }) => eq(t.entityId, user.tenantId) });
        const result = await runKibiConversation({
            tenantId: user.tenantId,
            sessionId,
            userMessage: message,
            channel: 'web',
            entityContext: entity ? { entityId: entity.id, clientId: entity.clientId, mood: entity.mood, lastContactAt: entity.lastContactAt } : undefined,
        });
        return reply.send(result);
    });
    app.get('/entity-context', { onRequest: [app.authenticate] }, async (req, reply) => {
        const user = req.user;
        const entity = await db.query.kibiEntities.findFirst({ where: (t, { eq }) => eq(t.entityId, user.tenantId) });
        if (!entity)
            return reply.send({ entityContext: null });
        return reply.send({ entityContext: {
                entityId: entity.id,
                clientId: entity.clientId,
                mood: entity.mood,
                lastContactAt: entity.lastContactAt,
                opportunityScore: entity.opportunityScore,
            } });
    });
    app.get('/entity-models', { onRequest: [app.authenticate] }, async (req, reply) => {
        const user = req.user;
        const entity = await db.query.kibiEntities.findFirst({ where: (t, { eq }) => eq(t.entityId, user.tenantId) });
        if (!entity)
            return reply.send({ models: [] });
        const models = await db.query.kibiModelConfigs.findMany({ where: (t, { and, eq }) => and(eq(t.scope, 'entity'), eq(t.scopeId, entity.id)) });
        return reply.send({ models });
    });
    app.put('/entity-models/:role', { onRequest: [app.authenticate] }, async (req, reply) => {
        const user = req.user;
        const entity = await db.query.kibiEntities.findFirst({ where: (t, { eq }) => eq(t.entityId, user.tenantId) });
        if (!entity)
            return reply.status(404).send({ error: 'Entity bulunamadı' });
        const { role } = req.params;
        const { primaryModel, fallback1, fallback2, fallback3, provider, apiKey, temperature, maxTokens, isActive } = req.body;
        const existing = await db.query.kibiModelConfigs.findFirst({ where: (t, { and, eq }) => and(eq(t.scope, 'entity'), eq(t.scopeId, entity.id), eq(t.modelRole, role)) });
        if (existing) {
            await db.update(kibiModelConfigs).set({
                primaryModel,
                fallback1,
                fallback2,
                fallback3,
                provider,
                apiKey,
                temperature: temperature !== undefined ? String(temperature) : undefined,
                maxTokens,
                isActive,
                updatedAt: new Date(),
            }).where(eq(kibiModelConfigs.id, existing.id));
        }
        else {
            await db.insert(kibiModelConfigs).values({
                scope: 'entity',
                scopeId: entity.id,
                modelRole: role,
                primaryModel,
                fallback1,
                fallback2,
                fallback3,
                provider,
                apiKey,
                temperature,
                maxTokens,
                isActive: isActive ?? true,
                updatedAt: new Date(),
            });
        }
        return reply.send({ ok: true });
    });
};
//# sourceMappingURL=kibi.js.map