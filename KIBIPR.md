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
admin, supervisor, entity_main, entity_supervisor, entity_sub
(eski: member, viewer — DB'de var, kaldırma)
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
GET  /api/v1/ai/config          → { config: { kibiInstructions, entityInstructions, models... } }
GET  /api/v1/ai/openrouter-models → (Redis 6h cache)
POST /api/v1/ai/openrouter-models/refresh
```

### Tenants
```
GET  /api/v1/tenants/me
PUT  /api/v1/tenants/me/profile   → { name?, phone?, address?, avatar? }
PUT  /api/v1/tenants/me/company   → { name } (entity_main/admin only)
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
| `frontend/src/pages/Settings.tsx` | 5-tab settings (Hesap/AI/Kanallar/Güvenlik) |
| `frontend/src/pages/PlatformSettings.tsx` | Admin connection manager |
| `docker-compose.yml` | Stack tanımı |
| `.env` | Secrets (ASLA DEĞİŞTİRME) |

---

*Son güncelleme: FAZ 6 tamamlandı — Bug fixes (AI hataları, dashboard redirect, destek talebi), AI Instructions (KIBI AI + Entity AI), Profile/Company editing, Channels tab, Platform Settings modal opacity fix. Build ve deploy yapıldı.*
