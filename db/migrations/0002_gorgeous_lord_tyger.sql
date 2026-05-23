DO $$ BEGIN
 CREATE TYPE "public"."ai_session_channel" AS ENUM('web', 'mobile', 'whatsapp', 'email', 'api');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."ai_session_type" AS ENUM('kibi_ai', 'entity_ai');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."billing_cycle" AS ENUM('monthly', 'yearly');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."notification_channel" AS ENUM('in_app', 'email', 'push', 'whatsapp');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."notification_type" AS ENUM('info', 'warning', 'error', 'success', 'invoice_due', 'payment_received', 'stock_low', 'ticket_update', 'ai_insight', 'usage_limit', 'subscription_expiry');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."plan_name" AS ENUM('free', 'starter', 'growth', 'enterprise');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."subscription_status" AS ENUM('trial', 'active', 'past_due', 'cancelled', 'expired');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ai_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"role" varchar(20) NOT NULL,
	"content" text NOT NULL,
	"prompt_tokens" integer,
	"completion_tokens" integer,
	"total_tokens" integer,
	"model_name" varchar(150),
	"tool_calls" jsonb,
	"feedback" varchar(20),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ai_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entity_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"type" "ai_session_type" NOT NULL,
	"channel" "ai_session_channel" DEFAULT 'web' NOT NULL,
	"title" varchar(500),
	"message_count" integer DEFAULT 0 NOT NULL,
	"total_tokens" integer DEFAULT 0 NOT NULL,
	"summary" text,
	"summarized_at" timestamp with time zone,
	"redis_key" varchar(255),
	"is_archived" boolean DEFAULT false NOT NULL,
	"last_message_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "billing_invoices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entity_id" uuid NOT NULL,
	"subscription_id" uuid,
	"invoice_number" varchar(50) NOT NULL,
	"status" varchar(30) DEFAULT 'pending' NOT NULL,
	"subtotal_usd" numeric(10, 2),
	"tax_usd" numeric(10, 2) DEFAULT '0' NOT NULL,
	"total_usd" numeric(10, 2),
	"items" jsonb DEFAULT '[]'::jsonb,
	"due_date" date,
	"paid_at" timestamp with time zone,
	"payment_method" varchar(50),
	"payment_reference" varchar(255),
	"pdf_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "entity_metrics" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entity_id" uuid NOT NULL,
	"total_tokens_used" bigint DEFAULT 0 NOT NULL,
	"free_tokens_used" bigint DEFAULT 0 NOT NULL,
	"paid_tokens_used" bigint DEFAULT 0 NOT NULL,
	"kibi_ai_tokens" bigint DEFAULT 0 NOT NULL,
	"entity_ai_tokens" bigint DEFAULT 0 NOT NULL,
	"admin_ai_tokens" bigint DEFAULT 0 NOT NULL,
	"current_month_tokens" bigint DEFAULT 0 NOT NULL,
	"current_month_start" date,
	"current_month_messages" integer DEFAULT 0 NOT NULL,
	"db_storage_mb" numeric(12, 3) DEFAULT '0' NOT NULL,
	"qdrant_storage_mb" numeric(12, 3) DEFAULT '0' NOT NULL,
	"redis_storage_mb" numeric(12, 3) DEFAULT '0' NOT NULL,
	"total_storage_mb" numeric(12, 3) DEFAULT '0' NOT NULL,
	"crm_contact_count" integer DEFAULT 0 NOT NULL,
	"crm_deal_count" integer DEFAULT 0 NOT NULL,
	"erp_product_count" integer DEFAULT 0 NOT NULL,
	"erp_order_count" integer DEFAULT 0 NOT NULL,
	"erp_staff_count" integer DEFAULT 0 NOT NULL,
	"acc_invoice_count" integer DEFAULT 0 NOT NULL,
	"messages_30d" integer DEFAULT 0 NOT NULL,
	"daily_avg_messages" numeric(8, 2) DEFAULT '0' NOT NULL,
	"peak_daily_messages" integer DEFAULT 0 NOT NULL,
	"web_messages_total" bigint DEFAULT 0 NOT NULL,
	"mobile_messages_total" bigint DEFAULT 0 NOT NULL,
	"whatsapp_messages_total" bigint DEFAULT 0 NOT NULL,
	"email_messages_total" bigint DEFAULT 0 NOT NULL,
	"total_support_tickets" integer DEFAULT 0 NOT NULL,
	"resolved_tickets" integer DEFAULT 0 NOT NULL,
	"pending_tickets" integer DEFAULT 0 NOT NULL,
	"dev_backlog_tickets" integer DEFAULT 0 NOT NULL,
	"avg_resolution_hours" numeric(8, 2),
	"active_sub_user_count" integer DEFAULT 0 NOT NULL,
	"last_activity_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "entity_monthly_usage" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entity_id" uuid NOT NULL,
	"month" date NOT NULL,
	"tokens_used" bigint DEFAULT 0 NOT NULL,
	"free_tokens" bigint DEFAULT 0 NOT NULL,
	"paid_tokens" bigint DEFAULT 0 NOT NULL,
	"total_messages" integer DEFAULT 0 NOT NULL,
	"kibi_ai_messages" integer DEFAULT 0 NOT NULL,
	"entity_ai_messages" integer DEFAULT 0 NOT NULL,
	"unique_active_users" integer DEFAULT 0 NOT NULL,
	"active_days" integer DEFAULT 0 NOT NULL,
	"db_storage_mb_snapshot" numeric(12, 3),
	"qdrant_vector_count" integer,
	"crm_records_added" integer DEFAULT 0 NOT NULL,
	"erp_orders_created" integer DEFAULT 0 NOT NULL,
	"acc_invoices_created" integer DEFAULT 0 NOT NULL,
	"tickets_created" integer DEFAULT 0 NOT NULL,
	"tickets_resolved" integer DEFAULT 0 NOT NULL,
	"billed_amount_usd" numeric(10, 2) DEFAULT '0' NOT NULL,
	"extra_token_charge_usd" numeric(10, 2) DEFAULT '0' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finalized_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "entity_notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entity_id" uuid NOT NULL,
	"user_id" uuid,
	"type" "notification_type" NOT NULL,
	"channel" "notification_channel" DEFAULT 'in_app' NOT NULL,
	"title" varchar(500) NOT NULL,
	"body" text,
	"data" jsonb DEFAULT '{}'::jsonb,
	"is_read" boolean DEFAULT false NOT NULL,
	"read_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" "plan_name" NOT NULL,
	"display_name" varchar(255) NOT NULL,
	"description" text,
	"max_sub_users" integer DEFAULT 0 NOT NULL,
	"max_crm_records" integer DEFAULT 1000 NOT NULL,
	"max_erp_products" integer DEFAULT 500 NOT NULL,
	"max_acc_invoices" integer DEFAULT 200 NOT NULL,
	"max_monthly_ai_messages" integer DEFAULT 100 NOT NULL,
	"max_storage_mb" integer DEFAULT 500 NOT NULL,
	"max_qdrant_vectors" integer DEFAULT 10000 NOT NULL,
	"free_tokens_monthly" bigint DEFAULT 100000 NOT NULL,
	"monthly_price_usd" numeric(10, 2),
	"yearly_price_usd" numeric(10, 2),
	"per_sub_user_price_usd" numeric(10, 2),
	"extra_token_price_per_1k" numeric(10, 6),
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entity_id" uuid NOT NULL,
	"plan_id" uuid NOT NULL,
	"status" "subscription_status" DEFAULT 'trial' NOT NULL,
	"billing_cycle" "billing_cycle" DEFAULT 'monthly' NOT NULL,
	"trial_ends_at" timestamp with time zone,
	"current_period_start" timestamp with time zone,
	"current_period_end" timestamp with time zone,
	"sub_user_count" integer DEFAULT 0 NOT NULL,
	"base_amount_usd" numeric(10, 2),
	"sub_user_amount_usd" numeric(10, 2) DEFAULT '0' NOT NULL,
	"extra_token_amount_usd" numeric(10, 2) DEFAULT '0' NOT NULL,
	"total_amount_usd" numeric(10, 2),
	"payment_method" varchar(50),
	"payment_reference" varchar(255),
	"cancelled_at" timestamp with time zone,
	"cancellation_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "token_transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entity_id" uuid NOT NULL,
	"user_id" uuid,
	"ai_type" "ai_session_type",
	"channel" "ai_session_channel" DEFAULT 'web',
	"prompt_tokens" integer DEFAULT 0 NOT NULL,
	"completion_tokens" integer DEFAULT 0 NOT NULL,
	"total_tokens" integer DEFAULT 0 NOT NULL,
	"is_free" boolean DEFAULT true NOT NULL,
	"model_name" varchar(150),
	"model_role" "kibi_model_role",
	"cost_usd" numeric(12, 8) DEFAULT '0' NOT NULL,
	"session_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "acc_contacts" ALTER COLUMN "balance" SET DEFAULT '0';--> statement-breakpoint
ALTER TABLE "acc_currencies" ALTER COLUMN "exchange_rate" SET DEFAULT '1';--> statement-breakpoint
ALTER TABLE "acc_invoice_lines" ALTER COLUMN "discount_rate" SET DEFAULT '0';--> statement-breakpoint
ALTER TABLE "acc_invoice_lines" ALTER COLUMN "tax_rate" SET DEFAULT '0';--> statement-breakpoint
ALTER TABLE "acc_invoices" ALTER COLUMN "paid_amount" SET DEFAULT '0';--> statement-breakpoint
ALTER TABLE "kibi_model_configs" ALTER COLUMN "temperature" SET DEFAULT '0.4';--> statement-breakpoint
ALTER TABLE "kibi_entities" ADD COLUMN "timezone" varchar(50) DEFAULT 'Europe/Istanbul';--> statement-breakpoint
ALTER TABLE "kibi_entities" ADD COLUMN "language" varchar(10) DEFAULT 'tr';--> statement-breakpoint
ALTER TABLE "kibi_entities" ADD COLUMN "logo_url" text;--> statement-breakpoint
ALTER TABLE "kibi_entities" ADD COLUMN "tax_office" varchar(255);--> statement-breakpoint
ALTER TABLE "kibi_entities" ADD COLUMN "address_line1" varchar(500);--> statement-breakpoint
ALTER TABLE "kibi_entities" ADD COLUMN "address_line2" varchar(500);--> statement-breakpoint
ALTER TABLE "kibi_entities" ADD COLUMN "city" varchar(100);--> statement-breakpoint
ALTER TABLE "kibi_entities" ADD COLUMN "state" varchar(100);--> statement-breakpoint
ALTER TABLE "kibi_entities" ADD COLUMN "postal_code" varchar(20);--> statement-breakpoint
ALTER TABLE "kibi_entities" ADD COLUMN "main_user_id" uuid;--> statement-breakpoint
ALTER TABLE "kibi_entities" ADD COLUMN "plan_name" "plan_name" DEFAULT 'free';--> statement-breakpoint
ALTER TABLE "kibi_entities" ADD COLUMN "trial_ends_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "kibi_entities" ADD COLUMN "entity_db_schema" varchar(100);--> statement-breakpoint
ALTER TABLE "kibi_entities" ADD COLUMN "entity_redis_prefix" varchar(100);--> statement-breakpoint
ALTER TABLE "kibi_entities" ADD COLUMN "is_provisioned" boolean DEFAULT false NOT NULL;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ai_messages" ADD CONSTRAINT "ai_messages_session_id_ai_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."ai_sessions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ai_sessions" ADD CONSTRAINT "ai_sessions_entity_id_kibi_entities_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."kibi_entities"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ai_sessions" ADD CONSTRAINT "ai_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "billing_invoices" ADD CONSTRAINT "billing_invoices_entity_id_kibi_entities_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."kibi_entities"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "billing_invoices" ADD CONSTRAINT "billing_invoices_subscription_id_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscriptions"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "entity_metrics" ADD CONSTRAINT "entity_metrics_entity_id_kibi_entities_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."kibi_entities"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "entity_monthly_usage" ADD CONSTRAINT "entity_monthly_usage_entity_id_kibi_entities_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."kibi_entities"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "entity_notifications" ADD CONSTRAINT "entity_notifications_entity_id_kibi_entities_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."kibi_entities"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "entity_notifications" ADD CONSTRAINT "entity_notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_entity_id_kibi_entities_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."kibi_entities"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "token_transactions" ADD CONSTRAINT "token_transactions_entity_id_kibi_entities_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."kibi_entities"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "token_transactions" ADD CONSTRAINT "token_transactions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ai_messages_session_idx" ON "ai_messages" ("session_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ai_sessions_entity_user_idx" ON "ai_sessions" ("entity_id","user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ai_sessions_type_idx" ON "ai_sessions" ("type","is_archived");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "billing_invoices_number_idx" ON "billing_invoices" ("invoice_number");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "billing_invoices_entity_idx" ON "billing_invoices" ("entity_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "entity_metrics_entity_idx" ON "entity_metrics" ("entity_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "entity_monthly_usage_unique_idx" ON "entity_monthly_usage" ("entity_id","month");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "entity_monthly_usage_entity_idx" ON "entity_monthly_usage" ("entity_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "entity_notifications_entity_user_idx" ON "entity_notifications" ("entity_id","user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "entity_notifications_unread_idx" ON "entity_notifications" ("entity_id","is_read");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "plans_name_idx" ON "plans" ("name");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "subscriptions_entity_idx" ON "subscriptions" ("entity_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "token_transactions_entity_idx" ON "token_transactions" ("entity_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "token_transactions_time_idx" ON "token_transactions" ("entity_id","created_at");--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "kibi_entities" ADD CONSTRAINT "kibi_entities_main_user_id_users_id_fk" FOREIGN KEY ("main_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "kibi_entities_schema_idx" ON "kibi_entities" ("entity_db_schema");