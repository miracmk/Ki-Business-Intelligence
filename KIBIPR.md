# Ki Business Intelligence — KIBIPR.md

Bu dosya Claude Code'un projeyi sıfırdan anlaması için yazılmıştır.
Her oturumda bu dosyayı oku, değişiklikleri buraya yansıt.

---

## 1. Proje Kimliği

**Adı:** Ki Business Intelligence (Ki BI)
**Domain:** https://bi.kibusiness.co
**Sahibi:** mirac@kibusiness.co (admin)
**Amaç:** CRM/ERP/Muhasebe entegrasyonlu, AI destekli çok kiracılı (multi-tenant) iş zekası platformu.
Şirketler (entity) CRM, ERP ve Muhasebe sistemlerini bağlar, KIBI AI ile verilerini sorgular.

---

## 2. Mimari Özet

```
bi.kibusiness.co
  /                → Landing page  (frontend/dist/landing.html)
  /app             → React SPA     (frontend/dist/index.html)
  /app/*           → React SPA     (SPA fallback → index.html)
  /api/v1/*        → Fastify REST API
  /webhooks/*      → CRM/kanal webhook'ları
  /health          → {"status":"ok","env":"production"}

VPS: 168.231.109.167 (Ubuntu 24, mail.kibusiness.co)
Dizin: /opt/apps/ki-bi/
```

### Servis Katmanı (Docker — ki_net ağı, izole)

| Container    | Image                 | Port (iç) | Açıklama                        |
|--------------|-----------------------|-----------|---------------------------------|
| ki_api       | node:24-alpine        | 3001→3001 | Fastify + tsx (build'siz TS)    |
| ki_postgres  | postgres:16-alpine    | 5432      | Ana veritabanı                  |
| ki_redis     | redis:7-alpine        | 6379      | Session, cache, OTP             |
| ki_qdrant    | qdrant/qdrant:v1.9.2  | 6333      | Vektör DB (RAG için)            |

**Nginx Proxy Manager** (`npm_default` ağı) → 443/80 proxy → ki_api:3001
`ki_api` hem `ki_net` hem `npm_default` ağına bağlı (her restart'ta kalıcı).

---

## 3. Teknoloji Stack

### Backend
- **Runtime:** Node.js 24 + TypeScript — `tsx` ile build'siz çalışır
- **Framework:** Fastify 4.x
- **ORM:** Drizzle ORM + drizzle-kit (migration)
- **Auth:** JWT (@fastify/jwt) + Argon2id (şifre hash)
- **AI:** OpenRouter API (google/gemma-4-31b-it:free default)
- **Vector DB:** Qdrant (bilgi tabanı, RAG)
- **Cache/Session:** Redis (ioredis)
- **Şifreleme:** AES-256-GCM (credentials için)

### Frontend
- **Framework:** React 18 + TypeScript
- **Build:** Vite 6
- **Stil:** Tailwind CSS 3 + Aurora Glass tasarım sistemi (özel CSS variables)
- **State:** Zustand
- **HTTP:** Axios (`/api/v1` relative path)
- **Router:** React Router DOM v7

### Aurora Glass Tasarım Sistemi
```css
--teal: #26A69A      /* Ana accent */
--mint: #7DD3C0      /* İkincil accent */
--forest: #2D8A6B    /* Koyu accent */
--text-1: #0e2b26    /* Başlık */
--text-2: #2c7068    /* Gövde */
--text-3: #6ba9a2    /* Yardımcı */

/* Modal (opaque) — dark mode'da okunabilir */
--surface-modal:   #f0faf8  (light) / #0f2420 (dark)
--surface-modal-2: #e2f4f1  (light) / #162e29 (dark)
```
Glassmorphism: `backdrop-filter: blur(20-30px)`, `--surface` variables.
Dark mode: `.dark` class on `<html>`.
Gradient: `linear-gradient(135deg, var(--accent), var(--forest))`.
**Kural:** Modal container'larında `var(--surface-modal)` kullan — `var(--surface)` dark mode'da neredeyse şeffaf (rgba(255,255,255,0.05)) olur.

---

## 4. Dizin Yapısı

```
/opt/apps/ki-bi/
├── src/
│   ├── server.ts              ← Fastify app başlangıcı, static serving, routing
│   ├── api/
│   │   ├── routes/
│   │   │   ├── auth.ts        ← login, register, TOTP (login bypass aktif)
│   │   │   ├── crm.ts         ← CRM bağlantıları, modüller, kayıtlar
│   │   │   ├── ai.ts          ← AI chat endpoint'leri
│   │   │   ├── accounting.ts  ← Muhasebe bağlantıları
│   │   │   ├── support.ts     ← Destek biletleri (UUID guard var)
│   │   │   ├── admin.ts       ← Admin panel API
│   │   │   ├── kibi.ts        ← KIBI platform API
│   │   │   ├── tenant.ts      ← Entity/tenant/profile/channel/ai-config
│   │   │   └── files.ts       ← Dosya yükleme/indirme
│   │   └── webhooks/
│   │       └── index.ts       ← CRM & kanal webhook'ları
│   ├── engine/
│   │   ├── ai/
│   │   │   ├── gateway.ts     ← OpenRouter multi-provider, fallback zinciri
│   │   │   ├── agent.ts       ← AI agent orchestration (UUID guard, instructions)
│   │   │   └── model-config.ts ← DB-backed model config reader (5dk cache)
│   │   ├── crm-sync/
│   │   ├── accounting-sync/
│   │   ├── kibi/
│   │   ├── knowledge/
│   │   └── tools/
│   └── lib/
│       ├── db.ts, redis.ts, qdrant.ts, crypto.ts
│       └── entity-provisioner.ts
├── config/env.ts
├── db/schema.ts, migrations/, entity-schema-template.sql
├── frontend/
│   ├── src/
│   │   ├── App.tsx            ← React routes (tümü /app/* prefix)
│   │   ├── index.css          ← Aurora Glass vars + --surface-modal
│   │   ├── pages/
│   │   │   ├── AiChat.tsx     ← KIBI AI + Instructions modal (Fragment wrapper)
│   │   │   ├── EntityAI.tsx   ← Entity AI + Instructions modal (Fragment wrapper)
│   │   │   ├── Settings.tsx   ← 5 sekme: Hesap/Bağlantılar/AI/Kanallar/Güvenlik
│   │   │   ├── PlatformSettings.tsx ← Admin platform connection manager
│   │   │   └── ...diğer sayfalar
│   │   ├── components/Layout.tsx
│   │   ├── store/auth.ts
│   │   └── lib/api.ts         ← Axios, 401 → /app/login redirect
│   └── dist/                  ← Vite build çıktısı
├── docker-compose.yml         ← ANA COMPOSE DOSYASI
├── .env                       ← Production secrets (ASLA DEĞİŞTİRME, sadece oku)
├── KIBIPR.md                  ← Bu dosya (önceki adı CLAUDE.md)
└── package.json, tsconfig.json, drizzle.config.ts
```

---

## 5. Routing Mimarisi

### React Router (App.tsx)
```tsx
/ → Landing
/app/login → Login
/app/login/2fa → TwoFactor
/app/dashboard → Dashboard
/app/crm → Modules
/app/accounting → Accounting
/app/files → Files
/app/chat → AiChat (KIBI AI)
/app/entity-ai → EntityAI
/app/support → Support
/app/settings → Settings
/app/admin → Admin (AdminRoute)
/app/admin/settings → PlatformSettings (AdminRoute)
/app/admin/kibi-chat → AiChat (isAdminMode, AdminRoute)
/app/register → Register (public, self-service entity kayıt)
```

### server.ts Routing
```
1. /api/v1/* → API routes
2. /webhooks/* → Webhook routes
3. /health → health check
4. /assets/* → static assets
5. GET / → landing.html
6. GET /app* → index.html (SPA)
7. Diğer → landing.html
```

---

## 6. Veritabanı Şeması (Önemli Tablolar)

### users
```sql
id uuid PK, email varchar UNIQUE, name varchar,
password_hash text, phone varchar, totp_secret text,
role user_role DEFAULT 'entity_sub',
is_active bool, is_verified bool, last_login_at timestamp
```

### user_role enum
```
admin, supervisor, entity_main, entity_supervisor, entity_sub, entity_external
(eski: member, viewer — DB'de var, kaldırma)
entity_external: sadece /ai/external-chat erişebilir (JWT scope='external')
```

### tenants
```sql
id uuid PK, name varchar, slug varchar UNIQUE,
is_active bool, settings jsonb, storage_used_bytes bigint
```

`settings` JSONB:
- `channels.{channelName}` → entity kanal config (WA/IG/TG/Email/VOIP)
- `profiles.{userId}` → avatar, address
- `language`, `timezone`

### ai_configs
```sql
tenant_id, provider, model, api_key (AES-256-GCM),
settings jsonb
```

`settings` JSONB:
- `analysisModel`, `analysisFallbacks[]`
- `vectorModel`, `vectorFallbacks[]`
- `conversationModel`, `conversationFallback`, `conversationF2`
- `kibiInstructions`, `entityInstructions`

### platform_configs
```sql
key varchar UNIQUE, value text (AES-256-GCM JSON), description, updated_at
```

Keys: `platform_connections_{crm|erp|accounting}`, `platform_comms_{whatsapp|instagram|telegram|email|voip}`

### kibi_model_configs
```sql
scope varchar, role varchar, primary_model varchar, fallback_models jsonb
```
`scope='platform'` → 5dk in-memory cache

---

## 7. Rol & Yetki Sistemi

| Rol | Yetki |
|-----|-------|
| admin | Platform tam kontrol, tüm entity, KIBI AI admin modu |
| supervisor | Platform readonly, destek yönetimi, KIBI AI admin modu |
| entity_main | Entity tam erişim, kanal/AI/profil yönetimi, şirket adı |
| entity_supervisor | Entity AI + KIBI AI, entity data, profil |
| entity_sub | Entity AI + KIBI AI, profil |

**Admin tenantId:** NULL — entity-specific endpointler UUID guard ile korunur.

---

## 8. API Endpoint'leri

### Auth
```
POST /api/v1/auth/login       → { accessToken, refreshToken, user }
POST /api/v1/auth/refresh
POST /api/v1/auth/logout
POST /api/v1/auth/totp/setup  → [auth] { qrCode, secret }
POST /api/v1/auth/totp/confirm → [auth] { code }
```

### AI
```
POST /api/v1/ai/chat            → KIBI AI (admin/supervisor → isAdmin=true)
POST /api/v1/ai/entity-chat     → Entity AI (UUID tenantId zorunlu)
POST /api/v1/ai/external-chat   → External AI (entity_external role + scope=external JWT only)
GET  /api/v1/ai/config          → { config: { kibiInstructions, entityInstructions, models... } }
GET  /api/v1/ai/openrouter-models → (Redis 6h cache)
POST /api/v1/ai/openrouter-models/refresh
```

### Auth
```
POST /api/v1/auth/register-entity → public self-service kayıt (email, password, name, companyName, industry?)
  → user (role=entity_main) + tenant + tenantMembership + kibiEntities + aiConfigs + welcome email
```

### CRM
```
GET  /api/v1/crm/connections             → bağlantı listesi (credentials hariç)
POST /api/v1/crm/connections             → API key ile yeni bağlantı
POST /api/v1/crm/oauth/start             → { provider, name, clientId, clientSecret, region? } → { authUrl }
POST /api/v1/crm/db-test                 → { host, port, database, username, password, ssl } → { ok, isReadOnly, tables }
POST /api/v1/crm/db-connect              → test + kaydet (crmType: 'postgresql')
GET  /api/v1/crm/connections/:id/sync-status → { syncState[], recentJobs[] }
POST /api/v1/crm/connections/:id/sync/metadata → metadata sync (background)
POST /api/v1/crm/connections/:id/sync/full     → bulk sync (background)
GET  /webhooks/crm/:provider/callback    → OAuth code exchange + DB kayıt + redirect
```

### Tenants
```
GET  /api/v1/tenants/me
PUT  /api/v1/tenants/me/profile   → { name?, phone?, address?, avatar? }
PUT  /api/v1/tenants/me/company   → { name } (entity_main/admin only)
GET  /api/v1/tenants/me/members   → { members: [{userId, role, email, name, isActive}] }
POST /api/v1/tenants/me/invites   → { email, role? } → mevcut user: direkt ekle; yeni user: tenant.settings.invites + email
GET  /api/v1/tenants/email-config → { config: { smtp, imap, fromName, fromEmail } }
PUT  /api/v1/tenants/email-config → save SMTP+IMAP config (passwords AES-256-GCM)
POST /api/v1/tenants/channels/email/test-smtp → verify SMTP connection
POST /api/v1/tenants/channels/email/test-imap → verify IMAP + list folders
POST /api/v1/tenants/external-users → create entity_external user (entity_main/admin)
GET  /api/v1/tenants/external-users → list external users for entity
GET  /api/v1/tenants/channels/:ch → entity kanal config
PUT  /api/v1/tenants/channels/:ch
DELETE /api/v1/tenants/channels/:ch
PUT  /api/v1/tenants/ai-config    → { analysisModel, vectorModel, conversationModel,
                                       kibiInstructions, entityInstructions, ... }
```

### Admin
```
GET/PUT/DELETE /api/v1/admin/platform-settings/:key
GET/PUT        /api/v1/admin/platform-connections/:category
GET/PUT/DELETE /api/v1/admin/platform-comms/:channel
GET/PUT        /api/v1/admin/models/:role
POST           /api/v1/admin/models/seed
```

---

## 9. Ortam Değişkenleri

**UYARI: .env dosyasını asla değiştirme, sadece oku.**

```bash
NODE_ENV=production | PORT=3001 | HOST=0.0.0.0
APP_URL=https://bi.kibusiness.co
FRONTEND_DIST=/app/frontend/dist
DATABASE_URL=postgres://...@ki_postgres:5432/ki_platform
REDIS_URL=redis://...@ki_redis:6379
QDRANT_URL=http://ki_qdrant:6333
QDRANT_COLLECTION=ki_knowledge_base
OPENROUTER_API_KEY=sk-or-v1-...
SMTP_HOST/PORT/USER=...
WEBHOOK_BASE_URL=https://bi.kibusiness.co
```

---

## 10. Deploy & Geliştirme İş Akışı

```bash
# API restart (backend kaynak değişti)
cd /opt/apps/ki-bi && docker compose restart ki_api

# Frontend build + deploy
cd /opt/apps/ki-bi/frontend && npm run build
cd /opt/apps/ki-bi && docker compose restart ki_api

# Loglar
docker logs ki_api -f --tail=50

# Migration
cd /opt/apps/ki-bi && npm run db:generate && npm run db:migrate
```

**Kritik:** `tsx src/server.ts` — build adımı yok, kaynak değişikliği → restart yeterli.

---

## 11. AI Mimarisi

### KIBI AI
- Admin/supervisor: `isAdmin=true` → admin sistem prompt (tüm tablolara erişim)
- `kibiInstructions` → sistem prompt'una eklenir
- Session history: Redis, son 20 mesaj, 30 gün

### Entity AI
- UUID tenantId zorunlu
- Entity DB summary → context olarak gönderilir
- `entityInstructions` → sistem prompt'una eklenir

### runAgent() akışı
```
1. isValidUUID(tenantId) → aiConfigs yükle (false ise skip)
2. buildModelChains() → platform DB + tenant override
3. Redis'ten chat history yükle
4. buildSystemPrompt() → isAdmin ? adminPrompt : customerPrompt
5. gateway.completeWithFallback(analysisChain)
6. DEPT:xxx parse → temiz yanıt
7. Redis'e kaydet (30 gün)
```

---

## 12. Kritik Notlar & Bilinen Sorunlar

### UUID Guard Pattern
Her yerde `const isValidUUID = (s) => !!s && /^[0-9a-f]{8}-...-[0-9a-f]{12}$/i.test(s)` kullanılır.
Admin'in `tenantId=null` olması doğal ve kasıtlıdır.

### Modal Şeffaflık
`var(--surface)` dark mode'da `rgba(255,255,255,0.05)` — neredeyse görünmez.
Modal container'larda her zaman `var(--surface-modal)` kullan.
textarea/input'larda modal içinde `var(--surface-modal-2)` kullan.

### 2FA Durumu
Login bypass aktif. TOTP kurulum endpoint'leri çalışıyor ama login flow'da kontrol yok.

### Qdrant Uyumsuzluğu
Client 1.18.0 / Server 1.9.2 — `checkCompatibility: false` ile atlatılıyor.

### Docker Network
`ki_api` her force-recreate'de `npm_default` düşebilir. `docker-compose.yml`'de her iki network tanımlı — kalıcı çözüm yapılmış.

### OpenRouter Rate Limit
Free tier'da zaman zaman 503. Gateway'de 3'lü fallback zinciri var.

---

## 13. Önemli Dosyalar

| Dosya | Ne Yapar |
|-------|----------|
| `src/server.ts` | Routing, static serving, middleware |
| `src/api/routes/ai.ts` | AI chat endpoints (UUID guard, instructions) |
| `src/api/routes/tenant.ts` | Profile, channel, ai-config endpoints |
| `src/api/routes/support.ts` | Support tickets (UUID guard) |
| `src/engine/ai/agent.ts` | Agent orchestration, model chains, prompts |
| `src/engine/ai/model-config.ts` | DB model config (5dk cache) |
| `db/schema.ts` | Drizzle schema |
| `frontend/src/index.css` | Aurora Glass + --surface-modal vars |
| `frontend/src/lib/api.ts` | Axios (401 → /app/login) |
| `frontend/src/pages/AiChat.tsx` | KIBI AI + Instructions modal |
| `frontend/src/pages/EntityAI.tsx` | Entity AI + Instructions modal |
| `frontend/src/pages/Settings.tsx` | 7-tab settings (Hesap/AI/CRM/Muhasebe/Kanallar/Ekip/Güvenlik) |
| `frontend/src/pages/Register.tsx` | Entity self-service kayıt (design system, industry dropdown) |
| `frontend/src/pages/Dashboard.tsx` | Dashboard + onboarding banner (4 adım, localStorage dismiss) |
| `frontend/src/pages/PlatformSettings.tsx` | Admin connection manager |
| `docker-compose.yml` | Stack tanımı |
| `.env` | Secrets (ASLA DEĞİŞTİRME) |

---

## Yeni Fazlar (23 Mayıs 2026 — Sprint 2)

### ✅ Tamamlanan Yeni Fazlar

#### YFZ 1 — Veritabanı ve Rol Sistemi
- [x] `entity_external` user_role enum'a eklendi (DB + schema.ts)
- [x] `mirac@kibusiness.co` → `superadmin` → `admin` migration
- [x] Ki Business Solutions entity doğrulandı (enterprise, is_provisioned=true)
- [x] JWT'de `scope: 'external'` → entity_external tokenlar için
- [x] Global `onRequest` hook: external tokenlar /ai/external-chat dışındaki tüm route'larda reddedilir
- [x] `requireFullAccess` Fastify decorator eklendi
- [x] Admin JWT'si KBS entity tenantId'sini taşır (membership üzerinden)

#### YFZ 2 — Navigasyon
- [x] "Admin" → "Platform" olarak yeniden adlandırıldı (ikon: Settings2)
- [x] Alt menü: Platform Management + Platform Settings + KIBI Chat
- [x] `isSuperAdmin` → `isAdminOrSupervisor` (admin + supervisor)
- [x] `/app/admin/kibi-chat` route eklendi (AiChat isAdminMode prop ile)

#### YFZ 3 — Email SMTP + IMAP
- [x] `imapflow` paketi eklendi
- [x] `GET/PUT /api/v1/tenants/email-config` — SMTP+IMAP config (AES-256-GCM şifreli)
- [x] `POST /tenants/channels/email/test-smtp` — SMTP bağlantı testi
- [x] `POST /tenants/channels/email/test-imap` — IMAP bağlantı testi + folder listesi
- [x] IMAP polling service (`src/engine/imap-poller.ts`) — her entity için bağımsız döngü
- [x] Auto-reply: IMAP'tan gelen email → destek bileti → KIBI AI yanıt → SMTP ile gönder
- [x] Server startup'ta `startImapPollers()` çağrılıyor

#### YFZ 4 — Destek Sistemi Düzeltmeleri
- [x] Admin tickets endpoint SQL injection düzeltildi → Drizzle ORM sorgusu
- [x] Admin tickets: pagination (page, limit), entityName enrichment
- [x] support-pipeline.ts SMTP hataları try-catch içinde (non-fatal)

#### YFZ 5 — External Chat + Kullanıcı Oluşturma
- [x] `POST /api/v1/ai/external-chat` — entity_external scope zorunlu
- [x] Vektör arama (Qdrant) context için kullanılıyor
- [x] Açık destek biletleri context'e ekleniyor
- [x] `POST /api/v1/tenants/external-users` — entity_external kullanıcı oluşturma
- [x] `GET /api/v1/tenants/external-users` — external kullanıcı listesi

#### YFZ 6 — Platform Management
- [x] Admin.tsx başlığı "Admin Panel" → "Platform Management"

#### YFZ 7 — AI Modlar
- [x] AiChat.tsx `isAdminMode` prop kabul ediyor → farklı başlık "KIBI Chat — Platform Yönetim AI"
- [x] EntityAI.tsx admin/supervisor için sarı info banner (KIBI Chat'i kullanmalarını hatırlatır)

#### YFZ 8 — Settings Email SMTP+IMAP UI
- [x] Settings.tsx → Kanallar tab'ında email kanalı özel modal (`showEmailModal`)
- [x] SMTP bölümü: host, port, secure, user, password + test butonu
- [x] IMAP bölümü: host, port, secure, user, password, inboxFolder, checkIntervalMinutes, autoReply + test butonu
- [x] Kayıtlı şifre: placeholder "Kayıtlı şifre mevcut" (şifre güvenli, gösterilmez)
- [x] `saveEmailConfig()` → PUT /tenants/email-config

#### YFZ 9 — Entity Onboarding
- [x] `POST /api/v1/auth/register-entity` — public self-service kayıt endpoint'i
  - Kullanıcı (role=entity_main) + tenant + tenantMembership + kibiEntities (clientId: KBI-XXXXXX) + aiConfigs oluşturur
  - Hoş geldin emaili gönderilir (non-fatal)
- [x] `GET /api/v1/tenants/me/members` — entity üyelerini listele
- [x] `POST /api/v1/tenants/me/invites` — kayıtlı kullanıcı: direkt ekle; yeni: settings.invites + email
- [x] Register.tsx yeniden tasarlandı (design system, industry dropdown, 13 sektör seçeneği)
- [x] App.tsx → `/app/register` route eklendi
- [x] Dashboard.tsx:
  - Aurora Glass design system'e geçiş (var(--*) CSS variables)
  - Onboarding banner (4 adım: CRM / Email / Ekip / Entity AI)
  - Adım tamamlanma: connections.length>0, emailConfig.smtp.host, members>1, (ai her zaman false)
  - localStorage'da dismiss ("ki-onboarding-dismissed")
- [x] Settings.tsx → "Ekip" tab eklendi:
  - Üye davet formu (email + rol seçici + davet gönder)
  - Üye listesi (avatar baş harf, rol badge)

#### YFZ 10 — CRM Entegrasyon Akışı

**10.1 + 10.3 — OAuth (Zoho / HubSpot / Salesforce)**
- [x] `POST /api/v1/crm/oauth/start` — state'i Redis'te (10dk TTL) saklar, authUrl döner
- [x] `GET /webhooks/crm/:provider/callback` — code exchange, crmConnections tablosuna kaydeder
  - Zoho: `accounts.zoho.{region}/oauth/v2/token`
  - HubSpot: `api.hubapi.com/oauth/v1/token`
  - Salesforce: `login.salesforce.com/services/oauth2/token`
- [x] Başarı/hata sonrası `/app/settings?tab=crm&oauth_success=1` redirect
- [x] Settings.tsx → CRM tab'ında "OAuth ile Bağla" butonu (popup penceresi açar)
  - Provider seçimi: Zoho / HubSpot / Salesforce
  - Zoho için region seçimi (com/eu/in/com.au/jp)
  - Popup kapandığında `loadData()` otomatik çağrılır

**10.2 — Modules.tsx Sync Akışı**
- [x] Modules.tsx tamamen yeniden yazıldı
- [x] Modül sidebar: `totalRecords` + `lastFullSync` + `status` ikonu (crmSyncState'ten)
- [x] "Sync Başlat" butonu → `POST /crm/connections/:id/sync/full`
- [x] 5 saniyede bir polling (`/crm/connections/:id/sync-status`)
- [x] Sync tamamlanınca polling durur, sync durumu banner'da gösterilir
- [x] "Modüller" butonu → metadata sync + modül listesini yeniler

**10.4 — DB Bağlantısı (PostgreSQL)**
- [x] `POST /api/v1/crm/db-test` — pg bağlantısı test + read-only kontrolü + tablo listesi
- [x] `POST /api/v1/crm/db-connect` — bağlantıyı crmConnections'a kaydeder (credentials AES-256-GCM)
- [x] db/migrations/0004_add_postgresql_crm_type.sql → `ALTER TYPE crm_type ADD VALUE 'postgresql'`
- [x] schema.ts → crmTypeEnum'e 'postgresql' + 'mysql' eklendi
- [x] docker-compose.yml → ki_api servisine `n8n_n8n-net` network eklendi (ki-postgres erişimi)
- [x] Settings.tsx → CRM ve Muhasebe tab'larında "DB ile Bağla" butonu
  - Host, port, database, username, password, SSL alanları
  - "Bağlantıyı Test Et" butonu → read-only kontrolü + tablo listesi gösterir
  - Test geçtikten sonra "Kaydet" aktif olur

#### YFZ 11 — Muhasebe OAuth + Dashboard

**11.1 — Zoho Books / QuickBooks / Xero OAuth**
- [x] `POST /api/v1/accounting/oauth/start` — state Redis'e (10dk TTL `ki:acc:oauth:state:{state}`), authUrl döner
  - Zoho Books: `accounts.zoho.{region}/oauth/v2/auth`
  - QuickBooks: `appcenter.intuit.com/connect/oauth2`
  - Xero: `login.xero.com/identity/connect/authorize`
- [x] `GET /webhooks/accounting/:provider/callback` — token exchange, `accountingConnections` tablosuna kaydeder (AES-256-GCM)
- [x] Settings.tsx → Muhasebe tab'ında "OAuth ile Bağla" butonu
  - Provider seçimi: Zoho Books / QuickBooks / Xero
  - Zoho Books için Organization ID + region seçimi
  - Popup penceresi, kapanınca `loadData()` otomatik

**11.2 — Accounting.tsx Dashboard Güncelleme**
- [x] Bu ay gelir vs geçen ay gelir kıyaslaması (delta %  + ok ikonu)
- [x] "Muhasebe Bağlantısı Yok" CTA (Link2 + "Muhasebe Yazılımı Bağla" butonu → entegrasyon tabına)
- [x] Ödenmemiş faturalar listesi (dueDate, kalan bakiye)
- [x] Son işlemler bölümü (+ / - renk kodlu ödemeler)
- [x] Recharts Legend eklendi

#### YFZ 12 — WhatsApp Webhook

**12.1 — WhatsApp CRM entegrasyonu**
- [x] `GET /webhooks/whatsapp` — verify_token kontrolü
- [x] `POST /webhooks/whatsapp` — gelen mesajı destekten geçirir, yanıt gönderir

**12.2 — WhatsApp Kanalı**
- [x] Settings.tsx → Kanallar tab'ında WhatsApp: Phone Number ID + Access Token + WABA ID + verify_token
- [x] `PUT /api/v1/tenants/channels/whatsapp` — kaydeder

#### YFZ 13 — Telegram + Instagram

**13.1 — Per-entity Telegram Bot**
- [x] `POST /webhooks/telegram/:entityId` — entity'nin bot_token'ı kibiEntities üzerinden okunur
- [x] Gelen mesaj `runAgent()` üzerinden işlenir, yanıt `sendTelegramMessageWithToken()` ile iletilir
- [x] Settings.tsx → Telegram: bot_token + bot_username + webhook secret

**13.2 — Instagram DM**
- [x] `GET /webhooks/instagram` — WA_WEBHOOK_VERIFY_TOKEN doğrulaması
- [x] `POST /webhooks/instagram` — entry.messaging[0] işlenir, `sendInstagramMessage()` ile yanıt

#### YFZ 14 — Bildirimler

**14.1 — In-app Bildirimler**
- [x] `GET /api/v1/notifications` — entityId'ye göre okunmamış bildirimleri döner
- [x] `PUT /api/v1/notifications/:id/read` — tekil bildirim okundu işaretle
- [x] `PUT /api/v1/notifications/read-all` — tüm bildirimleri okundu yap
- [x] `createEntityNotification(entityId, type, title, body?, data?)` — yardımcı fonksiyon (notifications.ts)
- [x] Layout.tsx → header'a zil ikonu (Bell) + unread badge + dropdown
  - 30 sn polling, dışarı tıklayınca kapanır
  - var(--surface-modal) arka plan, notif tipi etiketleri

**14.2 — Email Bildirimler (Temel)**
- [x] Yeni destek bileti → SMTP ile bildirim (support-pipeline.ts entegre)
- [x] E-posta kanalı SMTP config → tenant settings üzerinden okunur

#### YFZ 15 — Plan Limitleri + Token Takibi

**15.1 — Plan Limit Kontrolü**
- [x] `POST /api/v1/ai/chat` — entity'nin planına göre aylık mesaj limiti kontrolü
  - Planlar: free=100, starter=500, growth=2000, enterprise=999999
  - Limit aşılınca 429 + "Plan limitinize ulaştınız" döner
  - `entity_metrics.current_month_messages` ↑ (raw SQL ON CONFLICT DO UPDATE)

**15.2 — Token Kullanım Takibi**
- [x] AI yanıtı sonrası `kibi_token_usage` tablosuna kayıt
  - promptTokens = `message.length/4` (tahmin), completionTokens = `response.length/4`
  - modelName, costUsd (0 — gerçek maliyet için gateway değişikliği gerekir)

**15.3 — Admin Plan Yönetimi**
- [x] `PUT /api/v1/admin/entities/:entityId/plan` — planName güncelleme
- [x] `GET /api/v1/admin/plans` — plan limitleri ve özellik listesi

### ✅ Tümü Tamamlandı (YFZ 1–15)

---

#### YFZ 16 — CRM Veri Aynalama + AI ETL

**16.1 — PostgreSQL Adapter**
- [x] `src/adapters/postgresql.ts` — dış PG DB'yi CRM olarak adapte eder
  - `getModules()` → `information_schema.tables` → tablo listesi
  - `getModuleFields()` → `information_schema.columns` → kolon listesi
  - `getRelatedLists()` → foreign key ilişkileri
  - `streamTable()` → batch olarak satır akışı (ETL için)
  - `getTableCount()` → toplam kayıt sayısı
- [x] `src/adapters/index.ts` → `postgresql` ve `mysql` case'leri eklendi
- [x] `crm_type` enum DB'ye migrasyon uygulandı (`postgresql`, `mysql`)

**16.2 — Entity ETL (Extract → AI Normalize → Load)**
- [x] `src/engine/crm-sync/entity-etl.ts`
  - **Tam Ayna:** Her kaynak kayıt `entity_{slug}.crm_raw_mirror` tablosuna yazılır (hiç veri atlanmaz)
  - **Metadata Aynalama:** Modül/kolon bilgileri `entity_settings`'e `crm_source_metadata` anahtarıyla kaydedilir
  - **AI Normalizasyon Ajanı:** Her 20 kayıt batch'te OpenRouter (Nemotron) çağrılır:
    - Telefon: E.164 formatı
    - Ülke: 2 harfli ISO kodu
    - İsim: Büyük/küçük harf düzeltme
    - Email: küçük harf, boşluk temizle
    - Para: Sembol kaldırma, ondalık normalleştirme
    - Şirket tipi: A.Ş./Ltd./GmbH tespiti
  - **Zoho CRM mapping:** Contacts→crm_contacts, Leads→crm_contacts(contact_type=lead), Accounts→crm_companies, Deals/Potentials→crm_deals, Products→erp_products
  - **PostgreSQL mapping:** Kolon ismine göre regex eşleştirme (Türkçe+İngilizce), bilinmeyenler→custom_fields
  - **Bulk sync sonrası otomatik tetikleme:** `processBulkCallback()` tamamlanınca ETL fire-and-forget başlar

**16.3 — Yeni API Endpoint'leri**
- [x] `POST /api/v1/crm/connections/:id/sync/entity` — ETL manuel tetikleme (202 Accepted)
- [x] `POST /api/v1/crm/connections/:id/sync/pg-direct` — PostgreSQL için metadata+ETL zinciri
- [x] `GET /api/v1/crm/connections/:id/entity-data` — Entity schema preview (normalized data)

**16.4 — Frontend (Modules.tsx)**
- [x] "AI Aynala + Entity DB'ye Yaz" butonu → `POST .../sync/entity`
- [x] "Ham Sync" butonu (eski Sync Başlat) — sadece crm_records'a yazar
- [x] "Modüller" butonu → metadata sync (tablo/kolon yapısını tarar)

**Akış:**
```
Kaynak (CRM API / PG DB)
  ↓ Ham Sync / Metadata Sync
crm_records (public schema — ham JSON)
  ↓ AI Aynala butonu
entity_{slug}.crm_raw_mirror (tam ayna — hiç kayıt atlanmaz)
entity_{slug}.entity_settings → crm_source_metadata
  ↓ AI Normalizasyon (batch 20, Nemotron)
entity_{slug}.crm_contacts / crm_companies / crm_deals / erp_products
  ↓ Entity AI okur
```

---

#### YFZ 17 — Platform Temizliği + Akıllı CRM Konnektör Sihirbazı

**FAZ A — Platform Management Temizliği**
- [x] Admin.tsx → "KIBI Chat" tab kaldırıldı (Layout.tsx'te zaten var)
- [x] Admin.tsx → "Model Yönetimi" tab kaldırıldı (PlatformSettings.tsx'te model selector mevcut)
- [x] İlgili state/handler'lar temizlendi (models, chatMessages, chatInput, sendChat, handleModelEdit, saveModelConfig, openrouterModels)
- [x] Admin.tsx artık 3 tab: Genel Bakış, Entityler, Destek

**FAZ B — CRM Konnektör Sihirbazı (Akıllı Bağlama Akışı)**

*B.1 — connector_config Schema + Migration*
- [x] `ConnectorConfig`, `ConnectorModuleMapping`, `ConnectorFieldMapping` TypeScript interface'leri `db/schema.ts`'e eklendi
- [x] `crm_connections.connector_config JSONB` kolonu DB'ye eklendi (ALTER TABLE IF NOT EXISTS)
- [x] `db/migrations/0003_rainy_arclight.sql` no-op migration olarak güncellendi (çakışma önleme)

*B.2 + B.3 — scan-structure Endpoint + SSE Streaming*
- [x] `POST /api/v1/crm/connections/:id/scan-structure` — bağlantıyı okur, tüm modülleri + alanları + örnek 5 satırı tarar, Redis'e 30dk cache'ler
- [x] `GET /api/v1/crm/connections/:id/scan-structure/stream` — SSE (Server-Sent Events), canlı tarama logu: `{type, message, percent}` frame'leri, 15s heartbeat, `reply.raw` kullanır

*B.4 — AI Konnektör Üreteci*
- [x] `POST /api/v1/crm/connections/:id/generate-connector` — Redis cache'teki yapıyı OpenRouter (Nemotron) ile analiz eder
  - Hedef şema: crm_contacts, crm_companies, crm_deals, erp_products
  - Transform tipleri: direct, phone_e164, country_iso, name_case, email_lower, currency_strip, custom
  - AI başarısız olursa regex-based fallback (`buildFallbackMappings()`)
  - Sonucu `crm_connections.connector_config`'e yazar
- [x] `PUT /api/v1/crm/connections/:id/connector` — konnektör manuel düzenleme + kayıt
- [x] `GET /api/v1/crm/connections/:id/sync-history` — son 20 bulk job geçmişi

*B.5 — Entity ETL v2 — Connector Mode*
- [x] `entity-etl.ts` → `runEntityEtl()` artık `conn.connectorConfig` varlığına göre yol seçer
  - Konnektör varsa → `runConnectorEtl()` (v2, transform tabanlı)
  - Yoksa → eski `runCrmRecordsEtl()` / `runPostgresEtl()` (v1 fallback)
- [x] `runConnectorEtl()` — mapping'e göre her alanı dönüştürür (phone_e164, email_lower, name_case vb.), bilinmeyenleri custom_fields JSONB'ye toplar
- [x] `applyConnectorMapping()` yardımcı fonksiyon

*B.6 — CrmConnectorWizard.tsx Bileşeni*
- [x] `frontend/src/components/CrmConnectorWizard.tsx` — 5 adımlı modal sihirbaz:
  - **Adım 1:** Kaynak tipi seçimi (CRM API, Veritabanı, ERP-yakında)
  - **Adım 2:** DB bağlantı formu + test butonu (PostgreSQL)
  - **Adım 3:** SSE canlı log + bulunan yapı ağacı (EventSource)
  - **Adım 4:** AI konnektör üretimi + JSON önizleme
  - **Adım 5:** Eşleştirme tablosu (hedef alan, dönüşüm tipi düzenlenebilir) + onay
- [x] Settings.tsx → CRM tab başlığına "Sihirbaz ile Bağla" butonu (Wand2 ikonu)
- [x] Settings.tsx → `showCrmWizard` state + wizard modal render
- [x] Settings.tsx → Bağlantı kartları genişletildi:
  - `connectorConfig` badge (v1 etiket)
  - "Konnektör Oluştur/Yenile" butonu
  - "Yapıyı Yenile" butonu (eski "Metadata Sync")
  - "Detay" toggle → entity kayıt sayıları, mapping tablosu, son sync'ler

**FAZ C — Sync Akışı Tamamlama**
- [x] `src/engine/crm-sync/crm-scheduler.ts` — plan bazlı periyodik ETL scheduler:
  - free=günde 1, starter=4 saatte 1, growth=saatte 1, enterprise=15 dakikada 1
  - Her 5 dk aktif bağlantıları tarar, interval geçtiyse fire-and-forget ETL başlatır
- [x] `server.ts` → startup'ta `startCrmScheduler()` çağrılıyor (`[CrmScheduler] Started` log)
- [x] Modules.tsx → tek "Sync" butonu (smart):
  - Konnektör varsa → ETL tetikler (v2 modu)
  - Yoksa → ham bulk sync başlatır (v1 fallback)
- [x] "Ham Sync" + "AI Aynala" butonları kaldırıldı; "Modüller" → "Yapıyı Yenile"

**FAZ D — Entity DB Önizleme**
- [x] Settings.tsx bağlantı kartları detay panelinde entity veritabanı önizlemesi:
  - crm_contacts / crm_companies / crm_deals / erp_products kayıt sayıları
  - Son 5 sync'in özeti (modül, kayıt sayısı, tarih)
  - Konnektör mapping tablosu (kaynak → hedef → alan sayısı)

**Deploy:**
- Build: `✓ built in 4.74s`
- Migration: `connector_config JSONB` kolonu eklendi
- Backend: `docker compose restart ki_api` — temiz başlangıç, `[CrmScheduler] Started`

---

#### YFZ 18 — CRM Sihirbazı Yeniden Tasarımı (6 Adım + Kullanıcı Modül Eşleştirmesi)

**Görev 1 — Platform Management Temizliği**
- [x] Admin.tsx doğrulandı: hâlâ temiz (3 tab: Genel Bakış / Entityler / Destek), chat/model state yok

**Görev 2 — 6 Adımlı Sihirbaz (CrmConnectorWizard.tsx tam yeniden yazıldı)**
- [x] Adım 1: Kaynak tipi seçimi (Veritabanı seçilmeden ilerlenemez; CRM API → bilgi kartı gösterilir)
- [x] Adım 2: DB bağlantı formu + test + kaydet (değişmedi)
- [x] Adım 3: SSE tarama çalışırken canlı log + modül listesi; tarama bitince 3-sekme yapı görüntüsü:
  - **Modüller sekmesi:** Modül adı, kayıt sayısı, alan sayısı tablosu
  - **Alanlar sekmesi:** Her modülün kolon adları, tipleri, örnek değerleri (tüm modüller birleşik)
  - **Örnek Veri sekmesi:** Her modülden ham ilk 5 satır (alan başlıklı tablo)
- [x] Adım 4: Modül eşleştirmesi — kullanıcı dropdown ile hedef tablo seçer (AI yok)
  - Regex öneri motoru (`suggestTargetTable()`): contact/lead→crm_contacts, account/company→crm_companies, deal/opportunity→crm_deals, product/item→erp_products
  - Dropdown'lar: `background: var(--surface-modal), color: var(--text-1)` (dark mode uyumlu)
  - Eşleşen modül sayacı alt satırda gösterilir
- [x] Adım 5: AI konnektör üretimi — SSE canlı log akışı
  - Yeni endpoint: `GET /crm/connections/:id/generate-connector/stream?token=&m=<urlencoded-userMappings-json>`
  - Modül başına progress eventi: "X modülü hazırlanıyor — Y alan"
  - OpenRouter AI çağrısı: sadece field mapping (modül eşleştirmesi kullanıcıdan sabit)
  - Fallback regex: `buildFallbackMappingsFromUserMap()` — userMappings'ten targetTable, alan adına göre transform
  - Konnektör DB'ye kaydedilir, done eventi içinde connector JSON gönderilir
  - Tamamlanınca Adım 6'ya otomatik geçiş (600ms delay)
- [x] Adım 6: Önizleme ve onay — iki sütun düzen:
  - Sol: düzenlenebilir alan eşleştirme tablosu (kaynak, hedef input, transform select)
  - Sağ: DB schema önizlemesi — her hedef tablo için eşleşen alanlar (yeşil badge) + custom_fields'e gidenler (gri badge)
  - "Onayla ve Kaydet" → PUT connector + POST sync/entity + modal kapanır

**Görev 3 — generate-connector POST Endpoint Güncelleme**
- [x] Request body'ye `userMappings: Record<string, string | null>` eklendi
- [x] AI prompt: `hasUserMappings=true` durumunda "modül eşleştirmesi sabittir, sadece field mapping yap" prompt'u
- [x] AI prompt: `hasUserMappings=false` durumunda eski modül+field mapping prompt'u (geriye dönük uyumluluk)
- [x] Fallback: `hasUserMappings=true` → `buildFallbackMappingsFromUserMap()` (targetTable userMappings'ten), `false` → `buildFallbackMappings()` (regex module detection)
- [x] connectorConfig `version: 2` (userMappings tabanlı) vs eski `version: 1`

**Görev 4 — scan-structure SSE'ye Örnek Veri Ekleme**
- [x] SSE `structure` eventi: `{ name, label, recordCount, fields: enrichedFields, sampleRows: [...5 ham satır] }`
- [x] Redis cache: modül objesi artık `sampleRows` içeriyor
- [x] Frontend Adım 3 "Örnek Veri" sekmesi bu veriyi kullanıyor

**Görev 5 — Dropdown Görünürlük**
- [x] Tüm `<select>` ve `<option>` öğeleri: `background: var(--surface-modal), color: var(--text-1)`
- [x] TARGET_TABLE_OPTIONS sabit liste olarak tanımlandı (API'den gelmiyor)

**Görev 6 — entity-etl.ts Güncelleme**
- [x] `ENTITY_TABLE_DDL`: her hedef tablo için `CREATE TABLE IF NOT EXISTS` DDL
- [x] `ensureEntityTable(pool, schemaName, tableName)`: tablo varlığını kontrol eder, yoksa DDL çalıştırır
- [x] `runConnectorEtl()`: her mapping öncesi `ensureEntityTable()` çağrısı — entity provisioning yapılmamış olsa bile çalışır
- [x] Upsert conflict kolonu: `external_id` (entity-schema-template.sql ile uyumlu)

**Yeni Sabit/Fonksiyonlar (crm.ts)**
- [x] `FIELD_MAP_PATTERNS`: alan adı → `{target, transform}` eşleştirme sözlüğü (30+ pattern)
- [x] `buildFallbackMappingsFromUserMap()`: userMappings kullanarak targetTable belirler, FIELD_MAP_PATTERNS ile field mapping
- [x] `buildFallbackMappings()`: eski regex-tabanlı modül detection (v1 uyumluluğu için)

**Deploy:**
- Build: `✓ built in 5.32s`
- Backend: `docker compose restart ki_api` — `[CrmScheduler] Started`

---

*Son güncelleme: YFZ 1-18 tamamlandı. 6 adımlı CRM konnektör sihirbazı: kullanıcı modül eşleştirmesi (Adım 4), AI sadece field mapping yapar (Adım 5 SSE), örnek veri 3 sekmeli yapı görüntüsü (Adım 3), entity tablo garantisi (ensureEntityTable), dark-mode uyumlu dropdown'lar. 23 Mayıs 2026.*
