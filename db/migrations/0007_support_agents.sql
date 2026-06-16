-- Support Agents table + ticket routing columns
-- Migration: 0007_support_agents

-- Support agents: entity users who handle external tickets with channel preferences
CREATE TABLE IF NOT EXISTS "kibi_support_agents" (
  "id"                  uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "entity_id"           uuid NOT NULL REFERENCES "kibi_entities"("id") ON DELETE CASCADE,
  "user_id"             uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "is_active"           boolean NOT NULL DEFAULT true,
  -- Agent's preferred channel for receiving notifications
  "channel_preference"  varchar(30) NOT NULL DEFAULT 'email',
  -- Channel-specific contact info for notifications
  "wa_phone"            varchar(30),         -- E.164 WhatsApp phone
  "telegram_chat_id"    varchar(50),         -- Telegram chat/user ID
  "notification_email"  varchar(255),
  -- Round-robin weighting (higher = receives more tickets proportionally)
  "weight"              integer NOT NULL DEFAULT 1,
  "assigned_count"      integer NOT NULL DEFAULT 0,
  "created_at"          timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"          timestamp with time zone NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "kibi_support_agents_entity_user_idx"
  ON "kibi_support_agents" ("entity_id", "user_id");
CREATE INDEX IF NOT EXISTS "kibi_support_agents_entity_active_idx"
  ON "kibi_support_agents" ("entity_id", "is_active");

-- Add external contact routing columns to kibi_support_tickets
ALTER TABLE "kibi_support_tickets"
  ADD COLUMN IF NOT EXISTS "external_contact_id" varchar(255),
  ADD COLUMN IF NOT EXISTS "assigned_agent_id"   uuid REFERENCES "users"("id") ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS "kibi_support_tickets_agent_idx"
  ON "kibi_support_tickets" ("assigned_agent_id");
CREATE INDEX IF NOT EXISTS "kibi_support_tickets_external_idx"
  ON "kibi_support_tickets" ("entity_id", "external_contact_id", "contact_channel");
