import { db } from '../../lib/db.js';
import { redis, redisKeys } from '../../lib/redis.js';
import { users, tenants, tenantMemberships, aiConfigs, kibiEntities } from '../../../db/schema.js';
import { env } from '../../../config/env.js';
import * as argon2 from 'argon2';
import { authenticator } from 'otplib';
import { nanoid } from 'nanoid';
import nodemailer from 'nodemailer';
import { eq } from 'drizzle-orm';
const OTP_TTL = 300;
const OTP_COOL = 60;
async function sendWhatsAppOtp(phone, code) {
    if (env.NODE_ENV !== 'production') {
        console.log(`\n  [DEV OTP] WhatsApp to ${phone}: ${code}\n`);
        return;
    }
    const to = phone.replace(/\D/g, '');
    await fetch(`https://graph.facebook.com/v19.0/${env.WA_PHONE_NUMBER_ID}/messages`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${env.WA_ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
            messaging_product: 'whatsapp',
            to,
            type: 'text',
            text: { body: `Ki Platform doğrulama kodunuz: *${code}*\n\n5 dakika geçerlidir.` },
        }),
    });
}
async function sendEmailOtp(email, code) {
    console.log(`\n  [OTP] Email to ${email}: ${code}\n`);
    const t = nodemailer.createTransport({ host: env.SMTP_HOST, port: env.SMTP_PORT, secure: env.SMTP_PORT === 465, auth: { user: env.SMTP_USER, pass: env.SMTP_PASS } });
    await t.sendMail({
        from: env.SMTP_FROM, to: email,
        subject: 'Ki Platform — Doğrulama Kodu',
        html: `<div style="font-family:Arial;max-width:460px;margin:0 auto;padding:24px"><h2>Ki Platform</h2><p>Doğrulama kodunuz:</p><div style="background:#f5f5f5;border-radius:10px;padding:28px;text-align:center;margin:20px 0"><span style="font-size:40px;font-weight:700;letter-spacing:10px">${code}</span></div><p style="color:#888;font-size:13px">5 dakika geçerlidir.</p></div>`,
    });
}
export const authRoutes = async (app) => {
    // POST /api/v1/auth/register (dev/admin only)
    app.post('/register', async (req, reply) => {
        console.log('\n  [REGISTER] Request received:', req.body);
        try {
            const { email, password, name, tenantName } = req.body;
            if (!email || !password)
                return reply.status(400).send({ error: 'email and password required' });
            const hash = await argon2.hash(password, { type: argon2.argon2id });
            console.log('  [REGISTER] Password hashed');
            const [user] = await db.insert(users).values({ email: email.toLowerCase(), name, passwordHash: hash }).returning();
            console.log('  [REGISTER] User created:', user?.id);
            // Create tenant
            if (tenantName && user) {
                const slug = tenantName.toLowerCase().replace(/[^a-z0-9]/g, '-');
                const [tenant] = await db.insert(tenants).values({ name: tenantName, slug }).returning();
                console.log('  [REGISTER] Tenant created:', tenant?.id);
                if (tenant) {
                    await db.insert(tenantMemberships).values({ userId: user.id, tenantId: tenant.id, role: 'admin' });
                    await db.insert(aiConfigs).values({ tenantId: tenant.id, provider: 'openrouter', model: 'google/gemini-2.0-flash-exp:free' });
                }
            }
            console.log('  [REGISTER] Success');
            return reply.status(201).send({ userId: user?.id });
        }
        catch (e) {
            console.error('  [REGISTER] Error:', e);
            return reply.status(500).send({ error: e.message || 'Kayıt başarısız' });
        }
    });
    // POST /api/v1/auth/register-entity — public self-service entity registration
    app.post('/register-entity', async (req, reply) => {
        const { email, password, name, companyName, industry } = req.body;
        if (!email || !password || !name || !companyName) {
            return reply.status(400).send({ error: 'email, password, name ve companyName zorunlu' });
        }
        if (password.length < 8)
            return reply.status(400).send({ error: 'Şifre en az 8 karakter olmalı' });
        const existing = await db.query.users.findFirst({ where: (t, { eq }) => eq(t.email, email.toLowerCase()) });
        if (existing)
            return reply.status(409).send({ error: 'Bu e-posta zaten kayıtlı' });
        try {
            const hash = await argon2.hash(password, { type: argon2.argon2id });
            const slug = companyName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
            const [user] = await db.insert(users).values({
                email: email.toLowerCase(), name, passwordHash: hash, role: 'entity_main', isActive: true,
            }).returning();
            const [tenant] = await db.insert(tenants).values({ name: companyName, slug: `${slug}-${nanoid(4)}` }).returning();
            await Promise.all([
                db.insert(tenantMemberships).values({ userId: user.id, tenantId: tenant.id, role: 'entity_main' }),
                db.insert(aiConfigs).values({ tenantId: tenant.id, provider: 'openrouter', model: 'google/gemini-2.0-flash-exp:free' }),
                db.insert(kibiEntities).values({
                    entityId: tenant.id,
                    clientId: `KBI-${nanoid(6).toUpperCase()}`,
                    companyName,
                    industry: industry ?? null,
                    mainUserId: user.id,
                }),
            ]);
            // Send welcome email (non-fatal)
            try {
                const t = nodemailer.createTransport({ host: env.SMTP_HOST, port: env.SMTP_PORT, secure: env.SMTP_PORT === 465, auth: { user: env.SMTP_USER, pass: env.SMTP_PASS } });
                await t.sendMail({
                    from: env.SMTP_FROM, to: email,
                    subject: 'Ki Business Intelligence\'e Hoş Geldiniz!',
                    html: `<div style="font-family:Arial;max-width:480px;margin:0 auto;padding:24px"><h2 style="color:#2d8a6b">Ki Business Intelligence</h2><p>Merhaba ${name},</p><p><strong>${companyName}</strong> için hesabınız başarıyla oluşturuldu.</p><p>Şimdi giriş yaparak CRM, muhasebe ve yapay zeka özelliklerinizi kullanmaya başlayabilirsiniz.</p><p style="color:#888;font-size:13px">Ki Business Intelligence ekibi</p></div>`,
                });
            }
            catch { /* non-fatal */ }
            return reply.status(201).send({ ok: true, userId: user.id, tenantId: tenant.id });
        }
        catch (e) {
            console.error('[REGISTER-ENTITY]', e);
            return reply.status(500).send({ error: 'Kayıt sırasında hata oluştu' });
        }
    });
    // POST /api/v1/auth/login
    app.post('/login', async (req, reply) => {
        const { email, password } = req.body;
        const user = await db.query.users.findFirst({ where: (t, { eq }) => eq(t.email, email.toLowerCase()) });
        if (!user) {
            await argon2.hash('dummy');
            return reply.status(401).send({ error: 'Invalid credentials' });
        }
        if (!await argon2.verify(user.passwordHash, password))
            return reply.status(401).send({ error: 'Invalid credentials' });
        // 2FA disabled — direct login
        const membership = await db.query.tenantMemberships.findFirst({ where: (t, { eq }) => eq(t.userId, user.id) });
        const tenantId = membership?.tenantId ?? null;
        const role = user.role ?? membership?.role ?? 'member';
        const scope = role === 'entity_external' ? 'external' : undefined;
        const jwtPayload = scope
            ? { sub: user.id, tenantId, role, scope }
            : { sub: user.id, tenantId, role };
        const accessToken = app.jwt.sign(jwtPayload, { expiresIn: env.JWT_EXPIRES_IN });
        const refreshToken = nanoid(64);
        await redis.setex(redisKeys.refreshToken(refreshToken), 60 * 60 * 24 * 30, JSON.stringify({ userId: user.id, tenantId, role }));
        await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, user.id));
        return reply.send({ accessToken, refreshToken, user: { id: user.id, email: user.email, name: user.name, role, tenantId } });
    });
    // POST /api/v1/auth/otp/send
    app.post('/otp/send', async (req, reply) => {
        console.log('\n  [OTP SEND] Request received:', req.body);
        const { userId, channel } = req.body;
        if (!await redis.exists(redisKeys.pending2fa(userId)))
            return reply.status(403).send({ error: 'No active session' });
        if (await redis.get(redisKeys.otpCooldown(userId, channel)))
            return reply.status(429).send({ error: 'Wait before requesting again' });
        const user = await db.query.users.findFirst({ where: (t, { eq }) => eq(t.id, userId) });
        if (!user)
            return reply.status(404).send({ error: 'Not found' });
        if (channel === 'whatsapp' && !user.phone) {
            return reply.status(400).send({ error: 'WhatsApp için telefon numarası gerekli' });
        }
        const code = String(Math.floor(Math.random() * 1_000_000)).padStart(6, '0');
        console.log(`  [OTP SEND] Generated code: ${code} for ${user.email} (${channel})`);
        const hash = await argon2.hash(code);
        await redis.setex(redisKeys.otpRecord(userId, channel), OTP_TTL, JSON.stringify({ hash, attempts: 0 }));
        await redis.setex(redisKeys.otpCooldown(userId, channel), OTP_COOL, '1');
        try {
            if (channel === 'whatsapp')
                await sendWhatsAppOtp(user.phone, code);
            else
                await sendEmailOtp(user.email, code);
            console.log('  [OTP SEND] Code sent successfully');
            return reply.send({ sent: true });
        }
        catch (e) {
            console.error('  [OTP SEND] Error:', e);
            await redis.del(redisKeys.otpRecord(userId, channel));
            await redis.del(redisKeys.otpCooldown(userId, channel));
            return reply.status(500).send({ error: 'Kod gönderimi başarısız, lütfen tekrar deneyin' });
        }
    });
    // POST /api/v1/auth/otp/verify
    app.post('/otp/verify', async (req, reply) => {
        const { userId, channel, code } = req.body;
        if (!await redis.exists(redisKeys.pending2fa(userId)))
            return reply.status(403).send({ error: 'No active session' });
        const raw = await redis.get(redisKeys.otpRecord(userId, channel));
        if (!raw)
            return reply.status(400).send({ error: 'Code expired' });
        const rec = JSON.parse(raw);
        if (rec.attempts >= 5) {
            await redis.del(redisKeys.otpRecord(userId, channel));
            return reply.status(400).send({ error: 'Too many attempts' });
        }
        rec.attempts++;
        await redis.setex(redisKeys.otpRecord(userId, channel), OTP_TTL, JSON.stringify(rec));
        if (!await argon2.verify(rec.hash, code))
            return reply.status(401).send({ error: 'Invalid code' });
        await redis.del(redisKeys.otpRecord(userId, channel));
        return completeLogin(app, userId, reply);
    });
    // POST /api/v1/auth/totp/verify
    app.post('/totp/verify', async (req, reply) => {
        const { userId, token } = req.body;
        if (!await redis.exists(redisKeys.pending2fa(userId)))
            return reply.status(403).send({ error: 'No active session' });
        const user = await db.query.users.findFirst({ where: (t, { eq }) => eq(t.id, userId) });
        if (!user?.totpSecret)
            return reply.status(400).send({ error: 'TOTP not configured' });
        authenticator.options = { digits: 6, step: 30, window: 1 };
        if (!authenticator.verify({ token, secret: user.totpSecret }))
            return reply.status(401).send({ error: 'Invalid code' });
        return completeLogin(app, userId, reply);
    });
    // POST /api/v1/auth/totp/setup  (requires auth — call from Settings page)
    app.post('/totp/setup', { onRequest: [app.authenticate] }, async (req, reply) => {
        const userId = req.user.sub;
        const user = await db.query.users.findFirst({ where: (t, { eq }) => eq(t.id, userId) });
        if (!user)
            return reply.status(404).send({ error: 'Not found' });
        const secret = authenticator.generateSecret(20);
        const otpauth = authenticator.keyuri(user.email, 'Ki Business', secret);
        await redis.setex(`totp:pending:${userId}`, 600, secret);
        const QRCode = await import('qrcode');
        const qrCode = await QRCode.toDataURL(otpauth);
        return reply.send({ qrCode, secret });
    });
    // POST /api/v1/auth/totp/confirm  (requires auth — confirm 6-digit code and save)
    app.post('/totp/confirm', { onRequest: [app.authenticate] }, async (req, reply) => {
        const userId = req.user.sub;
        const { code } = req.body;
        const secret = await redis.get(`totp:pending:${userId}`);
        if (!secret)
            return reply.status(400).send({ error: 'Kurulum süresi doldu, tekrar başlatın' });
        authenticator.options = { digits: 6, step: 30, window: 1 };
        if (!authenticator.verify({ token: code, secret }))
            return reply.status(401).send({ error: 'Geçersiz kod' });
        await db.update(users).set({ totpSecret: secret }).where(eq(users.id, userId));
        await redis.del(`totp:pending:${userId}`);
        return reply.send({ ok: true });
    });
    // POST /api/v1/auth/refresh
    app.post('/refresh', async (req, reply) => {
        const { refreshToken } = req.body;
        const raw = await redis.get(redisKeys.refreshToken(refreshToken));
        if (!raw)
            return reply.status(401).send({ error: 'Invalid refresh token' });
        const data = JSON.parse(raw);
        const newRefresh = nanoid(64);
        const accessToken = app.jwt.sign({ sub: data.userId, tenantId: data.tenantId, role: data.role }, { expiresIn: env.JWT_EXPIRES_IN });
        await redis.del(redisKeys.refreshToken(refreshToken));
        await redis.setex(redisKeys.refreshToken(newRefresh), 60 * 60 * 24 * 30, raw);
        return reply.send({ accessToken, refreshToken: newRefresh });
    });
    // POST /api/v1/auth/logout
    app.post('/logout', { onRequest: [app.authenticate] }, async (req, reply) => {
        const { refreshToken } = req.body;
        if (refreshToken)
            await redis.del(redisKeys.refreshToken(refreshToken));
        return reply.send({ ok: true });
    });
};
async function completeLogin(app, userId, reply) {
    const user = await db.query.users.findFirst({
        where: (t, { eq }) => eq(t.id, userId),
    });
    if (!user)
        return reply.status(404).send({ error: 'User not found' });
    await redis.del(redisKeys.pending2fa(userId));
    const membership = await db.query.tenantMemberships.findFirst({
        where: (t, { eq }) => eq(t.userId, userId),
    });
    const tenantId = membership?.tenantId ?? null;
    const role = user.role ?? membership?.role ?? 'member';
    const accessToken = app.jwt.sign({ sub: user.id, tenantId, role }, { expiresIn: env.JWT_EXPIRES_IN });
    const refreshToken = nanoid(64);
    await redis.setex(redisKeys.refreshToken(refreshToken), 60 * 60 * 24 * 30, JSON.stringify({ userId: user.id, tenantId, role }));
    await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, user.id));
    return reply.send({ accessToken, refreshToken, user: { id: user.id, email: user.email, name: user.name, role, tenantId } });
}
//# sourceMappingURL=auth.js.map