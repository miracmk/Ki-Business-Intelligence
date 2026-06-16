import { env } from '../../../config/env.js';
import { processBulkCallback } from '../../engine/crm-sync/bulk-sync.js';
import { processNotification } from '../../engine/crm-sync/notification.js';
import { processExternalMessage } from '../../engine/kibi/ticket-router.js';
import { redis } from '../../lib/redis.js';
import { db } from '../../lib/db.js';
import { crmConnections, accountingConnections } from '../../../db/schema.js';
import { encryptJson } from '../../lib/crypto.js';
export const webhookRoutes = async (app) => {
    // ── CRM bulk read callback (Zoho calls this when job=COMPLETED) ───────────
    app.post('/crm/bulk-callback', async (req, reply) => {
        reply.status(200).send('OK'); // respond immediately like n8n
        const connectionId = req.query['connectionId'];
        if (!connectionId)
            return;
        const payload = req.body?.body
            ?? req.body;
        processBulkCallback(connectionId, payload)
            .then((r) => app.log.info({ r }, 'Bulk callback processed'))
            .catch((e) => app.log.error({ e }, 'Bulk callback error'));
    });
    // ── CRM real-time notification ────────────────────────────────────────────
    app.post('/crm/notification', async (req, reply) => {
        reply.status(200).send('OK');
        const connectionId = req.query['connectionId'];
        if (!connectionId)
            return;
        const body = req.body?.body
            ?? req.body;
        const payload = {
            module: body?.module ?? '',
            operation: body?.operation ?? '',
            ids: Array.isArray(body?.ids) ? body.ids.map(String) : [],
        };
        processNotification(connectionId, payload)
            .then((r) => app.log.info({ r }, 'Notification processed'))
            .catch((e) => app.log.error({ e }, 'Notification error'));
    });
    // ── CRM OAuth callbacks — Zoho / HubSpot / Salesforce ────────────────────
    app.get('/crm/:provider/callback', async (req, reply) => {
        const { provider } = req.params;
        const { code, state, error } = req.query;
        const frontendBase = `${env.APP_URL}/app/settings?tab=crm`;
        if (error || !code || !state) {
            return reply.redirect(`${frontendBase}&oauth_error=${encodeURIComponent(error ?? 'cancelled')}`);
        }
        // Load state from Redis
        const raw = await redis.get(`ki:oauth:state:${state}`);
        if (!raw)
            return reply.redirect(`${frontendBase}&oauth_error=expired`);
        await redis.del(`ki:oauth:state:${state}`);
        const ctx = JSON.parse(raw);
        if (ctx.provider !== provider)
            return reply.redirect(`${frontendBase}&oauth_error=mismatch`);
        try {
            const callbackUrl = `${env.APP_URL}/webhooks/crm/${provider}/callback`;
            let accessToken = '', refreshToken = '', instanceUrl = '';
            if (provider === 'zoho') {
                const res = await fetch(`https://accounts.zoho.${ctx.region}/oauth/v2/token`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                    body: new URLSearchParams({
                        grant_type: 'authorization_code', code,
                        client_id: ctx.clientId, client_secret: ctx.clientSecret,
                        redirect_uri: callbackUrl,
                    }),
                });
                const data = await res.json();
                if (data.error)
                    throw new Error(data.error);
                accessToken = data.access_token;
                refreshToken = data.refresh_token;
            }
            else if (provider === 'hubspot') {
                const res = await fetch('https://api.hubapi.com/oauth/v1/token', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                    body: new URLSearchParams({
                        grant_type: 'authorization_code', code,
                        client_id: ctx.clientId, client_secret: ctx.clientSecret,
                        redirect_uri: callbackUrl,
                    }),
                });
                const data = await res.json();
                if (data.error)
                    throw new Error(data.error ?? JSON.stringify(data));
                accessToken = data.access_token;
                refreshToken = data.refresh_token;
            }
            else if (provider === 'salesforce') {
                const res = await fetch('https://login.salesforce.com/services/oauth2/token', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                    body: new URLSearchParams({
                        grant_type: 'authorization_code', code,
                        client_id: ctx.clientId, client_secret: ctx.clientSecret,
                        redirect_uri: callbackUrl,
                    }),
                });
                const data = await res.json();
                if (data.error)
                    throw new Error(data.error_description ?? data.error);
                accessToken = data.access_token;
                refreshToken = data.refresh_token;
                instanceUrl = data.instance_url ?? '';
            }
            // Save connection to DB
            const creds = {
                type: provider, clientId: ctx.clientId, clientSecret: ctx.clientSecret,
                refreshToken, ...(ctx.region ? { region: ctx.region } : {}),
                ...(instanceUrl ? { instanceUrl } : {}),
            };
            await db.insert(crmConnections).values({
                tenantId: ctx.tenantId,
                name: ctx.name,
                crmType: provider,
                credentials: encryptJson(creds),
                syncStatus: 'idle',
            });
            return reply.redirect(`${frontendBase}&oauth_success=1&provider=${provider}`);
        }
        catch (e) {
            console.error(`[OAuth ${provider}] Error:`, e);
            return reply.redirect(`${frontendBase}&oauth_error=${encodeURIComponent(e.message)}`);
        }
    });
    // ── Accounting OAuth callbacks — Zoho Books / QuickBooks / Xero ──────────
    app.get('/accounting/:provider/callback', async (req, reply) => {
        const { provider } = req.params;
        const { code, state, error } = req.query;
        const frontendBase = `${env.APP_URL}/app/settings?tab=accounting`;
        if (error || !code || !state) {
            return reply.redirect(`${frontendBase}&oauth_error=${encodeURIComponent(error ?? 'cancelled')}`);
        }
        const raw = await redis.get(`ki:acc:oauth:state:${state}`);
        if (!raw)
            return reply.redirect(`${frontendBase}&oauth_error=expired`);
        await redis.del(`ki:acc:oauth:state:${state}`);
        const ctx = JSON.parse(raw);
        if (ctx.provider !== provider)
            return reply.redirect(`${frontendBase}&oauth_error=mismatch`);
        try {
            const callbackUrl = `${env.APP_URL}/webhooks/accounting/${provider}/callback`;
            let accessToken = '', refreshToken = '';
            if (provider === 'zoho_books') {
                const res = await fetch(`https://accounts.zoho.${ctx.region}/oauth/v2/token`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                    body: new URLSearchParams({
                        grant_type: 'authorization_code', code,
                        client_id: ctx.clientId, client_secret: ctx.clientSecret,
                        redirect_uri: callbackUrl,
                    }),
                });
                const data = await res.json();
                if (data.error)
                    throw new Error(data.error);
                accessToken = data.access_token;
                refreshToken = data.refresh_token;
            }
            else if (provider === 'quickbooks') {
                const creds = Buffer.from(`${ctx.clientId}:${ctx.clientSecret}`).toString('base64');
                const res = await fetch('https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer', {
                    method: 'POST',
                    headers: { Authorization: `Basic ${creds}`, 'Content-Type': 'application/x-www-form-urlencoded' },
                    body: new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: callbackUrl }),
                });
                const data = await res.json();
                if (data.error)
                    throw new Error(data.error_description ?? data.error);
                accessToken = data.access_token;
                refreshToken = data.refresh_token;
            }
            else if (provider === 'xero') {
                const creds = Buffer.from(`${ctx.clientId}:${ctx.clientSecret}`).toString('base64');
                const res = await fetch('https://identity.xero.com/connect/token', {
                    method: 'POST',
                    headers: { Authorization: `Basic ${creds}`, 'Content-Type': 'application/x-www-form-urlencoded' },
                    body: new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: callbackUrl }),
                });
                const data = await res.json();
                if (data.error)
                    throw new Error(data.error_description ?? data.error);
                accessToken = data.access_token;
                refreshToken = data.refresh_token;
            }
            else {
                throw new Error('Unsupported provider');
            }
            const creds = {
                type: provider, clientId: ctx.clientId, clientSecret: ctx.clientSecret,
                refreshToken, ...(ctx.region ? { region: ctx.region } : {}),
                ...(ctx.organizationId ? { organizationId: ctx.organizationId } : {}),
            };
            await db.insert(accountingConnections).values({
                tenantId: ctx.tenantId,
                name: ctx.name,
                accountingType: provider,
                credentials: encryptJson(creds),
            });
            return reply.redirect(`${frontendBase}&oauth_success=1&provider=${provider}`);
        }
        catch (e) {
            console.error(`[Accounting OAuth ${provider}] Error:`, e);
            return reply.redirect(`${frontendBase}&oauth_error=${encodeURIComponent(e.message)}`);
        }
    });
    // ── WhatsApp Cloud API — webhook verification (GET) ───────────────────────
    app.get('/whatsapp', async (req, reply) => {
        const q = req.query;
        if (q['hub.mode'] === 'subscribe' && q['hub.verify_token'] === env.WA_WEBHOOK_VERIFY_TOKEN) {
            return reply.send(q['hub.challenge']);
        }
        return reply.status(403).send('Forbidden');
    });
    // ── WhatsApp Cloud API — incoming messages (POST) ─────────────────────────
    app.post('/whatsapp', async (req, reply) => {
        reply.status(200).send('OK'); // must respond < 20s
        const body = req.body;
        const entry = body?.entry?.[0]?.changes?.[0]?.value;
        if (!entry?.messages)
            return;
        for (const msg of entry.messages) {
            const from = String(msg['from'] ?? '');
            const text = msg['type'] === 'text' ? String(msg['text']?.body ?? '') : null;
            if (!text)
                continue;
            const profileName = entry.contacts?.[0]?.profile?.name ?? null;
            // Resolve tenant from WA Business number mapping
            const tenantId = await resolveTenantByChannel('whatsapp', from);
            if (!tenantId)
                continue;
            // Route to support ticket pipeline
            processExternalMessage(tenantId, 'whatsapp', from, profileName, text).catch(console.error);
        }
    });
    // ── Per-entity Telegram webhook ────────────────────────────────────────────
    // Entity-specific bot: /webhooks/telegram/:entityId
    app.post('/telegram/:entityId', async (req, reply) => {
        reply.status(200).send('OK');
        const { entityId } = req.params;
        const entity = await db.query.kibiEntities.findFirst({
            where: (t, { eq }) => eq(t.id, entityId),
        }).catch(() => null);
        if (!entity)
            return;
        const update = req.body;
        const msg = update?.message;
        if (!msg?.text)
            return;
        const chatId = String(msg.chat?.id ?? '');
        const text = String(msg.text ?? '');
        const firstName = (msg.from?.first_name ?? null);
        // Route to support ticket pipeline
        processExternalMessage(entity.entityId, 'telegram', chatId, firstName, text).catch(console.error);
    });
    // ── Instagram Messaging — webhook verification (GET) ──────────────────────
    app.get('/instagram', async (req, reply) => {
        const q = req.query;
        if (q['hub.mode'] === 'subscribe' && q['hub.verify_token'] === env.WA_WEBHOOK_VERIFY_TOKEN) {
            return reply.send(q['hub.challenge']);
        }
        return reply.status(403).send('Forbidden');
    });
    // ── Instagram Messaging — incoming DMs (POST) ─────────────────────────────
    app.post('/instagram', async (req, reply) => {
        reply.status(200).send('OK');
        const body = req.body;
        const entry = body?.entry?.[0]?.messaging?.[0];
        if (!entry?.message?.text)
            return;
        const senderId = String(entry.sender?.id ?? '');
        const text = String(entry.message.text ?? '');
        const tenantId = await resolveTenantByChannel('instagram', senderId);
        if (!tenantId)
            return;
        processExternalMessage(tenantId, 'instagram', senderId, null, text).catch(console.error);
    });
    // ── Platform-level Telegram bot (global, uses env.TELEGRAM_BOT_TOKEN) ───────
    app.post('/telegram', async (req, reply) => {
        reply.status(200).send('OK');
        if (!env.TELEGRAM_BOT_TOKEN)
            return;
        const update = req.body;
        const msg = update?.message;
        if (!msg?.text)
            return;
        const chatId = String(msg.chat?.id ?? '');
        const text = String(msg.text ?? '');
        const firstName = (msg.from?.first_name ?? null);
        const tenantId = await resolveTenantByChannel('telegram', chatId);
        if (!tenantId)
            return;
        processExternalMessage(tenantId, 'telegram', chatId, firstName, text).catch(console.error);
    });
    // ── Email inbound webhook (e.g. from Mailgun/SendGrid parse) ─────────────
    app.post('/email/inbound', async (req, reply) => {
        reply.status(200).send('OK');
        const body = req.body;
        const from = String(body?.from ?? body?.sender ?? '');
        const subject = String(body?.subject ?? '');
        const text = String(body?.text ?? body?.plain ?? body?.body ?? '');
        const to = String(body?.to ?? body?.recipient ?? '');
        if (!from || !text)
            return;
        // Resolve tenant by the inbound email address (tenant's configured email)
        const tenantId = await resolveTenantByEmail(to);
        if (!tenantId)
            return;
        const msgText = subject ? `[${subject}]\n\n${text}` : text;
        processExternalMessage(tenantId, 'email', from, null, msgText).catch(console.error);
    });
};
// ── Channel send helpers ──────────────────────────────────────────────────────
async function sendWhatsAppMessage(to, text) {
    await fetch(`https://graph.facebook.com/v19.0/${env.WA_PHONE_NUMBER_ID}/messages`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${env.WA_ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
            messaging_product: 'whatsapp',
            to: to.replace(/\D/g, ''),
            type: 'text',
            text: { body: text },
        }),
    });
}
async function sendTelegramMessage(chatId, text) {
    await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text }),
    });
}
async function sendTelegramMessageWithToken(chatId, text, botToken) {
    await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text }),
    });
}
async function sendInstagramMessage(recipientId, text) {
    const cfg = await db.query.tenants.findFirst({
        where: (t, { eq }) => eq(t.isActive, true),
    }).catch(() => null);
    const settings = (cfg?.settings ?? {});
    const token = settings?.channels?.instagram?.access_token;
    if (!token)
        return;
    await fetch('https://graph.facebook.com/v19.0/me/messages', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ recipient: { id: recipientId }, message: { text } }),
    });
}
// ── Tenant resolution ─────────────────────────────────────────────────────────
// Resolves tenantId by channel config. Checks tenant.settings.channels.{channel}.phone_number_id
// or falls back to first active tenant (single-tenant MVPs).
async function resolveTenantByChannel(channel, _externalId) {
    const tenants = await db.query.tenants.findMany({
        where: (t, { eq }) => eq(t.isActive, true),
        columns: { id: true, settings: true },
    });
    // Multi-tenant: find tenant whose channel config matches the inbound number/identifier
    for (const t of tenants) {
        const ch = (t.settings?.channels ?? {});
        if (channel === 'whatsapp' && ch.whatsapp?.phone_number_id)
            return t.id;
        if (channel === 'telegram' && ch.telegram?.bot_token)
            return t.id;
        if (channel === 'instagram' && ch.instagram?.access_token)
            return t.id;
    }
    // Fallback: first active tenant (single-tenant / default)
    return tenants[0]?.id ?? null;
}
// Resolves tenantId by inbound email (to address = entity's email config)
async function resolveTenantByEmail(toEmail) {
    if (!toEmail)
        return null;
    const tenants = await db.query.tenants.findMany({
        where: (t, { eq }) => eq(t.isActive, true),
        columns: { id: true, settings: true },
    });
    for (const t of tenants) {
        const emailCfg = (t.settings?.channels?.email ?? {});
        if (emailCfg?.from && toEmail.toLowerCase().includes(emailCfg.from.toLowerCase()))
            return t.id;
        if (emailCfg?.user && toEmail.toLowerCase().includes(emailCfg.user.toLowerCase()))
            return t.id;
    }
    return tenants[0]?.id ?? null;
}
//# sourceMappingURL=index.js.map