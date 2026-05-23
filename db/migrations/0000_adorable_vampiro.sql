DO $$ BEGIN
 CREATE TYPE "public"."accounting_record_type" AS ENUM('invoice', 'payment', 'customer', 'vendor', 'account', 'transaction');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."accounting_type" AS ENUM('quickbooks', 'xero', 'zoho_books', 'wave');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."ai_provider" AS ENUM('openrouter', 'openai', 'anthropic', 'google', 'mistral', 'groq');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."channel" AS ENUM('web', 'whatsapp', 'telegram', 'instagram', 'email');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."crm_type" AS ENUM('zoho', 'salesforce', 'hubspot', 'sap', 'oracle_netsuite', 'dynamics365', 'odoo', 'erpnext', 'custom');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."email_provider" AS ENUM('smtp', 'gmail', 'outlook', 'yahoo', 'zohomail');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."job_status" AS ENUM('pending', 'downloading', 'done', 'failed');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."kb_source" AS ENUM('manual', 'conversation', 'crm', 'accounting');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."sender_type" AS ENUM('customer', 'agent', 'ai');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."storage_type" AS ENUM('local', 'gdrive');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."sync_status" AS ENUM('idle', 'running', 'done', 'error');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."ticket_priority" AS ENUM('low', 'medium', 'high', 'urgent');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."ticket_status" AS ENUM('open', 'in_progress', 'resolved', 'closed');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."user_role" AS ENUM('superadmin', 'admin', 'member', 'viewer');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "accounting_connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"accounting_type" "accounting_type" NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"credentials" text NOT NULL,
	"last_sync_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "accounting_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"connection_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"record_type" "accounting_record_type" NOT NULL,
	"accounting_id" varchar(100) NOT NULL,
	"data" jsonb NOT NULL,
	"last_synced_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "accounting_sync_state" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"connection_id" uuid NOT NULL,
	"record_type" "accounting_record_type" NOT NULL,
	"last_sync" timestamp with time zone,
	"total_records" integer,
	"status" "sync_status" DEFAULT 'idle'
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ai_configs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"provider" "ai_provider" DEFAULT 'openrouter' NOT NULL,
	"model" varchar(100) DEFAULT 'google/gemini-2.0-flash-exp:free' NOT NULL,
	"api_key" text,
	"is_default" boolean DEFAULT true NOT NULL,
	"settings" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "chat_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"channel" "channel" NOT NULL,
	"external_id" varchar(255),
	"crm_contact_id" varchar(100),
	"crm_account_id" varchar(100),
	"last_message_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "crm_bulk_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"connection_id" uuid NOT NULL,
	"job_id" varchar(100) NOT NULL,
	"module_api_name" varchar(100) NOT NULL,
	"status" "job_status" DEFAULT 'pending' NOT NULL,
	"records_count" integer,
	"download_url" text,
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "crm_connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"crm_type" "crm_type" NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"credentials" text NOT NULL,
	"last_sync_at" timestamp with time zone,
	"sync_status" "sync_status" DEFAULT 'idle',
	"sync_error" text,
	"notif_channel_id" varchar(100),
	"notif_channel_expiry" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "crm_fields" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"connection_id" uuid NOT NULL,
	"module_api_name" varchar(100) NOT NULL,
	"api_name" varchar(100) NOT NULL,
	"field_label" varchar(255),
	"data_type" varchar(50),
	"field_type" varchar(50),
	"is_mandatory" boolean DEFAULT false,
	"is_read_only" boolean DEFAULT false,
	"is_custom_field" boolean DEFAULT false,
	"max_length" integer,
	"pick_list_values" text,
	"lookup_details" text,
	"raw_json" text,
	"last_synced_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "crm_modules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"connection_id" uuid NOT NULL,
	"api_name" varchar(100) NOT NULL,
	"module_name" varchar(100),
	"singular_label" varchar(100),
	"plural_label" varchar(100),
	"generated_type" varchar(50),
	"api_supported" boolean DEFAULT true,
	"creatable" boolean DEFAULT true,
	"editable" boolean DEFAULT true,
	"deletable" boolean DEFAULT true,
	"viewable" boolean DEFAULT true,
	"is_active" boolean DEFAULT true,
	"raw_json" jsonb,
	"last_synced_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "crm_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"connection_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"module_api_name" varchar(100) NOT NULL,
	"crm_id" varchar(100) NOT NULL,
	"crm_id_field" varchar(100) NOT NULL,
	"data" jsonb NOT NULL,
	"created_time" timestamp with time zone,
	"modified_time" timestamp with time zone,
	"last_synced_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "crm_related_lists" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"connection_id" uuid NOT NULL,
	"module_api_name" varchar(100) NOT NULL,
	"api_name" varchar(100) NOT NULL,
	"display_label" varchar(255),
	"related_module" varchar(100),
	"type" varchar(50),
	"raw_json" jsonb,
	"last_synced_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "crm_sync_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"connection_id" uuid,
	"sync_type" varchar(50) NOT NULL,
	"module_api_name" varchar(100),
	"status" varchar(20) NOT NULL,
	"records_processed" integer,
	"error_message" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "crm_sync_state" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"connection_id" uuid NOT NULL,
	"module_api_name" varchar(100) NOT NULL,
	"last_full_sync" timestamp with time zone,
	"total_records" integer,
	"status" "sync_status" DEFAULT 'idle'
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "email_configs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"provider" "email_provider" NOT NULL,
	"credentials" text NOT NULL,
	"from_name" varchar(255),
	"from_email" varchar(255),
	"is_active" boolean DEFAULT true NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "file_storage" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"contact_id" varchar(100),
	"account_id" varchar(100),
	"filename" varchar(255) NOT NULL,
	"original_name" varchar(255) NOT NULL,
	"mime_type" varchar(100),
	"size_bytes" bigint NOT NULL,
	"storage_type" "storage_type" DEFAULT 'local' NOT NULL,
	"storage_path" text,
	"gdrive_file_id" varchar(100),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "knowledge_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"title" varchar(500) NOT NULL,
	"content" text NOT NULL,
	"source" "kb_source" DEFAULT 'manual' NOT NULL,
	"source_id" varchar(100),
	"qdrant_id" varchar(100),
	"is_indexed" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "support_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ticket_id" uuid NOT NULL,
	"sender_type" "sender_type" NOT NULL,
	"content" text NOT NULL,
	"channel" "channel",
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "support_tickets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"session_id" uuid,
	"contact_id" varchar(100),
	"subject" varchar(500) NOT NULL,
	"status" "ticket_status" DEFAULT 'open' NOT NULL,
	"priority" "ticket_priority" DEFAULT 'medium' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tenant_memberships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"role" "user_role" DEFAULT 'member' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tenants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(255) NOT NULL,
	"slug" varchar(100) NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"settings" jsonb DEFAULT '{}'::jsonb,
	"storage_used_bytes" bigint DEFAULT 0 NOT NULL,
	"storage_limit_bytes" bigint DEFAULT 1073741824 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" varchar(255) NOT NULL,
	"name" varchar(255),
	"password_hash" text NOT NULL,
	"phone" varchar(30),
	"totp_secret" text,
	"backup_codes" jsonb,
	"is_active" boolean DEFAULT true NOT NULL,
	"is_verified" boolean DEFAULT false NOT NULL,
	"last_login_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "accounting_connections" ADD CONSTRAINT "accounting_connections_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "accounting_records" ADD CONSTRAINT "accounting_records_connection_id_accounting_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."accounting_connections"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "accounting_records" ADD CONSTRAINT "accounting_records_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "accounting_sync_state" ADD CONSTRAINT "accounting_sync_state_connection_id_accounting_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."accounting_connections"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ai_configs" ADD CONSTRAINT "ai_configs_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "chat_sessions" ADD CONSTRAINT "chat_sessions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "crm_bulk_jobs" ADD CONSTRAINT "crm_bulk_jobs_connection_id_crm_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."crm_connections"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "crm_connections" ADD CONSTRAINT "crm_connections_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "crm_fields" ADD CONSTRAINT "crm_fields_connection_id_crm_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."crm_connections"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "crm_modules" ADD CONSTRAINT "crm_modules_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "crm_modules" ADD CONSTRAINT "crm_modules_connection_id_crm_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."crm_connections"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "crm_records" ADD CONSTRAINT "crm_records_connection_id_crm_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."crm_connections"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "crm_records" ADD CONSTRAINT "crm_records_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "crm_related_lists" ADD CONSTRAINT "crm_related_lists_connection_id_crm_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."crm_connections"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "crm_sync_log" ADD CONSTRAINT "crm_sync_log_connection_id_crm_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."crm_connections"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "crm_sync_state" ADD CONSTRAINT "crm_sync_state_connection_id_crm_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."crm_connections"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "email_configs" ADD CONSTRAINT "email_configs_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "file_storage" ADD CONSTRAINT "file_storage_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "knowledge_entries" ADD CONSTRAINT "knowledge_entries_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "support_messages" ADD CONSTRAINT "support_messages_ticket_id_support_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."support_tickets"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_session_id_chat_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."chat_sessions"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "tenant_memberships" ADD CONSTRAINT "tenant_memberships_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "tenant_memberships" ADD CONSTRAINT "tenant_memberships_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "accounting_connections_tenant_idx" ON "accounting_connections" ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "accounting_records_unique_idx" ON "accounting_records" ("connection_id","record_type","accounting_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "accounting_records_tenant_idx" ON "accounting_records" ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "accounting_sync_state_unique_idx" ON "accounting_sync_state" ("connection_id","record_type");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sessions_tenant_channel_idx" ON "chat_sessions" ("tenant_id","channel","external_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "crm_bulk_jobs_job_idx" ON "crm_bulk_jobs" ("connection_id","job_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "crm_connections_tenant_idx" ON "crm_connections" ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "crm_fields_unique_idx" ON "crm_fields" ("connection_id","module_api_name","api_name");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "crm_fields_module_idx" ON "crm_fields" ("connection_id","module_api_name");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "crm_modules_unique_idx" ON "crm_modules" ("connection_id","api_name");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "crm_records_unique_idx" ON "crm_records" ("connection_id","module_api_name","crm_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "crm_records_module_idx" ON "crm_records" ("connection_id","module_api_name");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "crm_records_tenant_idx" ON "crm_records" ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "crm_related_lists_unique_idx" ON "crm_related_lists" ("connection_id","module_api_name","api_name");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "crm_sync_state_unique_idx" ON "crm_sync_state" ("connection_id","module_api_name");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "email_configs_tenant_idx" ON "email_configs" ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "file_storage_tenant_idx" ON "file_storage" ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "knowledge_entries_tenant_idx" ON "knowledge_entries" ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "support_messages_ticket_idx" ON "support_messages" ("ticket_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "support_tickets_tenant_idx" ON "support_tickets" ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "memberships_user_tenant_idx" ON "tenant_memberships" ("user_id","tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "tenants_slug_idx" ON "tenants" ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "users_email_idx" ON "users" ("email");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "users_phone_idx" ON "users" ("phone");