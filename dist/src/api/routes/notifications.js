import { db } from '../../lib/db.js';
import { entityNotifications } from '../../../db/schema.js';
import { eq, and } from 'drizzle-orm';
const isUUID = (s) => !!s && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
async function resolveEntityId(tenantId) {
    const entity = await db.query.kibiEntities.findFirst({
        where: (t, { eq }) => eq(t.entityId, tenantId),
    }).catch(() => null);
    return entity?.id ?? null;
}
export const notificationRoutes = async (app) => {
    app.get('/', { onRequest: [app.authenticate] }, async (req) => {
        const user = req.user;
        if (!isUUID(user.tenantId))
            return { notifications: [], unreadCount: 0 };
        const entityId = await resolveEntityId(user.tenantId);
        if (!entityId)
            return { notifications: [], unreadCount: 0 };
        const notifications = await db.query.entityNotifications.findMany({
            where: (t, { and, eq }) => and(eq(t.entityId, entityId), eq(t.isRead, false)),
            orderBy: (t, { desc }) => [desc(t.createdAt)],
            limit: 20,
        });
        return { notifications, unreadCount: notifications.length };
    });
    app.put('/read-all', { onRequest: [app.authenticate] }, async (req) => {
        const user = req.user;
        if (!isUUID(user.tenantId))
            return { ok: true };
        const entityId = await resolveEntityId(user.tenantId);
        if (!entityId)
            return { ok: true };
        await db.update(entityNotifications)
            .set({ isRead: true, readAt: new Date() })
            .where(and(eq(entityNotifications.entityId, entityId), eq(entityNotifications.isRead, false)));
        return { ok: true };
    });
    app.put('/:id/read', { onRequest: [app.authenticate] }, async (req) => {
        const { id } = req.params;
        await db.update(entityNotifications)
            .set({ isRead: true, readAt: new Date() })
            .where(eq(entityNotifications.id, id));
        return { ok: true };
    });
};
// Shared helper to create a notification (called from other engine code)
export async function createEntityNotification(entityId, type, title, body, data, userId) {
    try {
        await db.insert(entityNotifications).values({
            entityId,
            userId: userId ?? null,
            type: type,
            title,
            body: body ?? null,
            data: data ?? {},
        });
    }
    catch { /* non-fatal */ }
}
//# sourceMappingURL=notifications.js.map