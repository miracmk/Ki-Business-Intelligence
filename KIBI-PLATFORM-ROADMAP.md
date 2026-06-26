# KiBI Platform Roadmap — Agentic Operating System

> **Bu dosya Claude Code'a verilmek üzere yazılmıştır.** Hedef: KiBI'yi statik CRUD'dan,
> Salesforce/Zoho/Attio seviyesinde **metadata-driven + custom scripting + workflow** bir
> PaaS + No-Code platforma dönüştürmek. Repo: `miracmk/Ki-Business-Intelligence`.

---

## 0. Bağlam ve Kurallar (Claude Code önce bunu oku)

### Mevcut Mimari (DEĞİŞTİRİLMEYECEK, ÜZERİNE İNŞA EDİLECEK)
- **Multi-tenant model:** Tenant başına izole PostgreSQL şeması: `entity_{slug}`.
  Provisioning `src/lib/entity-provisioner.ts` → `provisionEntity()` →
  `db/entity-schema-template.sql` içindeki `":schema"` substitution ile çalışır.
  Ayrıca Qdrant collection `entity_{slug}` + Redis prefix `ent:{slug}:` oluşturur.
- **Kontrol düzlemi (control plane):** Merkezi tablolar (`kibi_entities`, model katalog, billing)
  Drizzle ile yönetilir → `db/schema.ts`. CRM/ERP tabloları **kasıtlı olarak Drizzle'da DEĞİL**;
  `queryEntitySchema(schema, sql, params)` ile raw parametreli SQL üzerinden erişilir.
- **CRUD pattern (KORUNACAK):** Her native route dosyası şu yapıyı kullanır:
  - Statik Zod şemaları (`contactSchema`, `dealSchema` vb.)
  - Statik `COLUMN_MAP` (camelCase → snake_case eşlemesi)
  - `buildInsert()` / `buildUpdate()` helper'ları
  - `resolveEntityContext(tenantId)` → `kibiEntities` lookup → `{entityId, schema}` döner
  - Route guard: `app.authenticate`, `tenantId` `req.user`'dan okunur
- **Native route dosyaları:** `crm-native.ts`, `erp-native.ts`, `accounting.ts`,
  `personnel-native.ts`, `ecommerce-native.ts`, `marketing-native.ts`,
  `fulfillment-native.ts`, `event-native.ts`.
- **AI altyapısı (HAZIR):** `src/engine/ai/gateway.ts` (provider routing), `kibi-agent.ts`,
  `entity-agent.ts`. Qdrant client mevcut.
- **Stack:** Fastify ^4.27, drizzle-orm ^0.30.10, pg, ioredis, Zod, argon2, jose/JWT.
  Frontend: React + Vite + Tailwind. **BullMQ YOK — eklenecek.**

### Entity şema tabloları (entity-schema-template.sql içinde mevcut)
`entity_settings`, `crm_contacts`, `crm_companies`, `crm_deals`, `crm_activities`,
`erp_products`, `erp_stock_movements`, `erp_warehouses`, `erp_suppliers`, `erp_orders`,
`erp_order_items`, `erp_staff`, `erp_staff_attendance`, `erp_payroll`, `acc_contacts`,
`acc_invoices`, `acc_invoice_lines`, `acc_payments`, `acc_expenses`, `acc_bank_accounts`,
`acc_bank_transactions`, `acc_chart_of_accounts`, `support_sla_policies`, `support_tickets`,
`support_ticket_messages`, `erp_couriers`, `erp_shipments`, `erp_warehouse_picks`,
`erp_marketplace_connections/listings/orders`, `crm_email_campaigns`, `crm_social_posts`,
`erp_event_venues/events/event_tickets/event_registrations`.

### Kritik Repo Gerçekleri
1. **`custom_fields JSONB DEFAULT '{}'` TÜM ana tablolarda ZATEN VAR** (crm_contacts/companies/deals,
   erp_products vb.). JSONB extensibility yarı tamam.
2. **GIN index YOK** — `custom_fields` aranabilir değil.
3. **`kibi_modules` / `kibi_fields` registry YOK** — `COLUMN_MAP` el ile bakım gerektiriyor, ölçeklenmiyor.
4. **`owner_id` YOK** — sadece `assigned_to_user_id` var, record-level security konsepti yok.
5. Tenant izolasyonu + Qdrant + Redis prefix = granüler güvenlik temeli HAZIR.

### Değişmez Mimari Kararlar
- **Native route + raw SQL pattern KORUNACAK, generic metadata-CRUD engine ile DEĞİŞTİRİLMEYECEK.**
  (`crm-native.ts` header yorumu connector wizard regresyonunu önlemek için bu ayrımı zorunlu kılıyor.)
- **SANDBOX YOK.** Custom scripting iki katmanda:
  - **Katman A (Declarative Rule Engine):** JSON IF/THEN kuralları (kod değil, veri). Sandbox gerekmez.
  - **Katman B (Custom Functions):** Kullanıcı JS/TS yazar ama kısıtlı API yüzeyinde
    (`ctx.records.*`, `ctx.http.*`, `ctx.log()`). Güvenlik: `node:vm` context izolasyonu +
    AST denetimi (`require`/`process`/`eval`/`fs`/`import` YASAK) + hard timeout (5sn) + memory cap.
    Çalışma BullMQ worker'ında, ana API process'inden AYRI.

### Pazar Referansı (Haziran 2026)
- **Salesforce Agent Script:** deterministik if/then + LLM reasoning hibridi; güvenlik LLM'e değil
  deterministik kural filtrelerine bağlı. → Bizim kural motoru deterministik olmalı, AI yalnızca öneri.
- **Zoho Blueprint + Deluge + Kiosk Studio:** state machine + custom function + no-code guided screens.
- **Attio AI Attributes:** her objeye AI-auto-fill alan + custom objects + API-first. → `custom_fields`
  JSONB + Qdrant + gateway zaten elimizde; "AI Field tipi" doğal eşleşme.
- **HubSpot:** en iyi dedup motoru — onboarding'de zorunlu adım.

### Çalışma Disiplini (Claude Code)
- **Her faz ayrı PR.** Faz bitmeden sonrakine geçme.
- Her faz sonunda: migration çalışıyor mu, mevcut CRUD route'ları regresyona uğramadı mı, test et.
- Yeni tablo eklerken HEM `entity-schema-template.sql`'e (yeni tenant'lar için) HEM de mevcut
  tenant'lara migration olarak ekle.
- `queryEntitySchema` dışında entity şemasına SQL atma. Parametreli sorgu zorunlu (SQL injection).
- Türkçe commit mesajı ve kod yorumu serbest; değişken/fonksiyon adları İngilizce.

---

## FAZ 4 — Metadata Foundation ✅ TAMAMLANDI (2026-06-26)
> **En yüksek kaldıraç. Tüm sonraki fazların önkoşulu. BURADAN BAŞLA.**
> İlham: Attio custom objects, Zoho custom modules.
>
> Detaylı uygulama kaydı (commit'ler, doğrulama adımları, bulunan/düzeltilen regresyon):
> KIBIPR.md → "FAZ 4+ — Agentic Platform Roadmap" bölümü. Sıradaki: **FAZ 5**.

### 4.1 — Field/Module Registry (merkezi DB, Drizzle)
`db/schema.ts`'e iki yeni control-plane tablosu ekle (entity şemasına DEĞİL, merkeze):

```
kibi_modules
  id              uuid pk
  entity_id       uuid fk -> kibi_entities
  key             text         -- 'crm_contacts', 'erp_products' veya custom 'projeler'
  label           text
  is_system       boolean      -- native tablo mu (true) yoksa custom mu (false)
  physical_table  text null    -- system ise gerçek tablo adı; custom ise null (JSONB'de yaşar)
  icon            text null
  created_at      timestamptz
  UNIQUE(entity_id, key)

kibi_fields
  id              uuid pk
  module_id       uuid fk -> kibi_modules
  key             text         -- camelCase, örn. 'taxNumber'
  column_name     text null    -- system field ise gerçek kolon; custom ise null (custom_fields JSONB)
  label           text
  type            text         -- 'text'|'number'|'date'|'boolean'|'select'|'relation'|'ai'
  is_system       boolean      -- native kolon mu yoksa custom_fields içinde mi
  is_required     boolean
  config          jsonb        -- select options, relation target, ai prompt config vb.
  position        int
  created_at      timestamptz
  UNIQUE(module_id, key)
```

- Migration: `db/migrations/0023_metadata_registry.sql` (sıralı devam, son migration 0022).
- **Seed:** Mevcut tüm native tabloları ve kolonlarını `is_system=true` olarak registry'ye yaz.
  `crm-native.ts` içindeki `COLUMN_MAP` ve Zod şemalarından otomatik seed üreten bir script yaz:
  `src/lib/metadata/seed-system-fields.ts`. Bu, COLUMN_MAP'i registry'nin türetilebilir kaynağı yapar.

### 4.2 — GIN Index (entity şeması)
`db/entity-schema-template.sql`: `custom_fields JSONB` içeren HER tabloya ekle:
```sql
CREATE INDEX idx_:schema_crm_contacts_custom_fields
  ON ":schema".crm_contacts USING GIN (custom_fields);
```
Mevcut tenant'lar için: `provisionEntity` benzeri bir `migrateExistingEntities()` util yaz veya
ayrı migration runner ile tüm `entity_*` şemalarında döngüyle uygula.

### 4.3 — Metadata-Driven Validation & Column Mapping
`crm-native.ts`'deki statik `COLUMN_MAP` + statik Zod'u registry-driven hale getir.
**Pattern'i bozmadan**, yeni bir katman ekle: `src/lib/metadata/resolver.ts`
```ts
// resolveEntityContext'i genişlet: artık module metadata'sını da getirsin
getModuleSchema(entityId, moduleKey) -> { columnMap, zodSchema, customFields[] }
```
- `buildInsert`/`buildUpdate`: system field'lar gerçek kolona; custom field'lar
  `custom_fields` JSONB'ye (`custom_fields = custom_fields || $n::jsonb` merge) yazılacak şekilde genişlet.
- Zod şeması registry'den runtime üretilsin (`buildZodFromFields(fields[])`).
- **Geriye dönük uyumluluk:** Registry boşsa eski statik COLUMN_MAP'e fallback yap (kademeli geçiş).

### 4.4 — Dinamik Form Render (Frontend)
- Yeni endpoint: `GET /api/metadata/:moduleKey/fields` → `kibi_fields` döner.
- React'te `<DynamicForm moduleKey="crm_contacts" />`: alanları metadata'dan üretir.
  Field tipine göre input bileşeni seç (text/number/date/select/relation/ai).
- Mevcut statik formları kademeli olarak DynamicForm'a geçir (önce contacts).

### 4.5 — AI Field Tipi (Attio AI Attributes muadili)
- `kibi_fields.type='ai'`, `config` içinde: `{ prompt, sourceFields[], trigger: 'on_save'|'manual' }`.
- Kayıt save edilince (Faz 5 hook'una bağlanacak): `gateway.ts`'e prompt at, sonucu
  `custom_fields[fieldKey]`'e yaz. Qdrant context'i opsiyonel olarak prompt'a ekle.
- İlk sürümde `on_save` senkron; ağır promptlar Faz 5'te BullMQ'ya taşınacak.

**Faz 4 Definition of Done:** Yeni custom alan (text + select + ai) UI'dan eklenebiliyor,
`custom_fields`'a yazılıyor, GIN ile aranabiliyor, form dinamik render ediliyor, mevcut
contacts CRUD regresyonsuz çalışıyor.

---

## FAZ 5 — Event-Driven Hooks + Declarative Rule Engine (Katman A) ✅ TAMAMLANDI (2026-06-26)
> İlham: ActiveCampaign behavioral triggers, Salesforce deterministic gating, Zoho workflow rules.
>
> Detaylı uygulama kaydı: KIBIPR.md → "FAZ 5 — Event-Driven Hooks + Declarative Rule Engine"
> bölümü. Sıradaki: **FAZ 6** (Blueprint/State Machine).

### 5.1 — BullMQ Ekle
- `package.json`'a `bullmq` ekle. `src/lib/queue/index.ts`: Redis bağlantısını mevcut `ioredis`
  instance'ından türet, prefix `ent:{slug}:queue:`.
- Worker entry: `src/workers/index.ts` (ayrı process, `npm run worker`).

### 5.2 — CRUD Interceptor
`queryEntitySchema` çağrılarını saran bir hook katmanı: `src/lib/hooks/lifecycle.ts`
```ts
runHooks('beforeSave'|'afterSave', { entityId, module, record, prev })
```
- Native route'larda `buildInsert`/`buildUpdate` sonrası tek satırla çağrılır.
- `afterSave` AI field tetikleme (4.5) ve rule engine (5.4) buraya bağlanır.

### 5.3 — `workflow_rules` Tablosu (merkezi DB)
```
workflow_rules
  id, entity_id, module_key, name, is_active,
  trigger      text   -- 'on_create'|'on_update'|'on_stage_change'|'scheduled'
  conditions   jsonb  -- [{field, op, value}] AND/OR ağacı
  actions      jsonb  -- [{type:'email'|'webhook'|'update_field'|'require_approval'|'run_function', config}]
  created_at
```

### 5.4 — Deterministik Rule Evaluator
- `src/engine/rules/evaluator.ts`: `conditions` ağacını record'a karşı değerlendirir (saf fonksiyon, kod-exec YOK).
- Eşleşirse `actions`'ı sırayla queue'ya atar. **AI burada karar vermez** (Salesforce 2026 dersi).

### 5.5 — Action Queue & Handlers
- `src/workers/handlers/`: `email.ts`, `webhook.ts`, `updateField.ts`, `runFunction.ts` (Faz 7'ye köprü).
- Her handler idempotent, retry'lı (BullMQ backoff).

**Faz 5 DoD:** "Deal değeri > X ise webhook at + alan güncelle" kuralı UI'dan tanımlanıp tetikleniyor.

---

## FAZ 6 — Blueprint / State Machine ✅ TAMAMLANDI (2026-06-26)
> İlham: Zoho Blueprint, Salesforce stage gating.
>
> Detaylı uygulama kaydı: KIBIPR.md → "FAZ 6 — Blueprint / State Machine" bölümü.
> Sıradaki: **FAZ 7** (Custom Functions).

### 6.1 — Transition Tablosu (merkezi DB)
```
blueprint_transitions
  id, entity_id, module_key, field_key (örn 'stage'),
  from_state text, to_state text,
  conditions jsonb,        -- geçiş için sağlanması gereken alanlar
  requires_approval_role text null,
  actions jsonb            -- geçişte tetiklenecekler (rule engine action formatı)
```

### 6.2 — Gating Validation (Backend)
- `crm_deals.stage` (şu an enum string) değişiminde `lifecycle.beforeSave` içinde transition kontrolü.
- İzin verilmeyen geçiş → 422; zorunlu alan eksik → hata; approval gerekiyorsa pending state.
- Approval queue tablosu: `blueprint_approvals`.

### 6.3 — Görsel State Machine Editörü (Frontend)
- Drag-drop node/edge editörü (React Flow). State'leri ve geçiş kurallarını
  `blueprint_transitions`'a yazar.

**Faz 6 DoD:** Deal "negotiation → won" geçişi, manager onayı + zorunlu alan kontrolüyle bloklanıyor.

---

## FAZ 7 — Custom Functions (Katman B — gerçek custom scripting) ✅ TAMAMLANDI (2026-06-26)
> İlham: Deluge, Apex @InvocableMethod. **SANDBOX YOK** — AST-validated executor.
>
> **MİMARİ DEĞİŞİKLİK (kullanıcı onayıyla):** Uygulamadan önce bir güvenlik incelemesi, bu
> bölümün "node:vm + AST denetimi, isolated-vm DEĞİL" tasarımının gerçek bir güvenlik sınırı
> SAĞLAMADIĞINI gösterdi (`ctx.records.*` gibi bridge fonksiyonlarının döndürdüğü herhangi bir
> host-realm objesi `.constructor.constructor` ile host `Function`'a kaçış sağlıyor — AST
> denylist bunu hiç görmüyor). Kullanıcıya seçenek sunuldu, **gerçek V8 isolate
> (`isolated-vm`) seçildi** — yukarıdaki "SANDBOX YOK"/"isolated-vm DEĞİL" satırları bu faz
> için GEÇERSİZDİR. Detay + güvenlik test sonuçları: KIBIPR.md → "FAZ 7 — Custom Functions"
> bölümünün başındaki uyarı kutusu. Sıradaki: **FAZ 8** (No-Code Onboarding).

### 7.1 — Function Executor
`src/engine/functions/executor.ts`:
- `node:vm` ile context izolasyonu (isolated-vm DEĞİL).
- AST denetimi (`acorn` ile parse): `require`, `process`, `eval`, `Function`, `import`,
  `fs`, `child_process`, `global`, `globalThis` token'ları YASAK → reddet.
- Hard timeout 5sn (`vm.runInContext` + timeout option), memory guard.
- **Yalnızca BullMQ worker'ında çalışır**, ana API process'inde ASLA.

### 7.2 — Sınırlı Context API
Executor'a enjekte edilen tek global `ctx`:
```ts
ctx.records.find(module, filter)     // queryEntitySchema'ya sarmalı, tenant şemasına kilitli
ctx.records.update(module, id, data)
ctx.records.create(module, data)
ctx.http.get/post(url, opts)         // allowlist domain + timeout
ctx.log(...args)                     // execution log tablosuna
ctx.input                            // tetikleyen record / parametreler
```
- `ctx.records.*` MUTLAKA `resolveEntityContext` şemasıyla sınırlı (cross-tenant erişim imkânsız).
- `function_definitions` (kod) ve `function_executions` (log) tabloları merkezi DB'de.

### 7.3 — Trigger Binding
- Custom function'lar rule engine `actions`'ında `{type:'run_function', functionId}` olarak çağrılabilir
  (Apex @InvocableMethod muadili). 5.5'teki `runFunction.ts` handler bunu yürütür.

### 7.4 — Client Scripts (Frontend kural motoru)
- Form `onChange` mantığı: "B alanı X ise C zorunlu" → `kibi_fields.config.clientScript`
  içinde deklaratif kural (kod değil). DynamicForm (4.4) bunu yorumlar.

**Faz 7 DoD:** Kullanıcı UI'dan JS function yazıp kaydediyor; AST denetimi tehlikeli kodu reddediyor;
function bir rule action'ından tetiklenip `ctx.records.update` ile kayıt güncelliyor.

---

## FAZ 8 — No-Code Onboarding + Sektörel Şablonlar ✅ TAMAMLANDI (2026-06-26)
> İlham: Zoho Kiosk Studio, HubSpot dedup.
>
> Detaylı uygulama kaydı: KIBIPR.md → "FAZ 8 — No-Code Onboarding + Sektörel Şablonlar"
> bölümü. **Sıradaki: FAZ 9** (Granüler Güvenlik — owner_id + scope, tüm fazlarla paralel
> olması gerekiyordu, ayrı bir final pass olarak uygulanıyor; bkz. KIBIPR.md notu).

### 8.1 — Sektörel Seed
- `industry_templates` (merkezi DB): sektör → `{ modules[], fields[], blueprints[], rules[] }` JSON paketi.
- Onboarding'de sektör seçilince metadata registry'ye (Faz 4) + blueprint/rule tablolarına yazılır.
- İlk 3 şablon: e-ticaret, danışmanlık/ajans, B2B hizmet.

### 8.2 — Import + Dedup Motoru
- `src/engine/import/dedup.ts`: CSV/Excel import. HubSpot tarzı eşleştirme
  (email exact → fuzzy name+company). Çakışanları merge önerisiyle göster.
- Onboarding'de zorunlu adım (Attio dersi: temiz veri girişten başlar).

### 8.3 — Drag-Drop Alan Ekleme Sihirbazı
- Faz 4.4 DynamicForm üzerine: alan ekle/sırala/sil UI'ı → `kibi_fields`'a yazar.
- Monday tarzı renkli select/status alanları desteği.

**Faz 8 DoD:** Yeni tenant sektör seçip, CSV import edip (dedup'lu), UI'dan alan ekleyerek
5 dakikada operasyonel oluyor.

---

## FAZ 9 — Granüler Güvenlik (TÜM FAZLARLA PARALEL — kesinti yok) ✅ TAMAMLANDI (2026-06-26)
> İlham: Salesforce SOQL-respecting actions, record-level security.
>
> Detaylı uygulama kaydı: KIBIPR.md → "FAZ 9 — Granüler Güvenlik" bölümü. Pratikte paralel
> değil, FAZ 4-8 bittikten sonra tek bir final pass olarak uygulandı (sonuç aynı: 4 CRM
> tablosu owner_id/scope kapsamında). **Tüm roadmap (FAZ 4-9) tamamlandı.**

### 9.1 — `owner_id` Ekle
- `entity-schema-template.sql` + tüm mevcut entity şemalarına migration: ana tablolara
  `owner_id uuid` kolonu. Insert'te otomatik `req.user.id` set et.

### 9.2 — Dinamik WHERE Enjeksiyonu
- `src/lib/security/scope.ts`: rol hiyerarşisine göre SELECT'lere WHERE ekler
  (`owner_id = $me OR owner_id IN (team) OR role='admin'`).
- `resolveEntityContext` sonrası middleware'de devreye girer; native route'lar tek satırla
  `applyScope(sql, params, user)` çağırır.
- Custom function `ctx.records.*` (7.2) de bu scope'a tabi olmalı.

**Faz 9 DoD:** Satış temsilcisi yalnızca kendi/ekibinin kayıtlarını görüyor; admin hepsini.

---

## Bağımlılık Grafiği & Sıra

```
FAZ 4 (Metadata) ───┬──> FAZ 5 (Hooks+Rules) ──> FAZ 7 (Custom Functions)
                   ───> FAZ 6 (Blueprint)
                   ───> FAZ 8 (Onboarding)
FAZ 9 (Security) ────── her fazla paralel, her tabloya owner_id + scope
```

**Kesin sıra:** 4 → 5 → 6 → 7 → 8. Faz 9, Faz 4'le başlar ve her fazda ilgili tablolara
`owner_id` + scope eklenerek ilerler.

## ✅ Durum (2026-06-26): TÜM FAZLAR (4-9) TAMAMLANDI

Detaylı uygulama kayıtları, gerçek HTTP/tarayıcı doğrulamaları, bulunan+düzeltilen bug'lar
ve bilinçli kapsam daraltmaları için **KIBIPR.md**'nin ilgili "FAZ N" bölümlerine bakın.
Tek mimari override: FAZ 7'de roadmap'in "node:vm + AST denetimi" tasarımı bir güvenlik
incelemesi sonrası kullanıcı onayıyla `isolated-vm`'e değiştirildi (gerekçe: node:vm + AST
denylist, `ctx` bridge'inin döndürdüğü host-realm objeleri üzerinden gerçek bir kaçış
yoluna sahip — bkz. KIBIPR.md FAZ 7 başlığındaki uyarı kutusu).

## Başlangıç Komutu (Claude Code'a ilk talimat)
> "FAZ 4.1'den başla. `db/schema.ts`'e `kibi_modules` + `kibi_fields` tablolarını ekle,
> `0023_metadata_registry.sql` migration'ını yaz, ve `crm-native.ts`'in `COLUMN_MAP` +
> Zod şemalarından mevcut native alanları `is_system=true` olarak registry'ye seed eden
> `src/lib/metadata/seed-system-fields.ts` script'ini oluştur. Mevcut contacts CRUD route'larına
> dokunmadan, registry boşsa eski COLUMN_MAP'e fallback yapacak şekilde kur. Bitince dur ve
> bana FAZ 4.2 için onay sor."

---

## Çalışma Notu (Claude Code — bu oturum)

Kullanıcı bu roadmap'i auto mode'da uygulamamı istedi: fazlar arasında onay için durmadan,
her faz/alt-faz arasında commit+push yapmadan ve KIBIPR.md'yi güncellemeden geçmeden ilerle.
Yukarıdaki "bitince dur" talimatı bu oturum için geçersiz — kullanıcı talimatı önceliklidir.
İlerleme kaydı için bkz. KIBIPR.md (yeni "FAZ 4+ — Agentic Platform" bölümü).
