ALTER TYPE "kibi_model_role" ADD VALUE 'intent_analysis';--> statement-breakpoint
ALTER TYPE "kibi_model_role" ADD VALUE 'support_problem';--> statement-breakpoint
ALTER TYPE "kibi_model_role" ADD VALUE 'support_solution';--> statement-breakpoint
ALTER TYPE "kibi_model_role" ADD VALUE 'support_generator';--> statement-breakpoint
ALTER TYPE "kibi_model_role" ADD VALUE 'sales_intent';--> statement-breakpoint
ALTER TYPE "kibi_model_role" ADD VALUE 'sales_conversation';--> statement-breakpoint
ALTER TYPE "kibi_model_role" ADD VALUE 'consulting_intent';--> statement-breakpoint
ALTER TYPE "kibi_model_role" ADD VALUE 'consulting_recommendation';--> statement-breakpoint
ALTER TYPE "kibi_model_role" ADD VALUE 'master_conversation';--> statement-breakpoint
ALTER TYPE "kibi_model_role" ADD VALUE 'db_query';--> statement-breakpoint
ALTER TYPE "kibi_model_role" ADD VALUE 'kb_vector';--> statement-breakpoint
ALTER TYPE "kibi_model_role" ADD VALUE 'connector';--> statement-breakpoint
ALTER TYPE "kibi_model_role" ADD VALUE 'kb_signal_writer';--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ai_pipeline_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entity_id" uuid,
	"session_id" varchar(200),
	"pipeline_type" varchar(20) NOT NULL,
	"model_role" varchar(50) NOT NULL,
	"model_used" varchar(100),
	"input_tokens" integer,
	"output_tokens" integer,
	"latency_ms" integer,
	"success" boolean DEFAULT true NOT NULL,
	"error_message" text,
	"confidence_score" integer,
	"escalated" boolean DEFAULT false NOT NULL,
	"kb_written" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "entity_data_catalog" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entity_id" uuid NOT NULL,
	"connection_id" uuid NOT NULL,
	"source_name" varchar(100) NOT NULL,
	"source_type" varchar(50) NOT NULL,
	"table_name" varchar(200) NOT NULL,
	"display_name" varchar(200),
	"table_intent" varchar(100),
	"columns" jsonb,
	"relationships" jsonb,
	"query_templates" jsonb,
	"data_quality" jsonb,
	"raw_table_path" varchar(300),
	"is_queryable" boolean DEFAULT true NOT NULL,
	"is_writable" boolean DEFAULT false NOT NULL,
	"is_user_approved" boolean DEFAULT false NOT NULL,
	"catalog_version" integer DEFAULT 1 NOT NULL,
	"record_count" integer DEFAULT 0 NOT NULL,
	"last_analyzed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "kibi_pricing_packages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tier" integer NOT NULL,
	"name" varchar(100) NOT NULL,
	"display_name" varchar(255) NOT NULL,
	"description" text,
	"guaranteed_tokens_input" bigint DEFAULT 0 NOT NULL,
	"guaranteed_tokens_output" bigint DEFAULT 0 NOT NULL,
	"guaranteed_tokens_context" bigint DEFAULT 0 NOT NULL,
	"min_users" integer DEFAULT 1 NOT NULL,
	"max_users" integer DEFAULT 5 NOT NULL,
	"base_price_usd" numeric(10, 2) NOT NULL,
	"token_markup" numeric(5, 2) DEFAULT '1.30' NOT NULL,
	"is_pay_as_you_go" boolean DEFAULT false NOT NULL,
	"payg_token_multiplier" numeric(5, 2) DEFAULT '1.50' NOT NULL,
	"allowed_model_tier" varchar(20) DEFAULT 'free' NOT NULL,
	"accepts_ki_wallet" boolean DEFAULT true NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "kibi_support_agents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entity_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"channel_preference" varchar(30) DEFAULT 'email' NOT NULL,
	"wa_phone" varchar(30),
	"telegram_chat_id" varchar(50),
	"notification_email" varchar(255),
	"weight" integer DEFAULT 1 NOT NULL,
	"assigned_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "kibi_wallet_transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"wallet_id" uuid NOT NULL,
	"entity_id" uuid NOT NULL,
	"type" varchar(20) NOT NULL,
	"amount_ki_coin" numeric(20, 8) NOT NULL,
	"amount_usd" numeric(15, 2) NOT NULL,
	"description" varchar(500),
	"balance_after" numeric(20, 8),
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "kibi_wallets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entity_id" uuid NOT NULL,
	"email" varchar(255) NOT NULL,
	"wallet_id" varchar(100) NOT NULL,
	"balance_ki_coin" numeric(20, 8) DEFAULT '0' NOT NULL,
	"balance_usd" numeric(15, 2) DEFAULT '0' NOT NULL,
	"last_sync_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "platform_vector_docs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" varchar(500) NOT NULL,
	"content" text NOT NULL,
	"source_type" varchar(50) DEFAULT 'manual' NOT NULL,
	"qdrant_id" varchar(100),
	"is_indexed" boolean DEFAULT false NOT NULL,
	"vector_model" varchar(150),
	"tags" jsonb DEFAULT '[]'::jsonb,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "kibi_support_tickets" ADD COLUMN "external_contact_id" varchar(255);--> statement-breakpoint
ALTER TABLE "kibi_support_tickets" ADD COLUMN "assigned_agent_id" uuid;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "kibi_support_agents" ADD CONSTRAINT "kibi_support_agents_entity_id_kibi_entities_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."kibi_entities"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "kibi_support_agents" ADD CONSTRAINT "kibi_support_agents_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "kibi_wallet_transactions" ADD CONSTRAINT "kibi_wallet_transactions_wallet_id_kibi_wallets_id_fk" FOREIGN KEY ("wallet_id") REFERENCES "public"."kibi_wallets"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "kibi_wallet_transactions" ADD CONSTRAINT "kibi_wallet_transactions_entity_id_kibi_entities_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."kibi_entities"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "kibi_wallets" ADD CONSTRAINT "kibi_wallets_entity_id_kibi_entities_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."kibi_entities"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "platform_vector_docs" ADD CONSTRAINT "platform_vector_docs_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "kibi_pricing_packages_tier_idx" ON "kibi_pricing_packages" ("tier");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "kibi_support_agents_entity_user_idx" ON "kibi_support_agents" ("entity_id","user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "kibi_support_agents_entity_active_idx" ON "kibi_support_agents" ("entity_id","is_active");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "kibi_wallet_txns_wallet_idx" ON "kibi_wallet_transactions" ("wallet_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "kibi_wallet_txns_entity_idx" ON "kibi_wallet_transactions" ("entity_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "kibi_wallet_txns_time_idx" ON "kibi_wallet_transactions" ("wallet_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "kibi_wallets_entity_idx" ON "kibi_wallets" ("entity_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "kibi_wallets_email_idx" ON "kibi_wallets" ("email");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "kibi_wallets_wallet_id_idx" ON "kibi_wallets" ("wallet_id");--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "kibi_support_tickets" ADD CONSTRAINT "kibi_support_tickets_assigned_agent_id_users_id_fk" FOREIGN KEY ("assigned_agent_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
