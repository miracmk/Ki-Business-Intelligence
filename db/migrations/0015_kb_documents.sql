-- 0015_kb_documents.sql
-- YFZ 33: Entity KB + KIBI AI KB — file upload, chunking, hash-based incremental indexing.
-- Replaces flat single-chunk knowledgeEntries/platformVectorDocs ingestion with a
-- document → chunks model shared by both scopes (scope discriminator avoids duplicate tables).

CREATE TABLE IF NOT EXISTS kb_documents (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scope                 VARCHAR(10)  NOT NULL,                 -- 'entity' | 'kibi'
  entity_id             UUID REFERENCES tenants(id) ON DELETE CASCADE,  -- null for scope='kibi'
  category              VARCHAR(50)  NOT NULL,
  title                 VARCHAR(500) NOT NULL,
  original_file_name    VARCHAR(255),
  normalized_file_name  VARCHAR(255),
  file_storage_id       UUID REFERENCES file_storage(id) ON DELETE SET NULL,
  source_type           VARCHAR(20)  NOT NULL DEFAULT 'manual', -- 'file' | 'manual'
  tags                  JSONB        NOT NULL DEFAULT '[]',     -- audience tags: kibi_customer / ecosystem_customer / both
  status                VARCHAR(20)  NOT NULL DEFAULT 'processing', -- processing | active | failed | archived
  uploaded_by           UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at            TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at            TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT kb_documents_scope_check CHECK (
    (scope = 'entity' AND entity_id IS NOT NULL) OR
    (scope = 'kibi'   AND entity_id IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS kb_documents_scope_entity_category_idx
  ON kb_documents (scope, entity_id, category);

CREATE TABLE IF NOT EXISTS kb_chunks (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id      UUID NOT NULL REFERENCES kb_documents(id) ON DELETE CASCADE,
  chunk_index      INTEGER NOT NULL,
  chunk_hash       VARCHAR(64) NOT NULL,   -- sha256 hex of normalized chunk text
  chunk_text       TEXT NOT NULL,
  qdrant_point_id  UUID NOT NULL,          -- uuid5(document_id + ':' + chunk_hash)
  active           BOOLEAN NOT NULL DEFAULT TRUE,
  created_at       TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS kb_chunks_document_idx ON kb_chunks (document_id);
CREATE UNIQUE INDEX IF NOT EXISTS kb_chunks_document_hash_idx ON kb_chunks (document_id, chunk_hash);
