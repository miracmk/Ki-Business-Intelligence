import { db } from '../../lib/db.js';
import { aiConfigs, emailConfigs, tenantMemberships, tenants, users, platformConfigs, kibiModelConfigs, knowledgeEntries } from '../../../db/schema.js';
import { encryptJson, decryptJson, encrypt, decrypt } from '../../lib/crypto.js';
import { eq } from 'drizzle-orm';
import nodemailer from 'nodemailer';
import * as argon2 from 'argon2';
import { nanoid } from 'nanoid';
import { env } from '../../../config/env.js';
import { PROVIDERS, KIBI_FREE_MODEL } from '../../engine/ai/providers.js';
import { invalidateProviderKeyCache } from '../../engine/ai/gateway.js';
import { redis } from '../../lib/redis.js';
import { qdrant, embedConfigured } from '../../lib/qdrant.js';
const isUUID = (s) => !!s && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
export const tenantRoutes = async (app) => {
    // GET /api/v1/tenants/me
    app.get('/me', { onRequest: [app.authenticate] }, async (req) => {
        const user = req.user;
        const [tenant, dbUser] = await Promise.all([
            isUUID(user.tenantId)
                ? db.query.tenants.findFirst({ where: (t, { eq }) => eq(t.id, user.tenantId) })
                : Promise.resolve(null),
            db.query.users.findFirst({ where: (t, { eq }) => eq(t.id, user.sub) }),
        ]);
        const tenantSettings = (tenant?.settings ?? {});
        const profileExtras = tenantSettings.profiles?.[user.sub] ?? {};
        return {
            tenant,
            role: user.role,
            totpSecret: dbUser?.totpSecret ?? null,
            profile: {
                name: dbUser?.name ?? '',
                email: dbUser?.email ?? '',
                phone: dbUser?.phone ?? '',
                address: profileExtras.address ?? '',
                avatar: profileExtras.avatar ?? '',
            },
        };
    });
    // PUT /api/v1/tenants/me/settings
    app.put('/me/settings', { onRequest: [app.authenticate] }, async (req, reply) => {
        const user = req.user;
        const { language, timezone } = req.body;
        const tenant = await db.query.tenants.findFirst({ where: (t, { eq }) => eq(t.id, user.tenantId) });
        const existing = (tenant?.settings ?? {});
        await db.update(tenants)
            .set({ settings: { ...existing, ...(language ? { language } : {}), ...(timezone ? { timezone } : {}) } })
            .where(eq(tenants.id, user.tenantId));
        return reply.send({ ok: true });
    });
    // GET /api/v1/tenants/storage-usage
    app.get('/storage-usage', { onRequest: [app.authenticate] }, async (req) => {
        const user = req.user;
        const tenant = await db.query.tenants.findFirst({ where: (t, { eq }) => eq(t.id, user.tenantId) });
        return { usedBytes: tenant?.storageUsedBytes ?? 0, limitBytes: tenant?.storageLimitBytes ?? 1073741824 };
    });
    // PUT /api/v1/tenants/me/profile — update user profile (name, phone, address, avatar)
    app.put('/me/profile', { onRequest: [app.authenticate] }, async (req, reply) => {
        const user = req.user;
        const { name, phone, address, avatar } = req.body;
        if (name !== undefined || phone !== undefined) {
            await db.update(users)
                .set({
                ...(name !== undefined ? { name } : {}),
                ...(phone !== undefined ? { phone } : {}),
            })
                .where(eq(users.id, user.sub));
        }
        // Store address and avatar in tenant.settings.profiles[userId]
        if ((address !== undefined || avatar !== undefined) && isUUID(user.tenantId)) {
            const tenant = await db.query.tenants.findFirst({ where: (t, { eq }) => eq(t.id, user.tenantId) });
            const existing = (tenant?.settings ?? {});
            const profiles = existing.profiles ?? {};
            profiles[user.sub] = { ...profiles[user.sub], ...(address !== undefined ? { address } : {}), ...(avatar !== undefined ? { avatar } : {}) };
            await db.update(tenants).set({ settings: { ...existing, profiles } }).where(eq(tenants.id, user.tenantId));
        }
        return reply.send({ ok: true });
    });
    // PUT /api/v1/tenants/me/company — update company name (entity_main only)
    app.put('/me/company', { onRequest: [app.authenticate] }, async (req, reply) => {
        const user = req.user;
        if (!isUUID(user.tenantId))
            return reply.status(400).send({ error: 'Entity bağlantısı gerekli' });
        if (user.role !== 'entity_main' && user.role !== 'admin')
            return reply.status(403).send({ error: 'Yalnızca entity_main kullanıcılar şirket adını değiştirebilir' });
        const { name } = req.body;
        if (!name?.trim())
            return reply.status(400).send({ error: 'Şirket adı boş olamaz' });
        await db.update(tenants).set({ name: name.trim() }).where(eq(tenants.id, user.tenantId));
        return reply.send({ ok: true });
    });
    // GET /api/v1/tenants/channels/:channel — read channel config from tenant settings
    app.get('/channels/:channel', { onRequest: [app.authenticate] }, async (req, reply) => {
        const user = req.user;
        const { channel } = req.params;
        if (!isUUID(user.tenantId))
            return reply.send({ config: null });
        const tenant = await db.query.tenants.findFirst({ where: (t, { eq }) => eq(t.id, user.tenantId) });
        const settings = (tenant?.settings ?? {});
        return reply.send({ config: settings.channels?.[channel] ?? null });
    });
    // PUT /api/v1/tenants/channels/:channel — save channel config to tenant settings
    app.put('/channels/:channel', { onRequest: [app.authenticate] }, async (req, reply) => {
        const user = req.user;
        const { channel } = req.params;
        if (!isUUID(user.tenantId))
            return reply.status(400).send({ error: 'Entity bağlantısı gerekli' });
        if (!['entity_main', 'admin', 'supervisor'].includes(user.role))
            return reply.status(403).send({ error: 'Yetkisiz' });
        const config = req.body;
        const tenant = await db.query.tenants.findFirst({ where: (t, { eq }) => eq(t.id, user.tenantId) });
        const existing = (tenant?.settings ?? {});
        const channels = existing.channels ?? {};
        channels[channel] = config;
        await db.update(tenants).set({ settings: { ...existing, channels } }).where(eq(tenants.id, user.tenantId));
        return reply.send({ ok: true });
    });
    // DELETE /api/v1/tenants/channels/:channel — remove channel config
    app.delete('/channels/:channel', { onRequest: [app.authenticate] }, async (req, reply) => {
        const user = req.user;
        const { channel } = req.params;
        if (!isUUID(user.tenantId))
            return reply.status(400).send({ error: 'Entity bağlantısı gerekli' });
        const tenant = await db.query.tenants.findFirst({ where: (t, { eq }) => eq(t.id, user.tenantId) });
        const existing = (tenant?.settings ?? {});
        const channels = { ...(existing.channels ?? {}) };
        delete channels[channel];
        await db.update(tenants).set({ settings: { ...existing, channels } }).where(eq(tenants.id, user.tenantId));
        return reply.send({ ok: true });
    });
    // PUT /api/v1/tenants/ai-config — set AI provider, key, and dual-model config
    app.put('/ai-config', { onRequest: [app.authenticate] }, async (req, reply) => {
        const user = req.user;
        if (!isUUID(user.tenantId)) {
            return reply.status(400).send({ error: 'AI yapılandırması için entity bağlantısı gerekli. Admin kullanıcılar Platform Ayarları\'nı kullanmalıdır.' });
        }
        const body = req.body;
        const existing = await db.query.aiConfigs.findFirst({
            where: (t, { eq }) => eq(t.tenantId, user.tenantId),
        });
        const existingSettings = (existing?.settings ?? {});
        const newSettings = {
            ...existingSettings,
            ...(body.analysisModel !== undefined ? { analysisModel: body.analysisModel } : {}),
            ...(body.conversationModel !== undefined ? { conversationModel: body.conversationModel } : {}),
            ...(body.vectorModel !== undefined ? { vectorModel: body.vectorModel } : {}),
            ...(body.analysisFallbacks !== undefined ? { analysisFallbacks: body.analysisFallbacks } : {}),
            ...(body.conversationFallback !== undefined ? { conversationFallback: body.conversationFallback } : {}),
            ...(body.conversationF2 !== undefined ? { conversationF2: body.conversationF2 } : {}),
            ...(body.vectorFallbacks !== undefined ? { vectorFallbacks: body.vectorFallbacks } : {}),
            ...(body.kibiInstructions !== undefined ? { kibiInstructions: body.kibiInstructions } : {}),
            ...(body.entityInstructions !== undefined ? { entityInstructions: body.entityInstructions } : {}),
        };
        if (existing) {
            await db.update(aiConfigs)
                .set({
                provider: (body.provider ?? existing.provider),
                model: body.model ?? existing.model,
                apiKey: body.apiKey !== undefined
                    ? (body.apiKey ? encryptJson(body.apiKey) : null)
                    : existing.apiKey,
                settings: newSettings,
            })
                .where(eq(aiConfigs.id, existing.id));
        }
        else {
            await db.insert(aiConfigs).values({
                tenantId: user.tenantId,
                provider: (body.provider ?? 'openrouter'),
                model: body.model ?? 'meta-llama/llama-3.3-70b-instruct:free',
                apiKey: body.apiKey ? encryptJson(body.apiKey) : null,
                isDefault: true,
                settings: newSettings,
            });
        }
        return reply.send({ ok: true });
    });
    // ── Email config (SMTP + IMAP) ────────────────────────────────────────────────
    // GET /api/v1/tenants/email-config
    app.get('/email-config', { onRequest: [app.authenticate] }, async (req, reply) => {
        const user = req.user;
        if (!isUUID(user.tenantId))
            return reply.send({ config: null });
        const cfg = await db.query.emailConfigs.findFirst({
            where: (t, { eq }) => eq(t.tenantId, user.tenantId),
        });
        if (!cfg)
            return reply.send({ config: null });
        let creds = {};
        try {
            creds = decryptJson(cfg.credentials);
        }
        catch { /* corrupt */ }
        // Return config with passwords masked
        return reply.send({
            config: {
                id: cfg.id,
                name: cfg.name,
                fromName: cfg.fromName,
                fromEmail: cfg.fromEmail,
                smtp: {
                    host: creds.smtp?.host ?? '',
                    port: creds.smtp?.port ?? 587,
                    secure: creds.smtp?.secure ?? false,
                    user: creds.smtp?.user ?? '',
                    hasPassword: !!creds.smtp?.password,
                },
                imap: {
                    host: creds.imap?.host ?? '',
                    port: creds.imap?.port ?? 993,
                    secure: creds.imap?.secure ?? true,
                    user: creds.imap?.user ?? '',
                    hasPassword: !!creds.imap?.password,
                    inboxFolder: creds.imap?.inboxFolder ?? 'INBOX',
                    checkIntervalMinutes: creds.imap?.checkIntervalMinutes ?? 5,
                    autoReply: creds.imap?.autoReply ?? false,
                },
            },
        });
    });
    // PUT /api/v1/tenants/email-config
    app.put('/email-config', { onRequest: [app.authenticate] }, async (req, reply) => {
        const user = req.user;
        if (!isUUID(user.tenantId))
            return reply.status(400).send({ error: 'Entity bağlantısı gerekli' });
        if (!['entity_main', 'admin'].includes(user.role))
            return reply.status(403).send({ error: 'Yetkisiz' });
        const body = req.body;
        const existing = await db.query.emailConfigs.findFirst({
            where: (t, { eq }) => eq(t.tenantId, user.tenantId),
        });
        let existingCreds = {};
        if (existing?.credentials) {
            try {
                existingCreds = decryptJson(existing.credentials);
            }
            catch { /* ignore */ }
        }
        const smtpBody = body.smtp ?? {};
        const imapBody = body.imap ?? {};
        const newCreds = {
            smtp: {
                ...existingCreds.smtp,
                ...smtpBody,
                // Don't overwrite existing password if new one not provided
                password: smtpBody.password ?? existingCreds.smtp?.password ?? '',
            },
            imap: {
                ...existingCreds.imap,
                ...imapBody,
                password: imapBody.password ?? existingCreds.imap?.password ?? '',
            },
        };
        const encrypted = encryptJson(newCreds);
        if (existing) {
            await db.update(emailConfigs).set({
                fromName: body.fromName ?? existing.fromName,
                fromEmail: body.fromEmail ?? existing.fromEmail,
                credentials: encrypted,
                updatedAt: new Date(),
            }).where(eq(emailConfigs.id, existing.id));
        }
        else {
            await db.insert(emailConfigs).values({
                tenantId: user.tenantId,
                name: 'Varsayılan E-posta',
                provider: 'smtp',
                fromName: body.fromName ?? '',
                fromEmail: body.fromEmail ?? '',
                credentials: encrypted,
                isDefault: true,
            });
        }
        return reply.send({ ok: true });
    });
    // POST /api/v1/tenants/channels/email/test-smtp
    app.post('/channels/email/test-smtp', { onRequest: [app.authenticate] }, async (req, reply) => {
        const user = req.user;
        if (!isUUID(user.tenantId))
            return reply.status(400).send({ error: 'Entity bağlantısı gerekli' });
        const { host, port, secure, user: smtpUser, password } = req.body;
        if (!host || !smtpUser)
            return reply.status(400).send({ error: 'host ve kullanıcı gerekli' });
        // If no password in request, try to use saved password
        let finalPassword = password;
        if (!finalPassword) {
            const cfg = await db.query.emailConfigs.findFirst({ where: (t, { eq }) => eq(t.tenantId, user.tenantId) });
            if (cfg?.credentials) {
                try {
                    const creds = decryptJson(cfg.credentials);
                    finalPassword = creds.smtp?.password ?? '';
                }
                catch { /* ignore */ }
            }
        }
        try {
            const transporter = nodemailer.createTransport({ host, port, secure, auth: { user: smtpUser, pass: finalPassword } });
            await transporter.verify();
            return reply.send({ ok: true });
        }
        catch (e) {
            return reply.status(400).send({ ok: false, error: e.message });
        }
    });
    // POST /api/v1/tenants/channels/email/test-imap
    app.post('/channels/email/test-imap', { onRequest: [app.authenticate] }, async (req, reply) => {
        const user = req.user;
        if (!isUUID(user.tenantId))
            return reply.status(400).send({ error: 'Entity bağlantısı gerekli' });
        const { host, port, secure, user: imapUser, password } = req.body;
        if (!host || !imapUser)
            return reply.status(400).send({ error: 'host ve kullanıcı gerekli' });
        let finalPassword = password;
        if (!finalPassword) {
            const cfg = await db.query.emailConfigs.findFirst({ where: (t, { eq }) => eq(t.tenantId, user.tenantId) });
            if (cfg?.credentials) {
                try {
                    const creds = decryptJson(cfg.credentials);
                    finalPassword = creds.imap?.password ?? '';
                }
                catch { /* ignore */ }
            }
        }
        try {
            const { ImapFlow } = await import('imapflow');
            const client = new ImapFlow({
                host, port: Number(port), secure,
                auth: { user: imapUser, pass: finalPassword },
                logger: false,
            });
            await client.connect();
            const list = await client.list();
            const mailboxes = list.map((m) => m.path);
            await client.logout();
            return reply.send({ ok: true, folders: mailboxes });
        }
        catch (e) {
            return reply.status(400).send({ ok: false, error: e.message });
        }
    });
    // ── External users ────────────────────────────────────────────────────────────
    // POST /api/v1/tenants/external-users — entity_main creates external customer account
    app.post('/external-users', { onRequest: [app.authenticate] }, async (req, reply) => {
        const user = req.user;
        if (!isUUID(user.tenantId))
            return reply.status(400).send({ error: 'Entity bağlantısı gerekli' });
        if (!['entity_main', 'admin'].includes(user.role))
            return reply.status(403).send({ error: 'Yetkisiz' });
        const { email, name, phone } = req.body;
        if (!email)
            return reply.status(400).send({ error: 'email gerekli' });
        // Check if user already exists
        const existing = await db.query.users.findFirst({ where: (t, { eq }) => eq(t.email, email.toLowerCase()) });
        if (existing) {
            // Just add membership if not already there
            const hasMembership = await db.query.tenantMemberships.findFirst({
                where: (t, { and, eq }) => and(eq(t.userId, existing.id), eq(t.tenantId, user.tenantId)),
            });
            if (!hasMembership) {
                await db.insert(tenantMemberships).values({ userId: existing.id, tenantId: user.tenantId, role: 'entity_external' });
            }
            return reply.send({ ok: true, userId: existing.id, existing: true });
        }
        // Create new user with random password
        const tempPassword = nanoid(12);
        const passwordHash = await argon2.hash(tempPassword);
        const [newUser] = await db.insert(users).values({
            email: email.toLowerCase(),
            name: name ?? email.split('@')[0],
            phone: phone ?? null,
            passwordHash,
            role: 'entity_external',
            isActive: true,
            isVerified: false,
        }).returning();
        await db.insert(tenantMemberships).values({ userId: newUser.id, tenantId: user.tenantId, role: 'entity_external' });
        return reply.status(201).send({ ok: true, userId: newUser.id, tempPassword, existing: false });
    });
    // GET /api/v1/tenants/me/members — list all tenant members
    app.get('/me/members', { onRequest: [app.authenticate] }, async (req, reply) => {
        const user = req.user;
        if (!isUUID(user.tenantId))
            return reply.send({ members: [] });
        const memberships = await db.query.tenantMemberships.findMany({
            where: (t, { eq }) => eq(t.tenantId, user.tenantId),
        });
        if (!memberships.length)
            return reply.send({ members: [] });
        const memberUsers = await db.query.users.findMany({
            where: (t, { inArray }) => inArray(t.id, memberships.map(m => m.userId)),
            columns: { id: true, email: true, name: true, isActive: true, createdAt: true },
        });
        const memberMap = Object.fromEntries(memberUsers.map(u => [u.id, u]));
        return reply.send({
            members: memberships.map(m => ({
                userId: m.userId,
                role: m.role,
                ...(memberMap[m.userId] ?? {}),
            })),
        });
    });
    // POST /api/v1/tenants/me/invites — invite a team member by email
    app.post('/me/invites', { onRequest: [app.authenticate] }, async (req, reply) => {
        const user = req.user;
        if (!isUUID(user.tenantId))
            return reply.status(400).send({ error: 'Entity bağlantısı gerekli' });
        if (!['entity_main', 'admin', 'supervisor'].includes(user.role))
            return reply.status(403).send({ error: 'Yetkisiz' });
        const { email, role: inviteRole = 'entity_sub' } = req.body;
        if (!email)
            return reply.status(400).send({ error: 'email zorunlu' });
        const tenant = await db.query.tenants.findFirst({ where: (t, { eq }) => eq(t.id, user.tenantId) });
        const tenantSettings = (tenant?.settings ?? {});
        // If already a registered user, add them directly
        const existingUser = await db.query.users.findFirst({ where: (t, { eq }) => eq(t.email, email.toLowerCase()) });
        if (existingUser) {
            const hasMembership = await db.query.tenantMemberships.findFirst({
                where: (t, { and, eq }) => and(eq(t.userId, existingUser.id), eq(t.tenantId, user.tenantId)),
            });
            if (!hasMembership) {
                await db.insert(tenantMemberships).values({ userId: existingUser.id, tenantId: user.tenantId, role: inviteRole });
            }
            return reply.send({ ok: true, added: true });
        }
        // Store invite token in tenant settings
        const token = nanoid(32);
        const invites = tenantSettings.invites ?? [];
        invites.push({ email: email.toLowerCase(), role: inviteRole, token, createdAt: new Date().toISOString() });
        await db.update(tenants)
            .set({ settings: { ...tenantSettings, invites } })
            .where(eq(tenants.id, user.tenantId));
        // Send invite email (non-fatal)
        try {
            const mailer = nodemailer.createTransport({ host: env.SMTP_HOST, port: env.SMTP_PORT, secure: env.SMTP_PORT === 465, auth: { user: env.SMTP_USER, pass: env.SMTP_PASS } });
            const appUrl = env.APP_URL ?? 'https://kibusiness.global';
            await mailer.sendMail({
                from: env.SMTP_FROM, to: email,
                subject: `${tenant?.name ?? 'Ki Business'} — Platform Daveti`,
                html: `<div style="font-family:Arial;max-width:480px;margin:0 auto;padding:24px"><h2 style="color:#2d8a6b">Ki Business Intelligence</h2><p><strong>${tenant?.name ?? 'Bir şirket'}</strong> sizi platformuna davet etti.</p><p><a href="${appUrl}/app/register?invite=${token}" style="background:#2d8a6b;color:#fff;padding:10px 20px;border-radius:8px;text-decoration:none">Daveti Kabul Et</a></p></div>`,
            });
        }
        catch { /* non-fatal */ }
        return reply.send({ ok: true, added: false, invited: true });
    });
    // ── Entity AI Provider Management ─────────────────────────────────────────────
    // GET /api/v1/tenants/ai-providers — list own keys + platform entity_free keys + kibi_free
    app.get('/ai-providers', { onRequest: [app.authenticate] }, async (req, reply) => {
        const user = req.user;
        if (!isUUID(user.tenantId))
            return reply.send({ providers: [] });
        // Entity's own keys from ai_configs.settings.providerKeys
        const aiConfig = await db.query.aiConfigs.findFirst({
            where: (t, { eq }) => eq(t.tenantId, user.tenantId),
        });
        const ownProviderKeys = aiConfig?.settings?.providerKeys ?? {};
        // Platform entity_free keys
        const allPlatformRows = await db.select().from(platformConfigs);
        const entityFreeSet = new Set(allPlatformRows
            .filter(r => r.key.startsWith('ai_provider_entity_free_') && r.value !== '')
            .map(r => r.key.replace('ai_provider_entity_free_', '')));
        const providers = PROVIDERS.map(p => ({
            id: p.id,
            name: p.name,
            docsUrl: p.docsUrl,
            freeModels: p.freeModels,
            source: ownProviderKeys[p.id] ? 'own' : (entityFreeSet.has(p.id) ? 'platform' : 'none'),
            isConfigured: !!(ownProviderKeys[p.id] || entityFreeSet.has(p.id)),
        }));
        // Add kibi_free virtual option
        const freeOption = {
            id: 'kibi_free',
            name: 'KIBI Ücretsiz Altyapısı',
            docsUrl: '',
            freeModels: true,
            source: 'platform',
            isConfigured: true,
        };
        return reply.send({ providers: [freeOption, ...providers] });
    });
    // PUT /api/v1/tenants/ai-providers/:providerId — save entity's own key
    app.put('/ai-providers/:providerId', { onRequest: [app.authenticate] }, async (req, reply) => {
        const user = req.user;
        if (!isUUID(user.tenantId))
            return reply.status(400).send({ error: 'Entity bağlantısı gerekli' });
        if (!['entity_main', 'admin'].includes(user.role))
            return reply.status(403).send({ error: 'Yetkisiz' });
        const { providerId } = req.params;
        if (!PROVIDERS.find(p => p.id === providerId))
            return reply.status(400).send({ error: 'Bilinmeyen provider' });
        const { apiKey } = req.body;
        if (!apiKey?.trim())
            return reply.status(400).send({ error: 'API key boş olamaz' });
        const encryptedKey = encrypt(apiKey.trim());
        const existing = await db.query.aiConfigs.findFirst({
            where: (t, { eq }) => eq(t.tenantId, user.tenantId),
        });
        const existingSettings = (existing?.settings ?? {});
        const providerKeys = { ...(existingSettings.providerKeys ?? {}), [providerId]: encryptedKey };
        if (existing) {
            await db.update(aiConfigs)
                .set({ settings: { ...existingSettings, providerKeys } })
                .where(eq(aiConfigs.id, existing.id));
        }
        else {
            await db.insert(aiConfigs).values({
                tenantId: user.tenantId,
                provider: 'openrouter',
                model: 'meta-llama/llama-3.3-70b-instruct:free',
                isDefault: true,
                settings: { providerKeys },
            });
        }
        // Invalidate key cache for this entity+provider
        invalidateProviderKeyCache(`entity_own:${user.tenantId}:${providerId}`);
        return reply.send({ ok: true });
    });
    // DELETE /api/v1/tenants/ai-providers/:providerId — remove entity's own key
    app.delete('/ai-providers/:providerId', { onRequest: [app.authenticate] }, async (req, reply) => {
        const user = req.user;
        if (!isUUID(user.tenantId))
            return reply.status(400).send({ error: 'Entity bağlantısı gerekli' });
        if (!['entity_main', 'admin'].includes(user.role))
            return reply.status(403).send({ error: 'Yetkisiz' });
        const { providerId } = req.params;
        const existing = await db.query.aiConfigs.findFirst({
            where: (t, { eq }) => eq(t.tenantId, user.tenantId),
        });
        if (!existing)
            return reply.send({ ok: true });
        const existingSettings = (existing.settings ?? {});
        const providerKeys = { ...(existingSettings.providerKeys ?? {}) };
        delete providerKeys[providerId];
        await db.update(aiConfigs)
            .set({ settings: { ...existingSettings, providerKeys } })
            .where(eq(aiConfigs.id, existing.id));
        invalidateProviderKeyCache(`entity_own:${user.tenantId}:${providerId}`);
        return reply.send({ ok: true });
    });
    // GET /api/v1/tenants/ai-providers/all-models — models from own + entity_free + kibi_free
    app.get('/ai-providers/all-models', { onRequest: [app.authenticate] }, async (req, reply) => {
        const user = req.user;
        if (!isUUID(user.tenantId))
            return reply.send({ providers: [] });
        const aiConfig = await db.query.aiConfigs.findFirst({
            where: (t, { eq }) => eq(t.tenantId, user.tenantId),
        });
        const ownKeys = aiConfig?.settings?.providerKeys ?? {};
        const allPlatformRows = await db.select().from(platformConfigs);
        const entityFreeConfigured = allPlatformRows
            .filter(r => r.key.startsWith('ai_provider_entity_free_') && r.value !== '')
            .map(r => r.key.replace('ai_provider_entity_free_', ''));
        const results = [];
        // kibi_free virtual option always first
        const freeRoles = await db.select().from(kibiModelConfigs)
            .where(eq(kibiModelConfigs.scope, 'entity_free'));
        const freeModels = freeRoles.map(r => ({
            id: KIBI_FREE_MODEL,
            name: `KIBI Ücretsiz (${r.modelRole}: ${r.primaryModel})`,
        }));
        results.push({ provider: 'kibi_free', source: 'platform', models: freeModels.length ? [{ id: KIBI_FREE_MODEL, name: 'KIBI Ücretsiz Altyapısı (Paylaşımlı)' }] : [{ id: KIBI_FREE_MODEL, name: 'KIBI Ücretsiz Altyapısı' }] });
        // Entity own keys
        for (const [providerId] of Object.entries(ownKeys)) {
            const cacheKey = `ki:models:entity_own:${user.tenantId}:${providerId}`;
            const cached = await redis.get(cacheKey).catch(() => null);
            if (cached) {
                try {
                    results.push({ provider: providerId, source: 'own', models: JSON.parse(cached) });
                    continue;
                }
                catch { /* continue */ }
            }
            const providerDef = PROVIDERS.find(p => p.id === providerId);
            if (!providerDef?.modelsPath)
                continue;
            try {
                const encKey = ownKeys[providerId];
                let apiKey;
                try {
                    apiKey = decrypt(encKey);
                }
                catch {
                    continue;
                }
                const headers = {
                    'Content-Type': 'application/json',
                    ...providerDef.extraHeaders,
                    ...(providerDef.authHeader === 'x-api-key'
                        ? { 'x-api-key': apiKey }
                        : { 'Authorization': `Bearer ${apiKey}` }),
                };
                const controller = new AbortController();
                const timer = setTimeout(() => controller.abort(), 10_000);
                let modelsRes;
                try {
                    modelsRes = await fetch(`${providerDef.baseUrl}${providerDef.modelsPath}`, { headers, signal: controller.signal });
                }
                finally {
                    clearTimeout(timer);
                }
                if (!modelsRes.ok)
                    continue;
                const modelsData = await modelsRes.json();
                const models = (modelsData.data ?? modelsData.models ?? [])
                    .map((m) => ({ id: `${providerId}::${m.name?.replace('models/', '') ?? m.id}`, name: m.display_name ?? m.displayName ?? m.id }));
                await redis.set(cacheKey, JSON.stringify(models), 'EX', 1800);
                results.push({ provider: providerId, source: 'own', models });
            }
            catch { /* skip */ }
        }
        // Entity_free platform keys
        for (const providerId of entityFreeConfigured) {
            if (ownKeys[providerId])
                continue; // entity has own key, already included
            const cacheKey = `ki:models:entity_free:${providerId}`;
            const cached = await redis.get(cacheKey).catch(() => null);
            if (cached) {
                try {
                    results.push({ provider: providerId, source: 'platform', models: JSON.parse(cached) });
                    continue;
                }
                catch { /* continue */ }
            }
            // Models for platform keys are cached by admin endpoint; serve empty if not cached
            results.push({ provider: providerId, source: 'platform', models: [] });
        }
        return reply.send({ providers: results });
    });
    // GET /api/v1/tenants/external-users — list external users for this entity
    app.get('/external-users', { onRequest: [app.authenticate] }, async (req, reply) => {
        const user = req.user;
        if (!isUUID(user.tenantId))
            return reply.send({ users: [] });
        if (!['entity_main', 'admin'].includes(user.role))
            return reply.status(403).send({ error: 'Yetkisiz' });
        const memberships = await db.query.tenantMemberships.findMany({
            where: (t, { and, eq }) => and(eq(t.tenantId, user.tenantId), eq(t.role, 'entity_external')),
        });
        const userIds = memberships.map(m => m.userId);
        if (!userIds.length)
            return reply.send({ users: [] });
        const externalUsers = await db.query.users.findMany({
            where: (t, { inArray }) => inArray(t.id, userIds),
            columns: { id: true, email: true, name: true, phone: true, isActive: true, createdAt: true },
        });
        return reply.send({ users: externalUsers });
    });
    // ─── Vector Docs (Entity Knowledge Base) ────────────────────────────────────
    // GET /api/v1/tenants/vector-docs — list entity's knowledge entries
    app.get('/vector-docs', { onRequest: [app.authenticate] }, async (req, reply) => {
        const user = req.user;
        if (!isUUID(user.tenantId))
            return reply.status(400).send({ error: 'Geçersiz tenant' });
        const docs = await db.select({
            id: knowledgeEntries.id,
            title: knowledgeEntries.title,
            content: knowledgeEntries.content,
            source: knowledgeEntries.source,
            isIndexed: knowledgeEntries.isIndexed,
            qdrantId: knowledgeEntries.qdrantId,
            createdAt: knowledgeEntries.createdAt,
        }).from(knowledgeEntries).where(eq(knowledgeEntries.tenantId, user.tenantId));
        return reply.send({ docs });
    });
    // POST /api/v1/tenants/vector-docs — create + embed + upsert to Qdrant
    app.post('/vector-docs', { onRequest: [app.authenticate] }, async (req, reply) => {
        const user = req.user;
        if (!isUUID(user.tenantId))
            return reply.status(400).send({ error: 'Geçersiz tenant' });
        if (!['entity_main', 'entity_supervisor', 'admin'].includes(user.role)) {
            return reply.status(403).send({ error: 'Yetkisiz' });
        }
        const { title, content } = req.body;
        if (!title?.trim() || !content?.trim()) {
            return reply.status(400).send({ error: 'Başlık ve içerik zorunlu' });
        }
        const [doc] = await db.insert(knowledgeEntries).values({
            tenantId: user.tenantId,
            title: title.trim(),
            content: content.trim(),
            source: 'manual',
        }).returning();
        // Embed + upsert to Qdrant (best-effort — don't fail the request if Qdrant is down)
        try {
            const [vector] = await embedConfigured([content.trim()]);
            const collection = `entity_${user.tenantId}`;
            await qdrant.upsert(collection, {
                wait: true,
                points: [{
                        id: doc.id,
                        vector: vector,
                        payload: { title: doc.title, tenantId: user.tenantId, source: 'manual' },
                    }],
            }).catch(() => 
            // Fallback: try platform collection
            qdrant.upsert(env.QDRANT_COLLECTION, {
                wait: true,
                points: [{ id: doc.id, vector: vector, payload: { title: doc.title, tenantId: user.tenantId } }],
            }));
            await db.update(knowledgeEntries)
                .set({ qdrantId: doc.id, isIndexed: true })
                .where(eq(knowledgeEntries.id, doc.id));
        }
        catch (e) {
            console.warn('[vector-docs] Embedding/Qdrant error:', e.message);
        }
        return reply.status(201).send({ doc });
    });
    // PUT /api/v1/tenants/vector-docs/:id — update title/content + reindex
    app.put('/vector-docs/:id', { onRequest: [app.authenticate] }, async (req, reply) => {
        const user = req.user;
        if (!isUUID(user.tenantId))
            return reply.status(400).send({ error: 'Geçersiz tenant' });
        if (!['entity_main', 'entity_supervisor', 'admin'].includes(user.role)) {
            return reply.status(403).send({ error: 'Yetkisiz' });
        }
        const { id } = req.params;
        const { title, content } = req.body;
        const existing = await db.query.knowledgeEntries.findFirst({
            where: (t, { and, eq }) => and(eq(t.id, id), eq(t.tenantId, user.tenantId)),
        });
        if (!existing)
            return reply.status(404).send({ error: 'Bulunamadı' });
        const newContent = content?.trim() ?? existing.content;
        await db.update(knowledgeEntries)
            .set({
            title: title?.trim() ?? existing.title,
            content: newContent,
            isIndexed: false,
        })
            .where(eq(knowledgeEntries.id, id));
        // Re-embed
        try {
            const [vector] = await embedConfigured([newContent]);
            const collection = `entity_${user.tenantId}`;
            await qdrant.upsert(collection, {
                wait: true,
                points: [{ id, vector: vector, payload: { title: title?.trim() ?? existing.title, tenantId: user.tenantId } }],
            }).catch(() => qdrant.upsert(env.QDRANT_COLLECTION, {
                wait: true,
                points: [{ id, vector: vector, payload: { title: title?.trim() ?? existing.title, tenantId: user.tenantId } }],
            }));
            await db.update(knowledgeEntries).set({ isIndexed: true }).where(eq(knowledgeEntries.id, id));
        }
        catch (e) {
            console.warn('[vector-docs] Re-embed error:', e.message);
        }
        return reply.send({ ok: true });
    });
    // DELETE /api/v1/tenants/vector-docs/:id — delete from DB + Qdrant
    app.delete('/vector-docs/:id', { onRequest: [app.authenticate] }, async (req, reply) => {
        const user = req.user;
        if (!isUUID(user.tenantId))
            return reply.status(400).send({ error: 'Geçersiz tenant' });
        if (!['entity_main', 'entity_supervisor', 'admin'].includes(user.role)) {
            return reply.status(403).send({ error: 'Yetkisiz' });
        }
        const { id } = req.params;
        const existing = await db.query.knowledgeEntries.findFirst({
            where: (t, { and, eq }) => and(eq(t.id, id), eq(t.tenantId, user.tenantId)),
        });
        if (!existing)
            return reply.status(404).send({ error: 'Bulunamadı' });
        await db.delete(knowledgeEntries).where(eq(knowledgeEntries.id, id));
        // Remove from Qdrant (best-effort)
        try {
            await qdrant.delete(`entity_${user.tenantId}`, { wait: true, points: [id] })
                .catch(() => qdrant.delete(env.QDRANT_COLLECTION, { wait: true, points: [id] }));
        }
        catch { }
        return reply.send({ ok: true });
    });
};
//# sourceMappingURL=tenant.js.map