-- Migration 0005: platform_vector_docs table
-- Stores KIBI AI platform-level knowledge documents for vector search

CREATE TABLE IF NOT EXISTS "platform_vector_docs" (
  "id"           uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "title"        varchar(500) NOT NULL,
  "content"      text NOT NULL,
  "source_type"  varchar(50) NOT NULL DEFAULT 'manual',
  "qdrant_id"    varchar(100),
  "is_indexed"   boolean NOT NULL DEFAULT false,
  "vector_model" varchar(150),
  "tags"         jsonb DEFAULT '[]'::jsonb,
  "created_by"   uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at"   timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"   timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "platform_vector_docs_indexed_idx" ON "platform_vector_docs" ("is_indexed");
