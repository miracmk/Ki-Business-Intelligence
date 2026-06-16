/**
 * AI Agent — translates "Ki Business Support Workflow" n8n workflow
 *
 * Two-model architecture:
 *   analysisModel    → DB querying, tool calls, structured reasoning (Nemotron chain)
 *   conversationModel → customer-facing natural language reply (Llama-3.3 chain)
 *
 * Fallback: each model type has a priority chain; if primary fails the next is tried.
 * Tenant can override both models + fallbacks via AI config settings.
 */
import { ANALYSIS_MODELS, aiComplete, } from './gateway.js';
import { getAnalysisModels, getConversationModels, getPlatformModels } from './model-config.js';
import { redis, redisKeys } from '../../lib/redis.js';
import { db } from '../../lib/db.js';
import { aiMessages, aiSessions } from '../../../db/schema.js';
import { eq, sql } from 'drizzle-orm';
// ── Admin system prompt ───────────────────────────────────────────────────────
function buildAdminSystemPrompt() {
    return `# ROL
Sen KIBI AI'sın — Ki Business Intelligence platformunun yapay zeka asistanı.
Şu anki kullanıcı PLATFORM ADMİNİ'dir. Tam yetkiye sahipsin, hiçbir kısıtlama yok.

# YETKİLER
- Tüm entity (tenant) verilerine erişim
- Platform konfigürasyonu (platform_configs, kibi_model_configs)
- Tüm kullanıcı ve rol bilgileri
- Destek biletleri (kibi_support_tickets)
- Token kullanımı ve maliyetler (kibi_token_usage)
- CRM bağlantıları (crm_connections, crm_records)
- AI konfigürasyonları (ai_configs, kibi_model_configs)
- Entity şema ve provisioning bilgileri (kibi_entities, tenants)

# ARAÇLAR

## ki_db_query — TÜM TABLOLAR ERİŞİLEBİLİR
Sadece SELECT. Platform tabloları:
- tenants, users, tenant_memberships
- kibi_entities, kibi_token_usage, kibi_support_tickets
- kibi_model_configs, platform_configs, ai_configs
- crm_connections, crm_records, crm_modules
- platform_metrics

## vector_search — Bilgi tabanı araması

# FORMAT
Türkçe. Özgürce yanıtla, kısıtlama yok.
Rakamları, istatistikleri ve veritabanı sorgularını gerçek zamanlı olarak kullan.`;
}
// ── System prompt ─────────────────────────────────────────────────────────────
function buildSystemPrompt(input) {
    if (input.isAdmin) {
        const base = buildAdminSystemPrompt();
        return input.instructions ? `${base}\n\n# ÖZEL TALİMATLAR\n${input.instructions}` : base;
    }
    const fullName = [input.firstName, input.lastName].filter(Boolean).join(' ') || 'Müşteri';
    const companies = input.authorizedCompanies ?? [];
    const status = input.verificationStatus ?? 'unverified';
    const companyLines = companies.length
        ? companies.map((c) => `• ${c.accountName} (ID: ${c.accountId})${c.jurisdiction ? ' — ' + c.jurisdiction : ''}`).join('\n')
        : '-';
    const companyIdMap = companies
        .map((c) => `${c.accountName} → ${c.accountId}`)
        .join('\n') || '-';
    return `# ROL
Ki Business müşteri destek asistanısın.

# MÜŞTERİ
Ad: ${fullName}
CID: ${input.contactId ?? '-'}
Durum: ${status}
Kanal: ${input.channel}

# ŞİRKETLER
${companyLines}

# KURAL
Türkçe. Maks 2 cümle. Tek paragraf.
YASAK: * - # | > \` emoji liste madde

# DEPARTMAN — İLK SATIR ZORUNLU
DEPT:support  = teknik sorun, şikayet, destek talebi
DEPT:info     = SADECE Ki Business hizmet fiyat süreç bilgisi
DEPT:finance  = fatura, ödeme, borç sorgulama
DEPT:booking  = randevu alma, iptal, değiştirme
DEPT:document = evrak yükleme, belge talebi
DEPT:general  = mevcut kayıt sorgulama, genel sohbet, selam, teşekkür

KURAL: Müşteri kendi kaydını, durumunu, siparişi soruyorsa → DEPT:general
KURAL: Yeni bir hizmet almak veya fiyat sormak istiyorsa → DEPT:info

# ARAÇLAR VE KULLANIM SIRASI

## 1. ki_db_query — ÖNCE BUNU KULLAN
Yerel PostgreSQL CRM mirror. Hızlı, rate limit yok.
SADECE SELECT.
Örnek:
  SELECT data->>'Full_Name', data->>'Email' FROM crm_records WHERE module_api_name='Contacts' AND data->>'Email'='x'
  SELECT data FROM crm_records WHERE module_api_name='Accounts' AND crm_id='{accountId}'
  SELECT data->>'Name', data->>'Status' FROM crm_records WHERE module_api_name='Services_Subs' AND data->>'Related_Account'='{accountId}'

## 2. crm_live — DB'DE BULAMAZSAN
Canlı CRM. DB'de sonuç yoksa kullan.

## 3. vector_search — SERVİS BİLGİSİ İÇİN
Ki Business hizmet, fiyat, süreç için.

# ŞİRKET ID HARİTASI
${companyIdMap}

Müşteri hangi şirketi kastettiyse o accountId ile sorgula.${input.instructions ? `\n\n# ÖZEL TALİMATLAR\n${input.instructions}` : ''}`;
}
// ── Tool definitions ──────────────────────────────────────────────────────────
const TOOLS = [
    {
        name: 'ki_db_query',
        description: 'Ki Business PostgreSQL CRM mirror sorgular. ÖNCE bunu kullan.',
        parameters: {
            type: 'object',
            properties: {
                sql_query: { type: 'string', description: 'SELECT sorgusu. Sadece SELECT.' },
            },
            required: ['sql_query'],
        },
    },
    {
        name: 'crm_live',
        description: "Canlı CRM verisi çeker. DB'de yoksa kullan.",
        parameters: {
            type: 'object',
            properties: {
                operation: { type: 'string', enum: ['search', 'get'] },
                module: { type: 'string' },
                criteria: { type: 'string' },
                record_id: { type: 'string' },
            },
            required: ['operation', 'module'],
        },
    },
    {
        name: 'vector_search',
        description: 'Ki Business hizmet/fiyat bilgisi için Qdrant vektör araması.',
        parameters: {
            type: 'object',
            properties: {
                query: { type: 'string' },
                limit: { type: 'number', default: 5 },
            },
            required: ['query'],
        },
    },
];
// ── Build model chains: platform DB config → tenant override → hardcoded defaults ─
async function buildModelChains(settings) {
    // Load platform-level model lists from DB (cached, 5 min TTL)
    const [platformAnalysis, platformConversation, platformVector] = await Promise.all([
        getAnalysisModels(),
        getConversationModels(),
        getPlatformModels('qdrant_search', ANALYSIS_MODELS),
    ]);
    const analysisChain = [
        settings.analysisModel || platformAnalysis[0],
        ...(settings.analysisFallbacks ?? platformAnalysis.slice(1)),
    ].filter(Boolean);
    const conversationChain = [
        settings.conversationModel || platformConversation[0],
        settings.conversationFallback || platformConversation[1] || '',
        platformConversation[2] ?? '',
    ].filter(Boolean);
    const vectorChain = [
        settings.vectorModel || platformVector[0],
        ...(settings.vectorFallbacks ?? platformVector.slice(1)),
    ].filter(Boolean);
    return {
        analysisChain: [...new Set(analysisChain)],
        conversationChain: [...new Set(conversationChain)],
        vectorChain: [...new Set(vectorChain)],
    };
}
// UUID format guard — prevents DB errors when tenantId is 'platform', 'admin', '', null
function isValidUUID(s) {
    return !!s && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
}
// ── Main agent executor ───────────────────────────────────────────────────────
export async function runAgent(input) {
    // 1. Load tenant AI config (only when tenantId is a real UUID)
    const aiConfig = isValidUUID(input.tenantId)
        ? await db.query.aiConfigs.findFirst({
            where: (t, { eq }) => eq(t.tenantId, input.tenantId),
        })
        : null;
    const settings = (aiConfig?.settings ?? {});
    const { analysisChain, conversationChain, vectorChain } = await buildModelChains(settings);
    console.log('  [AGENT] Analysis chain:    ', analysisChain);
    console.log('  [AGENT] Conversation chain:', conversationChain);
    console.log('  [AGENT] Vector chain:      ', vectorChain);
    // 2. Load chat history (Postgres if session ID is UUID, otherwise Redis)
    let history = [];
    if (isValidUUID(input.sessionId)) {
        try {
            const dbMessages = await db.query.aiMessages.findMany({
                where: (t, { eq }) => eq(t.sessionId, input.sessionId),
                orderBy: (t, { asc }) => [asc(t.createdAt)],
                limit: 20,
            });
            history = dbMessages.map(m => ({
                role: m.role,
                content: m.content
            }));
        }
        catch (err) {
            console.error('  [AGENT] DB history load failed:', err);
        }
    }
    else {
        const messagesKey = redisKeys.sessionMessages(input.sessionId);
        const historyRaw = await redis.lrange(messagesKey, -20, -1);
        history = historyRaw.map((r) => JSON.parse(r));
    }
    const systemPrompt = buildSystemPrompt(input);
    const messages = [
        { role: 'system', content: systemPrompt },
        ...history,
        { role: 'user', content: input.userMessage },
    ];
    // 3. Analysis phase: use analysis model chain with multi-provider complete
    let finalResponse = '';
    let usedModel = '';
    let lastError = null;
    async function completeWithFallback(chain, temp, maxTokens) {
        for (const modelStr of chain) {
            try {
                console.log(`  [AGENT] Attempting completion with model: ${modelStr}`);
                const normalizedModel = modelStr.includes('::') ? modelStr : `openrouter::${modelStr}`;
                const res = await aiComplete(normalizedModel, messages, input.tenantId === 'platform' || input.tenantId === 'admin' ? null : input.tenantId, {
                    temperature: temp,
                    maxTokens,
                });
                return { content: res.content, usedModel: res.usedModel };
            }
            catch (err) {
                console.warn(`  [AGENT] Model ${modelStr} failed: ${err.message}`);
                lastError = err;
            }
        }
        throw lastError ?? new Error('Fallback chain empty or all models failed');
    }
    try {
        console.log('  [AGENT] Analysis phase using chain:', analysisChain);
        const result = await completeWithFallback(analysisChain, 0.2, 2000);
        finalResponse = result.content;
        usedModel = result.usedModel;
        console.log(`  [AGENT] Analysis done with model: ${usedModel}`);
    }
    catch (e) {
        console.error('  [AGENT] Analysis phase failed, falling back to conversation chain:', e);
        // Last-resort: try conversation chain
        try {
            const result = await completeWithFallback(conversationChain, 0.4, 1200);
            finalResponse = result.content;
            usedModel = result.usedModel;
        }
        catch {
            finalResponse = 'DEPT:support\nMerhaba! Şu anda hizmet veremiyorum, lütfen daha sonra tekrar deneyin.';
        }
    }
    // 4. Parse DEPT + clean response
    const deptMatch = finalResponse.match(/DEPT:(\w+)/);
    const department = (deptMatch?.[1]?.toLowerCase() ?? 'general');
    const cleanResp = finalResponse.replace(/DEPT:\w+\n?/g, '').trim();
    // 5. Persist to Redis & DB
    const newUserMsg = { role: 'user', content: input.userMessage };
    const newAsstMsg = { role: 'assistant', content: cleanResp };
    // Redis
    const messagesKey = redisKeys.sessionMessages(input.sessionId);
    await redis.rpush(messagesKey, JSON.stringify(newUserMsg), JSON.stringify(newAsstMsg));
    await redis.expire(messagesKey, 60 * 60 * 24 * 30); // 30 days
    // Postgres
    if (isValidUUID(input.sessionId)) {
        try {
            await db.insert(aiMessages).values([
                {
                    sessionId: input.sessionId,
                    role: 'user',
                    content: input.userMessage,
                    modelName: usedModel,
                },
                {
                    sessionId: input.sessionId,
                    role: 'assistant',
                    content: cleanResp,
                    modelName: usedModel,
                }
            ]);
            await db.update(aiSessions)
                .set({
                messageCount: sql `message_count + 2`,
                lastMessageAt: new Date(),
                updatedAt: new Date(),
            })
                .where(eq(aiSessions.id, input.sessionId));
        }
        catch (err) {
            console.error('  [AGENT] DB message persist failed:', err);
        }
    }
    const identity = {
        contactId: input.contactId,
        accountId: input.accountId,
        firstName: input.firstName,
        lastName: input.lastName,
        channel: input.channel,
        authorizedCompanies: input.authorizedCompanies,
        verificationStatus: input.verificationStatus,
        _lastSeen: new Date().toISOString(),
        _lastMessage: cleanResp.slice(0, 200),
        _lastDept: department,
        _usedModel: usedModel,
    };
    const idKey = input.contactId
        ? redisKeys.contactIndex(input.contactId)
        : redisKeys.sessionIdentity(input.sessionId);
    await redis.set(idKey, JSON.stringify(identity), 'EX', 60 * 60 * 24 * 30);
    return { response: cleanResp, department, sessionId: input.sessionId, usedModel };
}
//# sourceMappingURL=agent.js.map