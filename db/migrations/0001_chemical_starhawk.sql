DO $$ BEGIN
 CREATE TYPE "public"."erp_type" AS ENUM('sap', 'oracle_netsuite', 'dynamics_bc', 'oracle_fusion', 'odoo_erp', 'erpnext', 'epicor', 'infor', 'sage_intacct', 'acumatica');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."kibi_model_role" AS ENUM('conversation', 'db_search', 'qdrant_search', 'redis_search', 'intent', 'support_intent', 'support_refine', 'support_resolver', 'support_answering');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."kibi_support_sender_type" AS ENUM('customer', 'kibi', 'agent', 'system');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."kibi_support_ticket_status" AS ENUM('open', 'kibi_processing', 'escalated', 'in_progress', 'resolved', 'closed');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
ALTER TYPE "accounting_type" ADD VALUE 'freshbooks';--> statement-breakpoint
ALTER TYPE "accounting_type" ADD VALUE 'sage_accounting';--> statement-breakpoint
ALTER TYPE "accounting_type" ADD VALUE 'dynamics_finance';--> statement-breakpoint
ALTER TYPE "accounting_type" ADD VALUE 'iyzico';--> statement-breakpoint
ALTER TYPE "accounting_type" ADD VALUE 'parasut';--> statement-breakpoint
ALTER TYPE "crm_type" ADD VALUE 'pipedrive';--> statement-breakpoint
ALTER TYPE "crm_type" ADD VALUE 'freshsales';--> statement-breakpoint
ALTER TYPE "crm_type" ADD VALUE 'monday';--> statement-breakpoint
ALTER TYPE "crm_type" ADD VALUE 'bitrix24';--> statement-breakpoint
ALTER TYPE "crm_type" ADD VALUE 'sugarcrm';--> statement-breakpoint
ALTER TYPE "crm_type" ADD VALUE 'dynamics_bc';--> statement-breakpoint
ALTER TYPE "crm_type" ADD VALUE 'oracle_fusion';--> statement-breakpoint
ALTER TYPE "crm_type" ADD VALUE 'odoo_erp';--> statement-breakpoint
ALTER TYPE "crm_type" ADD VALUE 'epicor';--> statement-breakpoint
ALTER TYPE "crm_type" ADD VALUE 'infor';--> statement-breakpoint
ALTER TYPE "crm_type" ADD VALUE 'sage_intacct';--> statement-breakpoint
ALTER TYPE "crm_type" ADD VALUE 'acumatica';--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "acc_chart_of_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"code" varchar(50),
	"name" varchar(255),
	"account_type" varchar(50),
	"account_subtype" varchar(100),
	"parent_id" uuid,
	"country_standard" varchar(10),
	"is_active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "acc_contacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"contact_type" varchar(20),
	"name" varchar(255),
	"tax_number" varchar(100),
	"tax_office" varchar(255),
	"email" varchar(255),
	"phone" varchar(50),
	"address" text,
	"country" varchar(10),
	"currency_code" varchar(10),
	"balance" numeric(15, 2) DEFAULT 0 NOT NULL,
	"crm_contact_id" varchar(100),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "acc_currencies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"code" varchar(10) NOT NULL,
	"name" varchar(100),
	"symbol" varchar(10),
	"is_default" boolean DEFAULT false NOT NULL,
	"exchange_rate" numeric(15, 6) DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "acc_expenses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"expense_date" date,
	"category" varchar(100),
	"description" varchar(500),
	"amount" numeric(15, 2),
	"currency_code" varchar(10),
	"contact_id" uuid,
	"account_code" varchar(50),
	"receipt_path" text,
	"status" varchar(20) DEFAULT 'pending' NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "acc_invoice_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"invoice_id" uuid NOT NULL,
	"description" varchar(500),
	"quantity" numeric(15, 4),
	"unit_price" numeric(15, 4),
	"discount_rate" numeric(5, 2) DEFAULT 0 NOT NULL,
	"tax_rate" numeric(5, 2) DEFAULT 0 NOT NULL,
	"account_code" varchar(50),
	"total" numeric(15, 2)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "acc_invoices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"invoice_number" varchar(100) NOT NULL,
	"invoice_type" varchar(20),
	"contact_id" uuid NOT NULL,
	"issue_date" date,
	"due_date" date,
	"currency_code" varchar(10),
	"subtotal" numeric(15, 2),
	"tax_total" numeric(15, 2),
	"discount_total" numeric(15, 2),
	"total" numeric(15, 2),
	"paid_amount" numeric(15, 2) DEFAULT 0 NOT NULL,
	"status" varchar(20),
	"notes" text,
	"file_path" text,
	"external_id" varchar(100),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "acc_payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"payment_number" varchar(100),
	"payment_type" varchar(20),
	"contact_id" uuid,
	"invoice_id" uuid,
	"payment_date" date,
	"amount" numeric(15, 2),
	"currency_code" varchar(10),
	"payment_method" varchar(50),
	"reference" varchar(255),
	"notes" text,
	"stripe_payment_intent_id" varchar(255),
	"status" varchar(20) DEFAULT 'completed' NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "bank_integrations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"bank_name" varchar(100),
	"provider" varchar(50),
	"country" varchar(10),
	"credentials" text,
	"account_id_external" varchar(255),
	"last_sync_at" timestamp with time zone,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "kibi_entities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entity_id" uuid NOT NULL,
	"client_id" varchar(20) NOT NULL,
	"company_name" varchar(255),
	"industry" varchar(100),
	"country" varchar(10),
	"employee_count" integer,
	"company_size" varchar(20),
	"sector" varchar(100),
	"website" varchar(255),
	"tax_number" varchar(100),
	"billing_address" text,
	"last_contact_at" timestamp with time zone,
	"last_contact_channel" varchar(50),
	"mood" varchar(50),
	"opportunity_score" varchar(20),
	"entity_db_url" text,
	"entity_redis_url" text,
	"entity_qdrant_url" text,
	"entity_qdrant_collection" varchar(100),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "kibi_entity_users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entity_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" varchar(50) NOT NULL,
	"permissions" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "kibi_internal_users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"internal_role" varchar(100) NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "kibi_model_configs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scope" varchar(20) NOT NULL,
	"scope_id" uuid,
	"model_role" "kibi_model_role" NOT NULL,
	"primary_model" varchar(150) NOT NULL,
	"fallback_1" varchar(150),
	"fallback_2" varchar(150),
	"fallback_3" varchar(150),
	"provider" varchar(50) DEFAULT 'openrouter' NOT NULL,
	"api_key" text,
	"system_prompt_override" text,
	"temperature" numeric(3, 2) DEFAULT 0.4 NOT NULL,
	"max_tokens" integer DEFAULT 1500 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"updated_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "kibi_support_knowledge" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"category_l1" varchar(100),
	"category_l2" varchar(100),
	"category_l3" varchar(100),
	"problem_summary" text,
	"solution_steps" jsonb,
	"source_ticket_ids" jsonb,
	"success_rate" numeric(5, 2),
	"use_count" integer DEFAULT 0 NOT NULL,
	"qdrant_id" varchar(100),
	"is_indexed" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "kibi_support_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ticket_id" uuid NOT NULL,
	"sender_type" "kibi_support_sender_type" NOT NULL,
	"sender_id" uuid,
	"content" text,
	"channel" varchar(30),
	"intent_tags" jsonb,
	"mood_score" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "kibi_support_tickets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ticket_number" varchar(20) NOT NULL,
	"entity_id" uuid NOT NULL,
	"user_id" uuid,
	"client_id" varchar(20) NOT NULL,
	"service_category" varchar(100),
	"subject" varchar(500),
	"status" "kibi_support_ticket_status" DEFAULT 'open' NOT NULL,
	"priority" "ticket_priority" DEFAULT 'medium' NOT NULL,
	"contact_channel" varchar(30),
	"intent" varchar(100),
	"mood" varchar(50),
	"urgency_score" integer,
	"answering_mood" varchar(50),
	"category_l1" varchar(100),
	"category_l2" varchar(100),
	"category_l3" varchar(100),
	"category_l4" varchar(100),
	"resolved_by" varchar(30),
	"resolution_summary" text,
	"solution_steps" jsonb,
	"kibi_attempted" boolean DEFAULT false NOT NULL,
	"escalated_to" uuid,
	"escalated_at" timestamp with time zone,
	"opened_at" timestamp with time zone DEFAULT now() NOT NULL,
	"closed_at" timestamp with time zone,
	"first_response_at" timestamp with time zone,
	"sla_deadline" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "kibi_token_usage" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entity_id" uuid,
	"user_id" uuid,
	"model_name" varchar(150),
	"provider" varchar(50),
	"prompt_tokens" integer,
	"completion_tokens" integer,
	"total_tokens" integer,
	"cost_usd" numeric(10, 6),
	"model_role" "kibi_model_role",
	"used_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "payment_integrations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"provider" varchar(50),
	"name" varchar(255),
	"credentials" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"webhook_secret" text,
	"settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "platform_metrics" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"metric_date" date NOT NULL,
	"total_entities" integer,
	"active_entities_1h" integer,
	"active_entities_24h" integer,
	"active_entities_7d" integer,
	"active_entities_30d" integer,
	"active_entities_1y" integer,
	"total_users" integer,
	"paid_entities" integer,
	"free_entities" integer,
	"total_tokens_used" bigint,
	"total_cost_usd" numeric(12, 4),
	"new_entities_today" integer,
	"support_tickets_open" integer,
	"support_tickets_resolved_today" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "role" "user_role" DEFAULT 'member' NOT NULL;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "acc_chart_of_accounts" ADD CONSTRAINT "acc_chart_of_accounts_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "acc_contacts" ADD CONSTRAINT "acc_contacts_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "acc_currencies" ADD CONSTRAINT "acc_currencies_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "acc_expenses" ADD CONSTRAINT "acc_expenses_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "acc_expenses" ADD CONSTRAINT "acc_expenses_contact_id_acc_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."acc_contacts"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "acc_invoice_lines" ADD CONSTRAINT "acc_invoice_lines_invoice_id_acc_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."acc_invoices"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "acc_invoices" ADD CONSTRAINT "acc_invoices_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "acc_invoices" ADD CONSTRAINT "acc_invoices_contact_id_acc_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."acc_contacts"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "acc_payments" ADD CONSTRAINT "acc_payments_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "acc_payments" ADD CONSTRAINT "acc_payments_contact_id_acc_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."acc_contacts"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "acc_payments" ADD CONSTRAINT "acc_payments_invoice_id_acc_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."acc_invoices"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "bank_integrations" ADD CONSTRAINT "bank_integrations_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "kibi_entities" ADD CONSTRAINT "kibi_entities_entity_id_tenants_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "kibi_entity_users" ADD CONSTRAINT "kibi_entity_users_entity_id_kibi_entities_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."kibi_entities"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "kibi_entity_users" ADD CONSTRAINT "kibi_entity_users_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "kibi_internal_users" ADD CONSTRAINT "kibi_internal_users_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "kibi_support_messages" ADD CONSTRAINT "kibi_support_messages_ticket_id_kibi_support_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."kibi_support_tickets"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "kibi_support_tickets" ADD CONSTRAINT "kibi_support_tickets_entity_id_kibi_entities_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."kibi_entities"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "kibi_support_tickets" ADD CONSTRAINT "kibi_support_tickets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "kibi_token_usage" ADD CONSTRAINT "kibi_token_usage_entity_id_kibi_entities_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."kibi_entities"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "kibi_token_usage" ADD CONSTRAINT "kibi_token_usage_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "payment_integrations" ADD CONSTRAINT "payment_integrations_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "acc_invoices_number_idx" ON "acc_invoices" ("invoice_number");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "kibi_entities_entity_idx" ON "kibi_entities" ("entity_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "kibi_entities_client_idx" ON "kibi_entities" ("client_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "kibi_support_tickets_number_idx" ON "kibi_support_tickets" ("ticket_number");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "kibi_support_tickets_entity_idx" ON "kibi_support_tickets" ("entity_id");