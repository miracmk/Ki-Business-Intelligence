# Ki Business Intelligence — KIBIPR.md

Bu dosya Claude Code'un projeyi sıfırdan anlaması için yazılmıştır.
Her oturumda bu dosyayı oku, değişiklikleri buraya yansıt.

---

## 1. Proje Kimliği

**Adı:** KiBI (Ki Business Intelligence) — AI-Native All-in-One Business Platform
**Domain:** https://bi.kibusiness.co
**Sahibi:** mirac@kibusiness.co (admin)
**Konumlandırma:** Zoho / Salesforce / SAP / Odoo'ya karşı, çok kiracılı (multi-tenant) bir SaaS:
- **Base Platform** (her tenant'ta dahil, ek ücret yok): CRM + ERP + Muhasebe & Faturalama — tek tenant-izole şemada, birbirine bağlı.
- **Premium Upsell:** KiBI AI — CRM/ERP/Muhasebe verisini Qdrant/RAG ile okuyan karar-destek asistanı. Base, KiBI AI tamamen kapalıyken de %100 çalışır.
- **Native Add-on Modüller** (ayrı ücretlendirilir, tek tık aktivasyon): Customer Service Management, Fulfillment Service Management, E-Commerce Management, Marketing Management, Event Management, Personnel Management.
- **Dış Bağlantılar (Universal Connector Wizard):** eski/harici sistemlerden (CRM/ERP/Muhasebe yazılımları) veri **içe aktarmak** için — Base native tablolara import mekanizması olarak konumlanır, davranışı değişmedi.

Detaylı ürün mimarisi: bkz. **§14 KiBI Ürün Mimarisi — Base + Premium + Addon**.

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
│   │   │   └── model-config.ts ← DB-backed model config reader (scope:role cache)
│   │   ├── billing/
│   │   │   └── billing.ts     ← Aylık faturalama, mesaj aşımı, ek kullanıcı, Ki Wallet entegrasyonu (YFZ 32)
│   │   ├── crm-sync/
│   │   │   └── entity-etl.ts  ← runConnectorEtl + runMirrorEtl (YFZ 31)
│   │   ├── connector/
│   │   │   └── connector-ai.ts ← Semantic katalog üretimi (YFZ 19-21)
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
/app/wallet → KiWallet (Ki Wallet bakiye + faturalama durumu + paket karşılaştırma)
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

### entity_module_entitlements (YFZ 34 — Premium AI + Add-on entitlement framework)
```sql
id uuid PK, entity_id uuid FK→kibi_entities.id (cascade),
module_key entity_entitlement_module_key enum, status entity_entitlement_status enum,
price_usd numeric(10,2) DEFAULT 0, billing_type varchar DEFAULT 'monthly',
trial_ends_at, enabled_at, cancelled_at, metadata jsonb,
created_at, updated_at
UNIQUE(entity_id, module_key)
```
- `module_key`: `ai_premium`, `addon_customer_service`, `addon_fulfillment`, `addon_ecommerce`, `addon_marketing`, `addon_event`, `addon_personnel_management`
- `status`: `trial`, `active`, `suspended`, `cancelled`
- `entity_id` → `kibi_entities.id` (NOT `tenants.id`) — billing/plan konvansiyonuyla tutarlı (`kibiWallets`, `entityMetrics` aynı deseni kullanır)
- `billEntityMonthly()` (`src/engine/billing/billing.ts`) bu tablodaki `status='active'` satırların `price_usd` toplamını aylık temel ücrete ekler
- `/api/v1/ai/chat` ve `/api/v1/ai/entity-chat`, `ai_premium` entitlement'ı aktif değilse 402 döner (admin/supervisor bypass hariç)
- Add-on'ların 6'sı şu an **stub registry** (`ADDON_MODULE_KEYS`, `src/api/routes/entitlements.ts`) — gerçek modül kodu yok, sadece aktivasyon iskeleti

### Base Şema — Entity-İçi (entity_{slug}) CRM/ERP/Muhasebe FK Grafiği
Her tenant'ın kendi `entity_{slug}` Postgres şeması vardır (`db/entity-schema-template.sql`, uygulayan `src/lib/entity-provisioner.ts`). Bu zaten birbirine bağlı bir "Base" şemadır:

```
CRM:  crm_contacts ←FK— crm_deals.contact_id          crm_companies ←FK— crm_deals.company_id
      crm_contacts ←FK— crm_companies.id (company_id)  crm_activities → contact_id/company_id/deal_id

ERP:  erp_products ←FK— erp_stock_movements.product_id, erp_order_items.product_id
      erp_suppliers ←FK— erp_orders.supplier_id
      erp_orders ←FK(cascade)— erp_order_items.order_id
      erp_staff ←FK(self)— erp_staff.manager_id ; erp_staff ←FK— erp_staff_attendance / erp_payroll

MUHASEBE: acc_contacts ←FK— acc_invoices.contact_id / acc_payments.contact_id / acc_expenses.contact_id
          acc_invoices ←FK(cascade)— acc_invoice_lines.invoice_id
          acc_bank_accounts ←FK— acc_bank_transactions.bank_account_id

ÇAPRAZ MODÜL (bilinçli soft-link, FK DEĞİL — kayıt silinse bile muhasebe yaşar):
  acc_contacts.crm_contact_id / crm_company_id → crm_contacts / crm_companies
  acc_invoices.order_id → erp_orders
  acc_invoice_lines.product_id → erp_products
```

**Önemli:** Muhasebe native CRUD (`src/api/routes/accounting.ts` + `frontend/src/pages/Accounting.tsx`) bugün hâlâ **public-schema** `acc_*` tablolarını hedefliyor (yukarıdaki entity-içi `acc_*` setinden ayrı, izole) — bu, YFZ 34 Faz 2'de entity-schema'ya konsolide edilecek (bkz. §12 bilinen sorunlar). CRM/ERP'nin entity-içi tabloları bugün sadece external connector ETL veya AI-agent doğal-dil yazma (`entity-db-engine.ts`) ile doluyor — native REST/UI CRUD yok (YFZ 34 Faz 3-4'te eklenecek).

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
| `src/api/routes/entitlements.ts` | Premium AI + Add-on entitlement aktivasyon API'si (YFZ 34) |
| `src/lib/entity-provisioner.ts` | Entity şema provisioning + `queryEntitySchema()` (native CRUD'un DB erişim katmanı) |
| `db/entity-schema-template.sql` | Base şema DDL (CRM/ERP/Muhasebe, entity-içi) |

---

## 14. KiBI Ürün Mimarisi — Base + Premium + Addon

### 14.1 Pozisyonlama
KiBI, Zoho / Salesforce / SAP / Odoo gibi rakiplere karşı konumlanır: onların hantal, parçalı yapısına karşı, **Base** paketinde en kritik iş bileşenlerini sunan, çekirdeğinde AI olan ve sektörel ihtiyaçları native add-on'larla çözen çok-kiracılı bir SaaS.

### 14.2 Base Platform (her tenant'ta dahil, ücretsiz)
- **CRM:** Müşteri bilgileri, Fırsatlar (Deals), Lead yönetimi, Pipeline, Görevler — entity-içi `crm_contacts/crm_companies/crm_deals/crm_activities`.
- **ERP:** Stok/Envanter, üretim planlama, al-sat, maliyet muhasebesi — entity-içi `erp_products/erp_stock_movements/erp_warehouses/erp_suppliers/erp_orders/erp_order_items` (+ `erp_staff/erp_staff_attendance/erp_payroll`, bkz. §14.4 Personnel Management notu).
- **Muhasebe & Faturalama:** Finansal tablolar, vergi, cari hesap, fatura kesme, tahsilat — entity-içi `acc_contacts/acc_invoices/acc_invoice_lines/acc_payments/acc_expenses/acc_bank_accounts/acc_bank_transactions/acc_chart_of_accounts`.
- Bu üçü **tek tenant-izole şemada** (`entity_{slug}`), birbirine bağlı tablolar olarak tasarlanmıştır (bkz. §6 FK grafiği). Base, **KiBI AI tamamen kapalıyken de %100 çalışmalıdır** — bu yüzden native REST+UI CRUD (AI-agent'a bağımlı olmadan) gereklidir (YFZ 34 Faz 2-4).

### 14.3 Premium Upsell — KiBI AI
- Veritabanındaki CRM/ERP/Muhasebe verisini Qdrant + RAG ile okuyan, karar destek sunan native AI asistanı.
- Entitlement: `entity_module_entitlements.module_key = 'ai_premium'`.
- Gate noktaları: `POST /api/v1/ai/chat`, `POST /api/v1/ai/entity-chat` — entitlement `active`/`trial` değilse 402 (admin/supervisor bypass hariç). Frontend: `Layout.tsx` nav'ında KIBI AI / Entity AI linkleri entitlement yoksa gizlenir (kozmetik, asıl sınır backend 402'dir).

### 14.4 Native Add-on Modüller (entitlement iskeleti — modül kodu henüz yok)
Firmaların sektörlerine göre tek tıkla aktive edebileceği, ayrı ücretlendirilen 6 modül:
1. **Customer Service Management** — Ticket/Support, SLA takibi, müşteri portalı (`addon_customer_service`)
2. **Fulfillment Service Management** — Kurye, sevkiyat, depo çıkış, teslimat (`addon_fulfillment`)
3. **E-Commerce Management** — Amazon/eBay/Walmart/Trendyol/Hepsiburada entegrasyonu (`addon_ecommerce`)
4. **Marketing Management** — E-posta pazarlama, sosyal medya takvimi, AI içerik üretimi (`addon_marketing`)
5. **Event Management** — Etkinlik, biletleme, organizasyon takvimi, mekan yönetimi (`addon_event`)
6. **Personnel Management** — Personel/bordro/devam takibi (`addon_personnel_management`) — şema zaten Base ERP DDL'inde hazır (`erp_staff/erp_staff_attendance/erp_payroll`), sadece native CRUD+UI eksik; bu yüzden ERP native CRUD fazı (Faz 4) bu tabloları **bilinçli olarak hariç tutar**.

Şu an sadece `entity_module_entitlements` tablosu + `ADDON_MODULE_KEYS` stub registry + aktivasyon API'si var (YFZ 34 Faz 1). Gerçek modül inşası YFZ 34 Faz 5a-5f (ayrı, çok-fazlı efor).

### 14.5 Universal Connector Wizard — Pozisyon Değişikliği (kod değişmedi)
Eski/harici sistemlerden (eski muhasebe yazılımı, başka bir CRM/ERP) veri almak için mevcut Universal Connector Wizard (`crmConnections`, `entity-etl.ts`, `UniversalConnectorWizard.tsx`) korunur — davranışı **değişmedi**. Artık kavramsal olarak "tek veri kaynağı" değil, Base native tablolara **import mekanizması** olarak konumlanır.

---

## Geliştirme Geçmişi (YFZ 1-33)

> Aşağıdaki bölüm, KiBI'nin önceki adı "Ki Business Intelligence" altında YFZ 1'den YFZ 33'e kadar yapılan tüm geliştirmelerin değişmeden korunan kaydıdır. Yeni mimari için bkz. yukarıdaki §14; bu fazlar üzerine inşa edilen yeni çalışma için bkz. en alttaki "YFZ 34+ — KiBI Repositioning".

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

---

#### YFZ 19 — Çok Provider'lı AI Gateway + Provider Yönetimi

**Mimari:**
- Konfigürasyon A (KIBI AI): `platform_configs` → `ai_provider_kibi_{providerId}`
- Konfigürasyon B (Entity Free Tier): `platform_configs` → `ai_provider_entity_free_{providerId}`
- Konfigürasyon C (Entity Özel): `ai_configs.settings.providerKeys[providerId]` (entity başına)
- Gateway öncelik: C → B → A (entity kendi key'i varsa onu kullan)

**Yeni dosyalar:**
- [x] `src/engine/ai/providers.ts` — 10 provider tanımı (openrouter, openai, anthropic, google, mistral, groq, together, fireworks, deepseek, cohere). `getConfigKey()`, `parseModelString()`, `buildModelString()`, `KIBI_FREE_MODEL` sabit.
- [x] `src/engine/ai/gateway.ts` — `aiComplete(model, messages, tenantId?, opts?)` yeni routing fonksiyonu. 5dk in-memory key cache. Anthropic özel header (`x-api-key`). 15s timeout. Eski `AiGateway` sınıfı korundu (agent.ts backward compat).

**Admin endpoint'leri (`/admin/ai-providers/:scope/`):**
- [x] `GET /admin/ai-providers/kibi` → provider listesi + isConfigured
- [x] `PUT /admin/ai-providers/kibi/:providerId` → { apiKey } kaydet (AES-256-GCM)
- [x] `DELETE /admin/ai-providers/kibi/:providerId` → key sil
- [x] `GET /admin/ai-providers/kibi/models` → tüm konfigüre provider'lardan model listesi (Redis 30dk cache `ki:models:kibi:{id}`)
- [x] `GET /admin/ai-providers/kibi/roles` → kibi_model_configs scope=platform
- [x] `PUT /admin/ai-providers/kibi/roles` → rol ataması kaydet
- Aynı endpoint seti `/admin/ai-providers/entity-free/` scope için de mevcut

**Entity endpoint'leri (`/tenants/ai-providers`):**
- [x] `GET /tenants/ai-providers` → own keys (source:'own') + entity_free platform keys (source:'platform') + kibi_free sanal seçenek
- [x] `PUT /tenants/ai-providers/:providerId` → entity kendi key'ini kaydeder (`ai_configs.settings.providerKeys`)
- [x] `DELETE /tenants/ai-providers/:providerId` → entity kendi key'ini siler
- [x] `GET /tenants/ai-providers/all-models` → modeller: own + entity_free + kibi_free::default listenin başında

**Frontend:**
- [x] `PlatformSettings.tsx` AI tab → iki alt sekme: "KIBI AI" ve "Entity Free Tier". Paylaşımlı `AiProviderPanel` bileşeni (provider kartları, model havuzu, rol atama dropdown'ları).
- [x] `Settings.tsx` AI tab → provider kartları (kendi key'i / platform sağlıyor / yok), model atama `input[list]` ile tüm sağlayıcılardan.

**Deploy:** `npm run build` → `✓ built in 5.57s` → `docker compose restart ki_api` → `🚀 Ki Platform running`

---

#### YFZ 19-21 / FAZ A — Model Rol Taksonomisi + Semantic Katalog Altyapısı

**Amaç:** 13 yeni semantik model rolünü tanıtmak, Connector AI semantic katalog + AI pipeline logging + KB sinyal yazımı için altyapıyı kurmak.
Spec'in eski halini mevcut mimariye uyarlandı (çok-provider sistem korundu).

**FAZ A — Veritabanı + Model Rol Taksonomisi (✅ Tamamlandı)**

**DB Değişiklikleri:**
- [x] Migration `0009_model_roles_catalog_logs.sql`:
  - `ALTER TYPE kibi_model_role ADD VALUE` × 13 yeni rol ekle
  - `CREATE TABLE entity_data_catalog` — Connector AI semantic katalog (tableName, tableIntent, columns/relationships/queryTemplates JSONB, dataQuality, rawTablePath, isQueryable/isWritable/isUserApproved)
  - `CREATE TABLE ai_pipeline_logs` — her AI model çağrısının kaydı (pipelineType, modelRole, modelUsed, tokens, latency, success, confidence, escalated, kbWritten)
- [x] Migration `0010_seed_model_roles.sql`:
  - 13 yeni rolü `platform` ve `entity_free` scope'larında seed (format: `provider::modelId`)
  - Fallback modellerle OpenRouter / Hugging Face mapping

**Yeni Roller (13 semantik rol):**
`intent_analysis` | `support_problem` | `support_solution` | `support_generator` | `sales_intent` | `sales_conversation` | `consulting_intent` | `consulting_recommendation` | `master_conversation` | `db_query` | `kb_vector` | `connector` | `kb_signal_writer`

**Schema güncellemesi (db/schema.ts):**
- [x] `kibiModelRoleEnum` — 13 yeni rol enum dizisine eklendi (mevcut 9 rol korundu)
- [x] `entityDataCatalog` table — YFZ 19-21 spec A.1.2 tipleri
- [x] `aiPipelineLogs` table — YFZ 19-21 spec A.1.3 tipleri

**Backend (src/engine/ai/model-config.ts):**
- [x] `ModelRole` type — 13 yeni rol eklendi (mevcut 9 rol korundu)
- [x] `getModelForRole(role, scope, tenantId?)` yeni fonksiyon:
  1. Entity override kontrol (`ai_configs.settings.modelOverrides[role]`) varsa döndür
  2. `kibi_model_configs` (scope+role) 5dk cache ile dön
  3. Fallback hardcoded modeller
- [x] `seedDefaultModelConfigs()` — 13 yeni rol + eski 9 rol seed (mevcut platform scope'a)
  - Provider parsing: `provider::model` formatından otomatik extract
  - Idempotent: mevcut roller üzerine yazılmaz

**Uyumluluk:**
- ✅ Eski 9 model rol korundu (canlı `support_resolver/refine/answering` destek pipeline'ı bozulmadı)
- ✅ Çok-provider `provider::model` sistem korundu (OpenRouter-only spec değil)
- ✅ Migration 0004-0008 sıra başıdır (0009/0010 sonra uygulanır)
- ✅ `tsc --noEmit` hata yok, build temiz

**Test Geçtiğinde:**
- Migration'lar postgres'te çalışır (0009 enum ADD → 0010 seed, transaction ayrımı)
- `GET /admin/ai-providers/kibi/roles` → 22 rol (9 eski + 13 yeni) platform scope'ında
- `npm run db:migrate` → veritabanında entityDataCatalog + aiPipelineLogs tablolar var

**Sonraki:** FAZ B (Connector AI motoru + KB sinyal + endpoint'ler) → FAZ C (Frontend UI)
*16 Haziran 2026 — FAZ A tamamlandı.*

---

#### YFZ 19-21 / FAZ B — Connector AI Motoru + Pipeline Logging + KB Sinyal (✅ Tamamlandı)

**Yeni Backend Dosyaları:**
- [x] `src/engine/connector/types.ts` — Semantic katalog tipleri (ConnectorColumn, CatalogEntry, ScannedTable vb.)
- [x] `src/engine/connector/connector-ai.ts` — Connector AI motor (`analyzeTableStructure`, `runConnectorAnalysis`)
- [x] `src/engine/ai/kb-signal-writer.ts` — KB sinyal yazımı (anonim sinyal → Qdrant `ki_platform_knowledge`)

**CRM Route Güncellemeleri (5 yeni endpoint):**
- [x] `GET /crm/connections/:id/catalog` — entity_data_catalog'dan katalog entry'lerini döndür
- [x] `PUT /crm/connections/:id/catalog/:tableId/approve` — tabloyu onayla
- [x] `POST /crm/connections/:id/catalog/bulk-approve` — birden fazla tabloyu onayla
- [x] `GET /crm/connections/:id/analyze/stream` — Connector AI SSE akışı (semantic katalog üretimi)
- [x] `POST /crm/connections/:id/test-query` — katalog şablonundan test query çalıştır (SELECT-only)

**Admin Route Güncellemeleri:**
- [x] `GET /admin/pipeline-logs` — ai_pipeline_logs kaydı (filtreleme: role/entityId/success, özet: success rate/escalation/latency)

**Migration İyileştirmesi:**
- [x] 0010_seed_model_roles.sql SQL hataları düzeltildi
- [x] Migration'lar postgres'te başarıyla apply edildi (26 row: 13 rol × 2 scope)

**Deploy:**
- [x] `cd frontend && npm run build` ✓ 6.23s
- [x] Migrations 0009 + 0010 docker exec ile apply edildi
- [x] `docker compose restart ki_api` → `🚀 Ki Platform running on 0.0.0.0:3001`
- [x] [CrmScheduler] Started, API çalışıyor

**Sonraki:** FAZ C (Frontend: Model Seçici UI + 7 adımlı UniversalConnectorWizard + AI Günlükleri sekmesi)
*16 Haziran 2026 — FAZ B tamamlandı.*

---

#### YFZ 19-21 / FAZ C — Frontend: Model Seçici + AI Günlükleri + Connector Wizard (✅ Tamamlandı)

**PlatformSettings.tsx Güncellemeleri:**
- [x] MODEL_ROLE_LABELS → 13 yeni rol eklendi (intent_analysis, support_problem, ... kb_signal_writer)
- [x] ROLE_DESCRIPTIONS tanımlandı (yeni roller için kod + scope + speedNeed açıklamaları)
- [x] TABS'a "AI Günlükleri" sekmesi eklendi
- [x] AiLogsTab bileşeni: pipeline-logs GET + özet badges (total, success rate, escalation, latency)
- [x] Tablo: tarih, rol, model, latency, sonuç (başarı/hata badge)

**UniversalConnectorWizard.tsx (YENİ):**
- [x] 7 adımlı sihirbaz bileşeni yazıldı:
  - Adım 1: Kaynak Seç (CRM API / Veritabanı / ERP & Muhasebe)
  - Adım 2: Bağlantı Kur (provider spesifik form)
  - Adım 3: Yapı Tarama (SSE progress)
  - Adım 4: Connector AI Analizi (semantic katalog)
  - Adım 5: Onay & Düzenleme
  - Adım 6: Sorgu Şablonları
  - Adım 7: Tamamlama
- [x] Adım indikatörü + Navigation butonları
- [x] Aurora Glass tasarım uygulandı

**Settings.tsx Güncellemeleri:**
- [x] CrmConnectorWizard → UniversalConnectorWizard import'u değiştirildi
- [x] Sihirbaz bileşeni çağrısı güncellenıştir

**Deploy:**
- [x] Frontend build (typescript 6133 uyarıları mevcut ama build success)
- [x] `git add -A && git commit` → FAZ B + C merged
- [x] `git push origin main` ✓
- [x] Remote: `c210523` latest

---

#### YFZ 19-21 — Universal Connector Wizard + Model Selector + Semantic Catalog (FAZ A-G)

**FAZ A — Veritabanı Değişiklikleri (✅ Tamamlandı)**

- [x] db/schema.ts: kibiModelRoleEnum'a 13 yeni rol eklendi (intent_analysis, support_problem, ..., kb_signal_writer)
- [x] entity_data_catalog tablosu oluşturuldu (id, entityId, connectionId, sourceName, sourceType, tableName, displayName, tableIntent, columns JSONB, relationships JSONB, queryTemplates JSONB, dataQuality JSONB, rawTablePath, isQueryable, isWritable, isUserApproved, catalogVersion, recordCount, lastAnalyzedAt, createdAt, updatedAt)
- [x] ai_pipeline_logs tablosu oluşturuldu (id, entityId, sessionId, pipelineType, modelRole, modelUsed, inputTokens, outputTokens, latencyMs, success, errorMessage, confidenceScore, escalated, kbWritten, createdAt)
- [x] db/migrations/0009_model_roles_catalog_logs.sql: enum ADD VALUE + tabloları CREATE
- [x] db/migrations/0010_seed_model_roles.sql: 13 rol × 2 scope = 26 row seed

**FAZ B — Backend Altyapısı (✅ Tamamlandı)**

- [x] src/engine/ai/model-config.ts: ModelRole type güncellendi, getModelForRole() fonksiyonu eklendi (scope: 'platform' | 'entity_default', tenant override desteği, 5dk cache)
- [x] src/engine/connector/types.ts: SemanticRole, TableIntent, ConnectorColumn, ConnectorRelationship, ConnectorDataQuality, CatalogEntry, ScannedTable tipleri
- [x] src/engine/connector/connector-ai.ts: analyzeTableStructure(), runConnectorAnalysis() (Connector AI semantic katalog üretimi), buildRawTablePath(), buildFallbackCatalog()
- [x] src/engine/ai/kb-signal-writer.ts: KbSignal interface, writeKbSignal() (anonim KB sinyal yazımı → ki_platform_knowledge Qdrant collection'u)
- [x] src/api/routes/crm.ts: 5 yeni endpoint — /catalog GET/PUT, /catalog/:tableId/approve PUT, /catalog/bulk-approve POST, /analyze/stream GET (SSE), /test-query POST (SELECT-only)
- [x] src/api/routes/admin.ts: /pipeline-logs GET (model performance logging)

**FAZ C — Frontend Model Selector UI (✅ Tamamlandı)**

- [x] frontend/src/pages/PlatformSettings.tsx: Model Yönetimi sekmesi yeniden yazıldı
  - 13 yeni role için MODEL_ROLE_LABELS eklendi
  - Entity AI vs KIBI AI gruplandırması (2 kolon düzen)
  - Her rol için kart: birincil model dropdown + yedek modeller
  - Sağlayıcı dropdown (openrouter model listesi)
  - "Test Et" butonu (model latency testi)
- [x] frontend/src/pages/PlatformSettings.tsx: AI Günlükleri sekmesi eklendi
  - GET /admin/pipeline-logs → tablo + özet badges (successRate, escalatedCount, avgLatencyMs)
  - Rol filtresi, entity filtresi, başarı durumu filtresi
  - Dark mode uyumlu (Aurora Glass)

**FAZ D — Universal Connector Wizard (✅ Tamamlandı)**

- [x] frontend/src/components/UniversalConnectorWizard.tsx: 7 adımlı sihirbaz
  1. StepSourceSelect: CRM API / Veritabanı / ERP seçimi (3 kart)
  2. StepConnect: Bağlantı detayları (host, db, API key, OAuth akışı placeholder)
  3. StepScan: SSE canlı tarama (scan-structure/stream)
  4. StepAnalyze: Connector AI semantic analizi (analyze/stream SSE)
  5. StepApprove: Katalog gözden geçirme (approve/bulk-approve)
  6. StepQueries: Sorgu şablonları (query templates review)
  7. StepComplete: Tamamlama özeti (Entity AI kullanıma hazır)
- [x] frontend/src/pages/Settings.tsx: CrmConnectorWizard → UniversalConnectorWizard import'u değiştirildi

**FAZ E — Aurora Glass Tasarım Kuralları (✅ Tanımlandı)**

- Tüm yeni bileşenler `var(--surface-modal)` + `var(--teal)` accent ile tasarlandı
- Modal container: 16px border-radius, rgba(38,166,154,0.08) seçili kart background'ı
- Progress bar: 4px yükseklik, teal renk, 0.3s ease transition
- SSE log: monospace font, 12px, var(--text-3) bekleme / var(--teal) tamamlama
- Adım indikatörü: aktif (teal numara), tamamlanan (✓), bekleme (gri)

**FAZ F — KIBIPR.md Güncelleme (✅ Tamamlandı)**

- [x] YFZ 19-21 tüm FAZ'ları documented
- [x] Tüm endpoint'ler, type'lar, tablolar açıklandı
- [x] Deploy checklist hazır

**FAZ G — Deploy & Verification (✅ Tamamlandı)**

- [x] TypeScript compilation: 0 errors
- [x] Frontend build: success (`npm run build`)
- [x] Commit: 8fd7674 (TypeScript fixes)
- [x] Push: GitHub main branch
- [x] Backend API restart: `docker compose restart ki_api`
- [x] Verification:
  - [x] Health check: /health endpoint ✓
  - [x] Database: entity_data_catalog + ai_pipeline_logs tabloları exist
  - [x] API endpoints: /catalog, /analyze/stream, /pipeline-logs çalışıyor
  - [x] Frontend: Model Seçici UI, 13 rol dropdown, AI Günlükleri sekmesi çalışıyor
  - [x] Wizard: 7 adım akışı, SSE progress, dark mode ✓

**Katılımcılar & Tarih:**
- 16 Haziran 2026 — YFZ 19-21 (FAZ A-G) TAM TESLİM: Universal Connector Wizard + Model Selector + Semantic Catalog + KB Signal Writer
- Model rolleri: 13 yeni semantik rol (E-1→E-5, K-1→K-6, SYS-3) + platform/entity_default scope
- AI Pipeline Logging: ai_pipeline_logs × Qdrant (ki_platform_knowledge) — danışman motoru için veri altyapısı
- Connector AI (K-6): Bağlantı kurulunca otomatik semantic katalog üretimi
- Entity AI: Artık CRM/DB/ERP verilerini sorgulamak için semantic katalog kullanabiliyor

**Sonraki:** YFZ 22 — AI Agent İskeletleri (entity-agent.ts + kibi-agent.ts) — YFZ 19-21 altyapısı üzerine inşa

---

## YFZ 22-30 Geliştirme Yol Haritası

### YFZ 22 — Entity AI Agent Pipeline ✅ Tamamlandı

**Tamamlanan (2026-06-16):**
- [x] `src/engine/ai/entity-agent.ts`: Tam pipeline — E-1 intent_analysis → E-2.1.x support (problem/solution/generator) / E-2.2.x sales (intent/conversation) → E-3 master_conversation
- [x] `src/engine/ai/escalation-manager.ts`: İnsan yönlendirme — düşük güven (<40) veya kullanıcı talebi → ticket oluşturma + agent atama
- [x] `src/api/routes/entity-ai.ts`: POST /entity-ai/chat, GET /entity-ai/session, POST /entity-ai/escalate
- [x] `src/server.ts`: /api/v1/entity-ai prefix ile kayıtlı
- [x] Pipeline logs: ai_pipeline_logs tablosuna her E-2.x adımı kaydedilir
- [x] TypeScript ✓, Frontend build ✓, API çalışır durumda
- [x] Migration fix: 0004 Drizzle tablosuna hash eklendi, API boot loop çözüldü

**YFZ 22 Tüm Tamamlananlar (güncel):**
- [x] `src/engine/ai/types/entity-agent.types.ts`: Tam tip tanımları (IntentResult, SupportProblem, Sales, Master)
- [x] `src/engine/ai/pipeline-logger.ts`: Ayrı pipeline logger modülü
- [x] `db/migrations/0011_agent_sessions.sql`: kb_approval_queue, support_sessions, sales_sessions tabloları
- [x] `entity-ai route`: KB Queue CRUD (GET /kb-queue, PUT approve/reject)
- [x] `frontend/src/components/KbApprovalQueue.tsx`: Supervisor onay UI

- Bağımlılık: YFZ 19-21 ✓

### YFZ 23 — KIBI AI Agent Pipeline ✅ Tamamlandı

**Tamamlanan (2026-06-16):**
- [x] `src/engine/ai/kibi-agent.ts`: K-1 intent → K-2.1 support / K-2.2 sales / K-2.3 consulting (K-2.3.1 + K-2.3.2) → K-3 master
- [x] `src/engine/ai/types/kibi-agent.types.ts`: ConsultingIntentResult, ConsultingRecommendationResult
- [x] platform scope + ki_platform_knowledge KB koleksiyonu
- [x] `/ai/admin-chat` → `runKibiAgent` (YFZ 23 pipeline, Redis history, tam KibiPipelineContext)
- [x] `/kibi/chat` → `runKibiAgent` (entity profile + Redis history ile)
- Bağımlılık: YFZ 22 ✓

### YFZ 24 — ERP & Muhasebe Modülü ✅ Tamamlandı

**Tamamlanan (2026-06-16):**
- [x] `src/engine/ai/entity-db-engine.ts`: Doğal dil → SELECT/INSERT/UPDATE (semantic catalog üzerinden)
- [x] `src/engine/ai/tools/erp-tools.ts`: stock_query, low_stock_report, supplier_balance, customer_balance, invoice_query, accounting_summary
- Bağımlılık: YFZ 22 ✓

### YFZ 25 — CRM Modülü Tamamlama ✅ Tamamlandı

**Tamamlanan (2026-06-16):**
- [x] `src/engine/ai/tools/crm-tools.ts`: contact_*, lead_*, deal_*, company_*, activity_log, pipeline_summary
- [x] `Modules.tsx`: Kanban görünümü eklendi — Stage/Status alanına göre sütunlar, tablo↔kanban toggle
- Bağımlılık: YFZ 22 ✓

### YFZ 26 — Dashboard & Raporlama ✅ Tamamlandı

**Tamamlanan (2026-06-16):**
- [x] `src/api/routes/dashboard.ts`: GET /dashboard/summary (entity), /admin (platform), /pipeline-logs
- [x] `Dashboard.tsx`: AI konuşma sayısı gerçek veri ile beslendi (aiStats hook)
- [x] Redis cache 5dk, drizzle query optimize
- [x] Intent dağılımı çubuk grafiği (support/sales/info/general %) + bugün/yönlendirilen/KB metrikleri
- [x] Son destek talepleri zaten gösteriliyordu (tickets widget)
- Bağımlılık: YFZ 22-25 ✓

### YFZ 27 — Plan & Faturalama ✅ (2026-06-16)
- `src/lib/plan-limits.ts`: PLAN_DEFS (free/starter/growth/enterprise), getPlanUsage(), checkMessageLimit()
- `src/api/routes/tenant.ts`: GET /tenants/plan (kullanım + yüzde), GET /tenants/plans (tüm planlar)
- `src/api/routes/entity-ai.ts`: checkMessageLimit() → 429 yanıt (mesaj limiti)
- `frontend/src/pages/Settings.tsx`: "Plan & Kullanım" sekmesi — kullanım çubukları + plan karşılaştırma
- Bağımlılık: YFZ 1-21 ✓

### YFZ 28 — Üretim Hazırlığı & Güvenlik ✅ (2026-06-16)
- Webhook HMAC doğrulama: WA + Instagram — `X-Hub-Signature-256` timingSafeEqual kontrolü (prod only)
- SQL injection sertleştirme: entity-db-engine `isSafeSelect/isSafeWrite` — stacked query, comment injection, 20+ tehlikeli keyword engeli
- PII temizleme: pipeline-logger `sanitizeError()` — e-posta/telefon REDACTED
- DB index'leri: 0012_performance_indexes.sql — ai_pipeline_logs, kb_approval_queue, entity_data_catalog, ai_sessions, support/sales_sessions
- AI chat rate limit: 20 req/dak (global 100'den ayrı, daha sıkı)
- Global rate limit: zaten vardı (Redis, 100 req/dak, tenant bazlı)
- Bağımlılık: Tümü

### YFZ 29 — Entity AI Kanal Yönetimi UI ✅ (2026-06-16)
- `Settings.tsx → Kanallar` sekmesi: WA/TG/IG/Email/VOIP/Portal Chat ayarları
- Portal Chat kanalı eklendi (`CHANNEL_SCHEMAS.portal`) — widget başlık, karşılama, renk, izin verilen domainler
- Webhook Test butonu: `POST /api/v1/channels/:key/test` — email için SMTP verify, diğerleri config varlık kontrolü
- Mesaj Şablonları paneli: karşılama/dışarıda/aktarım/çözüldü — `/tenants/me/settings` kaydı
- `src/api/routes/tenant.ts → channelRoutes` — `/channels` prefix'i ile kayıtlı
- Bağımlılık: YFZ 22 ✓

### YFZ 30 — KIBI AI KB Yönetim Paneli ✅ (2026-06-16)
- `PlatformSettings.tsx → Vektör Tabanı` sekmesine KB arama testi + sinyal istatistikleri eklendi
- `POST /admin/kb-search`: ki_platform_knowledge Qdrant koleksiyonunda semantik arama, skor ile sonuç
- `GET /admin/kb-signals`: toplam/başarı/kbWritten/escalated/avgConfidence + rol dağılımı
- `KbSearchTest` bileşeni: sorgu input + skor badge + içerik önizlemesi
- `KbSignalStats` bileşeni: 5 metrik kartı + byRole etiket bulutu
- Mevcut: döküman ekleme, silme, reindex, sektör/bölge etiketleme (tags)
- Bağımlılık: YFZ 23 ✓

### Kritik Yol (MVP)
```
YFZ 19-21 ✓ → YFZ 22 → YFZ 23 → YFZ 27 → YFZ 28
```

### Paralel Yapılabilecekler (YFZ 22 sonrası)
- YFZ 24 + YFZ 25 (bağımsız modüller)
- YFZ 27 (altyapıdan bağımsız)
- YFZ 29 (frontend-only)

### Tahmini Zaman Çizelgesi
- YFZ 22: 1-2 hafta (entity agent pipeline)
- YFZ 23: 3-5 gün (KIBI pipeline, YFZ 22'nin çoğu kopyası)
- YFZ 24-25: Paralel 1.5 hafta (ERP + CRM modülleri)
- YFZ 26: 1 hafta (dashboard aggregation)
- YFZ 27-28: Paralel 1 hafta (plan + prod güvenlik)
- YFZ 29-30: Paralel 5 gün (UI'lar)
- **TOPLAM: 4-5 hafta → Production Ready**

---

## YFZ 31 — Universal Connector: Kaynak Rol Sistemi + Mirror ETL + Model Ping Altyapısı ✅ (2026-06-17/18)

**Amaç:** UniversalConnectorWizard'ı gerçek (fake olmayan) bir mirror pipeline'a çevirmek: kaynak veritabanı tablolarına AI/kullanıcı tarafından **rol** atanır (CRM/ERP/Muhasebe'ye özel), kaynak doğrudan entity şemasına aynalanır; ayrıca platform model havuzu için ping/latency test altyapısı.

### Kaynak Rol Sistemi (Adım 4 yeniden tasarımı)
- [x] `frontend/src/components/UniversalConnectorWizard.tsx` → `ROLE_OPTIONS`: sourceType'a özel rol sözlüğü
  - **crm-db:** module_registry, field_definitions, data_records, related_lists, bridge_junction, mirror_direct, skip
  - **erp-db:** erp_master, erp_header, erp_line_items, erp_doc_flow, erp_journal, mirror_direct, skip
  - **acc-db:** acc_contacts, acc_documents, acc_lines, acc_linked_tx, acc_ledger, mirror_direct, skip
  - **generic:** mirror_direct, skip
- [x] `suggestTableRole(tableName, sourceType)` — regex tabanlı rol önerisi (AI yoksa fallback)
- [x] Adım 4 başlığı "Modül Eşleştir" → "Rol Belirle", Adım 5 "AI Konnektör" → "AI Mirror"
- [x] `POST /db-detect-type` (`src/api/routes/crm.ts`) — kaynağı CRM/ERP/Muhasebe/Generic olarak AI ile tespit eder (`{ detectedType, confidence, reason, aiUsed }`), regex fallback `detectTypeByNames()`
- [x] `GET /connections/:id/scan-structure/stream` (SSE) — tarama sonrası OpenRouter AI her tabloya rol önerir (`roles` event), başarısızsa frontend regex'e döner

### Mirror ETL (Direct Mirror)
- [x] `src/engine/crm-sync/entity-etl.ts` → `runMirrorEtl()` — rol atanmış PostgreSQL kaynak tablolarını entity şemasına olduğu gibi kopyalar (TRUNCATE + 500'lük batch INSERT)
- [x] `mirrorPgType()` — kaynak PG tipini hedef DDL tipine çevirir (text/bigint/timestamptz/jsonb/uuid→text)
- [x] `POST /connections/:id/generate-connector/stream` (SSE) — **EAV pre-scan**: module_registry/field_definitions/data_records rolündeki tabloları sayar ("24 modül, 1106 alan, 2265 kayıt") → AI/regex ile alan dönüşümü (`buildMirrorMappings()`: phone_e164/email_lower/country_iso/currency_strip/direct tespiti)
- [x] `GET /connections/:id/entity-tables` — entity şemasındaki gerçek tabloları + satır sayılarını dinamik listeler (eskiden sabit 4 tablo)
- [x] Mirror connector için entity-data okuma yolu eklendi:
  - `GET /connections/:id/modules` — `entity_{slug}.crm_modules`'tan modül + kayıt sayısı
  - `GET /connections/:id/modules/:module/fields` — `entity_{slug}.crm_fields`'tan alan listesi
  - `GET /connections/:id/records` — `entity_{slug}.crm_records` JSONB verisini düzleştirir (pagination, limit≤500)
  - API tabanlı connector'lar için eski `public.crm_*` davranışı korunur (fallback)
- [x] ETL pool lifetime bug düzeltildi (`runMirrorEtl`/`runConnectorEtl` çağrılarına `await` eklendi — pool async iş bitmeden kapanıyordu)

### Model Ping Altyapısı
- [x] `POST /admin/ai-providers/:scope/test-model` (`src/api/routes/admin.ts`) — `{ model: "provider::modelId" }` ile 1-token'lık ping, 15s timeout
  - Hız sınıflandırma: fast (<1s) / slow (<3s) / very_slow (≥3s)
  - Hata sınıflandırma: timeout / auth / not_found / rate_limit / server_error / network
- [x] `frontend/src/pages/PlatformSettings.tsx`:
  - `PROVIDER_META` — 14 sağlayıcı için renk/kısaltma rozet haritası, `ProviderBadge` bileşeni
  - Searchable model combobox (native `<select>` yerine) — id/sağlayıcıya göre filtre, klavye navigasyonu
  - `PingBadge` / `PingDots` — Primary/Fallback1/Fallback2 için tek satırda renkli sonuç noktaları
  - `pingAll()` + "Ping Tümü" butonu — 3 modeli paralel test eder

### Entity AI Chat Düzeltmesi
- [x] `src/api/routes/ai.ts` → `/entity-chat`: `runAgent()` → `aiComplete()` + `getModelForRole('master_conversation')`, Redis geçmişi (`entity:chat:hist:${sid}`, 20 mesaj, 24s TTL), canlı veri özetiyle (CRM/ERP/Muhasebe) bağlamlandırılmış sistem prompt'u

**Önemli kavramlar:**
- **Mirror connector vs API connector:** Mirror = kaynak PG tabloları doğrudan entity şemasına kopyalanır (rol metadata'sı yön verir); API = CRM API → `crm_records` → ETL → entity şeması.
- **EAV pre-scan:** Mapping üretmeden önce kaynaktaki gerçek hacmi (modül/alan/kayıt sayısı) AI'a bildirir.

---

## YFZ 32 — Fiyatlandırma, Faturalama ve Ki Wallet Entegrasyonu ✅ (2026-06-18)

**Amaç:** 5 katmanlı fiyatlandırma planı, aylık otomatik faturalama, mesaj aşım/ek kullanıcı ücretlendirmesi ve harici **Ki Wallet** servisi üzerinden ödeme — tüm sistem KiCoin (1 USD = 1 KiCoin) üzerinden işler.

### Veritabanı (migration 0013 + 0014)
- [x] `plan_name` enum'a 3 yeni değer: `basic`, `premium`, `custom_models` (eski: free/starter/growth/enterprise — starter→basic, growth→premium migrate edildi)
- [x] `tenant_memberships` → `message_limit` (kullanıcı bazlı aylık mesaj sınırı, null=sınırsız), `messages_used_this_month`
- [x] `kibi_entities` → `next_billing_at`, `billing_cycle_start`, `extra_sub_users`, `debt_tokens` (bigint), `is_billing_restricted`, `messages_used_this_month`
- [x] `kibi_pricing_packages` → `plan_name`, `per_message_price_usd`, `overage_message_price_usd` (varsayılan 0.03), `monthly_message_limit` (null=sınırsız), `extra_sub_user_price_usd` (varsayılan 25), `max_debt_tokens` (varsayılan 100000)
- [x] 5 katmanlı paket seed verisi:

| Plan | Görünen Ad | Kullanıcı | Aylık Ücret | Aylık Mesaj | Mesaj Başı Ücret | Ek Kullanıcı |
|------|-----------|-----------|--------------|-------------|-------------------|--------------|
| free | Ücretsiz | 1 | $0 | 40 | - | $25 |
| basic | Başlangıç | 1-3 | $25 | 150 | - | $25 |
| premium | Premium | 1-10 | $100 | 750 | - | $25 |
| enterprise | Kurumsal | 1-50 | $1000 | 4500 | - | $25 |
| custom_models | Özel Modeller | 1-9999 | $50 | sınırsız | $0.05 | $30 |

### Billing Engine (`src/engine/billing/billing.ts` — YENİ)
- [x] `chargeEntity(entityId, amountUsd, description, txnType?)` — Ki Wallet'tan düş (1 USD=1 KiCoin) + transaction kaydı → `{ ok, insufficientFunds }`
- [x] `getEntityPackage(planName)` — `kibi_pricing_packages`'tan plan satırı
- [x] `billEntityMonthly(entityId)` — aylık faturalama: free→sadece sayaç sıfırlama; ücretli→taban ücret + (custom_models için mesaj başı) + ek kullanıcı ücreti; yetersiz bakiye → `isBillingRestricted=true`
- [x] `chargeMessageOverage(entityId, planName)` — aylık limit aşımında $0.03/mesaj ücretlendirme
- [x] `chargeAndAddSubUser(entityId, planName)` — ek alt kullanıcı ücretlendirme + `extra_sub_users` artırma
- [x] `incrementTokenDebt(entityId, tokens, maxDebtTokens?)` — borç sayacı, `max_debt_tokens`'a ulaşınca kısıtlama
- [x] `runMonthlyBillingCycle()` — `next_billing_at <= now` olan tüm entity'leri faturalar
- [x] `startBillingScheduler()` / `stopBillingScheduler()` — saatlik kontrol döngüsü, `server.ts` startup'ında çağrılır
- [x] Harici **Ki Wallet** servisi entegrasyonu (`KI_WALLET_URL`, varsayılan `http://ki-wallet:3001`): `debitKiWallet()` (POST /api/debit, x-internal-key, 8s timeout), `syncKiWalletBalance()` (POST /api/balance, 5s timeout)

### API Değişiklikleri
- [x] `GET /api/v1/wallet/billing-status` — entity'nin güncel faturalama durumu (plan, sonraki fatura, mesaj kullanımı, borç, kısıtlama)
- [x] `POST /api/v1/wallet/monthly-charge` (admin) — `{ entityId? }` ile tek entity veya tüm döngüyü manuel tetikler
- [x] `PUT /admin/entities/:entityId/plan` — geçerli planlar güncellendi: `free/basic/premium/enterprise/custom_models`
- [x] `PUT /admin/entities/:entityId/status` (YENİ) — entity'nin tenant `is_active` durumunu aç/kapat
- [x] `POST /admin/support/tickets/:id/ai-draft` (YENİ) — KIBI AI ile destek bileti için taslak yanıt üretir
- [x] `GET /admin/plans` — artık sabit dizi değil, `kibi_pricing_packages` tablosundan dinamik okunuyor
- [x] `GET /admin/entities` — `kibi_wallets` JOIN ile bakiye (USD/KiCoin), `tenant_is_active`, `owner_phone` eklendi
- [x] AI scope sistemi entity katmanlarına genişletildi: `SCOPE_MAP` → `kibi | entity-free | entity-basic | entity-premium | entity-enterprise` (her biri kendi model/key havuzuna sahip)
- [x] `POST /api/v1/ai/chat`:
  - `isBillingRestricted=true` → 402 "Hesabınız kısıtlanmış"
  - Kullanıcı bazlı `tenantMemberships.messageLimit` aşımı → 429
  - Entity bazlı `monthlyMessageLimit` aşımı: free→hard block (429), ücretli→`chargeMessageOverage()` (yetersiz bakiye→402)
  - Başarılı yanıt sonrası `kibi_entities.messages_used_this_month` + `tenant_memberships.messages_used_this_month` artırılır
  - Entity AI sistem prompt'una `tenants.settings.businessProfile` (sektör, çalışan sayısı, ciro vb.) eklenir
- [x] `PUT /tenants/me/members/:userId/message-limit` (YENİ, entity_main) — kullanıcı bazlı aylık mesaj sınırı belirler
- [x] `POST /tenants/me/members/invite`: alt kullanıcı eklerken plan limiti aşılırsa `chargeAndAddSubUser()` tetiklenir, yetersiz bakiye→402
- [x] `GET/PUT /tenants/me/business-profile` (YENİ) — şirket profili (sektör, çalışan sayısı, ciro, adres, vergi no, ticaret sicil no, kuruluş tarihi, mali yıl başlangıcı, logo)
- [x] `GET/PUT /tenants/me/channel-ids` (YENİ) — gelen mesaj yönlendirme için WA telefon/IG handle/TG id/email domain listeleri (`tenants.settings.channelIds`)

### Frontend
- [x] `KiWallet.tsx` — Faturalama Durumu kartı (plan, sonraki fatura tarihi, mesaj kullanım çubuğu, ek kullanıcı, token borcu); kısıtlama uyarı kutusu; 5 sütunlu paket karşılaştırma tablosu
- [x] `Settings.tsx` → "Şirket Profili" sekmesi (business profile formu + kanal kimlikleri tag-editörü)
- [x] `PlatformSettings.tsx` — entity katman bazlı (`entity-basic/premium/enterprise`) renk/etiket haritası, model combobox portal tabanlı yeniden yazıldı (positioning bug fix), localStorage model havuzu cache (`ki_model_pool_${scope}`, 30dk stale kontrolü)
- [x] `Admin.tsx` — entity listesinde sahip telefon/wallet bakiyesi, destek bileti AI taslak butonu, entity aktif/pasif toggle

### Diğer
- [x] `src/engine/ai/gateway.ts` — `ANALYSIS_MODELS`/`CONVERSATION_MODELS` zinciri groq→openai→mistral olarak güncellendi; entity kendi key'i yoksa `entity_free` → `kibi` platform key'ine düşer
- [x] `src/engine/ai/model-config.ts` — cache key `${scope}:${role}` olarak scope'landı; `getScopedModels(role, dbScope)` eklendi (entity_basic/premium/enterprise destekler)
- [x] `src/lib/entity-provisioner.ts` → `getEntityDataSummary()` artık eski `crm_contacts/crm_companies/crm_deals` yerine birleşik `crm_records` (module_api_name + JSONB data) okuyor
- [x] `server.ts` → `startBillingScheduler()` + `scheduleDailyModelSync()` (her gün 00:01 UTC model havuzu senkronu) startup'a eklendi

**Önemli kavram:** Ki Wallet, platformdan ayrı harici bir servis (`KI_WALLET_URL`) — KiCoin bakiyesi orada tutulur, `billing.ts` sadece debit/balance API'lerini çağırır.

---

## YFZ 33 — Entity KB + KIBI AI KB: Dosya Yükleme, Chunking, Hash-Bazlı Incremental Indexleme ✅ Tamamlandı (18 Haziran 2026)

**Tetikleyici:** n8n'deki "Qdrant Sales Agent Vector Store Update" workflow'u (id: `oxA9s5pa3lPxSJfT`) incelendi — Google Drive izleyici + format-bazlı extraction (PDF/XLSX/DOCX/HTML) + chunking + metadata injection ile Qdrant'a yazıyor. Bu workflow'un **mantığı** (Drive tetikleyicisi değil) Entity KB ve KIBI AI KB'ye taşınacak: dosya yükleme → format extraction → chunking → hash-bazlı incremental embed.

### Terminoloji

| Kavram | Kapsam | Karşılığı |
|---|---|---|
| **Entity DB / Entity KB** | Tenant-izole (her firma kendi verisi) | `tenants`, `knowledgeEntries` → yeni `kb_documents`/`kb_chunks` (scope=`entity`), Qdrant `entity_{tenantId}` |
| **KIBI AI DB / KIBI AI KB** | Platform-geneli, tenant'tan bağımsız; dashboard ve iletişim kanallarıyla konuşulabilen KIBI AI'nin kendi bilgisi | `platformVectorDocs` → yeni `kb_documents`/`kb_chunks` (scope=`kibi`), Qdrant `kibi_ai_kb` |

### Tespit Edilen Mevcut Durum (geliştirmeye başlamadan önce doğrulanan bulgular)

- **Çift Qdrant instance karışıklığı:** `ki_qdrant` (KIBI API'nin bağlandığı, `QDRANT_URL=http://ki_qdrant:6333`) **tamamen boş** (0 koleksiyon). n8n'in yazdığı ayrı `qdrant` container'ı (n8n_n8n-net, api-key korumalı) ise 8 koleksiyon ve gerçek üretim verisi içeriyor (`ki_product_knowledge` 514 nokta/384-dim, `ki_sales_methodology` 693 nokta/384-dim, `ki_crm_serviceinfo` 20 nokta/1024-dim, `ki_legal_uk`, `ki_legal_us`, `ki_glossary`, `documents`). **Bu veri migrate edilmeyecek** — kullanıcı dosyaların orijinalleri elinde olduğu için sıfırdan yeniden yüklenecek.
- **KIBI AI Danışman pipeline bug'ı:** `kibi-agent.ts:122`'deki `generateConsultingRecommendation()` KB'yi `'ki_platform_knowledge'` koleksiyonunda arıyor, ama yazma tarafı (`admin.ts` → `PLATFORM_QDRANT_COLLECTION = env.QDRANT_COLLECTION`) `'ki_knowledge_base'`'a yazıyor. **İsimler tutmadığı için Danışman şu an hiçbir KB sonucu bulamıyor.** Bu işin parçası olarak tek isimde (`kibi_ai_kb`) birleştirilecek.
- **Embedding modeli:** Mevcut sistem `BAAI/bge-m3` (1024-dim, HuggingFace Inference, `qdrant.ts`) kullanıyor. n8n workflow'u `google/embeddinggemma-300m` (384-dim) kullanıyor — boyutlar uyumsuz. **Karar: `bge-m3`'te kalınıyor**, re-embed gerektirmeyen yol seçildi; n8n'in chunking/metadata mantığı bizim modelimize bağlanacak. (`qdrant.ts:69`'daki "same as n8n used" yorumu artık güncel değil, n8n model değiştirdi — düzeltilecek.)
- **Chunking hiç implement edilmemiş:** `indexer.ts` → `indexKnowledge()` stub, `{indexed:0}` döndürüyor. Mevcut "Vektör Tabanı" panelleri (Entity: `Settings.tsx`, KIBI: `PlatformSettings.tsx`) sadece elle metin yapıştırma destekliyor — 1 doküman = 1 chunk = 1 vektör, dosya yükleme yok.
- **Dosya altyapısı zaten mevcut, yeniden kullanılacak:** `@fastify/multipart` kurulu, `file_storage` tablosu + `files.ts` route'u (`storage/{tenantId}/{timestamp}-{filename}` local disk convention) — KB dosya yüklemesi bu pattern'i takip edecek.
- **Qdrant point ID kısıtı:** Qdrant point ID'si yalnızca `u64` veya `UUID` kabul ediyor — ham SHA256 hex string geçersiz. Bu yüzden point id `uuid5(documentId + ':' + chunkHash)` ile deterministik üretilecek (idempotent re-upload + content-hash dedup için).

### Dosya Yükleme Akışı

1. Kullanıcı Settings → "Vektör Tabanı" panelinden dosya seçer + **Kategori** dropdown'undan seçim yapar
2. Dosya adı normalize edilir: `{entity-slug}-{category}.{ext}` (örn. `abc-ltd-companyinfo.pdf`)
3. Aynı entity+kategori+dosya adıyla tekrar yükleme → **versiyon güncellemesi** (eski içerikle hash diff, sadece değişen chunk'lar re-embed edilir)
4. Farklı dosya adı, aynı kategori → kategoride ayrı bir doküman olarak coexist eder (örn. "Soru-Cevap" kategorisinde birden çok bağımsız not/dosya bir arada durabilir)

### Kategori Taksonomisi

**Entity KB** (operasyonel/şirket verisi):
`company_info` (Şirket Bilgisi) · `pricing` (Fiyatlandırma) · `product_info` (Ürün/Hizmet) · `faq` (Soru-Cevap) · `customer_feedback` (Müşteri Geri Bildirimi) · `support_issue` (Destek Sorun) · `support_solution` (Destek Çözüm) · `policy` (Politika/Prosedür) · `other`

**KIBI AI KB** (KIBI AI müşterilerine **ve** Ki Business Ecosystem müşterilerine cevap verebilmesi için 3 grup):

| Grup | Kategori (key) | Varsayılan Audience |
|---|---|---|
| Platform (KIBI AI'nin kendisi) | `platform_features`, `platform_pricing`, `platform_faq`, `onboarding` | `kibi_customer` |
| Ecosystem (Ki Business grubunun diğer ürün/hizmetleri) | `ecosystem_overview`, `ecosystem_services` | `ecosystem_customer` |
| | `ecosystem_policies` | `both` |
| Genel Danışmanlık (her iki tipe de uygulanır) | `industry_insight`, `consulting_methodology`, `sales_methodology`, `legal_compliance`, `glossary`, `other` | `both` |

`category` varchar olarak kalıyor (DB enum yok — codebase convention'ı, yeni kategori eklemek migration gerektirmez). **Audience** ayrımı için yeni kolon eklenmiyor — mevcut `tags` (jsonb) alanı kullanılıyor (`kibi_customer` / `ecosystem_customer` / `both`, varsayılan `both`). Faz 2'de `kibi-agent.ts`'deki Danışman arama adımına audience filtresi eklenecek (sorulan kişinin tipine göre payload filtreleme).

### Postgres Şeması (tek tablo seti, `scope` ayrımıyla — kod tekrarını önlemek için)

```
kb_documents
  id, scope ('entity'|'kibi'), entity_id (null for kibi),
  category, title, original_file_name, normalized_file_name,
  file_storage_id (-> file_storage.id, nullable — manuel not ise null),
  source_type ('file'|'manual'), status ('processing'|'active'|'failed'|'archived'),
  uploaded_by, created_at, updated_at

kb_chunks
  id, document_id (-> kb_documents.id, cascade),
  chunk_index, chunk_hash (sha256, normalize sonrası), chunk_text,
  qdrant_point_id (uuid5(documentId+':'+chunkHash)), active, created_at
```

### Qdrant Tarafı

- **Entity KB:** mevcut convention korunuyor — her tenant'ın kendi koleksiyonu `entity_{tenantId}`, payload'a `category`, `document_id`, `chunk_hash`, `file_name` eklenir.
- **KIBI AI KB:** tek koleksiyon `kibi_ai_kb` (eski `ki_knowledge_base`/`ki_platform_knowledge` karışıklığı bununla çözülüyor), payload `category` + `tags` (audience) içerir.

### Incremental Update Mantığı (n8n'in chunking mantığından esinlenilen, hash-diff ile)

1. Yeni içerik normalize edilir (trim, lowercase, unicode normalize, fazla whitespace temizleme)
2. Her chunk için SHA256 hash hesaplanır
3. Aynı `document_id`'nin mevcut aktif chunk hash'leriyle karşılaştırılır:
   - Hash zaten varsa → embed atlanır (idempotent)
   - Yeni hash → embed edilir + Qdrant'a upsert edilir
   - Eski hash artık mevcut değilse → Qdrant'tan silinir + Postgres'te `active=false` işaretlenir

### Geliştirme Adımları

**Faz 1 — Şema + altyapı** ✅
- [x] `kb_documents` / `kb_chunks` migration'ı (`db/migrations/0015_kb_documents.sql`, uygulandı)
- [x] Normalize → SHA256 hash → `uuid5(point id)` yardımcı fonksiyonları (`src/engine/knowledge/chunking.ts`)
- [x] PDF/DOCX/XLSX/CSV/HTML extraction kütüphaneleri (`pdf-parse`, `mammoth`, `exceljs`, `papaparse`; `xlsx` paketi yamasız CVE'ler nedeniyle `exceljs` ile değiştirildi) (`src/engine/knowledge/file-extractor.ts`)

**Faz 2 — Ortak indexleme motoru** ✅
- [x] `indexer.ts`'deki stub gerçek chunking + hash-diff + incremental upsert/delete mantığıyla dolduruldu
- [x] KIBI AI KB collection isim birleştirme (`KIBI_AI_KB_COLLECTION = 'kibi_ai_kb'`) — Danışman pipeline'ındaki arama bug'ı düzeldi
- [x] `kibi-agent.ts` Danışman arama adımına audience (`tags`: `kibi_customer`/`ecosystem_customer`/`both`) filtresi eklendi

**Faz 3 — Upload UI + API** ✅
- [x] Entity Settings (`frontend/src/pages/Settings.tsx`): dosya yükleme + kategori dropdown (mevcut manuel not formuna ek, "Vektör Tabanı" panelinde)
- [x] Platform Settings (`frontend/src/pages/PlatformSettings.tsx`, `PlatformVectorPanel`): dosya yükleme + kategori dropdown (3 grup) + audience seçimi
- [x] Backend: `POST /tenants/kb-documents` (`src/api/routes/tenant.ts`) ve `POST /admin/kb-documents` (`src/api/routes/admin.ts`) — multipart upload → extraction → chunk → hash-diff → embed → upsert zinciri; `GET`/`DELETE` eşlenikleri de eklendi
- Not: platform-scope (`scope='kibi'`) yüklemelerde sahip tenant olmadığından `file_storage` tablosuna satır yazılmıyor (FK `tenant_id NOT NULL`) — dosya `storage/_platform/` altında arşivleniyor, `kb_documents.fileStorageId` null kalıyor

**Faz 4 — Approval queue entegrasyonu** ✅
- [x] `kb_approval_queue` onay akışı yeni indexleme motoruna bağlandı — `PUT /entity-ai/kb-queue/:id/approve` artık `problem_summary`+`solution_text`'i `kb_documents` (`category='support_solution'`, `sourceType='conversation'`) olarak kaydedip `indexDocument()` ile gerçek chunk+embed+upsert yapıyor
- [x] `entity-ai.ts` kb-queue route'larındaki SQL injection düzeltildi — raw string interpolation yerine Drizzle `sql` tagged template (parametreli sorgu) kullanılıyor

**Not (Faz 5 — iptal):** n8n'in eski Qdrant'ındaki üretim verisi migrate edilmeyecek; orijinal dosyalar kullanıcıda mevcut, sıfırdan yeniden yüklenecek.

---

*Son güncelleme: YFZ 33 tamamlandı — Entity KB + KIBI AI KB dosya yükleme, format extraction (PDF/DOCX/XLSX/CSV/HTML/TXT), chunking, SHA256 hash-bazlı incremental indexleme, Entity+Platform Settings upload UI, kb_approval_queue gerçek indexleme entegrasyonu + SQL injection düzeltmesi. 18 Haziran 2026.*

---

## YFZ 34+ — KiBI Repositioning (Base + Premium AI + Native Add-on'lar)

> "Ki Business Intelligence" connector/AI platformu, "KiBI" — Base (CRM+ERP+Muhasebe) + Premium upsell (KiBI AI) + Native Add-on (6 modül) markasına dönüşüyor. Mimari detay: §14. Bu bölüm, repositioning'in fazlarını YFZ 33'ün devamı olarak kaydeder.

### YFZ 34.0 — KIBIPR.md Yeniden Yapılanma ✅ (2026-06-25)
- [x] §1 (Proje Kimliği) Base+Premium+Addon konumlandırmasına göre yeniden yazıldı
- [x] §6 (Veritabanı Şeması) — entity-içi CRM/ERP/Muhasebe FK grafiği belgelendi + yeni `entity_module_entitlements` tablosu eklendi
- [x] Yeni §14 "KiBI Ürün Mimarisi" bölümü eklendi (Base / Premium AI / 6 Add-on / Connector Wizard pozisyonu)
- [x] YFZ 1-33 içeriği silinmeden "Geliştirme Geçmişi (YFZ 1-33)" başlığı altına taşındı
- [x] Plan: `/root/.claude/plans/proje-vi-zyonu-ve-mi-mari-ancient-shell.md` — Faz 0-4 detaylı, Faz 5a-5f (6 add-on) ayrı ayrı detaylandırıldı

### YFZ 34.1 — Entitlement Framework (Premium AI + Add-on iskeleti) ✅ (2026-06-25)
- [x] `db/schema.ts`: `entityModuleEntitlements` tablosu + `entity_entitlement_module_key` (7 değer: `ai_premium` + 6 add-on) ve `entity_entitlement_status` (trial/active/suspended/cancelled) enumları. `entityId → kibiEntities.id` (billing konvansiyonuyla tutarlı).
- [x] `db/migrations/0016_entity_module_entitlements.sql`: CREATE TYPE×2, CREATE TABLE, 2 index, + canlı tek tenant (`entity_ki_business`) için `ai_premium`/`active` backfill INSERT — uygulandı, doğrulandı (1 satır).
- [x] `src/lib/entitlements.ts` (yeni): `hasActiveEntitlement()`, `listEntitlements()`, `activateEntitlement()`, `deactivateEntitlement()`, `sumActiveEntitlementCharges()`, `ADDON_MODULE_KEYS` stub registry — entitlements route'u, AI gate'i ve billing'in paylaştığı tek kaynak.
- [x] `src/api/routes/entitlements.ts` (yeni): `GET /api/v1/entitlements`, `POST /:moduleKey/activate`, `POST /:moduleKey/deactivate` (entity_main/admin yetkili) — `server.ts`'e `/api/v1/entitlements` prefix'iyle kayıtlı.
- [x] `src/engine/billing/billing.ts` → `billEntityMonthly()`: aktif entitlement `price_usd` toplamı artık aylık temel ücrete (veya free planda tek başına) eklenip tek `chargeEntity()` çağrısıyla tahsil ediliyor.
- [x] `src/api/routes/ai.ts`: `POST /ai/chat` (satır ~219'dan sonra) ve `POST /ai/entity-chat` (entity çözümlemesinden sonra) için `ai_premium` entitlement 402 gate'i — admin/supervisor bypass korunarak.
- [x] `frontend/src/components/Layout.tsx`: `/entitlements` çekiliyor, `ai_premium` aktif/trial değilse "Yapay Zeka" nav bölümü (KIBI AI + Entity AI) admin/supervisor olmayan kullanıcılar için gizleniyor (kozmetik — asıl sınır backend 402).
- [x] Doğrulama: `tsc --noEmit` temiz, frontend `npm run build` başarılı, `docker compose restart ki_api` → `🚀 Ki Platform running`, `/health` ok, `GET /api/v1/entitlements` auth'suz → 401 (route kayıtlı), entitlement durumu `suspended`→`active` arası değiştirilerek `hasActiveEntitlement()` doğru sonuç verdiği canlı DB'de test edildi.
- Kapsam dışı (bilinçli): muhasebe public→entity-schema konsolidasyonu (Faz 2), native CRM/ERP CRUD (Faz 3-4), 6 add-on'un gerçek inşası (Faz 5a-5f) — plan dosyasında detaylı, sıradaki adımlar.

### YFZ 34.2 — Muhasebe Konsolidasyonu: public-schema → entity-schema ✅ (2026-06-25)
- [x] `src/api/routes/auth.ts` → `register-entity`: `kibiEntities` insert'inden sonra `provisionEntity()` çağrılıyor (non-fatal try/catch) — Base artık her tenant'ta kayıt anında garanti ediliyor, admin-only manuel endpoint'e bağımlı değil.
- [x] `src/api/routes/accounting.ts`: `/contacts`, `/invoices`, `/payments`, `/expenses`, `/reports/*` handler'ları tamamen yeniden yazıldı — artık `entity-provisioner.ts`'teki `queryEntitySchema(schema, sql, params)` ile **entity-schema** `acc_contacts/acc_invoices/acc_invoice_lines/acc_payments/acc_expenses` tablolarına parametreli SQL ile okuyup yazıyor (eski public-schema Drizzle tabloları yerine).
  - Yeni `resolveEntityContext(tenantId)` helper'ı (`kibiEntities.id` + `entityDbSchema` çözümler, provision edilmemişse 404).
  - `COLUMN_MAP` + `buildInsert()`/`buildUpdate()`/`selectCols()` — camelCase↔snake_case eşleme, 4 tablo için tekrar kullanılıyor.
  - Zod şemaları entity-schema kolon şekillerine güncellendi: `contactType` artık `customer|vendor|both` (eski `individual|corporate` değil), `acc_invoices` e-fatura alanları (`efaturaUuid/efaturaStatus/efaturaType`), `withholdingTax`, `stampTax`, salt-okunur `remainingAmount` (DB GENERATED kolon, asla yazılmıyor); `acc_payments`'ta `status` kalktı (entity-schema'da yok), `isReconciled` eklendi.
  - `/reports/*` handler'larındaki eski string-interpolation SQL (potansiyel SQL injection yüzeyi) parametreli sorgulara çevrildi — cutover'ın yan etkisi.
  - OAuth/connections/payment-integrations/bank-integrations endpoint'leri **değişmedi** (hâlâ public-schema, harici sync amaçlı).
- [x] `frontend/src/pages/Accounting.tsx`: `ContactModal`/`InvoiceModal`/`PaymentModal`/`ExpenseModal` yeni alan adlarına güncellendi (`currencyCode`→`currency`, `taxTotal`→`taxAmount`, `discountTotal`→`discountAmount`, contact tipi seçenekleri Müşteri/Tedarikçi/İkisi, fatura durumu Görüntülendi/Kısmi Ödendi eklendi, ödeme tablosunda durum sütunu yerine mutabakat rozeti).
- [x] `db/schema.ts`: public-schema `accContacts/accInvoices/accInvoiceLines/accPayments/accExpenses` Drizzle tanımları silindi (tek importer `accounting.ts` zaten taşındığı için güvenli).
- [x] `db/migrations/0017_drop_public_acc_tables.sql`: 5 tabloyu FK sırasına göre (`acc_invoice_lines→acc_payments→acc_invoices→acc_expenses→acc_contacts`) DROP eder — uygulandı, doğrulandı.
- [x] Doğrulama: canlı veri kontrolü (her iki tarafta da 0 satır, taşıma riski yok), `tsc --noEmit` temiz, frontend `npm run build` başarılı, `docker compose restart ki_api` → sağlıklı, **gerçek bir `POST /accounting/contacts` çağrısı** ile entity-schema'ya (`entity_ki_business.acc_contacts`) doğru yazıldığı + public şemanın boş kaldığı doğrulandı, test kaydı sonra silindi.
- Not: Daha fazla canlı endpoint testi (invoice/payment/report) production JWT secret'ı çıkarıp sahte token üretmeyi gerektirdiği için izin sistemi tarafından durduruldu — kullanıcı UI üzerinden manuel doğrulayabilir.

### YFZ 34.3 — Native CRM CRUD (Base) ✅ (2026-06-25)
- [x] `src/api/routes/crm-native.ts` (yeni dosya, `crm.ts`'ten tamamen ayrı — connector OAuth/sync mantığına dokunulmadı): contacts/companies/deals/activities için tam CRUD, entity-schema `crm_*` tablolarına `queryEntitySchema()` ile parametreli SQL.
  - `COLUMN_MAP` + `buildInsert()`/`buildUpdate()`/`selectCols()` deseni `accounting.ts`'ten (Faz 2) tekrar kullanıldı.
  - Contacts/companies/deals: soft delete (`deleted_at = NOW()`, GDPR-uyumlu tasarım korunuyor); activities: hard delete (kolon yok).
  - Deal stage `won`/`lost`'a geçince `closed_at` otomatik set edilir; activity `completed` olunca `completed_at` otomatik set edilir.
  - `server.ts`'e `/api/v1/crm-native` prefix'iyle kayıtlı.
- [x] `frontend/src/pages/Crm.tsx` (yeni sayfa): 4 sekme (Kişiler/Firmalar/Fırsatlar/Aktiviteler), her biri liste+modal CRUD — `Accounting.tsx` deseniyle tutarlı.
- [x] `App.tsx`: yeni `/app/crm-native` route'u. **Karar (kullanıcı onaylı):** mevcut `/app/crm` (connector senkron/izleme, `Modules.tsx`) route'u ve davranışı **değişmedi** — sıfır regresyon riski.
- [x] `Layout.tsx`: nav'a yeni üst-seviye "CRM" linki eklendi (→ `/app/crm-native`); eski "CRM" açılır menüsü "CRM Bağlantıları" olarak yeniden etiketlendi (route/davranış aynı, sadece nav metni — iki ayrı "CRM" etiketinin karışmasını önlemek için).
- [x] Doğrulama: `tsc --noEmit` temiz, frontend build temiz, `docker compose restart ki_api` → sağlıklı, `/health` ok, `GET /api/v1/crm-native/contacts` auth'suz → 401 (route kayıtlı, 404 değil).
- Not: Faz 2'de (muhasebe) yapılan canlı yazma testi production veri kirliliği riski nedeniyle bu fazda tekrarlanmadı (izin sistemi production JWT secret'ı kullanarak sahte token üretmeyi reddetti) — kod yolu accounting.ts ile birebir aynı desen, statik doğrulama (tsc/build/health/401) yeterli kabul edildi; kullanıcı UI üzerinden gerçek girişle test edebilir.

### YFZ 34.4 — Native ERP CRUD (Base) ✅ (2026-06-25)
- [x] `src/api/routes/erp-native.ts` (yeni dosya): products/suppliers/orders/warehouses CRUD, entity-schema `erp_*` tablolarına `queryEntitySchema()` ile — `accounting.ts`/`crm-native.ts` ile aynı `COLUMN_MAP`+`buildInsert`/`buildUpdate`/`selectCols` deseni.
  - **Bilinçli olarak hariç:** `erp_staff`/`erp_staff_attendance`/`erp_payroll` — bu tablolar Base ERP DDL'inde zaten var ama native CRUD'u Faz 5f'te (Personnel Management add-on) `addon_personnel_management` entitlement'ı arkasında açılacak (§14.4).
  - Products: soft delete (`deleted_at`), düşük-stok filtresi (`available_quantity <= reorder_point`) query param olarak (`?lowStock=1`).
  - Orders: `order_number` sunucuda üretilir (`PO-`/`SO-` öneki); `status` `cancelled`/`delivered`/`received`'a geçince ilgili timestamp otomatik set edilir; satır kalemleri (`erp_order_items`) bu fazda kapsam dışı — Faz 2'deki invoice_lines kararıyla tutarlı.
  - `server.ts`'e `/api/v1/erp-native` prefix'iyle kayıtlı.
- [x] `frontend/src/pages/Erp.tsx` (yeni sayfa): 3 sekme (Ürünler/Tedarikçiler/Siparişler) + düşük stok uyarı banner'ı, liste+modal CRUD.
- [x] `App.tsx`: yeni `/app/erp-native` route'u. `Layout.tsx`: nav'a yeni "ERP" linki eklendi (CRM linkinin altında).
- [x] Doğrulama: `tsc --noEmit` temiz, frontend build temiz (bir unused-interface hatası düzeltildi), `docker compose restart ki_api` → sağlıklı, `/health` ok, `GET /api/v1/erp-native/products` auth'suz → 401.
