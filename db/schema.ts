/**
 * Database schema — Drizzle ORM
 *
 * Schema layout:
 *   public.*           — KIBI Merkez DB: users, tenants/entities, plans, subscriptions,
 *                        entity_metrics, ai_sessions, token_transactions, notifications
 *   entity_{slug}.*    — Per-entity isolated schema: CRM contacts/deals, ERP products/
 *                        orders/staff, Accounting invoices/payments/bank — created
 *                        dynamically by entity-provisioner when an entity signs up
 *
 * External CRM/ERP sync (n8n mirror) stays in public: crm_records, crm_modules, etc.
 */

import {
  pgTable, pgSchema,
  uuid, text, varchar, boolean, integer, bigint, date,
  timestamp, jsonb, numeric, index, uniqueIndex, pgEnum,
} from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'

// ─── Connector Config Type ────────────────────────────────────────────────────
export interface ConnectorFieldMapping {
  sourceField:     string
  targetField:     string
  transform:       'direct' | 'phone_e164' | 'country_iso' | 'name_case' | 'email_lower' | 'currency_strip' | 'custom'
  transformParams?: Record<string, unknown>
  customFieldKey?: string
}
export interface ConnectorModuleMapping {
  sourceModule: string
  targetTable:  string
  fields:       ConnectorFieldMapping[]
}
export interface ConnectorConfig {
  version:       number
  generatedAt:   string
  sourceType:    string
  mappings:      ConnectorModuleMapping[]
  unmappedFields: string[]
}

// ─── Enums ────────────────────────────────────────────────────────────────────
export const userRoleEnum   = pgEnum('user_role',   [
  'admin',             // Platform sahibi/yönetici - tam yetki (mirac@kibusiness.co)
  'supervisor',        // Platform görüntüleme, destek yönetimi, user hareketleri
  'entity_main',       // Entity birincil kontağı - CRM/ERP/entegrasyon yetkisi
  'entity_supervisor', // Entity verisi erişim, sync talebi, entegrasyon denetim
  'entity_sub',        // Entity AI chat, KIBI AI, kendi alanı
  'entity_external',   // Dış müşteri — sadece external-chat endpoint'ine erişim
])
export const crmTypeEnum    = pgEnum('crm_type',    [
  'zoho', 'salesforce', 'hubspot', 'sap', 'oracle_netsuite', 'dynamics365', 'odoo', 'erpnext', 'custom',
  'pipedrive', 'freshsales', 'monday', 'bitrix24', 'sugarcrm',
  'dynamics_bc', 'oracle_fusion', 'odoo_erp', 'epicor', 'infor', 'sage_intacct', 'acumatica',
  'postgresql', 'mysql',
])
export const erpTypeEnum    = pgEnum('erp_type',    [
  'sap', 'oracle_netsuite', 'dynamics_bc', 'oracle_fusion', 'odoo_erp',
  'erpnext', 'epicor', 'infor', 'sage_intacct', 'acumatica',
])
export const accountingTypeEnum = pgEnum('accounting_type', [
  'quickbooks', 'xero', 'zoho_books', 'wave',
  'freshbooks', 'sage_accounting', 'dynamics_finance', 'iyzico', 'parasut',
])
export const aiProviderEnum = pgEnum('ai_provider', ['openrouter', 'openai', 'anthropic', 'google', 'mistral', 'groq'])
export const channelEnum    = pgEnum('channel',     ['web', 'whatsapp', 'telegram', 'instagram', 'email'])
export const syncStatusEnum = pgEnum('sync_status', ['idle', 'running', 'done', 'error'])
export const jobStatusEnum  = pgEnum('job_status',  ['pending', 'downloading', 'done', 'failed'])
export const emailProviderEnum = pgEnum('email_provider', ['smtp', 'gmail', 'outlook', 'yahoo', 'zohomail'])
export const ticketStatusEnum = pgEnum('ticket_status', ['open', 'in_progress', 'resolved', 'closed'])
export const ticketPriorityEnum = pgEnum('ticket_priority', ['low', 'medium', 'high', 'urgent'])
export const senderTypeEnum = pgEnum('sender_type', ['customer', 'agent', 'ai'])
export const storageTypeEnum = pgEnum('storage_type', ['local', 'gdrive'])
export const kbSourceEnum = pgEnum('kb_source', ['manual', 'conversation', 'crm', 'accounting'])
export const accountingRecordTypeEnum = pgEnum('accounting_record_type', ['invoice', 'payment', 'customer', 'vendor', 'account', 'transaction'])
export const planNameEnum          = pgEnum('plan_name',          ['free', 'starter', 'growth', 'enterprise', 'basic', 'premium', 'custom_models'])
export const subscriptionStatusEnum = pgEnum('subscription_status', ['trial', 'active', 'past_due', 'cancelled', 'expired'])
export const billingCycleEnum      = pgEnum('billing_cycle',      ['monthly', 'yearly'])
export const aiSessionTypeEnum     = pgEnum('ai_session_type',    ['kibi_ai', 'entity_ai'])
export const aiSessionChannelEnum  = pgEnum('ai_session_channel', ['web', 'mobile', 'whatsapp', 'email', 'api'])
export const notificationTypeEnum  = pgEnum('notification_type',  [
  'info', 'warning', 'error', 'success',
  'invoice_due', 'payment_received', 'stock_low', 'ticket_update',
  'ai_insight', 'usage_limit', 'subscription_expiry',
])
export const notificationChannelEnum = pgEnum('notification_channel', ['in_app', 'email', 'push', 'whatsapp'])

// ═══════════════════════════════════════════════════════════════════════════════
// PLATFORM SCHEMA (public.*)
// ═══════════════════════════════════════════════════════════════════════════════

// Platform-level config key-value store (encrypted, admin CRUD / supervisor read)
export const platformConfigs = pgTable('platform_configs', {
  key:       varchar('key', { length: 100 }).primaryKey(),
  value:     text('value').notNull().default(''),
  label:     varchar('label', { length: 255 }).notNull(),
  category:  varchar('category', { length: 50 }).notNull(),
  isSecret:  boolean('is_secret').notNull().default(true),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export const users = pgTable('users', {
  id:           uuid('id').primaryKey().defaultRandom(),
  email:        varchar('email', { length: 255 }).notNull(),
  name:         varchar('name', { length: 255 }),
  passwordHash: text('password_hash').notNull(),
  phone:        varchar('phone', { length: 30 }),      // E.164
  totpSecret:   text('totp_secret'),                   // encrypted
  backupCodes:  jsonb('backup_codes').$type<string[]>(), // hashed
  role:         userRoleEnum('role').notNull().default('entity_sub'),
  isActive:     boolean('is_active').notNull().default(true),
  isVerified:   boolean('is_verified').notNull().default(false),
  lastLoginAt:  timestamp('last_login_at', { withTimezone: true }),
  createdAt:    timestamp('created_at',    { withTimezone: true }).notNull().defaultNow(),
  updatedAt:    timestamp('updated_at',    { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  emailIdx: uniqueIndex('users_email_idx').on(t.email),
  phoneIdx: index('users_phone_idx').on(t.phone),
}))

export const tenants = pgTable('tenants', {
  id:                uuid('id').primaryKey().defaultRandom(),
  name:              varchar('name', { length: 255 }).notNull(),
  slug:              varchar('slug', { length: 100 }).notNull(),
  isActive:          boolean('is_active').notNull().default(true),
  settings:          jsonb('settings').$type<TenantSettings>().default({}),
  storageUsedBytes:  bigint('storage_used_bytes', { mode: 'number' }).notNull().default(0),
  storageLimitBytes: bigint('storage_limit_bytes', { mode: 'number' }).notNull().default(1073741824), // 1GB
  createdAt:         timestamp('created_at',    { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  slugIdx: uniqueIndex('tenants_slug_idx').on(t.slug),
}))

export const tenantMemberships = pgTable('tenant_memberships', {
  id:                    uuid('id').primaryKey().defaultRandom(),
  userId:                uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  tenantId:              uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  role:                  userRoleEnum('role').notNull().default('entity_sub'),
  messageLimit:          integer('message_limit'),                                               // null = no sub-limit
  messagesUsedThisMonth: integer('messages_used_this_month').notNull().default(0),
  createdAt:             timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  uniqueIdx: uniqueIndex('memberships_user_tenant_idx').on(t.userId, t.tenantId),
}))

// CRM connection — one tenant can have multiple CRM connections
export const crmConnections = pgTable('crm_connections', {
  id:          uuid('id').primaryKey().defaultRandom(),
  tenantId:    uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  name:        varchar('name', { length: 255 }).notNull(),
  crmType:     crmTypeEnum('crm_type').notNull(),
  isActive:    boolean('is_active').notNull().default(true),
  credentials: text('credentials').notNull(), // AES-256-GCM encrypted JSON
  // AI-generated connector config (field mapping, transformations)
  connectorConfig: jsonb('connector_config').$type<ConnectorConfig>(),
  // Sync state
  lastSyncAt:  timestamp('last_sync_at', { withTimezone: true }),
  syncStatus:  syncStatusEnum('sync_status').default('idle'),
  syncError:   text('sync_error'),
  // Notification channel (for real-time CRM push)
  notifChannelId:    varchar('notif_channel_id', { length: 100 }),
  notifChannelExpiry: timestamp('notif_channel_expiry', { withTimezone: true }),
  createdAt:   timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt:   timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  tenantIdx: index('crm_connections_tenant_idx').on(t.tenantId),
}))

// Per-tenant AI config
export const aiConfigs = pgTable('ai_configs', {
  id:         uuid('id').primaryKey().defaultRandom(),
  tenantId:   uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  provider:   aiProviderEnum('provider').notNull().default('openrouter'),
  model:      varchar('model', { length: 100 }).notNull().default('google/gemma-4-31b-it:free'),
  apiKey:     text('api_key'),  // null = use platform key (free tier)
  isDefault:  boolean('is_default').notNull().default(true),
  settings:   jsonb('settings').$type<AiSettings>().default({}),
  createdAt:  timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

// KIBI platform tables
export const kibiEntities = pgTable('kibi_entities', {
  id:                     uuid('id').primaryKey().defaultRandom(),
  entityId:               uuid('entity_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  clientId:               varchar('client_id', { length: 20 }).notNull(),

  // ── Company profile ───────────────────────────────────────────────────────
  companyName:            varchar('company_name', { length: 255 }),
  industry:               varchar('industry', { length: 100 }),
  sector:                 varchar('sector', { length: 100 }),
  country:                varchar('country', { length: 10 }),
  timezone:               varchar('timezone', { length: 50 }).default('Europe/Istanbul'),
  language:               varchar('language', { length: 10 }).default('tr'),
  employeeCount:          integer('employee_count'),
  companySize:            varchar('company_size', { length: 20 }), // 'micro','small','medium','large'
  website:                varchar('website', { length: 255 }),
  logoUrl:                text('logo_url'),
  taxNumber:              varchar('tax_number', { length: 100 }),
  taxOffice:              varchar('tax_office', { length: 255 }),
  // Address
  addressLine1:           varchar('address_line1', { length: 500 }),
  addressLine2:           varchar('address_line2', { length: 500 }),
  city:                   varchar('city', { length: 100 }),
  state:                  varchar('state', { length: 100 }),
  postalCode:             varchar('postal_code', { length: 20 }),
  billingAddress:         text('billing_address'),    // legacy fallback

  // ── Users ────────────────────────────────────────────────────────────────
  mainUserId:             uuid('main_user_id').references(() => users.id, { onDelete: 'set null' }),

  // ── Subscription / Plan ──────────────────────────────────────────────────
  planName:               planNameEnum('plan_name').default('free'),
  trialEndsAt:            timestamp('trial_ends_at', { withTimezone: true }),

  // ── Billing state ────────────────────────────────────────────────────────
  nextBillingAt:          timestamp('next_billing_at', { withTimezone: true }),
  billingCycleStart:      timestamp('billing_cycle_start', { withTimezone: true }),
  extraSubUsers:          integer('extra_sub_users').notNull().default(0),
  debtTokens:             bigint('debt_tokens', { mode: 'number' }).notNull().default(0),
  isBillingRestricted:    boolean('is_billing_restricted').notNull().default(false),
  messagesUsedThisMonth:  integer('messages_used_this_month').notNull().default(0),

  // ── Isolation: per-entity infra IDs ──────────────────────────────────────
  entityDbSchema:         varchar('entity_db_schema', { length: 100 }),   // e.g. "entity_abc123"
  entityDbUrl:            text('entity_db_url'),
  entityRedisUrl:         text('entity_redis_url'),
  entityRedisPrefix:      varchar('entity_redis_prefix', { length: 100 }),
  entityQdrantUrl:        text('entity_qdrant_url'),
  entityQdrantCollection: varchar('entity_qdrant_collection', { length: 100 }),
  isProvisioned:          boolean('is_provisioned').notNull().default(false), // schema created?

  // ── KIBI relationship metadata ───────────────────────────────────────────
  lastContactAt:          timestamp('last_contact_at', { withTimezone: true }),
  lastContactChannel:     varchar('last_contact_channel', { length: 50 }),
  mood:                   varchar('mood', { length: 50 }),
  opportunityScore:       varchar('opportunity_score', { length: 20 }),

  createdAt:              timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt:              timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  entityIdx: uniqueIndex('kibi_entities_entity_idx').on(t.entityId),
  clientIdx: uniqueIndex('kibi_entities_client_idx').on(t.clientId),
  schemaIdx: uniqueIndex('kibi_entities_schema_idx').on(t.entityDbSchema),
}))

export const kibiEntityUsers = pgTable('kibi_entity_users', {
  id:          uuid('id').primaryKey().defaultRandom(),
  entityId:    uuid('entity_id').notNull().references(() => kibiEntities.id, { onDelete: 'cascade' }),
  userId:      uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  role:        varchar('role', { length: 50 }).notNull(),
  permissions: jsonb('permissions').$type<Record<string, boolean>>().notNull().default({}),
  createdAt:   timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const kibiInternalUsers = pgTable('kibi_internal_users', {
  id:           uuid('id').primaryKey().defaultRandom(),
  userId:       uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  internalRole: varchar('internal_role', { length: 100 }).notNull(),
  isActive:     boolean('is_active').notNull().default(true),
  createdAt:    timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

// YFZ 34: Premium AI + native Add-on entitlement framework (KiBI Base+Premium+Addon repositioning)
export const entityEntitlementModuleKeyEnum = pgEnum('entity_entitlement_module_key', [
  'ai_premium',
  'addon_customer_service',
  'addon_fulfillment',
  'addon_ecommerce',
  'addon_marketing',
  'addon_event',
  'addon_personnel_management',
])

export const entityEntitlementStatusEnum = pgEnum('entity_entitlement_status', [
  'trial', 'active', 'suspended', 'cancelled',
])

export const entityModuleEntitlements = pgTable('entity_module_entitlements', {
  id:          uuid('id').primaryKey().defaultRandom(),
  entityId:    uuid('entity_id').notNull().references(() => kibiEntities.id, { onDelete: 'cascade' }),
  moduleKey:   entityEntitlementModuleKeyEnum('module_key').notNull(),
  status:      entityEntitlementStatusEnum('status').notNull().default('active'),
  priceUsd:    numeric('price_usd', { precision: 10, scale: 2 }).notNull().default('0'),
  billingType: varchar('billing_type', { length: 20 }).notNull().default('monthly'), // monthly | usage | one_time
  trialEndsAt: timestamp('trial_ends_at', { withTimezone: true }),
  enabledAt:   timestamp('enabled_at', { withTimezone: true }).notNull().defaultNow(),
  cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
  metadata:    jsonb('metadata').$type<Record<string, unknown>>().default({}),
  createdAt:   timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt:   timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  entityModuleIdx: uniqueIndex('entity_module_entitlements_entity_module_idx').on(t.entityId, t.moduleKey),
  entityStatusIdx: index('entity_module_entitlements_entity_status_idx').on(t.entityId, t.status),
}))

export const entityModuleEntitlementsRelations = relations(entityModuleEntitlements, ({ one }) => ({
  entity: one(kibiEntities, { fields: [entityModuleEntitlements.entityId], references: [kibiEntities.id] }),
}))

// FAZ 4.1: Field/Module metadata registry — control-plane source of truth for what
// modules/fields exist per entity (native COLUMN_MAP-backed system fields seeded in,
// custom fields added via UI later). See KIBI-PLATFORM-ROADMAP.md FAZ 4.
export const kibiModules = pgTable('kibi_modules', {
  id:            uuid('id').primaryKey().defaultRandom(),
  entityId:      uuid('entity_id').notNull().references(() => kibiEntities.id, { onDelete: 'cascade' }),
  key:           varchar('key', { length: 100 }).notNull(),       // 'crm_contacts', 'erp_products', or custom 'projeler'
  label:         varchar('label', { length: 255 }).notNull(),
  isSystem:      boolean('is_system').notNull().default(false),   // native table vs custom (JSONB-only)
  physicalTable: varchar('physical_table', { length: 100 }),      // real table name if system, null if custom
  icon:          varchar('icon', { length: 50 }),
  createdAt:     timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  entityKeyIdx: uniqueIndex('kibi_modules_entity_key_idx').on(t.entityId, t.key),
}))

export const kibiFieldTypeEnum = pgEnum('kibi_field_type', [
  'text', 'number', 'date', 'boolean', 'select', 'relation', 'ai',
])

export const kibiFields = pgTable('kibi_fields', {
  id:          uuid('id').primaryKey().defaultRandom(),
  moduleId:    uuid('module_id').notNull().references(() => kibiModules.id, { onDelete: 'cascade' }),
  key:         varchar('key', { length: 100 }).notNull(),         // camelCase, e.g. 'taxNumber'
  columnName:  varchar('column_name', { length: 100 }),           // real column if system, null if custom (lives in custom_fields JSONB)
  label:       varchar('label', { length: 255 }).notNull(),
  type:        kibiFieldTypeEnum('type').notNull().default('text'),
  isSystem:    boolean('is_system').notNull().default(false),
  isRequired:  boolean('is_required').notNull().default(false),
  config:      jsonb('config').$type<Record<string, unknown>>().default({}),  // select options, relation target, ai prompt config
  position:    integer('position').notNull().default(0),
  createdAt:   timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  moduleKeyIdx: uniqueIndex('kibi_fields_module_key_idx').on(t.moduleId, t.key),
}))

export const kibiModulesRelations = relations(kibiModules, ({ one, many }) => ({
  entity: one(kibiEntities, { fields: [kibiModules.entityId], references: [kibiEntities.id] }),
  fields: many(kibiFields),
}))

export const kibiFieldsRelations = relations(kibiFields, ({ one }) => ({
  module: one(kibiModules, { fields: [kibiFields.moduleId], references: [kibiModules.id] }),
}))

// FAZ 5.3: declarative rule engine (Katman A) — deterministic IF/THEN rules, no code-exec.
// Only 'on_create'/'on_update' are wired to the lifecycle hooks as of FAZ 5; 'on_stage_change'
// and 'scheduled' are accepted by the enum (so rule authors aren't blocked) but not yet
// evaluated anywhere — 'on_stage_change' needs FAZ 6's transition tracking, 'scheduled' needs
// a cron-style queue producer neither of which exist yet.
export const workflowRuleTriggerEnum = pgEnum('workflow_rule_trigger', [
  'on_create', 'on_update', 'on_stage_change', 'scheduled',
])

export const workflowRules = pgTable('workflow_rules', {
  id:         uuid('id').primaryKey().defaultRandom(),
  entityId:   uuid('entity_id').notNull().references(() => kibiEntities.id, { onDelete: 'cascade' }),
  moduleKey:  varchar('module_key', { length: 100 }).notNull(),
  name:       varchar('name', { length: 255 }).notNull(),
  isActive:   boolean('is_active').notNull().default(true),
  trigger:    workflowRuleTriggerEnum('trigger').notNull(),
  conditions: jsonb('conditions').$type<unknown>().default(null),    // AND/OR tree of {field,op,value}, null = always match
  actions:    jsonb('actions').$type<unknown[]>().notNull().default([]), // [{type, config}]
  createdAt:  timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt:  timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  entityModuleIdx: index('workflow_rules_entity_module_idx').on(t.entityId, t.moduleKey),
  entityActiveIdx: index('workflow_rules_entity_active_idx').on(t.entityId, t.isActive),
}))

export const workflowRulesRelations = relations(workflowRules, ({ one }) => ({
  entity: one(kibiEntities, { fields: [workflowRules.entityId], references: [kibiEntities.id] }),
}))

// FAZ 6.1: Blueprint / state machine — deterministic gating on a field's value transitions
// (e.g. crm_deals.stage). Defining ANY transition for a (module_key, field_key) pair puts
// that field under blueprint control: every other, undefined transition on that field is
// then blocked. See KIBIPR.md FAZ 6 for this footgun spelled out for rule authors.
export const blueprintTransitions = pgTable('blueprint_transitions', {
  id:                   uuid('id').primaryKey().defaultRandom(),
  entityId:             uuid('entity_id').notNull().references(() => kibiEntities.id, { onDelete: 'cascade' }),
  moduleKey:            varchar('module_key', { length: 100 }).notNull(),
  fieldKey:             varchar('field_key', { length: 100 }).notNull(),   // e.g. 'stage'
  fromState:            varchar('from_state', { length: 100 }).notNull(),
  toState:              varchar('to_state', { length: 100 }).notNull(),
  conditions:           jsonb('conditions').$type<unknown>().default(null), // required-field checks, evaluator.ts format
  requiresApprovalRole: varchar('requires_approval_role', { length: 50 }),
  actions:              jsonb('actions').$type<unknown[]>().notNull().default([]),
  createdAt:            timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  entityModuleFieldIdx: index('blueprint_transitions_entity_module_field_idx').on(t.entityId, t.moduleKey, t.fieldKey),
}))

export const blueprintTransitionsRelations = relations(blueprintTransitions, ({ one }) => ({
  entity: one(kibiEntities, { fields: [blueprintTransitions.entityId], references: [kibiEntities.id] }),
}))

export const blueprintApprovalStatusEnum = pgEnum('blueprint_approval_status', ['pending', 'approved', 'rejected'])

export const blueprintApprovals = pgTable('blueprint_approvals', {
  id:             uuid('id').primaryKey().defaultRandom(),
  entityId:       uuid('entity_id').notNull().references(() => kibiEntities.id, { onDelete: 'cascade' }),
  moduleKey:      varchar('module_key', { length: 100 }).notNull(),
  table:          varchar('table', { length: 100 }).notNull(),
  recordId:       uuid('record_id').notNull(),
  fieldKey:       varchar('field_key', { length: 100 }).notNull(),
  fromState:      varchar('from_state', { length: 100 }).notNull(),
  toState:        varchar('to_state', { length: 100 }).notNull(),
  transitionId:   uuid('transition_id').notNull().references(() => blueprintTransitions.id, { onDelete: 'cascade' }),
  status:         blueprintApprovalStatusEnum('status').notNull().default('pending'),
  requestedByUserId: uuid('requested_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  resolvedByUserId:  uuid('resolved_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  resolvedAt:     timestamp('resolved_at', { withTimezone: true }),
  createdAt:      timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  entityStatusIdx: index('blueprint_approvals_entity_status_idx').on(t.entityId, t.status),
}))

export const blueprintApprovalsRelations = relations(blueprintApprovals, ({ one }) => ({
  entity:     one(kibiEntities, { fields: [blueprintApprovals.entityId], references: [kibiEntities.id] }),
  transition: one(blueprintTransitions, { fields: [blueprintApprovals.transitionId], references: [blueprintTransitions.id] }),
}))

export const kibiModelRoleEnum = pgEnum('kibi_model_role', [
  'conversation', 'db_search', 'qdrant_search', 'redis_search',
  'intent', 'support_intent', 'support_refine', 'support_resolver', 'support_answering',
  'intent_analysis', 'support_problem', 'support_solution', 'support_generator',
  'sales_intent', 'sales_conversation', 'consulting_intent', 'consulting_recommendation',
  'master_conversation', 'db_query', 'kb_vector', 'connector', 'kb_signal_writer',
])

export const kibiTokenUsage = pgTable('kibi_token_usage', {
  id:             uuid('id').primaryKey().defaultRandom(),
  entityId:       uuid('entity_id').references(() => kibiEntities.id, { onDelete: 'set null' }),
  userId:         uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
  modelName:      varchar('model_name', { length: 150 }),
  provider:       varchar('provider', { length: 50 }),
  promptTokens:   integer('prompt_tokens'),
  completionTokens: integer('completion_tokens'),
  totalTokens:    integer('total_tokens'),
  costUsd:        numeric('cost_usd', { precision: 10, scale: 6 }),
  modelRole:      kibiModelRoleEnum('model_role'),
  usedAt:         timestamp('used_at', { withTimezone: true }).notNull().defaultNow(),
})

export const kibiModelConfigs = pgTable('kibi_model_configs', {
  id:                    uuid('id').primaryKey().defaultRandom(),
  scope:                 varchar('scope', { length: 20 }).notNull(),
  scopeId:               uuid('scope_id'),
  modelRole:             kibiModelRoleEnum('model_role').notNull(),
  primaryModel:          varchar('primary_model', { length: 150 }).notNull(),
  fallback1:             varchar('fallback_1', { length: 150 }),
  fallback2:             varchar('fallback_2', { length: 150 }),
  fallback3:             varchar('fallback_3', { length: 150 }),
  provider:              varchar('provider', { length: 50 }).notNull().default('openrouter'),
  apiKey:                text('api_key'),
  systemPromptOverride:  text('system_prompt_override'),
  temperature:           numeric('temperature', { precision: 3, scale: 2 }).notNull().default('0.4'),
  maxTokens:             integer('max_tokens').notNull().default(1500),
  isActive:              boolean('is_active').notNull().default(true),
  updatedBy:             uuid('updated_by'),
  updatedAt:             timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export const entityDataCatalog = pgTable('entity_data_catalog', {
  id:             uuid('id').primaryKey().defaultRandom(),
  entityId:       uuid('entity_id').notNull(),
  connectionId:   uuid('connection_id').notNull(),
  sourceName:     varchar('source_name', { length: 100 }).notNull(),
  sourceType:     varchar('source_type', { length: 50 }).notNull(),
  tableName:      varchar('table_name', { length: 200 }).notNull(),
  displayName:    varchar('display_name', { length: 200 }),
  tableIntent:    varchar('table_intent', { length: 100 }),
  columns:        jsonb('columns'),
  relationships:  jsonb('relationships'),
  queryTemplates: jsonb('query_templates'),
  dataQuality:    jsonb('data_quality'),
  rawTablePath:   varchar('raw_table_path', { length: 300 }),
  isQueryable:    boolean('is_queryable').notNull().default(true),
  isWritable:     boolean('is_writable').notNull().default(false),
  isUserApproved: boolean('is_user_approved').notNull().default(false),
  catalogVersion: integer('catalog_version').notNull().default(1),
  recordCount:    integer('record_count').notNull().default(0),
  lastAnalyzedAt: timestamp('last_analyzed_at', { withTimezone: true }),
  createdAt:      timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt:      timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export const aiPipelineLogs = pgTable('ai_pipeline_logs', {
  id:              uuid('id').primaryKey().defaultRandom(),
  entityId:        uuid('entity_id'),
  sessionId:       varchar('session_id', { length: 200 }),
  pipelineType:    varchar('pipeline_type', { length: 20 }).notNull(),
  modelRole:       varchar('model_role', { length: 50 }).notNull(),
  modelUsed:       varchar('model_used', { length: 100 }),
  inputTokens:     integer('input_tokens'),
  outputTokens:    integer('output_tokens'),
  latencyMs:       integer('latency_ms'),
  success:         boolean('success').notNull().default(true),
  errorMessage:    text('error_message'),
  confidenceScore: integer('confidence_score'),
  escalated:       boolean('escalated').notNull().default(false),
  kbWritten:       boolean('kb_written').notNull().default(false),
  createdAt:       timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const kibiSupportTicketStatusEnum = pgEnum('kibi_support_ticket_status', [
  'open', 'kibi_processing', 'escalated', 'in_progress', 'resolved', 'closed',
])

export const kibiSupportSenderTypeEnum = pgEnum('kibi_support_sender_type', [
  'customer', 'kibi', 'agent', 'system',
])

export const kibiSupportTickets = pgTable('kibi_support_tickets', {
  id:              uuid('id').primaryKey().defaultRandom(),
  ticketNumber:    varchar('ticket_number', { length: 20 }).notNull(),
  entityId:        uuid('entity_id').notNull().references(() => kibiEntities.id, { onDelete: 'cascade' }),
  userId:          uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
  clientId:        varchar('client_id', { length: 20 }).notNull(),
  serviceCategory: varchar('service_category', { length: 100 }),
  subject:         varchar('subject', { length: 500 }),
  status:          kibiSupportTicketStatusEnum('status').notNull().default('open'),
  priority:        ticketPriorityEnum('priority').notNull().default('medium'),
  contactChannel:  varchar('contact_channel', { length: 30 }),
  intent:          varchar('intent', { length: 100 }),
  mood:            varchar('mood', { length: 50 }),
  urgencyScore:    integer('urgency_score'),
  answeringMood:   varchar('answering_mood', { length: 50 }),
  categoryL1:      varchar('category_l1', { length: 100 }),
  categoryL2:      varchar('category_l2', { length: 100 }),
  categoryL3:      varchar('category_l3', { length: 100 }),
  categoryL4:      varchar('category_l4', { length: 100 }),
  resolvedBy:      varchar('resolved_by', { length: 30 }),
  resolutionSummary: text('resolution_summary'),
  solutionSteps:   jsonb('solution_steps').$type<Record<string, unknown>[]>(),
  kibiAttempted:   boolean('kibi_attempted').notNull().default(false),
  escalatedTo:       uuid('escalated_to'),
  escalatedAt:       timestamp('escalated_at', { withTimezone: true }),
  externalContactId: varchar('external_contact_id', { length: 255 }), // WA phone / TG chat_id / IG id / email
  assignedAgentId:   uuid('assigned_agent_id').references(() => users.id, { onDelete: 'set null' }),
  openedAt:          timestamp('opened_at', { withTimezone: true }).notNull().defaultNow(),
  closedAt:        timestamp('closed_at', { withTimezone: true }),
  firstResponseAt: timestamp('first_response_at', { withTimezone: true }),
  slaDeadline:     timestamp('sla_deadline', { withTimezone: true }),
}, (t) => ({
  ticketNumberIdx: uniqueIndex('kibi_support_tickets_number_idx').on(t.ticketNumber),
  entityIdx: index('kibi_support_tickets_entity_idx').on(t.entityId),
}))

export const kibiSupportMessages = pgTable('kibi_support_messages', {
  id:         uuid('id').primaryKey().defaultRandom(),
  ticketId:   uuid('ticket_id').notNull().references(() => kibiSupportTickets.id, { onDelete: 'cascade' }),
  senderType: kibiSupportSenderTypeEnum('sender_type').notNull(),
  senderId:   uuid('sender_id'),
  content:    text('content'),
  channel:    varchar('channel', { length: 30 }),
  intentTags: jsonb('intent_tags').$type<Record<string, unknown>[]>(),
  moodScore:  jsonb('mood_score').$type<Record<string, unknown>>(),
  createdAt:  timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const kibiSupportKnowledge = pgTable('kibi_support_knowledge', {
  id:            uuid('id').primaryKey().defaultRandom(),
  categoryL1:    varchar('category_l1', { length: 100 }),
  categoryL2:    varchar('category_l2', { length: 100 }),
  categoryL3:    varchar('category_l3', { length: 100 }),
  problemSummary: text('problem_summary'),
  solutionSteps: jsonb('solution_steps').$type<Record<string, unknown>[]>(),
  sourceTicketIds: jsonb('source_ticket_ids').$type<string[]>(),
  successRate:   numeric('success_rate', { precision: 5, scale: 2 }),
  useCount:      integer('use_count').notNull().default(0),
  qdrantId:      varchar('qdrant_id', { length: 100 }),
  isIndexed:     boolean('is_indexed').notNull().default(false),
  createdAt:     timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt:     timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

// ─── Subscription Plans ───────────────────────────────────────────────────────
export const plans = pgTable('plans', {
  id:                   uuid('id').primaryKey().defaultRandom(),
  name:                 planNameEnum('name').notNull(),
  displayName:          varchar('display_name', { length: 255 }).notNull(),
  description:          text('description'),
  // Feature limits
  maxSubUsers:          integer('max_sub_users').notNull().default(0),
  maxCrmRecords:        integer('max_crm_records').notNull().default(1000),
  maxErpProducts:       integer('max_erp_products').notNull().default(500),
  maxAccInvoices:       integer('max_acc_invoices').notNull().default(200),
  maxMonthlyAiMessages: integer('max_monthly_ai_messages').notNull().default(100),
  maxStorageMb:         integer('max_storage_mb').notNull().default(500),
  maxQdrantVectors:     integer('max_qdrant_vectors').notNull().default(10000),
  freeTokensMonthly:    bigint('free_tokens_monthly', { mode: 'number' }).notNull().default(100000),
  // Pricing (USD)
  monthlyPriceUsd:      numeric('monthly_price_usd', { precision: 10, scale: 2 }),
  yearlyPriceUsd:       numeric('yearly_price_usd',  { precision: 10, scale: 2 }),
  perSubUserPriceUsd:   numeric('per_sub_user_price_usd', { precision: 10, scale: 2 }),
  extraTokenPricePer1k: numeric('extra_token_price_per_1k', { precision: 10, scale: 6 }),
  // Feature flags  features:             jsonb('features').$type<string[]>().default([]),
  isActive:             boolean('is_active').notNull().default(true),
  sortOrder:            integer('sort_order').notNull().default(0),
  createdAt:            timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  nameIdx: uniqueIndex('plans_name_idx').on(t.name),
}))

// ─── Subscriptions ────────────────────────────────────────────────────────────
export const subscriptions = pgTable('subscriptions', {
  id:                  uuid('id').primaryKey().defaultRandom(),
  entityId:            uuid('entity_id').notNull().references(() => kibiEntities.id, { onDelete: 'cascade' }),
  planId:              uuid('plan_id').notNull().references(() => plans.id),
  status:              subscriptionStatusEnum('status').notNull().default('trial'),
  billingCycle:        billingCycleEnum('billing_cycle').notNull().default('monthly'),
  // Period dates
  trialEndsAt:         timestamp('trial_ends_at',          { withTimezone: true }),
  currentPeriodStart:  timestamp('current_period_start',   { withTimezone: true }),
  currentPeriodEnd:    timestamp('current_period_end',     { withTimezone: true }),
  // Sub-users billed this period
  subUserCount:        integer('sub_user_count').notNull().default(0),
  // Amounts USD
  baseAmountUsd:       numeric('base_amount_usd',     { precision: 10, scale: 2 }),
  subUserAmountUsd:    numeric('sub_user_amount_usd', { precision: 10, scale: 2 }).notNull().default('0'),
  extraTokenAmountUsd: numeric('extra_token_amount_usd', { precision: 10, scale: 2 }).notNull().default('0'),
  totalAmountUsd:      numeric('total_amount_usd',    { precision: 10, scale: 2 }),
  // Payment
  paymentMethod:       varchar('payment_method',    { length: 50 }),
  paymentReference:    varchar('payment_reference', { length: 255 }),
  // Cancellation
  cancelledAt:         timestamp('cancelled_at',       { withTimezone: true }),
  cancellationReason:  text('cancellation_reason'),
  createdAt:           timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt:           timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  entityIdx: index('subscriptions_entity_idx').on(t.entityId),
}))

// ─── Billing Invoices ─────────────────────────────────────────────────────────
export const billingInvoices = pgTable('billing_invoices', {
  id:               uuid('id').primaryKey().defaultRandom(),
  entityId:         uuid('entity_id').notNull().references(() => kibiEntities.id, { onDelete: 'cascade' }),
  subscriptionId:   uuid('subscription_id').references(() => subscriptions.id, { onDelete: 'set null' }),
  invoiceNumber:    varchar('invoice_number', { length: 50 }).notNull(),
  status:           varchar('status', { length: 30 }).notNull().default('pending'), // pending,paid,failed,refunded
  // Amounts
  subtotalUsd:      numeric('subtotal_usd',   { precision: 10, scale: 2 }),
  taxUsd:           numeric('tax_usd',        { precision: 10, scale: 2 }).notNull().default('0'),
  totalUsd:         numeric('total_usd',      { precision: 10, scale: 2 }),
  // Line items detail
  items:            jsonb('items').$type<BillingLineItem[]>().default([]),
  // Payment
  dueDate:          date('due_date'),
  paidAt:           timestamp('paid_at',     { withTimezone: true }),
  paymentMethod:    varchar('payment_method', { length: 50 }),
  paymentReference: varchar('payment_reference', { length: 255 }),
  pdfUrl:           text('pdf_url'),
  createdAt:        timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  invoiceNumberIdx: uniqueIndex('billing_invoices_number_idx').on(t.invoiceNumber),
  entityIdx:        index('billing_invoices_entity_idx').on(t.entityId),
}))

// ─── Entity Metrics (real-time, one row per entity) ───────────────────────────
export const entityMetrics = pgTable('entity_metrics', {
  id:                    uuid('id').primaryKey().defaultRandom(),
  entityId:              uuid('entity_id').notNull().references(() => kibiEntities.id, { onDelete: 'cascade' }),
  // ── Tokens (lifetime) ────────────────────────────────────────────────────
  totalTokensUsed:       bigint('total_tokens_used',   { mode: 'number' }).notNull().default(0),
  freeTokensUsed:        bigint('free_tokens_used',    { mode: 'number' }).notNull().default(0),
  paidTokensUsed:        bigint('paid_tokens_used',    { mode: 'number' }).notNull().default(0),
  kibiAiTokens:          bigint('kibi_ai_tokens',      { mode: 'number' }).notNull().default(0),
  entityAiTokens:        bigint('entity_ai_tokens',    { mode: 'number' }).notNull().default(0),
  adminAiTokens:         bigint('admin_ai_tokens',     { mode: 'number' }).notNull().default(0),
  // ── Current month ────────────────────────────────────────────────────────
  currentMonthTokens:    bigint('current_month_tokens', { mode: 'number' }).notNull().default(0),
  currentMonthStart:     date('current_month_start'),
  currentMonthMessages:  integer('current_month_messages').notNull().default(0),
  // ── Storage (MB, 3dp) ────────────────────────────────────────────────────
  dbStorageMb:           numeric('db_storage_mb',      { precision: 12, scale: 3 }).notNull().default('0'),
  qdrantStorageMb:       numeric('qdrant_storage_mb',  { precision: 12, scale: 3 }).notNull().default('0'),
  redisStorageMb:        numeric('redis_storage_mb',   { precision: 12, scale: 3 }).notNull().default('0'),
  totalStorageMb:        numeric('total_storage_mb',   { precision: 12, scale: 3 }).notNull().default('0'),
  // ── Record counts ────────────────────────────────────────────────────────
  crmContactCount:       integer('crm_contact_count').notNull().default(0),
  crmDealCount:          integer('crm_deal_count').notNull().default(0),
  erpProductCount:       integer('erp_product_count').notNull().default(0),
  erpOrderCount:         integer('erp_order_count').notNull().default(0),
  erpStaffCount:         integer('erp_staff_count').notNull().default(0),
  accInvoiceCount:       integer('acc_invoice_count').notNull().default(0),
  // ── AI usage (rolling 30d) ───────────────────────────────────────────────
  messages30d:           integer('messages_30d').notNull().default(0),
  dailyAvgMessages:      numeric('daily_avg_messages', { precision: 8, scale: 2 }).notNull().default('0'),
  peakDailyMessages:     integer('peak_daily_messages').notNull().default(0),
  // ── Channel breakdown (lifetime) ─────────────────────────────────────────
  webMessagesTotal:      bigint('web_messages_total',      { mode: 'number' }).notNull().default(0),
  mobileMessagesTotal:   bigint('mobile_messages_total',   { mode: 'number' }).notNull().default(0),
  whatsappMessagesTotal: bigint('whatsapp_messages_total', { mode: 'number' }).notNull().default(0),
  emailMessagesTotal:    bigint('email_messages_total',    { mode: 'number' }).notNull().default(0),
  // ── Support ──────────────────────────────────────────────────────────────
  totalSupportTickets:   integer('total_support_tickets').notNull().default(0),
  resolvedTickets:       integer('resolved_tickets').notNull().default(0),
  pendingTickets:        integer('pending_tickets').notNull().default(0),
  devBacklogTickets:     integer('dev_backlog_tickets').notNull().default(0),
  avgResolutionHours:    numeric('avg_resolution_hours', { precision: 8, scale: 2 }),
  // ── Session ──────────────────────────────────────────────────────────────
  activeSubUserCount:    integer('active_sub_user_count').notNull().default(0),
  lastActivityAt:        timestamp('last_activity_at', { withTimezone: true }),
  updatedAt:             timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  entityIdx: uniqueIndex('entity_metrics_entity_idx').on(t.entityId),
}))

// ─── Entity Monthly Usage Snapshots ──────────────────────────────────────────
export const entityMonthlyUsage = pgTable('entity_monthly_usage', {
  id:                    uuid('id').primaryKey().defaultRandom(),
  entityId:              uuid('entity_id').notNull().references(() => kibiEntities.id, { onDelete: 'cascade' }),
  month:                 date('month').notNull(),    // YYYY-MM-01
  // Tokens
  tokensUsed:            bigint('tokens_used',    { mode: 'number' }).notNull().default(0),
  freeTokens:            bigint('free_tokens',    { mode: 'number' }).notNull().default(0),
  paidTokens:            bigint('paid_tokens',    { mode: 'number' }).notNull().default(0),
  // Activity
  totalMessages:         integer('total_messages').notNull().default(0),
  kibiAiMessages:        integer('kibi_ai_messages').notNull().default(0),
  entityAiMessages:      integer('entity_ai_messages').notNull().default(0),
  uniqueActiveUsers:     integer('unique_active_users').notNull().default(0),
  activeDays:            integer('active_days').notNull().default(0),
  // Storage snapshot at month-end
  dbStorageMbSnapshot:   numeric('db_storage_mb_snapshot',   { precision: 12, scale: 3 }),
  qdrantVectorCount:     integer('qdrant_vector_count'),
  // Operational
  crmRecordsAdded:       integer('crm_records_added').notNull().default(0),
  erpOrdersCreated:      integer('erp_orders_created').notNull().default(0),
  accInvoicesCreated:    integer('acc_invoices_created').notNull().default(0),
  // Support
  ticketsCreated:        integer('tickets_created').notNull().default(0),
  ticketsResolved:       integer('tickets_resolved').notNull().default(0),
  // Billing
  billedAmountUsd:       numeric('billed_amount_usd',      { precision: 10, scale: 2 }).notNull().default('0'),
  extraTokenChargeUsd:   numeric('extra_token_charge_usd', { precision: 10, scale: 2 }).notNull().default('0'),
  createdAt:             timestamp('created_at',   { withTimezone: true }).notNull().defaultNow(),
  finalizedAt:           timestamp('finalized_at', { withTimezone: true }),
}, (t) => ({
  uniqueIdx: uniqueIndex('entity_monthly_usage_unique_idx').on(t.entityId, t.month),
  entityIdx: index('entity_monthly_usage_entity_idx').on(t.entityId),
}))

// ─── Token Transactions (granular log) ───────────────────────────────────────
export const tokenTransactions = pgTable('token_transactions', {
  id:              uuid('id').primaryKey().defaultRandom(),
  entityId:        uuid('entity_id').notNull().references(() => kibiEntities.id, { onDelete: 'cascade' }),
  userId:          uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
  // Classification
  aiType:          aiSessionTypeEnum('ai_type'),                // kibi_ai | entity_ai
  channel:         aiSessionChannelEnum('channel').default('web'),
  // Token counts
  promptTokens:    integer('prompt_tokens').notNull().default(0),
  completionTokens: integer('completion_tokens').notNull().default(0),
  totalTokens:     integer('total_tokens').notNull().default(0),
  isFree:          boolean('is_free').notNull().default(true),
  // Model
  modelName:       varchar('model_name', { length: 150 }),
  modelRole:       kibiModelRoleEnum('model_role'),
  // Cost
  costUsd:         numeric('cost_usd', { precision: 12, scale: 8 }).notNull().default('0'),
  // Session reference
  sessionId:       uuid('session_id'),
  createdAt:       timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  entityIdx:  index('token_transactions_entity_idx').on(t.entityId),
  timeIdx:    index('token_transactions_time_idx').on(t.entityId, t.createdAt),
}))

// ─── AI Sessions ─────────────────────────────────────────────────────────────
export const aiSessions = pgTable('ai_sessions', {
  id:            uuid('id').primaryKey().defaultRandom(),
  entityId:      uuid('entity_id').notNull().references(() => kibiEntities.id, { onDelete: 'cascade' }),
  userId:        uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  type:          aiSessionTypeEnum('type').notNull(),
  channel:       aiSessionChannelEnum('channel').notNull().default('web'),
  // Display
  title:         varchar('title', { length: 500 }),
  // Stats
  messageCount:  integer('message_count').notNull().default(0),
  totalTokens:   integer('total_tokens').notNull().default(0),
  // 30-day archival
  summary:       text('summary'),         // AI-generated summary after 30 days
  summarizedAt:  timestamp('summarized_at', { withTimezone: true }),
  // Redis context key for live memory
  redisKey:      varchar('redis_key', { length: 255 }),
  // State
  isArchived:    boolean('is_archived').notNull().default(false),
  lastMessageAt: timestamp('last_message_at', { withTimezone: true }),
  createdAt:     timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt:     timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  entityUserIdx: index('ai_sessions_entity_user_idx').on(t.entityId, t.userId),
  typeIdx:       index('ai_sessions_type_idx').on(t.type, t.isArchived),
}))

// ─── AI Messages ─────────────────────────────────────────────────────────────
export const aiMessages = pgTable('ai_messages', {
  id:               uuid('id').primaryKey().defaultRandom(),
  sessionId:        uuid('session_id').notNull().references(() => aiSessions.id, { onDelete: 'cascade' }),
  role:             varchar('role', { length: 20 }).notNull(), // user | assistant | system
  content:          text('content').notNull(),
  // Token breakdown
  promptTokens:     integer('prompt_tokens'),
  completionTokens: integer('completion_tokens'),
  totalTokens:      integer('total_tokens'),
  // Model
  modelName:        varchar('model_name', { length: 150 }),
  // Tool calls (Entity AI uses DB tools)
  toolCalls:        jsonb('tool_calls').$type<ToolCall[]>(),
  // User feedback
  feedback:         varchar('feedback', { length: 20 }), // thumbs_up | thumbs_down
  createdAt:        timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  sessionIdx: index('ai_messages_session_idx').on(t.sessionId),
}))

// ─── Entity Notifications ─────────────────────────────────────────────────────
export const entityNotifications = pgTable('entity_notifications', {
  id:        uuid('id').primaryKey().defaultRandom(),
  entityId:  uuid('entity_id').notNull().references(() => kibiEntities.id, { onDelete: 'cascade' }),
  userId:    uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
  type:      notificationTypeEnum('type').notNull(),
  channel:   notificationChannelEnum('channel').notNull().default('in_app'),
  title:     varchar('title', { length: 500 }).notNull(),
  body:      text('body'),
  data:      jsonb('data').$type<Record<string, unknown>>().default({}),
  isRead:    boolean('is_read').notNull().default(false),
  readAt:    timestamp('read_at',    { withTimezone: true }),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  entityUserIdx: index('entity_notifications_entity_user_idx').on(t.entityId, t.userId),
  unreadIdx:     index('entity_notifications_unread_idx').on(t.entityId, t.isRead),
}))

export const accCurrencies = pgTable('acc_currencies', {
  id:         uuid('id').primaryKey().defaultRandom(),
  tenantId:   uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  code:       varchar('code', { length: 10 }).notNull(),
  name:       varchar('name', { length: 100 }),
  symbol:     varchar('symbol', { length: 10 }),
  isDefault:  boolean('is_default').notNull().default(false),
  exchangeRate: numeric('exchange_rate', { precision: 15, scale: 6 }).notNull().default('1'),
})

export const accChartOfAccounts = pgTable('acc_chart_of_accounts', {
  id:             uuid('id').primaryKey().defaultRandom(),
  tenantId:       uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  code:           varchar('code', { length: 50 }),
  name:           varchar('name', { length: 255 }),
  accountType:    varchar('account_type', { length: 50 }),
  accountSubtype: varchar('account_subtype', { length: 100 }),
  parentId:       uuid('parent_id'),
  countryStandard:varchar('country_standard', { length: 10 }),
  isActive:       boolean('is_active').notNull().default(true),
})

// YFZ 34 Faz 2: accContacts/accInvoices/accInvoiceLines/accPayments/accExpenses
// (public-schema) retired — native CRUD now targets the entity-schema acc_* set
// (db/entity-schema-template.sql), which is richer (e-fatura, TEKDÜZEN COA, bank
// reconciliation) and already interconnected with crm_*/erp_* tables. See
// db/migrations/0017_drop_public_acc_tables.sql and KIBIPR.md §6/§14.2.

export const paymentIntegrations = pgTable('payment_integrations', {
  id:            uuid('id').primaryKey().defaultRandom(),
  tenantId:      uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  provider:      varchar('provider', { length: 50 }),
  name:          varchar('name', { length: 255 }),
  credentials:   text('credentials'),
  isActive:      boolean('is_active').notNull().default(true),
  webhookSecret: text('webhook_secret'),
  settings:      jsonb('settings').$type<Record<string, unknown>>().notNull().default({}),
  createdAt:     timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const bankIntegrations = pgTable('bank_integrations', {
  id:                   uuid('id').primaryKey().defaultRandom(),
  tenantId:             uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  bankName:             varchar('bank_name', { length: 100 }),
  provider:             varchar('provider', { length: 50 }),
  country:              varchar('country', { length: 10 }),
  credentials:          text('credentials'),
  accountIdExternal:    varchar('account_id_external', { length: 255 }),
  lastSyncAt:           timestamp('last_sync_at', { withTimezone: true }),
  isActive:             boolean('is_active').notNull().default(true),
  createdAt:            timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const platformMetrics = pgTable('platform_metrics', {
  id:                   uuid('id').primaryKey().defaultRandom(),
  metricDate:           date('metric_date').notNull(),
  totalEntities:        integer('total_entities'),
  activeEntities1h:     integer('active_entities_1h'),
  activeEntities24h:    integer('active_entities_24h'),
  activeEntities7d:     integer('active_entities_7d'),
  activeEntities30d:    integer('active_entities_30d'),
  activeEntities1y:     integer('active_entities_1y'),
  totalUsers:           integer('total_users'),
  paidEntities:         integer('paid_entities'),
  freeEntities:         integer('free_entities'),
  totalTokensUsed:      bigint('total_tokens_used', { mode: 'number' }),
  totalCostUsd:         numeric('total_cost_usd', { precision: 12, scale: 4 }),
  newEntitiesToday:     integer('new_entities_today'),
  supportTicketsOpen:   integer('support_tickets_open'),
  supportTicketsResolvedToday: integer('support_tickets_resolved_today'),
  createdAt:            timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

// Chat sessions — links channels to CRM contacts
export const chatSessions = pgTable('chat_sessions', {
  id:           uuid('id').primaryKey().defaultRandom(),
  tenantId:     uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  channel:      channelEnum('channel').notNull(),
  externalId:   varchar('external_id', { length: 255 }), // WA phone, TG chat_id, etc.
  crmContactId: varchar('crm_contact_id', { length: 100 }),
  crmAccountId: varchar('crm_account_id', { length: 100 }),
  lastMessageAt: timestamp('last_message_at', { withTimezone: true }).notNull().defaultNow(),
  createdAt:    timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  tenantChannelIdx: index('sessions_tenant_channel_idx').on(t.tenantId, t.channel, t.externalId),
}))

// ═══════════════════════════════════════════════════════════════════════════════
// CRM MIRROR SCHEMA
// Exactly matches what n8n was writing — column names preserved intentionally
// ═══════════════════════════════════════════════════════════════════════════════

// CRM modules metadata (from Zoho /settings/modules)
export const crmModules = pgTable('crm_modules', {
  id:            uuid('id').primaryKey().defaultRandom(),
  tenantId:      uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  connectionId:  uuid('connection_id').notNull().references(() => crmConnections.id, { onDelete: 'cascade' }),
  apiName:       varchar('api_name', { length: 100 }).notNull(),
  moduleName:    varchar('module_name', { length: 100 }),
  singularLabel: varchar('singular_label', { length: 100 }),
  pluralLabel:   varchar('plural_label', { length: 100 }),
  generatedType: varchar('generated_type', { length: 50 }),
  apiSupported:  boolean('api_supported').default(true),
  creatable:     boolean('creatable').default(true),
  editable:      boolean('editable').default(true),
  deletable:     boolean('deletable').default(true),
  viewable:      boolean('viewable').default(true),
  isActive:      boolean('is_active').default(true),
  rawJson:       jsonb('raw_json'),
  lastSyncedAt:  timestamp('last_synced_at', { withTimezone: true }),
}, (t) => ({
  uniqueIdx: uniqueIndex('crm_modules_unique_idx').on(t.connectionId, t.apiName),
}))

// CRM fields metadata (from /settings/fields)
export const crmFields = pgTable('crm_fields', {
  id:               uuid('id').primaryKey().defaultRandom(),
  connectionId:     uuid('connection_id').notNull().references(() => crmConnections.id, { onDelete: 'cascade' }),
  moduleApiName:    varchar('module_api_name', { length: 100 }).notNull(),
  apiName:          varchar('api_name', { length: 100 }).notNull(),
  fieldLabel:       varchar('field_label', { length: 255 }),
  dataType:         varchar('data_type', { length: 50 }),
  fieldType:        varchar('field_type', { length: 50 }),
  isMandatory:      boolean('is_mandatory').default(false),
  isReadOnly:       boolean('is_read_only').default(false),
  isCustomField:    boolean('is_custom_field').default(false),
  maxLength:        integer('max_length'),
  pickListValues:   text('pick_list_values'),   // JSON string
  lookupDetails:    text('lookup_details'),      // JSON string
  rawJson:          text('raw_json'),
  lastSyncedAt:     timestamp('last_synced_at', { withTimezone: true }),
}, (t) => ({
  uniqueIdx: uniqueIndex('crm_fields_unique_idx').on(t.connectionId, t.moduleApiName, t.apiName),
  moduleIdx: index('crm_fields_module_idx').on(t.connectionId, t.moduleApiName),
}))

// CRM records — the actual data (JSONB, schema-agnostic)
export const crmRecords = pgTable('crm_records', {
  id:            uuid('id').primaryKey().defaultRandom(),
  connectionId:  uuid('connection_id').notNull().references(() => crmConnections.id, { onDelete: 'cascade' }),
  tenantId:      uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  moduleApiName: varchar('module_api_name', { length: 100 }).notNull(),
  crmId:         varchar('crm_id', { length: 100 }).notNull(),   // native CRM record ID
  crmIdField:    varchar('crm_id_field', { length: 100 }).notNull(),  // CRM's ID field name
  data:          jsonb('data').notNull(),                          // full record JSONB
  createdTime:   timestamp('created_time', { withTimezone: true }),
  modifiedTime:  timestamp('modified_time', { withTimezone: true }),
  lastSyncedAt:  timestamp('last_synced_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  uniqueIdx:  uniqueIndex('crm_records_unique_idx').on(t.connectionId, t.moduleApiName, t.crmId),
  moduleIdx:  index('crm_records_module_idx').on(t.connectionId, t.moduleApiName),
  tenantIdx:  index('crm_records_tenant_idx').on(t.tenantId),
  // GIN index for JSONB search — add via raw SQL migration
}))

// Bulk read jobs (async sync tracking)
export const crmBulkJobs = pgTable('crm_bulk_jobs', {
  id:            uuid('id').primaryKey().defaultRandom(),
  connectionId:  uuid('connection_id').notNull().references(() => crmConnections.id, { onDelete: 'cascade' }),
  jobId:         varchar('job_id', { length: 100 }).notNull(),  // CRM-side job ID
  moduleApiName: varchar('module_api_name', { length: 100 }).notNull(),
  status:        jobStatusEnum('status').notNull().default('pending'),
  recordsCount:  integer('records_count'),
  downloadUrl:   text('download_url'),
  errorMessage:  text('error_message'),
  createdAt:     timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  completedAt:   timestamp('completed_at', { withTimezone: true }),
}, (t) => ({
  jobIdx: uniqueIndex('crm_bulk_jobs_job_idx').on(t.connectionId, t.jobId),
}))

// Sync state (last successful full sync per module)
export const crmSyncState = pgTable('crm_sync_state', {
  id:            uuid('id').primaryKey().defaultRandom(),
  connectionId:  uuid('connection_id').notNull().references(() => crmConnections.id, { onDelete: 'cascade' }),
  moduleApiName: varchar('module_api_name', { length: 100 }).notNull(),
  lastFullSync:  timestamp('last_full_sync', { withTimezone: true }),
  totalRecords:  integer('total_records'),
  status:        syncStatusEnum('status').default('idle'),
}, (t) => ({
  uniqueIdx: uniqueIndex('crm_sync_state_unique_idx').on(t.connectionId, t.moduleApiName),
}))

// Sync log (audit trail)
export const crmSyncLog = pgTable('crm_sync_log', {
  id:            uuid('id').primaryKey().defaultRandom(),
  connectionId:  uuid('connection_id').references(() => crmConnections.id),
  syncType:      varchar('sync_type', { length: 50 }).notNull(),
  moduleApiName: varchar('module_api_name', { length: 100 }),
  status:        varchar('status', { length: 20 }).notNull(),
  recordsProcessed: integer('records_processed'),
  errorMessage:  text('error_message'),
  startedAt:     timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
  finishedAt:    timestamp('finished_at', { withTimezone: true }),
})

// Accounting connections
export const accountingConnections = pgTable('accounting_connections', {
  id:          uuid('id').primaryKey().defaultRandom(),
  tenantId:    uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  name:        varchar('name', { length: 255 }).notNull(),
  accountingType: accountingTypeEnum('accounting_type').notNull(),
  isActive:    boolean('is_active').notNull().default(true),
  credentials: text('credentials').notNull(), // AES-256-GCM encrypted JSON
  lastSyncAt:  timestamp('last_sync_at', { withTimezone: true }),
  createdAt:   timestamp('created_at',   { withTimezone: true }).notNull().defaultNow(),
  updatedAt:   timestamp('updated_at',   { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  tenantIdx: index('accounting_connections_tenant_idx').on(t.tenantId),
}))

// Accounting records — the actual data (JSONB, schema-agnostic)
export const accountingRecords = pgTable('accounting_records', {
  id:            uuid('id').primaryKey().defaultRandom(),
  connectionId:  uuid('connection_id').notNull().references(() => accountingConnections.id, { onDelete: 'cascade' }),
  tenantId:      uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  recordType:    accountingRecordTypeEnum('record_type').notNull(),
  accountingId:  varchar('accounting_id', { length: 100 }).notNull(),
  data:          jsonb('data').notNull(),
  lastSyncedAt:  timestamp('last_synced_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  uniqueIdx: uniqueIndex('accounting_records_unique_idx').on(t.connectionId, t.recordType, t.accountingId),
  tenantIdx: index('accounting_records_tenant_idx').on(t.tenantId),
}))

// Accounting sync state
export const accountingSyncState = pgTable('accounting_sync_state', {
  id:            uuid('id').primaryKey().defaultRandom(),
  connectionId:  uuid('connection_id').notNull().references(() => accountingConnections.id, { onDelete: 'cascade' }),
  recordType:    accountingRecordTypeEnum('record_type').notNull(),
  lastSync:      timestamp('last_sync', { withTimezone: true }),
  totalRecords:  integer('total_records'),
  status:        syncStatusEnum('status').default('idle'),
}, (t) => ({
  uniqueIdx: uniqueIndex('accounting_sync_state_unique_idx').on(t.connectionId, t.recordType),
}))

// Email configs
export const emailConfigs = pgTable('email_configs', {
  id:           uuid('id').primaryKey().defaultRandom(),
  tenantId:     uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  name:         varchar('name', { length: 255 }).notNull(),
  provider:     emailProviderEnum('provider').notNull(),
  credentials:  text('credentials').notNull(), // AES-256-GCM encrypted JSON
  fromName:     varchar('from_name', { length: 255 }),
  fromEmail:    varchar('from_email', { length: 255 }),
  isActive:     boolean('is_active').notNull().default(true),
  isDefault:    boolean('is_default').notNull().default(false),
  createdAt:    timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt:    timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  tenantIdx: index('email_configs_tenant_idx').on(t.tenantId),
}))

// Support tickets
export const supportTickets = pgTable('support_tickets', {
  id:           uuid('id').primaryKey().defaultRandom(),
  tenantId:     uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  sessionId:    uuid('session_id').references(() => chatSessions.id, { onDelete: 'set null' }),
  contactId:    varchar('contact_id', { length: 100 }),
  subject:      varchar('subject', { length: 500 }).notNull(),
  status:       ticketStatusEnum('status').notNull().default('open'),
  priority:     ticketPriorityEnum('priority').notNull().default('medium'),
  createdAt:    timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  resolvedAt:   timestamp('resolved_at', { withTimezone: true }),
}, (t) => ({
  tenantIdx: index('support_tickets_tenant_idx').on(t.tenantId),
}))

// Support messages
export const supportMessages = pgTable('support_messages', {
  id:           uuid('id').primaryKey().defaultRandom(),
  ticketId:     uuid('ticket_id').notNull().references(() => supportTickets.id, { onDelete: 'cascade' }),
  senderType:   senderTypeEnum('sender_type').notNull(),
  content:      text('content').notNull(),
  channel:      channelEnum('channel'),
  createdAt:    timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  ticketIdx: index('support_messages_ticket_idx').on(t.ticketId),
}))

// File storage
export const fileStorage = pgTable('file_storage', {
  id:            uuid('id').primaryKey().defaultRandom(),
  tenantId:      uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  contactId:     varchar('contact_id', { length: 100 }),
  accountId:     varchar('account_id', { length: 100 }),
  filename:      varchar('filename', { length: 255 }).notNull(),
  originalName:  varchar('original_name', { length: 255 }).notNull(),
  mimeType:      varchar('mime_type', { length: 100 }),
  sizeBytes:     bigint('size_bytes', { mode: 'number' }).notNull(),
  storageType:   storageTypeEnum('storage_type').notNull().default('local'),
  storagePath:   text('storage_path'),
  gdriveFileId:  varchar('gdrive_file_id', { length: 100 }),
  createdAt:     timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  tenantIdx: index('file_storage_tenant_idx').on(t.tenantId),
}))

// Related lists metadata
export const crmRelatedLists = pgTable('crm_related_lists', {
  id:            uuid('id').primaryKey().defaultRandom(),
  connectionId:  uuid('connection_id').notNull().references(() => crmConnections.id, { onDelete: 'cascade' }),
  moduleApiName: varchar('module_api_name', { length: 100 }).notNull(),
  apiName:       varchar('api_name', { length: 100 }).notNull(),
  displayLabel:  varchar('display_label', { length: 255 }),
  relatedModule: varchar('related_module', { length: 100 }),
  type:          varchar('type', { length: 50 }),
  rawJson:       jsonb('raw_json'),
  lastSyncedAt:  timestamp('last_synced_at', { withTimezone: true }),
}, (t) => ({
  uniqueIdx: uniqueIndex('crm_related_lists_unique_idx').on(t.connectionId, t.moduleApiName, t.apiName),
}))

// Platform-level vector documents (KIBI AI knowledge base)
export const platformVectorDocs = pgTable('platform_vector_docs', {
  id:          uuid('id').primaryKey().defaultRandom(),
  title:       varchar('title', { length: 500 }).notNull(),
  content:     text('content').notNull(),
  sourceType:  varchar('source_type', { length: 50 }).notNull().default('manual'),
  qdrantId:    varchar('qdrant_id', { length: 100 }),
  isIndexed:   boolean('is_indexed').notNull().default(false),
  vectorModel: varchar('vector_model', { length: 150 }),
  tags:        jsonb('tags').$type<string[]>().default([]),
  createdBy:   uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt:   timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt:   timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

// Knowledge base entries (auto-updated from conversations)
export const knowledgeEntries = pgTable('knowledge_entries', {
  id:         uuid('id').primaryKey().defaultRandom(),
  tenantId:   uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  title:      varchar('title', { length: 500 }).notNull(),
  content:    text('content').notNull(),
  source:     kbSourceEnum('source').notNull().default('manual'),
  sourceId:   varchar('source_id', { length: 100 }),
  qdrantId:   varchar('qdrant_id', { length: 100 }),
  isIndexed:  boolean('is_indexed').notNull().default(false),
  createdAt:  timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  tenantIdx: index('knowledge_entries_tenant_idx').on(t.tenantId),
}))

// YFZ 33: Entity KB + KIBI AI KB — document → chunks model, shared by both scopes.
// scope='entity' → entityId required (tenants.id); scope='kibi' → entityId null (platform-wide KB).
export const kbDocuments = pgTable('kb_documents', {
  id:                  uuid('id').primaryKey().defaultRandom(),
  scope:               varchar('scope', { length: 10 }).notNull(),  // 'entity' | 'kibi'
  entityId:            uuid('entity_id').references(() => tenants.id, { onDelete: 'cascade' }),
  category:            varchar('category', { length: 50 }).notNull(),
  title:               varchar('title', { length: 500 }).notNull(),
  originalFileName:    varchar('original_file_name', { length: 255 }),
  normalizedFileName:  varchar('normalized_file_name', { length: 255 }),
  fileStorageId:       uuid('file_storage_id').references(() => fileStorage.id, { onDelete: 'set null' }),
  sourceType:          varchar('source_type', { length: 20 }).notNull().default('manual'), // 'file' | 'manual'
  tags:                jsonb('tags').$type<string[]>().default([]), // audience: kibi_customer | ecosystem_customer | both
  status:              varchar('status', { length: 20 }).notNull().default('processing'), // processing|active|failed|archived
  uploadedBy:          uuid('uploaded_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt:           timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt:           timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  scopeEntityCategoryIdx: index('kb_documents_scope_entity_category_idx').on(t.scope, t.entityId, t.category),
}))

export const kbChunks = pgTable('kb_chunks', {
  id:             uuid('id').primaryKey().defaultRandom(),
  documentId:     uuid('document_id').notNull().references(() => kbDocuments.id, { onDelete: 'cascade' }),
  chunkIndex:     integer('chunk_index').notNull(),
  chunkHash:      varchar('chunk_hash', { length: 64 }).notNull(),
  chunkText:      text('chunk_text').notNull(),
  qdrantPointId:  uuid('qdrant_point_id').notNull(),
  active:         boolean('active').notNull().default(true),
  createdAt:      timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  documentIdx:     index('kb_chunks_document_idx').on(t.documentId),
  documentHashIdx: uniqueIndex('kb_chunks_document_hash_idx').on(t.documentId, t.chunkHash),
}))

// ─── Relations ────────────────────────────────────────────────────────────────
export const usersRelations = relations(users, ({ many }) => ({
  memberships: many(tenantMemberships),
}))

export const tenantsRelations = relations(tenants, ({ many }) => ({
  memberships:         many(tenantMemberships),
  crmConnections:      many(crmConnections),
  accountingConnections: many(accountingConnections),
  aiConfigs:           many(aiConfigs),
  emailConfigs:        many(emailConfigs),
  chatSessions:        many(chatSessions),
  crmModules:          many(crmModules),
  crmRecords:          many(crmRecords),
  accountingRecords:   many(accountingRecords),
  supportTickets:      many(supportTickets),
  fileStorage:         many(fileStorage),
  knowledgeEntries:    many(knowledgeEntries),
}))

export const crmConnectionsRelations = relations(crmConnections, ({ one, many }) => ({
  tenant:    one(tenants, { fields: [crmConnections.tenantId], references: [tenants.id] }),
  modules:   many(crmModules),
  fields:    many(crmFields),
  records:   many(crmRecords),
  bulkJobs:  many(crmBulkJobs),
  syncState: many(crmSyncState),
}))

export const accountingConnectionsRelations = relations(accountingConnections, ({ one, many }) => ({
  tenant:      one(tenants, { fields: [accountingConnections.tenantId], references: [tenants.id] }),
  records:     many(accountingRecords),
  syncState:   many(accountingSyncState),
}))

export const supportTicketsRelations = relations(supportTickets, ({ one, many }) => ({
  tenant:    one(tenants, { fields: [supportTickets.tenantId], references: [tenants.id] }),
  session:   one(chatSessions, { fields: [supportTickets.sessionId], references: [chatSessions.id] }),
  messages:  many(supportMessages),
}))

export const kibiEntitiesRelations = relations(kibiEntities, ({ one, many }) => ({
  tenant:            one(tenants,  { fields: [kibiEntities.entityId],   references: [tenants.id] }),
  mainUser:          one(users,    { fields: [kibiEntities.mainUserId],  references: [users.id] }),
  entityUsers:       many(kibiEntityUsers),
  subscriptions:     many(subscriptions),
  metrics:           many(entityMetrics),
  monthlyUsage:      many(entityMonthlyUsage),
  tokenTransactions: many(tokenTransactions),
  aiSessions:        many(aiSessions),
  notifications:     many(entityNotifications),
}))

export const plansRelations = relations(plans, ({ many }) => ({
  subscriptions: many(subscriptions),
}))

export const subscriptionsRelations = relations(subscriptions, ({ one, many }) => ({
  entity:   one(kibiEntities, { fields: [subscriptions.entityId], references: [kibiEntities.id] }),
  plan:     one(plans,        { fields: [subscriptions.planId],   references: [plans.id] }),
  invoices: many(billingInvoices),
}))

export const aiSessionsRelations = relations(aiSessions, ({ one, many }) => ({
  entity:   one(kibiEntities, { fields: [aiSessions.entityId], references: [kibiEntities.id] }),
  user:     one(users,        { fields: [aiSessions.userId],   references: [users.id] }),
  messages: many(aiMessages),
}))

export const aiMessagesRelations = relations(aiMessages, ({ one }) => ({
  session: one(aiSessions, { fields: [aiMessages.sessionId], references: [aiSessions.id] }),
}))

// ─── Setting types ────────────────────────────────────────────────────────────
export interface TenantSettings {
  timezone?:       string
  language?:       string
  webhookUrl?:     string
  allowedChannels?: string[]
  branding?:       { name?: string; logo?: string; color?: string }
  crmModuleFilter?: string[]  // which modules to sync
}

export interface AiSettings {
  temperature?:          number
  maxTokens?:            number
  systemPromptOverride?: string
  enabledTools?:         string[]
  deptRouting?:          Record<string, string>
}

export interface BillingLineItem {
  description: string
  quantity:    number
  unitPrice:   number
  total:       number
  type:        'subscription' | 'sub_user' | 'extra_tokens' | 'storage' | 'other'
}

export interface ToolCall {
  name:      string
  arguments: Record<string, unknown>
  result?:   unknown
}

// ─── Ki Wallet ────────────────────────────────────────────────────────────────
// One wallet per entity, linked by email + walletId (crypto-wallet standard)
export const kibiWallets = pgTable('kibi_wallets', {
  id:            uuid('id').primaryKey().defaultRandom(),
  entityId:      uuid('entity_id').notNull().references(() => kibiEntities.id, { onDelete: 'cascade' }),
  email:         varchar('email', { length: 255 }).notNull(),
  walletId:      varchar('wallet_id', { length: 100 }).notNull(),
  balanceKiCoin: numeric('balance_ki_coin', { precision: 20, scale: 8 }).notNull().default('0'),
  balanceUsd:    numeric('balance_usd', { precision: 15, scale: 2 }).notNull().default('0'),
  lastSyncAt:    timestamp('last_sync_at', { withTimezone: true }),
  createdAt:     timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt:     timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  entityIdx: uniqueIndex('kibi_wallets_entity_idx').on(t.entityId),
  emailIdx:  index('kibi_wallets_email_idx').on(t.email),
  walletIdx: uniqueIndex('kibi_wallets_wallet_id_idx').on(t.walletId),
}))

export const kibiWalletTransactions = pgTable('kibi_wallet_transactions', {
  id:            uuid('id').primaryKey().defaultRandom(),
  walletId:      uuid('wallet_id').notNull().references(() => kibiWallets.id, { onDelete: 'cascade' }),
  entityId:      uuid('entity_id').notNull().references(() => kibiEntities.id, { onDelete: 'cascade' }),
  type:          varchar('type', { length: 20 }).notNull(), // 'charge' | 'topup' | 'refund'
  amountKiCoin:  numeric('amount_ki_coin', { precision: 20, scale: 8 }).notNull(),
  amountUsd:     numeric('amount_usd', { precision: 15, scale: 2 }).notNull(),
  description:   varchar('description', { length: 500 }),
  balanceAfter:  numeric('balance_after', { precision: 20, scale: 8 }),
  metadata:      jsonb('metadata').$type<Record<string, unknown>>().default({}),
  createdAt:     timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  walletIdx: index('kibi_wallet_txns_wallet_idx').on(t.walletId),
  entityIdx: index('kibi_wallet_txns_entity_idx').on(t.entityId),
  timeIdx:   index('kibi_wallet_txns_time_idx').on(t.walletId, t.createdAt),
}))

// ─── Pricing Packages (new tiered structure) ──────────────────────────────────
export const kibiPricingPackages = pgTable('kibi_pricing_packages', {
  id:                    uuid('id').primaryKey().defaultRandom(),
  tier:                  integer('tier').notNull(),           // 1=minimal, 2=fluent, 3=top, 4=payg
  name:                  varchar('name', { length: 100 }).notNull(),
  displayName:           varchar('display_name', { length: 255 }).notNull(),
  description:           text('description'),
  // Token guarantees (input/output/context)
  guaranteedTokensInput:  bigint('guaranteed_tokens_input',  { mode: 'number' }).notNull().default(0),
  guaranteedTokensOutput: bigint('guaranteed_tokens_output', { mode: 'number' }).notNull().default(0),
  guaranteedTokensContext:bigint('guaranteed_tokens_context',{ mode: 'number' }).notNull().default(0),
  // User limits
  minUsers:              integer('min_users').notNull().default(1),
  maxUsers:              integer('max_users').notNull().default(5),    // supervisor + sub + external
  // Pricing — formula: (guaranteed_tokens * 1.30) + 100
  basePriceUsd:          numeric('base_price_usd', { precision: 10, scale: 2 }).notNull(),
  tokenMarkup:           numeric('token_markup', { precision: 5, scale: 2 }).notNull().default('1.30'),
  // Pay-as-you-go specific: token_price * 1.50 from Ki Wallet
  isPayAsYouGo:          boolean('is_pay_as_you_go').notNull().default(false),
  paygTokenMultiplier:   numeric('payg_token_multiplier', { precision: 5, scale: 2 }).notNull().default('1.50'),
  // Model tier allowed
  allowedModelTier:      varchar('allowed_model_tier', { length: 20 }).notNull().default('free'), // 'free' | 'mid' | 'top'
  // Ki Wallet payment
  acceptsKiWallet:       boolean('accepts_ki_wallet').notNull().default(true),
  isActive:              boolean('is_active').notNull().default(true),
  sortOrder:             integer('sort_order').notNull().default(0),

  // New 5-tier pricing fields
  planName:                varchar('plan_name', { length: 50 }),          // maps to plan_name enum value
  perMessagePriceUsd:      numeric('per_message_price_usd', { precision: 10, scale: 6 }).notNull().default('0'),
  overageMessagePriceUsd:  numeric('overage_message_price_usd', { precision: 10, scale: 6 }).notNull().default('0.03'),
  monthlyMessageLimit:     integer('monthly_message_limit'),              // null = unlimited (Custom Models)
  extraSubUserPriceUsd:    numeric('extra_sub_user_price_usd', { precision: 10, scale: 2 }).notNull().default('25'),
  maxDebtTokens:           bigint('max_debt_tokens', { mode: 'number' }).notNull().default(100000),

  createdAt:             timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt:             timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  tierIdx: uniqueIndex('kibi_pricing_packages_tier_idx').on(t.tier),
}))

// ─── Support Agents ───────────────────────────────────────────────────────────
export const kibiSupportAgents = pgTable('kibi_support_agents', {
  id:                  uuid('id').primaryKey().defaultRandom(),
  entityId:            uuid('entity_id').notNull().references(() => kibiEntities.id, { onDelete: 'cascade' }),
  userId:              uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  isActive:            boolean('is_active').notNull().default(true),
  channelPreference:   varchar('channel_preference', { length: 30 }).notNull().default('email'),
  waPhone:             varchar('wa_phone', { length: 30 }),
  telegramChatId:      varchar('telegram_chat_id', { length: 50 }),
  notificationEmail:   varchar('notification_email', { length: 255 }),
  weight:              integer('weight').notNull().default(1),
  assignedCount:       integer('assigned_count').notNull().default(0),
  createdAt:           timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt:           timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  entityUserIdx: uniqueIndex('kibi_support_agents_entity_user_idx').on(t.entityId, t.userId),
  entityActiveIdx: index('kibi_support_agents_entity_active_idx').on(t.entityId, t.isActive),
}))

export const kibiSupportAgentsRelations = relations(kibiSupportAgents, ({ one }) => ({
  entity: one(kibiEntities, { fields: [kibiSupportAgents.entityId], references: [kibiEntities.id] }),
  user:   one(users,         { fields: [kibiSupportAgents.userId],   references: [users.id] }),
}))

export const kibiWalletsRelations = relations(kibiWallets, ({ one, many }) => ({
  entity:       one(kibiEntities, { fields: [kibiWallets.entityId], references: [kibiEntities.id] }),
  transactions: many(kibiWalletTransactions),
}))

export const kibiWalletTransactionsRelations = relations(kibiWalletTransactions, ({ one }) => ({
  wallet: one(kibiWallets, { fields: [kibiWalletTransactions.walletId], references: [kibiWallets.id] }),
  entity: one(kibiEntities, { fields: [kibiWalletTransactions.entityId], references: [kibiEntities.id] }),
}))
